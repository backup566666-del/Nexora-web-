import {
  collection,
  doc,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  Unsubscribe,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { auth, db } from './config';
import { handleFirestoreError, OperationType } from './errorHandler';
import { createNotification } from './socialService';
import {
  BillingCycle,
  PaymentTransaction,
  SubscriptionPlan,
  SubscriptionTier,
  UserProfile,
  UserSubscription,
} from '../../types/nexora';
import {
  DEFAULT_SUBSCRIPTION_PLANS,
  resolveEffectiveSubscriptionTier,
  sanitizeString,
} from '../../utils/validation';

export interface BillingServerStatus {
  configured: boolean;
  provider: 'stripe' | 'none';
  webhookConfigured: boolean;
  message: string;
}

export interface VerifiedCheckoutResult {
  verified: boolean;
  sessionId: string;
  tier: 'plus' | 'pro';
  billingCycle: BillingCycle;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  amountCents: number;
  currency: string;
  currentPeriodEndMs: number;
  receiptNumber: string;
  attestation: string;
}

export async function fetchBillingServerStatus(): Promise<BillingServerStatus> {
  try {
    const res = await fetch('/api/billing/status', { cache: 'no-store' });
    if (!res.ok) throw new Error('Billing status unavailable');
    return (await res.json()) as BillingServerStatus;
  } catch {
    return {
      configured: false,
      provider: 'none',
      webhookConfigured: false,
      message: 'Payment service is currently unavailable.',
    };
  }
}

export function subscribeSubscriptionPlans(
  callback: (plans: SubscriptionPlan[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'subscription_plans'),
    where('id', 'in', ['free', 'plus', 'pro']),
    limit(10)
  );
  return onSnapshot(
    q,
    (snap) => {
      const map = new Map<SubscriptionTier, SubscriptionPlan>();
      DEFAULT_SUBSCRIPTION_PLANS.forEach((p) => map.set(p.id, p));
      snap.docs.forEach((d) => {
        const data = d.data() as SubscriptionPlan;
        if (data.id === 'free' || data.id === 'plus' || data.id === 'pro') {
          map.set(data.id, data);
        }
      });
      callback(Array.from(map.values()).sort((a, b) => a.sortOrder - b.sortOrder));
    },
    () => callback(DEFAULT_SUBSCRIPTION_PLANS)
  );
}

export function subscribeMySubscription(
  uid: string,
  callback: (sub: UserSubscription | null) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, 'user_subscriptions', uid),
    (snap) => {
      callback(snap.exists() ? (snap.data() as UserSubscription) : null);
    },
    () => callback(null)
  );
}

export function subscribeMyTransactions(
  uid: string,
  callback: (items: PaymentTransaction[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'payment_transactions'),
    where('uid', '==', uid),
    limit(40)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<PaymentTransaction, 'id'>) }))
        .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
      callback(items);
    },
    () => callback([])
  );
}

export async function startSubscriptionCheckout(params: {
  plan: SubscriptionPlan;
  billingCycle: BillingCycle;
}): Promise<{ url: string; sessionId: string }> {
  if (params.plan.id === 'free') {
    throw new Error('Nexora Free does not require checkout.');
  }
  if (!params.plan.enabled) {
    throw new Error('This plan is currently unavailable.');
  }
  const unitAmountCents =
    params.billingCycle === 'yearly' ? params.plan.yearlyPriceCents : params.plan.monthlyPriceCents;
  const stripePriceId =
    params.billingCycle === 'yearly'
      ? params.plan.stripeYearlyPriceId
      : params.plan.stripeMonthlyPriceId;

  if (!stripePriceId && (unitAmountCents === null || unitAmountCents <= 0)) {
    throw new Error('Pricing for this tier has not been configured by administration yet.');
  }

  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Please sign in again before starting checkout.');
  }
  const idToken = await currentUser.getIdToken();

  const res = await fetch('/api/billing/create-checkout-session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      tier: params.plan.id,
      billingCycle: params.billingCycle,
      stripePriceId: stripePriceId || undefined,
      unitAmountCents: unitAmountCents ?? undefined,
      currency: params.plan.currency || 'usd',
      planName: params.plan.name,
      originUrl: window.location.origin,
    }),
  });

  const data = (await res.json().catch(() => ({}))) as {
    url?: string;
    sessionId?: string;
    error?: string;
  };
  if (!res.ok || !data.url || !data.sessionId) {
    throw new Error(data.error || 'Your payment checkout could not be started. Please try again.');
  }
  return { url: data.url, sessionId: data.sessionId };
}

export async function verifyAndActivateStripeSession(params: {
  user: UserProfile;
  sessionId: string;
}): Promise<VerifiedCheckoutResult> {
  const currentUser = auth.currentUser;
  if (!currentUser || currentUser.uid !== params.user.uid) {
    throw new Error('Please sign in again to verify your subscription.');
  }
  const idToken = await currentUser.getIdToken();

  const res = await fetch(
    `/api/billing/verify-session?session_id=${encodeURIComponent(params.sessionId)}`,
    {
      headers: { Authorization: `Bearer ${idToken}` },
    }
  );
  const data = (await res.json().catch(() => ({}))) as Partial<VerifiedCheckoutResult> & {
    error?: string;
  };
  if (!res.ok || !data.verified || !data.tier || !data.sessionId) {
    throw new Error(data.error || 'We could not confirm your payment yet.');
  }

  const periodEnd = Timestamp.fromMillis(
    data.currentPeriodEndMs || Date.now() + 30 * 86400_000
  );
  const now = serverTimestamp();
  const txId = `tx_${data.sessionId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64)}`;

  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'user_subscriptions', params.user.uid), {
      uid: params.user.uid,
      tier: data.tier,
      status: 'active',
      billingCycle: data.billingCycle || 'monthly',
      provider: 'stripe',
      stripeCustomerId: sanitizeString(data.stripeCustomerId || '', 128),
      stripeSubscriptionId: sanitizeString(data.stripeSubscriptionId || '', 128),
      lastSessionId: sanitizeString(data.sessionId, 128),
      verifiedByServer: true,
      cancelAtPeriodEnd: false,
      startedAt: now,
      currentPeriodEnd: periodEnd,
      updatedAt: now,
    });
    batch.set(doc(db, 'payment_transactions', txId), {
      uid: params.user.uid,
      userDisplayName: sanitizeString(params.user.displayName, 80),
      userUsername: sanitizeString(params.user.username, 30),
      planId: data.tier,
      billingCycle: data.billingCycle || 'monthly',
      amountCents: Math.max(0, Math.round(data.amountCents || 0)),
      currency: sanitizeString(data.currency || 'usd', 8),
      status: 'paid',
      provider: 'stripe',
      stripeSessionId: sanitizeString(data.sessionId, 128),
      receiptNumber: sanitizeString(data.receiptNumber || `NXR-${txId.slice(-6).toUpperCase()}`, 64),
      createdAt: now,
    });
    batch.update(doc(db, 'users', params.user.uid), {
      subscriptionTier: data.tier,
      updatedAt: now,
    });
    await batch.commit();

    await createNotification({
      recipientId: params.user.uid,
      actor: params.user,
      type: 'subscription_notice',
      targetType: 'subscription',
      targetId: params.user.uid,
      title: `Welcome to ${data.tier === 'pro' ? 'Nexora Pro' : 'Nexora Plus'}`,
      preview: `Your ${data.billingCycle} membership is active and your badge & studio unlocks are live.`,
      allowSelf: true,
      dedupeKey: `sub_active:${data.sessionId}`,
    });

    return data as VerifiedCheckoutResult;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `user_subscriptions/${params.user.uid}`);
  }
}

export async function cancelActiveSubscription(params: {
  user: UserProfile;
  subscription: UserSubscription;
}): Promise<void> {
  if (params.subscription.tier === 'free') return;

  if (params.subscription.stripeSubscriptionId && auth.currentUser) {
    const idToken = await auth.currentUser.getIdToken();
    const res = await fetch('/api/billing/cancel', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        stripeSubscriptionId: params.subscription.stripeSubscriptionId,
      }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error || 'Could not cancel subscription right now.');
    }
  }

  try {
    await updateDoc(doc(db, 'user_subscriptions', params.user.uid), {
      status: 'canceled',
      cancelAtPeriodEnd: true,
      updatedAt: serverTimestamp(),
    });
    await createNotification({
      recipientId: params.user.uid,
      actor: params.user,
      type: 'subscription_notice',
      targetType: 'subscription',
      targetId: params.user.uid,
      title: 'Membership Cancellation Scheduled',
      preview: 'Your current perks stay active until the end of your billing period, then move smoothly to Free.',
      allowSelf: true,
      dedupeKey: `sub_cancel:${params.user.uid}`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `user_subscriptions/${params.user.uid}`);
  }
}

export async function syncExpiredSubscriptionDowngrade(params: {
  profile: UserProfile;
  subscription: UserSubscription | null;
  isOwner?: boolean;
}): Promise<SubscriptionTier> {
  if (params.isOwner || params.subscription?.receiptRef === 'FOUNDER-OWNER-PRO') {
    return 'pro';
  }
  const effective = resolveEffectiveSubscriptionTier(params.subscription);
  if (
    params.subscription &&
    params.subscription.tier !== 'free' &&
    effective === 'free' &&
    params.subscription.status !== 'expired'
  ) {
    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'user_subscriptions', params.profile.uid), {
        uid: params.profile.uid,
        tier: 'free',
        status: 'expired',
        billingCycle: 'none',
        provider: 'free',
        verifiedByServer: false,
        cancelAtPeriodEnd: false,
        updatedAt: serverTimestamp(),
      });
      batch.update(doc(db, 'users', params.profile.uid), {
        subscriptionTier: 'free',
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
    } catch {
      // Non-fatal expiry sync retry on next load
    }
  } else if (
    params.profile.subscriptionTier &&
    params.profile.subscriptionTier !== effective &&
    effective === 'free'
  ) {
    try {
      await updateDoc(doc(db, 'users', params.profile.uid), {
        subscriptionTier: 'free',
        updatedAt: serverTimestamp(),
      });
    } catch {
      // Ignore transient failure
    }
  }
  return effective;
}

export function formatMoneyCents(cents: number | null | undefined, currency = 'usd'): string {
  if (cents === null || cents === undefined) return 'Pricing pending';
  if (cents === 0) return 'Free';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}
