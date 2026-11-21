import React, { useEffect, useMemo, useState } from 'react';
import {
  BadgeCheck,
  CheckCircle2,
  Compass,
  PauseCircle,
  PlayCircle,
  Search,
  Shield,
  Trash2,
  UserCheck,
  Users,
} from 'lucide-react';
import {
  adminDeleteSpace,
  adminKickSpaceMember,
  adminSetSpaceMemberRole,
  getSpaceMembersOnce,
  subscribeReports,
  updateSpaceGovernance,
} from '../../../services/firebase/adminService';
import { extractReadableErrorMessage } from '../../../services/firebase/errorHandler';
import {
  ModerationReport,
  PlatformRole,
  Space,
  SpaceMember,
  UserProfile,
} from '../../../types/nexora';
import { formatCompactCount, formatRelativeTime } from '../../../utils/validation';
import { ResilientImage } from '../../common/ResilientImage';

interface CommunityControlPanelProps {
  actor: UserProfile;
  myRole: PlatformRole;
  spaces: Space[];
  users: UserProfile[];
}

export function CommunityControlPanel({
  actor,
  myRole,
  spaces,
  users,
}: CommunityControlPanelProps) {
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'pending' | 'suspended'>('all');
  const [search, setSearch] = useState('');
  const [inspectSpace, setInspectSpace] = useState<Space | null>(null);
  const [members, setMembers] = useState<SpaceMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [reassignUid, setReassignUid] = useState('');
  const [suspendReasonMap, setSuspendReasonMap] = useState<Record<string, string>>({});
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [spaceReports, setSpaceReports] = useState<ModerationReport[]>([]);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    return subscribeReports((all) => {
      setSpaceReports(all.filter((r) => r.targetType === 'space'));
    });
  }, []);

  const filteredSpaces = useMemo(() => {
    const q = search.trim().toLowerCase();
    return spaces
      .filter((s) => {
        const status = s.status || 'active';
        if (filterStatus !== 'all' && status !== filterStatus) return false;
        if (!q) return true;
        return (
          s.name.toLowerCase().includes(q) ||
          s.category.toLowerCase().includes(q) ||
          s.ownerUsername.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const rank = (s: Space) => (s.status === 'pending' ? 0 : s.status === 'suspended' ? 1 : 2);
        return rank(a) - rank(b);
      });
  }, [spaces, filterStatus, search]);

  const counts = useMemo(() => {
    let active = 0;
    let pending = 0;
    let suspended = 0;
    spaces.forEach((s) => {
      if (s.status === 'pending') pending++;
      else if (s.status === 'suspended') suspended++;
      else active++;
    });
    return { active, pending, suspended };
  }, [spaces]);

  const openMembersInspector = async (space: Space) => {
    setInspectSpace(space);
    setReassignUid(space.ownerId);
    setLoadingMembers(true);
    try {
      const list = await getSpaceMembersOnce(space.id);
      setMembers(list);
    } catch {
      setMembers([]);
    } finally {
      setLoadingMembers(false);
    }
  };

  const handleStatusChange = async (
    space: Space,
    status: 'active' | 'suspended',
    actionLabel: string
  ) => {
    setBusy(true);
    setFeedback(null);
    try {
      await updateSpaceGovernance({
        actor,
        actorRole: myRole.role,
        space,
        updates: {
          status,
          suspensionReason:
            status === 'suspended'
              ? suspendReasonMap[space.id]?.trim() || 'Community guidelines review'
              : '',
        },
        actionLabel,
      });
      setFeedback({ type: 'ok', text: `${space.name} marked as ${status}.` });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: extractReadableErrorMessage(err, 'Unable to update Space status.', { feature: 'admin:space-status' }),
      });
    } finally {
      setBusy(false);
    }
  };

  const handleToggleVerified = async (space: Space) => {
    setBusy(true);
    setFeedback(null);
    try {
      await updateSpaceGovernance({
        actor,
        actorRole: myRole.role,
        space,
        updates: { verified: !space.verified },
        actionLabel: space.verified ? 'Removed Space verification' : 'Verified Space',
      });
      setFeedback({
        type: 'ok',
        text: space.verified ? `Removed verification from ${space.name}.` : `Verified ${space.name}.`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: extractReadableErrorMessage(err, 'Unable to update Space verification.', { feature: 'admin:space-verify' }),
      });
    } finally {
      setBusy(false);
    }
  };

  const handleReassignOwner = async () => {
    if (!inspectSpace || !reassignUid || reassignUid === inspectSpace.ownerId) return;
    const nextOwner = users.find((u) => u.uid === reassignUid);
    if (!nextOwner) return;
    setBusy(true);
    setFeedback(null);
    try {
      await updateSpaceGovernance({
        actor,
        actorRole: myRole.role,
        space: inspectSpace,
        updates: {
          ownerId: nextOwner.uid,
          ownerName: nextOwner.displayName,
          ownerUsername: nextOwner.username,
        },
        actionLabel: `Reassigned Space owner to @${nextOwner.username}`,
      });
      const updatedList = await getSpaceMembersOnce(inspectSpace.id);
      setMembers(updatedList);
      setInspectSpace((prev) =>
        prev
          ? {
              ...prev,
              ownerId: nextOwner.uid,
              ownerName: nextOwner.displayName,
              ownerUsername: nextOwner.username,
            }
          : null
      );
      setFeedback({
        type: 'ok',
        text: `Ownership of ${inspectSpace.name} reassigned to @${nextOwner.username}.`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: extractReadableErrorMessage(err, 'Unable to reassign Space owner.', { feature: 'admin:space-owner' }),
      });
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteSpace = async (space: Space) => {
    setBusy(true);
    setFeedback(null);
    try {
      await adminDeleteSpace({ actor, actorRole: myRole.role, space });
      setConfirmDeleteId(null);
      if (inspectSpace?.id === space.id) setInspectSpace(null);
      setFeedback({ type: 'ok', text: `Deleted Space "${space.name}".` });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: extractReadableErrorMessage(err, 'Unable to delete Space.', { feature: 'admin:space-delete' }),
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
            <Compass size={18} className="text-[#C084FC]" /> Community & Space Governance
          </h2>
          <p className="text-xs text-[#94A3B8] mt-0.5">
            Approve pending communities, assign verified badges, manage Space moderators, reassign ownership, or suspend non-compliant Spaces.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono-tabular">
          <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-emerald-300">
            Active: {counts.active}
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/25 text-amber-300">
            Pending: {counts.pending}
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-rose-500/10 border border-rose-500/25 text-rose-300">
            Suspended: {counts.suspended}
          </span>
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

      {/* Search & Status Filters */}
      <div className="flex flex-col sm:flex-row gap-3 justify-between">
        <div className="relative flex-1 max-w-md">
          <Search size={14} className="absolute left-3 top-2.5 text-[#64748B]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter Spaces by name, category, or owner..."
            className="w-full pl-8 pr-3 py-2 rounded-xl bg-[#08070F] border border-[#8B5CF6]/20 text-xs text-white outline-none"
          />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {(['all', 'pending', 'active', 'suspended'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setFilterStatus(tab)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium capitalize transition ${
                filterStatus === tab
                  ? 'bg-[#7C3AED] text-white'
                  : 'bg-[#08070F] border border-white/10 text-[#94A3B8] hover:text-white'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Spaces Grid */}
      <div className="space-y-3">
        {filteredSpaces.length === 0 ? (
          <div className="p-8 rounded-2xl bg-[#08070F] border border-white/[0.06] text-center text-xs text-[#64748B]">
            No Spaces match the current filter.
          </div>
        ) : (
          filteredSpaces.map((space) => {
            const status = space.status || 'active';
            const reportCount = spaceReports.filter(
              (r) => r.targetId === space.id && (!r.status || r.status === 'open')
            ).length;

            return (
              <div
                key={space.id}
                className="p-4 sm:p-5 rounded-2xl bg-[#08070F] border border-[#8B5CF6]/20 space-y-3"
              >
                <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <ResilientImage
                      src={space.coverUrl}
                      alt={space.name}
                      className="w-12 h-12 rounded-xl object-cover shrink-0 border border-white/10"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-display font-semibold text-sm text-white truncate">
                          {space.name}
                        </span>
                        {space.verified && (
                          <BadgeCheck size={14} className="text-[#A855F7] shrink-0" />
                        )}
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase ${
                            status === 'pending'
                              ? 'bg-amber-500/15 text-amber-300 border border-amber-500/25'
                              : status === 'suspended'
                              ? 'bg-rose-500/15 text-rose-300 border border-rose-500/25'
                              : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25'
                          }`}
                        >
                          {status}
                        </span>
                        {space.isPrivate && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] bg-white/5 text-[#CBD5E1]">
                            Private
                          </span>
                        )}
                        {reportCount > 0 && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] bg-rose-500/20 text-rose-200 font-semibold">
                            {reportCount} Open Report{reportCount > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#94A3B8] truncate mt-0.5">
                        {space.category} • Owner: @{space.ownerUsername} •{' '}
                        <span className="font-mono-tabular">
                          {formatCompactCount(space.membersCount)} members
                        </span>
                      </p>
                      <p className="text-[11px] text-[#64748B] line-clamp-1 mt-0.5">
                        {space.description}
                      </p>
                    </div>
                  </div>

                  {/* Governance Controls */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {status === 'pending' && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void handleStatusChange(space, 'active', 'Approved pending Space')
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white"
                      >
                        <CheckCircle2 size={13} /> Approve
                      </button>
                    )}

                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleToggleVerified(space)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs ${
                        space.verified
                          ? 'bg-[#7C3AED]/20 border-[#8B5CF6]/40 text-[#E9D5FF]'
                          : 'bg-white/5 hover:bg-white/10 border-white/10 text-[#CBD5E1]'
                      }`}
                    >
                      <BadgeCheck size={13} />
                      {space.verified ? 'Unverify' : 'Verify Space'}
                    </button>

                    <button
                      type="button"
                      onClick={() => void openMembersInspector(space)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-white"
                    >
                      <Users size={13} /> Members & Owner
                    </button>

                    {status === 'suspended' ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void handleStatusChange(space, 'active', 'Restored suspended Space')
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-xs text-emerald-200"
                      >
                        <PlayCircle size={13} /> Restore
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void handleStatusChange(space, 'suspended', 'Suspended Space')
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/25 text-xs text-amber-200"
                      >
                        <PauseCircle size={13} /> Suspend
                      </button>
                    )}

                    {confirmDeleteId === space.id ? (
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleDeleteSpace(space)}
                          className="px-2.5 py-1.5 rounded-lg bg-rose-600 text-xs font-semibold text-white"
                        >
                          Confirm Delete
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-2 py-1.5 rounded-lg bg-white/5 text-xs text-[#94A3B8]"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(space.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 text-xs text-rose-300"
                      >
                        <Trash2 size={13} /> Delete
                      </button>
                    )}
                  </div>
                </div>

                {status !== 'suspended' && (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={suspendReasonMap[space.id] || ''}
                      onChange={(e) =>
                        setSuspendReasonMap((m) => ({ ...m, [space.id]: e.target.value }))
                      }
                      placeholder="Optional suspension note before clicking Suspend..."
                      className="flex-1 px-3 py-1.5 rounded-lg bg-[#0D0B16] border border-white/[0.06] text-[11px] text-[#CBD5E1] outline-none"
                    />
                  </div>
                )}

                {status === 'suspended' && space.suspensionReason && (
                  <p className="text-[11px] text-rose-300/90 bg-rose-500/10 px-3 py-1.5 rounded-lg border border-rose-500/20">
                    Suspension reason: {space.suspensionReason}
                  </p>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Space Members & Ownership Drawer */}
      {inspectSpace && (
        <div className="p-5 rounded-2xl bg-[#08070F] border border-[#8B5CF6]/40 space-y-4">
          <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] pb-3">
            <div>
              <h3 className="font-display text-sm font-bold text-white">
                Managing Members & Ownership — {inspectSpace.name}
              </h3>
              <p className="text-[11px] text-[#94A3B8]">
                Current Owner: {inspectSpace.ownerName} (@{inspectSpace.ownerUsername})
              </p>
            </div>
            <button
              type="button"
              onClick={() => setInspectSpace(null)}
              className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-[#CBD5E1]"
            >
              Close
            </button>
          </div>

          {/* Reassign Owner */}
          <div className="flex flex-col sm:flex-row sm:items-end gap-3 p-3.5 rounded-xl bg-[#0D0B16] border border-white/[0.06]">
            <label className="flex-1 space-y-1">
              <span className="text-xs font-medium text-[#CBD5E1]">Reassign Community Owner</span>
              <select
                value={reassignUid}
                onChange={(e) => setReassignUid(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#08070F] border border-[#8B5CF6]/20 text-xs text-white"
              >
                {users.map((u) => (
                  <option key={u.uid} value={u.uid}>
                    {u.displayName} (@{u.username})
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={busy || reassignUid === inspectSpace.ownerId}
              onClick={() => void handleReassignOwner()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-xs font-semibold text-white disabled:opacity-40"
            >
              <UserCheck size={14} /> Transfer Ownership
            </button>
          </div>

          {/* Space Members Table */}
          {loadingMembers ? (
            <p className="text-xs text-[#94A3B8]">Loading members...</p>
          ) : members.length === 0 ? (
            <p className="text-xs text-[#64748B]">No member records found in this Space.</p>
          ) : (
            <div className="divide-y divide-white/[0.05] rounded-xl bg-[#0D0B16] border border-white/[0.06]">
              {members.map((m) => {
                const isSpaceOwner = m.uid === inspectSpace.ownerId || m.role === 'owner';
                return (
                  <div
                    key={m.uid}
                    className="px-4 py-2.5 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <ResilientImage
                        src={m.avatarUrl}
                        alt={m.displayName}
                        className="w-7 h-7 rounded-full object-cover shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="text-white font-medium truncate">
                          {m.displayName}{' '}
                          <span className="text-[#64748B] font-normal">@{m.username}</span>
                        </p>
                        <p className="text-[10px] text-[#94A3B8] uppercase">{m.role}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {!isSpaceOwner && (
                        <>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={async () => {
                              setBusy(true);
                              try {
                                const nextRole = m.role === 'admin' ? 'member' : 'admin';
                                await adminSetSpaceMemberRole({
                                  actor,
                                  actorRole: myRole.role,
                                  space: inspectSpace,
                                  memberUid: m.uid,
                                  memberUsername: m.username,
                                  role: nextRole,
                                });
                                setMembers((prev) =>
                                  prev.map((item) =>
                                    item.uid === m.uid ? { ...item, role: nextRole } : item
                                  )
                                );
                              } finally {
                                setBusy(false);
                              }
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] text-[#CBD5E1]"
                          >
                            <Shield size={11} />
                            {m.role === 'admin' ? 'Demote to Member' : 'Make Space Mod'}
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={async () => {
                              setBusy(true);
                              try {
                                await adminKickSpaceMember({
                                  actor,
                                  actorRole: myRole.role,
                                  space: inspectSpace,
                                  memberUid: m.uid,
                                  memberUsername: m.username,
                                });
                                setMembers((prev) => prev.filter((item) => item.uid !== m.uid));
                              } finally {
                                setBusy(false);
                              }
                            }}
                            className="px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-[11px] text-rose-300"
                          >
                            Remove
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Community Moderation Reports */}
      {spaceReports.length > 0 && (
        <div className="rounded-2xl bg-[#08070F] border border-[#8B5CF6]/20 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-white/[0.06]">
            <h3 className="font-display text-sm font-semibold text-white">
              Community-Specific Reports ({spaceReports.length})
            </h3>
          </div>
          <div className="divide-y divide-white/[0.05]">
            {spaceReports.slice(0, 10).map((rep) => {
              const sp = spaces.find((s) => s.id === rep.targetId);
              return (
                <div key={rep.id} className="px-5 py-3 flex items-center justify-between gap-3 text-xs">
                  <div>
                    <p className="text-white font-medium">
                      {sp ? sp.name : rep.targetId}{' '}
                      <span className="text-[10px] uppercase px-2 py-0.5 rounded bg-white/5 text-[#CBD5E1]">
                        {rep.status || 'open'}
                      </span>
                    </p>
                    <p className="text-[#94A3B8] text-[11px]">{rep.reason}</p>
                  </div>
                  <span className="text-[11px] text-[#64748B] font-mono-tabular">
                    {formatRelativeTime(rep.createdAt)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
