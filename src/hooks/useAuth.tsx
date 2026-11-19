import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from '../services/firebase/config';
import {
  ensureUserDocuments,
  getUserPrivate,
  getUserProfile,
} from '../services/auth/authService';
import { seedInitialSpacesIfEmpty } from '../services/firebase/socialService';
import { UserPrivate, UserProfile } from '../types/nexora';

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  privateInfo: UserPrivate | null;
  loading: boolean;
  authReady: boolean;
  refreshUserAndProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  profile: null,
  privateInfo: null,
  loading: true,
  authReady: false,
  refreshUserAndProfile: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [privateInfo, setPrivateInfo] = useState<UserPrivate | null>(null);
  const [loading, setLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);

  const loadProfileForUser = useCallback(async (firebaseUser: User | null) => {
    if (!firebaseUser) {
      setProfile(null);
      setPrivateInfo(null);
      return;
    }

    if (!firebaseUser.emailVerified) {
      setProfile(null);
      setPrivateInfo(null);
      return;
    }

    const ensured = await ensureUserDocuments(firebaseUser);
    const [freshProfile, freshPrivate] = await Promise.all([
      getUserProfile(firebaseUser.uid),
      getUserPrivate(firebaseUser.uid),
    ]);
    const finalProfile = freshProfile || ensured;
    setProfile(finalProfile);
    setPrivateInfo(freshPrivate);
    if (finalProfile.onboardingCompleted) {
      void seedInitialSpacesIfEmpty(finalProfile);
    }
  }, []);

  const refreshUserAndProfile = useCallback(async () => {
    if (!auth.currentUser) {
      setUser(null);
      setProfile(null);
      setPrivateInfo(null);
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

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        privateInfo,
        loading,
        authReady,
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
