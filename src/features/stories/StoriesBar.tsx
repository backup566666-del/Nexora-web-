import React, { useEffect, useRef, useState } from 'react';
import { Eye, Image as ImageIcon, Plus, Send, Type, Video, X } from 'lucide-react';
import { ResilientImage } from '../../components/common/ResilientImage';
import { VerifiedBadge } from '../../components/common/VerifiedBadge';
import { useAuth } from '../../hooks/useAuth';
import {
  createOrGetDirectConversation,
  createStory,
  getStoryViewers,
  recordStoryView,
  sendChatMessage,
} from '../../services/firebase/socialService';
import { uploadMediaAsset } from '../../services/storage/mediaUploadService';
import { Story, StoryPrivacy, StoryType, StoryView, UserProfile } from '../../types/nexora';
import { formatRelativeTime } from '../../utils/validation';

interface StoriesBarProps {
  stories: Story[];
  users: UserProfile[];
  onOpenChatThread: (convId: string) => void;
}

const STORY_GRADIENTS = [
  'from-[#4C1D95] via-[#7C3AED] to-[#06060A]',
  'from-[#1E1B4B] via-[#5B21B6] to-[#0D0D14]',
  'from-[#311042] via-[#701A75] to-[#09090F]',
  'from-[#0F172A] via-[#3B0764] to-[#06060A]',
];

export function StoriesBar({ stories, users, onOpenChatThread }: StoriesBarProps) {
  const { profile, getBadgeVariant } = useAuth();
  const [showCreate, setShowCreate] = useState(false);
  const [activeStory, setActiveStory] = useState<Story | null>(null);
  const [viewers, setViewers] = useState<StoryView[]>([]);
  const [showViewersList, setShowViewersList] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replySentNotice, setReplySentNotice] = useState('');

  // Create story state
  const [storyType, setStoryType] = useState<StoryType>('text');
  const [storyText, setStoryText] = useState('');
  const [storyMediaUrl, setStoryMediaUrl] = useState('');
  const [storyGradient, setStoryGradient] = useState(STORY_GRADIENTS[0]);
  const [storyPrivacy, setStoryPrivacy] = useState<StoryPrivacy>('public');
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!activeStory || !profile) return;
    setShowViewersList(false);
    setReplySentNotice('');
    void recordStoryView(activeStory, profile);
    if (activeStory.authorId === profile.uid) {
      getStoryViewers(activeStory.id)
        .then(setViewers)
        .catch(() => setViewers([]));
    } else {
      setViewers([]);
    }
  }, [activeStory, profile]);

  if (!profile) return null;

  const handleMediaSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setUploading(true);
    try {
      const expected = storyType === 'video' ? (['video'] as const) : (['image'] as const);
      const res = await uploadMediaAsset(file, `stories/${profile.uid}`, [...expected]);
      setStoryMediaUrl(res.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to upload story media.');
    } finally {
      setUploading(false);
    }
  };

  const handleCreateStory = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (storyType === 'text' && !storyText.trim()) {
      setError('Write a message for your text story.');
      return;
    }
    if ((storyType === 'image' || storyType === 'video') && !storyMediaUrl) {
      setError('Please upload media for this story.');
      return;
    }
    setSubmitting(true);
    try {
      await createStory({
        author: profile,
        type: storyType,
        text: storyText,
        mediaUrl: storyMediaUrl,
        bgGradient: storyGradient,
        privacy: storyPrivacy,
      });
      setShowCreate(false);
      setStoryText('');
      setStoryMediaUrl('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to publish story.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReact = async (emoji: string) => {
    if (!activeStory) return;
    await recordStoryView(activeStory, profile, emoji);
    setReplySentNotice(`Reacted ${emoji}`);
  };

  const handleReplyToStory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeStory || !replyText.trim()) return;
    const authorProfile = users.find((u) => u.uid === activeStory.authorId);
    if (!authorProfile) return;
    const convId = await createOrGetDirectConversation(profile, authorProfile);
    await sendChatMessage({
      convId,
      sender: profile,
      type: 'text',
      text: `Replied to your story: "${replyText.trim()}"`,
      recipientIds: [authorProfile.uid],
    });
    setReplyText('');
    setReplySentNotice('Reply sent via Chat');
    setTimeout(() => {
      setActiveStory(null);
      onOpenChatThread(convId);
    }, 600);
  };

  return (
    <>
      <div className="flex items-center gap-4 overflow-x-auto pb-2">
        {/* Add Story Card */}
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="shrink-0 w-20 flex flex-col items-center gap-2 group"
        >
          <div className="w-16 h-16 rounded-full border-2 border-dashed border-[#8B5CF6]/65 bg-[#0D0B16] group-hover:bg-[#7C3AED]/15 flex items-center justify-center transition-colors">
            <Plus size={22} className="text-[#C084FC]" />
          </div>
          <span className="text-xs font-medium text-[#CBD5E1] truncate w-full text-center">
            Create Story
          </span>
        </button>

        {/* Active Stories */}
        {stories.map((story) => (
          <button
            key={story.id}
            type="button"
            onClick={() => setActiveStory(story)}
            className="shrink-0 w-20 flex flex-col items-center gap-2 group"
          >
            <div className="p-[2.5px] rounded-full bg-gradient-to-tr from-[#5B21B6] via-[#8B5CF6] to-[#C084FC] shadow-[0_0_16px_rgba(124,58,237,0.28)]">
              <ResilientImage
                src={story.authorAvatar}
                alt={story.authorName}
                className="w-[58px] h-[58px] rounded-full object-cover border-2 border-[#06060A]"
              />
            </div>
            <span className="text-xs text-[#E2E8F0] truncate w-full text-center">
              {story.authorId === profile.uid ? 'Your Story' : story.authorName}
            </span>
          </button>
        ))}
      </div>

      {/* Create Story Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-[#0D0B16] border border-[#8B5CF6]/25 rounded-2xl p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-white">Create Story</h2>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="p-1.5 rounded-lg text-[#94A3B8] hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex items-center gap-2 p-1 bg-[#06060A] rounded-xl border border-white/10">
              {[
                { id: 'text', label: 'Text Story', icon: Type },
                { id: 'image', label: 'Photo', icon: ImageIcon },
                { id: 'video', label: 'Video', icon: Video },
              ].map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setStoryType(t.id as StoryType);
                      setStoryMediaUrl('');
                      setError('');
                    }}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium transition-colors ${
                      storyType === t.id
                        ? 'bg-[#7C3AED] text-white'
                        : 'text-[#94A3B8] hover:text-white'
                    }`}
                  >
                    <Icon size={14} /> {t.label}
                  </button>
                );
              })}
            </div>

            <form onSubmit={handleCreateStory} className="space-y-4">
              {storyType === 'text' ? (
                <div className="space-y-3">
                  <div
                    className={`rounded-2xl p-6 min-h-[200px] bg-gradient-to-br ${storyGradient} flex items-center justify-center border border-white/10`}
                  >
                    <textarea
                      rows={4}
                      maxLength={500}
                      value={storyText}
                      onChange={(e) => setStoryText(e.target.value)}
                      placeholder="Share a thought for the next 24 hours..."
                      className="w-full bg-transparent text-center font-display text-xl font-semibold text-white placeholder:text-white/50 outline-none resize-none"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[#94A3B8]">Backdrop:</span>
                    {STORY_GRADIENTS.map((g) => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => setStoryGradient(g)}
                        className={`w-6 h-6 rounded-full bg-gradient-to-br ${g} border ${
                          storyGradient === g ? 'border-white scale-110' : 'border-white/20'
                        }`}
                        aria-label="Select story gradient"
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <input
                    ref={fileRef}
                    type="file"
                    accept={storyType === 'video' ? 'video/mp4,video/webm' : 'image/jpeg,image/png,image/webp,image/gif'}
                    onChange={handleMediaSelect}
                    className="hidden"
                  />
                  {storyMediaUrl ? (
                    <div className="relative rounded-xl overflow-hidden border border-white/10 max-h-64 bg-black">
                      {storyType === 'video' ? (
                        <video src={storyMediaUrl} controls className="w-full max-h-64" />
                      ) : (
                        <img
                          src={storyMediaUrl}
                          alt="Story preview"
                          className="w-full max-h-64 object-contain"
                        />
                      )}
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={uploading}
                      onClick={() => fileRef.current?.click()}
                      className="w-full py-12 rounded-xl border border-dashed border-white/20 bg-[#06060A] hover:bg-white/[0.03] text-sm text-[#94A3B8]"
                    >
                      {uploading
                        ? 'Uploading...'
                        : `Click to upload ${storyType === 'video' ? 'video' : 'image'}`}
                    </button>
                  )}
                  <input
                    type="text"
                    maxLength={500}
                    value={storyText}
                    onChange={(e) => setStoryText(e.target.value)}
                    placeholder="Optional caption..."
                    className="w-full px-4 py-2.5 rounded-xl bg-[#06060A] border border-white/10 text-sm text-white outline-none"
                  />
                </div>
              )}

              <div className="flex items-center justify-between gap-4">
                <label className="flex items-center gap-2 text-xs text-[#CBD5E1]">
                  <span>Privacy:</span>
                  <select
                    value={storyPrivacy}
                    onChange={(e) => setStoryPrivacy(e.target.value as StoryPrivacy)}
                    className="bg-[#06060A] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none"
                  >
                    <option value="public">Everyone</option>
                    <option value="followers">Followers</option>
                    <option value="close">Close Circle</option>
                  </select>
                </label>

                <button
                  type="submit"
                  disabled={submitting || uploading}
                  className="px-5 py-2.5 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-sm font-semibold text-white"
                >
                  {submitting ? 'Publishing...' : 'Publish Story'}
                </button>
              </div>
              {error && <p className="text-xs text-rose-400">{error}</p>}
            </form>
          </div>
        </div>
      )}

      {/* Story Viewer Modal */}
      {activeStory && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="relative w-full max-w-md aspect-[9/15] rounded-2xl overflow-hidden border border-white/15 bg-[#0D0D14] flex flex-col justify-between">
            {/* Background Media / Gradient */}
            {activeStory.type === 'text' ? (
              <div
                className={`absolute inset-0 bg-gradient-to-br ${
                  activeStory.bgGradient || STORY_GRADIENTS[0]
                } flex items-center justify-center p-8 text-center`}
              >
                <p className="font-display text-2xl font-bold text-white leading-snug">
                  {activeStory.text}
                </p>
              </div>
            ) : activeStory.type === 'video' ? (
              <video
                src={activeStory.mediaUrl}
                autoPlay
                controls
                playsInline
                className="absolute inset-0 w-full h-full object-cover bg-black"
              />
            ) : (
              <img
                src={activeStory.mediaUrl}
                alt={activeStory.authorName}
                referrerPolicy="no-referrer"
                className="absolute inset-0 w-full h-full object-cover"
              />
            )}

            {/* Top Header */}
            <div className="relative z-10 p-4 bg-gradient-to-b from-black/80 via-black/40 to-transparent flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <ResilientImage
                  src={activeStory.authorAvatar}
                  alt={activeStory.authorName}
                  className="w-9 h-9 rounded-full object-cover border border-white/25"
                />
                <div>
                  <p className="text-xs font-semibold text-white inline-flex items-center gap-1">
                    {activeStory.authorName}
                    {getBadgeVariant(activeStory.authorId, activeStory.authorVerified) && (
                      <VerifiedBadge
                        size={12}
                        variant={getBadgeVariant(activeStory.authorId, activeStory.authorVerified)}
                      />
                    )}
                  </p>
                  <p className="text-[11px] text-white/70">
                    {formatRelativeTime(activeStory.createdAt)} · {activeStory.privacy}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveStory(null)}
                className="p-1.5 rounded-lg bg-black/40 text-white hover:bg-black/60"
                aria-label="Close story"
              >
                <X size={18} />
              </button>
            </div>

            {/* Caption & Controls Footer */}
            <div className="relative z-10 p-4 bg-gradient-to-t from-black/90 via-black/60 to-transparent space-y-3">
              {activeStory.type !== 'text' && activeStory.text && (
                <p className="text-sm text-white">{activeStory.text}</p>
              )}

              {replySentNotice && (
                <p className="text-xs text-[#C084FC] font-medium">{replySentNotice}</p>
              )}

              {activeStory.authorId === profile.uid ? (
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => setShowViewersList((v) => !v)}
                    className="inline-flex items-center gap-2 text-xs font-medium text-white bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg"
                  >
                    <Eye size={14} /> {activeStory.viewsCount} viewers
                  </button>
                  {showViewersList && (
                    <div className="max-h-36 overflow-y-auto bg-black/75 rounded-xl p-2.5 space-y-2 border border-white/10">
                      {viewers.length === 0 ? (
                        <p className="text-xs text-[#94A3B8]">No views recorded yet.</p>
                      ) : (
                        viewers.map((v) => (
                          <div key={v.uid} className="flex items-center justify-between text-xs">
                            <span className="text-white">{v.viewerName}</span>
                            <span>{v.reaction || 'Viewed'}</span>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2">
                    {['🔥', '💜', '👏', '😮'].map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => handleReact(emoji)}
                        className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-sm"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                  <form onSubmit={handleReplyToStory} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Reply to story..."
                      className="flex-1 px-3.5 py-2 rounded-xl bg-black/60 border border-white/20 text-xs text-white outline-none"
                    />
                    <button
                      type="submit"
                      className="p-2 rounded-xl bg-[#7C3AED] text-white"
                      aria-label="Send story reply"
                    >
                      <Send size={14} />
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
