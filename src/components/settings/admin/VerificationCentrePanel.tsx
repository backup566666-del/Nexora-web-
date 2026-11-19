import React, { useEffect, useMemo, useState } from 'react';
import {
  Award,
  BadgeCheck,
  CheckCircle2,
  Crown,
  Save,
  Search,
  SlidersHorizontal,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../../../hooks/useAuth';
import {
  assignUserBadges,
  evaluateAchievementBadges,
  reviewVerificationRequest,
  revokeUserBadge,
  saveBadgeConfig,
  subscribeAllVerificationRequests,
  subscribeBadgeConfigs,
} from '../../../services/firebase/adminService';
import {
  BadgeConfig,
  PlatformRole,
  UserProfile,
  VerificationRequest,
  VerifiedBadgeType,
} from '../../../types/nexora';
import {
  ACHIEVEMENT_BADGES,
  ALL_CANONICAL_BADGES,
  BADGE_CATALOG,
  DEFAULT_BADGE_CONFIGS,
  formatRelativeTime,
  normalizeBadgeList,
  normalizeBadgeType,
} from '../../../utils/validation';
import { ResilientImage } from '../../common/ResilientImage';
import { BadgeStrip, VerifiedBadge } from '../../common/VerifiedBadge';

interface VerificationCentrePanelProps {
  actor: UserProfile;
  myRole: PlatformRole;
  users: UserProfile[];
}

export function VerificationCentrePanel({
  actor,
  myRole,
  users,
}: VerificationCentrePanelProps) {
  const { badgesMap } = useAuth();
  const [subTab, setSubTab] = useState<'requests' | 'directory' | 'criteria'>('requests');
  const [requests, setRequests] = useState<VerificationRequest[]>([]);
  const [badgeConfigs, setBadgeConfigs] = useState<Record<VerifiedBadgeType, BadgeConfig>>(
    DEFAULT_BADGE_CONFIGS
  );
  const [search, setSearch] = useState('');
  const [editingUid, setEditingUid] = useState<string | null>(null);
  const [draftBadges, setDraftBadges] = useState<VerifiedBadgeType[]>([]);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    const u1 = subscribeAllVerificationRequests(setRequests);
    const u2 = subscribeBadgeConfigs(setBadgeConfigs);
    return () => {
      u1();
      u2();
    };
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
      .slice(0, 40);
  }, [users, search]);

  const openBadgeEditor = (u: UserProfile) => {
    if (editingUid === u.uid) {
      setEditingUid(null);
      return;
    }
    const rec = badgesMap[u.uid];
    const current = rec ? normalizeBadgeList(rec.badges, rec.badgeType) : [];
    setDraftBadges(current);
    setEditingUid(u.uid);
  };

  const toggleDraftBadge = (badgeId: VerifiedBadgeType) => {
    if (badgeId === 'founder' && myRole.role !== 'owner') return;
    setDraftBadges((prev) =>
      prev.includes(badgeId) ? prev.filter((b) => b !== badgeId) : [...prev, badgeId]
    );
  };

  const handleSaveUserBadges = async (target: UserProfile) => {
    setBusy(true);
    setFeedback(null);
    try {
      await assignUserBadges({
        actor,
        actorRole: myRole.role,
        targetUser: target,
        badges: draftBadges,
      });
      setEditingUid(null);
      setFeedback({
        type: 'ok',
        text: `Updated badges for @${target.username} (${draftBadges.length} active).`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to save badges.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleRevokeAll = async (target: UserProfile) => {
    const current = badgesMap[target.uid];
    const currentList = current ? normalizeBadgeList(current.badges, current.badgeType) : [];
    if (currentList.includes('founder')) return;
    setBusy(true);
    setFeedback(null);
    try {
      await revokeUserBadge({
        actor,
        actorRole: myRole.role,
        targetUser: target,
      });
      setEditingUid(null);
      setFeedback({ type: 'ok', text: `Revoked all badges from @${target.username}.` });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to revoke badges.',
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

  const handleSaveBadgeCriteria = async (cfg: BadgeConfig) => {
    setBusy(true);
    setFeedback(null);
    try {
      await saveBadgeConfig({
        actor,
        actorRole: myRole.role,
        config: cfg,
      });
      setFeedback({
        type: 'ok',
        text: `Saved criteria configuration for "${BADGE_CATALOG[cfg.badgeId].name}".`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to update badge criteria.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleRunAchievementEval = async () => {
    setBusy(true);
    setFeedback(null);
    try {
      const res = await evaluateAchievementBadges({
        actor,
        actorRole: myRole.role,
        users,
        badgesMap,
        badgeConfigs,
      });
      setFeedback({
        type: 'ok',
        text: `Evaluated ${res.evaluatedUsers} member accounts and awarded ${res.badgesGranted} newly earned achievement badge(s).`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Achievement evaluation failed.',
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
            <BadgeCheck size={18} className="text-[#C084FC]" /> 20-Badge &amp; Verification Centre
          </h2>
          <p className="text-xs text-[#94A3B8] mt-0.5">
            Review applications, issue or stack any of the 20 Nexora badges, and configure automatic achievement thresholds.
          </p>
        </div>

        <div className="inline-flex items-center p-1 rounded-xl bg-[#08070F] border border-white/10 self-start">
          <button
            type="button"
            onClick={() => setSubTab('requests')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
              subTab === 'requests' ? 'bg-[#7C3AED] text-white' : 'text-[#94A3B8] hover:text-white'
            }`}
          >
            Applications ({pendingCount})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('directory')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
              subTab === 'directory' ? 'bg-[#7C3AED] text-white' : 'text-[#94A3B8] hover:text-white'
            }`}
          >
            Assign 20 Badges
          </button>
          <button
            type="button"
            onClick={() => setSubTab('criteria')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
              subTab === 'criteria' ? 'bg-[#7C3AED] text-white' : 'text-[#94A3B8] hover:text-white'
            }`}
          >
            Achievement Rules
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

      {subTab === 'requests' && (
        <div className="rounded-2xl bg-[#08070F] border border-[#8B5CF6]/20 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-white/[0.06] flex items-center justify-between gap-2">
            <h3 className="font-display text-sm font-semibold text-white">
              Badge Applications ({requests.length})
            </h3>
            <span className="text-[11px] text-[#94A3B8]">
              Note: Blue Verified Identity is granted only via Government Identity Verification.
            </span>
          </div>
          {requests.length === 0 ? (
            <p className="p-5 text-xs text-[#64748B]">
              No verification badge applications have been submitted yet.
            </p>
          ) : (
            <div className="divide-y divide-white/[0.06]">
              {requests.map((req) => {
                const normBadge = normalizeBadgeType(req.requestedBadge);
                const def = BADGE_CATALOG[normBadge];

                return (
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
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#7C3AED]/15 border border-[#8B5CF6]/30 text-[10px] font-semibold text-[#E9D5FF]">
                              <VerifiedBadge size={12} variant={normBadge} interactive={false} />
                              Requests: {def.name}
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
                            <CheckCircle2 size={13} /> Approve &amp; Grant
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
                );
              })}
            </div>
          )}
        </div>
      )}

      {subTab === 'directory' && (
        <div className="rounded-2xl bg-[#08070F] border border-[#8B5CF6]/20 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h3 className="font-display text-sm font-semibold text-white">
              Multi-Badge Assignment (All 20 Nexora Badges)
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
              const rec = badgesMap[u.uid];
              const activeBadges = rec ? normalizeBadgeList(rec.badges, rec.badgeType) : [];
              const hasFounderBadge = activeBadges.includes('founder');
              const isEditing = editingUid === u.uid;

              return (
                <div key={u.uid} className="px-5 py-3.5 space-y-3">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <ResilientImage
                        src={u.avatarUrl}
                        alt={u.displayName}
                        className="w-9 h-9 rounded-full object-cover shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-white truncate">
                            {u.displayName}
                          </span>
                          <BadgeStrip badges={activeBadges} size={15} max={8} />
                        </div>
                        <p className="text-xs text-[#94A3B8] truncate">
                          @{u.username} •{' '}
                          {activeBadges.length > 0
                            ? activeBadges.map((b) => BADGE_CATALOG[b].name).join(', ')
                            : 'No active badges'}
                        </p>
                      </div>
                    </div>

                    {hasFounderBadge && myRole.role !== 'owner' ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500/10 border border-sky-400/30 text-[11px] font-medium text-sky-200 shrink-0">
                        <Crown size={12} /> Permanent Founder Badge (Protected)
                      </span>
                    ) : (
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => openBadgeEditor(u)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#7C3AED] hover:bg-[#6D28D9] text-xs font-semibold text-white"
                        >
                          <Award size={13} />
                          {isEditing ? 'Close Picker' : 'Configure Badges'}
                        </button>
                        {activeBadges.length > 0 && !hasFounderBadge && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleRevokeAll(u)}
                            className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 text-xs text-rose-300"
                          >
                            Revoke All
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {isEditing && (
                    <div className="p-4 rounded-xl bg-[#0D0B16] border border-[#8B5CF6]/25 space-y-3">
                      <p className="text-[11px] text-[#94A3B8]">
                        Select any combination of Nexora&apos;s 20 badges for @{u.username}. Click Save to persist immediately and notify the user.
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {ALL_CANONICAL_BADGES.map((badgeId) => {
                          const def = BADGE_CATALOG[badgeId];
                          const checked = draftBadges.includes(badgeId);
                          const lockedFounder = badgeId === 'founder' && myRole.role !== 'owner';
                          return (
                            <button
                              key={badgeId}
                              type="button"
                              disabled={lockedFounder}
                              onClick={() => toggleDraftBadge(badgeId)}
                              className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border text-left text-xs transition ${
                                checked
                                  ? 'bg-[#7C3AED]/20 border-[#8B5CF6] text-white'
                                  : 'bg-[#08070F] border-white/10 text-[#94A3B8] hover:text-white'
                              } ${lockedFounder ? 'opacity-40 cursor-not-allowed' : ''}`}
                            >
                              <VerifiedBadge size={14} variant={badgeId} interactive={false} />
                              <span className="truncate font-medium">{def.name}</span>
                            </button>
                          );
                        })}
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setEditingUid(null)}
                          className="px-3 py-1.5 rounded-lg bg-white/5 text-xs text-[#CBD5E1]"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleSaveUserBadges(u)}
                          className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white"
                        >
                          <Save size={13} /> Save Badges ({draftBadges.length})
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {subTab === 'criteria' && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-[#08070F] border border-[#8B5CF6]/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-display text-sm font-semibold text-white flex items-center gap-2">
                <SlidersHorizontal size={15} className="text-[#C084FC]" /> Achievement Criteria &amp; Auto-Award
              </h3>
              <p className="text-xs text-[#94A3B8] mt-0.5">
                Adjust follower, post, like, and account tenure milestones for automatic achievement badges.
              </p>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleRunAchievementEval()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-[#6D28D9] via-[#7C3AED] to-[#9333EA] text-xs font-semibold text-white shrink-0"
            >
              <Sparkles size={14} /> Evaluate &amp; Grant Eligible Users
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {ACHIEVEMENT_BADGES.map((def) => {
              const cfg = badgeConfigs[def.id] || DEFAULT_BADGE_CONFIGS[def.id];
              return (
                <div
                  key={def.id}
                  className="p-4 rounded-2xl bg-[#08070F] border border-[#8B5CF6]/20 space-y-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <VerifiedBadge size={18} variant={def.id} />
                      <div>
                        <h4 className="text-sm font-semibold text-white">{def.name}</h4>
                        <p className="text-[11px] text-[#94A3B8]">{def.description}</p>
                      </div>
                    </div>
                    <label className="flex items-center gap-1.5 text-xs text-[#CBD5E1] shrink-0 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={cfg.autoAward}
                        onChange={(e) =>
                          setBadgeConfigs((prev) => ({
                            ...prev,
                            [def.id]: { ...cfg, autoAward: e.target.checked },
                          }))
                        }
                        className="accent-[#7C3AED]"
                      />
                      Auto-Award
                    </label>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <label className="space-y-1">
                      <span className="text-[10px] text-[#94A3B8]">Min Followers</span>
                      <input
                        type="number"
                        min={0}
                        value={cfg.minFollowers}
                        onChange={(e) =>
                          setBadgeConfigs((prev) => ({
                            ...prev,
                            [def.id]: { ...cfg, minFollowers: Number(e.target.value) || 0 },
                          }))
                        }
                        className="w-full px-2.5 py-1.5 rounded-lg bg-[#0D0B16] border border-[#8B5CF6]/20 text-white"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[10px] text-[#94A3B8]">Min Posts</span>
                      <input
                        type="number"
                        min={0}
                        value={cfg.minPosts}
                        onChange={(e) =>
                          setBadgeConfigs((prev) => ({
                            ...prev,
                            [def.id]: { ...cfg, minPosts: Number(e.target.value) || 0 },
                          }))
                        }
                        className="w-full px-2.5 py-1.5 rounded-lg bg-[#0D0B16] border border-[#8B5CF6]/20 text-white"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[10px] text-[#94A3B8]">Min Likes</span>
                      <input
                        type="number"
                        min={0}
                        value={cfg.minLikes}
                        onChange={(e) =>
                          setBadgeConfigs((prev) => ({
                            ...prev,
                            [def.id]: { ...cfg, minLikes: Number(e.target.value) || 0 },
                          }))
                        }
                        className="w-full px-2.5 py-1.5 rounded-lg bg-[#0D0B16] border border-[#8B5CF6]/20 text-white"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[10px] text-[#94A3B8]">Age (Days)</span>
                      <input
                        type="number"
                        min={0}
                        value={cfg.accountAgeDays}
                        onChange={(e) =>
                          setBadgeConfigs((prev) => ({
                            ...prev,
                            [def.id]: { ...cfg, accountAgeDays: Number(e.target.value) || 0 },
                          }))
                        }
                        className="w-full px-2.5 py-1.5 rounded-lg bg-[#0D0B16] border border-[#8B5CF6]/20 text-white"
                      />
                    </label>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleSaveBadgeCriteria(cfg)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-semibold text-white"
                    >
                      <Save size={12} /> Save Rule
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
