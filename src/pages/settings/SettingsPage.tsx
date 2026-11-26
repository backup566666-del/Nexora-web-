import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Award,
  BadgeCheck,
  Banknote,
  BarChart3,
  BellRing,
  Bot,
  Compass,
  CreditCard,
  FileCheck2,
  Flag,
  Gift,
  Globe,
  History,
  KeyRound,
  LayoutGrid,
  LifeBuoy,
  Link2,
  Lock,
  LogOut,
  Megaphone,
  Monitor,
  Moon,
  Palette,
  Send,
  Shield,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Sun,
  Unlink,
  Upload,
} from 'lucide-react';
import { ProviderLogo } from '../../components/auth/ProviderLogo';
import { useBadgeModal } from '../../components/badges/BadgeContext';
import { AdminPresenceSelector } from '../../components/common/PresenceBadge';
import { PWAInstallButton } from '../../components/common/PWAInstallButton';
import { TierBadge } from '../../components/common/TierBadge';
import { BadgeStrip, VerifiedBadge } from '../../components/common/VerifiedBadge';
import { AdminCustomisationCatalogPanel } from '../../components/settings/admin/AdminCustomisationCatalogPanel';
import { AdminManagementPanel } from '../../components/settings/admin/AdminManagementPanel';
import { AdminSubscriptionManagementPanel } from '../../components/settings/admin/AdminSubscriptionManagementPanel';
import { AuditLogPanel } from '../../components/settings/admin/AuditLogPanel';
import { CommunityControlPanel } from '../../components/settings/admin/CommunityControlPanel';
import { GiftModerationPanel } from '../../components/settings/admin/GiftModerationPanel';
import { IdentityVerificationPanel } from '../../components/settings/admin/IdentityVerificationPanel';
import { ModerationReportsPanel } from '../../components/settings/admin/ModerationReportsPanel';
import { NexoraAiControlPanel } from '../../components/settings/admin/NexoraAiControlPanel';
import { NotificationManagementPanel } from '../../components/settings/admin/NotificationManagementPanel';
import { PlatformAnalyticsPanel } from '../../components/settings/admin/PlatformAnalyticsPanel';
import { PlatformManagementPanel } from '../../components/settings/admin/PlatformManagementPanel';
import { RewardsAndPaymentsAdminPanel } from '../../components/settings/admin/RewardsAndPaymentsAdminPanel';
import { SystemDiagnosticsPanel } from '../../components/settings/admin/SystemDiagnosticsPanel';
import { VerificationCentrePanel } from '../../components/settings/admin/VerificationCentrePanel';
import { HomepageCustomizationPanel } from '../../components/settings/HomepageCustomizationPanel';
import {
  getBrowserPushAvailability,
  registerPushNotifications,
  unregisterPushNotifications,
} from '../../services/firebase/messagingAndAppCheck';
import { useAuth } from '../../hooks/useAuth';
import { useTheme } from '../../hooks/useTheme';
import {
  AUTH_PROVIDER_LIST,
  AuthProviderMethod,
  clearPhoneRecaptcha,
  confirmPhoneLinkOtp,
  linkEmailPasswordToCurrentUser,
  linkOAuthProviderToCurrentUser,
  logoutUser,
  mapAuthErrorMessage,
  maskPhoneNumber,
  normalizeE164Phone,
  OAuthProviderId,
  PhoneOtpSession,
  sendPasswordReset,
  sendPhoneLinkOtp,
  unlinkProviderFromCurrentUser,
  updateUserPrivacySettings,
  validateE164Phone,
} from '../../services/auth/authService';
import {
  submitIdentityVerification,
  submitVerificationRequest,
  subscribeMyIdentityVerifications,
  subscribeMyVerificationRequests,
} from '../../services/firebase/adminService';
import { extractReadableErrorMessage } from '../../services/firebase/errorHandler';
import { submitContactSubmission } from '../../services/firebase/socialService';
import { encodeRestrictedIdentityDocument } from '../../services/storage/mediaUploadService';
import {
  ContactSubmission,
  IdentityVerificationRequest,
  NavSection,
  NotificationCategory,
  Post,
  PrivacySettings,
  Space,
  UserProfile,
  VerificationRequest,
  VerifiedBadgeType,
  Vibe,
} from '../../types/nexora';
import {
  APPLICATION_ELIGIBLE_BADGES,
  BADGE_CATALOG,
  formatRelativeTime,
  hasAdminPermission,
  normalizeBadgeType,
  ROLE_LABELS,
  withPrivacyDefaults,
} from '../../utils/validation';

interface SettingsPageProps {
  users: UserProfile[];
  posts?: Post[];
  vibes?: Vibe[];
  spaces?: Space[];
  initialAdminOpen?: boolean;
  initialPersonalSection?: 'all' | 'customize-homepage' | 'badges';
  onNavigate?: (section: NavSection) => void;
}

type AdminSectionKey =
  | 'analytics'
  | 'ai_control'
  | 'admins'
  | 'communities'
  | 'verification'
  | 'identity'
  | 'gifts'
  | 'subscriptions_admin'
  | 'rewards_admin'
  | 'studio_admin'
  | 'platform'
  | 'moderation'
  | 'notifications'
  | 'diagnostics'
  | 'audit';

const NOTIFICATION_CATEGORY_META: {
  key: NotificationCategory;
  label: string;
  description: string;
  locked?: boolean;
}[] = [
  { key: 'account', label: 'Account', description: 'Welcome, profile & recovery events' },
  { key: 'social', label: 'Social, Tags & Collabs', description: 'Likes, comments, tags & collab invites' },
  { key: 'messages', label: 'Messages', description: 'New direct messages & requests' },
  { key: 'spaces', label: 'Spaces', description: 'Invites, announcements & community events' },
  { key: 'subscriptions', label: 'Subscriptions & Billing', description: 'Plan status, renewals & payment receipts' },
  { key: 'badges', label: 'Badges & Verification', description: 'Badge awards & ID decisions' },
  { key: 'gifts', label: 'Virtual Gifts', description: 'Free appreciation gifts received' },
  { key: 'rewards', label: 'Invitations, Tasks & Wallet', description: 'Referral milestones, task approvals & Naira withdrawals' },
  { key: 'admin', label: 'Platform & Support', description: 'Ticket replies & official notices' },
  { key: 'security', label: 'Security Alerts (Locked ON)', description: 'Critical sign-in & account safety advisories', locked: true },
];

export function SettingsPage({
  users,
  posts = [],
  vibes = [],
  spaces = [],
  initialAdminOpen = false,
  initialPersonalSection = 'all',
  onNavigate,
}: SettingsPageProps) {
  const {
    user,
    profile,
    privateInfo,
    myRole,
    myAdminManualMode,
    myAdminSelfStatus,
    effectiveTier,
    setMyAdminStatus,
    getUserBadges,
    refreshUserAndProfile,
  } = useAuth();
  const { themeMode, resolvedTheme, savingTheme, setThemeMode } = useTheme();
  const { openBadgeModal } = useBadgeModal();
  const [presenceBusy, setPresenceBusy] = useState(false);
  const [presenceError, setPresenceError] = useState('');

  const canAccessAdmin = Boolean(myRole && myRole.active);
  const [viewMode, setViewMode] = useState<'personal' | 'admin'>(
    initialAdminOpen && canAccessAdmin ? 'admin' : 'personal'
  );
  const [personalTab, setPersonalTab] = useState<
    'all' | 'customize-homepage' | 'account' | 'privacy' | 'badges' | 'support'
  >(initialPersonalSection);

  // Sync viewMode if triggered externally (e.g. account dropdown shortcut)
  useEffect(() => {
    if (initialAdminOpen && canAccessAdmin) {
      setViewMode('admin');
    } else if (!canAccessAdmin && viewMode === 'admin') {
      setViewMode('personal');
    }
  }, [initialAdminOpen, canAccessAdmin, viewMode]);

  useEffect(() => {
    if (
      initialPersonalSection === 'customize-homepage' ||
      initialPersonalSection === 'badges'
    ) {
      setViewMode('personal');
      setPersonalTab(initialPersonalSection);
    }
  }, [initialPersonalSection]);

  // Personal Privacy & Notification Preferences state
  const [privacy, setPrivacy] = useState<PrivacySettings>(() => withPrivacyDefaults());
  const [savingPrivacy, setSavingPrivacy] = useState(false);
  const [privacyNotice, setPrivacyNotice] = useState('');
  const [pushStatus, setPushStatus] = useState<{
    supported: boolean;
    vapidConfigured: boolean;
    permission: NotificationPermission | 'unsupported';
  }>({ supported: false, vapidConfigured: false, permission: 'default' });
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMessage, setPushMessage] = useState('');

  useEffect(() => {
    void getBrowserPushAvailability().then(setPushStatus);
  }, []);

  // Personal Verification & Identity Applications
  const [myBadgeRequests, setMyBadgeRequests] = useState<VerificationRequest[]>([]);
  const [myIdRequests, setMyIdRequests] = useState<IdentityVerificationRequest[]>([]);
  const [reqBadgeType, setReqBadgeType] = useState<VerifiedBadgeType>(
    APPLICATION_ELIGIBLE_BADGES[0]?.id || 'creator'
  );
  const [reqCategory, setReqCategory] = useState('Creator / Technology');
  const [reqRationale, setReqRationale] = useState('');
  const [reqLink, setReqLink] = useState('');
  const [submittingBadge, setSubmittingBadge] = useState(false);
  const [badgeFeedback, setBadgeFeedback] = useState('');

  const [legalFullName, setLegalFullName] = useState('');
  const [docType, setDocType] = useState<'passport' | 'national_id' | 'drivers_license'>('passport');
  const [docCountry, setDocCountry] = useState('');
  const [docFile, setDocFile] = useState<File | null>(null);
  const [submittingId, setSubmittingId] = useState(false);
  const [idFeedback, setIdFeedback] = useState('');

  // Support / Ban Appeal Ticket Form
  const [supportCategory, setSupportCategory] =
    useState<ContactSubmission['category']>('support');
  const [supportSubject, setSupportSubject] = useState('');
  const [supportMessage, setSupportMessage] = useState('');
  const [submittingSupport, setSubmittingSupport] = useState(false);
  const [supportFeedback, setSupportFeedback] = useState('');

  // Connected Authentication Methods state
  const [authBusyMethod, setAuthBusyMethod] = useState<AuthProviderMethod | null>(null);
  const [authFeedback, setAuthFeedback] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [showPhoneLinkForm, setShowPhoneLinkForm] = useState(false);
  const [linkPhoneDial, setLinkPhoneDial] = useState('+1');
  const [linkPhoneLocal, setLinkPhoneLocal] = useState('');
  const [linkPhoneOtpSession, setLinkPhoneOtpSession] = useState<PhoneOtpSession | null>(null);
  const [linkPhoneCode, setLinkPhoneCode] = useState('');
  const [showEmailLinkForm, setShowEmailLinkForm] = useState(false);
  const [linkEmailValue, setLinkEmailValue] = useState('');
  const [linkPasswordValue, setLinkPasswordValue] = useState('');

  useEffect(() => {
    return () => {
      clearPhoneRecaptcha();
    };
  }, []);

  useEffect(() => {
    if (privateInfo?.privacySettings) {
      setPrivacy(withPrivacyDefaults(privateInfo.privacySettings));
    }
  }, [privateInfo]);

  useEffect(() => {
    if (!profile?.uid) return;
    const u1 = subscribeMyVerificationRequests(profile.uid, setMyBadgeRequests);
    const u2 = subscribeMyIdentityVerifications(profile.uid, setMyIdRequests);
    return () => {
      u1();
      u2();
    };
  }, [profile?.uid]);

  // Role-gated Admin sections
  const adminSections = useMemo(() => {
    if (!canAccessAdmin || !myRole) return [];
    const list: { key: AdminSectionKey; label: string; icon: React.ComponentType<{ size?: number }> }[] = [];
    if (hasAdminPermission(myRole, 'view_analytics')) {
      list.push({ key: 'analytics', label: 'Platform Analytics', icon: BarChart3 });
    }
    if (
      hasAdminPermission(myRole, 'manage_platform') ||
      hasAdminPermission(myRole, 'manage_notifications') ||
      hasAdminPermission(myRole, 'manage_communities')
    ) {
      list.push({ key: 'ai_control', label: 'Nexora AI Control', icon: Bot });
    }
    if (hasAdminPermission(myRole, 'manage_admins')) {
      list.push({ key: 'admins', label: 'Admin Management', icon: Shield });
    }
    if (hasAdminPermission(myRole, 'manage_communities')) {
      list.push({ key: 'communities', label: 'Community Control', icon: Compass });
    }
    if (hasAdminPermission(myRole, 'manage_verification')) {
      list.push({ key: 'verification', label: 'Verification & Badges', icon: BadgeCheck });
    }
    if (hasAdminPermission(myRole, 'review_identity_docs')) {
      list.push({ key: 'identity', label: 'Identity Verification', icon: Lock });
    }
    if (
      hasAdminPermission(myRole, 'moderate_content') ||
      hasAdminPermission(myRole, 'manage_platform')
    ) {
      list.push({ key: 'gifts', label: 'Free Virtual Gifts', icon: Gift });
    }
    if (hasAdminPermission(myRole, 'manage_platform')) {
      list.push({ key: 'subscriptions_admin', label: 'Subscriptions & Billing', icon: CreditCard });
      list.push({ key: 'studio_admin', label: 'Studio Customisation', icon: Sparkles });
      list.push({ key: 'platform', label: 'Platform Management', icon: Globe });
    }
    if (
      myRole.role === 'owner' ||
      hasAdminPermission(myRole, 'manage_rewards') ||
      hasAdminPermission(myRole, 'manage_withdrawals') ||
      hasAdminPermission(myRole, 'manage_platform')
    ) {
      list.push({ key: 'rewards_admin', label: 'Rewards & Payments', icon: Banknote });
    }
    if (hasAdminPermission(myRole, 'moderate_content')) {
      list.push({ key: 'moderation', label: 'Reports & Support', icon: Flag });
    }
    if (hasAdminPermission(myRole, 'manage_notifications')) {
      list.push({ key: 'notifications', label: 'Email & Notices', icon: Megaphone });
    }
    if (
      hasAdminPermission(myRole, 'view_audit_logs') ||
      hasAdminPermission(myRole, 'manage_admins') ||
      hasAdminPermission(myRole, 'manage_platform')
    ) {
      list.push({ key: 'diagnostics', label: 'System Diagnostics', icon: Activity });
    }
    if (
      hasAdminPermission(myRole, 'view_audit_logs') ||
      hasAdminPermission(myRole, 'manage_admins')
    ) {
      list.push({ key: 'audit', label: 'Immutable Audit Trail', icon: History });
    }
    return list;
  }, [canAccessAdmin, myRole]);

  const [activeAdminTab, setActiveAdminTab] = useState<AdminSectionKey>('analytics');

  useEffect(() => {
    if (
      adminSections.length > 0 &&
      !adminSections.some((s) => s.key === activeAdminTab)
    ) {
      setActiveAdminTab(adminSections[0].key);
    }
  }, [adminSections, activeAdminTab]);

  if (!profile || !user) return null;

  const activeBadges = getUserBadges(profile.uid, profile.verified);
  const isFounderAccount = activeBadges.includes('founder');
  const blockedUsers = users.filter((u) =>
    (privateInfo?.blockedUserIds || []).includes(u.uid)
  );

  const toggleChannelPref = (
    channel: 'inAppNotifications' | 'emailNotifications',
    cat: NotificationCategory
  ) => {
    if (cat === 'security') return;
    setPrivacy((prev) => {
      const defaults = withPrivacyDefaults(prev);
      const currentMap = defaults[channel]!;
      return {
        ...defaults,
        [channel]: {
          ...currentMap,
          [cat]: !currentMap[cat],
          security: true,
        },
      };
    });
  };

  const handleChangePresence = async (mode: Parameters<typeof setMyAdminStatus>[0]) => {
    setPresenceBusy(true);
    setPresenceError('');
    try {
      await setMyAdminStatus(mode);
    } catch (err) {
      setPresenceError(extractReadableErrorMessage(err, 'Unable to update your presence status right now.'));
    } finally {
      setPresenceBusy(false);
    }
  };

  const handleSavePrivacy = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPrivacy(true);
    setPrivacyNotice('');
    try {
      await updateUserPrivacySettings(
        profile.uid,
        withPrivacyDefaults(privacy),
        privateInfo?.blockedUserIds || []
      );
      await refreshUserAndProfile();
      setPrivacyNotice('Privacy, collaboration & notification controls saved.');
    } catch (err) {
      setPrivacyNotice(extractReadableErrorMessage(err, 'Unable to save privacy preferences right now.'));
    } finally {
      setSavingPrivacy(false);
    }
  };

  const handleUnblock = async (targetUid: string) => {
    if (!privateInfo) return;
    try {
      const next = privateInfo.blockedUserIds.filter((id) => id !== targetUid);
      await updateUserPrivacySettings(profile.uid, privacy, next);
      await refreshUserAndProfile();
    } catch (err) {
      setPrivacyNotice(extractReadableErrorMessage(err, 'Unable to unblock account right now.'));
    }
  };

  const handleApplyBadge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reqRationale.trim()) return;
    setSubmittingBadge(true);
    setBadgeFeedback('');
    try {
      await submitVerificationRequest({
        user: profile,
        requestedBadge: reqBadgeType,
        category: reqCategory,
        rationale: reqRationale.trim(),
        referenceLink: reqLink.trim(),
      });
      setReqRationale('');
      setReqLink('');
      setBadgeFeedback('Badge application submitted for Nexora verification review.');
    } catch (err) {
      setBadgeFeedback(
        extractReadableErrorMessage(err, 'Unable to submit badge application.')
      );
    } finally {
      setSubmittingBadge(false);
    }
  };

  const handleSubmitIdentity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docFile || !legalFullName.trim() || !docCountry.trim()) return;
    setSubmittingId(true);
    setIdFeedback('');
    try {
      const encoded = await encodeRestrictedIdentityDocument(docFile);
      await submitIdentityVerification({
        user: profile,
        legalFullName: legalFullName.trim(),
        documentType: docType,
        documentCountry: docCountry.trim(),
        documentPreviewUrl: encoded.dataUrl,
        documentFileName: encoded.fileName,
      });
      setLegalFullName('');
      setDocCountry('');
      setDocFile(null);
      setIdFeedback(
        'Confidential identity document submitted securely. Approving reviewers automatically activate your blue Verified Identity badge.'
      );
    } catch (err) {
      setIdFeedback(
        extractReadableErrorMessage(err, 'Unable to submit identity document.')
      );
    } finally {
      setSubmittingId(false);
    }
  };

  const handleSubmitSupportTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supportSubject.trim() || !supportMessage.trim()) return;
    setSubmittingSupport(true);
    setSupportFeedback('');
    try {
      await submitContactSubmission({
        user: profile,
        name: profile.displayName,
        email: user.email || '',
        category: supportCategory,
        subject: supportSubject.trim(),
        message: supportMessage.trim(),
      });
      setSupportSubject('');
      setSupportMessage('');
      setSupportFeedback(
        'Your support ticket was submitted. Our team will respond via in-app notification & email.'
      );
    } catch (err) {
      setSupportFeedback(
        extractReadableErrorMessage(err, 'Unable to submit support ticket.')
      );
    } finally {
      setSubmittingSupport(false);
    }
  };

  return (
    <div className="w-full space-y-6">
      {/* Top Header + Private Staff Switcher (ONLY rendered for authorized active staff) */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-white flex items-center gap-2">
            {viewMode === 'admin' && canAccessAdmin ? 'Nexora Administration' : 'Settings & Privacy'}
            {isFounderAccount && <VerifiedBadge size={18} variant="founder" />}
          </h1>
          <p className="text-sm text-[#94A3B8]">
            {viewMode === 'admin' && canAccessAdmin
              ? 'Private executive governance, 20-badge controls, email delivery, gifting, safety, and platform administration console.'
              : 'Manage your security, 20-badge verification status, tagging & collaboration controls, notification channels, and support.'}
          </p>
        </div>

        {canAccessAdmin && myRole && (
          <div className="inline-flex items-center p-1 rounded-2xl bg-[#0D0B16] border border-[#8B5CF6]/25 self-start md:self-auto">
            <button
              type="button"
              onClick={() => setViewMode('personal')}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition ${
                viewMode === 'personal'
                  ? 'bg-[#7C3AED] text-white'
                  : 'text-[#94A3B8] hover:text-white'
              }`}
            >
              Account Settings
            </button>
            <button
              type="button"
              onClick={() => setViewMode('admin')}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition ${
                viewMode === 'admin'
                  ? 'bg-gradient-to-r from-[#2563EB] to-[#7C3AED] text-white shadow-[0_0_18px_rgba(37,99,235,0.35)]'
                  : 'text-sky-300 hover:text-white'
              }`}
            >
              <Shield size={13} />
              NEXORA ADMINISTRATION
            </button>
          </div>
        )}
      </div>

      {/* PRIVATE ADMINISTRATION CENTRE VIEW */}
      {viewMode === 'admin' && canAccessAdmin && myRole ? (
        <div className="space-y-6">
          {/* Role Status Strip + Staff Presence Control */}
          <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-[#0D0B16] via-[#131126] to-[#0D0B16] border border-[#38BDF8]/25 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-sky-500/15 border border-sky-400/30 flex items-center justify-center text-sky-300 shrink-0">
                  <Shield size={18} />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-display text-sm font-bold text-white">
                      {profile.displayName}
                    </span>
                    <BadgeStrip badges={activeBadges} size={15} max={4} />
                    <span className="px-2.5 py-0.5 rounded-md bg-sky-500/15 border border-sky-400/30 text-[10px] font-semibold uppercase tracking-wide text-sky-200">
                      {ROLE_LABELS[myRole.role]}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#94A3B8] mt-0.5">
                    Authenticated Staff ID: {myRole.email} • {adminSections.length} authorized module(s)
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-white/[0.08]">
              <AdminPresenceSelector
                currentMode={myAdminManualMode}
                effectiveStatus={myAdminSelfStatus}
                onChange={handleChangePresence}
                busy={presenceBusy}
              />
              {presenceError && <p className="text-xs text-rose-400 mt-2">{presenceError}</p>}
            </div>
          </div>

          {/* Two-Column Desktop Governance Shell */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <aside className="lg:col-span-3 rounded-2xl bg-[#0D0B16] border border-[#8B5CF6]/20 p-2.5 flex lg:flex-col gap-1.5 overflow-x-auto lg:sticky lg:top-24">
              {adminSections.map((sec) => {
                const Icon = sec.icon;
                const active = activeAdminTab === sec.key;
                return (
                  <button
                    key={sec.key}
                    type="button"
                    onClick={() => setActiveAdminTab(sec.key)}
                    className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold whitespace-nowrap lg:w-full text-left transition ${
                      active
                        ? 'bg-gradient-to-r from-[#6D28D9]/80 to-[#7C3AED]/80 text-white shadow-[0_4px_16px_rgba(124,58,237,0.3)]'
                        : 'text-[#94A3B8] hover:text-white hover:bg-white/[0.04]'
                    }`}
                  >
                    <Icon size={15} />
                    <span>{sec.label}</span>
                  </button>
                );
              })}
            </aside>

            <section className="lg:col-span-9 rounded-2xl bg-[#0D0B16] border border-[#8B5CF6]/20 p-5 sm:p-6 min-w-0">
              {activeAdminTab === 'analytics' && hasAdminPermission(myRole, 'view_analytics') && (
                <PlatformAnalyticsPanel />
              )}
              {activeAdminTab === 'ai_control' &&
                (hasAdminPermission(myRole, 'manage_platform') ||
                  hasAdminPermission(myRole, 'manage_notifications') ||
                  hasAdminPermission(myRole, 'manage_communities')) && (
                  <NexoraAiControlPanel actor={profile} myRole={myRole} spaces={spaces} />
                )}
              {activeAdminTab === 'admins' && hasAdminPermission(myRole, 'manage_admins') && (
                <AdminManagementPanel actor={profile} myRole={myRole} users={users} />
              )}
              {activeAdminTab === 'communities' &&
                hasAdminPermission(myRole, 'manage_communities') && (
                  <CommunityControlPanel
                    actor={profile}
                    myRole={myRole}
                    spaces={spaces}
                    users={users}
                  />
                )}
              {activeAdminTab === 'verification' &&
                hasAdminPermission(myRole, 'manage_verification') && (
                  <VerificationCentrePanel actor={profile} myRole={myRole} users={users} />
                )}
              {activeAdminTab === 'identity' &&
                hasAdminPermission(myRole, 'review_identity_docs') && (
                  <IdentityVerificationPanel actor={profile} myRole={myRole} />
                )}
              {activeAdminTab === 'gifts' &&
                (hasAdminPermission(myRole, 'moderate_content') ||
                  hasAdminPermission(myRole, 'manage_platform')) && (
                  <GiftModerationPanel actor={profile} myRole={myRole} />
                )}
              {activeAdminTab === 'subscriptions_admin' &&
                hasAdminPermission(myRole, 'manage_platform') && (
                  <AdminSubscriptionManagementPanel
                    actor={profile}
                    actorRole={myRole.role}
                    users={users}
                  />
                )}
              {activeAdminTab === 'rewards_admin' &&
                (myRole.role === 'owner' ||
                  hasAdminPermission(myRole, 'manage_rewards') ||
                  hasAdminPermission(myRole, 'manage_withdrawals') ||
                  hasAdminPermission(myRole, 'manage_platform')) && (
                  <RewardsAndPaymentsAdminPanel />
                )}
              {activeAdminTab === 'studio_admin' &&
                hasAdminPermission(myRole, 'manage_platform') && (
                  <AdminCustomisationCatalogPanel
                    actor={profile}
                    actorRole={myRole.role}
                  />
                )}
              {activeAdminTab === 'platform' && hasAdminPermission(myRole, 'manage_platform') && (
                <PlatformManagementPanel actor={profile} myRole={myRole} />
              )}
              {activeAdminTab === 'moderation' &&
                hasAdminPermission(myRole, 'moderate_content') && (
                  <ModerationReportsPanel
                    actor={profile}
                    myRole={myRole}
                    posts={posts}
                    vibes={vibes}
                    spaces={spaces}
                    users={users}
                  />
                )}
              {activeAdminTab === 'notifications' &&
                hasAdminPermission(myRole, 'manage_notifications') && (
                  <NotificationManagementPanel
                    actor={profile}
                    myRole={myRole}
                    users={users}
                  />
                )}
              {activeAdminTab === 'diagnostics' &&
                (hasAdminPermission(myRole, 'view_audit_logs') ||
                  hasAdminPermission(myRole, 'manage_admins') ||
                  hasAdminPermission(myRole, 'manage_platform')) && (
                  <SystemDiagnosticsPanel actor={profile} />
                )}
              {activeAdminTab === 'audit' &&
                (hasAdminPermission(myRole, 'view_audit_logs') ||
                  hasAdminPermission(myRole, 'manage_admins')) && <AuditLogPanel />}
            </section>
          </div>
        </div>
      ) : (
        /* STANDARD ACCOUNT, CUSTOMIZATION & PRIVACY SETTINGS */
        <div className="space-y-6 max-w-[1080px]">
          {/* Personal Settings Section Switcher */}
          <nav
            aria-label="Settings sections"
            className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 border-b border-white/[0.08]"
          >
            {[
              { id: 'all', label: 'All Settings' },
              { id: 'customize-homepage', label: 'Customize Homepage', icon: LayoutGrid },
              { id: 'account', label: 'Account & Sign-In' },
              { id: 'privacy', label: 'Privacy & Alerts' },
              { id: 'badges', label: 'Verification & Badges' },
              { id: 'support', label: 'Support & Blocked' },
            ].map((tab) => {
              const Icon = tab.icon;
              const active = personalTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setPersonalTab(tab.id as typeof personalTab)}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold whitespace-nowrap transition min-h-[40px] ${
                    active
                      ? 'bg-[#7C3AED] text-white shadow-[0_2px_14px_rgba(124,58,237,0.35)]'
                      : 'text-[#94A3B8] hover:text-white hover:bg-white/[0.04]'
                  }`}
                >
                  {Icon && <Icon size={13} />}
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Tasks, Invitations & Rewards Quick Access */}
          {onNavigate && (personalTab === 'all' || personalTab === 'account') && (
            <section className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-[#0D0B16] border border-slate-200 dark:border-[#8B5CF6]/20 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                    <Gift size={17} className="text-amber-400" /> Tasks, Invitations &amp; Wallet
                  </h2>
                  <p className="text-xs text-slate-600 dark:text-[#94A3B8] mt-0.5">
                    Complete free tasks, share your personal referral link, and track your Key Points wallet.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <button
                  type="button"
                  onClick={() => onNavigate('tasks')}
                  className="p-3 rounded-xl bg-slate-50 dark:bg-[#08070F] border border-slate-200 dark:border-white/10 hover:border-[#8B5CF6]/45 text-left space-y-1 transition-colors"
                >
                  <Gift size={15} className="text-amber-300" />
                  <p className="text-xs font-semibold text-slate-900 dark:text-white">Free Tasks</p>
                  <p className="text-[11px] text-slate-500 dark:text-[#94A3B8]">Earn Key Points</p>
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('invite')}
                  className="p-3 rounded-xl bg-slate-50 dark:bg-[#08070F] border border-slate-200 dark:border-white/10 hover:border-[#8B5CF6]/45 text-left space-y-1 transition-colors"
                >
                  <Link2 size={15} className="text-emerald-400" />
                  <p className="text-xs font-semibold text-slate-900 dark:text-white">Invite Friends</p>
                  <p className="text-[11px] text-slate-500 dark:text-[#94A3B8]">1 KP / 10 referrals</p>
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('wallet')}
                  className="p-3 rounded-xl bg-slate-50 dark:bg-[#08070F] border border-slate-200 dark:border-white/10 hover:border-[#8B5CF6]/45 text-left space-y-1 transition-colors"
                >
                  <Banknote size={15} className="text-[#C084FC]" />
                  <p className="text-xs font-semibold text-slate-900 dark:text-white">Nexora Wallet</p>
                  <p className="text-[11px] text-slate-500 dark:text-[#94A3B8]">Naira withdrawals</p>
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('rewards-history')}
                  className="p-3 rounded-xl bg-slate-50 dark:bg-[#08070F] border border-slate-200 dark:border-white/10 hover:border-[#8B5CF6]/45 text-left space-y-1 transition-colors"
                >
                  <History size={15} className="text-sky-400" />
                  <p className="text-xs font-semibold text-slate-900 dark:text-white">Rewards History</p>
                  <p className="text-[11px] text-slate-500 dark:text-[#94A3B8]">Ledger &amp; payouts</p>
                </button>
              </div>
            </section>
          )}

          {/* Global Appearance & Theme Mode (Synced across devices via Firestore) */}
          {(personalTab === 'all' || personalTab === 'account' || personalTab === 'customize-homepage') && (
            <section className="p-6 rounded-2xl bg-white dark:bg-[#0D0B16] border border-slate-200 dark:border-[#8B5CF6]/20 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                    <Palette size={17} className="text-[#7C3AED] dark:text-[#C084FC]" /> Appearance &amp; Theme
                  </h2>
                  <p className="text-xs text-slate-600 dark:text-[#94A3B8] mt-0.5">
                    Choose Dark Mode, Light Mode, or follow your device&apos;s System Default. Your choice syncs across all signed-in devices.
                  </p>
                </div>
                <span className="text-[11px] font-medium px-2.5 py-1 rounded-lg bg-[#7C3AED]/10 border border-[#8B5CF6]/30 text-[#6D28D9] dark:text-[#E9D5FF] self-start sm:self-auto">
                  {savingTheme
                    ? 'Syncing theme...'
                    : `Active: ${resolvedTheme === 'dark' ? 'Dark' : 'Light'} (${themeMode})`}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  {
                    id: 'dark' as const,
                    label: 'Dark Mode',
                    desc: 'Deep obsidian canvas with violet luminescence',
                    icon: Moon,
                  },
                  {
                    id: 'light' as const,
                    label: 'Light Mode',
                    desc: 'Crisp pearl-slate daylight surface for bright spaces',
                    icon: Sun,
                  },
                  {
                    id: 'system' as const,
                    label: 'System Default',
                    desc: 'Automatically match your OS appearance setting',
                    icon: Monitor,
                  },
                ].map((opt) => {
                  const Icon = opt.icon;
                  const active = themeMode === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => void setThemeMode(opt.id)}
                      aria-pressed={active}
                      className={`p-4 rounded-xl border text-left transition-all flex items-start gap-3 ${
                        active
                          ? 'bg-[#7C3AED]/15 border-[#7C3AED] ring-1 ring-[#8B5CF6]/40 shadow-sm'
                          : 'bg-slate-50 dark:bg-[#08070F] border-slate-200 dark:border-white/10 hover:border-[#8B5CF6]/45'
                      }`}
                    >
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                          active
                            ? 'bg-[#7C3AED] text-white'
                            : 'bg-white dark:bg-[#141420] text-slate-700 dark:text-[#CBD5E1] border border-slate-200 dark:border-white/10'
                        }`}
                      >
                        <Icon size={16} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-900 dark:text-white">
                          {opt.label}
                        </p>
                        <p className="text-[11px] text-slate-600 dark:text-[#94A3B8] mt-0.5 leading-snug">
                          {opt.desc}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* Customize Homepage Workspace */}
          {(personalTab === 'all' || personalTab === 'customize-homepage') && (
            <HomepageCustomizationPanel onOpenHome={() => onNavigate?.('home')} />
          )}

          {/* Account Security & Multi-Badge Summary */}
          {(personalTab === 'all' || personalTab === 'account') && (
          <section className="p-6 rounded-2xl bg-[#0D0B16] border border-[#8B5CF6]/20 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h2 className="font-display text-base font-semibold text-white flex items-center gap-2">
                <ShieldCheck size={17} className="text-[#C084FC]" /> Account &amp; Badge Status
              </h2>
              <button
                type="button"
                onClick={() => openBadgeModal(activeBadges[0] || 'verified_identity')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#7C3AED]/15 hover:bg-[#7C3AED]/25 border border-[#8B5CF6]/30 text-xs font-semibold text-[#E9D5FF] self-start sm:self-auto"
              >
                <Award size={13} /> View All 20 Nexora Badges
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
              <div className="p-3.5 rounded-xl bg-[#08070F] border border-[#8B5CF6]/15">
                <p className="text-[#64748B]">Email Address (Private)</p>
                <p className="text-white font-medium mt-1 truncate">{user.email || 'Not attached'}</p>
              </div>
              <div className="p-3.5 rounded-xl bg-[#08070F] border border-[#8B5CF6]/15">
                <p className="text-[#64748B]">Phone Number (Private)</p>
                <p className="text-white font-medium mt-1 truncate">
                  {user.phoneNumber ? maskPhoneNumber(user.phoneNumber) : 'Not connected'}
                </p>
              </div>
              <div className="p-3.5 rounded-xl bg-[#08070F] border border-[#8B5CF6]/15">
                <p className="text-[#64748B]">Verification Status</p>
                <p className="text-emerald-400 font-medium mt-1">
                  {user.emailVerified
                    ? 'Email Verified'
                    : user.phoneNumber
                    ? 'Phone SMS Verified'
                    : 'Pending verification'}
                </p>
              </div>
              <div className="p-3.5 rounded-xl bg-[#08070F] border border-[#8B5CF6]/15">
                <p className="text-[#64748B]">Active Profile Badges</p>
                <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                  {activeBadges.length > 0 ? (
                    <BadgeStrip badges={activeBadges} size={16} max={6} />
                  ) : (
                    <span className="text-[#94A3B8]">Standard Member</span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 pt-1">
              {user.email && (
                <button
                  type="button"
                  onClick={async () => {
                    if (!user.email) return;
                    try {
                      await sendPasswordReset(user.email);
                      setPrivacyNotice('Password reset email dispatched.');
                    } catch (err) {
                      setPrivacyNotice(extractReadableErrorMessage(err, 'Unable to send password reset email right now.'));
                    }
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-xs font-medium text-white"
                >
                  <KeyRound size={14} /> Send Password Reset Email
                </button>
              )}
              <button
                type="button"
                onClick={() => void logoutUser(profile.uid)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/25 text-xs font-medium text-rose-300"
              >
                <LogOut size={14} /> Sign Out
              </button>
            </div>
          </section>
          )}

          {/* Connected Sign-In Methods & Multi-Provider Account Security */}
          {(personalTab === 'all' || personalTab === 'account') && (
          <section className="p-5 sm:p-6 rounded-2xl bg-[#0D0B16] border border-[#8B5CF6]/20 space-y-4">
            <div className="space-y-1">
              <h2 className="font-display text-base font-semibold text-white flex items-center gap-2">
                <Link2 size={17} className="text-[#C084FC]" /> Connected Sign-In Methods
              </h2>
              <p className="text-xs text-[#94A3B8]">
                Link Google, GitHub, Apple, Microsoft, Facebook, Phone SMS, or Email &amp; Password to sign into your same Nexora account across devices.
              </p>
            </div>

            {authFeedback && (
              <div
                className={`p-3 rounded-xl text-xs leading-relaxed border ${
                  authFeedback.type === 'error'
                    ? 'bg-rose-500/10 border-rose-500/25 text-rose-300'
                    : 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300'
                }`}
              >
                {authFeedback.text}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {AUTH_PROVIDER_LIST.map((provider) => {
                const linkedEntry = user.providerData.find((p) => p?.providerId === provider.id);
                const isConnected = Boolean(linkedEntry);
                const canDisconnect = isConnected && user.providerData.length > 1;
                const isBusy = authBusyMethod === provider.id;

                return (
                  <div
                    key={provider.id}
                    className="p-3.5 rounded-xl bg-[#08070F] border border-[#8B5CF6]/15 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-white/[0.06] border border-white/10 flex items-center justify-center shrink-0">
                        <ProviderLogo providerId={provider.id} size={18} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-white truncate">{provider.label}</p>
                        <p className={`text-[11px] truncate ${isConnected ? 'text-emerald-400' : 'text-[#64748B]'}`}>
                          {isConnected
                            ? linkedEntry?.email ||
                              (linkedEntry?.phoneNumber ? maskPhoneNumber(linkedEntry.phoneNumber) : 'Connected')
                            : 'Not connected'}
                        </p>
                      </div>
                    </div>

                    {isConnected ? (
                      <button
                        type="button"
                        disabled={!canDisconnect || authBusyMethod !== null}
                        title={
                          canDisconnect
                            ? `Disconnect ${provider.label}`
                            : 'Keep at least one sign-in method connected'
                        }
                        onClick={async () => {
                          setAuthFeedback(null);
                          setAuthBusyMethod(provider.id);
                          try {
                            await unlinkProviderFromCurrentUser(provider.id);
                            await refreshUserAndProfile(false);
                            setAuthFeedback({
                              type: 'success',
                              text: `${provider.label} was disconnected from your account.`,
                            });
                          } catch (err) {
                            setAuthFeedback({ type: 'error', text: mapAuthErrorMessage(err) });
                          } finally {
                            setAuthBusyMethod(null);
                          }
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/15 hover:bg-white/10 disabled:opacity-40 text-[11px] font-medium text-[#CBD5E1] shrink-0"
                      >
                        <Unlink size={12} />
                        {isBusy ? 'Removing...' : canDisconnect ? 'Disconnect' : 'Primary'}
                      </button>
                    ) : provider.category === 'oauth' ? (
                      <button
                        type="button"
                        disabled={authBusyMethod !== null}
                        onClick={async () => {
                          setAuthFeedback(null);
                          setAuthBusyMethod(provider.id);
                          try {
                            await linkOAuthProviderToCurrentUser(provider.id as OAuthProviderId);
                            await refreshUserAndProfile(false);
                            setAuthFeedback({
                              type: 'success',
                              text: `${provider.label} is now connected to your Nexora account.`,
                            });
                          } catch (err) {
                            setAuthFeedback({ type: 'error', text: mapAuthErrorMessage(err) });
                          } finally {
                            setAuthBusyMethod(null);
                          }
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#7C3AED]/20 hover:bg-[#7C3AED]/35 border border-[#8B5CF6]/35 text-[11px] font-semibold text-[#E9D5FF] shrink-0 disabled:opacity-50"
                      >
                        {isBusy ? 'Connecting...' : 'Connect'}
                      </button>
                    ) : provider.id === 'phone' ? (
                      <button
                        type="button"
                        disabled={authBusyMethod !== null}
                        onClick={() => {
                          setAuthFeedback(null);
                          setShowEmailLinkForm(false);
                          setShowPhoneLinkForm((v) => !v);
                          setLinkPhoneOtpSession(null);
                          setLinkPhoneCode('');
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#7C3AED]/20 hover:bg-[#7C3AED]/35 border border-[#8B5CF6]/35 text-[11px] font-semibold text-[#E9D5FF] shrink-0 disabled:opacity-50"
                      >
                        {showPhoneLinkForm ? 'Close' : 'Connect Phone'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={authBusyMethod !== null}
                        onClick={() => {
                          setAuthFeedback(null);
                          setShowPhoneLinkForm(false);
                          setShowEmailLinkForm((v) => !v);
                          setLinkEmailValue(user.email || '');
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#7C3AED]/20 hover:bg-[#7C3AED]/35 border border-[#8B5CF6]/35 text-[11px] font-semibold text-[#E9D5FF] shrink-0 disabled:opacity-50"
                      >
                        {showEmailLinkForm ? 'Close' : 'Add Password'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {showPhoneLinkForm && (
              <div className="p-4 rounded-xl bg-[#08070F] border border-[#8B5CF6]/30 space-y-3">
                <p className="text-xs font-semibold text-white">Link Phone Number via SMS Verification</p>
                {!linkPhoneOtpSession ? (
                  <div className="flex flex-col sm:flex-row gap-2">
                    <select
                      aria-label="Country dial code"
                      value={linkPhoneDial}
                      onChange={(e) => setLinkPhoneDial(e.target.value)}
                      className="sm:w-[120px] px-3 py-2 rounded-lg bg-[#0D0B16] border border-white/15 text-xs text-white"
                    >
                      <option value="+1">US / CA (+1)</option>
                      <option value="+44">UK (+44)</option>
                      <option value="+61">AU (+61)</option>
                      <option value="+234">NG (+234)</option>
                      <option value="+27">ZA (+27)</option>
                      <option value="+91">IN (+91)</option>
                      <option value="+49">DE (+49)</option>
                      <option value="+33">FR (+33)</option>
                      <option value="+971">AE (+971)</option>
                    </select>
                    <input
                      type="tel"
                      value={linkPhoneLocal}
                      onChange={(e) => setLinkPhoneLocal(e.target.value)}
                      placeholder="555 234 5678"
                      className="flex-1 px-3 py-2 rounded-lg bg-[#0D0B16] border border-white/15 text-xs text-white"
                    />
                    <button
                      type="button"
                      disabled={authBusyMethod !== null}
                      onClick={async () => {
                        setAuthFeedback(null);
                        const e164 = normalizeE164Phone(linkPhoneDial, linkPhoneLocal);
                        if (!validateE164Phone(e164)) {
                          setAuthFeedback({
                            type: 'error',
                            text: 'Please enter a valid phone number including your country code.',
                          });
                          return;
                        }
                        setAuthBusyMethod('phone');
                        try {
                          const sess = await sendPhoneLinkOtp({
                            phoneNumber: e164,
                            containerId: 'nexora-settings-phone-recaptcha',
                          });
                          setLinkPhoneOtpSession(sess);
                          setAuthFeedback({
                            type: 'success',
                            text: `6-digit SMS code sent to ${maskPhoneNumber(e164)}.`,
                          });
                        } catch (err) {
                          setAuthFeedback({ type: 'error', text: mapAuthErrorMessage(err) });
                        } finally {
                          setAuthBusyMethod(null);
                        }
                      }}
                      className="px-4 py-2 rounded-lg bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-xs font-semibold shrink-0"
                    >
                      {authBusyMethod === 'phone' ? 'Sending...' : 'Send SMS Code'}
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={linkPhoneCode}
                      onChange={(e) => setLinkPhoneCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="6-digit SMS code"
                      className="flex-1 px-3 py-2 rounded-lg bg-[#0D0B16] border border-white/15 text-xs text-white tracking-widest"
                    />
                    <button
                      type="button"
                      disabled={authBusyMethod !== null || linkPhoneCode.length !== 6}
                      onClick={async () => {
                        setAuthFeedback(null);
                        setAuthBusyMethod('phone');
                        try {
                          await confirmPhoneLinkOtp({
                            session: linkPhoneOtpSession,
                            code: linkPhoneCode,
                          });
                          await refreshUserAndProfile(false);
                          setShowPhoneLinkForm(false);
                          setLinkPhoneOtpSession(null);
                          setLinkPhoneCode('');
                          setLinkPhoneLocal('');
                          setAuthFeedback({
                            type: 'success',
                            text: 'Phone number linked to your Nexora account.',
                          });
                        } catch (err) {
                          setAuthFeedback({ type: 'error', text: mapAuthErrorMessage(err) });
                        } finally {
                          setAuthBusyMethod(null);
                        }
                      }}
                      className="px-4 py-2 rounded-lg bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-xs font-semibold shrink-0"
                    >
                      {authBusyMethod === 'phone' ? 'Verifying...' : 'Confirm & Link'}
                    </button>
                  </div>
                )}
                <div id="nexora-settings-phone-recaptcha" />
              </div>
            )}

            {showEmailLinkForm && (
              <div className="p-4 rounded-xl bg-[#08070F] border border-[#8B5CF6]/30 space-y-3">
                <p className="text-xs font-semibold text-white">Add Email &amp; Password Sign-In</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="email"
                    value={linkEmailValue}
                    onChange={(e) => setLinkEmailValue(e.target.value)}
                    placeholder="you@domain.com"
                    className="px-3 py-2 rounded-lg bg-[#0D0B16] border border-white/15 text-xs text-white"
                  />
                  <input
                    type="password"
                    value={linkPasswordValue}
                    onChange={(e) => setLinkPasswordValue(e.target.value)}
                    placeholder="Password (min 6 chars)"
                    className="px-3 py-2 rounded-lg bg-[#0D0B16] border border-white/15 text-xs text-white"
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={authBusyMethod !== null}
                    onClick={async () => {
                      setAuthFeedback(null);
                      setAuthBusyMethod('password');
                      try {
                        await linkEmailPasswordToCurrentUser(linkEmailValue, linkPasswordValue);
                        await refreshUserAndProfile(false);
                        setShowEmailLinkForm(false);
                        setLinkPasswordValue('');
                        setAuthFeedback({
                          type: 'success',
                          text: 'Email & password sign-in linked to your account.',
                        });
                      } catch (err) {
                        setAuthFeedback({ type: 'error', text: mapAuthErrorMessage(err) });
                      } finally {
                        setAuthBusyMethod(null);
                      }
                    }}
                    className="px-4 py-2 rounded-lg bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-xs font-semibold"
                  >
                    {authBusyMethod === 'password' ? 'Linking...' : 'Link Email & Password'}
                  </button>
                </div>
              </div>
            )}
          </section>
          )}

          {/* Staff Presence Control (Only shown to Owner & Authorized Active Admins) */}
          {(personalTab === 'all' || personalTab === 'account') && canAccessAdmin && myRole && (
            <section className="p-5 sm:p-6 rounded-2xl bg-[#0D0B16] border border-[#8B5CF6]/25 space-y-3">
              <AdminPresenceSelector
                currentMode={myAdminManualMode}
                effectiveStatus={myAdminSelfStatus}
                onChange={handleChangePresence}
                busy={presenceBusy}
              />
              {presenceError && <p className="text-xs text-rose-400">{presenceError}</p>}
            </section>
          )}

          {/* Membership, Studio & Creator Hub Shortcuts */}
          {(personalTab === 'all' || personalTab === 'account') && onNavigate && (
            <section className="p-5 sm:p-6 rounded-2xl bg-[#0D0B16] border border-[#8B5CF6]/20 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-display text-base font-semibold text-white flex items-center gap-2">
                    <Sparkles size={17} className="text-[#C084FC]" /> Membership &amp; Creator Suite
                  </h2>
                  <TierBadge tier={effectiveTier} />
                </div>
                <p className="text-xs text-[#94A3B8]">
                  Manage your Nexora subscription plan, customise your profile visual studio, review alerts, or inspect creator analytics.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => onNavigate('subscriptions')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#6D28D9] to-[#7C3AED] text-xs font-semibold text-white min-h-[40px]"
                >
                  <CreditCard size={14} /> Plans &amp; Billing
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('studio')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/10 text-xs font-semibold text-white min-h-[40px]"
                >
                  <Palette size={14} className="text-[#C084FC]" /> Profile Studio
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('analytics')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/10 text-xs font-semibold text-white min-h-[40px]"
                >
                  <BarChart3 size={14} className="text-sky-300" /> Analytics
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('notifications')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/10 text-xs font-semibold text-white min-h-[40px]"
                >
                  <BellRing size={14} className="text-amber-300" /> Notification Centre
                </button>
              </div>
            </section>
          )}

          {/* Install Nexora App (PWA / Android Home Screen / Desktop Standalone) */}
          {(personalTab === 'all' || personalTab === 'account') && (
          <section className="p-5 sm:p-6 rounded-2xl bg-[#0D0B16] border border-[#8B5CF6]/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <h2 className="font-display text-base font-semibold text-white flex items-center gap-2">
                <Smartphone size={17} className="text-[#C084FC]" /> Install Nexora App
              </h2>
              <p className="text-xs text-[#94A3B8]">
                Run Nexora natively from your Android, iOS, or desktop home screen with offline resilience.
              </p>
            </div>
            <div className="shrink-0">
              <PWAInstallButton variant="card" />
            </div>
          </section>
          )}

          {/* User-Facing Badge Applications & Confidential Identity Submission */}
          {(personalTab === 'all' || personalTab === 'badges') && !isFounderAccount && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Badge Application */}
              <form
                onSubmit={handleApplyBadge}
                className="p-6 rounded-2xl bg-[#0D0B16] border border-[#8B5CF6]/20 space-y-4"
              >
                <h2 className="font-display text-base font-semibold text-white flex items-center gap-2">
                  <BadgeCheck size={17} className="text-[#C084FC]" /> Apply for Specialty Badges
                </h2>
                <p className="text-[11px] text-[#94A3B8]">
                  Apply for Creator, Organization, Media, Educator, Journalist, Community, or Supporter badges. Note: the blue <strong className="text-sky-300">Verified Identity</strong> badge is earned exclusively through approved Government Identity Verification.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="block space-y-1">
                    <span className="text-xs font-medium text-[#CBD5E1]">Requested Badge</span>
                    <select
                      value={reqBadgeType}
                      onChange={(e) => setReqBadgeType(e.target.value as VerifiedBadgeType)}
                      className="w-full px-3 py-2 rounded-xl bg-[#08070F] border border-[#8B5CF6]/20 text-xs text-white"
                    >
                      {APPLICATION_ELIGIBLE_BADGES.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs font-medium text-[#CBD5E1]">Category</span>
                    <input
                      type="text"
                      required
                      maxLength={60}
                      value={reqCategory}
                      onChange={(e) => setReqCategory(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-[#08070F] border border-[#8B5CF6]/20 text-xs text-white"
                    />
                  </label>
                </div>

                <label className="block space-y-1">
                  <span className="text-xs font-medium text-[#CBD5E1]">Official Link (Optional)</span>
                  <input
                    type="text"
                    maxLength={200}
                    value={reqLink}
                    onChange={(e) => setReqLink(e.target.value)}
                    placeholder="https://portfolio.example.com"
                    className="w-full px-3 py-2 rounded-xl bg-[#08070F] border border-[#8B5CF6]/20 text-xs text-white"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-xs font-medium text-[#CBD5E1]">Notability &amp; Eligibility Notes</span>
                  <textarea
                    rows={3}
                    required
                    maxLength={600}
                    value={reqRationale}
                    onChange={(e) => setReqRationale(e.target.value)}
                    placeholder="Explain your public work, creator profile, community leadership, or organization..."
                    className="w-full px-3 py-2 rounded-xl bg-[#08070F] border border-[#8B5CF6]/20 text-xs text-white"
                  />
                </label>

                {badgeFeedback && <p className="text-xs text-[#C084FC]">{badgeFeedback}</p>}

                <button
                  type="submit"
                  disabled={submittingBadge || !reqRationale.trim()}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#6D28D9] via-[#7C3AED] to-[#9333EA] text-xs font-semibold text-white disabled:opacity-40"
                >
                  {submittingBadge ? 'Submitting...' : 'Submit Badge Application'}
                </button>

                {myBadgeRequests.length > 0 && (
                  <div className="pt-3 border-t border-white/[0.06] space-y-1.5">
                    <p className="text-[11px] font-semibold text-[#CBD5E1]">Recent Applications</p>
                    {myBadgeRequests.slice(0, 3).map((r) => {
                      const norm = normalizeBadgeType(r.requestedBadge);
                      return (
                        <div
                          key={r.id}
                          className="flex items-center justify-between text-[11px] text-[#94A3B8] bg-[#08070F] px-3 py-2 rounded-lg"
                        >
                          <span className="inline-flex items-center gap-1.5">
                            <VerifiedBadge size={12} variant={norm} interactive={false} />
                            {BADGE_CATALOG[norm].name} • {formatRelativeTime(r.createdAt)}
                          </span>
                          <span
                            className={`uppercase font-semibold ${
                              r.status === 'approved'
                                ? 'text-emerald-400'
                                : r.status === 'rejected'
                                ? 'text-rose-400'
                                : 'text-amber-300'
                            }`}
                          >
                            {r.status}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </form>

              {/* Confidential Identity Document Submission */}
              <form
                onSubmit={handleSubmitIdentity}
                className="p-6 rounded-2xl bg-[#0D0B16] border border-[#8B5CF6]/20 space-y-4"
              >
                <h2 className="font-display text-base font-semibold text-white flex items-center gap-2">
                  <FileCheck2 size={17} className="text-sky-300" /> Identity Verification (Blue Badge)
                </h2>
                <p className="text-[11px] text-[#94A3B8]">
                  Encrypted in Nexora&apos;s private Firestore vault. Approval automatically awards your official blue <strong className="text-sky-300">Verified Identity</strong> badge.
                </p>

                <label className="block space-y-1">
                  <span className="text-xs font-medium text-[#CBD5E1]">Full Legal Name</span>
                  <input
                    type="text"
                    required
                    maxLength={100}
                    value={legalFullName}
                    onChange={(e) => setLegalFullName(e.target.value)}
                    placeholder="As shown on government ID"
                    className="w-full px-3 py-2 rounded-xl bg-[#08070F] border border-[#8B5CF6]/20 text-xs text-white"
                  />
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="block space-y-1">
                    <span className="text-xs font-medium text-[#CBD5E1]">Document Type</span>
                    <select
                      value={docType}
                      onChange={(e) =>
                        setDocType(
                          e.target.value as 'passport' | 'national_id' | 'drivers_license'
                        )
                      }
                      className="w-full px-3 py-2 rounded-xl bg-[#08070F] border border-[#8B5CF6]/20 text-xs text-white"
                    >
                      <option value="passport">Passport</option>
                      <option value="national_id">National ID</option>
                      <option value="drivers_license">Driver&apos;s License</option>
                    </select>
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs font-medium text-[#CBD5E1]">Issuing Country</span>
                    <input
                      type="text"
                      required
                      maxLength={80}
                      value={docCountry}
                      onChange={(e) => setDocCountry(e.target.value)}
                      placeholder="e.g. United Kingdom"
                      className="w-full px-3 py-2 rounded-xl bg-[#08070F] border border-[#8B5CF6]/20 text-xs text-white"
                    />
                  </label>
                </div>

                <label className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-[#08070F] border border-dashed border-[#8B5CF6]/35 cursor-pointer text-xs text-[#CBD5E1] hover:border-[#8B5CF6]">
                  <span className="inline-flex items-center gap-2 truncate">
                    <Upload size={14} className="text-[#C084FC] shrink-0" />
                    <span className="truncate">
                      {docFile ? docFile.name : 'Upload ID scan (JPG, PNG, WebP or small PDF)'}
                    </span>
                  </span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    onChange={(e) => setDocFile(e.target.files?.[0] || null)}
                    className="hidden"
                  />
                </label>

                {idFeedback && <p className="text-xs text-sky-300">{idFeedback}</p>}

                <button
                  type="submit"
                  disabled={submittingId || !docFile || !legalFullName.trim() || !docCountry.trim()}
                  className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-xs font-semibold text-white disabled:opacity-40"
                >
                  {submittingId ? 'Encrypting & Uploading...' : 'Submit ID Document'}
                </button>

                {myIdRequests.length > 0 && (
                  <div className="pt-3 border-t border-white/[0.06] space-y-1.5">
                    <p className="text-[11px] font-semibold text-[#CBD5E1]">ID Verification Status</p>
                    {myIdRequests.slice(0, 2).map((r) => (
                      <div
                        key={r.id}
                        className="flex items-center justify-between text-[11px] text-[#94A3B8] bg-[#08070F] px-3 py-2 rounded-lg"
                      >
                        <span>
                          {r.documentType.replace('_', ' ')} ({r.documentCountry})
                        </span>
                        <span
                          className={`uppercase font-semibold ${
                            r.status === 'approved'
                              ? 'text-emerald-400'
                              : r.status === 'rejected'
                              ? 'text-rose-400'
                              : 'text-amber-300'
                          }`}
                        >
                          {r.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </form>
            </div>
          )}

          {/* Privacy, Tagging, Collaborations & Dual Notification Preferences */}
          {(personalTab === 'all' || personalTab === 'privacy') && (
          <form
            onSubmit={handleSavePrivacy}
            className="p-6 rounded-2xl bg-[#0D0B16] border border-[#8B5CF6]/20 space-y-6"
          >
            <h2 className="font-display text-base font-semibold text-white flex items-center gap-2">
              <Lock size={17} className="text-[#C084FC]" /> Privacy, Tagging &amp; Collaboration Controls
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-[#CBD5E1]">Profile Visibility</span>
                <select
                  value={privacy.profileVisibility}
                  onChange={(e) =>
                    setPrivacy((p) => ({
                      ...p,
                      profileVisibility: e.target.value as 'public' | 'followers',
                    }))
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#08070F] border border-[#8B5CF6]/20 text-xs text-white outline-none"
                >
                  <option value="public">Public</option>
                  <option value="followers">Followers Only</option>
                </select>
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-[#CBD5E1]">Default Story Privacy</span>
                <select
                  value={privacy.storyPrivacy}
                  onChange={(e) =>
                    setPrivacy((p) => ({
                      ...p,
                      storyPrivacy: e.target.value as PrivacySettings['storyPrivacy'],
                    }))
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#08070F] border border-[#8B5CF6]/20 text-xs text-white outline-none"
                >
                  <option value="public">Everyone</option>
                  <option value="followers">Followers</option>
                  <option value="close">Close Circle</option>
                </select>
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-[#CBD5E1]">Direct Messages</span>
                <select
                  value={privacy.allowDMs}
                  onChange={(e) =>
                    setPrivacy((p) => ({
                      ...p,
                      allowDMs: e.target.value as 'everyone' | 'followers',
                    }))
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#08070F] border border-[#8B5CF6]/20 text-xs text-white outline-none"
                >
                  <option value="everyone">Everyone on Nexora</option>
                  <option value="followers">People you follow</option>
                </select>
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-[#CBD5E1]">Who Can Tag You in Posts</span>
                <select
                  value={privacy.allowTags || 'everyone'}
                  onChange={(e) =>
                    setPrivacy((p) => ({
                      ...p,
                      allowTags: e.target.value as 'everyone' | 'followers' | 'nobody',
                    }))
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#08070F] border border-[#8B5CF6]/20 text-xs text-white outline-none"
                >
                  <option value="everyone">Everyone</option>
                  <option value="followers">Followers Only</option>
                  <option value="nobody">Nobody</option>
                </select>
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-[#CBD5E1]">Collaboration Invitations</span>
                <select
                  value={privacy.allowCollaborations || 'everyone'}
                  onChange={(e) =>
                    setPrivacy((p) => ({
                      ...p,
                      allowCollaborations: e.target.value as 'everyone' | 'followers' | 'nobody',
                    }))
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#08070F] border border-[#8B5CF6]/20 text-xs text-white outline-none"
                >
                  <option value="everyone">Allow From Everyone</option>
                  <option value="followers">Followers Only</option>
                  <option value="nobody">Disable Invites</option>
                </select>
              </label>

              <label className="flex items-center gap-2.5 text-xs text-[#CBD5E1] pt-6 cursor-pointer">
                <input
                  type="checkbox"
                  checked={privacy.showOnlineStatus}
                  onChange={(e) =>
                    setPrivacy((p) => ({ ...p, showOnlineStatus: e.target.checked }))
                  }
                  className="accent-[#7C3AED]"
                />
                Show online presence in Chat
              </label>
            </div>

            {/* Dual Notification Channel Preferences */}
            <div className="pt-4 border-t border-white/[0.06] space-y-3">
              <h3 className="font-display text-sm font-semibold text-white flex items-center gap-2">
                <BellRing size={15} className="text-sky-300" /> Dual Notification Channels (In-App &amp; Email)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {NOTIFICATION_CATEGORY_META.map((item) => {
                  const inAppOn = item.locked ? true : privacy.inAppNotifications?.[item.key] !== false;
                  const emailOn = item.locked ? true : privacy.emailNotifications?.[item.key] !== false;
                  return (
                    <div
                      key={item.key}
                      className="p-3.5 rounded-xl bg-[#08070F] border border-white/[0.06] flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-white inline-flex items-center gap-1.5">
                          <span>{item.label}</span>
                          {item.locked && <Lock size={11} className="text-amber-300" />}
                        </p>
                        <p className="text-[11px] text-[#94A3B8] truncate">{item.description}</p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 text-[11px]">
                        <label
                          className={`flex items-center gap-1.5 text-[#CBD5E1] ${
                            item.locked ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={inAppOn}
                            disabled={item.locked}
                            onChange={() => toggleChannelPref('inAppNotifications', item.key)}
                            className="accent-[#7C3AED]"
                          />
                          In-App
                        </label>
                        <label
                          className={`flex items-center gap-1.5 text-[#CBD5E1] ${
                            item.locked ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={emailOn}
                            disabled={item.locked}
                            onChange={() => toggleChannelPref('emailNotifications', item.key)}
                            className="accent-sky-500"
                          />
                          Email
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Browser Web Push (FCM) Consented Opt-in */}
            <div className="p-4 rounded-xl bg-[#08070F] border border-[#8B5CF6]/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-white flex items-center gap-1.5">
                  <Smartphone size={14} className="text-[#C084FC]" /> Browser Push Notifications (FCM)
                </p>
                <p className="text-[11px] text-[#94A3B8]">
                  Permission: <span className="text-[#E2E8F0] font-medium">{pushStatus.permission}</span>
                  {' · '}
                  {pushStatus.vapidConfigured
                    ? 'Web Push certificate configured'
                    : 'Requires VITE_FIREBASE_VAPID_KEY'}
                </p>
                {pushMessage && <p className="text-[11px] text-[#C084FC]">{pushMessage}</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={pushBusy}
                  onClick={async () => {
                    setPushBusy(true);
                    setPushMessage('');
                    const res = await registerPushNotifications(profile.uid);
                    setPushMessage(res.message);
                    const next = await getBrowserPushAvailability();
                    setPushStatus(next);
                    setPushBusy(false);
                  }}
                  className="px-3.5 py-2 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] disabled:opacity-50 text-xs font-semibold text-white"
                >
                  {pushBusy ? 'Working...' : 'Enable Push'}
                </button>
                <button
                  type="button"
                  disabled={pushBusy}
                  onClick={async () => {
                    setPushBusy(true);
                    await unregisterPushNotifications(profile.uid);
                    setPushMessage('Push alerts disabled for this device.');
                    const next = await getBrowserPushAvailability();
                    setPushStatus(next);
                    setPushBusy(false);
                  }}
                  className="px-3 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-xs font-medium text-[#CBD5E1]"
                >
                  Disable
                </button>
              </div>
            </div>

            {privacyNotice && <p className="text-xs text-[#C084FC]">{privacyNotice}</p>}

            <button
              type="submit"
              disabled={savingPrivacy}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#6D28D9] via-[#7C3AED] to-[#9333EA] text-xs font-semibold text-white shadow-[0_4px_18px_rgba(124,58,237,0.35)]"
            >
              {savingPrivacy ? 'Saving...' : 'Save Preferences'}
            </button>
          </form>
          )}

          {/* Support & Account Appeal Submission */}
          {(personalTab === 'all' || personalTab === 'support') && (
          <form
            onSubmit={handleSubmitSupportTicket}
            className="p-6 rounded-2xl bg-[#0D0B16] border border-[#8B5CF6]/20 space-y-4"
          >
            <h2 className="font-display text-base font-semibold text-white flex items-center gap-2">
              <LifeBuoy size={17} className="text-sky-300" /> Support Desk &amp; Account Appeals
            </h2>
            <p className="text-xs text-[#94A3B8]">
              Contact Nexora Support for account help, verification guidance, bug reports, or suspension appeals. Replies arrive via both In-App Notification and Email.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="block space-y-1">
                <span className="text-xs font-medium text-[#CBD5E1]">Category</span>
                <select
                  value={supportCategory}
                  onChange={(e) =>
                    setSupportCategory(e.target.value as ContactSubmission['category'])
                  }
                  className="w-full px-3 py-2 rounded-xl bg-[#08070F] border border-[#8B5CF6]/20 text-xs text-white"
                >
                  <option value="support">General Support</option>
                  <option value="verification_help">Badge &amp; Verification Help</option>
                  <option value="appeal">Account Appeal</option>
                  <option value="bug">Bug Report</option>
                  <option value="partnership">Partnership Inquiry</option>
                </select>
              </label>

              <label className="block space-y-1 sm:col-span-2">
                <span className="text-xs font-medium text-[#CBD5E1]">Subject</span>
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={supportSubject}
                  onChange={(e) => setSupportSubject(e.target.value)}
                  placeholder="Brief summary of your question or request"
                  className="w-full px-3 py-2 rounded-xl bg-[#08070F] border border-[#8B5CF6]/20 text-xs text-white"
                />
              </label>
            </div>

            <label className="block space-y-1">
              <span className="text-xs font-medium text-[#CBD5E1]">Details</span>
              <textarea
                rows={3}
                required
                maxLength={1500}
                value={supportMessage}
                onChange={(e) => setSupportMessage(e.target.value)}
                placeholder="Include relevant context, links, or account details..."
                className="w-full px-3 py-2 rounded-xl bg-[#08070F] border border-[#8B5CF6]/20 text-xs text-white"
              />
            </label>

            {supportFeedback && <p className="text-xs text-sky-300">{supportFeedback}</p>}

            <button
              type="submit"
              disabled={submittingSupport || !supportSubject.trim() || !supportMessage.trim()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-xs font-semibold text-white disabled:opacity-40"
            >
              <Send size={13} /> {submittingSupport ? 'Submitting...' : 'Submit Support Request'}
            </button>
          </form>
          )}

          {/* Blocked Users */}
          {(personalTab === 'all' || personalTab === 'support') && (
          <section className="p-6 rounded-2xl bg-[#0D0B16] border border-[#8B5CF6]/20 space-y-3">
            <h2 className="font-display text-base font-semibold text-white">Blocked Accounts</h2>
            {blockedUsers.length === 0 ? (
              <p className="text-xs text-[#64748B]">You have not blocked any accounts.</p>
            ) : (
              <div className="divide-y divide-white/[0.06]">
                {blockedUsers.map((u) => (
                  <div key={u.uid} className="py-2.5 flex items-center justify-between text-xs">
                    <span className="text-white">
                      {u.displayName} (@{u.username})
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleUnblock(u.uid)}
                      className="text-[#C084FC] hover:underline"
                    >
                      Unblock
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
          )}
        </div>
      )}
    </div>
  );
}
