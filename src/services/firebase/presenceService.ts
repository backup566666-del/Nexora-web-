import {
  collection,
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  Unsubscribe,
} from 'firebase/firestore';
import {
  AdminManualMode,
  AdminPresencePrivate,
  AdminPresencePublic,
  AdminPresenceSession,
  AdminPresenceStatus,
  InternalRole,
  PublicAdminPresenceStatus,
} from '../../types/nexora';
import { auth, db } from './config';
import { logFirestoreListenerError, OperationType } from './errorHandler';

export const INACTIVITY_IDLE_MS = 5 * 60 * 1000; // 5 minutes
export const HEARTBEAT_INTERVAL_MS = 60 * 1000; // 60 seconds
export const SESSION_STALE_MS = 4 * 60 * 1000; // 4 minutes

const SESSION_STORAGE_KEY = 'nexora_admin_device_session_id';

export function getOrCreateDeviceSessionId(): string {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const existing = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (existing && /^[a-zA-Z0-9_-]{8,64}$/.test(existing)) {
        return existing;
      }
      const created = `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      window.sessionStorage.setItem(SESSION_STORAGE_KEY, created);
      return created;
    }
  } catch {
    // Fallback for restricted storage environments
  }
  return `sess_${Date.now().toString(36)}_mem`;
}

export function detectClientDeviceType(): AdminPresenceSession['deviceType'] {
  if (typeof window === 'undefined') return 'web';
  const nav = window.navigator;
  const referrer = typeof document !== 'undefined' ? document.referrer || '' : '';
  const isTwaReferrer = referrer.startsWith('android-app://');
  const isStandalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (nav as { standalone?: boolean }).standalone === true;
  if (isTwaReferrer) return 'android_twa';
  if (/Android|iPhone|iPad|iPod/i.test(nav?.userAgent || '') || isStandalone) {
    return 'mobile';
  }
  return 'web';
}

export function pruneStaleSessions(
  sessions: Record<string, AdminPresenceSession> | undefined,
  nowMs = Date.now()
): Record<string, AdminPresenceSession> {
  if (!sessions || typeof sessions !== 'object') return {};
  const next: Record<string, AdminPresenceSession> = {};
  for (const [id, sess] of Object.entries(sessions)) {
    if (
      sess &&
      typeof sess.lastSeenMs === 'number' &&
      nowMs - sess.lastSeenMs <= SESSION_STALE_MS &&
      (sess.status === 'online' || sess.status === 'idle')
    ) {
      next[id] = sess;
    }
  }
  return next;
}

export function computeEffectivePublicStatus(params: {
  manualMode: AdminManualMode;
  sessions: Record<string, AdminPresenceSession> | undefined;
  nowMs?: number;
  showOnlineStatus?: boolean;
}): PublicAdminPresenceStatus {
  if (params.showOnlineStatus === false || params.manualMode === 'invisible') {
    return 'offline';
  }

  const nowMs = params.nowMs ?? Date.now();
  const activeSessions = Object.values(pruneStaleSessions(params.sessions, nowMs));
  if (activeSessions.length === 0) {
    return 'offline';
  }

  if (params.manualMode === 'dnd') {
    return 'dnd';
  }
  if (params.manualMode === 'idle') {
    return 'idle';
  }

  const hasActiveOnline = activeSessions.some((s) => s.status === 'online');
  return hasActiveOnline ? 'online' : 'idle';
}

export function computeSelfAdminStatus(params: {
  manualMode: AdminManualMode;
  sessions: Record<string, AdminPresenceSession> | undefined;
  nowMs?: number;
}): AdminPresenceStatus | 'offline' {
  if (params.manualMode === 'invisible') return 'invisible';
  if (params.manualMode === 'dnd') return 'dnd';
  if (params.manualMode === 'idle') return 'idle';
  return computeEffectivePublicStatus({
    manualMode: params.manualMode,
    sessions: params.sessions,
    nowMs: params.nowMs,
  });
}

export async function syncAdminSessionHeartbeat(params: {
  uid: string;
  role: InternalRole;
  sessionId: string;
  sessionStatus: 'online' | 'idle';
  deviceType: AdminPresenceSession['deviceType'];
  manualModeOverride?: AdminManualMode;
  showOnlineStatus?: boolean;
}): Promise<PublicAdminPresenceStatus> {
  if (!params.uid || !auth.currentUser || auth.currentUser.uid !== params.uid || !auth.currentUser.emailVerified) {
    return 'offline';
  }

  const privateRef = doc(db, 'admin_presence_private', params.uid);
  const publicRef = doc(db, 'admin_presence', params.uid);
  const userRef = doc(db, 'users', params.uid);
  const nowMs = Date.now();

  try {
    const resultingStatus = await runTransaction(db, async (tx) => {
      const privSnap = await tx.get(privateRef);
      const existingData = privSnap.exists()
        ? (privSnap.data() as Partial<AdminPresencePrivate>)
        : undefined;

      const resolvedManualMode: AdminManualMode =
        params.manualModeOverride ??
        (existingData?.manualMode &&
        ['auto', 'idle', 'dnd', 'invisible'].includes(existingData.manualMode)
          ? existingData.manualMode
          : 'auto');

      const pruned = pruneStaleSessions(existingData?.sessions, nowMs);
      pruned[params.sessionId] = {
        sessionId: params.sessionId,
        status: params.sessionStatus,
        lastSeenMs: nowMs,
        deviceType: params.deviceType,
      };

      const publicStatus = computeEffectivePublicStatus({
        manualMode: resolvedManualMode,
        sessions: pruned,
        nowMs,
        showOnlineStatus: params.showOnlineStatus,
      });

      tx.set(privateRef, {
        uid: params.uid,
        manualMode: resolvedManualMode,
        sessions: pruned,
        updatedAt: serverTimestamp(),
      });

      tx.set(publicRef, {
        uid: params.uid,
        role: params.role,
        status: publicStatus,
        updatedAt: serverTimestamp(),
      });

      tx.update(userRef, {
        isOnline: publicStatus !== 'offline',
        lastActiveAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      return publicStatus;
    });

    return resultingStatus;
  } catch {
    return 'offline';
  }
}

export async function setManualAdminPresenceMode(params: {
  uid: string;
  role: InternalRole;
  sessionId: string;
  deviceType: AdminPresenceSession['deviceType'];
  manualMode: AdminManualMode;
}): Promise<PublicAdminPresenceStatus> {
  return syncAdminSessionHeartbeat({
    uid: params.uid,
    role: params.role,
    sessionId: params.sessionId,
    sessionStatus: params.manualMode === 'idle' ? 'idle' : 'online',
    deviceType: params.deviceType,
    manualModeOverride: params.manualMode,
  });
}

export async function clearDeviceSession(
  uid: string,
  role?: InternalRole,
  sessionId = getOrCreateDeviceSessionId()
): Promise<void> {
  if (!uid || !auth.currentUser || auth.currentUser.uid !== uid || !auth.currentUser.emailVerified) {
    return;
  }

  const privateRef = doc(db, 'admin_presence_private', uid);
  const publicRef = doc(db, 'admin_presence', uid);
  const userRef = doc(db, 'users', uid);
  const nowMs = Date.now();

  try {
    await runTransaction(db, async (tx) => {
      const privSnap = await tx.get(privateRef);
      if (!privSnap.exists()) {
        tx.update(userRef, {
          isOnline: false,
          lastActiveAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        return;
      }

      const existingData = privSnap.data() as Partial<AdminPresencePrivate>;
      const manualMode: AdminManualMode =
        existingData.manualMode && ['auto', 'idle', 'dnd', 'invisible'].includes(existingData.manualMode)
          ? existingData.manualMode
          : 'auto';

      const nextSessions = pruneStaleSessions(existingData.sessions, nowMs);
      delete nextSessions[sessionId];

      const publicStatus = computeEffectivePublicStatus({
        manualMode,
        sessions: nextSessions,
        nowMs,
      });

      tx.set(privateRef, {
        uid,
        manualMode,
        sessions: nextSessions,
        updatedAt: serverTimestamp(),
      });

      if (role) {
        tx.set(publicRef, {
          uid,
          role,
          status: publicStatus,
          updatedAt: serverTimestamp(),
        });
      }

      tx.update(userRef, {
        isOnline: publicStatus !== 'offline',
        lastActiveAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
  } catch {
    // Non-blocking on sign-out/tab unload
  }
}

export function subscribeAllAdminPresence(
  callback: (presenceMap: Record<string, AdminPresencePublic>) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, 'admin_presence'),
    (snap) => {
      const map: Record<string, AdminPresencePublic> = {};
      snap.docs.forEach((d) => {
        const data = d.data() as AdminPresencePublic;
        if (data?.uid) {
          map[data.uid] = data;
        }
      });
      callback(map);
    },
    (error) => logFirestoreListenerError(error, OperationType.LIST, 'admin_presence')
  );
}

export function subscribeMyAdminPresencePrivate(
  uid: string,
  callback: (data: AdminPresencePrivate | null) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, 'admin_presence_private', uid),
    (snap) => {
      callback(snap.exists() ? (snap.data() as AdminPresencePrivate) : null);
    },
    (error) => logFirestoreListenerError(error, OperationType.GET, `admin_presence_private/${uid}`)
  );
}
