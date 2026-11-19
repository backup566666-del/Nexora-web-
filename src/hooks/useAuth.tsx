import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from '../services/firebase/config';
import {
  ensureUserDocuments,
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
import { DEFAULT_PLATFORM_CONFIG, FOUNDER_OWNER_EMAIL } from '../utils/validation';

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
  getBadgeVariant: (uid?: string | null, fallbackVerified?: boolean) => VerifiedBadgeType | null;
  refreshUserAndProfile: () => Promise<void>;
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
  getBadgeVariant: () => null,
  refreshUserAndProfile: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [privateInfo, setPrivateInfo] = useState<UserPrivate | null>(null);
  const [myRole, setMyRole] = useState<PlatformRole | null>(null);
  const [badgesMap, setBadgesMap] = useState<Record<string, VerifiedBadgeRecord>>({});
  const [platformConfig, setPlatformConfig] = useState<PlatformConfig>(DEFAULT_PLATFORM_CONFIG);
  const [announcements, setAnnouncements] = useState<PlatformAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);

  const loadProfileForUser = useCallback(async (firebaseUser: User | null) => {
    if (!firebaseUser) {
      setProfile(null);
      setPrivateInfo(null);
      setMyRole(null);
      return;
    }

    if (!firebaseUser.emailVerified) {
      setProfile(null);
      setPrivateInfo(null);
      setMyRole(null);
      return;
    }

    const ensured = await ensureUserDocuments(firebaseUser);
    const [freshProfile, freshPrivate] = await Promise.all([
      getUserProfile(firebaseUser.uid),
      getUserPrivate(firebaseUser.uid),
    ]);
    let finalProfile = freshProfile || ensured;

    if ((firebaseUser.email || '').toLowerCase() === FOUNDER_OWNER_EMAIL.toLowerCase()) {
      await bootstrapFounderGovernance(firebaseUser, finalProfile);
      const updated = await getUserProfile(firebaseUser.uid);
      if (updated) finalProfile = updated;
    }

    setProfile(finalProfile);
    setPrivateInfo(freshPrivate);
    if (finalProfile.onboardingCompleted && !finalProfile.suspended) {
      void seedInitialSpacesIfEmpty(finalProfile);
    }
  }, []);

  const refreshUserAndProfile = useCallback(async () => {
    if (!auth.currentUser) {
      setUser(null);
      setProfile(null);
      setPrivateInfo(null);
      setMyRole(null);
      return;
    }
    await auth.currentUser.reload();
    const updatedUser = auth.currentUser;
    setUser(updatedUser);
    await loadProfileForUser(updatedUser);
  }, [loadProfileForUser]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
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

  // Subscribe to RBAC role, trusted badges, and announcements when signed in & verified
  useEffect(() => {
    if (!authReady || !user || !user.emailVerified) {
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
  }, [authReady, user?.uid, user?.emailVerified]);

  const getBadgeVariant = useCallback(
    (uid?: string | null, fallbackVerified?: boolean): VerifiedBadgeType | null => {
      if (!uid) return fallbackVerified ? 'verified' : null;
      const trusted = badgesMap[uid]?.badgeType;
      if (trusted) return trusted;
      if (
        uid === user?.uid &&
        user?.emailVerified &&
        (user.email || '').toLowerCase() === FOUNDER_OWNER_EMAIL.toLowerCase()
      ) {
        return 'owner';
      }
      if (fallbackVerified) return 'verified';
      return null;
    },
    [badgesMap, user?.uid, user?.emailVerified, user?.email]
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
        getBadgeVariant,
        refreshUserAndProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
