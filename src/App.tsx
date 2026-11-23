import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { AlertTriangle, Ban, Gift, LogOut, RefreshCw, Sparkles, Wrench, X } from 'lucide-react';
import { BadgeModalProvider } from './components/badges/BadgeContext';
import { BadgeInfoModal } from './components/badges/BadgeInfoModal';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { LoadingScreen } from './components/common/LoadingScreen';
import { NexoraLogo } from './components/branding/NexoraLogo';
import { DashboardShell } from './components/navigation/DashboardShell';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { PostCard } from './features/posts/PostCard';
import { AuthView } from './pages/auth/AuthView';
import { OnboardingFlow } from './pages/auth/OnboardingFlow';
import { CreatorAnalyticsPage } from './pages/analytics/CreatorAnalyticsPage';
import { ChatPage } from './pages/chat/ChatPage';
import { CreatePage } from './pages/create/CreatePage';
import { HomePage } from './pages/home/HomePage';
import { LandingPage } from './pages/landing/LandingPage';
import { NotificationsPage } from './pages/notifications/NotificationsPage';
import { ProfilePage } from './pages/profile/ProfilePage';
import { SearchDiscoveryPage } from './pages/search/SearchDiscoveryPage';
import { SettingsPage } from './pages/settings/SettingsPage';
import { SpacesPage } from './pages/spaces/SpacesPage';
import { ProfileCustomisationStudio } from './pages/studio/ProfileCustomisationStudio';
import { SubscriptionsPage } from './pages/subscriptions/SubscriptionsPage';
import { VibesPage } from './pages/vibes/VibesPage';
import { logoutUser } from './services/auth/authService';
import {
  getUserByUsername,
  subscribeDirectoryUsers,
  subscribeFeedPosts,
  subscribeFollowingIds,
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
    privateInfo,
    myRole,
    badgesMap,
    platformConfig,
    isAdminDndActive,
    subscription,
    effectiveTier,
    subscriptionPlans,
    userPrefs,
    getUserTier,
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
  const [searchQueryInitial, setSearchQueryInitial] = useState('');
  const [pendingBillingSessionId, setPendingBillingSessionId] = useState<string | null>(null);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);

  // Real-time Firestore state (attached ONLY when auth is ready, email verified & profile synced)
  const [posts, setPosts] = useState<Post[]>([]);
  const [stories, setStories] = useState<Story[]>([]);
  const [vibes, setVibes] = useState<Vibe[]>([]);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [savedPostIds, setSavedPostIds] = useState<string[]>([]);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [deepLinkHandled, setDeepLinkHandled] = useState(false);
  const [incomingGiftToast, setIncomingGiftToast] = useState<NotificationItem | null>(null);
  const seenGiftNotifIdsRef = useRef<Set<string>>(new Set());
  const giftObserverPrimedRef = useRef(false);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (!authReady || !user || !emailVerified || !profile?.uid) {
      seenGiftNotifIdsRef.current.clear();
      giftObserverPrimedRef.current = false;
      setFollowingIds(new Set());
      return;
    }

    const u1 = subscribeFeedPosts(setPosts);
    const u2 = subscribeStories(setStories);
    const u3 = subscribeSpaces(setSpaces);
    const u4 = subscribeDirectoryUsers(setUsers);
    const u5 = subscribeNotifications(user.uid, (items) => {
      setNotifications(items);
      if (!giftObserverPrimedRef.current) {
        items.forEach((n) => {
          if (n.type === 'gift_received') {
            seenGiftNotifIdsRef.current.add(n.id);
          }
        });
        giftObserverPrimedRef.current = true;
        return;
      }

      const freshGift = items.find(
        (n) =>
          n.type === 'gift_received' &&
          !n.read &&
          !seenGiftNotifIdsRef.current.has(n.id)
      );
      if (freshGift) {
        seenGiftNotifIdsRef.current.add(freshGift.id);
        if (!isAdminDndActive) {
          setIncomingGiftToast(freshGift);
        }
      }
    });
    const u6 = subscribeSavedPostIds(user.uid, setSavedPostIds);
    const u7 = subscribeVibes(setVibes);
    const u8 = subscribeFollowingIds(user.uid, setFollowingIds);

    return () => {
      u1();
      u2();
      u3();
      u4();
      u5();
      u6();
      u7();
      u8();
    };
  }, [authReady, user?.uid, emailVerified, profile?.uid, isAdminDndActive]);

  useEffect(() => {
    if (!incomingGiftToast) return;
    const timer = window.setTimeout(() => {
      setIncomingGiftToast(null);
    }, 6500);
    return () => window.clearTimeout(timer);
  }, [incomingGiftToast]);

  useEffect(() => {
    if (deepLinkHandled || !profile?.onboardingCompleted) return;
    const params = new URLSearchParams(window.location.search);
    const billingSessionId =
      params.get('billing_session_id')?.trim() || params.get('session_id')?.trim() || '';
    const billingCanceled = params.get('billing_canceled')?.trim();
    if (billingSessionId) {
      setPendingBillingSessionId(billingSessionId);
      setActiveSection('subscriptions');
      window.history.replaceState({}, '', window.location.pathname);
      setDeepLinkHandled(true);
      return;
    }
    if (billingCanceled) {
      setActiveSection('subscriptions');
      window.history.replaceState({}, '', window.location.pathname);
      setDeepLinkHandled(true);
      return;
    }

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
    setSelectedPostId(null);
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
    if (section === 'search' && typeof targetId === 'string') {
      setSearchQueryInitial(targetId);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenSearch = (query = '') => {
    setSearchQueryInitial(query);
    setActiveSection('search');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenUserProfile = (uid: string) => {
    setSelectedPostId(null);
    setTargetProfileUid(uid === profile.uid ? null : uid);
    setTargetProfileTab(undefined);
    setActiveSection('profile');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenChatThread = (convId: string) => {
    setSelectedPostId(null);
    setTargetConvId(convId);
    setActiveSection('chat');
  };

  const selectedPost = selectedPostId ? posts.find((p) => p.id === selectedPostId) || null : null;

  return (
    <BadgeModalProvider>
      <DashboardShell
        activeSection={activeSection}
        onNavigate={handleNavigate}
        onOpenSearch={handleOpenSearch}
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
            vibes={vibes}
            spaces={spaces}
            users={users}
            notifications={notifications}
            savedPostIds={savedPostIds}
            onOpenProfile={handleOpenUserProfile}
            onOpenChatThread={handleOpenChatThread}
            onNavigate={handleNavigate}
            onOpenVibes={() => handleNavigate('vibes')}
          />
        )}

        {activeSection === 'vibes' && (
          <VibesPage
            vibes={vibes}
            users={users}
            savedIds={savedPostIds}
            onOpenProfile={handleOpenUserProfile}
            onNavigate={handleNavigate}
          />
        )}

        {activeSection === 'create' && (
          <CreatePage
            spaces={spaces}
            users={users}
            onDone={(dest) => handleNavigate(dest)}
          />
        )}

        {activeSection === 'chat' && (
          <ChatPage
            users={users}
            stories={stories}
            initialConvId={targetConvId}
            onOpenProfile={handleOpenUserProfile}
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
            onNavigate={handleNavigate}
          />
        )}

        {activeSection === 'search' && (
          <SearchDiscoveryPage
            currentUser={profile}
            initialQuery={searchQueryInitial}
            directoryUsers={users}
            feedPosts={posts}
            spaces={spaces}
            blockedUserIds={privateInfo?.blockedUserIds || []}
            followingIds={followingIds}
            userPrefs={userPrefs}
            verifiedBadgesMap={badgesMap}
            getUserTier={getUserTier}
            onNavigate={handleNavigate}
            onOpenUserProfile={handleOpenUserProfile}
            onOpenPost={(postId) => setSelectedPostId(postId)}
          />
        )}

        {activeSection === 'notifications' && (
          <NotificationsPage
            uid={profile.uid}
            notifications={notifications}
            privateInfo={privateInfo}
            onNavigate={handleNavigate}
            onOpenUserProfile={handleOpenUserProfile}
            onOpenPost={(postId) => setSelectedPostId(postId)}
          />
        )}

        {activeSection === 'analytics' && (
          <CreatorAnalyticsPage
            profile={profile}
            feedPosts={posts}
            onNavigate={handleNavigate}
          />
        )}

        {activeSection === 'subscriptions' && (
          <SubscriptionsPage
            profile={profile}
            effectiveTier={effectiveTier}
            subscription={subscription}
            plans={subscriptionPlans}
            pendingBillingSessionId={pendingBillingSessionId}
            onClearBillingSessionParam={() => setPendingBillingSessionId(null)}
            onNavigate={handleNavigate}
          />
        )}

        {activeSection === 'studio' && (
          <ProfileCustomisationStudio onNavigate={handleNavigate} />
        )}

        {activeSection === 'settings' && (
          <SettingsPage
            users={users}
            posts={posts}
            vibes={vibes}
            spaces={spaces}
            initialAdminOpen={openAdminSettings}
            onNavigate={handleNavigate}
          />
        )}
      </DashboardShell>

      {/* Deep-Link Post Detail Modal */}
      {selectedPost && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
          onClick={() => setSelectedPostId(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl rounded-2xl bg-[#090712] border border-[#8B5CF6]/30 p-3 sm:p-5 space-y-3 my-auto"
          >
            <div className="flex items-center justify-between px-1">
              <span className="font-display text-sm font-semibold text-white">Post Discussion</span>
              <button
                type="button"
                onClick={() => setSelectedPostId(null)}
                className="p-1.5 rounded-lg hover:bg-white/10 text-[#94A3B8] hover:text-white"
                aria-label="Close post preview"
              >
                <X size={16} />
              </button>
            </div>
            <PostCard
              post={selectedPost}
              isSaved={savedPostIds.includes(selectedPost.id)}
              onOpenProfile={handleOpenUserProfile}
              usersDirectory={users}
            />
          </div>
        </div>
      )}

      <BadgeInfoModal />

      {/* Real-time Incoming Free Gift Celebration Toast */}
      <AnimatePresence>
        {incomingGiftToast && (
          <motion.div
            key={incomingGiftToast.id}
            initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.94 }}
            animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.96 }}
            transition={{ duration: 0.25 }}
            className="fixed bottom-24 sm:bottom-24 right-3 sm:right-6 left-3 sm:left-auto z-50 sm:w-96 p-4 rounded-2xl bg-[#120E22]/95 backdrop-blur-xl border border-pink-400/35 shadow-[0_20px_50px_rgba(0,0,0,0.65)] flex items-start gap-3"
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#7C3AED]/30 to-pink-500/30 border border-pink-400/30 flex items-center justify-center shrink-0">
              <Gift size={18} className="text-pink-300" />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="font-display text-xs font-semibold text-white flex items-center gap-1.5">
                <Sparkles size={12} className="text-amber-300" /> Virtual Gift Received
              </p>
              <p className="text-xs text-[#CBD5E1] leading-snug">
                <span className="font-semibold text-white">{incomingGiftToast.actorName}</span>{' '}
                {incomingGiftToast.preview}
              </p>
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setIncomingGiftToast(null);
                    handleNavigate('profile', profile.uid, 'gifts');
                  }}
                  className="px-3 py-1 rounded-lg bg-gradient-to-r from-[#6D28D9] to-[#9333EA] text-[11px] font-semibold text-white"
                >
                  Open Gifts
                </button>
                <button
                  type="button"
                  onClick={() => setIncomingGiftToast(null)}
                  className="px-2 py-1 text-[11px] text-[#94A3B8] hover:text-white"
                >
                  Dismiss
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIncomingGiftToast(null)}
              className="p-1 text-[#94A3B8] hover:text-white"
              aria-label="Close notification"
            >
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
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
