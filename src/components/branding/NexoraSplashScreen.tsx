import React, { useEffect, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { AnimatedNexoraLogo } from './AnimatedNexoraLogo';
import { NexoraParticleBackdrop } from './NexoraParticleBackdrop';

interface NexoraSplashScreenProps {
  authReady: boolean;
  hasActiveSession: boolean;
  onComplete: () => void;
}

export function NexoraSplashScreen({
  authReady,
  hasActiveSession,
  onComplete,
}: NexoraSplashScreenProps) {
  const prefersReducedMotion = useReducedMotion();
  const [assemblyDone, setAssemblyDone] = useState(Boolean(prefersReducedMotion));
  const [exiting, setExiting] = useState(false);

  // Finish splash as soon as real auth check resolves AND the N logo finishes assembling
  useEffect(() => {
    if (!authReady || !assemblyDone) return;
    setExiting(true);
    const fadeDelay = prefersReducedMotion ? 40 : 320;
    const timer = window.setTimeout(() => {
      onComplete();
    }, fadeDelay);
    return () => window.clearTimeout(timer);
  }, [authReady, assemblyDone, prefersReducedMotion, onComplete]);

  const statusLabel = !authReady
    ? 'Starting Nexora...'
    : hasActiveSession
    ? 'Restoring your session...'
    : 'Ready';

  return (
    <div
      className={`fixed inset-0 z-[90] min-h-[100dvh] bg-[#06060A] text-[#F8FAFC] flex flex-col items-center justify-center px-6 transition-opacity duration-300 ${
        exiting ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
      role="status"
      aria-live="polite"
      aria-label="Loading Nexora"
    >
      <NexoraParticleBackdrop />

      <div className="relative z-10 flex flex-col items-center gap-6">
        <AnimatedNexoraLogo
          stage={exiting ? 'success' : 'assembling'}
          size="xl"
          showWordmark
          onAssemblyComplete={() => setAssemblyDone(true)}
        />

        {/* Subtle Electric Violet Loading Line */}
        <div className="w-44 h-[2px] rounded-full bg-white/[0.08] overflow-hidden">
          <div className="h-full w-1/2 rounded-full bg-gradient-to-r from-[#6D28D9] via-[#A855F7] to-[#E9D5FF] nexora-loading-sweep" />
        </div>

        <p className="text-xs font-medium tracking-wide text-[#94A3B8]">
          {statusLabel}
        </p>
      </div>
    </div>
  );
}
