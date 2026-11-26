import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Bell,
  Compass,
  CreditCard,
  Film,
  Flame,
  Gift,
  Hash,
  Heart,
  LayoutGrid,
  MessageSquare,
  Palette,
  Play,
  Plus,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { FriendlyErrorBanner } from '../../components/common/FriendlyErrorBanner';
import { PresenceBadge } from '../../components/common/PresenceBadge';
import { ResilientImage } from '../../components/common/ResilientImage';
import { TierBadge } from '../../components/common/TierBadge';
import { BadgeStrip } from '../../components/common/VerifiedBadge';
import { CustomisedAvatar } from '../../components/profile/CustomisedAvatar';
import { PostCard } from '../../features/posts/PostCard';
import { PostComposer } from '../../features/posts/PostComposer';
import { StoriesBar } from '../../features/stories/StoriesBar';
import { useAuth } from '../../hooks/useAuth';
import { extractReadableErrorMessage } from '../../services/firebase/errorHandler';
import {
  isUserOnlineNow,
  subscribeFollowingIds,
  toggleFollowUser,
} from '../../services/firebase/socialService';
import {
  HomepageSectionId,
  NavSection,
  NotificationItem,
  Post,
  ProfileContentTab,
  Space,
  Story,
  UserProfile,
  Vibe,
} from '../../types/nexora';
import {
  computePostEngagementScore,
  formatCompactCount,
  formatRelativeTime,
  isPersonalTimelinePost,
  rankTrendingPosts,
  withHomepageCustomizationDefaults,
} from '../../utils/validation';

export { computePostEngagementScore, rankTrendingPosts };

interface HomePageProps {
  posts: Post[];
  stories: Story[];
  vibes?: Vibe[];
  spaces: Space[];
  users: UserProfile[];
  notifications?: NotificationItem[];
  savedPostIds: string[];
  onOpenProfile: (uid: string) => void;
  onOpenChatThread: (convId: string) => void;
  onNavigate?: (
    section: NavSection,
    targetId?: string,
    profileTab?: ProfileContentTab
  ) => void;
  onOpenVibes?: () => void;
  onOpenCustomizeHomepage?: () => void;
  onOpenVerification?: () => void;
  justSignedIn?: boolean;
}

export function HomePage({
  posts,
  stories,
  vibes = [],
  spaces,
  users,
  notifications = [],
  savedPostIds,
  onOpenProfile,
  onOpenChatThread,
  onNavigate,
  onOpenVibes,
  onOpenCustomizeHomepage,
  onOpenVerification,
  justSignedIn = false,
}: HomePageProps) {
  const {
    profile,
    privateInfo,
    platformConfig,
    adminPresenceMap,
    userPrefs,
    effectiveTier,
    getUserBadges,
    getUserTier,
    isUserOfficialOwner,
  } = useAuth();

  const homepagePrefs = useMemo(
    () => withHomepageCustomizationDefaults(userPrefs?.homepagePrefs),
    [userPrefs?.homepagePrefs]
  );

  const [filter, setFilter] = useState<
    'all' | 'trending' | 'media' | 'discussions' | 'polls'
  >(homepagePrefs.defaultFeedFilter);
  const [selectedHashtag, setSelectedHashtag] = useState<string>('');
  const [followedUids, setFollowedUids] = useState<Record<string, boolean>>({});
  const [followBusyUids, setFollowBusyUids] = useState<Record<string, boolean>>({});
  const [followError, setFollowError] = useState('');

  useEffect(() => {
    setFilter(homepagePrefs.defaultFeedFilter);
  }, [homepagePrefs.defaultFeedFilter]);

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

  const blockedSet = useMemo(
    () => new Set(privateInfo?.blockedUserIds || []),
    [privateInfo]
  );

  const unreadNotifications = useMemo(
    () => notifications.filter((n) => !n.read),
    [notifications]
  );

  const unreadMessageCount = useMemo(
    () => unreadNotifications.filter((n) => n.type === 'message').length,
    [unreadNotifications]
  );

  const getCreatorBadgeStatus = (u: UserProfile) => {
    const adminRec = adminPresenceMap[u.uid];
    if (adminRec) {
      return adminRec.status === 'offline' ? null : adminRec.status;
    }
    return isUserOnlineNow(u) ? 'online' : null;
  };

  const recommendedUsers = useMemo(() => {
    if (!profile) return [];
    return users
      .filter(
        (u) =>
          u.uid !== profile.uid &&
          !u.suspended &&
          !blockedSet.has(u.uid)
      )
      .sort((a, b) => {
        const aAdmin = adminPresenceMap[a.uid];
        const bAdmin = adminPresenceMap[b.uid];
        const aOnline = aAdmin ? aAdmin.status !== 'offline' : isUserOnlineNow(a);
        const bOnline = bAdmin ? bAdmin.status !== 'offline' : isUserOnlineNow(b);
        const onlineDiff = Number(bOnline) - Number(aOnline);
        if (onlineDiff !== 0) return onlineDiff;
        return (b.followersCount || 0) - (a.followersCount || 0);
      })
      .slice(0, 8);
  }, [users, profile, blockedSet, adminPresenceMap]);

  const suggestedSpaces = useMemo(() => {
    return spaces
      .filter((s) => s.status !== 'suspended')
      .sort((a, b) => (b.membersCount || 0) - (a.membersCount || 0))
      .slice(0, 6);
  }, [spaces]);

  const featuredVibes = useMemo(() => {
    return vibes
      .filter((v) => !blockedSet.has(v.authorId))
      .slice(0, 8);
  }, [vibes, blockedSet]);

  // Community Isolation: general public Home feed strictly excludes community posts.
  const personalFeedPosts = useMemo(() => posts.filter(isPersonalTimelinePost), [posts]);

  const videoPosts = useMemo(() => {
    return personalFeedPosts
      .filter(
        (p) =>
          !blockedSet.has(p.authorId) &&
          p.mediaTypes?.some((t) => t === 'video') &&
          p.mediaUrls?.length > 0
      )
      .slice(0, 4);
  }, [personalFeedPosts, blockedSet]);

  const trendingHashtags = useMemo(() => {
    const counts = new Map<string, number>();
    personalFeedPosts.forEach((p) => {
      if (blockedSet.has(p.authorId)) return;
      (p.hashtags || []).forEach((tag) => {
        const clean = tag.replace(/^#+/, '').trim().toLowerCase();
        if (clean) counts.set(clean, (counts.get(clean) || 0) + 1);
      });
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
  }, [personalFeedPosts, blockedSet]);

  const visiblePosts = useMemo(() => {
    const base = personalFeedPosts.filter((p) => {
      if (blockedSet.has(p.authorId)) return false;
      if (selectedHashtag) {
        const tags = (p.hashtags || []).map((t) =>
          t.replace(/^#+/, '').toLowerCase()
        );
        const textMatches = p.text
          .toLowerCase()
          .includes(`#${selectedHashtag.toLowerCase()}`);
        if (!tags.includes(selectedHashtag.toLowerCase()) && !textMatches) {
          return false;
        }
      }
      if (filter === 'discussions') return p.type === 'text' || p.type === 'repost';
      if (filter === 'media') return (p.mediaUrls?.length || 0) > 0;
      if (filter === 'polls') return p.type === 'poll';
      return true;
    });

    if (filter === 'trending') {
      return rankTrendingPosts(base);
    }
    return base;
  }, [personalFeedPosts, blockedSet, filter, selectedHashtag]);

  const handleToggleFollow = async (target: UserProfile) => {
    if (!profile || followBusyUids[target.uid]) return;
    setFollowError('');
    const isFollowed = Boolean(followedUids[target.uid]);
    setFollowBusyUids((prev) => ({ ...prev, [target.uid]: true }));
    try {
      const next = await toggleFollowUser(profile, target, isFollowed);
      setFollowedUids((prev) => ({ ...prev, [target.uid]: next }));
    } catch (err) {
      setFollowError(
        extractReadableErrorMessage(err, 'Unable to update follow status.')
      );
    } finally {
      setFollowBusyUids((prev) => ({ ...prev, [target.uid]: false }));
    }
  };

  if (!profile) return null;

  const isCompact = homepagePrefs.feedDensity === 'compact';
  const selfBadges = getUserBadges(profile.uid, profile.verified);

  const showStoriesModule =
    platformConfig.features.storiesEnabled && homepagePrefs.showStories;
  const showCreatorsModule =
    homepagePrefs.showRecommendedCreators && recommendedUsers.length > 0;
  const showSpacesModule =
    platformConfig.features.spacesEnabled &&
    homepagePrefs.showSuggestedSpaces &&
    suggestedSpaces.length > 0;
  const showTrendingModule =
    homepagePrefs.showTrendingTopics && trendingHashtags.length > 0;
  const showVibesModule =
    platformConfig.features.vibesEnabled &&
    homepagePrefs.showVibesShelf &&
    (featuredVibes.length > 0 || videoPosts.length > 0);

  const renderSectionShelf = (sectionId: HomepageSectionId) => {
    if (sectionId === 'stories') {
      if (!showStoriesModule) return null;
      return (
        <section
          key="stories"
          className="p-3.5 sm:p-4 rounded-2xl bg-[#0D0B16]/85 border border-white/[0.07]"
        >
          <StoriesBar
            stories={stories}
            users={users}
            onOpenChatThread={onOpenChatThread}
          />
        </section>
      );
    }

    if (sectionId === 'creators') {
      if (!showCreatorsModule) return null;
      return (
        <section
          key="creators"
          className="p-3.5 sm:p-4 rounded-2xl bg-[#0D0B16]/85 border border-white/[0.07] space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Users size={15} className="text-[#C084FC]" />
              <h2 className="font-display text-sm font-semibold text-white">
                Recommended Creators
              </h2>
            </div>
            <span className="text-[11px] font-mono-tabular text-[#94A3B8]">
              {recommendedUsers.length} suggested
            </span>
          </div>

          <div className="flex items-stretch gap-2.5 overflow-x-auto no-scrollbar snap-x pb-1">
            {recommendedUsers.map((u) => {
              const isFollowed = Boolean(followedUids[u.uid]);
              const isBusy = Boolean(followBusyUids[u.uid]);
              const presenceStatus = getCreatorBadgeStatus(u);
              return (
                <div
                  key={u.uid}
                  className="snap-start shrink-0 w-44 p-3 rounded-xl bg-[#08070F] border border-white/[0.07] flex flex-col justify-between gap-3"
                >
                  <button
                    type="button"
                    onClick={() => onOpenProfile(u.uid)}
                    className="flex items-center gap-2.5 text-left min-w-0"
                  >
                    <div className="relative shrink-0">
                      <CustomisedAvatar
                        src={u.avatarUrl}
                        alt={u.displayName}
                        sizeClass="w-10 h-10"
                        customisation={u.profileCustomisation}
                      />
                      {presenceStatus && (
                        <span className="absolute -bottom-0.5 -right-0.5">
                          <PresenceBadge status={presenceStatus} size="xs" />
                        </span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-white truncate inline-flex items-center gap-1 max-w-full">
                        <span className="truncate">{u.displayName}</span>
                        <BadgeStrip
                          badges={getUserBadges(u.uid, u.verified)}
                          size={11}
                          max={2}
                          interactive={false}
                        />
                        {isUserOfficialOwner(u.uid, u) && (
                          <span
                            title="Official Nexora Account"
                            className="inline-flex items-center px-1 py-0.5 rounded bg-[#7C3AED]/25 border border-[#A855F7]/45 text-[9px] font-semibold text-[#E9D5FF] shrink-0"
                          >
                            <ShieldCheck size={9} className="text-[#C084FC]" />
                          </span>
                        )}
                        <TierBadge
                          tier={getUserTier(u.uid, u.subscriptionTier)}
                          showFree={false}
                        />
                      </p>
                      <p className="text-[11px] text-[#94A3B8] truncate">
                        @{u.username}
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => void handleToggleFollow(u)}
                    className={`w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors min-h-[36px] disabled:opacity-60 ${
                      isFollowed
                        ? 'bg-white/10 text-white hover:bg-white/15'
                        : 'bg-gradient-to-r from-[#6D28D9] to-[#7C3AED] text-white'
                    }`}
                  >
                    <UserPlus size={12} />
                    <span>
                      {isBusy ? 'Saving...' : isFollowed ? 'Following' : 'Follow'}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>

          {followError && (
            <FriendlyErrorBanner message={followError} onDismiss={() => setFollowError('')} />
          )}
        </section>
      );
    }

    if (sectionId === 'spaces') {
      if (!showSpacesModule) return null;
      return (
        <section
          key="spaces"
          className="p-3.5 sm:p-4 rounded-2xl bg-[#0D0B16]/85 border border-white/[0.07] space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Compass size={15} className="text-[#C084FC]" />
              <h2 className="font-display text-sm font-semibold text-white">
                Suggested Spaces
              </h2>
            </div>
            {onNavigate && (
              <button
                type="button"
                onClick={() => onNavigate('spaces')}
                className="text-xs font-semibold text-[#C084FC] hover:underline py-1 px-2"
              >
                Explore All
              </button>
            )}
          </div>

          <div className="flex items-stretch gap-2.5 overflow-x-auto no-scrollbar snap-x pb-1">
            {suggestedSpaces.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onNavigate?.('spaces', s.id)}
                className="snap-start shrink-0 w-52 p-2.5 rounded-xl bg-[#08070F] border border-white/[0.07] hover:border-[#8B5CF6]/40 flex items-center gap-3 text-left transition-colors"
              >
                <ResilientImage
                  src={s.coverUrl}
                  alt={s.name}
                  className="w-11 h-11 rounded-xl object-cover shrink-0"
                />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-white truncate">
                    {s.name}
                  </p>
                  <p className="text-[11px] text-[#94A3B8] truncate">
                    {s.category}
                  </p>
                  <p className="text-[10px] font-mono-tabular text-[#C084FC]">
                    {formatCompactCount(s.membersCount || 0)} members
                  </p>
                </div>
              </button>
            ))}
          </div>
        </section>
      );
    }

    if (sectionId === 'trending') {
      if (!showTrendingModule) return null;
      return (
        <section
          key="trending"
          className="p-3.5 sm:p-4 rounded-2xl bg-[#0D0B16]/85 border border-white/[0.07] space-y-2.5"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-white">
              <TrendingUp size={14} className="text-[#C084FC]" />
              Trending Topics
            </span>
            {selectedHashtag && (
              <button
                type="button"
                onClick={() => setSelectedHashtag('')}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-300 hover:underline"
              >
                <X size={11} /> Clear #{selectedHashtag}
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {trendingHashtags.map(([tag, count]) => {
              const active = selectedHashtag === tag;
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setSelectedHashtag(active ? '' : tag)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors min-h-[32px] ${
                    active
                      ? 'bg-[#7C3AED] text-white'
                      : 'bg-[#08070F] border border-white/[0.08] text-[#CBD5E1] hover:border-[#8B5CF6]/45'
                  }`}
                >
                  <Hash size={11} className={active ? 'text-white' : 'text-[#C084FC]'} />
                  <span>{tag}</span>
                  <span className="font-mono-tabular text-[11px] opacity-75">
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      );
    }

    return null;
  };

  const renderVibesShelf = () => {
    if (!showVibesModule) return null;
    return (
      <section className="p-3.5 sm:p-4 rounded-2xl bg-[#0D0B16]/85 border border-white/[0.07] space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Film size={15} className="text-[#C084FC]" />
            <h2 className="font-display text-sm font-semibold text-white">
              Videos &amp; Vibes
            </h2>
          </div>
          <button
            type="button"
            onClick={() => {
              if (onOpenVibes) onOpenVibes();
              else onNavigate?.('vibes');
            }}
            className="text-xs font-semibold text-[#C084FC] hover:underline py-1 px-2"
          >
            Watch All
          </button>
        </div>

        <div className="flex items-stretch gap-3 overflow-x-auto no-scrollbar snap-x pb-1">
          {featuredVibes.map((vibe) => (
            <button
              key={vibe.id}
              type="button"
              onClick={() => {
                if (onOpenVibes) onOpenVibes();
                else onNavigate?.('vibes');
              }}
              className="snap-start shrink-0 w-36 sm:w-40 rounded-xl overflow-hidden bg-[#08070F] border border-white/[0.08] hover:border-[#8B5CF6]/45 text-left group transition-all relative aspect-[9/14]"
            >
              {vibe.thumbnailUrl ? (
                <ResilientImage
                  src={vibe.thumbnailUrl}
                  alt={vibe.caption || vibe.authorName}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
              ) : (
                <video
                  src={vibe.videoUrl}
                  muted
                  playsInline
                  preload="metadata"
                  className="w-full h-full object-cover"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-transparent" />
              <span className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full bg-black/60 backdrop-blur-sm border border-white/15 flex items-center justify-center text-white">
                <Play size={12} className="fill-white ml-0.5" />
              </span>
              <div className="absolute bottom-0 inset-x-0 p-2.5 space-y-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <ResilientImage
                    src={vibe.authorAvatar}
                    alt={vibe.authorName}
                    className="w-5 h-5 rounded-full object-cover shrink-0 ring-1 ring-[#8B5CF6]/60"
                  />
                  <span className="text-[11px] font-semibold text-white truncate">
                    {vibe.authorName}
                  </span>
                </div>
                {vibe.caption && (
                  <p className="text-[10px] text-[#CBD5E1] line-clamp-1">
                    {vibe.caption}
                  </p>
                )}
                <p className="text-[10px] font-mono-tabular text-[#94A3B8] flex items-center gap-2">
                  <span className="inline-flex items-center gap-0.5">
                    <Heart size={10} className="text-pink-400" />
                    {formatCompactCount(vibe.likesCount || 0)}
                  </span>
                  <span>{formatCompactCount(vibe.viewsCount || 0)} views</span>
                </p>
              </div>
            </button>
          ))}

          {featuredVibes.length === 0 &&
            videoPosts.map((vp) => {
              const vidIdx = vp.mediaTypes.findIndex((t) => t === 'video');
              const videoUrl = vp.mediaUrls[vidIdx >= 0 ? vidIdx : 0];
              return (
                <button
                  key={vp.id}
                  type="button"
                  onClick={() => setFilter('media')}
                  className="snap-start shrink-0 w-44 rounded-xl overflow-hidden bg-[#08070F] border border-white/[0.08] hover:border-[#8B5CF6]/45 text-left relative aspect-[9/13]"
                >
                  <video
                    src={videoUrl}
                    muted
                    playsInline
                    preload="metadata"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
                  <span className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full bg-black/60 border border-white/15 flex items-center justify-center text-white">
                    <Play size={12} className="fill-white ml-0.5" />
                  </span>
                  <div className="absolute bottom-0 inset-x-0 p-2.5 space-y-1">
                    <p className="text-[11px] font-semibold text-white truncate">
                      {vp.authorName}
                    </p>
                    <p className="text-[10px] text-[#94A3B8] truncate">
                      {formatRelativeTime(vp.createdAt)}
                    </p>
                  </div>
                </button>
              );
            })}
        </div>
      </section>
    );
  };

  const renderFeedFilterAndPosts = () => (
    <div className={isCompact ? 'space-y-3' : 'space-y-4'}>
      <div className="flex items-center justify-between gap-2 border-b border-white/[0.07] pb-2.5">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {[
            { id: 'all', label: 'Recent' },
            { id: 'trending', label: 'Trending', icon: Flame },
            { id: 'media', label: 'Photos & Video' },
            { id: 'discussions', label: 'Discussions' },
            { id: 'polls', label: 'Polls' },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id as typeof filter)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all min-h-[38px] ${
                  filter === tab.id
                    ? 'bg-gradient-to-r from-[#6D28D9] to-[#7C3AED] text-white shadow-[0_2px_12px_rgba(124,58,237,0.3)]'
                    : 'text-[#94A3B8] hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                {Icon && <Icon size={13} />}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
        <span className="hidden sm:inline text-xs font-mono-tabular text-[#64748B] shrink-0">
          {visiblePosts.length} updates
        </span>
      </div>

      <div className={isCompact ? 'space-y-2.5' : 'space-y-4'}>
        {visiblePosts.length === 0 ? (
          <div className="p-10 sm:p-12 rounded-2xl bg-[#0D0B16] border border-white/[0.07] text-center space-y-2">
            <h3 className="font-display text-base font-semibold text-white">
              {selectedHashtag
                ? `No updates tagged #${selectedHashtag}`
                : 'Your Nexora feed is ready'}
            </h3>
            <p className="text-xs text-[#94A3B8]">
              {selectedHashtag
                ? 'Clear the topic filter or start a new post with this tag.'
                : 'Start a conversation above or join Spaces to see community updates here.'}
            </p>
          </div>
        ) : (
          visiblePosts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              isSaved={savedPostIds.includes(post.id)}
              onOpenProfile={onOpenProfile}
              onOpenVerification={onOpenVerification}
              onHashtagClick={(tag) => setSelectedHashtag(tag)}
              usersDirectory={users}
              compact={isCompact}
            />
          ))
        )}
      </div>
    </div>
  );

  const isCommandDesktop = homepagePrefs.layout === 'command';
  const hasRightRail = isCommandDesktop && (showCreatorsModule || showTrendingModule);

  return (
    <div className="w-full space-y-5">
      {/* Top Personalized Command Greeting Bar */}
      <section
        className={`p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-[#0E0B1A] via-[#120D23] to-[#0D0B16] border transition-all duration-500 flex flex-wrap items-center justify-between gap-3 ${
          justSignedIn
            ? 'border-[#A855F7]/55 shadow-[0_0_32px_rgba(168,85,247,0.22)]'
            : 'border-[#8B5CF6]/20'
        }`}
      >
        <div className="min-w-0 space-y-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-display text-base sm:text-lg font-bold text-white truncate">
              Welcome back, {profile.displayName.split(' ')[0]}
            </h2>
            <span className="text-[11px] text-[#94A3B8]">
              ·{' '}
              {homepagePrefs.layout === 'command'
                ? 'Command Studio'
                : homepagePrefs.layout === 'editorial'
                ? 'Editorial Showcase'
                : 'Focus Stream'}
            </span>
          </div>
          <p className="text-[11px] sm:text-xs text-[#94A3B8] truncate">
            {justSignedIn
              ? `Signed in as @${profile.username} — your personalized Nexora workspace is ready.`
              : unreadNotifications.length > 0
              ? `${unreadNotifications.length} unread notification${
                  unreadNotifications.length === 1 ? '' : 's'
                }${
                  unreadMessageCount > 0
                    ? ` · ${unreadMessageCount} unread message${
                        unreadMessageCount === 1 ? '' : 's'
                      }`
                    : ''
                }`
              : 'Curated posts, live communities, creator updates, and Vibes in one view'}
          </p>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar max-w-full">
          {onOpenCustomizeHomepage && (
            <button
              type="button"
              onClick={onOpenCustomizeHomepage}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-xs font-medium text-[#E2E8F0] whitespace-nowrap min-h-[38px]"
            >
              <LayoutGrid size={13} className="text-[#C084FC]" />
              <span>Customize Homepage</span>
            </button>
          )}
          {unreadNotifications.length > 0 && (
            <button
              type="button"
              onClick={() => {
                const latest = unreadNotifications[0];
                if (latest.type === 'message' && latest.targetId) {
                  onOpenChatThread(latest.targetId);
                } else if (latest.type === 'gift_received') {
                  onNavigate?.('profile', profile.uid, 'gifts');
                } else if (latest.type === 'follow' && latest.actorId) {
                  onOpenProfile(latest.actorId);
                } else if (
                  latest.category === 'spaces' ||
                  latest.targetType === 'space' ||
                  latest.type === 'space_invite'
                ) {
                  onNavigate?.('spaces', latest.targetId || undefined);
                } else {
                  onNavigate?.('notifications');
                }
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#7C3AED]/20 border border-[#8B5CF6]/35 text-xs font-semibold text-[#E9D5FF] hover:bg-[#7C3AED]/30 transition-colors whitespace-nowrap min-h-[38px]"
            >
              <Bell size={13} className="text-[#C084FC]" />
              <span className="font-mono-tabular">{unreadNotifications.length} New</span>
            </button>
          )}
          {onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('profile', profile.uid, 'tasks')}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-400/25 text-xs font-semibold text-amber-200 transition-colors whitespace-nowrap min-h-[38px]"
            >
              <Gift size={13} className="text-amber-300" />
              <span>Tasks &amp; Earn</span>
            </button>
          )}
          {onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('invite')}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-400/25 text-xs font-semibold text-emerald-200 transition-colors whitespace-nowrap min-h-[38px]"
            >
              <UserPlus size={13} className="text-emerald-300" />
              <span>Invite</span>
            </button>
          )}
          {onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('chat')}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.09] text-xs font-medium text-[#E2E8F0] transition-colors whitespace-nowrap min-h-[38px]"
            >
              <MessageSquare size={13} className="text-[#C084FC]" />
              <span>Messages</span>
            </button>
          )}
          {onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('create')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#6D28D9] to-[#7C3AED] text-xs font-semibold text-white whitespace-nowrap min-h-[38px]"
            >
              <Plus size={13} />
              <span>Create</span>
            </button>
          )}
        </div>
      </section>

      {/* Mobile & Tablet Unified Ordered Shelves (follows homepagePrefs.sectionOrder) */}
      <div className="lg:hidden space-y-4">
        {homepagePrefs.sectionOrder.map((secId) => renderSectionShelf(secId))}
        <PostComposer spaces={spaces} users={users} />
        {renderVibesShelf()}
        {renderFeedFilterAndPosts()}
      </div>

      {/* Desktop Adaptive Homepage Layouts */}
      <div className="hidden lg:block">
        {isCommandDesktop ? (
          <div className="grid grid-cols-12 gap-6 items-start">
            {/* Left Command Column: Identity + Suggested Spaces */}
            <aside className="col-span-4 xl:col-span-3 space-y-5 sticky top-[4.5rem]">
              <div className="p-5 rounded-2xl bg-[#0D0B16]/90 border border-white/[0.07] space-y-4">
                <div className="flex items-center gap-3">
                  <CustomisedAvatar
                    src={profile.avatarUrl}
                    alt={profile.displayName}
                    sizeClass="w-12 h-12"
                    customisation={profile.profileCustomisation}
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <button
                        type="button"
                        onClick={() => onNavigate?.('profile')}
                        className="font-display text-sm font-semibold text-white hover:text-[#C084FC] truncate text-left"
                      >
                        {profile.displayName}
                      </button>
                      <BadgeStrip badges={selfBadges} size={13} max={2} interactive={false} />
                      <TierBadge tier={effectiveTier} showFree={false} size="xs" />
                    </div>
                    <p className="text-xs text-[#94A3B8] truncate">@{profile.username}</p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-3 border-t border-white/[0.07] text-center">
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

                {onNavigate && (
                  <div className="grid grid-cols-2 gap-2 pt-3 border-t border-white/[0.07]">
                    <button
                      type="button"
                      onClick={() => onNavigate('analytics')}
                      className="min-h-[36px] px-2.5 rounded-xl bg-[#120F1E] border border-white/10 hover:border-[#8B5CF6]/40 text-[11px] font-semibold text-[#CBD5E1] hover:text-white inline-flex items-center justify-center gap-1.5"
                    >
                      <BarChart3 size={13} className="text-[#C084FC]" /> Analytics
                    </button>
                    <button
                      type="button"
                      onClick={() => onNavigate('studio')}
                      className="min-h-[36px] px-2.5 rounded-xl bg-[#120F1E] border border-white/10 hover:border-[#8B5CF6]/40 text-[11px] font-semibold text-[#CBD5E1] hover:text-white inline-flex items-center justify-center gap-1.5"
                    >
                      <Palette size={13} className="text-[#C084FC]" /> Studio
                    </button>
                    <button
                      type="button"
                      onClick={() => onNavigate('subscriptions')}
                      className="min-h-[36px] px-2.5 rounded-xl bg-[#120F1E] border border-white/10 hover:border-[#8B5CF6]/40 text-[11px] font-semibold text-[#CBD5E1] hover:text-white inline-flex items-center justify-center gap-1.5"
                    >
                      <CreditCard size={13} className="text-[#C084FC]" /> Plans
                    </button>
                    <button
                      type="button"
                      onClick={() => onNavigate('ai')}
                      className="min-h-[36px] px-2.5 rounded-xl bg-[#7C3AED]/15 border border-[#8B5CF6]/35 hover:bg-[#7C3AED]/25 text-[11px] font-semibold text-white inline-flex items-center justify-center gap-1.5"
                    >
                      <Sparkles size={13} className="text-[#C084FC]" /> AI Studio
                    </button>
                  </div>
                )}
              </div>

              {showSpacesModule && (
                <div className="p-5 rounded-2xl bg-[#0D0B16]/90 border border-white/[0.07] space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-display text-sm font-semibold text-white">
                      Suggested Spaces
                    </h3>
                    {onNavigate && (
                      <button
                        type="button"
                        onClick={() => onNavigate('spaces')}
                        className="text-xs text-[#C084FC] hover:underline"
                      >
                        Explore
                      </button>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    {suggestedSpaces.slice(0, 4).map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => onNavigate?.('spaces', s.id)}
                        className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-[#7C3AED]/10 text-left transition-colors"
                      >
                        <ResilientImage
                          src={s.coverUrl}
                          alt={s.name}
                          className="w-10 h-10 rounded-xl object-cover shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-white truncate">{s.name}</p>
                          <p className="text-[11px] text-[#94A3B8] truncate font-mono-tabular">
                            {s.category} · {formatCompactCount(s.membersCount || 0)} members
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </aside>

            {/* Center Stream */}
            <div
              className={`min-w-0 space-y-5 ${
                hasRightRail ? 'col-span-8 xl:col-span-6' : 'col-span-8 xl:col-span-9'
              }`}
            >
              {/* Render Stories & any non-rail sections in user's preferred sequence */}
              {homepagePrefs.sectionOrder
                .filter((id) => id === 'stories')
                .map((id) => renderSectionShelf(id))}
              <PostComposer spaces={spaces} users={users} />
              {renderVibesShelf()}
              {/* Inline Creators + Trending for lg (where xl right rail hides) */}
              <div className="xl:hidden space-y-4">
                {homepagePrefs.sectionOrder
                  .filter((id) => id === 'creators' || id === 'trending')
                  .map((id) => renderSectionShelf(id))}
              </div>
              {renderFeedFilterAndPosts()}
            </div>

            {/* Right Rail (xl+) */}
            {hasRightRail && (
              <aside className="hidden xl:block xl:col-span-3 space-y-5 sticky top-[4.5rem]">
                {homepagePrefs.sectionOrder
                  .filter((id) => id === 'creators' || id === 'trending')
                  .map((secId) => {
                    if (secId === 'creators' && showCreatorsModule) {
                      return (
                        <div
                          key="right-creators"
                          className="p-5 rounded-2xl bg-[#0D0B16]/90 border border-white/[0.07] space-y-3.5"
                        >
                          <h3 className="font-display text-sm font-semibold text-white">
                            Recommended Creators
                          </h3>
                          <div className="space-y-3">
                            {recommendedUsers.slice(0, 5).map((u) => {
                              const isFollowed = Boolean(followedUids[u.uid]);
                              const isBusy = Boolean(followBusyUids[u.uid]);
                              const status = getCreatorBadgeStatus(u);
                              return (
                                <div key={u.uid} className="flex items-center justify-between gap-2">
                                  <button
                                    type="button"
                                    onClick={() => onOpenProfile(u.uid)}
                                    className="flex items-center gap-2.5 min-w-0 text-left"
                                  >
                                    <div className="relative shrink-0">
                                      <CustomisedAvatar
                                        src={u.avatarUrl}
                                        alt={u.displayName}
                                        sizeClass="w-9 h-9"
                                        customisation={u.profileCustomisation}
                                      />
                                      {status && (
                                        <span className="absolute -bottom-0.5 -right-0.5">
                                          <PresenceBadge status={status} size="xs" />
                                        </span>
                                      )}
                                    </div>
                                    <div className="min-w-0">
                                      <p className="text-xs font-semibold text-white truncate inline-flex items-center gap-1 max-w-full">
                                        <span className="truncate">{u.displayName}</span>
                                        <BadgeStrip
                                          badges={getUserBadges(u.uid, u.verified)}
                                          size={11}
                                          max={2}
                                          interactive={false}
                                        />
                                        {isUserOfficialOwner(u.uid, u) && (
                                          <ShieldCheck
                                            size={11}
                                            className="text-[#C084FC] shrink-0"
                                            aria-label="Official Nexora Account"
                                          />
                                        )}
                                      </p>
                                      <p className="text-[11px] text-[#94A3B8] truncate">
                                        @{u.username}
                                      </p>
                                    </div>
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isBusy}
                                    onClick={() => void handleToggleFollow(u)}
                                    className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-semibold transition-colors shrink-0 disabled:opacity-60 ${
                                      isFollowed
                                        ? 'bg-white/10 text-white'
                                        : 'bg-[#7C3AED] hover:bg-[#6D28D9] text-white'
                                    }`}
                                  >
                                    <UserPlus size={11} />
                                    {isBusy ? '...' : isFollowed ? 'Following' : 'Follow'}
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                          {followError && (
                            <FriendlyErrorBanner
                              message={followError}
                              onDismiss={() => setFollowError('')}
                            />
                          )}
                        </div>
                      );
                    }

                    if (secId === 'trending' && showTrendingModule) {
                      return (
                        <div
                          key="right-trending"
                          className="p-5 rounded-2xl bg-[#0D0B16]/90 border border-white/[0.07] space-y-3"
                        >
                          <div className="flex items-center justify-between">
                            <h3 className="font-display text-sm font-semibold text-white">
                              Trending Topics
                            </h3>
                            {selectedHashtag && (
                              <button
                                type="button"
                                onClick={() => setSelectedHashtag('')}
                                className="text-[11px] text-rose-300 hover:underline"
                              >
                                Clear
                              </button>
                            )}
                          </div>
                          <div className="space-y-1.5">
                            {trendingHashtags.slice(0, 6).map(([tag, count]) => {
                              const active = selectedHashtag === tag;
                              return (
                                <button
                                  key={tag}
                                  type="button"
                                  onClick={() => setSelectedHashtag(active ? '' : tag)}
                                  className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs transition-colors ${
                                    active
                                      ? 'bg-[#7C3AED]/25 text-white font-semibold'
                                      : 'hover:bg-white/[0.04] text-[#CBD5E1]'
                                  }`}
                                >
                                  <span className="font-medium text-[#C084FC] truncate">
                                    #{tag}
                                  </span>
                                  <span className="font-mono-tabular text-[#64748B] text-[11px]">
                                    {count} posts
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    }

                    return null;
                  })}
              </aside>
            )}
          </div>
        ) : (
          /* Editorial Showcase OR Focus Stream Single-Column Layouts */
          <div
            className={`mx-auto space-y-5 ${
              homepagePrefs.layout === 'editorial'
                ? 'max-w-[980px]'
                : 'max-w-[760px]'
            }`}
          >
            {homepagePrefs.sectionOrder.map((secId) => renderSectionShelf(secId))}
            <PostComposer spaces={spaces} users={users} />
            {renderVibesShelf()}
            {renderFeedFilterAndPosts()}
          </div>
        )}
      </div>
    </div>
  );
}
