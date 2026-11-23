import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  KeyRound,
  Link2,
  Mail,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  X,
} from 'lucide-react';
import { ProviderLogo } from '../../components/auth/ProviderLogo';
import { NexoraLogo } from '../../components/branding/NexoraLogo';
import { useAuth } from '../../hooks/useAuth';
import {
  attachAndVerifyAccountEmail,
  clearPhoneRecaptcha,
  confirmPhoneOtp,
  getProviderLabel,
  isPendingAccountLinkError,
  isUserAccountVerified,
  isUsernameAvailable,
  loginWithEmail,
  logoutUser,
  mapAuthErrorMessage,
  maskPhoneNumber,
  normalizeE164Phone,
  OAuthProviderId,
  PendingAccountLinkInfo,
  PHONE_OTP_RESEND_COOLDOWN_SEC,
  PhoneOtpSession,
  registerWithEmail,
  resendVerificationEmail,
  sendPasswordReset,
  sendPhoneOtp,
  signInWithOAuthProvider,
  validateE164Phone,
} from '../../services/auth/authService';
import { auth } from '../../services/firebase/config';
import { isValidUsername, normalizeUsername } from '../../utils/validation';

interface AuthViewProps {
  initialMode: 'login' | 'register' | 'verify-email';
  onBackToLanding: () => void;
}

const DIAL_CODE_OPTIONS = [
  { code: '+1', label: 'US / CA (+1)' },
  { code: '+44', label: 'UK (+44)' },
  { code: '+61', label: 'AU (+61)' },
  { code: '+234', label: 'NG (+234)' },
  { code: '+27', label: 'ZA (+27)' },
  { code: '+91', label: 'IN (+91)' },
  { code: '+49', label: 'DE (+49)' },
  { code: '+33', label: 'FR (+33)' },
  { code: '+34', label: 'ES (+34)' },
  { code: '+55', label: 'BR (+55)' },
  { code: '+81', label: 'JP (+81)' },
  { code: '+971', label: 'AE (+971)' },
];

const OAUTH_PROVIDERS: {
  id: OAuthProviderId;
  text: string;
  buttonClass: string;
}[] = [
  {
    id: 'google.com',
    text: 'Continue with Google',
    buttonClass:
      'bg-white hover:bg-slate-100 active:bg-slate-200 text-[#09090F] border border-white/90 shadow-sm',
  },
  {
    id: 'github.com',
    text: 'Continue with GitHub',
    buttonClass:
      'bg-[#13131E] hover:bg-[#1A1A29] active:bg-[#222234] text-white border border-white/15 hover:border-white/25',
  },
  {
    id: 'apple.com',
    text: 'Continue with Apple',
    buttonClass:
      'bg-[#13131E] hover:bg-[#1A1A29] active:bg-[#222234] text-white border border-white/15 hover:border-white/25',
  },
  {
    id: 'microsoft.com',
    text: 'Continue with Microsoft',
    buttonClass:
      'bg-[#13131E] hover:bg-[#1A1A29] active:bg-[#222234] text-white border border-white/15 hover:border-white/25',
  },
  {
    id: 'facebook.com',
    text: 'Continue with Facebook',
    buttonClass:
      'bg-[#13131E] hover:bg-[#1A1A29] active:bg-[#222234] text-white border border-white/15 hover:border-white/25',
  },
];

const PHONE_RECAPTCHA_CONTAINER_ID = 'nexora-phone-recaptcha';

export function AuthView({ initialMode, onBackToLanding }: AuthViewProps) {
  const { user, emailVerified, accountVerified, platformConfig, refreshUserAndProfile } = useAuth();
  const [mode, setMode] = useState<'login' | 'register' | 'phone' | 'forgot' | 'verify-email'>(initialMode);
  const [phoneOriginMode, setPhoneOriginMode] = useState<'login' | 'register'>('login');

  // Email / Registration fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [rememberSession, setRememberSession] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Phone OTP fields
  const [dialCode, setDialCode] = useState('+1');
  const [localPhone, setLocalPhone] = useState('');
  const [otpSession, setOtpSession] = useState<PhoneOtpSession | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [resendCooldownSec, setResendCooldownSec] = useState(0);
  const [otpRemainingSec, setOtpRemainingSec] = useState(0);

  // Attach email flow for unverified OAuth account without email
  const [attachEmailInput, setAttachEmailInput] = useState('');

  // In-memory account conflict resolution (never stored in localStorage)
  const [pendingLink, setPendingLink] = useState<PendingAccountLinkInfo | null>(null);

  // Terms modal
  const [showLegalModal, setShowLegalModal] = useState(false);

  const [busyProvider, setBusyProvider] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (user && !accountVerified) {
      setMode('verify-email');
    } else if (!user && (initialMode === 'login' || initialMode === 'register')) {
      setMode((prev) => (prev === 'phone' || prev === 'forgot' ? prev : initialMode));
    }
  }, [user, accountVerified, initialMode]);

  useEffect(() => {
    return () => {
      clearPhoneRecaptcha();
    };
  }, []);

  // Live username availability check during registration (both Email and Phone signup)
  useEffect(() => {
    const checkingRegistrationUsername =
      mode === 'register' || (mode === 'phone' && phoneOriginMode === 'register');
    if (!checkingRegistrationUsername) return;
    const clean = normalizeUsername(username);
    if (!clean) {
      setUsernameStatus('idle');
      return;
    }
    if (!isValidUsername(clean)) {
      setUsernameStatus('invalid');
      return;
    }
    let cancelled = false;
    setUsernameStatus('checking');
    const timer = setTimeout(async () => {
      try {
        const available = await isUsernameAvailable(clean);
        if (!cancelled) setUsernameStatus(available ? 'available' : 'taken');
      } catch {
        if (!cancelled) setUsernameStatus('idle');
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [username, mode, phoneOriginMode]);

  // Resend cooldown + OTP 5-minute expiration timers
  useEffect(() => {
    if (!otpSession && resendCooldownSec <= 0) return;
    const tick = () => {
      if (otpSession) {
        const left = Math.max(0, Math.ceil((otpSession.expiresAtMs - Date.now()) / 1000));
        setOtpRemainingSec(left);
      } else {
        setOtpRemainingSec(0);
      }
      setResendCooldownSec((prev) => (prev > 0 ? prev - 1 : 0));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [otpSession, resendCooldownSec > 0]);

  const clearAlerts = () => {
    setError('');
    setNotice('');
  };

  const formatCountdown = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  const handleOAuthContinue = async (providerId: OAuthProviderId) => {
    clearAlerts();
    if (mode === 'register' && !platformConfig.features.registrationOpen) {
      setError('New registrations are temporarily paused by Nexora administration.');
      return;
    }
    setBusy(true);
    setBusyProvider(providerId);
    try {
      const signedUser = await signInWithOAuthProvider(providerId, rememberSession, {
        preferredFullName: mode === 'register' ? fullName : undefined,
        preferredUsername: mode === 'register' ? username : undefined,
        pendingCredentialToLink: pendingLink?.pendingCredential || null,
      });
      setPendingLink(null);
      if (isUserAccountVerified(signedUser)) {
        await refreshUserAndProfile(false);
      } else {
        setMode('verify-email');
        setNotice(
          signedUser.email
            ? `Verification link sent to ${signedUser.email}. Please verify before entering Nexora.`
            : 'Please add and verify an email address to finish securing your Nexora account.'
        );
      }
    } catch (err) {
      if (isPendingAccountLinkError(err)) {
        setPendingLink(err.info);
        setEmail(err.info.email);
        setError('');
        setNotice(err.message);
      } else {
        setError(mapAuthErrorMessage(err));
      }
    } finally {
      setBusy(false);
      setBusyProvider(null);
    }
  };

  const openPhoneFlow = (origin: 'login' | 'register') => {
    clearAlerts();
    clearPhoneRecaptcha();
    setPhoneOriginMode(origin);
    setOtpSession(null);
    setOtpCode('');
    setResendCooldownSec(0);
    setMode('phone');
  };

  const handleSendPhoneOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    clearAlerts();

    if (phoneOriginMode === 'register' && !platformConfig.features.registrationOpen) {
      setError('New registrations are temporarily paused by Nexora administration.');
      return;
    }

    if (phoneOriginMode === 'register' && username.trim()) {
      const cleanUsername = normalizeUsername(username);
      if (!isValidUsername(cleanUsername)) {
        setError('Username must be 3-30 characters using lowercase letters, numbers, or underscores.');
        return;
      }
      if (usernameStatus === 'taken') {
        setError('That username is already taken.');
        return;
      }
    }

    const e164 = normalizeE164Phone(dialCode, localPhone);
    if (!validateE164Phone(e164)) {
      setError('Please enter a valid phone number including your country code (for example +1 555 234 5678).');
      return;
    }

    setBusy(true);
    setBusyProvider('phone');
    try {
      const session = await sendPhoneOtp({
        phoneNumber: e164,
        containerId: PHONE_RECAPTCHA_CONTAINER_ID,
        rememberSession,
      });
      setOtpSession(session);
      setOtpCode('');
      setResendCooldownSec(PHONE_OTP_RESEND_COOLDOWN_SEC);
      setNotice(`A 6-digit SMS verification code was sent to ${maskPhoneNumber(e164)}.`);
    } catch (err) {
      setError(mapAuthErrorMessage(err));
    } finally {
      setBusy(false);
      setBusyProvider(null);
    }
  };

  const handleConfirmPhoneOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpSession) return;
    clearAlerts();

    if (otpRemainingSec <= 0) {
      setError('Your SMS verification code has expired. Please request a new code.');
      return;
    }

    const cleanCode = otpCode.replace(/\D/g, '');
    if (cleanCode.length !== 6) {
      setError('Please enter all 6 digits of your SMS verification code.');
      return;
    }

    setBusy(true);
    setBusyProvider('phone');
    try {
      await confirmPhoneOtp({
        session: otpSession,
        code: cleanCode,
        fullName: phoneOriginMode === 'register' ? fullName : undefined,
        username: phoneOriginMode === 'register' ? username : undefined,
        pendingCredentialToLink: pendingLink?.pendingCredential || null,
      });
      setPendingLink(null);
      setOtpSession(null);
      setOtpCode('');
      await refreshUserAndProfile(false);
    } catch (err) {
      setError(mapAuthErrorMessage(err));
    } finally {
      setBusy(false);
      setBusyProvider(null);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearAlerts();
    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      setError('Please enter both your email address and password.');
      return;
    }
    setBusy(true);
    setBusyProvider('password');
    try {
      const signedUser = await loginWithEmail(
        cleanEmail,
        password,
        rememberSession,
        pendingLink?.pendingCredential || null
      );
      setPendingLink(null);
      if (!isUserAccountVerified(signedUser)) {
        setMode('verify-email');
      } else {
        await refreshUserAndProfile(false);
      }
    } catch (err) {
      setError(mapAuthErrorMessage(err));
    } finally {
      setBusy(false);
      setBusyProvider(null);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearAlerts();

    if (!platformConfig.features.registrationOpen) {
      setError('New registrations are temporarily paused by Nexora administration.');
      return;
    }
    if (!fullName.trim()) {
      setError('Please enter your full name.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (!acceptTerms) {
      setError('You must accept the Nexora Terms of Service and Privacy Policy.');
      return;
    }
    const cleanUsername = normalizeUsername(username);
    if (!isValidUsername(cleanUsername)) {
      setError('Username must be 3-30 characters using lowercase letters, numbers, or underscores.');
      return;
    }
    if (usernameStatus === 'taken') {
      setError('That username is already taken.');
      return;
    }

    setBusy(true);
    setBusyProvider('password');
    try {
      await registerWithEmail({
        fullName,
        username: cleanUsername,
        email,
        password,
      });
      setMode('verify-email');
      setNotice('Verification link sent to your email address. Please verify before entering Nexora.');
    } catch (err) {
      setError(mapAuthErrorMessage(err));
    } finally {
      setBusy(false);
      setBusyProvider(null);
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearAlerts();
    setBusy(true);
    try {
      await sendPasswordReset(email);
      setNotice('Password reset instructions have been sent to your email address.');
    } catch (err) {
      setError(mapAuthErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleCheckVerification = async () => {
    clearAlerts();
    setBusy(true);
    try {
      await refreshUserAndProfile();
      if (auth.currentUser && !isUserAccountVerified(auth.currentUser)) {
        setError('Your email is not verified yet. Please click the verification link in your inbox, then try again.');
      }
    } catch (err) {
      setError(mapAuthErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleResendLink = async () => {
    if (!user) return;
    clearAlerts();
    setBusy(true);
    try {
      await resendVerificationEmail(user);
      setNotice(`Verification link re-sent to ${user.email}.`);
    } catch (err) {
      setError(mapAuthErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleAttachEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    clearAlerts();
    setBusy(true);
    try {
      await attachAndVerifyAccountEmail(attachEmailInput);
      setNotice(`Verification link sent to ${attachEmailInput.trim()}. Click the link in your inbox, then continue.`);
      setAttachEmailInput('');
    } catch (err) {
      setError(mapAuthErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const renderProviderButtons = (origin: 'login' | 'register') => (
    <div className="space-y-2.5" role="group" aria-label="Sign-in options">
      {OAUTH_PROVIDERS.map((provider) => {
        const isCurrentBusy = busy && busyProvider === provider.id;
        return (
          <button
            key={provider.id}
            type="button"
            disabled={busy}
            onClick={() => void handleOAuthContinue(provider.id)}
            className={`w-full min-h-[46px] px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-3 transition-all duration-150 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8B5CF6] disabled:opacity-55 disabled:cursor-not-allowed ${provider.buttonClass}`}
          >
            <ProviderLogo providerId={provider.id} size={18} />
            <span>{isCurrentBusy ? `Connecting ${getProviderLabel(provider.id)}...` : provider.text}</span>
          </button>
        );
      })}

      <button
        type="button"
        disabled={busy}
        onClick={() => openPhoneFlow(origin)}
        className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-[#13131E] hover:bg-[#1A1A29] active:bg-[#222234] text-white border border-white/15 hover:border-[#8B5CF6]/50 text-sm font-semibold flex items-center justify-center gap-3 transition-all duration-150 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8B5CF6] disabled:opacity-55 disabled:cursor-not-allowed"
      >
        <ProviderLogo providerId="phone" size={18} />
        <span>Continue with Phone Number</span>
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#06060A] text-[#F8FAFC] flex flex-col">
      <div className="max-w-[1360px] w-full mx-auto px-4 sm:px-6 py-5 flex items-center justify-between">
        <button
          type="button"
          onClick={onBackToLanding}
          className="inline-flex items-center gap-2 text-sm text-[#94A3B8] hover:text-white transition-colors min-h-[40px]"
        >
          <ArrowLeft size={16} /> Back to Nexora
        </button>
        <NexoraLogo size="sm" />
      </div>

      <div className="flex-1 flex items-center justify-center px-4 pb-10 pt-2 sm:p-6">
        <div className="w-full max-w-[460px] bg-[#0D0D14] border border-white/10 rounded-2xl p-5 sm:p-8 space-y-5 shadow-2xl">
          {/* Header: Nexora Logo, Heading & Welcome Copy */}
          <div className="space-y-2 text-center">
            <div className="flex justify-center pb-1">
              <NexoraLogo variant="icon" size="lg" />
            </div>
            <h1 className="font-display text-2xl font-bold text-white tracking-tight">
              {mode === 'login' && 'Welcome back to Nexora'}
              {mode === 'register' && 'Create your Nexora account'}
              {mode === 'phone' && (otpSession ? 'Enter verification code' : 'Continue with Phone Number')}
              {mode === 'forgot' && 'Reset your password'}
              {mode === 'verify-email' && 'Verify your email address'}
            </h1>
            <p className="text-xs text-[#94A3B8] leading-relaxed">
              {mode === 'login' && 'Sign in cleanly using Google, GitHub, Apple, Microsoft, Facebook, Phone SMS, or Email.'}
              {mode === 'register' && 'Join Nexora to connect, share, explore Spaces, and manage one unified account.'}
              {mode === 'phone' &&
                (otpSession
                  ? `Enter the 6-digit SMS code sent to ${maskPhoneNumber(otpSession.e164Phone)}.`
                  : 'We will send a one-time 6-digit verification code via SMS to confirm your number.')}
              {mode === 'forgot' && 'Enter your account email to receive a password reset link.'}
              {mode === 'verify-email' &&
                (user?.email
                  ? `We sent a Firebase verification link to ${user.email}.`
                  : 'Add and verify an email address to complete your Nexora account setup.')}
            </p>
          </div>

          {/* Pending OAuth Conflict Linking Guide */}
          {pendingLink && mode !== 'verify-email' && (
            <div className="p-3.5 rounded-xl bg-[#7C3AED]/15 border border-[#8B5CF6]/40 space-y-2 text-xs text-[#E9D5FF]">
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-white flex items-center gap-1.5">
                  <Link2 size={14} className="text-[#C084FC]" /> Account Link Required
                </p>
                <button
                  type="button"
                  onClick={() => setPendingLink(null)}
                  className="text-[#94A3B8] hover:text-white text-[11px]"
                >
                  Cancel
                </button>
              </div>
              <p className="leading-relaxed text-[#CBD5E1]">
                Sign in with your existing method for <strong className="text-white">{pendingLink.email}</strong>
                {pendingLink.existingMethods.length > 0
                  ? ` (${pendingLink.existingMethods.map((m) => getProviderLabel(m)).join(', ')})`
                  : ''}{' '}
                to automatically connect <strong className="text-white">{getProviderLabel(pendingLink.attemptedProvider)}</strong>.
              </p>
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-xs text-rose-300 leading-relaxed"
            >
              {error}
            </div>
          )}

          {notice && (
            <div className="p-3.5 rounded-xl bg-[#7C3AED]/15 border border-[#8B5CF6]/30 text-xs text-[#E9D5FF] leading-relaxed">
              {notice}
            </div>
          )}

          {/* Verify Email View */}
          {mode === 'verify-email' ? (
            <div className="space-y-4">
              {user && !user.email ? (
                <form onSubmit={handleAttachEmail} className="space-y-3">
                  <div className="p-3.5 rounded-xl bg-[#141420] border border-white/10 text-xs text-[#CBD5E1] leading-relaxed">
                    Your selected sign-in provider did not share a verified email address. Add an email
                    address below so we can send a verification link.
                  </div>
                  <label className="block space-y-1.5">
                    <span className="text-xs font-medium text-[#CBD5E1]">Email Address</span>
                    <input
                      type="email"
                      required
                      value={attachEmailInput}
                      onChange={(e) => setAttachEmailInput(e.target.value)}
                      placeholder="you@domain.com"
                      className="w-full px-4 py-2.5 rounded-xl bg-[#06060A] border border-white/10 focus:border-[#8B5CF6] outline-none text-sm text-white"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={busy}
                    className="w-full min-h-[46px] py-2.5 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
                  >
                    <Mail size={16} /> {busy ? 'Sending link...' : 'Send Verification Link'}
                  </button>
                </form>
              ) : (
                <div className="p-4 rounded-xl bg-[#141420] border border-white/10 space-y-2 text-xs text-[#CBD5E1]">
                  <p className="font-semibold text-white flex items-center gap-2">
                    <Mail size={15} className="text-[#A855F7]" /> Email Verification Required
                  </p>
                  <p className="leading-relaxed text-[#94A3B8]">
                    Open the verification link sent to <strong className="text-white">{user?.email || email}</strong>, then
                    click below to continue into Nexora.
                  </p>
                </div>
              )}

              <button
                type="button"
                disabled={busy}
                onClick={() => void handleCheckVerification()}
                className="w-full min-h-[46px] py-2.5 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
              >
                <CheckCircle2 size={16} />
                {busy ? 'Checking status...' : "I've Verified — Continue"}
              </button>

              {user?.email && !emailVerified && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleResendLink()}
                  className="w-full min-h-[44px] py-2.5 rounded-xl border border-white/15 hover:bg-white/5 text-sm font-medium text-white flex items-center justify-center gap-2 transition-colors"
                >
                  <RefreshCw size={15} /> Resend Verification Link
                </button>
              )}

              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  clearAlerts();
                  try {
                    await logoutUser(user?.uid);
                    setPassword('');
                    setMode('login');
                  } catch (err) {
                    setError(mapAuthErrorMessage(err));
                  } finally {
                    setBusy(false);
                  }
                }}
                className="w-full py-2 text-xs text-[#94A3B8] hover:text-white disabled:opacity-50"
              >
                Sign out and use another account
              </button>
            </div>
          ) : mode === 'forgot' ? (
            /* Forgot Password View */
            <form onSubmit={handleForgotSubmit} className="space-y-4">
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-[#CBD5E1]">Email Address</span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@domain.com"
                  className="w-full px-4 py-2.5 rounded-xl bg-[#06060A] border border-white/10 focus:border-[#8B5CF6] outline-none text-sm text-white"
                />
              </label>

              <button
                type="submit"
                disabled={busy}
                className="w-full min-h-[46px] py-2.5 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
              >
                <KeyRound size={15} />
                {busy ? 'Sending...' : 'Send Password Reset Link'}
              </button>

              <button
                type="button"
                onClick={() => {
                  clearAlerts();
                  setMode('login');
                }}
                className="w-full text-xs text-[#A855F7] hover:underline pt-1"
              >
                Return to Log In
              </button>
            </form>
          ) : mode === 'phone' ? (
            /* Phone SMS OTP View */
            <div className="space-y-4">
              {!otpSession ? (
                <form onSubmit={handleSendPhoneOtp} className="space-y-3.5">
                  {phoneOriginMode === 'register' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <label className="block space-y-1">
                        <span className="text-xs font-medium text-[#CBD5E1]">Full Name (Optional)</span>
                        <input
                          type="text"
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          placeholder="Elena Vance"
                          className="w-full px-3.5 py-2.5 rounded-xl bg-[#06060A] border border-white/10 focus:border-[#8B5CF6] outline-none text-sm text-white"
                        />
                      </label>
                      <label className="block space-y-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-medium text-[#CBD5E1]">Username</span>
                          {usernameStatus === 'available' && <span className="text-[11px] text-emerald-400">Available</span>}
                          {usernameStatus === 'taken' && <span className="text-[11px] text-rose-400">Taken</span>}
                          {usernameStatus === 'invalid' && <span className="text-[11px] text-amber-400">Min 3 chars</span>}
                        </div>
                        <input
                          type="text"
                          value={username}
                          onChange={(e) => setUsername(normalizeUsername(e.target.value))}
                          placeholder="elena_vance"
                          className="w-full px-3.5 py-2.5 rounded-xl bg-[#06060A] border border-white/10 focus:border-[#8B5CF6] outline-none text-sm text-white"
                        />
                      </label>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <span className="block text-xs font-medium text-[#CBD5E1]">Phone Number</span>
                    <div className="flex gap-2">
                      <select
                        aria-label="Country code"
                        value={dialCode}
                        onChange={(e) => setDialCode(e.target.value)}
                        className="w-[132px] px-2.5 py-2.5 rounded-xl bg-[#06060A] border border-white/10 focus:border-[#8B5CF6] outline-none text-xs text-white"
                      >
                        {DIAL_CODE_OPTIONS.map((opt) => (
                          <option key={opt.code} value={opt.code}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <input
                        type="tel"
                        required
                        autoComplete="tel-national"
                        value={localPhone}
                        onChange={(e) => setLocalPhone(e.target.value)}
                        placeholder="555 234 5678"
                        className="flex-1 min-w-0 px-3.5 py-2.5 rounded-xl bg-[#06060A] border border-white/10 focus:border-[#8B5CF6] outline-none text-sm text-white"
                      />
                    </div>
                    <p className="text-[11px] text-[#64748B]">
                      Include country code or pick one on the left. Standard SMS rates may apply.
                    </p>
                  </div>

                  <label className="inline-flex items-center gap-2 text-xs text-[#CBD5E1] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rememberSession}
                      onChange={(e) => setRememberSession(e.target.checked)}
                      className="accent-[#7C3AED]"
                    />
                    Remember session on this device
                  </label>

                  <div id={PHONE_RECAPTCHA_CONTAINER_ID} />

                  <button
                    type="submit"
                    disabled={busy}
                    className="w-full min-h-[46px] py-2.5 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#5B21B6] hover:from-[#8B5CF6] hover:to-[#6D28D9] text-white text-sm font-semibold flex items-center justify-center gap-2 transition-all"
                  >
                    <Smartphone size={16} />
                    {busy ? 'Sending SMS code...' : 'Send Verification Code'}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleConfirmPhoneOtp} className="space-y-4">
                  <label className="block space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-[#CBD5E1]">6-Digit SMS Code</span>
                      <span
                        className={`inline-flex items-center gap-1 text-[11px] ${
                          otpRemainingSec > 0 ? 'text-[#94A3B8]' : 'text-rose-400'
                        }`}
                      >
                        <Clock size={12} />
                        {otpRemainingSec > 0 ? `Expires in ${formatCountdown(otpRemainingSec)}` : 'Code expired'}
                      </span>
                    </div>
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      required
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="000000"
                      className="w-full px-4 py-3 rounded-xl bg-[#06060A] border border-white/15 focus:border-[#8B5CF6] outline-none text-center text-lg tracking-[0.45em] font-semibold text-white"
                    />
                  </label>

                  <div id={PHONE_RECAPTCHA_CONTAINER_ID} />

                  <button
                    type="submit"
                    disabled={busy || otpRemainingSec <= 0 || otpCode.length !== 6}
                    className="w-full min-h-[46px] py-2.5 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#5B21B6] hover:from-[#8B5CF6] hover:to-[#6D28D9] disabled:opacity-55 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-all"
                  >
                    <ShieldCheck size={16} />
                    {busy ? 'Verifying code...' : 'Verify & Continue'}
                  </button>

                  <div className="flex items-center justify-between gap-2 text-xs pt-1">
                    <button
                      type="button"
                      disabled={busy || resendCooldownSec > 0}
                      onClick={() => void handleSendPhoneOtp()}
                      className="text-[#C084FC] hover:underline disabled:text-[#64748B] disabled:no-underline"
                    >
                      {resendCooldownSec > 0 ? `Resend code in ${resendCooldownSec}s` : 'Resend SMS code'}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        clearAlerts();
                        clearPhoneRecaptcha();
                        setOtpSession(null);
                        setOtpCode('');
                      }}
                      className="text-[#94A3B8] hover:text-white"
                    >
                      Change phone number
                    </button>
                  </div>
                </form>
              )}

              <div className="pt-2 border-t border-white/10 text-center">
                <button
                  type="button"
                  onClick={() => {
                    clearAlerts();
                    clearPhoneRecaptcha();
                    setOtpSession(null);
                    setMode(phoneOriginMode);
                  }}
                  className="text-xs text-[#A855F7] hover:underline"
                >
                  All sign-in options
                </button>
              </div>
            </div>
          ) : mode === 'login' ? (
            /* LOGIN PAGE */
            <>
              {renderProviderButtons('login')}

              <div className="relative flex items-center justify-center py-0.5">
                <div className="w-full border-t border-white/10" />
                <span className="px-3 bg-[#0D0D14] text-[11px] font-semibold uppercase tracking-widest text-[#64748B]">
                  OR
                </span>
              </div>

              <form onSubmit={handleLoginSubmit} className="space-y-3.5">
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-[#CBD5E1]">Email Address</span>
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@domain.com"
                    className="w-full px-4 py-2.5 rounded-xl bg-[#06060A] border border-white/10 focus:border-[#8B5CF6] outline-none text-sm text-white"
                  />
                </label>

                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-[#CBD5E1]">Password</span>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter password"
                      className="w-full px-4 py-2.5 pr-11 rounded-xl bg-[#06060A] border border-white/10 focus:border-[#8B5CF6] outline-none text-sm text-white"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label="Toggle password visibility"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-white"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </label>

                <div className="flex items-center justify-between text-xs pt-0.5">
                  <label className="inline-flex items-center gap-2 text-[#CBD5E1] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rememberSession}
                      onChange={(e) => setRememberSession(e.target.checked)}
                      className="accent-[#7C3AED]"
                    />
                    Remember session
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      clearAlerts();
                      setMode('forgot');
                    }}
                    className="text-[#A855F7] hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={busy}
                  className="w-full min-h-[46px] py-2.5 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#5B21B6] hover:from-[#8B5CF6] hover:to-[#6D28D9] text-white text-sm font-semibold flex items-center justify-center gap-2 transition-all"
                >
                  <ProviderLogo providerId="password" size={16} className="text-white" />
                  {busy && busyProvider === 'password' ? 'Signing in...' : 'Continue with Email'}
                </button>
              </form>

              <div className="text-center text-xs text-[#94A3B8] pt-2 border-t border-white/10">
                New to Nexora?{' '}
                <button
                  type="button"
                  onClick={() => {
                    clearAlerts();
                    setMode('register');
                  }}
                  className="text-[#A855F7] font-semibold hover:underline"
                >
                  Create Account
                </button>
              </div>
            </>
          ) : (
            /* CREATE ACCOUNT PAGE — Exact Section Ordering */
            <>
              {renderProviderButtons('register')}

              <div className="relative flex items-center justify-center py-0.5">
                <div className="w-full border-t border-white/10" />
                <span className="px-3 bg-[#0D0D14] text-[11px] font-semibold uppercase tracking-widest text-[#64748B]">
                  OR
                </span>
              </div>

              <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-[#CBD5E1]">Full Name</span>
                  <input
                    type="text"
                    required
                    autoComplete="name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Elena Vance"
                    className="w-full px-4 py-2.5 rounded-xl bg-[#06060A] border border-white/10 focus:border-[#8B5CF6] outline-none text-sm text-white"
                  />
                </label>

                <label className="block space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-[#CBD5E1]">Username</span>
                    {usernameStatus === 'available' && (
                      <span className="text-[11px] text-emerald-400">Available</span>
                    )}
                    {usernameStatus === 'taken' && (
                      <span className="text-[11px] text-rose-400">Already taken</span>
                    )}
                    {usernameStatus === 'invalid' && (
                      <span className="text-[11px] text-amber-400">Min 3 chars (a-z, 0-9, _)</span>
                    )}
                  </div>
                  <input
                    type="text"
                    required
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(normalizeUsername(e.target.value))}
                    placeholder="elena_vance"
                    className="w-full px-4 py-2.5 rounded-xl bg-[#06060A] border border-white/10 focus:border-[#8B5CF6] outline-none text-sm text-white"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-xs font-medium text-[#CBD5E1]">Email Address</span>
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@domain.com"
                    className="w-full px-4 py-2.5 rounded-xl bg-[#06060A] border border-white/10 focus:border-[#8B5CF6] outline-none text-sm text-white"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-xs font-medium text-[#CBD5E1]">Password</span>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 6 characters"
                      className="w-full px-4 py-2.5 pr-11 rounded-xl bg-[#06060A] border border-white/10 focus:border-[#8B5CF6] outline-none text-sm text-white"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label="Toggle password visibility"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-white"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </label>

                <label className="block space-y-1">
                  <span className="text-xs font-medium text-[#CBD5E1]">Confirm Password</span>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      required
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter password"
                      className="w-full px-4 py-2.5 pr-11 rounded-xl bg-[#06060A] border border-white/10 focus:border-[#8B5CF6] outline-none text-sm text-white"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((v) => !v)}
                      aria-label="Toggle confirm password visibility"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-white"
                    >
                      {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </label>

                <div className="flex items-start gap-2.5 text-xs text-[#94A3B8] pt-1">
                  <input
                    id="nexora-accept-terms"
                    type="checkbox"
                    checked={acceptTerms}
                    onChange={(e) => setAcceptTerms(e.target.checked)}
                    className="mt-0.5 accent-[#7C3AED] cursor-pointer"
                  />
                  <label htmlFor="nexora-accept-terms" className="leading-relaxed cursor-pointer">
                    I agree to the{' '}
                    <button
                      type="button"
                      onClick={() => setShowLegalModal(true)}
                      className="text-[#C084FC] hover:underline font-medium"
                    >
                      Terms of Service and Privacy Policy
                    </button>
                    .
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={busy}
                  className="w-full min-h-[46px] py-2.5 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#5B21B6] hover:from-[#8B5CF6] hover:to-[#6D28D9] text-white text-sm font-semibold transition-all"
                >
                  {busy && busyProvider === 'password' ? 'Creating account...' : 'Create Account'}
                </button>
              </form>

              <div className="text-center text-xs text-[#94A3B8] pt-2 border-t border-white/10">
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    clearAlerts();
                    setMode('login');
                  }}
                  className="text-[#A855F7] font-semibold hover:underline"
                >
                  Log In
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Inline Terms of Service & Privacy Policy Dialog (No popup window) */}
      {showLegalModal && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="nexora-legal-title"
        >
          <div className="w-full max-w-md bg-[#0D0D14] border border-white/15 rounded-2xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between gap-2">
              <h2 id="nexora-legal-title" className="font-display text-base font-bold text-white">
                Nexora Terms of Service &amp; Privacy Policy
              </h2>
              <button
                type="button"
                aria-label="Close Terms and Privacy summary"
                onClick={() => setShowLegalModal(false)}
                className="p-1.5 rounded-lg text-[#94A3B8] hover:text-white hover:bg-white/10"
              >
                <X size={16} />
              </button>
            </div>
            <div className="space-y-2.5 text-xs text-[#CBD5E1] leading-relaxed max-h-[55vh] overflow-y-auto pr-1">
              <p>
                <strong className="text-white">Account Security &amp; Verification:</strong> All email and social
                sign-in accounts require valid authentication via Firebase Auth, and phone-number accounts require
                SMS one-time verification.
              </p>
              <p>
                <strong className="text-white">Data Privacy:</strong> Your email address, phone number, blocked users,
                and privacy preferences live inside your private Nexora account document and are never exposed on
                public member feeds.
              </p>
              <p>
                <strong className="text-white">Community Conduct:</strong> Respect members across Feed, Vibes, Chat,
                and Spaces. Harassment, impersonation, and unauthorised automated scraping are prohibited.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={() => {
                  setAcceptTerms(true);
                  setShowLegalModal(false);
                }}
                className="px-4 py-2 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-xs font-semibold"
              >
                Accept &amp; Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
