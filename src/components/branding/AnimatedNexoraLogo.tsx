import React, { useEffect, useId, useState } from 'react';
import { useReducedMotion } from 'motion/react';

export type AnimatedLogoStage = 'assembling' | 'assembled' | 'loading' | 'success';

export interface AnimatedNexoraLogoProps {
  stage?: AnimatedLogoStage;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showWordmark?: boolean;
  statusText?: string;
  replayKey?: string | number;
  className?: string;
  onAssemblyComplete?: () => void;
}

const SIZE_CONFIG = {
  sm: { box: 84, wordmark: 'text-sm tracking-[0.26em]' },
  md: { box: 110, wordmark: 'text-base tracking-[0.28em]' },
  lg: { box: 138, wordmark: 'text-lg tracking-[0.3em]' },
  xl: { box: 168, wordmark: 'text-xl tracking-[0.34em]' },
} as const;

const SEPARATED_TRANSFORMS = [
  'translate3d(-22px, 18px, 0) rotate(-15deg) scale(0.92)',
  'translate3d(-15px, -21px, 0) rotate(13deg) scale(0.92)',
  'translate3d(0px, 24px, 0) rotate(-9deg) scale(0.9)',
  'translate3d(17px, -18px, 0) rotate(14deg) scale(0.92)',
  'translate3d(23px, 16px, 0) rotate(16deg) scale(0.92)',
] as const;

const ASSEMBLED_TRANSFORM = 'translate3d(0px, 0px, 0) rotate(0deg) scale(1)';

export function AnimatedNexoraLogo({
  stage = 'assembling',
  size = 'lg',
  showWordmark = true,
  statusText,
  replayKey = 0,
  className = '',
  onAssemblyComplete,
}: AnimatedNexoraLogoProps) {
  const uid = useId().replace(/:/g, '');
  const prefersReducedMotion = useReducedMotion();
  const [assembledPhase, setAssembledPhase] = useState(
    stage === 'assembled' || stage === 'success' || Boolean(prefersReducedMotion)
  );
  const [pulseActive, setPulseActive] = useState(false);

  const dims = SIZE_CONFIG[size];

  // Trigger piece separation -> smooth connection -> purple light pulse when mounting/replaying
  useEffect(() => {
    if (stage === 'loading') {
      setAssembledPhase(false);
      setPulseActive(false);
      return;
    }
    if (stage === 'success') {
      setAssembledPhase(true);
      setPulseActive(true);
      return;
    }
    if (stage === 'assembled' || prefersReducedMotion) {
      setAssembledPhase(true);
      setPulseActive(false);
      onAssemblyComplete?.();
      return;
    }

    // stage === 'assembling'
    setAssembledPhase(false);
    setPulseActive(false);

    const connectTimer = window.setTimeout(() => {
      setAssembledPhase(true);
    }, 340);

    const pulseTimer = window.setTimeout(() => {
      setPulseActive(true);
      onAssemblyComplete?.();
    }, 1020);

    return () => {
      window.clearTimeout(connectTimer);
      window.clearTimeout(pulseTimer);
    };
  }, [stage, replayKey, prefersReducedMotion]);

  const isLoadingOrbit = stage === 'loading' && !prefersReducedMotion;
  const isLocked = assembledPhase || stage === 'success' || Boolean(prefersReducedMotion);

  const leftGrad = `nx-anim-l-${uid}`;
  const rightGrad = `nx-anim-r-${uid}`;
  const diagTopGrad = `nx-anim-dt-${uid}`;
  const diagBotGrad = `nx-anim-db-${uid}`;
  const edgeGrad = `nx-anim-ed-${uid}`;
  const glowFilter = `nx-anim-glow-${uid}`;

  return (
    <div
      className={`inline-flex flex-col items-center justify-center select-none ${className}`}
      data-logo-stage={stage}
    >
      <div
        className="relative flex items-center justify-center"
        style={{ width: dims.box, height: dims.box }}
      >
        {/* Ambient Electric Violet Core Aura */}
        <div
          aria-hidden="true"
          className={`absolute inset-2 rounded-full transition-all duration-700 pointer-events-none ${
            stage === 'success'
              ? 'bg-[#A855F7]/35 blur-2xl scale-115 opacity-100'
              : isLoadingOrbit
              ? 'bg-[#7C3AED]/30 blur-2xl scale-105 opacity-95'
              : isLocked
              ? 'bg-[#7C3AED]/22 blur-xl scale-100 opacity-85 nexora-logo-aura'
              : 'bg-[#6D28D9]/15 blur-xl scale-90 opacity-60'
          }`}
        />

        {/* Circular Loading Ring Indicator (active ONLY during real authentication loading) */}
        {stage === 'loading' && (
          <>
            <div
              aria-hidden="true"
              className="absolute inset-1 rounded-full p-[2px] nexora-orbit-ring pointer-events-none"
              style={{
                background:
                  'conic-gradient(from 0deg, rgba(139,92,246,0) 0deg, rgba(139,92,246,0.2) 120deg, rgba(168,85,247,0.95) 300deg, #E9D5FF 360deg)',
                WebkitMask:
                  'radial-gradient(farthest-side, transparent calc(100% - 2.5px), #000 calc(100% - 2px))',
                mask: 'radial-gradient(farthest-side, transparent calc(100% - 2.5px), #000 calc(100% - 2px))',
              }}
            />
            <div
              aria-hidden="true"
              className="absolute inset-3 rounded-full border border-[#8B5CF6]/25 border-dashed nexora-orbit-ring-reverse pointer-events-none"
            />
          </>
        )}

        {/* Purple Light Pulse Ring on Assembly Lock-In */}
        {pulseActive && stage !== 'success' && !prefersReducedMotion && (
          <div
            aria-hidden="true"
            className="absolute inset-3 rounded-full border-2 border-[#C084FC]/70 shadow-[0_0_28px_rgba(168,85,247,0.6)] nexora-pulse-ring pointer-events-none"
          />
        )}

        {/* Electric Violet Glow Burst on Auth Success */}
        {stage === 'success' && (
          <>
            <div
              aria-hidden="true"
              className="absolute inset-2 rounded-full border-2 border-[#E9D5FF]/85 shadow-[0_0_45px_rgba(192,132,252,0.85)] nexora-glow-burst pointer-events-none"
            />
            <div
              aria-hidden="true"
              className="absolute inset-4 rounded-full bg-gradient-to-tr from-[#7C3AED]/45 to-[#E879F9]/35 blur-xl nexora-glow-burst pointer-events-none"
            />
          </>
        )}

        {/* Multi-Piece Geometric N SVG */}
        <svg
          width={dims.box}
          height={dims.box}
          viewBox="-24 -24 112 112"
          fill="none"
          aria-hidden="true"
          className={`relative z-10 overflow-visible transition-transform duration-500 ${
            stage === 'success' ? 'scale-105' : 'scale-100'
          }`}
        >
          <defs>
            <linearGradient id={leftGrad} x1="15" y1="12" x2="24" y2="52" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#A855F7" />
              <stop offset="55%" stopColor="#7C3AED" />
              <stop offset="100%" stopColor="#3B0764" />
            </linearGradient>
            <linearGradient id={rightGrad} x1="40" y1="12" x2="49" y2="52" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#D8B4FE" />
              <stop offset="50%" stopColor="#8B5CF6" />
              <stop offset="100%" stopColor="#4C1D95" />
            </linearGradient>
            <linearGradient id={diagTopGrad} x1="15" y1="14" x2="38" y2="33" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#F5F3FF" />
              <stop offset="55%" stopColor="#C084FC" />
              <stop offset="100%" stopColor="#8B5CF6" />
            </linearGradient>
            <linearGradient id={diagBotGrad} x1="27" y1="32" x2="49" y2="50" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#A855F7" />
              <stop offset="55%" stopColor="#7C3AED" />
              <stop offset="100%" stopColor="#5B21B6" />
            </linearGradient>
            <linearGradient id={edgeGrad} x1="16" y1="14" x2="48" y2="50" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.92" />
              <stop offset="50%" stopColor="#E9D5FF" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#A855F7" stopOpacity="0.15" />
            </linearGradient>
            <filter id={glowFilter} x="-35%" y="-35%" width="170%" height="170%">
              <feDropShadow dx="0" dy="0" stdDeviation="2.6" floodColor="#8B5CF6" floodOpacity="0.6" />
            </filter>
          </defs>

          <g filter={`url(#${glowFilter})`}>
            {/* Piece 1: Left Vertical Monolith */}
            <g
              className={`nexora-shard ${isLoadingOrbit ? 'nexora-shard-loading nexora-shard-orbit-1' : ''}`}
              style={!isLoadingOrbit ? { transform: isLocked ? ASSEMBLED_TRANSFORM : SEPARATED_TRANSFORMS[0] } : undefined}
            >
              <path d="M15 50V14L24.2 18V50H15Z" fill={`url(#${leftGrad})`} />
            </g>

            {/* Piece 3: Inner 3D Bevel Prism */}
            <g
              className={`nexora-shard ${isLoadingOrbit ? 'nexora-shard-loading nexora-shard-orbit-3' : ''}`}
              style={!isLoadingOrbit ? { transform: isLocked ? ASSEMBLED_TRANSFORM : SEPARATED_TRANSFORMS[2] } : undefined}
            >
              <path d="M24.2 21L39.8 43.8V50L24.2 27.2V21Z" fill="#2E1065" fillOpacity="0.72" />
            </g>

            {/* Piece 5: Right Vertical Monolith */}
            <g
              className={`nexora-shard ${isLoadingOrbit ? 'nexora-shard-loading nexora-shard-orbit-5' : ''}`}
              style={!isLoadingOrbit ? { transform: isLocked ? ASSEMBLED_TRANSFORM : SEPARATED_TRANSFORMS[4] } : undefined}
            >
              <path d="M39.8 46V14H49V50L39.8 46Z" fill={`url(#${rightGrad})`} />
            </g>

            {/* Piece 2: Upper Diagonal Crystal */}
            <g
              className={`nexora-shard ${isLoadingOrbit ? 'nexora-shard-loading nexora-shard-orbit-2' : ''}`}
              style={!isLoadingOrbit ? { transform: isLocked ? ASSEMBLED_TRANSFORM : SEPARATED_TRANSFORMS[1] } : undefined}
            >
              <path d="M15 14H24.2L36.6 32H27.4Z" fill={`url(#${diagTopGrad})`} />
            </g>

            {/* Piece 4: Lower Diagonal Crystal */}
            <g
              className={`nexora-shard ${isLoadingOrbit ? 'nexora-shard-loading nexora-shard-orbit-4' : ''}`}
              style={!isLoadingOrbit ? { transform: isLocked ? ASSEMBLED_TRANSFORM : SEPARATED_TRANSFORMS[3] } : undefined}
            >
              <path d="M27.4 32H36.6L49 50H39.8Z" fill={`url(#${diagBotGrad})`} />
            </g>

            {/* Specular Lock-In Sheen Edge (illuminates once N pieces connect) */}
            <path
              d="M15.4 14.4H24L48.4 49.6"
              stroke={`url(#${edgeGrad})`}
              strokeWidth="1.05"
              strokeLinecap="round"
              style={{
                opacity: isLocked && !isLoadingOrbit ? 1 : 0,
                transition: 'opacity 360ms ease 240ms',
              }}
            />
          </g>
        </svg>
      </div>

      {/* NEXORA Brand Wordmark */}
      {showWordmark && (
        <div className="mt-1.5 flex flex-col items-center gap-1.5 text-center">
          <span
            className={`font-display font-bold uppercase text-transparent bg-clip-text bg-gradient-to-r from-white via-[#F3E8FF] to-[#C084FC] transition-all duration-700 ${dims.wordmark} ${
              isLocked || isLoadingOrbit ? 'opacity-100 translate-y-0' : 'opacity-65 translate-y-1'
            }`}
          >
            NEXORA
          </span>
          {statusText && (
            <p
              role="status"
              aria-live="polite"
              className={`text-xs font-medium transition-colors duration-300 ${
                stage === 'success' ? 'text-[#E9D5FF]' : 'text-[#C4B5FD]'
              }`}
            >
              {statusText}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
