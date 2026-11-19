import React from 'react';
import {
  BadgeCheck,
  Building2,
  Crown,
  Flame,
  GraduationCap,
  Heart,
  Megaphone,
  Newspaper,
  Palette,
  PenTool,
  Radio,
  Rocket,
  ShieldCheck,
  Sparkles,
  Star,
  Trophy,
  UserCheck,
  Users,
  Video,
  Award,
} from 'lucide-react';
import { useBadgeModal } from '../badges/BadgeContext';
import { AnyVerifiedBadgeType, VerifiedBadgeType } from '../../types/nexora';
import { BADGE_CATALOG, normalizeBadgeType } from '../../utils/validation';

interface VerifiedBadgeProps {
  size?: number;
  variant?: AnyVerifiedBadgeType | null;
  className?: string;
  interactive?: boolean;
}

export function BadgeIconGlyph({
  variant,
  size = 15,
}: {
  variant: VerifiedBadgeType;
  size?: number;
}) {
  const def = BADGE_CATALOG[variant];
  const color = def.accentColor;

  if (variant === 'verified_identity') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="drop-shadow-[0_0_6px_rgba(56,189,248,0.45)]"
      >
        <circle cx="12" cy="12" r="10.2" fill="#0EA5E9" stroke="#7DD3FC" strokeWidth="1.2" />
        <path
          d="M8.1 12.2L10.8 14.9L16.2 9.2"
          stroke="#FFFFFF"
          strokeWidth="2.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (variant === 'founder') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="drop-shadow-[0_0_8px_rgba(37,99,235,0.65)]"
      >
        <defs>
          <linearGradient id="nexoraFounderGrad" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#60A5FA" />
            <stop offset="50%" stopColor="#2563EB" />
            <stop offset="100%" stopColor="#1D4ED8" />
          </linearGradient>
        </defs>
        <circle cx="12" cy="12" r="10.5" fill="url(#nexoraFounderGrad)" stroke="#BAE6FD" strokeWidth="1.2" />
        <path
          d="M7.2 15.5L6.5 9.8L9.8 12.1L12 8.2L14.2 12.1L17.5 9.8L16.8 15.5H7.2Z"
          fill="#FFFFFF"
        />
      </svg>
    );
  }

  const iconSize = Math.max(10, Math.round(size * 0.64));

  const iconNode = (() => {
    switch (variant) {
      case 'official_organization':
        return <Building2 size={iconSize} style={{ color }} />;
      case 'official_media':
        return <Radio size={iconSize} style={{ color }} />;
      case 'creator':
        return <Video size={iconSize} style={{ color }} />;
      case 'influencer':
        return <Megaphone size={iconSize} style={{ color }} />;
      case 'artist':
        return <Palette size={iconSize} style={{ color }} />;
      case 'professional':
        return <BadgeCheck size={iconSize} style={{ color }} />;
      case 'educator':
        return <GraduationCap size={iconSize} style={{ color }} />;
      case 'journalist':
        return <Newspaper size={iconSize} style={{ color }} />;
      case 'community_founder':
        return <Users size={iconSize} style={{ color }} />;
      case 'community_leader':
        return <Star size={iconSize} style={{ color }} />;
      case 'moderator':
        return <ShieldCheck size={iconSize} style={{ color }} />;
      case 'community_champion':
        return <Award size={iconSize} style={{ color }} />;
      case 'early_member':
        return <Sparkles size={iconSize} style={{ color }} />;
      case 'pioneer':
        return <Rocket size={iconSize} style={{ color }} />;
      case 'top_contributor':
        return <Trophy size={iconSize} style={{ color }} />;
      case 'trendsetter':
        return <Flame size={iconSize} style={{ color }} />;
      case 'supporter':
        return <Heart size={iconSize} style={{ color }} />;
      case 'legend':
        return <Crown size={iconSize} style={{ color }} />;
      default:
        return <UserCheck size={iconSize} style={{ color }} />;
    }
  })();

  return (
    <span
      className="inline-flex items-center justify-center rounded-md shrink-0"
      style={{
        width: size + 3,
        height: size + 3,
        backgroundColor: def.bgTint,
        border: `1px solid ${def.borderTint}`,
      }}
    >
      {iconNode}
    </span>
  );
}

export function VerifiedBadge({
  size = 15,
  variant = 'verified_identity',
  className = '',
  interactive = true,
}: VerifiedBadgeProps) {
  const { openBadgeModal } = useBadgeModal();
  if (!variant) return null;

  const normalized = normalizeBadgeType(variant);
  const def = BADGE_CATALOG[normalized];

  if (!interactive) {
    return (
      <span
        className={`inline-flex items-center justify-center shrink-0 align-middle ${className}`}
        title={`${def.name} — ${def.description}`}
        aria-label={def.name}
      >
        <BadgeIconGlyph variant={normalized} size={size} />
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        openBadgeModal(normalized);
      }}
      className={`inline-flex items-center justify-center shrink-0 align-middle hover:scale-110 transition-transform cursor-pointer ${className}`}
      title={`${def.name} — Click to view all 20 Nexora badges`}
      aria-label={`${def.name} badge`}
    >
      <BadgeIconGlyph variant={normalized} size={size} />
    </button>
  );
}

export function BadgeStrip({
  badges,
  size = 14,
  max = 4,
  className = '',
  interactive = true,
}: {
  badges: AnyVerifiedBadgeType[];
  size?: number;
  max?: number;
  className?: string;
  interactive?: boolean;
}) {
  const { openBadgeModal } = useBadgeModal();
  if (!badges || badges.length === 0) return null;

  const unique = Array.from(new Set(badges.map((b) => normalizeBadgeType(b))));
  const visible = unique.slice(0, max);
  const overflow = unique.length - visible.length;

  return (
    <span className={`inline-flex items-center gap-1 shrink-0 align-middle ${className}`}>
      {visible.map((badge) => (
        <VerifiedBadge key={badge} size={size} variant={badge} interactive={interactive} />
      ))}
      {overflow > 0 &&
        (interactive ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              openBadgeModal(unique[0]);
            }}
            className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-white/10 text-[#C4B5FD] hover:bg-white/15"
            title={`View all ${unique.length} badges`}
          >
            +{overflow}
          </button>
        ) : (
          <span
            className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-white/10 text-[#C4B5FD]"
            title={`${unique.length} badges`}
          >
            +{overflow}
          </span>
        ))}
    </span>
  );
}

// Keep unused PenTool reference cleanly satisfied or exported for badge builders if needed
export { PenTool };
