import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { onIdTokenChanged, User } from 'firebase/auth';
import { auth } from '../services/firebase/config';
import {
  ensureUserDocuments,
  ensureVerifiedTokenClaims,
  getUserPrivate,
  getUserProfile,
} from '../services/auth/authService';
import {
  bootstrapFounderGovernance,
  subscribeMyPlatformRole,
  subscribePlatformAnnouncements,
  subscribePlatformConfig,
  subscribeVerifiedBadges,
} from '../services/firebase/adminService';
import { extractReadableErrorMessage } from '../services/firebase/errorHandler';
import {
  clearDeviceSession,
  computeEffectivePublicStatus,
  computeSelfAdminStatus,
  detectClientDeviceType,
  getOrCreateDeviceSessionId,
  HEARTBEAT_INTERVAL_MS,
  INACTIVITY_IDLE_MS,
  setManualAdminPresenceMode,
  subscribeAllAdminPresence,
  subscribeMyAdminPresencePrivate,
  syncAdminSessionHeartbeat,
} from '../services/firebase/presenceService';
import {
  seedInitialSpacesIfEmpty,
  setUserOnlinePresence,
  subscribeUserProfile,
} from '../services/firebase/socialService';
import {
  AdminManualMode,
  AdminPresencePrivate,
  AdminPresencePublic,
  AdminPresenceStatus,
  PlatformAnnouncement,
  PlatformConfig,
  PlatformRole,
  PublicAdminPresenceStatus,
  UserPrivate,
  UserProfile,
  VerifiedBadgeRecord,
  VerifiedBadgeType,
} from '../types/nexora';
import {
  DEFAULT_PLATFORM_CONFIG,
  FOUNDER_OWNER_EMAIL,
  normalizeBadgeList,
  normalizeBadgeType,
  withPrivacyDefaults,
} from '../utils/validation';

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  privateInfo: UserPrivate | null;
  myRole: PlatformRole | null;
  badgesMap: Record<string, VerifiedBadgeRecord>;
  platformConfig: PlatformConfig;
  announcements: PlatformAnnouncement[];
  adminPresenceMap: Record<string, AdminPresencePublic>;
  myAdminManualMode: AdminManualMode;
  myAdminSelfStatus: AdminPresenceStatus | 'offline';
  isAdminDndActive: boolean;
  isAdminInvisibleActive: boolean;
  loading: boolean;
  authReady: boolean;
  emailVerified: boolean;
  profileError: string | null;
  getBadgeVariant: (uid?: string | null, fallbackVerified?: boolean) => VerifiedBadgeType | null;
  getUserBadges: (uid?: string | null, fallbackVerified?: boolean) => VerifiedBadgeType[];
  getAdminEffectiveStatus: (uid?: string | null) => PublicAdminPresenceStatus | null;
  setMyAdminStatus: (mode: AdminManualMode) => Promise<void>;
  refreshUserAndProfile: (reloadAuthUser?: boolean) => Promise<void>;
  retryProfileLoad: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  profile: null,
  privateInfo: null,
  myRole: null,
  badgesMap: {},
  platformConfig: DEFAULT_PLATFORM_CONFIG,
  announcements: [],
  adminPresenceMap: {},
  myAdminManualMode: 'auto',
  myAdminSelfStatus: 'offline',
  isAdminDndActive: false,
  isAdminInvisibleActive: false,
  loading: true,
  authReady: false,
  emailVerified: false,
  profileError: null,
  getBadgeVariant: () => null,
  getUserBadges: () => [],
  getAdminEffectiveStatus: () => null,
  setMyAdminStatus: async () => {},
  refreshUserAndProfile: async () => {},
  retryProfileLoad: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [emailVerified, setEmailVerified] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [privateInfo, setPrivateInfo] = useState<UserPrivate | null>(null);
  const [myRole, setMyRole] = useState<PlatformRole | null>(null);
  const [badgesMap, setBadgesMap] = useState<Record<string, VerifiedBadgeRecord>>({});
  const [platformConfig, setPlatformConfig] = useState<PlatformConfig>(DEFAULT_PLATFORM_CONFIG);
  const [announcements, setAnnouncements] = useState<PlatformAnnouncement[]>([]);
  const [adminPresenceMap, setAdminPresenceMap] = useState<Record<string, AdminPresencePublic>>({});
  const [myAdminPresencePrivate, setMyAdminPresencePrivate] = useState<AdminPresencePrivate | null>(null);
  const [localSessionIdle, setLocalSessionIdle] = useState(false);
  const [loading, setLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const inFlightSyncRef = useRef<Promise<void> | null>(null);
  const sessionIdRef = useRef<string>(getOrCreateDeviceSessionId());
  const localIdleRef = useRef<boolean>(false);
  const lastActivitySyncMsRef = useRef<number>(0);

  const loadProfileForUser = useCallback(async (firebaseUser: User | null, forceTokenRefresh = false) => {
    setProfileError(null);

    if (!firebaseUser) {
      setEmailVerified(false);
      setProfile(null);
      setPrivateInfo(null);
      setMyRole(null);
      setMyAdminPresencePrivate(null);
      return;
    }

    if (!firebaseUser.emailVerified) {
      setEmailVerified(false);
      setProfile(null);
      setPrivateInfo(null);
      setMyRole(null);
      setMyAdminPresencePrivate(null);
      return;
    }

    if (inFlightSyncRef.current && !forceTokenRefresh) {
      return inFlightSyncRef.current;
    }

    const syncTask = (async () => {
      try {
        await ensureVerifiedTokenClaims(firebaseUser, forceTokenRefresh);
        let finalProfile = await ensureUserDocuments(firebaseUser);
        const freshPrivate = await getUserPrivate(firebaseUser.uid);

        if ((firebaseUser.email || '').toLowerCase() === FOUNDER_OWNER_EMAIL.toLowerCase()) {
          await bootstrapFounderGovernance(firebaseUser, finalProfile);
          const updated = await getUserProfile(firebaseUser.uid);
          if (updated) finalProfile = updated;
        }

        setEmailVerified(true);
        setProfile(finalProfile);
        setPrivateInfo(
          freshPrivate
            ? {
                ...freshPrivate,
                privacySettings: withPrivacyDefaults(freshPrivate.privacySettings),
              }
            : null
        );
        if (finalProfile.onboardingCompleted && !finalProfile.suspended) {
          void seedInitialSpacesIfEmpty(finalProfile);
        }
      } catch (err) {
        const readable = extractReadableErrorMessage(
          err,
          'Unable to synchronize your Nexora profile.',
          { feature: 'auth:profile-sync' }
        );
        setEmailVerified(Boolean(firebaseUser.emailVerified));
        setProfileError(readable);
        throw err;
      } finally {
        inFlightSyncRef.current = null;
      }
    })();

    inFlightSyncRef.current = syncTask;
    return syncTask;
  }, []);

  const refreshUserAndProfile = useCallback(async (reloadAuthUser = true) => {
    if (!auth.currentUser) {
      setUser(null);
      setEmailVerified(false);
      setProfile(null);
      setPrivateInfo(null);
      setMyRole(null);
      setMyAdminPresencePrivate(null);
      setProfileError(null);
      return;
    }
    if (reloadAuthUser) {
      await auth.currentUser.reload();
      if (auth.currentUser.emailVerified) {
        await auth.currentUser.getIdToken(true);
      }
    }
    const updatedUser = auth.currentUser;
    setUser(updatedUser);
    await loadProfileForUser(updatedUser, Boolean(reloadAuthUser && updatedUser.emailVerified));
  }, [loadProfileForUser]);

  const retryProfileLoad = useCallback(async () => {
    setLoading(true);
    try {
      await refreshUserAndProfile(true);
    } catch {
      // profileError state is populated by loadProfileForUser
    } finally {
      setLoading(false);
      setAuthReady(true);
    }
  }, [refreshUserAndProfile]);

  useEffect(() => {
    let previousUid: string | null = null;
    const unsubscribe = onIdTokenChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      setEmailVerified(Boolean(firebaseUser?.emailVerified));

      // Only reload full profile documents when user identity or verified status initializes/changes
      const nextUid = firebaseUser?.uid ?? null;
      if (nextUid === previousUid && firebaseUser && profile?.uid === nextUid && emailVerified === firebaseUser.emailVerified) {
        return;
      }
      previousUid = nextUid;

      try {
        await loadProfileForUser(firebaseUser);
      } catch (err) {
        console.error('Failed loading user profile:', err instanceof Error ? err.name : 'AuthSyncError');
      } finally {
        setLoading(false);
        setAuthReady(true);
      }
    });
    return () => unsubscribe();
  }, [loadProfileForUser, profile?.uid, emailVerified]);

  // Subscribe to global platform config (readable even before sign-in so registration gates work)
  useEffect(() => {
    return subscribePlatformConfig(setPlatformConfig);
  }, []);

  // Subscribe to RBAC role, trusted badges, admin presence projections, and announcements
  useEffect(() => {
    if (!authReady || !user || !emailVerified || !profile?.uid) {
      setMyRole(null);
      setBadgesMap({});
      setAnnouncements([]);
      setAdminPresenceMap({});
      return;
    }
    const u1 = subscribeMyPlatformRole(user.uid, setMyRole);
    const u2 = subscribeVerifiedBadges(setBadgesMap);
    const u3 = subscribePlatformAnnouncements(setAnnouncements);
    const u4 = subscribeUserProfile(user.uid, (freshProfile) => {
      if (freshProfile) {
        setProfile(freshProfile);
      }
    });
    const u5 = subscribeAllAdminPresence(setAdminPresenceMap);
    return () => {
      u1();
      u2();
      u3();
      u4();
      u5();
    };
  }, [authReady, user?.uid, emailVerified, profile?.uid]);

  const isActiveStaff = Boolean(myRole && myRole.active);

  // Subscribe to private multi-device admin presence ONLY for active Owner/Admin staff
  useEffect(() => {
    if (!authReady || !user?.uid || !emailVerified || !profile?.uid || !isActiveStaff) {
      setMyAdminPresencePrivate(null);
      return;
    }
    return subscribeMyAdminPresencePrivate(user.uid, setMyAdminPresencePrivate);
  }, [authReady, user?.uid, emailVerified, profile?.uid, isActiveStaff]);

  // Standard member online presence heartbeat (only runs when NOT active staff; staff use Advanced Admin Presence)
  useEffect(() => {
    if (!authReady || !user?.uid || !emailVerified || !profile?.uid || isActiveStaff) return;
    const allowOnline = privateInfo?.privacySettings?.showOnlineStatus !== false;
    void setUserOnlinePresence(user.uid, allowOnline);

    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void setUserOnlinePresence(user.uid, allowOnline);
      }
    }, 3 * 60 * 1000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void setUserOnlinePresence(user.uid, allowOnline);
      } else {
        void setUserOnlinePresence(user.uid, false);
      }
    };

    const handlePageHide = () => {
      void setUserOnlinePresence(user.uid, false);
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [
    authReady,
    user?.uid,
    emailVerified,
    profile?.uid,
    isActiveStaff,
    privateInfo?.privacySettings?.showOnlineStatus,
  ]);

  // Advanced Admin Presence Engine: 5-minute inactivity -> idle, resume -> online (unless manual DND/Invisible/Idle)
  useEffect(() => {
    if (!authReady || !user?.uid || !emailVerified || !profile?.uid || !isActiveStaff || !myRole) {
      return;
    }

    const sessionId = sessionIdRef.current;
    const deviceType = detectClientDeviceType();
    const allowOnline = privateInfo?.privacySettings?.showOnlineStatus !== false;
    let idleTimer: number | undefined;

    const pushHeartbeat = (sessionStatus: 'online' | 'idle') => {
      void syncAdminSessionHeartbeat({
        uid: user.uid,
        role: myRole.role,
        sessionId,
        sessionStatus,
        deviceType,
        showOnlineStatus: allowOnline,
      });
    };

    const armIdleTimer = () => {
      if (idleTimer) window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => {
        localIdleRef.current = true;
        setLocalSessionIdle(true);
        pushHeartbeat('idle');
      }, INACTIVITY_IDLE_MS);
    };

    // Initial active sync
    localIdleRef.current = false;
    setLocalSessionIdle(false);
    lastActivitySyncMsRef.current = Date.now();
    pushHeartbeat('online');
    armIdleTimer();

    const handleActivity = () => {
      const now = Date.now();
      const wasIdle = localIdleRef.current;
      localIdleRef.current = false;
      if (wasIdle) {
        setLocalSessionIdle(false);
      }
      armIdleTimer();

      if (wasIdle || now - lastActivitySyncMsRef.current > 20_000) {
        lastActivitySyncMsRef.current = now;
        pushHeartbeat('online');
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        handleActivity();
      }
    };

    const handlePageHide = () => {
      void clearDeviceSession(user.uid, myRole.role, sessionId);
    };

    const heartbeatInterval = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        pushHeartbeat(localIdleRef.current ? 'idle' : 'online');
      }
    }, HEARTBEAT_INTERVAL_MS);

    const activityEvents: (keyof WindowEventMap)[] = [
      'pointerdown',
      'keydown',
      'scroll',
      'focus',
      'touchstart',
    ];
    activityEvents.forEach((evt) => window.addEventListener(evt, handleActivity, { passive: true }));
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      if (idleTimer) window.clearTimeout(idleTimer);
      window.clearInterval(heartbeatInterval);
      activityEvents.forEach((evt) => window.removeEventListener(evt, handleActivity));
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [
    authReady,
    user?.uid,
    emailVerified,
    profile?.uid,
    isActiveStaff,
    myRole?.role,
    privateInfo?.privacySettings?.showOnlineStatus,
  ]);

  const myAdminManualMode: AdminManualMode = myAdminPresencePrivate?.manualMode || 'auto';

  const myAdminSelfStatus = useMemo<AdminPresenceStatus | 'offline'>(() => {
    if (!isActiveStaff) return 'offline';
    if (myAdminManualMode === 'invisible') return 'invisible';
    if (myAdminManualMode === 'dnd') return 'dnd';
    if (myAdminManualMode === 'idle') return 'idle';
    if (myAdminPresencePrivate?.sessions) {
      return computeSelfAdminStatus({
        manualMode: myAdminManualMode,
        sessions: myAdminPresencePrivate.sessions,
      });
    }
    return localSessionIdle ? 'idle' : 'online';
  }, [isActiveStaff, myAdminManualMode, myAdminPresencePrivate?.sessions, localSessionIdle]);

  const isAdminDndActive = isActiveStaff && myAdminManualMode === 'dnd';
  const isAdminInvisibleActive = isActiveStaff && myAdminManualMode === 'invisible';

  const setMyAdminStatus = useCallback(
    async (mode: AdminManualMode) => {
      if (!user?.uid || !myRole?.active) return;
      const sessionId = sessionIdRef.current;
      const deviceType = detectClientDeviceType();
      await setManualAdminPresenceMode({
        uid: user.uid,
        role: myRole.role,
        sessionId,
        deviceType,
        manualMode: mode,
      });
      if (mode === 'auto') {
        localIdleRef.current = false;
        setLocalSessionIdle(false);
      }
    },
    [user?.uid, myRole?.active, myRole?.role]
  );

  const getAdminEffectiveStatus = useCallback(
    (uid?: string | null): PublicAdminPresenceStatus | null => {
      if (!uid) return null;
      const record = adminPresenceMap[uid];
      if (!record) return null;
      if (record.status === 'offline') return 'offline';
      const updatedMs = record.updatedAt?.toMillis?.();
      if (updatedMs && Date.now() - updatedMs > 5 * 60 * 1000) {
        return 'offline';
      }
      return record.status;
    },
    [adminPresenceMap]
  );

  const getUserBadges = useCallback(
    (uid?: string | null, fallbackVerified?: boolean): VerifiedBadgeType[] => {
      if (!uid) return fallbackVerified ? ['verified_identity'] : [];
      const record = badgesMap[uid];
      if (record) {
        const list = normalizeBadgeList(record.badges, record.badgeType);
        if (list.length > 0) return list;
      }
      if (
        uid === user?.uid &&
        emailVerified &&
        (user.email || '').toLowerCase() === FOUNDER_OWNER_EMAIL.toLowerCase()
      ) {
        return ['founder', 'verified_identity'];
      }
      if (fallbackVerified) return ['verified_identity'];
      return [];
    },
    [badgesMap, user?.uid, emailVerified, user?.email]
  );

  const getBadgeVariant = useCallback(
    (uid?: string | null, fallbackVerified?: boolean): VerifiedBadgeType | null => {
      const list = getUserBadges(uid, fallbackVerified);
      return list.length > 0 ? normalizeBadgeType(list[0]) : null;
    },
    [getUserBadges]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        privateInfo,
        myRole,
        badgesMap,
        platformConfig,
        announcements,
        adminPresenceMap,
        myAdminManualMode,
        myAdminSelfStatus,
        isAdminDndActive,
        isAdminInvisibleActive,
        loading,
        authReady,
        emailVerified,
        profileError,
        getBadgeVariant,
        getUserBadges,
        getAdminEffectiveStatus,
        setMyAdminStatus,
        refreshUserAndProfile,
        retryProfileLoad,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
