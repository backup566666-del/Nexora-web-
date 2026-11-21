import React, { useEffect, useState } from 'react';
import {
  BellRing,
  CheckCircle2,
  Mail,
  Megaphone,
  Pause,
  Play,
  RefreshCw,
  Send,
  Trash2,
} from 'lucide-react';
import { useAuth } from '../../../hooks/useAuth';
import {
  deleteAnnouncement,
  dispatchAdminDirectEmail,
  dispatchAdminNotification,
  publishPlatformAnnouncement,
  subscribeEmailLogs,
  toggleAnnouncementActive,
} from '../../../services/firebase/adminService';
import { extractReadableErrorMessage } from '../../../services/firebase/errorHandler';
import {
  fetchServerEmailStatus,
  ServerEmailStatus,
} from '../../../services/notifications/notificationDispatcher';
import {
  EmailLogEntry,
  NotificationCategory,
  PlatformAnnouncement,
  PlatformRole,
  UserProfile,
} from '../../../types/nexora';
import { formatRelativeTime } from '../../../utils/validation';

interface NotificationManagementPanelProps {
  actor: UserProfile;
  myRole: PlatformRole;
  users: UserProfile[];
}

export function NotificationManagementPanel({
  actor,
  myRole,
  users,
}: NotificationManagementPanelProps) {
  const { announcements } = useAuth();

  // Global Announcement Form
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [severity, setSeverity] = useState<'info' | 'warning' | 'security'>('info');

  // Targeted / Bulk Notification Form
  const [notifType, setNotifType] = useState<'announcement' | 'security_alert' | 'admin_notice'>(
    'admin_notice'
  );
  const [audienceMode, setAudienceMode] = useState<'all' | 'specific'>('all');
  const [selectedUids, setSelectedUids] = useState<string[]>([]);
  const [notifPreview, setNotifPreview] = useState('');

  // Server Email Transport + Direct Email
  const [emailStatus, setEmailStatus] = useState<ServerEmailStatus | null>(null);
  const [emailLogs, setEmailLogs] = useState<EmailLogEntry[]>([]);
  const [directTo, setDirectTo] = useState('');
  const [directRecipientUid, setDirectRecipientUid] = useState('');
  const [directSubject, setDirectSubject] = useState('');
  const [directBody, setDirectBody] = useState('');
  const [directCategory, setDirectCategory] = useState<NotificationCategory>('admin');

  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const loadEmailTransportStatus = async () => {
    const status = await fetchServerEmailStatus();
    setEmailStatus(status);
  };

  useEffect(() => {
    void loadEmailTransportStatus();
    return subscribeEmailLogs(setEmailLogs);
  }, []);

  const handlePublishAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !message.trim()) return;
    setBusy(true);
    setFeedback(null);
    try {
      await publishPlatformAnnouncement({
        actor,
        actorRole: myRole.role,
        title: title.trim(),
        message: message.trim(),
        severity,
      });
      setTitle('');
      setMessage('');
      setFeedback({ type: 'ok', text: 'Global platform announcement published.' });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: extractReadableErrorMessage(err, 'Unable to publish announcement.', { feature: 'admin:announcements' }),
      });
    } finally {
      setBusy(false);
    }
  };

  const handleSendNotifications = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!notifPreview.trim()) return;
    const recipientIds = audienceMode === 'all' ? users.map((u) => u.uid) : selectedUids;
    if (recipientIds.length === 0) {
      setFeedback({ type: 'err', text: 'Select at least one recipient account.' });
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      const sentCount = await dispatchAdminNotification({
        actor,
        actorRole: myRole.role,
        recipientIds,
        type: notifType,
        preview: notifPreview.trim(),
      });
      setNotifPreview('');
      setSelectedUids([]);
      setFeedback({
        type: 'ok',
        text: `Dispatched ${notifType.replace('_', ' ')} notification to ${sentCount} account(s).`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: extractReadableErrorMessage(err, 'Unable to dispatch notifications.', { feature: 'admin:notifications' }),
      });
    } finally {
      setBusy(false);
    }
  };

  const handleDispatchDirectEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!directTo.trim() || !directSubject.trim() || !directBody.trim()) return;
    setBusy(true);
    setFeedback(null);
    try {
      const targetProfile = users.find((u) => u.uid === directRecipientUid);
      const outcome = await dispatchAdminDirectEmail({
        actor,
        actorRole: myRole.role,
        to: directTo.trim(),
        subject: directSubject.trim(),
        bodyText: directBody.trim(),
        category: directCategory,
        recipientUid: directRecipientUid || undefined,
        recipientName: targetProfile?.displayName,
      });
      setFeedback({
        type: outcome.emailDelivered ? 'ok' : 'err',
        text: `${outcome.message} (Status: ${outcome.emailStatus}, Provider: ${outcome.emailProvider})`,
      });
      if (outcome.emailDelivered) {
        setDirectSubject('');
        setDirectBody('');
      }
    } catch (err) {
      setFeedback({
        type: 'err',
        text: extractReadableErrorMessage(err, 'Unable to dispatch direct email.', { feature: 'admin:direct-email' }),
      });
    } finally {
      setBusy(false);
    }
  };

  const handleToggleBanner = async (ann: PlatformAnnouncement) => {
    setBusy(true);
    try {
      await toggleAnnouncementActive({
        actor,
        actorRole: myRole.role,
        announcement: ann,
      });
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteBanner = async (ann: PlatformAnnouncement) => {
    setBusy(true);
    try {
      await deleteAnnouncement({
        actor,
        actorRole: myRole.role,
        announcement: ann,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-lg font-bold text-white flex items-center gap-2">
          <Megaphone size={18} className="text-[#C084FC]" /> Dual Notifications &amp; Email Control
        </h2>
        <p className="text-xs text-[#94A3B8] mt-0.5">
          Publish global header banners, dispatch targeted in-app alerts, inspect server email transport status, and view email audit logs.
        </p>
      </div>

      {/* Live Server Email Transport Banner */}
      <div className="p-4 rounded-2xl bg-[#08070F] border border-[#8B5CF6]/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
              emailStatus?.configured
                ? 'bg-emerald-500/15 text-emerald-300'
                : 'bg-amber-500/15 text-amber-300'
            }`}
          >
            <Mail size={16} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-white">Server Email Transport:</span>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                  emailStatus?.configured
                    ? 'bg-emerald-500/15 text-emerald-300'
                    : 'bg-amber-500/15 text-amber-300'
                }`}
              >
                {emailStatus?.configured ? `Active (${emailStatus.provider})` : 'Not Configured'}
              </span>
            </div>
            <p className="text-[11px] text-[#94A3B8] mt-0.5">
              {emailStatus?.message || 'Checking /api/email/status...'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void loadEmailTransportStatus()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-white shrink-0 self-start sm:self-center"
        >
          <RefreshCw size={12} /> Refresh Status
        </button>
      </div>

      {feedback && (
        <div
          className={`px-4 py-3 rounded-xl border text-xs flex items-center justify-between ${
            feedback.type === 'ok'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-200'
          }`}
        >
          <span>{feedback.text}</span>
          <button type="button" onClick={() => setFeedback(null)} className="text-white/70 hover:text-white">
            Dismiss
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Global Top Banner Publisher */}
        <form
          onSubmit={handlePublishAnnouncement}
          className="p-5 rounded-2xl bg-[#08070F] border border-[#8B5CF6]/20 space-y-4"
        >
          <h3 className="font-display text-sm font-semibold text-white flex items-center gap-2">
            <Megaphone size={15} className="text-[#C084FC]" /> Global Announcement Banner
          </h3>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-[#CBD5E1]">Headline</span>
            <input
              type="text"
              required
              maxLength={100}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Scheduled Release v2.4 Live"
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#0D0B16] border border-[#8B5CF6]/20 text-xs text-white outline-none"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-[#CBD5E1]">Severity Style</span>
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value as 'info' | 'warning' | 'security')}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#0D0B16] border border-[#8B5CF6]/20 text-xs text-white outline-none"
            >
              <option value="info">Platform Info (Electric Violet)</option>
              <option value="warning">Advisory Warning (Amber)</option>
              <option value="security">Critical Security Alert (Rose)</option>
            </select>
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-[#CBD5E1]">Banner Message</span>
            <textarea
              rows={3}
              required
              maxLength={500}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Message displayed to all signed-in Nexora members..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#0D0B16] border border-[#8B5CF6]/20 text-xs text-white outline-none"
            />
          </label>

          <button
            type="submit"
            disabled={busy || !title.trim() || !message.trim()}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#6D28D9] via-[#7C3AED] to-[#9333EA] text-xs font-semibold text-white disabled:opacity-40"
          >
            <Send size={13} /> Publish Global Banner
          </button>
        </form>

        {/* Direct / Bulk In-App Notification Sender */}
        <form
          onSubmit={handleSendNotifications}
          className="p-5 rounded-2xl bg-[#08070F] border border-[#8B5CF6]/20 space-y-4"
        >
          <h3 className="font-display text-sm font-semibold text-white flex items-center gap-2">
            <BellRing size={15} className="text-sky-300" /> Targeted In-App Notification
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-[#CBD5E1]">Notification Type</span>
              <select
                value={notifType}
                onChange={(e) =>
                  setNotifType(
                    e.target.value as 'announcement' | 'security_alert' | 'admin_notice'
                  )
                }
                className="w-full px-3 py-2.5 rounded-xl bg-[#0D0B16] border border-[#8B5CF6]/20 text-xs text-white outline-none"
              >
                <option value="admin_notice">Admin Notice</option>
                <option value="announcement">Official Announcement</option>
                <option value="security_alert">Security Alert</option>
              </select>
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-[#CBD5E1]">Recipients</span>
              <select
                value={audienceMode}
                onChange={(e) => setAudienceMode(e.target.value as 'all' | 'specific')}
                className="w-full px-3 py-2.5 rounded-xl bg-[#0D0B16] border border-[#8B5CF6]/20 text-xs text-white outline-none"
              >
                <option value="all">All Registered Accounts ({users.length})</option>
                <option value="specific">Select Specific Accounts</option>
              </select>
            </label>
          </div>

          {audienceMode === 'specific' && (
            <div className="max-h-36 overflow-y-auto rounded-xl bg-[#0D0B16] border border-white/[0.06] divide-y divide-white/[0.05]">
              {users.map((u) => {
                const checked = selectedUids.includes(u.uid);
                return (
                  <label
                    key={u.uid}
                    className="flex items-center gap-2.5 px-3 py-2 text-xs text-[#CBD5E1] cursor-pointer hover:bg-white/5"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setSelectedUids((prev) =>
                          prev.includes(u.uid)
                            ? prev.filter((id) => id !== u.uid)
                            : [...prev, u.uid]
                        )
                      }
                      className="accent-[#7C3AED]"
                    />
                    <span className="truncate">
                      {u.displayName} <span className="text-[#64748B]">@{u.username}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          )}

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-[#CBD5E1]">Notification Message</span>
            <textarea
              rows={3}
              required
              maxLength={200}
              value={notifPreview}
              onChange={(e) => setNotifPreview(e.target.value)}
              placeholder="Concise message delivered to each recipient's Notification inbox..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#0D0B16] border border-[#8B5CF6]/20 text-xs text-white outline-none"
            />
          </label>

          <button
            type="submit"
            disabled={busy || !notifPreview.trim()}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-xs font-semibold text-white disabled:opacity-40"
          >
            <Send size={13} /> Dispatch In-App Notifications
          </button>
        </form>
      </div>

      {/* Direct Admin Email & Optional Linked In-App Alert */}
      <form
        onSubmit={handleDispatchDirectEmail}
        className="p-5 rounded-2xl bg-[#08070F] border border-[#8B5CF6]/20 space-y-4"
      >
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3 className="font-display text-sm font-semibold text-white flex items-center gap-2">
            <Mail size={15} className="text-emerald-300" /> Direct Email &amp; Dual Notice Test
          </h3>
          <span className="text-[11px] text-[#94A3B8]">
            Logged safely with privacy-masked recipient address in /email_logs.
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-[#CBD5E1]">Recipient Email</span>
            <input
              type="email"
              required
              value={directTo}
              onChange={(e) => setDirectTo(e.target.value)}
              placeholder="member@example.com"
              className="w-full px-3 py-2 rounded-xl bg-[#0D0B16] border border-[#8B5CF6]/20 text-xs text-white outline-none"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-[#CBD5E1]">Link Account (Optional)</span>
            <select
              value={directRecipientUid}
              onChange={(e) => setDirectRecipientUid(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[#0D0B16] border border-[#8B5CF6]/20 text-xs text-white outline-none"
            >
              <option value="">Email Only (External / Unlinked)</option>
              {users.map((u) => (
                <option key={u.uid} value={u.uid}>
                  {u.displayName} (@{u.username})
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-[#CBD5E1]">Category</span>
            <select
              value={directCategory}
              onChange={(e) => setDirectCategory(e.target.value as NotificationCategory)}
              className="w-full px-3 py-2 rounded-xl bg-[#0D0B16] border border-[#8B5CF6]/20 text-xs text-white outline-none capitalize"
            >
              <option value="admin">Admin</option>
              <option value="security">Security</option>
              <option value="badges">Badges</option>
              <option value="account">Account</option>
            </select>
          </label>
        </div>

        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-[#CBD5E1]">Email Subject</span>
          <input
            type="text"
            required
            maxLength={160}
            value={directSubject}
            onChange={(e) => setDirectSubject(e.target.value)}
            placeholder="Important update regarding your Nexora account"
            className="w-full px-3 py-2 rounded-xl bg-[#0D0B16] border border-[#8B5CF6]/20 text-xs text-white outline-none"
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-[#CBD5E1]">Email Body</span>
          <textarea
            rows={3}
            required
            maxLength={2000}
            value={directBody}
            onChange={(e) => setDirectBody(e.target.value)}
            placeholder="Message body rendered cleanly inside Nexora's branded dark email template..."
            className="w-full px-3 py-2 rounded-xl bg-[#0D0B16] border border-[#8B5CF6]/20 text-xs text-white outline-none"
          />
        </label>

        <button
          type="submit"
          disabled={busy || !directTo.trim() || !directSubject.trim() || !directBody.trim()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white disabled:opacity-40"
        >
          <CheckCircle2 size={13} /> Send Dual Email &amp; Log
        </button>
      </form>

      {/* Email Audit Logs */}
      <div className="rounded-2xl bg-[#08070F] border border-[#8B5CF6]/20 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-white/[0.06]">
          <h3 className="font-display text-sm font-semibold text-white">
            Email Delivery Audit Logs ({emailLogs.length})
          </h3>
        </div>
        {emailLogs.length === 0 ? (
          <p className="p-5 text-xs text-[#64748B]">No email dispatch logs recorded yet.</p>
        ) : (
          <div className="divide-y divide-white/[0.05] max-h-72 overflow-y-auto">
            {emailLogs.map((log) => (
              <div
                key={log.id}
                className="px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-white truncate">{log.subject}</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                        log.status === 'sent'
                          ? 'bg-emerald-500/15 text-emerald-300'
                          : log.status === 'not_configured'
                          ? 'bg-amber-500/15 text-amber-300'
                          : log.status === 'failed'
                          ? 'bg-rose-500/15 text-rose-300'
                          : 'bg-white/10 text-[#94A3B8]'
                      }`}
                    >
                      {log.status}
                    </span>
                    <span className="text-[10px] text-[#64748B] uppercase">
                      {log.provider} • {log.category}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#94A3B8] mt-0.5">
                    To: {log.recipientEmailMasked} • Event: {log.eventType}
                    {log.error ? ` • ${log.error}` : ''}
                  </p>
                </div>
                <span className="text-[11px] text-[#64748B] font-mono-tabular shrink-0">
                  {formatRelativeTime(log.createdAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Existing Banners List */}
      <div className="rounded-2xl bg-[#08070F] border border-[#8B5CF6]/20 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-white/[0.06]">
          <h3 className="font-display text-sm font-semibold text-white">
            Published Platform Announcements ({announcements.length})
          </h3>
        </div>
        {announcements.length === 0 ? (
          <p className="p-5 text-xs text-[#64748B]">No global announcements published.</p>
        ) : (
          <div className="divide-y divide-white/[0.05]">
            {announcements.map((ann) => (
              <div
                key={ann.id}
                className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-white">{ann.title}</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                        ann.severity === 'security'
                          ? 'bg-rose-500/20 text-rose-300'
                          : ann.severity === 'warning'
                          ? 'bg-amber-500/20 text-amber-300'
                          : 'bg-[#7C3AED]/20 text-[#E9D5FF]'
                      }`}
                    >
                      {ann.severity}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] ${
                        ann.active
                          ? 'bg-emerald-500/15 text-emerald-300'
                          : 'bg-white/5 text-[#94A3B8]'
                      }`}
                    >
                      {ann.active ? 'Live Banner' : 'Paused'}
                    </span>
                  </div>
                  <p className="text-[#CBD5E1] mt-1">{ann.message}</p>
                  <p className="text-[10px] text-[#64748B] mt-0.5">
                    By {ann.authorName} • {formatRelativeTime(ann.createdAt)}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleToggleBanner(ann)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-white"
                  >
                    {ann.active ? <Pause size={12} /> : <Play size={12} />}
                    {ann.active ? 'Pause' : 'Activate'}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleDeleteBanner(ann)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 text-xs text-rose-300"
                  >
                    <Trash2 size={12} /> Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
