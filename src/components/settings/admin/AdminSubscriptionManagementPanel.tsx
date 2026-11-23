import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  CreditCard,
  DollarSign,
  Receipt,
  RefreshCw,
  RotateCcw,
  Save,
  Users,
} from 'lucide-react';
import {
  PaymentTransaction,
  SubscriptionPlan,
  SubscriptionTier,
  UserProfile,
  UserSubscription,
} from '../../../types/nexora';
import {
  DEFAULT_SUBSCRIPTION_PLANS,
} from '../../../utils/validation';
import {
  fetchBillingServerStatus,
  formatMoneyCents,
  subscribeSubscriptionPlans,
  type BillingServerStatus,
} from '../../../services/firebase/subscriptionService';
import {
  adminRefundTransaction,
  adminUpdateUserTier,
  saveSubscriptionPlanAdmin,
  subscribeAllPaymentTransactionsAdmin,
  subscribeAllUserSubscriptionsAdmin,
} from '../../../services/firebase/customisationService';
import { extractReadableErrorMessage } from '../../../services/firebase/errorHandler';
import { FriendlyErrorBanner } from '../../common/FriendlyErrorBanner';
import { TierBadge } from '../../common/TierBadge';

interface AdminSubscriptionManagementPanelProps {
  actor: UserProfile;
  actorRole: string;
  users: UserProfile[];
}

export const AdminSubscriptionManagementPanel: React.FC<
  AdminSubscriptionManagementPanelProps
> = ({ actor, actorRole, users }) => {
  const [plans, setPlans] = useState<SubscriptionPlan[]>(DEFAULT_SUBSCRIPTION_PLANS);
  const [editingPlans, setEditingPlans] = useState<Record<SubscriptionTier, SubscriptionPlan>>(() => ({
    free: DEFAULT_SUBSCRIPTION_PLANS[0],
    plus: DEFAULT_SUBSCRIPTION_PLANS[1],
    pro: DEFAULT_SUBSCRIPTION_PLANS[2],
  }));
  const [subscriptions, setSubscriptions] = useState<UserSubscription[]>([]);
  const [transactions, setTransactions] = useState<PaymentTransaction[]>([]);
  const [serverStatus, setServerStatus] = useState<BillingServerStatus | null>(null);
  const [savingPlanId, setSavingPlanId] = useState<SubscriptionTier | null>(null);
  const [selectedUserUid, setSelectedUserUid] = useState('');
  const [grantTier, setGrantTier] = useState<SubscriptionTier>('plus');
  const [grantDays, setGrantDays] = useState(30);
  const [busyGrant, setBusyGrant] = useState(false);
  const [refundingId, setRefundingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  useEffect(() => {
    void fetchBillingServerStatus().then(setServerStatus);
    const u1 = subscribeSubscriptionPlans((next) => {
      setPlans(next);
      setEditingPlans((prev) => {
        const mapped = { ...prev };
        next.forEach((p) => {
          mapped[p.id] = p;
        });
        return mapped;
      });
    });
    const u2 = subscribeAllUserSubscriptionsAdmin(setSubscriptions);
    const u3 = subscribeAllPaymentTransactionsAdmin(setTransactions);
    return () => {
      u1();
      u2();
      u3();
    };
  }, []);

  const updateDraftPlan = (tier: SubscriptionTier, patch: Partial<SubscriptionPlan>) => {
    setEditingPlans((prev) => ({
      ...prev,
      [tier]: { ...prev[tier], ...patch },
    }));
  };

  const handleSavePlan = async (tier: SubscriptionTier) => {
    setErrorMsg(null);
    setStatusMsg(null);
    setSavingPlanId(tier);
    try {
      await saveSubscriptionPlanAdmin({
        actor,
        actorRole,
        plan: editingPlans[tier],
      });
      setStatusMsg(`${editingPlans[tier].name} plan configuration saved.`);
    } catch (err) {
      setErrorMsg(extractReadableErrorMessage(err, 'Could not save subscription plan settings.'));
    } finally {
      setSavingPlanId(null);
    }
  };

  const handleAssignUserTier = async () => {
    const target = users.find((u) => u.uid === selectedUserUid);
    if (!target) {
      setErrorMsg('Please select a verified member account first.');
      return;
    }
    setErrorMsg(null);
    setStatusMsg(null);
    setBusyGrant(true);
    try {
      await adminUpdateUserTier({
        actor,
        actorRole,
        targetUser: target,
        tier: grantTier,
        durationDays: grantDays,
      });
      setStatusMsg(`Updated @${target.username} to Nexora ${grantTier.toUpperCase()}.`);
    } catch (err) {
      setErrorMsg(extractReadableErrorMessage(err, 'Could not update member tier.'));
    } finally {
      setBusyGrant(false);
    }
  };

  const handleRefund = async (tx: PaymentTransaction) => {
    setErrorMsg(null);
    setStatusMsg(null);
    setRefundingId(tx.id);
    try {
      await adminRefundTransaction({ actor, actorRole, tx });
      setStatusMsg(`Refund processed for receipt ${tx.receiptNumber}.`);
    } catch (err) {
      setErrorMsg(extractReadableErrorMessage(err, 'Unable to issue refund for this payment.'));
    } finally {
      setRefundingId(null);
    }
  };

  const paidRevenueCents = transactions
    .filter((t) => t.status === 'paid')
    .reduce((sum, t) => sum + (t.amountCents || 0), 0);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-[#0D0B16] border border-[#8B5CF6]/20 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-bold text-white flex items-center gap-2">
              <CreditCard size={17} className="text-[#C084FC]" />
              Subscription Plans & Stripe Billing Control
            </h2>
            <p className="text-xs text-[#94A3B8] mt-1">
              Set live pricing, Stripe Price IDs, plan availability, and benefits. Paid plans stay checkout-locked until pricing is configured here.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span
              className={`px-3 py-1.5 rounded-xl border font-semibold ${
                serverStatus?.configured
                  ? 'bg-emerald-500/15 border-emerald-400/30 text-emerald-200'
                  : 'bg-amber-500/15 border-amber-400/30 text-amber-200'
              }`}
            >
              {serverStatus?.configured ? 'Stripe Keys Active' : 'Stripe Keys Missing'}
            </span>
          </div>
        </div>

        <FriendlyErrorBanner message={errorMsg} onDismiss={() => setErrorMsg(null)} />
        {statusMsg && (
          <div className="rounded-xl bg-emerald-500/10 border border-emerald-400/30 px-4 py-2.5 text-xs text-emerald-200 flex items-center gap-2">
            <CheckCircle2 size={14} /> {statusMsg}
          </div>
        )}

        {/* Metrics Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-4 rounded-xl bg-[#120F1E] border border-white/10">
            <p className="text-[11px] text-[#94A3B8]">Tracked Subscriptions</p>
            <p className="font-mono-tabular text-xl font-bold text-white mt-1">
              {subscriptions.filter((s) => s.tier !== 'free' && s.status !== 'expired').length}
            </p>
          </div>
          <div className="p-4 rounded-xl bg-[#120F1E] border border-white/10">
            <p className="text-[11px] text-[#94A3B8]">Completed Receipts</p>
            <p className="font-mono-tabular text-xl font-bold text-white mt-1">
              {transactions.filter((t) => t.status === 'paid').length}
            </p>
          </div>
          <div className="p-4 rounded-xl bg-[#120F1E] border border-white/10">
            <p className="text-[11px] text-[#94A3B8]">Net Paid Volume</p>
            <p className="font-mono-tabular text-xl font-bold text-emerald-300 mt-1">
              {formatMoneyCents(paidRevenueCents)}
            </p>
          </div>
        </div>

        {/* Plan Editors */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {(['free', 'plus', 'pro'] as SubscriptionTier[]).map((tierId) => {
            const p = editingPlans[tierId] || plans.find((pl) => pl.id === tierId) || DEFAULT_SUBSCRIPTION_PLANS[0];
            return (
              <div
                key={tierId}
                className="rounded-xl bg-[#120F1E] border border-white/10 p-4 space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <TierBadge tier={tierId} showFree size="sm" />
                    <span className="text-sm font-semibold text-white">{p.name}</span>
                  </div>
                  <label className="inline-flex items-center gap-1.5 text-xs text-[#CBD5E1]">
                    <input
                      type="checkbox"
                      checked={p.enabled}
                      onChange={(e) => updateDraftPlan(tierId, { enabled: e.target.checked })}
                      className="accent-[#8B5CF6]"
                    />
                    Enabled
                  </label>
                </div>

                <label className="block space-y-1">
                  <span className="text-[11px] text-[#94A3B8]">Plan Name</span>
                  <input
                    type="text"
                    value={p.name}
                    onChange={(e) => updateDraftPlan(tierId, { name: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-[#090712] border border-white/10 text-xs text-white"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-[11px] text-[#94A3B8]">Tagline</span>
                  <input
                    type="text"
                    value={p.tagline}
                    onChange={(e) => updateDraftPlan(tierId, { tagline: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-[#090712] border border-white/10 text-xs text-white"
                  />
                </label>

                {tierId !== 'free' && (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="block space-y-1">
                        <span className="text-[11px] text-[#94A3B8]">Monthly (cents)</span>
                        <input
                          type="number"
                          min={0}
                          placeholder="Unset"
                          value={p.monthlyPriceCents ?? ''}
                          onChange={(e) =>
                            updateDraftPlan(tierId, {
                              monthlyPriceCents:
                                e.target.value === '' ? null : Math.max(0, Number(e.target.value)),
                            })
                          }
                          className="w-full px-3 py-2 rounded-lg bg-[#090712] border border-white/10 text-xs text-white font-mono-tabular"
                        />
                      </label>
                      <label className="block space-y-1">
                        <span className="text-[11px] text-[#94A3B8]">Yearly (cents)</span>
                        <input
                          type="number"
                          min={0}
                          placeholder="Unset"
                          value={p.yearlyPriceCents ?? ''}
                          onChange={(e) =>
                            updateDraftPlan(tierId, {
                              yearlyPriceCents:
                                e.target.value === '' ? null : Math.max(0, Number(e.target.value)),
                            })
                          }
                          className="w-full px-3 py-2 rounded-lg bg-[#090712] border border-white/10 text-xs text-white font-mono-tabular"
                        />
                      </label>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <label className="block space-y-1">
                        <span className="text-[11px] text-[#94A3B8]">Stripe Monthly ID</span>
                        <input
                          type="text"
                          placeholder="price_..."
                          value={p.stripeMonthlyPriceId || ''}
                          onChange={(e) =>
                            updateDraftPlan(tierId, { stripeMonthlyPriceId: e.target.value })
                          }
                          className="w-full px-3 py-2 rounded-lg bg-[#090712] border border-white/10 text-xs text-white"
                        />
                      </label>
                      <label className="block space-y-1">
                        <span className="text-[11px] text-[#94A3B8]">Stripe Yearly ID</span>
                        <input
                          type="text"
                          placeholder="price_..."
                          value={p.stripeYearlyPriceId || ''}
                          onChange={(e) =>
                            updateDraftPlan(tierId, { stripeYearlyPriceId: e.target.value })
                          }
                          className="w-full px-3 py-2 rounded-lg bg-[#090712] border border-white/10 text-xs text-white"
                        />
                      </label>
                    </div>
                  </>
                )}

                <label className="block space-y-1">
                  <span className="text-[11px] text-[#94A3B8]">Benefits (one per line)</span>
                  <textarea
                    rows={4}
                    value={p.benefits.join('\n')}
                    onChange={(e) =>
                      updateDraftPlan(tierId, {
                        benefits: e.target.value.split('\n'),
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg bg-[#090712] border border-white/10 text-xs text-white resize-none"
                  />
                </label>

                <button
                  type="button"
                  disabled={savingPlanId === tierId}
                  onClick={() => void handleSavePlan(tierId)}
                  className="w-full min-h-[40px] inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-xs font-semibold text-white disabled:opacity-50"
                >
                  <Save size={13} />
                  {savingPlanId === tierId ? 'Saving...' : `Save ${p.name}`}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Member Tier Assignment */}
      <section className="rounded-2xl bg-[#0D0B16] border border-[#8B5CF6]/15 p-5 space-y-4">
        <h3 className="font-display text-sm font-bold text-white flex items-center gap-2">
          <Users size={15} className="text-[#C084FC]" />
          Manage Member Tier Status
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <label className="block space-y-1 sm:col-span-2">
            <span className="text-[11px] text-[#94A3B8]">Member Account</span>
            <select
              value={selectedUserUid}
              onChange={(e) => setSelectedUserUid(e.target.value)}
              className="w-full min-h-[42px] px-3 rounded-xl bg-[#120F1E] border border-white/10 text-xs text-white"
            >
              <option value="">Select member...</option>
              {users.map((u) => (
                <option key={u.uid} value={u.uid}>
                  {u.displayName} (@{u.username}) — {u.subscriptionTier || 'free'}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] text-[#94A3B8]">Target Tier</span>
            <select
              value={grantTier}
              onChange={(e) => setGrantTier(e.target.value as SubscriptionTier)}
              className="w-full min-h-[42px] px-3 rounded-xl bg-[#120F1E] border border-white/10 text-xs text-white"
            >
              <option value="free">Nexora Free</option>
              <option value="plus">Nexora Plus</option>
              <option value="pro">Nexora Pro</option>
            </select>
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={365}
              value={grantDays}
              onChange={(e) => setGrantDays(Number(e.target.value))}
              aria-label="Duration days"
              className="w-20 min-h-[42px] px-2.5 rounded-xl bg-[#120F1E] border border-white/10 text-xs text-white font-mono-tabular"
            />
            <button
              type="button"
              disabled={busyGrant}
              onClick={() => void handleAssignUserTier()}
              className="flex-1 min-h-[42px] px-4 rounded-xl bg-[#7C3AED] text-xs font-semibold text-white disabled:opacity-50"
            >
              {busyGrant ? 'Updating...' : 'Apply'}
            </button>
          </div>
        </div>
      </section>

      {/* Transactions & Refunds */}
      <section className="rounded-2xl bg-[#0D0B16] border border-[#8B5CF6]/15 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-sm font-bold text-white flex items-center gap-2">
            <Receipt size={15} className="text-[#C084FC]" />
            Subscription Transactions & Refunds
          </h3>
          <span className="text-xs text-[#94A3B8] font-mono-tabular">
            {transactions.length} records
          </span>
        </div>

        {transactions.length === 0 ? (
          <p className="text-xs text-[#64748B] py-6 text-center">
            No payment transactions recorded yet.
          </p>
        ) : (
          <div className="divide-y divide-white/[0.06]">
            {transactions.map((tx) => (
              <div
                key={tx.id}
                className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
              >
                <div className="space-y-0.5">
                  <p className="font-semibold text-white">
                    {tx.userDisplayName || tx.uid}{' '}
                    {tx.userUsername ? <span className="text-[#94A3B8]">@{tx.userUsername}</span> : null}
                  </p>
                  <p className="text-[#94A3B8] font-mono-tabular">
                    {tx.receiptNumber} · Nexora {tx.planId.toUpperCase()} ({tx.billingCycle}) ·{' '}
                    <span className="uppercase">{tx.status}</span>
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono-tabular font-semibold text-white">
                    {formatMoneyCents(tx.amountCents, tx.currency)}
                  </span>
                  {tx.status === 'paid' && tx.provider === 'stripe' && (
                    <button
                      type="button"
                      disabled={refundingId === tx.id}
                      onClick={() => void handleRefund(tx)}
                      className="min-h-[36px] px-3 rounded-lg bg-rose-500/15 border border-rose-400/30 text-rose-200 hover:bg-rose-500/25 inline-flex items-center gap-1 font-semibold disabled:opacity-50"
                    >
                      {refundingId === tx.id ? (
                        <RefreshCw size={12} className="animate-spin" />
                      ) : (
                        <RotateCcw size={12} />
                      )}
                      Refund
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
