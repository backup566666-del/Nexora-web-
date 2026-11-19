import React, { useEffect, useRef, useState } from 'react';
import {
  BarChart2,
  Check,
  Compass,
  Crop,
  Film,
  FlipHorizontal2,
  Image as ImageIcon,
  Layers,
  Mic,
  Music,
  RotateCcw,
  RotateCw,
  Scissors,
  Sliders,
  Sparkles,
  Square,
  Sticker,
  Type,
  Upload,
} from 'lucide-react';
import { CoverEditorModal } from '../../components/media/CoverEditorModal';
import { PostComposer } from '../../features/posts/PostComposer';
import { useAuth } from '../../hooks/useAuth';
import { updateUserProfileFields } from '../../services/auth/authService';
import { createStory, createVibe, updateSpaceCover } from '../../services/firebase/socialService';
import { uploadBlobAsset, uploadMediaAsset } from '../../services/storage/mediaUploadService';
import { Space, StoryPrivacy } from '../../types/nexora';

interface CreatePageProps {
  spaces: Space[];
  onDone: (goTo: 'home' | 'vibes' | 'spaces' | 'profile') => void;
}

type StudioMode = 'post' | 'photo-editor' | 'vibe' | 'story' | 'covers';
type CropAspect = 'original' | '1:1' | '4:5' | '16:9' | '9:16';
type StickerKind = 'none' | 'NEXORA' | 'VIBES' | 'STUDIO' | 'LIVE';

const FILTER_PRESETS: {
  id: string;
  label: string;
  brightness: number;
  contrast: number;
  saturate: number;
  tint?: string;
}[] = [
  { id: 'natural', label: 'Natural', brightness: 100, contrast: 105, saturate: 105 },
  {
    id: 'violet',
    label: 'Electric Violet',
    brightness: 102,
    contrast: 112,
    saturate: 128,
    tint: 'rgba(124, 58, 237, 0.14)',
  },
  { id: 'noir', label: 'Obsidian Noir', brightness: 95, contrast: 132, saturate: 15 },
  {
    id: 'cinema',
    label: 'Cinema',
    brightness: 98,
    contrast: 118,
    saturate: 112,
    tint: 'rgba(76, 29, 149, 0.1)',
  },
];

const VIBE_MUSIC_TRACKS = [
  'Original Audio',
  'Midnight Violet — Nexora Sound',
  'Studio Pulse — Ambient',
  'Obsidian Horizon — Synth',
];

const STORY_GRADIENTS = [
  'from-[#4C1D95] via-[#7C3AED] to-[#06060A]',
  'from-[#1E1B4B] via-[#5B21B6] to-[#0D0D14]',
  'from-[#311042] via-[#701A75] to-[#09090F]',
  'from-[#0F172A] via-[#3B0764] to-[#06060A]',
];

export function CreatePage({ spaces, onDone }: CreatePageProps) {
  const { profile, refreshUserAndProfile } = useAuth();
  const [mode, setMode] = useState<StudioMode>('post');

  // Attached media routed from Photo Studio back into PostComposer
  const [attachedPostMediaUrl, setAttachedPostMediaUrl] = useState('');

  // Photo Studio state (real Canvas pipeline)
  const [sourceImageObj, setSourceImageObj] = useState<HTMLImageElement | null>(null);
  const [cropAspect, setCropAspect] = useState<CropAspect>('original');
  const [resizeScale, setResizeScale] = useState(100);
  const [rotationDeg, setRotationDeg] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [filterId, setFilterId] = useState('natural');
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(105);
  const [saturate, setSaturate] = useState(105);
  const [overlayText, setOverlayText] = useState('');
  const [overlayColor, setOverlayColor] = useState('#FFFFFF');
  const [overlayPos, setOverlayPos] = useState<'top' | 'center' | 'bottom'>('bottom');
  const [sticker, setSticker] = useState<StickerKind>('none');
  const [canvasDims, setCanvasDims] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [exportingPhoto, setExportingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState('');

  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const editorFileRef = useRef<HTMLInputElement>(null);

  // Story Studio state
  const [storyMode, setStoryMode] = useState<'text' | 'image' | 'video'>('text');
  const [storyText, setStoryText] = useState('');
  const [storyMediaUrl, setStoryMediaUrl] = useState('');
  const [storyGradient, setStoryGradient] = useState(STORY_GRADIENTS[0]);
  const [storyPrivacy, setStoryPrivacy] = useState<StoryPrivacy>('public');
  const [storySaving, setStorySaving] = useState(false);
  const [storyUploading, setStoryUploading] = useState(false);
  const storyFileRef = useRef<HTMLInputElement>(null);

  // Vibe Video Studio state
  const [vibeUrl, setVibeUrl] = useState('');
  const [vibeCaption, setVibeCaption] = useState('');
  const [vibeThumb, setVibeThumb] = useState('');
  const [vibeFilter, setVibeFilter] = useState<'none' | 'violet' | 'cinema' | 'noir'>('none');
  const [vibeOverlay, setVibeOverlay] = useState('');
  const [vibeMusic, setVibeMusic] = useState(VIBE_MUSIC_TRACKS[0]);
  const [vibeDuration, setVibeDuration] = useState(30);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(30);
  const [uploadingVibe, setUploadingVibe] = useState(false);
  const [publishingVibe, setPublishingVibe] = useState(false);
  const [vibeError, setVibeError] = useState('');
  const vibeFileRef = useRef<HTMLInputElement>(null);
  const vibeVideoRef = useRef<HTMLVideoElement>(null);

  // Voiceover recorder inside Vibe Studio
  const [recordingVo, setRecordingVo] = useState(false);
  const [voiceoverUrl, setVoiceoverUrl] = useState('');
  const voRecorderRef = useRef<MediaRecorder | null>(null);
  const voChunksRef = useRef<BlobPart[]>([]);

  // Cover Editor targets
  const [coverTarget, setCoverTarget] = useState<'profile' | 'space' | 'vibe-thumb' | null>(null);
  const [selectedSpaceForCover, setSelectedSpaceForCover] = useState<Space | null>(null);

  // Render live edited photo onto HTML5 Canvas
  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas || !sourceImageObj) return;

    const rot90 = Math.abs(rotationDeg % 180) === 90;
    const rawW = rot90 ? sourceImageObj.naturalHeight : sourceImageObj.naturalWidth;
    const rawH = rot90 ? sourceImageObj.naturalWidth : sourceImageObj.naturalHeight;

    let targetRatio = rawW / Math.max(1, rawH);
    if (cropAspect === '1:1') targetRatio = 1;
    else if (cropAspect === '4:5') targetRatio = 4 / 5;
    else if (cropAspect === '16:9') targetRatio = 16 / 9;
    else if (cropAspect === '9:16') targetRatio = 9 / 16;

    let cropW = rawW;
    let cropH = rawH;
    if (rawW / rawH > targetRatio) {
      cropW = Math.round(rawH * targetRatio);
    } else {
      cropH = Math.round(rawW / targetRatio);
    }

    const scaleFactor = resizeScale / 100;
    const maxDim = 1280;
    const baseDownscale = Math.min(1, maxDim / Math.max(cropW, cropH));
    const outW = Math.max(120, Math.round(cropW * baseDownscale * scaleFactor));
    const outH = Math.max(120, Math.round(cropH * baseDownscale * scaleFactor));

    canvas.width = outW;
    canvas.height = outH;
    setCanvasDims({ w: outW, h: outH });

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.clearRect(0, 0, outW, outH);
    ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturate}%)`;

    ctx.translate(outW / 2, outH / 2);
    ctx.rotate((rotationDeg * Math.PI) / 180);
    if (flipH) ctx.scale(-1, 1);

    const drawScale = Math.max(
      outW / (rot90 ? sourceImageObj.naturalHeight : sourceImageObj.naturalWidth),
      outH / (rot90 ? sourceImageObj.naturalWidth : sourceImageObj.naturalHeight)
    );
    const dw = sourceImageObj.naturalWidth * drawScale;
    const dh = sourceImageObj.naturalHeight * drawScale;
    ctx.drawImage(sourceImageObj, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();

    const preset = FILTER_PRESETS.find((p) => p.id === filterId);
    if (preset?.tint) {
      ctx.save();
      ctx.fillStyle = preset.tint;
      ctx.fillRect(0, 0, outW, outH);
      ctx.restore();
    }

    // Render sticker badge onto Canvas
    if (sticker !== 'none') {
      ctx.save();
      const padX = Math.max(18, Math.round(outW * 0.035));
      const padY = Math.max(16, Math.round(outH * 0.035));
      const fontSize = Math.max(14, Math.round(outW * 0.028));
      ctx.font = `700 ${fontSize}px Inter, system-ui, sans-serif`;
      const textWidth = ctx.measureText(sticker).width;
      const boxW = textWidth + fontSize * 1.4;
      const boxH = fontSize * 1.9;

      const grad = ctx.createLinearGradient(padX, padY, padX + boxW, padY + boxH);
      grad.addColorStop(0, '#6D28D9');
      grad.addColorStop(1, '#9333EA');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(padX, padY, boxW, boxH, 10);
      ctx.fill();

      ctx.fillStyle = '#FFFFFF';
      ctx.textBaseline = 'middle';
      ctx.fillText(sticker, padX + fontSize * 0.7, padY + boxH / 2 + 1);
      ctx.restore();
    }

    // Render text overlay onto Canvas
    if (overlayText.trim()) {
      ctx.save();
      const fontSize = Math.max(20, Math.round(outW * 0.048));
      ctx.font = `700 ${fontSize}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      let y = outH * 0.85;
      if (overlayPos === 'top') y = outH * 0.16;
      else if (overlayPos === 'center') y = outH * 0.5;

      ctx.shadowColor = 'rgba(0,0,0,0.85)';
      ctx.shadowBlur = 14;
      ctx.fillStyle = overlayColor;
      ctx.fillText(overlayText.trim(), outW / 2, y, outW * 0.88);
      ctx.restore();
    }
  }, [
    sourceImageObj,
    cropAspect,
    resizeScale,
    rotationDeg,
    flipH,
    filterId,
    brightness,
    contrast,
    saturate,
    overlayText,
    overlayColor,
    overlayPos,
    sticker,
  ]);

  if (!profile) return null;

  const myOwnedSpaces = spaces.filter((s) => s.ownerId === profile.uid);

  const handleLoadPhotoIntoStudio = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoError('');
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setSourceImageObj(img);
      setRotationDeg(0);
      setFlipH(false);
      setCropAspect('original');
      setResizeScale(100);
    };
    img.onerror = () => {
      setPhotoError('Unable to decode selected image file.');
    };
    img.src = objectUrl;
    e.target.value = '';
  };

  const exportEditedPhotoUrl = async (): Promise<string> => {
    const canvas = previewCanvasRef.current;
    if (!canvas || !sourceImageObj) {
      throw new Error('Select a photo first.');
    }
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/webp', 0.88)
    );
    if (!blob) throw new Error('Unable to export canvas image.');
    const file = new File([blob], `nexora_studio_${Date.now()}.webp`, { type: 'image/webp' });
    const uploaded = await uploadMediaAsset(file, `posts/${profile.uid}`, ['image']);
    return uploaded.url;
  };

  const handleAttachEditedToPost = async () => {
    setPhotoError('');
    setExportingPhoto(true);
    try {
      const url = await exportEditedPhotoUrl();
      setAttachedPostMediaUrl(url);
      setMode('post');
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'Export failed.');
    } finally {
      setExportingPhoto(false);
    }
  };

  const handlePublishEditedAsStory = async () => {
    setPhotoError('');
    setExportingPhoto(true);
    try {
      const url = await exportEditedPhotoUrl();
      await createStory({
        author: profile,
        type: 'image',
        mediaUrl: url,
        text: overlayText.trim(),
        privacy: 'public',
      });
      onDone('home');
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'Could not publish story.');
    } finally {
      setExportingPhoto(false);
    }
  };

  const handleVibeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setVibeError('');
    setUploadingVibe(true);
    try {
      const res = await uploadMediaAsset(file, `vibes/${profile.uid}`, ['video']);
      setVibeUrl(res.url);
    } catch (err) {
      setVibeError(err instanceof Error ? err.message : 'Video upload failed.');
    } finally {
      setUploadingVibe(false);
      e.target.value = '';
    }
  };

  const handleToggleVoiceover = async () => {
    if (recordingVo && voRecorderRef.current) {
      voRecorderRef.current.stop();
      setRecordingVo(false);
      return;
    }
    setVibeError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      voChunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) voChunksRef.current.push(ev.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(voChunksRef.current, { type: 'audio/webm' });
        try {
          const uploaded = await uploadBlobAsset(
            blob,
            `voiceover_${Date.now()}.webm`,
            `vibes/${profile.uid}/voiceovers`,
            'audio'
          );
          setVoiceoverUrl(uploaded.url);
          if (vibeMusic === 'Original Audio') {
            setVibeMusic('Studio Voiceover Track');
          }
        } catch (err) {
          setVibeError(err instanceof Error ? err.message : 'Voiceover upload failed.');
        }
      };
      voRecorderRef.current = recorder;
      recorder.start();
      setRecordingVo(true);
    } catch {
      setVibeError('Microphone access is needed to record a voiceover.');
    }
  };

  const handlePublishVibe = async () => {
    if (!vibeUrl) return;
    setPublishingVibe(true);
    setVibeError('');
    try {
      await createVibe({
        author: profile,
        videoUrl: vibeUrl,
        thumbnailUrl: vibeThumb,
        caption: vibeCaption || 'New Vibe',
        audioTrack: voiceoverUrl ? `${vibeMusic} + Voiceover` : vibeMusic,
        filterPreset: vibeFilter,
        textOverlay: vibeOverlay,
        trimStart,
        trimEnd,
        duration: Math.max(1, trimEnd - trimStart),
      });
      onDone('vibes');
    } catch (err) {
      setVibeError(err instanceof Error ? err.message : 'Could not publish Vibe.');
    } finally {
      setPublishingVibe(false);
    }
  };

  const handleStoryMediaSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setStoryUploading(true);
    try {
      const res = await uploadMediaAsset(
        file,
        `stories/${profile.uid}`,
        storyMode === 'video' ? ['video'] : ['image']
      );
      setStoryMediaUrl(res.url);
    } finally {
      setStoryUploading(false);
      e.target.value = '';
    }
  };

  const vibeFilterCss =
    vibeFilter === 'violet'
      ? 'saturate(1.25) contrast(1.08) hue-rotate(-8deg)'
      : vibeFilter === 'cinema'
      ? 'contrast(1.18) brightness(0.95) saturate(1.12)'
      : vibeFilter === 'noir'
      ? 'grayscale(1) contrast(1.25)'
      : 'none';

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-bold text-white">Create Studio</h1>
          <p className="text-sm text-[#94A3B8]">
            Create posts, polls, community threads, edited photography, Stories, and Vibes.
          </p>
        </div>
      </div>

      {/* Mode Switcher */}
      <div className="flex flex-wrap items-center gap-1.5 p-1.5 bg-[#0D0B16] border border-[#8B5CF6]/20 rounded-2xl">
        {[
          { id: 'post', label: 'Post, Poll & Community', icon: Type },
          { id: 'photo-editor', label: 'Photo Studio', icon: Sliders },
          { id: 'vibe', label: 'Video & Vibes Studio', icon: Film },
          { id: 'story', label: '24h Story', icon: Layers },
          { id: 'covers', label: 'Cover & Thumbnail Editor', icon: ImageIcon },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setMode(tab.id as StudioMode)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
                mode === tab.id
                  ? 'bg-gradient-to-r from-[#6D28D9] via-[#7C3AED] to-[#9333EA] text-white shadow-[0_4px_16px_rgba(124,58,237,0.35)]'
                  : 'text-[#94A3B8] hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <Icon size={14} /> {tab.label}
            </button>
          );
        })}
      </div>

      {/* 1. Post, Poll & Community */}
      {mode === 'post' && (
        <div className="max-w-3xl space-y-4">
          <PostComposer
            spaces={spaces}
            initialMediaUrl={attachedPostMediaUrl}
            initialMediaType="image"
            onCreated={() => {
              setAttachedPostMediaUrl('');
              onDone('home');
            }}
          />
          <div className="p-4 rounded-2xl bg-[#0D0B16] border border-[#8B5CF6]/15 flex items-center gap-3 text-xs text-[#94A3B8]">
            <BarChart2 size={16} className="text-[#C084FC] shrink-0" />
            <span>
              Choose <strong className="text-white">Space</strong> in the audience dropdown to publish directly to a community, or edit photos in Photo Studio and attach them cleanly.
            </span>
          </div>
        </div>
      )}

      {/* 2. Canvas Photo Studio */}
      {mode === 'photo-editor' && (
        <div className="p-6 rounded-2xl bg-[#0D0B16] border border-[#8B5CF6]/20 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-base font-semibold text-white">
                Canvas Photo & Graphic Studio
              </h2>
              <p className="text-xs text-[#94A3B8]">
                Crop, resize, rotate, color-grade, add text overlays or stickers, and attach directly to a post or story.
              </p>
            </div>
            <input
              ref={editorFileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleLoadPhotoIntoStudio}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => editorFileRef.current?.click()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#08070F] hover:bg-[#7C3AED]/15 border border-[#8B5CF6]/30 text-xs font-semibold text-white"
            >
              <Upload size={14} className="text-[#C084FC]" />
              {sourceImageObj ? 'Replace Photo' : 'Upload Photo'}
            </button>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
            {/* Live Canvas Preview */}
            <div className="xl:col-span-7 space-y-3">
              <div className="min-h-[380px] rounded-2xl bg-[#06060A] border border-white/10 flex items-center justify-center p-4 overflow-hidden">
                {sourceImageObj ? (
                  <canvas
                    ref={previewCanvasRef}
                    className="max-w-full max-h-[460px] rounded-xl shadow-2xl object-contain"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => editorFileRef.current?.click()}
                    className="flex flex-col items-center gap-2 text-xs text-[#94A3B8] hover:text-white py-16 px-8"
                  >
                    <ImageIcon size={32} className="text-[#8B5CF6]" />
                    <span>Click to open a photo in Nexora Studio</span>
                  </button>
                )}
              </div>

              {sourceImageObj && (
                <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[#94A3B8]">
                  <span className="font-mono-tabular">
                    Output: {canvasDims.w} × {canvasDims.h} px
                  </span>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <button
                      type="button"
                      disabled={exportingPhoto}
                      onClick={handlePublishEditedAsStory}
                      className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-xs font-semibold text-white"
                    >
                      {exportingPhoto ? 'Exporting...' : 'Publish to Story'}
                    </button>
                    <button
                      type="button"
                      disabled={exportingPhoto}
                      onClick={handleAttachEditedToPost}
                      className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-gradient-to-r from-[#6D28D9] via-[#7C3AED] to-[#9333EA] text-xs font-semibold text-white"
                    >
                      <Check size={14} />
                      {exportingPhoto ? 'Processing...' : 'Attach to Post'}
                    </button>
                  </div>
                </div>
              )}
              {photoError && <p className="text-xs text-rose-400">{photoError}</p>}
            </div>

            {/* Editing Controls */}
            <div className="xl:col-span-5 space-y-5 bg-[#08070F] border border-[#8B5CF6]/15 rounded-2xl p-5">
              {/* Crop & Transform */}
              <div className="space-y-2.5">
                <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                  <Crop size={14} className="text-[#C084FC]" /> Crop & Orientation
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {(['original', '1:1', '4:5', '16:9', '9:16'] as CropAspect[]).map((ratio) => (
                    <button
                      key={ratio}
                      type="button"
                      onClick={() => setCropAspect(ratio)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        cropAspect === ratio
                          ? 'bg-[#7C3AED] border-[#8B5CF6] text-white'
                          : 'bg-[#0D0B16] border-white/10 text-[#94A3B8] hover:text-white'
                      }`}
                    >
                      {ratio === 'original' ? 'Original' : ratio}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setRotationDeg((r) => r - 90)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#0D0B16] border border-white/10 text-xs text-[#CBD5E1] hover:text-white"
                  >
                    <RotateCcw size={13} /> -90°
                  </button>
                  <button
                    type="button"
                    onClick={() => setRotationDeg((r) => r + 90)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#0D0B16] border border-white/10 text-xs text-[#CBD5E1] hover:text-white"
                  >
                    <RotateCw size={13} /> +90°
                  </button>
                  <button
                    type="button"
                    onClick={() => setFlipH((f) => !f)}
                    className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs ${
                      flipH
                        ? 'bg-[#7C3AED]/20 border-[#8B5CF6] text-white'
                        : 'bg-[#0D0B16] border-white/10 text-[#CBD5E1]'
                    }`}
                  >
                    <FlipHorizontal2 size={13} /> Flip
                  </button>
                </div>
              </div>

              {/* Resize Scale */}
              <label className="block space-y-1.5">
                <span className="flex justify-between text-xs text-[#CBD5E1]">
                  <span>Resize Output Scale</span>
                  <span className="font-mono-tabular">{resizeScale}%</span>
                </span>
                <input
                  type="range"
                  min={50}
                  max={100}
                  value={resizeScale}
                  onChange={(e) => setResizeScale(Number(e.target.value))}
                  className="w-full accent-[#7C3AED]"
                />
              </label>

              {/* Filter Presets & Grading */}
              <div className="space-y-2.5">
                <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                  <Sparkles size={14} className="text-[#C084FC]" /> Color Filters
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {FILTER_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setFilterId(p.id);
                        setBrightness(p.brightness);
                        setContrast(p.contrast);
                        setSaturate(p.saturate);
                      }}
                      className={`px-3 py-2 rounded-xl text-xs font-medium border text-left transition-colors ${
                        filterId === p.id
                          ? 'bg-[#7C3AED]/25 border-[#8B5CF6] text-white'
                          : 'bg-[#0D0B16] border-white/10 text-[#94A3B8] hover:text-white'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-3 pt-1">
                  <label className="space-y-1">
                    <span className="text-[11px] text-[#94A3B8] flex justify-between">
                      Bright <span className="font-mono-tabular">{brightness}%</span>
                    </span>
                    <input
                      type="range"
                      min={60}
                      max={140}
                      value={brightness}
                      onChange={(e) => setBrightness(Number(e.target.value))}
                      className="w-full accent-[#7C3AED]"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[11px] text-[#94A3B8] flex justify-between">
                      Contrast <span className="font-mono-tabular">{contrast}%</span>
                    </span>
                    <input
                      type="range"
                      min={60}
                      max={150}
                      value={contrast}
                      onChange={(e) => setContrast(Number(e.target.value))}
                      className="w-full accent-[#7C3AED]"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[11px] text-[#94A3B8] flex justify-between">
                      Sat <span className="font-mono-tabular">{saturate}%</span>
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={160}
                      value={saturate}
                      onChange={(e) => setSaturate(Number(e.target.value))}
                      className="w-full accent-[#7C3AED]"
                    />
                  </label>
                </div>
              </div>

              {/* Text Overlay */}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                  <Type size={14} className="text-[#C084FC]" /> Text Overlay
                </span>
                <input
                  type="text"
                  maxLength={60}
                  value={overlayText}
                  onChange={(e) => setOverlayText(e.target.value)}
                  placeholder="Add headline or watermark..."
                  className="w-full px-3.5 py-2 rounded-xl bg-[#0D0B16] border border-[#8B5CF6]/20 text-xs text-white outline-none"
                />
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    {['#FFFFFF', '#C084FC', '#38BDF8', '#FACC15'].map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setOverlayColor(c)}
                        style={{ backgroundColor: c }}
                        className={`w-5 h-5 rounded-full border ${
                          overlayColor === c ? 'border-white scale-110' : 'border-black/40'
                        }`}
                        aria-label={`Text color ${c}`}
                      />
                    ))}
                  </div>
                  <div className="flex items-center gap-1">
                    {(['top', 'center', 'bottom'] as const).map((pos) => (
                      <button
                        key={pos}
                        type="button"
                        onClick={() => setOverlayPos(pos)}
                        className={`px-2 py-1 rounded-md text-[11px] capitalize ${
                          overlayPos === pos ? 'bg-[#7C3AED] text-white' : 'text-[#94A3B8]'
                        }`}
                      >
                        {pos}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Stickers */}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                  <Sticker size={14} className="text-[#C084FC]" /> Studio Stamp Sticker
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {(['none', 'NEXORA', 'VIBES', 'STUDIO', 'LIVE'] as StickerKind[]).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setSticker(st)}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold border ${
                        sticker === st
                          ? 'bg-[#7C3AED] border-[#8B5CF6] text-white'
                          : 'bg-[#0D0B16] border-white/10 text-[#94A3B8]'
                      }`}
                    >
                      {st === 'none' ? 'None' : st}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. Video & Vibes Studio */}
      {mode === 'vibe' && (
        <div className="p-6 rounded-2xl bg-[#0D0B16] border border-[#8B5CF6]/20 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-base font-semibold text-white">
                Video & Vibes Studio
              </h2>
              <p className="text-xs text-[#94A3B8]">
                Upload vertical or horizontal video, trim clips, overlay captions, select music, record voiceovers, and frame thumbnails.
              </p>
            </div>
            <div className="flex items-center gap-2.5">
              <input
                ref={vibeFileRef}
                type="file"
                accept="video/mp4,video/webm,video/quicktime"
                onChange={handleVibeUpload}
                className="hidden"
              />
              <button
                type="button"
                disabled={uploadingVibe}
                onClick={() => vibeFileRef.current?.click()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#08070F] hover:bg-[#7C3AED]/15 border border-[#8B5CF6]/30 text-xs font-semibold text-white"
              >
                <Upload size={14} className="text-[#C084FC]" />
                {uploadingVibe ? 'Uploading...' : vibeUrl ? 'Replace Video' : 'Upload Video'}
              </button>
              <button
                type="button"
                onClick={() => setCoverTarget('vibe-thumb')}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-xs font-medium text-white"
              >
                {vibeThumb ? 'Edit Cover Thumbnail' : 'Set Cover Image'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Live Video Preview */}
            <div className="lg:col-span-5">
              <div className="relative aspect-[9/14] max-h-[460px] mx-auto rounded-2xl overflow-hidden bg-black border border-[#8B5CF6]/25 flex items-center justify-center">
                {vibeUrl ? (
                  <>
                    <video
                      ref={vibeVideoRef}
                      src={vibeUrl}
                      poster={vibeThumb || undefined}
                      controls
                      playsInline
                      style={{ filter: vibeFilterCss }}
                      onLoadedMetadata={(e) => {
                        const dur = Math.max(1, Math.round(e.currentTarget.duration || 30));
                        setVibeDuration(dur);
                        setTrimStart(0);
                        setTrimEnd(dur);
                      }}
                      onTimeUpdate={(e) => {
                        if (e.currentTarget.currentTime >= trimEnd) {
                          e.currentTarget.currentTime = trimStart;
                        }
                      }}
                      className="w-full h-full object-cover"
                    />
                    {vibeOverlay.trim() && (
                      <div className="pointer-events-none absolute inset-x-4 top-10 text-center">
                        <span className="inline-block px-3.5 py-1.5 rounded-xl bg-black/65 backdrop-blur-sm text-sm font-bold text-white">
                          {vibeOverlay}
                        </span>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-[#64748B] px-6 text-center">
                    Upload a video clip to unlock trimming, filters, captions, and voiceover tools.
                  </p>
                )}
              </div>
            </div>

            {/* Video Controls */}
            <div className="lg:col-span-7 space-y-4 bg-[#08070F] border border-[#8B5CF6]/15 rounded-2xl p-5">
              {/* Trimming */}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                  <Scissors size={14} className="text-[#C084FC]" /> Trim Range ({trimStart}s – {trimEnd}s)
                </span>
                <div className="grid grid-cols-2 gap-4">
                  <label className="space-y-1 text-[11px] text-[#94A3B8]">
                    <span>Start ({trimStart}s)</span>
                    <input
                      type="range"
                      min={0}
                      max={Math.max(0, trimEnd - 1)}
                      value={trimStart}
                      onChange={(e) => setTrimStart(Number(e.target.value))}
                      className="w-full accent-[#7C3AED]"
                    />
                  </label>
                  <label className="space-y-1 text-[11px] text-[#94A3B8]">
                    <span>End ({trimEnd}s)</span>
                    <input
                      type="range"
                      min={Math.min(vibeDuration, trimStart + 1)}
                      max={vibeDuration}
                      value={trimEnd}
                      onChange={(e) => setTrimEnd(Number(e.target.value))}
                      className="w-full accent-[#7C3AED]"
                    />
                  </label>
                </div>
              </div>

              {/* Video Filter */}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-white">Visual Grade</span>
                <div className="flex flex-wrap gap-2">
                  {(['none', 'violet', 'cinema', 'noir'] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setVibeFilter(f)}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-medium capitalize border ${
                        vibeFilter === f
                          ? 'bg-[#7C3AED] border-[#8B5CF6] text-white'
                          : 'bg-[#0D0B16] border-white/10 text-[#94A3B8]'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              {/* Captions & Overlay */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="block space-y-1">
                  <span className="text-xs text-[#CBD5E1]">On-Screen Caption Overlay</span>
                  <input
                    type="text"
                    maxLength={80}
                    value={vibeOverlay}
                    onChange={(e) => setVibeOverlay(e.target.value)}
                    placeholder="Title overlay on video..."
                    className="w-full px-3.5 py-2 rounded-xl bg-[#0D0B16] border border-[#8B5CF6]/20 text-xs text-white outline-none"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-xs text-[#CBD5E1] flex items-center gap-1">
                    <Music size={12} className="text-[#C084FC]" /> Music Track
                  </span>
                  <select
                    value={vibeMusic}
                    onChange={(e) => setVibeMusic(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-[#0D0B16] border border-[#8B5CF6]/20 text-xs text-white outline-none"
                  >
                    {VIBE_MUSIC_TRACKS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {/* Voiceover Recorder */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-[#0D0B16] border border-white/10">
                <div className="space-y-0.5">
                  <p className="text-xs font-semibold text-white">Studio Voiceover</p>
                  <p className="text-[11px] text-[#94A3B8]">
                    {voiceoverUrl
                      ? 'Voiceover recorded and attached.'
                      : 'Record a microphone narration track for your Vibe.'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {voiceoverUrl && <audio src={voiceoverUrl} controls className="h-8 max-w-[180px]" />}
                  <button
                    type="button"
                    onClick={handleToggleVoiceover}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold ${
                      recordingVo
                        ? 'bg-rose-600 text-white'
                        : 'bg-[#7C3AED]/20 border border-[#8B5CF6]/40 text-white'
                    }`}
                  >
                    {recordingVo ? <Square size={13} /> : <Mic size={13} />}
                    {recordingVo ? 'Stop Recording' : voiceoverUrl ? 'Re-record' : 'Record Voiceover'}
                  </button>
                </div>
              </div>

              <label className="block space-y-1">
                <span className="text-xs text-[#CBD5E1]">Caption & #Hashtags</span>
                <textarea
                  rows={2}
                  value={vibeCaption}
                  onChange={(e) => setVibeCaption(e.target.value)}
                  placeholder="Write a Vibe description with #hashtags..."
                  className="w-full px-3.5 py-2 rounded-xl bg-[#0D0B16] border border-[#8B5CF6]/20 text-xs text-white outline-none resize-none"
                />
              </label>

              {vibeError && <p className="text-xs text-rose-400">{vibeError}</p>}

              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={!vibeUrl || publishingVibe}
                  onClick={handlePublishVibe}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#6D28D9] via-[#7C3AED] to-[#9333EA] disabled:opacity-40 text-xs font-semibold text-white shadow-[0_4px_18px_rgba(124,58,237,0.35)]"
                >
                  {publishingVibe ? 'Publishing...' : 'Publish to Vibes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. 24h Story */}
      {mode === 'story' && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (storyMode === 'text' && !storyText.trim()) return;
            if (storyMode !== 'text' && !storyMediaUrl) return;
            setStorySaving(true);
            try {
              await createStory({
                author: profile,
                type: storyMode,
                text: storyText,
                mediaUrl: storyMediaUrl,
                bgGradient: storyGradient,
                privacy: storyPrivacy,
              });
              onDone('home');
            } finally {
              setStorySaving(false);
            }
          }}
          className="max-w-2xl p-6 rounded-2xl bg-[#0D0B16] border border-[#8B5CF6]/20 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-white">Create 24-Hour Story</h2>
            <div className="flex items-center gap-1 p-1 rounded-xl bg-[#08070F] border border-white/10">
              {(['text', 'image', 'video'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setStoryMode(t);
                    setStoryMediaUrl('');
                  }}
                  className={`px-3 py-1 rounded-lg text-xs capitalize font-medium ${
                    storyMode === t ? 'bg-[#7C3AED] text-white' : 'text-[#94A3B8]'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {storyMode === 'text' ? (
            <div className="space-y-3">
              <div
                className={`rounded-2xl p-6 min-h-[200px] bg-gradient-to-br ${storyGradient} flex items-center justify-center border border-white/10`}
              >
                <textarea
                  rows={4}
                  value={storyText}
                  onChange={(e) => setStoryText(e.target.value)}
                  placeholder="Share an update for the next 24 hours..."
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
                    aria-label="Story gradient"
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <input
                ref={storyFileRef}
                type="file"
                accept={storyMode === 'video' ? 'video/mp4,video/webm' : 'image/jpeg,image/png,image/webp'}
                onChange={handleStoryMediaSelect}
                className="hidden"
              />
              {storyMediaUrl ? (
                <div className="rounded-xl overflow-hidden border border-white/10 max-h-72 bg-black">
                  {storyMode === 'video' ? (
                    <video src={storyMediaUrl} controls className="w-full max-h-72" />
                  ) : (
                    <img src={storyMediaUrl} alt="Story media" className="w-full max-h-72 object-contain" />
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  disabled={storyUploading}
                  onClick={() => storyFileRef.current?.click()}
                  className="w-full py-12 rounded-xl border border-dashed border-[#8B5CF6]/40 bg-[#08070F] text-sm text-[#94A3B8] hover:text-white"
                >
                  {storyUploading ? 'Uploading...' : `Upload ${storyMode}`}
                </button>
              )}
              <input
                type="text"
                value={storyText}
                onChange={(e) => setStoryText(e.target.value)}
                placeholder="Optional story caption..."
                className="w-full px-4 py-2.5 rounded-xl bg-[#08070F] border border-[#8B5CF6]/20 text-xs text-white outline-none"
              />
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <select
              value={storyPrivacy}
              onChange={(e) => setStoryPrivacy(e.target.value as StoryPrivacy)}
              className="bg-[#08070F] border border-[#8B5CF6]/20 rounded-xl px-3 py-2 text-xs text-white outline-none"
            >
              <option value="public">Everyone</option>
              <option value="followers">Followers</option>
              <option value="close">Close Circle</option>
            </select>
            <button
              type="submit"
              disabled={storySaving || storyUploading}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#6D28D9] to-[#7C3AED] text-xs font-semibold text-white"
            >
              {storySaving ? 'Publishing...' : 'Publish Story'}
            </button>
          </div>
        </form>
      )}

      {/* 5. Cover & Thumbnail Editor */}
      {mode === 'covers' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="p-6 rounded-2xl bg-[#0D0B16] border border-[#8B5CF6]/20 space-y-4">
            <h3 className="font-display text-base font-semibold text-white">
              Personal Profile Cover
            </h3>
            <p className="text-xs text-[#94A3B8]">
              Upload, crop, reposition vertical focal point, preview, and save your profile banner.
            </p>
            <button
              type="button"
              onClick={() => setCoverTarget('profile')}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#6D28D9] to-[#7C3AED] text-xs font-semibold text-white"
            >
              Edit Profile Cover
            </button>
          </div>

          <div className="p-6 rounded-2xl bg-[#0D0B16] border border-[#8B5CF6]/20 space-y-4">
            <h3 className="font-display text-base font-semibold text-white flex items-center gap-2">
              <Compass size={16} className="text-[#C084FC]" /> Community Space Covers
            </h3>
            {myOwnedSpaces.length === 0 ? (
              <p className="text-xs text-[#64748B]">
                Create a Space first to customize its community cover banner.
              </p>
            ) : (
              <div className="space-y-2">
                {myOwnedSpaces.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setSelectedSpaceForCover(s);
                      setCoverTarget('space');
                    }}
                    className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-[#08070F] border border-[#8B5CF6]/20 hover:border-[#8B5CF6] text-xs text-white"
                  >
                    <span>{s.name}</span>
                    <span className="text-[#C084FC]">Edit Cover</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {coverTarget === 'profile' && (
        <CoverEditorModal
          title="Edit Personal Profile Cover"
          initialUrl={profile.coverUrl}
          initialPositionY={profile.coverPositionY}
          uploadFolder={`users/${profile.uid}/cover`}
          onSave={async (url, posY) => {
            await updateUserProfileFields(profile.uid, { coverUrl: url, coverPositionY: posY });
            await refreshUserAndProfile();
            onDone('profile');
          }}
          onClose={() => setCoverTarget(null)}
        />
      )}

      {coverTarget === 'space' && selectedSpaceForCover && (
        <CoverEditorModal
          title={`Edit Cover — ${selectedSpaceForCover.name}`}
          initialUrl={selectedSpaceForCover.coverUrl}
          initialPositionY={selectedSpaceForCover.coverPositionY}
          uploadFolder={`spaces/${selectedSpaceForCover.id}/cover`}
          onSave={async (url, posY) => {
            await updateSpaceCover(selectedSpaceForCover.id, url, posY);
            onDone('spaces');
          }}
          onClose={() => setCoverTarget(null)}
        />
      )}

      {coverTarget === 'vibe-thumb' && (
        <CoverEditorModal
          title="Edit Video Thumbnail"
          initialUrl={vibeThumb || '/src/assets/images/space_cover_sound_1795066815582.jpg'}
          uploadFolder={`vibes/${profile.uid}/thumbs`}
          aspectClass="aspect-[9/14] max-w-xs mx-auto"
          onSave={(url) => {
            setVibeThumb(url);
          }}
          onClose={() => setCoverTarget(null)}
        />
      )}
    </div>
  );
}
