import React from 'react';

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

export function NexoraParticleBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 overflow-hidden pointer-events-none select-none z-0"
    >
      {/* Deep black + dark electric-violet atmospheric gradients */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 75% 55% at 50% 0%, rgba(109, 40, 217, 0.24) 0%, rgba(76, 29, 149, 0.08) 45%, rgba(6, 6, 10, 0) 78%), radial-gradient(circle at 18% 82%, rgba(124, 58, 237, 0.14) 0%, transparent 45%), radial-gradient(circle at 86% 24%, rgba(168, 85, 247, 0.12) 0%, transparent 40%)',
        }}
      />

      {/* Subtle architectural hairline grid */}
      <div
        className="absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(168, 85, 247, 0.45) 1px, transparent 1px), linear-gradient(to bottom, rgba(168, 85, 247, 0.45) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
        }}
      />

      {/* Lightweight GPU-composited drifting violet particles */}
      {PARTICLES.map((p, idx) => (
        <span
          key={idx}
          className="absolute rounded-full bg-[#C084FC] nexora-particle-drift motion-reduce:hidden"
          style={
            {
              left: p.left,
              top: p.top,
              width: `${p.size}px`,
              height: `${p.size}px`,
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
