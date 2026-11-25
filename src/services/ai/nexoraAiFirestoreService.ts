import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Unsubscribe,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { handleFirestoreError, logFirestoreListenerError, OperationType } from '../firebase/errorHandler';
import { recordAuditLog } from '../firebase/adminService';
import { dispatchDualNotification } from '../notifications/notificationDispatcher';
import { sendPushNotificationRequest } from './geminiClientService';
import {
  AIChannelConfig,
  AIConversation,
  AIMessage,
  AISettings,
  AIUsageRecord,
  AiChatModelId,
  AnnouncementAudience,
  AnnouncementCategory,
  AnnouncementRecord,
  DeliveryReport,
  DeviceTokenRecord,
  ReleaseHistoryItem,
  UserProfile,
} from '../../types/nexora';
import {
  ANNOUNCEMENT_CATEGORIES,
  DEFAULT_AI_SETTINGS,
  resolveEffectiveSubscriptionTier,
  sanitizeString,
} from '../../utils/validation';

// --- Personal AI Conversations & Privacy ---
export function subscribeMyAiConversations(
  uid: string,
  callback: (items: AIConversation[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'ai_conversations'),
    where('uid', '==', uid),
    limit(50)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<AIConversation, 'id'>) }))
        .sort((a, b) => (b.updatedAt?.toMillis?.() ?? 0) - (a.updatedAt?.toMillis?.() ?? 0));
      callback(items);
    },
    (err) => logFirestoreListenerError(err, OperationType.LIST, 'ai_conversations')
  );
}

export function subscribeAiConversationMessages(
  convId: string,
  uid: string,
  callback: (items: AIMessage[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'ai_messages'),
    where('convId', '==', convId),
    where('uid', '==', uid),
    limit(150)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<AIMessage, 'id'>) }))
        .sort((a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0));
      callback(items);
    },
    (err) => logFirestoreListenerError(err, OperationType.LIST, 'ai_messages')
  );
}

export async function createAiConversation(params: {
  uid: string;
  title: string;
  model: AiChatModelId;
  saveHistory?: boolean;
}): Promise<string> {
  try {
    const ref = await addDoc(collection(db, 'ai_conversations'), {
      uid: params.uid,
      title: sanitizeString(params.title || 'New Nexora AI Chat', 120),
      model: params.model,
      saveHistory: params.saveHistory !== false,
      lastMessagePreview: '',
      messageCount: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'ai_conversations');
  }
}

export async function appendAiConversationMessage(params: {
  convId: string;
  uid: string;
  role: 'user' | 'model';
  text: string;
  model?: AiChatModelId;
  promptTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  estimatedCostUsd?: number;
}): Promise<string> {
  const cleanText = sanitizeString(params.text, 16_000);
  try {
    const msgRef = await addDoc(collection(db, 'ai_messages'), {
      convId: params.convId,
      uid: params.uid,
      role: params.role,
      text: cleanText,
      ...(params.model ? { model: params.model } : {}),
      ...(typeof params.promptTokens === 'number' ? { promptTokens: Math.max(0, Math.round(params.promptTokens)) } : {}),
      ...(typeof params.outputTokens === 'number' ? { outputTokens: Math.max(0, Math.round(params.outputTokens)) } : {}),
      ...(typeof params.totalTokens === 'number' ? { totalTokens: Math.max(0, Math.round(params.totalTokens)) } : {}),
      ...(typeof params.estimatedCostUsd === 'number' ? { estimatedCostUsd: Math.max(0, params.estimatedCostUsd) } : {}),
      createdAt: serverTimestamp(),
    });

    const candidateTitle = sanitizeString(cleanText.split('\n')[0], 72);
    await updateDoc(doc(db, 'ai_conversations', params.convId), {
      lastMessagePreview: sanitizeString(cleanText, 240),
      messageCount: increment(1),
      ...(params.role === 'user' && candidateTitle ? { title: candidateTitle } : {}),
      updatedAt: serverTimestamp(),
    });
    return msgRef.id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'ai_messages');
  }
}

export async function deleteAiConversationAndMessages(convId: string, uid: string): Promise<void> {
  try {
    const msgSnap = await getDocs(
      query(collection(db, 'ai_messages'), where('convId', '==', convId), where('uid', '==', uid), limit(250))
    );
    const batch = writeBatch(db);
    msgSnap.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(doc(db, 'ai_conversations', convId));
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `ai_conversations/${convId}`);
  }
}

export async function clearAllMyAiHistory(uid: string): Promise<void> {
  try {
    const [convsSnap, msgsSnap] = await Promise.all([
      getDocs(query(collection(db, 'ai_conversations'), where('uid', '==', uid), limit(100))),
      getDocs(query(collection(db, 'ai_messages'), where('uid', '==', uid), limit(400))),
    ]);
    const batch = writeBatch(db);
    msgsSnap.docs.forEach((d) => batch.delete(d.ref));
    convsSnap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, 'ai_conversations');
  }
}

export async function setSaveAiHistoryPreference(uid: string, saveAiHistory: boolean): Promise<void> {
  try {
    const prefRef = doc(db, 'user_preferences', uid);
    const snap = await getDoc(prefRef);
    if (snap.exists()) {
      await updateDoc(prefRef, {
        saveAiHistory,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(prefRef, {
        uid,
        pinnedConvIds: [],
        mutedConvIds: [],
        recentSearches: [],
        saveAiHistory,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `user_preferences/${uid}`);
  }
}

// --- Global AI Settings, Telemetry & Channel Config ---
export function subscribeGlobalAiSettings(callback: (settings: AISettings) => void): Unsubscribe {
  return onSnapshot(
    doc(db, 'ai_settings', 'global'),
    (snap) => {
      if (!snap.exists()) {
        callback(DEFAULT_AI_SETTINGS);
        return;
      }
      const data = snap.data() as Partial<AISettings>;
      callback({
        ...DEFAULT_AI_SETTINGS,
        ...data,
        officialLinks: {
          ...DEFAULT_AI_SETTINGS.officialLinks,
          ...(data.officialLinks || {}),
        },
        prohibitedTopics: Array.isArray(data.prohibitedTopics)
          ? data.prohibitedTopics
          : DEFAULT_AI_SETTINGS.prohibitedTopics,
      });
    },
    (err) => logFirestoreListenerError(err, OperationType.GET, 'ai_settings/global')
  );
}

export async function saveGlobalAiSettings(params: {
  actor: UserProfile;
  actorRole: string;
  settings: Omit<AISettings, 'id' | 'updatedBy' | 'updatedAt'>;
}): Promise<void> {
  try {
    await setDoc(doc(db, 'ai_settings', 'global'), {
      enabled: params.settings.enabled,
      defaultModel: params.settings.defaultModel,
      personalityPrompt: sanitizeString(params.settings.personalityPrompt, 2000),
      welcomeEnabled: params.settings.welcomeEnabled,
      welcomePromptTemplate: sanitizeString(params.settings.welcomePromptTemplate, 1000),
      freeDailyLimit: Math.max(0, Math.min(5000, Math.round(params.settings.freeDailyLimit))),
      plusDailyLimit: Math.max(0, Math.min(10000, Math.round(params.settings.plusDailyLimit))),
      proDailyLimit: Math.max(0, Math.min(100000, Math.round(params.settings.proDailyLimit))),
      ownerUnlimited: params.settings.ownerUnlimited,
      rateLimitPerMinute: Math.max(1, Math.min(300, Math.round(params.settings.rateLimitPerMinute))),
      prohibitedTopics: params.settings.prohibitedTopics
        .map((t) => sanitizeString(t, 80))
        .filter(Boolean)
        .slice(0, 40),
      officialLinks: {
        webAppUrl: sanitizeString(params.settings.officialLinks.webAppUrl || '/', 200),
        androidApkUrl: sanitizeString(params.settings.officialLinks.androidApkUrl || '/downloads/nexora-latest.apk', 200),
        docsUrl: sanitizeString(params.settings.officialLinks.docsUrl || '/?view=landing', 200),
        supportUrl: sanitizeString(params.settings.officialLinks.supportUrl || '/#settings:support', 200),
      },
      updatedBy: params.actor.uid,
      updatedAt: serverTimestamp(),
    });

    await recordAuditLog({
      actor: params.actor,
      actorRole: params.actorRole,
      action: 'ai.settings.updated',
      category: 'ai',
      targetType: 'ai_settings',
      targetId: 'global',
      targetLabel: `AI ${params.settings.enabled ? 'Enabled' : 'Paused'} (${params.settings.defaultModel})`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, 'ai_settings/global');
  }
}

export function subscribeAllAiUsage(callback: (records: AIUsageRecord[]) => void): Unsubscribe {
  const q = query(
    collection(db, 'ai_usage'),
    where('tier', 'in', ['free', 'plus', 'pro']),
    limit(250)
  );
  return onSnapshot(
    q,
    (snap) =>
      callback(
        snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<AIUsageRecord, 'id'>) }))
          .sort((a, b) => b.dateKey.localeCompare(a.dateKey))
      ),
    (err) => logFirestoreListenerError(err, OperationType.LIST, 'ai_usage')
  );
}

export function subscribeChannelAiConfigs(callback: (configs: AIChannelConfig[]) => void): Unsubscribe {
  const q = query(
    collection(db, 'ai_channel_config'),
    where('targetType', 'in', ['space', 'group_chat']),
    limit(120)
  );
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ ...(d.data() as AIChannelConfig), channelId: d.id }))),
    (err) => logFirestoreListenerError(err, OperationType.LIST, 'ai_channel_config')
  );
}

export async function saveChannelAiConfig(params: {
  actor: UserProfile;
  actorRole: string;
  config: Omit<AIChannelConfig, 'updatedBy' | 'updatedAt'>;
}): Promise<void> {
  try {
    await setDoc(doc(db, 'ai_channel_config', params.config.channelId), {
      channelId: params.config.channelId,
      targetType: params.config.targetType,
      targetId: params.config.targetId,
      channelName: sanitizeString(params.config.channelName, 80),
      enabled: params.config.enabled,
      mode: params.config.mode,
      responseFrequency: params.config.responseFrequency,
      cooldownSeconds: Math.max(0, Math.min(3600, Math.round(params.config.cooldownSeconds))),
      prohibitedTopics: params.config.prohibitedTopics
        .map((t) => sanitizeString(t, 80))
        .filter(Boolean)
        .slice(0, 40),
      moderationEnabled: params.config.moderationEnabled,
      welcomeNewParticipants: params.config.welcomeNewParticipants,
      lastBotReplyMs: params.config.lastBotReplyMs || 0,
      updatedBy: params.actor.uid,
      updatedAt: serverTimestamp(),
    });

    await recordAuditLog({
      actor: params.actor,
      actorRole: params.actorRole,
      action: 'ai.channel.updated',
      category: 'ai',
      targetType: params.config.targetType,
      targetId: params.config.channelId,
      targetLabel: `${params.config.channelName} (${params.config.mode})`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `ai_channel_config/${params.config.channelId}`);
  }
}

export async function touchChannelLastBotReply(channelId: string): Promise<void> {
  try {
    const ref = doc(db, 'ai_channel_config', channelId);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, {
        lastBotReplyMs: Date.now(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch {
    // Non-blocking cooldown timestamp update
  }
}

// --- Announcements Studio & Owner Approval Gate ---
export function subscribeAnnouncementRecords(callback: (items: AnnouncementRecord[]) => void): Unsubscribe {
  const q = query(
    collection(db, 'announcements'),
    where('status', 'in', ['draft', 'approved', 'scheduled', 'published', 'failed']),
    limit(100)
  );
  return onSnapshot(
    q,
    (snap) =>
      callback(
        snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<AnnouncementRecord, 'id'>) }))
          .sort((a, b) => (b.updatedAt?.toMillis?.() ?? 0) - (a.updatedAt?.toMillis?.() ?? 0))
      ),
    (err) => logFirestoreListenerError(err, OperationType.LIST, 'announcements')
  );
}

export async function saveAnnouncementDraft(params: {
  id?: string;
  actor: UserProfile;
  actorRole: string;
  title: string;
  body: string;
  category: AnnouncementCategory;
  audience: AnnouncementAudience;
  scheduledFor?: string;
  aiGenerated: boolean;
}): Promise<string> {
  const payload = {
    title: sanitizeString(params.title, 120),
    body: sanitizeString(params.body, 2000),
    category: params.category,
    audience: params.audience,
    status: params.scheduledFor ? 'scheduled' : 'draft',
    ...(params.scheduledFor ? { scheduledFor: sanitizeString(params.scheduledFor, 40) } : {}),
    aiGenerated: params.aiGenerated,
    ownerApproved: false,
    createdBy: params.actor.uid,
    updatedAt: serverTimestamp(),
  };

  try {
    if (params.id) {
      await updateDoc(doc(db, 'announcements', params.id), payload);
      return params.id;
    }
    const ref = await addDoc(collection(db, 'announcements'), {
      ...payload,
      createdAt: serverTimestamp(),
    });
    await recordAuditLog({
      actor: params.actor,
      actorRole: params.actorRole,
      action: 'announcement.drafted',
      category: 'notification',
      targetType: 'announcement',
      targetId: ref.id,
      targetLabel: payload.title,
    });
    return ref.id;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'announcements');
  }
}

export async function sendTestAnnouncementToOwner(params: {
  actor: UserProfile;
  title: string;
  body: string;
  sourceId: string;
}): Promise<DeliveryReport> {
  const res = await dispatchDualNotification({
    recipientUid: params.actor.uid,
    recipientName: params.actor.displayName,
    actor: {
      uid: params.actor.uid,
      displayName: 'Nexora AI',
      avatarUrl: params.actor.avatarUrl || '',
    },
    type: 'announcement',
    category: 'admin',
    title: `[TEST] ${params.title}`,
    targetType: 'system',
    targetId: params.sourceId,
    inAppPreview: sanitizeString(params.body, 200),
    emailSubject: `[Nexora Test] ${params.title}`,
    emailBodyText: params.body,
    allowSelfInApp: true,
    dedupeKey: `test_ann_${params.sourceId}_${Date.now()}`,
  });

  const tokenSnap = await getDoc(doc(db, 'device_tokens', `${params.actor.uid}_web`)).catch(() => null);
  const myToken = tokenSnap?.exists() ? (tokenSnap.data() as DeviceTokenRecord).token : '';
  const pushOutcome = myToken
    ? await sendPushNotificationRequest({
        tokens: [myToken],
        title: `[TEST] ${params.title}`,
        body: params.body,
        purpose: 'test',
        targetUid: params.actor.uid,
      })
    : { configured: false, status: 'not_configured' as const, deliveredCount: 0, failedCount: 0, failureDetails: ['No browser push token registered for current admin.'] };

  const reportPayload = {
    sourceType: 'test' as const,
    sourceId: sanitizeString(params.sourceId, 128),
    channel: 'multi' as const,
    recipientCount: 1,
    deliveredCount: res.inAppCreated ? 1 : 0,
    failedCount: pushOutcome.failedCount,
    failureDetails: pushOutcome.failureDetails.slice(0, 10),
    status: (res.inAppCreated ? 'completed' : 'failed') as 'completed' | 'failed',
    createdBy: params.actor.uid,
    createdAt: serverTimestamp(),
  };
  const reportRef = await addDoc(collection(db, 'delivery_reports'), reportPayload);
  return { id: reportRef.id, ...reportPayload } as unknown as DeliveryReport;
}

export async function ownerApproveAndPublishAnnouncement(params: {
  actor: UserProfile;
  actorRole: string;
  isOwner: boolean;
  announcement: AnnouncementRecord;
}): Promise<DeliveryReport> {
  if (!params.isOwner) {
    throw new Error('Owner approval is required before any global announcement can be published.');
  }

  const [usersSnap, rolesSnap, tokensSnap, subsSnap] = await Promise.all([
    getDocs(query(collection(db, 'users'), where('onboardingCompleted', 'in', [true, false]), limit(400))),
    getDocs(
      query(
        collection(db, 'platform_roles'),
        where('role', 'in', ['owner', 'administrator', 'moderator', 'verification_reviewer', 'support']),
        limit(100)
      )
    ),
    getDocs(query(collection(db, 'device_tokens'), where('enabled', 'in', [true, false]), limit(400))),
    getDocs(query(collection(db, 'user_subscriptions'), where('tier', 'in', ['free', 'plus', 'pro']), limit(400))),
  ]);

  const staffUids = new Set(
    rolesSnap.docs.filter((d) => (d.data() as { active?: boolean }).active).map((d) => d.id)
  );
  const tierByUid = new Map<string, string>();
  subsSnap.docs.forEach((d) => {
    const data = d.data() as { tier?: 'free' | 'plus' | 'pro'; status?: 'active' | 'canceled' };
    tierByUid.set(d.id, resolveEffectiveSubscriptionTier(data));
  });

  const targetUsers = usersSnap.docs
    .map((d) => d.data() as UserProfile)
    .filter((u) => {
      if (!u.uid || u.suspended) return false;
      if (params.announcement.audience === 'all') return true;
      if (params.announcement.audience === 'staff') return staffUids.has(u.uid);
      const effectiveTier = tierByUid.get(u.uid) || u.subscriptionTier || 'free';
      return effectiveTier === params.announcement.audience;
    });

  const targetUidSet = new Set(targetUsers.map((u) => u.uid));
  const categoryMeta = ANNOUNCEMENT_CATEGORIES.find((c) => c.id === params.announcement.category);
  const severity = categoryMeta?.severity || 'info';

  // Live platform banner sync for global announcements
  await addDoc(collection(db, 'platform_announcements'), {
    title: sanitizeString(params.announcement.title, 100),
    message: sanitizeString(params.announcement.body, 500),
    severity,
    active: true,
    authorUid: params.actor.uid,
    authorName: sanitizeString(params.actor.displayName, 80),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  let inAppCount = 0;
  for (const recipient of targetUsers.slice(0, 200)) {
    const res = await dispatchDualNotification({
      recipientUid: recipient.uid,
      recipientName: recipient.displayName,
      actor: {
        uid: params.actor.uid,
        displayName: 'Nexora Official',
        avatarUrl: params.actor.avatarUrl || '',
      },
      type: 'announcement',
      category: 'admin',
      title: params.announcement.title,
      targetType: 'system',
      targetId: params.announcement.id,
      inAppPreview: sanitizeString(params.announcement.body, 200),
      emailSubject: params.announcement.title,
      emailBodyText: params.announcement.body,
      allowSelfInApp: true,
      dedupeKey: `ann_${params.announcement.id}_${recipient.uid}`,
      skipEmailLog: true,
    });
    if (res.inAppCreated) inAppCount += 1;
  }

  const pushTokens = tokensSnap.docs
    .map((d) => d.data() as DeviceTokenRecord)
    .filter((t) => t.enabled && t.pushConsent && targetUidSet.has(t.uid))
    .map((t) => t.token);

  const pushOutcome = await sendPushNotificationRequest({
    tokens: pushTokens,
    title: params.announcement.title,
    body: params.announcement.body,
    link: '/',
    purpose: 'announcement',
  });

  await updateDoc(doc(db, 'announcements', params.announcement.id), {
    status: 'published',
    ownerApproved: true,
    approvedBy: params.actor.uid,
    deliveryStats: {
      inAppCount,
      pushCount: pushOutcome.deliveredCount,
      failedCount: pushOutcome.failedCount,
    },
    publishedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const reportPayload = {
    sourceType: 'announcement' as const,
    sourceId: params.announcement.id,
    channel: 'multi' as const,
    recipientCount: targetUsers.length,
    deliveredCount: inAppCount,
    failedCount: pushOutcome.failedCount,
    failureDetails: pushOutcome.failureDetails.slice(0, 20),
    status: (pushOutcome.failedCount > 0 ? 'partial' : 'completed') as 'completed' | 'partial' | 'failed',
    createdBy: params.actor.uid,
    createdAt: serverTimestamp(),
  };
  const reportRef = await addDoc(collection(db, 'delivery_reports'), reportPayload);

  await recordAuditLog({
    actor: params.actor,
    actorRole: params.actorRole,
    action: 'announcement.owner_published',
    category: 'notification',
    targetType: 'announcement',
    targetId: params.announcement.id,
    targetLabel: `${params.announcement.title} (${inAppCount} in-app, ${pushOutcome.deliveredCount} push)`,
  });

  return { id: reportRef.id, ...reportPayload } as unknown as DeliveryReport;
}

// --- Release History & Version Update Automation ---
export function subscribeReleaseHistory(callback: (items: ReleaseHistoryItem[]) => void): Unsubscribe {
  const q = query(
    collection(db, 'release_history'),
    where('status', 'in', ['draft', 'published']),
    limit(50)
  );
  return onSnapshot(
    q,
    (snap) =>
      callback(
        snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<ReleaseHistoryItem, 'id'>) }))
          .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
      ),
    (err) => logFirestoreListenerError(err, OperationType.LIST, 'release_history')
  );
}

export async function saveReleaseHistoryItem(params: {
  actor: UserProfile;
  actorRole: string;
  version: string;
  notes: string;
  status: 'draft' | 'published';
  downloadLinks?: { web?: string; android?: string };
  aiSummaryTitle?: string;
  aiSummaryBody?: string;
}): Promise<string> {
  try {
    const ref = await addDoc(collection(db, 'release_history'), {
      version: sanitizeString(params.version, 40),
      notes: sanitizeString(params.notes, 3000),
      status: params.status,
      downloadLinks: params.downloadLinks || {},
      ...(params.aiSummaryTitle ? { aiSummaryTitle: sanitizeString(params.aiSummaryTitle, 120) } : {}),
      ...(params.aiSummaryBody ? { aiSummaryBody: sanitizeString(params.aiSummaryBody, 2000) } : {}),
      ownerApproved: false,
      createdBy: params.actor.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await recordAuditLog({
      actor: params.actor,
      actorRole: params.actorRole,
      action: 'release.saved',
      category: 'platform',
      targetType: 'release_history',
      targetId: ref.id,
      targetLabel: `v${params.version} (${params.status})`,
    });
    return ref.id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'release_history');
  }
}

export async function ownerApproveAndAnnounceRelease(params: {
  actor: UserProfile;
  actorRole: string;
  isOwner: boolean;
  release: ReleaseHistoryItem;
}): Promise<DeliveryReport> {
  if (!params.isOwner) {
    throw new Error('Only the Nexora Owner can approve and publish global version update announcements.');
  }
  if (params.release.status !== 'published') {
    throw new Error('Draft or unpublished releases cannot be announced globally. Switch release status to Published first.');
  }

  const title = params.release.aiSummaryTitle || `Nexora v${params.release.version} is now live`;
  const body =
    params.release.aiSummaryBody ||
    `${params.release.notes}${params.release.downloadLinks?.android ? `\n\nDownload Android Update: ${params.release.downloadLinks.android}` : ''}`;

  const announcementId = await saveAnnouncementDraft({
    actor: params.actor,
    actorRole: params.actorRole,
    title,
    body,
    category: 'product_release',
    audience: 'all',
    aiGenerated: Boolean(params.release.aiSummaryBody),
  });

  const report = await ownerApproveAndPublishAnnouncement({
    actor: params.actor,
    actorRole: params.actorRole,
    isOwner: true,
    announcement: {
      id: announcementId,
      title,
      body,
      category: 'product_release',
      audience: 'all',
      status: 'draft',
      aiGenerated: Boolean(params.release.aiSummaryBody),
      ownerApproved: false,
      createdBy: params.actor.uid,
    },
  });

  await updateDoc(doc(db, 'release_history', params.release.id), {
    ownerApproved: true,
    approvedBy: params.actor.uid,
    announcementId,
    notifiedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return report;
}

// --- Delivery Reports & Welcome Onboarding Audit ---
export function subscribeDeliveryReports(callback: (items: DeliveryReport[]) => void): Unsubscribe {
  const q = query(
    collection(db, 'delivery_reports'),
    where('sourceType', 'in', ['welcome', 'announcement', 'release', 'test']),
    limit(80)
  );
  return onSnapshot(
    q,
    (snap) =>
      callback(
        snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<DeliveryReport, 'id'>) }))
          .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
      ),
    (err) => logFirestoreListenerError(err, OperationType.LIST, 'delivery_reports')
  );
}

export async function recordWelcomeDeliveryReport(params: {
  uid: string;
  inAppSent: boolean;
  pushSent: number;
  pushFailed: number;
  notes: string[];
}): Promise<void> {
  try {
    await addDoc(collection(db, 'delivery_reports'), {
      sourceType: 'welcome',
      sourceId: params.uid,
      channel: 'multi',
      recipientCount: 1,
      deliveredCount: params.inAppSent ? 1 : 0,
      failedCount: params.pushFailed,
      failureDetails: params.notes.slice(0, 10),
      status: params.inAppSent ? 'completed' : 'failed',
      createdBy: params.uid,
      createdAt: serverTimestamp(),
    });
  } catch {
    // Non-blocking welcome report
  }
}
