import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  Building2,
  CheckCircle2,
  Clock,
  Lock,
  ShieldCheck,
  Unlock,
  Wallet,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { extractReadableErrorMessage } from '../../services/firebase/errorHandler';
import {
  emptyWalletAccount,
  fetchBankProviderStatus,
  fetchNigerianBanks,
  submitBankWithdrawalRequest,
  subscribeMyWallet,
  subscribeMyWalletTransactions,
  subscribeMyWithdrawals,
  subscribeRewardsConfig,
  verifyNigerianBankAccount,
} from '../../services/firebase/rewardsService';
import {
  BankAccountResolution,
  BankProviderStatus,
  NigerianBankInfo,
  RewardsConfig,
  WalletAccount,
  WalletTransaction,
  WithdrawalRequest,
} from '../../types/nexora';
import {
  computeConvertedNaira,
  DEFAULT_REWARDS_CONFIG,
  formatNaira,
  validateWithdrawalEligibility,
} from '../../utils/validation';

export function WalletPage() {
  const { profile, myRole: roleDoc } = useAuth();
  const [config, setConfig] = useState<RewardsConfig>({ ...DEFAULT_REWARDS_CONFIG });
  const [wallet, setWallet] = useState<WalletAccount>(emptyWalletAccount(profile?.uid || ''));
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);

  const [providerStatus, setProviderStatus] = useState<BankProviderStatus | null>(null);
  const [banks, setBanks] = useState<NigerianBankInfo[]>([]);
  const [selectedBankCode, setSelectedBankCode] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountHolderName, setAccountHolderName] = useState('');
  const [pointsInput, setPointsInput] = useState('');
  const [resolvingBank, setResolvingBank] = useState(false);
  const [bankResolution, setBankResolution] = useState<BankAccountResolution | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    const unsubCfg = subscribeRewardsConfig(setConfig);
    fetchBankProviderStatus().then(setProviderStatus).catch(() => {});
    fetchNigerianBanks()
      .then((res) => {
        setBanks(res.banks);
        if (res.banks.length > 0) {
          setSelectedBankCode((prev) => prev || res.banks[0].code);
        }
      })
      .catch(() => {});
    return () => unsubCfg();
  }, []);

  useEffect(() => {
    if (!profile?.uid) return;
    const unsubWallet = subscribeMyWallet(profile.uid, setWallet);
    const unsubTxs = subscribeMyWalletTransactions(profile.uid, setTransactions);
    const unsubWd = subscribeMyWithdrawals(profile.uid, setWithdrawals);
    return () => {
      unsubWallet();
      unsubTxs();
      unsubWd();
    };
  }, [profile?.uid]);

  if (!profile) return null;

  const rate = config.pointRateNaira;
  const convertedAvailableNaira = computeConvertedNaira(wallet.availablePoints, rate);
  const requestedPoints = Number(pointsInput || 0);
  const requestedNaira = computeConvertedNaira(requestedPoints, rate);

  const selectedBank = banks.find((b) => b.code === selectedBankCode);

  const handleVerifyAccount = async () => {
    setFeedback(null);
    setResolvingBank(true);
    try {
      const resolution = await verifyNigerianBankAccount(accountNumber, selectedBankCode);
      setBankResolution(resolution);
      if (resolution.verified && resolution.accountName) {
        setAccountHolderName(resolution.accountName);
        setFeedback({ type: 'ok', text: resolution.message });
      } else {
        setFeedback({
          type: resolution.verificationStatus === 'not_configured' ? 'ok' : 'err',
          text: resolution.message,
        });
      }
    } catch (err) {
      setFeedback({
        type: 'err',
        text: extractReadableErrorMessage(err, 'Unable to verify bank account details.'),
      });
    } finally {
      setResolvingBank(false);
    }
  };

  const handleSubmitWithdrawal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setFeedback(null);

    const check = validateWithdrawalEligibility({
      pointsRequested: requestedPoints,
      availablePoints: wallet.availablePoints,
      frozen: wallet.frozen,
      config,
    });
    if (!check.ok) {
      setFeedback({ type: 'err', text: check.error || 'Withdrawal validation failed.' });
      return;
    }

    if (!selectedBank) {
      setFeedback({ type: 'err', text: 'Please select a valid bank.' });
      return;
    }

    setSubmitting(true);
    try {
      const verificationStatus = bankResolution?.verified
        ? 'verified'
        : providerStatus?.configured === false
        ? 'not_configured'
        : 'unverified_manual';

      const res = await submitBankWithdrawalRequest(profile, roleDoc, {
        pointsRequested: requestedPoints,
        bankName: selectedBank.name,
        bankCode: selectedBank.code,
        accountNumber,
        accountHolderName,
        accountVerificationStatus: verificationStatus,
        verificationProvider:
          bankResolution?.provider || providerStatus?.provider || 'none',
        providerResponseSummary: bankResolution?.message,
        wallet,
        config,
      });

      setPointsInput('');
      setAccountNumber('');
      setAccountHolderName('');
      setBankResolution(null);
      setFeedback({
        type: 'ok',
        text: `Withdrawal request submitted for ${formatNaira(res.nairaAmount)}. Your Key Points are locked pending admin payout review.`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: extractReadableErrorMessage(err, 'Could not submit withdrawal request.'),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const statusBadge = (status: WithdrawalRequest['status']) => {
    switch (status) {
      case 'paid':
        return 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300';
      case 'approved':
      case 'processing':
        return 'bg-sky-500/15 border-sky-500/30 text-sky-300';
      case 'rejected':
        return 'bg-rose-500/15 border-rose-500/30 text-rose-300';
      default:
        return 'bg-amber-500/15 border-amber-500/30 text-amber-300';
    }
  };

  return (
    <div className="space-y-6">
      {/* Wallet Hero */}
      <div className="rounded-2xl border border-white/10 bg-[#0D0D14]/90 p-6 sm:p-7 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-violet-400">
              <Wallet size={14} />
              Nexora Key Points Wallet
            </div>
            <h1 className="font-display text-2xl font-bold text-white">Balance &amp; Naira Withdrawals</h1>
            <p className="text-sm text-[#94A3B8]">
              Track earned Key Points from verified referrals and free tasks, view Naira conversion, and request bank payouts.
            </p>
          </div>
          <div
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs font-semibold ${
              config.withdrawalsOpen
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
            }`}
          >
            {config.withdrawalsOpen ? <Unlock size={14} /> : <Lock size={14} />}
            {config.withdrawalsOpen ? 'Withdrawals Open' : 'Withdrawals Locked'}
          </div>
        </div>

        {/* 4 Fintech KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-1">
            <p className="text-xs text-[#94A3B8]">Available Key Points</p>
            <p className="font-mono-tabular text-2xl font-bold text-white">{wallet.availablePoints} KP</p>
            <p className="text-[11px] text-[#64748B]">Ready for conversion</p>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-1">
            <p className="text-xs text-[#94A3B8]">Pending / Locked Points</p>
            <p className="font-mono-tabular text-2xl font-bold text-amber-300">
              {wallet.pendingPoints + wallet.lockedPoints} KP
            </p>
            <p className="text-[11px] text-[#64748B]">
              {wallet.pendingPoints} pending · {wallet.lockedPoints} in payout review
            </p>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-1">
            <p className="text-xs text-[#94A3B8]">Converted Naira Value</p>
            <p className="font-mono-tabular text-2xl font-bold text-emerald-300">
              {rate ? formatNaira(convertedAvailableNaira) : 'Rate pending'}
            </p>
            <p className="text-[11px] text-[#64748B]">
              {rate ? `Rate: ₦${rate.toLocaleString('en-NG')} per 1 KP` : 'Awaiting Owner rate configuration'}
            </p>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-1">
            <p className="text-xs text-[#94A3B8]">Lifetime Withdrawn</p>
            <p className="font-mono-tabular text-2xl font-bold text-white">
              {formatNaira(wallet.lifetimeWithdrawnNaira || 0)}
            </p>
            <p className="text-[11px] text-[#64748B]">
              Minimum withdrawal: {formatNaira(config.minWithdrawalNaira)}
            </p>
          </div>
        </div>
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

      {/* Bank Withdrawal Form + Recent Withdrawals */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-6 rounded-2xl border border-white/10 bg-[#0D0D14]/90 p-6 space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold text-white flex items-center gap-2">
                <Building2 size={18} className="text-violet-400" />
                Request Naira Bank Withdrawal
              </h2>
              <p className="text-xs text-[#94A3B8] mt-1">
                Minimum withdrawal is {formatNaira(config.minWithdrawalNaira)}. Nigerian NUBAN accounts are verified via Paystack/Flutterwave when configured.
              </p>
            </div>
          </div>

          {!config.withdrawalsOpen && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 flex items-start gap-2.5 text-xs text-amber-200">
              <Lock size={15} className="shrink-0 mt-0.5" />
              <span>
                {config.lockReason ||
                  'Withdrawals are currently locked by Nexora administration. Continue earning Key Points while payouts are paused.'}
              </span>
            </div>
          )}

          {config.withdrawalsOpen && !rate && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 flex items-start gap-2.5 text-xs text-amber-200">
              <AlertCircle size={15} className="shrink-0 mt-0.5" />
              <span>
                The Key Point conversion rate (`₦ / KP`) has not been configured by the Nexora Owner yet. Withdrawals become active once the Owner sets the official rate.
              </span>
            </div>
          )}

          {providerStatus && !providerStatus.configured && (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-[#94A3B8]">
              {providerStatus.message}
            </div>
          )}

          <form onSubmit={handleSubmitWithdrawal} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">Bank Name</label>
                <select
                  value={selectedBankCode}
                  onChange={(e) => {
                    setSelectedBankCode(e.target.value);
                    setBankResolution(null);
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white"
                >
                  {banks.map((b) => (
                    <option key={b.code} value={b.code} className="bg-[#0D0D14] text-white">
                      {b.name} ({b.code})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">
                  Bank Code
                </label>
                <input
                  type="text"
                  readOnly
                  value={selectedBankCode}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-sm text-[#94A3B8] font-mono-tabular"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">
                10-Digit NUBAN Account Number
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={10}
                  value={accountNumber}
                  onChange={(e) => {
                    setAccountNumber(e.target.value.replace(/\D/g, '').slice(0, 10));
                    setBankResolution(null);
                  }}
                  placeholder="0123456789"
                  required
                  className="flex-1 px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white font-mono-tabular"
                />
                <button
                  type="button"
                  disabled={resolvingBank || accountNumber.length !== 10 || !selectedBankCode}
                  onClick={handleVerifyAccount}
                  className="px-4 py-2.5 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-xs font-semibold text-white disabled:opacity-40"
                >
                  {resolvingBank ? 'Checking...' : 'Verify Account'}
                </button>
              </div>
              {bankResolution && (
                <p
                  className={`mt-1.5 text-xs flex items-center gap-1.5 ${
                    bankResolution.verified ? 'text-emerald-400' : 'text-amber-300'
                  }`}
                >
                  {bankResolution.verified ? <ShieldCheck size={13} /> : <AlertCircle size={13} />}
                  {bankResolution.message}
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">
                Account Holder Name
              </label>
              <input
                type="text"
                value={accountHolderName}
                onChange={(e) => setAccountHolderName(e.target.value)}
                required
                readOnly={Boolean(bankResolution?.verified && bankResolution.accountName)}
                placeholder="Enter exact bank account holder name"
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">
                  Key Points to Withdraw
                </label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  max={Math.max(1, wallet.availablePoints)}
                  value={pointsInput}
                  onChange={(e) => setPointsInput(e.target.value)}
                  placeholder={`Available: ${wallet.availablePoints}`}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white font-mono-tabular"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">
                  Naira Payout Estimate
                </label>
                <div className="px-3.5 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 font-mono-tabular text-sm font-semibold text-emerald-300">
                  {rate && requestedPoints > 0 ? formatNaira(requestedNaira) : '—'}
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting || !config.withdrawalsOpen || !rate}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#6366F1] text-sm font-semibold text-white disabled:opacity-40"
            >
              <Banknote size={16} />
              {submitting ? 'Submitting Withdrawal...' : 'Submit Bank Withdrawal'}
            </button>
          </form>
        </div>

        {/* Withdrawal Requests History */}
        <div className="xl:col-span-6 rounded-2xl border border-white/10 bg-[#0D0D14]/90 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-white">Withdrawal History</h2>
            <span className="font-mono-tabular text-xs text-[#94A3B8]">{withdrawals.length} request(s)</span>
          </div>

          {withdrawals.length === 0 ? (
            <div className="py-12 text-center space-y-2 border border-dashed border-white/10 rounded-xl">
              <Clock size={24} className="mx-auto text-[#64748B]" />
              <p className="text-sm font-medium text-white">No withdrawals requested yet</p>
              <p className="text-xs text-[#94A3B8]">
                Once eligible, your submitted Naira bank withdrawals and payout references appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {withdrawals.map((wd) => (
                <div
                  key={wd.id}
                  className="p-4 rounded-xl border border-white/10 bg-white/[0.02] space-y-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-mono-tabular text-base font-bold text-white">
                        {formatNaira(wd.nairaAmount)}
                      </p>
                      <p className="text-xs text-[#94A3B8]">
                        {wd.pointsRequested} KP @ ₦{wd.pointRateNaira}/KP
                      </p>
                    </div>
                    <span
                      className={`px-2.5 py-1 rounded-lg border text-xs font-semibold capitalize ${statusBadge(
                        wd.status
                      )}`}
                    >
                      {wd.status.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="text-xs text-[#CBD5E1] flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span>
                      {wd.bankName} · {wd.accountNumberMasked}
                    </span>
                    <span>{wd.accountHolderName}</span>
                  </div>
                  {wd.paymentReference && (
                    <p className="text-xs text-emerald-300 font-mono-tabular">
                      Payout Ref: {wd.paymentReference}
                    </p>
                  )}
                  {wd.adminNote && (
                    <p className="text-xs text-[#94A3B8]">Admin note: {wd.adminNote}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Wallet Ledger */}
      <div className="rounded-2xl border border-white/10 bg-[#0D0D14]/90 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-white">Recent Wallet Transactions</h2>
          <span className="font-mono-tabular text-xs text-[#94A3B8]">{transactions.length} entry(ies)</span>
        </div>

        {transactions.length === 0 ? (
          <p className="text-sm text-[#94A3B8]">No wallet transactions recorded yet.</p>
        ) : (
          <div className="divide-y divide-white/10">
            {transactions.slice(0, 20).map((tx) => (
              <div key={tx.id} className="py-3 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      tx.direction === 'credit'
                        ? 'bg-emerald-500/15 text-emerald-400'
                        : 'bg-rose-500/15 text-rose-400'
                    }`}
                  >
                    {tx.direction === 'credit' ? <ArrowDownRight size={16} /> : <ArrowUpRight size={16} />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">{tx.description}</p>
                    <p className="text-xs text-[#94A3B8] capitalize">
                      {tx.type.replace('_', ' ')} ·{' '}
                      {tx.createdAt?.toDate ? tx.createdAt.toDate().toLocaleString() : 'Recent'}
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p
                    className={`font-mono-tabular text-sm font-bold ${
                      tx.direction === 'credit' ? 'text-emerald-400' : 'text-rose-300'
                    }`}
                  >
                    {tx.direction === 'credit' ? '+' : '-'}
                    {tx.points} KP
                  </p>
                  <p className="text-[11px] text-[#64748B] font-mono-tabular">
                    Bal: {tx.balanceAfterAvailable} KP
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
