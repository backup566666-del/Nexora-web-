import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Clock,
  Film,
  Hash,
  Layers,
  MessageSquare,
  Search,
  Sparkles,
  TrendingUp,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import {
  NavSection,
  Post,
  Space,
  SubscriptionTier,
  UserPreferences,
  UserProfile,
  VerifiedBadgeRecord,
  VerifiedBadgeType,
} from '../../types/nexora';
import {
  executeDiscoverySearch,
  loadSearchableCorpus,
  SearchResultCategory,
} from '../../services/firebase/searchService';
import {
  clearAllRecentSearches,
  removeRecentSearchTerm,
  saveRecentSearchTerm,
} from '../../services/firebase/socialService';
import { extractReadableErrorMessage } from '../../services/firebase/errorHandler';
import { formatCompactCount, formatRelativeTime, normalizeBadgeList } from '../../utils/validation';
import { ResilientImage } from '../../components/common/ResilientImage';
import { BadgeStrip } from '../../components/common/VerifiedBadge';
import { TierBadge } from '../../components/common/TierBadge';
import { FriendlyErrorBanner } from '../../components/common/FriendlyErrorBanner';

interface SearchDiscoveryPageProps {
  currentUser: UserProfile;
  initialQuery?: string;
  directoryUsers: UserProfile[];
  feedPosts: Post[];
  spaces: Space[];
  blockedUserIds: string[];
  followingIds: Set<string>;
  userPrefs: UserPreferences | null;
  verifiedBadgesMap: Record<string, VerifiedBadgeRecord>;
  getUserTier?: (uid: string, fallbackTier?: SubscriptionTier) => SubscriptionTier;
  onNavigate: (section: NavSection, targetId?: string) => void;
  onOpenUserProfile: (uid: string) => void;
  onOpenPost?: (postId: string) => void;
}

const FILTER_TABS: Array<{ id: SearchResultCategory; label: string }> = [
  { id: 'all', label: 'All Results' },
  { id: 'people', label: 'People' },
  { id: 'posts', label: 'Posts' },
  { id: 'vibes', label: 'Vibes' },
  { id: 'spaces', label: 'Spaces' },
  { id: 'topics', label: 'Hashtags & Topics' },
  { id: 'discussions', label: 'Discussions' },
  { id: 'polls', label: 'Polls' },
];

export const SearchDiscoveryPage: React.FC<SearchDiscoveryPageProps> = ({
  currentUser,
  initialQuery = '',
  directoryUsers,
  feedPosts,
  spaces,
  blockedUserIds,
  followingIds,
  userPrefs,
  verifiedBadgesMap,
  getUserTier,
  onNavigate,
  onOpenUserProfile,
  onOpenPost,
}) => {
  const [queryText, setQueryText] = useState(initialQuery);
  const [activeCategory, setActiveCategory] = useState<SearchResultCategory>('all');
  const [sortMode, setSortMode] = useState<'relevance' | 'recent' | 'popular'>('relevance');
  const [pageSize, setPageSize] = useState(12);
  const [loadingCorpus, setLoadingCorpus] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [corpus, setCorpus] = useState<{
    users: UserProfile[];
    posts: Post[];
    vibes: Awaited<ReturnType<typeof loadSearchableCorpus>>['vibes'];
    spaces: Space[];
    discussions: Awaited<ReturnType<typeof loadSearchableCorpus>>['discussions'];
  }>({
    users: directoryUsers,
    posts: feedPosts,
    vibes: [],
    spaces,
    discussions: [],
  });

  useEffect(() => {
    setQueryText(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    let active = true;
    setLoadingCorpus(true);
    void loadSearchableCorpus({
      viewerUid: currentUser.uid,
      blockedUserIds,
      followingIds,
      directoryUsers,
      feedPosts,
      spaces,
    })
      .then((res) => {
        if (!active) return;
        setCorpus(res);
        setLoadingCorpus(false);
      })
      .catch((err) => {
        if (!active) return;
        setLoadingCorpus(false);
        setErrorMsg(extractReadableErrorMessage(err, 'Unable to load discovery directory.'));
      });
    return () => {
      active = false;
    };
  }, [currentUser.uid, blockedUserIds, followingIds, directoryUsers, feedPosts, spaces]);

  const results = useMemo(
    () =>
      executeDiscoverySearch({
        queryText,
        users: corpus.users,
        posts: corpus.posts,
        vibes: corpus.vibes,
        spaces: corpus.spaces,
        discussions: corpus.discussions,
        sortMode,
      }),
    [queryText, corpus, sortMode]
  );

  const recentSearches = userPrefs?.recentSearches || [];

  const getBadges = (uid: string, fallback: boolean): VerifiedBadgeType[] => {
    const rec = verifiedBadgesMap[uid];
    if (rec) return normalizeBadgeList(rec.badges, rec.badgeType);
    return fallback ? ['verified_identity'] : [];
  };

  const commitSearch = (term: string) => {
    const clean = term.trim();
    if (!clean) return;
    setQueryText(clean);
    void saveRecentSearchTerm(currentUser.uid, clean, userPrefs);
  };

  const totalMatches =
    results.people.length +
    results.posts.length +
    results.vibes.length +
    results.spaces.length +
    results.topics.length +
    results.discussions.length;

  return (
    <div className="space-y-5">
      {/* Search Bar & Discovery Header */}
      <section className="rounded-2xl bg-[#0D0B16] border border-[#8B5CF6]/20 p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
              <Search size={20} className="text-[#C084FC]" />
              Search & Discovery
            </h1>
            <p className="text-xs sm:text-sm text-[#94A3B8] mt-0.5">
              Find creators, posts, Vibes, Spaces, hashtags, discussions, and polls across Nexora.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="search-sort" className="text-xs text-[#94A3B8]">
              Sort:
            </label>
            <select
              id="search-sort"
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as 'relevance' | 'recent' | 'popular')}
              className="min-h-[40px] rounded-xl bg-[#120F1E] border border-white/10 px-3 text-xs text-white focus:outline-none focus:border-[#8B5CF6]"
            >
              <option value="relevance">Relevance</option>
              <option value="popular">Most Popular</option>
              <option value="recent">Most Recent</option>
            </select>
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            commitSearch(queryText);
          }}
          className="relative"
        >
          <Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
          <input
            type="search"
            value={queryText}
            onChange={(e) => setQueryText(e.target.value)}
            placeholder="Search people, @usernames, #hashtags, Vibes, Spaces, polls..."
            className="w-full min-h-[46px] pl-11 pr-24 rounded-xl bg-[#120F1E] border border-[#8B5CF6]/25 text-sm text-white placeholder-[#64748B] focus:outline-none focus:border-[#A855F7]"
          />
          {queryText && (
            <button
              type="button"
              onClick={() => setQueryText('')}
              aria-label="Clear search query"
              className="absolute right-20 top-1/2 -translate-y-1/2 p-1.5 text-[#94A3B8] hover:text-white"
            >
              <X size={15} />
            </button>
          )}
          <button
            type="submit"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 min-h-[36px] px-3.5 rounded-lg bg-[#7C3AED] hover:bg-[#6D28D9] text-xs font-semibold text-white"
          >
            Search
          </button>
        </form>

        {/* Recent Searches */}
        {recentSearches.length > 0 && (
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#94A3B8] flex items-center gap-1.5">
                <Clock size={12} /> Recent Searches
              </span>
              <button
                type="button"
                onClick={() => void clearAllRecentSearches(currentUser.uid, userPrefs)}
                className="text-xs text-[#C084FC] hover:underline"
              >
                Clear history
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {recentSearches.map((term) => (
                <div
                  key={term}
                  className="inline-flex items-center rounded-xl bg-[#120F1E] border border-white/10 text-xs text-[#CBD5E1]"
                >
                  <button
                    type="button"
                    onClick={() => commitSearch(term)}
                    className="px-3 py-1.5 hover:text-white"
                  >
                    {term}
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${term}`}
                    onClick={() => void removeRecentSearchTerm(currentUser.uid, term, userPrefs)}
                    className="pr-2 py-1.5 text-[#64748B] hover:text-white"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {errorMsg && <FriendlyErrorBanner message={errorMsg} onDismiss={() => setErrorMsg('')} />}
      </section>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {FILTER_TABS.map((tab) => {
          const active = activeCategory === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveCategory(tab.id);
                setPageSize(12);
              }}
              className={`min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                active
                  ? 'bg-[#7C3AED] text-white'
                  : 'bg-[#0D0B16] border border-white/[0.08] text-[#94A3B8] hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Discovery Highlights when no active query */}
      {!queryText.trim() && activeCategory === 'all' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-2xl bg-[#0D0B16] border border-[#8B5CF6]/15 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm font-semibold text-white flex items-center gap-2">
                <TrendingUp size={15} className="text-[#C084FC]" /> Trending Topics
              </h2>
              <button
                type="button"
                onClick={() => setActiveCategory('topics')}
                className="text-xs text-[#C084FC] hover:underline"
              >
                See all
              </button>
            </div>
            {results.topics.length === 0 ? (
              <p className="text-xs text-[#64748B]">Hashtags from community posts will appear here.</p>
            ) : (
              <div className="space-y-2">
                {results.topics.slice(0, 6).map((topic) => (
                  <button
                    key={topic.tag}
                    type="button"
                    onClick={() => commitSearch(`#${topic.tag}`)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-[#120F1E] hover:bg-[#7C3AED]/15 text-left transition-colors"
                  >
                    <span className="text-xs font-semibold text-[#C084FC]">#{topic.tag}</span>
                    <span className="font-mono-tabular text-[11px] text-[#94A3B8]">
                      {topic.count} posts
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-[#0D0B16] border border-[#8B5CF6]/15 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm font-semibold text-white flex items-center gap-2">
                <Sparkles size={15} className="text-amber-300" /> Recommended Spaces
              </h2>
              <button
                type="button"
                onClick={() => setActiveCategory('spaces')}
                className="text-xs text-[#C084FC] hover:underline"
              >
                Explore Spaces
              </button>
            </div>
            {results.spaces.length === 0 ? (
              <p className="text-xs text-[#64748B]">No public Spaces available yet.</p>
            ) : (
              <div className="space-y-2">
                {results.spaces.slice(0, 5).map((space) => (
                  <button
                    key={space.id}
                    type="button"
                    onClick={() => onNavigate('spaces', space.id)}
                    className="w-full flex items-center gap-3 p-2.5 rounded-xl bg-[#120F1E] hover:bg-[#7C3AED]/15 text-left transition-colors"
                  >
                    <ResilientImage
                      src={space.coverUrl}
                      alt={space.name}
                      className="w-10 h-10 rounded-xl object-cover shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-white truncate">{space.name}</p>
                      <p className="text-[11px] text-[#94A3B8] truncate">
                        {space.category} · <span className="font-mono-tabular">{space.membersCount}</span> members
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Results Sections */}
      {loadingCorpus ? (
        <div className="rounded-2xl bg-[#0D0B16] border border-white/[0.08] p-12 text-center text-xs text-[#94A3B8]">
          Loading Nexora discovery index...
        </div>
      ) : totalMatches === 0 ? (
        <div className="rounded-2xl bg-[#0D0B16] border border-white/[0.08] p-12 text-center space-y-2">
          <p className="font-display text-base font-semibold text-white">No matching results</p>
          <p className="text-xs text-[#94A3B8]">
            Try another keyword, username, or hashtag to discover creators and discussions.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {/* People Results */}
          {(activeCategory === 'all' || activeCategory === 'people') && results.people.length > 0 && (
            <section className="rounded-2xl bg-[#0D0B16] border border-[#8B5CF6]/15 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-sm font-semibold text-white flex items-center gap-2">
                  <Users size={15} className="text-[#C084FC]" /> People ({results.people.length})
                </h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {results.people.slice(0, activeCategory === 'people' ? pageSize : 6).map((person) => {
                  const tier = getUserTier
                    ? getUserTier(person.uid, person.subscriptionTier)
                    : person.subscriptionTier || 'free';
                  return (
                    <button
                      key={person.uid}
                      type="button"
                      onClick={() => onOpenUserProfile(person.uid)}
                      className="flex items-center gap-3 p-3 rounded-xl bg-[#120F1E] border border-white/[0.06] hover:border-[#8B5CF6]/35 text-left transition-colors"
                    >
                      <ResilientImage
                        src={person.avatarUrl}
                        alt={person.displayName}
                        className="w-11 h-11 rounded-full object-cover shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-sm font-semibold text-white truncate">
                            {person.displayName}
                          </span>
                          <BadgeStrip badges={getBadges(person.uid, person.verified)} size={13} max={2} interactive={false} />
                          <TierBadge tier={tier} size="xs" />
                        </div>
                        <p className="text-xs text-[#94A3B8] truncate">
                          @{person.username} · <span className="font-mono-tabular">{formatCompactCount(person.followersCount)}</span> followers
                        </p>
                      </div>
                      <UserPlus size={15} className="text-[#C084FC] shrink-0" />
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* Posts Results */}
          {(activeCategory === 'all' || activeCategory === 'posts') && results.posts.length > 0 && (
            <section className="rounded-2xl bg-[#0D0B16] border border-[#8B5CF6]/15 p-5 space-y-3">
              <h2 className="font-display text-sm font-semibold text-white flex items-center gap-2">
                <MessageSquare size={15} className="text-[#C084FC]" /> Posts ({results.posts.length})
              </h2>
              <div className="space-y-2.5">
                {results.posts.slice(0, activeCategory === 'posts' ? pageSize : 5).map((post) => {
                  const tier = getUserTier ? getUserTier(post.authorId) : 'free';
                  return (
                    <button
                      key={post.id}
                      type="button"
                      onClick={() => (onOpenPost ? onOpenPost(post.id) : onNavigate('home'))}
                      className="w-full p-3.5 rounded-xl bg-[#120F1E] border border-white/[0.06] hover:border-[#8B5CF6]/35 text-left transition-colors space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-xs font-semibold text-white truncate">{post.authorName}</span>
                          <BadgeStrip badges={getBadges(post.authorId, post.authorVerified)} size={12} max={2} interactive={false} />
                          <TierBadge tier={tier} size="xs" />
                          <span className="text-[11px] text-[#64748B] truncate">@{post.authorUsername}</span>
                        </div>
                        <span className="text-[11px] text-[#64748B] shrink-0">
                          {formatRelativeTime(post.createdAt)}
                        </span>
                      </div>
                      <p className="text-xs text-[#CBD5E1] line-clamp-2">{post.text}</p>
                      <p className="text-[11px] text-[#94A3B8] font-mono-tabular">
                        {post.likesCount} likes · {post.commentsCount} comments · {post.repostsCount} reposts
                      </p>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* Vibes Results */}
          {(activeCategory === 'all' || activeCategory === 'vibes') && results.vibes.length > 0 && (
            <section className="rounded-2xl bg-[#0D0B16] border border-[#8B5CF6]/15 p-5 space-y-3">
              <h2 className="font-display text-sm font-semibold text-white flex items-center gap-2">
                <Film size={15} className="text-[#C084FC]" /> Vibes ({results.vibes.length})
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {results.vibes.slice(0, activeCategory === 'vibes' ? pageSize : 4).map((vibe) => (
                  <button
                    key={vibe.id}
                    type="button"
                    onClick={() => onNavigate('vibes', vibe.id)}
                    className="flex items-center gap-3 p-3 rounded-xl bg-[#120F1E] border border-white/[0.06] hover:border-[#8B5CF6]/35 text-left transition-colors"
                  >
                    <div className="w-12 h-14 rounded-lg bg-[#1A142B] flex items-center justify-center shrink-0 text-[#C084FC]">
                      <Film size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-white line-clamp-1">{vibe.caption || 'Untitled Vibe'}</p>
                      <p className="text-[11px] text-[#94A3B8] truncate">
                        @{vibe.authorUsername} · <span className="font-mono-tabular">{formatCompactCount(vibe.viewsCount)}</span> views
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Spaces Results */}
          {(activeCategory === 'all' || activeCategory === 'spaces') && results.spaces.length > 0 && (
            <section className="rounded-2xl bg-[#0D0B16] border border-[#8B5CF6]/15 p-5 space-y-3">
              <h2 className="font-display text-sm font-semibold text-white flex items-center gap-2">
                <Layers size={15} className="text-[#C084FC]" /> Spaces ({results.spaces.length})
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {results.spaces.slice(0, activeCategory === 'spaces' ? pageSize : 4).map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => onNavigate('spaces', s.id)}
                    className="flex items-center gap-3 p-3 rounded-xl bg-[#120F1E] border border-white/[0.06] hover:border-[#8B5CF6]/35 text-left transition-colors"
                  >
                    <ResilientImage src={s.coverUrl} alt={s.name} className="w-11 h-11 rounded-xl object-cover shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-white truncate">{s.name}</p>
                      <p className="text-[11px] text-[#94A3B8] line-clamp-1">{s.description}</p>
                      <p className="text-[11px] text-[#64748B] font-mono-tabular mt-0.5">
                        {s.category} · {s.membersCount} members
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Topics / Hashtags */}
          {(activeCategory === 'topics' || (activeCategory === 'all' && queryText.trim())) &&
            results.topics.length > 0 && (
              <section className="rounded-2xl bg-[#0D0B16] border border-[#8B5CF6]/15 p-5 space-y-3">
                <h2 className="font-display text-sm font-semibold text-white flex items-center gap-2">
                  <Hash size={15} className="text-[#C084FC]" /> Hashtags & Topics ({results.topics.length})
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {results.topics.slice(0, activeCategory === 'topics' ? pageSize : 9).map((t) => (
                    <button
                      key={t.tag}
                      type="button"
                      onClick={() => commitSearch(`#${t.tag}`)}
                      className="p-3 rounded-xl bg-[#120F1E] border border-white/[0.06] hover:border-[#8B5CF6]/35 text-left"
                    >
                      <p className="text-xs font-semibold text-[#C084FC] truncate">#{t.tag}</p>
                      <p className="text-[11px] text-[#94A3B8] font-mono-tabular mt-0.5">{t.count} items</p>
                    </button>
                  ))}
                </div>
              </section>
            )}

          {/* Polls */}
          {(activeCategory === 'polls' || (activeCategory === 'all' && queryText.trim())) &&
            results.polls.length > 0 && (
              <section className="rounded-2xl bg-[#0D0B16] border border-[#8B5CF6]/15 p-5 space-y-3">
                <h2 className="font-display text-sm font-semibold text-white flex items-center gap-2">
                  <BarChart3 size={15} className="text-[#C084FC]" /> Polls ({results.polls.length})
                </h2>
                <div className="space-y-2.5">
                  {results.polls.slice(0, activeCategory === 'polls' ? pageSize : 4).map((poll) => (
                    <button
                      key={poll.id}
                      type="button"
                      onClick={() => (onOpenPost ? onOpenPost(poll.id) : onNavigate('home'))}
                      className="w-full p-3.5 rounded-xl bg-[#120F1E] border border-white/[0.06] hover:border-[#8B5CF6]/35 text-left space-y-1"
                    >
                      <p className="text-xs font-semibold text-white">{poll.text}</p>
                      <p className="text-[11px] text-[#94A3B8]">
                        {poll.pollOptions.join(' · ')}
                      </p>
                    </button>
                  ))}
                </div>
              </section>
            )}

          {/* Discussions */}
          {(activeCategory === 'discussions' || (activeCategory === 'all' && queryText.trim())) &&
            results.discussions.length > 0 && (
              <section className="rounded-2xl bg-[#0D0B16] border border-[#8B5CF6]/15 p-5 space-y-3">
                <h2 className="font-display text-sm font-semibold text-white flex items-center gap-2">
                  <MessageSquare size={15} className="text-[#C084FC]" /> Space Discussions ({results.discussions.length})
                </h2>
                <div className="space-y-2.5">
                  {results.discussions.slice(0, activeCategory === 'discussions' ? pageSize : 5).map((disc) => (
                    <button
                      key={disc.id}
                      type="button"
                      onClick={() => onNavigate('spaces', disc.spaceId)}
                      className="w-full p-3.5 rounded-xl bg-[#120F1E] border border-white/[0.06] hover:border-[#8B5CF6]/35 text-left space-y-1"
                    >
                      <p className="text-xs font-semibold text-white">
                        {disc.authorName} <span className="text-[#94A3B8] font-normal">in {disc.spaceName}</span>
                      </p>
                      <p className="text-xs text-[#CBD5E1] line-clamp-2">{disc.text}</p>
                    </button>
                  ))}
                </div>
              </section>
            )}

          {activeCategory !== 'all' && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => setPageSize((prev) => prev + 12)}
                className="min-h-[44px] px-5 py-2 rounded-xl bg-[#120F1E] border border-white/10 text-xs font-semibold text-[#CBD5E1] hover:text-white"
              >
                Load more results
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
