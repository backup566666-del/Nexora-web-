import {
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  sendEmailVerification,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  User,
} from 'firebase/auth';
import {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import {
  extractReadableErrorMessage,
  handleFirestoreError,
  OperationType,
  recordErrorDiagnostic,
} from '../firebase/errorHandler';
import { clearDeviceSession } from '../firebase/presenceService';
import { dispatchDualNotification } from '../notifications/notificationDispatcher';
import { PrivacySettings, UserPrivate, UserProfile } from '../../types/nexora';
import {
  BLUEPRINT_LIMITS,
  isValidUsername,
  normalizeUsername,
  sanitizeString,
  withPrivacyDefaults,
} from '../../utils/validation';

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

const PENDING_USERNAME_PREFIX = 'nexora_pending_username:';
const PRESENCE_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const AVATAR_URL_MAX_LEN = 200_000;
const COVER_URL_MAX_LEN = 400_000;
let activePersistenceMode: 'local' | 'session' = 'local';
const inFlightEnsureUserDocs = new Map<string, Promise<UserProfile>>();

function savePendingUsername(uid: string, username: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(`${PENDING_USERNAME_PREFIX}${uid}`, username);
    }
  } catch {
    // Ignore storage restriction errors in private browsing
  }
}

function peekPendingUsername(uid: string): string | undefined {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(`${PENDING_USERNAME_PREFIX}${uid}`) || undefined;
    }
  } catch {
    // Ignore storage restriction errors in private browsing
  }
  return undefined;
}

function clearPendingUsername(uid: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(`${PENDING_USERNAME_PREFIX}${uid}`);
    }
  } catch {
    // Ignore storage restriction errors
  }
}

export async function ensureVerifiedTokenClaims(user: User, forceRefresh = false): Promise<void> {
  if (!user.emailVerified) {
    throw new Error('Please verify your email address before creating your Nexora profile.');
  }
  let tokenResult = await user.getIdTokenResult(forceRefresh);
  if (tokenResult.claims.email_verified !== true) {
    await user.getIdToken(true);
    tokenResult = await user.getIdTokenResult(false);
  }
  if (tokenResult.claims.email_verified !== true) {
    throw new Error(
      'Your verified email token is still propagating. Please wait a moment and click Retry Sync.'
    );
  }
}

export function mapAuthErrorMessage(err: unknown): string {
  const code = (err as { code?: string })?.code ?? '';
  void recordErrorDiagnostic({ feature: 'auth', err, category: 'auth', errorCode: code || 'auth/error' });

  switch (code) {
    case 'auth/operation-not-allowed':
      return 'This sign-in method is currently unavailable. Please try another option.';
    case 'auth/unauthorized-domain':
      return 'Sign-in is temporarily unavailable from this address. Please contact support if this continues.';
    case 'auth/popup-blocked':
      return 'Your browser blocked the Google sign-in window. Please allow popups and try again.';
    case 'auth/cancelled-popup-request':
      return 'Google sign-in was cancelled before finishing. Please try again.';
    case 'auth/account-exists-with-different-credential':
      return 'An account already exists with this email using a different sign-in method. Sign in with your original method first.';
    case 'auth/email-already-in-use':
      return 'An account with this email address already exists.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters long.';
    case 'auth/user-disabled':
      return 'This account has been suspended or disabled. Please contact Nexora support.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Incorrect email or password. If you joined with Google, continue with Google or use Forgot password.';
    case 'auth/popup-closed-by-user':
      return 'Google sign-in window was closed before completing authorization.';
    case 'auth/id-token-expired':
    case 'auth/user-token-expired':
    case 'auth/requires-recent-login':
      return 'Your session has expired. Please sign in again.';
    case 'auth/network-request-failed':
      return 'Check your internet connection and try again.';
    case 'auth/too-many-requests':
      return 'Too many attempts right now. Please wait a moment and try again.';
    default:
      return extractReadableErrorMessage(err, 'Sign-in could not be completed. Please try again.', {
        feature: 'auth',
        recordDiagnostic: false,
      });
  }
}

export async function isUsernameAvailable(rawUsername: string, currentUid?: string): Promise<boolean> {
  const username = normalizeUsername(rawUsername);
  if (!isValidUsername(username)) return false;
  try {
    const snap = await getDoc(doc(db, 'usernames', username));
    if (!snap.exists()) return true;
    const data = snap.data() as { uid?: string };
    return Boolean(currentUid && data.uid === currentUid);
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `usernames/${username}`);
  }
}

export async function resolveUidByUsername(rawUsername: string): Promise<string | null> {
  const username = normalizeUsername(rawUsername);
  if (!isValidUsername(username)) return null;
  try {
    const snap = await getDoc(doc(db, 'usernames', username));
    if (!snap.exists()) return null;
    const data = snap.data() as { uid?: string };
    return data.uid || null;
  } catch {
    return null;
  }
}

export async function signInWithGoogle(rememberSession = true): Promise<User> {
  const targetPersistence = rememberSession ? 'local' : 'session';
  if (activePersistenceMode !== targetPersistence) {
    await setPersistence(
      auth,
      rememberSession ? browserLocalPersistence : browserSessionPersistence
    );
    activePersistenceMode = targetPersistence;
  }
  const credential = await signInWithPopup(auth, googleProvider);
  await ensureUserDocuments(credential.user);
  return credential.user;
}

export async function registerWithEmail(params: {
  fullName: string;
  username: string;
  email: string;
  password: string;
}): Promise<User> {
  const cleanName = sanitizeString(params.fullName, BLUEPRINT_LIMITS.DISPLAY_NAME_MAX);
  const cleanUsername = normalizeUsername(params.username);
  if (!cleanName) throw new Error('Full name is required.');
  if (!isValidUsername(cleanUsername)) {
    throw new Error('Username must be 3-30 characters using lowercase letters, numbers, or underscores.');
  }

  const available = await isUsernameAvailable(cleanUsername);
  if (!available) {
    throw new Error(`@${cleanUsername} is already taken. Please choose another username.`);
  }

  const credential = await createUserWithEmailAndPassword(auth, params.email.trim(), params.password);
  savePendingUsername(credential.user.uid, cleanUsername);
  await updateProfile(credential.user, { displayName: cleanName });
  await sendEmailVerification(credential.user);
  return credential.user;
}

export async function loginWithEmail(
  email: string,
  password: string,
  rememberSession: boolean
): Promise<User> {
  const targetPersistence = rememberSession ? 'local' : 'session';
  if (activePersistenceMode !== targetPersistence) {
    await setPersistence(
      auth,
      rememberSession ? browserLocalPersistence : browserSessionPersistence
    );
    activePersistenceMode = targetPersistence;
  }
  const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
  if (credential.user.emailVerified) {
    await ensureUserDocuments(credential.user);
  }
  return credential.user;
}

export async function resendVerificationEmail(user: User): Promise<void> {
  await sendEmailVerification(user);
}

export async function sendPasswordReset(email: string, actor?: UserProfile | null): Promise<void> {
  const cleanEmail = email.trim();
  await sendPasswordResetEmail(auth, cleanEmail);
  if (actor) {
    void dispatchDualNotification({
      recipientUid: actor.uid,
      recipientName: actor.displayName,
      recipientEmail: cleanEmail,
      actor,
      type: 'security_alert',
      category: 'security',
      targetId: 'settings:privacy',
      inAppPreview: 'Password reset link sent to your account email.',
      emailSubject: 'Nexora Security Notice: Password Reset Requested',
      emailBodyText:
        'A password reset request was initiated for your Nexora account. If you did not initiate this request, review your account security immediately.',
      ctaLabel: 'Review Security Settings',
      ctaUrl: '/',
      allowSelfInApp: true,
      dedupeKey: `pw_reset:${actor.uid}`,
    });
  }
}

export async function logoutUser(uid?: string): Promise<void> {
  if (uid && auth.currentUser?.emailVerified) {
    try {
      await clearDeviceSession(uid);
    } catch {
      // Fallback to direct user offline marker if presence doc not present
      try {
        await updateDoc(doc(db, 'users', uid), {
          isOnline: false,
          lastActiveAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch {
        // Proceed with signOut even if offline status update fails
      }
    }
  }
  await signOut(auth);
}

async function reserveUniqueUsername(uid: string, preferred: string): Promise<string> {
  let base = normalizeUsername(preferred);
  if (base.length < 3) base = `nexora_${uid.slice(0, 6).toLowerCase()}`;

  for (let attempt = 0; attempt < 6; attempt++) {
    const candidate =
      attempt === 0
        ? base
        : `${base.slice(0, 22)}_${Math.random().toString(36).slice(2, 6)}`;
    const ref = doc(db, 'usernames', candidate);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, { uid, createdAt: serverTimestamp() });
      return candidate;
    }
    if ((snap.data() as { uid?: string }).uid === uid) {
      return candidate;
    }
  }
  const fallback = `user_${uid.slice(0, 10).toLowerCase()}`;
  const fallbackRef = doc(db, 'usernames', fallback);
  const fallbackSnap = await getDoc(fallbackRef);
  if (!fallbackSnap.exists()) {
    await setDoc(fallbackRef, { uid, createdAt: serverTimestamp() });
  }
  return fallback;
}

export function ensureUserDocuments(
  user: User,
  preferredUsername?: string
): Promise<UserProfile> {
  const existingTask = inFlightEnsureUserDocs.get(user.uid);
  if (existingTask) {
    return existingTask;
  }

  const task = ensureUserDocumentsInternal(user, preferredUsername).finally(() => {
    inFlightEnsureUserDocs.delete(user.uid);
  });
  inFlightEnsureUserDocs.set(user.uid, task);
  return task;
}

async function ensureUserDocumentsInternal(
  user: User,
  preferredUsername?: string
): Promise<UserProfile> {
  await ensureVerifiedTokenClaims(user);

  const userRef = doc(db, 'users', user.uid);
  let snap;
  try {
    snap = await getDoc(userRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `users/${user.uid}`);
  }

  if (snap.exists()) {
    const existing = snap.data() as UserProfile;
    const privateRef = doc(db, 'users', user.uid, 'private', 'account');
    try {
      const privateSnap = await getDoc(privateRef);
      if (!privateSnap.exists()) {
        await setDoc(privateRef, {
          uid: user.uid,
          email: sanitizeString(user.email || '', 254),
          blockedUserIds: [] as string[],
          privacySettings: withPrivacyDefaults({
            profileVisibility: 'public',
            storyPrivacy: 'public',
            allowDMs: 'everyone',
            showOnlineStatus: true,
          }) satisfies PrivacySettings,
          updatedAt: serverTimestamp(),
        });
      }
    } catch {
      // Non-fatal if private doc check encounters transient error
    }

    const lastActiveMs = existing.lastActiveAt?.toMillis?.() ?? 0;
    const shouldRefreshPresence =
      !existing.isOnline || Date.now() - lastActiveMs > PRESENCE_REFRESH_INTERVAL_MS;

    if (shouldRefreshPresence) {
      try {
        await updateDoc(userRef, {
          isOnline: true,
          lastActiveAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        return { ...existing, isOnline: true };
      } catch {
        // Ignore transient online presence update errors
      }
    }
    return existing;
  }

  const pendingUsername = peekPendingUsername(user.uid);
  const rawDisplayName =
    sanitizeString(user.displayName || '', BLUEPRINT_LIMITS.DISPLAY_NAME_MAX) ||
    sanitizeString(user.email?.split('@')[0] || '', BLUEPRINT_LIMITS.DISPLAY_NAME_MAX) ||
    'Nexora Member';

  const username = await reserveUniqueUsername(
    user.uid,
    preferredUsername || pendingUsername || user.email?.split('@')[0] || rawDisplayName
  );

  const safeAvatarUrl =
    user.photoURL && user.photoURL.trim().length > 0 && user.photoURL.trim().length <= AVATAR_URL_MAX_LEN
      ? user.photoURL.trim()
      : '/src/assets/images/avatar_creator_one_1795066815825.jpg';

  const now = serverTimestamp();
  const profilePayload = {
    uid: user.uid,
    displayName: rawDisplayName,
    username,
    bio: '',
    avatarUrl: safeAvatarUrl,
    coverUrl: '/src/assets/images/space_cover_code_1795066815138.jpg',
    coverPositionY: 50,
    website: '',
    location: '',
    interests: [] as string[],
    verified: false,
    onboardingCompleted: false,
    followersCount: 0,
    followingCount: 0,
    postsCount: 0,
    likesCount: 0,
    isOnline: true,
    lastActiveAt: now,
    createdAt: now,
    updatedAt: now,
  };

  const privatePayload = {
    uid: user.uid,
    email: sanitizeString(user.email || '', 254),
    blockedUserIds: [] as string[],
    privacySettings: withPrivacyDefaults({
      profileVisibility: 'public',
      storyPrivacy: 'public',
      allowDMs: 'everyone',
      showOnlineStatus: true,
    }) satisfies PrivacySettings,
    updatedAt: now,
  };

  try {
    const batch = writeBatch(db);
    batch.set(userRef, profilePayload);
    batch.set(doc(db, 'users', user.uid, 'private', 'account'), privatePayload);
    await batch.commit();
    clearPendingUsername(user.uid);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`);
  }

  const freshSnap = await getDoc(userRef);
  return freshSnap.data() as UserProfile;
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    return snap.exists() ? (snap.data() as UserProfile) : null;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `users/${uid}`);
  }
}

export async function getUserPrivate(uid: string): Promise<UserPrivate | null> {
  try {
    const snap = await getDoc(doc(db, 'users', uid, 'private', 'account'));
    return snap.exists() ? (snap.data() as UserPrivate) : null;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `users/${uid}/private/account`);
  }
}

export async function updateUserProfileFields(
  uid: string,
  updates: Partial<{
    displayName: string;
    username: string;
    bio: string;
    avatarUrl: string;
    coverUrl: string;
    coverPositionY: number;
    website: string;
    location: string;
    interests: string[];
    onboardingCompleted: boolean;
  }>,
  previousUsername?: string
): Promise<void> {
  if (auth.currentUser) {
    if (auth.currentUser.uid !== uid) {
      throw new Error('You are not authorised to perform this action.');
    }
    await ensureVerifiedTokenClaims(auth.currentUser);
  }

  const sanitized: Record<string, unknown> = { updatedAt: serverTimestamp() };

  if (updates.displayName !== undefined) {
    const cleanDisplayName = sanitizeString(updates.displayName, BLUEPRINT_LIMITS.DISPLAY_NAME_MAX);
    if (!cleanDisplayName) {
      throw new Error('Display name cannot be empty.');
    }
    sanitized.displayName = cleanDisplayName;
  }

  let usernameClaimToCreate: string | null = null;
  let usernameClaimToDelete: string | null = null;

  if (updates.username !== undefined) {
    const nextUsername = normalizeUsername(updates.username);
    if (!isValidUsername(nextUsername)) {
      throw new Error('Username must be 3-30 lowercase alphanumeric or underscore characters.');
    }
    const cleanPrevious = previousUsername ? normalizeUsername(previousUsername) : undefined;
    if (nextUsername !== cleanPrevious) {
      const nextSnap = await getDoc(doc(db, 'usernames', nextUsername));
      if (nextSnap.exists()) {
        const ownerUid = (nextSnap.data() as { uid?: string }).uid;
        if (ownerUid !== uid) {
          throw new Error(`@${nextUsername} is already taken.`);
        }
      } else {
        usernameClaimToCreate = nextUsername;
      }

      if (cleanPrevious) {
        const prevSnap = await getDoc(doc(db, 'usernames', cleanPrevious));
        if (prevSnap.exists() && (prevSnap.data() as { uid?: string }).uid === uid) {
          usernameClaimToDelete = cleanPrevious;
        }
      }
      sanitized.username = nextUsername;
    }
  }

  if (updates.bio !== undefined) sanitized.bio = sanitizeString(updates.bio, BLUEPRINT_LIMITS.BIO_MAX);
  if (updates.avatarUrl !== undefined) {
    const trimmedAvatar = updates.avatarUrl.trim();
    if (trimmedAvatar.length > AVATAR_URL_MAX_LEN) {
      throw new Error('Profile photo is too large after encoding. Please choose a smaller image.');
    }
    sanitized.avatarUrl = trimmedAvatar;
  }
  if (updates.coverUrl !== undefined) {
    const trimmedCover = updates.coverUrl.trim();
    if (trimmedCover.length > COVER_URL_MAX_LEN) {
      throw new Error('Cover image is too large after encoding. Please choose a smaller image.');
    }
    sanitized.coverUrl = trimmedCover;
  }
  if (updates.coverPositionY !== undefined) {
    sanitized.coverPositionY = Math.max(0, Math.min(100, Math.round(updates.coverPositionY)));
  }
  if (updates.website !== undefined) sanitized.website = sanitizeString(updates.website, BLUEPRINT_LIMITS.WEBSITE_MAX);
  if (updates.location !== undefined) sanitized.location = sanitizeString(updates.location, BLUEPRINT_LIMITS.LOCATION_MAX);
  if (updates.interests !== undefined) {
    sanitized.interests = updates.interests.slice(0, BLUEPRINT_LIMITS.MAX_INTERESTS).map((s) => sanitizeString(s, 40)).filter(Boolean);
  }
  if (updates.onboardingCompleted !== undefined) {
    sanitized.onboardingCompleted = Boolean(updates.onboardingCompleted);
  }

  try {
    const batch = writeBatch(db);
    if (usernameClaimToCreate) {
      batch.set(doc(db, 'usernames', usernameClaimToCreate), {
        uid,
        createdAt: serverTimestamp(),
      });
    }
    batch.update(doc(db, 'users', uid), sanitized);
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users/${uid}`);
  }

  if (usernameClaimToDelete) {
    try {
      await deleteDoc(doc(db, 'usernames', usernameClaimToDelete));
    } catch {
      // Non-blocking cleanup if previous claim cannot be removed under active rules
    }
  }
}

export async function updateUserPrivacySettings(
  uid: string,
  privacySettings: PrivacySettings,
  blockedUserIds?: string[],
  actorContext?: { actor: UserProfile; email?: string }
): Promise<void> {
  const normalized = withPrivacyDefaults(privacySettings);
  const payload: Record<string, unknown> = {
    privacySettings: normalized,
    updatedAt: serverTimestamp(),
  };
  if (blockedUserIds !== undefined) {
    payload.blockedUserIds = blockedUserIds.slice(0, 100);
  }
  try {
    await updateDoc(doc(db, 'users', uid, 'private', 'account'), payload);
    if (normalized.showOnlineStatus === false) {
      await updateDoc(doc(db, 'users', uid), {
        isOnline: false,
        updatedAt: serverTimestamp(),
      });
    }
    if (actorContext?.actor) {
      void dispatchDualNotification({
        recipientUid: uid,
        recipientName: actorContext.actor.displayName,
        recipientEmail: actorContext.email,
        recipientPrivacy: normalized,
        actor: actorContext.actor,
        type: 'security_alert',
        category: 'security',
        targetId: 'settings:privacy',
        inAppPreview: 'Your privacy, tagging, and notification preferences were updated.',
        emailSubject: 'Nexora Security Notice: Privacy Preferences Updated',
        emailBodyText:
          'Your Nexora privacy, tagging, collaboration, and notification channel settings were updated.',
        ctaLabel: 'Open Privacy Settings',
        ctaUrl: '/',
        allowSelfInApp: true,
        dedupeKey: `privacy_update:${uid}:${Math.floor(Date.now() / 15000)}`,
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users/${uid}/private/account`);
  }
}

export function createPlaceholderTimestamp(): Timestamp {
  return Timestamp.now();
}
