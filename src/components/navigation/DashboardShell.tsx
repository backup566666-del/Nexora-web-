import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Award,
  Banknote,
  BarChart3,
  Bell,
  Compass,
  CreditCard,
  Film,
  Gift,
  Heart,
  History,
  Home,
  LayoutGrid,
  LogOut,
  Megaphone,
  MessageSquare,
  Monitor,
  Moon,
  Palette,
  PlusSquare,
  Search,
  Settings,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Sun,
  Tag,
  User as UserIcon,
  UserPlus,
  Wallet,
  X,
} from 'lucide-react';
import { NexoraLogo } from '../branding/NexoraLogo';
import { FloatingBottomDock } from './FloatingBottomDock';
import { OfflineIndicator } from '../common/OfflineIndicator';
import { PresenceBadge } from '../common/PresenceBadge';
import { PWAInstallButton } from '../common/PWAInstallButton';
import { ResilientImage } from '../common/ResilientImage';
import { TierBadge } from '../common/TierBadge';
import { BadgeStrip } from '../common/VerifiedBadge';
import { CustomisedAvatar } from '../profile/CustomisedAvatar';
import { useAuth } from '../../hooks/useAuth';
import { useTheme } from '../../hooks/useTheme';
import { logoutUser } from '../../services/auth/authService';
import {
  markAllNotificationsRead,
  markNotificationRead,
  searchDirectoryUsers,
} from '../../services/firebase/socialService';
import {
  NavSection,
  NotificationCategory,
  NotificationItem,
  Post,
  ProfileContentTab,
  Space,
  UserProfile,
} from '../../types/nexora';
import { inferCategoryFromNotificationType } from '../../services/notifications/notificationDispatcher';
import { formatRelativeTime, isPersonalTimelinePost } from '../../utils/validation';

interface DashboardShellProps {
  activeSection: NavSection;
  onNavigate: (section: NavSection, targetId?: string, profileTab?: ProfileContentTab) => void;
  onOpenSearch?: (query?: string) => void;
  onOpenAdminSettings?: () => void;
  onOpenCustomizeHomepage?: () => void;
  onOpenUserProfile: (uid: string) => void;
  notifications: NotificationItem[];
  spaces: Space[];
  posts: Post[];
  users: UserProfile[];
  children: React.ReactNode;
}

const MOBILE_NAV_ITEMS: {
  id: NavSection;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
}[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'vibes', label: 'Vibes', icon: Film },
  { id: 'create', label: 'Create', icon: PlusSquare },
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'spaces', label: 'Spaces', icon: Compass },
  { id: 'profile', label: 'Profile', icon: UserIcon },
];

const DESKTOP_PRIMARY_NAV: {
  id: NavSection;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}[] = [
  { id: 'home', label: 'Home Feed', icon: Home },
  { id: 'vibes', label: 'Vibes', icon: Film },
  { id: 'spaces', label: 'Spaces', icon: Compass },
  { id: 'chat', label: 'Messages', icon: MessageSquare },
  { id: 'create', label: 'Create', icon: PlusSquare },
  { id: 'search', label: 'Explore', icon: Search },
  { id: 'notifications', label: 'Notifications', icon: Bell },
];

const DESKTOP_STUDIO_NAV: {
  id: NavSection;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  accent?: boolean;
}[] = [
  { id: 'analytics', label: 'Creator Analytics', icon: BarChart3 },
  { id: 'studio', label: 'Profile Studio', icon: Palette },
  { id: 'ai', label: 'Nexora AI Studio', icon: Sparkles, accent: true },
  { id: 'subscriptions', label: 'Membership', icon: CreditCard },
  { id: 'settings', label: 'Settings', icon: Settings },
];

const DESKTOP_REWARDS_NAV: {
  id: NavSection;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}[] = [
  { id: 'invite', label: 'Invite Friends', icon: UserPlus },
  { id: 'tasks', label: 'Tasks & Rewards', icon: Gift },
  { id: 'wallet', label: 'Nexora Wallet', icon: Wallet },
  { id: 'rewards-history', label: 'Rewards History', icon: History },
];

const SECTION_LABELS: Record<NavSection, string> = {
  home: 'Home Feed',
  vibes: 'Vibes',
  create: 'Create Studio',
  chat: 'Messages',
  spaces: 'Spaces',
  profile: 'Profile',
  settings: 'Settings',
  search: 'Search & Discovery',
  notifications: 'Notification Centre',
  analytics: 'Creator Analytics',
  subscriptions: 'Nexora Membership',
  studio: 'Profile Studio',
  ai: 'Nexora AI Studio',
  invite: 'Invite Friends',
  tasks: 'Tasks & Rewards',
  wallet: 'Nexora Wallet',
  'rewards-history': 'Rewards History',
};

const NOTIF_FILTERS: { id: 'all' | 'unread' | NotificationCategory; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'social', label: 'Social' },
  { id: 'spaces', label: 'Spaces' },
  { id: 'rewards', label: 'Rewards' },
  { id: 'badges', label: 'Badges' },
  { id: 'gifts', label: 'Gifts' },
  { id: 'admin', label: 'Admin' },
  { id: 'security', label: 'Security' },
];

function NotificationGlyph({ type }: { type: NotificationItem['type'] }) {
  switch (type) {
    case 'gift_received':
      return <Gift size={12} className="text-pink-400" />;
    case 'badge_awarded':
    case 'verification_decision':
    case 'identity_decision':
      return <Award size={12} className="text-sky-400" />;
    case 'collab_invite':
    case 'collab_response':
    case 'post_tag':
      return <Tag size={12} className="text-[#C084FC]" />;
    case 'security_alert':
      return <ShieldAlert size={12} className="text-rose-400" />;
    case 'referral_reward':
      return <UserPlus size={12} className="text-emerald-400" />;
    case 'task_reward':
      return <Gift size={12} className="text-amber-300" />;
    case 'withdrawal_update':
    case 'wallet_adjustment':
      return <Banknote size={12} className="text-emerald-400" />;
    case 'staff_role_change':
    case 'admin_notice':
    case 'announcement':
      return <Megaphone size={12} className="text-amber-300" />;
    default:
      return <Heart size={12} className="text-[#A855F7]" />;
  }
}

export function DashboardShell({
  activeSection,
  onNavigate,
  onOpenSearch,
  onOpenAdminSettings,
  onOpenCustomizeHomepage,
  onOpenUserProfile,
  notifications,
  spaces,
  posts,
  users,
  children,
}: DashboardShellProps) {
  const {
    profile,
    myRole,
    myAdminSelfStatus,
    announcements,
    platformConfig,
    effectiveTier,
    getUserBadges,
    isUserOfficialOwner,
  } = useAuth();
  const { themeMode, cycleThemeMode } = useTheme();
  const [dockVisible, setDockVisible] = useState(true);
  const lastScrollY = useRef(0);
  const scrollDeltaAccumRef = useRef(0);
  const scrollRafRef = useRef<number | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [remoteSearchUsers, setRemoteSearchUsers] = useState<UserProfile[]>([]);
  const [searchFocused, setSearchFocused] = useState(false);
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const [showNotifs, setShowNotifs] = useState(false);
  const [notifFilter, setNotifFilter] = useState<'all' | 'unread' | NotificationCategory>('all');
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [dismissedAnnouncementIds, setDismissedAnnouncementIds] = useState<string[]>([]);
  const [navTransitionTick, setNavTransitionTick] = useState(0);
  const prevSectionRef = useRef(activeSection);

  useEffect(() => {
    if (prevSectionRef.current !== activeSection) {
      prevSectionRef.current = activeSection;
      setNavTransitionTick((n) => n + 1);
    }
  }, [activeSection]);

  useEffect(() => {
    const clean = searchQuery.trim();
    if (clean.length < 2) {
      setRemoteSearchUsers([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const results = await searchDirectoryUsers(clean, 8).catch(() => []);
      if (!cancelled) setRemoteSearchUsers(results);
    }, 240);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [searchQuery]);

  useEffect(() => {
    setDockVisible(true);
    lastScrollY.current = window.scrollY;
    scrollDeltaAccumRef.current = 0;

    if (activeSection === 'vibes' || activeSection === 'chat') {
      return;
    }

    const processScroll = () => {
      scrollRafRef.current = null;
      const currentY = Math.max(0, window.scrollY);
      const delta = currentY - lastScrollY.current;
      lastScrollY.current = currentY;

      if (Math.abs(delta) < 2) return;
      if (
        (delta > 0 && scrollDeltaAccumRef.current < 0) ||
        (delta < 0 && scrollDeltaAccumRef.current > 0)
      ) {
        scrollDeltaAccumRef.current = 0;
      }
      scrollDeltaAccumRef.current += delta;

      if (currentY <= 48) {
        setDockVisible(true);
        scrollDeltaAccumRef.current = 0;
      } else if (scrollDeltaAccumRef.current > 24 && currentY > 72) {
        setDockVisible(false);
        scrollDeltaAccumRef.current = 0;
      } else if (scrollDeltaAccumRef.current < -12) {
        setDockVisible(true);
        scrollDeltaAccumRef.current = 0;
      }
    };

    const handleScroll = () => {
      if (scrollRafRef.current === null) {
        scrollRafRef.current = window.requestAnimationFrame(processScroll);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (scrollRafRef.current !== null) window.cancelAnimationFrame(scrollRafRef.current);
    };
  }, [activeSection]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  const unreadChatCount = useMemo(
    () => notifications.filter((n) => !n.read && n.type === 'message').length,
    [notifications]
  );

  const filteredNotifications = useMemo(() => {
    if (notifFilter === 'all') return notifications;
    if (notifFilter === 'unread') return notifications.filter((n) => !n.read);
    return notifications.filter(
      (n) => (n.category || inferCategoryFromNotificationType(n.type)) === notifFilter
    );
  }, [notifications, notifFilter]);

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return { users: [], spaces: [], posts: [] };
    const localMatches = users.filter(
      (u) =>
        u.displayName.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q)
    );
    const mergedUsersMap = new Map<string, UserProfile>();
    localMatches.forEach((u) => mergedUsersMap.set(u.uid, u));
    remoteSearchUsers.forEach((u) => {
      if (!mergedUsersMap.has(u.uid)) mergedUsersMap.set(u.uid, u);
    });
    return {
      users: Array.from(mergedUsersMap.values()).slice(0, 5),
      spaces: spaces
        .filter(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            s.category.toLowerCase().includes(q)
        )
        .slice(0, 3),
      posts: posts
        .filter((p) => isPersonalTimelinePost(p) && p.text.toLowerCase().includes(q))
        .slice(0, 3),
    };
  }, [searchQuery, users, remoteSearchUsers, spaces, posts]);

  const isActiveStaff = Boolean(myRole && myRole.active);
  const visibleMobileNavItems = useMemo(() => {
    return MOBILE_NAV_ITEMS.filter((item) => {
      if (isActiveStaff) return true;
      if (item.id === 'vibes' && !platformConfig.features.vibesEnabled) return false;
      if (item.id === 'spaces' && !platformConfig.features.spacesEnabled) return false;
      if (item.id === 'chat' && !platformConfig.features.chatEnabled) return false;
      return true;
    });
  }, [isActiveStaff, platformConfig.features]);

  const visibleDesktopPrimaryNav = useMemo(() => {
    return DESKTOP_PRIMARY_NAV.filter((item) => {
      if (isActiveStaff) return true;
      if (item.id === 'vibes' && !platformConfig.features.vibesEnabled) return false;
      if (item.id === 'spaces' && !platformConfig.features.spacesEnabled) return false;
      if (item.id === 'chat' && !platformConfig.features.chatEnabled) return false;
      return true;
    });
  }, [isActiveStaff, platformConfig.features]);

  const activeBannerAnnouncements = useMemo(
    () =>
      announcements.filter(
        (a) => a.active && !dismissedAnnouncementIds.includes(a.id)
      ),
    [announcements, dismissedAnnouncementIds]
  );

  if (!profile) return null;

  const selfBadges = getUserBadges(profile.uid, profile.verified);

  const handleNotificationClick = async (n: NotificationItem) => {
    if (!n.read) {
      void markNotificationRead(n.id);
    }
    setShowNotifs(false);
    if (
      n.category === 'spaces' ||
      n.targetType === 'space' ||
      n.type === 'space_invite' ||
      n.type === 'space_announcement' ||
      n.type === 'event_reminder' ||
      n.type === 'community_status'
    ) {
      onNavigate('spaces', n.targetId || undefined);
    } else if (n.type === 'message' && n.targetId) {
      onNavigate('chat', n.targetId);
    } else if (n.type === 'follow' && n.actorId) {
      onOpenUserProfile(n.actorId);
    } else if (n.type === 'gift_received') {
      onNavigate('profile', profile.uid, 'gifts');
    } else if (n.type === 'collab_invite') {
      onNavigate('profile', profile.uid, 'collabs');
    } else if (n.type === 'post_tag') {
      onNavigate('profile', profile.uid, 'tagged');
    } else if (
      n.type === 'badge_awarded' ||
      n.type === 'verification_decision' ||
      n.type === 'identity_decision'
    ) {
      onNavigate('profile', profile.uid, 'posts');
    } else if (n.type === 'referral_reward') {
      onNavigate('invite');
    } else if (n.type === 'task_reward') {
      onNavigate('tasks');
    } else if (n.type === 'withdrawal_update' || n.type === 'wallet_adjustment') {
      onNavigate('wallet');
    } else if (
      n.type === 'staff_role_change' ||
      n.type === 'security_alert' ||
      n.type === 'admin_notice' ||
      n.type === 'announcement'
    ) {
      onNavigate('settings');
    } else {
      onNavigate('home');
    }
  };

  return (
    <div className="min-h-screen bg-[#06060A] text-[#F8FAFC] flex relative">
      {/* Subtle atmospheric top glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-0 h-72 bg-[radial-gradient(ellipse_75%_55%_at_55%_-10%,rgba(124,58,237,0.14),transparent)] z-0"
      />

      {/* Desktop Left Navigation Rail */}
      <aside className="hidden lg:flex lg:flex-col lg:w-[232px] xl:w-[252px] shrink-0 border-r border-white/[0.07] bg-[#08070F]/95 backdrop-blur-xl sticky top-0 h-screen z-30">
        <div className="h-14 px-5 flex items-center justify-between border-b border-white/[0.06] shrink-0">
          <button
            type="button"
            onClick={() => onNavigate('home')}
            className="focus-visible:outline-none"
          >
            <NexoraLogo
              variant="horizontal"
              size="sm"
              animation={navTransitionTick > 0 ? 'transition' : 'ambient'}
              replayKey={navTransitionTick}
            />
          </button>
        </div>

        <nav
          aria-label="Primary desktop navigation"
          className="flex-1 overflow-y-auto px-3 py-4 space-y-6 no-scrollbar"
        >
          <div className="space-y-1">
            {visibleDesktopPrimaryNav.map((item) => {
              const Icon = item.icon;
              const active = activeSection === item.id;
              const count =
                item.id === 'chat'
                  ? unreadChatCount
                  : item.id === 'notifications'
                  ? unreadCount
                  : 0;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  aria-current={active ? 'page' : undefined}
                  className={`w-full flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-xl text-[13px] transition-all whitespace-nowrap ${
                    active
                      ? 'bg-[#7C3AED]/20 border border-[#8B5CF6]/40 text-white font-semibold shadow-[0_4px_18px_rgba(124,58,237,0.2)]'
                      : 'border border-transparent text-[#94A3B8] hover:text-white hover:bg-white/[0.04] font-medium'
                  }`}
                >
                  <span className="flex items-center gap-3 min-w-0">
                    <Icon
                      size={17}
                      className={active ? 'text-[#C084FC] shrink-0' : 'text-[#7C6E9B] shrink-0'}
                    />
                    <span className="truncate">{item.label}</span>
                  </span>
                  {count > 0 && (
                    <span
                      className={`font-mono-tabular text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                        item.id === 'chat'
                          ? 'bg-emerald-400 text-[#06060A]'
                          : 'bg-[#7C3AED] text-white'
                      }`}
                    >
                      {count > 99 ? '99+' : count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="pt-4 border-t border-white/[0.06] space-y-1">
            <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[#64748B]">
              Rewards &amp; Wallet
            </p>
            {DESKTOP_REWARDS_NAV.map((item) => {
              const Icon = item.icon;
              const active = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  aria-current={active ? 'page' : undefined}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-[13px] transition-all whitespace-nowrap ${
                    active
                      ? 'bg-[#7C3AED]/20 border border-[#8B5CF6]/40 text-white font-semibold'
                      : 'border border-transparent text-[#94A3B8] hover:text-white hover:bg-white/[0.04] font-medium'
                  }`}
                >
                  <Icon
                    size={16}
                    className={active ? 'text-[#C084FC] shrink-0' : 'text-[#64748B] shrink-0'}
                  />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </div>

          <div className="pt-4 border-t border-white/[0.06] space-y-1">
            <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[#64748B]">
              Studio &amp; Platform
            </p>
            {DESKTOP_STUDIO_NAV.map((item) => {
              const Icon = item.icon;
              const active = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  aria-current={active ? 'page' : undefined}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-[13px] transition-all whitespace-nowrap ${
                    active
                      ? 'bg-[#7C3AED]/20 border border-[#8B5CF6]/40 text-white font-semibold'
                      : item.accent
                      ? 'border border-transparent text-[#E9D5FF] hover:bg-[#7C3AED]/15 font-medium'
                      : 'border border-transparent text-[#94A3B8] hover:text-white hover:bg-white/[0.04] font-medium'
                  }`}
                >
                  <Icon
                    size={16}
                    className={
                      active || item.accent ? 'text-[#C084FC] shrink-0' : 'text-[#64748B] shrink-0'
                    }
                  />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
            {onOpenCustomizeHomepage && (
              <button
                type="button"
                onClick={onOpenCustomizeHomepage}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-[13px] border border-transparent text-[#94A3B8] hover:text-white hover:bg-white/[0.04] font-medium transition-all whitespace-nowrap"
              >
                <LayoutGrid size={16} className="text-[#C084FC] shrink-0" />
                <span className="truncate">Customize Homepage</span>
              </button>
            )}
          </div>
        </nav>

        {/* Bottom Profile Identity Card */}
        <div className="p-3 border-t border-white/[0.06] shrink-0">
          <button
            type="button"
            onClick={() => onNavigate('profile')}
            className={`w-full flex items-center gap-2.5 p-2 rounded-xl border transition-colors text-left ${
              activeSection === 'profile'
                ? 'bg-[#7C3AED]/15 border-[#8B5CF6]/40'
                : 'bg-[#0D0B16]/80 border-white/[0.07] hover:border-[#8B5CF6]/35'
            }`}
          >
            <div className="relative shrink-0">
              <CustomisedAvatar
                src={profile.avatarUrl}
                alt={profile.displayName}
                sizeClass="w-9 h-9"
                customisation={profile.profileCustomisation}
              />
              {isActiveStaff && (
                <span className="absolute -bottom-0.5 -right-0.5">
                  <PresenceBadge status={myAdminSelfStatus} size="xs" showOffline />
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-white truncate flex items-center gap-1">
                <span className="truncate">{profile.displayName}</span>
                <BadgeStrip badges={selfBadges} size={11} max={1} interactive={false} />
              </p>
              <p className="text-[11px] text-[#94A3B8] truncate">
                @{profile.username}
              </p>
            </div>
            <TierBadge tier={effectiveTier} showFree={false} size="xs" />
          </button>
        </div>
      </aside>

      {/* Main Column */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Utility Header (Hidden on mobile Vibes for true full-screen short-video feel) */}
        <header
          className={`sticky top-0 z-40 border-b border-white/[0.07] bg-[#08070F]/90 backdrop-blur-xl ${
            activeSection === 'vibes' ? 'hidden lg:block' : 'block'
          }`}
        >
          <div className="max-w-[1680px] mx-auto px-3 sm:px-5 lg:px-7 h-12 lg:h-14 flex items-center justify-between gap-2 sm:gap-4">
            {/* Left: Mobile Logo + Section Heading */}
            <div className="flex items-center gap-2.5 min-w-0">
              <button
                type="button"
                onClick={() => onNavigate('home')}
                className="lg:hidden shrink-0 focus-visible:outline-none"
                aria-label="Nexora Home"
              >
                <NexoraLogo
                  variant="icon"
                  size="xs"
                  animation={navTransitionTick > 0 ? 'transition' : 'ambient'}
                  replayKey={navTransitionTick}
                />
              </button>
              <h1 className="font-display text-sm sm:text-base font-semibold text-white tracking-tight truncate">
                {SECTION_LABELS[activeSection]}
              </h1>
            </div>

            {/* Right: Mobile Earn/Invite, Inline Search (md+), Alerts, Settings shortcut, Account */}
            <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
              <div className="hidden md:block">
                <PWAInstallButton variant="compact" />
              </div>

              {/* Mobile & Tablet Quick Access: Tasks & Invite */}
              <button
                type="button"
                onClick={() => onNavigate('tasks')}
                aria-label="Tasks & Rewards"
                title="Tasks & Rewards"
                className={`lg:hidden min-h-[38px] px-2.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                  activeSection === 'tasks'
                    ? 'bg-[#7C3AED] border-[#8B5CF6] text-white'
                    : 'bg-[#0E0C18] border-white/[0.08] text-amber-300 hover:border-[#8B5CF6]/45'
                }`}
              >
                <Gift size={14} />
                <span className="hidden xs:inline sm:inline">Tasks</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigate('invite')}
                aria-label="Invite Friends"
                title="Invite Friends"
                className={`lg:hidden min-h-[38px] px-2.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                  activeSection === 'invite'
                    ? 'bg-[#7C3AED] border-[#8B5CF6] text-white'
                    : 'bg-[#0E0C18] border-white/[0.08] text-emerald-300 hover:border-[#8B5CF6]/45'
                }`}
              >
                <UserPlus size={14} />
                <span className="hidden sm:inline">Invite</span>
              </button>

              {/* Mobile Search Trigger */}
              <button
                type="button"
                onClick={() => {
                  setShowMobileSearch(true);
                  setShowNotifs(false);
                  setShowAccountMenu(false);
                }}
                aria-label="Search Nexora"
                className="md:hidden min-w-[40px] min-h-[40px] rounded-xl bg-[#0E0C18] border border-white/[0.08] hover:border-[#8B5CF6]/45 text-[#CBD5E1] hover:text-white flex items-center justify-center transition-colors"
              >
                <Search size={16} />
              </button>

              {/* Inline Search Input (Tablet & Desktop) */}
              <div className="relative hidden md:block w-56 lg:w-72 xl:w-80">
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7C6E9B]"
                />
                <input
                  type="text"
                  value={searchQuery}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setTimeout(() => setSearchFocused(false), 180)}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      setSearchFocused(false);
                      if (onOpenSearch) onOpenSearch(searchQuery.trim());
                      else onNavigate('search', searchQuery.trim());
                    }
                  }}
                  placeholder="Search people, spaces, posts..."
                  className="w-full pl-9 pr-8 py-1.5 rounded-xl bg-[#0E0C18] border border-white/[0.09] focus:border-[#8B5CF6] outline-none text-xs text-white placeholder:text-[#64748B] transition-colors h-9"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-white"
                    aria-label="Clear search"
                  >
                    <X size={13} />
                  </button>
                )}

                {searchFocused && searchQuery.trim().length > 0 && (
                  <div className="absolute right-0 mt-2 w-80 bg-[#0E0C18] border border-[#8B5CF6]/25 rounded-2xl shadow-2xl p-3 space-y-3 z-50">
                    {searchResults.users.length === 0 &&
                    searchResults.spaces.length === 0 &&
                    searchResults.posts.length === 0 ? (
                      <p className="text-xs text-[#64748B] px-2 py-3 text-center">
                        No matches found for &ldquo;{searchQuery}&rdquo;
                      </p>
                    ) : (
                      <>
                        {searchResults.users.length > 0 && (
                          <div className="space-y-1">
                            <p className="text-[11px] font-semibold text-[#94A3B8] px-2">People</p>
                            {searchResults.users.map((u) => (
                              <button
                                key={u.uid}
                                type="button"
                                onClick={() => {
                                  onOpenUserProfile(u.uid);
                                  setSearchQuery('');
                                }}
                                className="w-full flex items-center gap-2.5 p-2 rounded-xl hover:bg-[#7C3AED]/15 text-left transition-colors"
                              >
                                <ResilientImage
                                  src={u.avatarUrl}
                                  alt={u.displayName}
                                  className="w-8 h-8 rounded-full object-cover shrink-0"
                                />
                                <div className="min-w-0">
                                  <p className="text-xs font-semibold text-white truncate inline-flex items-center gap-1">
                                    <span className="truncate">{u.displayName}</span>
                                    <BadgeStrip
                                      badges={getUserBadges(u.uid, u.verified)}
                                      size={12}
                                      max={2}
                                      interactive={false}
                                    />
                                    {isUserOfficialOwner(u.uid, u) && (
                                      <ShieldCheck
                                        size={12}
                                        className="text-[#C084FC] shrink-0"
                                        aria-label="Official Nexora Account"
                                      />
                                    )}
                                  </p>
                                  <p className="text-[11px] text-[#94A3B8] truncate">@{u.username}</p>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                        {searchResults.spaces.length > 0 && (
                          <div className="space-y-1">
                            <p className="text-[11px] font-semibold text-[#94A3B8] px-2">Spaces</p>
                            {searchResults.spaces.map((s) => (
                              <button
                                key={s.id}
                                type="button"
                                onClick={() => {
                                  onNavigate('spaces', s.id);
                                  setSearchQuery('');
                                }}
                                className="w-full flex items-center justify-between p-2 rounded-xl hover:bg-[#7C3AED]/15 text-left transition-colors"
                              >
                                <span className="text-xs font-medium text-white truncate">
                                  {s.name}
                                </span>
                                <span className="text-[11px] text-[#94A3B8] shrink-0 font-mono-tabular">
                                  {s.membersCount} members
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                        {searchResults.posts.length > 0 && (
                          <div className="space-y-1">
                            <p className="text-[11px] font-semibold text-[#94A3B8] px-2">Posts</p>
                            {searchResults.posts.map((p) => (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => {
                                  onNavigate('home');
                                  setSearchQuery('');
                                }}
                                className="w-full p-2 rounded-xl hover:bg-[#7C3AED]/15 text-left transition-colors"
                              >
                                <p className="text-xs text-white truncate">{p.text}</p>
                                <p className="text-[11px] text-[#64748B] truncate">
                                  by {p.authorName}
                                </p>
                              </button>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setSearchFocused(false);
                        if (onOpenSearch) onOpenSearch(searchQuery.trim());
                        else onNavigate('search', searchQuery.trim());
                      }}
                      className="w-full py-2 px-3 rounded-xl bg-[#7C3AED]/20 border border-[#8B5CF6]/30 text-xs font-semibold text-[#E9D5FF] hover:bg-[#7C3AED]/30 transition-colors"
                    >
                      Explore full results
                    </button>
                  </div>
                )}
              </div>

              {/* Quick Global Theme Mode Toggle (Dark / Light / System) */}
              <button
                type="button"
                onClick={() => void cycleThemeMode()}
                title={`Theme: ${themeMode === 'dark' ? 'Dark' : themeMode === 'light' ? 'Light' : 'System'} (click to switch)`}
                aria-label={`Switch theme (current: ${themeMode})`}
                className="min-w-[40px] min-h-[40px] px-2.5 rounded-xl bg-[#0E0C18] border border-white/[0.08] hover:border-[#8B5CF6]/45 text-[#CBD5E1] hover:text-white flex items-center justify-center gap-1.5 transition-colors text-xs font-medium"
              >
                {themeMode === 'light' ? (
                  <Sun size={15} className="text-amber-300" />
                ) : themeMode === 'system' ? (
                  <Monitor size={15} className="text-sky-300" />
                ) : (
                  <Moon size={15} className="text-[#C084FC]" />
                )}
                <span className="hidden xl:inline capitalize">{themeMode}</span>
              </button>

              {/* Notifications Center */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setShowNotifs((v) => !v);
                    setShowAccountMenu(false);
                  }}
                  aria-label="Notifications"
                  className="relative min-w-[40px] min-h-[40px] rounded-xl bg-[#0E0C18] border border-white/[0.08] hover:border-[#8B5CF6]/45 text-[#CBD5E1] hover:text-white flex items-center justify-center transition-colors"
                >
                  <Bell size={16} />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[17px] h-[17px] px-1 rounded-full bg-gradient-to-r from-[#7C3AED] to-[#A855F7] text-[10px] font-bold text-white flex items-center justify-center font-mono-tabular">
                      {unreadCount}
                    </span>
                  )}
                </button>

                {showNotifs && (
                  <div className="fixed inset-x-3 top-14 sm:absolute sm:inset-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-96 bg-[#0E0C18] border border-[#8B5CF6]/25 rounded-2xl shadow-2xl overflow-hidden z-50">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                      <span className="font-display text-sm font-semibold text-white">
                        Notifications {unreadCount > 0 ? `(${unreadCount})` : ''}
                      </span>
                      <div className="flex items-center gap-3">
                        {unreadCount > 0 && (
                          <button
                            type="button"
                            onClick={() => void markAllNotificationsRead(notifications)}
                            className="text-xs text-[#C084FC] hover:underline"
                          >
                            Mark all read
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setShowNotifs(false);
                            onNavigate('settings');
                          }}
                          className="text-xs text-[#94A3B8] hover:text-white"
                        >
                          Preferences
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 px-3 py-2 border-b border-white/[0.06] overflow-x-auto no-scrollbar">
                      {NOTIF_FILTERS.map((flt) => (
                        <button
                          key={flt.id}
                          type="button"
                          onClick={() => setNotifFilter(flt.id)}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold whitespace-nowrap transition-colors ${
                            notifFilter === flt.id
                              ? 'bg-[#7C3AED] text-white'
                              : 'bg-white/[0.04] text-[#94A3B8] hover:text-white'
                          }`}
                        >
                          {flt.label}
                        </button>
                      ))}
                    </div>

                    <div className="max-h-80 overflow-y-auto divide-y divide-white/[0.06]">
                      {filteredNotifications.length === 0 ? (
                        <p className="text-xs text-[#64748B] py-8 text-center">
                          No notifications in this filter.
                        </p>
                      ) : (
                        filteredNotifications.map((n) => (
                          <button
                            key={n.id}
                            type="button"
                            onClick={() => void handleNotificationClick(n)}
                            className={`w-full text-left p-3.5 flex items-start gap-3 text-xs hover:bg-white/[0.03] transition-colors ${
                              n.read ? 'opacity-70' : 'bg-[#7C3AED]/10'
                            }`}
                          >
                            <div className="relative shrink-0">
                              <ResilientImage
                                src={n.actorAvatar}
                                alt={n.actorName}
                                className="w-8 h-8 rounded-full object-cover"
                              />
                              <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-[#0D0B16] border border-white/15 flex items-center justify-center">
                                <NotificationGlyph type={n.type} />
                              </span>
                            </div>
                            <div className="min-w-0 flex-1 space-y-0.5">
                              <p className="text-white leading-snug">
                                <span className="font-semibold">{n.actorName}</span>{' '}
                                <span className="text-[#CBD5E1]">{n.preview}</span>
                              </p>
                              <p className="text-[11px] text-[#64748B]">
                                {formatRelativeTime(n.createdAt)}
                              </p>
                            </div>
                          </button>
                        ))
                      )}
                    </div>

                    <div className="px-4 py-2.5 border-t border-white/10 bg-[#0A0812]">
                      <button
                        type="button"
                        onClick={() => {
                          setShowNotifs(false);
                          onNavigate('notifications');
                        }}
                        className="w-full py-2 rounded-xl bg-[#7C3AED]/20 border border-[#8B5CF6]/30 text-xs font-semibold text-[#E9D5FF] hover:bg-[#7C3AED]/30 transition-colors"
                      >
                        Open Notification Centre
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Mobile Settings Button (Desktop already has Settings in Left Rail + Menu) */}
              <button
                type="button"
                onClick={() => onNavigate('settings')}
                aria-label="Settings"
                className={`lg:hidden min-w-[40px] min-h-[40px] rounded-xl border transition-colors flex items-center justify-center ${
                  activeSection === 'settings'
                    ? 'bg-[#7C3AED] border-[#8B5CF6] text-white'
                    : 'bg-[#0E0C18] border-white/[0.08] text-[#CBD5E1] hover:text-white'
                }`}
              >
                <Settings size={16} />
              </button>

              {/* Account Dropdown Menu */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setShowAccountMenu((v) => !v);
                    setShowNotifs(false);
                  }}
                  className="flex items-center gap-2 p-1 sm:pl-1.5 sm:pr-2.5 rounded-xl bg-[#0E0C18] border border-white/[0.08] hover:border-[#8B5CF6]/45 transition-colors min-h-[40px]"
                >
                  <div className="relative shrink-0">
                    <ResilientImage
                      src={profile.avatarUrl}
                      alt={profile.displayName}
                      className="w-7 h-7 rounded-full object-cover ring-1 ring-[#8B5CF6]/50"
                    />
                    {isActiveStaff && (
                      <span className="absolute -bottom-0.5 -right-0.5">
                        <PresenceBadge status={myAdminSelfStatus} size="xs" showOffline />
                      </span>
                    )}
                  </div>
                  <span className="hidden sm:inline text-xs font-medium text-white max-w-[115px] truncate">
                    {profile.displayName}
                  </span>
                </button>

                {showAccountMenu && (
                  <div className="absolute right-0 mt-2 w-64 max-w-[calc(100vw-1.5rem)] bg-[#0E0C18] border border-[#8B5CF6]/25 rounded-2xl shadow-2xl p-2 space-y-1 z-50">
                    <div className="px-3 py-2.5 border-b border-white/10">
                      <p className="text-xs font-semibold text-white truncate flex items-center gap-1.5">
                        <span className="truncate">{profile.displayName}</span>
                        <BadgeStrip badges={selfBadges} size={13} max={3} interactive={false} />
                        <TierBadge tier={effectiveTier} showFree={false} size="xs" />
                      </p>
                      <p className="text-[11px] text-[#94A3B8] truncate">@{profile.username}</p>
                      {isActiveStaff && (
                        <div className="pt-1.5">
                          <PresenceBadge status={myAdminSelfStatus} size="xs" showOffline showLabel />
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setShowAccountMenu(false);
                        onNavigate('profile');
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-[#E2E8F0] hover:bg-[#7C3AED]/15 text-left"
                    >
                      <UserIcon size={14} /> View Profile
                    </button>
                    {onOpenCustomizeHomepage && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowAccountMenu(false);
                          onOpenCustomizeHomepage();
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-[#E9D5FF] hover:bg-[#7C3AED]/15 text-left font-medium"
                      >
                        <LayoutGrid size={14} className="text-[#C084FC]" /> Customize Homepage
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setShowAccountMenu(false);
                        if (onOpenSearch) onOpenSearch('');
                        else onNavigate('search');
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-[#E2E8F0] hover:bg-[#7C3AED]/15 text-left"
                    >
                      <Search size={14} /> Search &amp; Discovery
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowAccountMenu(false);
                        onNavigate('notifications');
                      }}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs text-[#E2E8F0] hover:bg-[#7C3AED]/15 text-left"
                    >
                      <span className="flex items-center gap-2.5">
                        <Bell size={14} /> Notification Centre
                      </span>
                      {unreadCount > 0 && (
                        <span className="font-mono-tabular text-[10px] px-1.5 py-0.5 rounded bg-[#7C3AED] text-white font-semibold">
                          {unreadCount}
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowAccountMenu(false);
                        onNavigate('analytics');
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-[#E2E8F0] hover:bg-[#7C3AED]/15 text-left"
                    >
                      <BarChart3 size={14} /> Creator Analytics
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowAccountMenu(false);
                        onNavigate('studio');
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-[#E2E8F0] hover:bg-[#7C3AED]/15 text-left"
                    >
                      <Palette size={14} /> Profile Customisation Studio
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowAccountMenu(false);
                        onNavigate('ai');
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-[#E9D5FF] hover:bg-[#7C3AED]/15 text-left font-medium"
                    >
                      <Sparkles size={14} className="text-[#C084FC]" /> Nexora AI Studio
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowAccountMenu(false);
                        onNavigate('invite');
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-emerald-300 hover:bg-[#7C3AED]/15 text-left font-medium"
                    >
                      <UserPlus size={14} /> Invite Friends
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowAccountMenu(false);
                        onNavigate('tasks');
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-[#E2E8F0] hover:bg-[#7C3AED]/15 text-left"
                    >
                      <Gift size={14} className="text-amber-300" /> Tasks &amp; Rewards
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowAccountMenu(false);
                        onNavigate('wallet');
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-[#E2E8F0] hover:bg-[#7C3AED]/15 text-left"
                    >
                      <Wallet size={14} className="text-emerald-400" /> Nexora Wallet
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowAccountMenu(false);
                        onNavigate('rewards-history');
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-[#E2E8F0] hover:bg-[#7C3AED]/15 text-left"
                    >
                      <History size={14} /> Rewards History
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowAccountMenu(false);
                        onNavigate('subscriptions');
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-[#E9D5FF] hover:bg-[#7C3AED]/15 text-left font-medium"
                    >
                      <CreditCard size={14} className="text-[#C084FC]" /> Nexora Membership
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowAccountMenu(false);
                        onNavigate('settings');
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-[#E2E8F0] hover:bg-[#7C3AED]/15 text-left"
                    >
                      <Settings size={14} /> Account, Privacy &amp; Settings
                    </button>
                    {isActiveStaff && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowAccountMenu(false);
                          if (onOpenAdminSettings) onOpenAdminSettings();
                          else onNavigate('settings');
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-sky-300 bg-sky-500/10 hover:bg-sky-500/20 text-left font-medium"
                      >
                        <Shield size={14} /> Nexora Administration
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void logoutUser(profile.uid)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-rose-400 hover:bg-rose-500/10 text-left"
                    >
                      <LogOut size={14} /> Log Out
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Mobile Search Overlay */}
        {showMobileSearch && (
          <div
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-start justify-center p-3 sm:p-6 pt-14 md:hidden"
            onClick={() => setShowMobileSearch(false)}
          >
            <div
              className="w-full max-w-lg bg-[#0E0C18] border border-[#8B5CF6]/30 rounded-2xl shadow-2xl p-4 space-y-3"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search
                    size={15}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#7C6E9B]"
                  />
                  <input
                    type="text"
                    autoFocus
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        setShowMobileSearch(false);
                        if (onOpenSearch) onOpenSearch(searchQuery.trim());
                        else onNavigate('search', searchQuery.trim());
                      }
                    }}
                    placeholder="Search people, spaces, posts..."
                    className="w-full pl-9 pr-8 py-2.5 rounded-xl bg-[#08070F] border border-[#8B5CF6]/25 focus:border-[#8B5CF6] outline-none text-sm text-white placeholder:text-[#64748B]"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-white p-1"
                      aria-label="Clear search"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setShowMobileSearch(false)}
                  className="px-3 py-2.5 rounded-xl bg-white/[0.06] text-xs font-semibold text-[#CBD5E1] hover:text-white min-h-[42px]"
                >
                  Close
                </button>
              </div>

              {searchQuery.trim().length > 0 ? (
                <div className="max-h-[60vh] overflow-y-auto space-y-3">
                  {searchResults.users.length === 0 &&
                  searchResults.spaces.length === 0 &&
                  searchResults.posts.length === 0 ? (
                    <p className="text-xs text-[#64748B] py-6 text-center">
                      No matches found for &ldquo;{searchQuery}&rdquo;
                    </p>
                  ) : (
                    <>
                      {searchResults.users.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-[11px] font-semibold text-[#94A3B8] px-2">People</p>
                          {searchResults.users.map((u) => (
                            <button
                              key={u.uid}
                              type="button"
                              onClick={() => {
                                onOpenUserProfile(u.uid);
                                setSearchQuery('');
                                setShowMobileSearch(false);
                              }}
                              className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-[#7C3AED]/15 text-left transition-colors"
                            >
                              <ResilientImage
                                src={u.avatarUrl}
                                alt={u.displayName}
                                className="w-9 h-9 rounded-full object-cover shrink-0"
                              />
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-white truncate inline-flex items-center gap-1">
                                  <span className="truncate">{u.displayName}</span>
                                  <BadgeStrip
                                    badges={getUserBadges(u.uid, u.verified)}
                                    size={12}
                                    max={2}
                                    interactive={false}
                                  />
                                  {isUserOfficialOwner(u.uid, u) && (
                                    <ShieldCheck
                                      size={12}
                                      className="text-[#C084FC] shrink-0"
                                      aria-label="Official Nexora Account"
                                    />
                                  )}
                                </p>
                                <p className="text-[11px] text-[#94A3B8] truncate">@{u.username}</p>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                      {searchResults.spaces.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-[11px] font-semibold text-[#94A3B8] px-2">Spaces</p>
                          {searchResults.spaces.map((s) => (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => {
                                onNavigate('spaces', s.id);
                                setSearchQuery('');
                                setShowMobileSearch(false);
                              }}
                              className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-[#7C3AED]/15 text-left transition-colors"
                            >
                              <span className="text-xs font-medium text-white truncate">{s.name}</span>
                              <span className="text-[11px] text-[#94A3B8] shrink-0 font-mono-tabular">
                                {s.membersCount} members
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                      {searchResults.posts.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-[11px] font-semibold text-[#94A3B8] px-2">Posts</p>
                          {searchResults.posts.map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => {
                                onNavigate('home');
                                setSearchQuery('');
                                setShowMobileSearch(false);
                              }}
                              className="w-full p-2.5 rounded-xl hover:bg-[#7C3AED]/15 text-left transition-colors"
                            >
                              <p className="text-xs text-white truncate">{p.text}</p>
                              <p className="text-[11px] text-[#64748B] truncate">by {p.authorName}</p>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              ) : (
                <p className="text-xs text-[#64748B] py-4 text-center">
                  Type a name, @username, space, or keyword to search Nexora.
                </p>
              )}
              <button
                type="button"
                onClick={() => {
                  setShowMobileSearch(false);
                  if (onOpenSearch) onOpenSearch(searchQuery.trim());
                  else onNavigate('search', searchQuery.trim());
                }}
                className="w-full min-h-[40px] rounded-xl bg-[#7C3AED]/20 border border-[#8B5CF6]/30 text-xs font-semibold text-[#E9D5FF]"
              >
                Open Full Search &amp; Discovery
              </button>
            </div>
          </div>
        )}

        {/* Active Platform Announcements Banner */}
        {activeBannerAnnouncements.length > 0 && (
          <div className="relative z-10 max-w-[1680px] w-full mx-auto px-3 sm:px-5 lg:px-7 pt-3 space-y-2">
            {activeBannerAnnouncements.slice(0, 2).map((ann) => (
              <div
                key={ann.id}
                className={`flex items-center justify-between gap-4 px-4 py-2.5 rounded-xl border text-xs ${
                  ann.severity === 'security'
                    ? 'bg-rose-500/10 border-rose-500/30 text-rose-100'
                    : ann.severity === 'warning'
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-100'
                    : 'bg-[#7C3AED]/15 border-[#8B5CF6]/30 text-[#E9D5FF]'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {ann.severity === 'security' || ann.severity === 'warning' ? (
                    <AlertTriangle size={14} className="shrink-0" />
                  ) : (
                    <Megaphone size={14} className="shrink-0 text-[#C084FC]" />
                  )}
                  <p className="truncate">
                    <span className="font-semibold">{ann.title}:</span> {ann.message}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setDismissedAnnouncementIds((prev) => [...prev, ann.id])
                  }
                  aria-label="Dismiss announcement"
                  className="p-1 rounded-lg hover:bg-white/10 shrink-0"
                >
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Section Viewports (HomePage controls its own customized layout directly!) */}
        {activeSection === 'vibes' && (
          <main key={activeSection} className="relative z-10 flex-1 flex flex-col pb-16 lg:pb-0 nexora-page-enter">
            {children}
          </main>
        )}

        {activeSection === 'chat' && (
          <main
            key={activeSection}
            className="relative z-10 flex-1 max-w-[1680px] w-full mx-auto px-2 sm:px-4 lg:px-7 pt-2 sm:pt-4 pb-20 lg:pb-5 flex flex-col nexora-page-enter"
          >
            {children}
          </main>
        )}

        {activeSection === 'home' && (
          <main
            key={activeSection}
            className="relative z-10 flex-1 max-w-[1680px] w-full mx-auto px-3 sm:px-5 lg:px-7 pt-4 sm:pt-5 pb-24 lg:pb-10 nexora-page-enter"
          >
            {children}
          </main>
        )}

        {activeSection !== 'vibes' && activeSection !== 'chat' && activeSection !== 'home' && (
          <main
            key={activeSection}
            className="relative z-10 flex-1 max-w-[1520px] w-full mx-auto px-3 sm:px-5 lg:px-7 pt-4 sm:pt-6 pb-24 lg:pb-10 nexora-page-enter"
          >
            {children}
          </main>
        )}
      </div>

      {/* Mobile & Tablet Floating Bottom Dock */}
      <FloatingBottomDock
        items={visibleMobileNavItems}
        activeSection={activeSection}
        onNavigate={(section) => onNavigate(section)}
        unreadChatCount={unreadChatCount}
        visible={dockVisible}
      />

      <OfflineIndicator />
    </div>
  );
}
