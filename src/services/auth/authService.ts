import {
  AuthCredential,
  browserLocalPersistence,
  browserSessionPersistence,
  ConfirmationResult,
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  FacebookAuthProvider,
  fetchSignInMethodsForEmail,
  GithubAuthProvider,
  GoogleAuthProvider,
  linkWithCredential,
  linkWithPhoneNumber,
  linkWithPopup,
  OAuthProvider,
  RecaptchaVerifier,
  sendEmailVerification,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPhoneNumber,
  signInWithPopup,
  signOut,
  unlink,
  updateProfile,
  User,
  verifyBeforeUpdateEmail,
} from 'firebase/auth';
import { FirebaseError } from 'firebase/app';
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

export type OAuthProviderId =
  | 'google.com'
  | 'github.com'
  | 'apple.com'
  | 'microsoft.com'
  | 'facebook.com';

export type AuthProviderMethod = OAuthProviderId | 'phone' | 'password';

export interface AuthProviderInfo {
  id: AuthProviderMethod;
  label: string;
  buttonText: string;
  shortName: string;
  category: 'oauth' | 'sms_otp' | 'email_password';
  requiresExternalCredentials: boolean;
}

export const AUTH_PROVIDER_LIST: AuthProviderInfo[] = [
  {
    id: 'google.com',
    label: 'Google',
    buttonText: 'Continue with Google',
    shortName: 'Google',
    category: 'oauth',
    requiresExternalCredentials: false,
  },
  {
    id: 'github.com',
    label: 'GitHub',
    buttonText: 'Continue with GitHub',
    shortName: 'GitHub',
    category: 'oauth',
    requiresExternalCredentials: true,
  },
  {
    id: 'apple.com',
    label: 'Apple',
    buttonText: 'Continue with Apple',
    shortName: 'Apple',
    category: 'oauth',
    requiresExternalCredentials: true,
  },
  {
    id: 'microsoft.com',
    label: 'Microsoft',
    buttonText: 'Continue with Microsoft',
    shortName: 'Microsoft',
    category: 'oauth',
    requiresExternalCredentials: true,
  },
  {
    id: 'facebook.com',
    label: 'Facebook',
    buttonText: 'Continue with Facebook',
    shortName: 'Facebook',
    category: 'oauth',
    requiresExternalCredentials: true,
  },
  {
    id: 'phone',
    label: 'Phone Number',
    buttonText: 'Continue with Phone Number',
    shortName: 'Phone',
    category: 'sms_otp',
    requiresExternalCredentials: false,
  },
  {
    id: 'password',
    label: 'Email & Password',
    buttonText: 'Continue with Email',
    shortName: 'Email',
    category: 'email_password',
    requiresExternalCredentials: false,
  },
];

export interface ServerProviderStatusItem {
  id: AuthProviderMethod;
  label: string;
  type: 'oauth' | 'sms_otp' | 'email_password';
  provisionedInConfig: boolean;
  requiresExternalCredentials: boolean;
  setupNote: string;
}

export interface ServerAuthProvidersResponse {
  projectId: string;
  authDomain: string;
  callbackUrl: string;
  providers: ServerProviderStatusItem[];
}

export interface PendingAccountLinkInfo {
  email: string;
  attemptedProvider: OAuthProviderId;
  existingMethods: string[];
  pendingCredential: AuthCredential;
}

export class PendingAccountLinkError extends Error {
  readonly code = 'nexora/account-link-required';
  readonly info: PendingAccountLinkInfo;

  constructor(message: string, info: PendingAccountLinkInfo) {
    super(message);
    this.name = 'PendingAccountLinkError';
    this.info = info;
  }
}

export function isPendingAccountLinkError(err: unknown): err is PendingAccountLinkError {
  return (
    err instanceof PendingAccountLinkError ||
    (typeof err === 'object' &&
      err !== null &&
      (err as { code?: string }).code === 'nexora/account-link-required')
  );
}

export interface PhoneOtpSession {
  confirmationResult: ConfirmationResult;
  e164Phone: string;
  sentAtMs: number;
  expiresAtMs: number;
}

export const PHONE_OTP_EXPIRY_MS = 5 * 60 * 1000;
export const PHONE_OTP_RESEND_COOLDOWN_SEC = 60;

const PENDING_USERNAME_PREFIX = 'nexora_pending_username:';
const PENDING_DISPLAYNAME_PREFIX = 'nexora_pending_name:';
const PRESENCE_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const AVATAR_URL_MAX_LEN = 200_000;
const COVER_URL_MAX_LEN = 400_000;
let activePersistenceMode: 'local' | 'session' = 'local';
let activeRecaptchaVerifier: RecaptchaVerifier | null = null;
const inFlightEnsureUserDocs = new Map<string, Promise<UserProfile>>();

function buildOAuthProvider(providerId: OAuthProviderId) {
  switch (providerId) {
    case 'google.com': {
      const p = new GoogleAuthProvider();
      p.setCustomParameters({ prompt: 'select_account' });
      return p;
    }
    case 'github.com': {
      const p = new GithubAuthProvider();
      p.addScope('read:user');
      p.addScope('user:email');
      p.setCustomParameters({ allow_signup: 'true' });
      return p;
    }
    case 'apple.com': {
      const p = new OAuthProvider('apple.com');
      p.addScope('email');
      p.addScope('name');
      return p;
    }
    case 'microsoft.com': {
      const p = new OAuthProvider('microsoft.com');
      p.addScope('User.Read');
      p.setCustomParameters({ prompt: 'select_account' });
      return p;
    }
    case 'facebook.com': {
      const p = new FacebookAuthProvider();
      p.addScope('email');
      p.addScope('public_profile');
      return p;
    }
  }
}

export function getProviderLabel(providerId: string): string {
  const match = AUTH_PROVIDER_LIST.find((p) => p.id === providerId);
  return match ? match.label : 'Account';
}

function extractCredentialFromConflictError(
  providerId: OAuthProviderId,
  err: unknown
): AuthCredential | null {
  try {
    const fbErr = err as FirebaseError;
    switch (providerId) {
      case 'google.com':
        return GoogleAuthProvider.credentialFromError(fbErr);
      case 'github.com':
        return GithubAuthProvider.credentialFromError(fbErr);
      case 'facebook.com':
        return FacebookAuthProvider.credentialFromError(fbErr);
      case 'apple.com':
      case 'microsoft.com':
        return OAuthProvider.credentialFromError(fbErr);
    }
  } catch {
    return null;
  }
}

async function applyAuthPersistence(rememberSession: boolean): Promise<void> {
  const targetPersistence = rememberSession ? 'local' : 'session';
  if (activePersistenceMode !== targetPersistence) {
    await setPersistence(
      auth,
      rememberSession ? browserLocalPersistence : browserSessionPersistence
    );
    activePersistenceMode = targetPersistence;
  }
}

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

function savePendingDisplayName(uid: string, displayName: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(`${PENDING_DISPLAYNAME_PREFIX}${uid}`, displayName);
    }
  } catch {
    // Ignore storage restriction errors
  }
}

function peekPendingDisplayName(uid: string): string | undefined {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(`${PENDING_DISPLAYNAME_PREFIX}${uid}`) || undefined;
    }
  } catch {
    // Ignore storage restriction errors
  }
  return undefined;
}

function clearPendingRegistrationHints(uid: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(`${PENDING_USERNAME_PREFIX}${uid}`);
      window.localStorage.removeItem(`${PENDING_DISPLAYNAME_PREFIX}${uid}`);
    }
  } catch {
    // Ignore storage restriction errors
  }
}

export function isUserAccountVerified(user: User | null | undefined): boolean {
  if (!user) return false;
  if (user.emailVerified) return true;
  const hasPhone =
    Boolean(user.phoneNumber && user.phoneNumber.trim().length >= 7) &&
    user.providerData.some((p) => p?.providerId === 'phone');
  if (hasPhone && !user.email) {
    return true;
  }
  return false;
}

export async function ensureVerifiedTokenClaims(user: User, forceRefresh = false): Promise<void> {
  if (!isUserAccountVerified(user)) {
    throw new Error('Please verify your email address or phone number before entering Nexora.');
  }
  let tokenResult = await user.getIdTokenResult(forceRefresh);
  const hasEmailVerifiedClaim = tokenResult.claims.email_verified === true;
  const hasPhoneClaim =
    typeof tokenResult.claims.phone_number === 'string' &&
    tokenResult.claims.phone_number.length >= 7;

  if (!hasEmailVerifiedClaim && !hasPhoneClaim) {
    await user.getIdToken(true);
    tokenResult = await user.getIdTokenResult(false);
  }

  const verifiedAfterRefresh =
    tokenResult.claims.email_verified === true ||
    (typeof tokenResult.claims.phone_number === 'string' &&
      tokenResult.claims.phone_number.length >= 7);

  if (!verifiedAfterRefresh) {
    throw new Error(
      'Your verification status is still syncing. Please wait a moment and try again.'
    );
  }
}

export function normalizeE164Phone(dialCode: string, localNumber: string): string {
  const rawInput = localNumber.trim();
  if (rawInput.startsWith('+')) {
    const cleaned = '+' + rawInput.slice(1).replace(/\D/g, '');
    return cleaned;
  }
  const cleanDial = '+' + dialCode.replace(/\D/g, '');
  const cleanLocal = rawInput.replace(/\D/g, '').replace(/^0+/, '');
  return `${cleanDial}${cleanLocal}`;
}

export function validateE164Phone(phone: string): boolean {
  return /^\+[1-9]\d{6,14}$/.test(phone.trim());
}

export function maskPhoneNumber(e164: string): string {
  if (e164.length <= 6) return e164;
  return `${e164.slice(0, 3)} •••• ${e164.slice(-4)}`;
}

export function mapAuthErrorMessage(err: unknown): string {
  if (isPendingAccountLinkError(err)) {
    return err.message;
  }
  const code = (err as { code?: string })?.code ?? '';
  void recordErrorDiagnostic({ feature: 'auth', err, category: 'auth', errorCode: code || 'auth/error' });

  switch (code) {
    case 'auth/operation-not-allowed':
      return 'This sign-in method is not enabled yet. Please try another option or contact support.';
    case 'auth/unauthorized-domain':
      return 'Sign-in is temporarily unavailable from this address. Please contact support if this continues.';
    case 'auth/popup-blocked':
      return 'Your browser blocked the sign-in popup window. Please allow popups and try again.';
    case 'auth/cancelled-popup-request':
      return 'Sign-in was cancelled before finishing. Please try again.';
    case 'auth/popup-closed-by-user':
      return 'The sign-in window was closed before completing authorization.';
    case 'auth/account-exists-with-different-credential':
      return 'An account already exists with this email using a different sign-in method. Sign in with your original method first to link them.';
    case 'auth/credential-already-in-use':
      return 'This sign-in account or phone number is already connected to another Nexora account.';
    case 'auth/provider-already-linked':
      return 'This sign-in method is already connected to your Nexora account.';
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
      return 'Incorrect email or password. If you joined with a connected provider or phone number, use that option or Forgot password.';
    case 'auth/invalid-phone-number':
    case 'auth/missing-phone-number':
      return 'Please enter a valid phone number including your country code.';
    case 'auth/invalid-verification-code':
    case 'auth/missing-verification-code':
      return 'The verification code is incorrect. Check your SMS and try again.';
    case 'auth/code-expired':
    case 'auth/session-expired':
      return 'Your SMS verification code has expired. Request a new code and try again.';
    case 'auth/captcha-check-failed':
    case 'auth/missing-app-credential':
    case 'auth/invalid-app-credential':
      return 'Security verification could not be completed. Refresh and try again.';
    case 'auth/quota-exceeded':
      return 'SMS verification limit reached temporarily. Please try again shortly or use another sign-in option.';
    case 'auth/id-token-expired':
    case 'auth/user-token-expired':
    case 'auth/requires-recent-login':
      return 'Your session has expired. Please sign in again to continue.';
    case 'auth/network-request-failed':
      return "You're offline. Check your internet connection and try again.";
    case 'auth/too-many-requests':
      return 'Too many attempts right now. Please wait a moment and try again.';
    default:
      return extractReadableErrorMessage(err, 'Sign-in could not be completed. Please try again.', {
        feature: 'auth',
        recordDiagnostic: false,
      });
  }
}

export async function fetchServerAuthProviders(): Promise<ServerAuthProvidersResponse | null> {
  try {
    const res = await fetch('/api/auth/providers', { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as ServerAuthProvidersResponse;
  } catch {
    return null;
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

export async function signInWithOAuthProvider(
  providerId: OAuthProviderId,
  rememberSession = true,
  options?: {
    preferredUsername?: string;
    preferredFullName?: string;
    pendingCredentialToLink?: AuthCredential | null;
  }
): Promise<User> {
  await applyAuthPersistence(rememberSession);
  const provider = buildOAuthProvider(providerId);

  try {
    const credential = await signInWithPopup(auth, provider);
    if (options?.pendingCredentialToLink) {
      try {
        await linkWithCredential(credential.user, options.pendingCredentialToLink);
      } catch {
        // Non-fatal if already linked or credential expired
      }
    }

    const cleanName = options?.preferredFullName
      ? sanitizeString(options.preferredFullName, BLUEPRINT_LIMITS.DISPLAY_NAME_MAX)
      : '';
    if (cleanName && !credential.user.displayName) {
      await updateProfile(credential.user, { displayName: cleanName }).catch(() => {});
    }
    if (options?.preferredUsername) {
      const normalized = normalizeUsername(options.preferredUsername);
      if (isValidUsername(normalized)) {
        savePendingUsername(credential.user.uid, normalized);
      }
    }
    if (cleanName) {
      savePendingDisplayName(credential.user.uid, cleanName);
    }

    if (isUserAccountVerified(credential.user)) {
      await ensureUserDocuments(credential.user, options?.preferredUsername);
    } else if (credential.user.email && !credential.user.emailVerified) {
      await sendEmailVerification(credential.user).catch(() => {});
    }
    return credential.user;
  } catch (err) {
    const code = (err as { code?: string })?.code ?? '';
    if (code === 'auth/account-exists-with-different-credential') {
      const pendingCredential = extractCredentialFromConflictError(providerId, err);
      const conflictEmail =
        ((err as { customData?: { email?: string } })?.customData?.email || '').trim();
      if (pendingCredential && conflictEmail) {
        let existingMethods: string[] = [];
        try {
          existingMethods = await fetchSignInMethodsForEmail(auth, conflictEmail);
        } catch {
          existingMethods = [];
        }
        throw new PendingAccountLinkError(
          `An account already exists for ${conflictEmail} using a different sign-in method. Sign in with your existing method below to link ${getProviderLabel(providerId)}.`,
          {
            email: conflictEmail,
            attemptedProvider: providerId,
            existingMethods,
            pendingCredential,
          }
        );
      }
    }
    throw err;
  }
}

export async function signInWithGoogle(rememberSession = true): Promise<User> {
  return signInWithOAuthProvider('google.com', rememberSession);
}

export function clearPhoneRecaptcha(): void {
  if (activeRecaptchaVerifier) {
    try {
      activeRecaptchaVerifier.clear();
    } catch {
      // Ignore already cleared verifier
    }
    activeRecaptchaVerifier = null;
  }
}

async function getOrCreateRecaptchaVerifier(containerId: string): Promise<RecaptchaVerifier> {
  clearPhoneRecaptcha();
  const containerEl = typeof document !== 'undefined' ? document.getElementById(containerId) : null;
  if (containerEl) {
    containerEl.innerHTML = '';
  }
  const verifier = new RecaptchaVerifier(auth, containerId, {
    size: 'invisible',
  });
  activeRecaptchaVerifier = verifier;
  return verifier;
}

export async function sendPhoneOtp(params: {
  phoneNumber: string;
  containerId: string;
  rememberSession?: boolean;
}): Promise<PhoneOtpSession> {
  const e164Phone = params.phoneNumber.trim();
  if (!validateE164Phone(e164Phone)) {
    throw new Error('Please enter a valid phone number including your country code (for example +1 555 234 5678).');
  }
  await applyAuthPersistence(params.rememberSession ?? true);
  const verifier = await getOrCreateRecaptchaVerifier(params.containerId);
  try {
    const confirmationResult = await signInWithPhoneNumber(auth, e164Phone, verifier);
    const sentAtMs = Date.now();
    return {
      confirmationResult,
      e164Phone,
      sentAtMs,
      expiresAtMs: sentAtMs + PHONE_OTP_EXPIRY_MS,
    };
  } catch (err) {
    clearPhoneRecaptcha();
    throw err;
  }
}

export async function confirmPhoneOtp(params: {
  session: PhoneOtpSession;
  code: string;
  fullName?: string;
  username?: string;
  pendingCredentialToLink?: AuthCredential | null;
}): Promise<User> {
  const cleanCode = params.code.replace(/\D/g, '');
  if (cleanCode.length !== 6) {
    throw new Error('Please enter the 6-digit SMS verification code.');
  }
  if (Date.now() > params.session.expiresAtMs) {
    throw new Error('Your verification code has expired. Please request a new SMS code.');
  }

  const credential = await params.session.confirmationResult.confirm(cleanCode);
  clearPhoneRecaptcha();

  if (params.pendingCredentialToLink) {
    try {
      await linkWithCredential(credential.user, params.pendingCredentialToLink);
    } catch {
      // Non-fatal if already linked
    }
  }

  const cleanName = params.fullName
    ? sanitizeString(params.fullName, BLUEPRINT_LIMITS.DISPLAY_NAME_MAX)
    : '';
  if (cleanName && !credential.user.displayName) {
    await updateProfile(credential.user, { displayName: cleanName }).catch(() => {});
  }
  if (cleanName) {
    savePendingDisplayName(credential.user.uid, cleanName);
  }
  if (params.username) {
    const normalized = normalizeUsername(params.username);
    if (isValidUsername(normalized)) {
      savePendingUsername(credential.user.uid, normalized);
    }
  }

  await ensureUserDocuments(credential.user, params.username);
  return credential.user;
}

export async function sendPhoneLinkOtp(params: {
  phoneNumber: string;
  containerId: string;
}): Promise<PhoneOtpSession> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Please sign in first before linking a phone number.');
  }
  const e164Phone = params.phoneNumber.trim();
  if (!validateE164Phone(e164Phone)) {
    throw new Error('Please enter a valid phone number including your country code.');
  }
  const verifier = await getOrCreateRecaptchaVerifier(params.containerId);
  try {
    const confirmationResult = await linkWithPhoneNumber(currentUser, e164Phone, verifier);
    const sentAtMs = Date.now();
    return {
      confirmationResult,
      e164Phone,
      sentAtMs,
      expiresAtMs: sentAtMs + PHONE_OTP_EXPIRY_MS,
    };
  } catch (err) {
    clearPhoneRecaptcha();
    throw err;
  }
}

export async function confirmPhoneLinkOtp(params: {
  session: PhoneOtpSession;
  code: string;
}): Promise<User> {
  const cleanCode = params.code.replace(/\D/g, '');
  if (cleanCode.length !== 6) {
    throw new Error('Please enter the 6-digit SMS verification code.');
  }
  if (Date.now() > params.session.expiresAtMs) {
    throw new Error('Your verification code has expired. Please request a new SMS code.');
  }
  const credential = await params.session.confirmationResult.confirm(cleanCode);
  clearPhoneRecaptcha();
  await credential.user.reload();
  await credential.user.getIdToken(true);
  return credential.user;
}

export async function linkOAuthProviderToCurrentUser(providerId: OAuthProviderId): Promise<User> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Please sign in before connecting another authentication method.');
  }
  const provider = buildOAuthProvider(providerId);
  const result = await linkWithPopup(currentUser, provider);
  await result.user.reload();
  await result.user.getIdToken(true);
  return result.user;
}

export async function linkEmailPasswordToCurrentUser(email: string, password: string): Promise<User> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Please sign in before adding an email & password.');
  }
  const cleanEmail = email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    throw new Error('Please enter a valid email address.');
  }
  if (password.length < 6) {
    throw new Error('Password must be at least 6 characters long.');
  }
  const cred = EmailAuthProvider.credential(cleanEmail, password);
  const result = await linkWithCredential(currentUser, cred);
  if (!result.user.emailVerified) {
    await sendEmailVerification(result.user).catch(() => {});
  }
  await result.user.reload();
  return result.user;
}

export async function unlinkProviderFromCurrentUser(providerId: AuthProviderMethod): Promise<User> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Please sign in before managing connected sign-in methods.');
  }
  if (currentUser.providerData.length <= 1) {
    throw new Error('Keep at least one sign-in method connected so you can always access your account.');
  }
  const updated = await unlink(currentUser, providerId);
  await updated.reload();
  await updated.getIdToken(true);
  return updated;
}

export async function attachAndVerifyAccountEmail(newEmail: string): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Please sign in first.');
  }
  const cleanEmail = newEmail.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    throw new Error('Please enter a valid email address.');
  }
  await verifyBeforeUpdateEmail(currentUser, cleanEmail);
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
  savePendingDisplayName(credential.user.uid, cleanName);
  await updateProfile(credential.user, { displayName: cleanName });
  await sendEmailVerification(credential.user);
  return credential.user;
}

export async function loginWithEmail(
  email: string,
  password: string,
  rememberSession: boolean,
  pendingCredentialToLink?: AuthCredential | null
): Promise<User> {
  await applyAuthPersistence(rememberSession);
  const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
  if (pendingCredentialToLink) {
    try {
      await linkWithCredential(credential.user, pendingCredentialToLink);
    } catch {
      // Non-fatal if already linked
    }
  }
  if (isUserAccountVerified(credential.user)) {
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
  clearPhoneRecaptcha();
  if (uid && auth.currentUser && isUserAccountVerified(auth.currentUser)) {
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
  const pendingDisplayName = peekPendingDisplayName(user.uid);
  const rawDisplayName =
    sanitizeString(user.displayName || pendingDisplayName || '', BLUEPRINT_LIMITS.DISPLAY_NAME_MAX) ||
    sanitizeString(user.email?.split('@')[0] || '', BLUEPRINT_LIMITS.DISPLAY_NAME_MAX) ||
    (user.phoneNumber ? `Member ${user.phoneNumber.slice(-4)}` : 'Nexora Member');

  const fallbackPhoneSeed = user.phoneNumber
    ? `member_${user.phoneNumber.replace(/\D/g, '').slice(-6)}`
    : rawDisplayName;

  const username = await reserveUniqueUsername(
    user.uid,
    preferredUsername || pendingUsername || user.email?.split('@')[0] || fallbackPhoneSeed
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
    clearPendingRegistrationHints(user.uid);
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
