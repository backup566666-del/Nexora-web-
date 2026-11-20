import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Award,
  Bell,
  Compass,
  Film,
  Gift,
  Heart,
  Home,
  LogOut,
  Megaphone,
  MessageSquare,
  PlusSquare,
  Search,
  Settings,
  Shield,
  ShieldAlert,
  Tag,
  User as UserIcon,
  UserPlus,
  X,
} from 'lucide-react';
import { NexoraLogo } from '../branding/NexoraLogo';
import { FloatingBottomDock } from './FloatingBottomDock';
import { ResilientImage } from '../common/ResilientImage';
import { BadgeStrip } from '../common/VerifiedBadge';
import { useAuth } from '../../hooks/useAuth';
import { logoutUser } from '../../services/auth/authService';
import {
  markAllNotificationsRead,
  markNotificationRead,
  searchDirectoryUsers,
  subscribeFollowingIds,
  toggleFollowUser,
} from '../../services/firebase/socialService';
import { extractReadableErrorMessage } from '../../services/firebase/errorHandler';
import {
  NavSection,
  NotificationCategory,
  NotificationItem,
  Post,
  Space,
  UserProfile,
} from '../../types/nexora';
import { inferCategoryFromNotificationType } from '../../services/notifications/notificationDispatcher';
import {
  formatCompactCount,
  formatRelativeTime,
} from '../../utils/validation';

type ProfileTab = 'posts' | 'videos' | 'photos' | 'tagged' | 'collabs' | 'gifts' | 'spaces' | 'saved';

interface DashboardShellProps {
  activeSection: NavSection;
  onNavigate: (section: NavSection, targetId?: string, profileTab?: ProfileTab) => void;
  onOpenAdminSettings?: () => void;
  onOpenUserProfile: (uid: string) => void;
  notifications: NotificationItem[];
  spaces: Space[];
  posts: Post[];
  users: UserProfile[];
  children: React.ReactNode;
}

const NAV_ITEMS: {
  id: NavSection;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
}[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'vibes', label: 'Vibes', icon: Film },
  { id: 'create', label: 'Nexora', icon: PlusSquare },
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'spaces', label: 'Spaces', icon: Compass },
  { id: 'profile', label: 'Profile', icon: UserIcon },
];

const SECTION_LABELS: Record<NavSection, string> = {
  home: 'Feed',
  vibes: 'Vibes',
  create: 'Create Studio',
  chat: 'Messages',
  spaces: 'Spaces',
  profile: 'Profile',
  settings: 'Settings',
};

const NOTIF_FILTERS: { id: 'all' | 'unread' | NotificationCategory; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'social', label: 'Social' },
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
  onOpenAdminSettings,
  onOpenUserProfile,
  notifications,
  spaces,
  posts,
  users,
  children,
}: DashboardShellProps) {
  const { profile, myRole, announcements, platformConfig, getUserBadges } = useAuth();
  const [navPhase, setNavPhase] = useState<'expanded' | 'logo-only' | 'hidden'>('expanded');
  const [dockVisible, setDockVisible] = useState(true);
  const lastScrollY = useRef(0);
  const scrollDeltaAccumRef = useRef(0);
  const scrollRafRef = useRef<number | null>(null);
  const phaseTimerRef = useRef<number | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [remoteSearchUsers, setRemoteSearchUsers] = useState<UserProfile[]>([]);
  const [searchFocused, setSearchFocused] = useState(false);
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const [showNotifs, setShowNotifs] = useState(false);
  const [notifFilter, setNotifFilter] = useState<'all' | 'unread' | NotificationCategory>('all');
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [followedUids, setFollowedUids] = useState<Record<string, boolean>>({});
  const [followBusyUids, setFollowBusyUids] = useState<Record<string, boolean>>({});
  const [followError, setFollowError] = useState('');
  const [dismissedAnnouncementIds, setDismissedAnnouncementIds] = useState<string[]>([]);

  useEffect(() => {
    if (!profile?.uid) {
      setFollowedUids({});
      return;
    }
    return subscribeFollowingIds(profile.uid, (followingSet) => {
      const next: Record<string, boolean> = {};
      followingSet.forEach((id) => {
        next[id] = true;
      });
      setFollowedUids(next);
    });
  }, [profile?.uid]);

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
      setNavPhase('expanded');
      return;
    }

    const processScroll = () => {
      scrollRafRef.current = null;
      const currentY = Math.max(0, window.scrollY);
      const delta = currentY - lastScrollY.current;
      lastScrollY.current = currentY;

      if (Math.abs(delta) < 2) return;

      // Reset directional accumulator when scroll direction flips
      if (
        (delta > 0 && scrollDeltaAccumRef.current < 0) ||
        (delta < 0 && scrollDeltaAccumRef.current > 0)
      ) {
        scrollDeltaAccumRef.current = 0;
      }
      scrollDeltaAccumRef.current += delta;

      // Floating bottom dock hysteresis: smooth hide on scroll down, reveal on scroll up
      if (currentY <= 48) {
        setDockVisible(true);
        scrollDeltaAccumRef.current = 0;
      } else if (scrollDeltaAccumRef.current > 18 && currentY > 72) {
        setDockVisible(false);
        scrollDeltaAccumRef.current = 0;
      } else if (scrollDeltaAccumRef.current < -12) {
        setDockVisible(true);
        scrollDeltaAccumRef.current = 0;
      }

      // Top bar adaptive transition
      if (Math.abs(delta) < 6) return;
      if (phaseTimerRef.current) {
        window.clearTimeout(phaseTimerRef.current);
        phaseTimerRef.current = null;
      }

      if (delta < 0 && currentY > 60) {
        setNavPhase('logo-only');
        phaseTimerRef.current = window.setTimeout(() => {
          setNavPhase('hidden');
        }, 280);
      } else if (delta > 0 || currentY <= 40) {
        setNavPhase((prev) => (prev === 'hidden' ? 'logo-only' : 'expanded'));
        phaseTimerRef.current = window.setTimeout(() => {
          setNavPhase('expanded');
        }, 140);
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
      if (phaseTimerRef.current) window.clearTimeout(phaseTimerRef.current);
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

  const trendingHashtags = useMemo(() => {
    const counts = new Map<string, number>();
    posts.forEach((p) => {
      (p.hashtags || []).forEach((tag) => {
        counts.set(tag, (counts.get(tag) || 0) + 1);
      });
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
  }, [posts]);

  const suggestedCreators = useMemo(() => {
    if (!profile) return [];
    return users
      .filter((u) => u.uid !== profile.uid)
      .sort((a, b) => (b.followersCount || 0) - (a.followersCount || 0))
      .slice(0, 4);
  }, [users, profile]);

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
        .filter((p) => p.text.toLowerCase().includes(q))
        .slice(0, 3),
    };
  }, [searchQuery, users, remoteSearchUsers, spaces, posts]);

  const isActiveStaff = Boolean(myRole && myRole.active);
  const visibleNavItems = useMemo(() => {
    return NAV_ITEMS.filter((item) => {
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
    if (n.type === 'space_invite' && n.targetId) {
      onNavigate('spaces', n.targetId);
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
    <div className="min-h-screen bg-[#06060A] text-[#F8FAFC] flex flex-col relative">
      {/* Subtle atmospheric top glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-0 h-80 bg-[radial-gradient(ellipse_70%_50%_at_50%_-10%,rgba(124,58,237,0.16),transparent)] z-0"
      />

      {/* Reveal trigger when adaptive navbar hides */}
      {navPhase === 'hidden' && (
        <button
          type="button"
          onClick={() => setNavPhase('expanded')}
          onMouseEnter={() => setNavPhase('expanded')}
          aria-label="Reveal Nexora navigation"
          className="fixed top-2.5 left-1/2 -translate-x-1/2 z-50 px-3.5 py-1.5 rounded-xl bg-[#0D0B16]/90 border border-[#8B5CF6]/30 shadow-[0_8px_30px_rgba(0,0,0,0.65)] backdrop-blur-md transition-opacity"
        >
          <NexoraLogo variant="icon" size="xs" />
        </button>
      )}

      {/* Unified Adaptive Desktop Top Navigation */}
      <header
        onFocus={() => setNavPhase('expanded')}
        className={`sticky top-0 z-40 border-b border-[#8B5CF6]/15 bg-[#08070F]/90 backdrop-blur-xl transition-all duration-300 ease-out ${
          navPhase === 'hidden'
            ? '-translate-y-full opacity-0 pointer-events-none'
            : 'translate-y-0 opacity-100'
        }`}
      >
        <div className="max-w-[1760px] mx-auto px-3 sm:px-4 lg:px-8 h-14 md:h-16 flex items-center justify-between gap-2 sm:gap-6">
          {/* Left: Nexora Logo + Contextual Section Title */}
          <div className="flex items-center gap-2.5 sm:gap-3.5 shrink-0 min-w-0">
            <button
              type="button"
              onClick={() => onNavigate('home')}
              className="shrink-0 focus-visible:outline-none"
            >
              <NexoraLogo
                variant={navPhase === 'logo-only' ? 'icon' : 'horizontal'}
                size="sm"
              />
            </button>
            {navPhase !== 'logo-only' && (
              <span className="hidden sm:inline-flex items-center gap-3 text-xs font-medium text-[#94A3B8]">
                <span aria-hidden="true" className="h-4 w-px bg-white/10" />
                <span className="font-display text-sm font-semibold text-white tracking-tight">
                  {SECTION_LABELS[activeSection]}
                </span>
              </span>
            )}
          </div>

          {/* Right: Search + Notifications + Settings + User Identity */}
          <div
            className={`flex items-center gap-1.5 sm:gap-2.5 shrink-0 transition-opacity duration-200 ${
              navPhase === 'logo-only'
                ? 'opacity-0 pointer-events-none w-0 overflow-hidden'
                : 'opacity-100'
            }`}
          >
            {/* Mobile / Tablet / Laptop Search Button */}
            <button
              type="button"
              onClick={() => {
                setShowMobileSearch(true);
                setShowNotifs(false);
                setShowAccountMenu(false);
              }}
              aria-label="Search Nexora"
              className="xl:hidden p-2 sm:p-2.5 rounded-xl bg-[#0E0C18] border border-[#8B5CF6]/20 hover:border-[#8B5CF6]/50 text-[#CBD5E1] hover:text-white transition-colors min-w-[40px] min-h-[40px] flex items-center justify-center"
            >
              <Search size={16} />
            </button>

            {/* Global Live Search (Wide Desktop) */}
            <div className="relative hidden xl:block w-64 2xl:w-72">
              <Search
                size={15}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#7C6E9B]"
              />
              <input
                type="text"
                value={searchQuery}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setTimeout(() => setSearchFocused(false), 180)}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search people, spaces, posts..."
                className="w-full pl-9 pr-8 py-2 rounded-xl bg-[#0E0C18] border border-[#8B5CF6]/20 focus:border-[#8B5CF6] outline-none text-xs text-white placeholder:text-[#64748B] transition-colors"
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
                </div>
              )}
            </div>

            {/* Notifications Center */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setShowNotifs((v) => !v);
                  setShowAccountMenu(false);
                }}
                aria-label="Notifications"
                className="relative p-2 sm:p-2.5 rounded-xl bg-[#0E0C18] border border-[#8B5CF6]/20 hover:border-[#8B5CF6]/50 text-[#CBD5E1] hover:text-white transition-colors min-w-[40px] min-h-[40px] flex items-center justify-center"
              >
                <Bell size={16} />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-gradient-to-r from-[#7C3AED] to-[#A855F7] text-[10px] font-bold text-white flex items-center justify-center font-mono-tabular">
                    {unreadCount}
                  </span>
                )}
              </button>

              {showNotifs && (
                <div className="fixed inset-x-3 top-16 sm:absolute sm:inset-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-96 bg-[#0E0C18] border border-[#8B5CF6]/25 rounded-2xl shadow-2xl overflow-hidden z-50">
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

                  {/* Category filter tabs */}
                  <div className="flex items-center gap-1 px-3 py-2 border-b border-white/[0.06] overflow-x-auto">
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
                </div>
              )}
            </div>

            {/* Settings Shortcut */}
            <button
              type="button"
              onClick={() => onNavigate('settings')}
              aria-label="Settings"
              className={`p-2 sm:p-2.5 rounded-xl border transition-colors min-w-[40px] min-h-[40px] flex items-center justify-center ${
                activeSection === 'settings'
                  ? 'bg-gradient-to-r from-[#6D28D9] to-[#7C3AED] border-[#8B5CF6] text-white'
                  : 'bg-[#0E0C18] border-[#8B5CF6]/20 hover:border-[#8B5CF6]/50 text-[#CBD5E1] hover:text-white'
              }`}
            >
              <Settings size={16} />
            </button>

            {/* User Account Menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setShowAccountMenu((v) => !v);
                  setShowNotifs(false);
                }}
                className="flex items-center gap-2 p-1 sm:pl-1.5 sm:pr-3 rounded-xl bg-[#0E0C18] border border-[#8B5CF6]/20 hover:border-[#8B5CF6]/50 transition-colors min-h-[40px]"
              >
                <ResilientImage
                  src={profile.avatarUrl}
                  alt={profile.displayName}
                  className="w-7 h-7 rounded-full object-cover ring-1 ring-[#8B5CF6]/50"
                />
                <span className="hidden sm:inline text-xs font-medium text-white max-w-[115px] truncate">
                  {profile.displayName}
                </span>
              </button>

              {showAccountMenu && (
                <div className="absolute right-0 mt-2 w-64 max-w-[calc(100vw-1.5rem)] bg-[#0E0C18] border border-[#8B5CF6]/25 rounded-2xl shadow-2xl p-2 space-y-1 z-50">
                  <div className="px-3 py-2.5 border-b border-white/10">
                    <p className="text-xs font-semibold text-white truncate flex items-center gap-1.5">
                      <span className="truncate">{profile.displayName}</span>
                      <BadgeStrip badges={selfBadges} size={13} max={3} />
                    </p>
                    <p className="text-[11px] text-[#94A3B8] truncate">@{profile.username}</p>
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
                  <button
                    type="button"
                    onClick={() => {
                      setShowAccountMenu(false);
                      onNavigate('settings');
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-[#E2E8F0] hover:bg-[#7C3AED]/15 text-left"
                  >
                    <Settings size={14} /> Account, Privacy & Notifications
                  </button>
                  {isActiveStaff && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowAccountMenu(false);
                        if (onOpenAdminSettings) {
                          onOpenAdminSettings();
                        } else {
                          onNavigate('settings');
                        }
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

      {/* Mobile / Tablet / Laptop Search Overlay */}
      {showMobileSearch && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-start justify-center p-3 sm:p-6 pt-16 xl:hidden"
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
          </div>
        </div>
      )}

      {/* Active Platform Announcements Banner */}
      {activeBannerAnnouncements.length > 0 && (
        <div className="relative z-10 max-w-[1640px] w-full mx-auto px-4 lg:px-8 pt-3 space-y-2">
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

      {/* Section-Specific Responsive Viewport Architectures */}
      {activeSection === 'vibes' && (
        <main className="relative z-10 flex-1 flex flex-col pb-24 md:pb-28">{children}</main>
      )}

      {activeSection === 'chat' && (
        <main className="relative z-10 flex-1 max-w-[1720px] w-full mx-auto px-2 sm:px-4 lg:px-8 pt-2 sm:pt-4 pb-24 flex flex-col">
          {children}
        </main>
      )}

      {activeSection === 'spaces' && (
        <main className="relative z-10 flex-1 max-w-[1720px] w-full mx-auto px-3 sm:px-4 lg:px-8 pt-4 sm:pt-6 pb-28">
          {children}
        </main>
      )}

      {activeSection === 'profile' && (
        <main className="relative z-10 flex-1 max-w-[1400px] w-full mx-auto px-3 sm:px-4 lg:px-8 pt-4 sm:pt-6 pb-28">
          {children}
        </main>
      )}

      {activeSection === 'create' && (
        <main className="relative z-10 flex-1 max-w-[1400px] w-full mx-auto px-3 sm:px-4 lg:px-8 pt-4 sm:pt-6 pb-28">
          {children}
        </main>
      )}

      {activeSection === 'settings' && (
        <main className="relative z-10 flex-1 max-w-[1440px] w-full mx-auto px-3 sm:px-4 lg:px-8 pt-4 sm:pt-6 pb-28">
          {children}
        </main>
      )}

      {activeSection === 'home' && (
        <div className="relative z-10 flex-1 max-w-[1640px] w-full mx-auto px-3 sm:px-4 lg:px-8 pt-4 sm:pt-6 pb-28 grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
          {/* Left Desktop Column: Identity & Quick Spaces */}
          <aside className="hidden lg:block lg:col-span-3 space-y-6">
            <div className="sticky top-24 space-y-6">
              {/* Identity Summary */}
              <div className="p-5 rounded-2xl bg-[#0D0B16] border border-[#8B5CF6]/15 space-y-4">
                <div className="flex items-center gap-3.5">
                  <ResilientImage
                    src={profile.avatarUrl}
                    alt={profile.displayName}
                    className="w-12 h-12 rounded-full object-cover shrink-0 ring-2 ring-[#7C3AED]/50"
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <button
                        type="button"
                        onClick={() => onNavigate('profile')}
                        className="font-display text-sm font-semibold text-white hover:text-[#C084FC] truncate text-left"
                      >
                        {profile.displayName}
                      </button>
                      <BadgeStrip badges={selfBadges} size={13} max={3} />
                    </div>
                    <p className="text-xs text-[#94A3B8] truncate">@{profile.username}</p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-3 border-t border-white/[0.08] text-center">
                  <div>
                    <p className="font-mono-tabular text-sm font-semibold text-white">
                      {formatCompactCount(profile.postsCount)}
                    </p>
                    <p className="text-[11px] text-[#94A3B8]">Posts</p>
                  </div>
                  <div>
                    <p className="font-mono-tabular text-sm font-semibold text-white">
                      {formatCompactCount(profile.followersCount)}
                    </p>
                    <p className="text-[11px] text-[#94A3B8]">Followers</p>
                  </div>
                  <div>
                    <p className="font-mono-tabular text-sm font-semibold text-white">
                      {formatCompactCount(profile.followingCount)}
                    </p>
                    <p className="text-[11px] text-[#94A3B8]">Following</p>
                  </div>
                </div>
              </div>

              {/* Spaces Quick Directory */}
              <div className="p-5 rounded-2xl bg-[#0D0B16] border border-[#8B5CF6]/15 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-sm font-semibold text-white">
                    Featured Spaces
                  </h2>
                  <button
                    type="button"
                    onClick={() => onNavigate('spaces')}
                    className="text-xs text-[#C084FC] hover:underline"
                  >
                    Explore
                  </button>
                </div>
                <div className="space-y-1.5">
                  {spaces.slice(0, 4).map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => onNavigate('spaces', s.id)}
                      className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-[#7C3AED]/10 text-left transition-colors"
                    >
                      <ResilientImage
                        src={s.coverUrl}
                        alt={s.name}
                        className="w-10 h-10 rounded-xl object-cover shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-white truncate">{s.name}</p>
                        <p className="text-[11px] text-[#94A3B8] truncate">
                          {s.category} · {s.membersCount} members
                        </p>
                      </div>
                    </button>
                  ))}
                  {spaces.length === 0 && (
                    <p className="text-xs text-[#64748B]">No Spaces created yet.</p>
                  )}
                </div>
              </div>
            </div>
          </aside>

          {/* Center Discussion Feed */}
          <main className="lg:col-span-9 xl:col-span-6 min-w-0">{children}</main>

          {/* Right Desktop Rail: Suggested Creators & Topics */}
          <aside className="hidden xl:block xl:col-span-3 space-y-6">
            <div className="sticky top-24 space-y-6">
              <div className="p-5 rounded-2xl bg-[#0D0B16] border border-[#8B5CF6]/15 space-y-3.5">
                <h2 className="font-display text-sm font-semibold text-white">
                  People to Follow
                </h2>
                <div className="space-y-3">
                  {suggestedCreators.length === 0 ? (
                    <p className="text-xs text-[#64748B]">
                      Invite collaborators to see creators here.
                    </p>
                  ) : (
                    suggestedCreators.map((u) => {
                      const isFollowed = Boolean(followedUids[u.uid]);
                      const isBusy = Boolean(followBusyUids[u.uid]);
                      return (
                        <div key={u.uid} className="flex items-center justify-between gap-2.5">
                          <button
                            type="button"
                            onClick={() => onOpenUserProfile(u.uid)}
                            className="flex items-center gap-2.5 min-w-0 text-left"
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
                              </p>
                              <p className="text-[11px] text-[#94A3B8] truncate">@{u.username}</p>
                            </div>
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={async () => {
                              if (isBusy) return;
                              setFollowError('');
                              setFollowBusyUids((prev) => ({ ...prev, [u.uid]: true }));
                              try {
                                const next = await toggleFollowUser(profile, u, isFollowed);
                                setFollowedUids((prev) => ({ ...prev, [u.uid]: next }));
                              } catch (err) {
                                setFollowError(
                                  extractReadableErrorMessage(err, 'Unable to update follow status.')
                                );
                              } finally {
                                setFollowBusyUids((prev) => ({ ...prev, [u.uid]: false }));
                              }
                            }}
                            className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors shrink-0 disabled:opacity-60 disabled:cursor-not-allowed ${
                              isFollowed
                                ? 'bg-white/10 text-white'
                                : 'bg-gradient-to-r from-[#6D28D9] to-[#7C3AED] text-white'
                            }`}
                          >
                            <UserPlus size={12} />
                            {isBusy ? '...' : isFollowed ? 'Following' : 'Follow'}
                          </button>
                        </div>
                      );
                    })
                  )}
                  {followError && (
                    <p className="text-[11px] text-rose-300 bg-rose-500/10 border border-rose-500/25 rounded-lg px-2.5 py-1.5">
                      {followError}
                    </p>
                  )}
                </div>
              </div>

              {trendingHashtags.length > 0 && (
                <div className="p-5 rounded-2xl bg-[#0D0B16] border border-[#8B5CF6]/15 space-y-3">
                  <h2 className="font-display text-sm font-semibold text-white">
                    Active Topics
                  </h2>
                  <div className="space-y-2">
                    {trendingHashtags.map(([tag, count]) => (
                      <div
                        key={tag}
                        className="flex items-center justify-between text-xs text-[#CBD5E1]"
                      >
                        <span className="font-medium text-[#C084FC]">#{tag}</span>
                        <span className="font-mono-tabular text-[#64748B]">{count} posts</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>
      )}

      {/* Floating Glassmorphic Bottom Dock (Mobile, Tablet & Desktop) */}
      <FloatingBottomDock
        items={visibleNavItems}
        activeSection={activeSection}
        onNavigate={(section) => onNavigate(section)}
        unreadChatCount={unreadChatCount}
        visible={dockVisible}
      />
    </div>
  );
}
