import React, { useEffect, useMemo, useState } from 'react';
import {
  Ban,
  CheckCircle2,
  Flag,
  RotateCcw,
  ShieldAlert,
  Trash2,
  XCircle,
} from 'lucide-react';
import {
  adminRemoveContent,
  resolveReport,
  subscribeAuditLogs,
  subscribePlatformRoles,
  subscribeReports,
  suspendOrRestoreUser,
} from '../../../services/firebase/adminService';
import {
  AuditLogEntry,
  ModerationReport,
  PlatformRole,
  Post,
  Space,
  UserProfile,
  Vibe,
} from '../../../types/nexora';
import { formatRelativeTime } from '../../../utils/validation';

interface ModerationReportsPanelProps {
  actor: UserProfile;
  myRole: PlatformRole;
  posts: Post[];
  vibes: Vibe[];
  spaces: Space[];
  users: UserProfile[];
}

export function ModerationReportsPanel({
  actor,
  myRole,
  posts,
  vibes,
  spaces,
  users,
}: ModerationReportsPanelProps) {
  const [reports, setReports] = useState<ModerationReport[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [staffRoles, setStaffRoles] = useState<PlatformRole[]>([]);
  const [statusTab, setStatusTab] = useState<'open' | 'resolved' | 'dismissed'>('open');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    const u1 = subscribeReports(setReports);
    const u2 = subscribeAuditLogs(setAuditLogs);
    const u3 = subscribePlatformRoles(setStaffRoles);
    return () => {
      u1();
      u2();
      u3();
    };
  }, []);

  const ownerUidSet = useMemo(
    () => new Set(staffRoles.filter((r) => r.role === 'owner').map((r) => r.uid)),
    [staffRoles]
  );

  const filteredReports = useMemo(() => {
    return reports.filter((r) => (r.status || 'open') === statusTab);
  }, [reports, statusTab]);

  const moderationAudit = useMemo(
    () => auditLogs.filter((l) => l.category === 'moderation').slice(0, 15),
    [auditLogs]
  );

  const resolveTargetContext = (report: ModerationReport) => {
    if (report.targetType === 'post') {
      const p = posts.find((x) => x.id === report.targetId);
      const author = p ? users.find((u) => u.uid === p.authorId) : undefined;
      return {
        exists: Boolean(p),
        title: p ? `Post by @${p.authorUsername}` : `Post (${report.targetId})`,
        preview: p?.text || (p ? 'Media post' : 'Content already removed.'),
        author,
      };
    }
    if (report.targetType === 'vibe') {
      const v = vibes.find((x) => x.id === report.targetId);
      const author = v ? users.find((u) => u.uid === v.authorId) : undefined;
      return {
        exists: Boolean(v),
        title: v ? `Vibe by @${v.authorUsername}` : `Vibe (${report.targetId})`,
        preview: v?.caption || (v ? 'Video Vibe' : 'Vibe already removed.'),
        author,
      };
    }
    if (report.targetType === 'space') {
      const s = spaces.find((x) => x.id === report.targetId);
      const author = s ? users.find((u) => u.uid === s.ownerId) : undefined;
      return {
        exists: Boolean(s),
        title: s ? `Space: ${s.name}` : `Space (${report.targetId})`,
        preview: s?.description || 'Space already removed.',
        author,
      };
    }
    const targetUser = users.find((u) => u.uid === report.targetId);
    return {
      exists: Boolean(targetUser),
      title: targetUser ? `User @${targetUser.username}` : `User (${report.targetId})`,
      preview: targetUser?.bio || targetUser?.displayName || 'User profile',
      author: targetUser,
    };
  };

  const handleResolve = async (
    report: ModerationReport,
    status: 'resolved' | 'dismissed'
  ) => {
    setBusy(true);
    setFeedback(null);
    try {
      await resolveReport({
        actor,
        actorRole: myRole.role,
        report,
        status,
        resolutionNote: notes[report.id] || `Marked ${status} by moderation`,
      });
      setFeedback({ type: 'ok', text: `Report ${status}.` });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to resolve report.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteContent = async (report: ModerationReport) => {
    if (report.targetType === 'user') return;
    setBusy(true);
    setFeedback(null);
    try {
      await adminRemoveContent({
        actor,
        actorRole: myRole.role,
        targetType: report.targetType,
        targetId: report.targetId,
      });
      await resolveReport({
        actor,
        actorRole: myRole.role,
        report,
        status: 'resolved',
        resolutionNote: notes[report.id] || `Violating ${report.targetType} deleted`,
      });
      setFeedback({ type: 'ok', text: `Removed violating ${report.targetType} & resolved report.` });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to delete reported content.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleToggleSuspend = async (target: UserProfile, reason?: string) => {
    if (ownerUidSet.has(target.uid)) return;
    setBusy(true);
    setFeedback(null);
    try {
      await suspendOrRestoreUser({
        actor,
        actorRole: myRole.role,
        targetUser: target,
        suspend: !target.suspended,
        reason,
      });
      setFeedback({
        type: 'ok',
        text: target.suspended
          ? `Restored account @${target.username}.`
          : `Suspended account @${target.username}.`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to change account suspension state.',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold text-white flex items-center gap-2">
            <Flag size={18} className="text-amber-300" /> Moderation & Safety Queue
          </h2>
          <p className="text-xs text-[#94A3B8] mt-0.5">
            Inspect reported posts, Vibes, Spaces, and accounts. Remove violating media, suspend policy-violating users, and track moderation history.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {(['open', 'resolved', 'dismissed'] as const).map((tab) => {
            const count = reports.filter((r) => (r.status || 'open') === tab).length;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setStatusTab(tab)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium capitalize ${
                  statusTab === tab
                    ? 'bg-[#7C3AED] text-white'
                    : 'bg-[#08070F] border border-white/10 text-[#94A3B8] hover:text-white'
                }`}
              >
                {tab} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {feedback && (
        <div
          className={`px-4 py-3 rounded-xl border text-xs flex items-center justify-between ${
            feedback.type === 'ok'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-200'
          }`}
        >
          <span>{feedback.text}</span>
          <button type="button" onClick={() => setFeedback(null)} className="text-white/70 hover:text-white">
            Dismiss
          </button>
        </div>
      )}

      {/* Reports Feed */}
      <div className="space-y-3">
        {filteredReports.length === 0 ? (
          <div className="p-8 rounded-2xl bg-[#08070F] border border-white/[0.06] text-center text-xs text-[#64748B]">
            No {statusTab} reports in queue.
          </div>
        ) : (
          filteredReports.map((rep) => {
            const ctx = resolveTargetContext(rep);
            const reporter = users.find((u) => u.uid === rep.reporterId);
            const isProtectedOwner = ctx.author ? ownerUidSet.has(ctx.author.uid) : false;

            return (
              <div
                key={rep.id}
                className="p-5 rounded-2xl bg-[#08070F] border border-[#8B5CF6]/20 space-y-3"
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2 py-0.5 rounded-md bg-[#7C3AED]/20 text-[#E9D5FF] text-[10px] font-semibold uppercase">
                        {rep.targetType}
                      </span>
                      <span className="text-sm font-semibold text-white">{ctx.title}</span>
                      <span className="text-[11px] text-[#64748B]">
                        Reported by {reporter ? `@${reporter.username}` : rep.reporterId} •{' '}
                        {formatRelativeTime(rep.createdAt)}
                      </span>
                    </div>
                    <p className="text-xs text-amber-200 mt-1">Reason: {rep.reason}</p>
                  </div>

                  {(!rep.status || rep.status === 'open') && (
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {rep.targetType !== 'user' && ctx.exists && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleDeleteContent(rep)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-xs font-semibold text-white"
                        >
                          <Trash2 size={13} /> Delete {rep.targetType}
                        </button>
                      )}
                      {ctx.author && !isProtectedOwner && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void handleToggleSuspend(ctx.author!, rep.reason)
                          }
                          className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs ${
                            ctx.author.suspended
                              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-200'
                              : 'bg-amber-500/15 border-amber-500/30 text-amber-200'
                          }`}
                        >
                          {ctx.author.suspended ? <RotateCcw size={13} /> : <Ban size={13} />}
                          {ctx.author.suspended ? 'Restore Account' : 'Suspend Account'}
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleResolve(rep, 'resolved')}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white"
                      >
                        <CheckCircle2 size={13} /> Resolve
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleResolve(rep, 'dismissed')}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-[#CBD5E1]"
                      >
                        <XCircle size={13} /> Dismiss
                      </button>
                    </div>
                  )}
                </div>

                <p className="text-xs text-[#CBD5E1] bg-[#0D0B16] p-3 rounded-xl border border-white/[0.06] line-clamp-3">
                  {ctx.preview}
                </p>

                {(!rep.status || rep.status === 'open') ? (
                  <input
                    type="text"
                    value={notes[rep.id] || ''}
                    onChange={(e) =>
                      setNotes((prev) => ({ ...prev, [rep.id]: e.target.value }))
                    }
                    placeholder="Resolution note for audit log..."
                    className="w-full px-3 py-2 rounded-xl bg-[#0D0B16] border border-[#8B5CF6]/15 text-xs text-white outline-none"
                  />
                ) : (
                  rep.resolutionNote && (
                    <p className="text-[11px] text-[#94A3B8]">
                      Resolution note: {rep.resolutionNote}
                    </p>
                  )
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Quick User Suspension Roster */}
      <div className="rounded-2xl bg-[#08070F] border border-[#8B5CF6]/20 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-white/[0.06]">
          <h3 className="font-display text-sm font-semibold text-white">
            Currently Suspended Accounts
          </h3>
        </div>
        {users.filter((u) => u.suspended).length === 0 ? (
          <p className="p-5 text-xs text-[#64748B]">No suspended user accounts.</p>
        ) : (
          <div className="divide-y divide-white/[0.05]">
            {users
              .filter((u) => u.suspended)
              .map((u) => (
                <div key={u.uid} className="px-5 py-3 flex items-center justify-between gap-3 text-xs">
                  <div>
                    <p className="text-white font-medium">
                      {u.displayName} (@{u.username})
                    </p>
                    <p className="text-[11px] text-rose-300">
                      {u.suspendedReason || 'Suspended by moderation'}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleToggleSuspend(u)}
                    className="px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-xs text-emerald-200"
                  >
                    Restore Account
                  </button>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Moderation Audit Trail */}
      <div className="rounded-2xl bg-[#08070F] border border-[#8B5CF6]/20 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-white/[0.06] flex items-center gap-2">
          <ShieldAlert size={15} className="text-[#C084FC]" />
          <h3 className="font-display text-sm font-semibold text-white">
            Moderation Audit History
          </h3>
        </div>
        {moderationAudit.length === 0 ? (
          <p className="p-5 text-xs text-[#64748B]">No moderation actions recorded yet.</p>
        ) : (
          <div className="divide-y divide-white/[0.05]">
            {moderationAudit.map((log) => (
              <div key={log.id} className="px-5 py-3 flex items-center justify-between gap-3 text-xs">
                <div>
                  <span className="text-white font-medium">{log.action}</span>{' '}
                  {log.targetLabel && <span className="text-[#C084FC]">({log.targetLabel})</span>}
                  <p className="text-[11px] text-[#94A3B8]">
                    By {log.actorName} ({log.actorRole})
                    {log.details ? ` • ${log.details}` : ''}
                  </p>
                </div>
                <span className="text-[11px] text-[#64748B] font-mono-tabular">
                  {formatRelativeTime(log.createdAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
