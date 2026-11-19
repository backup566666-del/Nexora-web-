import React from 'react';
import { Award, CheckCircle2, Info, X } from 'lucide-react';
import { BadgeIconGlyph } from '../common/VerifiedBadge';
import { useBadgeModal } from './BadgeContext';
import { useAuth } from '../../hooks/useAuth';
import { BadgeCategory, VerifiedBadgeType } from '../../types/nexora';
import { ALL_CANONICAL_BADGES, BADGE_CATALOG } from '../../utils/validation';

const CATEGORY_ORDER: { key: BadgeCategory; title: string; subtitle: string }[] = [
  {
    key: 'identity',
    title: 'Official Identity Verification',
    subtitle: 'Granted automatically when a legal government document passes Identity Verification.',
  },
  {
    key: 'official',
    title: 'Platform & Official Entities',
    subtitle: 'Reserved for Nexora ownership, verified organizations, and official media outlets.',
  },
  {
    key: 'creator',
    title: 'Creators & Professionals',
    subtitle: 'Recognizes verified creators, artists, educators, journalists, and leaders.',
  },
  {
    key: 'community',
    title: 'Spaces & Community Stewardship',
    subtitle: 'Honors Space founders, moderators, and community builders.',
  },
  {
    key: 'achievement',
    title: 'Achievements & Recognition',
    subtitle: 'Milestone honors and Supporter appreciation (distinct from Identity Verification).',
  },
];

export function BadgeInfoModal() {
  const { isOpen, selectedBadge, closeBadgeModal } = useBadgeModal();
  const { profile, getUserBadges } = useAuth();

  if (!isOpen) return null;

  const myBadges = profile ? getUserBadges(profile.uid, profile.verified) : [];
  const activeDef = selectedBadge ? BADGE_CATALOG[selectedBadge] : BADGE_CATALOG.verified_identity;

  return (
    <div
      className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={closeBadgeModal}
    >
      <div
        className="w-full max-w-4xl max-h-[88vh] bg-[#0D0B16] border border-[#8B5CF6]/30 rounded-2xl shadow-[0_24px_80px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-white/[0.08] flex items-center justify-between bg-[#120F20]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#7C3AED]/20 border border-[#8B5CF6]/35 flex items-center justify-center text-[#C084FC]">
              <Award size={18} />
            </div>
            <div>
              <h2 className="font-display text-base font-bold text-white">
                Nexora 20-Badge System & Verification Guide
              </h2>
              <p className="text-xs text-[#94A3B8]">
                Each badge reflects verified trust, role, craftsmanship, or community impact.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={closeBadgeModal}
            className="p-2 rounded-xl text-[#94A3B8] hover:text-white hover:bg-white/10"
            aria-label="Close badge guide"
          >
            <X size={18} />
          </button>
        </div>

        {/* Highlighted Selected Badge */}
        <div className="px-6 py-4 bg-gradient-to-r from-[#17112B] via-[#110D1F] to-[#17112B] border-b border-white/[0.06]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="pt-0.5">
                <BadgeIconGlyph variant={activeDef.id} size={28} />
              </div>
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-display text-base font-bold text-white">{activeDef.name}</h3>
                  <span
                    className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded"
                    style={{
                      backgroundColor: activeDef.bgTint,
                      color: activeDef.accentColor,
                      border: `1px solid ${activeDef.borderTint}`,
                    }}
                  >
                    {activeDef.category}
                  </span>
                  {myBadges.includes(activeDef.id) && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                      <CheckCircle2 size={11} /> Earned on your profile
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#E2E8F0] leading-relaxed">{activeDef.description}</p>
                <p className="text-[11px] text-[#94A3B8] flex items-start gap-1.5">
                  <Info size={12} className="shrink-0 mt-0.5 text-[#A855F7]" />
                  <span>
                    <strong className="text-white">How to earn:</strong> {activeDef.eligibility}
                  </span>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* All 20 Badges Directory */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {CATEGORY_ORDER.map((cat) => {
            const list = ALL_CANONICAL_BADGES.map((id) => BADGE_CATALOG[id]).filter(
              (b) => b.category === cat.key
            );
            return (
              <section key={cat.key} className="space-y-3">
                <div>
                  <h4 className="font-display text-sm font-semibold text-white">{cat.title}</h4>
                  <p className="text-[11px] text-[#94A3B8]">{cat.subtitle}</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {list.map((badge) => {
                    const owned = myBadges.includes(badge.id);
                    const focused = activeDef.id === badge.id;
                    return (
                      <div
                        key={badge.id}
                        className={`p-3.5 rounded-xl border transition-colors ${
                          focused
                            ? 'bg-[#191230] border-[#8B5CF6]/55'
                            : 'bg-[#090812] border-white/[0.06]'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="pt-0.5">
                            <BadgeIconGlyph variant={badge.id as VerifiedBadgeType} size={18} />
                          </div>
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-semibold text-white">{badge.name}</span>
                              {owned && (
                                <span className="text-[10px] font-semibold text-emerald-300">
                                  Active
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-[#CBD5E1] leading-relaxed">
                              {badge.description}
                            </p>
                            <p className="text-[10px] text-[#94A3B8]">
                              Eligibility: {badge.eligibility}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
