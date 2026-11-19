import { auth } from './config';

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
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export interface StorageErrorInfo {
  source: 'firebase-storage';
  code: string;
  error: string;
  path: string;
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
    error: rawMessage,
    path,
  };
}

export function formatStorageErrorMessage(error: unknown, path: string): string {
  const info = buildStorageErrorPayload(error, path);
  const lower = `${info.code} ${info.error}`.toLowerCase();

  if (lower.includes('storage/unauthorized') || lower.includes('permission') || lower.includes('403')) {
    return `Firebase Storage permission denied (${info.code}) while uploading to "${info.path}". Ensure your email is verified and storage.rules are deployed.`;
  }
  if (lower.includes('storage/bucket-not-found') || lower.includes('404') || lower.includes('not found')) {
    return `Firebase Storage bucket not provisioned (${info.code}) for "${info.path}". Enable Firebase Storage in Firebase Console for multi-megabyte media.`;
  }
  if (lower.includes('storage/canceled') || lower.includes('storage/retry-limit-exceeded') || lower.includes('cors')) {
    return `Firebase Storage upload failed (${info.code}) at "${info.path}". Check Firebase Storage bucket provisioning and CORS configuration.`;
  }
  return `Firebase Storage error (${info.code}) at "${info.path}": ${info.error}`;
}

export function extractReadableErrorMessage(
  err: unknown,
  fallback = 'An unexpected error occurred. Please try again.'
): string {
  if (!err) return fallback;
  const errCode = (err as { code?: string })?.code;
  if (typeof errCode === 'string' && errCode.startsWith('storage/')) {
    return formatStorageErrorMessage(err, 'media');
  }
  const rawMessage = err instanceof Error ? err.message : typeof err === 'string' ? err : String((err as { message?: string })?.message || err);

  if (rawMessage.startsWith('{') && rawMessage.includes('"source":"firebase-storage"')) {
    try {
      const parsed = JSON.parse(rawMessage) as Partial<StorageErrorInfo>;
      return formatStorageErrorMessage(
        { code: parsed.code, message: parsed.error },
        parsed.path || 'storage'
      );
    } catch {
      // Fall through
    }
  }

  if (rawMessage.startsWith('{') && rawMessage.includes('"operationType"')) {
    try {
      const parsed = JSON.parse(rawMessage) as Partial<FirestoreErrorInfo>;
      const underlying = (parsed.error || '').toLowerCase();
      const targetPath = parsed.path ? ` (${parsed.operationType || 'write'} ${parsed.path})` : '';
      if (underlying.includes('permission-denied') || underlying.includes('insufficient permissions')) {
        if (parsed.authInfo && parsed.authInfo.emailVerified === false) {
          return `Firestore permission denied${targetPath}: your email verification status is still syncing. Click "Retry Sync" or sign out and sign back in.`;
        }
        return `Firestore permission denied${targetPath}: Missing or insufficient permissions. Verify your inputs and ensure firestore.rules are deployed to database ai-studio-bf321206-bfed-4f87-947f-b3aa40868ffd.`;
      }
      if (underlying.includes('resource-exhausted') || underlying.includes('quota')) {
        return `Firestore quota reached${targetPath}. Please try again shortly.`;
      }
      if (underlying.includes('unavailable') || underlying.includes('network')) {
        return `Firestore network connection interrupted${targetPath}. Please retry.`;
      }
      if (parsed.error) return `Firestore error${targetPath}: ${parsed.error}`;
    } catch {
      // Fall through to raw message checks
    }
  }

  const lower = rawMessage.toLowerCase();
  if (lower.includes('firebase storage')) {
    return rawMessage;
  }
  if (lower.includes('storage/')) {
    return formatStorageErrorMessage(err, 'media');
  }
  if (lower.includes('permission-denied') || lower.includes('insufficient permissions')) {
    return 'Firestore permission denied while completing this action. If you just verified your email, refresh your session and verify deployed firestore.rules.';
  }
  return rawMessage || fallback;
}
