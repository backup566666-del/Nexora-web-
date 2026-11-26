import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  AtSign,
  Award,
  Bell,
  BellOff,
  Check,
  CheckCheck,
  CreditCard,
  Gift,
  Heart,
  Layers,
  Lock,
  MessageCircle,
  MessageSquare,
  Repeat2,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  UserPlus,
} from 'lucide-react';
import {
  NavSection,
  NotificationCategory,
  NotificationItem,
  NotificationType,
  PrivacySettings,
  UserPrivate,
} from '../../types/nexora';
import { formatRelativeTime, LOCKED_NOTIFICATION_CATEGORIES, withPrivacyDefaults } from '../../utils/validation';
import {
  clearNotificationsBatch,
  deleteNotification,
  markAllNotificationsRead,
  markNotificationRead,
} from '../../services/firebase/socialService';
import { updateUserPrivacySettings } from '../../services/auth/authService';
import { extractReadableErrorMessage } from '../../services/firebase/errorHandler';
import { ResilientImage } from '../../components/common/ResilientImage';
import { FriendlyErrorBanner } from '../../components/common/FriendlyErrorBanner';

interface NotificationsPageProps {
  uid: string;
  notifications: NotificationItem[];
  privateInfo: UserPrivate | null;
  onNavigate: (section: NavSection, targetId?: string) => void;
  onOpenUserProfile: (uid: string) => void;
  onOpenPost?: (postId: string) => void;
}

type NotificationTab = 'all' | 'unread' | NotificationCategory;

const CATEGORY_TABS: Array<{ id: NotificationTab; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'social', label: 'Social' },
  { id: 'messages', label: 'Messages' },
  { id: 'spaces', label: 'Spaces' },
  { id: 'subscriptions', label: 'Subscriptions' },
  { id: 'badges', label: 'Badges' },
  { id: 'gifts', label: 'Gifts' },
  { id: 'admin', label: 'Admin' },
  { id: 'security', label: 'Security' },
];

const CHANNEL_ROWS: Array<{
  key: NotificationCategory;
  label: string;
  description: string;
}> = [
  { key: 'social', label: 'Social Activity', description: 'Likes, comments, replies, mentions, follows, reposts, and collaborations.' },
  { key: 'messages', label: 'Chat & Messages', description: 'Direct messages and group chat activity.' },
  { key: 'spaces', label: 'Spaces & Events', description: 'Space invitations, announcements, and event reminders.' },
  { key: 'subscriptions', label: 'Subscriptions & Billing', description: 'Membership status changes, receipts, and renewal updates.' },
  { key: 'badges', label: 'Verification & Badges', description: 'Identity checks, badge awards, and application decisions.' },
  { key: 'gifts', label: 'Virtual Gifts', description: 'Appreciation gifts received from the community.' },
  { key: 'admin', label: 'Platform Notices', description: 'Official announcements, staff updates, and support tickets.' },
  { key: 'account', label: 'Account Activity', description: 'Profile milestones and account notices.' },
  { key: 'security', label: 'Security Alerts', description: 'Sign-in warnings, account restrictions, and critical security alerts.' },
];

function getNotificationIcon(type: NotificationType) {
  switch (type) {
    case 'like':
      return <Heart size={15} className="text-rose-400" />;
    case 'comment':
    case 'reply':
      return <MessageSquare size={15} className="text-sky-400" />;
    case 'mention':
    case 'post_tag':
      return <AtSign size={15} className="text-violet-300" />;
    case 'follow':
      return <UserPlus size={15} className="text-emerald-400" />;
    case 'repost':
      return <Repeat2 size={15} className="text-teal-400" />;
    case 'message':
      return <MessageCircle size={15} className="text-[#C084FC]" />;
    case 'space_invite':
    case 'space_announcement':
    case 'event_reminder':
    case 'community_status':
      return <Layers size={15} className="text-indigo-400" />;
    case 'subscription_notice':
    case 'subscription_renewal':
      return <CreditCard size={15} className="text-amber-300" />;
    case 'badge_awarded':
    case 'badge_revoked':
    case 'verification_decision':
    case 'identity_decision':
      return <Award size={15} className="text-sky-300" />;
    case 'gift_received':
      return <Gift size={15} className="text-pink-400" />;
    case 'security_alert':
      return <Shield size={15} className="text-rose-300" />;
    case 'admin_notice':
    case 'announcement':
    case 'staff_role_change':
    case 'system_update':
    case 'support_ticket':
      return <AlertTriangle size={15} className="text-amber-400" />;
    default:
      return <Sparkles size={15} className="text-[#C084FC]" />;
  }
}

function describeNotificationHeading(item: NotificationItem): string {
  if (item.title) return item.title;
  switch (item.type) {
    case 'like':
      return `${item.actorName} liked your post`;
    case 'comment':
      return `${item.actorName} commented on your post`;
    case 'reply':
      return `${item.actorName} replied to your comment`;
    case 'mention':
      return `${item.actorName} mentioned you`;
    case 'follow':
      return `${item.actorName} followed you`;
    case 'repost':
      return `${item.actorName} reposted your update`;
    case 'post_tag':
      return `${item.actorName} tagged you in a post`;
    case 'collab_invite':
      return `${item.actorName} invited you to collaborate`;
    case 'collab_response':
      return `${item.actorName} responded to a collaboration invite`;
    case 'message':
      return `New message from ${item.actorName}`;
    case 'space_invite':
      return `${item.actorName} invited you to a Space`;
    case 'space_announcement':
      return `Space announcement from ${item.actorName}`;
    case 'event_reminder':
      return 'Upcoming Space event reminder';
    case 'subscription_notice':
    case 'subscription_renewal':
      return 'Nexora Membership update';
    case 'security_alert':
      return 'Security Notice';
    case 'system_update':
      return 'Nexora Platform Update';
    default:
      return item.actorName || 'Nexora Notification';
  }
}

export const NotificationsPage: React.FC<NotificationsPageProps> = ({
  uid,
  notifications,
  privateInfo,
  onNavigate,
  onOpenUserProfile,
  onOpenPost,
}) => {
  const [activeTab, setActiveTab] = useState<NotificationTab>('all');
  const [showPreferences, setShowPreferences] = useState(false);
  const [busyAction, setBusyAction] = useState(false);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [statusMsg, setStatusMsg] = useState('');

  const privacy = useMemo(
    () => withPrivacyDefaults(privateInfo?.privacySettings),
    [privateInfo]
  );

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  const filtered = useMemo(() => {
    if (activeTab === 'all') return notifications;
    if (activeTab === 'unread') return notifications.filter((n) => !n.read);
    return notifications.filter((n) => (n.category || 'social') === activeTab);
  }, [notifications, activeTab]);

  const handleOpenTarget = async (item: NotificationItem) => {
    if (!item.read) {
      void markNotificationRead(item.id).catch(() => {});
    }
    const t = item.targetType;
    if (t === 'chat' || item.type === 'message') {
      onNavigate('chat', item.targetId || undefined);
      return;
    }
    if (
      item.category === 'spaces' ||
      t === 'space' ||
      item.type === 'space_invite' ||
      item.type === 'space_announcement' ||
      item.type === 'event_reminder' ||
      item.type === 'community_status'
    ) {
      onNavigate('spaces', item.targetId || undefined);
      return;
    }
    if (
      t === 'subscription' ||
      item.type === 'subscription_notice' ||
      item.type === 'subscription_renewal'
    ) {
      onNavigate('subscriptions');
      return;
    }
    if (
      t === 'post' ||
      item.type === 'like' ||
      item.type === 'comment' ||
      item.type === 'reply' ||
      item.type === 'mention' ||
      item.type === 'repost' ||
      item.type === 'post_tag' ||
      item.type === 'collab_invite' ||
      item.type === 'collab_response'
    ) {
      if (item.targetId && onOpenPost) {
        onOpenPost(item.targetId);
      } else {
        onNavigate('home');
      }
      return;
    }
    if (
      t === 'settings' ||
      item.type === 'security_alert' ||
      item.type === 'staff_role_change' ||
      item.type === 'support_ticket'
    ) {
      onNavigate('settings');
      return;
    }
    if (item.type === 'ai_welcome' || (t === 'system' && item.targetId === 'ai')) {
      onNavigate('ai');
      return;
    }
    if (t === 'profile' || item.type === 'follow') {
      onOpenUserProfile(item.targetId || item.actorId);
      return;
    }
    onNavigate('home');
  };

  const handleMarkAllRead = async () => {
    setErrorMsg('');
    setBusyAction(true);
    try {
      await markAllNotificationsRead(notifications);
      setStatusMsg('All notifications marked as read.');
    } catch (err) {
      setErrorMsg(extractReadableErrorMessage(err, 'Could not mark notifications as read. Please try again.'));
    } finally {
      setBusyAction(false);
    }
  };

  const handleClearRead = async () => {
    const readItems = notifications.filter((n) => n.read);
    if (readItems.length === 0) return;
    setErrorMsg('');
    setBusyAction(true);
    try {
      await clearNotificationsBatch(readItems);
      setStatusMsg(`Cleared ${readItems.length} read notification${readItems.length === 1 ? '' : 's'}.`);
    } catch (err) {
      setErrorMsg(extractReadableErrorMessage(err, 'Could not clear read notifications. Please try again.'));
    } finally {
      setBusyAction(false);
    }
  };

  const handleClearAll = async () => {
    if (notifications.length === 0) return;
    setErrorMsg('');
    setBusyAction(true);
    try {
      await clearNotificationsBatch(notifications);
      setConfirmClearAll(false);
      setStatusMsg('Notification history cleared.');
    } catch (err) {
      setErrorMsg(extractReadableErrorMessage(err, 'Could not clear notification history. Please try again.'));
    } finally {
      setBusyAction(false);
    }
  };

  const handleToggleChannel = async (
    channel: 'inAppNotifications' | 'emailNotifications',
    category: NotificationCategory
  ) => {
    if (LOCKED_NOTIFICATION_CATEGORIES.includes(category)) return;
    setErrorMsg('');
    const currentVal = privacy[channel]?.[category] !== false;
    const nextSettings: PrivacySettings = {
      ...privacy,
      [channel]: {
        ...(privacy[channel] || {}),
        [category]: !currentVal,
        security: true,
      },
    };
    try {
      await updateUserPrivacySettings(uid, nextSettings);
    } catch (err) {
      setErrorMsg(extractReadableErrorMessage(err, "We couldn't update your notification preferences. Please try again."));
    }
  };

  return (
    <div className="space-y-5">
      <section className="rounded-2xl bg-[#0D0B16] border border-[#8B5CF6]/20 p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-[#7C3AED]/20 border border-[#8B5CF6]/30 flex items-center justify-center text-[#C084FC]">
                <Bell size={18} />
              </div>
              <h1 className="font-display text-xl sm:text-2xl font-bold text-white">
                Notification Centre
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-[#94A3B8]">
              <span className="font-mono-tabular text-white font-semibold">{unreadCount}</span> unread ·{' '}
              <span className="font-mono-tabular">{notifications.length}</span> total recent updates
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowPreferences((prev) => !prev)}
              className={`min-h-[44px] inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                showPreferences
                  ? 'bg-[#7C3AED] text-white border-[#8B5CF6]/40'
                  : 'bg-[#120F1E] text-[#CBD5E1] border-white/10 hover:text-white'
              }`}
            >
              <SlidersHorizontal size={14} />
              Preferences
            </button>
            <button
              type="button"
              disabled={busyAction || unreadCount === 0}
              onClick={handleMarkAllRead}
              className="min-h-[44px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#120F1E] border border-white/10 text-[#CBD5E1] hover:text-white disabled:opacity-45"
            >
              <CheckCheck size={14} />
              Mark all read
            </button>
            <button
              type="button"
              disabled={busyAction || notifications.every((n) => !n.read)}
              onClick={handleClearRead}
              className="min-h-[44px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#120F1E] border border-white/10 text-[#CBD5E1] hover:text-white disabled:opacity-45"
            >
              Clear read
            </button>
            {notifications.length > 0 && !confirmClearAll && (
              <button
                type="button"
                disabled={busyAction}
                onClick={() => setConfirmClearAll(true)}
                className="min-h-[44px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-rose-500/10 border border-rose-500/25 text-rose-300 hover:bg-rose-500/20"
              >
                <Trash2 size={14} />
                Clear all
              </button>
            )}
          </div>
        </div>

        {confirmClearAll && (
          <div className="mt-4 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-xs text-rose-100">
              Remove all {notifications.length} notifications from your inbox? This cannot be undone.
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setConfirmClearAll(false)}
                className="min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busyAction}
                onClick={handleClearAll}
                className="min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 text-white hover:bg-rose-500"
              >
                Confirm Clear All
              </button>
            </div>
          </div>
        )}

        {errorMsg && (
          <div className="mt-4">
            <FriendlyErrorBanner message={errorMsg} onDismiss={() => setErrorMsg('')} />
          </div>
        )}
        {statusMsg && !errorMsg && (
          <div className="mt-4 rounded-xl bg-emerald-500/10 border border-emerald-500/25 px-3.5 py-2.5 text-xs text-emerald-200 flex items-center justify-between">
            <span>{statusMsg}</span>
            <button type="button" onClick={() => setStatusMsg('')} className="text-emerald-300 hover:text-white">
              Dismiss
            </button>
          </div>
        )}
      </section>

      {showPreferences && (
        <section className="rounded-2xl bg-[#0D0B16] border border-[#8B5CF6]/20 p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-base font-semibold text-white">
                Notification Channel Preferences
              </h2>
              <p className="text-xs text-[#94A3B8] mt-0.5">
                Customise which alerts appear in your inbox or by email. Essential security alerts always remain enabled.
              </p>
            </div>
          </div>

          <div className="divide-y divide-white/[0.06]">
            {CHANNEL_ROWS.map((row) => {
              const isLocked = LOCKED_NOTIFICATION_CATEGORIES.includes(row.key);
              const inAppOn = isLocked || privacy.inAppNotifications?.[row.key] !== false;
              const emailOn = isLocked || privacy.emailNotifications?.[row.key] !== false;
              return (
                <div
                  key={row.key}
                  className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-white">{row.label}</p>
                      {isLocked && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-300">
                          <Lock size={11} /> Always on
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#94A3B8] mt-0.5">{row.description}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={isLocked}
                      onClick={() => handleToggleChannel('inAppNotifications', row.key)}
                      className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                        inAppOn
                          ? 'bg-[#7C3AED]/25 border-[#8B5CF6]/40 text-white'
                          : 'bg-[#120F1E] border-white/10 text-[#64748B]'
                      } disabled:opacity-70`}
                    >
                      In-App: {inAppOn ? 'On' : 'Off'}
                    </button>
                    <button
                      type="button"
                      disabled={isLocked}
                      onClick={() => handleToggleChannel('emailNotifications', row.key)}
                      className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                        emailOn
                          ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-200'
                          : 'bg-[#120F1E] border-white/10 text-[#64748B]'
                      } disabled:opacity-70`}
                    >
                      Email: {emailOn ? 'On' : 'Off'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {CATEGORY_TABS.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                active
                  ? 'bg-[#7C3AED] text-white'
                  : 'bg-[#0D0B16] border border-white/[0.08] text-[#94A3B8] hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Notifications List */}
      <section className="rounded-2xl bg-[#0D0B16] border border-[#8B5CF6]/15 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-16 px-6 text-center space-y-2.5">
            <div className="w-12 h-12 rounded-2xl bg-[#120F1E] border border-white/10 flex items-center justify-center mx-auto text-[#64748B]">
              <BellOff size={20} />
            </div>
            <p className="font-display text-base font-semibold text-white">
              Nothing here yet
            </p>
            <p className="text-xs text-[#94A3B8] max-w-sm mx-auto">
              When members interact with your posts, message you, or update your memberships, notifications will appear here.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.06]">
            {filtered.map((item) => (
              <div
                key={item.id}
                className={`p-4 flex items-start gap-3 transition-colors ${
                  item.read ? 'hover:bg-white/[0.02]' : 'bg-[#7C3AED]/[0.08] hover:bg-[#7C3AED]/[0.12]'
                }`}
              >
                <button
                  type="button"
                  onClick={() => handleOpenTarget(item)}
                  className="flex items-start gap-3 flex-1 min-w-0 text-left"
                >
                  <div className="relative shrink-0 mt-0.5">
                    <ResilientImage
                      src={item.actorAvatar}
                      alt={item.actorName}
                      className="w-10 h-10 rounded-full object-cover"
                    />
                    <span className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-[#120F1E] border border-white/10 flex items-center justify-center">
                      {getNotificationIcon(item.type)}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-white truncate">
                        {describeNotificationHeading(item)}
                      </p>
                      {!item.read && (
                        <span className="w-2 h-2 rounded-full bg-[#A855F7] shrink-0" aria-label="Unread" />
                      )}
                    </div>
                    {item.preview && (
                      <p className="text-xs text-[#CBD5E1] mt-0.5 line-clamp-2">{item.preview}</p>
                    )}
                    <p className="text-[11px] text-[#64748B] mt-1">
                      {formatRelativeTime(item.createdAt)} · {(item.category || 'social').replace(/_/g, ' ')}
                    </p>
                  </div>
                </button>

                <div className="flex items-center gap-1 shrink-0">
                  {!item.read && (
                    <button
                      type="button"
                      title="Mark as read"
                      onClick={() => void markNotificationRead(item.id).catch(() => {})}
                      className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center text-[#94A3B8] hover:text-white hover:bg-white/10"
                    >
                      <Check size={15} />
                    </button>
                  )}
                  <button
                    type="button"
                    title="Delete notification"
                    onClick={async () => {
                      try {
                        await deleteNotification(item.id);
                      } catch (err) {
                        setErrorMsg(extractReadableErrorMessage(err, 'Could not remove notification.'));
                      }
                    }}
                    className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center text-[#64748B] hover:text-rose-300 hover:bg-rose-500/10"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
