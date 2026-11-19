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

export function extractReadableErrorMessage(
  err: unknown,
  fallback = 'An unexpected error occurred. Please try again.'
): string {
  if (!err) return fallback;
  const rawMessage = err instanceof Error ? err.message : String(err);

  if (rawMessage.startsWith('{') && rawMessage.includes('"operationType"')) {
    try {
      const parsed = JSON.parse(rawMessage) as Partial<FirestoreErrorInfo>;
      const underlying = (parsed.error || '').toLowerCase();
      if (underlying.includes('permission-denied') || underlying.includes('insufficient permissions')) {
        if (parsed.authInfo && parsed.authInfo.emailVerified === false) {
          return 'Your email verification status is still syncing. Click "Retry Sync" or sign out and sign back in.';
        }
        return 'Permission denied while saving to Nexora. Please verify your inputs and try again.';
      }
      if (underlying.includes('resource-exhausted') || underlying.includes('quota')) {
        return 'Platform storage or read/write quota temporarily reached. Please try again shortly.';
      }
      if (underlying.includes('unavailable') || underlying.includes('network')) {
        return 'Network connection interrupted while contacting Nexora servers. Please retry.';
      }
      if (parsed.error) return parsed.error;
    } catch {
      // Fall through to raw message checks
    }
  }

  const lower = rawMessage.toLowerCase();
  if (lower.includes('permission-denied') || lower.includes('insufficient permissions')) {
    return 'Permission denied while completing this action. If you just verified your email, refresh your session and try again.';
  }
  return rawMessage || fallback;
}
