import React, { useState } from 'react';
import { BellRing, Megaphone, Pause, Play, Send, Trash2 } from 'lucide-react';
import { useAuth } from '../../../hooks/useAuth';
import {
  deleteAnnouncement,
  dispatchAdminNotification,
  publishPlatformAnnouncement,
  toggleAnnouncementActive,
} from '../../../services/firebase/adminService';
import { PlatformAnnouncement, PlatformRole, UserProfile } from '../../../types/nexora';
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

  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

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
        text: err instanceof Error ? err.message : 'Unable to publish announcement.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleSendNotifications = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!notifPreview.trim()) return;
    const recipientIds =
      audienceMode === 'all' ? users.map((u) => u.uid) : selectedUids;
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
        text: err instanceof Error ? err.message : 'Unable to dispatch notifications.',
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
          <Megaphone size={18} className="text-[#C084FC]" /> Broadcast & Notification Control
        </h2>
        <p className="text-xs text-[#94A3B8] mt-0.5">
          Publish global header banners across the Nexora workspace or dispatch targeted in-app security alerts and administrative notices.
        </p>
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

        {/* Direct / Bulk Notification Sender */}
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
            <Send size={13} /> Dispatch Notifications
          </button>
        </form>
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
