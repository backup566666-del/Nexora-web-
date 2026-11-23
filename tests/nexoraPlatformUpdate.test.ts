import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { Timestamp } from 'firebase/firestore';
import {
  DEFAULT_CUSTOMISATION_CATALOG,
  DEFAULT_SUBSCRIPTION_PLANS,
  canAccessTier,
  filterSearchablePosts,
  filterSearchableSpaces,
  filterSearchableUsers,
  resolveEffectiveSubscriptionTier,
  sanitizeProfileCustomisation,
  withPrivacyDefaults,
} from '../src/utils/validation';
import {
  extractReadableErrorMessage,
} from '../src/services/firebase/errorHandler';
import {
  inferCategoryFromNotificationType,
} from '../src/services/notifications/notificationDispatcher';
import {
  aggregateCreatorAnalytics,
  toUtcDateKey,
} from '../src/services/firebase/analyticsService';
import type {
  CreatorAnalyticsDaily,
  Post,
  Space,
  UserProfile,
  UserSubscription,
  Vibe,
} from '../src/types/nexora';

test('1. Friendly error scrubbing strips technical codes, paths, stack traces, and long numeric IDs', () => {
  const technicalSamples: unknown[] = [
    new Error('FirebaseError: Missing or insufficient permissions (firestore/permission-denied) at /users/123456789012/private/security'),
    new Error('HTTP status 503 Service Unavailable from https://api.example.com/v1/billing/12345678'),
    new Error('TypeError: Cannot read properties of undefined\n    at handleSubmit (/src/pages/home/HomePage.tsx:142:19)'),
    { code: 'storage/unauthorized', message: 'User does not have permission to access /vibes/9876543210/clip.mp4 (403)' },
    { code: 'auth/id-token-expired', message: 'Firebase ID token expired at 1795000000000' },
    new Error('Stripe Checkout session cs_test_1234567890abcdef failed at pi_9988776655'),
  ];

  for (const sample of technicalSamples) {
    const clean = extractReadableErrorMessage(sample, 'Something went wrong. Please try again.', {
      recordDiagnostic: false,
    });
    assert.ok(clean.length > 0 && clean.length < 180, `Expected concise friendly message, got: ${clean}`);
    assert.equal(/\b\d{6,}\b/.test(clean), false, `Long numeric string leaked: ${clean}`);
    assert.equal(/\b[45]\d{2}\b/.test(clean), false, `HTTP status leaked: ${clean}`);
    assert.equal(/firestore|firebase|storage\/|auth\/|cs_test_|pi_|at\s+\/src\//i.test(clean), false, `Technical token leaked: ${clean}`);
  }

  const videoTooLarge = extractReadableErrorMessage(
    Object.assign(new Error('413 payload too large'), { mediaKind: 'video_too_large' }),
    'Fallback',
    { recordDiagnostic: false }
  );
  assert.equal(videoTooLarge, 'Your video is too large. Please upload a smaller video.');
});

test('2. Notification categories & locked security preferences are enforced cleanly', () => {
  assert.equal(inferCategoryFromNotificationType('message'), 'messages');
  assert.equal(inferCategoryFromNotificationType('space_invite'), 'spaces');
  assert.equal(inferCategoryFromNotificationType('event_reminder'), 'spaces');
  assert.equal(inferCategoryFromNotificationType('subscription_notice'), 'subscriptions');
  assert.equal(inferCategoryFromNotificationType('security_alert'), 'security');
  assert.equal(inferCategoryFromNotificationType('reply'), 'social');

  const prefs = withPrivacyDefaults({
    inAppNotifications: {
      account: true,
      social: true,
      messages: false,
      spaces: true,
      subscriptions: true,
      badges: true,
      gifts: true,
      admin: true,
      security: false as unknown as true,
    },
    emailNotifications: {
      account: true,
      social: false,
      messages: false,
      spaces: false,
      subscriptions: true,
      badges: true,
      gifts: false,
      admin: true,
      security: false as unknown as true,
    },
  });

  assert.equal(prefs.inAppNotifications?.messages, false);
  assert.equal(prefs.emailNotifications?.spaces, false);
  assert.equal(prefs.inAppNotifications?.security, true);
  assert.equal(prefs.emailNotifications?.security, true);
});

test('3. Search & Discovery privacy filters enforce suspended, blocked, followers-only, and private space visibility', () => {
  const viewerUid = 'u_viewer';
  const users = [
    { uid: viewerUid, displayName: 'Viewer', username: 'viewer', email: '', suspended: false },
    { uid: 'u_public', displayName: 'Public Creator', username: 'pub_creator', email: '', suspended: false },
    { uid: 'u_private_followed', displayName: 'Private Followed', username: 'priv_ok', email: '', suspended: false },
    { uid: 'u_private_stranger', displayName: 'Private Stranger', username: 'priv_no', email: '', suspended: false },
    { uid: 'u_blocked', displayName: 'Blocked', username: 'blocked_u', email: '', suspended: false },
    { uid: 'u_suspended', displayName: 'Suspended', username: 'susp_u', email: '', suspended: true },
  ] as unknown as UserProfile[];

  const searchableUsers = filterSearchableUsers(
    users,
    viewerUid,
    ['u_blocked'],
    ['u_private_followed'],
    new Set(['u_private_followed', 'u_private_stranger'])
  );
  const uidSet = new Set(searchableUsers.map((u) => u.uid));
  assert.equal(uidSet.has('u_public'), true);
  assert.equal(uidSet.has('u_private_followed'), true);
  assert.equal(uidSet.has('u_private_stranger'), false);
  assert.equal(uidSet.has('u_blocked'), false);
  assert.equal(uidSet.has('u_suspended'), false);

  const posts = [
    { id: 'p_pub', authorId: 'u_public', audience: 'public', text: 'Public' },
    { id: 'p_fol_ok', authorId: 'u_private_followed', audience: 'followers', text: 'Followers ok' },
    { id: 'p_fol_no', authorId: 'u_private_stranger', audience: 'followers', text: 'Followers no' },
    { id: 'p_space_ok', authorId: 'u_public', audience: 'space', spaceId: 'sp_joined', text: 'Space ok' },
    { id: 'p_space_no', authorId: 'u_public', audience: 'space', spaceId: 'sp_priv', text: 'Space private' },
    { id: 'p_blk', authorId: 'u_blocked', audience: 'public', text: 'Blocked' },
  ] as unknown as Post[];

  const searchablePosts = filterSearchablePosts(
    posts,
    viewerUid,
    ['u_blocked'],
    ['u_private_followed'],
    ['sp_joined'],
    new Set(['sp_priv']),
    new Set(['u_suspended'])
  );
  assert.deepEqual(
    searchablePosts.map((p) => p.id),
    ['p_pub', 'p_fol_ok', 'p_space_ok']
  );

  const spaces = [
    { id: 'sp_open', ownerId: 'u_public', isPrivate: false, status: 'active' },
    { id: 'sp_priv_joined', ownerId: 'u_public', isPrivate: true, status: 'active' },
    { id: 'sp_priv_secret', ownerId: 'u_public', isPrivate: true, status: 'active' },
    { id: 'sp_susp', ownerId: 'u_public', isPrivate: false, status: 'suspended' },
  ] as unknown as Space[];
  const searchableSpaces = filterSearchableSpaces(spaces, viewerUid, ['sp_priv_joined']);
  assert.deepEqual(
    searchableSpaces.map((s) => s.id),
    ['sp_open', 'sp_priv_joined']
  );
});

test('4. Creator Analytics aggregates daily series and top posts/vibes across 7d/30d/90d/custom accurately', () => {
  const now = new Date('2026-11-23T12:00:00Z');
  const todayKey = toUtcDateKey(now);
  const threeDaysAgoKey = '2026-11-20';
  const fortyDaysAgoKey = '2026-10-14';

  const creator = {
    uid: 'u_creator',
    displayName: 'Aria Creator',
    username: 'aria',
    email: 'aria@example.com',
    followersCount: 240,
  } as unknown as UserProfile;

  const dailyRows: CreatorAnalyticsDaily[] = [
    { id: `u_creator_${todayKey}`, uid: 'u_creator', dateKey: todayKey, profileVisits: 12, postImpressions: 120, vibeViews: 40, followersDelta: 4 },
    { id: `u_creator_${threeDaysAgoKey}`, uid: 'u_creator', dateKey: threeDaysAgoKey, profileVisits: 8, postImpressions: 80, vibeViews: 60, followersDelta: 3 },
    { id: `u_creator_${fortyDaysAgoKey}`, uid: 'u_creator', dateKey: fortyDaysAgoKey, profileVisits: 50, postImpressions: 500, vibeViews: 100, followersDelta: 20 },
  ];

  const posts = [
    {
      id: 'p1',
      authorId: 'u_creator',
      likesCount: 20,
      commentsCount: 5,
      repostsCount: 3,
      savesCount: 2,
      createdAt: Timestamp.fromDate(new Date('2026-11-21T10:00:00Z')),
    },
    {
      id: 'p_old',
      authorId: 'u_creator',
      likesCount: 99,
      commentsCount: 10,
      repostsCount: 5,
      savesCount: 4,
      createdAt: Timestamp.fromDate(new Date('2026-10-14T10:00:00Z')),
    },
  ] as unknown as Post[];

  const vibes = [
    {
      id: 'v1',
      authorId: 'u_creator',
      viewsCount: 150,
      likesCount: 30,
      commentsCount: 4,
      repostsCount: 2,
      savesCount: 5,
      createdAt: Timestamp.fromDate(new Date('2026-11-22T10:00:00Z')),
    },
  ] as unknown as Vibe[];

  const last7 = aggregateCreatorAnalytics({ profile: creator, dailyRows, posts, vibes, preset: '7d', now });
  assert.equal(last7.dailySeries.length, 7);
  assert.equal(last7.totalProfileVisits, 20);
  assert.equal(last7.totalPostImpressions, 200);
  assert.equal(last7.totalVibeViews, 150);
  assert.equal(last7.netFollowersInRange, 7);
  assert.equal(last7.topPosts.length, 1);
  assert.equal(last7.topPosts[0].id, 'p1');
  assert.equal(last7.topVibes[0].id, 'v1');

  const last90 = aggregateCreatorAnalytics({ profile: creator, dailyRows, posts, vibes, preset: '90d', now });
  assert.equal(last90.dailySeries.length, 90);
  assert.equal(last90.totalProfileVisits, 70);
  assert.equal(last90.totalPostImpressions, 700);
  assert.equal(last90.topPosts[0].id, 'p_old');

  const customRange = aggregateCreatorAnalytics({
    profile: creator,
    dailyRows,
    posts,
    vibes,
    preset: 'custom',
    customStart: '2026-11-20',
    customEnd: '2026-11-23',
    now,
  });
  assert.equal(customRange.dailySeries.length, 4);
  assert.equal(customRange.totalProfileVisits, 20);
});

test('5. Subscription tiers never invent paid pricing and auto-downgrade expired subscriptions to free', () => {
  const freePlan = DEFAULT_SUBSCRIPTION_PLANS.find((p) => p.id === 'free');
  const plusPlan = DEFAULT_SUBSCRIPTION_PLANS.find((p) => p.id === 'plus');
  const proPlan = DEFAULT_SUBSCRIPTION_PLANS.find((p) => p.id === 'pro');

  assert.ok(freePlan && plusPlan && proPlan);
  assert.equal(freePlan.monthlyPriceCents, 0);
  assert.equal(freePlan.pricingConfigured, true);
  assert.equal(plusPlan.monthlyPriceCents, null);
  assert.equal(plusPlan.yearlyPriceCents, null);
  assert.equal(plusPlan.pricingConfigured, false);
  assert.equal(proPlan.monthlyPriceCents, null);
  assert.equal(proPlan.yearlyPriceCents, null);
  assert.equal(proPlan.pricingConfigured, false);

  const nowMs = Date.UTC(2026, 10, 23);
  const activePro: UserSubscription = {
    uid: 'u1',
    tier: 'pro',
    billingCycle: 'monthly',
    status: 'active',
    cancelAtPeriodEnd: false,
    provider: 'stripe',
    verifiedByServer: true,
    currentPeriodEnd: Timestamp.fromMillis(nowMs + 86_400_000),
  };
  assert.equal(resolveEffectiveSubscriptionTier(activePro, nowMs), 'pro');

  const expiredPro: UserSubscription = {
    ...activePro,
    currentPeriodEnd: Timestamp.fromMillis(nowMs - 60_000),
  };
  assert.equal(resolveEffectiveSubscriptionTier(expiredPro, nowMs), 'free');
  assert.equal(resolveEffectiveSubscriptionTier({ uid: 'u1', tier: 'plus', status: 'active' }, nowMs), 'plus');
  assert.equal(resolveEffectiveSubscriptionTier(null, nowMs), 'free');

  assert.equal(canAccessTier('pro', 'plus'), true);
  assert.equal(canAccessTier('plus', 'pro'), false);
  assert.equal(canAccessTier('free', 'free'), true);
});

test('6. Customisation Studio catalog contains original Nexora items (zero Discord) and strict tier locks', () => {
  assert.ok(DEFAULT_CUSTOMISATION_CATALOG.length >= 25);
  for (const item of DEFAULT_CUSTOMISATION_CATALOG) {
    assert.equal(/discord/i.test(`${item.id} ${item.name} ${item.description}`), false);
  }

  const proSelection = {
    themeId: 'theme_celestial_gold',
    backgroundColor: '#1B0C18',
    accentColor: '#F59E0B',
    gradientId: 'grad_solar_crown',
    bannerPresetId: 'banner_auric_eclipse',
    bannerImageUrl: 'https://example.com/banner.jpg',
    avatarFrameId: 'frame_sovereign_crest',
    staticDecorationId: 'deco_crown_pin',
    animatedDecorationId: 'anim_stardust_halo',
    effectId: 'effect_starlight',
    layoutVariant: 'showcase' as const,
    cardOpacity: 85,
  };

  const keptForPro = sanitizeProfileCustomisation(proSelection, 'pro');
  assert.equal(keptForPro.themeId, 'theme_celestial_gold');
  assert.equal(keptForPro.animatedDecorationId, 'anim_stardust_halo');
  assert.equal(keptForPro.layoutVariant, 'showcase');
  assert.equal(keptForPro.bannerImageUrl, 'https://example.com/banner.jpg');

  const downgradedForFree = sanitizeProfileCustomisation(proSelection, 'free');
  assert.equal(downgradedForFree.themeId, 'theme_obsidian');
  assert.equal(downgradedForFree.animatedDecorationId, 'anim_none');
  assert.equal(downgradedForFree.effectId, 'effect_none');
  assert.equal(downgradedForFree.layoutVariant, 'classic');
  assert.equal(downgradedForFree.bannerImageUrl, '');
});

test('7. Firestore rules and server Stripe handlers protect billing integrity & public customisations', () => {
  const rules = fs.readFileSync('firestore.rules', 'utf8');
  assert.ok(rules.includes('match /creator_analytics_daily/{docId}'));
  assert.ok(rules.includes('match /subscription_plans/{planId}'));
  assert.ok(rules.includes('match /user_subscriptions/{userId}'));
  assert.ok(rules.includes('match /payment_transactions/{txId}'));
  assert.ok(rules.includes('match /customisation_catalog/{itemId}'));
  assert.ok(rules.includes('isValidProfileCustomisation'));
  assert.ok(rules.includes('profileCustomisation'));
  assert.ok(rules.includes("subscriptionTier == 'free'"));

  const serverSrc = fs.readFileSync('server.ts', 'utf8');
  assert.ok(serverSrc.includes('/api/billing/status'));
  assert.ok(serverSrc.includes('/api/billing/create-checkout-session'));
  assert.ok(serverSrc.includes('/api/billing/verify-session'));
  assert.ok(serverSrc.includes('/api/billing/refund'));
  assert.ok(serverSrc.includes('/api/billing/webhook'));
});

test('8. Founder/Owner account is permanently provisioned and resolved to highest tier (Nexora Pro)', () => {
  const adminSrc = fs.readFileSync('src/services/firebase/adminService.ts', 'utf8');
  assert.ok(adminSrc.includes("receiptRef: 'FOUNDER-OWNER-PRO'"));
  assert.ok(adminSrc.includes("tier: 'pro' satisfies SubscriptionTier"));
  assert.ok(adminSrc.includes("userPatch.subscriptionTier = 'pro' satisfies SubscriptionTier"));

  const authHookSrc = fs.readFileSync('src/hooks/useAuth.tsx', 'utf8');
  assert.ok(authHookSrc.includes('isOwnerAccount'));
  assert.ok(authHookSrc.includes("if (isOwnerAccount) {\n      return 'pro';\n    }"));

  const subServiceSrc = fs.readFileSync('src/services/firebase/subscriptionService.ts', 'utf8');
  assert.ok(subServiceSrc.includes("params.isOwner || params.subscription?.receiptRef === 'FOUNDER-OWNER-PRO'"));

  const ownerCompSub: UserSubscription = {
    uid: 'owner_uid',
    tier: 'pro',
    billingCycle: 'yearly',
    status: 'active',
    cancelAtPeriodEnd: false,
    provider: 'admin',
    receiptRef: 'FOUNDER-OWNER-PRO',
    verifiedByServer: false,
  };
  assert.equal(resolveEffectiveSubscriptionTier(ownerCompSub, Date.UTC(2028, 0, 1)), 'pro');
});
