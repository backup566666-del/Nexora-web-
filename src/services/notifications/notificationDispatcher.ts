import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import {
  NotificationCategory,
  NotificationTargetType,
  NotificationType,
  PrivacySettings,
  UserProfile,
} from '../../types/nexora';
import {
  LOCKED_NOTIFICATION_CATEGORIES,
  maskEmail,
  sanitizeString,
  withPrivacyDefaults,
} from '../../utils/validation';

export interface DualDispatchParams {
  recipientUid?: string;
  recipientName?: string;
  recipientEmail?: string;
  recipientPrivacy?: Partial<PrivacySettings> | null;
  actor: Pick<UserProfile, 'uid' | 'displayName' | 'avatarUrl'>;
  type: NotificationType;
  category?: NotificationCategory;
  title?: string;
  targetType?: NotificationTargetType;
  targetId?: string;
  inAppPreview: string;
  emailSubject: string;
  emailBodyText: string;
  ctaLabel?: string;
  ctaUrl?: string;
  allowSelfInApp?: boolean;
  dedupeKey?: string;
  skipEmailLog?: boolean;
}

export interface DualDispatchResult {
  inAppCreated: boolean;
  emailAttempted: boolean;
  emailDelivered: boolean;
  emailStatus: 'sent' | 'not_configured' | 'skipped' | 'failed';
  emailProvider: 'resend' | 'smtp' | 'none';
  message: string;
}

export interface ServerEmailStatus {
  configured: boolean;
  provider: 'resend' | 'smtp' | 'none';
  fromAddress: string;
  message: string;
}

// Lightweight client dedupe guard to prevent duplicate notifications on rapid retries
const recentDedupeKeys = new Map<string, number>();

export function shouldAllowDedupeKey(dedupeKey?: string, windowMs = 60_000): boolean {
  if (!dedupeKey) return true;
  const now = Date.now();
  const prev = recentDedupeKeys.get(dedupeKey);
  if (prev && now - prev < windowMs) {
    return false;
  }
  recentDedupeKeys.set(dedupeKey, now);
  if (recentDedupeKeys.size > 250) {
    for (const [k, ts] of recentDedupeKeys.entries()) {
      if (now - ts > windowMs) recentDedupeKeys.delete(k);
    }
  }
  return true;
}

export function inferCategoryFromNotificationType(type: NotificationType): NotificationCategory {
  switch (type) {
    case 'badge_awarded':
    case 'badge_revoked':
    case 'verification_decision':
    case 'identity_decision':
      return 'badges';
    case 'gift_received':
      return 'gifts';
    case 'security_alert':
      return 'security';
    case 'message':
      return 'messages';
    case 'space_invite':
    case 'space_announcement':
    case 'event_reminder':
      return 'spaces';
    case 'subscription_notice':
    case 'subscription_renewal':
      return 'subscriptions';
    case 'ai_welcome':
      return 'account';
    case 'referral_reward':
    case 'task_reward':
    case 'withdrawal_update':
    case 'wallet_adjustment':
      return 'rewards';
    case 'staff_role_change':
    case 'community_status':
    case 'admin_notice':
    case 'announcement':
    case 'support_ticket':
    case 'system_update':
      return 'admin';
    case 'like':
    case 'comment':
    case 'reply':
    case 'mention':
    case 'follow':
    case 'repost':
    case 'collab_invite':
    case 'collab_response':
    case 'post_tag':
    default:
      return 'social';
  }
}

export function inferTargetTypeFromNotificationType(type: NotificationType): NotificationTargetType {
  switch (type) {
    case 'like':
    case 'comment':
    case 'reply':
    case 'mention':
    case 'repost':
    case 'collab_invite':
    case 'collab_response':
    case 'post_tag':
      return 'post';
    case 'follow':
    case 'badge_awarded':
    case 'badge_revoked':
    case 'verification_decision':
    case 'identity_decision':
    case 'gift_received':
      return 'profile';
    case 'message':
      return 'chat';
    case 'space_invite':
    case 'space_announcement':
    case 'event_reminder':
    case 'community_status':
      return 'space';
    case 'subscription_notice':
    case 'subscription_renewal':
      return 'subscription';
    case 'security_alert':
    case 'staff_role_change':
    case 'support_ticket':
      return 'settings';
    case 'referral_reward':
      return 'invite';
    case 'task_reward':
      return 'tasks';
    case 'withdrawal_update':
    case 'wallet_adjustment':
      return 'wallet';
    case 'admin_notice':
    case 'announcement':
    case 'ai_welcome':
    case 'system_update':
    default:
      return 'system';
  }
}

export async function fetchServerEmailStatus(): Promise<ServerEmailStatus> {
  try {
    const res = await fetch('/api/email/status');
    if (!res.ok) throw new Error('Email status check failed.');
    return (await res.json()) as ServerEmailStatus;
  } catch {
    return {
      configured: false,
      provider: 'none',
      fromAddress: 'Nexora <noreply@nexora.social>',
      message: 'Email delivery service is currently unavailable.',
    };
  }
}

export async function dispatchDualNotification(
  params: DualDispatchParams
): Promise<DualDispatchResult> {
  if (!shouldAllowDedupeKey(params.dedupeKey)) {
    return {
      inAppCreated: false,
      emailAttempted: false,
      emailDelivered: false,
      emailStatus: 'skipped',
      emailProvider: 'none',
      message: 'Skipped duplicate notification within dedupe window.',
    };
  }

  const prefs = withPrivacyDefaults(params.recipientPrivacy);
  const category = params.category || inferCategoryFromNotificationType(params.type);
  const isLockedCategory = LOCKED_NOTIFICATION_CATEGORIES.includes(category);
  const inAppEnabled = isLockedCategory || prefs.inAppNotifications?.[category] !== false;
  const emailEnabled = isLockedCategory || prefs.emailNotifications?.[category] !== false;
  const targetType = params.targetType || inferTargetTypeFromNotificationType(params.type);

  let inAppCreated = false;
  if (
    params.recipientUid &&
    inAppEnabled &&
    (params.allowSelfInApp || params.recipientUid !== params.actor.uid)
  ) {
    try {
      await addDoc(collection(db, 'notifications'), {
        recipientId: params.recipientUid,
        actorId: params.actor.uid,
        actorName: sanitizeString(params.actor.displayName, 80),
        actorAvatar: sanitizeString(params.actor.avatarUrl || '', 200000),
        type: params.type,
        category,
        ...(params.title ? { title: sanitizeString(params.title, 120) } : {}),
        targetType,
        targetId: sanitizeString(params.targetId || '', 128),
        ...(params.dedupeKey ? { dedupeKey: sanitizeString(params.dedupeKey, 128) } : {}),
        preview: sanitizeString(params.inAppPreview, 200),
        read: false,
        createdAt: serverTimestamp(),
      });
      inAppCreated = true;
    } catch {
      // Never block primary action on notification failure
    }
  }

  const cleanEmail = (params.recipientEmail || '').trim();
  const hasRecipientEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail);

  let emailStatus: 'sent' | 'not_configured' | 'skipped' | 'failed' = 'skipped';
  let emailProvider: 'resend' | 'smtp' | 'none' = 'none';
  let emailDelivered = false;
  let emailMessage = 'Email skipped (recipient preference disabled or email unavailable client-side).';
  let emailError = '';

  if (emailEnabled && hasRecipientEmail) {
    try {
      const res = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: cleanEmail,
          subject: sanitizeString(params.emailSubject, 160),
          title: sanitizeString(params.emailSubject, 120),
          bodyText: sanitizeString(params.emailBodyText, 3500),
          category,
          ctaLabel: params.ctaLabel,
          ctaUrl: params.ctaUrl,
          recipientName: params.recipientName || 'Nexora Member',
        }),
      });
      const json = (await res.json()) as {
        delivered?: boolean;
        status?: 'sent' | 'not_configured' | 'failed';
        provider?: 'resend' | 'smtp' | 'none';
        message?: string;
        error?: string;
      };
      emailDelivered = Boolean(json.delivered);
      emailStatus = json.status || (res.ok ? 'not_configured' : 'failed');
      emailProvider = json.provider || 'none';
      emailMessage = json.message || 'Email request completed.';
      emailError = json.error || '';
    } catch (err) {
      emailStatus = 'failed';
      emailProvider = 'none';
      emailError = err instanceof Error ? err.message : 'Email endpoint unreachable.';
      emailMessage = emailError;
    }
  } else if (!emailEnabled) {
    emailMessage = 'Recipient opted out of email for this category.';
  } else {
    emailMessage = 'Direct email omitted (recipient email isolated in private account doc).';
  }

  // Persist privacy-masked log entry when an email attempt or security/admin event occurred
  if (!params.skipEmailLog && params.actor.uid && (hasRecipientEmail || category === 'admin' || category === 'badges' || category === 'security')) {
    try {
      await addDoc(collection(db, 'email_logs'), {
        recipientUid: params.recipientUid || '',
        recipientEmailMasked: hasRecipientEmail ? maskEmail(cleanEmail) : 'in-app-only',
        eventType: sanitizeString(params.type, 60),
        category,
        subject: sanitizeString(params.emailSubject, 160),
        provider: emailProvider,
        status: emailStatus,
        error: sanitizeString(emailError || (emailStatus === 'not_configured' ? 'Provider not configured' : ''), 240),
        actorUid: params.actor.uid,
        createdAt: serverTimestamp(),
      });
    } catch {
      // Non-blocking audit log
    }
  }

  return {
    inAppCreated,
    emailAttempted: emailEnabled && hasRecipientEmail,
    emailDelivered,
    emailStatus,
    emailProvider,
    message: emailMessage,
  };
}
