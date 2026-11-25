import React from 'react';
import { useTheme } from '../../hooks/useTheme';

const PARTICLES = [
  { left: '8%', top: '14%', size: 3, dur: '6.5s', delay: '0s' },
  { left: '16%', top: '72%', size: 4, dur: '8.2s', delay: '0.6s' },
  { left: '24%', top: '34%', size: 2.5, dur: '7.4s', delay: '1.1s' },
  { left: '31%', top: '86%', size: 3.5, dur: '9s', delay: '0.3s' },
  { left: '42%', top: '18%', size: 2.5, dur: '6.8s', delay: '1.8s' },
  { left: '53%', top: '66%', size: 3, dur: '7.9s', delay: '0.9s' },
  { left: '61%', top: '12%', size: 4, dur: '8.4s', delay: '0.4s' },
  { left: '69%', top: '44%', size: 2.5, dur: '6.2s', delay: '1.5s' },
  { left: '77%', top: '79%', size: 3.5, dur: '7.6s', delay: '0.7s' },
  { left: '84%', top: '24%', size: 3, dur: '8.8s', delay: '1.3s' },
  { left: '91%', top: '58%', size: 2.5, dur: '6.9s', delay: '0.2s' },
  { left: '13%', top: '48%', size: 2, dur: '7.2s', delay: '2.1s' },
  { left: '47%', top: '91%', size: 3, dur: '8.1s', delay: '1.4s' },
  { left: '88%', top: '88%', size: 3.5, dur: '7.5s', delay: '0.5s' },
];

const LIGHT_TRAILS = [
  { top: '22%', left: '-12%', width: '58%', height: '2px', rot: '-16deg', dur: '13s', delay: '0s', opacity: '0.38' },
  { top: '64%', left: '34%', width: '62%', height: '2px', rot: '-21deg', dur: '16s', delay: '3.2s', opacity: '0.32' },
  { top: '42%', left: '10%', width: '74%', height: '1.5px', rot: '14deg', dur: '18s', delay: '1.4s', opacity: '0.24' },
];

export interface NexoraParticleBackdropProps {
  variant?: 'full' | 'subtle';
}

export function NexoraParticleBackdrop({ variant = 'full' }: NexoraParticleBackdropProps) {
  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === 'light';
  const isSubtle = variant === 'subtle';
  const visibleParticles = isSubtle ? PARTICLES.slice(0, 7) : PARTICLES;
  const visibleTrails = isSubtle ? LIGHT_TRAILS.slice(0, 2) : LIGHT_TRAILS;

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 overflow-hidden pointer-events-none select-none z-0"
    >
      {/* Atmospheric gradients adapted for Dark or Light mode */}
      <div
        className="absolute inset-0"
        style={{
          background: isLight
            ? isSubtle
              ? 'radial-gradient(ellipse 75% 50% at 50% 0%, rgba(124, 58, 237, 0.10) 0%, rgba(139, 92, 246, 0.04) 45%, rgba(246, 245, 251, 0) 78%), radial-gradient(circle at 86% 24%, rgba(168, 85, 247, 0.07) 0%, transparent 40%)'
              : 'radial-gradient(ellipse 75% 55% at 50% 0%, rgba(124, 58, 237, 0.14) 0%, rgba(139, 92, 246, 0.06) 45%, rgba(246, 245, 251, 0) 78%), radial-gradient(circle at 18% 82%, rgba(124, 58, 237, 0.08) 0%, transparent 45%), radial-gradient(circle at 86% 24%, rgba(168, 85, 247, 0.09) 0%, transparent 40%)'
            : isSubtle
            ? 'radial-gradient(ellipse 75% 50% at 50% 0%, rgba(109, 40, 217, 0.16) 0%, rgba(76, 29, 149, 0.06) 45%, rgba(6, 6, 10, 0) 78%), radial-gradient(circle at 86% 24%, rgba(168, 85, 247, 0.08) 0%, transparent 40%)'
            : 'radial-gradient(ellipse 75% 55% at 50% 0%, rgba(109, 40, 217, 0.24) 0%, rgba(76, 29, 149, 0.08) 45%, rgba(6, 6, 10, 0) 78%), radial-gradient(circle at 18% 82%, rgba(124, 58, 237, 0.14) 0%, transparent 45%), radial-gradient(circle at 86% 24%, rgba(168, 85, 247, 0.12) 0%, transparent 40%)',
        }}
      />

      {/* Subtle architectural hairline grid */}
      <div
        className={`absolute inset-0 ${isSubtle ? 'opacity-[0.025]' : 'opacity-[0.04]'}`}
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(124, 58, 237, 0.35) 1px, transparent 1px), linear-gradient(to bottom, rgba(124, 58, 237, 0.35) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
        }}
      />

      {/* Clean futuristic violet light trails (GPU transform + opacity only) */}
      {visibleTrails.map((trail, idx) => (
        <span
          key={`trail-${idx}`}
          className="absolute rounded-full nexora-light-trail motion-reduce:hidden"
          style={
            {
              top: trail.top,
              left: trail.left,
              width: trail.width,
              height: trail.height,
              background:
                'linear-gradient(90deg, rgba(124,58,237,0) 0%, rgba(168,85,247,0.55) 35%, rgba(233,213,255,0.8) 50%, rgba(139,92,246,0.45) 68%, rgba(124,58,237,0) 100%)',
              boxShadow: '0 0 18px rgba(168, 85, 247, 0.45)',
              '--trail-rot': trail.rot,
              '--trail-dur': trail.dur,
              '--trail-delay': trail.delay,
              '--trail-opacity': isSubtle ? '0.2' : trail.opacity,
            } as React.CSSProperties
          }
        />
      ))}

      {/* Lightweight GPU-composited drifting violet particles */}
      {visibleParticles.map((p, idx) => (
        <span
          key={idx}
          className="absolute rounded-full bg-[#C084FC] nexora-particle-drift motion-reduce:hidden"
          style={
            {
              left: p.left,
              top: p.top,
              width: `${p.size}px`,
              height: `${p.size}px`,
              opacity: isSubtle ? 0.45 : undefined,
              boxShadow: '0 0 10px rgba(168, 85, 247, 0.75)',
              '--particle-dur': p.dur,
              '--particle-delay': p.delay,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
