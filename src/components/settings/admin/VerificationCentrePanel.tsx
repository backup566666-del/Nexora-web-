import React, { useEffect, useMemo, useState } from 'react';
import { BadgeCheck, CheckCircle2, Crown, Search, XCircle } from 'lucide-react';
import { useAuth } from '../../../hooks/useAuth';
import {
  assignUserBadge,
  reviewVerificationRequest,
  revokeUserBadge,
  subscribeAllVerificationRequests,
} from '../../../services/firebase/adminService';
import {
  PlatformRole,
  UserProfile,
  VerificationRequest,
  VerifiedBadgeType,
} from '../../../types/nexora';
import { BADGE_LABELS, formatRelativeTime } from '../../../utils/validation';
import { ResilientImage } from '../../common/ResilientImage';
import { VerifiedBadge } from '../../common/VerifiedBadge';

interface VerificationCentrePanelProps {
  actor: UserProfile;
  myRole: PlatformRole;
  users: UserProfile[];
}

const ASSIGNABLE_BADGES: Exclude<VerifiedBadgeType, 'owner'>[] = [
  'verified',
  'creator',
  'partner',
  'founder_circle',
];

export function VerificationCentrePanel({
  actor,
  myRole,
  users,
}: VerificationCentrePanelProps) {
  const { badgesMap } = useAuth();
  const [requests, setRequests] = useState<VerificationRequest[]>([]);
  const [search, setSearch] = useState('');
  const [selectedBadgeByUid, setSelectedBadgeByUid] = useState<
    Record<string, Exclude<VerifiedBadgeType, 'owner'>>
  >({});
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    return subscribeAllVerificationRequests(setRequests);
  }, []);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users
      .filter(
        (u) =>
          !q ||
          u.displayName.toLowerCase().includes(q) ||
          u.username.toLowerCase().includes(q)
      )
      .slice(0, 30);
  }, [users, search]);

  const handleAssignBadge = async (target: UserProfile) => {
    const current = badgesMap[target.uid]?.badgeType;
    if (current === 'owner') return;
    const badgeType = selectedBadgeByUid[target.uid] || 'verified';
    setBusy(true);
    setFeedback(null);
    try {
      await assignUserBadge({
        actor,
        actorRole: myRole.role,
        targetUser: target,
        badgeType,
      });
      setFeedback({
        type: 'ok',
        text: `Granted "${BADGE_LABELS[badgeType]}" badge to @${target.username}.`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to assign badge.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleRevokeBadge = async (target: UserProfile) => {
    const current = badgesMap[target.uid]?.badgeType;
    if (current === 'owner') return;
    setBusy(true);
    setFeedback(null);
    try {
      await revokeUserBadge({
        actor,
        actorRole: myRole.role,
        targetUser: target,
      });
      setFeedback({ type: 'ok', text: `Revoked verification badge from @${target.username}.` });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to revoke badge.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleReviewRequest = async (
    req: VerificationRequest,
    decision: 'approved' | 'rejected'
  ) => {
    setBusy(true);
    setFeedback(null);
    try {
      await reviewVerificationRequest({
        actor,
        actorRole: myRole.role,
        request: req,
        decision,
        reviewerNote: reviewNotes[req.id] || '',
      });
      setFeedback({
        type: 'ok',
        text: `Verification application for @${req.username} ${decision}.`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to submit review decision.',
      });
    } finally {
      setBusy(false);
    }
  };

  const pendingCount = requests.filter((r) => r.status === 'pending').length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold text-white flex items-center gap-2">
            <BadgeCheck size={18} className="text-[#C084FC]" /> Verification Centre
          </h2>
          <p className="text-xs text-[#94A3B8] mt-0.5">
            Review verification badge applications and issue or revoke Verified, Creator, Partner, and Founder Circle badges.
          </p>
        </div>
        <span className="px-3 py-1.5 rounded-lg bg-[#08070F] border border-[#8B5CF6]/20 text-xs font-mono-tabular text-amber-300">
          Pending Applications: <strong>{pendingCount}</strong>
        </span>
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

      {/* Verification Requests Queue */}
      <div className="rounded-2xl bg-[#08070F] border border-[#8B5CF6]/20 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-white/[0.06]">
          <h3 className="font-display text-sm font-semibold text-white">
            Verification Applications ({requests.length})
          </h3>
        </div>
        {requests.length === 0 ? (
          <p className="p-5 text-xs text-[#64748B]">
            No verification badge applications have been submitted yet.
          </p>
        ) : (
          <div className="divide-y divide-white/[0.06]">
            {requests.map((req) => (
              <div key={req.id} className="p-4 sm:p-5 space-y-3">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <ResilientImage
                      src={req.avatarUrl}
                      alt={req.displayName}
                      className="w-9 h-9 rounded-full object-cover shrink-0"
                    />
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-white">
                          {req.displayName}
                        </span>
                        <span className="text-xs text-[#64748B]">@{req.username}</span>
                        <span className="px-2 py-0.5 rounded-md bg-[#7C3AED]/15 border border-[#8B5CF6]/30 text-[10px] font-semibold text-[#E9D5FF]">
                          Requests: {BADGE_LABELS[req.requestedBadge]}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase ${
                            req.status === 'approved'
                              ? 'bg-emerald-500/15 text-emerald-300'
                              : req.status === 'rejected'
                              ? 'bg-rose-500/15 text-rose-300'
                              : 'bg-amber-500/15 text-amber-300'
                          }`}
                        >
                          {req.status}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#94A3B8] mt-0.5">
                        Category: {req.category} • Submitted {formatRelativeTime(req.createdAt)}
                        {req.referenceLink ? ` • Ref: ${req.referenceLink}` : ''}
                      </p>
                    </div>
                  </div>

                  {req.status === 'pending' && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleReviewRequest(req, 'approved')}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white"
                      >
                        <CheckCircle2 size={13} /> Approve & Grant
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleReviewRequest(req, 'rejected')}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/25 text-xs text-rose-200"
                      >
                        <XCircle size={13} /> Reject
                      </button>
                    </div>
                  )}
                </div>

                <p className="text-xs text-[#CBD5E1] bg-[#0D0B16] p-3 rounded-xl border border-white/[0.06]">
                  {req.rationale}
                </p>

                {req.status === 'pending' ? (
                  <input
                    type="text"
                    value={reviewNotes[req.id] || ''}
                    onChange={(e) =>
                      setReviewNotes((prev) => ({ ...prev, [req.id]: e.target.value }))
                    }
                    placeholder="Reviewer decision note (optional)..."
                    className="w-full px-3 py-2 rounded-xl bg-[#0D0B16] border border-[#8B5CF6]/15 text-xs text-white outline-none"
                  />
                ) : (
                  req.reviewerNote && (
                    <p className="text-[11px] text-[#94A3B8]">
                      Reviewer note: {req.reviewerNote}
                    </p>
                  )
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Direct Account Badge Management */}
      <div className="rounded-2xl bg-[#08070F] border border-[#8B5CF6]/20 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3 className="font-display text-sm font-semibold text-white">
            Direct Badge Assignment & Revocation
          </h3>
          <div className="relative w-full sm:w-64">
            <Search size={14} className="absolute left-3 top-2.5 text-[#64748B]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search user..."
              className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-[#0D0B16] border border-[#8B5CF6]/20 text-xs text-white outline-none"
            />
          </div>
        </div>

        <div className="divide-y divide-white/[0.05]">
          {filteredUsers.map((u) => {
            const trustedRecord = badgesMap[u.uid];
            const isOwnerAccount = trustedRecord?.badgeType === 'owner';
            const selected =
              selectedBadgeByUid[u.uid] ||
              (trustedRecord && trustedRecord.badgeType !== 'owner'
                ? trustedRecord.badgeType
                : 'verified');

            return (
              <div
                key={u.uid}
                className="px-5 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <ResilientImage
                    src={u.avatarUrl}
                    alt={u.displayName}
                    className="w-9 h-9 rounded-full object-cover shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium text-white truncate">
                        {u.displayName}
                      </span>
                      {trustedRecord ? (
                        <VerifiedBadge size={14} variant={trustedRecord.badgeType} />
                      ) : u.verified ? (
                        <VerifiedBadge size={14} variant="verified" />
                      ) : null}
                    </div>
                    <p className="text-xs text-[#94A3B8] truncate">
                      @{u.username} •{' '}
                      {trustedRecord
                        ? trustedRecord.label
                        : u.verified
                        ? 'Legacy Verified'
                        : 'Unverified Member'}
                    </p>
                  </div>
                </div>

                {isOwnerAccount ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500/10 border border-sky-400/30 text-[11px] font-medium text-sky-200 shrink-0">
                    <Crown size={12} /> Permanent Blue Owner Badge (Protected)
                  </span>
                ) : (
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <select
                      value={selected}
                      onChange={(e) =>
                        setSelectedBadgeByUid((prev) => ({
                          ...prev,
                          [u.uid]: e.target.value as Exclude<VerifiedBadgeType, 'owner'>,
                        }))
                      }
                      className="px-3 py-1.5 rounded-lg bg-[#0D0B16] border border-[#8B5CF6]/20 text-xs text-white"
                    >
                      {ASSIGNABLE_BADGES.map((b) => (
                        <option key={b} value={b}>
                          {BADGE_LABELS[b]}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleAssignBadge(u)}
                      className="px-3 py-1.5 rounded-lg bg-[#7C3AED] hover:bg-[#6D28D9] text-xs font-semibold text-white"
                    >
                      Assign Badge
                    </button>
                    {(trustedRecord || u.verified) && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleRevokeBadge(u)}
                        className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 text-xs text-rose-300"
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
