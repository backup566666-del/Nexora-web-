import React from 'react';
import { AlertCircle, RefreshCw, X } from 'lucide-react';

interface FriendlyErrorBannerProps {
  message: string | null;
  onRetry?: () => void;
  onDismiss?: () => void;
  retryLabel?: string;
  className?: string;
}

export function FriendlyErrorBanner({
  message,
  onRetry,
  onDismiss,
  retryLabel = 'Try Again',
  className = '',
}: FriendlyErrorBannerProps) {
  if (!message) return null;

  return (
    <div
      role="alert"
      className={`rounded-2xl bg-rose-500/10 border border-rose-400/30 px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs text-rose-100 ${className}`}
    >
      <div className="flex items-start gap-2.5 min-w-0 flex-1">
        <AlertCircle size={16} className="text-rose-300 shrink-0 mt-0.5" />
        <p className="leading-relaxed break-words">{message}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="min-h-[36px] px-3 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/30 text-white font-semibold inline-flex items-center gap-1.5 transition-colors"
          >
            <RefreshCw size={12} /> {retryLabel}
          </button>
        )}
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss error"
            className="min-h-[36px] min-w-[36px] rounded-xl hover:bg-white/10 text-rose-200 flex items-center justify-center"
          >
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
