import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ALL_CANONICAL_BADGES,
  APPLICATION_ELIGIBLE_BADGES,
  BADGE_CATALOG,
  DEFAULT_BADGE_CONFIGS,
  FREE_GIFT_CATALOG,
  computePostEngagementScore,
  isValidUsername,
  normalizeBadgeList,
  normalizeBadgeType,
  normalizeUsername,
  rankTrendingPosts,
  sanitizeString,
  withPrivacyDefaults,
} from '../src/utils/validation';
import {
  inferCategoryFromNotificationType,
  shouldAllowDedupeKey,
} from '../src/services/notifications/notificationDispatcher';
import {
  extractAdminDiagnosticMessage,
  extractReadableErrorMessage,
  redactSensitiveDiagnosticText,
} from '../src/services/firebase/errorHandler';
import {
  computeEffectivePublicStatus,
  computeSelfAdminStatus,
  pruneStaleSessions,
  SESSION_STALE_MS,
} from '../src/services/firebase/presenceService';
import { resolveInlineCompressionLimits } from '../src/services/storage/mediaUploadService';
import { mapAuthErrorMessage } from '../src/services/auth/authService';
import firebaseConfig from '../firebase-applet-config.json';
import {
  getEmailProviderConfig,
  buildNexoraEmailHtml,
  dispatchNexoraEmail,
  getAndroidReleaseStatus,
} from '../server';

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

test('extractReadableErrorMessage translates technical permission/session/network JSON into friendly user-safe copy', () => {
  const unverifiedJson = JSON.stringify({
    error: '7 PERMISSION_DENIED: Missing or insufficient permissions.',
    operationType: 'write',
    path: 'users/test_uid',
    authInfo: { userId: 'test_uid', emailVerified: false },
  });
  const readable = extractReadableErrorMessage(new Error(unverifiedJson), 'Unable to save.', {
    recordDiagnostic: false,
  });
  assert.equal(readable.includes('{'), false);
  assert.equal(readable.toLowerCase().includes('firestore'), false);
  assert.equal(readable.includes('users/test_uid'), false);
  assert.equal(readable, 'You are not authorised to perform this action.');

  const expiredSession = extractReadableErrorMessage(
    { code: 'auth/id-token-expired', message: 'Firebase: Error (auth/id-token-expired).' },
    'Fallback',
    { recordDiagnostic: false }
  );
  assert.equal(expiredSession, 'Your session has expired. Please sign in again.');

  const offlineErr = extractReadableErrorMessage(
    { code: 'unavailable', message: 'Failed to get document because client is offline.' },
    'Fallback',
    { recordDiagnostic: false }
  );
  assert.equal(offlineErr, 'Check your internet connection and try again.');
});

test('inline compression limits guarantee avatars, covers, posts, and stories fit Firestore rule caps', () => {
  const avatarLimits = resolveInlineCompressionLimits('users/uid1/avatar');
  assert.ok(avatarLimits.maxBytes <= 150_000);
  assert.ok(avatarLimits.maxBytes < 200_000); // firestore.rules avatarUrl cap

  const coverLimits = resolveInlineCompressionLimits('users/uid1/cover');
  assert.ok(coverLimits.maxBytes <= 300_000);
  assert.ok(coverLimits.maxBytes < 400_000); // firestore.rules coverUrl cap

  const postLimits = resolveInlineCompressionLimits('posts/uid1');
  assert.ok(postLimits.maxBytes * 4 <= 780_000); // 4-image post stays under 1 MiB doc limit

  const storyLimits = resolveInlineCompressionLimits('stories/uid1');
  assert.ok(storyLimits.maxBytes < 400_000); // firestore.rules story.mediaUrl cap
});

test('username normalization and display name sanitization satisfy Firestore rules regex and bounds', () => {
  assert.equal(normalizeUsername('@Test.User-99 '), 'test_user_99');
  assert.equal(isValidUsername(normalizeUsername('Elena_Vance01')), true);
  assert.equal(isValidUsername('ab'), false);
  assert.equal(sanitizeString('   ', 80), '');
});

test('mapAuthErrorMessage clearly surfaces Google OAuth, popup, and domain authorization errors with friendly copy', () => {
  const unauthDomain = mapAuthErrorMessage({ code: 'auth/unauthorized-domain' });
  assert.ok(unauthDomain.toLowerCase().includes('temporarily unavailable'));
  assert.equal(unauthDomain.includes('auth/'), false);

  const popupBlocked = mapAuthErrorMessage({ code: 'auth/popup-blocked' });
  assert.ok(popupBlocked.toLowerCase().includes('popup'));

  const diffCred = mapAuthErrorMessage({ code: 'auth/account-exists-with-different-credential' });
  assert.ok(diffCred.toLowerCase().includes('different sign-in method'));

  const cancelled = mapAuthErrorMessage({ code: 'auth/cancelled-popup-request' });
  assert.ok(cancelled.toLowerCase().includes('cancelled'));
});

test('existing Firebase project configuration and OAuth client remain preserved verbatim', () => {
  assert.equal(firebaseConfig.projectId, 'gen-lang-client-0024648348');
  assert.equal(firebaseConfig.firestoreDatabaseId, 'ai-studio-bf321206-bfed-4f87-947f-b3aa40868ffd');
  assert.equal(firebaseConfig.authDomain, 'gen-lang-client-0024648348.firebaseapp.com');
  assert.equal(firebaseConfig.storageBucket, 'gen-lang-client-0024648348.firebasestorage.app');
  assert.equal(
    firebaseConfig.oAuthClientId,
    '894494849299-hle9jspcklpl49ar5jbbln1uc5nlu522.apps.googleusercontent.com'
  );
});

test('firestore.rules allows verified owners to update onboarding/profile fields while preserving RBAC locks', async () => {
  const fs = await import('node:fs');
  const rules = fs.readFileSync('firestore.rules', 'utf8');

  // Default deny safety net and verified write gate remain intact
  assert.ok(rules.includes('allow read, write: if false;'));
  assert.ok(rules.includes('function isVerified()'));
  assert.ok(rules.includes('request.auth.token.email_verified == true'));

  // Owner & Admin protections remain intact
  assert.ok(rules.includes('function isFounderOwner()'));
  assert.ok(rules.includes('function isPlatformOwner()'));
  assert.ok(rules.includes('!isTargetPlatformOwner(userId)'));

  // Users update branch allows all onboarding fields (avatar, cover, coverPositionY, username, bio, interests, onboardingCompleted)
  for (const field of [
    "'avatarUrl'",
    "'coverUrl'",
    "'coverPositionY'",
    "'username'",
    "'bio'",
    "'interests'",
    "'onboardingCompleted'",
    "'updatedAt'",
  ]) {
    assert.ok(rules.includes(field), `Expected ${field} in firestore.rules`);
  }

  // Avatar & cover inline payload caps exceed mediaUploadService compression caps
  assert.ok(rules.includes("isOptionalString(data, 'avatarUrl', 200000)"));
  assert.ok(rules.includes("isOptionalString(data, 'coverUrl', 400000)"));

  // Privilege escalation fields are NOT in the regular owner update allowlist
  const ownerUpdateMatch = rules.match(
    /isOwner\(userId\)\s*&& isNotSuspended\(\)[\s\S]*?affectedKeys\(\)\.hasOnly\(\[([\s\S]*?)\]\)/
  );
  assert.ok(ownerUpdateMatch, 'Owner update affectedKeys().hasOnly block must exist');
  const allowlisted = ownerUpdateMatch[1];
  assert.equal(allowlisted.includes("'verified'"), false);
  assert.equal(allowlisted.includes("'suspended'"), false);
  assert.equal(allowlisted.includes("'followersCount'"), false);
  assert.equal(allowlisted.includes("'likesCount'"), false);

  // Username claim creation & owner-only cleanup rules exist
  assert.ok(rules.includes('match /usernames/{username}'));
  assert.ok(rules.includes('allow delete: if isValidId(username) && isVerified() && existing().uid == request.auth.uid;'));
});

test('error reporting shields raw technical details from users while capturing redacted diagnostics for admins', async () => {
  const { formatStorageErrorMessage } = await import('../src/services/firebase/errorHandler');

  const firestoreErr = extractReadableErrorMessage(
    new Error(
      JSON.stringify({
        error: '7 PERMISSION_DENIED: Missing or insufficient permissions.',
        operationType: 'update',
        path: 'users/test_uid_123',
        authInfo: { userId: 'test_uid_123', emailVerified: true },
      })
    ),
    'Fallback',
    { recordDiagnostic: false }
  );
  assert.equal(firestoreErr, 'You are not authorised to perform this action.');
  assert.equal(firestoreErr.includes('users/test_uid_123'), false);

  const storageUnauth = extractReadableErrorMessage(
    new Error(
      formatStorageErrorMessage(
        { code: 'storage/unauthorized', message: 'User does not have permission' },
        'users/test_uid_123/cover/banner.jpg'
      )
    ),
    'Fallback',
    { recordDiagnostic: false }
  );
  assert.equal(storageUnauth, "We couldn't upload your file. Please try again.");
  assert.equal(storageUnauth.includes('storage/unauthorized'), false);
  assert.equal(storageUnauth.includes('users/test_uid_123/cover/banner.jpg'), false);

  assert.equal(
    extractReadableErrorMessage({ mediaKind: 'image_upload_failed' }, 'Fallback', { recordDiagnostic: false }),
    "We couldn't upload your image. Please try again."
  );

  const storageBucket = extractReadableErrorMessage(
    { code: 'storage/bucket-not-found', message: '404 Not Found' },
    'Fallback',
    { recordDiagnostic: false }
  );
  assert.equal(storageBucket, "We couldn't upload your file. Please try again.");

  assert.equal(
    extractReadableErrorMessage({ mediaKind: 'video_too_large' }, 'Fallback', { recordDiagnostic: false }),
    'Your video is too large. Please upload a smaller video.'
  );
  assert.equal(
    extractReadableErrorMessage({ mediaKind: 'unsupported_video' }, 'Fallback', { recordDiagnostic: false }),
    'This video format is not supported.'
  );
  assert.equal(
    extractReadableErrorMessage({ mediaKind: 'video_upload_failed' }, 'Fallback', { recordDiagnostic: false }),
    "Your video couldn't be uploaded. Please try again."
  );

  // Redaction strips Bearer tokens, JWTs, API keys, passwords, and emails before storing diagnostics
  const redacted = redactSensitiveDiagnosticText(
    'Authorization: Bearer secret_tok_999 token=abc123 AIzaSyDExampleKey1234567890 user=alice@example.com eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.sig'
  );
  assert.equal(redacted.includes('secret_tok_999'), false);
  assert.equal(redacted.includes('AIzaSyDExampleKey1234567890'), false);
  assert.equal(redacted.includes('alice@example.com'), false);
  assert.equal(redacted.includes('eyJhbGciOiJIUzI1NiJ9'), false);
  assert.ok(redacted.includes('[REDACTED]'));
  assert.ok(redacted.includes('[REDACTED_EMAIL]'));

  const adminDiag = extractAdminDiagnosticMessage({
    code: 'storage/unauthorized',
    message: '403 from owner@nexora.social with Bearer supersecret123',
  });
  assert.equal(adminDiag.category, 'upload');
  assert.equal(adminDiag.errorCode, 'storage/unauthorized');
  assert.equal(adminDiag.diagnosticMessage.includes('supersecret123'), false);
  assert.equal(adminDiag.diagnosticMessage.includes('owner@nexora.social'), false);
});

test('firebase.json targets the exact named Firestore database and storage.rules isolates user media writes', async () => {
  const fs = await import('node:fs');
  const fbJson = JSON.parse(fs.readFileSync('firebase.json', 'utf8'));
  assert.equal(fbJson.firestore.database, firebaseConfig.firestoreDatabaseId);
  assert.equal(fbJson.firestore.rules, 'firestore.rules');
  assert.equal(fbJson.storage.rules, 'storage.rules');

  const storageRules = fs.readFileSync('storage.rules', 'utf8');
  assert.ok(storageRules.includes('allow read, write: if false;'));
  assert.ok(storageRules.includes('match /users/{userId}/{allMedia=**}'));
  assert.ok(storageRules.includes('allow write: if isSignedInVerified() && request.auth.uid == userId && isAllowedMedia();'));
});

test('5-step onboarding payload (avatar, username, bio, interests, cover, coverPositionY, onboardingCompleted) matches firestore.rules caps and allowlist', async () => {
  const fs = await import('node:fs');
  const rules = fs.readFileSync('firestore.rules', 'utf8');
  const ownerUpdateMatch = rules.match(
    /isOwner\(userId\)\s*&& isNotSuspended\(\)[\s\S]*?affectedKeys\(\)\.hasOnly\(\[([\s\S]*?)\]\)/
  );
  assert.ok(ownerUpdateMatch);
  const allowlistedFields = new Set(
    [...ownerUpdateMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
  );

  // Simulated 5-step onboarding update keys from OnboardingFlow -> updateUserProfileFields
  const avatarLimits = resolveInlineCompressionLimits('users/uid_test/avatar');
  const coverLimits = resolveInlineCompressionLimits('users/uid_test/cover');
  const step5Payload = {
    avatarUrl: 'data:image/jpeg;base64,' + 'A'.repeat(avatarLimits.maxBytes - 30),
    username: normalizeUsername('Test_User_01'),
    bio: sanitizeString('Creator building on Nexora.', 400),
    interests: ['Spatial Design', 'Software Craft'],
    coverUrl: 'data:image/jpeg;base64,' + 'B'.repeat(coverLimits.maxBytes - 30),
    coverPositionY: 42,
    onboardingCompleted: true,
    updatedAt: 'serverTimestamp()',
  };

  for (const key of Object.keys(step5Payload)) {
    assert.ok(allowlistedFields.has(key), `Key ${key} must be in owner affectedKeys() allowlist`);
  }
  assert.ok(step5Payload.avatarUrl.length <= 200_000);
  assert.ok(step5Payload.coverUrl.length <= 400_000);
  assert.ok(isValidUsername(step5Payload.username));
  assert.ok(step5Payload.coverPositionY >= 0 && step5Payload.coverPositionY <= 100);
});

test('firestore.rules enforces secure follow/unfollow edges, blocks self-follow, and guards followersCount atomically', async () => {
  const fs = await import('node:fs');
  const rules = fs.readFileSync('firestore.rules', 'utf8');

  // Followers subcollection rules
  const followersBlock = rules.match(/match \/followers\/\{followerId\}\s*\{([\s\S]*?)\}/);
  assert.ok(followersBlock, 'followers/{followerId} match block must exist');
  const fRule = followersBlock[1];
  assert.ok(fRule.includes('userId != followerId'), 'Must block self-following on followers subcollection');
  assert.ok(fRule.includes('isVerified()'), 'Must require verified auth on followers subcollection');
  assert.ok(fRule.includes('isOwner(followerId)'), 'Follower edge must match authenticated follower UID');
  assert.ok(fRule.includes('incoming().uid == followerId'), 'Follower payload uid must match followerId');
  assert.ok(fRule.includes('allow update: if false;'), 'Follower edge updates must be blocked');
  assert.ok(
    fRule.includes('existsAfter(/databases/$(database)/documents/users/$(followerId)/following/$(userId))'),
    'Follower create/delete must remain atomic with following edge'
  );

  // Following subcollection rules
  const followingBlock = rules.match(/match \/following\/\{targetId\}\s*\{([\s\S]*?)\}/);
  assert.ok(followingBlock, 'following/{targetId} match block must exist');
  const fgRule = followingBlock[1];
  assert.ok(fgRule.includes('userId != targetId'), 'Must block self-following on following subcollection');
  assert.ok(fgRule.includes('isVerified()'), 'Must require verified auth on following subcollection');
  assert.ok(fgRule.includes('isOwner(userId)'), 'Following edge must belong to authenticated owner');
  assert.ok(fgRule.includes('incoming().uid == targetId'), 'Following payload uid must match targetId');
  assert.ok(fgRule.includes('allow update: if false;'), 'Following edge updates must be blocked');
  assert.ok(
    fgRule.includes('existsAfter(/databases/$(database)/documents/users/$(targetId)/followers/$(userId))'),
    'Following create/delete must remain atomic with follower edge'
  );

  // Target followersCount updates require atomic follower edge transition (+1 / -1 only)
  assert.ok(rules.includes("affectedKeys().hasOnly(['followersCount', 'updatedAt'])"));
  assert.ok(rules.includes('incoming().followersCount == existing().followersCount + 1'));
  assert.ok(rules.includes('incoming().followersCount == existing().followersCount - 1'));
});

test('setFollowRelationship rejects self-follow and missing users cleanly', async () => {
  const { setFollowRelationship, toggleFollowUser } = await import('../src/services/firebase/socialService');
  const baseUser = {
    uid: 'user_alpha_1',
    displayName: 'Alpha User',
    username: 'alpha_user',
    verified: false,
    onboardingCompleted: true,
    followersCount: 0,
    followingCount: 0,
    postsCount: 0,
    likesCount: 0,
    isOnline: true,
  } as unknown as import('../src/types/nexora').UserProfile;

  await assert.rejects(
    () => setFollowRelationship(baseUser, baseUser, true),
    /cannot follow your own account/i
  );
  await assert.rejects(
    () => toggleFollowUser(baseUser, baseUser, false),
    /cannot follow your own account/i
  );
});

test('firestore.rules enforces participant-only conversation privacy while allowing deterministic dm_ get checks', async () => {
  const fs = await import('node:fs');
  const rules = fs.readFileSync('firestore.rules', 'utf8');

  const convMatch = rules.match(/match \/conversations\/\{convId\}\s*\{([\s\S]*?)\n\s{4}\}/);
  assert.ok(convMatch, 'conversations/{convId} rule block must exist');
  const convBlock = convMatch[1];

  // Must support uncreated dm_ lookup without breaking existing() null guard
  assert.ok(convBlock.includes("resource == null && convId.matches('^dm_.*')"));
  assert.ok(convBlock.includes('resource != null && request.auth.uid in existing().participantIds'));
  assert.ok(convBlock.includes('allow list: if isSignedIn() && request.auth.uid in existing().participantIds;'));

  // Must block self-DM on creation and lock participantIds on message updates
  assert.ok(convBlock.includes('incoming().participantIds[0] != incoming().participantIds[1]'));
  assert.ok(convBlock.includes('incoming().participantIds == existing().participantIds'));
  assert.ok(
    convBlock.includes("affectedKeys().hasOnly(['lastMessageText', 'lastMessageSenderId', 'lastMessageAt', 'updatedAt', 'readBy', 'typingBy'])")
  );

  // Nested messages subcollection must verify caller is a participant of parent conversation
  assert.ok(
    convBlock.includes('request.auth.uid in get(/databases/$(database)/documents/conversations/$(convId)).data.participantIds')
  );

  // Virtual gifts remain strictly free
  const giftCatalogMatch = rules.match(/match \/gift_catalog\/\{giftId\}\s*\{([\s\S]*?)\}/);
  assert.ok(giftCatalogMatch);
  assert.ok(giftCatalogMatch[1].includes("incoming().tier == 'free'"));

  const giftTxMatch = rules.match(/match \/virtual_gifts\/\{giftTxId\}\s*\{([\s\S]*?)\}/);
  assert.ok(giftTxMatch);
  assert.ok(giftTxMatch[1].includes('incoming().senderUid == request.auth.uid'));
  assert.ok(giftTxMatch[1].includes('incoming().senderUid != incoming().recipientUid'));
});

test('isUserOnlineNow respects active freshness window and createOrGetDirectConversation rejects self-DM & blocked users', async () => {
  const { isUserOnlineNow, createOrGetDirectConversation } = await import(
    '../src/services/firebase/socialService'
  );

  const nowMs = Date.now();
  const makeUser = (uid: string, isOnline: boolean, ageMs: number) =>
    ({
      uid,
      displayName: `User ${uid}`,
      username: `user_${uid}`,
      bio: '',
      avatarUrl: '',
      coverUrl: '',
      coverPositionY: 50,
      website: '',
      location: '',
      interests: [],
      verified: false,
      onboardingCompleted: true,
      followersCount: 0,
      followingCount: 0,
      postsCount: 0,
      likesCount: 0,
      isOnline,
      lastActiveAt: { toMillis: () => nowMs - ageMs },
    }) as unknown as import('../src/types/nexora').UserProfile;

  assert.equal(isUserOnlineNow(makeUser('u1', true, 60_000)), true);
  assert.equal(isUserOnlineNow(makeUser('u1', true, 12 * 60_000)), false);
  assert.equal(isUserOnlineNow(makeUser('u1', false, 10_000)), false);
  assert.equal(isUserOnlineNow(null), false);

  const uA = makeUser('alice_1', true, 5000);
  const uB = makeUser('bob_2', true, 5000);
  await assert.rejects(
    () => createOrGetDirectConversation(uA, uA),
    /cannot start a direct conversation with your own account/i
  );
  await assert.rejects(
    () => createOrGetDirectConversation(uA, uB, ['bob_2']),
    /unblock this user/i
  );
});

test('rankTrendingPosts prioritizes engagement score across likes, comments, reposts, and free gifts', () => {
  const mkPost = (id: string, likesCount: number, commentsCount: number, repostsCount: number, giftsCount: number, ms: number) =>
    ({
      id,
      likesCount,
      commentsCount,
      repostsCount,
      giftsCount,
      savesCount: 0,
      createdAt: { toMillis: () => ms },
    }) as unknown as import('../src/types/nexora').Post;

  const pLow = mkPost('low', 5, 0, 0, 0, 3000);
  const pMid = mkPost('mid', 4, 2, 1, 0, 2000); // score: 4 + 4 + 2 = 10
  const pTop = mkPost('top', 2, 2, 1, 3, 1000); // score: 2 + 4 + 2 + 9 = 17

  const ranked = rankTrendingPosts([pLow, pMid, pTop]);
  assert.deepEqual(
    ranked.map((p) => p.id),
    ['top', 'mid', 'low']
  );
  assert.equal(computePostEngagementScore(pTop), 17);
});

test('Discord-inspired admin presence engine handles multi-device sessions, manual DND/Invisible, and auto-idle', () => {
  const now = 1_700_000_000_000;
  const freshDesktop = {
    sessionId: 'sess_desktop',
    status: 'online' as const,
    lastSeenMs: now - 30_000,
    deviceType: 'web' as const,
  };
  const idleMobile = {
    sessionId: 'sess_mobile',
    status: 'idle' as const,
    lastSeenMs: now - 45_000,
    deviceType: 'mobile' as const,
  };
  const staleLaptop = {
    sessionId: 'sess_stale',
    status: 'online' as const,
    lastSeenMs: now - (SESSION_STALE_MS + 10_000),
    deviceType: 'web' as const,
  };

  const pruned = pruneStaleSessions(
    { sess_desktop: freshDesktop, sess_mobile: idleMobile, sess_stale: staleLaptop },
    now
  );
  assert.deepEqual(Object.keys(pruned).sort(), ['sess_desktop', 'sess_mobile']);

  // Auto mode with at least one active online device => online
  assert.equal(
    computeEffectivePublicStatus({ manualMode: 'auto', sessions: pruned, nowMs: now }),
    'online'
  );
  // Auto mode when remaining sessions are idle => idle
  assert.equal(
    computeEffectivePublicStatus({ manualMode: 'auto', sessions: { sess_mobile: idleMobile }, nowMs: now }),
    'idle'
  );
  // Manual DND remains dnd while active, drops to offline when no active sessions
  assert.equal(
    computeEffectivePublicStatus({ manualMode: 'dnd', sessions: pruned, nowMs: now }),
    'dnd'
  );
  assert.equal(
    computeEffectivePublicStatus({ manualMode: 'dnd', sessions: { sess_stale: staleLaptop }, nowMs: now }),
    'offline'
  );
  // Invisible appears strictly offline publicly while self-status displays invisible
  assert.equal(
    computeEffectivePublicStatus({ manualMode: 'invisible', sessions: pruned, nowMs: now }),
    'offline'
  );
  assert.equal(
    computeSelfAdminStatus({ manualMode: 'invisible', sessions: pruned, nowMs: now }),
    'invisible'
  );
});

test('firestore.rules enforces staff-only presence controls and admin-only error diagnostics access', async () => {
  const fs = await import('node:fs');
  const rules = fs.readFileSync('firestore.rules', 'utf8');

  const publicPresence = rules.match(/match \/admin_presence\/\{userId\}\s*\{([\s\S]*?)\n\s{4}\}/);
  assert.ok(publicPresence, 'admin_presence rule block must exist');
  assert.ok(publicPresence[1].includes('(isPlatformOwner() || isActiveStaff())'));
  assert.ok(rules.includes("data.status in ['online', 'idle', 'dnd', 'offline']"));

  const privatePresence = rules.match(/match \/admin_presence_private\/\{userId\}\s*\{([\s\S]*?)\n\s{4}\}/);
  assert.ok(privatePresence, 'admin_presence_private rule block must exist');
  assert.ok(privatePresence[1].includes('allow list: if false;'));
  assert.ok(privatePresence[1].includes("hasPerm('manage_admins')"));

  const diagMatch = rules.match(/match \/error_diagnostics\/\{diagId\}\s*\{([\s\S]*?)\n\s{4}\}/);
  assert.ok(diagMatch, 'error_diagnostics rule block must exist');
  assert.ok(diagMatch[1].includes("hasPerm('view_audit_logs')"));
  assert.ok(diagMatch[1].includes('incoming().resolved == false'));
  assert.ok(diagMatch[1].includes('allow delete: if false;'));
});

test('Android TWA manifest targets API Level 35 and PWA + Asset Links assets exist', async () => {
  const fs = await import('node:fs');

  const twa = JSON.parse(fs.readFileSync('android/twa-manifest.json', 'utf8'));
  assert.equal(twa.packageId, 'social.nexora.app');
  assert.equal(twa.targetSdkVersion, 35);
  assert.equal(twa.compileSdkVersion, 35);
  assert.ok(twa.minSdkVersion >= 24);
  assert.equal(twa.display, 'standalone');

  const assetLinks = JSON.parse(fs.readFileSync('public/.well-known/assetlinks.json', 'utf8'));
  assert.ok(Array.isArray(assetLinks) && assetLinks.length >= 1);
  assert.equal(assetLinks[0].target.package_name, 'social.nexora.app');

  for (const icon of [
    'public/pwa-192x192.png',
    'public/pwa-512x512.png',
    'public/pwa-maskable-512x512.png',
    'public/apple-touch-icon.png',
  ]) {
    assert.ok(fs.existsSync(icon), `Missing required PWA icon asset: ${icon}`);
  }
});

test('getAndroidReleaseStatus reports unavailable until real signed APK or valid HTTPS URL exists', async () => {
  const prevUrl = process.env.ANDROID_APK_DOWNLOAD_URL;
  const prevFp = process.env.ANDROID_SHA256_FINGERPRINTS;
  delete process.env.ANDROID_APK_DOWNLOAD_URL;
  delete process.env.ANDROID_SHA256_FINGERPRINTS;

  try {
    // Current repo has zero fake/empty APKs
    const currentStatus = getAndroidReleaseStatus();
    assert.equal(currentStatus.available, false);
    assert.equal(currentStatus.source, 'none');
    assert.equal(currentStatus.downloadUrl, null);
    assert.equal(currentStatus.packageId, 'social.nexora.app');
    assert.equal(currentStatus.targetSdk, 35);
    assert.equal(currentStatus.assetLinksConfigured, false);

    // Reject insecure or local URLs
    process.env.ANDROID_APK_DOWNLOAD_URL = 'http://localhost:3000/fake.apk';
    assert.equal(getAndroidReleaseStatus().available, false);

    process.env.ANDROID_APK_DOWNLOAD_URL = 'javascript:alert(1)';
    assert.equal(getAndroidReleaseStatus().available, false);

    // Accept verified HTTPS release URL
    process.env.ANDROID_APK_DOWNLOAD_URL =
      'https://github.com/example/nexora/releases/download/android-v1.0.0-b1/nexora-v1.0.0-release.apk';
    process.env.ANDROID_SHA256_FINGERPRINTS =
      'AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89';
    const readyStatus = getAndroidReleaseStatus();
    assert.equal(readyStatus.available, true);
    assert.equal(readyStatus.source, 'external_https');
    assert.equal(readyStatus.assetLinksConfigured, true);
    assert.ok(readyStatus.downloadUrl?.startsWith('https://'));
  } finally {
    if (prevUrl !== undefined) process.env.ANDROID_APK_DOWNLOAD_URL = prevUrl;
    else delete process.env.ANDROID_APK_DOWNLOAD_URL;
    if (prevFp !== undefined) process.env.ANDROID_SHA256_FINGERPRINTS = prevFp;
    else delete process.env.ANDROID_SHA256_FINGERPRINTS;
  }
});

test('Android signing credentials are ignored in Git and cloud workflow rejects missing secrets', async () => {
  const fs = await import('node:fs');
  const gitignore = fs.readFileSync('.gitignore', 'utf8');
  for (const pattern of ['*.keystore', '*.jks', 'android/nexora-release.keystore', '.bubblewrap/']) {
    assert.ok(gitignore.includes(pattern), `Expected ${pattern} in .gitignore`);
  }

  const workflow = fs.readFileSync('.github/workflows/android-twa-release.yml', 'utf8');
  assert.ok(workflow.includes('NEXORA_ANDROID_KEYSTORE_BASE64'));
  assert.ok(workflow.includes('NEXORA_ANDROID_KEYSTORE_PASS'));
  assert.ok(workflow.includes('NEXORA_ANDROID_KEY_ALIAS'));
  assert.ok(workflow.includes('NEXORA_ANDROID_KEY_PASS'));
  assert.ok(workflow.includes('android-actions/setup-android@v4'));
  assert.equal(workflow.includes('android-actions/setup-android@v3'), false);
  assert.ok(workflow.includes('cmdline-tools;latest'));
  assert.ok(workflow.includes('platform-tools'));
  assert.ok(workflow.includes('platforms;android-35'));
  assert.ok(workflow.includes('build-tools;35.0.0'));
  assert.equal(/\b"tools"\b|'\btools\b'/.test(workflow), false);
  assert.ok(workflow.includes('.bubblewrap'));
  assert.equal(workflow.includes('nexora-temp-pass'), false);
  assert.equal(workflow.includes('base64 --decode'), false);
  assert.ok(workflow.includes('keytool -list -v -keystore android/nexora-release.keystore'));

  const landing = fs.readFileSync('src/pages/landing/LandingPage.tsx', 'utf8');
  assert.ok(landing.includes('/api/app/android-release'));
  assert.ok(landing.includes('Get the Nexora App'));
  assert.ok(landing.includes('Sign In'));
  assert.ok(landing.includes('Get Started'));
  assert.ok(landing.includes('PWAInstallButton'));
});

test('workflow keystore decoder handles standard Base64/Base64URL while rejecting truncated or corrupted keystores', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const { spawnSync } = await import('node:child_process');

  const workflow = fs.readFileSync('.github/workflows/android-twa-release.yml', 'utf8');
  const match = workflow.match(/node - << 'EOF'\n([\s\S]*?)\n\s+EOF/);
  assert.ok(match, 'Workflow must include Node.js keystore decoder heredoc');
  const decoderScript = match[1];

  const runDecoder = (b64Value: string) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexora-ks-test-'));
    try {
      const result = spawnSync(process.execPath, ['-e', decoderScript], {
        cwd: tmpDir,
        env: { ...process.env, KEYSTORE_B64: b64Value },
        encoding: 'utf8',
      });
      const outPath = path.join(tmpDir, 'android', 'nexora-release.keystore');
      const written = fs.existsSync(outPath) ? fs.readFileSync(outPath) : null;
      return { status: result.status, stdout: result.stdout, stderr: result.stderr, written };
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  };

  // 1. Standard Base64 PKCS12 keystore (>= 512 bytes) succeeds
  const pkcs12Buf = Buffer.alloc(1024, 0xab);
  pkcs12Buf[0] = 0x30;
  pkcs12Buf[1] = 0x82;
  const stdRes = runDecoder(pkcs12Buf.toString('base64'));
  assert.equal(stdRes.status, 0);
  assert.ok(stdRes.written && stdRes.written.equals(pkcs12Buf));
  assert.ok(stdRes.stdout.includes('Decoded PKCS12 keystore'));

  // 2. Base64URL without '=' padding + line wraps/spaces/quotes + JKS header succeeds
  const jksBuf = Buffer.alloc(1024);
  jksBuf[0] = 0xfe;
  jksBuf[1] = 0xed;
  jksBuf[2] = 0xfe;
  jksBuf[3] = 0xed;
  for (let i = 4; i < jksBuf.length; i++) {
    jksBuf[i] = (i * 31 + 7) & 0xff;
  }
  const base64UrlUnpadded = jksBuf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  const wrappedB64Url = `"${base64UrlUnpadded.slice(0, 80)}\n  ${base64UrlUnpadded.slice(80, 160)}\r\t${base64UrlUnpadded.slice(160)}"`;
  const urlRes = runDecoder(wrappedB64Url);
  assert.equal(urlRes.status, 0);
  assert.ok(urlRes.written && urlRes.written.equals(jksBuf));
  assert.ok(urlRes.stdout.includes('normalized from Base64URL'));

  // 3. Truncated Base64 (unpadded length % 4 === 1) must fail and never leak secret content
  const truncated = pkcs12Buf.toString('base64').replace(/=+$/, '').slice(0, 601); // 601 % 4 === 1
  const truncRes = runDecoder(truncated);
  assert.notEqual(truncRes.status, 0);
  assert.equal(truncRes.written, null);
  assert.ok(truncRes.stderr.includes('appears truncated'));
  assert.equal(truncRes.stderr.includes(truncated.slice(0, 20)), false);

  // 4. Corrupted non-Base64 text must fail and never leak secret content
  const corrupt = 'NOT_VALID_SECRET_$$$###@@@';
  const corruptRes = runDecoder(corrupt);
  assert.notEqual(corruptRes.status, 0);
  assert.equal(corruptRes.written, null);
  assert.equal(corruptRes.stderr.includes('NOT_VALID_SECRET'), false);

  // 5. Valid Base64 of too-small payload (< 512 bytes) must fail
  const tiny = Buffer.from('0x3082tiny', 'utf8').toString('base64');
  const tinyRes = runDecoder(tiny);
  assert.notEqual(tinyRes.status, 0);
  assert.equal(tinyRes.written, null);

  // 6. Valid Base64 (>= 512 bytes) lacking JKS or PKCS12 magic header must fail
  const bogus = Buffer.alloc(1024, 0x41).toString('base64');
  const bogusRes = runDecoder(bogus);
  assert.notEqual(bogusRes.status, 0);
  assert.equal(bogusRes.written, null);
  assert.ok(bogusRes.stderr.includes('lacks a valid JKS or PKCS12 keystore header'));
});





