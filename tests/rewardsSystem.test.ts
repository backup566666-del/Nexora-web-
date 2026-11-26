import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  DEFAULT_MIN_WITHDRAWAL_NAIRA,
  DEFAULT_REWARDS_CONFIG,
  STARTER_FREE_TASKS,
  calculateReferralMilestonesToAward,
  canTransitionWithdrawalStatus,
  computeConvertedNaira,
  evaluateReferralFraudSignals,
  evaluateStarterTaskReadiness,
  formatNaira,
  generateInviteCode,
  maskBankAccountNumber,
  normalizeThemeMode,
  resolveEffectiveTheme,
  sanitizeInviteCode,
  validateWithdrawalEligibility,
} from '../src/utils/validation';
import {
  FALLBACK_NIGERIAN_BANKS,
  fetchNigerianBanks,
  getBankProviderStatus,
  resolveNigerianBankAccount,
} from '../server/rewardsService';

test('1. Global theme mode normalizes and resolves dark, light, and system defaults cleanly', () => {
  assert.equal(normalizeThemeMode('dark'), 'dark');
  assert.equal(normalizeThemeMode('light'), 'light');
  assert.equal(normalizeThemeMode('system'), 'system');
  assert.equal(normalizeThemeMode('unexpected'), 'dark');
  assert.equal(normalizeThemeMode(null), 'dark');

  assert.equal(resolveEffectiveTheme('dark', false), 'dark');
  assert.equal(resolveEffectiveTheme('light', true), 'light');
  assert.equal(resolveEffectiveTheme('system', true), 'dark');
  assert.equal(resolveEffectiveTheme('system', false), 'light');
});

test('2. Invitation code sanitization, generation, and 10-referral milestone math are exact and idempotent', () => {
  assert.equal(sanitizeInviteCode(' nx-hello_01!@# '), 'NX-HELLO_01');
  assert.ok(sanitizeInviteCode('a'.repeat(40)).length <= 24);

  const generated = generateInviteCode('elena_vance');
  assert.ok(generated.startsWith('NX-ELENA-'));
  assert.ok(generated.length <= 20);

  // 0..9 qualified referrals -> 0 Key Points
  const nine = calculateReferralMilestonesToAward(9, 0);
  assert.equal(nine.totalEarnedMilestones, 0);
  assert.equal(nine.newMilestonesToCredit, 0);
  assert.equal(nine.progressInCurrentBatch, 9);
  assert.equal(nine.nextMilestoneAt, 10);

  // 10 qualified referrals -> 1 Key Point
  const ten = calculateReferralMilestonesToAward(10, 0);
  assert.equal(ten.totalEarnedMilestones, 1);
  assert.equal(ten.newMilestonesToCredit, 1);
  assert.equal(ten.progressInCurrentBatch, 0);
  assert.equal(ten.nextMilestoneAt, 20);

  // Re-running with alreadyAwardedMilestones = 1 -> 0 extra points (idempotent)
  const tenRepeated = calculateReferralMilestonesToAward(10, 1);
  assert.equal(tenRepeated.newMilestonesToCredit, 0);

  // 25 qualified referrals with 1 already paid -> credits 1 milestone (2 - 1)
  const twentyFive = calculateReferralMilestonesToAward(25, 1);
  assert.equal(twentyFive.totalEarnedMilestones, 2);
  assert.equal(twentyFive.newMilestonesToCredit, 1);
  assert.equal(twentyFive.progressInCurrentBatch, 5);
  assert.equal(twentyFive.nextMilestoneAt, 30);
});

test('3. Referral anti-fraud screening blocks self-referrals, duplicate emails, alias farming, and device reuse', () => {
  const selfAttempt = evaluateReferralFraudSignals({
    inviteeUid: 'uid_same',
    inviterUid: 'uid_same',
    inviteeVerified: true,
  });
  assert.equal(selfAttempt.allowed, false);
  assert.equal(selfAttempt.fraudScore, 100);
  assert.ok(selfAttempt.signals.includes('self_referral_attempt'));

  const identicalEmail = evaluateReferralFraudSignals({
    inviteeUid: 'uid_a',
    inviterUid: 'uid_b',
    inviteeEmail: 'User@Example.com',
    inviterEmail: 'user@example.com',
    inviteeVerified: true,
  });
  assert.equal(identicalEmail.allowed, false);
  assert.ok(identicalEmail.signals.includes('identical_email'));

  const aliasAndDevice = evaluateReferralFraudSignals({
    inviteeUid: 'uid_a',
    inviterUid: 'uid_b',
    inviteeEmail: 'founder.test+alt1@gmail.com',
    inviterEmail: 'foundertest@gmail.com',
    inviteeVerified: true,
    existingSameDeviceClaimsCount: 2,
  });
  assert.equal(aliasAndDevice.allowed, false);
  assert.ok(aliasAndDevice.signals.includes('email_alias_similarity'));
  assert.ok(aliasAndDevice.signals.includes('repeated_device_fingerprint'));

  const legitimate = evaluateReferralFraudSignals({
    inviteeUid: 'uid_new',
    inviterUid: 'uid_inviter',
    inviteeEmail: 'newcreator@outlook.com',
    inviterEmail: 'inviter@gmail.com',
    inviteeVerified: true,
    existingSameDeviceClaimsCount: 0,
    recentInviterClaimsCount24h: 2,
  });
  assert.equal(legitimate.allowed, true);
  assert.equal(legitimate.fraudScore, 0);
});

test('4. Wallet Naira conversion leaves pointRateNaira unset by default and enforces ₦2,000 minimum & lock rules', () => {
  assert.equal(DEFAULT_REWARDS_CONFIG.pointRateNaira, null);
  assert.equal(DEFAULT_REWARDS_CONFIG.minWithdrawalNaira, DEFAULT_MIN_WITHDRAWAL_NAIRA);
  assert.equal(DEFAULT_MIN_WITHDRAWAL_NAIRA, 2000);

  // Never invent a rate when unconfigured
  assert.equal(computeConvertedNaira(10, null), null);
  assert.equal(formatNaira(null), 'Rate pending');

  // Configured rate calculation
  assert.equal(computeConvertedNaira(4, 500), 2000);
  assert.equal(formatNaira(2500), '₦2,500');

  // Unconfigured rate blocks withdrawal
  const noRate = validateWithdrawalEligibility({
    pointsRequested: 5,
    availablePoints: 10,
    config: DEFAULT_REWARDS_CONFIG,
  });
  assert.equal(noRate.ok, false);
  assert.match(noRate.error || '', /conversion rate/i);

  // Admin lock blocks withdrawal
  const locked = validateWithdrawalEligibility({
    pointsRequested: 5,
    availablePoints: 10,
    config: {
      withdrawalsOpen: false,
      pointRateNaira: 1000,
      minWithdrawalNaira: 2000,
      lockReason: 'Scheduled bank reconciliation window',
    },
  });
  assert.equal(locked.ok, false);
  assert.match(locked.error || '', /reconciliation/i);

  // Below ₦2,000 minimum blocks withdrawal
  const belowMin = validateWithdrawalEligibility({
    pointsRequested: 1,
    availablePoints: 10,
    config: {
      withdrawalsOpen: true,
      pointRateNaira: 1000,
      minWithdrawalNaira: 2000,
    },
  });
  assert.equal(belowMin.ok, false);
  assert.match(belowMin.error || '', /2,000/);

  // Insufficient balance blocks withdrawal
  const tooLowBalance = validateWithdrawalEligibility({
    pointsRequested: 10,
    availablePoints: 4,
    config: {
      withdrawalsOpen: true,
      pointRateNaira: 1000,
      minWithdrawalNaira: 2000,
    },
  });
  assert.equal(tooLowBalance.ok, false);
  assert.match(tooLowBalance.error || '', /Insufficient/i);

  // Valid request passes cleanly
  const valid = validateWithdrawalEligibility({
    pointsRequested: 3,
    availablePoints: 5,
    config: {
      withdrawalsOpen: true,
      pointRateNaira: 1000,
      minWithdrawalNaira: 2000,
    },
  });
  assert.equal(valid.ok, true);
  assert.equal(valid.nairaAmount, 3000);
});

test('5. Withdrawal workflow transitions and NUBAN account masking enforce strict state integrity', () => {
  assert.equal(maskBankAccountNumber('0123456789'), '******6789');
  assert.equal(maskBankAccountNumber('12'), '******');

  assert.equal(canTransitionWithdrawalStatus('pending', 'under_review'), true);
  assert.equal(canTransitionWithdrawalStatus('pending', 'approved'), true);
  assert.equal(canTransitionWithdrawalStatus('pending', 'rejected'), true);
  assert.equal(canTransitionWithdrawalStatus('pending', 'paid'), false);
  assert.equal(canTransitionWithdrawalStatus('approved', 'processing'), true);
  assert.equal(canTransitionWithdrawalStatus('processing', 'paid'), true);
  assert.equal(canTransitionWithdrawalStatus('paid', 'rejected'), false);
  assert.equal(canTransitionWithdrawalStatus('rejected', 'approved'), false);
});

test('6. Nigerian bank directory & resolution report not_configured honestly when PAYSTACK/FLUTTERWAVE secrets are absent', async () => {
  const prevPaystack = process.env.PAYSTACK_SECRET_KEY;
  const prevFlw = process.env.FLUTTERWAVE_SECRET_KEY;
  delete process.env.PAYSTACK_SECRET_KEY;
  delete process.env.FLUTTERWAVE_SECRET_KEY;

  try {
    const status = getBankProviderStatus();
    assert.equal(status.configured, false);
    assert.equal(status.provider, 'none');

    const directory = await fetchNigerianBanks();
    assert.equal(directory.configured, false);
    assert.equal(directory.provider, 'none');
    assert.equal(directory.banks.length, FALLBACK_NIGERIAN_BANKS.length);
    assert.ok(directory.banks.some((b) => b.code === '058' && /GTBank/i.test(b.name)));

    const badDigits = await resolveNigerianBankAccount('12345', '058');
    assert.equal(badDigits.verified, false);
    assert.match(badDigits.message, /10-digit/i);

    const honestNotConfigured = await resolveNigerianBankAccount('0123456789', '058');
    assert.equal(honestNotConfigured.verified, false);
    assert.equal(honestNotConfigured.verificationStatus, 'not_configured');
    assert.equal(honestNotConfigured.provider, 'none');
    assert.equal(honestNotConfigured.accountName, undefined);
  } finally {
    if (prevPaystack !== undefined) process.env.PAYSTACK_SECRET_KEY = prevPaystack;
    if (prevFlw !== undefined) process.env.FLUTTERWAVE_SECRET_KEY = prevFlw;
  }
});

test('7. Firestore rules, Cloud Functions, Server APIs, and UI Navigation wire Rewards, Theme & PII isolation', () => {
  const rules = fs.readFileSync('firestore.rules', 'utf8');
  for (const collection of [
    'match /rewards_config/{configId}',
    'match /invitations/{code}',
    'match /referral_claims/{inviteeUid}',
    'match /referral_fraud_alerts/{alertId}',
    'match /tasks/{taskId}',
    'match /task_submissions/{submissionId}',
    'match /wallets/{userId}',
    'match /wallet_transactions/{txId}',
    'match /withdrawal_requests/{withdrawalId}',
    'match /withdrawal_private/{withdrawalId}',
  ]) {
    assert.ok(rules.includes(collection), `Expected ${collection} in firestore.rules`);
  }
  assert.ok(rules.includes('allow list: if false;'));
  assert.ok(rules.includes('incoming().freeToParticipate == true'));
  assert.ok(rules.includes('incoming().pointRateNaira == existing().pointRateNaira'));

  const fnSrc = fs.readFileSync('functions/src/index.ts', 'utf8');
  for (const fnName of [
    'claimReferral',
    'submitTaskEntry',
    'reviewTaskSubmission',
    'requestWithdrawal',
    'transitionWithdrawalStatus',
    'adminAdjustWallet',
  ]) {
    assert.ok(fnSrc.includes(`export const ${fnName}`), `Missing Cloud Function ${fnName}`);
  }

  const serverSrc = fs.readFileSync('server.ts', 'utf8');
  assert.ok(serverSrc.includes("app.get('/api/rewards/status'"));
  assert.ok(serverSrc.includes("app.get('/api/rewards/banks'"));
  assert.ok(serverSrc.includes("app.post('/api/rewards/resolve-bank'"));

  const appSrc = fs.readFileSync('src/App.tsx', 'utf8');
  assert.ok(appSrc.includes('<ThemeProvider>'));
  assert.ok(appSrc.includes("params.get('ref')"));
  assert.ok(appSrc.includes('<InvitePage />'));
  assert.ok(appSrc.includes('<TasksPage />'));
  assert.ok(appSrc.includes('<WalletPage />'));
  assert.ok(appSrc.includes('<RewardsHistoryPage />'));

  const settingsSrc = fs.readFileSync('src/pages/settings/SettingsPage.tsx', 'utf8');
  assert.ok(settingsSrc.includes('<RewardsAndPaymentsAdminPanel />'));
});

test('8. Starter free tasks, readiness checks, Profile tasks/invite UI, and mobile visibility are properly wired', () => {
  assert.equal(STARTER_FREE_TASKS.length, 5);
  for (const t of STARTER_FREE_TASKS) {
    assert.ok(t.id.startsWith('starter_'));
    assert.ok(t.rewardPoints === 1 || t.rewardPoints === 2);
    assert.equal(t.maxCompletionsPerUser, 1);
  }

  const incompleteProfile = evaluateStarterTaskReadiness('starter_complete_profile', {
    username: 'alex',
    hasBio: false,
    hasAvatar: true,
  });
  assert.equal(incompleteProfile.isStarter, true);
  assert.equal(incompleteProfile.readyToSubmit, false);
  assert.equal(incompleteProfile.actionType, 'edit_profile');

  const readyProfile = evaluateStarterTaskReadiness('starter_complete_profile', {
    username: 'alex',
    hasBio: true,
    hasAvatar: true,
  });
  assert.equal(readyProfile.readyToSubmit, true);
  assert.match(readyProfile.suggestedProof || '', /@alex/);

  const inviteReady = evaluateStarterTaskReadiness('starter_invite_member', {
    personalInviteCode: 'NEXALEX99',
    qualifiedReferrals: 4,
  });
  assert.equal(inviteReady.readyToSubmit, true);
  assert.match(inviteReady.suggestedProof || '', /NEXALEX99/);

  const rules = fs.readFileSync('firestore.rules', 'utf8');
  assert.ok(rules.includes('function isStarterTaskSeed(taskId, data)'));
  assert.ok(rules.includes('isStarterTaskSeed(taskId, incoming())'));

  const rewardsSvc = fs.readFileSync('src/services/firebase/rewardsService.ts', 'utf8');
  assert.ok(rewardsSvc.includes('export async function seedStarterTasksIfEmpty'));
  assert.ok(rewardsSvc.includes('export async function seedStarterTasksAdmin'));
  // Ensure ensurePersonalInvitationCode does not issue an unindexed dual where(ownerUid)+where(kind) query
  const invFnSlice = rewardsSvc.slice(
    rewardsSvc.indexOf('export async function ensurePersonalInvitationCode'),
    rewardsSvc.indexOf('export async function createAdminInvitationCode')
  );
  assert.ok(!invFnSlice.includes("where('kind'"));

  const profileSrc = fs.readFileSync('src/pages/profile/ProfilePage.tsx', 'utf8');
  assert.ok(profileSrc.includes('<ProfileTasksPanel'));
  assert.ok(profileSrc.includes("id: 'tasks', label: 'Tasks & Earn'"));

  const shellSrc = fs.readFileSync('src/components/navigation/DashboardShell.tsx', 'utf8');
  assert.ok(shellSrc.includes("onClick={() => onNavigate('tasks')}"));
  assert.ok(shellSrc.includes("onClick={() => onNavigate('invite')}"));
});

