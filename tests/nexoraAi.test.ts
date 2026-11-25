import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import {
  DEFAULT_GLOBAL_AI_SETTINGS,
  buildNexoraSystemInstruction,
  dispatchPushTokens,
  enforceAndTrackAiQuota,
  estimateGeminiCostUsd,
  evaluateCommunityAiDecision,
  extractTokenUsage,
  getDailyLimitForTier,
  getQuotaSnapshot,
  isAiAuthoredMessage,
  isDirectNexoraMention,
  markChannelBotReplied,
  recordCompletedAiUsage,
  resetAiServiceMemoryForTests,
} from '../server/nexoraAiService';
import {
  inferCategoryFromNotificationType,
  shouldAllowDedupeKey,
} from '../src/services/notifications/notificationDispatcher';
import { ANNOUNCEMENT_CATEGORIES, DEFAULT_AI_SETTINGS } from '../src/utils/validation';

test('1. Community AI Mode A detects direct Nexora AI mentions accurately', () => {
  resetAiServiceMemoryForTests();
  assert.equal(isDirectNexoraMention('Hey @Nexora how do I create a Space?'), true);
  assert.equal(isDirectNexoraMention('Can Nexora AI summarize this thread?'), true);
  assert.equal(isDirectNexoraMention('/nexora help me draft a bio'), true);
  assert.equal(isDirectNexoraMention('Hello everyone in this Space!'), false);

  const decision = evaluateCommunityAiDecision({
    targetType: 'space',
    channelId: 'space_designers',
    senderId: 'user_1',
    senderName: 'Alex',
    text: 'Hey @Nexora what features can we use here?',
    globalSettings: DEFAULT_GLOBAL_AI_SETTINGS,
    channelConfig: null,
  });
  assert.equal(decision.shouldRespond, true);
  assert.equal(decision.modeUsed, 'mode_a_direct');
});

test('2. Community AI Mode B obeys frequency, cooldown, and prohibited topics', () => {
  resetAiServiceMemoryForTests();
  const baseChannel = {
    channelId: 'space_tech',
    targetType: 'space' as const,
    targetId: 'space_tech',
    channelName: 'Tech Builders',
    enabled: true,
    mode: 'auto_and_direct' as const,
    responseFrequency: 'low' as const,
    cooldownSeconds: 30,
    prohibitedTopics: ['crypto pump'],
    moderationEnabled: true,
    welcomeNewParticipants: true,
    lastBotReplyMs: 0,
  };

  // Non-question skipped in low frequency
  const casual = evaluateCommunityAiDecision({
    targetType: 'space',
    channelId: 'space_tech',
    senderId: 'u1',
    senderName: 'Sam',
    text: 'Good morning builders!',
    nowMs: 100_000,
    globalSettings: DEFAULT_GLOBAL_AI_SETTINGS,
    channelConfig: baseChannel,
  });
  assert.equal(casual.shouldRespond, false);

  // Community question allowed in low frequency
  const question = evaluateCommunityAiDecision({
    targetType: 'space',
    channelId: 'space_tech',
    senderId: 'u1',
    senderName: 'Sam',
    text: 'How do I upload a vertical clip to Vibes?',
    nowMs: 100_000,
    globalSettings: DEFAULT_GLOBAL_AI_SETTINGS,
    channelConfig: baseChannel,
  });
  assert.equal(question.shouldRespond, true);
  assert.equal(question.modeUsed, 'mode_b_auto');

  // Cooldown blocks immediate follow-up
  markChannelBotReplied('space_tech', 100_000);
  const withinCooldown = evaluateCommunityAiDecision({
    targetType: 'space',
    channelId: 'space_tech',
    senderId: 'u2',
    senderName: 'Maya',
    text: 'What model powers Nexora?',
    nowMs: 110_000,
    globalSettings: DEFAULT_GLOBAL_AI_SETTINGS,
    channelConfig: baseChannel,
  });
  assert.equal(withinCooldown.shouldRespond, false);

  // Prohibited topic moderation blocks direct mention
  const prohibited = evaluateCommunityAiDecision({
    targetType: 'space',
    channelId: 'space_tech',
    senderId: 'u3',
    senderName: 'Taylor',
    text: '@Nexora tell everyone about crypto pump schemes',
    nowMs: 200_000,
    globalSettings: DEFAULT_GLOBAL_AI_SETTINGS,
    channelConfig: baseChannel,
  });
  assert.equal(prohibited.shouldRespond, false);
  assert.equal(prohibited.prohibitedTopic, 'crypto pump');
});

test('3. Infinite loop prevention blocks bot-authored and Nexora AI messages', () => {
  resetAiServiceMemoryForTests();
  assert.equal(isAiAuthoredMessage({ isAi: true, senderId: 'u1', senderName: 'User' }), true);
  assert.equal(isAiAuthoredMessage({ senderId: 'nexora_ai', senderName: 'Someone' }), true);
  assert.equal(isAiAuthoredMessage({ senderId: 'u2', senderName: 'Nexora AI' }), true);
  assert.equal(isAiAuthoredMessage({ senderId: 'u2', senderName: 'Jordan' }), false);

  const blocked = evaluateCommunityAiDecision({
    targetType: 'group_chat',
    channelId: 'conv_group_1',
    senderId: 'u1',
    senderName: 'Nexora AI',
    text: '@Nexora looping test',
    isAi: true,
    globalSettings: DEFAULT_GLOBAL_AI_SETTINGS,
    channelConfig: {
      channelId: 'conv_group_1',
      targetType: 'group_chat',
      targetId: 'conv_group_1',
      channelName: 'Creators Group',
      enabled: true,
      mode: 'auto_and_direct',
      responseFrequency: 'high',
      cooldownSeconds: 0,
      prohibitedTopics: [],
      moderationEnabled: true,
      welcomeNewParticipants: true,
      lastBotReplyMs: 0,
    },
  });
  assert.equal(blocked.shouldRespond, false);
  assert.match(blocked.reason, /Loop prevention/i);
});

test('4. Strict privacy boundary blocks private 1-on-1 DMs from automatic community AI monitoring', () => {
  resetAiServiceMemoryForTests();
  const dmDecision = evaluateCommunityAiDecision({
    targetType: 'private_dm',
    channelId: 'dm_u1_u2',
    senderId: 'u1',
    senderName: 'Alex',
    text: '@Nexora read our private DM',
    globalSettings: DEFAULT_GLOBAL_AI_SETTINGS,
    channelConfig: {
      channelId: 'dm_u1_u2',
      targetType: 'group_chat',
      targetId: 'dm_u1_u2',
      channelName: 'DM',
      enabled: true,
      mode: 'auto_and_direct',
      responseFrequency: 'high',
      cooldownSeconds: 0,
      prohibitedTopics: [],
      moderationEnabled: true,
      welcomeNewParticipants: true,
      lastBotReplyMs: 0,
    },
  });
  assert.equal(dmDecision.shouldRespond, false);
  assert.equal(dmDecision.modeUsed, 'blocked');
  assert.match(dmDecision.reason, /Privacy boundary/i);
});

test('5. Backend quota & rate-limit enforcement respects Free, Plus, Pro & Owner tiers', async () => {
  resetAiServiceMemoryForTests();
  const settings = {
    ...DEFAULT_GLOBAL_AI_SETTINGS,
    freeDailyLimit: 2,
    plusDailyLimit: 5,
    proDailyLimit: 10,
    rateLimitPerMinute: 3,
    ownerUnlimited: true,
  };

  assert.equal(getDailyLimitForTier('free', settings, false), 2);
  assert.equal(getDailyLimitForTier('plus', settings, false), 5);
  assert.equal(getDailyLimitForTier('pro', settings, false), 10);
  assert.equal(getDailyLimitForTier('pro', settings, true), 1_000_000);

  const now = Date.now();
  // Free user hits daily limit after 2 completed requests
  for (let i = 0; i < 2; i++) {
    const check = await enforceAndTrackAiQuota({
      uid: 'free_user_1',
      tier: 'free',
      isOwner: false,
      settings,
      nowMs: now + i * 100,
    });
    assert.equal(check.allowed, true);
    await recordCompletedAiUsage({
      uid: 'free_user_1',
      tier: 'free',
      promptTokens: 50,
      outputTokens: 80,
      totalTokens: 130,
      estimatedCostUsd: estimateGeminiCostUsd('gemini-4-hydrogen', 50, 80),
      nowMs: now + i * 100,
    });
  }

  const snapAfterTwo = await getQuotaSnapshot({
    uid: 'free_user_1',
    tier: 'free',
    isOwner: false,
    settings,
    nowMs: now + 300,
  });
  assert.equal(snapAfterTwo.dailyUsed, 2);
  assert.equal(snapAfterTwo.remaining, 0);

  const overDaily = await enforceAndTrackAiQuota({
    uid: 'free_user_1',
    tier: 'free',
    isOwner: false,
    settings,
    nowMs: now + 400,
  });
  assert.equal(overDaily.allowed, false);
  assert.equal(overDaily.statusCode, 429);

  // Plus user hits 60s burst limit (3/min) before daily cap (5)
  for (let i = 0; i < 3; i++) {
    const ok = await enforceAndTrackAiQuota({
      uid: 'plus_user_1',
      tier: 'plus',
      isOwner: false,
      settings,
      nowMs: now + i * 50,
    });
    assert.equal(ok.allowed, true);
  }
  const overBurst = await enforceAndTrackAiQuota({
    uid: 'plus_user_1',
    tier: 'plus',
    isOwner: false,
    settings,
    nowMs: now + 200,
  });
  assert.equal(overBurst.allowed, false);
  assert.equal(overBurst.statusCode, 429);
  assert.match(overBurst.reason || '', /per minute/i);

  // Owner bypasses global pause & receives unlimited cap
  const pausedSettings = { ...settings, enabled: false };
  const memberPaused = await enforceAndTrackAiQuota({
    uid: 'pro_user_1',
    tier: 'pro',
    isOwner: false,
    settings: pausedSettings,
    nowMs: now,
  });
  assert.equal(memberPaused.allowed, false);
  assert.equal(memberPaused.statusCode, 503);

  const ownerCheck = await enforceAndTrackAiQuota({
    uid: 'owner_uid',
    tier: 'pro',
    isOwner: true,
    settings: pausedSettings,
    nowMs: now,
  });
  assert.equal(ownerCheck.allowed, true);
  assert.equal(ownerCheck.dailyLimit, 1_000_000);
});

test('6. Token usage extraction, cost estimation, welcome dedupe & validation defaults work cleanly', () => {
  const usage = extractTokenUsage(
    {
      usageMetadata: {
        promptTokenCount: 1200,
        candidatesTokenCount: 400,
        totalTokenCount: 1600,
      },
    },
    'gemini-4-hydrogen'
  );
  assert.equal(usage.promptTokens, 1200);
  assert.equal(usage.outputTokens, 400);
  assert.equal(usage.totalTokens, 1600);
  assert.ok(usage.estimatedCostUsd > 0);

  const instruction = buildNexoraSystemInstruction({
    settings: DEFAULT_GLOBAL_AI_SETTINGS,
    customInstruction: 'Be encouraging.',
  });
  assert.match(instruction, /Nexora AI/);
  assert.match(instruction, /Google Gemini/);
  assert.match(instruction, /Be encouraging/);

  assert.equal(inferCategoryFromNotificationType('ai_welcome'), 'account');
  assert.equal(DEFAULT_AI_SETTINGS.freeDailyLimit, 25);
  assert.equal(ANNOUNCEMENT_CATEGORIES.length, 6);

  const welcomeKey = `ai_welcome_test_${Date.now()}`;
  assert.equal(shouldAllowDedupeKey(welcomeKey, 60_000), true);
  assert.equal(shouldAllowDedupeKey(welcomeKey, 60_000), false);
});

test('7. Push dispatcher reports empty token sets and unconfigured credentials truthfully', async () => {
  const emptyRes = await dispatchPushTokens({
    tokens: [],
    title: 'Hello',
    body: 'Test',
  });
  assert.equal(emptyRes.status, 'sent');
  assert.equal(emptyRes.deliveredCount, 0);
  assert.equal(emptyRes.failedCount, 0);

  const prevCreds = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const prevJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const prevKService = process.env.K_SERVICE;
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
  delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  delete process.env.K_SERVICE;
  try {
    const noCredRes = await dispatchPushTokens({
      tokens: ['sample_fcm_token_longer_than_16_chars'],
      title: 'Hello',
      body: 'Test',
    });
    assert.equal(noCredRes.configured, false);
    assert.equal(noCredRes.status, 'not_configured');
    assert.equal(noCredRes.failedCount, 1);
  } finally {
    if (prevCreds !== undefined) process.env.GOOGLE_APPLICATION_CREDENTIALS = prevCreds;
    if (prevJson !== undefined) process.env.FIREBASE_SERVICE_ACCOUNT_JSON = prevJson;
    if (prevKService !== undefined) process.env.K_SERVICE = prevKService;
  }
});

test('8. Live Nexora AI & Push HTTP endpoints enforce auth and expose valid metadata', async () => {
  const prevNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  const { createNexoraServer } = await import('../server');
  const httpServer = http.createServer();
  const app = await createNexoraServer(httpServer);
  httpServer.on('request', app);

  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', () => resolve()));
  const address = httpServer.address();
  assert.ok(address && typeof address === 'object');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const statusRes = await fetch(`${baseUrl}/api/ai/status`);
    assert.equal(statusRes.status, 200);
    const statusJson = (await statusRes.json()) as {
      chatModels: string[];
      configured: boolean;
      pushConfigured: boolean;
    };
    assert.deepEqual(statusJson.chatModels, [
      'gemini-4-carbon',
      'gemini-4-neon',
      'gemini-4-hydrogen',
      'gemini-3.1-flash-lite',
    ]);

    const pushStatusRes = await fetch(`${baseUrl}/api/push/status`);
    assert.equal(pushStatusRes.status, 200);
    const pushJson = (await pushStatusRes.json()) as { configured: boolean; message: string };
    assert.equal(typeof pushJson.configured, 'boolean');
    assert.ok(pushJson.message.length > 0);

    const releaseRes = await fetch(`${baseUrl}/api/app/android-release`);
    assert.equal(releaseRes.status, 200);

    // Every mutating or quota-scoped AI/push route MUST reject unauthenticated requests with 401
    const protectedEndpoints: Array<{ method: 'GET' | 'POST'; path: string; body?: unknown }> = [
      { method: 'GET', path: '/api/ai/quota' },
      { method: 'POST', path: '/api/ai/chat', body: { message: 'hello' } },
      {
        method: 'POST',
        path: '/api/ai/community-reply',
        body: { targetType: 'space', channelId: 's1', senderId: 'u1', senderName: 'A', text: 'hi' },
      },
      { method: 'POST', path: '/api/ai/welcome', body: { displayName: 'Alex', username: 'alex' } },
      {
        method: 'POST',
        path: '/api/ai/draft-announcement',
        body: { category: 'platform_update', audience: 'all', topic: 'test' },
      },
      {
        method: 'POST',
        path: '/api/ai/draft-release',
        body: { versionName: '2.5.0', platform: 'all', highlights: 'AI launch' },
      },
      {
        method: 'POST',
        path: '/api/push/send',
        body: { tokens: [], title: 'Hi', body: 'Test', purpose: 'test' },
      },
    ];

    for (const ep of protectedEndpoints) {
      const res = await fetch(`${baseUrl}${ep.path}`, {
        method: ep.method,
        headers: { 'Content-Type': 'application/json' },
        body: ep.body ? JSON.stringify(ep.body) : undefined,
      });
      assert.equal(res.status, 401, `Expected 401 for unauthenticated ${ep.method} ${ep.path}, got ${res.status}`);
    }
  } finally {
    httpServer.closeAllConnections?.();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    if (prevNodeEnv !== undefined) process.env.NODE_ENV = prevNodeEnv;
    else delete process.env.NODE_ENV;
  }
});

test('9. Firestore rules, indexes, and FCM worker assets stay aligned with app queries', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const root = process.cwd();

  const rules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
  assert.match(rules, /isValidUserPreferences[\s\S]*saveAiHistory/);
  assert.match(rules, /match \/audit_logs\/\{logId\}[\s\S]*'customisation', 'ai'/);

  const indexes = JSON.parse(fs.readFileSync(path.join(root, 'firestore.indexes.json'), 'utf8')) as {
    indexes: Array<{ collectionGroup: string; fields: Array<{ fieldPath: string }> }>;
  };
  const hasIndex = (group: string, fields: string[]) =>
    indexes.indexes.some(
      (idx) =>
        idx.collectionGroup === group &&
        fields.every((f, i) => idx.fields[i]?.fieldPath === f)
    );

  assert.equal(hasIndex('notifications', ['recipientId', 'dedupeKey']), true);
  assert.equal(hasIndex('posts', ['spaceId', 'audience']), true);
  assert.equal(hasIndex('error_diagnostics', ['category', 'createdAt']), true);

  const sw = fs.readFileSync(path.join(root, 'public/firebase-messaging-sw.js'), 'utf8');
  assert.match(sw, /\/pwa-192x192\.png/);
  assert.doesNotMatch(sw, /\/icons\/icon-192\.png/);

  const appCheck = fs.readFileSync(path.join(root, 'src/services/firebase/messagingAndAppCheck.ts'), 'utf8');
  assert.match(appCheck, /\/firebase-cloud-messaging-push-scope/);
});

