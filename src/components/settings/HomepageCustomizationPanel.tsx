import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  Columns3,
  Eye,
  EyeOff,
  LayoutGrid,
  LayoutList,
  RotateCcw,
  Save,
  Sliders,
} from 'lucide-react';
import { FriendlyErrorBanner } from '../common/FriendlyErrorBanner';
import { useAuth } from '../../hooks/useAuth';
import { extractReadableErrorMessage } from '../../services/firebase/errorHandler';
import { saveHomepageCustomization } from '../../services/firebase/socialService';
import {
  HomepageCustomization,
  HomepageFeedDensity,
  HomepageFeedSort,
  HomepageLayoutMode,
  HomepageSectionId,
} from '../../types/nexora';
import {
  ALL_HOMEPAGE_SECTIONS,
  DEFAULT_HOMEPAGE_CUSTOMIZATION,
  withHomepageCustomizationDefaults,
} from '../../utils/validation';

interface HomepageCustomizationPanelProps {
  onOpenHome?: () => void;
}

const LAYOUT_OPTIONS: {
  id: HomepageLayoutMode;
  title: string;
  description: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}[] = [
  {
    id: 'command',
    title: 'Command Studio',
    description: 'Three-column desktop layout with left Space rail, central feed, and right discovery rail.',
    icon: Columns3,
  },
  {
    id: 'editorial',
    title: 'Editorial Flow',
    description: 'Wide curated canvas pairing horizontal discovery shelves above a balanced feed.',
    icon: LayoutGrid,
  },
  {
    id: 'stream',
    title: 'Focus Stream',
    description: 'Distraction-free single column emphasizing stories, composer, and live posts.',
    icon: LayoutList,
  },
];

const FEED_SORT_OPTIONS: { id: HomepageFeedSort; label: string }[] = [
  { id: 'all', label: 'Recent' },
  { id: 'trending', label: 'Trending' },
  { id: 'media', label: 'Photos & Video' },
  { id: 'discussions', label: 'Discussions' },
  { id: 'polls', label: 'Polls' },
];

export function HomepageCustomizationPanel({ onOpenHome }: HomepageCustomizationPanelProps) {
  const { profile, userPrefs } = useAuth();
  const savedConfig = useMemo(
    () => withHomepageCustomizationDefaults(userPrefs?.homepagePrefs),
    [userPrefs?.homepagePrefs]
  );

  const [draft, setDraft] = useState<HomepageCustomization>(savedConfig);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setDraft(savedConfig);
  }, [savedConfig]);

  if (!profile) return null;

  const isDirty = JSON.stringify(draft) !== JSON.stringify(savedConfig);

  const isSectionVisible = (id: HomepageSectionId): boolean => {
    switch (id) {
      case 'stories':
        return draft.showStories;
      case 'creators':
        return draft.showRecommendedCreators;
      case 'spaces':
        return draft.showSuggestedSpaces;
      case 'trending':
        return draft.showTrendingTopics;
    }
  };

  const toggleSectionVisibility = (id: HomepageSectionId) => {
    setNotice('');
    setDraft((prev) => {
      switch (id) {
        case 'stories':
          return { ...prev, showStories: !prev.showStories };
        case 'creators':
          return { ...prev, showRecommendedCreators: !prev.showRecommendedCreators };
        case 'spaces':
          return { ...prev, showSuggestedSpaces: !prev.showSuggestedSpaces };
        case 'trending':
          return { ...prev, showTrendingTopics: !prev.showTrendingTopics };
      }
    });
  };

  const moveSection = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= draft.sectionOrder.length) return;
    setNotice('');
    setDraft((prev) => {
      const next = [...prev.sectionOrder];
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item);
      return { ...prev, sectionOrder: next };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const saved = await saveHomepageCustomization(profile.uid, userPrefs, draft);
      setDraft(saved);
      setNotice('Homepage layout and section preferences saved to your account.');
    } catch (err) {
      setError(
        extractReadableErrorMessage(
          err,
          'We could not save your homepage customization right now. Please try again.'
        )
      );
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const saved = await saveHomepageCustomization(
        profile.uid,
        userPrefs,
        DEFAULT_HOMEPAGE_CUSTOMIZATION
      );
      setDraft(saved);
      setNotice('Homepage layout restored to Nexora defaults.');
    } catch (err) {
      setError(
        extractReadableErrorMessage(
          err,
          'We could not reset your homepage customization right now. Please try again.'
        )
      );
    } finally {
      setSaving(false);
    }
  };

  const sectionMetaMap = new Map(ALL_HOMEPAGE_SECTIONS.map((s) => [s.id, s]));

  return (
    <section
      id="customize-homepage"
      className="p-5 sm:p-6 rounded-2xl bg-[#0D0B16] border border-[#8B5CF6]/25 space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/[0.08]">
        <div className="space-y-1">
          <h2 className="font-display text-base sm:text-lg font-semibold text-white flex items-center gap-2">
            <Sliders size={17} className="text-[#C084FC]" /> Customize Homepage
          </h2>
          <p className="text-xs text-[#94A3B8]">
            Choose your Home layout, show or hide discovery shelves, reorder modules, and set feed density.
          </p>
        </div>
        {onOpenHome && (
          <button
            type="button"
            onClick={onOpenHome}
            className="self-start sm:self-auto px-3.5 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/10 text-xs font-semibold text-[#E2E8F0] min-h-[40px] whitespace-nowrap"
          >
            Preview on Home
          </button>
        )}
      </div>

      {/* Layout Selector */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-white">Homepage Layout Mode</h3>
          <span className="text-[11px] text-[#94A3B8]">Desktop &amp; Tablet structure</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {LAYOUT_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const active = draft.layout === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  setNotice('');
                  setDraft((prev) => ({ ...prev, layout: opt.id }));
                }}
                className={`p-4 rounded-xl border text-left transition-all flex flex-col justify-between gap-3 min-h-[112px] ${
                  active
                    ? 'bg-[#7C3AED]/15 border-[#8B5CF6] shadow-[0_6px_20px_rgba(124,58,237,0.2)]'
                    : 'bg-[#08070F] border-white/[0.08] hover:border-[#8B5CF6]/40'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2 text-xs font-semibold text-white">
                    <Icon size={15} className={active ? 'text-[#C084FC]' : 'text-[#94A3B8]'} />
                    {opt.title}
                  </span>
                  {active && (
                    <span className="w-5 h-5 rounded-full bg-[#7C3AED] text-white flex items-center justify-center shrink-0">
                      <Check size={12} />
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-[#94A3B8] leading-relaxed">{opt.description}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Section Visibility & Reordering */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <div className="lg:col-span-7 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-white">Sections: Show, Hide &amp; Reorder</h3>
            <span className="text-[11px] text-[#94A3B8]">Top to bottom display priority</span>
          </div>

          <div className="space-y-2">
            {draft.sectionOrder.map((secId, idx) => {
              const meta = sectionMetaMap.get(secId);
              if (!meta) return null;
              const visible = isSectionVisible(secId);
              return (
                <div
                  key={secId}
                  className={`p-3 rounded-xl border flex items-center justify-between gap-3 transition-colors ${
                    visible
                      ? 'bg-[#08070F] border-white/[0.08]'
                      : 'bg-[#08070F]/50 border-white/[0.04] opacity-70'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-mono-tabular text-[11px] font-semibold text-[#C084FC] w-6 shrink-0">
                      0{idx + 1}.
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-white truncate">{meta.label}</p>
                      <p className="text-[11px] text-[#94A3B8] truncate">{meta.description}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => moveSection(idx, -1)}
                      aria-label={`Move ${meta.label} up`}
                      className="min-w-[36px] min-h-[36px] rounded-lg bg-white/[0.05] hover:bg-white/[0.1] disabled:opacity-30 text-[#CBD5E1] flex items-center justify-center"
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      type="button"
                      disabled={idx === draft.sectionOrder.length - 1}
                      onClick={() => moveSection(idx, 1)}
                      aria-label={`Move ${meta.label} down`}
                      className="min-w-[36px] min-h-[36px] rounded-lg bg-white/[0.05] hover:bg-white/[0.1] disabled:opacity-30 text-[#CBD5E1] flex items-center justify-center"
                    >
                      <ArrowDown size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleSectionVisibility(secId)}
                      aria-label={visible ? `Hide ${meta.label}` : `Show ${meta.label}`}
                      className={`min-h-[36px] px-3 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1.5 transition-colors ${
                        visible
                          ? 'bg-[#7C3AED]/20 border border-[#8B5CF6]/40 text-[#E9D5FF]'
                          : 'bg-white/[0.04] border border-white/10 text-[#94A3B8]'
                      }`}
                    >
                      {visible ? <Eye size={13} /> : <EyeOff size={13} />}
                      <span>{visible ? 'Shown' : 'Hidden'}</span>
                    </button>
                  </div>
                </div>
              );
            })}

            {/* Videos & Vibes Showcase Toggle */}
            <div
              className={`p-3 rounded-xl border flex items-center justify-between gap-3 transition-colors ${
                draft.showVibesShelf
                  ? 'bg-[#08070F] border-white/[0.08]'
                  : 'bg-[#08070F]/50 border-white/[0.04] opacity-70'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="font-mono-tabular text-[11px] font-semibold text-[#94A3B8] w-6 shrink-0">
                  +
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-white truncate">Videos &amp; Vibes Shelf</p>
                  <p className="text-[11px] text-[#94A3B8] truncate">
                    Horizontal short-video preview rail inside the Home Feed
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setNotice('');
                  setDraft((prev) => ({ ...prev, showVibesShelf: !prev.showVibesShelf }));
                }}
                className={`min-h-[36px] px-3 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1.5 shrink-0 transition-colors ${
                  draft.showVibesShelf
                    ? 'bg-[#7C3AED]/20 border border-[#8B5CF6]/40 text-[#E9D5FF]'
                    : 'bg-white/[0.04] border border-white/10 text-[#94A3B8]'
                }`}
              >
                {draft.showVibesShelf ? <Eye size={13} /> : <EyeOff size={13} />}
                <span>{draft.showVibesShelf ? 'Shown' : 'Hidden'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Feed Display Preferences + Live Structure Preview */}
        <div className="lg:col-span-5 space-y-4">
          <div className="p-4 rounded-xl bg-[#08070F] border border-white/[0.08] space-y-4">
            <h3 className="text-xs font-semibold text-white">Feed Display Preferences</h3>

            <div className="space-y-2">
              <span className="text-[11px] text-[#94A3B8]">Card Spacing Density</span>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { id: 'comfortable', label: 'Comfortable' },
                    { id: 'compact', label: 'Compact' },
                  ] as { id: HomepageFeedDensity; label: string }[]
                ).map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => {
                      setNotice('');
                      setDraft((prev) => ({ ...prev, feedDensity: d.id }));
                    }}
                    className={`min-h-[40px] rounded-xl text-xs font-semibold border transition-colors ${
                      draft.feedDensity === d.id
                        ? 'bg-[#7C3AED] border-[#8B5CF6] text-white'
                        : 'bg-[#0D0B16] border-white/10 text-[#CBD5E1] hover:text-white'
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            <label className="block space-y-1.5">
              <span className="text-[11px] text-[#94A3B8]">Default Feed View</span>
              <select
                value={draft.defaultFeedFilter}
                onChange={(e) => {
                  setNotice('');
                  setDraft((prev) => ({
                    ...prev,
                    defaultFeedFilter: e.target.value as HomepageFeedSort,
                  }));
                }}
                className="w-full px-3 py-2.5 rounded-xl bg-[#0D0B16] border border-white/10 focus:border-[#8B5CF6] text-xs text-white outline-none min-h-[40px]"
              >
                {FEED_SORT_OPTIONS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* Live Schematic Wireframe Preview */}
          <div className="p-4 rounded-xl bg-[#08070F] border border-white/[0.08] space-y-2.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold text-white">Live Structure Preview</span>
              <span className="text-[#94A3B8]">
                {draft.layout === 'command'
                  ? '3-Column'
                  : draft.layout === 'editorial'
                  ? 'Editorial'
                  : 'Single Stream'}
              </span>
            </div>

            <div
              className={`grid gap-2 p-2.5 rounded-lg bg-[#0D0B16] border border-white/[0.06] ${
                draft.layout === 'command' ? 'grid-cols-4' : 'grid-cols-1'
              }`}
            >
              {draft.layout === 'command' && (
                <div className="col-span-1 space-y-1.5">
                  <div className="h-7 rounded bg-white/[0.06]" />
                  {draft.showSuggestedSpaces && (
                    <div className="h-10 rounded bg-[#7C3AED]/20 border border-[#8B5CF6]/30 flex items-center justify-center text-[9px] text-[#E9D5FF]">
                      Spaces
                    </div>
                  )}
                </div>
              )}

              <div
                className={`${
                  draft.layout === 'command' ? 'col-span-2' : 'col-span-1'
                } space-y-1.5`}
              >
                {draft.sectionOrder
                  .filter((id) => isSectionVisible(id))
                  .filter((id) => draft.layout !== 'command' || id === 'stories')
                  .map((id) => (
                    <div
                      key={id}
                      className="h-5 rounded bg-[#7C3AED]/20 border border-[#8B5CF6]/30 px-2 flex items-center text-[9px] text-[#E9D5FF] truncate"
                    >
                      {sectionMetaMap.get(id)?.label}
                    </div>
                  ))}
                <div className="h-6 rounded bg-white/[0.07] px-2 flex items-center text-[9px] text-[#94A3B8]">
                  Post Composer
                </div>
                {draft.showVibesShelf && (
                  <div className="h-6 rounded bg-white/[0.05] px-2 flex items-center text-[9px] text-[#CBD5E1]">
                    Videos &amp; Vibes
                  </div>
                )}
                <div
                  className={`${
                    draft.feedDensity === 'compact' ? 'h-9' : 'h-12'
                  } rounded bg-white/[0.04] px-2 flex items-center text-[9px] text-[#94A3B8]`}
                >
                  Feed ({FEED_SORT_OPTIONS.find((f) => f.id === draft.defaultFeedFilter)?.label})
                </div>
              </div>

              {draft.layout === 'command' && (
                <div className="col-span-1 space-y-1.5">
                  {draft.showRecommendedCreators && (
                    <div className="h-10 rounded bg-[#7C3AED]/20 border border-[#8B5CF6]/30 flex items-center justify-center text-[9px] text-[#E9D5FF]">
                      Creators
                    </div>
                  )}
                  {draft.showTrendingTopics && (
                    <div className="h-9 rounded bg-[#7C3AED]/15 border border-[#8B5CF6]/25 flex items-center justify-center text-[9px] text-[#E9D5FF]">
                      Topics
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {error && <FriendlyErrorBanner message={error} onDismiss={() => setError('')} />}
      {notice && (
        <p className="text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/25 rounded-xl px-3.5 py-2.5">
          {notice}
        </p>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/[0.06]">
        <button
          type="button"
          disabled={saving}
          onClick={() => void handleReset()}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.09] border border-white/10 text-xs font-medium text-[#CBD5E1] min-h-[42px]"
        >
          <RotateCcw size={14} /> Reset Defaults
        </button>

        <button
          type="button"
          disabled={saving}
          onClick={() => void handleSave()}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#6D28D9] via-[#7C3AED] to-[#9333EA] hover:brightness-110 disabled:opacity-50 text-xs font-semibold text-white shadow-[0_4px_18px_rgba(124,58,237,0.35)] min-h-[42px]"
        >
          <Save size={14} />
          <span>{saving ? 'Saving Layout...' : isDirty ? 'Save Homepage Layout' : 'Saved'}</span>
        </button>
      </div>
    </section>
  );
}
