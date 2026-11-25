import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  Coins,
  Download,
  Eye,
  Lock,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Unlock,
  Users,
  Wallet,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../../../hooks/useAuth';
import { extractReadableErrorMessage } from '../../../services/firebase/errorHandler';
import {
  adminCreditOrDebitWallet,
  buildReferralShareUrl,
  createAdminInvitationCode,
  createOrUpdateTaskAdmin,
  exportTransactionsCsv,
  getWithdrawalPrivateBankDetailsAdmin,
  reviewFraudAlertAdmin,
  reviewReferralClaimAdmin,
  reviewTaskSubmissionAdmin,
  subscribeAllInvitationsAdmin,
  subscribeAllReferralClaimsAdmin,
  subscribeAllTaskSubmissionsAdmin,
  subscribeAllWalletTransactionsAdmin,
  subscribeAllWalletsAdmin,
  subscribeAllWithdrawalsAdmin,
  subscribeFraudAlertsAdmin,
  subscribeRewardsConfig,
  subscribeTasks,
  toggleInvitationActive,
  transitionWithdrawalStatusAdmin,
  updateRewardsConfigAdmin,
} from '../../../services/firebase/rewardsService';
import {
  InvitationRecord,
  ReferralClaim,
  ReferralFraudAlert,
  RewardsConfig,
  TaskItem,
  TaskSubmission,
  WalletAccount,
  WalletTransaction,
  WithdrawalPrivatePII,
  WithdrawalRequest,
  WithdrawalStatus,
} from '../../../types/nexora';
import {
  DEFAULT_REWARDS_CONFIG,
  formatNaira,
  FOUNDER_OWNER_EMAIL,
  hasAdminPermission,
} from '../../../utils/validation';

type AdminRewardsTab =
  | 'overview'
  | 'withdrawals'
  | 'config'
  | 'wallets'
  | 'tasks'
  | 'invitations'
  | 'fraud';

export function RewardsAndPaymentsAdminPanel() {
  const { user, profile, myRole: roleDoc } = useAuth();
  const [tab, setTab] = useState<AdminRewardsTab>('overview');
  const [config, setConfig] = useState<RewardsConfig>({ ...DEFAULT_REWARDS_CONFIG });
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [wallets, setWallets] = useState<WalletAccount[]>([]);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [submissions, setSubmissions] = useState<TaskSubmission[]>([]);
  const [invitations, setInvitations] = useState<InvitationRecord[]>([]);
  const [claims, setClaims] = useState<ReferralClaim[]>([]);
  const [fraudAlerts, setFraudAlerts] = useState<ReferralFraudAlert[]>([]);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Config form state
  const [rateInput, setRateInput] = useState('');
  const [minNairaInput, setMinNairaInput] = useState('2000');
  const [referralsPerPointInput, setReferralsPerPointInput] = useState('10');
  const [lockReasonInput, setLockReasonInput] = useState('');
  const [savingConfig, setSavingConfig] = useState(false);

  // Wallet credit/debit form
  const [targetUidInput, setTargetUidInput] = useState('');
  const [adjustDirection, setAdjustDirection] = useState<'credit' | 'debit'>('credit');
  const [adjustPoints, setAdjustPoints] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustingWallet, setAdjustingWallet] = useState(false);

  // Task creation form
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDesc, setTaskDesc] = useState('');
  const [taskCat, setTaskCat] = useState<TaskItem['category']>('community');
  const [taskReward, setTaskReward] = useState('2');
  const [taskProofInst, setTaskProofInst] = useState('');
  const [taskUrl, setTaskUrl] = useState('');
  const [savingTask, setSavingTask] = useState(false);

  // Admin invite link form
  const [inviteLabel, setInviteLabel] = useState('');
  const [inviteCustomCode, setInviteCustomCode] = useState('');

  // Withdrawal action / PII inspect
  const [inspectedPii, setInspectedPii] = useState<WithdrawalPrivatePII | null>(null);
  const [payoutRefs, setPayoutRefs] = useState<Record<string, string>>({});
  const [wdNotes, setWdNotes] = useState<Record<string, string>>({});

  const isOwner =
    user?.email?.toLowerCase() === FOUNDER_OWNER_EMAIL ||
    Boolean(roleDoc?.active && roleDoc.role === 'owner');
  const canManageRewards =
    isOwner || hasAdminPermission(roleDoc, 'manage_rewards') || hasAdminPermission(roleDoc, 'manage_platform');
  const canManageWithdrawals =
    isOwner || hasAdminPermission(roleDoc, 'manage_withdrawals') || hasAdminPermission(roleDoc, 'manage_platform');

  useEffect(() => {
    const uCfg = subscribeRewardsConfig((cfg) => {
      setConfig(cfg);
      setRateInput(cfg.pointRateNaira !== null ? String(cfg.pointRateNaira) : '');
      setMinNairaInput(String(cfg.minWithdrawalNaira || 2000));
      setReferralsPerPointInput(String(cfg.referralsPerPoint || 10));
      setLockReasonInput(cfg.lockReason || '');
    });
    const uWd = canManageWithdrawals ? subscribeAllWithdrawalsAdmin(setWithdrawals) : () => {};
    const uWallets = canManageRewards || canManageWithdrawals ? subscribeAllWalletsAdmin(setWallets) : () => {};
    const uTxs = canManageRewards || canManageWithdrawals ? subscribeAllWalletTransactionsAdmin(setTransactions) : () => {};
    const uTasks = subscribeTasks(setTasks);
    const uSubs = canManageRewards ? subscribeAllTaskSubmissionsAdmin(setSubmissions) : () => {};
    const uInv = canManageRewards ? subscribeAllInvitationsAdmin(setInvitations) : () => {};
    const uClaims = canManageRewards ? subscribeAllReferralClaimsAdmin(setClaims) : () => {};
    const uFraud = canManageRewards ? subscribeFraudAlertsAdmin(setFraudAlerts) : () => {};
    return () => {
      uCfg();
      uWd();
      uWallets();
      uTxs();
      uTasks();
      uSubs();
      uInv();
      uClaims();
      uFraud();
    };
  }, [canManageRewards, canManageWithdrawals]);

  const metrics = useMemo(() => {
    const totalPointsCirculating = wallets.reduce((a, w) => a + (w.availablePoints || 0), 0);
    const pendingWithdrawals = withdrawals.filter((w) =>
      ['pending', 'under_review', 'approved', 'processing'].includes(w.status)
    );
    const pendingSubmissions = submissions.filter((s) => s.status === 'pending');
    const openFraud = fraudAlerts.filter((f) => f.status === 'open');
    return {
      totalPointsCirculating,
      pendingWithdrawalsCount: pendingWithdrawals.length,
      pendingSubmissionsCount: pendingSubmissions.length,
      openFraudCount: openFraud.length,
      totalPaidNaira: withdrawals
        .filter((w) => w.status === 'paid')
        .reduce((a, w) => a + (w.nairaAmount || 0), 0),
    };
  }, [wallets, withdrawals, submissions, fraudAlerts]);

  if (!profile || (!canManageRewards && !canManageWithdrawals)) {
    return (
      <div className="p-6 rounded-2xl border border-white/10 bg-[#0D0D14] text-sm text-[#94A3B8]">
        You do not have Rewards or Withdrawals administrative permissions.
      </div>
    );
  }

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setSavingConfig(true);
    try {
      const patch: Parameters<typeof updateRewardsConfigAdmin>[2] = {
        minWithdrawalNaira: Number(minNairaInput || 2000),
        referralsPerPoint: Math.max(1, Math.floor(Number(referralsPerPointInput || 10))),
        lockReason: lockReasonInput,
      };
      if (isOwner) {
        const parsedRate = rateInput.trim() === '' ? null : Number(rateInput.trim());
        patch.pointRateNaira = parsedRate;
      }
      await updateRewardsConfigAdmin(profile, roleDoc, patch);
      setFeedback({ type: 'ok', text: 'Rewards & withdrawal policy saved.' });
    } catch (err) {
      setFeedback({ type: 'err', text: extractReadableErrorMessage(err, 'Unable to update policy.') });
    } finally {
      setSavingConfig(false);
    }
  };

  const handleToggleWithdrawalsLock = async () => {
    setFeedback(null);
    try {
      await updateRewardsConfigAdmin(profile, roleDoc, {
        withdrawalsOpen: !config.withdrawalsOpen,
        lockReason: lockReasonInput,
      });
      setFeedback({
        type: 'ok',
        text: !config.withdrawalsOpen ? 'Withdrawals are now OPEN.' : 'Withdrawals are now LOCKED.',
      });
    } catch (err) {
      setFeedback({ type: 'err', text: extractReadableErrorMessage(err, 'Failed to toggle lock.') });
    }
  };

  const handleTransitionWithdrawal = async (wdId: string, nextStatus: WithdrawalStatus) => {
    setFeedback(null);
    try {
      await transitionWithdrawalStatusAdmin(profile, roleDoc, {
        withdrawalId: wdId,
        nextStatus,
        paymentReference: payoutRefs[wdId],
        adminNote: wdNotes[wdId],
      });
      setFeedback({ type: 'ok', text: `Withdrawal ${wdId.slice(0, 8)} moved to ${nextStatus}.` });
    } catch (err) {
      setFeedback({ type: 'err', text: extractReadableErrorMessage(err, 'Transition failed.') });
    }
  };

  const handleInspectPii = async (wdId: string) => {
    setFeedback(null);
    try {
      const pii = await getWithdrawalPrivateBankDetailsAdmin(wdId);
      setInspectedPii(pii);
      if (!pii) {
        setFeedback({ type: 'err', text: 'Private bank details record not found.' });
      }
    } catch (err) {
      setFeedback({ type: 'err', text: extractReadableErrorMessage(err, 'Unable to view bank PII.') });
    }
  };

  const handleAdjustWallet = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setAdjustingWallet(true);
    try {
      const res = await adminCreditOrDebitWallet(profile, roleDoc, {
        targetUid: targetUidInput.trim(),
        direction: adjustDirection,
        points: Number(adjustPoints),
        reason: adjustReason,
      });
      setAdjustPoints('');
      setAdjustReason('');
      setFeedback({
        type: 'ok',
        text: `Wallet updated. New available balance: ${res.nextAvailablePoints} KP.`,
      });
    } catch (err) {
      setFeedback({ type: 'err', text: extractReadableErrorMessage(err, 'Wallet adjustment failed.') });
    } finally {
      setAdjustingWallet(false);
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setSavingTask(true);
    try {
      await createOrUpdateTaskAdmin(profile, roleDoc, {
        title: taskTitle,
        description: taskDesc,
        category: taskCat,
        rewardPoints: Number(taskReward),
        active: true,
        maxCompletionsPerUser: 1,
        proofInstructions: taskProofInst,
        actionUrl: taskUrl || undefined,
      });
      setTaskTitle('');
      setTaskDesc('');
      setTaskProofInst('');
      setTaskUrl('');
      setFeedback({ type: 'ok', text: 'Free community task published.' });
    } catch (err) {
      setFeedback({ type: 'err', text: extractReadableErrorMessage(err, 'Could not create task.') });
    } finally {
      setSavingTask(false);
    }
  };

  const handleExportCsv = () => {
    const csv = exportTransactionsCsv(transactions);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nexora-admin-wallet-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportJson = () => {
    const json = JSON.stringify({ config, withdrawals, transactions, wallets }, null, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nexora-admin-rewards-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header & Export */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="font-display text-xl font-bold text-white flex items-center gap-2">
            <Coins size={20} className="text-violet-400" />
            Rewards, Invitations &amp; Naira Withdrawals
          </h3>
          <p className="text-xs text-[#94A3B8] mt-1">
            Configure Key Point rate (Owner-only), manage withdrawals, approve free tasks, and audit anti-fraud alerts.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/15 bg-white/5 text-xs font-semibold text-white"
          >
            <Download size={13} />
            CSV
          </button>
          <button
            type="button"
            onClick={handleExportJson}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/15 bg-white/5 text-xs font-semibold text-white"
          >
            <Download size={13} />
            JSON
          </button>
        </div>
      </div>

      {/* Sub-navigation */}
      <div className="flex flex-wrap gap-2">
        {(
          [
            { id: 'overview', label: 'Overview' },
            { id: 'withdrawals', label: `Withdrawals (${metrics.pendingWithdrawalsCount})` },
            { id: 'config', label: 'Rate & Controls' },
            { id: 'wallets', label: 'User Wallets' },
            { id: 'tasks', label: `Tasks (${metrics.pendingSubmissionsCount} pending)` },
            { id: 'invitations', label: 'Invitations' },
            { id: 'fraud', label: `Fraud Alerts (${metrics.openFraudCount})` },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition ${
              tab === item.id
                ? 'bg-[#7C3AED] border-[#7C3AED] text-white'
                : 'bg-white/5 border-white/10 text-[#94A3B8] hover:text-white'
            }`}
          >
            {item.label}
          </button>
        ))}
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

      {/* OVERVIEW */}
      {tab === 'overview' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl border border-white/10 bg-white/[0.03] space-y-1">
            <p className="text-xs text-[#94A3B8]">Key Point Rate (Owner)</p>
            <p className="font-mono-tabular text-xl font-bold text-white">
              {config.pointRateNaira ? `₦${config.pointRateNaira}/KP` : 'Unset (Owner Only)'}
            </p>
            <p className="text-[11px] text-[#64748B]">Min: {formatNaira(config.minWithdrawalNaira)}</p>
          </div>
          <div className="p-4 rounded-xl border border-white/10 bg-white/[0.03] space-y-1">
            <p className="text-xs text-[#94A3B8]">Circulating Available KP</p>
            <p className="font-mono-tabular text-xl font-bold text-white">
              {metrics.totalPointsCirculating} KP
            </p>
            <p className="text-[11px] text-[#64748B]">{wallets.length} active wallet(s)</p>
          </div>
          <div className="p-4 rounded-xl border border-white/10 bg-white/[0.03] space-y-1">
            <p className="text-xs text-[#94A3B8]">Pending Review Queues</p>
            <p className="font-mono-tabular text-xl font-bold text-amber-300">
              {metrics.pendingWithdrawalsCount + metrics.pendingSubmissionsCount}
            </p>
            <p className="text-[11px] text-[#64748B]">
              {metrics.pendingWithdrawalsCount} payouts · {metrics.pendingSubmissionsCount} tasks
            </p>
          </div>
          <div className="p-4 rounded-xl border border-white/10 bg-white/[0.03] space-y-1">
            <p className="text-xs text-[#94A3B8]">Total Paid Out</p>
            <p className="font-mono-tabular text-xl font-bold text-emerald-300">
              {formatNaira(metrics.totalPaidNaira)}
            </p>
            <p className="text-[11px] text-[#64748B]">
              {config.withdrawalsOpen ? 'Withdrawals Open' : 'Withdrawals Locked'}
            </p>
          </div>
        </div>
      )}

      {/* WITHDRAWALS QUEUE */}
      {tab === 'withdrawals' && (
        <div className="space-y-4">
          {inspectedPii && (
            <div className="p-4 rounded-xl border border-violet-500/40 bg-violet-500/10 space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-white">Restricted Bank PII (Audit Logged Access)</span>
                <button
                  type="button"
                  onClick={() => setInspectedPii(null)}
                  className="text-violet-300 hover:underline"
                >
                  Hide
                </button>
              </div>
              <p className="text-[#CBD5E1] font-mono-tabular">
                {inspectedPii.bankName} ({inspectedPii.bankCode}) · Account: {inspectedPii.accountNumber} · Holder:{' '}
                {inspectedPii.accountHolderName}
              </p>
            </div>
          )}

          {withdrawals.length === 0 ? (
            <p className="text-sm text-[#94A3B8]">No withdrawal requests found.</p>
          ) : (
            <div className="space-y-3">
              {withdrawals.map((wd) => (
                <div key={wd.id} className="p-4 rounded-xl border border-white/10 bg-white/[0.02] space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-white">
                        {wd.userDisplayName} (@{wd.userUsername}) — {formatNaira(wd.nairaAmount)}
                      </p>
                      <p className="text-xs text-[#94A3B8]">
                        {wd.pointsRequested} KP @ ₦{wd.pointRateNaira}/KP · {wd.bankName} ({wd.accountNumberMasked}) ·{' '}
                        {wd.accountHolderName}
                      </p>
                      <p className="text-[11px] text-[#64748B] mt-0.5">
                        Account check: {wd.accountVerificationStatus} ({wd.verificationProvider})
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleInspectPii(wd.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-white/15 bg-white/5 text-xs text-white"
                      >
                        <Eye size={12} />
                        Bank PII
                      </button>
                      <span className="px-2.5 py-1 rounded-lg border border-white/15 bg-white/5 text-xs font-semibold capitalize text-white">
                        {wd.status.replace('_', ' ')}
                      </span>
                    </div>
                  </div>

                  {wd.status !== 'paid' && wd.status !== 'rejected' && (
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 pt-2 border-t border-white/10">
                      <input
                        type="text"
                        placeholder="Payout Ref (required for Paid)"
                        value={payoutRefs[wd.id] || ''}
                        onChange={(e) => setPayoutRefs((p) => ({ ...p, [wd.id]: e.target.value }))}
                        className="sm:col-span-4 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-white"
                      />
                      <input
                        type="text"
                        placeholder="Admin review / rejection note"
                        value={wdNotes[wd.id] || ''}
                        onChange={(e) => setWdNotes((p) => ({ ...p, [wd.id]: e.target.value }))}
                        className="sm:col-span-4 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-white"
                      />
                      <div className="sm:col-span-4 flex flex-wrap gap-1.5 justify-end">
                        {(wd.status === 'pending' || wd.status === 'under_review') && (
                          <button
                            type="button"
                            onClick={() => handleTransitionWithdrawal(wd.id, 'approved')}
                            className="px-2.5 py-1.5 rounded-lg bg-sky-600 text-xs font-semibold text-white"
                          >
                            Approve
                          </button>
                        )}
                        {(wd.status === 'approved' || wd.status === 'processing') && (
                          <button
                            type="button"
                            onClick={() => handleTransitionWithdrawal(wd.id, 'paid')}
                            className="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-xs font-semibold text-white"
                          >
                            Mark Paid
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleTransitionWithdrawal(wd.id, 'rejected')}
                          className="px-2.5 py-1.5 rounded-lg bg-rose-600 text-xs font-semibold text-white"
                        >
                          Reject &amp; Refund
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* RATE & WITHDRAWAL LOCK CONTROLS */}
      {tab === 'config' && (
        <div className="space-y-5 rounded-2xl border border-white/10 bg-white/[0.02] p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/10">
            <div>
              <h4 className="text-sm font-bold text-white">Withdrawal Lock Status</h4>
              <p className="text-xs text-[#94A3B8]">
                Lock or open member bank withdrawals platform-wide at any time.
              </p>
            </div>
            <button
              type="button"
              onClick={handleToggleWithdrawalsLock}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white ${
                config.withdrawalsOpen ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700'
              }`}
            >
              {config.withdrawalsOpen ? <Lock size={14} /> : <Unlock size={14} />}
              {config.withdrawalsOpen ? 'Lock Withdrawals' : 'Open Withdrawals'}
            </button>
          </div>

          <form onSubmit={handleSaveConfig} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">
                Key Point Conversion Rate (₦ per 1 KP) — Owner Only
              </label>
              <input
                type="number"
                step="0.01"
                min="1"
                value={rateInput}
                disabled={!isOwner}
                onChange={(e) => setRateInput(e.target.value)}
                placeholder={isOwner ? 'Leave blank until ready to set rate' : 'Owner-only setting'}
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white disabled:opacity-50 font-mono-tabular"
              />
              {!isOwner && (
                <p className="text-[11px] text-amber-300 mt-1">
                  Only the Nexora Founder/Owner can modify the Naira conversion rate.
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">
                Minimum Withdrawal (₦)
              </label>
              <input
                type="number"
                min="100"
                step="100"
                value={minNairaInput}
                onChange={(e) => setMinNairaInput(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white font-mono-tabular"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">
                Qualified Referrals per 1 Key Point
              </label>
              <input
                type="number"
                min="1"
                max="100"
                value={referralsPerPointInput}
                onChange={(e) => setReferralsPerPointInput(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white font-mono-tabular"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">
                Optional Withdrawal Lock Notice
              </label>
              <input
                type="text"
                maxLength={240}
                value={lockReasonInput}
                onChange={(e) => setLockReasonInput(e.target.value)}
                placeholder="Reason displayed to members when locked"
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white"
              />
            </div>

            <div className="sm:col-span-2 flex justify-end">
              <button
                type="submit"
                disabled={savingConfig}
                className="px-5 py-2.5 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-xs font-semibold text-white disabled:opacity-50"
              >
                {savingConfig ? 'Saving...' : 'Save Policy'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* USER WALLETS CREDIT / DEBIT */}
      {tab === 'wallets' && (
        <div className="space-y-5">
          <form
            onSubmit={handleAdjustWallet}
            className="p-5 rounded-2xl border border-white/10 bg-white/[0.02] grid grid-cols-1 sm:grid-cols-12 gap-3"
          >
            <input
              type="text"
              value={targetUidInput}
              onChange={(e) => setTargetUidInput(e.target.value)}
              required
              placeholder="Target User UID"
              className="sm:col-span-3 px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white font-mono-tabular"
            />
            <select
              value={adjustDirection}
              onChange={(e) => setAdjustDirection(e.target.value as 'credit' | 'debit')}
              className="sm:col-span-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white"
            >
              <option value="credit" className="bg-[#0D0D14]">Credit (+)</option>
              <option value="debit" className="bg-[#0D0D14]">Debit (-)</option>
            </select>
            <input
              type="number"
              min="1"
              step="1"
              value={adjustPoints}
              onChange={(e) => setAdjustPoints(e.target.value)}
              required
              placeholder="Key Points"
              className="sm:col-span-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white font-mono-tabular"
            />
            <input
              type="text"
              value={adjustReason}
              onChange={(e) => setAdjustReason(e.target.value)}
              required
              minLength={3}
              placeholder="Mandatory audit reason"
              className="sm:col-span-3 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white"
            />
            <button
              type="submit"
              disabled={adjustingWallet}
              className="sm:col-span-2 px-3.5 py-2 rounded-xl bg-[#7C3AED] text-xs font-semibold text-white disabled:opacity-50"
            >
              {adjustingWallet ? 'Applying...' : 'Apply'}
            </button>
          </form>

          <div className="divide-y divide-white/10 border border-white/10 rounded-xl overflow-hidden">
            {wallets.map((w) => (
              <div key={w.uid} className="p-3.5 flex flex-wrap items-center justify-between gap-3 bg-white/[0.01]">
                <div>
                  <p className="font-mono-tabular text-xs font-semibold text-white">{w.uid}</p>
                  <p className="text-[11px] text-[#94A3B8]">
                    Earned: {w.lifetimeEarnedPoints} KP · Withdrawn: {w.lifetimeWithdrawnPoints} KP
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono-tabular text-sm font-bold text-emerald-300">
                    {w.availablePoints} KP avail
                  </span>
                  <span className="font-mono-tabular text-xs text-amber-300">
                    {w.lockedPoints} KP locked
                  </span>
                  <button
                    type="button"
                    onClick={() => setTargetUidInput(w.uid)}
                    className="px-2.5 py-1 rounded-lg border border-white/15 bg-white/5 text-xs text-white"
                  >
                    Select
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TASKS & VERIFICATIONS */}
      {tab === 'tasks' && (
        <div className="space-y-6">
          <form onSubmit={handleCreateTask} className="p-5 rounded-2xl border border-white/10 bg-white/[0.02] space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-white">Create Strictly Free Task</h4>
              <span className="text-[11px] text-emerald-300 font-semibold">freeToParticipate = true</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                type="text"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                required
                placeholder="Task title"
                className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white"
              />
              <select
                value={taskCat}
                onChange={(e) => setTaskCat(e.target.value as TaskItem['category'])}
                className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white"
              >
                <option value="community" className="bg-[#0D0D14]">Community</option>
                <option value="onboarding" className="bg-[#0D0D14]">Onboarding</option>
                <option value="social" className="bg-[#0D0D14]">Social</option>
                <option value="engagement" className="bg-[#0D0D14]">Engagement</option>
                <option value="content" className="bg-[#0D0D14]">Content</option>
              </select>
              <input
                type="number"
                min="1"
                step="1"
                value={taskReward}
                onChange={(e) => setTaskReward(e.target.value)}
                required
                placeholder="Key Points reward"
                className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white font-mono-tabular"
              />
            </div>
            <textarea
              value={taskDesc}
              onChange={(e) => setTaskDesc(e.target.value)}
              required
              rows={2}
              placeholder="Task description"
              className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="text"
                value={taskProofInst}
                onChange={(e) => setTaskProofInst(e.target.value)}
                required
                placeholder="Proof instructions (e.g., Paste link to your post)"
                className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white"
              />
              <input
                type="url"
                value={taskUrl}
                onChange={(e) => setTaskUrl(e.target.value)}
                placeholder="Optional action URL"
                className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white"
              />
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={savingTask}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#7C3AED] text-xs font-semibold text-white disabled:opacity-50"
              >
                <Plus size={14} />
                {savingTask ? 'Publishing...' : 'Publish Free Task'}
              </button>
            </div>
          </form>

          <div className="space-y-3">
            <h4 className="text-sm font-bold text-white">Verification Submissions Queue</h4>
            {submissions.length === 0 ? (
              <p className="text-xs text-[#94A3B8]">No task submissions yet.</p>
            ) : (
              submissions.map((sub) => (
                <div key={sub.id} className="p-4 rounded-xl border border-white/10 bg-white/[0.02] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-white">
                      {sub.taskTitle} (+{sub.rewardPoints} KP) · @{sub.userUsername}
                    </p>
                    <p className="text-xs text-[#CBD5E1]">{sub.proofText}</p>
                    {sub.proofUrl && (
                      <a href={sub.proofUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-violet-400 underline">
                        {sub.proofUrl}
                      </a>
                    )}
                  </div>
                  {sub.status === 'pending' ? (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => reviewTaskSubmissionAdmin(profile, roleDoc, sub.id, 'approved')}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-xs font-semibold text-white"
                      >
                        <CheckCircle2 size={13} />
                        Approve &amp; Credit
                      </button>
                      <button
                        type="button"
                        onClick={() => reviewTaskSubmissionAdmin(profile, roleDoc, sub.id, 'rejected', 'Insufficient proof')}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-600 text-xs font-semibold text-white"
                      >
                        <XCircle size={13} />
                        Reject
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs font-semibold capitalize text-[#94A3B8]">{sub.status}</span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* INVITATIONS */}
      {tab === 'invitations' && (
        <div className="space-y-5">
          <div className="p-4 rounded-xl border border-white/10 bg-white/[0.02] space-y-3">
            <h4 className="text-sm font-bold text-white">Pending Manual Referral Claims</h4>
            {claims.filter((c) => c.status === 'pending').length === 0 ? (
              <p className="text-xs text-[#94A3B8]">No pending referral claims awaiting manual qualification.</p>
            ) : (
              claims
                .filter((c) => c.status === 'pending')
                .map((c) => (
                  <div key={c.inviteeUid} className="flex flex-wrap items-center justify-between gap-3 py-2 border-t border-white/10">
                    <div className="text-xs">
                      <span className="font-semibold text-white">@{c.inviteeUsername}</span> invited by{' '}
                      <span className="font-semibold text-violet-300">@{c.inviterUsername}</span> (Code: {c.invitationCode}, Fraud Score: {c.fraudScore})
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => reviewReferralClaimAdmin(profile, roleDoc, c.inviteeUid, 'qualified')}
                        className="px-3 py-1 rounded-lg bg-emerald-600 text-xs font-semibold text-white"
                      >
                        Qualify
                      </button>
                      <button
                        type="button"
                        onClick={() => reviewReferralClaimAdmin(profile, roleDoc, c.inviteeUid, 'rejected')}
                        className="px-3 py-1 rounded-lg bg-rose-600 text-xs font-semibold text-white"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))
            )}
          </div>

          <div className="divide-y divide-white/10 border border-white/10 rounded-xl overflow-hidden">
            {invitations.map((inv) => (
              <div key={inv.code} className="p-3.5 flex flex-wrap items-center justify-between gap-3 bg-white/[0.01]">
                <div>
                  <p className="text-sm font-semibold text-white font-mono-tabular">
                    {inv.code}{' '}
                    <span className="font-sans text-xs font-normal text-[#94A3B8]">
                      ({inv.kind} · @{inv.ownerUsername})
                    </span>
                  </p>
                  <p className="text-xs text-[#94A3B8]">
                    {inv.qualifiedReferralsCount} qualified · {inv.pointsEarned} KP earned · {buildReferralShareUrl(inv.code)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => toggleInvitationActive(profile, roleDoc, inv.code, !inv.active)}
                  className={`px-3 py-1 rounded-lg border text-xs font-semibold ${
                    inv.active
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                      : 'border-white/15 bg-white/5 text-[#94A3B8]'
                  }`}
                >
                  {inv.active ? 'Active' : 'Paused'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* FRAUD ALERTS */}
      {tab === 'fraud' && (
        <div className="space-y-3">
          {fraudAlerts.length === 0 ? (
            <div className="p-8 text-center rounded-xl border border-dashed border-white/10">
              <ShieldCheck size={24} className="mx-auto text-emerald-400" />
              <p className="text-sm font-semibold text-white mt-2">Zero referral fraud alerts</p>
            </div>
          ) : (
            fraudAlerts.map((alert) => (
              <div key={alert.id} className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-sm font-bold text-white flex items-center gap-1.5">
                    <AlertTriangle size={14} className="text-amber-400" />
                    Fraud Score {alert.fraudScore}/100 · Code {alert.invitationCode}
                  </p>
                  <p className="text-xs text-[#CBD5E1]">
                    Signals: {alert.signals.join(', ')} · Status: {alert.status}
                  </p>
                </div>
                {alert.status === 'open' && (
                  <div className="flex gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        reviewFraudAlertAdmin(profile, roleDoc, alert.id, 'confirmed_fraud', 'Confirmed duplicate/self-referral')
                      }
                      className="px-3 py-1.5 rounded-lg bg-rose-600 text-xs font-semibold text-white"
                    >
                      Confirm Fraud &amp; Block
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        reviewFraudAlertAdmin(profile, roleDoc, alert.id, 'dismissed', 'False positive verified')
                      }
                      className="px-3 py-1.5 rounded-lg border border-white/15 bg-white/5 text-xs font-semibold text-white"
                    >
                      Dismiss
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
