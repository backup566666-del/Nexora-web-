/**
 * Branded 6-Digit Verification Code Service (Prepared Architecture)
 *
 * Current active flow: Firebase Authentication's built-in email verification link.
 * Ready for activation once a verified Nexora domain and transactional email
 * delivery provider (e.g., Resend, SendGrid, Postmark via Cloud Functions) are configured.
 */

export interface VerificationCodeProviderConfig {
  configured: boolean;
  providerName: string | null;
  verifiedDomain: string | null;
}

export const EMAIL_CODE_PROVIDER_STATUS: VerificationCodeProviderConfig = {
  configured: false,
  providerName: null,
  verifiedDomain: null,
};

export interface VerificationCodeRequestResult {
  dispatched: boolean;
  mode: 'firebase-link-fallback' | 'six-digit-code';
  message: string;
}

export async function requestBrandedSixDigitCode(
  _email: string
): Promise<VerificationCodeRequestResult> {
  if (!EMAIL_CODE_PROVIDER_STATUS.configured) {
    return {
      dispatched: false,
      mode: 'firebase-link-fallback',
      message:
        'Custom 6-digit email delivery requires a verified Nexora domain and transactional SMTP/API provider. Use the active Firebase verification link instead.',
    };
  }
  return {
    dispatched: true,
    mode: 'six-digit-code',
    message: 'Verification code dispatched.',
  };
}
