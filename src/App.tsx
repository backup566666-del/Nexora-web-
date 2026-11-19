import React, { useEffect, useState } from 'react';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { LoadingScreen } from './components/common/LoadingScreen';
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
import {
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

function NexoraAppContent() {
  const { user, profile, loading, authReady } = useAuth();
  const [authScreenMode, setAuthScreenMode] = useState<'landing' | 'login' | 'register'>('landing');
  const [activeSection, setActiveSection] = useState<NavSection>('home');
  const [targetProfileUid, setTargetProfileUid] = useState<string | null>(null);
  const [targetSpaceId, setTargetSpaceId] = useState<string | null>(null);
  const [targetConvId, setTargetConvId] = useState<string | null>(null);

  // Real-time Firestore state (attached ONLY when auth is ready & user verified)
  const [posts, setPosts] = useState<Post[]>([]);
  const [stories, setStories] = useState<Story[]>([]);
  const [vibes, setVibes] = useState<Vibe[]>([]);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [savedPostIds, setSavedPostIds] = useState<string[]>([]);

  useEffect(() => {
    if (!authReady || !user || !user.emailVerified) return;

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
  }, [authReady, user?.uid, user?.emailVerified]);

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
  if (!user.emailVerified) {
    return (
      <AuthView
        initialMode="verify-email"
        onBackToLanding={() => setAuthScreenMode('landing')}
      />
    );
  }

  // Verified user completing profile onboarding
  if (!profile) {
    return <LoadingScreen label="Synchronizing your Nexora profile" />;
  }

  if (!profile.onboardingCompleted) {
    return <OnboardingFlow />;
  }

  const handleNavigate = (section: NavSection, targetId?: string) => {
    setActiveSection(section);
    if (section === 'profile') {
      setTargetProfileUid(targetId || null);
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
    setActiveSection('profile');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenChatThread = (convId: string) => {
    setTargetConvId(convId);
    setActiveSection('chat');
  };

  return (
    <DashboardShell
      activeSection={activeSection}
      onNavigate={handleNavigate}
      onOpenUserProfile={handleOpenUserProfile}
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
          posts={posts}
          vibes={vibes}
          spaces={spaces}
          savedPostIds={savedPostIds}
          onOpenProfile={handleOpenUserProfile}
          onOpenChatThread={handleOpenChatThread}
          onOpenVibes={() => handleNavigate('vibes')}
        />
      )}

      {activeSection === 'settings' && <SettingsPage users={users} />}
    </DashboardShell>
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
