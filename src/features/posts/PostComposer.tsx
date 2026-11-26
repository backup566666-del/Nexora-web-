import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart2,
  Globe,
  Hash,
  Image as ImageIcon,
  MapPin,
  Plus,
  Send,
  Tag,
  Trash2,
  UserPlus,
  Video,
  X,
} from 'lucide-react';
import { ResilientImage } from '../../components/common/ResilientImage';
import { BadgeStrip } from '../../components/common/VerifiedBadge';
import { useAuth } from '../../hooks/useAuth';
import { extractReadableErrorMessage } from '../../services/firebase/errorHandler';
import { createPost, searchDirectoryUsers, subscribeDirectoryUsers } from '../../services/firebase/socialService';
import { uploadMediaAsset } from '../../services/storage/mediaUploadService';
import { AudienceType, PostType, Space, UserProfile } from '../../types/nexora';
import { BLUEPRINT_LIMITS } from '../../utils/validation';

interface PostComposerProps {
  spaces?: Space[];
  users?: UserProfile[];
  defaultSpaceId?: string;
  initialMediaUrl?: string;
  initialMediaType?: 'image' | 'video';
  onCreated?: () => void;
}

export function PostComposer({
  spaces = [],
  users: propUsers,
  defaultSpaceId = '',
  initialMediaUrl = '',
  initialMediaType = 'image',
  onCreated,
}: PostComposerProps) {
  const { profile, privateInfo, getUserBadges } = useAuth();
  const [directoryUsers, setDirectoryUsers] = useState<UserProfile[]>(propUsers || []);
  const [text, setText] = useState('');
  const [mediaUrls, setMediaUrls] = useState<string[]>(initialMediaUrl ? [initialMediaUrl] : []);
  const [mediaTypes, setMediaTypes] = useState<string[]>(initialMediaUrl ? [initialMediaType] : []);
  const [showPoll, setShowPoll] = useState(false);
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [location, setLocation] = useState('');
  const [showLocation, setShowLocation] = useState(false);
  const [audience, setAudience] = useState<AudienceType>(defaultSpaceId ? 'space' : 'public');
  const [selectedSpaceId, setSelectedSpaceId] = useState(defaultSpaceId);
  const [taggedUsers, setTaggedUsers] = useState<UserProfile[]>([]);
  const [collaboratorUsers, setCollaboratorUsers] = useState<UserProfile[]>([]);
  const [pickerMode, setPickerMode] = useState<'none' | 'tag' | 'collab'>('none');
  const [pickerSearch, setPickerSearch] = useState('');
  const [remoteCandidates, setRemoteCandidates] = useState<UserProfile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const photoRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (propUsers) {
      setDirectoryUsers(propUsers);
      return;
    }
    return subscribeDirectoryUsers(setDirectoryUsers);
  }, [propUsers]);

  useEffect(() => {
    const clean = pickerSearch.trim();
    if (pickerMode === 'none' || clean.length < 2) {
      setRemoteCandidates([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const found = await searchDirectoryUsers(clean, 10).catch(() => []);
      if (!cancelled) setRemoteCandidates(found);
    }, 240);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [pickerSearch, pickerMode]);

  useEffect(() => {
    if (initialMediaUrl) {
      setMediaUrls((prev) => (prev.includes(initialMediaUrl) ? prev : [initialMediaUrl, ...prev].slice(0, 4)));
      setMediaTypes((prev) =>
        prev.length === 0 ? [initialMediaType] : [initialMediaType, ...prev].slice(0, 4)
      );
    }
  }, [initialMediaUrl, initialMediaType]);

  const blockedSet = useMemo(
    () => new Set(privateInfo?.blockedUserIds || []),
    [privateInfo?.blockedUserIds]
  );

  const filteredCandidates = useMemo(() => {
    if (!profile) return [];
    const term = pickerSearch.trim().toLowerCase();
    const mergedMap = new Map<string, UserProfile>();
    directoryUsers.forEach((u) => mergedMap.set(u.uid, u));
    remoteCandidates.forEach((u) => {
      if (!mergedMap.has(u.uid)) mergedMap.set(u.uid, u);
    });
    return Array.from(mergedMap.values())
      .filter((u) => u.uid !== profile.uid && !u.suspended && !blockedSet.has(u.uid))
      .filter((u) => {
        if (!term) return true;
        return (
          u.displayName.toLowerCase().includes(term) ||
          u.username.toLowerCase().includes(term)
        );
      })
      .slice(0, 12);
  }, [directoryUsers, remoteCandidates, profile, blockedSet, pickerSearch]);

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
      setError(
        extractReadableErrorMessage(err, "We couldn't upload your file. Please try again.", {
          feature: 'post:upload',
        })
      );
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const removeMediaAt = (idx: number) => {
    setMediaUrls((prev) => prev.filter((_, i) => i !== idx));
    setMediaTypes((prev) => prev.filter((_, i) => i !== idx));
  };

  const toggleTaggedUser = (candidate: UserProfile) => {
    setTaggedUsers((prev) => {
      if (prev.some((u) => u.uid === candidate.uid)) {
        return prev.filter((u) => u.uid !== candidate.uid);
      }
      if (prev.length >= BLUEPRINT_LIMITS.MAX_TAGGED_USERS) {
        setError(`You can tag up to ${BLUEPRINT_LIMITS.MAX_TAGGED_USERS} people per post.`);
        return prev;
      }
      return [...prev, candidate];
    });
  };

  const toggleCollaboratorUser = (candidate: UserProfile) => {
    setCollaboratorUsers((prev) => {
      if (prev.some((u) => u.uid === candidate.uid)) {
        return prev.filter((u) => u.uid !== candidate.uid);
      }
      if (prev.length >= BLUEPRINT_LIMITS.MAX_COLLABORATORS) {
        setError(`You can invite up to ${BLUEPRINT_LIMITS.MAX_COLLABORATORS} collaborators per post.`);
        return prev;
      }
      return [...prev, candidate];
    });
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

    const effectiveSpaceId = defaultSpaceId || '';
    const targetSpace = spaces.find((s) => s.id === effectiveSpaceId);

    setSubmitting(true);
    try {
      await createPost({
        author: profile,
        type,
        text,
        mediaUrls,
        mediaTypes,
        location,
        audience: effectiveSpaceId ? 'space' : audience === 'followers' ? 'followers' : 'public',
        spaceId: effectiveSpaceId,
        spaceName: targetSpace?.name || '',
        pollOptions: validPollOptions,
        taggedUsers,
        collaboratorUsers,
        blockedUserIds: privateInfo?.blockedUserIds,
      });
      setText('');
      setMediaUrls([]);
      setMediaTypes([]);
      setShowPoll(false);
      setPollOptions(['', '']);
      setLocation('');
      setShowLocation(false);
      setTaggedUsers([]);
      setCollaboratorUsers([]);
      setPickerMode('none');
      setPickerSearch('');
      onCreated?.();
    } catch (err) {
      setError(
        extractReadableErrorMessage(err, 'Could not publish your post. Please try again.', {
          feature: 'post:publish',
        })
      );
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
          {defaultSpaceId && (
            <p className="text-[11px] text-[#C084FC]/90 font-medium">
              Community post — published only inside{' '}
              {spaces.find((s) => s.id === defaultSpaceId)?.name || 'this Space'}, never on your personal profile or Home feed.
            </p>
          )}
          <textarea
            rows={3}
            maxLength={2000}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              defaultSpaceId
                ? 'Share an update with this Space community...'
                : "What's on your mind?"
            }
            className="w-full bg-transparent text-sm text-white placeholder:text-[#7C6E9B] outline-none resize-none leading-relaxed"
          />

          {/* Selected Collaborators & Tagged People */}
          {(collaboratorUsers.length > 0 || taggedUsers.length > 0) && (
            <div className="flex flex-wrap gap-2">
              {collaboratorUsers.map((u) => (
                <span
                  key={`collab-${u.uid}`}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#7C3AED]/20 border border-[#8B5CF6]/40 text-[11px] text-[#E9D5FF]"
                >
                  <UserPlus size={11} className="text-[#C084FC]" />
                  <span>Collab: @{u.username}</span>
                  <button
                    type="button"
                    onClick={() => toggleCollaboratorUser(u)}
                    className="hover:text-white"
                    aria-label={`Remove collaborator ${u.username}`}
                  >
                    <X size={11} />
                  </button>
                </span>
              ))}
              {taggedUsers.map((u) => (
                <span
                  key={`tag-${u.uid}`}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sky-500/15 border border-sky-400/35 text-[11px] text-sky-200"
                >
                  <Tag size={11} className="text-sky-300" />
                  <span>Tagged: @{u.username}</span>
                  <button
                    type="button"
                    onClick={() => toggleTaggedUser(u)}
                    className="hover:text-white"
                    aria-label={`Remove tag ${u.username}`}
                  >
                    <X size={11} />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* People Tag / Collab Picker */}
          {pickerMode !== 'none' && (
            <div className="p-3.5 rounded-xl bg-[#08070F] border border-[#8B5CF6]/25 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <span className="text-xs font-semibold text-white">
                    {pickerMode === 'collab'
                      ? `Invite Co-Author Collaborators (${collaboratorUsers.length}/${BLUEPRINT_LIMITS.MAX_COLLABORATORS})`
                      : `Tag People in Post (${taggedUsers.length}/${BLUEPRINT_LIMITS.MAX_TAGGED_USERS})`}
                  </span>
                  <p className="text-[10px] text-[#94A3B8]">
                    {pickerMode === 'collab'
                      ? 'Collaborators receive an invite and appear as co-authors after accepting.'
                      : 'Tagged people are notified and see this post in their Profile Tagged tab.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPickerMode('none')}
                  className="text-xs text-[#94A3B8] hover:text-white"
                >
                  Done
                </button>
              </div>
              <input
                type="text"
                value={pickerSearch}
                onChange={(e) => setPickerSearch(e.target.value)}
                placeholder="Search Nexora members by name or @username..."
                className="w-full px-3 py-2 rounded-xl bg-[#0D0B16] border border-[#8B5CF6]/20 text-xs text-white outline-none focus:border-[#8B5CF6]"
              />
              <div className="max-h-40 overflow-y-auto space-y-1">
                {filteredCandidates.length === 0 ? (
                  <p className="text-[11px] text-[#64748B] py-2">No matching members found.</p>
                ) : (
                  filteredCandidates.map((cand) => {
                    const active =
                      pickerMode === 'collab'
                        ? collaboratorUsers.some((u) => u.uid === cand.uid)
                        : taggedUsers.some((u) => u.uid === cand.uid);
                    return (
                      <button
                        key={cand.uid}
                        type="button"
                        onClick={() =>
                          pickerMode === 'collab'
                            ? toggleCollaboratorUser(cand)
                            : toggleTaggedUser(cand)
                        }
                        className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-left transition-colors ${
                          active
                            ? 'bg-[#7C3AED]/20 border border-[#8B5CF6]/45'
                            : 'hover:bg-white/[0.04] border border-transparent'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <ResilientImage
                            src={cand.avatarUrl}
                            alt={cand.displayName}
                            className="w-7 h-7 rounded-full object-cover shrink-0"
                          />
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-white truncate flex items-center gap-1">
                              <span>{cand.displayName}</span>
                              <BadgeStrip
                                badges={getUserBadges(cand.uid, cand.verified)}
                                size={12}
                                max={2}
                                interactive={false}
                              />
                            </p>
                            <p className="text-[10px] text-[#94A3B8] truncate">@{cand.username}</p>
                          </div>
                        </div>
                        <span className="text-[11px] font-semibold text-[#C084FC] shrink-0">
                          {active ? 'Selected' : pickerMode === 'collab' ? 'Invite' : 'Tag'}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}

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
            onClick={() => setPickerMode((m) => (m === 'tag' ? 'none' : 'tag'))}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs transition-colors ${
              pickerMode === 'tag' || taggedUsers.length > 0
                ? 'bg-sky-500/15 text-sky-300'
                : 'hover:bg-[#7C3AED]/10 text-[#CBD5E1]'
            }`}
          >
            <Tag size={14} className="text-sky-400" /> Tag
          </button>
          <button
            type="button"
            onClick={() => setPickerMode((m) => (m === 'collab' ? 'none' : 'collab'))}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs transition-colors ${
              pickerMode === 'collab' || collaboratorUsers.length > 0
                ? 'bg-[#7C3AED]/20 text-[#C084FC]'
                : 'hover:bg-[#7C3AED]/10 text-[#CBD5E1]'
            }`}
          >
            <UserPlus size={14} className="text-[#A855F7]" /> Collab
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
                value={audience === 'followers' ? 'followers' : 'public'}
                onChange={(e) => {
                  setSelectedSpaceId('');
                  setAudience(e.target.value === 'followers' ? 'followers' : 'public');
                }}
                className="bg-transparent text-xs text-[#E2E8F0] outline-none"
              >
                <option value="public" className="bg-[#0D0B16]">
                  Public Profile &amp; Feed
                </option>
                <option value="followers" className="bg-[#0D0B16]">
                  Followers Only
                </option>
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
