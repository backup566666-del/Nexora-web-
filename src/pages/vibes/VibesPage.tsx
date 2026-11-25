import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  Bookmark,
  Camera,
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  Film,
  Flag,
  FolderKanban,
  Heart,
  MessageCircle,
  Mic,
  MoreHorizontal,
  Music,
  Pause,
  Play,
  Plus,
  Repeat2,
  Share2,
  Sliders,
  Trash2,
  Upload,
  User,
  UserPlus,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { NexoraLogo } from '../../components/branding/NexoraLogo';
import { ResilientImage } from '../../components/common/ResilientImage';
import { TierBadge } from '../../components/common/TierBadge';
import { BadgeStrip } from '../../components/common/VerifiedBadge';
import { useAuth } from '../../hooks/useAuth';
import { recordVibeAnalyticsView } from '../../services/firebase/analyticsService';
import {
  addVibeComment,
  createVibe,
  deleteVibe,
  incrementVibeView,
  repostVibe,
  submitModerationReport,
  subscribeFollowingIds,
  subscribeVibeComments,
  toggleFollowUser,
  toggleSaveVibe,
  toggleVibeLike,
} from '../../services/firebase/socialService';
import { extractReadableErrorMessage } from '../../services/firebase/errorHandler';
import { uploadBlobAsset, uploadMediaAsset } from '../../services/storage/mediaUploadService';
import { NavSection, PostComment, UserProfile, Vibe } from '../../types/nexora';
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

function formatVideoClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

interface VibesPageProps {
  vibes: Vibe[];
  users: UserProfile[];
  savedIds: string[];
  onOpenProfile: (uid: string) => void;
  onNavigate?: (section: NavSection) => void;
}

export function VibesPage({ vibes, users, savedIds, onOpenProfile, onNavigate }: VibesPageProps) {
  const { profile, getUserBadges, getUserTier } = useAuth();
  const [feedMode, setFeedMode] = useState<'foryou' | 'following'>('foryou');
  const [activeIndex, setActiveIndex] = useState(0);
  const [likedIds, setLikedIds] = useState<string[]>([]);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [followBusyUid, setFollowBusyUid] = useState<string | null>(null);
  const [muted, setMuted] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const [showMobileComments, setShowMobileComments] = useState(false);
  const [comments, setComments] = useState<PostComment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [expandedCaptionId, setExpandedCaptionId] = useState<string | null>(null);

  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('');

  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showManageModal, setShowManageModal] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
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

  const desktopVideoRef = useRef<HTMLVideoElement>(null);
  const mobileVideoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const mobileSnapRef = useRef<HTMLDivElement>(null);
  const previewCamRef = useRef<HTMLVideoElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const viewRecordedIdsRef = useRef<Set<string>>(new Set());

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(''), 2200);
  }, []);

  useEffect(() => {
    if (!profile?.uid) {
      setFollowingIds(new Set());
      return;
    }
    return subscribeFollowingIds(profile.uid, setFollowingIds);
  }, [profile?.uid]);

  const filteredVibes = useMemo(() => {
    if (feedMode === 'following') {
      const subset = vibes.filter(
        (v) => v.authorId === profile?.uid || followingIds.has(v.authorId)
      );
      return subset;
    }
    return vibes;
  }, [vibes, feedMode, followingIds, profile?.uid]);

  const isDemoMode = vibes.length === 0;
  const currentVibe: Vibe | null = filteredVibes[activeIndex] || null;

  useEffect(() => {
    if (activeIndex >= filteredVibes.length && filteredVibes.length > 0) {
      setActiveIndex(0);
    }
  }, [filteredVibes.length, activeIndex]);

  useEffect(() => {
    setActiveIndex(0);
    if (mobileSnapRef.current) {
      mobileSnapRef.current.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, [feedMode]);

  useEffect(() => {
    if (!currentVibe || !profile) return;
    setIsPaused(false);
    setShowMoreMenu(false);
    setCurrentTime(currentVibe.trimStart || 0);
    setDuration(currentVibe.duration || 0);

    if (!viewRecordedIdsRef.current.has(currentVibe.id)) {
      viewRecordedIdsRef.current.add(currentVibe.id);
      void incrementVibeView(currentVibe.id);
      void recordVibeAnalyticsView(currentVibe.authorId, currentVibe.id, profile.uid);
    }

    const unsubComments = subscribeVibeComments(currentVibe.id, setComments);
    return () => {
      unsubComments();
    };
  }, [currentVibe?.id, profile?.uid]);

  // Keep mobile reel video elements synced to activeIndex + trim bounds
  useEffect(() => {
    if (!currentVibe) return;
    Object.entries(mobileVideoRefs.current).forEach(([id, vid]) => {
      if (!vid) return;
      if (id === currentVibe.id) {
        vid.muted = muted;
        if (!isPaused) {
          void vid.play().catch(() => {});
        } else {
          vid.pause();
        }
      } else {
        vid.pause();
      }
    });
  }, [currentVibe?.id, muted, isPaused]);

  // Desktop keyboard navigation (ArrowUp/ArrowDown, Space play/pause, M mute)
  useEffect(() => {
    if (showStudio || showMobileComments || showReportModal || showManageModal || showAnalytics) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'ArrowDown' && activeIndex < filteredVibes.length - 1) {
        e.preventDefault();
        setActiveIndex((i) => i + 1);
      } else if (e.key === 'ArrowUp' && activeIndex > 0) {
        e.preventDefault();
        setActiveIndex((i) => i - 1);
      } else if (e.key === ' ') {
        e.preventDefault();
        const vid = desktopVideoRef.current || (currentVibe ? mobileVideoRefs.current[currentVibe.id] : null);
        if (!vid) return;
        if (vid.paused) {
          void vid.play().catch(() => {});
          setIsPaused(false);
        } else {
          vid.pause();
          setIsPaused(true);
        }
      } else if (e.key.toLowerCase() === 'm') {
        setMuted((m) => !m);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    activeIndex,
    filteredVibes.length,
    currentVibe,
    showStudio,
    showMobileComments,
    showReportModal,
    showManageModal,
    showAnalytics,
  ]);

  const myVibes = useMemo(
    () => (profile ? vibes.filter((v) => v.authorId === profile.uid) : []),
    [vibes, profile]
  );
  const totalViews = myVibes.reduce((acc, v) => acc + v.viewsCount, 0);
  const totalLikes = myVibes.reduce((acc, v) => acc + v.likesCount, 0);

  if (!profile) return null;

  const getActiveVideoElement = (): HTMLVideoElement | null => {
    if (typeof window !== 'undefined' && window.innerWidth >= 1024) {
      return desktopVideoRef.current;
    }
    return currentVibe ? mobileVideoRefs.current[currentVibe.id] || null : null;
  };

  const togglePlayPause = () => {
    const vid = getActiveVideoElement();
    if (!vid) return;
    if (vid.paused) {
      void vid.play().catch(() => {});
      setIsPaused(false);
    } else {
      vid.pause();
      setIsPaused(true);
    }
  };

  const handleSeek = (nextSec: number) => {
    const vid = getActiveVideoElement();
    setCurrentTime(nextSec);
    if (vid) {
      vid.currentTime = nextSec;
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
      setStudioError(extractReadableErrorMessage(err, "Your video couldn't be uploaded. Please try again."));
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
          setStudioError(extractReadableErrorMessage(err, "Your video couldn't be uploaded. Please try again."));
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
      setFeedMode('foryou');
      setActiveIndex(0);
      showToast('Vibe published');
    } catch (err) {
      setStudioError(extractReadableErrorMessage(err, 'Could not publish Vibe right now. Please try again.'));
    } finally {
      setPublishing(false);
    }
  };

  const handleDeleteVibe = async (vibeId: string) => {
    setDeletingId(vibeId);
    try {
      await deleteVibe(vibeId);
      setConfirmDeleteId(null);
      showToast('Vibe removed');
    } catch (err) {
      showToast(extractReadableErrorMessage(err, 'Could not remove Vibe right now.'));
    } finally {
      setDeletingId(null);
    }
  };

  const handleLike = async (vibe: Vibe) => {
    try {
      const liked = await toggleVibeLike(vibe, profile);
      setLikedIds((prev) =>
        liked ? Array.from(new Set([...prev, vibe.id])) : prev.filter((id) => id !== vibe.id)
      );
    } catch (err) {
      showToast(extractReadableErrorMessage(err, 'Unable to update like right now.'));
    }
  };

  const handleRepost = async (vibe: Vibe) => {
    try {
      await repostVibe(vibe, profile);
      showToast('Reposted to your followers');
    } catch (err) {
      showToast(extractReadableErrorMessage(err, 'Unable to repost right now.'));
    }
  };

  const handleSave = async (vibe: Vibe) => {
    try {
      const nowSaved = await toggleSaveVibe(vibe, profile.uid);
      showToast(nowSaved ? 'Saved to your Profile' : 'Removed from Saved');
    } catch (err) {
      showToast(extractReadableErrorMessage(err, 'Unable to save Vibe right now.'));
    }
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
    if (followBusyUid) return;
    const target = users.find((u) => u.uid === authorId);
    if (!target) return;
    const currentlyFollowing = followingIds.has(authorId);
    setFollowBusyUid(authorId);
    try {
      const next = await toggleFollowUser(profile, target, currentlyFollowing);
      showToast(next ? `Following ${target.displayName}` : `Unfollowed ${target.displayName}`);
    } catch (err) {
      showToast(extractReadableErrorMessage(err, 'Unable to update follow status.'));
    } finally {
      setFollowBusyUid(null);
    }
  };

  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentVibe || !commentText.trim()) return;
    try {
      await addVibeComment(currentVibe, profile, commentText);
      setCommentText('');
    } catch (err) {
      showToast(extractReadableErrorMessage(err, 'Your comment could not be posted.'));
    }
  };

  const handleMobileScroll = () => {
    const container = mobileSnapRef.current;
    if (!container || filteredVibes.length === 0) return;
    const h = container.clientHeight;
    if (h <= 0) return;
    const idx = Math.round(container.scrollTop / h);
    if (idx !== activeIndex && idx >= 0 && idx < filteredVibes.length) {
      setActiveIndex(idx);
    }
  };

  return (
    <div className="nexora-keep-dark relative flex-1 bg-[#06060A] flex flex-col">
      {/* Subtle Ambient Glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_55%_65%_at_50%_40%,rgba(124,58,237,0.14),transparent_70%)] z-0"
      />

      {/* Desktop Top Vibes Command Bar */}
      <div className="hidden lg:flex relative z-20 w-full max-w-[1440px] mx-auto px-6 py-3 items-center justify-between gap-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-4">
          <div className="inline-flex items-center p-1 rounded-xl bg-[#0E0C18] border border-white/[0.08]">
            <button
              type="button"
              onClick={() => setFeedMode('foryou')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                feedMode === 'foryou' ? 'bg-[#7C3AED] text-white' : 'text-[#94A3B8] hover:text-white'
              }`}
            >
              For You
            </button>
            <button
              type="button"
              onClick={() => setFeedMode('following')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                feedMode === 'following' ? 'bg-[#7C3AED] text-white' : 'text-[#94A3B8] hover:text-white'
              }`}
            >
              Following
            </button>
          </div>
          {isDemoMode && (
            <span className="text-xs font-medium text-[#C084FC]">Demo Showcase</span>
          )}
          {toast && (
            <span className="text-xs font-medium text-[#C084FC] bg-[#7C3AED]/15 border border-[#8B5CF6]/30 px-2.5 py-1 rounded-lg">
              {toast}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowManageModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#0E0C18] border border-white/[0.09] hover:border-[#8B5CF6]/45 text-xs font-medium text-[#E2E8F0] transition-colors min-h-[38px]"
          >
            <FolderKanban size={14} className="text-[#C084FC]" />
            <span>Manage ({myVibes.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setShowAnalytics(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#0E0C18] border border-white/[0.09] hover:border-[#8B5CF6]/45 text-xs font-medium text-[#E2E8F0] transition-colors min-h-[38px]"
          >
            <BarChart3 size={14} className="text-[#A855F7]" />
            <span>Analytics</span>
          </button>
          <button
            type="button"
            onClick={() => setShowStudio(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-[#6D28D9] to-[#9333EA] hover:brightness-110 text-xs font-semibold text-white shadow-[0_4px_18px_rgba(124,58,237,0.4)] transition-all min-h-[38px]"
          >
            <Plus size={14} /> Upload Vibe
          </button>
        </div>
      </div>

      {/* Empty / Demo Stage when zero Vibes exist globally or in Following filter */}
      {isDemoMode || filteredVibes.length === 0 ? (
        <div className="relative z-10 flex-1 flex items-center justify-center p-4 sm:p-8 pb-24 lg:pb-10">
          <div className="w-full max-w-[960px] rounded-3xl border border-[#8B5CF6]/25 bg-[#0B0914] overflow-hidden shadow-[0_24px_80px_rgba(0,0,0,0.85)] grid grid-cols-1 lg:grid-cols-12">
            <div className="lg:col-span-7 relative bg-black flex items-center justify-center overflow-hidden min-h-[380px] sm:min-h-[460px]">
              <ResilientImage
                src="/src/assets/images/space_cover_sound_1795066815582.jpg"
                alt="Nexora Vibes Stage"
                className="w-full h-full object-cover opacity-75 scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/30 to-black/90" />

              <div className="relative z-10 text-center max-w-sm px-6 space-y-4">
                <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#C084FC]">
                  <NexoraLogo variant="icon" size="xs" />
                  <span>
                    {feedMode === 'following' && vibes.length > 0
                      ? 'No Vibes from followed creators yet'
                      : 'Nexora Vertical Video Stage'}
                  </span>
                </div>
                <h2 className="font-display text-2xl font-bold text-white leading-tight">
                  {feedMode === 'following' && vibes.length > 0
                    ? 'Switch to For You or follow more creators'
                    : 'Share your first vertical Vibe'}
                </h2>
                <p className="text-xs text-[#CBD5E1] leading-relaxed">
                  Upload portrait MP4/WebM video or record directly from your camera with filters,
                  custom soundtracks, voiceover layers, and trim handles.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setShowStudio(true)}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#6D28D9] to-[#9333EA] text-xs font-semibold text-white min-h-[42px]"
                  >
                    <Upload size={14} /> Upload or Record
                  </button>
                  {feedMode === 'following' && vibes.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setFeedMode('foryou')}
                      className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-white min-h-[42px]"
                    >
                      Switch to For You
                    </button>
                  )}
                </div>
              </div>
            </div>

            <aside className="lg:col-span-5 p-6 lg:p-8 flex flex-col justify-between bg-[#0E0C18] border-t lg:border-t-0 lg:border-l border-white/[0.08]">
              <div className="space-y-4">
                <p className="text-xs font-semibold text-[#C084FC]">Vibes Experience</p>
                <p className="text-sm text-[#E2E8F0] leading-relaxed">
                  Full-screen vertical snap scrolling on mobile and a widescreen cinema theater with live comments and queue navigation on desktop.
                </p>
                <div className="space-y-2 text-xs text-[#94A3B8]">
                  <p>· Vertical 9:16 framing with playback scrubber</p>
                  <p>· Real-time likes, reposts, saves &amp; comments</p>
                  <p>· Built-in camera capture &amp; manage clips drawer</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowManageModal(true)}
                className="mt-6 w-full py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/10 text-xs font-semibold text-white min-h-[42px]"
              >
                Manage My Clips ({myVibes.length})
              </button>
            </aside>
          </div>
        </div>
      ) : (
        <>
          {/* MOBILE: Full-Screen Vertical Snap-Scrolling Short-Video Experience */}
          <div className="lg:hidden relative flex-1 bg-black">
            {/* Translucent Floating Mobile Top Bar */}
            <div className="pointer-events-none absolute inset-x-0 top-0 z-30 p-3 flex items-center justify-between gap-2 bg-gradient-to-b from-black/75 via-black/30 to-transparent">
              <div className="pointer-events-auto inline-flex items-center p-0.5 rounded-xl bg-black/55 backdrop-blur-md border border-white/15">
                <button
                  type="button"
                  onClick={() => setFeedMode('foryou')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition min-h-[34px] ${
                    feedMode === 'foryou' ? 'bg-[#7C3AED] text-white' : 'text-white/75'
                  }`}
                >
                  For You
                </button>
                <button
                  type="button"
                  onClick={() => setFeedMode('following')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition min-h-[34px] ${
                    feedMode === 'following' ? 'bg-[#7C3AED] text-white' : 'text-white/75'
                  }`}
                >
                  Following
                </button>
              </div>

              <div className="pointer-events-auto flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setMuted((m) => !m)}
                  aria-label={muted ? 'Unmute video' : 'Mute video'}
                  className="min-w-[40px] min-h-[40px] rounded-xl bg-black/55 backdrop-blur-md border border-white/15 text-white flex items-center justify-center"
                >
                  {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                </button>
                <button
                  type="button"
                  onClick={() => setShowManageModal(true)}
                  aria-label="Manage your Vibes"
                  className="min-w-[40px] min-h-[40px] rounded-xl bg-black/55 backdrop-blur-md border border-white/15 text-white flex items-center justify-center"
                >
                  <FolderKanban size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => setShowStudio(true)}
                  aria-label="Upload Vibe"
                  className="min-h-[40px] px-3 rounded-xl bg-[#7C3AED] text-white text-xs font-semibold inline-flex items-center gap-1"
                >
                  <Plus size={15} /> Upload
                </button>
              </div>
            </div>

            {toast && (
              <div className="pointer-events-none absolute top-16 inset-x-0 z-30 flex justify-center">
                <span className="px-3 py-1 rounded-xl bg-black/80 border border-[#8B5CF6]/40 text-xs font-medium text-[#E9D5FF]">
                  {toast}
                </span>
              </div>
            )}

            {/* Vertical Snap Feed */}
            <div
              ref={mobileSnapRef}
              onScroll={handleMobileScroll}
              className="h-[calc(100dvh-4.1rem)] overflow-y-auto snap-y snap-mandatory no-scrollbar"
            >
              {filteredVibes.map((vibe, idx) => {
                const isActive = idx === activeIndex;
                const isLiked = likedIds.includes(vibe.id);
                const isSaved = savedIds.includes(vibe.id);
                const isFollowing = followingIds.has(vibe.authorId);
                const captionExpanded = expandedCaptionId === vibe.id;
                const authorBadges = getUserBadges(vibe.authorId, vibe.authorVerified);

                return (
                  <section
                    key={vibe.id}
                    className="relative h-[calc(100dvh-4.1rem)] w-full snap-start bg-black overflow-hidden flex items-center justify-center"
                  >
                    <video
                      ref={(el) => {
                        mobileVideoRefs.current[vibe.id] = el;
                      }}
                      src={vibe.videoUrl}
                      poster={vibe.thumbnailUrl || undefined}
                      autoPlay={isActive}
                      loop
                      muted={muted}
                      playsInline
                      onClick={togglePlayPause}
                      onLoadedMetadata={(e) => {
                        if (isActive) {
                          const d = e.currentTarget.duration;
                          if (Number.isFinite(d) && d > 0) setDuration(d);
                        }
                      }}
                      onTimeUpdate={(e) => {
                        if (!isActive) return;
                        const t = e.currentTarget.currentTime;
                        setCurrentTime(t);
                        if (vibe.trimEnd > 0 && t >= vibe.trimEnd) {
                          e.currentTarget.currentTime = vibe.trimStart || 0;
                        }
                      }}
                      style={{ filter: FILTER_CSS[vibe.filterPreset || 'none'] || 'none' }}
                      className="w-full h-full object-cover cursor-pointer"
                    />

                    {isActive && isPaused && (
                      <button
                        type="button"
                        onClick={togglePlayPause}
                        aria-label="Resume playback"
                        className="absolute inset-0 bg-black/25 flex items-center justify-center z-10"
                      >
                        <span className="w-16 h-16 rounded-full bg-black/65 backdrop-blur-md border border-white/25 flex items-center justify-center text-white">
                          <Play size={26} className="fill-white ml-1" />
                        </span>
                      </button>
                    )}

                    {vibe.textOverlay && (
                      <div className="pointer-events-none absolute inset-x-8 top-1/2 -translate-y-1/2 text-center z-10">
                        <span className="inline-block px-4 py-1.5 rounded-xl bg-black/60 backdrop-blur-sm font-display text-lg font-bold text-white">
                          {vibe.textOverlay}
                        </span>
                      </div>
                    )}

                    {/* Bottom Gradient Overlay */}
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-black/95 via-black/55 to-transparent z-10" />

                    {/* Right-Side Vertical Thumb-Zone Action Stack */}
                    <div className="absolute right-2.5 bottom-16 z-20 flex flex-col items-center gap-3">
                      <button
                        type="button"
                        onClick={() => void handleLike(vibe)}
                        aria-label="Like Vibe"
                        className="flex flex-col items-center gap-1 min-w-[46px] min-h-[46px] justify-center"
                      >
                        <span
                          className={`w-11 h-11 rounded-full backdrop-blur-md border flex items-center justify-center transition-transform active:scale-90 ${
                            isLiked
                              ? 'bg-[#7C3AED]/85 border-[#E9D5FF]/50 text-white'
                              : 'bg-black/55 border-white/15 text-white'
                          }`}
                        >
                          <Heart size={20} className={isLiked ? 'fill-white' : ''} />
                        </span>
                        <span className="text-[11px] font-mono-tabular font-semibold text-white drop-shadow">
                          {formatCompactCount(vibe.likesCount)}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setShowMobileComments(true)}
                        aria-label="Open comments"
                        className="flex flex-col items-center gap-1 min-w-[46px] min-h-[46px] justify-center"
                      >
                        <span className="w-11 h-11 rounded-full bg-black/55 backdrop-blur-md border border-white/15 flex items-center justify-center text-white">
                          <MessageCircle size={20} />
                        </span>
                        <span className="text-[11px] font-mono-tabular font-semibold text-white drop-shadow">
                          {formatCompactCount(vibe.commentsCount)}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleRepost(vibe)}
                        aria-label="Repost Vibe"
                        className="flex flex-col items-center gap-1 min-w-[46px] min-h-[46px] justify-center"
                      >
                        <span className="w-11 h-11 rounded-full bg-black/55 backdrop-blur-md border border-white/15 flex items-center justify-center text-white">
                          <Repeat2 size={20} />
                        </span>
                        <span className="text-[11px] font-mono-tabular font-semibold text-white drop-shadow">
                          {formatCompactCount(vibe.repostsCount)}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleSave(vibe)}
                        aria-label="Save Vibe"
                        className="flex flex-col items-center gap-1 min-w-[46px] min-h-[46px] justify-center"
                      >
                        <span
                          className={`w-11 h-11 rounded-full backdrop-blur-md border flex items-center justify-center ${
                            isSaved
                              ? 'bg-[#7C3AED]/85 border-[#E9D5FF]/50 text-white'
                              : 'bg-black/55 border-white/15 text-white'
                          }`}
                        >
                          <Bookmark size={19} className={isSaved ? 'fill-white' : ''} />
                        </span>
                        <span className="text-[11px] font-mono-tabular font-semibold text-white drop-shadow">
                          {formatCompactCount(vibe.savesCount)}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleShare(vibe)}
                        aria-label="Share Vibe"
                        className="flex flex-col items-center gap-1 min-w-[46px] min-h-[46px] justify-center"
                      >
                        <span className="w-11 h-11 rounded-full bg-black/55 backdrop-blur-md border border-white/15 flex items-center justify-center text-white">
                          <Share2 size={18} />
                        </span>
                        <span className="text-[10px] font-semibold text-white/85">Share</span>
                      </button>
                    </div>

                    {/* Bottom-Left Creator Info, Caption & Scrubbable Timeline */}
                    <div className="absolute left-3.5 right-16 bottom-4 z-20 space-y-2.5">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <button
                          type="button"
                          onClick={() => onOpenProfile(vibe.authorId)}
                          className="flex items-center gap-2 text-left min-w-0"
                        >
                          <ResilientImage
                            src={vibe.authorAvatar}
                            alt={vibe.authorName}
                            className="w-9 h-9 rounded-full object-cover border border-[#A855F7]/70 shrink-0"
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-white inline-flex items-center gap-1 truncate max-w-[165px]">
                              <span className="truncate">{vibe.authorName}</span>
                              <BadgeStrip badges={authorBadges} size={13} max={2} interactive={false} />
                            </p>
                            <p className="text-[11px] text-white/75 truncate">
                              @{vibe.authorUsername} · {formatRelativeTime(vibe.createdAt)}
                            </p>
                          </div>
                        </button>

                        {vibe.authorId !== profile.uid && (
                          <button
                            type="button"
                            disabled={followBusyUid === vibe.authorId}
                            onClick={() => void handleFollowCreator(vibe.authorId)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors min-h-[34px] ${
                              isFollowing
                                ? 'bg-white/15 text-white border border-white/25'
                                : 'bg-[#7C3AED] text-white'
                            }`}
                          >
                            {isFollowing ? 'Following' : 'Follow'}
                          </button>
                        )}
                      </div>

                      {vibe.caption && (
                        <button
                          type="button"
                          onClick={() => setExpandedCaptionId(captionExpanded ? null : vibe.id)}
                          className="block text-left"
                        >
                          <p
                            className={`text-xs text-white/95 leading-relaxed ${
                              captionExpanded ? '' : 'line-clamp-2'
                            }`}
                          >
                            {vibe.caption}
                          </p>
                        </button>
                      )}

                      {vibe.audioTrack && (
                        <p className="text-[11px] text-white/75 inline-flex items-center gap-1.5 truncate max-w-full">
                          <Music size={11} className="text-[#C084FC] shrink-0" />
                          <span className="truncate">{vibe.audioTrack}</span>
                        </p>
                      )}

                      {isActive && (
                        <div className="flex items-center gap-2 pt-0.5">
                          <input
                            type="range"
                            min={0}
                            max={Math.max(1, duration || vibe.duration || 30)}
                            step={0.1}
                            value={Math.min(currentTime, Math.max(1, duration || vibe.duration || 30))}
                            onChange={(e) => handleSeek(Number(e.target.value))}
                            aria-label="Seek video playback"
                            className="flex-1 h-1 accent-[#A855F7] cursor-pointer"
                          />
                          <span className="text-[10px] font-mono-tabular text-white/80 shrink-0">
                            {formatVideoClock(currentTime)} / {formatVideoClock(duration || vibe.duration)}
                          </span>
                        </div>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>

          {/* DESKTOP: Adaptive Widescreen Vertical Video Theater + Comments & Queue Panel */}
          {currentVibe && (
            <div className="hidden lg:flex relative z-10 flex-1 w-full max-w-[1360px] mx-auto px-6 py-5 items-center justify-center gap-6">
              {/* Centered 9:16 Vertical Video Player */}
              <div className="relative flex items-end gap-4">
                <div className="relative h-[76vh] max-h-[800px] min-h-[520px] aspect-[9/16] rounded-3xl overflow-hidden bg-black border border-[#8B5CF6]/30 shadow-[0_24px_80px_rgba(0,0,0,0.85)]">
                  <video
                    ref={desktopVideoRef}
                    key={currentVibe.id}
                    src={currentVibe.videoUrl}
                    poster={currentVibe.thumbnailUrl || undefined}
                    autoPlay
                    loop
                    muted={muted}
                    playsInline
                    onClick={togglePlayPause}
                    onLoadedMetadata={(e) => {
                      const d = e.currentTarget.duration;
                      if (Number.isFinite(d) && d > 0) setDuration(d);
                    }}
                    onTimeUpdate={(e) => {
                      const t = e.currentTarget.currentTime;
                      setCurrentTime(t);
                      if (currentVibe.trimEnd > 0 && t >= currentVibe.trimEnd) {
                        e.currentTarget.currentTime = currentVibe.trimStart || 0;
                      }
                    }}
                    style={{ filter: FILTER_CSS[currentVibe.filterPreset || 'none'] || 'none' }}
                    className="w-full h-full object-cover cursor-pointer"
                  />

                  {isPaused && (
                    <button
                      type="button"
                      onClick={togglePlayPause}
                      aria-label="Resume video"
                      className="absolute inset-0 bg-black/25 flex items-center justify-center z-10"
                    >
                      <span className="w-16 h-16 rounded-full bg-black/65 backdrop-blur-md border border-white/25 flex items-center justify-center text-white">
                        <Play size={26} className="fill-white ml-1" />
                      </span>
                    </button>
                  )}

                  {currentVibe.textOverlay && (
                    <div className="pointer-events-none absolute inset-x-6 top-1/2 -translate-y-1/2 text-center z-10">
                      <span className="inline-block px-4 py-1.5 rounded-xl bg-black/60 backdrop-blur-sm font-display text-xl font-bold text-white">
                        {currentVibe.textOverlay}
                      </span>
                    </div>
                  )}

                  {/* Top Playback + More Controls */}
                  <div className="pointer-events-none absolute inset-x-0 top-0 p-4 bg-gradient-to-b from-black/75 to-transparent flex items-center justify-between z-20">
                    <span className="font-mono-tabular text-[11px] font-semibold text-white/85 px-2.5 py-1 rounded-lg bg-black/45 backdrop-blur-sm">
                      {activeIndex + 1} / {filteredVibes.length}
                    </span>

                    <div className="pointer-events-auto flex items-center gap-2 relative">
                      <button
                        type="button"
                        onClick={() => setMuted((m) => !m)}
                        aria-label={muted ? 'Unmute video' : 'Mute video'}
                        className="p-2 rounded-xl bg-black/55 hover:bg-black/80 border border-white/15 text-white transition-colors"
                      >
                        {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowMoreMenu((v) => !v)}
                        aria-label="More options"
                        className="p-2 rounded-xl bg-black/55 hover:bg-black/80 border border-white/15 text-white transition-colors"
                      >
                        <MoreHorizontal size={16} />
                      </button>

                      {showMoreMenu && (
                        <div className="absolute right-0 top-11 w-48 bg-[#0E0C18] border border-[#8B5CF6]/25 rounded-2xl shadow-2xl p-1.5 z-30">
                          <button
                            type="button"
                            onClick={() => {
                              setShowMoreMenu(false);
                              onOpenProfile(currentVibe.authorId);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-white hover:bg-[#7C3AED]/15 text-left"
                          >
                            <User size={14} /> Creator Profile
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setShowMoreMenu(false);
                              void handleShare(currentVibe);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-white hover:bg-[#7C3AED]/15 text-left"
                          >
                            <Copy size={14} /> Copy Vibe Link
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setShowMoreMenu(false);
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

                  {/* Bottom Playback Controls & Scrubber Bar */}
                  <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/95 via-black/60 to-transparent z-20 space-y-2">
                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={togglePlayPause}
                        aria-label={isPaused ? 'Play' : 'Pause'}
                        className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white"
                      >
                        {isPaused ? <Play size={14} /> : <Pause size={14} />}
                      </button>
                      <input
                        type="range"
                        min={0}
                        max={Math.max(1, duration || currentVibe.duration || 30)}
                        step={0.1}
                        value={Math.min(currentTime, Math.max(1, duration || currentVibe.duration || 30))}
                        onChange={(e) => handleSeek(Number(e.target.value))}
                        aria-label="Seek video playback"
                        className="flex-1 h-1 accent-[#A855F7] cursor-pointer"
                      />
                      <span className="text-[11px] font-mono-tabular text-white/85 shrink-0">
                        {formatVideoClock(currentTime)} / {formatVideoClock(duration || currentVibe.duration)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Desktop Side Engagement Column + Reel Stepper */}
                <div className="flex flex-col items-center gap-3 pb-2">
                  <button
                    type="button"
                    onClick={() => void handleLike(currentVibe)}
                    className="flex flex-col items-center gap-1"
                  >
                    <span
                      className={`w-11 h-11 rounded-2xl border flex items-center justify-center transition ${
                        likedIds.includes(currentVibe.id)
                          ? 'bg-[#7C3AED] border-[#C084FC] text-white'
                          : 'bg-[#0E0C18] border-white/[0.1] text-white hover:border-[#8B5CF6]/50'
                      }`}
                    >
                      <Heart
                        size={18}
                        className={likedIds.includes(currentVibe.id) ? 'fill-white' : ''}
                      />
                    </span>
                    <span className="text-[11px] font-mono-tabular text-[#CBD5E1]">
                      {formatCompactCount(currentVibe.likesCount)}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleRepost(currentVibe)}
                    className="flex flex-col items-center gap-1"
                  >
                    <span className="w-11 h-11 rounded-2xl bg-[#0E0C18] border border-white/[0.1] hover:border-[#8B5CF6]/50 text-white flex items-center justify-center transition">
                      <Repeat2 size={18} />
                    </span>
                    <span className="text-[11px] font-mono-tabular text-[#CBD5E1]">
                      {formatCompactCount(currentVibe.repostsCount)}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleSave(currentVibe)}
                    className="flex flex-col items-center gap-1"
                  >
                    <span
                      className={`w-11 h-11 rounded-2xl border flex items-center justify-center transition ${
                        savedIds.includes(currentVibe.id)
                          ? 'bg-[#7C3AED] border-[#C084FC] text-white'
                          : 'bg-[#0E0C18] border-white/[0.1] text-white hover:border-[#8B5CF6]/50'
                      }`}
                    >
                      <Bookmark
                        size={18}
                        className={savedIds.includes(currentVibe.id) ? 'fill-white' : ''}
                      />
                    </span>
                    <span className="text-[11px] font-mono-tabular text-[#CBD5E1]">
                      {formatCompactCount(currentVibe.savesCount)}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleShare(currentVibe)}
                    className="flex flex-col items-center gap-1"
                  >
                    <span className="w-11 h-11 rounded-2xl bg-[#0E0C18] border border-white/[0.1] hover:border-[#8B5CF6]/50 text-white flex items-center justify-center transition">
                      <Share2 size={17} />
                    </span>
                    <span className="text-[10px] text-[#94A3B8]">Share</span>
                  </button>

                  {filteredVibes.length > 1 && (
                    <div className="pt-2 border-t border-white/[0.08] flex flex-col gap-2">
                      <button
                        type="button"
                        disabled={activeIndex === 0}
                        onClick={() => setActiveIndex((i) => Math.max(0, i - 1))}
                        aria-label="Previous Vibe"
                        className="w-11 h-11 rounded-2xl bg-[#0E0C18] border border-white/[0.1] hover:border-[#8B5CF6] text-white disabled:opacity-30 flex items-center justify-center transition"
                      >
                        <ChevronUp size={18} />
                      </button>
                      <button
                        type="button"
                        disabled={activeIndex >= filteredVibes.length - 1}
                        onClick={() =>
                          setActiveIndex((i) => Math.min(filteredVibes.length - 1, i + 1))
                        }
                        aria-label="Next Vibe"
                        className="w-11 h-11 rounded-2xl bg-[#0E0C18] border border-white/[0.1] hover:border-[#8B5CF6] text-white disabled:opacity-30 flex items-center justify-center transition"
                      >
                        <ChevronDown size={18} />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Desktop Right-Hand Creator Details, Live Comments & Up Next Queue */}
              <aside className="w-[370px] xl:w-[410px] h-[76vh] max-h-[800px] min-h-[520px] rounded-3xl bg-[#0D0B16] border border-white/[0.08] flex flex-col overflow-hidden">
                {/* Creator Profile + Follow Header */}
                <div className="p-5 border-b border-white/[0.07] space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => onOpenProfile(currentVibe.authorId)}
                      className="flex items-center gap-3 text-left min-w-0"
                    >
                      <ResilientImage
                        src={currentVibe.authorAvatar}
                        alt={currentVibe.authorName}
                        className="w-10 h-10 rounded-full object-cover border border-[#8B5CF6]/50 shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white inline-flex items-center gap-1 truncate max-w-full">
                          <span className="truncate">{currentVibe.authorName}</span>
                          <BadgeStrip
                            badges={getUserBadges(currentVibe.authorId, currentVibe.authorVerified)}
                            size={13}
                            max={2}
                            interactive={false}
                          />
                          <TierBadge
                            tier={getUserTier(
                              currentVibe.authorId,
                              users.find((u) => u.uid === currentVibe.authorId)?.subscriptionTier
                            )}
                            showFree={false}
                            size="xs"
                          />
                        </p>
                        <p className="text-[11px] text-[#94A3B8] truncate">
                          @{currentVibe.authorUsername} · {formatRelativeTime(currentVibe.createdAt)}
                        </p>
                      </div>
                    </button>

                    {currentVibe.authorId !== profile.uid && (
                      <button
                        type="button"
                        disabled={followBusyUid === currentVibe.authorId}
                        onClick={() => void handleFollowCreator(currentVibe.authorId)}
                        className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 transition ${
                          followingIds.has(currentVibe.authorId)
                            ? 'bg-white/10 text-white hover:bg-white/20'
                            : 'bg-[#7C3AED] hover:bg-[#6D28D9] text-white'
                        }`}
                      >
                        <UserPlus size={12} />
                        {followingIds.has(currentVibe.authorId) ? 'Following' : 'Follow'}
                      </button>
                    )}
                  </div>

                  {currentVibe.caption && (
                    <p className="text-xs text-[#E2E8F0] leading-relaxed break-words">
                      {currentVibe.caption}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#94A3B8]">
                    {currentVibe.audioTrack && (
                      <span className="inline-flex items-center gap-1.5 truncate max-w-[210px]">
                        <Music size={12} className="text-[#C084FC] shrink-0" />
                        <span className="truncate">{currentVibe.audioTrack}</span>
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 font-mono-tabular">
                      <Eye size={12} className="text-[#A855F7]" />
                      {formatCompactCount(currentVibe.viewsCount)} views
                    </span>
                  </div>
                </div>

                {/* Embedded Live Comments Stream */}
                <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
                  <div className="flex items-center justify-between text-xs font-semibold text-white pb-1">
                    <span>Comments</span>
                    <span className="font-mono-tabular text-[#94A3B8]">
                      {currentVibe.commentsCount}
                    </span>
                  </div>
                  {comments.length === 0 ? (
                    <p className="text-xs text-[#64748B] py-6 text-center">
                      No comments yet. Share the first reaction.
                    </p>
                  ) : (
                    comments.map((c) => (
                      <div
                        key={c.id}
                        className="p-3 rounded-xl bg-[#08070F] border border-white/[0.06] space-y-1"
                      >
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-semibold text-white">{c.authorName}</span>
                          <span className="text-[#64748B]">{formatRelativeTime(c.createdAt)}</span>
                        </div>
                        <p className="text-xs text-[#CBD5E1]">{c.text}</p>
                      </div>
                    ))
                  )}
                </div>

                {/* Comment Composer */}
                <form
                  onSubmit={handleCommentSubmit}
                  className="p-3.5 border-t border-white/[0.07] bg-[#090812] flex gap-2"
                >
                  <input
                    type="text"
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="Add a comment..."
                    className="flex-1 px-3 py-2 rounded-xl bg-[#0D0B16] border border-white/[0.1] focus:border-[#8B5CF6] text-xs text-white outline-none"
                  />
                  <button
                    type="submit"
                    disabled={!commentText.trim()}
                    className="px-4 py-2 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] disabled:opacity-40 text-xs font-semibold text-white"
                  >
                    Post
                  </button>
                </form>

                {/* Up Next Reel Strip */}
                {filteredVibes.length > 1 && (
                  <div className="p-3 border-t border-white/[0.07] bg-[#08070F] space-y-2">
                    <p className="text-[11px] font-semibold text-[#94A3B8]">Up Next</p>
                    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                      {filteredVibes.map((item, i) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setActiveIndex(i)}
                          className={`shrink-0 w-16 h-20 rounded-xl overflow-hidden border relative transition ${
                            i === activeIndex
                              ? 'border-[#C084FC] ring-1 ring-[#8B5CF6]'
                              : 'border-white/10 opacity-70 hover:opacity-100'
                          }`}
                        >
                          {item.thumbnailUrl ? (
                            <ResilientImage
                              src={item.thumbnailUrl}
                              alt={item.authorName}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <video
                              src={item.videoUrl}
                              muted
                              playsInline
                              preload="metadata"
                              className="w-full h-full object-cover"
                            />
                          )}
                          <span className="absolute inset-x-0 bottom-0 p-1 bg-gradient-to-t from-black/90 to-transparent text-[9px] text-white truncate">
                            @{item.authorUsername}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </aside>
            </div>
          )}
        </>
      )}

      {/* Mobile Comments Drawer */}
      {showMobileComments && currentVibe && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end lg:hidden">
          <div className="w-full max-h-[75vh] bg-[#0D0B16] border-t border-[#8B5CF6]/25 rounded-t-3xl p-5 flex flex-col space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <h2 className="font-display text-base font-semibold text-white">
                Comments ({currentVibe.commentsCount})
              </h2>
              <button
                type="button"
                onClick={() => setShowMobileComments(false)}
                className="p-2 rounded-xl text-[#94A3B8] hover:text-white"
                aria-label="Close comments"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2.5 py-1">
              {comments.length === 0 ? (
                <p className="text-xs text-[#64748B] py-6 text-center">
                  Be the first to comment on this Vibe.
                </p>
              ) : (
                comments.map((c) => (
                  <div
                    key={c.id}
                    className="p-3 rounded-xl bg-[#08070F] border border-white/[0.06] space-y-1"
                  >
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-white">{c.authorName}</span>
                      <span className="text-[#64748B]">{formatRelativeTime(c.createdAt)}</span>
                    </div>
                    <p className="text-xs text-[#CBD5E1]">{c.text}</p>
                  </div>
                ))
              )}
            </div>

            <form onSubmit={handleCommentSubmit} className="pt-2 border-t border-white/10 flex gap-2">
              <input
                type="text"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Add a comment..."
                className="flex-1 px-3.5 py-2.5 rounded-xl bg-[#08070F] border border-[#8B5CF6]/25 text-xs text-white outline-none"
              />
              <button
                type="submit"
                disabled={!commentText.trim()}
                className="px-4 py-2.5 rounded-xl bg-[#7C3AED] text-xs font-semibold text-white disabled:opacity-40"
              >
                Post
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Manage My Vibes Modal (Video Management) */}
      {showManageModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-2xl bg-[#0E0C18] border border-[#8B5CF6]/25 rounded-2xl p-5 sm:p-6 space-y-4 my-auto">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h2 className="font-display text-base sm:text-lg font-semibold text-white">
                  Manage Your Vibes
                </h2>
                <p className="text-xs text-[#94A3B8]">
                  Inspect performance or remove clips you uploaded.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowManageModal(false);
                  setConfirmDeleteId(null);
                }}
                className="p-2 text-[#94A3B8] hover:text-white"
                aria-label="Close manager"
              >
                <X size={18} />
              </button>
            </div>

            {myVibes.length === 0 ? (
              <div className="py-10 text-center space-y-3">
                <Film size={28} className="text-[#C084FC] mx-auto" />
                <p className="text-sm font-medium text-white">No published Vibes yet</p>
                <button
                  type="button"
                  onClick={() => {
                    setShowManageModal(false);
                    setShowStudio(true);
                  }}
                  className="px-4 py-2 rounded-xl bg-[#7C3AED] text-xs font-semibold text-white"
                >
                  Create Your First Vibe
                </button>
              </div>
            ) : (
              <div className="max-h-[55vh] overflow-y-auto space-y-2.5 pr-1">
                {myVibes.map((item) => {
                  const targetIdx = filteredVibes.findIndex((fv) => fv.id === item.id);
                  const isConfirming = confirmDeleteId === item.id;
                  const isDeleting = deletingId === item.id;
                  return (
                    <div
                      key={item.id}
                      className="p-3 rounded-xl bg-[#08070F] border border-white/[0.07] flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-12 h-16 rounded-lg overflow-hidden bg-black shrink-0 border border-white/10">
                          {item.thumbnailUrl ? (
                            <ResilientImage
                              src={item.thumbnailUrl}
                              alt={item.caption}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <video
                              src={item.videoUrl}
                              muted
                              playsInline
                              preload="metadata"
                              className="w-full h-full object-cover"
                            />
                          )}
                        </div>
                        <div className="min-w-0 space-y-1">
                          <p className="text-xs font-semibold text-white truncate">
                            {item.caption || 'Untitled Vibe'}
                          </p>
                          <p className="text-[11px] font-mono-tabular text-[#94A3B8]">
                            {formatCompactCount(item.viewsCount)} views · {formatCompactCount(item.likesCount)} likes · {formatRelativeTime(item.createdAt)}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {targetIdx >= 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setActiveIndex(targetIdx);
                              setShowManageModal(false);
                            }}
                            className="px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-xs font-medium text-white min-h-[34px]"
                          >
                            Watch
                          </button>
                        )}
                        {isConfirming ? (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              disabled={isDeleting}
                              onClick={() => void handleDeleteVibe(item.id)}
                              className="px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-xs font-semibold text-white min-h-[34px]"
                            >
                              {isDeleting ? 'Deleting...' : 'Confirm'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-2 py-1.5 text-xs text-[#94A3B8] hover:text-white"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(item.id)}
                            aria-label="Delete Vibe"
                            className="p-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 text-rose-300 min-h-[34px]"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Report Vibe Modal */}
      {showReportModal && currentVibe && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!reportReason.trim()) return;
              try {
                await submitModerationReport({
                  reporterId: profile.uid,
                  targetType: 'vibe',
                  targetId: currentVibe.id,
                  reason: reportReason,
                });
                setReportReason('');
                setShowReportModal(false);
                showToast('Report submitted');
              } catch (err) {
                showToast(extractReadableErrorMessage(err, 'Unable to submit report right now.'));
              }
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
                aria-label="Close analytics"
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
            {onNavigate && (
              <button
                type="button"
                onClick={() => {
                  setShowAnalytics(false);
                  onNavigate('analytics');
                }}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#6D28D9] to-[#7C3AED] text-xs font-semibold text-white"
              >
                Open Full Creator Analytics Studio
              </button>
            )}
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
                aria-label="Close Vibes Studio"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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

              <div className="space-y-4">
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-[#CBD5E1]">Caption &amp; Hashtags</span>
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
