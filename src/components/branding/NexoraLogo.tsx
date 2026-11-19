import React, { useId } from 'react';

export interface NexoraLogoProps {
  variant?: 'horizontal' | 'icon' | 'wordmark';
  theme?: 'dark' | 'light';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'hero';
  framed?: boolean;
  className?: string;
}

const SIZE_MAP = {
  xs: { icon: 22, text: 'text-sm tracking-[0.18em]', gap: 'gap-2' },
  sm: { icon: 28, text: 'text-base tracking-[0.2em]', gap: 'gap-2.5' },
  md: { icon: 34, text: 'text-lg tracking-[0.22em]', gap: 'gap-3' },
  lg: { icon: 44, text: 'text-2xl tracking-[0.24em]', gap: 'gap-3.5' },
  xl: { icon: 58, text: 'text-3xl tracking-[0.26em]', gap: 'gap-4' },
  hero: { icon: 250, text: 'text-4xl tracking-[0.26em]', gap: 'gap-5' },
} as const;

export function NexoraLogo({
  variant = 'horizontal',
  theme = 'dark',
  size = 'md',
  framed = true,
  className = '',
}: NexoraLogoProps) {
  const uid = useId().replace(/:/g, '');
  const leftId = `nx-l-${uid}`;
  const diagId = `nx-d-${uid}`;
  const rightId = `nx-r-${uid}`;
  const edgeId = `nx-e-${uid}`;
  const dims = SIZE_MAP[size];

  const wordmarkColor = theme === 'dark' ? 'text-white' : 'text-[#0B0B12]';
  const frameBg = theme === 'dark' ? '#0B0814' : '#F4F2FA';
  const frameStroke = theme === 'dark' ? 'rgba(168, 85, 247, 0.38)' : 'rgba(91, 33, 182, 0.25)';

  return (
    <span className={`inline-flex items-center select-none shrink-0 ${dims.gap} ${className}`}>
      {variant !== 'wordmark' && (
        <svg
          width={dims.icon}
          height={dims.icon}
          viewBox="0 0 64 64"
          fill="none"
          aria-hidden="true"
          className="shrink-0"
        >
          <defs>
            <linearGradient id={leftId} x1="15" y1="12" x2="24" y2="52" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#9333EA" />
              <stop offset="55%" stopColor="#6D28D9" />
              <stop offset="100%" stopColor="#3B0764" />
            </linearGradient>
            <linearGradient id={rightId} x1="40" y1="12" x2="49" y2="52" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#C084FC" />
              <stop offset="50%" stopColor="#7C3AED" />
              <stop offset="100%" stopColor="#4C1D95" />
            </linearGradient>
            <linearGradient id={diagId} x1="15" y1="14" x2="49" y2="50" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor={theme === 'dark' ? '#F3E8FF' : '#C084FC'} />
              <stop offset="42%" stopColor="#A855F7" />
              <stop offset="100%" stopColor="#6D28D9" />
            </linearGradient>
            <linearGradient id={edgeId} x1="16" y1="14" x2="46" y2="48" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.65" />
              <stop offset="100%" stopColor="#A855F7" stopOpacity="0.1" />
            </linearGradient>
          </defs>

          {framed && (
            <rect
              x="1"
              y="1"
              width="62"
              height="62"
              rx="16"
              fill={frameBg}
              stroke={frameStroke}
              strokeWidth="1.5"
            />
          )}

          {/* Left faceted pillar */}
          <path d="M15 50V14L24.2 18V50H15Z" fill={`url(#${leftId})`} />
          {/* Right faceted pillar */}
          <path d="M39.8 46V14H49V50L39.8 46Z" fill={`url(#${rightId})`} />
          {/* 3D shadow bevel under diagonal ribbon */}
          <path d="M24.2 21L39.8 43.8V50L24.2 27.2V21Z" fill="#2E1065" fillOpacity="0.55" />
          {/* Main glowing diagonal ribbon */}
          <path d="M15 14H24.2L49 50H39.8L15 14Z" fill={`url(#${diagId})`} />
          {/* Subtle top specular edge */}
          <path d="M15.4 14.4H24L48.4 49.6" stroke={`url(#${edgeId})`} strokeWidth="0.8" />
        </svg>
      )}
      {variant !== 'icon' && (
        <span
          className={`font-display font-bold uppercase whitespace-nowrap ${dims.text} ${wordmarkColor}`}
        >
          NEXORA
        </span>
      )}
    </span>
  );
}
