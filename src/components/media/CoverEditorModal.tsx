import React, { useEffect, useRef, useState } from 'react';
import { Check, MoveVertical, Upload, X, ZoomIn } from 'lucide-react';
import { resolveAssetUrl } from '../../assets/defaultAssets';
import { extractReadableErrorMessage } from '../../services/firebase/errorHandler';
import { uploadMediaAsset } from '../../services/storage/mediaUploadService';
import { ResilientImage } from '../common/ResilientImage';

interface CoverEditorModalProps {
  title: string;
  initialUrl: string;
  initialPositionY?: number;
  uploadFolder: string;
  aspectClass?: string;
  onSave: (url: string, positionY: number) => Promise<void> | void;
  onClose: () => void;
}

const DEFAULT_COVER_PATH = '/src/assets/images/space_cover_code_1795066815138.jpg';

export function CoverEditorModal({
  title,
  initialUrl,
  initialPositionY = 50,
  uploadFolder,
  aspectClass = 'aspect-[16/5]',
  onSave,
  onClose,
}: CoverEditorModalProps) {
  const [imageUrl, setImageUrl] = useState(initialUrl || DEFAULT_COVER_PATH);
  const [positionY, setPositionY] = useState(initialPositionY);
  const [zoom, setZoom] = useState(1);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setImageUrl(initialUrl || DEFAULT_COVER_PATH);
    setPositionY(initialPositionY);
  }, [initialUrl, initialPositionY]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setUploading(true);
    try {
      const result = await uploadMediaAsset(file, uploadFolder, ['image']);
      setImageUrl(result.url);
      setPositionY(50);
      setZoom(1);
    } catch (err) {
      setError(extractReadableErrorMessage(err, 'Unable to process image.'));
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      await onSave(imageUrl || DEFAULT_COVER_PATH, positionY);
      onClose();
    } catch (err) {
      setError(extractReadableErrorMessage(err, 'Failed to save cover changes.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-3xl bg-[#0D0D14] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 className="font-display text-lg font-semibold text-white">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-[#94A3B8] hover:text-white hover:bg-white/5 transition-colors"
            aria-label="Close cover editor"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div
            className={`relative w-full ${aspectClass} rounded-xl overflow-hidden border border-white/10 bg-[#06060A]`}
          >
            <ResilientImage
              src={resolveAssetUrl(imageUrl)}
              alt="Cover preview"
              style={{
                objectPosition: `50% ${positionY}%`,
                transform: `scale(${zoom})`,
              }}
              className="w-full h-full object-cover transition-transform duration-150"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <label className="space-y-2 block">
              <span className="flex items-center justify-between text-xs font-medium text-[#CBD5E1]">
                <span className="inline-flex items-center gap-1.5">
                  <MoveVertical size={14} className="text-[#8B5CF6]" />
                  Reposition Vertical Focus
                </span>
                <span className="font-mono-tabular text-[#94A3B8]">{positionY}%</span>
              </span>
              <input
                type="range"
                min={0}
                max={100}
                value={positionY}
                onChange={(e) => setPositionY(Number(e.target.value))}
                className="w-full accent-[#7C3AED]"
              />
            </label>

            <label className="space-y-2 block">
              <span className="flex items-center justify-between text-xs font-medium text-[#CBD5E1]">
                <span className="inline-flex items-center gap-1.5">
                  <ZoomIn size={14} className="text-[#8B5CF6]" />
                  Crop & Framing Scale
                </span>
                <span className="font-mono-tabular text-[#94A3B8]">{zoom.toFixed(2)}x</span>
              </span>
              <input
                type="range"
                min={1}
                max={1.6}
                step={0.05}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="w-full accent-[#7C3AED]"
              />
            </label>
          </div>

          {error && (
            <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/10">
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={handleFileChange}
                className="hidden"
              />
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-sm font-medium text-white transition-colors whitespace-nowrap"
              >
                <Upload size={15} />
                {uploading ? 'Uploading...' : 'Upload or Replace Image'}
              </button>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-sm font-medium text-[#94A3B8] hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving || uploading}
                onClick={handleSave}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] disabled:opacity-50 text-sm font-medium text-white transition-colors whitespace-nowrap"
              >
                <Check size={15} />
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
