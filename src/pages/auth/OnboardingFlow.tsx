import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, Camera, Check, Image as ImageIcon, SkipForward } from 'lucide-react';
import { NexoraLogo } from '../../components/branding/NexoraLogo';
import { ResilientImage } from '../../components/common/ResilientImage';
import { CoverEditorModal } from '../../components/media/CoverEditorModal';
import { useAuth } from '../../hooks/useAuth';
import {
  isUsernameAvailable,
  updateUserProfileFields,
} from '../../services/auth/authService';
import { extractReadableErrorMessage } from '../../services/firebase/errorHandler';
import { uploadMediaAsset } from '../../services/storage/mediaUploadService';
import { isValidUsername, normalizeUsername } from '../../utils/validation';

const INTEREST_OPTIONS = [
  'Spatial Design',
  'Music & Synthesis',
  'Filmmaking',
  'Software Craft',
  'Photography',
  'Architecture',
  'Digital Art',
  'Gaming',
  'Science',
  'Entrepreneurship',
];

export function OnboardingFlow() {
  const { profile, refreshUserAndProfile } = useAuth();
  const [step, setStep] = useState(1);

  const [avatarUrl, setAvatarUrl] = useState(
    profile?.avatarUrl || '/src/assets/images/avatar_creator_one_1795066815825.jpg'
  );
  const [username, setUsername] = useState(profile?.username || '');
  const [bio, setBio] = useState(profile?.bio || '');
  const [interests, setInterests] = useState<string[]>(profile?.interests || []);
  const [coverUrl, setCoverUrl] = useState(
    profile?.coverUrl || '/src/assets/images/space_cover_code_1795066815138.jpg'
  );
  const [coverPositionY, setCoverPositionY] = useState(profile?.coverPositionY ?? 50);

  const [showCoverEditor, setShowCoverEditor] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!profile) return;
    setAvatarUrl((prev) => prev || profile.avatarUrl || '/src/assets/images/avatar_creator_one_1795066815825.jpg');
    setUsername((prev) => prev || profile.username || '');
    setBio((prev) => prev || profile.bio || '');
    setInterests((prev) => (prev.length > 0 ? prev : profile.interests || []));
    setCoverUrl((prev) => prev || profile.coverUrl || '/src/assets/images/space_cover_code_1795066815138.jpg');
  }, [profile?.uid]);

  if (!profile) return null;

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setUploadingAvatar(true);
    try {
      const res = await uploadMediaAsset(file, `users/${profile.uid}/avatar`, ['image']);
      setAvatarUrl(res.url);
    } catch (err) {
      setError(extractReadableErrorMessage(err, 'Unable to upload avatar.'));
    } finally {
      setUploadingAvatar(false);
      e.target.value = '';
    }
  };

  const toggleInterest = (topic: string) => {
    setInterests((prev) =>
      prev.includes(topic) ? prev.filter((t) => t !== topic) : prev.length < 10 ? [...prev, topic] : prev
    );
  };

  const handleNext = async () => {
    setError('');
    if (step === 2) {
      const clean = normalizeUsername(username);
      if (!isValidUsername(clean)) {
        setError('Please enter a valid username (3-30 lowercase letters, numbers, or underscores).');
        return;
      }
      if (clean !== profile.username) {
        try {
          const available = await isUsernameAvailable(clean, profile.uid);
          if (!available) {
            setError(`@${clean} is already taken.`);
            return;
          }
        } catch (err) {
          setError(extractReadableErrorMessage(err, 'Unable to check username availability right now.'));
          return;
        }
      }
      setUsername(clean);
    }
    if (step < 5) {
      setStep((s) => s + 1);
      return;
    }
    await completeOnboarding();
  };

  const completeOnboarding = async () => {
    setSaving(true);
    setError('');
    try {
      const cleanUsername = normalizeUsername(username) || profile.username;
      if (!isValidUsername(cleanUsername)) {
        throw new Error('Username must be 3-30 characters using lowercase letters, numbers, or underscores.');
      }

      const updates: Parameters<typeof updateUserProfileFields>[1] = {
        onboardingCompleted: true,
      };
      if (avatarUrl && avatarUrl !== profile.avatarUrl) {
        updates.avatarUrl = avatarUrl;
      }
      if (cleanUsername !== profile.username) {
        updates.username = cleanUsername;
      }
      if (bio !== (profile.bio || '')) {
        updates.bio = bio;
      }
      const existingInterests = profile.interests || [];
      if (
        interests.length !== existingInterests.length ||
        interests.some((item, idx) => item !== existingInterests[idx])
      ) {
        updates.interests = interests;
      }
      if (coverUrl && coverUrl !== profile.coverUrl) {
        updates.coverUrl = coverUrl;
      }
      if (coverPositionY !== (profile.coverPositionY ?? 50)) {
        updates.coverPositionY = coverPositionY;
      }

      await updateUserProfileFields(profile.uid, updates, profile.username);
      await refreshUserAndProfile();
    } catch (err) {
      setError(extractReadableErrorMessage(err, 'Could not complete onboarding.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#06060A] text-[#F8FAFC] flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-xl bg-[#0D0D14] border border-white/10 rounded-2xl p-8 space-y-7 shadow-2xl">
        <div className="flex items-center justify-between">
          <NexoraLogo size="sm" />
          <span className="font-mono-tabular text-xs text-[#94A3B8]">Step {step} of 5</span>
        </div>

        {/* Progress Track */}
        <div className="grid grid-cols-5 gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <div
              key={n}
              className={`h-1 rounded-full transition-colors ${
                n <= step ? 'bg-[#8B5CF6]' : 'bg-white/10'
              }`}
            />
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-5">
            <div className="space-y-1">
              <h1 className="font-display text-2xl font-bold text-white">Upload a profile picture</h1>
              <p className="text-sm text-[#94A3B8]">
                Help people recognize you across posts, stories, and Spaces.
              </p>
            </div>
            <div className="flex items-center gap-6">
              <ResilientImage
                src={avatarUrl}
                alt="Profile avatar preview"
                className="w-24 h-24 rounded-2xl object-cover border border-white/15"
              />
              <div className="space-y-2">
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={handleAvatarUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  disabled={uploadingAvatar}
                  onClick={() => avatarInputRef.current?.click()}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-sm font-medium text-white"
                >
                  <Camera size={16} />
                  {uploadingAvatar ? 'Uploading...' : 'Choose Photo'}
                </button>
                <p className="text-xs text-[#64748B]">PNG, JPG, or WebP up to 20 MB.</p>
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="space-y-1">
              <h1 className="font-display text-2xl font-bold text-white">Choose your username</h1>
              <p className="text-sm text-[#94A3B8]">
                Your unique @handle across Nexora.
              </p>
            </div>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-[#CBD5E1]">Username</span>
              <div className="flex items-center rounded-xl bg-[#06060A] border border-white/10 focus-within:border-[#8B5CF6] px-4">
                <span className="text-[#64748B] text-sm mr-1">@</span>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(normalizeUsername(e.target.value))}
                  className="w-full py-3 bg-transparent outline-none text-sm text-white"
                  placeholder="your_handle"
                />
              </div>
            </label>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div className="space-y-1">
              <h1 className="font-display text-2xl font-bold text-white">Write your biography</h1>
              <p className="text-sm text-[#94A3B8]">
                Share what you create, explore, or care about.
              </p>
            </div>
            <textarea
              rows={4}
              maxLength={400}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Designer, sound explorer, and founder building..."
              className="w-full p-4 rounded-xl bg-[#06060A] border border-white/10 focus:border-[#8B5CF6] outline-none text-sm text-white resize-none"
            />
            <p className="text-right font-mono-tabular text-xs text-[#64748B]">
              {bio.length} / 400
            </p>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <div className="space-y-1">
              <h1 className="font-display text-2xl font-bold text-white">Choose your interests</h1>
              <p className="text-sm text-[#94A3B8]">
                Select up to 10 topics to personalize Spaces and Vibes discovery.
              </p>
            </div>
            <div className="flex flex-wrap gap-2.5">
              {INTEREST_OPTIONS.map((topic) => {
                const selected = interests.includes(topic);
                return (
                  <button
                    key={topic}
                    type="button"
                    onClick={() => toggleInterest(topic)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-medium border transition-colors ${
                      selected
                        ? 'bg-[#7C3AED] border-[#8B5CF6] text-white'
                        : 'bg-[#06060A] border-white/10 text-[#CBD5E1] hover:border-white/25'
                    }`}
                  >
                    {topic}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-5">
            <div className="space-y-1">
              <h1 className="font-display text-2xl font-bold text-white">Add a profile cover image</h1>
              <p className="text-sm text-[#94A3B8]">
                Frame your profile header with custom positioning.
              </p>
            </div>
            <div className="relative aspect-[16/5] rounded-xl overflow-hidden border border-white/10">
              <ResilientImage
                src={coverUrl}
                alt="Cover preview"
                style={{ objectPosition: `50% ${coverPositionY}%` }}
                className="w-full h-full object-cover"
              />
            </div>
            <button
              type="button"
              onClick={() => setShowCoverEditor(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-sm font-medium text-white"
            >
              <ImageIcon size={16} /> Customize Cover Image
            </button>
          </div>
        )}

        {error && (
          <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3.5 py-2.5">
            {error}
          </p>
        )}

        <div className="flex items-center justify-between pt-3 border-t border-white/10">
          {step !== 2 ? (
            <button
              type="button"
              disabled={saving}
              onClick={() => (step < 5 ? setStep((s) => s + 1) : completeOnboarding())}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[#94A3B8] hover:text-white"
            >
              <SkipForward size={14} /> Skip step
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-3">
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                className="px-4 py-2 text-sm text-[#94A3B8] hover:text-white"
              >
                Back
              </button>
            )}
            <button
              type="button"
              disabled={saving}
              onClick={handleNext}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-sm font-semibold transition-colors"
            >
              {step === 5 ? (
                <>
                  <Check size={16} />
                  {saving ? 'Entering Nexora...' : 'Enter Nexora Home'}
                </>
              ) : (
                <>
                  Continue
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {showCoverEditor && (
        <CoverEditorModal
          title="Edit Profile Cover"
          initialUrl={coverUrl}
          initialPositionY={coverPositionY}
          uploadFolder={`users/${profile.uid}/cover`}
          onSave={(url, posY) => {
            setCoverUrl(url);
            setCoverPositionY(posY);
          }}
          onClose={() => setShowCoverEditor(false)}
        />
      )}
    </div>
  );
}
