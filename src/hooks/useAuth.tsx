import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
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
import { seedInitialSpacesIfEmpty } from '../services/firebase/socialService';
import {
  PlatformAnnouncement,
  PlatformConfig,
  PlatformRole,
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
  loading: boolean;
  authReady: boolean;
  emailVerified: boolean;
  profileError: string | null;
  getBadgeVariant: (uid?: string | null, fallbackVerified?: boolean) => VerifiedBadgeType | null;
  getUserBadges: (uid?: string | null, fallbackVerified?: boolean) => VerifiedBadgeType[];
  refreshUserAndProfile: () => Promise<void>;
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
  loading: true,
  authReady: false,
  emailVerified: false,
  profileError: null,
  getBadgeVariant: () => null,
  getUserBadges: () => [],
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
  const [loading, setLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const loadProfileForUser = useCallback(async (firebaseUser: User | null, forceTokenRefresh = false) => {
    setProfileError(null);

    if (!firebaseUser) {
      setEmailVerified(false);
      setProfile(null);
      setPrivateInfo(null);
      setMyRole(null);
      return;
    }

    setEmailVerified(Boolean(firebaseUser.emailVerified));

    if (!firebaseUser.emailVerified) {
      setProfile(null);
      setPrivateInfo(null);
      setMyRole(null);
      return;
    }

    try {
      await ensureVerifiedTokenClaims(firebaseUser, forceTokenRefresh);
      let finalProfile = await ensureUserDocuments(firebaseUser);
      const freshPrivate = await getUserPrivate(firebaseUser.uid);

      if ((firebaseUser.email || '').toLowerCase() === FOUNDER_OWNER_EMAIL.toLowerCase()) {
        await bootstrapFounderGovernance(firebaseUser, finalProfile);
        const updated = await getUserProfile(firebaseUser.uid);
        if (updated) finalProfile = updated;
      }

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
        'Unable to synchronize your Nexora profile.'
      );
      setProfileError(readable);
      throw err;
    }
  }, []);

  const refreshUserAndProfile = useCallback(async () => {
    if (!auth.currentUser) {
      setUser(null);
      setEmailVerified(false);
      setProfile(null);
      setPrivateInfo(null);
      setMyRole(null);
      setProfileError(null);
      return;
    }
    await auth.currentUser.reload();
    if (auth.currentUser.emailVerified) {
      await auth.currentUser.getIdToken(true);
    }
    const updatedUser = auth.currentUser;
    setUser(updatedUser);
    setEmailVerified(Boolean(updatedUser.emailVerified));
    await loadProfileForUser(updatedUser, Boolean(updatedUser.emailVerified));
  }, [loadProfileForUser]);

  const retryProfileLoad = useCallback(async () => {
    setLoading(true);
    try {
      await refreshUserAndProfile();
    } catch {
      // profileError state is populated by loadProfileForUser
    } finally {
      setLoading(false);
      setAuthReady(true);
    }
  }, [refreshUserAndProfile]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      setEmailVerified(Boolean(firebaseUser?.emailVerified));
      try {
        await loadProfileForUser(firebaseUser);
      } catch (err) {
        console.error('Failed loading user profile:', err);
      } finally {
        setLoading(false);
        setAuthReady(true);
      }
    });
    return () => unsubscribe();
  }, [loadProfileForUser]);

  // Subscribe to global platform config (readable even before sign-in so registration gates work)
  useEffect(() => {
    return subscribePlatformConfig(setPlatformConfig);
  }, []);

  // Subscribe to RBAC role, trusted badges, and announcements when signed in, verified, and profile synced
  useEffect(() => {
    if (!authReady || !user || !emailVerified || !profile?.uid) {
      setMyRole(null);
      setBadgesMap({});
      setAnnouncements([]);
      return;
    }
    const u1 = subscribeMyPlatformRole(user.uid, setMyRole);
    const u2 = subscribeVerifiedBadges(setBadgesMap);
    const u3 = subscribePlatformAnnouncements(setAnnouncements);
    return () => {
      u1();
      u2();
      u3();
    };
  }, [authReady, user?.uid, emailVerified, profile?.uid]);

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
        loading,
        authReady,
        emailVerified,
        profileError,
        getBadgeVariant,
        getUserBadges,
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
