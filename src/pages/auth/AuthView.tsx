import React, { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, Eye, EyeOff, KeyRound, Mail, RefreshCw } from 'lucide-react';
import { NexoraLogo } from '../../components/branding/NexoraLogo';
import {
  isUsernameAvailable,
  loginWithEmail,
  logoutUser,
  mapAuthErrorMessage,
  registerWithEmail,
  resendVerificationEmail,
  sendPasswordReset,
  signInWithGoogle,
} from '../../services/auth/authService';
import { EMAIL_CODE_PROVIDER_STATUS } from '../../services/email/verificationCodeService';
import { useAuth } from '../../hooks/useAuth';
import { isValidUsername, normalizeUsername } from '../../utils/validation';

interface AuthViewProps {
  initialMode: 'login' | 'register' | 'verify-email';
  onBackToLanding: () => void;
}

export function AuthView({ initialMode, onBackToLanding }: AuthViewProps) {
  const { user, platformConfig, refreshUserAndProfile } = useAuth();
  const [mode, setMode] = useState<'login' | 'register' | 'forgot' | 'verify-email'>(initialMode);

  // Shared states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [rememberSession, setRememberSession] = useState(true);
  const [showPassword, setShowPassword] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (user && !user.emailVerified) {
      setMode('verify-email');
    } else if (initialMode === 'login' || initialMode === 'register') {
      setMode(initialMode);
    }
  }, [user, initialMode]);

  useEffect(() => {
    if (mode !== 'register') return;
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
  }, [username, mode]);

  const handleGoogleContinue = async () => {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      await signInWithGoogle(rememberSession);
      await refreshUserAndProfile();
    } catch (err) {
      setError(mapAuthErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const signedUser = await loginWithEmail(email, password, rememberSession);
      if (!signedUser.emailVerified) {
        setMode('verify-email');
      } else {
        await refreshUserAndProfile();
      }
    } catch (err) {
      setError(mapAuthErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');

    if (!platformConfig.features.registrationOpen) {
      setError('New registrations are temporarily paused by Nexora administration.');
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
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
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
    setError('');
    setNotice('');
    setBusy(true);
    try {
      await refreshUserAndProfile();
      if (user && !user.emailVerified) {
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
    setError('');
    setNotice('');
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

  return (
    <div className="min-h-screen bg-[#06060A] text-[#F8FAFC] flex flex-col">
      <div className="max-w-[1360px] w-full mx-auto px-6 py-6 flex items-center justify-between">
        <button
          type="button"
          onClick={onBackToLanding}
          className="inline-flex items-center gap-2 text-sm text-[#94A3B8] hover:text-white transition-colors"
        >
          <ArrowLeft size={16} /> Back to Nexora
        </button>
        <NexoraLogo size="sm" />
      </div>

      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-[#0D0D14] border border-white/10 rounded-2xl p-8 space-y-6 shadow-2xl">
          <div className="space-y-2 text-center">
            <div className="flex justify-center pb-1">
              <NexoraLogo variant="icon" size="lg" />
            </div>
            <h1 className="font-display text-2xl font-bold text-white">
              {mode === 'login' && 'Welcome back to Nexora'}
              {mode === 'register' && 'Create your Nexora account'}
              {mode === 'forgot' && 'Reset your password'}
              {mode === 'verify-email' && 'Verify your email address'}
            </h1>
            <p className="text-xs text-[#94A3B8]">
              {mode === 'login' && 'Connect. Create. Share. Belong.'}
              {mode === 'register' && 'Join the next-generation social workspace.'}
              {mode === 'forgot' && 'Enter your account email to receive a reset link.'}
              {mode === 'verify-email' && `We sent a Firebase verification link to ${user?.email || email}.`}
            </p>
          </div>

          {error && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-xs text-rose-300 leading-relaxed">
              {error}
            </div>
          )}

          {notice && (
            <div className="p-3.5 rounded-xl bg-[#7C3AED]/15 border border-[#8B5CF6]/30 text-xs text-[#E9D5FF] leading-relaxed">
              {notice}
            </div>
          )}

          {mode === 'verify-email' ? (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-[#141420] border border-white/10 space-y-2 text-xs text-[#CBD5E1]">
                <p className="font-semibold text-white flex items-center gap-2">
                  <Mail size={15} className="text-[#A855F7]" /> Verification Required
                </p>
                <p className="leading-relaxed text-[#94A3B8]">
                  Open the verification link sent by Firebase Authentication, then click the button
                  below to enter Nexora onboarding.
                </p>
                <p className="text-[11px] text-[#64748B] pt-1 border-t border-white/10">
                  6-digit code delivery status:{' '}
                  {EMAIL_CODE_PROVIDER_STATUS.configured
                    ? 'Active'
                    : 'Prepared for custom Nexora domain & email provider activation'}
                </p>
              </div>

              <button
                type="button"
                disabled={busy}
                onClick={handleCheckVerification}
                className="w-full py-3 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
              >
                <CheckCircle2 size={16} />
                {busy ? 'Checking status...' : "I've Verified — Continue"}
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={handleResendLink}
                className="w-full py-2.5 rounded-xl border border-white/15 hover:bg-white/5 text-sm font-medium text-white flex items-center justify-center gap-2 transition-colors"
              >
                <RefreshCw size={15} /> Resend Verification Link
              </button>

              <button
                type="button"
                onClick={() => logoutUser(user?.uid)}
                className="w-full py-2 text-xs text-[#94A3B8] hover:text-white"
              >
                Sign out and use another account
              </button>
            </div>
          ) : mode === 'forgot' ? (
            <form onSubmit={handleForgotSubmit} className="space-y-4">
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-[#CBD5E1]">Email address</span>
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
                className="w-full py-3 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
              >
                <KeyRound size={15} />
                {busy ? 'Sending...' : 'Send Password Reset Link'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setError('');
                  setNotice('');
                  setMode('login');
                }}
                className="w-full text-xs text-[#A855F7] hover:underline pt-1"
              >
                Return to Log In
              </button>
            </form>
          ) : (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={handleGoogleContinue}
                className="w-full py-3 px-4 rounded-xl bg-white hover:bg-slate-100 text-[#09090F] font-semibold text-sm flex items-center justify-center gap-3 transition-colors"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                  />
                </svg>
                Continue with Google
              </button>

              <div className="relative flex items-center justify-center">
                <div className="w-full border-t border-white/10" />
                <span className="px-3 bg-[#0D0D14] text-[11px] uppercase tracking-widest text-[#64748B]">
                  or
                </span>
              </div>

              {mode === 'login' ? (
                <form onSubmit={handleLoginSubmit} className="space-y-4">
                  <label className="block space-y-1.5">
                    <span className="text-xs font-medium text-[#CBD5E1]">Email</span>
                    <input
                      type="email"
                      required
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

                  <div className="flex items-center justify-between text-xs">
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
                        setError('');
                        setNotice('');
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
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#5B21B6] hover:from-[#8B5CF6] hover:to-[#6D28D9] text-white text-sm font-semibold transition-all"
                  >
                    {busy ? 'Signing in...' : 'Log In'}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
                  <label className="block space-y-1">
                    <span className="text-xs font-medium text-[#CBD5E1]">Full name</span>
                    <input
                      type="text"
                      required
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
                      value={username}
                      onChange={(e) => setUsername(normalizeUsername(e.target.value))}
                      placeholder="elena_vance"
                      className="w-full px-4 py-2.5 rounded-xl bg-[#06060A] border border-white/10 focus:border-[#8B5CF6] outline-none text-sm text-white"
                    />
                  </label>

                  <label className="block space-y-1">
                    <span className="text-xs font-medium text-[#CBD5E1]">Email address</span>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@domain.com"
                      className="w-full px-4 py-2.5 rounded-xl bg-[#06060A] border border-white/10 focus:border-[#8B5CF6] outline-none text-sm text-white"
                    />
                  </label>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="block space-y-1">
                      <span className="text-xs font-medium text-[#CBD5E1]">Password</span>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          required
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Min 6 chars"
                          className="w-full px-3.5 py-2.5 pr-9 rounded-xl bg-[#06060A] border border-white/10 focus:border-[#8B5CF6] outline-none text-sm text-white"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          aria-label="Toggle password visibility"
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-white"
                        >
                          {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      </div>
                    </label>
                    <label className="block space-y-1">
                      <span className="text-xs font-medium text-[#CBD5E1]">Confirm password</span>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Repeat password"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#06060A] border border-white/10 focus:border-[#8B5CF6] outline-none text-sm text-white"
                      />
                    </label>
                  </div>

                  <label className="flex items-start gap-2.5 text-xs text-[#94A3B8] cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={acceptTerms}
                      onChange={(e) => setAcceptTerms(e.target.checked)}
                      className="mt-0.5 accent-[#7C3AED]"
                    />
                    <span>
                      I accept Nexora&apos;s Terms of Service and Privacy Policy and confirm my email
                      can be verified.
                    </span>
                  </label>

                  <button
                    type="submit"
                    disabled={busy}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#5B21B6] hover:from-[#8B5CF6] hover:to-[#6D28D9] text-white text-sm font-semibold transition-all"
                  >
                    {busy ? 'Creating account...' : 'Create Account'}
                  </button>
                </form>
              )}

              <div className="text-center text-xs text-[#94A3B8] pt-2 border-t border-white/10">
                {mode === 'login' ? (
                  <>
                    New to Nexora?{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setError('');
                        setNotice('');
                        setMode('register');
                      }}
                      className="text-[#A855F7] font-semibold hover:underline"
                    >
                      Create Account
                    </button>
                  </>
                ) : (
                  <>
                    Already have an account?{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setError('');
                        setNotice('');
                        setMode('login');
                      }}
                      className="text-[#A855F7] font-semibold hover:underline"
                    >
                      Log In
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
