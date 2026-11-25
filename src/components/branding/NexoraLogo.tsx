import React from 'react';
import { MasterNexoraNMark, type AnimatedLogoStage } from './AnimatedNexoraLogo';
import { useTheme } from '../../hooks/useTheme';

export type NexoraLogoAnimation =
  | 'assemble'
  | 'ambient'
  | 'transition'
  | 'loading'
  | 'success'
  | 'static';

export interface NexoraLogoProps {
  variant?: 'horizontal' | 'icon' | 'wordmark';
  theme?: 'dark' | 'light';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'hero';
  framed?: boolean;
  animation?: NexoraLogoAnimation;
  replayKey?: string | number;
  className?: string;
}

const SIZE_MAP = {
  xs: { icon: 22, text: 'text-sm tracking-[0.18em]', gap: 'gap-2' },
  sm: { icon: 28, text: 'text-base tracking-[0.2em]', gap: 'gap-2.5' },
  md: { icon: 34, text: 'text-lg tracking-[0.22em]', gap: 'gap-3' },
  lg: { icon: 44, text: 'text-2xl tracking-[0.24em]', gap: 'gap-3.5' },
  xl: { icon: 58, text: 'text-3xl tracking-[0.26em]', gap: 'gap-4' },
  hero: { icon: 210, text: 'text-4xl tracking-[0.26em]', gap: 'gap-5' },
} as const;

const ANIMATION_TO_STAGE: Record<NexoraLogoAnimation, AnimatedLogoStage> = {
  assemble: 'assembling',
  ambient: 'ambient',
  transition: 'transition',
  loading: 'loading',
  success: 'success',
  static: 'assembled',
};

export function NexoraLogo({
  variant = 'horizontal',
  theme,
  size = 'md',
  framed = true,
  animation = 'ambient',
  replayKey,
  className = '',
}: NexoraLogoProps) {
  const { resolvedTheme } = useTheme();
  const activeTheme = theme || resolvedTheme;
  const dims = SIZE_MAP[size];
  const stage = ANIMATION_TO_STAGE[animation];

  const wordmarkColor =
    activeTheme === 'dark'
      ? 'text-transparent bg-clip-text bg-gradient-to-r from-white via-[#F5F3FF] to-[#D8B4FE]'
      : 'text-[#0B0B12]';

  return (
    <span className={`inline-flex items-center select-none shrink-0 ${dims.gap} ${className}`}>
      {variant !== 'wordmark' && (
        <MasterNexoraNMark
          stage={stage}
          boxSize={dims.icon}
          framed={framed}
          theme={activeTheme}
          paddedViewBox={size === 'hero'}
          replayKey={replayKey}
        />
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
