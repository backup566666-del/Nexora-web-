import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Crown,
  PauseCircle,
  PlayCircle,
  Search,
  Shield,
  ShieldAlert,
  Trash2,
  UserPlus,
} from 'lucide-react';
import {
  appointStaffMember,
  revokeStaffAccess,
  subscribeAuditLogs,
  subscribePlatformRoles,
  toggleStaffActiveStatus,
  updateStaffRoleAndPermissions,
} from '../../../services/firebase/adminService';
import { extractReadableErrorMessage } from '../../../services/firebase/errorHandler';
import {
  AdminPermission,
  AuditLogEntry,
  InternalRole,
  PlatformRole,
  UserProfile,
} from '../../../types/nexora';
import {
  ALL_ADMIN_PERMISSIONS,
  formatRelativeTime,
  ROLE_DEFAULT_PERMISSIONS,
  ROLE_LABELS,
} from '../../../utils/validation';
import { ResilientImage } from '../../common/ResilientImage';
import { VerifiedBadge } from '../../common/VerifiedBadge';

interface AdminManagementPanelProps {
  actor: UserProfile;
  myRole: PlatformRole;
  users: UserProfile[];
}

const ASSIGNABLE_ROLES: Exclude<InternalRole, 'owner'>[] = [
  'administrator',
  'moderator',
  'verification_reviewer',
  'support',
];

export function AdminManagementPanel({ actor, myRole, users }: AdminManagementPanelProps) {
  const [staffRoles, setStaffRoles] = useState<PlatformRole[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUid, setSelectedUid] = useState('');
  const [staffEmail, setStaffEmail] = useState('');
  const [newRole, setNewRole] = useState<Exclude<InternalRole, 'owner'>>('moderator');
  const [newPermissions, setNewPermissions] = useState<AdminPermission[]>(
    ROLE_DEFAULT_PERMISSIONS.moderator
  );
  const [specialBadge, setSpecialBadge] = useState('');
  const [editingUid, setEditingUid] = useState<string | null>(null);
  const [editRole, setEditRole] = useState<Exclude<InternalRole, 'owner'>>('moderator');
  const [editPermissions, setEditPermissions] = useState<AdminPermission[]>([]);
  const [confirmRevokeUid, setConfirmRevokeUid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const isOwnerActor = myRole.role === 'owner';

  useEffect(() => {
    const u1 = subscribePlatformRoles(setStaffRoles);
    const u2 = subscribeAuditLogs(setAuditLogs);
    return () => {
      u1();
      u2();
    };
  }, []);

  const staffUidSet = useMemo(() => new Set(staffRoles.map((r) => r.uid)), [staffRoles]);

  const candidateUsers = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return users
      .filter((u) => !staffUidSet.has(u.uid))
      .filter(
        (u) =>
          !q ||
          u.displayName.toLowerCase().includes(q) ||
          u.username.toLowerCase().includes(q)
      )
      .slice(0, 12);
  }, [users, staffUidSet, searchTerm]);

  const selectedCandidate = useMemo(
    () => users.find((u) => u.uid === selectedUid) || null,
    [users, selectedUid]
  );

  const adminAuditLogs = useMemo(
    () => auditLogs.filter((l) => l.category === 'admin').slice(0, 18),
    [auditLogs]
  );

  const handleRolePresetChange = (role: Exclude<InternalRole, 'owner'>) => {
    setNewRole(role);
    setNewPermissions([...ROLE_DEFAULT_PERMISSIONS[role]]);
  };

  const toggleNewPerm = (perm: AdminPermission) => {
    setNewPermissions((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]
    );
  };

  const handleAppoint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCandidate) {
      setFeedback({ type: 'err', text: 'Select a Nexora member from the directory first.' });
      return;
    }
    if (newRole === 'administrator' && !isOwnerActor) {
      setFeedback({ type: 'err', text: 'Only the Nexora Owner can appoint Administrators.' });
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      await appointStaffMember({
        actor,
        actorRole: myRole.role,
        targetUser: selectedCandidate,
        email: staffEmail.trim() || `${selectedCandidate.username}@nexora.member`,
        role: newRole,
        permissions: newPermissions,
        specialBadge,
      });
      setSelectedUid('');
      setStaffEmail('');
      setSpecialBadge('');
      setSearchTerm('');
      setFeedback({
        type: 'ok',
        text: `@${selectedCandidate.username} appointed as ${ROLE_LABELS[newRole]}.`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: extractReadableErrorMessage(err, 'Unable to appoint staff member.', { feature: 'admin:staff-appoint' }),
      });
    } finally {
      setBusy(false);
    }
  };

  const startEditing = (staff: PlatformRole) => {
    if (staff.role === 'owner') return;
    setEditingUid(staff.uid);
    setEditRole(staff.role as Exclude<InternalRole, 'owner'>);
    setEditPermissions([...(staff.permissions || [])]);
    setConfirmRevokeUid(null);
  };

  const handleSaveEdit = async (target: PlatformRole) => {
    setBusy(true);
    setFeedback(null);
    try {
      await updateStaffRoleAndPermissions({
        actor,
        actorRole: myRole.role,
        target,
        nextRole: editRole,
        nextPermissions: editPermissions,
      });
      setEditingUid(null);
      setFeedback({ type: 'ok', text: `Updated role & permissions for @${target.username}.` });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: extractReadableErrorMessage(err, 'Failed to update staff permissions.', { feature: 'admin:staff-edit' }),
      });
    } finally {
      setBusy(false);
    }
  };

  const handleToggleActive = async (target: PlatformRole) => {
    setBusy(true);
    setFeedback(null);
    try {
      await toggleStaffActiveStatus({ actor, actorRole: myRole.role, target });
      setFeedback({
        type: 'ok',
        text: target.active
          ? `Suspended administrative access for @${target.username}.`
          : `Restored administrative access for @${target.username}.`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: extractReadableErrorMessage(err, 'Unable to change staff status.', { feature: 'admin:staff-status' }),
      });
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async (target: PlatformRole) => {
    setBusy(true);
    setFeedback(null);
    try {
      await revokeStaffAccess({ actor, actorRole: myRole.role, target });
      setConfirmRevokeUid(null);
      setFeedback({ type: 'ok', text: `Revoked all administrative access for @${target.username}.` });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: extractReadableErrorMessage(err, 'Unable to revoke staff access.', { feature: 'admin:staff-revoke' }),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold text-white flex items-center gap-2">
            <Shield size={18} className="text-[#38BDF8]" />
            Admin & Staff Access Control
          </h2>
          <p className="text-xs text-[#94A3B8] mt-0.5">
            5-tier RBAC governance. The permanent Owner role is cryptographically anchored and cannot be demoted or removed.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono-tabular">
          <span className="px-3 py-1.5 rounded-lg bg-[#08070F] border border-[#8B5CF6]/20 text-[#CBD5E1]">
            Staff: <strong className="text-white">{staffRoles.length}</strong>
          </span>
          <span className="px-3 py-1.5 rounded-lg bg-[#08070F] border border-[#8B5CF6]/20 text-emerald-300">
            Active: <strong>{staffRoles.filter((s) => s.active).length}</strong>
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
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-white/70 hover:text-white ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Appoint New Staff Form */}
      <form
        onSubmit={handleAppoint}
        className="p-5 rounded-2xl bg-[#08070F] border border-[#8B5CF6]/20 space-y-4"
      >
        <h3 className="font-display text-sm font-semibold text-white flex items-center gap-2">
          <UserPlus size={15} className="text-[#C084FC]" /> Appoint Staff Member
        </h3>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Member Picker */}
          <div className="space-y-2">
            <label className="block text-xs font-medium text-[#CBD5E1]">
              1. Select Member
            </label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-2.5 text-[#64748B]" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search display name or @handle"
                className="w-full pl-8 pr-3 py-2 rounded-xl bg-[#0D0B16] border border-[#8B5CF6]/20 text-xs text-white outline-none focus:border-[#8B5CF6]"
              />
            </div>
            <div className="max-h-40 overflow-y-auto rounded-xl bg-[#0D0B16] border border-white/[0.06] divide-y divide-white/[0.05]">
              {candidateUsers.length === 0 ? (
                <p className="p-3 text-[11px] text-[#64748B]">
                  No eligible non-staff members match.
                </p>
              ) : (
                candidateUsers.map((u) => {
                  const chosen = u.uid === selectedUid;
                  return (
                    <button
                      key={u.uid}
                      type="button"
                      onClick={() => setSelectedUid(u.uid)}
                      className={`w-full flex items-center justify-between px-3 py-2 text-left text-xs transition ${
                        chosen ? 'bg-[#7C3AED]/25 text-white' : 'hover:bg-white/5 text-[#CBD5E1]'
                      }`}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <ResilientImage
                          src={u.avatarUrl}
                          alt={u.displayName}
                          className="w-6 h-6 rounded-full object-cover shrink-0"
                        />
                        <span className="truncate font-medium">{u.displayName}</span>
                        <span className="text-[#64748B] truncate">@{u.username}</span>
                      </span>
                      {chosen && <Check size={14} className="text-[#C084FC] shrink-0" />}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Role & Contact Email */}
          <div className="space-y-3">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-[#CBD5E1]">2. Assign Staff Role</span>
              <select
                value={newRole}
                onChange={(e) => handleRolePresetChange(e.target.value as Exclude<InternalRole, 'owner'>)}
                className="w-full px-3 py-2.5 rounded-xl bg-[#0D0B16] border border-[#8B5CF6]/20 text-xs text-white outline-none"
              >
                {ASSIGNABLE_ROLES.map((r) => (
                  <option
                    key={r}
                    value={r}
                    disabled={r === 'administrator' && !isOwnerActor}
                  >
                    {ROLE_LABELS[r]}
                    {r === 'administrator' && !isOwnerActor ? ' (Owner Only)' : ''}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-[#CBD5E1]">Staff Contact Email (Optional)</span>
              <input
                type="email"
                value={staffEmail}
                onChange={(e) => setStaffEmail(e.target.value)}
                placeholder={
                  selectedCandidate
                    ? `${selectedCandidate.username}@nexora.member`
                    : 'staff@domain.com'
                }
                className="w-full px-3 py-2 rounded-xl bg-[#0D0B16] border border-[#8B5CF6]/20 text-xs text-white outline-none"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-[#CBD5E1]">Internal Title Label (Optional)</span>
              <input
                type="text"
                maxLength={40}
                value={specialBadge}
                onChange={(e) => setSpecialBadge(e.target.value)}
                placeholder="e.g. Trust & Safety Lead"
                className="w-full px-3 py-2 rounded-xl bg-[#0D0B16] border border-[#8B5CF6]/20 text-xs text-white outline-none"
              />
            </label>
          </div>

          {/* Granular Permissions */}
          <div className="space-y-2">
            <span className="block text-xs font-medium text-[#CBD5E1]">
              3. Granular Permissions ({newPermissions.length})
            </span>
            <div className="grid grid-cols-1 gap-1.5 max-h-48 overflow-y-auto pr-1">
              {ALL_ADMIN_PERMISSIONS.map((perm) => {
                const checked = newPermissions.includes(perm.key);
                return (
                  <label
                    key={perm.key}
                    className={`flex items-start gap-2.5 px-3 py-2 rounded-xl border text-xs cursor-pointer transition ${
                      checked
                        ? 'bg-[#7C3AED]/15 border-[#8B5CF6]/40 text-white'
                        : 'bg-[#0D0B16] border-white/[0.06] text-[#94A3B8]'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleNewPerm(perm.key)}
                      className="mt-0.5 accent-[#7C3AED]"
                    />
                    <span>
                      <strong className="block font-medium text-white">{perm.label}</strong>
                      <span className="text-[11px] text-[#94A3B8]">{perm.description}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-white/[0.06]">
          <p className="text-[11px] text-[#94A3B8]">
            {selectedCandidate
              ? `Ready to appoint ${selectedCandidate.displayName} (@${selectedCandidate.username})`
              : 'Choose an account above to grant Nexora Administration access.'}
          </p>
          <button
            type="submit"
            disabled={busy || !selectedCandidate}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#6D28D9] via-[#7C3AED] to-[#9333EA] text-xs font-semibold text-white disabled:opacity-40"
          >
            {busy ? 'Assigning...' : 'Grant Staff Role'}
          </button>
        </div>
      </form>

      {/* Current Staff Roster */}
      <div className="rounded-2xl bg-[#08070F] border border-[#8B5CF6]/20 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-white/[0.06] flex items-center justify-between">
          <h3 className="font-display text-sm font-semibold text-white">
            Current Staff & Administrators
          </h3>
          <span className="text-[11px] text-[#64748B]">Real-time Firestore RBAC Registry</span>
        </div>

        <div className="divide-y divide-white/[0.06]">
          {staffRoles.map((staff) => {
            const isOwnerRow = staff.role === 'owner';
            const canModifyRow =
              !isOwnerRow && (isOwnerActor || staff.role !== 'administrator');
            const isEditing = editingUid === staff.uid;
            const userProfile = users.find((u) => u.uid === staff.uid);

            return (
              <div key={staff.uid} className="p-4 sm:p-5 space-y-3">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <ResilientImage
                      src={userProfile?.avatarUrl}
                      alt={staff.displayName}
                      className="w-10 h-10 rounded-full object-cover shrink-0 ring-1 ring-[#8B5CF6]/40"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-sm text-white truncate">
                          {staff.displayName}
                        </span>
                        {isOwnerRow && <VerifiedBadge size={14} variant="owner" />}
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wide ${
                            isOwnerRow
                              ? 'bg-sky-500/20 text-sky-300 border border-sky-400/30'
                              : staff.role === 'administrator'
                              ? 'bg-[#7C3AED]/20 text-[#E9D5FF] border border-[#8B5CF6]/30'
                              : 'bg-white/5 text-[#CBD5E1] border border-white/10'
                          }`}
                        >
                          {ROLE_LABELS[staff.role]}
                        </span>
                        {!staff.active && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/25">
                            Suspended
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#94A3B8] truncate">
                        @{staff.username} • {staff.email}
                        {staff.specialBadge ? ` • ${staff.specialBadge}` : ''}
                      </p>
                    </div>
                  </div>

                  {/* Row Actions */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {isOwnerRow ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500/10 border border-sky-400/25 text-[11px] font-medium text-sky-200">
                        <Crown size={12} /> Permanent Platform Owner (Protected)
                      </span>
                    ) : canModifyRow ? (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            isEditing ? setEditingUid(null) : startEditing(staff)
                          }
                          className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-white"
                        >
                          {isEditing ? 'Close Editor' : 'Edit Permissions'}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleToggleActive(staff)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs ${
                            staff.active
                              ? 'bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/25 text-amber-200'
                              : 'bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/25 text-emerald-200'
                          }`}
                        >
                          {staff.active ? <PauseCircle size={13} /> : <PlayCircle size={13} />}
                          {staff.active ? 'Suspend' : 'Restore'}
                        </button>
                        {confirmRevokeUid === staff.uid ? (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void handleRevoke(staff)}
                              className="px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-xs font-semibold text-white"
                            >
                              Confirm Revoke
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmRevokeUid(null)}
                              className="px-2 py-1.5 rounded-lg bg-white/5 text-xs text-[#94A3B8]"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmRevokeUid(staff.uid)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 text-xs text-rose-300"
                          >
                            <Trash2 size={13} /> Revoke
                          </button>
                        )}
                      </>
                    ) : (
                      <span className="text-[11px] text-[#64748B]">
                        Owner authority required
                      </span>
                    )}
                  </div>
                </div>

                {/* Permission chips */}
                <div className="flex flex-wrap gap-1.5">
                  {(staff.permissions || []).map((perm) => {
                    const meta = ALL_ADMIN_PERMISSIONS.find((p) => p.key === perm);
                    return (
                      <span
                        key={perm}
                        className="px-2 py-0.5 rounded-md bg-[#0D0B16] border border-white/[0.07] text-[10px] text-[#CBD5E1]"
                      >
                        {meta?.label || perm}
                      </span>
                    );
                  })}
                </div>

                {/* Inline Editor */}
                {isEditing && (
                  <div className="p-4 rounded-xl bg-[#0D0B16] border border-[#8B5CF6]/30 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <label className="flex items-center gap-2 text-xs text-[#CBD5E1]">
                        <span>Role Tier:</span>
                        <select
                          value={editRole}
                          onChange={(e) => {
                            const r = e.target.value as Exclude<InternalRole, 'owner'>;
                            setEditRole(r);
                            setEditPermissions([...ROLE_DEFAULT_PERMISSIONS[r]]);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-[#08070F] border border-[#8B5CF6]/20 text-xs text-white"
                        >
                          {ASSIGNABLE_ROLES.map((r) => (
                            <option
                              key={r}
                              value={r}
                              disabled={r === 'administrator' && !isOwnerActor}
                            >
                              {ROLE_LABELS[r]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleSaveEdit(staff)}
                        className="px-4 py-1.5 rounded-lg bg-[#7C3AED] hover:bg-[#6D28D9] text-xs font-semibold text-white"
                      >
                        {busy ? 'Saving...' : 'Save Changes'}
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {ALL_ADMIN_PERMISSIONS.map((perm) => {
                        const checked = editPermissions.includes(perm.key);
                        return (
                          <label
                            key={perm.key}
                            className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-[#08070F] border border-white/[0.06] text-xs text-[#CBD5E1] cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() =>
                                setEditPermissions((prev) =>
                                  prev.includes(perm.key)
                                    ? prev.filter((p) => p !== perm.key)
                                    : [...prev, perm.key]
                                )
                              }
                              className="accent-[#7C3AED]"
                            />
                            <span className="truncate">{perm.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Admin Activity Audit Feed */}
      <div className="rounded-2xl bg-[#08070F] border border-[#8B5CF6]/20 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-white/[0.06] flex items-center gap-2">
          <ShieldAlert size={15} className="text-[#C084FC]" />
          <h3 className="font-display text-sm font-semibold text-white">
            Immutable Staff Role Audit Log
          </h3>
        </div>
        {adminAuditLogs.length === 0 ? (
          <p className="p-5 text-xs text-[#64748B]">No administrative role events recorded yet.</p>
        ) : (
          <div className="divide-y divide-white/[0.05]">
            {adminAuditLogs.map((log) => (
              <div
                key={log.id}
                className="px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
              >
                <div>
                  <span className="text-white font-medium">{log.action}</span>{' '}
                  {log.targetLabel && (
                    <span className="text-[#C084FC]">({log.targetLabel})</span>
                  )}
                  <p className="text-[11px] text-[#94A3B8]">
                    By {log.actorName} ({log.actorRole})
                    {log.details ? ` • ${log.details}` : ''}
                  </p>
                </div>
                <span className="text-[11px] text-[#64748B] font-mono-tabular shrink-0">
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
