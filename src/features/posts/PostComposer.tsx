import React, { useEffect, useRef, useState } from 'react';
import {
  BarChart2,
  Globe,
  Hash,
  Image as ImageIcon,
  MapPin,
  Plus,
  Send,
  Trash2,
  Video,
  X,
} from 'lucide-react';
import { ResilientImage } from '../../components/common/ResilientImage';
import { useAuth } from '../../hooks/useAuth';
import { createPost } from '../../services/firebase/socialService';
import { uploadMediaAsset } from '../../services/storage/mediaUploadService';
import { AudienceType, PostType, Space } from '../../types/nexora';

interface PostComposerProps {
  spaces?: Space[];
  defaultSpaceId?: string;
  initialMediaUrl?: string;
  initialMediaType?: 'image' | 'video';
  onCreated?: () => void;
}

export function PostComposer({
  spaces = [],
  defaultSpaceId = '',
  initialMediaUrl = '',
  initialMediaType = 'image',
  onCreated,
}: PostComposerProps) {
  const { profile } = useAuth();
  const [text, setText] = useState('');
  const [mediaUrls, setMediaUrls] = useState<string[]>(initialMediaUrl ? [initialMediaUrl] : []);
  const [mediaTypes, setMediaTypes] = useState<string[]>(initialMediaUrl ? [initialMediaType] : []);
  const [showPoll, setShowPoll] = useState(false);
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [location, setLocation] = useState('');
  const [showLocation, setShowLocation] = useState(false);
  const [audience, setAudience] = useState<AudienceType>(defaultSpaceId ? 'space' : 'public');
  const [selectedSpaceId, setSelectedSpaceId] = useState(defaultSpaceId);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const photoRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialMediaUrl) {
      setMediaUrls((prev) => (prev.includes(initialMediaUrl) ? prev : [initialMediaUrl, ...prev].slice(0, 4)));
      setMediaTypes((prev) =>
        prev.length === 0 ? [initialMediaType] : [initialMediaType, ...prev].slice(0, 4)
      );
    }
  }, [initialMediaUrl, initialMediaType]);

  if (!profile) return null;

  const handleUploadFiles = async (e: React.ChangeEvent<HTMLInputElement>, kind: 'image' | 'video') => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setError('');
    setUploading(true);
    try {
      const remaining = Math.max(0, 4 - mediaUrls.length);
      for (const file of files.slice(0, remaining)) {
        const res = await uploadMediaAsset(file, `posts/${profile.uid}`, [kind]);
        setMediaUrls((prev) => [...prev, res.url]);
        setMediaTypes((prev) => [...prev, res.category]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Media upload failed.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const removeMediaAt = (idx: number) => {
    setMediaUrls((prev) => prev.filter((_, i) => i !== idx));
    setMediaTypes((prev) => prev.filter((_, i) => i !== idx));
  };

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const validPollOptions = showPoll ? pollOptions.map((o) => o.trim()).filter(Boolean) : [];
    if (!text.trim() && mediaUrls.length === 0 && validPollOptions.length < 2) {
      setError('Add text, media, or at least two poll options before publishing.');
      return;
    }

    let type: PostType = 'text';
    if (validPollOptions.length >= 2) type = 'poll';
    else if (mediaTypes.includes('video')) type = 'video';
    else if (mediaUrls.length > 0) type = 'photo';

    const targetSpace = spaces.find((s) => s.id === selectedSpaceId);

    setSubmitting(true);
    try {
      await createPost({
        author: profile,
        type,
        text,
        mediaUrls,
        mediaTypes,
        location,
        audience: selectedSpaceId ? 'space' : audience,
        spaceId: selectedSpaceId,
        spaceName: targetSpace?.name || '',
        pollOptions: validPollOptions,
      });
      setText('');
      setMediaUrls([]);
      setMediaTypes([]);
      setShowPoll(false);
      setPollOptions(['', '']);
      setLocation('');
      setShowLocation(false);
      onCreated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not publish post.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handlePublish}
      className="p-5 rounded-2xl bg-[#0D0B16] border border-[#8B5CF6]/20 space-y-4 shadow-[0_10px_30px_rgba(0,0,0,0.3)]"
    >
      <div className="flex items-start gap-3.5">
        <ResilientImage
          src={profile.avatarUrl}
          alt={profile.displayName}
          className="w-11 h-11 rounded-full object-cover shrink-0 ring-1 ring-[#8B5CF6]/40"
        />
        <div className="flex-1 space-y-3 min-w-0">
          <textarea
            rows={3}
            maxLength={2000}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What's on your mind?"
            className="w-full bg-transparent text-sm text-white placeholder:text-[#7C6E9B] outline-none resize-none leading-relaxed"
          />

          {/* Media Previews */}
          {mediaUrls.length > 0 && (
            <div className={`grid gap-2.5 ${mediaUrls.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
              {mediaUrls.map((url, idx) => (
                <div
                  key={`${url}-${idx}`}
                  className="relative rounded-xl overflow-hidden border border-[#8B5CF6]/20 bg-black aspect-video"
                >
                  {mediaTypes[idx] === 'video' ? (
                    <video src={url} controls className="w-full h-full object-cover" />
                  ) : (
                    <img src={url} alt="Upload preview" className="w-full h-full object-cover" />
                  )}
                  <button
                    type="button"
                    onClick={() => removeMediaAt(idx)}
                    aria-label="Remove media"
                    className="absolute top-2 right-2 p-1.5 rounded-full bg-black/75 text-white hover:bg-black"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Poll Builder */}
          {showPoll && (
            <div className="p-4 rounded-xl bg-[#08070F] border border-[#8B5CF6]/20 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#C084FC]">Interactive Poll</span>
                <button
                  type="button"
                  onClick={() => setShowPoll(false)}
                  className="text-xs text-[#94A3B8] hover:text-white"
                >
                  Remove poll
                </button>
              </div>
              {pollOptions.map((opt, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    maxLength={100}
                    value={opt}
                    onChange={(e) =>
                      setPollOptions((prev) => prev.map((v, i) => (i === idx ? e.target.value : v)))
                    }
                    placeholder={`Option ${idx + 1}`}
                    className="flex-1 px-3 py-2 rounded-xl bg-[#0D0B16] border border-[#8B5CF6]/20 text-xs text-white outline-none focus:border-[#8B5CF6]"
                  />
                  {pollOptions.length > 2 && (
                    <button
                      type="button"
                      onClick={() => setPollOptions((prev) => prev.filter((_, i) => i !== idx))}
                      className="p-1.5 text-[#64748B] hover:text-rose-400"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
              {pollOptions.length < 4 && (
                <button
                  type="button"
                  onClick={() => setPollOptions((prev) => [...prev, ''])}
                  className="inline-flex items-center gap-1 text-xs text-[#C084FC] hover:underline"
                >
                  <Plus size={13} /> Add option
                </button>
              )}
            </div>
          )}

          {/* Location Input */}
          {showLocation && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#08070F] border border-[#8B5CF6]/20">
              <MapPin size={14} className="text-[#A855F7]" />
              <input
                type="text"
                maxLength={100}
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="City, studio, or venue"
                className="flex-1 bg-transparent text-xs text-white outline-none"
              />
            </div>
          )}
        </div>
      </div>

      {error && <p className="text-xs text-rose-400">{error}</p>}

      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-white/[0.06]">
        <div className="flex flex-wrap items-center gap-1">
          <input
            ref={photoRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={(e) => handleUploadFiles(e, 'image')}
            className="hidden"
          />
          <input
            ref={videoRef}
            type="file"
            accept="video/mp4,video/webm,video/quicktime"
            onChange={(e) => handleUploadFiles(e, 'video')}
            className="hidden"
          />
          <button
            type="button"
            disabled={uploading || mediaUrls.length >= 4}
            onClick={() => photoRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl hover:bg-[#7C3AED]/10 text-xs text-[#CBD5E1] transition-colors"
          >
            <ImageIcon size={15} className="text-[#A855F7]" /> Photo
          </button>
          <button
            type="button"
            disabled={uploading || mediaUrls.length >= 4}
            onClick={() => videoRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl hover:bg-[#7C3AED]/10 text-xs text-[#CBD5E1] transition-colors"
          >
            <Video size={15} className="text-[#A855F7]" /> Video
          </button>
          <button
            type="button"
            onClick={() => setShowPoll((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl hover:bg-[#7C3AED]/10 text-xs text-[#CBD5E1] transition-colors"
          >
            <BarChart2 size={15} className="text-[#A855F7]" /> Poll
          </button>
          <button
            type="button"
            onClick={() => setShowLocation((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl hover:bg-[#7C3AED]/10 text-xs text-[#CBD5E1] transition-colors"
          >
            <MapPin size={15} className="text-[#A855F7]" /> Location
          </button>
          <button
            type="button"
            onClick={() => setText((prev) => `${prev}${prev && !prev.endsWith(' ') ? ' ' : ''}#`)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl hover:bg-[#7C3AED]/10 text-xs text-[#CBD5E1] transition-colors"
          >
            <Hash size={15} className="text-[#A855F7]" /> Topic
          </button>
        </div>

        <div className="flex items-center gap-2.5">
          {!defaultSpaceId && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#08070F] border border-[#8B5CF6]/20">
              <Globe size={13} className="text-[#94A3B8]" />
              <select
                value={selectedSpaceId ? `space:${selectedSpaceId}` : audience}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val.startsWith('space:')) {
                    setSelectedSpaceId(val.replace('space:', ''));
                    setAudience('space');
                  } else {
                    setSelectedSpaceId('');
                    setAudience(val as AudienceType);
                  }
                }}
                className="bg-transparent text-xs text-[#E2E8F0] outline-none"
              >
                <option value="public" className="bg-[#0D0B16]">
                  Public
                </option>
                <option value="followers" className="bg-[#0D0B16]">
                  Followers
                </option>
                {spaces.map((s) => (
                  <option key={s.id} value={`space:${s.id}`} className="bg-[#0D0B16]">
                    Space: {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || uploading}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-r from-[#6D28D9] via-[#7C3AED] to-[#9333EA] hover:opacity-95 disabled:opacity-50 text-xs font-semibold text-white shadow-[0_4px_18px_rgba(124,58,237,0.35)] transition-all whitespace-nowrap"
          >
            <Send size={14} />
            {uploading ? 'Uploading...' : submitting ? 'Publishing...' : 'Publish'}
          </button>
        </div>
      </div>
    </form>
  );
}
