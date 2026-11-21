import React from 'react';
import { BellOff, EyeOff, Moon, Sparkles } from 'lucide-react';
import {
  AdminManualMode,
  AdminPresenceStatus,
  PublicAdminPresenceStatus,
} from '../../types/nexora';

export type AnyPresenceDisplayStatus = AdminPresenceStatus | PublicAdminPresenceStatus;

interface PresenceBadgeProps {
  status?: AnyPresenceDisplayStatus | null;
  size?: 'xs' | 'sm' | 'md';
  showOffline?: boolean;
  showLabel?: boolean;
  className?: string;
}

export function getPresenceMeta(status?: AnyPresenceDisplayStatus | null): {
  label: string;
  textColor: string;
  dotColor: string;
} {
  switch (status) {
    case 'online':
      return { label: 'Online', textColor: 'text-emerald-300', dotColor: '#22C55E' };
    case 'idle':
      return { label: 'Idle', textColor: 'text-amber-300', dotColor: '#F59E0B' };
    case 'dnd':
      return { label: 'Do Not Disturb', textColor: 'text-rose-300', dotColor: '#EF4444' };
    case 'invisible':
      return { label: 'Invisible', textColor: 'text-[#94A3B8]', dotColor: '#64748B' };
    default:
      return { label: 'Offline', textColor: 'text-[#64748B]', dotColor: '#64748B' };
  }
}

export function PresenceBadge({
  status,
  size = 'sm',
  showOffline = false,
  showLabel = false,
  className = '',
}: PresenceBadgeProps) {
  if (!status || (status === 'offline' && !showOffline)) {
    return null;
  }

  const dim = size === 'xs' ? 10 : size === 'sm' ? 12 : 14;
  const meta = getPresenceMeta(status);

  return (
    <span
      className={`inline-flex items-center gap-1.5 shrink-0 ${className}`}
      title={meta.label}
      aria-label={`Status: ${meta.label}`}
    >
      {status === 'online' && (
        <span
          style={{ width: dim, height: dim }}
          className="inline-block rounded-full bg-emerald-500 ring-2 ring-[#0D0B16] shadow-[0_0_8px_rgba(34,197,94,0.55)]"
        />
      )}

      {status === 'idle' && (
        <span
          style={{ width: dim + 2, height: dim + 2 }}
          className="inline-flex items-center justify-center rounded-full bg-[#0D0B16] ring-1 ring-amber-500/40 shadow-[0_0_8px_rgba(245,158,11,0.45)]"
        >
          <svg
            width={dim}
            height={dim}
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M11.6 10.6A5.2 5.2 0 0 1 5.4 4.4a5.2 5.2 0 1 0 6.2 6.2Z"
              fill="#F59E0B"
            />
          </svg>
        </span>
      )}

      {status === 'dnd' && (
        <span
          style={{ width: dim + 2, height: dim + 2 }}
          className="inline-flex items-center justify-center rounded-full bg-rose-500 ring-2 ring-[#0D0B16] shadow-[0_0_8px_rgba(239,68,68,0.55)]"
        >
          <span className="block w-[55%] h-[2px] rounded-full bg-white" />
        </span>
      )}

      {(status === 'offline' || status === 'invisible') && (
        <span
          style={{ width: dim, height: dim }}
          className="inline-flex items-center justify-center rounded-full bg-[#475569] ring-2 ring-[#0D0B16]"
        >
          <span className="w-[46%] h-[46%] rounded-full bg-[#0D0B16]" />
        </span>
      )}

      {showLabel && (
        <span className={`text-[11px] font-medium ${meta.textColor}`}>{meta.label}</span>
      )}
    </span>
  );
}

interface TypingWithPresenceProps {
  status?: PublicAdminPresenceStatus | null;
  label?: string;
  compact?: boolean;
}

export function TypingWithPresence({
  status,
  label = 'typing',
  compact = false,
}: TypingWithPresenceProps) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#C084FC]">
      {status && status !== 'offline' && <PresenceBadge status={status} size="xs" />}
      <span className="inline-flex items-center gap-0.5">
        <span className="w-1 h-1 rounded-full bg-[#C084FC] animate-bounce [animation-delay:-0.25s]" />
        <span className="w-1 h-1 rounded-full bg-[#C084FC] animate-bounce [animation-delay:-0.12s]" />
        <span className="w-1 h-1 rounded-full bg-[#C084FC] animate-bounce" />
      </span>
      {!compact && <span>{label}...</span>}
    </span>
  );
}

interface AdminPresenceSelectorProps {
  currentMode: AdminManualMode;
  effectiveStatus: AnyPresenceDisplayStatus;
  onChange: (mode: AdminManualMode) => Promise<void> | void;
  busy?: boolean;
  compact?: boolean;
}

const PRESENCE_OPTIONS: {
  mode: AdminManualMode;
  badge: AnyPresenceDisplayStatus;
  label: string;
  hint: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
}[] = [
  {
    mode: 'auto',
    badge: 'online',
    label: 'Online',
    hint: 'Auto-Idle after 5m inactivity',
    Icon: Sparkles,
  },
  {
    mode: 'idle',
    badge: 'idle',
    label: 'Idle',
    hint: 'Yellow moon indicator',
    Icon: Moon,
  },
  {
    mode: 'dnd',
    badge: 'dnd',
    label: 'Do Not Disturb',
    hint: 'Red badge · Silences live popups',
    Icon: BellOff,
  },
  {
    mode: 'invisible',
    badge: 'invisible',
    label: 'Invisible',
    hint: 'Appears completely offline & hides typing',
    Icon: EyeOff,
  },
];

export function AdminPresenceSelector({
  currentMode,
  effectiveStatus,
  onChange,
  busy = false,
  compact = false,
}: AdminPresenceSelectorProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] uppercase tracking-wider font-semibold text-[#94A3B8]">
          Staff Presence Mode
        </span>
        <PresenceBadge status={effectiveStatus} size="sm" showOffline showLabel />
      </div>

      <div className={`grid gap-2 ${compact ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-2'}`}>
        {PRESENCE_OPTIONS.map((opt) => {
          const active = currentMode === opt.mode;
          return (
            <button
              key={opt.mode}
              type="button"
              disabled={busy}
              onClick={() => void onChange(opt.mode)}
              className={`flex items-start gap-2.5 p-2.5 rounded-xl border text-left transition-all ${
                active
                  ? 'bg-[#7C3AED]/15 border-[#8B5CF6]/55 text-white shadow-[0_0_16px_rgba(124,58,237,0.2)]'
                  : 'bg-[#08070F] border-white/10 text-[#CBD5E1] hover:border-[#8B5CF6]/35'
              } disabled:opacity-60`}
            >
              <div className="mt-0.5 shrink-0">
                <PresenceBadge status={opt.badge} size="sm" showOffline />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-white truncate">{opt.label}</p>
                <p className="text-[10px] text-[#94A3B8] leading-snug">{opt.hint}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
