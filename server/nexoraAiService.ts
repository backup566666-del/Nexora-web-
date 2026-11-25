import { GoogleGenAI } from '@google/genai';
import crypto from 'crypto';
import fs from 'fs';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const FOUNDER_OWNER_EMAIL = 'backup566666@gmail.com';

export const ALLOWED_GEMINI_CHAT_MODELS = [
  'gemini-4-hydrogen',
  'gemini-3.1-flash-lite',
  'gemini-4-neon',
  'gemini-4-carbon',
] as const;

export type GeminiChatModelId = (typeof ALLOWED_GEMINI_CHAT_MODELS)[number];
export type SubscriptionTier = 'free' | 'plus' | 'pro';

export interface OfficialLinksConfig {
  webAppUrl: string;
  androidApkUrl: string;
  docsUrl: string;
  supportUrl: string;
}

export interface GlobalAiSettingsRecord {
  enabled: boolean;
  defaultModel: GeminiChatModelId;
  personalityPrompt: string;
  welcomeEnabled: boolean;
  welcomePromptTemplate: string;
  freeDailyLimit: number;
  plusDailyLimit: number;
  proDailyLimit: number;
  ownerUnlimited: boolean;
  rateLimitPerMinute: number;
  prohibitedTopics: string[];
  officialLinks: OfficialLinksConfig;
}

export interface ChannelAiConfigRecord {
  channelId: string;
  targetType: 'space' | 'group_chat';
  targetId: string;
  channelName: string;
  enabled: boolean;
  mode: 'direct_only' | 'auto_and_direct';
  responseFrequency: 'low' | 'balanced' | 'high';
  cooldownSeconds: number;
  prohibitedTopics: string[];
  moderationEnabled: boolean;
  welcomeNewParticipants: boolean;
  lastBotReplyMs: number;
}

export interface AiUsageRecord {
  uid: string;
  dateKey: string;
  tier: SubscriptionTier;
  requestsCount: number;
  promptTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  lastRequestMs: number;
}

export interface QuotaCheckResult {
  allowed: boolean;
  statusCode: number;
  reason?: string;
  tier: SubscriptionTier;
  isOwner: boolean;
  dailyLimit: number;
  dailyUsed: number;
  remaining: number;
  rateLimitPerMinute: number;
}

export interface CommunityTriggerInput {
  targetType: 'space' | 'group_chat' | 'private_dm';
  channelId: string;
  channelName?: string;
  senderId: string;
  senderName: string;
  text: string;
  isAi?: boolean;
  isNewParticipant?: boolean;
  nowMs?: number;
  globalSettings: GlobalAiSettingsRecord;
  channelConfig?: ChannelAiConfigRecord | null;
}

export interface CommunityTriggerDecision {
  shouldRespond: boolean;
  modeUsed: 'mode_a_direct' | 'mode_b_auto' | 'blocked';
  reason: string;
  prohibitedTopic?: string;
}

export const DEFAULT_GLOBAL_AI_SETTINGS: GlobalAiSettingsRecord = {
  enabled: true,
  defaultModel: 'gemini-4-hydrogen',
  personalityPrompt:
    'You are Nexora AI, the official intelligent assistant of the Nexora social networking platform. You are friendly, intelligent, professional, welcoming, and community-focused. You understand Nexora features including Home Feed, Vibes short videos, Chat & Group Chats, Spaces communities, Subscriptions (Free, Plus, Pro), Settings, and Profile Customisation.',
  welcomeEnabled: true,
  welcomePromptTemplate:
    'Welcome a brand-new Nexora member warmly. Highlight how to explore Spaces, watch and post Vibes, connect in Chat, customize their Home feed, and ask Nexora AI anytime for help.',
  freeDailyLimit: 25,
  plusDailyLimit: 150,
  proDailyLimit: 1000,
  ownerUnlimited: true,
  rateLimitPerMinute: 15,
  prohibitedTopics: ['doxxing', 'self-harm instructions', 'malware exploit', 'credit card fraud'],
  officialLinks: {
    webAppUrl: '/',
    androidApkUrl: '/downloads/nexora-latest.apk',
    docsUrl: '/?view=landing',
    supportUrl: '/#settings:support',
  },
};

// In-memory rate-limit & daily usage safety ledger (complements Firestore ai_usage)
const minuteTimestampsByUid = new Map<string, number[]>();
const dailyMemoryLedger = new Map<string, AiUsageRecord>();
const channelLastReplyMemory = new Map<string, number>();

export function resetAiServiceMemoryForTests(): void {
  minuteTimestampsByUid.clear();
  dailyMemoryLedger.clear();
  channelLastReplyMemory.clear();
}

export function getTodayDateKey(nowMs = Date.now()): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

export function loadFirebaseDbConfig(): { projectId: string; databaseId: string } {
  const candidates = [
    path.resolve(process.cwd(), 'firebase-applet-config.json'),
    path.resolve(__dirname, '..', 'firebase-applet-config.json'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(candidate, 'utf8')) as {
          projectId?: string;
          firestoreDatabaseId?: string;
        };
        return {
          projectId: parsed.projectId || process.env.FIREBASE_PROJECT_ID || 'gen-lang-client-0024648348',
          databaseId: parsed.firestoreDatabaseId || '(default)',
        };
      } catch {
        // Fallback below
      }
    }
  }
  return {
    projectId: process.env.FIREBASE_PROJECT_ID || 'gen-lang-client-0024648348',
    databaseId: process.env.FIREBASE_DATABASE_ID || 'ai-studio-bf321206-bfed-4f87-947f-b3aa40868ffd',
  };
}

export function getDailyLimitForTier(
  tier: SubscriptionTier,
  settings: GlobalAiSettingsRecord,
  isOwner: boolean
): number {
  if (isOwner && settings.ownerUnlimited) {
    return 1_000_000;
  }
  if (tier === 'pro') return Math.max(1, settings.proDailyLimit);
  if (tier === 'plus') return Math.max(1, settings.plusDailyLimit);
  return Math.max(1, settings.freeDailyLimit);
}

export function estimateGeminiCostUsd(
  model: string,
  promptTokens: number,
  outputTokens: number
): number {
  // Approximate per-1M token pricing bands for telemetry visibility
  let inRate = 0.1;
  let outRate = 0.4;
  if (model === 'gemini-3.1-flash-lite') {
    inRate = 0.075;
    outRate = 0.3;
  } else if (model === 'gemini-4-neon') {
    inRate = 0.35;
    outRate = 1.4;
  } else if (model === 'gemini-4-carbon') {
    inRate = 1.25;
    outRate = 5.0;
  }
  const usd = (promptTokens / 1_000_000) * inRate + (outputTokens / 1_000_000) * outRate;
  return Number(usd.toFixed(6));
}

export function extractTokenUsage(
  response: unknown,
  model: string
): { promptTokens: number; outputTokens: number; totalTokens: number; estimatedCostUsd: number } {
  const usage = (response as {
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      totalTokenCount?: number;
    };
  })?.usageMetadata;

  const promptTokens = Math.max(0, Number(usage?.promptTokenCount || 0));
  const outputTokens = Math.max(0, Number(usage?.candidatesTokenCount || 0));
  const totalTokens = Math.max(promptTokens + outputTokens, Number(usage?.totalTokenCount || 0));
  return {
    promptTokens,
    outputTokens,
    totalTokens,
    estimatedCostUsd: estimateGeminiCostUsd(model, promptTokens, outputTokens),
  };
}

export function findProhibitedTopicMatch(text: string, topics: string[]): string | null {
  const normalized = (text || '').toLowerCase();
  if (!normalized.trim()) return null;
  for (const topic of topics) {
    const clean = (topic || '').trim().toLowerCase();
    if (clean.length >= 2 && normalized.includes(clean)) {
      return topic.trim();
    }
  }
  return null;
}

export function isAiAuthoredMessage(msg: {
  isAi?: boolean;
  senderId?: string;
  senderName?: string;
  authorId?: string;
  authorName?: string;
}): boolean {
  if (msg.isAi === true) return true;
  if (msg.senderId === 'nexora_ai' || msg.authorId === 'nexora_ai') return true;
  const name = (msg.senderName || msg.authorName || '').trim().toLowerCase();
  return name === 'nexora ai' || name === 'nexora-ai';
}

export function isDirectNexoraMention(text: string): boolean {
  const clean = (text || '').trim();
  if (!clean) return false;
  return /(?:^|\s)(?:@nexora(?:_ai|ai)?|\/nexora)\b|\bnexora\s+ai\b|\b(?:hey|hi|ask|hello)\s+nexora\b/i.test(
    clean
  );
}

export function evaluateCommunityAiDecision(
  input: CommunityTriggerInput
): CommunityTriggerDecision {
  if (input.targetType === 'private_dm') {
    return {
      shouldRespond: false,
      modeUsed: 'blocked',
      reason: 'Privacy boundary: automatic community AI never monitors private 1-on-1 DMs.',
    };
  }

  if (
    isAiAuthoredMessage({
      isAi: input.isAi,
      senderId: input.senderId,
      senderName: input.senderName,
    })
  ) {
    return {
      shouldRespond: false,
      modeUsed: 'blocked',
      reason: 'Loop prevention: Nexora AI ignores its own or bot-authored messages.',
    };
  }

  if (!input.globalSettings.enabled) {
    return {
      shouldRespond: false,
      modeUsed: 'blocked',
      reason: 'Global Nexora AI is currently paused by platform administration.',
    };
  }

  const combinedProhibited = [
    ...(input.globalSettings.prohibitedTopics || []),
    ...(input.channelConfig?.prohibitedTopics || []),
  ];
  const topicMatch = findProhibitedTopicMatch(input.text, combinedProhibited);
  if (topicMatch) {
    return {
      shouldRespond: false,
      modeUsed: 'blocked',
      reason: `Topic blocked by moderation rule (${topicMatch}).`,
      prohibitedTopic: topicMatch,
    };
  }

  const directMention = isDirectNexoraMention(input.text);
  const cfg = input.channelConfig;

  // If channel explicitly disabled AI participation
  if (cfg && cfg.enabled === false) {
    return {
      shouldRespond: false,
      modeUsed: 'blocked',
      reason: 'Nexora AI is disabled for this channel.',
    };
  }

  const nowMs = input.nowMs ?? Date.now();
  const cooldownMs = Math.max(0, (cfg?.cooldownSeconds ?? 12) * 1000);
  const lastReplyMs = Math.max(
    cfg?.lastBotReplyMs || 0,
    channelLastReplyMemory.get(input.channelId) || 0
  );

  // Mode A: Direct mention or direct invitation
  if (directMention) {
    if (nowMs - lastReplyMs < Math.min(cooldownMs, 4000)) {
      return {
        shouldRespond: false,
        modeUsed: 'blocked',
        reason: 'Channel AI burst cooldown active; retry in a few seconds.',
      };
    }
    return {
      shouldRespond: true,
      modeUsed: 'mode_a_direct',
      reason: 'Direct mention of Nexora AI detected (Mode A).',
    };
  }

  // Mode B: Automatic Community Participation (must be explicitly enabled on channel)
  if (!cfg || !cfg.enabled || cfg.mode !== 'auto_and_direct') {
    return {
      shouldRespond: false,
      modeUsed: 'blocked',
      reason: 'Automatic participation is off; mention @Nexora for direct assistance.',
    };
  }

  if (nowMs - lastReplyMs < cooldownMs) {
    return {
      shouldRespond: false,
      modeUsed: 'blocked',
      reason: `Mode B cooldown active (${cfg.cooldownSeconds}s).`,
    };
  }

  const trimmed = input.text.trim();
  if (trimmed.length < 8) {
    return {
      shouldRespond: false,
      modeUsed: 'blocked',
      reason: 'Message too brief for automatic interruption.',
    };
  }

  if (input.isNewParticipant && cfg.welcomeNewParticipants) {
    return {
      shouldRespond: true,
      modeUsed: 'mode_b_auto',
      reason: 'Welcoming new participant in auto-enabled channel (Mode B).',
    };
  }

  const looksLikeQuestion =
    trimmed.includes('?') ||
    /^(how|what|why|when|where|can|anyone|help|is there|does nexora)/i.test(trimmed);

  if (cfg.responseFrequency === 'low') {
    return looksLikeQuestion
      ? { shouldRespond: true, modeUsed: 'mode_b_auto', reason: 'Community question detected (Mode B low).' }
      : { shouldRespond: false, modeUsed: 'blocked', reason: 'Low frequency skips non-question messages.' };
  }

  if (cfg.responseFrequency === 'balanced') {
    const helpfulTopic = /\b(nexora|space|vibes|help|guide|recommend|ideas|tips)\b/i.test(trimmed);
    return looksLikeQuestion || helpfulTopic
      ? { shouldRespond: true, modeUsed: 'mode_b_auto', reason: 'Helpful community discussion detected (Mode B balanced).' }
      : { shouldRespond: false, modeUsed: 'blocked', reason: 'Balanced frequency avoids interrupting casual banter.' };
  }

  // 'high' frequency
  return {
    shouldRespond: true,
    modeUsed: 'mode_b_auto',
    reason: 'Active channel participation (Mode B high).',
  };
}

export function markChannelBotReplied(channelId: string, nowMs = Date.now()): void {
  channelLastReplyMemory.set(channelId, nowMs);
}

// --- Firestore REST API Helpers (uses caller's verified Firebase ID Token so rules enforce authorization) ---
function decodeFirestoreValue(val: Record<string, unknown> | undefined): unknown {
  if (!val) return undefined;
  if ('stringValue' in val) return val.stringValue;
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue' in val) return Number(val.doubleValue);
  if ('booleanValue' in val) return Boolean(val.booleanValue);
  if ('timestampValue' in val) return val.timestampValue;
  if ('nullValue' in val) return null;
  if ('arrayValue' in val) {
    const arr = (val.arrayValue as { values?: Record<string, unknown>[] })?.values || [];
    return arr.map((item) => decodeFirestoreValue(item));
  }
  if ('mapValue' in val) {
    const fields = (val.mapValue as { fields?: Record<string, Record<string, unknown>> })?.fields || {};
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) {
      out[k] = decodeFirestoreValue(v);
    }
    return out;
  }
  return undefined;
}

function encodeFirestoreValue(val: unknown): Record<string, unknown> {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') {
    if (Number.isInteger(val)) return { integerValue: String(val) };
    return { doubleValue: val };
  }
  if (typeof val === 'string') return { stringValue: val };
  if (val instanceof Date) return { timestampValue: val.toISOString() };
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map((item) => encodeFirestoreValue(item)) } };
  }
  if (typeof val === 'object') {
    const fields: Record<string, Record<string, unknown>> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (v !== undefined) {
        fields[k] = encodeFirestoreValue(v);
      }
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

async function firestoreRestGetDoc(
  docPath: string,
  idToken?: string
): Promise<Record<string, unknown> | null> {
  if (!idToken) return null;
  const { projectId, databaseId } = loadFirebaseDbConfig();
  const cleanPath = docPath.replace(/^\/+/, '');
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    projectId
  )}/databases/${encodeURIComponent(databaseId)}/documents/${cleanPath}`;

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${idToken}`,
        Accept: 'application/json',
      },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { fields?: Record<string, Record<string, unknown>> };
    if (!json.fields) return null;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(json.fields)) {
      out[k] = decodeFirestoreValue(v);
    }
    return out;
  } catch {
    return null;
  }
}

async function firestoreRestCommitAiUsage(
  usage: AiUsageRecord,
  idToken?: string
): Promise<void> {
  if (!idToken) return;
  const { projectId, databaseId } = loadFirebaseDbConfig();
  const usageId = `${usage.uid}_${usage.dateKey}`;
  const docName = `projects/${projectId}/databases/${databaseId}/documents/ai_usage/${usageId}`;
  const commitUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    projectId
  )}/databases/${encodeURIComponent(databaseId)}/documents:commit`;

  try {
    await fetch(commitUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        writes: [
          {
            update: {
              name: docName,
              fields: {
                uid: encodeFirestoreValue(usage.uid),
                dateKey: encodeFirestoreValue(usage.dateKey),
                tier: encodeFirestoreValue(usage.tier),
                requestsCount: encodeFirestoreValue(usage.requestsCount),
                promptTokens: encodeFirestoreValue(usage.promptTokens),
                outputTokens: encodeFirestoreValue(usage.outputTokens),
                totalTokens: encodeFirestoreValue(usage.totalTokens),
                estimatedCostUsd: encodeFirestoreValue(usage.estimatedCostUsd),
                lastRequestMs: encodeFirestoreValue(usage.lastRequestMs),
              },
            },
            updateTransforms: [
              {
                fieldPath: 'updatedAt',
                setToServerValue: 'REQUEST_TIME',
              },
            ],
          },
        ],
      }),
    });
  } catch {
    // Non-blocking telemetry persistence
  }
}

export async function loadGlobalAiSettings(idToken?: string): Promise<GlobalAiSettingsRecord> {
  const raw = await firestoreRestGetDoc('ai_settings/global', idToken);
  if (!raw) return { ...DEFAULT_GLOBAL_AI_SETTINGS };
  return {
    enabled: raw.enabled !== false,
    defaultModel:
      typeof raw.defaultModel === 'string' &&
      (ALLOWED_GEMINI_CHAT_MODELS as readonly string[]).includes(raw.defaultModel)
        ? (raw.defaultModel as GeminiChatModelId)
        : DEFAULT_GLOBAL_AI_SETTINGS.defaultModel,
    personalityPrompt:
      typeof raw.personalityPrompt === 'string' && raw.personalityPrompt.trim()
        ? raw.personalityPrompt
        : DEFAULT_GLOBAL_AI_SETTINGS.personalityPrompt,
    welcomeEnabled: raw.welcomeEnabled !== false,
    welcomePromptTemplate:
      typeof raw.welcomePromptTemplate === 'string' && raw.welcomePromptTemplate.trim()
        ? raw.welcomePromptTemplate
        : DEFAULT_GLOBAL_AI_SETTINGS.welcomePromptTemplate,
    freeDailyLimit:
      typeof raw.freeDailyLimit === 'number'
        ? raw.freeDailyLimit
        : DEFAULT_GLOBAL_AI_SETTINGS.freeDailyLimit,
    plusDailyLimit:
      typeof raw.plusDailyLimit === 'number'
        ? raw.plusDailyLimit
        : DEFAULT_GLOBAL_AI_SETTINGS.plusDailyLimit,
    proDailyLimit:
      typeof raw.proDailyLimit === 'number'
        ? raw.proDailyLimit
        : DEFAULT_GLOBAL_AI_SETTINGS.proDailyLimit,
    ownerUnlimited: raw.ownerUnlimited !== false,
    rateLimitPerMinute:
      typeof raw.rateLimitPerMinute === 'number' && raw.rateLimitPerMinute >= 1
        ? raw.rateLimitPerMinute
        : DEFAULT_GLOBAL_AI_SETTINGS.rateLimitPerMinute,
    prohibitedTopics: Array.isArray(raw.prohibitedTopics)
      ? raw.prohibitedTopics.filter((x): x is string => typeof x === 'string')
      : DEFAULT_GLOBAL_AI_SETTINGS.prohibitedTopics,
    officialLinks: {
      webAppUrl:
        typeof (raw.officialLinks as Partial<OfficialLinksConfig>)?.webAppUrl === 'string'
          ? ((raw.officialLinks as Partial<OfficialLinksConfig>).webAppUrl as string)
          : DEFAULT_GLOBAL_AI_SETTINGS.officialLinks.webAppUrl,
      androidApkUrl:
        typeof (raw.officialLinks as Partial<OfficialLinksConfig>)?.androidApkUrl === 'string'
          ? ((raw.officialLinks as Partial<OfficialLinksConfig>).androidApkUrl as string)
          : DEFAULT_GLOBAL_AI_SETTINGS.officialLinks.androidApkUrl,
      docsUrl:
        typeof (raw.officialLinks as Partial<OfficialLinksConfig>)?.docsUrl === 'string'
          ? ((raw.officialLinks as Partial<OfficialLinksConfig>).docsUrl as string)
          : DEFAULT_GLOBAL_AI_SETTINGS.officialLinks.docsUrl,
      supportUrl:
        typeof (raw.officialLinks as Partial<OfficialLinksConfig>)?.supportUrl === 'string'
          ? ((raw.officialLinks as Partial<OfficialLinksConfig>).supportUrl as string)
          : DEFAULT_GLOBAL_AI_SETTINGS.officialLinks.supportUrl,
    },
  };
}

export async function loadChannelAiConfig(
  channelId: string,
  idToken?: string
): Promise<ChannelAiConfigRecord | null> {
  const raw = await firestoreRestGetDoc(`ai_channel_config/${channelId}`, idToken);
  if (!raw) return null;
  return {
    channelId: String(raw.channelId || channelId),
    targetType: raw.targetType === 'group_chat' ? 'group_chat' : 'space',
    targetId: String(raw.targetId || channelId),
    channelName: String(raw.channelName || 'Channel'),
    enabled: raw.enabled === true,
    mode: raw.mode === 'auto_and_direct' ? 'auto_and_direct' : 'direct_only',
    responseFrequency:
      raw.responseFrequency === 'high' || raw.responseFrequency === 'low'
        ? raw.responseFrequency
        : 'balanced',
    cooldownSeconds: typeof raw.cooldownSeconds === 'number' ? raw.cooldownSeconds : 15,
    prohibitedTopics: Array.isArray(raw.prohibitedTopics)
      ? raw.prohibitedTopics.filter((x): x is string => typeof x === 'string')
      : [],
    moderationEnabled: raw.moderationEnabled !== false,
    welcomeNewParticipants: raw.welcomeNewParticipants === true,
    lastBotReplyMs: typeof raw.lastBotReplyMs === 'number' ? raw.lastBotReplyMs : 0,
  };
}

export async function resolveCallerTierAndRole(params: {
  uid: string;
  email?: string;
  emailVerified?: boolean;
  idToken?: string;
}): Promise<{ tier: SubscriptionTier; isOwner: boolean; isStaff: boolean; permissions: string[] }> {
  const isFounder =
    params.emailVerified === true &&
    (params.email || '').trim().toLowerCase() === FOUNDER_OWNER_EMAIL.toLowerCase();

  const [roleDoc, subDoc] = await Promise.all([
    firestoreRestGetDoc(`platform_roles/${params.uid}`, params.idToken),
    firestoreRestGetDoc(`user_subscriptions/${params.uid}`, params.idToken),
  ]);

  const roleStr = typeof roleDoc?.role === 'string' ? roleDoc.role : '';
  const activeRole = roleDoc?.active === true;
  const permissions = Array.isArray(roleDoc?.permissions)
    ? roleDoc.permissions.filter((p): p is string => typeof p === 'string')
    : [];
  const isOwner = isFounder || (activeRole && roleStr === 'owner');
  const isStaff = isOwner || activeRole;

  let tier: SubscriptionTier = isOwner ? 'pro' : 'free';
  if (!isOwner && subDoc && typeof subDoc.tier === 'string') {
    const rawTier = subDoc.tier as SubscriptionTier;
    const status = String(subDoc.status || 'free');
    const periodEndIso =
      typeof subDoc.currentPeriodEnd === 'string' ? subDoc.currentPeriodEnd : undefined;
    const periodEndMs = periodEndIso ? Date.parse(periodEndIso) : undefined;
    const unexpired = periodEndMs === undefined || Number.isNaN(periodEndMs) || periodEndMs > Date.now();
    if ((rawTier === 'plus' || rawTier === 'pro') && (status === 'active' || status === 'canceled') && unexpired) {
      tier = rawTier;
    }
  }

  return { tier, isOwner, isStaff, permissions };
}

export async function getQuotaSnapshot(params: {
  uid: string;
  tier: SubscriptionTier;
  isOwner: boolean;
  settings: GlobalAiSettingsRecord;
  idToken?: string;
  nowMs?: number;
}): Promise<QuotaCheckResult> {
  const nowMs = params.nowMs ?? Date.now();
  const dateKey = getTodayDateKey(nowMs);
  const ledgerKey = `${params.uid}_${dateKey}`;
  const remoteUsage = await firestoreRestGetDoc(`ai_usage/${ledgerKey}`, params.idToken);
  const memUsage = dailyMemoryLedger.get(ledgerKey);
  const currentUsed = Math.max(
    Number(remoteUsage?.requestsCount || 0),
    Number(memUsage?.requestsCount || 0)
  );
  const dailyLimit = getDailyLimitForTier(params.tier, params.settings, params.isOwner);
  const perMinuteCap =
    params.isOwner && params.settings.ownerUnlimited ? 120 : params.settings.rateLimitPerMinute;
  const enabledForCaller = params.settings.enabled || params.isOwner;
  return {
    allowed: enabledForCaller && currentUsed < dailyLimit,
    statusCode: enabledForCaller ? (currentUsed < dailyLimit ? 200 : 429) : 503,
    tier: params.tier,
    isOwner: params.isOwner,
    dailyLimit: enabledForCaller ? dailyLimit : 0,
    dailyUsed: currentUsed,
    remaining: enabledForCaller ? Math.max(0, dailyLimit - currentUsed) : 0,
    rateLimitPerMinute: perMinuteCap,
  };
}

export async function enforceAndTrackAiQuota(params: {
  uid: string;
  tier: SubscriptionTier;
  isOwner: boolean;
  settings: GlobalAiSettingsRecord;
  idToken?: string;
  nowMs?: number;
}): Promise<QuotaCheckResult> {
  const nowMs = params.nowMs ?? Date.now();
  if (!params.settings.enabled && !params.isOwner) {
    return {
      allowed: false,
      statusCode: 503,
      reason: 'Nexora AI is temporarily paused by platform administration.',
      tier: params.tier,
      isOwner: params.isOwner,
      dailyLimit: 0,
      dailyUsed: 0,
      remaining: 0,
      rateLimitPerMinute: params.settings.rateLimitPerMinute,
    };
  }

  // Sliding-window 60s burst rate limit
  const prevWindow = (minuteTimestampsByUid.get(params.uid) || []).filter((ts) => nowMs - ts < 60_000);
  const perMinuteCap = params.isOwner && params.settings.ownerUnlimited ? 120 : params.settings.rateLimitPerMinute;
  if (prevWindow.length >= perMinuteCap) {
    return {
      allowed: false,
      statusCode: 429,
      reason: `Rate limit reached (${perMinuteCap} requests per minute). Please wait a moment before sending another prompt.`,
      tier: params.tier,
      isOwner: params.isOwner,
      dailyLimit: getDailyLimitForTier(params.tier, params.settings, params.isOwner),
      dailyUsed: 0,
      remaining: 0,
      rateLimitPerMinute: perMinuteCap,
    };
  }

  const dateKey = getTodayDateKey(nowMs);
  const ledgerKey = `${params.uid}_${dateKey}`;
  const remoteUsage = await firestoreRestGetDoc(`ai_usage/${ledgerKey}`, params.idToken);
  const memUsage = dailyMemoryLedger.get(ledgerKey);
  const currentUsed = Math.max(
    Number(remoteUsage?.requestsCount || 0),
    Number(memUsage?.requestsCount || 0)
  );

  const dailyLimit = getDailyLimitForTier(params.tier, params.settings, params.isOwner);
  if (currentUsed >= dailyLimit) {
    return {
      allowed: false,
      statusCode: 429,
      reason:
        params.tier === 'free'
          ? `You reached your daily Free tier allowance (${dailyLimit} Nexora AI requests). Upgrade to Nexora Plus or Pro for higher limits.`
          : `You reached your daily ${params.tier.toUpperCase()} allowance (${dailyLimit} requests). Allowance resets at 00:00 UTC.`,
      tier: params.tier,
      isOwner: params.isOwner,
      dailyLimit,
      dailyUsed: currentUsed,
      remaining: 0,
      rateLimitPerMinute: perMinuteCap,
    };
  }

  // Reserve minute slot immediately
  prevWindow.push(nowMs);
  minuteTimestampsByUid.set(params.uid, prevWindow);

  return {
    allowed: true,
    statusCode: 200,
    tier: params.tier,
    isOwner: params.isOwner,
    dailyLimit,
    dailyUsed: currentUsed,
    remaining: Math.max(0, dailyLimit - currentUsed),
    rateLimitPerMinute: perMinuteCap,
  };
}

export async function recordCompletedAiUsage(params: {
  uid: string;
  tier: SubscriptionTier;
  promptTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  idToken?: string;
  nowMs?: number;
}): Promise<AiUsageRecord> {
  const nowMs = params.nowMs ?? Date.now();
  const dateKey = getTodayDateKey(nowMs);
  const ledgerKey = `${params.uid}_${dateKey}`;
  const remote = await firestoreRestGetDoc(`ai_usage/${ledgerKey}`, params.idToken);
  const mem = dailyMemoryLedger.get(ledgerKey);

  const baseRequests = Math.max(Number(remote?.requestsCount || 0), Number(mem?.requestsCount || 0));
  const basePrompt = Math.max(Number(remote?.promptTokens || 0), Number(mem?.promptTokens || 0));
  const baseOutput = Math.max(Number(remote?.outputTokens || 0), Number(mem?.outputTokens || 0));
  const baseTotal = Math.max(Number(remote?.totalTokens || 0), Number(mem?.totalTokens || 0));
  const baseCost = Math.max(Number(remote?.estimatedCostUsd || 0), Number(mem?.estimatedCostUsd || 0));

  const next: AiUsageRecord = {
    uid: params.uid,
    dateKey,
    tier: params.tier,
    requestsCount: baseRequests + 1,
    promptTokens: basePrompt + params.promptTokens,
    outputTokens: baseOutput + params.outputTokens,
    totalTokens: baseTotal + params.totalTokens,
    estimatedCostUsd: Number((baseCost + params.estimatedCostUsd).toFixed(6)),
    lastRequestMs: nowMs,
  };
  dailyMemoryLedger.set(ledgerKey, next);
  await firestoreRestCommitAiUsage(next, params.idToken);
  return next;
}

export function buildNexoraSystemInstruction(params: {
  settings: GlobalAiSettingsRecord;
  customInstruction?: string;
  modeContext?: string;
}): string {
  const links = params.settings.officialLinks;
  const officialBlock = `Official Nexora Links: Web App (${links.webAppUrl}), Android Release (${links.androidApkUrl}), Guide (${links.docsUrl}), Support (${links.supportUrl}).`;
  const policyBlock =
    'Identity: You are Nexora AI, powered by Google Gemini, the official intelligent assistant of Nexora. Keep replies accurate, respectful, helpful, and never claim to perform actions you did not execute.';
  const parts = [
    policyBlock,
    params.settings.personalityPrompt,
    officialBlock,
    params.modeContext || '',
    params.customInstruction || '',
  ].filter(Boolean);
  return parts.join('\n\n').slice(0, 6000);
}

export function isPushMessagingCredentialAvailable(): boolean {
  return Boolean(
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
      process.env.K_SERVICE
  );
}

export async function dispatchPushTokens(params: {
  tokens: string[];
  title: string;
  body: string;
  link?: string;
}): Promise<{
  configured: boolean;
  status: 'sent' | 'partial' | 'not_configured' | 'failed';
  deliveredCount: number;
  failedCount: number;
  failureDetails: string[];
}> {
  const uniqueTokens = Array.from(new Set(params.tokens.map((t) => t.trim()).filter((t) => t.length >= 16)));
  if (uniqueTokens.length === 0) {
    return {
      configured: isPushMessagingCredentialAvailable(),
      status: 'sent',
      deliveredCount: 0,
      failedCount: 0,
      failureDetails: ['No opted-in FCM device tokens found for target audience.'],
    };
  }

  if (!isPushMessagingCredentialAvailable()) {
    return {
      configured: false,
      status: 'not_configured',
      deliveredCount: 0,
      failedCount: uniqueTokens.length,
      failureDetails: [
        'FCM server push credentials (GOOGLE_APPLICATION_CREDENTIALS or Firebase Cloud Functions deployment) are not configured on this runtime.',
      ],
    };
  }

  try {
    const { projectId } = loadFirebaseDbConfig();
    if (getApps().length === 0) {
      initializeApp({ projectId });
    }
    const messaging = getMessaging();
    const res = await messaging.sendEachForMulticast({
      tokens: uniqueTokens.slice(0, 500),
      notification: {
        title: params.title.slice(0, 120),
        body: params.body.slice(0, 240),
      },
      webpush: params.link
        ? {
            fcmOptions: {
              link: params.link,
            },
          }
        : undefined,
    });
    const failures = res.responses
      .map((r, idx) => (!r.success ? `Token[${idx}]: ${r.error?.message || 'delivery_failed'}` : ''))
      .filter(Boolean)
      .slice(0, 20);

    return {
      configured: true,
      status: res.failureCount === 0 ? 'sent' : res.successCount > 0 ? 'partial' : 'failed',
      deliveredCount: res.successCount,
      failedCount: res.failureCount,
      failureDetails: failures,
    };
  } catch (err) {
    return {
      configured: true,
      status: 'failed',
      deliveredCount: 0,
      failedCount: uniqueTokens.length,
      failureDetails: [err instanceof Error ? err.message.slice(0, 200) : 'FCM multicast failed.'],
    };
  }
}

export function createAiAnnouncementId(prefix: string): string {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
}

export function createServerGeminiClientOrNull(): GoogleGenAI | null {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}
