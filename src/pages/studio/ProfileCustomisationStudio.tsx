import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Crown,
  ImagePlus,
  Lock,
  Palette,
  RotateCcw,
  Save,
  Sparkles,
  Wand2,
  X,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import {
  CustomisationCategory,
  CustomisationItem,
  NavSection,
  ProfileCustomisation,
  SubscriptionTier,
} from '../../types/nexora';
import {
  canAccessTier,
  DEFAULT_CUSTOMISATION_CATALOG,
  DEFAULT_PROFILE_CUSTOMISATION,
  sanitizeProfileCustomisation,
} from '../../utils/validation';
import {
  resetUserProfileCustomisation,
  saveUserProfileCustomisation,
} from '../../services/firebase/customisationService';
import { uploadMediaAsset } from '../../services/storage/mediaUploadService';
import { extractReadableErrorMessage } from '../../services/firebase/errorHandler';
import { FriendlyErrorBanner } from '../../components/common/FriendlyErrorBanner';
import { TierBadge } from '../../components/common/TierBadge';
import { BadgeStrip } from '../../components/common/VerifiedBadge';
import { CustomisedAvatar } from '../../components/profile/CustomisedAvatar';
import {
  ProfileEffectLayer,
  resolveBannerBackground,
  resolveGradientStyle,
} from '../../components/profile/ProfileEffectLayer';

interface ProfileCustomisationStudioProps {
  onNavigate: (section: NavSection, targetId?: string) => void;
}

const STUDIO_TABS: Array<{ id: CustomisationCategory; label: string }> = [
  { id: 'theme', label: 'Themes' },
  { id: 'background', label: 'Background' },
  { id: 'accent', label: 'Accent' },
  { id: 'gradient', label: 'Gradients' },
  { id: 'banner', label: 'Banners' },
  { id: 'avatar_frame', label: 'Frames' },
  { id: 'static_decoration', label: 'Static Crests' },
  { id: 'animated_decoration', label: 'Animated Rings' },
  { id: 'effect', label: 'Profile Effects' },
  { id: 'layout', label: 'Layouts' },
];

export const ProfileCustomisationStudio: React.FC<ProfileCustomisationStudioProps> = ({
  onNavigate,
}) => {
  const {
    profile,
    effectiveTier,
    customisationCatalog,
    getUserBadges,
  } = useAuth();

  const catalog = useMemo(
    () => (customisationCatalog.length > 0 ? customisationCatalog : DEFAULT_CUSTOMISATION_CATALOG).filter((item) => item.enabled),
    [customisationCatalog]
  );

  const [activeCategory, setActiveCategory] = useState<CustomisationCategory>('theme');
  const [draft, setDraft] = useState<ProfileCustomisation>(() =>
    sanitizeProfileCustomisation(profile?.profileCustomisation, effectiveTier)
  );
  const [saving, setSaving] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [upgradePromptItem, setUpgradePromptItem] = useState<CustomisationItem | null>(null);
  const bannerInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (profile?.profileCustomisation) {
      setDraft(sanitizeProfileCustomisation(profile.profileCustomisation, effectiveTier));
    }
  }, [profile?.profileCustomisation, effectiveTier]);

  if (!profile) return null;

  const selfBadges = getUserBadges(profile.uid, profile.verified);

  const categoryItems = useMemo(
    () => catalog.filter((item) => item.category === activeCategory),
    [catalog, activeCategory]
  );

  const selectedIdForCategory = (cat: CustomisationCategory): string => {
    switch (cat) {
      case 'theme':
        return draft.themeId;
      case 'background':
        return draft.backgroundColor;
      case 'accent':
        return draft.accentColor;
      case 'gradient':
        return draft.gradientId;
      case 'banner':
        return draft.bannerPresetId;
      case 'avatar_frame':
        return draft.avatarFrameId;
      case 'static_decoration':
        return draft.staticDecorationId;
      case 'animated_decoration':
        return draft.animatedDecorationId;
      case 'effect':
        return draft.effectId;
      case 'layout':
        return `layout_${draft.layoutVariant}`;
    }
  };

  const applyCatalogSelection = (item: CustomisationItem) => {
    setErrorMsg(null);
    setStatusMsg(null);
    if (!canAccessTier(effectiveTier, item.requiredTier)) {
      setUpgradePromptItem(item);
      return;
    }

    setDraft((prev) => {
      switch (item.category) {
        case 'theme':
          return {
            ...prev,
            themeId: item.id,
            backgroundColor: item.previewValue.startsWith('#') ? item.previewValue : prev.backgroundColor,
            accentColor: item.secondaryValue?.startsWith('#') ? item.secondaryValue : prev.accentColor,
          };
        case 'background':
          return { ...prev, backgroundColor: item.previewValue };
        case 'accent':
          return { ...prev, accentColor: item.previewValue };
        case 'gradient':
          return { ...prev, gradientId: item.id };
        case 'banner':
          return { ...prev, bannerPresetId: item.id, bannerImageUrl: item.imageUrl || '' };
        case 'avatar_frame':
          return { ...prev, avatarFrameId: item.id };
        case 'static_decoration':
          return { ...prev, staticDecorationId: item.id };
        case 'animated_decoration':
          return { ...prev, animatedDecorationId: item.id };
        case 'effect':
          return { ...prev, effectId: item.id };
        case 'layout': {
          const val = item.previewValue as ProfileCustomisation['layoutVariant'];
          return {
            ...prev,
            layoutVariant:
              val === 'compact' || val === 'spotlight' || val === 'showcase' ? val : 'classic',
          };
        }
      }
    });
  };

  const handleBannerUpload = async (file: File) => {
    if (!canAccessTier(effectiveTier, 'plus')) {
      setUpgradePromptItem({
        id: 'banner_custom_upload',
        category: 'banner',
        name: 'Custom Uploaded Banner',
        description: 'Upload custom artwork or photography for your public Nexora profile banner.',
        requiredTier: 'plus',
        enabled: true,
        previewValue: 'custom_upload',
        sortOrder: 99,
      });
      return;
    }
    setErrorMsg(null);
    setStatusMsg(null);
    setUploadingBanner(true);
    try {
      const uploaded = await uploadMediaAsset(file, `users/${profile.uid}/cover`, ['image']);
      setDraft((prev) => ({ ...prev, bannerImageUrl: uploaded.url }));
      setStatusMsg('Custom banner loaded into live preview. Save Studio Changes to publish.');
    } catch (err) {
      setErrorMsg(extractReadableErrorMessage(err, "We couldn't upload your banner image. Please try again."));
    } finally {
      setUploadingBanner(false);
    }
  };

  const handleSave = async () => {
    setErrorMsg(null);
    setStatusMsg(null);
    setSaving(true);
    try {
      const saved = await saveUserProfileCustomisation({
        uid: profile.uid,
        customisation: draft,
        effectiveTier,
      });
      setDraft(saved);
      setStatusMsg('Your profile studio style is now live for everyone on Nexora.');
    } catch (err) {
      setErrorMsg(extractReadableErrorMessage(err, "We couldn't save your profile style. Please try again."));
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setErrorMsg(null);
    setStatusMsg(null);
    setSaving(true);
    try {
      const defaults = await resetUserProfileCustomisation(profile.uid);
      setDraft(defaults);
      setStatusMsg('Profile styling reset to Nexora defaults.');
    } catch (err) {
      setErrorMsg(extractReadableErrorMessage(err, "We couldn't reset your profile styling. Please try again."));
    } finally {
      setSaving(false);
    }
  };

  const bannerBg = resolveBannerBackground(draft, catalog);
  const gradientBg = resolveGradientStyle(draft, catalog);

  return (
    <div className="space-y-6">
      {/* Studio Header */}
      <section className="rounded-2xl bg-[#0D0B16] border border-[#8B5CF6]/20 p-5 sm:p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-[#7C3AED]/20 border border-[#8B5CF6]/30 flex items-center justify-center text-[#C084FC]">
                <Palette size={18} />
              </div>
              <h1 className="font-display text-xl sm:text-2xl font-bold text-white">
                Nexora Profile Customisation Studio
              </h1>
              <TierBadge tier={effectiveTier} showFree size="sm" />
            </div>
            <p className="text-xs sm:text-sm text-[#94A3B8]">
              Craft your public Nexora identity with original themes, frames, orbital rings, banners, and effects. Everyone visiting your profile sees your saved look.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handleReset()}
              disabled={saving}
              className="min-h-[44px] inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#120F1E] border border-white/10 text-xs font-semibold text-[#CBD5E1] hover:text-white disabled:opacity-50"
            >
              <RotateCcw size={14} /> Reset Default
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-[#6D28D9] to-[#9333EA] text-xs font-semibold text-white shadow-lg shadow-[#7C3AED]/25 disabled:opacity-50"
            >
              <Save size={14} /> {saving ? 'Saving...' : 'Save Studio Style'}
            </button>
          </div>
        </div>
      </section>

      <FriendlyErrorBanner
        message={errorMsg}
        onDismiss={() => setErrorMsg(null)}
        onRetry={() => void handleSave()}
      />

      {statusMsg && (
        <div className="rounded-xl bg-emerald-500/10 border border-emerald-400/30 px-4 py-3 text-xs text-emerald-200 flex items-center justify-between gap-3">
          <span>{statusMsg}</span>
          <button type="button" onClick={() => setStatusMsg(null)} className="text-emerald-300">
            <X size={14} />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Controls Column */}
        <div className="xl:col-span-7 space-y-5">
          {/* Category Tabs */}
          <div className="flex flex-wrap gap-1.5 p-2 rounded-2xl bg-[#0D0B16] border border-[#8B5CF6]/15">
            {STUDIO_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveCategory(tab.id)}
                className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                  activeCategory === tab.id
                    ? 'bg-[#7C3AED] text-white'
                    : 'text-[#94A3B8] hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Item Selector Grid */}
          <section className="rounded-2xl bg-[#0D0B16] border border-[#8B5CF6]/15 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-sm font-semibold text-white">
                {STUDIO_TABS.find((t) => t.id === activeCategory)?.label}
              </h2>
              {activeCategory === 'banner' && (
                <div className="flex items-center gap-2">
                  <input
                    ref={bannerInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleBannerUpload(f);
                      e.target.value = '';
                    }}
                  />
                  <button
                    type="button"
                    disabled={uploadingBanner}
                    onClick={() => bannerInputRef.current?.click()}
                    className="min-h-[38px] inline-flex items-center gap-1.5 px-3 rounded-xl bg-[#120F1E] border border-[#8B5CF6]/30 text-xs font-semibold text-[#E9D5FF] hover:border-[#8B5CF6]"
                  >
                    <ImagePlus size={13} />
                    {uploadingBanner ? 'Uploading...' : 'Upload Banner Image'}
                    {!canAccessTier(effectiveTier, 'plus') && <Lock size={11} className="text-[#C084FC]" />}
                  </button>
                  {draft.bannerImageUrl && (
                    <button
                      type="button"
                      onClick={() => setDraft((prev) => ({ ...prev, bannerImageUrl: '' }))}
                      className="min-h-[38px] px-2.5 rounded-xl bg-white/[0.05] text-xs text-[#94A3B8] hover:text-white"
                    >
                      Clear Upload
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {categoryItems.map((item) => {
                const unlocked = canAccessTier(effectiveTier, item.requiredTier);
                const selectedVal = selectedIdForCategory(item.category);
                const isSelected =
                  item.id === selectedVal ||
                  (item.category === 'background' && item.previewValue.toLowerCase() === selectedVal.toLowerCase()) ||
                  (item.category === 'accent' && item.previewValue.toLowerCase() === selectedVal.toLowerCase()) ||
                  (item.category === 'layout' && item.previewValue === draft.layoutVariant);

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => applyCatalogSelection(item)}
                    className={`p-3.5 rounded-xl border text-left transition-all flex items-start gap-3 ${
                      isSelected
                        ? 'bg-[#7C3AED]/15 border-[#A855F7] shadow-[0_0_20px_rgba(168,85,247,0.18)]'
                        : 'bg-[#120F1E] border-white/10 hover:border-[#8B5CF6]/40'
                    }`}
                  >
                    {/* Visual Swatch */}
                    <div className="w-11 h-11 rounded-xl border border-white/15 shrink-0 overflow-hidden flex items-center justify-center relative bg-[#090712]">
                      {(item.category === 'theme' || item.category === 'background' || item.category === 'accent') && (
                        <span
                          className="w-full h-full block"
                          style={{
                            background:
                              item.secondaryValue
                                ? `linear-gradient(135deg, ${item.previewValue} 45%, ${item.secondaryValue} 100%)`
                                : item.previewValue,
                          }}
                        />
                      )}
                      {(item.category === 'gradient' || item.category === 'banner') && (
                        <span
                          className="w-full h-full block"
                          style={{
                            background:
                              item.previewValue === 'none'
                                ? '#0E0C18'
                                : item.previewValue,
                          }}
                        />
                      )}
                      {(item.category === 'avatar_frame' ||
                        item.category === 'static_decoration' ||
                        item.category === 'animated_decoration' ||
                        item.category === 'effect' ||
                        item.category === 'layout') && (
                        <Sparkles size={16} className={item.requiredTier === 'pro' ? 'text-amber-300' : 'text-[#C084FC]'} />
                      )}
                    </div>

                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center justify-between gap-1.5">
                        <p className="text-xs font-semibold text-white truncate">{item.name}</p>
                        {isSelected ? (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-300 shrink-0">
                            <Check size={11} /> Active
                          </span>
                        ) : !unlocked ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-300 shrink-0">
                            <Lock size={10} /> {item.requiredTier.toUpperCase()}
                          </span>
                        ) : (
                          item.requiredTier !== 'free' && (
                            <span className="text-[10px] font-semibold text-[#C084FC] shrink-0">
                              {item.requiredTier.toUpperCase()}
                            </span>
                          )
                        )}
                      </div>
                      <p className="text-[11px] text-[#94A3B8] leading-snug line-clamp-2">
                        {item.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Direct Hex & Card Surface Controls */}
            <div className="pt-4 border-t border-white/10 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="space-y-1.5 block">
                <span className="text-[11px] font-semibold text-[#CBD5E1] flex items-center justify-between">
                  Custom Background Hex
                  {!canAccessTier(effectiveTier, 'plus') && <Lock size={11} className="text-[#C084FC]" />}
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={draft.backgroundColor}
                    onChange={(e) => {
                      if (!canAccessTier(effectiveTier, 'plus')) {
                        setUpgradePromptItem({
                          id: 'custom_bg_hex',
                          category: 'background',
                          name: 'Custom Background Colour Picker',
                          description: 'Pick any custom dark background hex value for your profile studio.',
                          requiredTier: 'plus',
                          enabled: true,
                          previewValue: e.target.value,
                          sortOrder: 99,
                        });
                        return;
                      }
                      setDraft((prev) => ({ ...prev, backgroundColor: e.target.value }));
                    }}
                    className="w-10 h-10 rounded-lg bg-transparent border border-white/15 cursor-pointer"
                  />
                  <span className="font-mono-tabular text-xs text-[#94A3B8]">{draft.backgroundColor}</span>
                </div>
              </label>

              <label className="space-y-1.5 block">
                <span className="text-[11px] font-semibold text-[#CBD5E1] flex items-center justify-between">
                  Custom Accent Hex
                  {!canAccessTier(effectiveTier, 'plus') && <Lock size={11} className="text-[#C084FC]" />}
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={draft.accentColor}
                    onChange={(e) => {
                      if (!canAccessTier(effectiveTier, 'plus')) {
                        setUpgradePromptItem({
                          id: 'custom_accent_hex',
                          category: 'accent',
                          name: 'Custom Accent Colour Picker',
                          description: 'Personalize borders and interactive profile highlights with your signature colour.',
                          requiredTier: 'plus',
                          enabled: true,
                          previewValue: e.target.value,
                          sortOrder: 99,
                        });
                        return;
                      }
                      setDraft((prev) => ({ ...prev, accentColor: e.target.value }));
                    }}
                    className="w-10 h-10 rounded-lg bg-transparent border border-white/15 cursor-pointer"
                  />
                  <span className="font-mono-tabular text-xs text-[#94A3B8]">{draft.accentColor}</span>
                </div>
              </label>

              <label className="space-y-1.5 block">
                <span className="text-[11px] font-semibold text-[#CBD5E1] flex items-center justify-between">
                  Surface Opacity
                  <span className="font-mono-tabular text-[#C084FC]">{draft.cardOpacity}%</span>
                </span>
                <input
                  type="range"
                  min={60}
                  max={100}
                  value={draft.cardOpacity}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, cardOpacity: Number(e.target.value) }))
                  }
                  className="w-full accent-[#8B5CF6] mt-2"
                />
              </label>
            </div>
          </section>
        </div>

        {/* Sticky Live Profile Card Preview */}
        <aside className="xl:col-span-5 xl:sticky xl:top-24 space-y-4">
          <div className="rounded-2xl bg-[#0D0B16] border border-[#8B5CF6]/20 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                <Wand2 size={14} className="text-[#C084FC]" /> Live Public Profile Preview
              </span>
              <span className="text-[11px] text-[#94A3B8] capitalize">{draft.layoutVariant} layout</span>
            </div>

            <div
              className="relative rounded-2xl overflow-hidden border transition-all"
              style={{
                backgroundColor: draft.backgroundColor,
                borderColor: `${draft.accentColor}55`,
                opacity: (draft.cardOpacity ?? 92) / 100,
              }}
            >
              {gradientBg && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0"
                  style={{ background: gradientBg }}
                />
              )}
              <ProfileEffectLayer effectId={draft.effectId} />

              {/* Banner */}
              <div
                className={`relative w-full ${
                  draft.layoutVariant === 'compact'
                    ? 'h-24'
                    : draft.layoutVariant === 'spotlight' || draft.layoutVariant === 'showcase'
                    ? 'h-40'
                    : 'h-32'
                }`}
                style={{ background: bannerBg.cssBackground }}
              >
                {bannerBg.imageUrl && (
                  <img
                    src={bannerBg.imageUrl}
                    alt="Profile banner preview"
                    className="w-full h-full object-cover"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent" />
              </div>

              {/* Body */}
              <div className="relative p-5 pt-0 space-y-3">
                <div className="-mt-10 flex items-end justify-between gap-3">
                  <CustomisedAvatar
                    src={profile.avatarUrl}
                    alt={profile.displayName}
                    sizeClass={draft.layoutVariant === 'compact' ? 'w-16 h-16' : 'w-20 h-20'}
                    customisation={draft}
                  />
                  <span
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold text-white"
                    style={{ backgroundColor: draft.accentColor }}
                  >
                    Follow
                  </span>
                </div>

                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-display text-lg font-bold text-white">
                      {profile.displayName}
                    </span>
                    <BadgeStrip badges={selfBadges} size={15} max={4} interactive={false} />
                    <TierBadge tier={effectiveTier} showFree={false} size="xs" />
                  </div>
                  <p className="text-xs text-[#94A3B8]">@{profile.username}</p>
                  {profile.bio && (
                    <p className="text-xs text-[#CBD5E1] pt-1 leading-relaxed line-clamp-3">
                      {profile.bio}
                    </p>
                  )}
                </div>

                <div
                  className={`pt-3 border-t border-white/10 grid gap-2 text-xs ${
                    draft.layoutVariant === 'showcase' ? 'grid-cols-3' : 'grid-cols-2'
                  }`}
                >
                  <div>
                    <span className="font-mono-tabular font-bold text-white">
                      {profile.postsCount}
                    </span>{' '}
                    <span className="text-[#94A3B8]">Posts</span>
                  </div>
                  <div>
                    <span className="font-mono-tabular font-bold text-white">
                      {profile.followersCount}
                    </span>{' '}
                    <span className="text-[#94A3B8]">Followers</span>
                  </div>
                  {draft.layoutVariant === 'showcase' && (
                    <div>
                      <span className="font-mono-tabular font-bold text-white">
                        {profile.likesCount}
                      </span>{' '}
                      <span className="text-[#94A3B8]">Appreciations</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {effectiveTier === 'free' && (
              <div className="p-3.5 rounded-xl bg-[#7C3AED]/10 border border-[#8B5CF6]/30 flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <p className="text-xs font-semibold text-white flex items-center gap-1.5">
                    <Crown size={13} className="text-amber-300" /> Unlock All Studio Styles
                  </p>
                  <p className="text-[11px] text-[#CBD5E1]">
                    Upgrade to Plus or Pro for animated rings, custom banners & showcase layouts.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('subscriptions')}
                  className="shrink-0 min-h-[38px] px-3 py-1.5 rounded-xl bg-[#7C3AED] text-xs font-semibold text-white"
                >
                  View Plans
                </button>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Upgrade Modal for Tier-Locked Customisations */}
      {upgradePromptItem && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setUpgradePromptItem(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-[#0E0C18] border border-[#8B5CF6]/35 p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lock size={16} className="text-amber-300" />
                <h3 className="font-display text-base font-bold text-white">
                  {upgradePromptItem.requiredTier === 'pro'
                    ? 'Nexora Pro Feature'
                    : 'Nexora Plus Feature'}
                </h3>
              </div>
              <button type="button" onClick={() => setUpgradePromptItem(null)}>
                <X size={18} className="text-[#94A3B8]" />
              </button>
            </div>
            <p className="text-xs text-[#CBD5E1] leading-relaxed">
              <strong className="text-white">{upgradePromptItem.name}</strong> requires an active{' '}
              <strong className="text-[#E9D5FF]">
                Nexora {upgradePromptItem.requiredTier.toUpperCase()}
              </strong>{' '}
              membership to publish on your profile.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setUpgradePromptItem(null)}
                className="min-h-[40px] px-4 rounded-xl bg-white/[0.06] text-xs font-semibold text-[#CBD5E1]"
              >
                Keep Previewing
              </button>
              <button
                type="button"
                onClick={() => {
                  setUpgradePromptItem(null);
                  onNavigate('subscriptions');
                }}
                className="min-h-[40px] px-4 rounded-xl bg-gradient-to-r from-[#6D28D9] to-[#9333EA] text-xs font-semibold text-white"
              >
                Explore Memberships
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
