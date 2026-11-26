import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Gift,
  Link2,
  Plus,
  Share2,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Users,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { extractReadableErrorMessage } from '../../services/firebase/errorHandler';
import {
  buildReferralShareUrl,
  createAdminInvitationCode,
  ensurePersonalInvitationCode,
  subscribeMyInvitations,
  subscribeMyReferralClaims,
  subscribeRewardsConfig,
  toggleInvitationActive,
} from '../../services/firebase/rewardsService';
import { InvitationRecord, ReferralClaim, RewardsConfig } from '../../types/nexora';
import {
  calculateReferralMilestonesToAward,
  DEFAULT_REWARDS_CONFIG,
  FOUNDER_OWNER_EMAIL,
  hasAdminPermission,
} from '../../utils/validation';

export function InvitePage() {
  const { user, profile, myRole: roleDoc } = useAuth();
  const [config, setConfig] = useState<RewardsConfig>({ ...DEFAULT_REWARDS_CONFIG });
  const [invitations, setInvitations] = useState<InvitationRecord[]>([]);
  const [claims, setClaims] = useState<ReferralClaim[]>([]);
  const [copiedKey, setCopiedKey] = useState<'code' | 'url' | string | null>(null);
  const [creatingPersonal, setCreatingPersonal] = useState(false);
  const [adminLabel, setAdminLabel] = useState('');
  const [adminCustomCode, setAdminCustomCode] = useState('');
  const [creatingAdminCode, setCreatingAdminCode] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const isRewardsAdmin =
    user?.email?.toLowerCase() === FOUNDER_OWNER_EMAIL ||
    hasAdminPermission(roleDoc, 'manage_rewards') ||
    hasAdminPermission(roleDoc, 'manage_platform');

  useEffect(() => {
    const unsubCfg = subscribeRewardsConfig(setConfig);
    return () => unsubCfg();
  }, []);

  useEffect(() => {
    if (!profile?.uid) return;
    const unsubInv = subscribeMyInvitations(profile.uid, setInvitations);
    const unsubClaims = subscribeMyReferralClaims(profile.uid, setClaims);
    return () => {
      unsubInv();
      unsubClaims();
    };
  }, [profile?.uid]);

  const personalInvite = useMemo(
    () => invitations.find((i) => i.kind === 'personal') || invitations[0] || null,
    [invitations]
  );

  // Auto-provision personal referral code if verified profile has none yet
  useEffect(() => {
    if (!profile || invitations.length > 0 || creatingPersonal) return;
    setCreatingPersonal(true);
    ensurePersonalInvitationCode(profile)
      .catch((err) => {
        setFeedback({
          type: 'err',
          text: extractReadableErrorMessage(err, 'Unable to initialize your personal invitation link.'),
        });
      })
      .finally(() => setCreatingPersonal(false));
  }, [profile?.uid, invitations.length]);

  if (!profile) return null;

  const qualifiedCount = claims.filter((c) => c.status === 'qualified').length;
  const effectiveQualified = Math.max(
    qualifiedCount,
    personalInvite?.qualifiedReferralsCount || 0
  );
  const milestones = calculateReferralMilestonesToAward(
    effectiveQualified,
    personalInvite?.milestonesAwarded || 0,
    config.referralsPerPoint
  );
  const progressPct = Math.min(
    100,
    Math.round((milestones.progressInCurrentBatch / Math.max(1, config.referralsPerPoint)) * 100)
  );

  const personalShareUrl = personalInvite ? buildReferralShareUrl(personalInvite.code) : '';

  const copyText = async (value: string, key: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      setFeedback({ type: 'err', text: 'Clipboard permission denied. Please copy manually.' });
    }
  };

  const handleNativeShare = async () => {
    if (!personalShareUrl) return;
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await navigator.share({
          title: 'Join me on Nexora',
          text: `Sign up on Nexora using my invitation code ${personalInvite?.code}`,
          url: personalShareUrl,
        });
        return;
      } catch {
        // User canceled share or unavailable; fall back to copy
      }
    }
    await copyText(personalShareUrl, 'url');
  };

  const handleCreateAdminCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (creatingAdminCode) return;
    setFeedback(null);
    setCreatingAdminCode(true);
    try {
      const created = await createAdminInvitationCode(profile, roleDoc, {
        label: adminLabel,
        customCode: adminCustomCode || undefined,
      });
      setAdminLabel('');
      setAdminCustomCode('');
      setFeedback({ type: 'ok', text: `Admin invitation code ${created.code} created.` });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: extractReadableErrorMessage(err, 'Could not create invitation link.'),
      });
    } finally {
      setCreatingAdminCode(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="rounded-2xl border border-white/10 bg-[#0D0D14]/90 p-6 sm:p-7 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-violet-400">
              <UserPlus size={14} />
              Nexora Invitation Program
            </div>
            <h1 className="font-display text-2xl font-bold text-white">
              Invite Friends &amp; Earn Key Points
            </h1>
            <p className="text-sm text-[#94A3B8] max-w-2xl">
              Earn <span className="font-semibold text-white">{config.pointsPerMilestone} Key Point</span> for every{' '}
              <span className="font-semibold text-white">{config.referralsPerPoint} qualified registrations</span> using your invitation link. Duplicate, self-referred, or unverified accounts are automatically excluded.
            </p>
          </div>
          {!config.invitationsEnabled && (
            <div className="px-3.5 py-2 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-300 text-xs font-medium">
              New invitation rewards are temporarily paused by administration.
            </div>
          )}
        </div>

        {/* Personal Code & Share Link */}
        {personalInvite ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 pt-2">
            <div className="lg:col-span-4 rounded-xl border border-white/10 bg-white/[0.03] p-4 flex flex-col justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-[#94A3B8]">Your Invitation Code</p>
                <p className="font-mono-tabular text-2xl font-bold tracking-wider text-white mt-1">
                  {personalInvite.code}
                </p>
              </div>
              <button
                type="button"
                onClick={() => copyText(personalInvite.code, 'code')}
                className="inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-xs font-semibold text-white transition"
              >
                {copiedKey === 'code' ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                {copiedKey === 'code' ? 'Code Copied' : 'Copy Code'}
              </button>
            </div>

            <div className="lg:col-span-8 rounded-xl border border-white/10 bg-white/[0.03] p-4 flex flex-col justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-[#94A3B8]">Shareable Referral URL</p>
                <div className="mt-1.5 flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 bg-black/20">
                  <Link2 size={14} className="text-violet-400 shrink-0" />
                  <span className="text-xs sm:text-sm text-[#CBD5E1] truncate font-mono-tabular">
                    {personalShareUrl}
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => copyText(personalShareUrl, 'url')}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#6366F1] hover:opacity-95 text-xs font-semibold text-white shadow-lg shadow-violet-600/20"
                >
                  {copiedKey === 'url' ? <Check size={14} /> : <Copy size={14} />}
                  {copiedKey === 'url' ? 'Link Copied' : 'Copy Referral Link'}
                </button>
                <button
                  type="button"
                  onClick={handleNativeShare}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-xs font-semibold text-white"
                >
                  <Share2 size={14} />
                  Share
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-xl border border-white/10 bg-white/[0.03] flex items-center justify-between gap-3">
            <p className="text-sm text-[#94A3B8]">
              {creatingPersonal ? 'Generating your unique invitation code...' : 'Generate your personal invitation link to get started.'}
            </p>
            <button
              type="button"
              disabled={creatingPersonal}
              onClick={() => {
                setCreatingPersonal(true);
                setFeedback(null);
                void ensurePersonalInvitationCode(profile)
                  .catch((err) => {
                    setFeedback({
                      type: 'err',
                      text: extractReadableErrorMessage(err, 'Unable to generate your personal invitation link.'),
                    });
                  })
                  .finally(() => setCreatingPersonal(false));
              }}
              className="px-4 py-2 rounded-xl bg-[#7C3AED] text-xs font-semibold text-white disabled:opacity-50"
            >
              {creatingPersonal ? 'Generating...' : 'Generate Link'}
            </button>
          </div>
        )}
      </div>

      {feedback && (
        <div
          className={`px-4 py-3 rounded-xl border text-sm ${
            feedback.type === 'ok'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* Milestone Progress & KPI Strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-white/10 bg-[#0D0D14]/90 p-5 space-y-2">
          <div className="flex items-center justify-between text-xs text-[#94A3B8]">
            <span>Qualified Referrals</span>
            <Users size={15} className="text-violet-400" />
          </div>
          <p className="font-mono-tabular text-2xl font-bold text-white">{effectiveQualified}</p>
          <p className="text-xs text-[#94A3B8]">
            {claims.filter((c) => c.status === 'pending').length} pending verification
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#0D0D14]/90 p-5 space-y-2">
          <div className="flex items-center justify-between text-xs text-[#94A3B8]">
            <span>Key Points from Referrals</span>
            <Sparkles size={15} className="text-emerald-400" />
          </div>
          <p className="font-mono-tabular text-2xl font-bold text-white">
            {personalInvite?.pointsEarned || milestones.totalEarnedMilestones * config.pointsPerMilestone}
          </p>
          <p className="text-xs text-[#94A3B8]">
            {milestones.totalEarnedMilestones} milestone(s) unlocked
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#0D0D14]/90 p-5 space-y-2.5">
          <div className="flex items-center justify-between text-xs text-[#94A3B8]">
            <span>Next +{config.pointsPerMilestone} Key Point</span>
            <Gift size={15} className="text-amber-400" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="font-mono-tabular text-xl font-bold text-white">
              {milestones.progressInCurrentBatch} / {config.referralsPerPoint}
            </span>
            <span className="text-xs text-[#94A3B8]">{progressPct}%</span>
          </div>
          <div className="h-2 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#7C3AED] to-[#10B981] transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Admin Campaign Links (Authorized Admins Only) */}
      {isRewardsAdmin && (
        <div className="rounded-2xl border border-white/10 bg-[#0D0D14]/90 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-lg font-semibold text-white">
                Admin Campaign Invitation Links
              </h2>
              <p className="text-xs text-[#94A3B8]">
                Generate tracked official invitation URLs for community drives or creator cohorts.
              </p>
            </div>
          </div>

          <form onSubmit={handleCreateAdminCode} className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <input
              type="text"
              value={adminLabel}
              onChange={(e) => setAdminLabel(e.target.value)}
              placeholder="Campaign label (e.g., Lagos Creator Cohort)"
              required
              maxLength={80}
              className="sm:col-span-5 px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-[#64748B]"
            />
            <input
              type="text"
              value={adminCustomCode}
              onChange={(e) => setAdminCustomCode(e.target.value.toUpperCase())}
              placeholder="Optional custom code (e.g., LAGOS25)"
              maxLength={24}
              className="sm:col-span-4 px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-[#64748B] font-mono-tabular"
            />
            <button
              type="submit"
              disabled={creatingAdminCode}
              className="sm:col-span-3 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-sm font-semibold text-white disabled:opacity-50"
            >
              <Plus size={16} />
              {creatingAdminCode ? 'Creating...' : 'Create Link'}
            </button>
          </form>

          {invitations.filter((i) => i.kind === 'admin').length > 0 && (
            <div className="divide-y divide-white/10 border border-white/10 rounded-xl overflow-hidden">
              {invitations
                .filter((i) => i.kind === 'admin')
                .map((inv) => {
                  const url = buildReferralShareUrl(inv.code);
                  return (
                    <div
                      key={inv.code}
                      className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white/[0.02]"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono-tabular text-sm font-bold text-white">
                            {inv.code}
                          </span>
                          <span className="text-xs text-[#94A3B8]">· {inv.label || 'Admin Campaign'}</span>
                        </div>
                        <p className="text-xs text-[#94A3B8] mt-0.5">
                          {inv.qualifiedReferralsCount} qualified · {inv.totalRegistrations} total registrations
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => copyText(url, inv.code)}
                          className="px-3 py-1.5 rounded-lg border border-white/15 bg-white/5 text-xs font-medium text-white"
                        >
                          {copiedKey === inv.code ? 'Copied' : 'Copy URL'}
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleInvitationActive(profile, roleDoc, inv.code, !inv.active)}
                          className={`px-3 py-1.5 rounded-lg border text-xs font-medium ${
                            inv.active
                              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                              : 'border-white/15 bg-white/5 text-[#94A3B8]'
                          }`}
                        >
                          {inv.active ? 'Active' : 'Paused'}
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* Referral Attribution Table */}
      <div className="rounded-2xl border border-white/10 bg-[#0D0D14]/90 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold text-white">Referral Activity</h2>
            <p className="text-xs text-[#94A3B8]">
              Only verified, non-duplicate registrations count toward your 10-referral milestones.
            </p>
          </div>
          <span className="font-mono-tabular text-xs text-[#94A3B8]">{claims.length} record(s)</span>
        </div>

        {claims.length === 0 ? (
          <div className="py-10 text-center space-y-2 border border-dashed border-white/10 rounded-xl">
            <Users size={24} className="mx-auto text-[#64748B]" />
            <p className="text-sm font-medium text-white">No referrals yet</p>
            <p className="text-xs text-[#94A3B8] max-w-sm mx-auto">
              Share your link with friends so they can register and verify their accounts.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-[#94A3B8]">
                  <th className="py-2.5 pr-4">Invited Member</th>
                  <th className="py-2.5 px-3">Code</th>
                  <th className="py-2.5 px-3">Registered</th>
                  <th className="py-2.5 px-3">Verification</th>
                  <th className="py-2.5 pl-3 text-right">Reward Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {claims.map((claim) => {
                  const badgeStyle =
                    claim.status === 'qualified'
                      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                      : claim.status === 'pending'
                      ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                      : 'bg-rose-500/15 text-rose-300 border-rose-500/30';
                  return (
                    <tr key={claim.inviteeUid}>
                      <td className="py-3 pr-4">
                        <p className="font-medium text-white">{claim.inviteeName}</p>
                        <p className="text-xs text-[#94A3B8]">@{claim.inviteeUsername}</p>
                      </td>
                      <td className="py-3 px-3 font-mono-tabular text-xs text-[#CBD5E1]">
                        {claim.invitationCode}
                      </td>
                      <td className="py-3 px-3 text-xs text-[#94A3B8]">
                        {claim.registeredAt?.toDate
                          ? claim.registeredAt.toDate().toLocaleDateString()
                          : 'Just now'}
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg border text-xs font-medium capitalize ${badgeStyle}`}
                        >
                          {claim.status === 'qualified' ? (
                            <ShieldCheck size={12} />
                          ) : claim.status === 'flagged' || claim.status === 'rejected' ? (
                            <ShieldAlert size={12} />
                          ) : null}
                          {claim.status}
                        </span>
                      </td>
                      <td className="py-3 pl-3 text-right text-xs text-[#CBD5E1] capitalize">
                        {claim.rewardStatus.replace('_', ' ')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
