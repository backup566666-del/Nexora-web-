import React, { useEffect, useMemo, useState } from 'react';
import {
  Ban,
  CheckCircle2,
  Flag,
  LifeBuoy,
  RotateCcw,
  ShieldAlert,
  Trash2,
  Users,
  XCircle,
} from 'lucide-react';
import {
  adminRemoveContent,
  adminResetPostCollabAndTags,
  resolveReport,
  subscribeAllContactSubmissions,
  subscribeAuditLogs,
  subscribePlatformRoles,
  subscribeReports,
  suspendOrRestoreUser,
  updateContactSubmission,
} from '../../../services/firebase/adminService';
import { extractReadableErrorMessage } from '../../../services/firebase/errorHandler';
import {
  AuditLogEntry,
  ContactSubmission,
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
  const [tickets, setTickets] = useState<ContactSubmission[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [staffRoles, setStaffRoles] = useState<PlatformRole[]>([]);

  const [panelView, setPanelView] = useState<'reports' | 'tickets'>('reports');
  const [statusTab, setStatusTab] = useState<'open' | 'resolved' | 'dismissed'>('open');
  const [ticketFilter, setTicketFilter] = useState<'open' | 'in_review' | 'resolved'>('open');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [ticketNotes, setTicketNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    const u1 = subscribeReports(setReports);
    const u2 = subscribeAuditLogs(setAuditLogs);
    const u3 = subscribePlatformRoles(setStaffRoles);
    const u4 = subscribeAllContactSubmissions(setTickets);
    return () => {
      u1();
      u2();
      u3();
      u4();
    };
  }, []);

  const ownerUidSet = useMemo(
    () => new Set(staffRoles.filter((r) => r.role === 'owner').map((r) => r.uid)),
    [staffRoles]
  );

  const filteredReports = useMemo(() => {
    return reports.filter((r) => (r.status || 'open') === statusTab);
  }, [reports, statusTab]);

  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => t.status === ticketFilter);
  }, [tickets, ticketFilter]);

  const moderationAudit = useMemo(
    () => auditLogs.filter((l) => l.category === 'moderation').slice(0, 15),
    [auditLogs]
  );

  const resolveTargetContext = (report: ModerationReport) => {
    if (report.targetType === 'post' || report.targetType === 'collab') {
      const p = posts.find((x) => x.id === report.targetId);
      const author = p ? users.find((u) => u.uid === p.authorId) : undefined;
      return {
        exists: Boolean(p),
        isPostEntity: true,
        title: p
          ? `${report.targetType === 'collab' ? 'Collab/Tag Report' : 'Post'} by @${p.authorUsername}`
          : `${report.targetType === 'collab' ? 'Collab Post' : 'Post'} (${report.targetId})`,
        preview: p?.text || (p ? 'Media post' : 'Content already removed.'),
        author,
      };
    }
    if (report.targetType === 'vibe') {
      const v = vibes.find((x) => x.id === report.targetId);
      const author = v ? users.find((u) => u.uid === v.authorId) : undefined;
      return {
        exists: Boolean(v),
        isPostEntity: false,
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
        isPostEntity: false,
        title: s ? `Space: ${s.name}` : `Space (${report.targetId})`,
        preview: s?.description || 'Space already removed.',
        author,
      };
    }
    if (report.targetType === 'gift') {
      return {
        exists: false,
        isPostEntity: false,
        title: `Virtual Gift (${report.targetId})`,
        preview: 'Reported gift message or transaction. Manage gift removal under Free Virtual Gifts.',
        author: undefined,
      };
    }
    const targetUser = users.find((u) => u.uid === report.targetId);
    return {
      exists: Boolean(targetUser),
      isPostEntity: false,
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
        text: extractReadableErrorMessage(err, 'Unable to resolve report.', {
          feature: 'admin:moderation',
        }),
      });
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteContent = async (report: ModerationReport) => {
    if (
      report.targetType !== 'post' &&
      report.targetType !== 'vibe' &&
      report.targetType !== 'space' &&
      report.targetType !== 'collab'
    ) {
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      const mappedType = report.targetType === 'collab' ? 'post' : report.targetType;
      await adminRemoveContent({
        actor,
        actorRole: myRole.role,
        targetType: mappedType,
        targetId: report.targetId,
      });
      await resolveReport({
        actor,
        actorRole: myRole.role,
        report,
        status: 'resolved',
        resolutionNote: notes[report.id] || `Violating ${mappedType} deleted`,
      });
      setFeedback({ type: 'ok', text: `Removed violating ${mappedType} & resolved report.` });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: extractReadableErrorMessage(err, 'Unable to delete reported content.', {
          feature: 'admin:moderation',
        }),
      });
    } finally {
      setBusy(false);
    }
  };

  const handleResetCollabTags = async (report: ModerationReport) => {
    setBusy(true);
    setFeedback(null);
    try {
      await adminResetPostCollabAndTags({
        actor,
        actorRole: myRole.role,
        postId: report.targetId,
      });
      await resolveReport({
        actor,
        actorRole: myRole.role,
        report,
        status: 'resolved',
        resolutionNote: notes[report.id] || 'Cleared post tags and collaboration invites',
      });
      setFeedback({ type: 'ok', text: 'Cleared tags & collaborator attributions and resolved report.' });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: extractReadableErrorMessage(err, 'Unable to clear post tags/collaborations.', {
          feature: 'admin:moderation',
        }),
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
        text: extractReadableErrorMessage(err, 'Unable to change account suspension state.', {
          feature: 'admin:moderation',
        }),
      });
    } finally {
      setBusy(false);
    }
  };

  const handleUpdateTicket = async (
    ticket: ContactSubmission,
    nextStatus: ContactSubmission['status']
  ) => {
    setBusy(true);
    setFeedback(null);
    try {
      await updateContactSubmission({
        actor,
        actorRole: myRole.role,
        submission: ticket,
        status: nextStatus,
        adminNote: ticketNotes[ticket.id] || ticket.adminNote || '',
      });
      setFeedback({
        type: 'ok',
        text: `Ticket "${ticket.subject}" updated to ${nextStatus.replace(/_/g, ' ')}.`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: extractReadableErrorMessage(err, 'Unable to update support ticket.', {
          feature: 'admin:support-tickets',
        }),
      });
    } finally {
      setBusy(false);
    }
  };

  const openReportsCount = reports.filter((r) => !r.status || r.status === 'open').length;
  const openTicketsCount = tickets.filter((t) => t.status === 'open').length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold text-white flex items-center gap-2">
            {panelView === 'reports' ? (
              <Flag size={18} className="text-amber-300" />
            ) : (
              <LifeBuoy size={18} className="text-sky-300" />
            )}
            {panelView === 'reports'
              ? 'Moderation & Safety Queue'
              : 'Support Tickets & Ban Appeals'}
          </h2>
          <p className="text-xs text-[#94A3B8] mt-0.5">
            Inspect reported content/collaborations/gifts, manage suspended accounts, and reply to support &amp; ban appeals.
          </p>
        </div>

        <div className="inline-flex items-center p-1 rounded-xl bg-[#08070F] border border-white/10 self-start">
          <button
            type="button"
            onClick={() => setPanelView('reports')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
              panelView === 'reports' ? 'bg-[#7C3AED] text-white' : 'text-[#94A3B8] hover:text-white'
            }`}
          >
            Reports ({openReportsCount})
          </button>
          <button
            type="button"
            onClick={() => setPanelView('tickets')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
              panelView === 'tickets' ? 'bg-[#7C3AED] text-white' : 'text-[#94A3B8] hover:text-white'
            }`}
          >
            Support &amp; Appeals ({openTicketsCount})
          </button>
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

      {panelView === 'reports' ? (
        <>
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
                          {ctx.isPostEntity && ctx.exists && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void handleResetCollabTags(rep)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#7C3AED]/20 hover:bg-[#7C3AED]/30 border border-[#8B5CF6]/30 text-xs text-[#E9D5FF]"
                            >
                              <Users size={13} /> Clear Collabs &amp; Tags
                            </button>
                          )}
                          {rep.targetType !== 'user' && rep.targetType !== 'gift' && ctx.exists && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void handleDeleteContent(rep)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-xs font-semibold text-white"
                            >
                              <Trash2 size={13} /> Delete {rep.targetType === 'collab' ? 'Post' : rep.targetType}
                            </button>
                          )}
                          {ctx.author && !isProtectedOwner && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void handleToggleSuspend(ctx.author!, rep.reason)}
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

                    {!rep.status || rep.status === 'open' ? (
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
        </>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-1.5">
            {(['open', 'in_review', 'resolved'] as const).map((tab) => {
              const count = tickets.filter((t) => t.status === tab).length;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setTicketFilter(tab)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium capitalize ${
                    ticketFilter === tab
                      ? 'bg-[#7C3AED] text-white'
                      : 'bg-[#08070F] border border-white/10 text-[#94A3B8] hover:text-white'
                  }`}
                >
                  {tab.replace('_', ' ')} ({count})
                </button>
              );
            })}
          </div>

          {filteredTickets.length === 0 ? (
            <div className="p-8 rounded-2xl bg-[#08070F] border border-white/[0.06] text-center text-xs text-[#64748B]">
              No {ticketFilter.replace('_', ' ')} support tickets or appeals.
            </div>
          ) : (
            <div className="space-y-3">
              {filteredTickets.map((ticket) => (
                <div
                  key={ticket.id}
                  className="p-5 rounded-2xl bg-[#08070F] border border-[#8B5CF6]/20 space-y-3"
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 rounded bg-sky-500/15 text-sky-300 text-[10px] font-semibold uppercase">
                          {ticket.category.replace(/_/g, ' ')}
                        </span>
                        <span className="text-sm font-semibold text-white">{ticket.subject}</span>
                        <span className="text-[11px] text-[#94A3B8]">
                          by {ticket.name} ({ticket.email}) • {formatRelativeTime(ticket.createdAt)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {ticket.status === 'open' && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleUpdateTicket(ticket, 'in_review')}
                          className="px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-xs text-amber-200"
                        >
                          Mark In Review
                        </button>
                      )}
                      {ticket.status !== 'resolved' && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleUpdateTicket(ticket, 'resolved')}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white"
                        >
                          <CheckCircle2 size={13} /> Resolve &amp; Notify
                        </button>
                      )}
                    </div>
                  </div>

                  <p className="text-xs text-[#CBD5E1] bg-[#0D0B16] p-3 rounded-xl border border-white/[0.06] whitespace-pre-wrap">
                    {ticket.message}
                  </p>

                  {ticket.status !== 'resolved' ? (
                    <input
                      type="text"
                      value={ticketNotes[ticket.id] ?? ticket.adminNote ?? ''}
                      onChange={(e) =>
                        setTicketNotes((prev) => ({ ...prev, [ticket.id]: e.target.value }))
                      }
                      placeholder="Response note sent via in-app notification & email when updated..."
                      className="w-full px-3 py-2 rounded-xl bg-[#0D0B16] border border-[#8B5CF6]/15 text-xs text-white outline-none"
                    />
                  ) : (
                    ticket.adminNote && (
                      <p className="text-[11px] text-[#94A3B8]">
                        Admin response: {ticket.adminNote}
                      </p>
                    )
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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
