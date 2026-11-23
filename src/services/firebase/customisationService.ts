import {
  collection,
  deleteDoc,
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
import { recordAuditLog } from './adminService';
import { createNotification } from './socialService';
import {
  CustomisationItem,
  PaymentTransaction,
  ProfileCustomisation,
  SubscriptionPlan,
  SubscriptionTier,
  UserProfile,
  UserSubscription,
} from '../../types/nexora';
import {
  DEFAULT_CUSTOMISATION_CATALOG,
  DEFAULT_PROFILE_CUSTOMISATION,
  sanitizeProfileCustomisation,
  sanitizeString,
} from '../../utils/validation';

// --- Public Studio Catalog Subscription ---
export function subscribeCustomisationCatalog(
  callback: (items: CustomisationItem[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'customisation_catalog'),
    where('requiredTier', 'in', ['free', 'plus', 'pro']),
    limit(200)
  );
  return onSnapshot(
    q,
    (snap) => {
      const merged = new Map<string, CustomisationItem>();
      DEFAULT_CUSTOMISATION_CATALOG.forEach((item) => merged.set(item.id, item));
      snap.docs.forEach((d) => {
        const data = d.data() as Omit<CustomisationItem, 'id'>;
        merged.set(d.id, {
          id: d.id,
          category: data.category,
          name: data.name,
          description: data.description || '',
          requiredTier: data.requiredTier,
          enabled: data.enabled !== false,
          previewValue: data.previewValue,
          secondaryValue: data.secondaryValue,
          animated: Boolean(data.animated),
          imageUrl: data.imageUrl,
          sortOrder: typeof data.sortOrder === 'number' ? data.sortOrder : 99,
          updatedBy: data.updatedBy,
          updatedAt: data.updatedAt,
        });
      });
      callback(
        Array.from(merged.values()).sort((a, b) => a.sortOrder - b.sortOrder)
      );
    },
    () => callback(DEFAULT_CUSTOMISATION_CATALOG)
  );
}

// --- User Profile Customisation Persistence (Publicly Visible on users/{uid}) ---
export async function saveUserProfileCustomisation(params: {
  uid: string;
  customisation: Partial<ProfileCustomisation>;
  effectiveTier: SubscriptionTier;
}): Promise<ProfileCustomisation> {
  const clean = sanitizeProfileCustomisation(params.customisation, params.effectiveTier);
  try {
    await updateDoc(doc(db, 'users', params.uid), {
      profileCustomisation: clean,
      updatedAt: serverTimestamp(),
    });
    return clean;
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users/${params.uid}`);
  }
}

export async function resetUserProfileCustomisation(
  uid: string
): Promise<ProfileCustomisation> {
  const defaults = { ...DEFAULT_PROFILE_CUSTOMISATION };
  try {
    await updateDoc(doc(db, 'users', uid), {
      profileCustomisation: defaults,
      updatedAt: serverTimestamp(),
    });
    return defaults;
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users/${uid}`);
  }
}

// --- Admin Subscription & Billing Management ---
export async function saveSubscriptionPlanAdmin(params: {
  actor: UserProfile;
  actorRole: string;
  plan: SubscriptionPlan;
}): Promise<void> {
  const monthly =
    typeof params.plan.monthlyPriceCents === 'number' && Number.isFinite(params.plan.monthlyPriceCents)
      ? Math.max(0, Math.round(params.plan.monthlyPriceCents))
      : null;
  const yearly =
    typeof params.plan.yearlyPriceCents === 'number' && Number.isFinite(params.plan.yearlyPriceCents)
      ? Math.max(0, Math.round(params.plan.yearlyPriceCents))
      : null;
  const stripeMonthlyPriceId = sanitizeString(params.plan.stripeMonthlyPriceId || '', 128);
  const stripeYearlyPriceId = sanitizeString(params.plan.stripeYearlyPriceId || '', 128);
  const benefits = params.plan.benefits
    .map((b) => sanitizeString(b, 160))
    .filter(Boolean)
    .slice(0, 12);

  const pricingConfigured =
    params.plan.id === 'free'
      ? true
      : Boolean(
          (monthly !== null && monthly > 0) ||
            (yearly !== null && yearly > 0) ||
            stripeMonthlyPriceId ||
            stripeYearlyPriceId
        );

  const payload: Record<string, unknown> = {
    id: params.plan.id,
    name: sanitizeString(params.plan.name, 60) || `Nexora ${params.plan.id.toUpperCase()}`,
    tagline: sanitizeString(params.plan.tagline || '', 160),
    badgeLabel: sanitizeString(params.plan.badgeLabel || params.plan.id.toUpperCase(), 40),
    badgeColor: sanitizeString(params.plan.badgeColor || '#8B5CF6', 24),
    monthlyPriceCents: params.plan.id === 'free' ? 0 : monthly,
    yearlyPriceCents: params.plan.id === 'free' ? 0 : yearly,
    currency: sanitizeString((params.plan.currency || 'usd').toLowerCase(), 10) || 'usd',
    stripeMonthlyPriceId,
    stripeYearlyPriceId,
    enabled: Boolean(params.plan.enabled),
    pricingConfigured,
    benefits,
    sortOrder: Math.max(0, Math.round(params.plan.sortOrder)),
    updatedBy: params.actor.uid,
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'subscription_plans', params.plan.id), payload);
    await recordAuditLog({
      actor: params.actor,
      actorRole: params.actorRole,
      action: 'update_subscription_plan',
      category: 'billing',
      targetType: 'subscription_plan',
      targetId: params.plan.id,
      targetLabel: String(payload.name),
      details: `Enabled: ${payload.enabled}, Pricing configured: ${pricingConfigured}`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `subscription_plans/${params.plan.id}`);
  }
}

export async function saveCustomisationCatalogItemAdmin(params: {
  actor: UserProfile;
  actorRole: string;
  item: CustomisationItem;
}): Promise<void> {
  const cleanId = sanitizeString(params.item.id, 64).replace(/[^a-zA-Z0-9_-]/g, '_');
  if (!cleanId) {
    throw new Error('Item ID is required.');
  }
  const cleanName = sanitizeString(params.item.name, 60);
  if (!cleanName) {
    throw new Error('Item name cannot be empty.');
  }
  const cleanPreview = sanitizeString(params.item.previewValue, 600);
  if (!cleanPreview) {
    throw new Error('Preview value or style token is required.');
  }

  // Note: firestore.rules forbids 'id' inside customisation_catalog document data
  const payload: Record<string, unknown> = {
    category: params.item.category,
    name: cleanName,
    description: sanitizeString(params.item.description || '', 200),
    requiredTier: params.item.requiredTier,
    enabled: Boolean(params.item.enabled),
    previewValue: cleanPreview,
    animated: Boolean(params.item.animated),
    sortOrder: Math.max(0, Math.round(params.item.sortOrder || 1)),
    updatedBy: params.actor.uid,
    updatedAt: serverTimestamp(),
  };

  if (params.item.secondaryValue) {
    payload.secondaryValue = sanitizeString(params.item.secondaryValue, 200);
  }
  if (params.item.imageUrl) {
    payload.imageUrl = params.item.imageUrl.slice(0, 400000);
  }

  try {
    await setDoc(doc(db, 'customisation_catalog', cleanId), payload);
    await recordAuditLog({
      actor: params.actor,
      actorRole: params.actorRole,
      action: 'save_customisation_item',
      category: 'customisation',
      targetType: 'customisation_item',
      targetId: cleanId,
      targetLabel: cleanName,
      details: `Category: ${params.item.category}, Tier: ${params.item.requiredTier}, Enabled: ${params.item.enabled}`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `customisation_catalog/${cleanId}`);
  }
}

export async function deleteCustomisationCatalogItemAdmin(params: {
  actor: UserProfile;
  actorRole: string;
  item: CustomisationItem;
}): Promise<void> {
  try {
    await deleteDoc(doc(db, 'customisation_catalog', params.item.id));
    await recordAuditLog({
      actor: params.actor,
      actorRole: params.actorRole,
      action: 'delete_customisation_item',
      category: 'customisation',
      targetType: 'customisation_item',
      targetId: params.item.id,
      targetLabel: params.item.name,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `customisation_catalog/${params.item.id}`);
  }
}

export function subscribeAllUserSubscriptionsAdmin(
  callback: (items: UserSubscription[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'user_subscriptions'),
    where('tier', 'in', ['free', 'plus', 'pro']),
    limit(150)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs
        .map((d) => d.data() as UserSubscription)
        .sort((a, b) => (b.updatedAt?.toMillis?.() ?? 0) - (a.updatedAt?.toMillis?.() ?? 0));
      callback(items);
    },
    () => callback([])
  );
}

export function subscribeAllPaymentTransactionsAdmin(
  callback: (items: PaymentTransaction[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'payment_transactions'),
    where('status', 'in', ['paid', 'pending', 'failed', 'refunded', 'canceled']),
    limit(150)
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

export async function adminUpdateUserTier(params: {
  actor: UserProfile;
  actorRole: string;
  targetUser: UserProfile;
  tier: SubscriptionTier;
  durationDays?: number;
}): Promise<void> {
  const now = serverTimestamp();
  const isPaid = params.tier !== 'free';
  const days = Math.max(1, Math.min(3650, Math.round(params.durationDays || 30)));
  const periodEnd = Timestamp.fromMillis(Date.now() + days * 86_400_000);

  try {
    const batch = writeBatch(db);
    const subPayload: Record<string, unknown> = {
      uid: params.targetUser.uid,
      tier: params.tier,
      billingCycle: isPaid ? 'monthly' : 'none',
      status: isPaid ? 'active' : 'free',
      cancelAtPeriodEnd: false,
      provider: isPaid ? 'admin' : 'free',
      verifiedByServer: false,
      updatedAt: now,
    };
    if (isPaid) {
      subPayload.startedAt = now;
      subPayload.currentPeriodEnd = periodEnd;
    }
    batch.set(doc(db, 'user_subscriptions', params.targetUser.uid), subPayload);
    batch.update(doc(db, 'users', params.targetUser.uid), {
      subscriptionTier: params.tier,
      updatedAt: now,
    });
    await batch.commit();

    await recordAuditLog({
      actor: params.actor,
      actorRole: params.actorRole,
      action: 'admin_set_subscription_tier',
      category: 'billing',
      targetType: 'user',
      targetId: params.targetUser.uid,
      targetLabel: `@${params.targetUser.username}`,
      details: `Assigned tier ${params.tier}${isPaid ? ` for ${days} days` : ''}`,
    });

    await createNotification({
      recipientId: params.targetUser.uid,
      actor: params.actor,
      type: 'subscription_notice',
      targetType: 'subscription',
      targetId: params.targetUser.uid,
      title: `Nexora ${params.tier.toUpperCase()} Status Updated`,
      preview:
        params.tier === 'free'
          ? 'Your membership tier was updated to Nexora Free.'
          : `An administrator granted your account Nexora ${params.tier.toUpperCase()} perks.`,
      allowSelf: true,
      dedupeKey: `admin_tier:${params.targetUser.uid}:${params.tier}:${Math.floor(Date.now() / 10000)}`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `user_subscriptions/${params.targetUser.uid}`);
  }
}

export async function adminRefundTransaction(params: {
  actor: UserProfile;
  actorRole: string;
  tx: PaymentTransaction;
}): Promise<void> {
  if (!auth.currentUser) {
    throw new Error('Please sign in again before issuing a refund.');
  }
  const idToken = await auth.currentUser.getIdToken();
  const res = await fetch('/api/billing/refund', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      paymentIntentId: params.tx.stripePaymentIntentId,
      stripeSessionId: params.tx.stripeSessionId,
    }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    refunded?: boolean;
    refundId?: string;
    error?: string;
  };
  if (!res.ok || !body.refunded) {
    throw new Error(body.error || 'Refund could not be processed with Stripe.');
  }

  try {
    await updateDoc(doc(db, 'payment_transactions', params.tx.id), {
      status: 'refunded',
      updatedAt: serverTimestamp(),
    });
    await recordAuditLog({
      actor: params.actor,
      actorRole: params.actorRole,
      action: 'admin_refund_transaction',
      category: 'billing',
      targetType: 'payment_transaction',
      targetId: params.tx.id,
      targetLabel: params.tx.receiptNumber,
      details: `Refunded payment (${params.tx.amountCents} ${params.tx.currency})`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `payment_transactions/${params.tx.id}`);
  }
}
