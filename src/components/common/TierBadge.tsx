import React from 'react';
import { Crown, Sparkles } from 'lucide-react';
import { SubscriptionTier } from '../../types/nexora';

interface TierBadgeProps {
  tier?: SubscriptionTier | null;
  size?: 'xs' | 'sm' | 'md';
  showFree?: boolean;
  className?: string;
}

export const TierBadge: React.FC<TierBadgeProps> = ({
  tier = 'free',
  size = 'sm',
  showFree = false,
  className = '',
}) => {
  if (!tier || (tier === 'free' && !showFree)) {
    return null;
  }

  const dims =
    size === 'xs'
      ? 'text-[10px] px-1.5 py-0.5 gap-1'
      : size === 'md'
      ? 'text-xs px-2.5 py-1 gap-1.5'
      : 'text-[11px] px-2 py-0.5 gap-1';

  const iconSize = size === 'xs' ? 10 : size === 'md' ? 13 : 11;

  if (tier === 'pro') {
    return (
      <span
        title="Nexora Pro Member"
        aria-label="Nexora Pro Member"
        className={`inline-flex items-center rounded-md font-semibold tracking-tight bg-amber-500/15 text-amber-300 border border-amber-400/35 shrink-0 ${dims} ${className}`}
      >
        <Crown size={iconSize} className="text-amber-300 shrink-0" />
        <span>PRO</span>
      </span>
    );
  }

  if (tier === 'plus') {
    return (
      <span
        title="Nexora Plus Member"
        aria-label="Nexora Plus Member"
        className={`inline-flex items-center rounded-md font-semibold tracking-tight bg-[#A855F7]/20 text-[#E9D5FF] border border-[#A855F7]/40 shrink-0 ${dims} ${className}`}
      >
        <Sparkles size={iconSize} className="text-[#C084FC] shrink-0" />
        <span>PLUS</span>
      </span>
    );
  }

  return (
    <span
      title="Nexora Free Member"
      aria-label="Nexora Free Member"
      className={`inline-flex items-center rounded-md font-medium bg-white/[0.06] text-[#94A3B8] border border-white/10 shrink-0 ${dims} ${className}`}
    >
      <span>FREE</span>
    </span>
  );
};
