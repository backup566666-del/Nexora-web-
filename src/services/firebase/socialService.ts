import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  Unsubscribe,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from './config';
import { handleFirestoreError, OperationType } from './errorHandler';
import {
  AudienceType,
  ChatMessage,
  Conversation,
  MessageType,
  NotificationItem,
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
  UserProfile,
  Vibe,
} from '../../types/nexora';
import {
  BLUEPRINT_LIMITS,
  extractHashtags,
  extractMentions,
  sanitizeString,
} from '../../utils/validation';

// --- Notifications Helper ---
export async function createNotification(params: {
  recipientId: string;
  actor: UserProfile;
  type: NotificationType;
  targetId?: string;
  preview?: string;
}): Promise<void> {
  if (params.recipientId === params.actor.uid) return;
  try {
    await addDoc(collection(db, 'notifications'), {
      recipientId: params.recipientId,
      actorId: params.actor.uid,
      actorName: sanitizeString(params.actor.displayName, 80),
      actorAvatar: sanitizeString(params.actor.avatarUrl || '', 200000),
      type: params.type,
      targetId: sanitizeString(params.targetId || '', 128),
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
    limit(40)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<NotificationItem, 'id'>) }))
        .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
      callback(items);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, 'notifications')
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
    const batch = writeBatch(db);
    unread.slice(0, 25).forEach((item) => {
      batch.update(doc(db, 'notifications', item.id), { read: true });
    });
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, 'notifications');
  }
}

// --- Users & Directory ---
export function subscribeDirectoryUsers(callback: (users: UserProfile[]) => void): Unsubscribe {
  const q = query(
    collection(db, 'users'),
    where('onboardingCompleted', '==', true),
    limit(50)
  );
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => d.data() as UserProfile)),
    (error) => handleFirestoreError(error, OperationType.LIST, 'users')
  );
}

export async function checkIsFollowing(currentUid: string, targetUid: string): Promise<boolean> {
  try {
    const snap = await getDoc(doc(db, 'users', currentUid, 'following', targetUid));
    return snap.exists();
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `users/${currentUid}/following/${targetUid}`);
  }
}

export async function toggleFollowUser(
  currentUser: UserProfile,
  targetUser: UserProfile,
  currentlyFollowing: boolean
): Promise<boolean> {
  const followingRef = doc(db, 'users', currentUser.uid, 'following', targetUser.uid);
  const followerRef = doc(db, 'users', targetUser.uid, 'followers', currentUser.uid);
  try {
    const batch = writeBatch(db);
    if (currentlyFollowing) {
      batch.delete(followingRef);
      batch.delete(followerRef);
      batch.update(doc(db, 'users', currentUser.uid), {
        followingCount: increment(-1),
        updatedAt: serverTimestamp(),
      });
      batch.update(doc(db, 'users', targetUser.uid), {
        followersCount: increment(-1),
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      return false;
    } else {
      batch.set(followingRef, { uid: targetUser.uid, createdAt: serverTimestamp() });
      batch.set(followerRef, { uid: currentUser.uid, createdAt: serverTimestamp() });
      batch.update(doc(db, 'users', currentUser.uid), {
        followingCount: increment(1),
        updatedAt: serverTimestamp(),
      });
      batch.update(doc(db, 'users', targetUser.uid), {
        followersCount: increment(1),
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      await createNotification({
        recipientId: targetUser.uid,
        actor: currentUser,
        type: 'follow',
        targetId: currentUser.uid,
        preview: `${currentUser.displayName} started following you`,
      });
      return true;
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `users/${targetUser.uid}/followers`);
  }
}

// --- Posts & Feed ---
export function subscribeFeedPosts(
  callback: (posts: Post[]) => void,
  spaceId?: string
): Unsubscribe {
  const q = query(
    collection(db, 'posts'),
    where('audience', 'in', ['public', 'followers', 'space']),
    limit(60)
  );

  return onSnapshot(
    q,
    (snap) => {
      let items = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<Post, 'id'>) }))
        .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
      if (spaceId) {
        items = items.filter((p) => p.spaceId === spaceId);
      }
      callback(items);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, 'posts')
  );
}

export function subscribePublicLandingPosts(callback: (posts: Post[]) => void): Unsubscribe {
  const q = query(
    collection(db, 'posts'),
    where('audience', '==', 'public'),
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
}): Promise<string> {
  const cleanText = sanitizeString(params.text, BLUEPRINT_LIMITS.POST_TEXT_MAX);
  const pollOpts = (params.pollOptions || [])
    .map((o) => sanitizeString(o, 100))
    .filter(Boolean)
    .slice(0, 4);

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
    mediaUrls: (params.mediaUrls || []).slice(0, 4),
    mediaTypes: (params.mediaTypes || []).slice(0, 4),
    hashtags: extractHashtags(cleanText),
    mentions: extractMentions(cleanText),
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
    return docRef.id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'posts');
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
    (error) => handleFirestoreError(error, OperationType.LIST, `users/${uid}/saved`)
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
    (error) => handleFirestoreError(error, OperationType.LIST, `posts/${postId}/comments`)
  );
}

export async function addPostComment(params: {
  post: Post;
  author: UserProfile;
  text: string;
  parentCommentId?: string;
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
    await createNotification({
      recipientId: params.post.authorId,
      actor: params.author,
      type: 'comment',
      targetId: params.post.id,
      preview: clean.slice(0, 80),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `posts/${params.post.id}/comments`);
  }
}

// --- Stories ---
export function subscribeStories(callback: (stories: Story[]) => void): Unsubscribe {
  const q = query(
    collection(db, 'stories'),
    where('privacy', 'in', ['public', 'followers', 'close']),
    limit(40)
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
    (error) => handleFirestoreError(error, OperationType.LIST, 'stories')
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
    limit(30)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<Vibe, 'id'>) }))
        .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
      callback(items);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, 'vibes')
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
    (error) => handleFirestoreError(error, OperationType.LIST, `vibes/${vibeId}/comments`)
  );
}

// --- Spaces (Communities) ---
export function subscribeSpaces(callback: (spaces: Space[]) => void): Unsubscribe {
  const q = query(
    collection(db, 'spaces'),
    where('isPrivate', 'in', [false, true]),
    limit(40)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<Space, 'id'>) }))
        .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
      callback(items);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, 'spaces')
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
  return onSnapshot(
    collection(db, 'spaces', spaceId, 'members'),
    (snap) => callback(snap.docs.map((d) => d.data() as SpaceMember)),
    (error) => handleFirestoreError(error, OperationType.LIST, `spaces/${spaceId}/members`)
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
}): Promise<void> {
  const clean = sanitizeString(params.text, 1000);
  if (!clean) return;
  try {
    await addDoc(collection(db, 'spaces', params.spaceId, 'discussions'), {
      authorId: params.author.uid,
      authorName: sanitizeString(params.author.displayName, 80),
      authorAvatar: sanitizeString(params.author.avatarUrl || '', 200000),
      text: clean,
      channel: sanitizeString(params.channel, 40),
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
    (error) => handleFirestoreError(error, OperationType.LIST, `spaces/${spaceId}/events`)
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
export function subscribeConversations(
  uid: string,
  callback: (convs: Conversation[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'conversations'),
    where('participantIds', 'array-contains', uid),
    limit(40)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<Conversation, 'id'>) }))
        .sort((a, b) => (b.updatedAt?.toMillis?.() ?? 0) - (a.updatedAt?.toMillis?.() ?? 0));
      callback(items);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, 'conversations')
  );
}

export async function createOrGetDirectConversation(
  currentUser: UserProfile,
  targetUser: UserProfile
): Promise<string> {
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
    (error) => handleFirestoreError(error, OperationType.LIST, `conversations/${convId}/messages`)
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
}): Promise<void> {
  const cleanText = sanitizeString(params.text, BLUEPRINT_LIMITS.CHAT_MESSAGE_MAX);
  try {
    await addDoc(collection(db, 'conversations', params.convId, 'messages'), {
      senderId: params.sender.uid,
      senderName: sanitizeString(params.sender.displayName, 80),
      type: params.type,
      text: cleanText,
      mediaUrl: sanitizeString(params.mediaUrl || '', 500000),
      fileName: sanitizeString(params.fileName || '', 120),
      replyToId: sanitizeString(params.replyToId || '', 128),
      replyToText: sanitizeString(params.replyToText || '', 200),
      reactions: {},
      edited: false,
      deleted: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    const preview =
      cleanText ||
      (params.type === 'image'
        ? 'Sent an image'
        : params.type === 'video'
        ? 'Sent a video'
        : params.type === 'voice'
        ? 'Sent a voice note'
        : 'Sent a document');
    await updateDoc(doc(db, 'conversations', params.convId), {
      lastMessageText: sanitizeString(preview, 300),
      lastMessageSenderId: params.sender.uid,
      lastMessageAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    for (const rId of params.recipientIds || []) {
      if (rId !== params.sender.uid) {
        await createNotification({
          recipientId: rId,
          actor: params.sender,
          type: 'message',
          targetId: params.convId,
          preview: preview.slice(0, 80),
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
  isTyping: boolean
): Promise<void> {
  try {
    await updateDoc(doc(db, 'conversations', convId), {
      [`typingBy.${uid}`]: isTyping ? Timestamp.now() : Timestamp.fromMillis(0),
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

// --- Moderation / Reports ---
export async function submitModerationReport(params: {
  reporterId: string;
  targetType: 'post' | 'user' | 'space' | 'vibe';
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
