import React, { useEffect, useState } from 'react';
import {
  Check,
  CreditCard,
  Crown,
  Palette,
  Receipt,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import {
  BillingCycle,
  NavSection,
  PaymentTransaction,
  SubscriptionPlan,
  SubscriptionTier,
  UserProfile,
  UserSubscription,
} from '../../types/nexora';
import {
  BillingServerStatus,
  cancelActiveSubscription,
  fetchBillingServerStatus,
  formatMoneyCents,
  startSubscriptionCheckout,
  subscribeMyTransactions,
  verifyAndActivateStripeSession,
} from '../../services/firebase/subscriptionService';
import { extractReadableErrorMessage } from '../../services/firebase/errorHandler';
import { canAccessTier } from '../../utils/validation';
import { TierBadge } from '../../components/common/TierBadge';
import { FriendlyErrorBanner } from '../../components/common/FriendlyErrorBanner';

interface SubscriptionsPageProps {
  profile: UserProfile;
  effectiveTier: SubscriptionTier;
  subscription: UserSubscription | null;
  plans: SubscriptionPlan[];
  pendingBillingSessionId?: string | null;
  onClearBillingSessionParam?: () => void;
  onNavigate: (section: NavSection) => void;
}

export const SubscriptionsPage: React.FC<SubscriptionsPageProps> = ({
  profile,
  effectiveTier,
  subscription,
  plans,
  pendingBillingSessionId,
  onClearBillingSessionParam,
  onNavigate,
}) => {
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');
  const [billingStatus, setBillingStatus] = useState<BillingServerStatus | null>(null);
  const [transactions, setTransactions] = useState<PaymentTransaction[]>([]);
  const [selectedReceipt, setSelectedReceipt] = useState<PaymentTransaction | null>(null);
  const [busyPlan, setBusyPlan] = useState<SubscriptionTier | null>(null);
  const [canceling, setCanceling] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [statusMsg, setStatusMsg] = useState('');

  useEffect(() => {
    void fetchBillingServerStatus().then(setBillingStatus);
    return subscribeMyTransactions(profile.uid, setTransactions);
  }, [profile.uid]);

  // Verify returning Stripe checkout session server-side before unlocking membership
  useEffect(() => {
    if (!pendingBillingSessionId) return;
    let active = true;
    void verifyAndActivateStripeSession({
      user: profile,
      sessionId: pendingBillingSessionId,
    })
      .then((res) => {
        if (!active) return;
        setStatusMsg(
          `Payment verified! Your ${res.tier === 'pro' ? 'Nexora Pro' : 'Nexora Plus'} membership is now active.`
        );
        onClearBillingSessionParam?.();
      })
      .catch((err) => {
        if (!active) return;
        setErrorMsg(
          extractReadableErrorMessage(err, 'Your payment could not be verified yet. Please check your payment method.')
        );
        onClearBillingSessionParam?.();
      });
    return () => {
      active = false;
    };
  }, [pendingBillingSessionId, profile, onClearBillingSessionParam]);

  const handleSelectPlan = async (plan: SubscriptionPlan) => {
    setErrorMsg('');
    setStatusMsg('');
    if (plan.id === 'free' || plan.id === effectiveTier) return;
    setBusyPlan(plan.id);
    try {
      const checkout = await startSubscriptionCheckout({ plan, billingCycle });
      window.location.assign(checkout.url);
    } catch (err) {
      setErrorMsg(
        extractReadableErrorMessage(
          err,
          'Your payment couldn’t be completed. Please check your payment method.'
        )
      );
    } finally {
      setBusyPlan(null);
    }
  };

  const handleCancelSubscription = async () => {
    if (!subscription) return;
    setErrorMsg('');
    setCanceling(true);
    try {
      await cancelActiveSubscription({ user: profile, subscription });
      setConfirmCancel(false);
      setStatusMsg(
        'Cancellation scheduled. Your benefits remain active until the current billing period ends.'
      );
    } catch (err) {
      setErrorMsg(
        extractReadableErrorMessage(err, 'Unable to update subscription cancellation right now.')
      );
    } finally {
      setCanceling(false);
    }
  };

  const isOwnerComplimentary =
    effectiveTier === 'pro' &&
    (!subscription ||
      (subscription.provider === 'admin' &&
        (subscription.receiptRef === 'FOUNDER-OWNER-PRO' || !subscription.currentPeriodEnd)));

  const periodEndText = subscription?.currentPeriodEnd?.toDate
    ? subscription.currentPeriodEnd.toDate().toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  return (
    <div className="space-y-5">
      {/* Header & Current Membership Summary */}
      <section className="rounded-2xl bg-[#0D0B16] border border-[#8B5CF6]/20 p-5 sm:p-6 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="w-9 h-9 rounded-xl bg-[#7C3AED]/20 border border-[#8B5CF6]/30 flex items-center justify-center text-[#C084FC]">
                <CreditCard size={18} />
              </div>
              <h1 className="font-display text-xl sm:text-2xl font-bold text-white">
                Nexora Membership
              </h1>
              <TierBadge tier={effectiveTier} showFree size="md" />
            </div>
            <p className="text-xs sm:text-sm text-[#94A3B8]">
              {effectiveTier === 'free'
                ? 'You are on Nexora Free. Upgrade anytime to unlock signature badges and Studio artistry.'
                : isOwnerComplimentary
                ? 'Active PRO · Founder & Owner Complimentary Pass (Full access, no expiry)'
                : subscription?.cancelAtPeriodEnd
                ? `Active (${subscription.billingCycle}) — ends on ${periodEndText || 'period end'}, then switches to Free.`
                : `Active ${effectiveTier.toUpperCase()} (${subscription?.billingCycle || 'monthly'})${
                    periodEndText ? ` · Renews ${periodEndText}` : ''
                  }`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onNavigate('studio')}
              className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#120F1E] border border-[#8B5CF6]/30 text-xs font-semibold text-white hover:border-[#A855F7]"
            >
              <Palette size={14} className="text-[#C084FC]" />
              Open Customisation Studio
            </button>
            {effectiveTier !== 'free' && !isOwnerComplimentary && !subscription?.cancelAtPeriodEnd && (
              <button
                type="button"
                onClick={() => setConfirmCancel((v) => !v)}
                className="min-h-[44px] px-3.5 py-2 rounded-xl bg-rose-500/10 border border-rose-500/25 text-xs font-semibold text-rose-200 hover:bg-rose-500/20"
              >
                Cancel Renewal
              </button>
            )}
          </div>
        </div>

        {confirmCancel && (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-xs text-rose-100">
              Your {effectiveTier.toUpperCase()} badge and unlocked Studio items remain active until{' '}
              {periodEndText || 'the end of this cycle'}. Your profile, posts, and followers are always preserved.
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setConfirmCancel(false)}
                className="min-h-[40px] px-3 rounded-lg bg-white/10 text-xs text-white"
              >
                Keep Plan
              </button>
              <button
                type="button"
                disabled={canceling}
                onClick={handleCancelSubscription}
                className="min-h-[40px] px-3.5 rounded-lg bg-rose-600 text-xs font-semibold text-white disabled:opacity-50"
              >
                {canceling ? 'Canceling...' : 'Confirm Cancellation'}
              </button>
            </div>
          </div>
        )}

        {billingStatus && !billingStatus.configured && (
          <div className="rounded-xl bg-amber-500/10 border border-amber-500/25 px-4 py-3 text-xs text-amber-200 flex items-start gap-2.5">
            <ShieldCheck size={16} className="shrink-0 mt-0.5 text-amber-300" />
            <span>
              Online checkout is currently in setup mode: Stripe server billing credentials have not been configured yet, so paid checkouts will wait until billing is connected.
            </span>
          </div>
        )}

        {errorMsg && <FriendlyErrorBanner message={errorMsg} onDismiss={() => setErrorMsg('')} />}
        {statusMsg && !errorMsg && (
          <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/25 px-4 py-2.5 text-xs text-emerald-200 flex items-center justify-between">
            <span>{statusMsg}</span>
            <button type="button" onClick={() => setStatusMsg('')} className="text-emerald-300 hover:text-white">
              Dismiss
            </button>
          </div>
        )}
      </section>

      {/* Billing Cadence Toggle */}
      <div className="flex items-center justify-center">
        <div className="inline-flex p-1 rounded-xl bg-[#0D0B16] border border-[#8B5CF6]/20">
          <button
            type="button"
            onClick={() => setBillingCycle('monthly')}
            className={`min-h-[40px] px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              billingCycle === 'monthly' ? 'bg-[#7C3AED] text-white' : 'text-[#94A3B8] hover:text-white'
            }`}
          >
            Monthly Billing
          </button>
          <button
            type="button"
            onClick={() => setBillingCycle('yearly')}
            className={`min-h-[40px] px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              billingCycle === 'yearly' ? 'bg-[#7C3AED] text-white' : 'text-[#94A3B8] hover:text-white'
            }`}
          >
            Yearly Billing
          </button>
        </div>
      </div>

      {/* Plans Comparison Grid */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {plans.map((plan) => {
          const isCurrent = plan.id === effectiveTier;
          const isLowerThanCurrent = canAccessTier(effectiveTier, plan.id) && !isCurrent;
          const priceCents =
            billingCycle === 'yearly' ? plan.yearlyPriceCents : plan.monthlyPriceCents;
          const stripePriceId =
            billingCycle === 'yearly' ? plan.stripeYearlyPriceId : plan.stripeMonthlyPriceId;
          const hasConfiguredPrice =
            plan.id === 'free' || Boolean(stripePriceId) || (priceCents !== null && priceCents > 0);
          const canCheckout =
            plan.id !== 'free' &&
            !isCurrent &&
            !isLowerThanCurrent &&
            plan.enabled &&
            hasConfiguredPrice &&
            Boolean(billingStatus?.configured);

          return (
            <div
              key={plan.id}
              className={`rounded-2xl p-5 sm:p-6 flex flex-col justify-between gap-5 border ${
                plan.id === 'pro'
                  ? 'bg-[#120E18] border-amber-400/35'
                  : plan.id === 'plus'
                  ? 'bg-[#120D22] border-[#A855F7]/40'
                  : 'bg-[#0D0B16] border-white/10'
              }`}
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {plan.id === 'pro' ? (
                      <Crown size={18} className="text-amber-300" />
                    ) : plan.id === 'plus' ? (
                      <Sparkles size={18} className="text-[#C084FC]" />
                    ) : (
                      <ShieldCheck size={18} className="text-[#94A3B8]" />
                    )}
                    <h2 className="font-display text-lg font-bold text-white">{plan.name}</h2>
                  </div>
                  <TierBadge tier={plan.id} showFree size="xs" />
                </div>

                <p className="text-xs text-[#94A3B8] leading-relaxed">{plan.tagline}</p>

                <div className="pt-1">
                  {plan.id === 'free' ? (
                    <p className="font-mono-tabular text-2xl font-bold text-white">$0</p>
                  ) : hasConfiguredPrice ? (
                    <div className="flex items-baseline gap-1.5">
                      <span className="font-mono-tabular text-2xl font-bold text-white">
                        {formatMoneyCents(priceCents, plan.currency)}
                      </span>
                      <span className="text-xs text-[#94A3B8]">
                        /{billingCycle === 'yearly' ? 'year' : 'month'}
                      </span>
                    </div>
                  ) : (
                    <p className="text-xs font-medium text-amber-300">
                      Pricing pending admin configuration
                    </p>
                  )}
                </div>

                <ul className="space-y-2.5 pt-2 border-t border-white/[0.08]">
                  {plan.benefits.map((benefit, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-[#CBD5E1]">
                      <Check size={14} className="text-[#C084FC] shrink-0 mt-0.5" />
                      <span>{benefit}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                {isCurrent ? (
                  <button
                    type="button"
                    disabled
                    className="w-full min-h-[44px] rounded-xl bg-white/10 text-xs font-semibold text-white cursor-default"
                  >
                    Current Plan
                  </button>
                ) : isLowerThanCurrent ? (
                  <button
                    type="button"
                    disabled
                    className="w-full min-h-[44px] rounded-xl bg-white/[0.05] text-xs font-medium text-[#94A3B8] cursor-default"
                  >
                    Included in {effectiveTier.toUpperCase()}
                  </button>
                ) : !plan.enabled ? (
                  <button
                    type="button"
                    disabled
                    className="w-full min-h-[44px] rounded-xl bg-white/[0.05] text-xs font-medium text-[#64748B]"
                  >
                    Plan Paused
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={!canCheckout || busyPlan !== null}
                    onClick={() => void handleSelectPlan(plan)}
                    className={`w-full min-h-[44px] rounded-xl text-xs font-semibold transition-all disabled:opacity-45 ${
                      plan.id === 'pro'
                        ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-black hover:brightness-110'
                        : 'bg-gradient-to-r from-[#6D28D9] to-[#9333EA] text-white hover:brightness-110'
                    }`}
                  >
                    {busyPlan === plan.id
                      ? 'Redirecting to checkout...'
                      : !hasConfiguredPrice
                      ? 'Awaiting Pricing Setup'
                      : !billingStatus?.configured
                      ? 'Checkout Setup Pending'
                      : effectiveTier === 'plus' && plan.id === 'pro'
                      ? 'Upgrade to Nexora Pro'
                      : `Upgrade to ${plan.name}`}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </section>

      {/* Billing & Receipt History */}
      <section className="rounded-2xl bg-[#0D0B16] border border-[#8B5CF6]/15 p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base font-semibold text-white flex items-center gap-2">
            <Receipt size={16} className="text-[#C084FC]" />
            Payment History & Receipts
          </h2>
          <span className="font-mono-tabular text-xs text-[#94A3B8]">
            {transactions.length} record{transactions.length === 1 ? '' : 's'}
          </span>
        </div>

        {transactions.length === 0 ? (
          <p className="text-xs text-[#64748B] py-6 text-center">
            No membership payments recorded yet. Verified subscription receipts will appear here.
          </p>
        ) : (
          <div className="divide-y divide-white/[0.06]">
            {transactions.map((tx) => (
              <div
                key={tx.id}
                className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white">
                      Nexora {tx.planId.toUpperCase()} ({tx.billingCycle})
                    </span>
                    <span
                      className={`text-[11px] font-semibold ${
                        tx.status === 'paid'
                          ? 'text-emerald-300'
                          : tx.status === 'refunded'
                          ? 'text-amber-300'
                          : 'text-rose-300'
                      }`}
                    >
                      {tx.status.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-xs text-[#94A3B8] font-mono-tabular">
                    Receipt {tx.receiptNumber} ·{' '}
                    {tx.createdAt?.toDate ? tx.createdAt.toDate().toLocaleDateString() : 'Recent'}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <span className="font-mono-tabular text-sm font-semibold text-white">
                    {formatMoneyCents(tx.amountCents, tx.currency)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedReceipt(tx)}
                    className="min-h-[38px] px-3 rounded-lg bg-[#120F1E] border border-white/10 text-xs text-[#CBD5E1] hover:text-white"
                  >
                    View Receipt
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Receipt Modal */}
      {selectedReceipt && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setSelectedReceipt(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-[#0E0C18] border border-[#8B5CF6]/30 p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-white">Nexora Payment Receipt</h3>
              <button type="button" onClick={() => setSelectedReceipt(null)}>
                <X size={18} className="text-[#94A3B8]" />
              </button>
            </div>
            <div className="space-y-2.5 text-xs border-y border-white/10 py-4">
              <div className="flex justify-between">
                <span className="text-[#94A3B8]">Receipt Number</span>
                <span className="font-mono-tabular text-white font-semibold">
                  {selectedReceipt.receiptNumber}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#94A3B8]">Account</span>
                <span className="text-white">@{profile.username}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#94A3B8]">Plan</span>
                <span className="text-white uppercase">
                  Nexora {selectedReceipt.planId} ({selectedReceipt.billingCycle})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#94A3B8]">Amount</span>
                <span className="font-mono-tabular text-white font-semibold">
                  {formatMoneyCents(selectedReceipt.amountCents, selectedReceipt.currency)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#94A3B8]">Status</span>
                <span className="uppercase text-emerald-300 font-semibold">
                  {selectedReceipt.status}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelectedReceipt(null)}
              className="w-full min-h-[42px] rounded-xl bg-[#7C3AED] text-xs font-semibold text-white"
            >
              Close Receipt
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
