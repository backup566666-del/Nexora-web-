import React from 'react';
import { BadgeCheck } from 'lucide-react';
import { VerifiedBadgeType } from '../../types/nexora';

interface VerifiedBadgeProps {
  size?: number;
  variant?: VerifiedBadgeType | null;
  className?: string;
}

export function VerifiedBadge({
  size = 15,
  variant = 'verified',
  className = '',
}: VerifiedBadgeProps) {
  if (!variant) return null;

  if (variant === 'owner') {
    return (
      <span
        className={`inline-flex items-center justify-center shrink-0 align-middle ${className}`}
        title="Official Nexora Owner"
        aria-label="Official Nexora Owner"
      >
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="drop-shadow-[0_0_8px_rgba(37,99,235,0.55)]"
        >
          <defs>
            <linearGradient id="nexoraOwnerBlue" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#38BDF8" />
              <stop offset="50%" stopColor="#2563EB" />
              <stop offset="100%" stopColor="#1D4ED8" />
            </linearGradient>
          </defs>
          <circle cx="12" cy="12" r="10.5" fill="url(#nexoraOwnerBlue)" stroke="#93C5FD" strokeWidth="1" />
          <path
            d="M8 12.4L10.75 15.15L16.35 9.15"
            stroke="#FFFFFF"
            strokeWidth="2.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    );
  }

  if (variant === 'partner') {
    return (
      <span title="Official Partner" aria-label="Official Partner" className={`inline-flex shrink-0 ${className}`}>
        <BadgeCheck size={size} className="inline-block shrink-0 text-sky-400" />
      </span>
    );
  }

  if (variant === 'creator') {
    return (
      <span title="Featured Creator" aria-label="Featured Creator" className={`inline-flex shrink-0 ${className}`}>
        <BadgeCheck size={size} className="inline-block shrink-0 text-fuchsia-400" />
      </span>
    );
  }

  if (variant === 'founder_circle') {
    return (
      <span title="Founder Circle" aria-label="Founder Circle" className={`inline-flex shrink-0 ${className}`}>
        <BadgeCheck size={size} className="inline-block shrink-0 text-amber-400" />
      </span>
    );
  }

  return (
    <span title="Verified Account" aria-label="Verified account" className={`inline-flex shrink-0 ${className}`}>
      <BadgeCheck size={size} className="inline-block shrink-0 text-[#A855F7]" />
    </span>
  );
}
