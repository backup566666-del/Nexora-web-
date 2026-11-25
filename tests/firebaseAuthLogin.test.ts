import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import type { User } from 'firebase/auth';

test('isUserAccountVerified handles email, phone-only, and phone+pending-email accounts accurately', async () => {
  const { isUserAccountVerified } = await import('../src/services/auth/authService');

  assert.equal(isUserAccountVerified(null), false);
  assert.equal(isUserAccountVerified(undefined), false);

  // Verified email user
  assert.equal(
    isUserAccountVerified({
      emailVerified: true,
      email: 'verified@nexora.social',
      phoneNumber: null,
      providerData: [{ providerId: 'password' }],
    } as unknown as User),
    true
  );

  // Phone-only user
  assert.equal(
    isUserAccountVerified({
      emailVerified: false,
      email: null,
      phoneNumber: '+14155552671',
      providerData: [{ providerId: 'phone' }],
    } as unknown as User),
    true
  );

  // Phone-verified user with an attached unverified email must still remain verified
  assert.equal(
    isUserAccountVerified({
      emailVerified: false,
      email: 'pending-change@nexora.social',
      phoneNumber: '+14155552671',
      providerData: [{ providerId: 'phone' }, { providerId: 'password' }],
    } as unknown as User),
    true
  );

  // Unverified email/password account without verified phone
  assert.equal(
    isUserAccountVerified({
      emailVerified: false,
      email: 'unverified@nexora.social',
      phoneNumber: null,
      providerData: [{ providerId: 'password' }],
    } as unknown as User),
    false
  );
});

test('mapAuthErrorMessage and isPopupBlockedError cover all Firebase Auth failure modes without leaking raw codes', async () => {
  const { isPopupBlockedError, mapAuthErrorMessage } = await import('../src/services/auth/authService');

  assert.equal(isPopupBlockedError({ code: 'auth/popup-blocked' }), true);
  assert.equal(isPopupBlockedError({ code: 'auth/popup-closed-by-user' }), false);

  const expectedCases: [string, string][] = [
    ['auth/operation-not-allowed', 'not enabled yet'],
    ['auth/unauthorized-domain', 'authorized domains'],
    ['auth/popup-blocked', 'redirect sign-in'],
    ['auth/internal-error', 'third-party cookies'],
    ['auth/web-storage-unsupported', 'site storage'],
    ['auth/invalid-login-credentials', 'incorrect email or password'],
    ['auth/invalid-action-code', 'expired or already been used'],
    ['auth/expired-action-code', 'expired or already been used'],
    ['auth/app-not-authorized', 'configuration mismatch'],
  ];

  for (const [code, fragment] of expectedCases) {
    const msg = mapAuthErrorMessage({ code });
    assert.ok(
      msg.toLowerCase().includes(fragment),
      `Expected "${fragment}" inside mapped error for ${code}, got: ${msg}`
    );
    assert.equal(
      msg.includes('auth/'),
      false,
      `Mapped error for ${code} must not expose raw auth/ code: ${msg}`
    );
  }
});

test('Firebase login fixes are wired cleanly across presenceService, socialService, useAuth, AuthView, and server', () => {
  const presenceSrc = fs.readFileSync('src/services/firebase/presenceService.ts', 'utf8');
  assert.ok(
    presenceSrc.includes("where('status', 'in', ['online', 'idle', 'dnd', 'offline'])"),
    'subscribeAllAdminPresence must filter status to satisfy firestore.rules allow list'
  );
  assert.ok(
    presenceSrc.includes('isUserAccountVerified(auth.currentUser)'),
    'presenceService must accept phone-verified accounts via isUserAccountVerified'
  );

  const socialSrc = fs.readFileSync('src/services/firebase/socialService.ts', 'utf8');
  assert.equal(
    socialSrc.includes('users_private'),
    false,
    'socialService must not reference non-existent users_private collection'
  );
  assert.ok(
    socialSrc.includes("doc(db, 'users', currentUid, 'private', 'account')"),
    'socialService block/unblock must update users/{uid}/private/account'
  );

  const useAuthSrc = fs.readFileSync('src/hooks/useAuth.tsx', 'utf8');
  assert.ok(useAuthSrc.includes('completePendingRedirectSignIn'));
  assert.ok(useAuthSrc.includes('redirectAuthError'));

  const authViewSrc = fs.readFileSync('src/pages/auth/AuthView.tsx', 'utf8');
  const recaptchaDivMatches = authViewSrc.match(/id=\{PHONE_RECAPTCHA_CONTAINER_ID\}/g) || [];
  assert.equal(
    recaptchaDivMatches.length,
    1,
    'AuthView must mount exactly one persistent reCAPTCHA container in phone mode'
  );
  assert.ok(authViewSrc.includes('fetchServerAuthProviders'));
  assert.ok(authViewSrc.includes('signInWithOAuthRedirect'));
  assert.ok(authViewSrc.includes('visibilitychange'));

  const serverSrc = fs.readFileSync('server.ts', 'utf8');
  assert.ok(serverSrc.includes('probeIdentityToolkitOAuthProvider'));
  assert.ok(serverSrc.includes('probeIdentityToolkitPasswordProvider'));
});
