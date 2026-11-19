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
