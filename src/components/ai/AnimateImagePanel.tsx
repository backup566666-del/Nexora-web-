import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Download,
  Film,
  Image as ImageIcon,
  Loader2,
  RectangleHorizontal,
  RectangleVertical,
  Sparkles,
  Upload,
} from 'lucide-react';
import {
  animateImageWithGemini,
  base64VideoToBlobUrl,
  fetchGeminiStatus,
  VideoAspectRatio,
} from '../../services/ai/geminiClientService';
import { extractReadableErrorMessage } from '../../services/firebase/errorHandler';

interface AnimateImagePanelProps {
  onSendVideoToVibes?: (blob: Blob, captionHint: string) => Promise<void> | void;
  onSendVideoToStory?: (blob: Blob, captionHint: string) => Promise<void> | void;
}

const ACCEPTED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
type SupportedPhotoMime = (typeof ACCEPTED_MIME_TYPES)[number];

const MOTION_PRESETS = [
  'Gentle parallax push-in with soft ambient lighting movement',
  'Natural wind drifting through hair and fabric while camera glides slowly',
  'Smooth cinematic orbital pan around the main subject',
  'Crisp atmospheric shimmer with subtle reflections and steady framing',
];

export function AnimateImagePanel({
  onSendVideoToVibes,
  onSendVideoToStory,
}: AnimateImagePanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string>('');
  const [photoBase64, setPhotoBase64] = useState<string>('');
  const [photoMime, setPhotoMime] = useState<SupportedPhotoMime>('image/jpeg');
  const [photoName, setPhotoName] = useState<string>('');
  const [aspectRatio, setAspectRatio] = useState<VideoAspectRatio>('16:9');
  const [motionPrompt, setMotionPrompt] = useState<string>(MOTION_PRESETS[0]);
  const [generating, setGenerating] = useState<boolean>(false);
  const [forwardingTarget, setForwardingTarget] = useState<'vibes' | 'story' | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [serverConfigured, setServerConfigured] = useState<boolean | null>(null);

  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string>('');
  const [generatedVideoBlob, setGeneratedVideoBlob] = useState<Blob | null>(null);
  const [generatedAspect, setGeneratedAspect] = useState<VideoAspectRatio>('16:9');

  const activeBlobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchGeminiStatus()
      .then((status) => {
        if (!cancelled) setServerConfigured(status.configured);
      })
      .catch(() => {
        if (!cancelled) setServerConfigured(null);
      });
    return () => {
      cancelled = true;
      if (activeBlobUrlRef.current) {
        URL.revokeObjectURL(activeBlobUrlRef.current);
      }
    };
  }, []);

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const normalizedType = file.type.toLowerCase();
    if (!(ACCEPTED_MIME_TYPES as readonly string[]).includes(normalizedType)) {
      setErrorMsg('Please choose a PNG, JPEG, or WebP photo.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setErrorMsg('Please choose a photo smaller than 10 MB.');
      return;
    }

    setErrorMsg('');
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const commaIdx = dataUrl.indexOf(',');
      if (commaIdx === -1) {
        setErrorMsg('Unable to read that image file. Please try another photo.');
        return;
      }
      setPhotoPreviewUrl(dataUrl);
      setPhotoBase64(dataUrl.slice(commaIdx + 1));
      setPhotoMime(normalizedType as SupportedPhotoMime);
      setPhotoName(file.name);
    };
    reader.onerror = () => {
      setErrorMsg('Could not read the selected photo.');
    };
    reader.readAsDataURL(file);
  };

  const handleGenerateVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!photoBase64) {
      setErrorMsg('Please upload a photo first.');
      return;
    }
    if (generating) return;

    setErrorMsg('');
    setGenerating(true);

    try {
      const result = await animateImageWithGemini({
        imageBase64: photoBase64,
        mimeType: photoMime,
        prompt: motionPrompt.trim() || MOTION_PRESETS[0],
        aspectRatio,
      });

      if (activeBlobUrlRef.current) {
        URL.revokeObjectURL(activeBlobUrlRef.current);
        activeBlobUrlRef.current = null;
      }

      if (result.videoBase64) {
        const { blob, url } = base64VideoToBlobUrl(result.videoBase64, result.mimeType);
        activeBlobUrlRef.current = url;
        setGeneratedVideoBlob(blob);
        setGeneratedVideoUrl(url);
        setGeneratedAspect(result.aspectRatio);
      } else if (result.videoUri) {
        setGeneratedVideoBlob(null);
        setGeneratedVideoUrl(result.videoUri);
        setGeneratedAspect(result.aspectRatio);
      } else {
        setErrorMsg('Video generation completed without a playable video output.');
      }
    } catch (err) {
      setErrorMsg(
        extractReadableErrorMessage(
          err,
          'Unable to animate your photo right now. Please try again.',
          { feature: 'animate-image' }
        )
      );
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = () => {
    if (!generatedVideoUrl) return;
    const anchor = document.createElement('a');
    anchor.href = generatedVideoUrl;
    anchor.download = `nexora-animated-${generatedAspect.replace(':', 'x')}.mp4`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  };

  const handleForwardVideo = async (target: 'vibes' | 'story') => {
    if (!generatedVideoBlob) return;
    setErrorMsg('');
    setForwardingTarget(target);
    try {
      if (target === 'vibes' && onSendVideoToVibes) {
        await onSendVideoToVibes(generatedVideoBlob, motionPrompt);
      } else if (target === 'story' && onSendVideoToStory) {
        await onSendVideoToStory(generatedVideoBlob, motionPrompt);
      }
    } catch (err) {
      setErrorMsg(
        extractReadableErrorMessage(err, 'Unable to send animated clip right now.', {
          feature: 'animate-image-forward',
        })
      );
    } finally {
      setForwardingTarget(null);
    }
  };

  return (
    <div className="p-5 sm:p-6 rounded-2xl bg-[#0D0B16] border border-[#8B5CF6]/20 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#C084FC]">
            <Film size={14} />
            <span>Gemini Omni 1.2 Flash · Image-to-Video</span>
          </div>
          <h2 className="font-display text-lg font-bold text-white">Animate Photo into Video</h2>
          <p className="text-xs text-[#94A3B8]">
            Upload any PNG, JPEG, or WebP photo, choose landscape (16:9) or portrait (9:16), and describe the motion.
          </p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={handleFileSelected}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#08070F] hover:bg-[#7C3AED]/15 border border-[#8B5CF6]/35 text-xs font-semibold text-white"
        >
          <Upload size={14} className="text-[#C084FC]" />
          <span>{photoPreviewUrl ? 'Change Photo' : 'Upload Photo'}</span>
        </button>
      </div>

      {serverConfigured === false && (
        <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-100">
          <AlertCircle size={15} className="text-amber-300 shrink-0 mt-0.5" />
          <p className="leading-snug">
            Server AI configuration is not active yet. Add a billing-enabled Gemini API key in AI Studio Settings &gt; Secrets to generate animated videos.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left: Controls & Source Photo */}
        <form onSubmit={handleGenerateVideo} className="xl:col-span-5 space-y-5">
          {/* Source Image Dropzone / Preview */}
          <div className="rounded-2xl bg-[#08070F] border border-white/10 p-4 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-white">Source Photo</span>
              {photoName && <span className="text-[11px] text-[#94A3B8] truncate max-w-[180px]">{photoName}</span>}
            </div>

            {photoPreviewUrl ? (
              <div className="relative rounded-xl overflow-hidden bg-black/50 border border-white/10 flex items-center justify-center max-h-64">
                <img
                  src={photoPreviewUrl}
                  alt="Selected source to animate"
                  className="max-h-64 w-auto object-contain"
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-12 px-4 rounded-xl border border-dashed border-[#8B5CF6]/35 hover:border-[#8B5CF6] bg-[#0D0B16] flex flex-col items-center justify-center gap-2 text-xs text-[#94A3B8] hover:text-white transition-colors"
              >
                <ImageIcon size={28} className="text-[#A855F7]" />
                <span>Click to upload a photo (PNG, JPEG, or WebP)</span>
              </button>
            )}
          </div>

          {/* Aspect Ratio Toggle: 16:9 or 9:16 */}
          <div className="space-y-2">
            <span className="text-xs font-semibold text-white">Output Aspect Ratio</span>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setAspectRatio('16:9')}
                className={`flex items-center justify-center gap-2 py-3 px-3 rounded-xl border text-xs font-semibold transition-all ${
                  aspectRatio === '16:9'
                    ? 'bg-gradient-to-r from-[#6D28D9] to-[#7C3AED] border-[#8B5CF6] text-white'
                    : 'bg-[#08070F] border-white/10 text-[#94A3B8] hover:text-white'
                }`}
              >
                <RectangleHorizontal size={16} />
                <span>16:9 Landscape</span>
              </button>
              <button
                type="button"
                onClick={() => setAspectRatio('9:16')}
                className={`flex items-center justify-center gap-2 py-3 px-3 rounded-xl border text-xs font-semibold transition-all ${
                  aspectRatio === '9:16'
                    ? 'bg-gradient-to-r from-[#6D28D9] to-[#7C3AED] border-[#8B5CF6] text-white'
                    : 'bg-[#08070F] border-white/10 text-[#94A3B8] hover:text-white'
                }`}
              >
                <RectangleVertical size={16} />
                <span>9:16 Portrait</span>
              </button>
            </div>
          </div>

          {/* Motion Prompt */}
          <div className="space-y-2">
            <label htmlFor="animate-motion-prompt" className="text-xs font-semibold text-white">
              Animation & Motion Prompt
            </label>
            <textarea
              id="animate-motion-prompt"
              rows={3}
              maxLength={2000}
              value={motionPrompt}
              onChange={(e) => setMotionPrompt(e.target.value)}
              placeholder="Describe camera movement, subject motion, and atmosphere..."
              className="w-full rounded-xl bg-[#08070F] border border-[#8B5CF6]/25 focus:border-[#8B5CF6] px-3.5 py-2.5 text-xs text-white placeholder:text-[#64748B] outline-none resize-y"
            />
            <div className="flex flex-wrap gap-1.5">
              {MOTION_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setMotionPrompt(preset)}
                  className="px-2.5 py-1 rounded-lg bg-[#08070F] border border-white/10 hover:border-[#8B5CF6]/40 text-[11px] text-[#94A3B8] hover:text-white transition-colors text-left"
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          {errorMsg && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-200">
              <AlertCircle size={15} className="text-rose-400 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={generating || !photoBase64}
            className="w-full min-h-[44px] px-5 py-3 rounded-xl bg-gradient-to-r from-[#6D28D9] via-[#7C3AED] to-[#9333EA] hover:brightness-110 disabled:opacity-45 text-xs sm:text-sm font-semibold text-white inline-flex items-center justify-center gap-2 shadow-[0_6px_22px_rgba(124,58,237,0.35)]"
          >
            {generating ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Animating Photo ({aspectRatio})...</span>
              </>
            ) : (
              <>
                <Sparkles size={16} />
                <span>Generate Animated Video ({aspectRatio})</span>
              </>
            )}
          </button>
        </form>

        {/* Right: Generated Video Output */}
        <div className="xl:col-span-7 rounded-2xl bg-[#08070F] border border-white/10 p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-white">Generated Video Preview</span>
            {generatedVideoUrl && (
              <span className="text-[11px] font-mono-tabular px-2 py-0.5 rounded-md bg-[#7C3AED]/20 border border-[#8B5CF6]/35 text-[#E9D5FF]">
                {generatedAspect}
              </span>
            )}
          </div>

          <div
            className={`mx-auto rounded-2xl overflow-hidden bg-black border border-[#8B5CF6]/20 flex items-center justify-center ${
              (generatedVideoUrl ? generatedAspect : aspectRatio) === '9:16'
                ? 'aspect-[9/16] max-h-[460px]'
                : 'aspect-video w-full max-h-[460px]'
            }`}
          >
            {generating ? (
              <div className="flex flex-col items-center gap-3 p-6 text-center">
                <Loader2 size={28} className="animate-spin text-[#A855F7]" />
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-white">
                    Rendering video with Gemini Omni 1.2 Flash
                  </p>
                  <p className="text-[11px] text-[#94A3B8]">
                    This usually takes under a minute depending on motion complexity.
                  </p>
                </div>
              </div>
            ) : generatedVideoUrl ? (
              <video
                src={generatedVideoUrl}
                controls
                autoPlay
                loop
                playsInline
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="flex flex-col items-center gap-2 p-8 text-center">
                <Film size={30} className="text-[#64748B]" />
                <p className="text-xs text-[#94A3B8]">
                  Your animated {aspectRatio} video will appear here after generation.
                </p>
              </div>
            )}
          </div>

          {generatedVideoUrl && (
            <div className="flex flex-wrap items-center justify-end gap-2.5 pt-1">
              <button
                type="button"
                onClick={handleDownload}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-semibold text-white"
              >
                <Download size={14} />
                <span>Download MP4</span>
              </button>

              {generatedVideoBlob && onSendVideoToStory && (
                <button
                  type="button"
                  disabled={forwardingTarget !== null}
                  onClick={() => void handleForwardVideo('story')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#120F1F] hover:bg-[#7C3AED]/20 border border-[#8B5CF6]/35 text-xs font-semibold text-[#E9D5FF]"
                >
                  {forwardingTarget === 'story' ? 'Preparing...' : 'Use in 24h Story'}
                </button>
              )}

              {generatedVideoBlob && onSendVideoToVibes && (
                <button
                  type="button"
                  disabled={forwardingTarget !== null}
                  onClick={() => void handleForwardVideo('vibes')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-[#6D28D9] to-[#7C3AED] text-xs font-semibold text-white"
                >
                  {forwardingTarget === 'vibes' ? 'Preparing...' : 'Send to Vibes Studio'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
