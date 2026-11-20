import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  BarChart3,
  Bookmark,
  Camera,
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  Flag,
  Heart,
  MessageCircle,
  Mic,
  MoreHorizontal,
  Music,
  Plus,
  Repeat2,
  Share2,
  Sliders,
  Upload,
  User,
  UserPlus,
  X,
} from 'lucide-react';
import { NexoraLogo } from '../../components/branding/NexoraLogo';
import { ResilientImage } from '../../components/common/ResilientImage';
import { BadgeStrip } from '../../components/common/VerifiedBadge';
import { useAuth } from '../../hooks/useAuth';
import {
  createVibe,
  addVibeComment,
  incrementVibeView,
  repostVibe,
  submitModerationReport,
  subscribeIsFollowing,
  subscribeVibeComments,
  toggleFollowUser,
  toggleSaveVibe,
  toggleVibeLike,
} from '../../services/firebase/socialService';
import { extractReadableErrorMessage } from '../../services/firebase/errorHandler';
import { uploadBlobAsset, uploadMediaAsset } from '../../services/storage/mediaUploadService';
import { PostComment, UserProfile, Vibe } from '../../types/nexora';
import { formatCompactCount, formatRelativeTime } from '../../utils/validation';

const FILTER_CSS: Record<string, string> = {
  none: 'none',
  noir: 'grayscale(0.95) contrast(1.18)',
  violet: 'hue-rotate(-14deg) saturate(1.25) contrast(1.06)',
  cinema: 'contrast(1.15) brightness(0.94) saturate(1.1)',
};

const AUDIO_TRACKS = [
  'Original Audio',
  'Midnight Pulse — Synth Bed',
  'Obsidian Drift — Ambient',
  'Electric Horizon — Percussive',
];

interface VibesPageProps {
  vibes: Vibe[];
  users: UserProfile[];
  savedIds: string[];
  onOpenProfile: (uid: string) => void;
}

export function VibesPage({ vibes, users, savedIds, onOpenProfile }: VibesPageProps) {
  const { profile, getUserBadges } = useAuth();
  const [activeIndex, setActiveIndex] = useState(0);
  const [likedIds, setLikedIds] = useState<string[]>([]);
  const [followingAuthor, setFollowingAuthor] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [isPausedVisual, setIsPausedVisual] = useState(false);

  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<PostComment[]>([]);
  const [commentText, setCommentText] = useState('');

  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [showBottomMenu, setShowBottomMenu] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('');

  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showStudio, setShowStudio] = useState(false);

  // Vibe creation studio state
  const [videoUrl, setVideoUrl] = useState('');
  const [caption, setCaption] = useState('');
  const [audioTrack, setAudioTrack] = useState(AUDIO_TRACKS[0]);
  const [filterPreset, setFilterPreset] = useState('none');
  const [textOverlay, setTextOverlay] = useState('');
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(30);
  const [recordingVideo, setRecordingVideo] = useState(false);
  const [recordingVoiceover, setRecordingVoiceover] = useState(false);
  const [voiceoverNote, setVoiceoverNote] = useState('');
  const [uploading, setUploading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [studioError, setStudioError] = useState('');
  const [toast, setToast] = useState('');

  const videoPlayerRef = useRef<HTMLVideoElement>(null);
  const previewCamRef = useRef<HTMLVideoElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isDemoMode = vibes.length === 0;
  const currentVibe: Vibe | null = vibes[activeIndex] || null;

  useEffect(() => {
    if (activeIndex >= vibes.length && vibes.length > 0) {
      setActiveIndex(0);
    }
  }, [vibes.length, activeIndex]);

  useEffect(() => {
    if (!currentVibe || !profile) return;
    setIsPausedVisual(false);
    setShowHeaderMenu(false);
    setShowBottomMenu(false);
    void incrementVibeView(currentVibe.id);
    let unsubFollow: (() => void) | undefined;
    if (currentVibe.authorId !== profile.uid) {
      unsubFollow = subscribeIsFollowing(profile.uid, currentVibe.authorId, setFollowingAuthor);
    } else {
      setFollowingAuthor(false);
    }
    let unsubComments: (() => void) | undefined;
    if (showComments) {
      unsubComments = subscribeVibeComments(currentVibe.id, setComments);
    }
    return () => {
      unsubFollow?.();
      unsubComments?.();
    };
  }, [currentVibe?.id, showComments, profile?.uid]);

  // Enforce trim boundaries silently on playback
  useEffect(() => {
    const vid = videoPlayerRef.current;
    if (!vid || !currentVibe) return;
    const onTimeUpdate = () => {
      if (currentVibe.trimEnd > 0 && vid.currentTime >= currentVibe.trimEnd) {
        vid.currentTime = currentVibe.trimStart || 0;
      }
    };
    vid.addEventListener('timeupdate', onTimeUpdate);
    return () => vid.removeEventListener('timeupdate', onTimeUpdate);
  }, [currentVibe]);

  // Keyboard navigation between Vibes
  useEffect(() => {
    if (showStudio || showComments || showReportModal) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' && activeIndex < vibes.length - 1) {
        setActiveIndex((i) => i + 1);
      } else if (e.key === 'ArrowUp' && activeIndex > 0) {
        setActiveIndex((i) => i - 1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeIndex, vibes.length, showStudio, showComments, showReportModal]);

  const myVibes = useMemo(
    () => (profile ? vibes.filter((v) => v.authorId === profile.uid) : []),
    [vibes, profile]
  );
  const totalViews = myVibes.reduce((acc, v) => acc + v.viewsCount, 0);
  const totalLikes = myVibes.reduce((acc, v) => acc + v.likesCount, 0);

  if (!profile) return null;

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2000);
  };

  const toggleVideoPlay = () => {
    const vid = videoPlayerRef.current;
    if (!vid) return;
    if (vid.paused) {
      void vid.play();
      setIsPausedVisual(false);
    } else {
      vid.pause();
      setIsPausedVisual(true);
    }
  };

  const handleVideoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setStudioError('');
    setUploading(true);
    try {
      const res = await uploadMediaAsset(file, `vibes/${profile.uid}`, ['video']);
      setVideoUrl(res.url);
    } catch (err) {
      setStudioError(err instanceof Error ? err.message : 'Unable to upload video.');
    } finally {
      setUploading(false);
    }
  };

  const startCameraRecording = async () => {
    setStudioError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      if (previewCamRef.current) {
        previewCamRef.current.srcObject = stream;
        void previewCamRef.current.play();
      }
      const chunks: BlobPart[] = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunks.push(ev.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: 'video/webm' });
        setUploading(true);
        try {
          const res = await uploadBlobAsset(blob, 'recorded_vibe.webm', `vibes/${profile.uid}`, 'video');
          setVideoUrl(res.url);
        } catch (err) {
          setStudioError(err instanceof Error ? err.message : 'Failed saving recording.');
        } finally {
          setUploading(false);
        }
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecordingVideo(true);
    } catch {
      setStudioError('Camera/microphone access was denied or unavailable.');
    }
  };

  const stopCameraRecording = () => {
    recorderRef.current?.stop();
    setRecordingVideo(false);
  };

  const handleVoiceoverToggle = async () => {
    if (recordingVoiceover) {
      recorderRef.current?.stop();
      setRecordingVoiceover(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: BlobPart[] = [];
      const rec = new MediaRecorder(stream);
      rec.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunks.push(ev.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setVoiceoverNote(`Voiceover track attached (${Math.max(1, Math.round(chunks.length * 0.5))}s)`);
      };
      recorderRef.current = rec;
      rec.start();
      setRecordingVoiceover(true);
    } catch {
      setStudioError('Microphone access is required for voiceovers.');
    }
  };

  const handlePublishVibe = async (e: React.FormEvent) => {
    e.preventDefault();
    setStudioError('');
    if (!videoUrl) {
      setStudioError('Upload or record a vertical video first.');
      return;
    }
    setPublishing(true);
    try {
      await createVibe({
        author: profile,
        videoUrl,
        caption: caption || 'New Nexora Vibe',
        audioTrack: voiceoverNote ? `${audioTrack} + Voiceover` : audioTrack,
        filterPreset,
        textOverlay,
        trimStart,
        trimEnd,
        duration: Math.max(1, trimEnd - trimStart),
      });
      setShowStudio(false);
      setVideoUrl('');
      setCaption('');
      setTextOverlay('');
      setVoiceoverNote('');
      setActiveIndex(0);
      showToast('Vibe published');
    } catch (err) {
      setStudioError(err instanceof Error ? err.message : 'Could not publish Vibe.');
    } finally {
      setPublishing(false);
    }
  };

  const handleLike = async (vibe: Vibe) => {
    const liked = await toggleVibeLike(vibe, profile);
    setLikedIds((prev) =>
      liked ? Array.from(new Set([...prev, vibe.id])) : prev.filter((id) => id !== vibe.id)
    );
  };

  const handleRepost = async (vibe: Vibe) => {
    await repostVibe(vibe, profile);
    showToast('Reposted to your followers');
  };

  const handleSave = async (vibe: Vibe) => {
    const nowSaved = await toggleSaveVibe(vibe, profile.uid);
    showToast(nowSaved ? 'Saved to your Profile' : 'Removed from Saved');
  };

  const handleShare = async (vibe: Vibe) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/?vibe=${vibe.id}`);
      showToast('Vibe link copied');
    } catch {
      showToast('Ready to share');
    }
  };

  const handleFollowCreator = async (authorId: string) => {
    if (followBusy) return;
    const target = users.find((u) => u.uid === authorId);
    if (!target) return;
    setFollowBusy(true);
    try {
      const next = await toggleFollowUser(profile, target, followingAuthor);
      setFollowingAuthor(next);
      showToast(next ? `Following ${target.displayName}` : `Unfollowed ${target.displayName}`);
    } catch (err) {
      showToast(extractReadableErrorMessage(err, 'Unable to update follow status.'));
    } finally {
      setFollowBusy(false);
    }
  };

  return (
    <div className="relative flex-1 bg-[#06060A] flex flex-col items-center justify-between px-6 py-4 overflow-hidden">
      {/* Ambient Radial Theater Illumination */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_55%_65%_at_50%_50%,rgba(109,40,217,0.22),transparent_72%)]"
      />

      {/* Top Desktop Studio Bar (No Back Arrow) */}
      <div className="relative z-20 w-full max-w-[1440px] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <NexoraLogo variant="icon" size="xs" />
          <span className="font-display text-lg font-bold tracking-tight text-white">Vibes</span>
          {isDemoMode && (
            <span className="text-xs font-medium text-[#C084FC]">· Demo Showcase</span>
          )}
          {toast && (
            <span className="text-xs font-medium text-[#C084FC] bg-[#7C3AED]/15 border border-[#8B5CF6]/30 px-3 py-1 rounded-lg">
              {toast}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setShowAnalytics((v) => !v)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#0E0C18] border border-[#8B5CF6]/20 hover:border-[#8B5CF6]/50 text-xs font-medium text-[#E2E8F0] transition-colors whitespace-nowrap"
          >
            <BarChart3 size={14} className="text-[#A855F7]" /> Creator Analytics
          </button>
          <button
            type="button"
            onClick={() => setShowStudio(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-[#6D28D9] via-[#7C3AED] to-[#9333EA] hover:brightness-110 text-xs font-semibold text-white shadow-[0_4px_20px_rgba(124,58,237,0.4)] transition-all whitespace-nowrap"
          >
            <Plus size={14} /> Create Vibe
          </button>
        </div>
      </div>

      {/* Main Cinematic Viewing Stage */}
      <div className="relative z-10 w-full max-w-[1440px] flex-1 flex items-center justify-center gap-8 py-3">
        {isDemoMode ? (
          /* Clearly Distinguished Demonstration Stage when 0 real Vibes exist yet */
          <div className="relative w-full max-w-[1100px] h-[78vh] max-h-[820px] rounded-3xl border border-[#8B5CF6]/25 bg-[#0B0914] overflow-hidden shadow-[0_24px_80px_rgba(0,0,0,0.85)] grid grid-cols-1 lg:grid-cols-12">
            {/* Cinematic Vertical Video Canvas */}
            <div className="lg:col-span-7 relative bg-black flex items-center justify-center overflow-hidden">
              <ResilientImage
                src="/src/assets/images/space_cover_sound_1795066815582.jpg"
                alt="Demo Showcase Vibe Stage"
                className="w-full h-full object-cover opacity-85 scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-b from-black/75 via-transparent to-black/90" />

              {/* TOP Header Inside Viewing Area (NO back arrow, NO permanent play button) */}
              <div className="absolute inset-x-0 top-0 p-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <NexoraLogo variant="icon" size="xs" />
                  <span className="text-xs font-semibold text-white/90">Vibes</span>
                  <span aria-hidden="true" className="text-white/30">·</span>
                  <ResilientImage
                    src={profile.avatarUrl}
                    alt={profile.displayName}
                    className="w-9 h-9 rounded-full object-cover border border-[#8B5CF6]/60"
                  />
                  <div>
                    <p className="text-sm font-semibold text-white inline-flex items-center gap-1">
                      {profile.displayName}
                      <BadgeStrip
                        badges={getUserBadges(profile.uid, profile.verified)}
                        size={14}
                        max={3}
                      />
                    </p>
                    <p className="text-[11px] text-white/70">@{profile.username} · Demo Showcase</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowStudio(true)}
                  className="p-2 rounded-xl bg-black/50 border border-white/15 text-white hover:bg-black/75"
                  aria-label="More options"
                >
                  <MoreHorizontal size={16} />
                </button>
              </div>

              {/* Center Interactive Callout */}
              <div className="relative z-10 text-center max-w-sm px-6 space-y-4">
                <p className="text-xs font-medium text-[#C084FC]">
                  Demo Showcase Preview · Ready for Real Video
                </p>
                <h2 className="font-display text-2xl font-bold text-white leading-tight">
                  Share your first vertical Vibe
                </h2>
                <p className="text-xs text-[#CBD5E1] leading-relaxed">
                  Upload portrait MP4/WebM video or record directly from your camera with filters,
                  audio tracks, voiceovers, and trim controls.
                </p>
                <button
                  type="button"
                  onClick={() => setShowStudio(true)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#6D28D9] via-[#7C3AED] to-[#9333EA] text-xs font-semibold text-white shadow-[0_6px_24px_rgba(124,58,237,0.45)]"
                >
                  <Upload size={14} /> Upload or Record Vibe
                </button>
              </div>

              {/* BOTTOM Horizontal Engagement Bar (Demo Preview) */}
              <div className="absolute inset-x-0 bottom-0 p-4 border-t border-white/10 bg-black/70 backdrop-blur-md flex items-center justify-around">
                <button
                  type="button"
                  onClick={() => setShowStudio(true)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-white/80 hover:text-white"
                >
                  <Heart size={17} /> <span className="font-mono-tabular">0</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowStudio(true)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-white/80 hover:text-white"
                >
                  <MessageCircle size={17} /> <span className="font-mono-tabular">0</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowStudio(true)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-white/80 hover:text-white"
                >
                  <Repeat2 size={17} /> <span className="font-mono-tabular">0</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowStudio(true)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-white/80 hover:text-white"
                >
                  <Bookmark size={17} /> <span>Save</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowStudio(true)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-white/80 hover:text-white"
                  aria-label="More options"
                >
                  <MoreHorizontal size={17} />
                </button>
              </div>
            </div>

            {/* RIGHT-HAND SIDE: Small Readable Description & Hashtags */}
            <aside className="lg:col-span-5 p-6 lg:p-8 flex flex-col justify-between bg-[#0E0C18] border-l border-[#8B5CF6]/15">
              <div className="space-y-4">
                <p className="text-xs font-medium text-[#C084FC]">Demo Showcase · Description</p>
                <p className="text-sm text-[#E2E8F0] leading-relaxed">
                  Late-night analog modular session inside the Nexora studio. Portrait framing,
                  live spatial audio, and subtle violet grade.
                </p>
                <p className="text-xs text-[#A855F7] font-medium">
                  #nexora #vibes #sounddesign #studiocraft
                </p>
                <div className="pt-2 flex items-center gap-3 text-xs text-[#94A3B8]">
                  <span className="inline-flex items-center gap-1.5">
                    <Music size={13} className="text-[#A855F7]" /> Midnight Pulse — Synth Bed
                  </span>
                </div>
              </div>
              <div className="pt-6 border-t border-white/10 space-y-3">
                <p className="text-xs text-[#94A3B8]">
                  This is a demonstration preview until real Vibes are published to Firestore.
                </p>
                <button
                  type="button"
                  onClick={() => setShowStudio(true)}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#6D28D9] to-[#7C3AED] text-xs font-semibold text-white"
                >
                  Create Real Vibe
                </button>
              </div>
            </aside>
          </div>
        ) : (
          currentVibe && (
            <div className="w-full max-w-[1160px] flex items-center justify-center gap-6">
              {/* Primary Cinematic Theater Frame */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentVibe.id}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -14 }}
                  transition={{ duration: 0.22 }}
                  className="relative w-full max-w-[980px] h-[78vh] max-h-[820px] rounded-3xl overflow-hidden border border-[#8B5CF6]/25 bg-[#0B0914] shadow-[0_24px_80px_rgba(0,0,0,0.85)] grid grid-cols-1 lg:grid-cols-12"
                >
                  {/* LEFT / MAIN: Large Vertical Video Viewing Area */}
                  <div className="lg:col-span-8 relative bg-black flex items-center justify-center overflow-hidden">
                    <video
                      ref={videoPlayerRef}
                      key={currentVibe.id}
                      src={currentVibe.videoUrl}
                      poster={currentVibe.thumbnailUrl || undefined}
                      autoPlay
                      loop
                      playsInline
                      onClick={toggleVideoPlay}
                      style={{ filter: FILTER_CSS[currentVibe.filterPreset || 'none'] || 'none' }}
                      className="w-full h-full object-cover cursor-pointer"
                    />

                    {/* Subtle pause feedback only briefly when paused (NO permanent play/pause button!) */}
                    {isPausedVisual && (
                      <div className="pointer-events-none absolute inset-0 bg-black/25 flex items-center justify-center">
                        <span className="px-3.5 py-1.5 rounded-xl bg-black/70 border border-white/15 text-xs font-medium text-white">
                          Paused · Click video to resume
                        </span>
                      </div>
                    )}

                    {/* Optional Text Overlay */}
                    {currentVibe.textOverlay && (
                      <div className="pointer-events-none absolute inset-x-8 top-1/2 -translate-y-1/2 text-center">
                        <span className="inline-block px-4 py-2 rounded-xl bg-black/60 backdrop-blur-sm font-display text-xl font-bold text-white">
                          {currentVibe.textOverlay}
                        </span>
                      </div>
                    )}

                    {/* TOP HEADER: Nexora Logo + Vibes Label + Creator Avatar + Name + Badge + More Options (NO Back Arrow) */}
                    <div className="pointer-events-none absolute inset-x-0 top-0 p-4 lg:p-5 bg-gradient-to-b from-black/85 via-black/45 to-transparent flex items-center justify-between gap-4">
                      <div className="pointer-events-auto flex items-center gap-3 min-w-0">
                        <div className="hidden sm:flex items-center gap-2 shrink-0 pr-2 border-r border-white/15">
                          <NexoraLogo variant="icon" size="xs" />
                          <span className="text-xs font-semibold text-white">Vibes</span>
                        </div>

                        <button
                          type="button"
                          onClick={() => onOpenProfile(currentVibe.authorId)}
                          className="flex items-center gap-2.5 text-left min-w-0"
                        >
                          <ResilientImage
                            src={currentVibe.authorAvatar}
                            alt={currentVibe.authorName}
                            className="w-9 h-9 rounded-full object-cover border border-[#8B5CF6]/60 shrink-0"
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-white inline-flex items-center gap-1 truncate">
                              {currentVibe.authorName}
                              <BadgeStrip
                                badges={getUserBadges(currentVibe.authorId, currentVibe.authorVerified)}
                                size={14}
                                max={3}
                                interactive={false}
                              />
                            </p>
                            <p className="text-[11px] text-white/75 truncate">
                              @{currentVibe.authorUsername}
                            </p>
                          </div>
                        </button>

                        {currentVibe.authorId !== profile.uid && (
                          <button
                            type="button"
                            onClick={() => void handleFollowCreator(currentVibe.authorId)}
                            className={`ml-1 inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                              followingAuthor
                                ? 'bg-white/15 text-white hover:bg-white/25'
                                : 'bg-gradient-to-r from-[#6D28D9] to-[#7C3AED] text-white'
                            }`}
                          >
                            <UserPlus size={12} />
                            {followingAuthor ? 'Following' : 'Follow'}
                          </button>
                        )}
                      </div>

                      <div className="pointer-events-auto relative shrink-0">
                        <button
                          type="button"
                          onClick={() => setShowHeaderMenu((v) => !v)}
                          aria-label="More options"
                          className="p-2 rounded-xl bg-black/55 hover:bg-black/80 border border-white/15 text-white transition-colors"
                        >
                          <MoreHorizontal size={16} />
                        </button>
                        {showHeaderMenu && (
                          <div className="absolute right-0 mt-1.5 w-48 bg-[#0E0C18] border border-[#8B5CF6]/25 rounded-2xl shadow-2xl p-1.5 z-30">
                            <button
                              type="button"
                              onClick={() => {
                                setShowHeaderMenu(false);
                                onOpenProfile(currentVibe.authorId);
                              }}
                              className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-white hover:bg-[#7C3AED]/15 text-left"
                            >
                              <User size={14} /> View Creator Profile
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setShowHeaderMenu(false);
                                void handleShare(currentVibe);
                              }}
                              className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-white hover:bg-[#7C3AED]/15 text-left"
                            >
                              <Copy size={14} /> Copy Vibe Link
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setShowHeaderMenu(false);
                                setShowReportModal(true);
                              }}
                              className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-rose-400 hover:bg-rose-500/10 text-left"
                            >
                              <Flag size={14} /> Report Vibe
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* BOTTOM HORIZONTAL ENGAGEMENT BAR: Like, Comment, Repost, Save, More options */}
                    <div className="absolute inset-x-0 bottom-0 px-4 py-3.5 bg-gradient-to-t from-black/95 via-black/75 to-transparent border-t border-white/[0.06]">
                      <div className="flex items-center justify-around gap-2">
                        <button
                          type="button"
                          onClick={() => void handleLike(currentVibe)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                            likedIds.includes(currentVibe.id)
                              ? 'text-[#C084FC] bg-[#7C3AED]/20'
                              : 'text-white hover:text-[#C084FC] hover:bg-white/5'
                          }`}
                        >
                          <Heart
                            size={17}
                            className={likedIds.includes(currentVibe.id) ? 'fill-[#C084FC]' : ''}
                          />
                          <span className="font-mono-tabular">
                            {formatCompactCount(currentVibe.likesCount)}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setShowComments((v) => !v)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-white hover:text-[#C084FC] hover:bg-white/5 transition-colors"
                        >
                          <MessageCircle size={17} />
                          <span className="font-mono-tabular">
                            {formatCompactCount(currentVibe.commentsCount)}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => void handleRepost(currentVibe)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-white hover:text-[#C084FC] hover:bg-white/5 transition-colors"
                        >
                          <Repeat2 size={17} />
                          <span className="font-mono-tabular">
                            {formatCompactCount(currentVibe.repostsCount)}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => void handleSave(currentVibe)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                            savedIds.includes(currentVibe.id)
                              ? 'text-[#C084FC] bg-[#7C3AED]/20'
                              : 'text-white hover:text-[#C084FC] hover:bg-white/5'
                          }`}
                          aria-label="Save Vibe"
                        >
                          <Bookmark
                            size={17}
                            className={savedIds.includes(currentVibe.id) ? 'fill-[#C084FC]' : ''}
                          />
                          <span className="font-mono-tabular">
                            {formatCompactCount(currentVibe.savesCount)}
                          </span>
                        </button>

                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => setShowBottomMenu((v) => !v)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium text-white hover:text-[#C084FC] hover:bg-white/5 transition-colors"
                            aria-label="More options"
                          >
                            <MoreHorizontal size={17} />
                          </button>
                          {showBottomMenu && (
                            <div className="absolute right-0 bottom-11 w-44 bg-[#0E0C18] border border-[#8B5CF6]/25 rounded-2xl shadow-2xl p-1.5 z-30">
                              <button
                                type="button"
                                onClick={() => {
                                  setShowBottomMenu(false);
                                  void handleShare(currentVibe);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-white hover:bg-[#7C3AED]/15 text-left"
                              >
                                <Share2 size={14} /> Share Link
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setShowBottomMenu(false);
                                  onOpenProfile(currentVibe.authorId);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-white hover:bg-[#7C3AED]/15 text-left"
                              >
                                <User size={14} /> Creator Profile
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setShowBottomMenu(false);
                                  setShowReportModal(true);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-rose-400 hover:bg-rose-500/10 text-left"
                              >
                                <Flag size={14} /> Report
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* RIGHT-HAND SIDE: Small Readable Description & Hashtags (Strictly NO vertical button stack on the right) */}
                  <aside className="lg:col-span-4 p-6 flex flex-col justify-between bg-[#0E0C18] border-t lg:border-t-0 lg:border-l border-[#8B5CF6]/15 overflow-y-auto">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between text-xs text-[#94A3B8]">
                        <span>Description</span>
                        <span className="inline-flex items-center gap-1 font-mono-tabular">
                          <Eye size={13} className="text-[#A855F7]" />
                          {formatCompactCount(currentVibe.viewsCount)} views
                        </span>
                      </div>

                      <p className="text-sm text-[#F1F5F9] leading-relaxed break-words">
                        {currentVibe.caption}
                      </p>

                      {currentVibe.hashtags && currentVibe.hashtags.length > 0 && (
                        <p className="text-xs text-[#C084FC] font-medium leading-relaxed">
                          {currentVibe.hashtags.map((h) => `#${h}`).join(' ')}
                        </p>
                      )}

                      {currentVibe.audioTrack && (
                        <div className="pt-2 flex items-center gap-2 text-xs text-[#94A3B8]">
                          <Music size={13} className="text-[#A855F7] shrink-0" />
                          <span className="truncate">{currentVibe.audioTrack}</span>
                        </div>
                      )}
                    </div>

                    {/* Subtle inline comments preview / CTA on desktop right panel */}
                    <div className="pt-4 border-t border-white/10 space-y-3">
                      <div className="flex items-center justify-between text-xs text-[#94A3B8]">
                        <span>{formatRelativeTime(currentVibe.createdAt)}</span>
                        <button
                          type="button"
                          onClick={() => setShowComments(true)}
                          className="text-[#C084FC] hover:underline font-medium"
                        >
                          Open comments ({currentVibe.commentsCount})
                        </button>
                      </div>
                    </div>
                  </aside>
                </motion.div>
              </AnimatePresence>

              {/* Desktop Up / Down Reel Navigation */}
              {vibes.length > 1 && (
                <div className="flex flex-col items-center gap-2.5 shrink-0">
                  <button
                    type="button"
                    disabled={activeIndex === 0}
                    onClick={() => setActiveIndex((i) => Math.max(0, i - 1))}
                    className="p-3 rounded-2xl bg-[#0E0C18] border border-[#8B5CF6]/20 text-white disabled:opacity-35 hover:border-[#8B5CF6] transition-colors"
                    aria-label="Previous Vibe"
                  >
                    <ChevronUp size={18} />
                  </button>
                  <span className="font-mono-tabular text-xs text-[#94A3B8]">
                    {activeIndex + 1}/{vibes.length}
                  </span>
                  <button
                    type="button"
                    disabled={activeIndex >= vibes.length - 1}
                    onClick={() => setActiveIndex((i) => Math.min(vibes.length - 1, i + 1))}
                    className="p-3 rounded-2xl bg-[#0E0C18] border border-[#8B5CF6]/20 text-white disabled:opacity-35 hover:border-[#8B5CF6] transition-colors"
                    aria-label="Next Vibe"
                  >
                    <ChevronDown size={18} />
                  </button>
                </div>
              )}
            </div>
          )
        )}
      </div>

      {/* Comments Drawer */}
      {showComments && currentVibe && (
        <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-[#0D0B16] border-l border-[#8B5CF6]/20 p-6 flex flex-col shadow-2xl">
          <div className="flex items-center justify-between pb-4 border-b border-white/10">
            <h2 className="font-display text-base font-semibold text-white">
              Vibe Comments ({currentVibe.commentsCount})
            </h2>
            <button
              type="button"
              onClick={() => setShowComments(false)}
              className="p-1.5 text-[#94A3B8] hover:text-white"
            >
              <X size={18} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto py-4 space-y-3">
            {comments.length === 0 ? (
              <p className="text-xs text-[#64748B]">Be the first to comment on this Vibe.</p>
            ) : (
              comments.map((c) => (
                <div key={c.id} className="p-3.5 rounded-xl bg-[#06060A] border border-white/[0.06]">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-semibold text-white">{c.authorName}</span>
                    <span className="text-[#64748B]">{formatRelativeTime(c.createdAt)}</span>
                  </div>
                  <p className="text-xs text-[#CBD5E1]">{c.text}</p>
                </div>
              ))
            )}
          </div>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!commentText.trim()) return;
              await addVibeComment(currentVibe, profile, commentText);
              setCommentText('');
            }}
            className="pt-3 border-t border-white/10 flex gap-2"
          >
            <input
              type="text"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Add a comment..."
              className="flex-1 px-3.5 py-2 rounded-xl bg-[#06060A] border border-[#8B5CF6]/20 text-xs text-white outline-none focus:border-[#8B5CF6]"
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#6D28D9] to-[#7C3AED] text-xs font-semibold text-white"
            >
              Post
            </button>
          </form>
        </div>
      )}

      {/* Report Vibe Modal */}
      {showReportModal && currentVibe && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!reportReason.trim()) return;
              await submitModerationReport({
                reporterId: profile.uid,
                targetType: 'vibe',
                targetId: currentVibe.id,
                reason: reportReason,
              });
              setReportReason('');
              setShowReportModal(false);
              showToast('Report submitted');
            }}
            className="w-full max-w-md bg-[#0E0C18] border border-[#8B5CF6]/25 rounded-2xl p-6 space-y-4"
          >
            <h3 className="font-display text-base font-semibold text-white">Report Vibe</h3>
            <textarea
              rows={3}
              required
              maxLength={300}
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              placeholder="Describe the issue..."
              className="w-full p-3 rounded-xl bg-[#06060A] border border-white/10 text-xs text-white outline-none resize-none"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowReportModal(false)}
                className="px-4 py-2 text-xs text-[#94A3B8]"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-rose-600 text-xs font-semibold text-white"
              >
                Submit Report
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Creator Analytics Modal */}
      {showAnalytics && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-[#0E0C18] border border-[#8B5CF6]/25 rounded-2xl p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-white">
                Creator Vibe Analytics
              </h2>
              <button
                type="button"
                onClick={() => setShowAnalytics(false)}
                className="text-[#94A3B8] hover:text-white"
              >
                <X size={18} />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="p-4 rounded-xl bg-[#06060A] border border-white/10">
                <p className="font-mono-tabular text-2xl font-bold text-white">{myVibes.length}</p>
                <p className="text-xs text-[#94A3B8]">Published Vibes</p>
              </div>
              <div className="p-4 rounded-xl bg-[#06060A] border border-white/10">
                <p className="font-mono-tabular text-2xl font-bold text-white">{totalViews}</p>
                <p className="text-xs text-[#94A3B8]">Total Views</p>
              </div>
              <div className="p-4 rounded-xl bg-[#06060A] border border-white/10">
                <p className="font-mono-tabular text-2xl font-bold text-white">{totalLikes}</p>
                <p className="text-xs text-[#94A3B8]">Total Likes</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Vibe Studio Modal */}
      {showStudio && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <form
            onSubmit={handlePublishVibe}
            className="w-full max-w-3xl bg-[#0E0C18] border border-[#8B5CF6]/25 rounded-2xl p-6 space-y-5 my-8"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h2 className="font-display text-lg font-semibold text-white">Vibes Studio</h2>
              <button
                type="button"
                onClick={() => setShowStudio(false)}
                className="text-[#94A3B8] hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Video Capture / Preview */}
              <div className="space-y-3">
                <div className="relative aspect-[9/14] rounded-xl overflow-hidden bg-black border border-white/10 flex items-center justify-center">
                  {recordingVideo ? (
                    <video ref={previewCamRef} muted className="w-full h-full object-cover" />
                  ) : videoUrl ? (
                    <video
                      src={videoUrl}
                      controls
                      style={{ filter: FILTER_CSS[filterPreset] }}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <p className="text-xs text-[#64748B] px-6 text-center">
                      Upload a portrait MP4/WebM clip or record directly from your camera.
                    </p>
                  )}
                  {textOverlay && (
                    <div className="pointer-events-none absolute inset-x-4 top-1/2 -translate-y-1/2 text-center">
                      <span className="px-3 py-1 rounded-lg bg-black/60 text-white text-sm font-semibold">
                        {textOverlay}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/mp4,video/webm,video/quicktime"
                    onChange={handleVideoFile}
                    className="hidden"
                  />
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-white"
                  >
                    <Upload size={14} /> {uploading ? 'Uploading...' : 'Upload Video'}
                  </button>
                  <button
                    type="button"
                    onClick={recordingVideo ? stopCameraRecording : startCameraRecording}
                    className={`flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-medium ${
                      recordingVideo
                        ? 'bg-rose-600 text-white'
                        : 'bg-white/5 hover:bg-white/10 border border-white/10 text-white'
                    }`}
                  >
                    <Camera size={14} /> {recordingVideo ? 'Stop Recording' : 'Record Cam'}
                  </button>
                </div>
              </div>

              {/* Studio Controls */}
              <div className="space-y-4">
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-[#CBD5E1]">Caption & Hashtags</span>
                  <textarea
                    rows={3}
                    maxLength={400}
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    placeholder="Describe your Vibe with #hashtags..."
                    className="w-full p-3 rounded-xl bg-[#06060A] border border-white/10 text-xs text-white outline-none resize-none"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-xs font-medium text-[#CBD5E1]">Text Overlay</span>
                  <input
                    type="text"
                    maxLength={120}
                    value={textOverlay}
                    onChange={(e) => setTextOverlay(e.target.value)}
                    placeholder="On-screen title overlay"
                    className="w-full px-3 py-2 rounded-xl bg-[#06060A] border border-white/10 text-xs text-white outline-none"
                  />
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block space-y-1">
                    <span className="text-xs font-medium text-[#CBD5E1] inline-flex items-center gap-1">
                      <Sliders size={12} /> Filter
                    </span>
                    <select
                      value={filterPreset}
                      onChange={(e) => setFilterPreset(e.target.value)}
                      className="w-full px-2.5 py-2 rounded-xl bg-[#06060A] border border-white/10 text-xs text-white outline-none"
                    >
                      <option value="none">Natural</option>
                      <option value="violet">Electric Violet</option>
                      <option value="noir">Obsidian Noir</option>
                      <option value="cinema">Cinema Contrast</option>
                    </select>
                  </label>

                  <label className="block space-y-1">
                    <span className="text-xs font-medium text-[#CBD5E1] inline-flex items-center gap-1">
                      <Music size={12} /> Audio Track
                    </span>
                    <select
                      value={audioTrack}
                      onChange={(e) => setAudioTrack(e.target.value)}
                      className="w-full px-2.5 py-2 rounded-xl bg-[#06060A] border border-white/10 text-xs text-white outline-none"
                    >
                      {AUDIO_TRACKS.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {/* Video Trimming */}
                <div className="p-3 rounded-xl bg-[#06060A] border border-white/10 space-y-2">
                  <div className="flex justify-between text-[11px] text-[#94A3B8]">
                    <span>Trim Window</span>
                    <span className="font-mono-tabular">
                      {trimStart}s – {trimEnd}s
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="range"
                      min={0}
                      max={25}
                      value={trimStart}
                      onChange={(e) => setTrimStart(Math.min(Number(e.target.value), trimEnd - 1))}
                      className="accent-[#7C3AED]"
                    />
                    <input
                      type="range"
                      min={5}
                      max={60}
                      value={trimEnd}
                      onChange={(e) => setTrimEnd(Math.max(Number(e.target.value), trimStart + 1))}
                      className="accent-[#7C3AED]"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={handleVoiceoverToggle}
                    className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs border ${
                      recordingVoiceover
                        ? 'bg-rose-600 border-rose-500 text-white'
                        : 'bg-[#06060A] border-white/10 text-[#CBD5E1]'
                    }`}
                  >
                    <Mic size={13} />
                    {recordingVoiceover ? 'Stop Voiceover' : 'Record Voiceover'}
                  </button>
                  {voiceoverNote && <span className="text-[11px] text-[#C084FC]">{voiceoverNote}</span>}
                </div>
              </div>
            </div>

            {studioError && <p className="text-xs text-rose-400">{studioError}</p>}

            <div className="flex justify-end gap-3 pt-3 border-t border-white/10">
              <button
                type="button"
                onClick={() => setShowStudio(false)}
                className="px-4 py-2 text-xs text-[#94A3B8] hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={publishing || uploading}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#6D28D9] to-[#7C3AED] text-xs font-semibold text-white"
              >
                {publishing ? 'Publishing...' : 'Publish Vibe'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
