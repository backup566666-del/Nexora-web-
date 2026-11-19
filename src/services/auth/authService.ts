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
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { handleFirestoreError, OperationType } from '../firebase/errorHandler';
import { PrivacySettings, UserPrivate, UserProfile } from '../../types/nexora';
import { BLUEPRINT_LIMITS, isValidUsername, normalizeUsername, sanitizeString } from '../../utils/validation';

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export function mapAuthErrorMessage(err: unknown): string {
  const code = (err as { code?: string })?.code ?? '';
  switch (code) {
    case 'auth/operation-not-allowed':
      return 'Email/Password sign-in is not yet enabled in the Firebase Console. Enable it under Authentication -> Sign-in method, or use Continue with Google.';
    case 'auth/email-already-in-use':
      return 'An account with this email address already exists.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters long.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Incorrect email or password. Please verify your credentials.';
    case 'auth/popup-closed-by-user':
      return 'Google sign-in window was closed before completing authorization.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment before trying again.';
    default:
      return err instanceof Error ? err.message : 'Authentication failed. Please try again.';
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

export async function signInWithGoogle(rememberSession = true): Promise<User> {
  await setPersistence(auth, rememberSession ? browserLocalPersistence : browserSessionPersistence);
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

  const credential = await createUserWithEmailAndPassword(auth, params.email.trim(), params.password);
  await updateProfile(credential.user, { displayName: cleanName });
  await sendEmailVerification(credential.user);
  return credential.user;
}

export async function loginWithEmail(
  email: string,
  password: string,
  rememberSession: boolean
): Promise<User> {
  await setPersistence(auth, rememberSession ? browserLocalPersistence : browserSessionPersistence);
  const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
  if (credential.user.emailVerified) {
    await ensureUserDocuments(credential.user);
  }
  return credential.user;
}

export async function resendVerificationEmail(user: User): Promise<void> {
  await sendEmailVerification(user);
}

export async function sendPasswordReset(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email.trim());
}

export async function logoutUser(uid?: string): Promise<void> {
  if (uid && auth.currentUser?.emailVerified) {
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
  await signOut(auth);
}

async function reserveUniqueUsername(uid: string, preferred: string): Promise<string> {
  let base = normalizeUsername(preferred);
  if (base.length < 3) base = `nexora_${uid.slice(0, 6).toLowerCase()}`;

  for (let attempt = 0; attempt < 5; attempt++) {
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
  await setDoc(doc(db, 'usernames', fallback), { uid, createdAt: serverTimestamp() });
  return fallback;
}

export async function ensureUserDocuments(
  user: User,
  preferredUsername?: string
): Promise<UserProfile> {
  if (!user.emailVerified) {
    throw new Error('Please verify your email address before creating your Nexora profile.');
  }

  const userRef = doc(db, 'users', user.uid);
  let snap;
  try {
    snap = await getDoc(userRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `users/${user.uid}`);
  }

  if (snap.exists()) {
    const existing = snap.data() as UserProfile;
    try {
      await updateDoc(userRef, {
        isOnline: true,
        lastActiveAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch {
      // Ignore transient online presence update errors
    }
    return existing;
  }

  const displayName = sanitizeString(
    user.displayName || user.email?.split('@')[0] || 'Nexora Member',
    BLUEPRINT_LIMITS.DISPLAY_NAME_MAX
  );
  const username = await reserveUniqueUsername(
    user.uid,
    preferredUsername || user.email?.split('@')[0] || displayName
  );

  const now = serverTimestamp();
  const profilePayload = {
    uid: user.uid,
    displayName,
    username,
    bio: '',
    avatarUrl: user.photoURL || '/src/assets/images/avatar_creator_one_1795066815825.jpg',
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
    privacySettings: {
      profileVisibility: 'public',
      storyPrivacy: 'public',
      allowDMs: 'everyone',
      showOnlineStatus: true,
    } satisfies PrivacySettings,
    updatedAt: now,
  };

  try {
    const batch = writeBatch(db);
    batch.set(userRef, profilePayload);
    batch.set(doc(db, 'users', user.uid, 'private', 'account'), privatePayload);
    await batch.commit();
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
  const sanitized: Record<string, unknown> = { updatedAt: serverTimestamp() };

  if (updates.displayName !== undefined) {
    sanitized.displayName = sanitizeString(updates.displayName, BLUEPRINT_LIMITS.DISPLAY_NAME_MAX);
  }
  if (updates.username !== undefined) {
    const nextUsername = normalizeUsername(updates.username);
    if (!isValidUsername(nextUsername)) {
      throw new Error('Username must be 3-30 lowercase alphanumeric or underscore characters.');
    }
    if (nextUsername !== previousUsername) {
      const available = await isUsernameAvailable(nextUsername, uid);
      if (!available) throw new Error(`@${nextUsername} is already taken.`);
      await setDoc(doc(db, 'usernames', nextUsername), {
        uid,
        createdAt: serverTimestamp(),
      });
    }
    sanitized.username = nextUsername;
  }
  if (updates.bio !== undefined) sanitized.bio = sanitizeString(updates.bio, BLUEPRINT_LIMITS.BIO_MAX);
  if (updates.avatarUrl !== undefined) sanitized.avatarUrl = sanitizeString(updates.avatarUrl, 200000);
  if (updates.coverUrl !== undefined) sanitized.coverUrl = sanitizeString(updates.coverUrl, 400000);
  if (updates.coverPositionY !== undefined) {
    sanitized.coverPositionY = Math.max(0, Math.min(100, Math.round(updates.coverPositionY)));
  }
  if (updates.website !== undefined) sanitized.website = sanitizeString(updates.website, BLUEPRINT_LIMITS.WEBSITE_MAX);
  if (updates.location !== undefined) sanitized.location = sanitizeString(updates.location, BLUEPRINT_LIMITS.LOCATION_MAX);
  if (updates.interests !== undefined) {
    sanitized.interests = updates.interests.slice(0, BLUEPRINT_LIMITS.MAX_INTERESTS).map((s) => sanitizeString(s, 40));
  }
  if (updates.onboardingCompleted !== undefined) {
    sanitized.onboardingCompleted = Boolean(updates.onboardingCompleted);
  }

  try {
    await updateDoc(doc(db, 'users', uid), sanitized);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users/${uid}`);
  }
}

export async function updateUserPrivacySettings(
  uid: string,
  privacySettings: PrivacySettings,
  blockedUserIds?: string[]
): Promise<void> {
  const payload: Record<string, unknown> = {
    privacySettings,
    updatedAt: serverTimestamp(),
  };
  if (blockedUserIds !== undefined) {
    payload.blockedUserIds = blockedUserIds.slice(0, 100);
  }
  try {
    await updateDoc(doc(db, 'users', uid, 'private', 'account'), payload);
    if (privacySettings.showOnlineStatus === false) {
      await updateDoc(doc(db, 'users', uid), {
        isOnline: false,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users/${uid}/private/account`);
  }
}

export function createPlaceholderTimestamp(): Timestamp {
  return Timestamp.now();
}
