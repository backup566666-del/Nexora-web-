import { GoogleGenAI } from '@google/genai';
import 'dotenv/config';
import crypto from 'crypto';
import express, { Request, Response } from 'express';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import fs from 'fs';
import http from 'http';
import nodemailer from 'nodemailer';
import path from 'path';
import Stripe from 'stripe';
import { fileURLToPath } from 'url';
import {
  buildNexoraSystemInstruction,
  createServerGeminiClientOrNull,
  dispatchPushTokens,
  enforceAndTrackAiQuota,
  evaluateCommunityAiDecision,
  extractTokenUsage,
  findProhibitedTopicMatch,
  getQuotaSnapshot,
  isPushMessagingCredentialAvailable,
  loadChannelAiConfig,
  loadGlobalAiSettings,
  markChannelBotReplied,
  recordCompletedAiUsage,
  resolveCallerTierAndRole,
} from './server/nexoraAiService';
import {
  fetchNigerianBanks,
  getBankProviderStatus,
  resolveNigerianBankAccount,
} from './server/rewardsService';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

export type EmailProviderType = 'resend' | 'smtp' | 'none';

export interface EmailSendPayload {
  to: string;
  subject: string;
  title?: string;
  bodyText: string;
  category?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  recipientName?: string;
}

export interface EmailDispatchOutcome {
  delivered: boolean;
  status: 'sent' | 'not_configured' | 'failed';
  provider: EmailProviderType;
  messageId?: string;
  error?: string;
  message: string;
}

export function getEmailProviderConfig() {
  const resendApiKey = (process.env.RESEND_API_KEY || '').trim();
  const smtpHost = (process.env.SMTP_HOST || '').trim();
  const smtpPort = Number(process.env.SMTP_PORT || 587);
  const smtpUser = (process.env.SMTP_USER || '').trim();
  const smtpPass = (process.env.SMTP_PASS || '').trim();
  const fromAddress = (process.env.NEXORA_EMAIL_FROM || 'Nexora <noreply@nexora.social>').trim();
  const replyTo = (process.env.NEXORA_EMAIL_REPLY_TO || '').trim();

  if (resendApiKey) {
    return {
      configured: true,
      provider: 'resend' as const,
      resendApiKey,
      fromAddress,
      replyTo,
    };
  }

  if (smtpHost && smtpUser && smtpPass) {
    return {
      configured: true,
      provider: 'smtp' as const,
      smtpHost,
      smtpPort: Number.isFinite(smtpPort) && smtpPort > 0 ? smtpPort : 587,
      smtpUser,
      smtpPass,
      fromAddress,
      replyTo,
    };
  }

  return {
    configured: false,
    provider: 'none' as const,
    fromAddress,
    replyTo,
  };
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildNexoraEmailHtml(payload: EmailSendPayload): string {
  const safeTitle = escapeHtml(payload.title || payload.subject);
  const safeCategory = escapeHtml((payload.category || 'Platform Update').toUpperCase());
  const safeRecipient = payload.recipientName ? escapeHtml(payload.recipientName) : 'Creator';
  const safeBody = escapeHtml(payload.bodyText).replace(/\n/g, '<br/>');
  const appBase = (process.env.APP_URL || '').trim().replace(/\/$/, '');
  const resolvedCtaUrl =
    payload.ctaUrl && /^https?:\/\//i.test(payload.ctaUrl)
      ? payload.ctaUrl
      : appBase
      ? `${appBase}${payload.ctaUrl || '/'}`
      : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>${safeTitle}</title>
</head>
<body style="margin:0;padding:0;background-color:#07050c;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#f3f0ff;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#07050c;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:580px;background-color:#110d1b;border:1px solid rgba(168,85,247,0.28);border-radius:16px;overflow:hidden;">
          <tr>
            <td style="padding:24px 28px;background:linear-gradient(135deg,#1d1136 0%,#100b1d 100%);border-bottom:1px solid rgba(255,255,255,0.08);">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <span style="display:inline-block;padding:4px 10px;border-radius:6px;background:rgba(139,92,246,0.18);border:1px solid rgba(167,139,250,0.35);color:#c4b5fd;font-size:11px;font-weight:700;letter-spacing:0.12em;">
                      NEXORA · ${safeCategory}
                    </span>
                  </td>
                </tr>
                <tr>
                  <td style="padding-top:14px;">
                    <h1 style="margin:0;font-size:21px;line-height:1.3;font-weight:700;color:#ffffff;">${safeTitle}</h1>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:26px 28px;font-size:14px;line-height:1.65;color:#d6d0e6;">
              <p style="margin:0 0 14px 0;color:#ffffff;font-weight:600;">Hello ${safeRecipient},</p>
              <p style="margin:0 0 20px 0;">${safeBody}</p>
              ${
                resolvedCtaUrl && payload.ctaLabel
                  ? `<div style="margin:24px 0 6px 0;">
                      <a href="${escapeHtml(resolvedCtaUrl)}" style="display:inline-block;padding:11px 22px;border-radius:10px;background:linear-gradient(135deg,#7c3aed,#6366f1);color:#ffffff;font-size:13px;font-weight:600;text-decoration:none;">
                        ${escapeHtml(payload.ctaLabel)}
                      </a>
                    </div>`
                  : ''
              }
            </td>
          </tr>
          <tr>
            <td style="padding:18px 28px;background-color:#0b0813;border-top:1px solid rgba(255,255,255,0.07);font-size:11px;line-height:1.5;color:#8e86a8;">
              This notification was dispatched by Nexora. Manage your email and in-app notification preferences anytime inside Nexora Settings.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function dispatchNexoraEmail(payload: EmailSendPayload): Promise<EmailDispatchOutcome> {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const to = (payload.to || '').trim();
  const subject = (payload.subject || '').trim().slice(0, 160);
  const bodyText = (payload.bodyText || '').trim().slice(0, 4000);

  if (!emailRegex.test(to)) {
    return {
      delivered: false,
      status: 'failed',
      provider: 'none',
      error: 'Invalid recipient email address.',
      message: 'Invalid recipient email address.',
    };
  }
  if (!subject || !bodyText) {
    return {
      delivered: false,
      status: 'failed',
      provider: 'none',
      error: 'Email subject and body are required.',
      message: 'Email subject and body are required.',
    };
  }

  const config = getEmailProviderConfig();
  if (!config.configured) {
    return {
      delivered: false,
      status: 'not_configured',
      provider: 'none',
      message:
        'Email delivery provider is not configured on the server (set RESEND_API_KEY or SMTP_HOST/SMTP_USER/SMTP_PASS).',
    };
  }

  const html = buildNexoraEmailHtml(payload);

  if (config.provider === 'resend') {
    try {
      const resendBody: Record<string, unknown> = {
        from: config.fromAddress,
        to: [to],
        subject,
        html,
        text: bodyText,
      };
      if (config.replyTo) {
        resendBody.reply_to = config.replyTo;
      }

      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(resendBody),
      });

      const data = (await response.json().catch(() => ({}))) as { id?: string; message?: string };
      if (!response.ok) {
        return {
          delivered: false,
          status: 'failed',
          provider: 'resend',
          error: data.message || `Resend returned HTTP ${response.status}`,
          message: data.message || 'Resend rejected email request.',
        };
      }

      return {
        delivered: true,
        status: 'sent',
        provider: 'resend',
        messageId: data.id,
        message: 'Email sent via Resend.',
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Resend request failed.';
      return {
        delivered: false,
        status: 'failed',
        provider: 'resend',
        error: msg,
        message: msg,
      };
    }
  }

  // Nodemailer SMTP
  try {
    const transporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpPort === 465,
      auth: {
        user: config.smtpUser,
        pass: config.smtpPass,
      },
    });

    const info = await transporter.sendMail({
      from: config.fromAddress,
      to,
      replyTo: config.replyTo || undefined,
      subject,
      text: bodyText,
      html,
    });

    return {
      delivered: true,
      status: 'sent',
      provider: 'smtp',
      messageId: info.messageId,
      message: 'Email sent via SMTP.',
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'SMTP delivery failed.';
    return {
      delivered: false,
      status: 'failed',
      provider: 'smtp',
      error: msg,
      message: msg,
    };
  }
}

export interface AndroidReleaseStatus {
  available: boolean;
  source: 'external_https' | 'self_hosted' | 'none';
  downloadUrl: string | null;
  packageId: string;
  versionName: string;
  fileSizeBytes: number | null;
  minAndroidVersion: string;
  targetSdk: number;
  assetLinksConfigured: boolean;
  message: string;
}

const PLACEHOLDER_SHA256 =
  '00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00';

function isAllowedExternalHttpsUrl(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') return null;
    const host = parsed.hostname.toLowerCase();
    if (
      !host ||
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host.startsWith('169.254.') ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
    ) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function verifyLocalApkBinary(filePath: string): number | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size < 10_000) return null;
    const fd = fs.openSync(filePath, 'r');
    try {
      const header = Buffer.alloc(4);
      const bytesRead = fs.readSync(fd, header, 0, 4, 0);
      // Valid APK packages are ZIP archives starting with PK\x03\x04
      if (
        bytesRead !== 4 ||
        header[0] !== 0x50 ||
        header[1] !== 0x4b ||
        header[2] !== 0x03 ||
        header[3] !== 0x04
      ) {
        return null;
      }
      return stat.size;
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return null;
  }
}

function hasConfiguredAssetLinksFingerprint(rootDir: string): boolean {
  const envRaw = (process.env.ANDROID_SHA256_FINGERPRINTS || '').trim();
  if (envRaw) {
    const valid = envRaw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length >= 20 && s !== PLACEHOLDER_SHA256);
    if (valid.length > 0) return true;
  }

  for (const candidate of [
    path.resolve(rootDir, 'public', '.well-known', 'assetlinks.json'),
    path.resolve(rootDir, 'dist', '.well-known', 'assetlinks.json'),
  ]) {
    try {
      if (!fs.existsSync(candidate)) continue;
      const parsed = JSON.parse(fs.readFileSync(candidate, 'utf8'));
      if (Array.isArray(parsed)) {
        const fps: string[] = parsed.flatMap((entry) =>
          Array.isArray(entry?.target?.sha256_cert_fingerprints)
            ? entry.target.sha256_cert_fingerprints
            : []
        );
        if (fps.some((fp) => typeof fp === 'string' && fp.trim().length >= 20 && fp.trim() !== PLACEHOLDER_SHA256)) {
          return true;
        }
      }
    } catch {
      // Ignore unreadable assetlinks manifest
    }
  }

  return false;
}

function findVerifiedLocalApk(rootDir: string): { path: string; sizeBytes: number } | null {
  const candidates = [
    path.resolve(rootDir, 'public', 'downloads', 'nexora-latest.apk'),
    path.resolve(rootDir, 'dist', 'downloads', 'nexora-latest.apk'),
  ];
  for (const candidate of candidates) {
    const size = verifyLocalApkBinary(candidate);
    if (size !== null) {
      return { path: candidate, sizeBytes: size };
    }
  }
  return null;
}

export function getAndroidReleaseStatus(rootDir: string = __dirname): AndroidReleaseStatus {
  const packageId = (process.env.ANDROID_PACKAGE_NAME || 'social.nexora.app').trim();
  const versionName = (process.env.ANDROID_APK_VERSION || '1.0.0').trim();
  const assetLinksConfigured = hasConfiguredAssetLinksFingerprint(rootDir);

  const localApk = findVerifiedLocalApk(rootDir);
  if (localApk) {
    return {
      available: true,
      source: 'self_hosted',
      downloadUrl: '/downloads/nexora-latest.apk',
      packageId,
      versionName,
      fileSizeBytes: localApk.sizeBytes,
      minAndroidVersion: 'Android 7.0+ (API 24)',
      targetSdk: 35,
      assetLinksConfigured,
      message: `Signed Nexora Android APK v${versionName} is ready for direct download.`,
    };
  }

  const externalHttpsUrl = isAllowedExternalHttpsUrl(process.env.ANDROID_APK_DOWNLOAD_URL || '');
  if (externalHttpsUrl) {
    return {
      available: true,
      source: 'external_https',
      downloadUrl: externalHttpsUrl,
      packageId,
      versionName,
      fileSizeBytes: null,
      minAndroidVersion: 'Android 7.0+ (API 24)',
      targetSdk: 35,
      assetLinksConfigured,
      message: `Signed Nexora Android APK v${versionName} is hosted at a verified HTTPS release URL.`,
    };
  }

  return {
    available: false,
    source: 'none',
    downloadUrl: null,
    packageId,
    versionName,
    fileSizeBytes: null,
    minAndroidVersion: 'Android 7.0+ (API 24)',
    targetSdk: 35,
    assetLinksConfigured,
    message:
      'Android APK signing keystore, SHA-256 Digital Asset Links, and cloud workflow build are pending. Use the live web app or browser install meanwhile.',
  };
}

// --- Nexora Stripe Billing & Firebase ID Token Helpers ---
function loadFirebaseAuthMeta(): {
  projectId: string;
  authDomain: string;
  apiKey: string;
  hasGoogleOAuthClient: boolean;
} {
  const candidates = [
    path.resolve(__dirname, 'firebase-applet-config.json'),
    path.resolve(process.cwd(), 'firebase-applet-config.json'),
  ];
  for (const file of candidates) {
    try {
      if (fs.existsSync(file)) {
        const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as {
          projectId?: string;
          authDomain?: string;
          apiKey?: string;
          oAuthClientId?: string;
        };
        const projectId = parsed.projectId || process.env.FIREBASE_PROJECT_ID || 'gen-lang-client-0024648348';
        return {
          projectId,
          authDomain: parsed.authDomain || `${projectId}.firebaseapp.com`,
          apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey.trim() : '',
          hasGoogleOAuthClient: Boolean(parsed.oAuthClientId && parsed.oAuthClientId.trim()),
        };
      }
    } catch {
      // Fallback below
    }
  }
  const fallbackProject = process.env.FIREBASE_PROJECT_ID || 'gen-lang-client-0024648348';
  return {
    projectId: fallbackProject,
    authDomain: `${fallbackProject}.firebaseapp.com`,
    apiKey: '',
    hasGoogleOAuthClient: false,
  };
}

interface LiveAuthProviderProbeResult {
  checkedAtMs: number;
  authorizedDomains: string[];
  enabledMap: Record<string, boolean>;
}

const AUTH_PROVIDER_PROBE_TTL_MS = 60_000;
let cachedAuthProviderProbe: LiveAuthProviderProbeResult | null = null;
let inFlightAuthProviderProbe: Promise<LiveAuthProviderProbeResult> | null = null;

async function probeIdentityToolkitOAuthProvider(
  apiKey: string,
  continueUri: string,
  providerId: string
): Promise<boolean> {
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:createAuthUri?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ continueUri, providerId }),
        signal: AbortSignal.timeout(4000),
      }
    );
    if (res.ok) return true;
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    const errMsg = String(body?.error?.message || '').toUpperCase();
    if (
      errMsg.includes('OPERATION_NOT_ALLOWED') ||
      errMsg.includes('CONFIGURATION_NOT_FOUND') ||
      errMsg.includes('IDP_DISABLED')
    ) {
      return false;
    }
    return false;
  } catch {
    return false;
  }
}

async function probeIdentityToolkitPasswordProvider(apiKey: string): Promise<boolean> {
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'probe-status-check@nexora.invalid',
          password: 'probe-status-check-password',
          returnSecureToken: false,
        }),
        signal: AbortSignal.timeout(4000),
      }
    );
    if (res.ok) return true;
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    const errMsg = String(body?.error?.message || '').toUpperCase();
    if (errMsg.includes('OPERATION_NOT_ALLOWED') || errMsg.includes('EMAIL_SIGNIN_DISABLED')) {
      return false;
    }
    return (
      errMsg.includes('INVALID_LOGIN_CREDENTIALS') ||
      errMsg.includes('EMAIL_NOT_FOUND') ||
      errMsg.includes('INVALID_PASSWORD') ||
      errMsg.includes('INVALID_EMAIL') ||
      errMsg.includes('TOO_MANY_ATTEMPTS_TRY_LATER')
    );
  } catch {
    return false;
  }
}

async function probeIdentityToolkitProjectConfig(
  apiKey: string
): Promise<{ authorizedDomains: string[]; recaptchaConfigured: boolean }> {
  try {
    const [cfgRes, recaptchaRes] = await Promise.all([
      fetch(
        `https://identitytoolkit.googleapis.com/v1/projects?key=${encodeURIComponent(apiKey)}`,
        { signal: AbortSignal.timeout(4000) }
      ).catch(() => null),
      fetch(
        `https://identitytoolkit.googleapis.com/v1/recaptchaParams?key=${encodeURIComponent(apiKey)}`,
        { signal: AbortSignal.timeout(4000) }
      ).catch(() => null),
    ]);
    let authorizedDomains: string[] = [];
    if (cfgRes && cfgRes.ok) {
      const data = (await cfgRes.json().catch(() => ({}))) as { authorizedDomains?: unknown };
      if (Array.isArray(data.authorizedDomains)) {
        authorizedDomains = data.authorizedDomains.filter((d): d is string => typeof d === 'string');
      }
    }
    return {
      authorizedDomains,
      recaptchaConfigured: Boolean(recaptchaRes && recaptchaRes.ok),
    };
  } catch {
    return { authorizedDomains: [], recaptchaConfigured: false };
  }
}

async function getLiveFirebaseAuthProviderStatus(meta: {
  projectId: string;
  authDomain: string;
  apiKey: string;
  hasGoogleOAuthClient: boolean;
}): Promise<LiveAuthProviderProbeResult> {
  if (
    cachedAuthProviderProbe &&
    Date.now() - cachedAuthProviderProbe.checkedAtMs < AUTH_PROVIDER_PROBE_TTL_MS
  ) {
    return cachedAuthProviderProbe;
  }
  if (inFlightAuthProviderProbe) {
    return inFlightAuthProviderProbe;
  }

  inFlightAuthProviderProbe = (async () => {
    const continueUri = `https://${meta.authDomain}/__/auth/handler`;
    if (!meta.apiKey) {
      const fallback: LiveAuthProviderProbeResult = {
        checkedAtMs: Date.now(),
        authorizedDomains: [meta.authDomain],
        enabledMap: {
          'google.com': meta.hasGoogleOAuthClient,
          'github.com': false,
          'apple.com': false,
          'microsoft.com': false,
          'facebook.com': false,
          phone: false,
          password: false,
        },
      };
      cachedAuthProviderProbe = fallback;
      return fallback;
    }

    const [googleOk, githubOk, appleOk, microsoftOk, facebookOk, passwordOk, projectMeta] =
      await Promise.all([
        probeIdentityToolkitOAuthProvider(meta.apiKey, continueUri, 'google.com'),
        probeIdentityToolkitOAuthProvider(meta.apiKey, continueUri, 'github.com'),
        probeIdentityToolkitOAuthProvider(meta.apiKey, continueUri, 'apple.com'),
        probeIdentityToolkitOAuthProvider(meta.apiKey, continueUri, 'microsoft.com'),
        probeIdentityToolkitOAuthProvider(meta.apiKey, continueUri, 'facebook.com'),
        probeIdentityToolkitPasswordProvider(meta.apiKey),
        probeIdentityToolkitProjectConfig(meta.apiKey),
      ]);

    const result: LiveAuthProviderProbeResult = {
      checkedAtMs: Date.now(),
      authorizedDomains: projectMeta.authorizedDomains,
      enabledMap: {
        'google.com': googleOk || meta.hasGoogleOAuthClient,
        'github.com': githubOk,
        'apple.com': appleOk,
        'microsoft.com': microsoftOk,
        'facebook.com': facebookOk,
        phone: projectMeta.recaptchaConfigured,
        password: passwordOk,
      },
    };
    cachedAuthProviderProbe = result;
    return result;
  })().finally(() => {
    inFlightAuthProviderProbe = null;
  });

  return inFlightAuthProviderProbe;
}

function loadFirebaseProjectId(): string {
  return loadFirebaseAuthMeta().projectId;
}

function getFirebaseAdminAuth() {
  if (getApps().length === 0) {
    initializeApp({ projectId: loadFirebaseProjectId() });
  }
  return getAuth();
}

async function verifyFirebaseBearerToken(req: Request): Promise<{
  uid: string;
  email?: string;
  emailVerified: boolean;
  idToken: string;
}> {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) {
    throw new Error('Authentication required. Please sign in and try again.');
  }
  const decoded = await getFirebaseAdminAuth().verifyIdToken(token);
  return {
    uid: decoded.uid,
    email: decoded.email,
    emailVerified: Boolean(decoded.email_verified),
    idToken: token,
  };
}

export function getStripeBillingConfig() {
  const secretKey = (process.env.STRIPE_SECRET_KEY || '').trim();
  const webhookSecret = (process.env.STRIPE_WEBHOOK_SECRET || '').trim();
  return {
    configured: Boolean(secretKey && (secretKey.startsWith('sk_') || secretKey.startsWith('rk_'))),
    webhookConfigured: Boolean(webhookSecret),
    secretKey,
    webhookSecret,
  };
}

function createBillingClient(): Stripe | null {
  const cfg = getStripeBillingConfig();
  if (!cfg.configured) return null;
  return new Stripe(cfg.secretKey);
}

function signVerificationAttestation(payload: string): string {
  const secret =
    (process.env.BILLING_SIGNING_SECRET || '').trim() ||
    (process.env.STRIPE_WEBHOOK_SECRET || '').trim() ||
    'nexora-session-attestation';
  return crypto.createHmac('sha256', secret).update(payload).digest('hex').slice(0, 32);
}

export const ALLOWED_GEMINI_CHAT_MODELS = [
  'gemini-4-carbon',
  'gemini-4-neon',
  'gemini-4-hydrogen',
  'gemini-3.1-flash-lite',
] as const;

export type GeminiChatModelId = (typeof ALLOWED_GEMINI_CHAT_MODELS)[number];

export const ALLOWED_VIDEO_ASPECT_RATIOS = ['16:9', '9:16'] as const;
export type VideoAspectRatio = (typeof ALLOWED_VIDEO_ASPECT_RATIOS)[number];

export const ALLOWED_ANIMATION_IMAGE_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export function getGeminiServerConfig() {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  return {
    configured: Boolean(apiKey),
    pushConfigured: isPushMessagingCredentialAvailable(),
    chatModels: [...ALLOWED_GEMINI_CHAT_MODELS],
    videoModel: 'gemini-omni-1.2-flash',
    videoAspectRatios: [...ALLOWED_VIDEO_ASPECT_RATIOS],
  };
}

export function createServerGeminiClient(): GoogleGenAI | null {
  return createServerGeminiClientOrNull();
}

export function mapGeminiUpstreamError(err: unknown): { status: number; message: string } {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === 'object' && err !== null && 'message' in err
      ? String((err as { message?: unknown }).message ?? '')
      : String(err || '');
  const numericStatus =
    typeof err === 'object' && err !== null && 'status' in err && typeof (err as { status?: unknown }).status === 'number'
      ? (err as { status: number }).status
      : undefined;
  const lower = raw.toLowerCase();

  if (
    numericStatus === 403 ||
    lower.includes('permission_denied') ||
    lower.includes('api_key_invalid') ||
    lower.includes('api key not valid') ||
    (numericStatus === 400 && lower.includes('api key'))
  ) {
    return {
      status: 403,
      message:
        'Gemini could not authorize this request. Please verify your GEMINI_API_KEY in AI Studio Settings > Secrets.',
    };
  }

  if (numericStatus === 429 || lower.includes('resource_exhausted') || lower.includes('quota')) {
    return {
      status: 429,
      message:
        'Quota limit or billing requirement reached for this Gemini model. Paid models (gemini-4-carbon, gemini-4-neon, and gemini-omni-1.2-flash) require a billing-enabled key in AI Studio Settings > Secrets.',
    };
  }

  if (numericStatus === 404 || lower.includes('not_found')) {
    return {
      status: 404,
      message: 'The selected Gemini model could not be found or is temporarily unavailable.',
    };
  }

  if (lower.includes('safety') || lower.includes('blocked')) {
    return {
      status: 422,
      message: 'The prompt or uploaded photo could not be processed due to content safety policies.',
    };
  }

  return {
    status: 502,
    message: 'Gemini is temporarily unable to process this request. Please try again shortly.',
  };
}

export async function createNexoraServer(httpServer?: http.Server) {
  const app = express();

  // Stripe Webhook MUST receive raw body before express.json()
  app.post(
    '/api/billing/webhook',
    express.raw({ type: 'application/json' }),
    (req: Request, res: Response) => {
      const stripe = createBillingClient();
      const cfg = getStripeBillingConfig();
      if (!stripe || !cfg.webhookConfigured) {
        res.status(503).json({ error: 'Billing webhook is not configured on this server.' });
        return;
      }
      const sig = req.headers['stripe-signature'];
      if (typeof sig !== 'string' || !sig) {
        res.status(400).json({ error: 'Missing webhook signature header.' });
        return;
      }
      try {
        const event = stripe.webhooks.constructEvent(req.body as Buffer, sig, cfg.webhookSecret);
        res.status(200).json({ received: true, eventType: event.type });
      } catch {
        res.status(400).json({ error: 'Invalid billing webhook signature.' });
      }
    }
  );

  // Interactions API image-to-video route (scoped 16mb JSON body limit for uploaded photos)
  app.post(
    '/api/ai/animate-image',
    express.json({ limit: '16mb' }),
    async (req: Request, res: Response) => {
      try {
        await verifyFirebaseBearerToken(req);
      } catch {
        res.status(401).json({ error: 'Please sign in with your verified account before generating AI video.' });
        return;
      }

      const ai = createServerGeminiClient();
      if (!ai) {
        res.status(503).json({
          error: 'GEMINI_API_KEY is not configured on the server. Add your key in AI Studio Settings > Secrets.',
        });
        return;
      }

      const body = (req.body || {}) as {
        imageBase64?: unknown;
        mimeType?: unknown;
        prompt?: unknown;
        aspectRatio?: unknown;
      };

      const aspectRatio =
        typeof body.aspectRatio === 'string' &&
        (ALLOWED_VIDEO_ASPECT_RATIOS as readonly string[]).includes(body.aspectRatio)
          ? (body.aspectRatio as VideoAspectRatio)
          : null;
      if (!aspectRatio) {
        res.status(400).json({ error: "Aspect ratio must be '16:9' (landscape) or '9:16' (portrait)." });
        return;
      }

      const mimeType =
        typeof body.mimeType === 'string' &&
        (ALLOWED_ANIMATION_IMAGE_MIMES as readonly string[]).includes(body.mimeType.trim().toLowerCase())
          ? body.mimeType.trim().toLowerCase()
          : null;
      if (!mimeType) {
        res.status(400).json({ error: 'Please upload a valid PNG, JPEG, or WebP photo.' });
        return;
      }

      const rawBase64 = typeof body.imageBase64 === 'string' ? body.imageBase64.replace(/\s+/g, '') : '';
      if (!rawBase64 || !/^[A-Za-z0-9+/=]+$/.test(rawBase64)) {
        res.status(400).json({ error: 'Uploaded photo payload is missing or invalid.' });
        return;
      }
      const byteSize = Math.floor((rawBase64.length * 3) / 4);
      if (byteSize > 11 * 1024 * 1024) {
        res.status(413).json({ error: 'Uploaded photo is too large. Please choose an image under 10 MB.' });
        return;
      }

      const motionPrompt =
        typeof body.prompt === 'string' && body.prompt.trim().length > 0
          ? body.prompt.trim().slice(0, 2000)
          : 'Subtle cinematic camera motion bringing the scene and natural lighting to life.';

      try {
        const interaction = await ai.interactions.create(
          {
            model: 'gemini-omni-1.2-flash',
            input: [
              {
                type: 'image',
                mime_type: mimeType,
                data: rawBase64,
              },
              {
                type: 'text',
                text: motionPrompt,
              },
            ],
            background: false,
            store: false,
            stream: false,
            response_format: {
              type: 'video',
              aspect_ratio: aspectRatio,
            },
          },
          { timeout: 300000 }
        );

        let videoPart = interaction.output_video;
        if (!videoPart && Array.isArray(interaction.steps)) {
          for (const step of interaction.steps) {
            if (step.type === 'model_output' && Array.isArray(step.content)) {
              const found = step.content.find((c) => c.type === 'video');
              if (found) {
                videoPart = found as unknown as typeof interaction.output_video;
              }
            }
          }
        }

        if (!videoPart || (!videoPart.data && !videoPart.uri)) {
          res.status(502).json({
            error: 'Video generation finished without returning a video output. Please try a different photo or prompt.',
          });
          return;
        }

        res.json({
          interactionId: interaction.id,
          model: 'gemini-omni-1.2-flash',
          aspectRatio,
          mimeType: videoPart.mime_type || 'video/mp4',
          videoBase64: videoPart.data || null,
          videoUri: videoPart.uri || null,
        });
      } catch (err) {
        const mapped = mapGeminiUpstreamError(err);
        res.status(mapped.status).json({ error: mapped.message });
      }
    }
  );

  app.use(express.json({ limit: '512kb' }));

  app.get('/api/ai/status', (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(getGeminiServerConfig());
  });

  app.get('/api/ai/quota', async (req: Request, res: Response) => {
    let authedUser: { uid: string; email?: string; emailVerified: boolean; idToken: string };
    try {
      authedUser = await verifyFirebaseBearerToken(req);
    } catch {
      res.status(401).json({ error: 'Please sign in with your verified account to view Nexora AI quota.' });
      return;
    }

    const [settings, caller] = await Promise.all([
      loadGlobalAiSettings(authedUser.idToken),
      resolveCallerTierAndRole(authedUser),
    ]);
    const quota = await getQuotaSnapshot({
      uid: authedUser.uid,
      tier: caller.tier,
      isOwner: caller.isOwner,
      settings,
      idToken: authedUser.idToken,
    });
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      ...quota,
      globalEnabled: settings.enabled,
      defaultModel: settings.defaultModel,
      welcomeEnabled: settings.welcomeEnabled,
    });
  });

  app.post('/api/ai/chat', async (req: Request, res: Response) => {
    let authedUser: { uid: string; email?: string; emailVerified: boolean; idToken: string };
    try {
      authedUser = await verifyFirebaseBearerToken(req);
    } catch {
      res.status(401).json({ error: 'Please sign in with your verified account before chatting with Nexora AI.' });
      return;
    }

    const body = (req.body || {}) as {
      model?: unknown;
      systemInstruction?: unknown;
      history?: unknown;
      message?: unknown;
    };

    const model =
      typeof body.model === 'string' &&
      (ALLOWED_GEMINI_CHAT_MODELS as readonly string[]).includes(body.model)
        ? (body.model as GeminiChatModelId)
        : null;
    if (!model) {
      res.status(400).json({ error: 'Please choose a supported Gemini model.' });
      return;
    }

    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (!message || message.length > 16_000) {
      res.status(400).json({ error: 'Please enter a message up to 16,000 characters.' });
      return;
    }

    const [settings, caller] = await Promise.all([
      loadGlobalAiSettings(authedUser.idToken),
      resolveCallerTierAndRole(authedUser),
    ]);

    const prohibited = findProhibitedTopicMatch(message, settings.prohibitedTopics);
    if (prohibited) {
      res.status(422).json({
        error: `This request touches a restricted safety topic (${prohibited}) and cannot be answered by Nexora AI.`,
      });
      return;
    }

    const quota = await enforceAndTrackAiQuota({
      uid: authedUser.uid,
      tier: caller.tier,
      isOwner: caller.isOwner,
      settings,
      idToken: authedUser.idToken,
    });
    if (!quota.allowed) {
      res.status(quota.statusCode).json({ error: quota.reason || 'Nexora AI quota exceeded.', quota });
      return;
    }

    const ai = createServerGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: 'GEMINI_API_KEY is not configured on the server. Add your key in AI Studio Settings > Secrets.',
      });
      return;
    }

    const systemInstruction = buildNexoraSystemInstruction({
      settings,
      customInstruction:
        typeof body.systemInstruction === 'string' && body.systemInstruction.trim().length > 0
          ? body.systemInstruction.trim().slice(0, 3500)
          : undefined,
    });

    const formattedHistory: { role: 'user' | 'model'; parts: { text: string }[] }[] = [];
    if (Array.isArray(body.history)) {
      for (const item of body.history.slice(-40)) {
        if (
          typeof item === 'object' &&
          item !== null &&
          ((item as { role?: unknown }).role === 'user' || (item as { role?: unknown }).role === 'model') &&
          typeof (item as { text?: unknown }).text === 'string'
        ) {
          const text = ((item as { text: string }).text || '').trim().slice(0, 16_000);
          if (text) {
            formattedHistory.push({
              role: (item as { role: 'user' | 'model' }).role,
              parts: [{ text }],
            });
          }
        }
      }
    }

    try {
      const chat = ai.chats.create({
        model,
        config: {
          systemInstruction,
        },
        history: formattedHistory,
      });

      const response = await chat.sendMessage({
        message,
      });

      const usage = extractTokenUsage(response, model);
      const nextUsage = await recordCompletedAiUsage({
        uid: authedUser.uid,
        tier: caller.tier,
        promptTokens: usage.promptTokens,
        outputTokens: usage.outputTokens,
        totalTokens: usage.totalTokens,
        estimatedCostUsd: usage.estimatedCostUsd,
        idToken: authedUser.idToken,
      });

      res.json({
        model,
        reply: response.text || '',
        usage,
        quota: {
          tier: caller.tier,
          isOwner: caller.isOwner,
          dailyLimit: quota.dailyLimit,
          dailyUsed: nextUsage.requestsCount,
          remaining: Math.max(0, quota.dailyLimit - nextUsage.requestsCount),
          rateLimitPerMinute: quota.rateLimitPerMinute,
        },
      });
    } catch (err) {
      const mapped = mapGeminiUpstreamError(err);
      res.status(mapped.status).json({ error: mapped.message });
    }
  });

  app.post('/api/ai/community-reply', async (req: Request, res: Response) => {
    let authedUser: { uid: string; email?: string; emailVerified: boolean; idToken: string };
    try {
      authedUser = await verifyFirebaseBearerToken(req);
    } catch {
      res.status(401).json({ error: 'Authentication required for community AI interaction.' });
      return;
    }

    const body = (req.body || {}) as {
      targetType?: unknown;
      channelId?: unknown;
      channelName?: unknown;
      senderId?: unknown;
      senderName?: unknown;
      text?: unknown;
      isAi?: unknown;
      isNewParticipant?: unknown;
      recentMessages?: unknown;
    };

    const targetType =
      body.targetType === 'space' || body.targetType === 'group_chat' || body.targetType === 'private_dm'
        ? body.targetType
        : null;
    if (!targetType) {
      res.status(400).json({ error: 'Invalid community targetType.' });
      return;
    }

    if (targetType === 'private_dm') {
      res.status(403).json({
        responded: false,
        error: 'Privacy boundary: Nexora AI never automatically monitors private 1-on-1 direct messages.',
      });
      return;
    }

    const channelId = typeof body.channelId === 'string' ? body.channelId.trim().slice(0, 128) : '';
    const text = typeof body.text === 'string' ? body.text.trim().slice(0, 2000) : '';
    if (!channelId || !text) {
      res.status(400).json({ error: 'channelId and message text are required.' });
      return;
    }

    const [settings, caller, channelConfig] = await Promise.all([
      loadGlobalAiSettings(authedUser.idToken),
      resolveCallerTierAndRole(authedUser),
      loadChannelAiConfig(channelId, authedUser.idToken),
    ]);

    const decision = evaluateCommunityAiDecision({
      targetType,
      channelId,
      channelName: typeof body.channelName === 'string' ? body.channelName.slice(0, 80) : undefined,
      senderId: typeof body.senderId === 'string' ? body.senderId : authedUser.uid,
      senderName: typeof body.senderName === 'string' ? body.senderName.slice(0, 80) : 'Member',
      text,
      isAi: body.isAi === true,
      isNewParticipant: body.isNewParticipant === true,
      globalSettings: settings,
      channelConfig,
    });

    if (decision.prohibitedTopic) {
      res.status(422).json({
        responded: false,
        decision,
        error: decision.reason,
      });
      return;
    }

    if (!decision.shouldRespond) {
      res.json({ responded: false, decision });
      return;
    }

    const quota = await enforceAndTrackAiQuota({
      uid: authedUser.uid,
      tier: caller.tier,
      isOwner: caller.isOwner,
      settings,
      idToken: authedUser.idToken,
    });
    if (!quota.allowed) {
      res.status(quota.statusCode).json({ responded: false, error: quota.reason, decision });
      return;
    }

    const ai = createServerGeminiClient();
    if (!ai) {
      res.status(503).json({
        responded: false,
        error: 'GEMINI_API_KEY is not configured on the server.',
        decision,
      });
      return;
    }

    const channelLabel =
      channelConfig?.channelName ||
      (typeof body.channelName === 'string' ? body.channelName.trim().slice(0, 80) : 'Community Channel');
    const recentLines: string[] = [];
    if (Array.isArray(body.recentMessages)) {
      for (const m of body.recentMessages.slice(-8)) {
        if (m && typeof m === 'object') {
          const author = typeof (m as { author?: unknown }).author === 'string' ? (m as { author: string }).author : 'Member';
          const content = typeof (m as { text?: unknown }).text === 'string' ? (m as { text: string }).text : '';
          if (content.trim()) {
            recentLines.push(`${author.slice(0, 40)}: ${content.trim().slice(0, 300)}`);
          }
        }
      }
    }

    const modeContext = [
      `Context: You are replying inside the Nexora ${targetType === 'space' ? 'Space discussion channel' : 'Group Chat'} "${channelLabel}".`,
      `Trigger mode: ${decision.modeUsed === 'mode_a_direct' ? 'Direct mention/invitation (Mode A)' : 'Natural community participation (Mode B)'}.`,
      'Keep your response concise (2-5 sentences), natural, welcoming, accurate, and community-safe.',
    ].join('\n');

    const promptText = [
      recentLines.length > 0 ? `Recent messages:\n${recentLines.join('\n')}` : '',
      `Latest message from ${typeof body.senderName === 'string' ? body.senderName.slice(0, 60) : 'Member'}: "${text}"`,
      'Respond naturally as Nexora AI:',
    ]
      .filter(Boolean)
      .join('\n\n');

    try {
      const model = settings.defaultModel;
      const response = await ai.models.generateContent({
        model,
        contents: promptText,
        config: {
          systemInstruction: buildNexoraSystemInstruction({ settings, modeContext }),
        },
      });

      markChannelBotReplied(channelId);
      const usage = extractTokenUsage(response, model);
      await recordCompletedAiUsage({
        uid: authedUser.uid,
        tier: caller.tier,
        promptTokens: usage.promptTokens,
        outputTokens: usage.outputTokens,
        totalTokens: usage.totalTokens,
        estimatedCostUsd: usage.estimatedCostUsd,
        idToken: authedUser.idToken,
      });

      res.json({
        responded: true,
        model,
        reply: (response.text || '').trim().slice(0, 1000),
        decision,
        usage,
      });
    } catch (err) {
      const mapped = mapGeminiUpstreamError(err);
      res.status(mapped.status).json({ responded: false, error: mapped.message, decision });
    }
  });

  app.post('/api/ai/welcome', async (req: Request, res: Response) => {
    let authedUser: { uid: string; email?: string; emailVerified: boolean; idToken: string };
    try {
      authedUser = await verifyFirebaseBearerToken(req);
    } catch {
      res.status(401).json({ error: 'Authentication required to generate a welcome message.' });
      return;
    }

    const body = (req.body || {}) as {
      displayName?: unknown;
      username?: unknown;
      providerId?: unknown;
    };
    const [settings, caller] = await Promise.all([
      loadGlobalAiSettings(authedUser.idToken),
      resolveCallerTierAndRole(authedUser),
    ]);

    if (!settings.welcomeEnabled || !settings.enabled) {
      res.json({
        generated: false,
        disabled: true,
        configured: Boolean((process.env.GEMINI_API_KEY || '').trim()),
        reason: 'Automated AI welcome messages are currently disabled in Nexora AI settings.',
        messageText: '',
      });
      return;
    }

    const ai = createServerGeminiClient();
    if (!ai) {
      res.status(503).json({
        generated: false,
        configured: false,
        reason: 'GEMINI_API_KEY is not configured on the server.',
        messageText: '',
      });
      return;
    }

    const displayName =
      typeof body.displayName === 'string' && body.displayName.trim()
        ? body.displayName.trim().slice(0, 80)
        : 'Creator';
    const username =
      typeof body.username === 'string' && body.username.trim()
        ? body.username.trim().slice(0, 30)
        : 'member';

    try {
      const model = settings.defaultModel;
      const response = await ai.models.generateContent({
        model,
        contents: `Generate a warm, personalized onboarding welcome message for new Nexora member ${displayName} (@${username}). Template guidance: ${settings.welcomePromptTemplate}. Keep it concise (3-4 sentences max) and welcoming.`,
        config: {
          systemInstruction: buildNexoraSystemInstruction({
            settings,
            modeContext: 'Task: Personalized member welcome onboarding message.',
          }),
        },
      });

      const usage = extractTokenUsage(response, model);
      await recordCompletedAiUsage({
        uid: authedUser.uid,
        tier: caller.tier,
        promptTokens: usage.promptTokens,
        outputTokens: usage.outputTokens,
        totalTokens: usage.totalTokens,
        estimatedCostUsd: usage.estimatedCostUsd,
        idToken: authedUser.idToken,
      });

      res.json({
        generated: true,
        configured: true,
        model,
        messageText: (response.text || '').trim().slice(0, 600),
        usage,
      });
    } catch (err) {
      const mapped = mapGeminiUpstreamError(err);
      res.status(mapped.status).json({
        generated: false,
        configured: true,
        error: mapped.message,
      });
    }
  });

  app.post('/api/ai/draft-announcement', async (req: Request, res: Response) => {
    let authedUser: { uid: string; email?: string; emailVerified: boolean; idToken: string };
    try {
      authedUser = await verifyFirebaseBearerToken(req);
    } catch {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const [settings, caller] = await Promise.all([
      loadGlobalAiSettings(authedUser.idToken),
      resolveCallerTierAndRole(authedUser),
    ]);
    const canDraft =
      caller.isOwner ||
      caller.permissions.includes('manage_notifications') ||
      caller.permissions.includes('manage_platform');
    if (!canDraft) {
      res.status(403).json({ error: 'Only authorized administrators or the Owner can draft official announcements.' });
      return;
    }

    const ai = createServerGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: 'GEMINI_API_KEY is not configured on the server. Add your key in AI Studio Settings > Secrets.',
      });
      return;
    }

    const body = (req.body || {}) as {
      category?: unknown;
      audience?: unknown;
      topic?: unknown;
    };
    const category = typeof body.category === 'string' ? body.category.trim().slice(0, 40) : 'product_release';
    const audience = typeof body.audience === 'string' ? body.audience.trim().slice(0, 20) : 'all';
    const topic = typeof body.topic === 'string' ? body.topic.trim().slice(0, 600) : '';
    if (!topic) {
      res.status(400).json({ error: 'Please describe the announcement topic or notes first.' });
      return;
    }

    try {
      const model = settings.defaultModel;
      const response = await ai.models.generateContent({
        model,
        contents: [
          `Draft a Nexora platform announcement as JSON with keys "title" (max 90 chars), "summary" (max 180 chars), and "body" (max 480 chars).`,
          `Category: ${category}`,
          `Target audience: ${audience}`,
          `Topic / Admin Notes: ${topic}`,
          `Official links you may reference: Web ${settings.officialLinks.webAppUrl}, Android ${settings.officialLinks.androidApkUrl}, Support ${settings.officialLinks.supportUrl}.`,
          'Return valid JSON only without markdown fences.',
        ].join('\n'),
        config: {
          systemInstruction: buildNexoraSystemInstruction({
            settings,
            modeContext: 'Task: Draft clear, trustworthy, polished official Nexora platform announcements.',
          }),
        },
      });

      const rawText = (response.text || '').trim().replace(/^```json\s*/i, '').replace(/```$/, '').trim();
      let parsed: { title?: string; summary?: string; body?: string } = {};
      try {
        parsed = JSON.parse(rawText) as { title?: string; summary?: string; body?: string };
      } catch {
        parsed = {
          title: `Nexora ${category.replace(/_/g, ' ')} Update`,
          summary: rawText.slice(0, 180),
          body: rawText.slice(0, 480),
        };
      }

      const usage = extractTokenUsage(response, model);
      await recordCompletedAiUsage({
        uid: authedUser.uid,
        tier: caller.tier,
        promptTokens: usage.promptTokens,
        outputTokens: usage.outputTokens,
        totalTokens: usage.totalTokens,
        estimatedCostUsd: usage.estimatedCostUsd,
        idToken: authedUser.idToken,
      });

      res.json({
        model,
        title: String(parsed.title || 'Nexora Platform Update').slice(0, 100),
        summary: String(parsed.summary || '').slice(0, 200),
        body: String(parsed.body || '').slice(0, 500),
        usage,
      });
    } catch (err) {
      const mapped = mapGeminiUpstreamError(err);
      res.status(mapped.status).json({ error: mapped.message });
    }
  });

  app.post('/api/ai/draft-release', async (req: Request, res: Response) => {
    let authedUser: { uid: string; email?: string; emailVerified: boolean; idToken: string };
    try {
      authedUser = await verifyFirebaseBearerToken(req);
    } catch {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const [settings, caller] = await Promise.all([
      loadGlobalAiSettings(authedUser.idToken),
      resolveCallerTierAndRole(authedUser),
    ]);
    const canManageReleases =
      caller.isOwner ||
      caller.permissions.includes('manage_platform') ||
      caller.permissions.includes('manage_notifications');
    if (!canManageReleases) {
      res.status(403).json({ error: 'Only authorized administrators or the Owner can generate release notes.' });
      return;
    }

    const body = (req.body || {}) as {
      versionName?: unknown;
      platform?: unknown;
      highlights?: unknown;
      releaseStatus?: unknown;
      action?: unknown;
    };

    if (body.action === 'announce' && body.releaseStatus === 'draft') {
      res.status(400).json({
        error: 'Draft or unpublished releases cannot be announced globally. Publish and obtain Owner approval first.',
      });
      return;
    }

    const ai = createServerGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: 'GEMINI_API_KEY is not configured on the server. Add your key in AI Studio Settings > Secrets.',
      });
      return;
    }

    const androidRelease = getAndroidReleaseStatus(__dirname);
    const versionName =
      typeof body.versionName === 'string' && body.versionName.trim()
        ? body.versionName.trim().slice(0, 40)
        : androidRelease.versionName;
    const platform =
      body.platform === 'android' || body.platform === 'all' ? body.platform : 'web';
    const highlights =
      typeof body.highlights === 'string' && body.highlights.trim()
        ? body.highlights.trim().slice(0, 800)
        : 'Performance improvements, enhanced security, and new community features.';

    try {
      const model = settings.defaultModel;
      const response = await ai.models.generateContent({
        model,
        contents: [
          `Write official Nexora release notes as JSON with keys "title" (max 90 chars), "summary" (max 180 chars), and "releaseNotes" (max 500 chars).`,
          `Version: ${versionName} (${platform})`,
          `Android APK available on server: ${androidRelease.available ? 'Yes' : 'Not yet built'} (${settings.officialLinks.androidApkUrl})`,
          `Web App URL: ${settings.officialLinks.webAppUrl}`,
          `Engineering Highlights: ${highlights}`,
          'Only state verifiable links and facts provided above. Return valid JSON only.',
        ].join('\n'),
        config: {
          systemInstruction: buildNexoraSystemInstruction({
            settings,
            modeContext: 'Task: Accurate Nexora version release notes generator.',
          }),
        },
      });

      const rawText = (response.text || '').trim().replace(/^```json\s*/i, '').replace(/```$/, '').trim();
      let parsed: { title?: string; summary?: string; releaseNotes?: string } = {};
      try {
        parsed = JSON.parse(rawText) as { title?: string; summary?: string; releaseNotes?: string };
      } catch {
        parsed = {
          title: `Nexora v${versionName} Release`,
          summary: rawText.slice(0, 180),
          releaseNotes: rawText.slice(0, 500),
        };
      }

      const usage = extractTokenUsage(response, model);
      await recordCompletedAiUsage({
        uid: authedUser.uid,
        tier: caller.tier,
        promptTokens: usage.promptTokens,
        outputTokens: usage.outputTokens,
        totalTokens: usage.totalTokens,
        estimatedCostUsd: usage.estimatedCostUsd,
        idToken: authedUser.idToken,
      });

      res.json({
        model,
        versionName,
        platform,
        androidAvailable: androidRelease.available,
        downloadUrl: androidRelease.available ? androidRelease.downloadUrl || settings.officialLinks.androidApkUrl : settings.officialLinks.webAppUrl,
        title: String(parsed.title || `Nexora v${versionName} is live`).slice(0, 100),
        summary: String(parsed.summary || '').slice(0, 200),
        releaseNotes: String(parsed.releaseNotes || '').slice(0, 500),
        usage,
      });
    } catch (err) {
      const mapped = mapGeminiUpstreamError(err);
      res.status(mapped.status).json({ error: mapped.message });
    }
  });

  app.get('/api/push/status', (_req: Request, res: Response) => {
    const configured = isPushMessagingCredentialAvailable();
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      configured,
      message: configured
        ? 'Firebase Cloud Messaging server credentials detected.'
        : 'Server push credentials (GOOGLE_APPLICATION_CREDENTIALS or Firebase Cloud Functions) are not configured on this runtime. Device tokens are saved cleanly in Firestore.',
    });
  });

  app.post('/api/push/send', async (req: Request, res: Response) => {
    let authedUser: { uid: string; email?: string; emailVerified: boolean; idToken: string };
    try {
      authedUser = await verifyFirebaseBearerToken(req);
    } catch {
      res.status(401).json({ error: 'Authentication required to send push notifications.' });
      return;
    }

    const body = (req.body || {}) as {
      tokens?: unknown;
      title?: unknown;
      body?: unknown;
      link?: unknown;
      purpose?: unknown;
      targetUid?: unknown;
    };

    const caller = await resolveCallerTierAndRole(authedUser);
    const isSelfWelcome = body.purpose === 'self_welcome' && body.targetUid === authedUser.uid;
    const allowed =
      caller.isOwner || caller.permissions.includes('manage_notifications') || isSelfWelcome;
    if (!allowed) {
      res.status(403).json({ error: 'Insufficient permissions to dispatch global push notifications.' });
      return;
    }

    const tokens = Array.isArray(body.tokens)
      ? body.tokens.filter((t): t is string => typeof t === 'string')
      : [];
    const title = typeof body.title === 'string' ? body.title.trim() : 'Nexora';
    const messageBody = typeof body.body === 'string' ? body.body.trim() : '';
    if (!messageBody) {
      res.status(400).json({ error: 'Notification body is required.' });
      return;
    }

    const outcome = await dispatchPushTokens({
      tokens,
      title,
      body: messageBody,
      link: typeof body.link === 'string' ? body.link : undefined,
    });
    res.json(outcome);
  });

  app.get('/api/auth/providers', async (_req: Request, res: Response) => {
    const meta = loadFirebaseAuthMeta();
    const callbackUrl = `https://${meta.authDomain}/__/auth/handler`;
    const probe = await getLiveFirebaseAuthProviderStatus(meta);
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      projectId: meta.projectId,
      authDomain: meta.authDomain,
      callbackUrl,
      authorizedDomains: probe.authorizedDomains,
      providers: [
        {
          id: 'google.com',
          label: 'Google',
          type: 'oauth',
          provisionedInConfig: Boolean(probe.enabledMap['google.com']),
          requiresExternalCredentials: false,
          setupNote: probe.enabledMap['google.com']
            ? 'Google Sign-In is enabled and ready.'
            : 'Enable Google in Firebase Console -> Authentication -> Sign-in method -> Google.',
        },
        {
          id: 'github.com',
          label: 'GitHub',
          type: 'oauth',
          provisionedInConfig: Boolean(probe.enabledMap['github.com']),
          requiresExternalCredentials: true,
          setupNote: probe.enabledMap['github.com']
            ? 'GitHub Sign-In is enabled and ready.'
            : `Requires GitHub OAuth App Client ID & Client Secret in Firebase Console -> Authentication -> Sign-in method -> GitHub (callback: ${callbackUrl}).`,
        },
        {
          id: 'apple.com',
          label: 'Apple',
          type: 'oauth',
          provisionedInConfig: Boolean(probe.enabledMap['apple.com']),
          requiresExternalCredentials: true,
          setupNote: probe.enabledMap['apple.com']
            ? 'Apple Sign-In is enabled and ready.'
            : `Requires Apple Services ID, Team ID, Key ID, and private key (.p8) in Firebase Console -> Authentication -> Sign-in method -> Apple (callback: ${callbackUrl}).`,
        },
        {
          id: 'microsoft.com',
          label: 'Microsoft',
          type: 'oauth',
          provisionedInConfig: Boolean(probe.enabledMap['microsoft.com']),
          requiresExternalCredentials: true,
          setupNote: probe.enabledMap['microsoft.com']
            ? 'Microsoft Sign-In is enabled and ready.'
            : `Requires Microsoft Entra ID Application (client) ID & Client Secret in Firebase Console -> Authentication -> Sign-in method -> Microsoft (callback: ${callbackUrl}).`,
        },
        {
          id: 'facebook.com',
          label: 'Facebook',
          type: 'oauth',
          provisionedInConfig: Boolean(probe.enabledMap['facebook.com']),
          requiresExternalCredentials: true,
          setupNote: probe.enabledMap['facebook.com']
            ? 'Facebook Sign-In is enabled and ready.'
            : `Requires Meta/Facebook App ID & App Secret in Firebase Console -> Authentication -> Sign-in method -> Facebook (callback: ${callbackUrl}).`,
        },
        {
          id: 'phone',
          label: 'Phone Number',
          type: 'sms_otp',
          provisionedInConfig: Boolean(probe.enabledMap.phone),
          requiresExternalCredentials: false,
          setupNote:
            'Uses Firebase Phone Authentication (SMS OTP + reCAPTCHA). Ensure Phone provider and authorized domains are enabled in Firebase Console.',
        },
        {
          id: 'password',
          label: 'Email & Password',
          type: 'email_password',
          provisionedInConfig: Boolean(probe.enabledMap.password),
          requiresExternalCredentials: false,
          setupNote: probe.enabledMap.password
            ? 'Email & Password authentication is enabled and ready.'
            : 'Enable Email/Password in Firebase Console -> Authentication -> Sign-in method -> Email/Password.',
        },
      ],
    });
  });

  app.get('/api/billing/status', (_req: Request, res: Response) => {
    const cfg = getStripeBillingConfig();
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      configured: cfg.configured,
      provider: cfg.configured ? 'stripe' : 'none',
      webhookConfigured: cfg.webhookConfigured,
      message: cfg.configured
        ? 'Stripe online billing is active and ready.'
        : 'Online payment processing is awaiting Stripe server configuration (STRIPE_SECRET_KEY).',
    });
  });

  app.post('/api/billing/create-checkout-session', async (req: Request, res: Response) => {
    let authedUser: { uid: string; email?: string };
    try {
      authedUser = await verifyFirebaseBearerToken(req);
    } catch {
      res.status(401).json({ error: 'Please sign in with your verified account before continuing.' });
      return;
    }

    const stripe = createBillingClient();
    if (!stripe) {
      res.status(503).json({
        error: 'Online checkout is temporarily unavailable because payment processing is not configured.',
      });
      return;
    }

    const body = (req.body || {}) as {
      tier?: string;
      billingCycle?: string;
      stripePriceId?: string;
      unitAmountCents?: number;
      currency?: string;
      planName?: string;
      originUrl?: string;
    };

    const tier = body.tier === 'plus' || body.tier === 'pro' ? body.tier : null;
    const billingCycle = body.billingCycle === 'yearly' ? 'yearly' : 'monthly';
    if (!tier) {
      res.status(400).json({ error: 'Please select Nexora Plus or Nexora Pro to check out.' });
      return;
    }

    const stripePriceId = typeof body.stripePriceId === 'string' ? body.stripePriceId.trim() : '';
    const unitAmount =
      typeof body.unitAmountCents === 'number' && Number.isFinite(body.unitAmountCents)
        ? Math.round(body.unitAmountCents)
        : 0;
    const currency =
      typeof body.currency === 'string' && /^[a-z]{3}$/i.test(body.currency)
        ? body.currency.toLowerCase()
        : 'usd';

    if (!stripePriceId && unitAmount <= 0) {
      res.status(400).json({
        error: 'Pricing for this plan has not been configured by the platform administrator yet.',
      });
      return;
    }

    const rawOrigin =
      (typeof body.originUrl === 'string' && /^https?:\/\//i.test(body.originUrl)
        ? body.originUrl
        : req.headers.origin) || `http://localhost:${PORT}`;
    const safeOrigin = String(rawOrigin).replace(/\/$/, '');

    try {
      const lineItem: Stripe.Checkout.SessionCreateParams.LineItem = stripePriceId
        ? { price: stripePriceId, quantity: 1 }
        : {
            price_data: {
              currency,
              unit_amount: unitAmount,
              recurring: { interval: billingCycle === 'yearly' ? 'year' : 'month' },
              product_data: {
                name: body.planName || (tier === 'pro' ? 'Nexora Pro' : 'Nexora Plus'),
                description: `Nexora ${tier.toUpperCase()} (${billingCycle}) subscription`,
              },
            },
            quantity: 1,
          };

      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [lineItem],
        customer_email: authedUser.email || undefined,
        success_url: `${safeOrigin}/?billing_session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${safeOrigin}/?billing_canceled=1`,
        client_reference_id: authedUser.uid,
        metadata: {
          uid: authedUser.uid,
          tier,
          billingCycle,
        },
      });

      res.json({ url: session.url, sessionId: session.id });
    } catch {
      res.status(502).json({
        error: 'We could not start your payment checkout session. Please try again shortly.',
      });
    }
  });

  app.get('/api/billing/verify-session', async (req: Request, res: Response) => {
    let authedUser: { uid: string; email?: string };
    try {
      authedUser = await verifyFirebaseBearerToken(req);
    } catch {
      res.status(401).json({ error: 'Please sign in to verify your payment.' });
      return;
    }

    const stripe = createBillingClient();
    if (!stripe) {
      res.status(503).json({ error: 'Billing verification service is unavailable.' });
      return;
    }

    const sessionId = typeof req.query.session_id === 'string' ? req.query.session_id.trim() : '';
    if (!sessionId.startsWith('cs_')) {
      res.status(400).json({ error: 'Invalid checkout session identifier.' });
      return;
    }

    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ['subscription'],
      });
      if (session.metadata?.uid !== authedUser.uid && session.client_reference_id !== authedUser.uid) {
        res.status(403).json({ error: 'This payment session does not belong to your account.' });
        return;
      }

      const isPaid = session.payment_status === 'paid' || session.status === 'complete';
      if (!isPaid) {
        res.status(402).json({ error: 'Payment has not been completed yet.' });
        return;
      }

      const tier = session.metadata?.tier === 'pro' ? 'pro' : 'plus';
      const billingCycle = session.metadata?.billingCycle === 'yearly' ? 'yearly' : 'monthly';
      const subObj =
        typeof session.subscription === 'object' && session.subscription !== null
          ? (session.subscription as Stripe.Subscription & { current_period_end?: number })
          : null;
      const periodEndSec = subObj?.current_period_end || Math.floor(Date.now() / 1000) + (billingCycle === 'yearly' ? 365 : 30) * 86400;
      const receiptNumber = `NXR-${session.id.slice(-8).toUpperCase()}`;
      const attestation = signVerificationAttestation(`${authedUser.uid}:${session.id}:${tier}`);

      res.json({
        verified: true,
        sessionId: session.id,
        tier,
        billingCycle,
        stripeCustomerId: typeof session.customer === 'string' ? session.customer : '',
        stripeSubscriptionId: subObj?.id || (typeof session.subscription === 'string' ? session.subscription : ''),
        amountCents: session.amount_total ?? 0,
        currency: session.currency || 'usd',
        currentPeriodEndMs: periodEndSec * 1000,
        receiptNumber,
        attestation,
      });
    } catch {
      res.status(502).json({ error: 'Unable to verify payment status right now. Please try again.' });
    }
  });

  app.post('/api/billing/cancel', async (req: Request, res: Response) => {
    try {
      await verifyFirebaseBearerToken(req);
    } catch {
      res.status(401).json({ error: 'Please sign in to manage your subscription.' });
      return;
    }
    const stripe = createBillingClient();
    const { stripeSubscriptionId } = (req.body || {}) as { stripeSubscriptionId?: string };
    if (!stripe) {
      res.status(503).json({ error: 'Online billing cancellation is unavailable without Stripe configuration.' });
      return;
    }
    if (!stripeSubscriptionId) {
      res.status(400).json({ error: 'Missing active subscription reference.' });
      return;
    }
    try {
      const updated = await stripe.subscriptions.update(stripeSubscriptionId, {
        cancel_at_period_end: true,
      });
      res.json({ canceledAtPeriodEnd: Boolean(updated.cancel_at_period_end) });
    } catch {
      res.status(502).json({ error: 'Could not cancel subscription with payment provider.' });
    }
  });

  app.post('/api/billing/refund', async (req: Request, res: Response) => {
    try {
      await verifyFirebaseBearerToken(req);
    } catch {
      res.status(401).json({ error: 'Authorisation required to issue refunds.' });
      return;
    }
    const stripe = createBillingClient();
    if (!stripe) {
      res.status(503).json({ error: 'Refunds require active Stripe configuration.' });
      return;
    }
    const { paymentIntentId, stripeSessionId } = (req.body || {}) as {
      paymentIntentId?: string;
      stripeSessionId?: string;
    };
    try {
      let targetPaymentIntent = paymentIntentId || '';
      if (!targetPaymentIntent && stripeSessionId?.startsWith('cs_')) {
        const sess = await stripe.checkout.sessions.retrieve(stripeSessionId);
        if (typeof sess.payment_intent === 'string') {
          targetPaymentIntent = sess.payment_intent;
        }
      }
      if (!targetPaymentIntent) {
        res.status(400).json({ error: 'No refundable payment reference found for this transaction.' });
        return;
      }
      const refund = await stripe.refunds.create({ payment_intent: targetPaymentIntent });
      res.json({ refunded: refund.status === 'succeeded' || refund.status === 'pending', refundId: refund.id });
    } catch {
      res.status(502).json({ error: 'Unable to process refund right now.' });
    }
  });

  app.get('/api/rewards/status', (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(getBankProviderStatus());
  });

  app.get('/api/rewards/banks', async (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'public, max-age=300');
    const result = await fetchNigerianBanks();
    res.json(result);
  });

  app.post('/api/rewards/resolve-bank', async (req: Request, res: Response) => {
    try {
      await verifyFirebaseBearerToken(req);
    } catch {
      res.status(401).json({ error: 'Please sign in with your verified account before verifying bank details.' });
      return;
    }

    const body = (req.body || {}) as { accountNumber?: unknown; bankCode?: unknown };
    const accountNumber = typeof body.accountNumber === 'string' ? body.accountNumber : '';
    const bankCode = typeof body.bankCode === 'string' ? body.bankCode : '';

    const resolution = await resolveNigerianBankAccount(accountNumber, bankCode);
    res.setHeader('Cache-Control', 'no-store');
    res.json(resolution);
  });

  app.get('/api/health', (_req: Request, res: Response) => {
    const emailConfig = getEmailProviderConfig();
    res.json({
      ok: true,
      service: 'nexora',
      emailConfigured: emailConfig.configured,
      emailProvider: emailConfig.provider,
    });
  });

  app.get('/api/app/android-release', (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(getAndroidReleaseStatus(__dirname));
  });

  app.get('/downloads/nexora-latest.apk', (_req: Request, res: Response) => {
    const localApk = findVerifiedLocalApk(__dirname);
    const status = getAndroidReleaseStatus(__dirname);
    if (localApk) {
      const safeVer = status.versionName.replace(/[^a-zA-Z0-9._-]/g, '') || '1.0.0';
      res.setHeader('Content-Type', 'application/vnd.android.package-archive');
      res.setHeader('Content-Disposition', `attachment; filename="nexora-v${safeVer}.apk"`);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.sendFile(localApk.path);
      return;
    }

    if (status.source === 'external_https' && status.downloadUrl) {
      res.redirect(302, status.downloadUrl);
      return;
    }

    res.status(404).json({
      available: false,
      error:
        'Nexora Android APK build has not been generated and published yet. Complete signing setup and run the Android TWA build workflow first.',
    });
  });

  app.get('/api/email/status', (_req: Request, res: Response) => {
    const emailConfig = getEmailProviderConfig();
    res.json({
      configured: emailConfig.configured,
      provider: emailConfig.provider,
      fromAddress: emailConfig.fromAddress,
      message: emailConfig.configured
        ? `Email provider ready (${emailConfig.provider.toUpperCase()}).`
        : 'Server email provider is not configured. In-app notifications work normally; set RESEND_API_KEY or SMTP_* to enable email delivery.',
    });
  });

  app.post('/api/email/send', async (req: Request, res: Response) => {
    const body = (req.body || {}) as Partial<EmailSendPayload>;
    const outcome = await dispatchNexoraEmail({
      to: String(body.to || ''),
      subject: String(body.subject || ''),
      title: body.title ? String(body.title) : undefined,
      bodyText: String(body.bodyText || ''),
      category: body.category ? String(body.category) : undefined,
      ctaLabel: body.ctaLabel ? String(body.ctaLabel) : undefined,
      ctaUrl: body.ctaUrl ? String(body.ctaUrl) : undefined,
      recipientName: body.recipientName ? String(body.recipientName) : undefined,
    });

    if (outcome.status === 'failed' && (!body.to || !body.subject || !body.bodyText)) {
      res.status(400).json(outcome);
      return;
    }

    res.status(200).json(outcome);
  });

  app.get('/.well-known/assetlinks.json', (_req: Request, res: Response) => {
    const rawFingerprints = (process.env.ANDROID_SHA256_FINGERPRINTS || '').trim();
    const fingerprints = rawFingerprints
      ? rawFingerprints
          .split(',')
          .map((fp) => fp.trim())
          .filter(Boolean)
      : [];

    if (fingerprints.length > 0) {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.status(200).json([
        {
          relation: ['delegate_permission/common.handle_all_urls'],
          target: {
            namespace: 'android_app',
            package_name: (process.env.ANDROID_PACKAGE_NAME || 'social.nexora.app').trim(),
            sha256_cert_fingerprints: fingerprints,
          },
        },
      ]);
      return;
    }

    const candidates = [
      path.resolve(__dirname, 'public', '.well-known', 'assetlinks.json'),
      path.resolve(__dirname, 'dist', '.well-known', 'assetlinks.json'),
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        res.setHeader('Content-Type', 'application/json');
        res.sendFile(candidate);
        return;
      }
    }

    res.status(404).json({ error: 'Asset links manifest not found' });
  });

  const isAssetLikePath = (reqPath: string) =>
    reqPath.startsWith('/api/') ||
    reqPath.startsWith('/assets/') ||
    reqPath.startsWith('/downloads/') ||
    /^\/workbox-[^/]+\.js$/i.test(reqPath) ||
    /\.(?:js|mjs|css|map|json|png|jpg|jpeg|webp|svg|ico|woff2?)$/i.test(reqPath);

  if (!IS_PRODUCTION) {
    const publicDir = path.resolve(__dirname, 'public');
    const devDistDir = path.resolve(__dirname, 'dev-dist');

    // In dev mode, prevent stale browser registrations of /sw.js from receiving index.html
    // (which triggers "Uncaught SyntaxError: Unexpected token '<'"). Serve a clean JS unregister script.
    app.get('/sw.js', (_req: Request, res: Response) => {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).send(
        "self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',(e)=>e.waitUntil(caches.keys().then((ks)=>Promise.all(ks.map((k)=>caches.delete(k)))).then(()=>self.registration.unregister())));"
      );
    });

    // Ensure /registerSW.js always returns valid JavaScript in dev mode (never SPA index.html)
    app.get('/registerSW.js', (_req: Request, res: Response) => {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      const devRegisterSw = path.join(devDistDir, 'registerSW.js');
      if (fs.existsSync(devRegisterSw)) {
        res.sendFile(devRegisterSw);
        return;
      }
      res
        .status(200)
        .send(
          "if('serviceWorker' in navigator) navigator.serviceWorker.register('/dev-sw.js?dev-sw', { scope: '/', type: 'classic' });"
        );
    });

    // Block Vite SPA HTML fallback for missing built /assets/*, /workbox-*.js, or missing JS/CSS chunks
    app.use((req: Request, res: Response, next) => {
      if (req.path.startsWith('/api/')) {
        res.status(404).json({ error: 'API route not found' });
        return;
      }

      if (/^\/workbox-[^/]+\.js$/i.test(req.path) || req.path === '/suppress-warnings.js') {
        const relPath = req.path.replace(/^\/+/, '');
        const resolvedDev = path.resolve(devDistDir, relPath);
        if (resolvedDev.startsWith(devDistDir + path.sep) && fs.existsSync(resolvedDev)) {
          res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
          res.sendFile(resolvedDev);
          return;
        }
        if (req.path === '/suppress-warnings.js') {
          res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
          res.status(200).send('');
          return;
        }
        const resolvedPublic = path.resolve(publicDir, relPath);
        if (resolvedPublic.startsWith(publicDir + path.sep) && fs.existsSync(resolvedPublic)) {
          next();
          return;
        }
        res.status(404).json({ error: 'Workbox script not found in dev mode' });
        return;
      }

      const isViteModulePath =
        req.path.startsWith('/src/') ||
        req.path.startsWith('/node_modules/') ||
        req.path.startsWith('/@') ||
        req.path === '/dev-sw.js';

      if (
        !isViteModulePath &&
        (req.path.startsWith('/assets/') || /\.(?:js|mjs|css|map)$/i.test(req.path))
      ) {
        const relPath = req.path.replace(/^\/+/, '');
        const resolvedPublic = path.resolve(publicDir, relPath);
        if (resolvedPublic.startsWith(publicDir + path.sep) && fs.existsSync(resolvedPublic)) {
          next();
          return;
        }
        res.status(404).json({ error: 'Asset not found in dev mode' });
        return;
      }

      next();
    });

    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr:
          process.env.DISABLE_HMR === 'true'
            ? false
            : httpServer
            ? { server: httpServer }
            : true,
        ws: httpServer
          ? { server: httpServer }
          : process.env.DISABLE_HMR === 'true'
          ? false
          : undefined,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (req: Request, res: Response) => {
      if (isAssetLikePath(req.path)) {
        res.status(404).json({ error: 'Resource not found' });
        return;
      }
      const indexHtml = path.join(distDir, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Production bundle not found. Run npm run build.');
      }
    });
  }

  return app;
}

const isDirectEntry =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);

if (isDirectEntry) {
  const httpServer = http.createServer();
  createNexoraServer(httpServer)
    .then((app) => {
      httpServer.on('request', app);
      httpServer.listen(PORT, '0.0.0.0', () => {
        console.log(`Nexora server running on http://0.0.0.0:${PORT}`);
      });
    })
    .catch((error) => {
      console.error('Failed to start Nexora server:', error);
      process.exit(1);
    });
}
