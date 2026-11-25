import {
  addDoc,
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Unsubscribe,
  updateDoc,
  where,
} from 'firebase/firestore';
import { ErrorDiagnosticCategory, ErrorDiagnosticEntry } from '../../types/nexora';
import { auth, db } from './config';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  };
}

export interface StorageErrorInfo {
  source: 'firebase-storage';
  code: string;
  error: string;
  path: string;
}

const DIAGNOSTIC_DEDUPE_WINDOW_MS = 15_000;
const recentDiagnosticTimestamps = new Map<string, number>();

export function generateRequestId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `nx_${ts}_${rand}`;
}

export function redactSensitiveDiagnosticText(raw: string): string {
  if (!raw) return '';
  let text = String(raw);
  // Bearer / Authorization tokens
  text = text.replace(/Bearer\s+[A-Za-z0-9._\-+/=]+/gi, 'Bearer [REDACTED]');
  // JWT tokens (eyJ...)
  text = text.replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}(?:\.[A-Za-z0-9_-]+)?\b/g, '[REDACTED_JWT]');
  // Google / Firebase API keys
  text = text.replace(/\bAIza[0-9A-Za-z_-]{16,}\b/g, '[REDACTED_API_KEY]');
  // Sensitive query string parameters
  text = text.replace(
    /([?&](?:token|access_token|refresh_token|id_token|key|apiKey|api_key|password|secret|auth|code)=)[^&\s"']+/gi,
    '$1[REDACTED]'
  );
  // Key-value secrets in serialized payloads
  text = text.replace(
    /("?(?:password|passwd|secret|apiKey|privateKey|accessToken|refreshToken|idToken|token|authorization)"?\s*[:=]\s*)"?([^"',}\s\n]+)"?/gi,
    '$1"[REDACTED]"'
  );
  // Email addresses (PII)
  text = text.replace(/\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g, '[REDACTED_EMAIL]');
  // Private chat/message text bodies
  text = text.replace(/("(?:text|message|bodyText|replyToText)"\s*:\s*)"[^"]{1,400}"/gi, '$1"[REDACTED_CONTENT]"');
  return text.slice(0, 600);
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const redactedMessage = redactSensitiveDiagnosticText(rawMessage);
  const errInfo: FirestoreErrorInfo = {
    error: redactedMessage,
    authInfo: {
      userId: auth?.currentUser?.uid ?? null,
      emailVerified: auth?.currentUser?.emailVerified ?? null,
      isAnonymous: auth?.currentUser?.isAnonymous ?? null,
    },
    operationType,
    path,
  };
  console.error('Firestore Error:', redactSensitiveDiagnosticText(JSON.stringify(errInfo)));
  void recordErrorDiagnostic({
    feature: `firestore:${operationType}${path ? `:${path.split('/')[0]}` : ''}`,
    err: errInfo,
  });
  throw new Error(JSON.stringify(errInfo));
}

export function logFirestoreListenerError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): void {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const errInfo: FirestoreErrorInfo = {
    error: redactSensitiveDiagnosticText(rawMessage),
    authInfo: {
      userId: auth?.currentUser?.uid ?? null,
      emailVerified: auth?.currentUser?.emailVerified ?? null,
      isAnonymous: auth?.currentUser?.isAnonymous ?? null,
    },
    operationType,
    path,
  };
  console.warn('Firestore Listener Warning:', redactSensitiveDiagnosticText(JSON.stringify(errInfo)));
}

export function buildStorageErrorPayload(
  error: unknown,
  path: string
): StorageErrorInfo {
  const code = (error as { code?: string })?.code || 'storage/unknown';
  const rawMessage = error instanceof Error ? error.message : String(error);
  return {
    source: 'firebase-storage',
    code,
    error: redactSensitiveDiagnosticText(rawMessage),
    path,
  };
}

export function formatStorageErrorMessage(error: unknown, path: string): string {
  const info = buildStorageErrorPayload(error, path);
  const lower = `${info.code} ${info.error}`.toLowerCase();

  if (lower.includes('storage/unauthorized') || lower.includes('permission') || lower.includes('403')) {
    return `Storage access rejected (${info.code}) at "${info.path}".`;
  }
  if (lower.includes('storage/bucket-not-found') || lower.includes('404') || lower.includes('not found')) {
    return `Storage bucket unavailable (${info.code}) for "${info.path}".`;
  }
  if (lower.includes('storage/canceled') || lower.includes('storage/retry-limit-exceeded') || lower.includes('cors')) {
    return `Storage upload interrupted (${info.code}) at "${info.path}".`;
  }
  return `Storage failure (${info.code}) at "${info.path}": ${info.error}`;
}

export function inferDiagnosticCategory(err: unknown, rawText = ''): ErrorDiagnosticCategory {
  const mediaKind = (err as { mediaKind?: string })?.mediaKind;
  if (mediaKind) return 'upload';
  const code = String((err as { code?: string })?.code || '').toLowerCase();
  const combined = `${code} ${rawText}`.toLowerCase();

  if (code.startsWith('storage/') || combined.includes('storage/') || combined.includes('upload')) {
    return 'upload';
  }
  if (code.startsWith('auth/') || combined.includes('id-token-expired') || combined.includes('session has expired')) {
    return 'auth';
  }
  if (combined.includes('permission-denied') || combined.includes('insufficient permissions') || combined.includes('unauthorized') || combined.includes('403')) {
    return 'permission';
  }
  if (combined.includes('network') || combined.includes('unavailable') || combined.includes('timeout') || combined.includes('timed out') || combined.includes('failed to fetch')) {
    return 'network';
  }
  if (combined.includes('invalid') || combined.includes('required') || combined.includes('must be')) {
    return 'validation';
  }
  if (err instanceof Error) return 'runtime';
  return 'unknown';
}

export function extractAdminDiagnosticMessage(err: unknown): {
  category: ErrorDiagnosticCategory;
  errorCode: string;
  httpStatus: number;
  diagnosticMessage: string;
  redactedStack?: string;
} {
  const errObj = err as {
    code?: string;
    status?: number;
    httpStatus?: number;
    diagnosticDetail?: string;
    message?: string;
    stack?: string;
    error?: string;
    operationType?: string;
    path?: string | null;
  };

  let rawMessage =
    errObj?.diagnosticDetail ||
    (err instanceof Error ? err.message : typeof err === 'string' ? err : errObj?.error || errObj?.message || String(err));

  let parsedCode = errObj?.code ? String(errObj.code) : '';
  if (typeof rawMessage === 'string' && rawMessage.startsWith('{') && rawMessage.includes('"operationType"')) {
    try {
      const parsed = JSON.parse(rawMessage) as Partial<FirestoreErrorInfo>;
      rawMessage = `${parsed.operationType || 'write'} ${parsed.path || ''}: ${parsed.error || rawMessage}`.trim();
      if (!parsedCode && parsed.error?.toLowerCase().includes('permission')) {
        parsedCode = 'firestore/permission-denied';
      }
    } catch {
      // keep rawMessage
    }
  }

  const sanitizedMsg = redactSensitiveDiagnosticText(rawMessage || 'Unknown error');
  const category = inferDiagnosticCategory(err, sanitizedMsg);
  const lower = `${parsedCode} ${sanitizedMsg}`.toLowerCase();

  if (!parsedCode) {
    if (lower.includes('permission-denied') || lower.includes('insufficient permissions')) {
      parsedCode = 'firestore/permission-denied';
    } else if (lower.includes('unavailable')) {
      parsedCode = 'firestore/unavailable';
    } else if (lower.includes('resource-exhausted')) {
      parsedCode = 'firestore/resource-exhausted';
    } else if (lower.includes('video_too_large')) {
      parsedCode = 'media/video-too-large';
    } else {
      parsedCode = `${category}/error`;
    }
  }

  let httpStatus = Number(errObj?.httpStatus || errObj?.status || 0);
  if (!httpStatus) {
    if (category === 'permission') httpStatus = 403;
    else if (category === 'auth') httpStatus = 401;
    else if (category === 'validation') httpStatus = 400;
    else if (category === 'network') httpStatus = 503;
    else httpStatus = 500;
  }

  const redactedStack =
    typeof errObj?.stack === 'string'
      ? redactSensitiveDiagnosticText(errObj.stack.split('\n').slice(0, 6).join('\n'))
      : undefined;

  return {
    category,
    errorCode: parsedCode.slice(0, 80),
    httpStatus,
    diagnosticMessage: sanitizedMsg.slice(0, 500),
    redactedStack,
  };
}

export async function recordErrorDiagnostic(params: {
  category?: ErrorDiagnosticCategory;
  feature: string;
  err: unknown;
  httpStatus?: number;
  errorCode?: string;
}): Promise<string | null> {
  const actorUid = auth?.currentUser?.uid;
  const emailVerified = auth?.currentUser?.emailVerified;
  const hasPhoneNumber = Boolean(auth?.currentUser?.phoneNumber);
  if (!actorUid || (emailVerified !== true && !hasPhoneNumber) || typeof db !== 'object' || db === null) {
    return null;
  }

  // Prevent diagnostic write loops
  if (params.feature.includes('error_diagnostics')) {
    return null;
  }

  const extracted = extractAdminDiagnosticMessage(params.err);
  const category = params.category || extracted.category;
  const errorCode = (params.errorCode || extracted.errorCode).slice(0, 80);
  const feature = params.feature.replace(/[^a-zA-Z0-9_:.\-\s]/g, '').slice(0, 80) || 'app';

  const dedupeKey = `${actorUid}:${feature}:${errorCode}`;
  const now = Date.now();
  const prev = recentDiagnosticTimestamps.get(dedupeKey) ?? 0;
  if (now - prev < DIAGNOSTIC_DEDUPE_WINDOW_MS) {
    return null;
  }
  recentDiagnosticTimestamps.set(dedupeKey, now);

  const requestId = generateRequestId();
  try {
    await addDoc(collection(db, 'error_diagnostics'), {
      category,
      feature,
      requestId,
      httpStatus: params.httpStatus ?? extracted.httpStatus,
      errorCode,
      diagnosticMessage: extracted.diagnosticMessage,
      redactedStack: (extracted.redactedStack || '').slice(0, 600),
      actorUid,
      resolved: false,
      createdAt: serverTimestamp(),
    });
    return requestId;
  } catch {
    return null;
  }
}

export function subscribeErrorDiagnostics(
  callback: (entries: ErrorDiagnosticEntry[]) => void,
  onError?: (friendlyMessage: string) => void
): Unsubscribe {
  const q = query(
    collection(db, 'error_diagnostics'),
    where('category', 'in', ['upload', 'permission', 'network', 'auth', 'validation', 'runtime', 'unknown']),
    orderBy('createdAt', 'desc'),
    limit(100)
  );
  return onSnapshot(
    q,
    (snap) => {
      callback(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<ErrorDiagnosticEntry, 'id'>),
        }))
      );
    },
    (error) => {
      logFirestoreListenerError(error, OperationType.LIST, 'error_diagnostics');
      onError?.('You are not authorised to view system diagnostics.');
    }
  );
}

export async function resolveErrorDiagnostic(
  diagnosticId: string,
  actorUid: string
): Promise<void> {
  await updateDoc(doc(db, 'error_diagnostics', diagnosticId), {
    resolved: true,
    resolvedBy: actorUid,
    resolvedAt: serverTimestamp(),
  });
}

function containsTechnicalLeak(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed) return true;
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return true;
  if (/\n\s*at\s+/i.test(trimmed) || /\bat\s+[A-Za-z0-9_.$]+\s*\([^)]+:\d+:\d+\)/.test(trimmed)) return true;
  if (/\b\d{6,}\b/.test(trimmed)) return true;
  if (/\b(?:http|status(?:\s*code)?)\s*[:=]?\s*[45]\d{2}\b/i.test(trimmed)) return true;
  return /firestore|firebase|storage\/|auth\/|stripe_|pi_[a-zA-Z0-9]+|cs_(?:test|live)_|permission_denied|permission-denied|insufficient permissions|error\s*\(|status\s*\d{3}|ai-studio-bf321206|firestore\.rules|storage\.rules|\/users\/|\/posts\/|\/vibes\/|\/spaces\/|\/conversations\/|\/notifications\/|\/user_subscriptions\/|cors|xmlhttprequest|econnrefused|enotfound/i.test(
    trimmed
  );
}

export function extractReadableErrorMessage(
  err: unknown,
  fallback = 'Something went wrong. Please try again.',
  context?: { feature?: string; recordDiagnostic?: boolean }
): string {
  if (!err) return fallback;

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return "You're offline. Check your internet connection and try again.";
  }

  const mediaKind = (err as { mediaKind?: string })?.mediaKind;
  if (mediaKind === 'video_too_large') {
    if (context?.recordDiagnostic !== false) {
      void recordErrorDiagnostic({ feature: context?.feature || 'media-upload', err, category: 'upload', httpStatus: 413 });
    }
    return 'Your video is too large. Please upload a smaller video.';
  }
  if (mediaKind === 'unsupported_video') {
    if (context?.recordDiagnostic !== false) {
      void recordErrorDiagnostic({ feature: context?.feature || 'media-upload', err, category: 'upload', httpStatus: 415 });
    }
    return 'This video format is not supported.';
  }
  if (mediaKind === 'video_upload_failed') {
    if (context?.recordDiagnostic !== false) {
      void recordErrorDiagnostic({ feature: context?.feature || 'media-upload', err, category: 'upload', httpStatus: 500 });
    }
    return "Your video couldn't be uploaded. Please try again.";
  }
  if (mediaKind === 'image_upload_failed') {
    if (context?.recordDiagnostic !== false) {
      void recordErrorDiagnostic({ feature: context?.feature || 'media-upload', err, category: 'upload', httpStatus: 500 });
    }
    return "We couldn't upload your image. Please try again.";
  }
  if (mediaKind === 'file_too_large') {
    return 'This file is too large. Please choose a smaller file.';
  }
  if (mediaKind === 'unsupported_file') {
    return 'This file format is not supported. Please choose another file.';
  }

  const errCode = String((err as { code?: string })?.code || '').toLowerCase();
  const rawMessage =
    err instanceof Error
      ? err.message
      : typeof err === 'string'
      ? err
      : String((err as { message?: string })?.message || err);

  let structuredUnderlying = '';
  let structuredPath = '';
  let isStructuredStorage = false;
  let isStructuredFirestore = false;

  if (rawMessage.startsWith('{') && rawMessage.includes('"source":"firebase-storage"')) {
    isStructuredStorage = true;
    try {
      const parsed = JSON.parse(rawMessage) as Partial<StorageErrorInfo>;
      structuredUnderlying = `${parsed.code || ''} ${parsed.error || ''}`.toLowerCase();
      structuredPath = (parsed.path || '').toLowerCase();
    } catch {
      // fall through
    }
  } else if (rawMessage.startsWith('{') && rawMessage.includes('"operationType"')) {
    isStructuredFirestore = true;
    try {
      const parsed = JSON.parse(rawMessage) as Partial<FirestoreErrorInfo>;
      structuredUnderlying = (parsed.error || '').toLowerCase();
      structuredPath = (parsed.path || '').toLowerCase();
    } catch {
      // fall through
    }
  }

  const combined = `${errCode} ${structuredUnderlying} ${rawMessage}`.toLowerCase();
  const featureHint = (context?.feature || '').toLowerCase();

  // Record diagnostic silently when an infrastructure or unexpected error occurs
  if (context?.recordDiagnostic !== false && (isStructuredFirestore || isStructuredStorage || errCode)) {
    void recordErrorDiagnostic({
      feature: context?.feature || (structuredPath ? `firestore:${structuredPath.split('/')[0]}` : 'app'),
      err,
    });
  }

  // Video-specific friendly translation
  if (
    (combined.includes('video') || structuredPath.includes('vibe') || structuredPath.includes('video')) &&
    (combined.includes('too large') || combined.includes('exceeds') || combined.includes('limit') || combined.includes('413'))
  ) {
    return 'Your video is too large. Please upload a smaller video.';
  }
  if (
    (combined.includes('video') || combined.includes('mp4') || combined.includes('quicktime') || combined.includes('webm')) &&
    (combined.includes('unsupported') || combined.includes('format') || combined.includes('file type'))
  ) {
    return 'This video format is not supported. Please choose another file.';
  }

  if (combined.includes('unsupported file') || combined.includes('unsupported format')) {
    return 'This file format is not supported. Please choose another file.';
  }

  // Storage failure friendly translation
  if (isStructuredStorage || errCode.startsWith('storage/') || combined.includes('firebase storage') || combined.includes('storage/')) {
    if (combined.includes('video') || structuredPath.includes('vibe')) {
      return "Your video couldn't be uploaded. Please try again.";
    }
    return "We couldn't upload your file. Please try again.";
  }

  // Payment & Subscription errors
  if (featureHint.includes('billing') || featureHint.includes('subscription') || combined.includes('stripe') || combined.includes('payment')) {
    if (combined.includes('not configured') || combined.includes('unavailable') || combined.includes('pricing')) {
      return 'Online checkout is not available right now. Please contact support or try again shortly.';
    }
    return 'Your payment couldn\'t be completed. Please check your payment method.';
  }

  // Suspended / restricted account
  if (combined.includes('suspended') || combined.includes('restricted')) {
    return 'This action is currently unavailable for your account.';
  }

  // Expired / invalid session
  if (
    errCode === 'auth/id-token-expired' ||
    errCode === 'auth/user-token-expired' ||
    errCode === 'auth/requires-recent-login' ||
    combined.includes('session has expired') ||
    combined.includes('token expired') ||
    combined.includes('unauthenticated')
  ) {
    return 'Your session has expired. Please sign in again.';
  }

  // Permission errors
  if (
    errCode === 'permission-denied' ||
    errCode === 'firestore/permission-denied' ||
    combined.includes('permission-denied') ||
    combined.includes('permission_denied') ||
    combined.includes('insufficient permissions') ||
    combined.includes('not authorised') ||
    combined.includes('not authorized')
  ) {
    return 'You are not authorised to perform this action.';
  }

  // Network & offline errors
  if (
    errCode === 'auth/network-request-failed' ||
    combined.includes('offline') ||
    combined.includes('network') ||
    combined.includes('failed to fetch')
  ) {
    return "You're offline. Check your internet connection and try again.";
  }

  // Server unavailable / timeout errors
  if (
    errCode === 'unavailable' ||
    errCode === 'firestore/unavailable' ||
    combined.includes('unavailable') ||
    combined.includes('timed out') ||
    combined.includes('timeout') ||
    combined.includes('503') ||
    combined.includes('502') ||
    combined.includes('500')
  ) {
    return 'Nexora is temporarily unavailable. Please try again shortly.';
  }

  // Quota / rate limits
  if (combined.includes('resource-exhausted') || combined.includes('quota') || combined.includes('too-many-requests')) {
    return 'Nexora is temporarily busy right now. Please try again shortly.';
  }

  // Feature-specific clean fallbacks when technical details leak
  if (containsTechnicalLeak(rawMessage)) {
    if (context?.recordDiagnostic !== false) {
      void recordErrorDiagnostic({ feature: context?.feature || 'app', err });
    }
    if (featureHint.includes('post')) return "Your post couldn't be published. Please try again.";
    if (featureHint.includes('chat') || featureHint.includes('message')) return "Your message wasn't sent. Please try again.";
    if (featureHint.includes('profile')) return "We couldn't save your profile changes. Please try again.";
    return fallback;
  }

  return rawMessage;
}

