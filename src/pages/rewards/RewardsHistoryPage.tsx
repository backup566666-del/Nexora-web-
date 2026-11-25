import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  Download,
  History,
  Sparkles,
  Users,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import {
  exportTransactionsCsv,
  subscribeMyReferralClaims,
  subscribeMyTaskSubmissions,
  subscribeMyWalletTransactions,
  subscribeMyWithdrawals,
} from '../../services/firebase/rewardsService';
import {
  ReferralClaim,
  TaskSubmission,
  WalletTransaction,
  WithdrawalRequest,
} from '../../types/nexora';
import { formatNaira } from '../../utils/validation';

export function RewardsHistoryPage() {
  const { profile } = useAuth();
  const [filter, setFilter] = useState<'all' | 'referrals' | 'tasks' | 'withdrawals' | 'wallet'>('all');
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [claims, setClaims] = useState<ReferralClaim[]>([]);
  const [submissions, setSubmissions] = useState<TaskSubmission[]>([]);

  useEffect(() => {
    if (!profile?.uid) return;
    const u1 = subscribeMyWalletTransactions(profile.uid, setTransactions);
    const u2 = subscribeMyWithdrawals(profile.uid, setWithdrawals);
    const u3 = subscribeMyReferralClaims(profile.uid, setClaims);
    const u4 = subscribeMyTaskSubmissions(profile.uid, setSubmissions);
    return () => {
      u1();
      u2();
      u3();
      u4();
    };
  }, [profile?.uid]);

  const timeline = useMemo(() => {
    const entries: Array<{
      id: string;
      kind: 'referrals' | 'tasks' | 'withdrawals' | 'wallet';
      title: string;
      subtitle: string;
      amountLabel: string;
      positive: boolean;
      status: string;
      tsMs: number;
    }> = [];

    for (const tx of transactions) {
      const kind: 'referrals' | 'tasks' | 'withdrawals' | 'wallet' =
        tx.type === 'referral_milestone'
          ? 'referrals'
          : tx.type === 'task_reward'
          ? 'tasks'
          : tx.type.startsWith('withdrawal')
          ? 'withdrawals'
          : 'wallet';
      entries.push({
        id: `tx_${tx.id}`,
        kind,
        title: tx.description,
        subtitle: `${tx.type.replace('_', ' ')} · Bal after: ${tx.balanceAfterAvailable} KP`,
        amountLabel: `${tx.direction === 'credit' ? '+' : '-'}${tx.points} KP`,
        positive: tx.direction === 'credit',
        status: tx.nairaEquivalent ? formatNaira(tx.nairaEquivalent) : 'Ledger',
        tsMs: tx.createdAt?.toMillis?.() || 0,
      });
    }

    for (const wd of withdrawals) {
      entries.push({
        id: `wd_${wd.id}`,
        kind: 'withdrawals',
        title: `Bank Withdrawal · ${wd.bankName} (${wd.accountNumberMasked})`,
        subtitle: wd.paymentReference
          ? `Payout Ref: ${wd.paymentReference}`
          : `${wd.pointsRequested} KP @ ₦${wd.pointRateNaira}/KP`,
        amountLabel: formatNaira(wd.nairaAmount),
        positive: false,
        status: wd.status,
        tsMs: wd.createdAt?.toMillis?.() || 0,
      });
    }

    for (const cl of claims) {
      entries.push({
        id: `ref_${cl.inviteeUid}`,
        kind: 'referrals',
        title: `Referral @${cl.inviteeUsername}`,
        subtitle: `Code ${cl.invitationCode} · ${cl.rewardStatus.replace('_', ' ')}`,
        amountLabel: cl.status === 'qualified' ? 'Qualified' : cl.status,
        positive: cl.status === 'qualified',
        status: cl.status,
        tsMs: cl.registeredAt?.toMillis?.() || 0,
      });
    }

    for (const sub of submissions) {
      entries.push({
        id: `task_${sub.id}`,
        kind: 'tasks',
        title: `Task: ${sub.taskTitle}`,
        subtitle: sub.reviewerNote || 'Verification proof submitted',
        amountLabel: `+${sub.rewardPoints} KP`,
        positive: sub.status === 'approved',
        status: sub.status,
        tsMs: sub.createdAt?.toMillis?.() || 0,
      });
    }

    entries.sort((a, b) => b.tsMs - a.tsMs);
    return filter === 'all' ? entries : entries.filter((e) => e.kind === filter);
  }, [transactions, withdrawals, claims, submissions, filter]);

  if (!profile) return null;

  const handleDownloadCsv = () => {
    const csv = exportTransactionsCsv(transactions);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nexora-rewards-history-${profile.username}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-white/10 bg-[#0D0D14]/90 p-6 sm:p-7 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-violet-400">
              <History size={14} />
              Unified Rewards Ledger
            </div>
            <h1 className="font-display text-2xl font-bold text-white">Rewards History</h1>
            <p className="text-sm text-[#94A3B8]">
              Complete record of referral qualifications, task rewards, wallet adjustments, and bank withdrawals.
            </p>
          </div>
          <button
            type="button"
            onClick={handleDownloadCsv}
            disabled={transactions.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-xs font-semibold text-white disabled:opacity-40"
          >
            <Download size={14} />
            Export CSV
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {(['all', 'referrals', 'tasks', 'withdrawals', 'wallet'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setFilter(tab)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold capitalize border transition ${
                filter === tab
                  ? 'bg-[#7C3AED] border-[#7C3AED] text-white'
                  : 'bg-white/5 border-white/10 text-[#94A3B8] hover:text-white'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#0D0D14]/90 p-6">
        {timeline.length === 0 ? (
          <div className="py-12 text-center space-y-2 border border-dashed border-white/10 rounded-xl">
            <History size={24} className="mx-auto text-[#64748B]" />
            <p className="text-sm font-medium text-white">No rewards activity found</p>
            <p className="text-xs text-[#94A3B8]">
              Invite friends or complete free tasks to see your verified reward timeline here.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-white/10">
            {timeline.map((item) => (
              <div key={item.id} className="py-3.5 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0 text-violet-300">
                    {item.kind === 'referrals' ? (
                      <Users size={16} />
                    ) : item.kind === 'tasks' ? (
                      <Sparkles size={16} />
                    ) : item.kind === 'withdrawals' ? (
                      <Banknote size={16} />
                    ) : item.positive ? (
                      <ArrowDownRight size={16} className="text-emerald-400" />
                    ) : (
                      <ArrowUpRight size={16} className="text-rose-400" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">{item.title}</p>
                    <p className="text-xs text-[#94A3B8] truncate">{item.subtitle}</p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-mono-tabular text-sm font-semibold text-white">
                    {item.amountLabel}
                  </p>
                  <p className="text-[11px] text-[#94A3B8] capitalize">
                    {item.status.replace('_', ' ')} ·{' '}
                    {item.tsMs ? new Date(item.tsMs).toLocaleDateString() : 'Recent'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
