import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ALL_CANONICAL_BADGES,
  APPLICATION_ELIGIBLE_BADGES,
  BADGE_CATALOG,
  DEFAULT_BADGE_CONFIGS,
  FREE_GIFT_CATALOG,
  normalizeBadgeList,
  normalizeBadgeType,
  withPrivacyDefaults,
} from '../src/utils/validation';
import {
  inferCategoryFromNotificationType,
  shouldAllowDedupeKey,
} from '../src/services/notifications/notificationDispatcher';
import { getEmailProviderConfig, buildNexoraEmailHtml, dispatchNexoraEmail } from '../server';

test('20 canonical badges exist with complete metadata and legacy alias normalization', () => {
  assert.equal(ALL_CANONICAL_BADGES.length, 20);
  const uniqueIds = new Set(ALL_CANONICAL_BADGES);
  assert.equal(uniqueIds.size, 20);

  for (const badgeId of ALL_CANONICAL_BADGES) {
    const def = BADGE_CATALOG[badgeId];
    assert.ok(def, `Missing BADGE_CATALOG entry for ${badgeId}`);
    assert.equal(def.id, badgeId);
    assert.ok(def.name.length > 0);
    assert.ok(def.description.length > 0);
    assert.ok(DEFAULT_BADGE_CONFIGS[badgeId]);
  }

  // Legacy alias mapping
  assert.equal(normalizeBadgeType('owner'), 'founder');
  assert.equal(normalizeBadgeType('verified'), 'verified_identity');
  assert.equal(normalizeBadgeType('partner'), 'official_organization');
  assert.equal(normalizeBadgeType('founder_circle'), 'pioneer');

  // Multi-badge list deduplication and normalization
  const normalized = normalizeBadgeList(['owner', 'verified', 'creator', 'verified_identity'], 'founder');
  assert.deepEqual(normalized, ['founder', 'verified_identity', 'creator']);

  // Official Blue Verified Identity cannot be applied via specialty badge form & is separate from Supporter
  const eligibleIds = new Set(APPLICATION_ELIGIBLE_BADGES.map((b) => b.id));
  assert.equal(eligibleIds.has('verified_identity'), false);
  assert.equal(eligibleIds.has('founder'), false);
  assert.equal(eligibleIds.has('supporter'), true);
});

test('privacy defaults include tagging, collaboration & dual notification channel flags', () => {
  const defaults = withPrivacyDefaults(undefined);
  assert.equal(defaults.allowTags, 'everyone');
  assert.equal(defaults.allowCollaborations, 'everyone');
  assert.equal(defaults.emailNotifications?.security, true);
  assert.equal(defaults.inAppNotifications?.gifts, true);

  const partial = withPrivacyDefaults({
    allowTags: 'followers',
    allowCollaborations: 'nobody',
    emailNotifications: {
      account: true,
      social: false,
      badges: true,
      gifts: false,
      admin: true,
      security: true,
    },
  });
  assert.equal(partial.allowTags, 'followers');
  assert.equal(partial.allowCollaborations, 'nobody');
  assert.equal(partial.emailNotifications?.social, false);
  assert.equal(partial.emailNotifications?.gifts, false);
  assert.equal(partial.inAppNotifications?.social, true);
});

test('notification category inference & dedupe window work consistently', () => {
  assert.equal(inferCategoryFromNotificationType('badge_awarded'), 'badges');
  assert.equal(inferCategoryFromNotificationType('identity_decision'), 'badges');
  assert.equal(inferCategoryFromNotificationType('gift_received'), 'gifts');
  assert.equal(inferCategoryFromNotificationType('collab_invite'), 'social');
  assert.equal(inferCategoryFromNotificationType('post_tag'), 'social');
  assert.equal(inferCategoryFromNotificationType('security_alert'), 'security');
  assert.equal(inferCategoryFromNotificationType('support_ticket'), 'admin');

  const key = `test_dedupe_${Date.now()}`;
  assert.equal(shouldAllowDedupeKey(key, 5000), true);
  assert.equal(shouldAllowDedupeKey(key, 5000), false);
});

test('free virtual gift catalog strictly contains only free gifts with zero price or coin fields', () => {
  assert.ok(FREE_GIFT_CATALOG.length >= 8);
  for (const gift of FREE_GIFT_CATALOG) {
    assert.equal(gift.tier, 'free');
    assert.equal(gift.enabled, true);
    assert.equal('price' in gift, false);
    assert.equal('coins' in gift, false);
  }
});

test('server email dispatch reports not_configured honestly when provider env vars are unset', async () => {
  const prevResend = process.env.RESEND_API_KEY;
  const prevHost = process.env.SMTP_HOST;
  const prevUser = process.env.SMTP_USER;
  const prevPass = process.env.SMTP_PASS;

  delete process.env.RESEND_API_KEY;
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASS;

  try {
    const cfg = getEmailProviderConfig();
    assert.equal(cfg.configured, false);
    assert.equal(cfg.provider, 'none');

    const html = buildNexoraEmailHtml({
      to: 'member@example.com',
      subject: 'Welcome <script>alert(1)</script>',
      bodyText: 'Line 1\nLine 2',
      recipientName: 'Alex & Co',
      ctaLabel: 'Open Nexora',
      ctaUrl: 'https://nexora.social/',
    });
    assert.ok(html.includes('&lt;script&gt;'));
    assert.ok(html.includes('Alex &amp; Co'));

    const outcome = await dispatchNexoraEmail({
      to: 'member@example.com',
      subject: 'Test Subject',
      bodyText: 'Test Body',
    });
    assert.equal(outcome.delivered, false);
    assert.equal(outcome.status, 'not_configured');
    assert.equal(outcome.provider, 'none');

    const badEmail = await dispatchNexoraEmail({
      to: 'invalid-email',
      subject: 'Subj',
      bodyText: 'Body',
    });
    assert.equal(badEmail.delivered, false);
    assert.equal(badEmail.status, 'failed');
  } finally {
    if (prevResend !== undefined) process.env.RESEND_API_KEY = prevResend;
    if (prevHost !== undefined) process.env.SMTP_HOST = prevHost;
    if (prevUser !== undefined) process.env.SMTP_USER = prevUser;
    if (prevPass !== undefined) process.env.SMTP_PASS = prevPass;
  }
});
