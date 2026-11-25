import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  endAt,
  getDoc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  startAt,
  Timestamp,
  Unsubscribe,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { auth, db } from './config';
import { ensureVerifiedTokenClaims, getUserProfile, resolveUidByUsername } from '../auth/authService';
import { handleFirestoreError, logFirestoreListenerError, OperationType } from './errorHandler';
import {
  dispatchDualNotification,
  inferCategoryFromNotificationType,
  inferTargetTypeFromNotificationType,
  shouldAllowDedupeKey,
} from '../notifications/notificationDispatcher';
import {
  AudienceType,
  ChatMessage,
  CollaboratorProfileSummary,
  Conversation,
  GiftTransaction,
  HomepageCustomization,
  MessageType,
  NotificationItem,
  NotificationTargetType,
  NotificationType,
  Post,
  PostComment,
  PostType,
  Space,
  SpaceDiscussion,
  SpaceEvent,
  SpaceMember,
  Story,
  StoryPrivacy,
  StoryType,
  StoryView,
  ThemeMode,
  UserPreferences,
  UserProfile,
  Vibe,
  VirtualGiftCatalogItem,
} from '../../types/nexora';
import {
  BLUEPRINT_LIMITS,
  extractHashtags,
  extractMentions,
  normalizeThemeMode,
  normalizeUsername,
  sanitizeString,
  withHomepageCustomizationDefaults,
} from '../../utils/validation';

// --- Notifications Helper ---
export async function createNotification(params: {
  recipientId: string;
  actor: UserProfile;
  type: NotificationType;
  targetId?: string;
  targetType?: NotificationTargetType;
  title?: string;
  preview?: string;
  dedupeKey?: string;
  allowSelf?: boolean;
}): Promise<void> {
  if (!params.allowSelf && params.recipientId === params.actor.uid) return;
  if (!shouldAllowDedupeKey(params.dedupeKey)) return;
  try {
    await addDoc(collection(db, 'notifications'), {
      recipientId: params.recipientId,
      actorId: params.actor.uid,
      actorName: sanitizeString(params.actor.displayName, 80),
      actorAvatar: sanitizeString(params.actor.avatarUrl || '', 200000),
      type: params.type,
      category: inferCategoryFromNotificationType(params.type),
      ...(params.title ? { title: sanitizeString(params.title, 120) } : {}),
      targetType: params.targetType || inferTargetTypeFromNotificationType(params.type),
      targetId: sanitizeString(params.targetId || '', 128),
      ...(params.dedupeKey ? { dedupeKey: sanitizeString(params.dedupeKey, 128) } : {}),
      preview: sanitizeString(params.preview || '', 200),
      read: false,
      createdAt: serverTimestamp(),
    });
  } catch {
    // Notifications should never block primary user action
  }
}

export function subscribeNotifications(
  uid: string,
  callback: (items: NotificationItem[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'notifications'),
    where('recipientId', '==', uid),
    orderBy('createdAt', 'desc'),
    limit(80)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<NotificationItem, 'id'>) }))
        .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
      callback(items);
    },
    (error) => logFirestoreListenerError(error, OperationType.LIST, 'notifications')
  );
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'notifications', notificationId), { read: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `notifications/${notificationId}`);
  }
}

export async function markAllNotificationsRead(notifications: NotificationItem[]): Promise<void> {
  const unread = notifications.filter((n) => !n.read);
  if (unread.length === 0) return;
  try {
    for (let i = 0; i < unread.length; i += 25) {
      const batch = writeBatch(db);
      unread.slice(i, i + 25).forEach((item) => {
        batch.update(doc(db, 'notifications', item.id), { read: true });
      });
      await batch.commit();
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, 'notifications');
  }
}

export async function deleteNotification(notificationId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'notifications', notificationId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `notifications/${notificationId}`);
  }
}

export async function clearNotificationsBatch(notifications: NotificationItem[]): Promise<void> {
  if (notifications.length === 0) return;
  try {
    for (let i = 0; i < notifications.length; i += 25) {
      const batch = writeBatch(db);
      notifications.slice(i, i + 25).forEach((item) => {
        batch.delete(doc(db, 'notifications', item.id));
      });
      await batch.commit();
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, 'notifications');
  }
}

// --- Users & Directory ---
export function subscribeDirectoryUsers(callback: (users: UserProfile[]) => void): Unsubscribe {
  const q = query(
    collection(db, 'users'),
    where('onboardingCompleted', '==', true),
    orderBy('createdAt', 'desc'),
    limit(120)
  );
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => d.data() as UserProfile)),
    (error) => logFirestoreListenerError(error, OperationType.LIST, 'users')
  );
}

export async function getUserByUsername(rawUsername: string): Promise<UserProfile | null> {
  const uid = await resolveUidByUsername(rawUsername);
  if (!uid) return null;
  try {
    return await getUserProfile(uid);
  } catch {
    return null;
  }
}

export async function searchDirectoryUsers(
  rawTerm: string,
  maxResults = 20
): Promise<UserProfile[]> {
  const prefix = normalizeUsername(rawTerm);
  if (!prefix) return [];

  const q = query(
    collection(db, 'users'),
    where('onboardingCompleted', '==', true),
    orderBy('username'),
    startAt(prefix),
    endAt(`${prefix}\uf8ff`),
    limit(maxResults)
  );

  const [prefixSnap, exactMatch] = await Promise.all([
    getDocs(q).catch(() => null),
    prefix.length >= 3 ? getUserByUsername(prefix) : Promise.resolve(null),
  ]);

  const merged = new Map<string, UserProfile>();
  if (exactMatch && !exactMatch.suspended) {
    merged.set(exactMatch.uid, exactMatch);
  }
  prefixSnap?.docs.forEach((d) => {
    const u = d.data() as UserProfile;
    if (!u.suspended && !merged.has(u.uid)) {
      merged.set(u.uid, u);
    }
  });
  return Array.from(merged.values()).slice(0, maxResults);
}

export function subscribeUserProfile(
  uid: string,
  callback: (profile: UserProfile | null) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, 'users', uid),
    (snap) => {
      callback(snap.exists() ? (snap.data() as UserProfile) : null);
    },
    (error) => logFirestoreListenerError(error, OperationType.GET, `users/${uid}`)
  );
}

export function subscribeFollowingIds(
  uid: string,
  callback: (followingIds: Set<string>) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, 'users', uid, 'following'),
    (snap) => {
      callback(new Set(snap.docs.map((d) => d.id)));
    },
    (error) => logFirestoreListenerError(error, OperationType.LIST, `users/${uid}/following`)
  );
}

export function subscribeIsFollowing(
  currentUid: string,
  targetUid: string,
  callback: (following: boolean) => void
): Unsubscribe {
  if (!currentUid || !targetUid || currentUid === targetUid) {
    callback(false);
    return () => {};
  }
  return onSnapshot(
    doc(db, 'users', currentUid, 'following', targetUid),
    (snap) => {
      callback(snap.exists());
    },
    (error) => logFirestoreListenerError(error, OperationType.GET, `users/${currentUid}/following/${targetUid}`)
  );
}

export async function checkIsFollowing(currentUid: string, targetUid: string): Promise<boolean> {
  if (!currentUid || !targetUid || currentUid === targetUid) return false;
  try {
    const snap = await getDoc(doc(db, 'users', currentUid, 'following', targetUid));
    return snap.exists();
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `users/${currentUid}/following/${targetUid}`);
  }
}

export async function setFollowRelationship(
  currentUser: UserProfile,
  targetUser: UserProfile,
  shouldFollow: boolean
): Promise<boolean> {
  if (!currentUser?.uid || !targetUser?.uid) {
    throw new Error('Both accounts are required to update follow status.');
  }
  if (currentUser.uid === targetUser.uid) {
    throw new Error('You cannot follow your own account.');
  }
  if (auth.currentUser) {
    if (auth.currentUser.uid !== currentUser.uid) {
      throw new Error('You are not authorised to perform this action.');
    }
    await ensureVerifiedTokenClaims(auth.currentUser);
  }

  const currentRef = doc(db, 'users', currentUser.uid);
  const targetRef = doc(db, 'users', targetUser.uid);
  const followingRef = doc(db, 'users', currentUser.uid, 'following', targetUser.uid);
  const followerRef = doc(db, 'users', targetUser.uid, 'followers', currentUser.uid);

  try {
    const outcome = await runTransaction(db, async (tx) => {
      const [followingSnap, followerSnap, currentSnap, targetSnap] = await Promise.all([
        tx.get(followingRef),
        tx.get(followerRef),
        tx.get(currentRef),
        tx.get(targetRef),
      ]);

      if (!currentSnap.exists()) {
        throw new Error('Your Nexora profile must exist before following others.');
      }
      if (!targetSnap.exists()) {
        throw new Error('This user profile is no longer available.');
      }

      const currentData = currentSnap.data() as UserProfile;
      const targetData = targetSnap.data() as UserProfile;
      const currentFollowingCount =
        typeof currentData.followingCount === 'number' && currentData.followingCount >= 0
          ? currentData.followingCount
          : 0;
      const targetFollowersCount =
        typeof targetData.followersCount === 'number' && targetData.followersCount >= 0
          ? targetData.followersCount
          : 0;

      const hasFollowing = followingSnap.exists();
      const hasFollower = followerSnap.exists();

      if (shouldFollow) {
        if (hasFollowing && hasFollower) {
          return { following: true, createdNewEdge: false };
        }

        if (!hasFollowing) {
          tx.set(followingRef, { uid: targetUser.uid, createdAt: serverTimestamp() });
          tx.update(currentRef, {
            followingCount: currentFollowingCount + 1,
            updatedAt: serverTimestamp(),
          });
        }
        if (!hasFollower) {
          tx.set(followerRef, { uid: currentUser.uid, createdAt: serverTimestamp() });
          tx.update(targetRef, {
            followersCount: targetFollowersCount + 1,
            updatedAt: serverTimestamp(),
          });
        }

        return { following: true, createdNewEdge: !hasFollower };
      } else {
        if (!hasFollowing && !hasFollower) {
          return { following: false, createdNewEdge: false };
        }

        if (hasFollowing) {
          tx.delete(followingRef);
          tx.update(currentRef, {
            followingCount: Math.max(0, currentFollowingCount - 1),
            updatedAt: serverTimestamp(),
          });
        }
        if (hasFollower) {
          tx.delete(followerRef);
          tx.update(targetRef, {
            followersCount: Math.max(0, targetFollowersCount - 1),
            updatedAt: serverTimestamp(),
          });
        }

        return { following: false, createdNewEdge: false };
      }
    });

    if (outcome.following && outcome.createdNewEdge) {
      await createNotification({
        recipientId: targetUser.uid,
        actor: currentUser,
        type: 'follow',
        targetId: currentUser.uid,
        preview: `${currentUser.displayName} started following you`,
      });
    }

    return outcome.following;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `users/${targetUser.uid}/followers`);
  }
}

export async function toggleFollowUser(
  currentUser: UserProfile,
  targetUser: UserProfile,
  currentlyFollowing: boolean
): Promise<boolean> {
  return setFollowRelationship(currentUser, targetUser, !currentlyFollowing);
}

// --- Posts & Feed ---
export function subscribeFeedPosts(
  callback: (posts: Post[]) => void,
  spaceId?: string
): Unsubscribe {
  const q = spaceId
    ? query(
        collection(db, 'posts'),
        where('audience', 'in', ['public', 'followers', 'space']),
        where('spaceId', '==', spaceId),
        limit(60)
      )
    : query(
        collection(db, 'posts'),
        where('audience', 'in', ['public', 'followers', 'space']),
        orderBy('createdAt', 'desc'),
        limit(80)
      );

  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<Post, 'id'>) }))
        .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
      callback(items);
    },
    (error) => logFirestoreListenerError(error, OperationType.LIST, 'posts')
  );
}

export function subscribePublicLandingPosts(callback: (posts: Post[]) => void): Unsubscribe {
  const q = query(
    collection(db, 'posts'),
    where('audience', '==', 'public'),
    orderBy('createdAt', 'desc'),
    limit(6)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<Post, 'id'>) }))
        .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
      callback(items);
    },
    () => callback([])
  );
}

export async function createPost(params: {
  author: UserProfile;
  type: PostType;
  text: string;
  mediaUrls?: string[];
  mediaTypes?: string[];
  location?: string;
  audience: AudienceType;
  spaceId?: string;
  spaceName?: string;
  pollOptions?: string[];
  repostOfId?: string;
  taggedUsers?: UserProfile[];
  collaboratorUsers?: UserProfile[];
  blockedUserIds?: string[];
}): Promise<string> {
  const cleanText = sanitizeString(params.text, BLUEPRINT_LIMITS.POST_TEXT_MAX);
  const pollOpts = (params.pollOptions || [])
    .map((o) => sanitizeString(o, 100))
    .filter(Boolean)
    .slice(0, 4);

  const blockedSet = new Set(params.blockedUserIds || []);

  const uniqueTagged = Array.from(
    new Map(
      (params.taggedUsers || [])
        .filter((u) => u.uid !== params.author.uid && !blockedSet.has(u.uid) && !u.suspended)
        .map((u) => [u.uid, u])
    ).values()
  ).slice(0, BLUEPRINT_LIMITS.MAX_TAGGED_USERS);

  const uniqueCollabs = Array.from(
    new Map(
      (params.collaboratorUsers || [])
        .filter((u) => u.uid !== params.author.uid && !blockedSet.has(u.uid) && !u.suspended)
        .map((u) => [u.uid, u])
    ).values()
  ).slice(0, BLUEPRINT_LIMITS.MAX_COLLABORATORS);

  const collaboratorProfiles: Record<string, CollaboratorProfileSummary> = {};
  uniqueCollabs.forEach((u) => {
    collaboratorProfiles[u.uid] = {
      uid: u.uid,
      displayName: sanitizeString(u.displayName, 80),
      username: u.username,
      avatarUrl: sanitizeString(u.avatarUrl || '', 200000),
    };
  });

  const boundedMediaUrls = (params.mediaUrls || []).slice(0, 4);
  const totalMediaChars = boundedMediaUrls.reduce((sum, u) => sum + u.length, 0);
  if (totalMediaChars > 780_000) {
    throw new Error('Attached media exceeds the safe per-post size budget. Please attach fewer or smaller files.');
  }

  const payload = {
    authorId: params.author.uid,
    authorName: sanitizeString(params.author.displayName, 80),
    authorUsername: params.author.username,
    authorAvatar: sanitizeString(params.author.avatarUrl || '', 200000),
    authorVerified: Boolean(params.author.verified),
    spaceId: sanitizeString(params.spaceId || '', 128),
    spaceName: sanitizeString(params.spaceName || '', 80),
    type: params.type,
    text: cleanText,
    mediaUrls: boundedMediaUrls,
    mediaTypes: (params.mediaTypes || []).slice(0, 4),
    hashtags: extractHashtags(cleanText),
    mentions: extractMentions(cleanText),
    taggedUids: uniqueTagged.map((u) => u.uid),
    taggedUsernames: uniqueTagged.map((u) => u.username),
    collaboratorInviteUids: uniqueCollabs.map((u) => u.uid),
    collaboratorUids: [] as string[],
    declinedCollaboratorUids: [] as string[],
    collaboratorProfiles,
    giftsCount: 0,
    location: sanitizeString(params.location || '', 100),
    audience: params.audience,
    pollOptions: pollOpts,
    pollCounts: pollOpts.map(() => 0),
    repostOfId: sanitizeString(params.repostOfId || '', 128),
    likesCount: 0,
    commentsCount: 0,
    repostsCount: 0,
    savesCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    const docRef = await addDoc(collection(db, 'posts'), payload);
    await updateDoc(doc(db, 'users', params.author.uid), {
      postsCount: increment(1),
      updatedAt: serverTimestamp(),
    });

    for (const tagged of uniqueTagged) {
      void dispatchDualNotification({
        recipientUid: tagged.uid,
        recipientName: tagged.displayName,
        actor: params.author,
        type: 'post_tag',
        category: 'social',
        targetId: docRef.id,
        inAppPreview: `@${params.author.username} tagged you in a post: "${cleanText.slice(0, 80)}"`,
        emailSubject: `${params.author.displayName} tagged you on Nexora`,
        emailBodyText: `${params.author.displayName} (@${params.author.username}) tagged you in a post on Nexora.`,
        dedupeKey: `post_tag:${docRef.id}:${tagged.uid}`,
        skipEmailLog: true,
      });
    }

    for (const collab of uniqueCollabs) {
      void dispatchDualNotification({
        recipientUid: collab.uid,
        recipientName: collab.displayName,
        actor: params.author,
        type: 'collab_invite',
        category: 'social',
        targetId: docRef.id,
        inAppPreview: `@${params.author.username} invited you to collaborate on a post`,
        emailSubject: `Collaboration Invitation from @${params.author.username}`,
        emailBodyText: `${params.author.displayName} (@${params.author.username}) invited you to co-author a Nexora post. Open Nexora to Accept or Decline.`,
        dedupeKey: `collab_invite:${docRef.id}:${collab.uid}`,
        skipEmailLog: true,
      });
    }

    return docRef.id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'posts');
  }
}

export async function respondToCollaborationInvite(params: {
  post: Post;
  responder: UserProfile;
  decision: 'accept' | 'decline';
}): Promise<void> {
  const invited = params.post.collaboratorInviteUids || [];
  if (!invited.includes(params.responder.uid)) {
    throw new Error('You do not have an active collaboration invite on this post.');
  }

  const currentAccepted = new Set(params.post.collaboratorUids || []);
  const currentDeclined = new Set(params.post.declinedCollaboratorUids || []);

  if (params.decision === 'accept') {
    currentAccepted.add(params.responder.uid);
    currentDeclined.delete(params.responder.uid);
  } else {
    currentAccepted.delete(params.responder.uid);
    currentDeclined.add(params.responder.uid);
  }

  const nextProfiles = {
    ...(params.post.collaboratorProfiles || {}),
    [params.responder.uid]: {
      uid: params.responder.uid,
      displayName: sanitizeString(params.responder.displayName, 80),
      username: params.responder.username,
      avatarUrl: sanitizeString(params.responder.avatarUrl || '', 200000),
    },
  };

  try {
    await updateDoc(doc(db, 'posts', params.post.id), {
      collaboratorUids: Array.from(currentAccepted).slice(0, BLUEPRINT_LIMITS.MAX_COLLABORATORS),
      declinedCollaboratorUids: Array.from(currentDeclined).slice(0, BLUEPRINT_LIMITS.MAX_COLLABORATORS),
      collaboratorProfiles: nextProfiles,
      updatedAt: serverTimestamp(),
    });

    void dispatchDualNotification({
      recipientUid: params.post.authorId,
      recipientName: params.post.authorName,
      actor: params.responder,
      type: 'collab_response',
      category: 'social',
      targetId: params.post.id,
      inAppPreview:
        params.decision === 'accept'
          ? `@${params.responder.username} accepted your post collaboration invite!`
          : `@${params.responder.username} declined your post collaboration invite.`,
      emailSubject: `Collaboration ${params.decision === 'accept' ? 'Accepted' : 'Declined'} by @${params.responder.username}`,
      emailBodyText: `@${params.responder.username} ${params.decision === 'accept' ? 'accepted' : 'declined'} your collaboration invite on Nexora.`,
      dedupeKey: `collab_resp:${params.post.id}:${params.responder.uid}:${params.decision}`,
      skipEmailLog: true,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `posts/${params.post.id}`);
  }
}

export async function removeSelfTagFromPost(params: {
  post: Post;
  user: UserProfile;
}): Promise<void> {
  const currentUids = params.post.taggedUids || [];
  if (!currentUids.includes(params.user.uid)) return;

  const nextUids = currentUids.filter((id) => id !== params.user.uid);
  const nextUsernames = (params.post.taggedUsernames || []).filter(
    (handle) => handle.toLowerCase() !== params.user.username.toLowerCase()
  );

  try {
    await updateDoc(doc(db, 'posts', params.post.id), {
      taggedUids: nextUids,
      taggedUsernames: nextUsernames,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `posts/${params.post.id}`);
  }
}

export async function deletePost(postId: string, authorId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'posts', postId));
    await updateDoc(doc(db, 'users', authorId), {
      postsCount: increment(-1),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `posts/${postId}`);
  }
}

export async function togglePostLike(post: Post, actor: UserProfile): Promise<boolean> {
  const likeRef = doc(db, 'posts', post.id, 'likes', actor.uid);
  try {
    const existing = await getDoc(likeRef);
    const batch = writeBatch(db);
    if (existing.exists()) {
      batch.delete(likeRef);
      batch.update(doc(db, 'posts', post.id), {
        likesCount: increment(-1),
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      return false;
    } else {
      batch.set(likeRef, { uid: actor.uid, createdAt: serverTimestamp() });
      batch.update(doc(db, 'posts', post.id), {
        likesCount: increment(1),
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      await createNotification({
        recipientId: post.authorId,
        actor,
        type: 'like',
        targetId: post.id,
        preview: post.text.slice(0, 80) || 'Liked your post',
      });
      return true;
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `posts/${post.id}/likes/${actor.uid}`);
  }
}

export async function checkPostLiked(postId: string, uid: string): Promise<boolean> {
  try {
    const snap = await getDoc(doc(db, 'posts', postId, 'likes', uid));
    return snap.exists();
  } catch {
    return false;
  }
}

export async function toggleSavePost(post: Post, uid: string): Promise<boolean> {
  const saveRef = doc(db, 'users', uid, 'saved', post.id);
  try {
    const snap = await getDoc(saveRef);
    const batch = writeBatch(db);
    if (snap.exists()) {
      batch.delete(saveRef);
      batch.update(doc(db, 'posts', post.id), {
        savesCount: increment(-1),
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      return false;
    } else {
      batch.set(saveRef, { postId: post.id, savedAt: serverTimestamp() });
      batch.update(doc(db, 'posts', post.id), {
        savesCount: increment(1),
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      return true;
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `users/${uid}/saved/${post.id}`);
  }
}

export function subscribeSavedPostIds(uid: string, callback: (ids: string[]) => void): Unsubscribe {
  return onSnapshot(
    collection(db, 'users', uid, 'saved'),
    (snap) => callback(snap.docs.map((d) => d.id)),
    (error) => logFirestoreListenerError(error, OperationType.LIST, `users/${uid}/saved`)
  );
}

export async function repostPost(originalPost: Post, actor: UserProfile): Promise<void> {
  try {
    await createPost({
      author: actor,
      type: 'repost',
      text: originalPost.text,
      mediaUrls: originalPost.mediaUrls,
      mediaTypes: originalPost.mediaTypes,
      audience: 'public',
      repostOfId: originalPost.id,
    });
    await updateDoc(doc(db, 'posts', originalPost.id), {
      repostsCount: increment(1),
      updatedAt: serverTimestamp(),
    });
    await createNotification({
      recipientId: originalPost.authorId,
      actor,
      type: 'repost',
      targetId: originalPost.id,
      preview: originalPost.text.slice(0, 80) || 'Reposted your update',
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `posts/${originalPost.id}`);
  }
}

export async function voteOnPoll(post: Post, uid: string, optionIndex: number): Promise<void> {
  const voteRef = doc(db, 'posts', post.id, 'votes', uid);
  try {
    const existingVote = await getDoc(voteRef);
    if (existingVote.exists()) return;
    const nextCounts = [...(post.pollCounts || post.pollOptions.map(() => 0))];
    nextCounts[optionIndex] = (nextCounts[optionIndex] || 0) + 1;
    const batch = writeBatch(db);
    batch.set(voteRef, { uid, optionIndex, createdAt: serverTimestamp() });
    batch.update(doc(db, 'posts', post.id), {
      pollCounts: nextCounts,
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `posts/${post.id}/votes/${uid}`);
  }
}

export function subscribePostComments(
  postId: string,
  callback: (comments: PostComment[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'posts', postId, 'comments'),
    orderBy('createdAt', 'asc'),
    limit(100)
  );
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PostComment, 'id'>) }))),
    (error) => logFirestoreListenerError(error, OperationType.LIST, `posts/${postId}/comments`)
  );
}

export async function addPostComment(params: {
  post: Post;
  author: UserProfile;
  text: string;
  parentCommentId?: string;
  replyToUid?: string;
}): Promise<void> {
  const clean = sanitizeString(params.text, BLUEPRINT_LIMITS.COMMENT_TEXT_MAX);
  if (!clean) return;
  try {
    const batch = writeBatch(db);
    const commentRef = doc(collection(db, 'posts', params.post.id, 'comments'));
    batch.set(commentRef, {
      postId: params.post.id,
      authorId: params.author.uid,
      authorName: sanitizeString(params.author.displayName, 80),
      authorUsername: params.author.username,
      authorAvatar: sanitizeString(params.author.avatarUrl || '', 200000),
      authorVerified: Boolean(params.author.verified),
      parentCommentId: sanitizeString(params.parentCommentId || '', 128),
      text: clean,
      createdAt: serverTimestamp(),
    });
    batch.update(doc(db, 'posts', params.post.id), {
      commentsCount: increment(1),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();

    const isReply = Boolean(params.parentCommentId && params.replyToUid);
    await createNotification({
      recipientId: isReply && params.replyToUid ? params.replyToUid : params.post.authorId,
      actor: params.author,
      type: isReply ? 'reply' : 'comment',
      targetType: 'post',
      targetId: params.post.id,
      preview: clean.slice(0, 80),
      dedupeKey: `comment:${commentRef.id}`,
    });

    const mentions = extractMentions(clean).slice(0, 5);
    for (const handle of mentions) {
      const mentionedUid = await resolveUidByUsername(handle).catch(() => null);
      if (mentionedUid && mentionedUid !== params.author.uid && mentionedUid !== params.post.authorId) {
        await createNotification({
          recipientId: mentionedUid,
          actor: params.author,
          type: 'mention',
          targetType: 'post',
          targetId: params.post.id,
          preview: clean.slice(0, 80),
          dedupeKey: `mention:${commentRef.id}:${mentionedUid}`,
        });
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `posts/${params.post.id}/comments`);
  }
}

// --- Stories ---
export function subscribeStories(callback: (stories: Story[]) => void): Unsubscribe {
  const q = query(
    collection(db, 'stories'),
    where('privacy', 'in', ['public', 'followers', 'close']),
    orderBy('createdAt', 'desc'),
    limit(60)
  );
  return onSnapshot(
    q,
    (snap) => {
      const now = Date.now();
      const active = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<Story, 'id'>) }))
        .filter((s) => !s.expiresAt || s.expiresAt.toDate().getTime() > now)
        .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
      callback(active);
    },
    (error) => logFirestoreListenerError(error, OperationType.LIST, 'stories')
  );
}

export async function createStory(params: {
  author: UserProfile;
  type: StoryType;
  text?: string;
  mediaUrl?: string;
  bgGradient?: string;
  privacy: StoryPrivacy;
}): Promise<string> {
  const expiresAt = Timestamp.fromDate(new Date(Date.now() + 24 * 60 * 60 * 1000));
  try {
    const ref = await addDoc(collection(db, 'stories'), {
      authorId: params.author.uid,
      authorName: sanitizeString(params.author.displayName, 80),
      authorUsername: params.author.username,
      authorAvatar: sanitizeString(params.author.avatarUrl || '', 200000),
      authorVerified: Boolean(params.author.verified),
      type: params.type,
      text: sanitizeString(params.text || '', BLUEPRINT_LIMITS.STORY_TEXT_MAX),
      mediaUrl: sanitizeString(params.mediaUrl || '', 400000),
      bgGradient: sanitizeString(params.bgGradient || 'from-[#4C1D95] to-[#06060A]', 100),
      privacy: params.privacy,
      viewsCount: 0,
      createdAt: serverTimestamp(),
      expiresAt,
    });
    return ref.id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'stories');
  }
}

export async function recordStoryView(
  story: Story,
  viewer: UserProfile,
  reaction = ''
): Promise<void> {
  const viewRef = doc(db, 'stories', story.id, 'views', viewer.uid);
  try {
    const existing = await getDoc(viewRef);
    if (!existing.exists()) {
      const batch = writeBatch(db);
      batch.set(viewRef, {
        uid: viewer.uid,
        viewerName: sanitizeString(viewer.displayName, 80),
        viewerAvatar: sanitizeString(viewer.avatarUrl || '', 200000),
        reaction: sanitizeString(reaction, 20),
        viewedAt: serverTimestamp(),
      });
      batch.update(doc(db, 'stories', story.id), { viewsCount: increment(1) });
      await batch.commit();
    } else if (reaction) {
      await updateDoc(viewRef, {
        reaction: sanitizeString(reaction, 20),
        viewedAt: serverTimestamp(),
      });
    }
  } catch {
    // Non-blocking story receipt
  }
}

export async function getStoryViewers(storyId: string): Promise<StoryView[]> {
  try {
    const snap = await getDocs(collection(db, 'stories', storyId, 'views'));
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<StoryView, 'id'>) }));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, `stories/${storyId}/views`);
  }
}

// --- Vibes (Short Videos) ---
export function subscribeVibes(callback: (vibes: Vibe[]) => void): Unsubscribe {
  const q = query(
    collection(db, 'vibes'),
    where('viewsCount', '>=', 0),
    orderBy('createdAt', 'desc'),
    limit(40)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<Vibe, 'id'>) }))
        .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
      callback(items);
    },
    (error) => logFirestoreListenerError(error, OperationType.LIST, 'vibes')
  );
}

export async function createVibe(params: {
  author: UserProfile;
  videoUrl: string;
  thumbnailUrl?: string;
  caption: string;
  audioTrack?: string;
  filterPreset?: string;
  textOverlay?: string;
  trimStart?: number;
  trimEnd?: number;
  duration?: number;
}): Promise<string> {
  const cleanCaption = sanitizeString(params.caption, BLUEPRINT_LIMITS.VIBE_CAPTION_MAX);
  try {
    const ref = await addDoc(collection(db, 'vibes'), {
      authorId: params.author.uid,
      authorName: sanitizeString(params.author.displayName, 80),
      authorUsername: params.author.username,
      authorAvatar: sanitizeString(params.author.avatarUrl || '', 200000),
      authorVerified: Boolean(params.author.verified),
      videoUrl: sanitizeString(params.videoUrl, 500000),
      thumbnailUrl: sanitizeString(params.thumbnailUrl || '', 300000),
      caption: cleanCaption,
      hashtags: extractHashtags(cleanCaption),
      audioTrack: sanitizeString(params.audioTrack || 'Original Audio', 120),
      filterPreset: sanitizeString(params.filterPreset || 'none', 40),
      textOverlay: sanitizeString(params.textOverlay || '', 120),
      trimStart: params.trimStart ?? 0,
      trimEnd: params.trimEnd ?? 30,
      duration: params.duration ?? 30,
      likesCount: 0,
      commentsCount: 0,
      repostsCount: 0,
      savesCount: 0,
      viewsCount: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'vibes');
  }
}

export async function toggleVibeLike(vibe: Vibe, actor: UserProfile): Promise<boolean> {
  const likeRef = doc(db, 'vibes', vibe.id, 'likes', actor.uid);
  try {
    const existing = await getDoc(likeRef);
    const batch = writeBatch(db);
    if (existing.exists()) {
      batch.delete(likeRef);
      batch.update(doc(db, 'vibes', vibe.id), {
        likesCount: increment(-1),
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      return false;
    } else {
      batch.set(likeRef, { uid: actor.uid, createdAt: serverTimestamp() });
      batch.update(doc(db, 'vibes', vibe.id), {
        likesCount: increment(1),
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      return true;
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `vibes/${vibe.id}/likes/${actor.uid}`);
  }
}

export async function incrementVibeView(vibeId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'vibes', vibeId), {
      viewsCount: increment(1),
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Non-blocking analytics increment
  }
}

export async function deleteVibe(vibeId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'vibes', vibeId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `vibes/${vibeId}`);
  }
}

export async function repostVibe(vibe: Vibe, actor: UserProfile): Promise<void> {
  try {
    await updateDoc(doc(db, 'vibes', vibe.id), {
      repostsCount: increment(1),
      updatedAt: serverTimestamp(),
    });
    await createNotification({
      recipientId: vibe.authorId,
      actor,
      type: 'repost',
      targetId: vibe.id,
      preview: vibe.caption.slice(0, 80) || 'Reposted your Vibe',
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `vibes/${vibe.id}`);
  }
}

export async function toggleSaveVibe(vibe: Vibe, uid: string): Promise<boolean> {
  const saveRef = doc(db, 'users', uid, 'saved', vibe.id);
  try {
    const snap = await getDoc(saveRef);
    const batch = writeBatch(db);
    if (snap.exists()) {
      batch.delete(saveRef);
      batch.update(doc(db, 'vibes', vibe.id), {
        savesCount: increment(-1),
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      return false;
    } else {
      batch.set(saveRef, { postId: vibe.id, savedAt: serverTimestamp() });
      batch.update(doc(db, 'vibes', vibe.id), {
        savesCount: increment(1),
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      return true;
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `users/${uid}/saved/${vibe.id}`);
  }
}

export async function addVibeComment(vibe: Vibe, author: UserProfile, text: string): Promise<void> {
  const clean = sanitizeString(text, BLUEPRINT_LIMITS.COMMENT_TEXT_MAX);
  if (!clean) return;
  try {
    const batch = writeBatch(db);
    const commentRef = doc(collection(db, 'vibes', vibe.id, 'comments'));
    batch.set(commentRef, {
      postId: vibe.id,
      authorId: author.uid,
      authorName: sanitizeString(author.displayName, 80),
      authorUsername: author.username,
      authorAvatar: sanitizeString(author.avatarUrl || '', 200000),
      authorVerified: Boolean(author.verified),
      parentCommentId: '',
      text: clean,
      createdAt: serverTimestamp(),
    });
    batch.update(doc(db, 'vibes', vibe.id), {
      commentsCount: increment(1),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `vibes/${vibe.id}/comments`);
  }
}

export function subscribeVibeComments(
  vibeId: string,
  callback: (comments: PostComment[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'vibes', vibeId, 'comments'),
    orderBy('createdAt', 'asc'),
    limit(50)
  );
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PostComment, 'id'>) }))),
    (error) => logFirestoreListenerError(error, OperationType.LIST, `vibes/${vibeId}/comments`)
  );
}

// --- Spaces (Communities) ---
export function subscribeSpaces(callback: (spaces: Space[]) => void): Unsubscribe {
  const q = query(
    collection(db, 'spaces'),
    where('isPrivate', 'in', [false, true]),
    orderBy('createdAt', 'desc'),
    limit(60)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<Space, 'id'>) }))
        .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
      callback(items);
    },
    (error) => logFirestoreListenerError(error, OperationType.LIST, 'spaces')
  );
}

export async function createSpace(params: {
  owner: UserProfile;
  name: string;
  description: string;
  category: string;
  coverUrl: string;
  coverPositionY?: number;
  isPrivate: boolean;
  initialStatus?: 'active' | 'pending';
}): Promise<string> {
  const cleanName = sanitizeString(params.name, BLUEPRINT_LIMITS.SPACE_NAME_MAX);
  const slug = cleanName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'space';

  try {
    const spaceRef = doc(collection(db, 'spaces'));
    const batch = writeBatch(db);
    batch.set(spaceRef, {
      name: cleanName,
      slug,
      description: sanitizeString(params.description, BLUEPRINT_LIMITS.SPACE_DESC_MAX),
      category: sanitizeString(params.category, 40),
      coverUrl: sanitizeString(params.coverUrl, 400000),
      coverPositionY: params.coverPositionY ?? 50,
      ownerId: params.owner.uid,
      ownerName: sanitizeString(params.owner.displayName, 80),
      ownerUsername: params.owner.username,
      verified: false,
      status: params.initialStatus || 'active',
      membersCount: 1,
      isPrivate: params.isPrivate,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, 'spaces', spaceRef.id, 'members', params.owner.uid), {
      uid: params.owner.uid,
      role: 'owner',
      displayName: sanitizeString(params.owner.displayName, 80),
      username: params.owner.username,
      avatarUrl: sanitizeString(params.owner.avatarUrl || '', 200000),
      joinedAt: serverTimestamp(),
    });
    await batch.commit();
    return spaceRef.id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'spaces');
  }
}

export async function sendSpaceInviteNotification(
  space: Space,
  inviter: UserProfile,
  recipientId: string
): Promise<void> {
  if (recipientId === inviter.uid) return;
  try {
    await addDoc(collection(db, 'notifications'), {
      recipientId,
      actorId: inviter.uid,
      actorName: sanitizeString(inviter.displayName, 80),
      actorAvatar: sanitizeString(inviter.avatarUrl || '', 200000),
      type: 'space_invite',
      targetId: space.id,
      preview: sanitizeString(`Invited you to join ${space.name}`, 200),
      read: false,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'notifications');
  }
}

export async function seedInitialSpacesIfEmpty(user: UserProfile): Promise<void> {
  try {
    const snap = await getDocs(
      query(collection(db, 'spaces'), where('isPrivate', 'in', [false, true]), limit(1))
    );
    if (!snap.empty) return;
    const starterSpaces = [
      {
        name: 'Founders & Venture Circle',
        description: 'Strategic briefings, founder roundtables, and operating playbooks for modern builders.',
        category: 'Business',
        coverUrl: '/src/assets/images/space_cover_business_1795069803165.jpg',
        isPrivate: false,
      },
      {
        name: 'Slow Living & Craft Studio',
        description: 'Architecture, analog rituals, intentional interiors, and daily creative routines.',
        category: 'Lifestyle',
        coverUrl: '/src/assets/images/space_cover_lifestyle_1795069803396.jpg',
        isPrivate: false,
      },
      {
        name: 'Fellows Research Commons',
        description: 'Open seminars, peer essays, study cohorts, and curated reading syllabi.',
        category: 'Education',
        coverUrl: '/src/assets/images/space_cover_education_1795069803375.jpg',
        isPrivate: false,
      },
      {
        name: 'Spatial Design Collective',
        description: 'Visual systems, industrial craft, motion typography, and dark-mode architecture.',
        category: 'Design',
        coverUrl: '/src/assets/images/space_cover_design_1795066814901.jpg',
        isPrivate: false,
      },
    ];
    for (const s of starterSpaces) {
      await createSpace({ owner: user, ...s });
    }
  } catch {
    // Non-fatal seed check
  }
}

export async function toggleSpaceMembership(
  space: Space,
  user: UserProfile,
  isMember: boolean
): Promise<boolean> {
  const memberRef = doc(db, 'spaces', space.id, 'members', user.uid);
  try {
    const batch = writeBatch(db);
    if (isMember) {
      if (space.ownerId === user.uid) throw new Error('Space owners cannot leave their own Space.');
      batch.delete(memberRef);
      batch.update(doc(db, 'spaces', space.id), {
        membersCount: increment(-1),
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      return false;
    } else {
      batch.set(memberRef, {
        uid: user.uid,
        role: 'member',
        displayName: sanitizeString(user.displayName, 80),
        username: user.username,
        avatarUrl: sanitizeString(user.avatarUrl || '', 200000),
        joinedAt: serverTimestamp(),
      });
      batch.update(doc(db, 'spaces', space.id), {
        membersCount: increment(1),
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      return true;
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `spaces/${space.id}/members/${user.uid}`);
  }
}

export function subscribeSpaceMembers(
  spaceId: string,
  callback: (members: SpaceMember[]) => void
): Unsubscribe {
  const q = query(collection(db, 'spaces', spaceId, 'members'), limit(150));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => d.data() as SpaceMember)),
    (error) => logFirestoreListenerError(error, OperationType.LIST, `spaces/${spaceId}/members`)
  );
}

export function subscribeMySpaceMembership(
  spaceId: string,
  uid: string,
  callback: (isMember: boolean) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, 'spaces', spaceId, 'members', uid),
    (snap) => callback(snap.exists()),
    (error) => logFirestoreListenerError(error, OperationType.GET, `spaces/${spaceId}/members/${uid}`)
  );
}

export async function updateSpaceCover(
  spaceId: string,
  coverUrl: string,
  coverPositionY: number
): Promise<void> {
  try {
    await updateDoc(doc(db, 'spaces', spaceId), {
      coverUrl: sanitizeString(coverUrl, 400000),
      coverPositionY: Math.max(0, Math.min(100, Math.round(coverPositionY))),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `spaces/${spaceId}`);
  }
}

export async function updateSpaceMemberRole(
  spaceId: string,
  memberUid: string,
  role: 'admin' | 'member'
): Promise<void> {
  try {
    await updateDoc(doc(db, 'spaces', spaceId, 'members', memberUid), { role });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `spaces/${spaceId}/members/${memberUid}`);
  }
}

export async function removeSpaceMember(space: Space, memberUid: string): Promise<void> {
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'spaces', space.id, 'members', memberUid));
    batch.update(doc(db, 'spaces', space.id), {
      membersCount: increment(-1),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `spaces/${space.id}/members/${memberUid}`);
  }
}

export function subscribeSpaceDiscussions(
  spaceId: string,
  callback: (messages: SpaceDiscussion[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'spaces', spaceId, 'discussions'),
    orderBy('createdAt', 'asc'),
    limit(80)
  );
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SpaceDiscussion, 'id'>) }))),
    () => callback([])
  );
}

export async function sendSpaceDiscussion(params: {
  spaceId: string;
  author: UserProfile;
  text: string;
  channel: string;
  isAi?: boolean;
  aiTriggeredBy?: string;
  authorNameOverride?: string;
  authorAvatarOverride?: string;
}): Promise<void> {
  const clean = sanitizeString(params.text, 1000);
  if (!clean) return;
  try {
    await addDoc(collection(db, 'spaces', params.spaceId, 'discussions'), {
      authorId: params.author.uid,
      authorName: sanitizeString(params.authorNameOverride || params.author.displayName, 80),
      authorAvatar: sanitizeString(params.authorAvatarOverride ?? (params.author.avatarUrl || ''), 200000),
      text: clean,
      channel: sanitizeString(params.channel, 40),
      ...(params.isAi ? { isAi: true, aiTriggeredBy: sanitizeString(params.aiTriggeredBy || params.author.uid, 128) } : {}),
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `spaces/${params.spaceId}/discussions`);
  }
}

export function subscribeSpaceEvents(
  spaceId: string,
  callback: (events: SpaceEvent[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'spaces', spaceId, 'events'),
    orderBy('createdAt', 'desc'),
    limit(20)
  );
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SpaceEvent, 'id'>) }))),
    (error) => logFirestoreListenerError(error, OperationType.LIST, `spaces/${spaceId}/events`)
  );
}

export async function createSpaceEvent(params: {
  spaceId: string;
  host: UserProfile;
  title: string;
  description: string;
  scheduledFor: string;
}): Promise<void> {
  try {
    await addDoc(collection(db, 'spaces', params.spaceId, 'events'), {
      title: sanitizeString(params.title, 100),
      description: sanitizeString(params.description, 400),
      scheduledFor: sanitizeString(params.scheduledFor, 60),
      hostId: params.host.uid,
      hostName: sanitizeString(params.host.displayName, 80),
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `spaces/${params.spaceId}/events`);
  }
}

// --- Chat & Messaging ---
export function isUserOnlineNow(user?: Partial<UserProfile> | null): boolean {
  if (!user || !user.isOnline) return false;
  const lastMs = user.lastActiveAt?.toMillis?.();
  if (!lastMs) return true;
  return Date.now() - lastMs < 8 * 60 * 1000;
}

export async function setUserOnlinePresence(uid: string, isOnline: boolean): Promise<void> {
  if (!uid) return;
  try {
    await updateDoc(doc(db, 'users', uid), {
      isOnline,
      lastActiveAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Non-fatal presence heartbeat
  }
}

export function subscribeConversations(
  uid: string,
  callback: (convs: Conversation[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'conversations'),
    where('participantIds', 'array-contains', uid),
    orderBy('updatedAt', 'desc'),
    limit(50)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<Conversation, 'id'>) }))
        .sort((a, b) => (b.updatedAt?.toMillis?.() ?? 0) - (a.updatedAt?.toMillis?.() ?? 0));
      callback(items);
    },
    (error) => logFirestoreListenerError(error, OperationType.LIST, 'conversations')
  );
}

export async function createOrGetDirectConversation(
  currentUser: UserProfile,
  targetUser: UserProfile,
  blockedUserIds?: string[]
): Promise<string> {
  if (!currentUser?.uid || !targetUser?.uid) {
    throw new Error('Both member profiles are required to open a conversation.');
  }
  if (currentUser.uid === targetUser.uid) {
    throw new Error('You cannot start a direct conversation with your own account.');
  }
  if (blockedUserIds?.includes(targetUser.uid)) {
    throw new Error('Unblock this user in Privacy settings before starting a conversation.');
  }

  const sortedIds = [currentUser.uid, targetUser.uid].sort();
  const convId = `dm_${sortedIds[0]}_${sortedIds[1]}`.slice(0, 128);
  const convRef = doc(db, 'conversations', convId);

  try {
    const snap = await getDoc(convRef);
    if (snap.exists()) return convId;

    await setDoc(convRef, {
      isGroup: false,
      title: '',
      participantIds: sortedIds,
      participantNames: {
        [currentUser.uid]: sanitizeString(currentUser.displayName, 80),
        [targetUser.uid]: sanitizeString(targetUser.displayName, 80),
      },
      participantAvatars: {
        [currentUser.uid]: sanitizeString(currentUser.avatarUrl || '', 200000),
        [targetUser.uid]: sanitizeString(targetUser.avatarUrl || '', 200000),
      },
      readBy: {
        [currentUser.uid]: serverTimestamp(),
      },
      lastMessageText: '',
      lastMessageSenderId: '',
      createdBy: currentUser.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return convId;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `conversations/${convId}`);
  }
}

export async function createGroupConversation(
  creator: UserProfile,
  title: string,
  members: UserProfile[]
): Promise<string> {
  const uniqueMembers = [creator, ...members.filter((m) => m.uid !== creator.uid)].slice(0, 20);
  if (uniqueMembers.length < 2) {
    throw new Error('Select at least one other member for a group chat.');
  }
  const participantNames: Record<string, string> = {};
  const participantAvatars: Record<string, string> = {};
  uniqueMembers.forEach((m) => {
    participantNames[m.uid] = sanitizeString(m.displayName, 80);
    participantAvatars[m.uid] = sanitizeString(m.avatarUrl || '', 200000);
  });

  try {
    const ref = await addDoc(collection(db, 'conversations'), {
      isGroup: true,
      title: sanitizeString(title, 80) || 'Nexora Group',
      participantIds: uniqueMembers.map((m) => m.uid),
      participantNames,
      participantAvatars,
      readBy: {
        [creator.uid]: serverTimestamp(),
      },
      lastMessageText: '',
      lastMessageSenderId: '',
      createdBy: creator.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'conversations');
  }
}

export function subscribeMessages(
  convId: string,
  callback: (messages: ChatMessage[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'conversations', convId, 'messages'),
    orderBy('createdAt', 'asc'),
    limit(100)
  );
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ChatMessage, 'id'>) }))),
    (error) => logFirestoreListenerError(error, OperationType.LIST, `conversations/${convId}/messages`)
  );
}

export async function sendChatMessage(params: {
  convId: string;
  sender: UserProfile;
  type: MessageType;
  text: string;
  mediaUrl?: string;
  fileName?: string;
  replyToId?: string;
  replyToText?: string;
  recipientIds?: string[];
  isAi?: boolean;
  aiTriggeredBy?: string;
  senderNameOverride?: string;
}): Promise<void> {
  const cleanText = sanitizeString(params.text, BLUEPRINT_LIMITS.CHAT_MESSAGE_MAX);
  const cleanMediaUrl = sanitizeString(params.mediaUrl || '', 500000);
  if (!cleanText && !cleanMediaUrl) {
    throw new Error('Write a message or attach media before sending.');
  }

  try {
    const msgRef = doc(collection(db, 'conversations', params.convId, 'messages'));
    const convRef = doc(db, 'conversations', params.convId);
    const preview =
      cleanText ||
      (params.type === 'image'
        ? 'Sent an image'
        : params.type === 'video'
        ? 'Sent a video'
        : params.type === 'voice'
        ? 'Sent a voice note'
        : 'Sent a document');

    const batch = writeBatch(db);
    batch.set(msgRef, {
      senderId: params.sender.uid,
      senderName: sanitizeString(params.senderNameOverride || params.sender.displayName, 80),
      type: params.type,
      text: cleanText,
      mediaUrl: cleanMediaUrl,
      fileName: sanitizeString(params.fileName || '', 120),
      replyToId: sanitizeString(params.replyToId || '', 128),
      replyToText: sanitizeString(params.replyToText || '', 200),
      reactions: {},
      edited: false,
      deleted: false,
      ...(params.isAi ? { isAi: true, aiTriggeredBy: sanitizeString(params.aiTriggeredBy || params.sender.uid, 128) } : {}),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.update(convRef, {
      lastMessageText: sanitizeString(params.isAi ? `Nexora AI: ${preview}` : preview, 300),
      lastMessageSenderId: params.sender.uid,
      lastMessageAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      [`readBy.${params.sender.uid}`]: serverTimestamp(),
      [`typingBy.${params.sender.uid}`]: Timestamp.fromMillis(0),
    });
    await batch.commit();

    for (const rId of params.recipientIds || []) {
      if (rId !== params.sender.uid) {
        await createNotification({
          recipientId: rId,
          actor: params.isAi
            ? { ...params.sender, displayName: 'Nexora AI' }
            : params.sender,
          type: 'message',
          targetId: params.convId,
          preview: (params.isAi ? `Nexora AI: ${preview}` : preview).slice(0, 80),
        });
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `conversations/${params.convId}/messages`);
  }
}

export async function editChatMessage(
  convId: string,
  messageId: string,
  newText: string
): Promise<void> {
  try {
    await updateDoc(doc(db, 'conversations', convId, 'messages', messageId), {
      text: sanitizeString(newText, BLUEPRINT_LIMITS.CHAT_MESSAGE_MAX),
      edited: true,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `conversations/${convId}/messages/${messageId}`);
  }
}

export async function deleteChatMessage(convId: string, messageId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'conversations', convId, 'messages', messageId), {
      text: 'This message was removed.',
      deleted: true,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `conversations/${convId}/messages/${messageId}`);
  }
}

export async function toggleMessageReaction(
  convId: string,
  message: ChatMessage,
  uid: string,
  emoji: string
): Promise<void> {
  const nextReactions = { ...(message.reactions || {}) };
  const currentList = nextReactions[emoji] || [];
  if (currentList.includes(uid)) {
    nextReactions[emoji] = currentList.filter((id) => id !== uid);
    if (nextReactions[emoji].length === 0) delete nextReactions[emoji];
  } else {
    nextReactions[emoji] = [...currentList, uid];
  }
  try {
    await updateDoc(doc(db, 'conversations', convId, 'messages', message.id), {
      reactions: nextReactions,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `conversations/${convId}/messages/${message.id}`);
  }
}

export async function markConversationRead(convId: string, uid: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'conversations', convId), {
      [`readBy.${uid}`]: serverTimestamp(),
    });
  } catch {
    // Non-blocking read receipt sync
  }
}

export async function setConversationTyping(
  convId: string,
  uid: string,
  isTyping: boolean,
  options?: { suppressTyping?: boolean }
): Promise<void> {
  try {
    const effectiveTyping = options?.suppressTyping ? false : isTyping;
    await updateDoc(doc(db, 'conversations', convId), {
      [`typingBy.${uid}`]: effectiveTyping ? Timestamp.now() : Timestamp.fromMillis(0),
    });
  } catch {
    // Non-blocking typing indicator
  }
}

export async function forwardChatMessage(params: {
  targetConvId: string;
  sender: UserProfile;
  original: ChatMessage;
  recipientIds: string[];
}): Promise<void> {
  const prefix = params.original.text ? `Forwarded: ${params.original.text}` : 'Forwarded attachment';
  await sendChatMessage({
    convId: params.targetConvId,
    sender: params.sender,
    type: params.original.type,
    text: prefix,
    mediaUrl: params.original.mediaUrl,
    fileName: params.original.fileName,
    recipientIds: params.recipientIds,
  });
}

// --- Free Virtual Gifting ---
export async function sendFreeVirtualGift(params: {
  sender: UserProfile;
  recipient: { uid: string; displayName: string; username: string };
  gift: VirtualGiftCatalogItem;
  targetType: 'profile' | 'post';
  targetId: string;
  message?: string;
  anonymous?: boolean;
}): Promise<string> {
  if (params.sender.uid === params.recipient.uid) {
    throw new Error('You cannot send a virtual gift to your own account.');
  }
  const cleanMsg = sanitizeString(params.message || '', BLUEPRINT_LIMITS.GIFT_MESSAGE_MAX);
  const isAnon = Boolean(params.anonymous);

  try {
    const giftRef = doc(collection(db, 'virtual_gifts'));
    const batch = writeBatch(db);
    batch.set(giftRef, {
      giftId: params.gift.id,
      giftName: sanitizeString(params.gift.name, 60),
      giftEmoji: sanitizeString(params.gift.emoji, 16),
      giftAccent: sanitizeString(params.gift.accentColor, 24),
      senderUid: params.sender.uid,
      senderName: sanitizeString(params.sender.displayName, 80),
      senderUsername: params.sender.username,
      senderAvatar: sanitizeString(params.sender.avatarUrl || '', 200000),
      recipientUid: params.recipient.uid,
      recipientName: sanitizeString(params.recipient.displayName, 80),
      recipientUsername: params.recipient.username,
      targetType: params.targetType,
      targetId: sanitizeString(params.targetId, 128),
      message: cleanMsg,
      anonymous: isAnon,
      createdAt: serverTimestamp(),
    });

    if (params.targetType === 'post') {
      batch.update(doc(db, 'posts', params.targetId), {
        giftsCount: increment(1),
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();

    const senderLabel = isAnon ? 'An anonymous supporter' : `@${params.sender.username}`;
    void dispatchDualNotification({
      recipientUid: params.recipient.uid,
      recipientName: params.recipient.displayName,
      actor: params.sender,
      type: 'gift_received',
      category: 'gifts',
      targetId: params.targetType === 'post' ? params.targetId : params.recipient.uid,
      inAppPreview: `${senderLabel} sent you a free ${params.gift.emoji} ${params.gift.name}${cleanMsg ? `: "${cleanMsg.slice(0, 60)}"` : ''}`,
      emailSubject: `You received a ${params.gift.name} gift on Nexora!`,
      emailBodyText: `${senderLabel} sent you a free ${params.gift.emoji} ${params.gift.name} on Nexora.${cleanMsg ? `\n\nMessage: "${cleanMsg}"` : ''}`,
      dedupeKey: `gift:${giftRef.id}`,
      skipEmailLog: true,
    });

    return giftRef.id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'virtual_gifts');
  }
}

export function subscribeUserGifts(
  uid: string,
  callback: (data: { received: GiftTransaction[]; sent: GiftTransaction[] }) => void
): Unsubscribe {
  let received: GiftTransaction[] = [];
  let sent: GiftTransaction[] = [];

  const emit = () => callback({ received, sent });

  const receivedQ = query(
    collection(db, 'virtual_gifts'),
    where('targetType', 'in', ['profile', 'post']),
    where('recipientUid', '==', uid),
    limit(60)
  );
  const sentQ = query(
    collection(db, 'virtual_gifts'),
    where('targetType', 'in', ['profile', 'post']),
    where('senderUid', '==', uid),
    limit(60)
  );

  const u1 = onSnapshot(
    receivedQ,
    (snap) => {
      received = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<GiftTransaction, 'id'>) }))
        .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
      emit();
    },
    () => {
      received = [];
      emit();
    }
  );

  const u2 = onSnapshot(
    sentQ,
    (snap) => {
      sent = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<GiftTransaction, 'id'>) }))
        .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
      emit();
    },
    () => {
      sent = [];
      emit();
    }
  );

  return () => {
    u1();
    u2();
  };
}

// --- Contact, Support & Ban Appeal Submissions ---
export async function submitContactSubmission(params: {
  user?: UserProfile | null;
  name: string;
  email: string;
  category: 'support' | 'appeal' | 'verification_help' | 'bug' | 'partnership';
  subject: string;
  message: string;
}): Promise<string> {
  const cleanName = sanitizeString(params.name, 80);
  const cleanEmail = sanitizeString(params.email, 254);
  const cleanSubject = sanitizeString(params.subject, BLUEPRINT_LIMITS.CONTACT_SUBJECT_MAX);
  const cleanMessage = sanitizeString(params.message, BLUEPRINT_LIMITS.CONTACT_MESSAGE_MAX);

  if (!cleanName || !cleanEmail || cleanSubject.length < 2 || cleanMessage.length < 4) {
    throw new Error('Please complete your name, valid email, subject, and message.');
  }

  const now = serverTimestamp();
  const payload: Record<string, unknown> = {
    name: cleanName,
    email: cleanEmail,
    category: params.category,
    subject: cleanSubject,
    message: cleanMessage,
    status: 'open',
    createdAt: now,
    updatedAt: now,
  };
  if (params.user?.uid) {
    payload.uid = params.user.uid;
  }

  try {
    const ref = await addDoc(collection(db, 'contact_submissions'), payload);
    if (params.user?.uid) {
      void dispatchDualNotification({
        recipientUid: params.user.uid,
        recipientName: cleanName,
        recipientEmail: cleanEmail,
        actor: params.user,
        type: 'support_ticket',
        category: 'admin',
        targetId: ref.id,
        allowSelfInApp: true,
        inAppPreview: `Ticket received (${params.category.replace(/_/g, ' ')}): ${cleanSubject}`,
        emailSubject: `Nexora Support Ticket Received: ${cleanSubject}`,
        emailBodyText: `Thank you for contacting Nexora Support (${params.category.replace(/_/g, ' ')}).\n\nSubject: ${cleanSubject}\n\nOur team will review your submission and update you.`,
      });
    } else {
      // Guest submission from landing page Support modal: attempt server email confirmation cleanly
      void fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: cleanEmail,
          recipientName: cleanName,
          subject: `Nexora Support Ticket Received: ${cleanSubject}`,
          title: 'Support Request Received',
          bodyText: `We received your ${params.category.replace(/_/g, ' ')} inquiry: "${cleanSubject}". Our support team will follow up shortly.`,
          category: 'admin',
        }),
      }).catch(() => {});
    }
    return ref.id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'contact_submissions');
  }
}

// --- Moderation / Reports & Blocking ---
export async function submitModerationReport(params: {
  reporterId: string;
  targetType: 'post' | 'user' | 'space' | 'vibe' | 'gift' | 'collab' | 'message';
  targetId: string;
  reason: string;
}): Promise<void> {
  try {
    await addDoc(collection(db, 'reports'), {
      reporterId: params.reporterId,
      targetType: params.targetType,
      targetId: sanitizeString(params.targetId, 128),
      reason: sanitizeString(params.reason, 300),
      status: 'open',
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'reports');
  }
}

export async function blockUserAccount(currentUid: string, targetUid: string, existingBlocked: string[]): Promise<string[]> {
  if (!currentUid || !targetUid || currentUid === targetUid) return existingBlocked;
  const next = Array.from(new Set([...existingBlocked, targetUid])).slice(0, 100);
  try {
    await updateDoc(doc(db, 'users', currentUid, 'private', 'account'), {
      blockedUserIds: next,
      updatedAt: serverTimestamp(),
    });
    return next;
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users/${currentUid}/private/account`);
  }
}

export async function unblockUserAccount(currentUid: string, targetUid: string, existingBlocked: string[]): Promise<string[]> {
  const next = existingBlocked.filter((id) => id !== targetUid);
  try {
    await updateDoc(doc(db, 'users', currentUid, 'private', 'account'), {
      blockedUserIds: next,
      updatedAt: serverTimestamp(),
    });
    return next;
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users/${currentUid}/private/account`);
  }
}

// --- Per-User Preferences (Pinned Chats, Muted Chats, Recent Searches & Homepage Customization) ---
export function subscribeUserPreferences(
  uid: string,
  callback: (prefs: UserPreferences) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, 'user_preferences', uid),
    (snap) => {
      if (snap.exists()) {
        const data = snap.data() as Partial<UserPreferences>;
        callback({
          uid,
          pinnedConvIds: Array.isArray(data.pinnedConvIds) ? data.pinnedConvIds : [],
          mutedConvIds: Array.isArray(data.mutedConvIds) ? data.mutedConvIds : [],
          recentSearches: Array.isArray(data.recentSearches) ? data.recentSearches : [],
          homepagePrefs: withHomepageCustomizationDefaults(data.homepagePrefs),
          ...(data.themeMode ? { themeMode: normalizeThemeMode(data.themeMode) } : {}),
          ...(typeof data.saveAiHistory === 'boolean' ? { saveAiHistory: data.saveAiHistory } : {}),
          updatedAt: data.updatedAt,
        });
      } else {
        callback({
          uid,
          pinnedConvIds: [],
          mutedConvIds: [],
          recentSearches: [],
          homepagePrefs: withHomepageCustomizationDefaults(),
        });
      }
    },
    () =>
      callback({
        uid,
        pinnedConvIds: [],
        mutedConvIds: [],
        recentSearches: [],
        homepagePrefs: withHomepageCustomizationDefaults(),
      })
  );
}

async function upsertUserPreferences(
  uid: string,
  current: UserPreferences | null | undefined,
  patch: Partial<
    Pick<
      UserPreferences,
      'pinnedConvIds' | 'mutedConvIds' | 'recentSearches' | 'homepagePrefs' | 'themeMode' | 'saveAiHistory'
    >
  >
): Promise<void> {
  const nextHomepage = patch.homepagePrefs ?? current?.homepagePrefs;
  const nextThemeMode = patch.themeMode ?? current?.themeMode;
  const nextSaveAiHistory =
    typeof patch.saveAiHistory === 'boolean' ? patch.saveAiHistory : current?.saveAiHistory;
  const nextPayload: Record<string, unknown> = {
    uid,
    pinnedConvIds: (patch.pinnedConvIds ?? current?.pinnedConvIds ?? []).slice(0, 30),
    mutedConvIds: (patch.mutedConvIds ?? current?.mutedConvIds ?? []).slice(0, 100),
    recentSearches: (patch.recentSearches ?? current?.recentSearches ?? []).slice(0, 20),
    updatedAt: serverTimestamp(),
  };
  if (nextHomepage) {
    nextPayload.homepagePrefs = withHomepageCustomizationDefaults(nextHomepage);
  }
  if (nextThemeMode) {
    nextPayload.themeMode = normalizeThemeMode(nextThemeMode);
  }
  if (typeof nextSaveAiHistory === 'boolean') {
    nextPayload.saveAiHistory = nextSaveAiHistory;
  }
  await setDoc(doc(db, 'user_preferences', uid), nextPayload);
}

export async function saveUserThemePreference(
  uid: string,
  currentPrefs: UserPreferences | null | undefined,
  themeMode: ThemeMode
): Promise<ThemeMode> {
  const normalized = normalizeThemeMode(themeMode);
  try {
    await upsertUserPreferences(uid, currentPrefs, { themeMode: normalized });
    return normalized;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `user_preferences/${uid}`);
  }
}

export async function saveHomepageCustomization(
  uid: string,
  currentPrefs: UserPreferences | null | undefined,
  nextHomepagePrefs: Partial<HomepageCustomization>
): Promise<HomepageCustomization> {
  const sanitized = withHomepageCustomizationDefaults(nextHomepagePrefs);
  try {
    await upsertUserPreferences(uid, currentPrefs, { homepagePrefs: sanitized });
    return sanitized;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `user_preferences/${uid}`);
  }
}

export async function togglePinConversation(
  uid: string,
  convId: string,
  currentPrefs: UserPreferences | null | undefined
): Promise<boolean> {
  const pinned = currentPrefs?.pinnedConvIds || [];
  const isPinned = pinned.includes(convId);
  const next = isPinned ? pinned.filter((id) => id !== convId) : [convId, ...pinned].slice(0, 30);
  try {
    await upsertUserPreferences(uid, currentPrefs, { pinnedConvIds: next });
    return !isPinned;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `user_preferences/${uid}`);
  }
}

export async function toggleMuteConversation(
  uid: string,
  convId: string,
  currentPrefs: UserPreferences | null | undefined
): Promise<boolean> {
  const muted = currentPrefs?.mutedConvIds || [];
  const isMuted = muted.includes(convId);
  const next = isMuted ? muted.filter((id) => id !== convId) : [convId, ...muted].slice(0, 100);
  try {
    await upsertUserPreferences(uid, currentPrefs, { mutedConvIds: next });
    return !isMuted;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `user_preferences/${uid}`);
  }
}

export async function saveRecentSearchTerm(
  uid: string,
  term: string,
  currentPrefs: UserPreferences | null | undefined
): Promise<void> {
  const clean = sanitizeString(term, 80);
  if (!clean) return;
  const existing = currentPrefs?.recentSearches || [];
  const next = [clean, ...existing.filter((item) => item.toLowerCase() !== clean.toLowerCase())].slice(0, 12);
  try {
    await upsertUserPreferences(uid, currentPrefs, { recentSearches: next });
  } catch {
    // Non-blocking search history sync
  }
}

export async function removeRecentSearchTerm(
  uid: string,
  term: string,
  currentPrefs: UserPreferences | null | undefined
): Promise<void> {
  const existing = currentPrefs?.recentSearches || [];
  const next = existing.filter((item) => item !== term);
  try {
    await upsertUserPreferences(uid, currentPrefs, { recentSearches: next });
  } catch {
    // Non-blocking search history sync
  }
}

export async function clearAllRecentSearches(
  uid: string,
  currentPrefs: UserPreferences | null | undefined
): Promise<void> {
  try {
    await upsertUserPreferences(uid, currentPrefs, { recentSearches: [] });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `user_preferences/${uid}`);
  }
}

