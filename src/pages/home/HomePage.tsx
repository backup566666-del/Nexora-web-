import React, { useEffect, useMemo, useState } from 'react';
import {
  Bell,
  Compass,
  Film,
  Flame,
  Hash,
  Heart,
  MessageSquare,
  Play,
  Plus,
  TrendingUp,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { ResilientImage } from '../../components/common/ResilientImage';
import { BadgeStrip } from '../../components/common/VerifiedBadge';
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
  NavSection,
  NotificationItem,
  Post,
  Space,
  Story,
  UserProfile,
  Vibe,
} from '../../types/nexora';
import {
  computePostEngagementScore,
  formatCompactCount,
  formatRelativeTime,
  rankTrendingPosts,
} from '../../utils/validation';

export { computePostEngagementScore, rankTrendingPosts };

type ProfileContentTab =
  | 'posts'
  | 'videos'
  | 'photos'
  | 'tagged'
  | 'collabs'
  | 'gifts'
  | 'spaces'
  | 'saved';

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
}: HomePageProps) {
  const { profile, privateInfo, platformConfig, getUserBadges } = useAuth();
  const [filter, setFilter] = useState<
    'all' | 'trending' | 'media' | 'discussions' | 'polls'
  >('all');
  const [selectedHashtag, setSelectedHashtag] = useState<string>('');
  const [followedUids, setFollowedUids] = useState<Record<string, boolean>>({});
  const [followBusyUids, setFollowBusyUids] = useState<Record<string, boolean>>({});
  const [followError, setFollowError] = useState('');

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
        const onlineDiff =
          Number(isUserOnlineNow(b)) - Number(isUserOnlineNow(a));
        if (onlineDiff !== 0) return onlineDiff;
        return (b.followersCount || 0) - (a.followersCount || 0);
      })
      .slice(0, 8);
  }, [users, profile, blockedSet]);

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

  const videoPosts = useMemo(() => {
    return posts
      .filter(
        (p) =>
          !blockedSet.has(p.authorId) &&
          p.mediaTypes?.some((t) => t === 'video') &&
          p.mediaUrls?.length > 0
      )
      .slice(0, 4);
  }, [posts, blockedSet]);

  const trendingHashtags = useMemo(() => {
    const counts = new Map<string, number>();
    posts.forEach((p) => {
      if (blockedSet.has(p.authorId)) return;
      (p.hashtags || []).forEach((tag) => {
        const clean = tag.replace(/^#+/, '').trim().toLowerCase();
        if (clean) counts.set(clean, (counts.get(clean) || 0) + 1);
      });
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
  }, [posts, blockedSet]);

  const visiblePosts = useMemo(() => {
    const base = posts.filter((p) => {
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
  }, [posts, blockedSet, filter, selectedHashtag]);

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

  return (
    <div className="w-full space-y-5">
      {/* Personalized Activity & Quick Actions Bar */}
      {profile && (
        <section className="p-3.5 sm:p-4 rounded-2xl bg-[#0D0B16]/85 border border-[#8B5CF6]/20 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-display text-sm sm:text-base font-semibold text-white truncate">
              Welcome back, {profile.displayName.split(' ')[0]}
            </p>
            <p className="text-[11px] sm:text-xs text-[#94A3B8] truncate">
              {unreadNotifications.length > 0
                ? `${unreadNotifications.length} unread notification${
                    unreadNotifications.length === 1 ? '' : 's'
                  }${
                    unreadMessageCount > 0
                      ? ` · ${unreadMessageCount} unread message${
                          unreadMessageCount === 1 ? '' : 's'
                        }`
                      : ''
                  }`
                : 'Your personalized Nexora feed, stories, vibes & communities'}
            </p>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar max-w-full">
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
                  } else if (latest.type === 'space_invite' && latest.targetId) {
                    onNavigate?.('spaces', latest.targetId);
                  } else {
                    onNavigate?.('settings');
                  }
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#7C3AED]/20 border border-[#8B5CF6]/35 text-xs font-semibold text-[#E9D5FF] hover:bg-[#7C3AED]/30 transition-colors whitespace-nowrap min-h-[38px]"
              >
                <Bell size={13} className="text-[#C084FC]" />
                <span>{unreadNotifications.length} New</span>
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
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-[#6D28D9] to-[#7C3AED] text-xs font-semibold text-white whitespace-nowrap min-h-[38px]"
              >
                <Plus size={13} />
                <span>Create</span>
              </button>
            )}
          </div>
        </section>
      )}

      {/* Stories Bar */}
      {platformConfig.features.storiesEnabled && (
        <div className="p-3.5 sm:p-4 rounded-2xl bg-[#0D0B16]/75 border border-[#8B5CF6]/15">
          <StoriesBar
            stories={stories}
            users={users}
            onOpenChatThread={onOpenChatThread}
          />
        </div>
      )}

      {/* Main Post Creation */}
      <PostComposer spaces={spaces} users={users} />

      {/* Videos & Vibes Showcase */}
      {platformConfig.features.vibesEnabled &&
        (featuredVibes.length > 0 || videoPosts.length > 0) && (
          <section className="p-3.5 sm:p-4 rounded-2xl bg-[#0D0B16]/75 border border-[#8B5CF6]/15 space-y-3">
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
        )}

      {/* Recommended Users (Responsive Strip for Phones, Tablets & Laptops where Right Rail is hidden) */}
      {recommendedUsers.length > 0 && (
        <section className="xl:hidden p-3.5 sm:p-4 rounded-2xl bg-[#0D0B16]/75 border border-[#8B5CF6]/15 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Users size={15} className="text-[#C084FC]" />
              <h2 className="font-display text-sm font-semibold text-white">
                Recommended Creators
              </h2>
            </div>
            <span className="text-[11px] text-[#94A3B8]">
              {recommendedUsers.length} suggested
            </span>
          </div>

          <div className="flex items-stretch gap-2.5 overflow-x-auto no-scrollbar snap-x pb-1">
            {recommendedUsers.map((u) => {
              const isFollowed = Boolean(followedUids[u.uid]);
              const isBusy = Boolean(followBusyUids[u.uid]);
              const online = isUserOnlineNow(u);
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
                      <ResilientImage
                        src={u.avatarUrl}
                        alt={u.displayName}
                        className="w-10 h-10 rounded-full object-cover ring-1 ring-[#8B5CF6]/35"
                      />
                      {online && (
                        <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-[#08070F]" />
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
            <p className="text-[11px] text-rose-300 bg-rose-500/10 border border-rose-500/25 rounded-lg px-2.5 py-1.5">
              {followError}
            </p>
          )}
        </section>
      )}

      {/* Suggested Spaces (Responsive Strip for Phones & Tablets where Left Rail is hidden) */}
      {platformConfig.features.spacesEnabled && suggestedSpaces.length > 0 && (
        <section className="lg:hidden p-3.5 sm:p-4 rounded-2xl bg-[#0D0B16]/75 border border-[#8B5CF6]/15 space-y-3">
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
      )}

      {/* Trending Topics & Feed Filter Controls */}
      <div className="space-y-2.5 border-b border-white/[0.07] pb-3">
        {trendingHashtags.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#94A3B8] shrink-0 mr-1">
              <TrendingUp size={12} className="text-[#C084FC]" /> Trending:
            </span>
            {trendingHashtags.map(([tag, count]) => {
              const active = selectedHashtag === tag;
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setSelectedHashtag(active ? '' : tag)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap transition-colors min-h-[30px] ${
                    active
                      ? 'bg-[#7C3AED] text-white'
                      : 'bg-[#0D0B16] border border-white/[0.08] text-[#CBD5E1] hover:border-[#8B5CF6]/40'
                  }`}
                >
                  <Hash size={10} />
                  <span>{tag}</span>
                  <span className="font-mono-tabular text-[10px] opacity-75">
                    {count}
                  </span>
                </button>
              );
            })}
            {selectedHashtag && (
              <button
                type="button"
                onClick={() => setSelectedHashtag('')}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-500/15 text-rose-300 text-[11px] font-semibold whitespace-nowrap min-h-[30px]"
              >
                <X size={11} /> Clear
              </button>
            )}
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
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
      </div>

      {/* Discussion & Trending Post Feed */}
      <div className="space-y-3">
        {visiblePosts.length === 0 ? (
          <div className="p-10 sm:p-12 rounded-2xl bg-[#0D0B16] border border-[#8B5CF6]/15 text-center space-y-2">
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
              onHashtagClick={(tag) => setSelectedHashtag(tag)}
            />
          ))
        )}
      </div>
    </div>
  );
}
