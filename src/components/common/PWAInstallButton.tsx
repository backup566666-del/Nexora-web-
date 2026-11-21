import React, { useState } from 'react';
import { Download, Share, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'compact' | 'card';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ variant = 'compact' }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    if (variant === 'card') {
      return (
        <div className="p-4 rounded-xl bg-[#08070F] border border-emerald-500/25 flex items-center gap-3 text-xs text-emerald-300">
          <Smartphone size={16} className="shrink-0" />
          <span>Nexora is installed on this device in standalone app mode.</span>
        </div>
      );
    }
    return null;
  }

  const iosModal = showIOSGuide ? (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      onClick={() => setShowIOSGuide(false)}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-[#0E0C18] border border-[#8B5CF6]/30 p-6 shadow-2xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-display text-base font-bold text-white">Install Nexora on iPhone / iPad</h3>
          <button
            type="button"
            onClick={() => setShowIOSGuide(false)}
            className="p-1 text-[#94A3B8] hover:text-white"
            aria-label="Close install instructions"
          >
            <X size={16} />
          </button>
        </div>
        <ol className="space-y-2.5 text-xs text-[#CBD5E1] leading-relaxed list-decimal list-inside">
          <li>
            Tap the <strong className="text-white inline-flex items-center gap-1"><Share size={12} /> Share</strong> button in your Safari toolbar.
          </li>
          <li>
            Scroll down and tap <strong className="text-white">Add to Home Screen</strong>.
          </li>
          <li>
            Tap <strong className="text-white">Add</strong> to launch Nexora full-screen from your home screen.
          </li>
        </ol>
        <button
          type="button"
          onClick={() => setShowIOSGuide(false)}
          className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#6D28D9] to-[#7C3AED] text-xs font-semibold text-white"
        >
          Got it
        </button>
      </div>
    </div>
  ) : null;

  if (isInstallable) {
    return (
      <>
        <button
          type="button"
          onClick={() => void install()}
          className={
            variant === 'card'
              ? 'inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#6D28D9] via-[#7C3AED] to-[#9333EA] hover:brightness-110 text-xs font-semibold text-white shadow-[0_4px_16px_rgba(124,58,237,0.35)] transition-all'
              : 'inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#7C3AED]/20 hover:bg-[#7C3AED]/30 border border-[#8B5CF6]/40 text-xs font-semibold text-[#E9D5FF] transition-colors min-h-[38px]'
          }
        >
          <Download size={14} />
          <span>Install App</span>
        </button>
        {iosModal}
      </>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className={
            variant === 'card'
              ? 'inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#08070F] hover:bg-white/5 border border-[#8B5CF6]/35 text-xs font-semibold text-white transition-colors'
              : 'inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#0E0C18] hover:border-[#8B5CF6]/50 border border-[#8B5CF6]/20 text-xs font-medium text-[#CBD5E1] min-h-[38px]'
          }
        >
          <Smartphone size={14} className="text-[#C084FC]" />
          <span>Install on iOS</span>
        </button>
        {iosModal}
      </>
    );
  }

  if (variant === 'card') {
    return (
      <p className="text-xs text-[#94A3B8]">
        To install Nexora as an app on Android or desktop, use Chrome or Edge and select{' '}
        <span className="text-white font-medium">Install Nexora</span> from the browser menu.
      </p>
    );
  }

  return null;
};
