import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  BadgeCheck,
  BarChart3,
  Compass,
  FileText,
  Film,
  Flag,
  RefreshCw,
  ShieldAlert,
  UserCheck,
  Users,
} from 'lucide-react';
import { fetchRealPlatformAnalytics } from '../../../services/firebase/adminService';
import { extractReadableErrorMessage } from '../../../services/firebase/errorHandler';
import { PlatformAnalyticsSnapshot } from '../../../types/nexora';
import { formatCompactCount } from '../../../utils/validation';

export function PlatformAnalyticsPanel() {
  const [snapshot, setSnapshot] = useState<PlatformAnalyticsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchRealPlatformAnalytics();
      setSnapshot(data);
    } catch (err) {
      setError(
        extractReadableErrorMessage(err, 'Unable to load platform metrics right now.', {
          feature: 'admin:analytics',
        })
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAnalytics();
  }, [loadAnalytics]);

  const cards = snapshot
    ? [
        {
          label: 'Registered Accounts',
          value: formatCompactCount(snapshot.totalUsers),
          sub: `${snapshot.registrations24h} in 24h • ${snapshot.registrations7d} in 7d`,
          icon: Users,
          accent: 'text-[#C084FC]',
        },
        {
          label: 'Active Online Now',
          value: formatCompactCount(snapshot.onlineUsers),
          sub: 'Live presence flag',
          icon: Activity,
          accent: 'text-emerald-400',
        },
        {
          label: 'Verified Accounts',
          value: formatCompactCount(snapshot.verifiedUsers),
          sub: `${snapshot.pendingVerifications} pending applications`,
          icon: BadgeCheck,
          accent: 'text-sky-400',
        },
        {
          label: 'Suspended Accounts',
          value: formatCompactCount(snapshot.suspendedUsers),
          sub: 'Blocked from posting & access',
          icon: ShieldAlert,
          accent: 'text-rose-400',
        },
        {
          label: 'Total Feed Posts',
          value: formatCompactCount(snapshot.totalPosts),
          sub: `${formatCompactCount(snapshot.totalEngagement)} total engagements`,
          icon: FileText,
          accent: 'text-[#A855F7]',
        },
        {
          label: 'Vibes Published',
          value: formatCompactCount(snapshot.totalVibes),
          sub: `${formatCompactCount(snapshot.totalVibeViews)} recorded views`,
          icon: Film,
          accent: 'text-fuchsia-400',
        },
        {
          label: 'Communities (Spaces)',
          value: formatCompactCount(snapshot.totalSpaces),
          sub: `${snapshot.activeSpaces} active • ${snapshot.pendingSpaces} pending • ${snapshot.suspendedSpaces} suspended`,
          icon: Compass,
          accent: 'text-indigo-300',
        },
        {
          label: 'Open Moderation Reports',
          value: formatCompactCount(snapshot.openReports),
          sub: 'Awaiting staff resolution',
          icon: Flag,
          accent: snapshot.openReports > 0 ? 'text-amber-400' : 'text-emerald-400',
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold text-white flex items-center gap-2">
            <BarChart3 size={18} className="text-[#C084FC]" /> Real-Time Platform Analytics
          </h2>
          <p className="text-xs text-[#94A3B8] mt-0.5">
            Direct Firestore aggregation snapshot across users, posts, Vibes, Spaces, verifications, and reports. Zero simulated values.
          </p>
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={() => void loadAnalytics()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-xs font-medium text-white disabled:opacity-50"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Refreshing...' : 'Refresh Snapshot'}
        </button>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-200">
          {error}
        </div>
      )}

      {loading && !snapshot ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, idx) => (
            <div
              key={idx}
              className="h-28 rounded-2xl bg-[#08070F] border border-white/[0.06] animate-pulse"
            />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {cards.map((card) => {
              const Icon = card.icon;
              return (
                <div
                  key={card.label}
                  className="p-5 rounded-2xl bg-[#08070F] border border-[#8B5CF6]/20 space-y-2.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-[#94A3B8]">{card.label}</span>
                    <Icon size={16} className={card.accent} />
                  </div>
                  <p className="font-mono-tabular text-2xl font-bold text-white">{card.value}</p>
                  <p className="text-[11px] text-[#64748B]">{card.sub}</p>
                </div>
              );
            })}
          </div>

          {snapshot && (
            <div className="p-4 rounded-2xl bg-[#08070F] border border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-[#94A3B8]">
              <span className="inline-flex items-center gap-2">
                <UserCheck size={14} className="text-emerald-400" />
                Verified & live telemetry directly queried from Firestore collections.
              </span>
              <span className="font-mono-tabular text-[11px] text-[#64748B]">
                Computed at {snapshot.computedAt.toLocaleTimeString()}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
