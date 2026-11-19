import React from 'react';
import { NexoraLogo } from '../branding/NexoraLogo';

export function LoadingScreen({ label = 'Preparing your Nexora workspace' }: { label?: string }) {
  return (
    <div className="min-h-screen bg-[#06060A] text-[#F8FAFC] flex flex-col items-center justify-center p-6">
      <div className="flex flex-col items-center gap-6">
        <div className="relative flex items-center justify-center">
          <div className="absolute inset-0 rounded-2xl bg-[#7C3AED]/20 blur-xl" />
          <NexoraLogo variant="icon" size="xl" className="relative" />
        </div>
        <NexoraLogo variant="wordmark" size="md" />
        <div className="w-44 h-0.5 bg-white/10 rounded-full overflow-hidden">
          <div className="h-full w-1/2 bg-gradient-to-r from-[#4C1D95] via-[#8B5CF6] to-[#A855F7] animate-[pulse_1.4s_ease-in-out_infinite]" />
        </div>
        <p className="text-xs text-[#94A3B8] tracking-wide">{label}</p>
      </div>
    </div>
  );
}
