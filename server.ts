import 'dotenv/config';
import express, { Request, Response } from 'express';
import fs from 'fs';
import nodemailer from 'nodemailer';
import path from 'path';
import { fileURLToPath } from 'url';

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

export async function createNexoraServer() {
  const app = express();
  app.use(express.json({ limit: '512kb' }));

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

  if (!IS_PRODUCTION) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (req: Request, res: Response) => {
      if (req.path.startsWith('/api/')) {
        res.status(404).json({ error: 'API route not found' });
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
  createNexoraServer()
    .then((app) => {
      app.listen(PORT, '0.0.0.0', () => {
        console.log(`Nexora server running on http://0.0.0.0:${PORT}`);
      });
    })
    .catch((error) => {
      console.error('Failed to start Nexora server:', error);
      process.exit(1);
    });
}
