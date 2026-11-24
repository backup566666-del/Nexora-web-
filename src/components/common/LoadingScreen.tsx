import React from 'react';
import { AnimatedNexoraLogo } from '../branding/AnimatedNexoraLogo';
import { NexoraParticleBackdrop } from '../branding/NexoraParticleBackdrop';

export function LoadingScreen({ label = 'Preparing your Nexora workspace...' }: { label?: string }) {
  return (
    <div
      className="relative min-h-[100dvh] bg-[#06060A] text-[#F8FAFC] flex flex-col items-center justify-center p-6"
      role="status"
      aria-live="polite"
    >
      <NexoraParticleBackdrop />
      <div className="relative z-10 flex flex-col items-center gap-5">
        <AnimatedNexoraLogo stage="loading" size="xl" showWordmark statusText={label} />
        <div className="w-40 h-[2px] rounded-full bg-white/[0.08] overflow-hidden">
          <div className="h-full w-1/2 rounded-full bg-gradient-to-r from-[#6D28D9] via-[#A855F7] to-[#E9D5FF] nexora-loading-sweep" />
        </div>
      </div>
    </div>
  );
}
