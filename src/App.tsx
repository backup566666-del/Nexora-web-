import React, { useEffect, useState } from 'react';
import { AlertTriangle, Ban, LogOut, RefreshCw, Wrench } from 'lucide-react';
import { BadgeModalProvider } from './components/badges/BadgeContext';
import { BadgeInfoModal } from './components/badges/BadgeInfoModal';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { LoadingScreen } from './components/common/LoadingScreen';
import { NexoraLogo } from './components/branding/NexoraLogo';
import { DashboardShell } from './components/navigation/DashboardShell';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { AuthView } from './pages/auth/AuthView';
import { OnboardingFlow } from './pages/auth/OnboardingFlow';
import { ChatPage } from './pages/chat/ChatPage';
import { CreatePage } from './pages/create/CreatePage';
import { HomePage } from './pages/home/HomePage';
import { LandingPage } from './pages/landing/LandingPage';
import { ProfilePage } from './pages/profile/ProfilePage';
import { SettingsPage } from './pages/settings/SettingsPage';
import { SpacesPage } from './pages/spaces/SpacesPage';
import { VibesPage } from './pages/vibes/VibesPage';
import { logoutUser } from './services/auth/authService';
import {
  getUserByUsername,
  subscribeDirectoryUsers,
  subscribeFeedPosts,
  subscribeNotifications,
  subscribeSavedPostIds,
  subscribeSpaces,
  subscribeStories,
  subscribeVibes,
} from './services/firebase/socialService';
import {
  NavSection,
  NotificationItem,
  Post,
  Space,
  Story,
  UserProfile,
  Vibe,
} from './types/nexora';

type ProfileContentTab = 'posts' | 'videos' | 'photos' | 'tagged' | 'collabs' | 'gifts' | 'spaces' | 'saved';

function NexoraAppContent() {
  const {
    user,
    profile,
    myRole,
    platformConfig,
    loading,
    authReady,
    emailVerified,
    profileError,
    retryProfileLoad,
  } = useAuth();
  const [authScreenMode, setAuthScreenMode] = useState<'landing' | 'login' | 'register'>('landing');
  const [activeSection, setActiveSection] = useState<NavSection>('home');
  const [openAdminSettings, setOpenAdminSettings] = useState(false);
  const [targetProfileUid, setTargetProfileUid] = useState<string | null>(null);
  const [targetProfileTab, setTargetProfileTab] = useState<ProfileContentTab | undefined>(undefined);
  const [targetSpaceId, setTargetSpaceId] = useState<string | null>(null);
  const [targetConvId, setTargetConvId] = useState<string | null>(null);

  // Real-time Firestore state (attached ONLY when auth is ready, email verified & profile synced)
  const [posts, setPosts] = useState<Post[]>([]);
  const [stories, setStories] = useState<Story[]>([]);
  const [vibes, setVibes] = useState<Vibe[]>([]);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [savedPostIds, setSavedPostIds] = useState<string[]>([]);
  const [deepLinkHandled, setDeepLinkHandled] = useState(false);

  useEffect(() => {
    if (!authReady || !user || !emailVerified || !profile?.uid) return;

    const u1 = subscribeFeedPosts(setPosts);
    const u2 = subscribeStories(setStories);
    const u3 = subscribeSpaces(setSpaces);
    const u4 = subscribeDirectoryUsers(setUsers);
    const u5 = subscribeNotifications(user.uid, setNotifications);
    const u6 = subscribeSavedPostIds(user.uid, setSavedPostIds);
    const u7 = subscribeVibes(setVibes);

    return () => {
      u1();
      u2();
      u3();
      u4();
      u5();
      u6();
      u7();
    };
  }, [authReady, user?.uid, emailVerified, profile?.uid]);

  useEffect(() => {
    if (deepLinkHandled || !profile?.onboardingCompleted) return;
    const params = new URLSearchParams(window.location.search);
    const sharedUsername = params.get('u')?.trim().toLowerCase();
    if (!sharedUsername) {
      setDeepLinkHandled(true);
      return;
    }

    let cancelled = false;
    const resolveDeepLink = async () => {
      const localMatch = users.find((u) => u.username.toLowerCase() === sharedUsername);
      const matched = localMatch || (await getUserByUsername(sharedUsername));
      if (cancelled) return;
      if (matched) {
        setTargetProfileUid(matched.uid === profile.uid ? null : matched.uid);
        setTargetProfileTab(undefined);
        setActiveSection('profile');
        window.history.replaceState({}, '', window.location.pathname);
      }
      setDeepLinkHandled(true);
    };

    void resolveDeepLink();
    return () => {
      cancelled = true;
    };
  }, [deepLinkHandled, profile?.onboardingCompleted, profile?.uid, users]);

  const isActiveStaff = Boolean(myRole && myRole.active);

  // Redirect non-staff cleanly away from disabled sections
  useEffect(() => {
    if (isActiveStaff) return;
    if (activeSection === 'vibes' && !platformConfig.features.vibesEnabled) {
      setActiveSection('home');
    } else if (activeSection === 'spaces' && !platformConfig.features.spacesEnabled) {
      setActiveSection('home');
    } else if (activeSection === 'chat' && !platformConfig.features.chatEnabled) {
      setActiveSection('home');
    }
  }, [activeSection, isActiveStaff, platformConfig.features]);

  if (loading) {
    return <LoadingScreen />;
  }

  // Unauthenticated visitor: Approved Landing Page or Auth Screen
  if (!user) {
    if (authScreenMode === 'landing') {
      return <LandingPage onOpenAuth={(mode) => setAuthScreenMode(mode)} />;
    }
    return (
      <AuthView
        initialMode={authScreenMode}
        onBackToLanding={() => setAuthScreenMode('landing')}
      />
    );
  }

  // Signed in, awaiting email verification
  if (!emailVerified) {
    return (
      <AuthView
        initialMode="verify-email"
        onBackToLanding={() => setAuthScreenMode('landing')}
      />
    );
  }

  // Verified user profile synchronization / error recovery
  if (!profile) {
    if (profileError) {
      return (
        <div className="min-h-screen bg-[#06060A] text-white flex items-center justify-center p-6">
          <div className="max-w-md w-full rounded-2xl bg-[#0D0B16] border border-amber-500/30 p-7 space-y-5 text-center">
            <div className="flex justify-center">
              <NexoraLogo />
            </div>
            <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-300">
              <AlertTriangle size={22} />
            </div>
            <div className="space-y-2">
              <h1 className="font-display text-xl font-bold text-white">Profile Synchronization Delayed</h1>
              <p className="text-xs text-[#CBD5E1] leading-relaxed">{profileError}</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={() => void retryProfileLoad()}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-xs font-semibold text-white"
              >
                <RefreshCw size={14} /> Retry Sync
              </button>
              <button
                type="button"
                onClick={() => void logoutUser(user?.uid)}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-white"
              >
                <LogOut size={14} /> Sign Out
              </button>
            </div>
          </div>
        </div>
      );
    }
    return <LoadingScreen label="Synchronizing your Nexora profile" />;
  }

  // Suspended account gate (permanent Owner cannot be suspended)
  if (profile.suspended && myRole?.role !== 'owner') {
    return (
      <div className="min-h-screen bg-[#06060A] text-white flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-2xl bg-[#0D0B16] border border-rose-500/30 p-7 space-y-5 text-center">
          <div className="flex justify-center">
            <NexoraLogo />
          </div>
          <div className="w-12 h-12 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center mx-auto text-rose-400">
            <Ban size={22} />
          </div>
          <div className="space-y-2">
            <h1 className="font-display text-xl font-bold text-white">Account Suspended</h1>
            <p className="text-xs text-[#CBD5E1] leading-relaxed">
              Your Nexora account (@{profile.username}) has been suspended by platform moderation.
            </p>
            {profile.suspendedReason && (
              <p className="text-xs text-rose-200 bg-rose-500/10 border border-rose-500/20 rounded-xl p-3">
                Reason: {profile.suspendedReason}
              </p>
            )}
            {platformConfig.supportEmail && (
              <p className="text-[11px] text-[#94A3B8]">
                Appeals & support: {platformConfig.supportEmail}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => void logoutUser(profile.uid)}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-white"
          >
            <LogOut size={14} /> Sign Out
          </button>
        </div>
      </div>
    );
  }

  // Global Maintenance Mode gate (exempts authorized active staff)
  if (platformConfig.maintenanceMode && !isActiveStaff) {
    return (
      <div className="min-h-screen bg-[#06060A] text-white flex items-center justify-center p-6">
        <div className="max-w-lg w-full rounded-2xl bg-[#0D0B16] border border-amber-500/30 p-8 space-y-5 text-center">
          <div className="flex justify-center">
            <NexoraLogo />
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-300">
            <Wrench size={22} />
          </div>
          <div className="space-y-2">
            <h1 className="font-display text-xl font-bold text-white">
              Scheduled Maintenance
            </h1>
            <p className="text-sm text-[#CBD5E1] leading-relaxed">
              {platformConfig.maintenanceMessage}
            </p>
            {platformConfig.supportEmail && (
              <p className="text-xs text-[#94A3B8]">
                Contact: {platformConfig.supportEmail}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => void logoutUser(profile.uid)}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-white"
          >
            <LogOut size={14} /> Sign Out
          </button>
        </div>
      </div>
    );
  }

  if (!profile.onboardingCompleted) {
    return <OnboardingFlow />;
  }

  const handleNavigate = (section: NavSection, targetId?: string, profileTab?: ProfileContentTab) => {
    setOpenAdminSettings(false);
    setActiveSection(section);
    if (section === 'profile') {
      setTargetProfileUid(targetId && targetId !== profile.uid ? targetId : null);
      setTargetProfileTab(profileTab);
    }
    if (section === 'spaces') {
      setTargetSpaceId(targetId || null);
    }
    if (section === 'chat' && targetId) {
      setTargetConvId(targetId);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenUserProfile = (uid: string) => {
    setTargetProfileUid(uid === profile.uid ? null : uid);
    setTargetProfileTab(undefined);
    setActiveSection('profile');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenChatThread = (convId: string) => {
    setTargetConvId(convId);
    setActiveSection('chat');
  };

  return (
    <BadgeModalProvider>
      <DashboardShell
        activeSection={activeSection}
        onNavigate={handleNavigate}
        onOpenUserProfile={handleOpenUserProfile}
        onOpenAdminSettings={() => {
          setOpenAdminSettings(true);
          setActiveSection('settings');
        }}
        notifications={notifications}
        spaces={spaces}
        posts={posts}
        users={users}
      >
        {activeSection === 'home' && (
          <HomePage
            posts={posts}
            stories={stories}
            spaces={spaces}
            users={users}
            savedPostIds={savedPostIds}
            onOpenProfile={handleOpenUserProfile}
            onOpenChatThread={handleOpenChatThread}
          />
        )}

        {activeSection === 'vibes' && (
          <VibesPage
            vibes={vibes}
            users={users}
            savedIds={savedPostIds}
            onOpenProfile={handleOpenUserProfile}
          />
        )}

        {activeSection === 'create' && (
          <CreatePage
            spaces={spaces}
            onDone={(dest) => handleNavigate(dest)}
          />
        )}

        {activeSection === 'chat' && (
          <ChatPage
            users={users}
            stories={stories}
            initialConvId={targetConvId}
          />
        )}

        {activeSection === 'spaces' && (
          <SpacesPage
            spaces={spaces}
            users={users}
            notifications={notifications}
            savedPostIds={savedPostIds}
            initialSpaceId={targetSpaceId}
            onOpenProfile={handleOpenUserProfile}
          />
        )}

        {activeSection === 'profile' && (
          <ProfilePage
            targetUid={targetProfileUid}
            initialTab={targetProfileTab}
            posts={posts}
            vibes={vibes}
            spaces={spaces}
            savedPostIds={savedPostIds}
            onOpenProfile={handleOpenUserProfile}
            onOpenChatThread={handleOpenChatThread}
            onOpenVibes={() => handleNavigate('vibes')}
          />
        )}

        {activeSection === 'settings' && (
          <SettingsPage
            users={users}
            posts={posts}
            vibes={vibes}
            spaces={spaces}
            initialAdminOpen={openAdminSettings}
          />
        )}
      </DashboardShell>
      <BadgeInfoModal />
    </BadgeModalProvider>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <NexoraAppContent />
      </AuthProvider>
    </ErrorBoundary>
  );
}
