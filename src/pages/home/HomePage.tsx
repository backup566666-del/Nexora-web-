import React, { useMemo, useState } from 'react';
import { StoriesBar } from '../../features/stories/StoriesBar';
import { PostComposer } from '../../features/posts/PostComposer';
import { PostCard } from '../../features/posts/PostCard';
import { useAuth } from '../../hooks/useAuth';
import { Post, Space, Story, UserProfile } from '../../types/nexora';

interface HomePageProps {
  posts: Post[];
  stories: Story[];
  spaces: Space[];
  users: UserProfile[];
  savedPostIds: string[];
  onOpenProfile: (uid: string) => void;
  onOpenChatThread: (convId: string) => void;
}

export function HomePage({
  posts,
  stories,
  spaces,
  users,
  savedPostIds,
  onOpenProfile,
  onOpenChatThread,
}: HomePageProps) {
  const { privateInfo, platformConfig } = useAuth();
  const [filter, setFilter] = useState<'all' | 'discussions' | 'media' | 'polls'>('all');

  const blockedSet = useMemo(
    () => new Set(privateInfo?.blockedUserIds || []),
    [privateInfo]
  );

  const visiblePosts = useMemo(() => {
    return posts.filter((p) => {
      if (blockedSet.has(p.authorId)) return false;
      if (filter === 'discussions') return p.type === 'text' || p.type === 'repost';
      if (filter === 'media') return (p.mediaUrls?.length || 0) > 0;
      if (filter === 'polls') return p.type === 'poll';
      return true;
    });
  }, [posts, blockedSet, filter]);

  return (
    <div className="w-full space-y-5">
      {/* Stories Bar */}
      {platformConfig.features.storiesEnabled && (
        <div className="p-4 rounded-2xl bg-[#0D0B16]/75 border border-[#8B5CF6]/15">
          <StoriesBar
            stories={stories}
            users={users}
            onOpenChatThread={onOpenChatThread}
          />
        </div>
      )}

      {/* Main Composer */}
      <PostComposer spaces={spaces} users={users} />

      {/* Feed Filter Bar */}
      <div className="flex items-center justify-between border-b border-white/[0.07] pb-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: 'all', label: 'All Feed' },
            { id: 'discussions', label: 'Discussions' },
            { id: 'media', label: 'Photos & Video' },
            { id: 'polls', label: 'Polls' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id as typeof filter)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                filter === tab.id
                  ? 'bg-gradient-to-r from-[#6D28D9] to-[#7C3AED] text-white shadow-[0_2px_12px_rgba(124,58,237,0.3)]'
                  : 'text-[#94A3B8] hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <span className="text-xs font-mono-tabular text-[#64748B]">
          {visiblePosts.length} updates
        </span>
      </div>

      {/* Discussion Feed */}
      <div className="space-y-3">
        {visiblePosts.length === 0 ? (
          <div className="p-12 rounded-2xl bg-[#0D0B16] border border-[#8B5CF6]/15 text-center space-y-2">
            <h3 className="font-display text-base font-semibold text-white">
              Your Nexora feed is ready
            </h3>
            <p className="text-xs text-[#94A3B8]">
              Start a conversation above or join Spaces to see community updates here.
            </p>
          </div>
        ) : (
          visiblePosts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              isSaved={savedPostIds.includes(post.id)}
              onOpenProfile={onOpenProfile}
            />
          ))
        )}
      </div>
    </div>
  );
}
