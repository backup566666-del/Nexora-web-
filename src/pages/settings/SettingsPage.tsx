import React, { useEffect, useMemo, useState } from 'react';
import {
  Award,
  BadgeCheck,
  BarChart3,
  BellRing,
  Compass,
  FileCheck2,
  Flag,
  Gift,
  Globe,
  History,
  KeyRound,
  LifeBuoy,
  Lock,
  LogOut,
  Megaphone,
  Send,
  Shield,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { useBadgeModal } from '../../components/badges/BadgeContext';
import { BadgeStrip, VerifiedBadge } from '../../components/common/VerifiedBadge';
import { AdminManagementPanel } from '../../components/settings/admin/AdminManagementPanel';
import { AuditLogPanel } from '../../components/settings/admin/AuditLogPanel';
import { CommunityControlPanel } from '../../components/settings/admin/CommunityControlPanel';
import { GiftModerationPanel } from '../../components/settings/admin/GiftModerationPanel';
import { IdentityVerificationPanel } from '../../components/settings/admin/IdentityVerificationPanel';
import { ModerationReportsPanel } from '../../components/settings/admin/ModerationReportsPanel';
import { NotificationManagementPanel } from '../../components/settings/admin/NotificationManagementPanel';
import { PlatformAnalyticsPanel } from '../../components/settings/admin/PlatformAnalyticsPanel';
import { PlatformManagementPanel } from '../../components/settings/admin/PlatformManagementPanel';
import { VerificationCentrePanel } from '../../components/settings/admin/VerificationCentrePanel';
import { useAuth } from '../../hooks/useAuth';
import {
  logoutUser,
  sendPasswordReset,
  updateUserPrivacySettings,
} from '../../services/auth/authService';
import {
  submitIdentityVerification,
  submitVerificationRequest,
  subscribeMyIdentityVerifications,
  subscribeMyVerificationRequests,
} from '../../services/firebase/adminService';
import { submitContactSubmission } from '../../services/firebase/socialService';
import { encodeRestrictedIdentityDocument } from '../../services/storage/mediaUploadService';
import {
  ContactSubmission,
  IdentityVerificationRequest,
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
}

type AdminSectionKey =
  | 'analytics'
  | 'admins'
  | 'communities'
  | 'verification'
  | 'identity'
  | 'gifts'
  | 'platform'
  | 'moderation'
  | 'notifications'
  | 'audit';

const NOTIFICATION_CATEGORY_META: {
  key: NotificationCategory;
  label: string;
  description: string;
}[] = [
  { key: 'account', label: 'Account', description: 'Welcome, profile & recovery events' },
  { key: 'social', label: 'Social, Tags & Collabs', description: 'Likes, comments, tags & collab invites' },
  { key: 'badges', label: 'Badges & Verification', description: 'Badge awards & ID decisions' },
  { key: 'gifts', label: 'Virtual Gifts', description: 'Free appreciation gifts received' },
  { key: 'admin', label: 'Platform & Support', description: 'Ticket replies & official notices' },
  { key: 'security', label: 'Security Alerts', description: 'Account safety & critical advisories' },
];

export function SettingsPage({
  users,
  posts = [],
  vibes = [],
  spaces = [],
  initialAdminOpen = false,
}: SettingsPageProps) {
  const { user, profile, privateInfo, myRole, getUserBadges, refreshUserAndProfile } = useAuth();
  const { openBadgeModal } = useBadgeModal();

  const canAccessAdmin = Boolean(myRole && myRole.active);
  const [viewMode, setViewMode] = useState<'personal' | 'admin'>(
    initialAdminOpen && canAccessAdmin ? 'admin' : 'personal'
  );

  // Sync viewMode if triggered externally (e.g. account dropdown shortcut)
  useEffect(() => {
    if (initialAdminOpen && canAccessAdmin) {
      setViewMode('admin');
    } else if (!canAccessAdmin && viewMode === 'admin') {
      setViewMode('personal');
    }
  }, [initialAdminOpen, canAccessAdmin, viewMode]);

  // Personal Privacy & Notification Preferences state
  const [privacy, setPrivacy] = useState<PrivacySettings>(() => withPrivacyDefaults());
  const [savingPrivacy, setSavingPrivacy] = useState(false);
  const [privacyNotice, setPrivacyNotice] = useState('');

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
      list.push({ key: 'platform', label: 'Platform Management', icon: Globe });
    }
    if (hasAdminPermission(myRole, 'moderate_content')) {
      list.push({ key: 'moderation', label: 'Reports & Support', icon: Flag });
    }
    if (hasAdminPermission(myRole, 'manage_notifications')) {
      list.push({ key: 'notifications', label: 'Email & Notices', icon: Megaphone });
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
    setPrivacy((prev) => {
      const defaults = withPrivacyDefaults(prev);
      const currentMap = defaults[channel]!;
      return {
        ...defaults,
        [channel]: {
          ...currentMap,
          [cat]: !currentMap[cat],
        },
      };
    });
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
    } finally {
      setSavingPrivacy(false);
    }
  };

  const handleUnblock = async (targetUid: string) => {
    if (!privateInfo) return;
    const next = privateInfo.blockedUserIds.filter((id) => id !== targetUid);
    await updateUserPrivacySettings(profile.uid, privacy, next);
    await refreshUserAndProfile();
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
        err instanceof Error ? err.message : 'Unable to submit badge application.'
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
        err instanceof Error ? err.message : 'Unable to submit identity document.'
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
        err instanceof Error ? err.message : 'Unable to submit support ticket.'
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
          {/* Role Status Strip */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-[#0D0B16] via-[#131126] to-[#0D0B16] border border-[#38BDF8]/25 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
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
              {activeAdminTab === 'audit' &&
                (hasAdminPermission(myRole, 'view_audit_logs') ||
                  hasAdminPermission(myRole, 'manage_admins')) && <AuditLogPanel />}
            </section>
          </div>
        </div>
      ) : (
        /* STANDARD ACCOUNT & PRIVACY SETTINGS */
        <div className="space-y-6 max-w-[1040px]">
          {/* Account Security & Multi-Badge Summary */}
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

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div className="p-3.5 rounded-xl bg-[#08070F] border border-[#8B5CF6]/15">
                <p className="text-[#64748B]">Email Address (Private)</p>
                <p className="text-white font-medium mt-1 truncate">{user.email}</p>
              </div>
              <div className="p-3.5 rounded-xl bg-[#08070F] border border-[#8B5CF6]/15">
                <p className="text-[#64748B]">Email Verification</p>
                <p className="text-emerald-400 font-medium mt-1">
                  {user.emailVerified ? 'Verified' : 'Pending verification'}
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
              <button
                type="button"
                onClick={async () => {
                  if (!user.email) return;
                  await sendPasswordReset(user.email);
                  setPrivacyNotice('Password reset email dispatched.');
                }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-xs font-medium text-white"
              >
                <KeyRound size={14} /> Send Password Reset Email
              </button>
              <button
                type="button"
                onClick={() => void logoutUser(profile.uid)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/25 text-xs font-medium text-rose-300"
              >
                <LogOut size={14} /> Sign Out
              </button>
            </div>
          </section>

          {/* User-Facing Badge Applications & Confidential Identity Submission */}
          {!isFounderAccount && (
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
                  const inAppOn = privacy.inAppNotifications?.[item.key] !== false;
                  const emailOn = privacy.emailNotifications?.[item.key] !== false;
                  return (
                    <div
                      key={item.key}
                      className="p-3.5 rounded-xl bg-[#08070F] border border-white/[0.06] flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-white">{item.label}</p>
                        <p className="text-[11px] text-[#94A3B8] truncate">{item.description}</p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 text-[11px]">
                        <label className="flex items-center gap-1.5 text-[#CBD5E1] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={inAppOn}
                            onChange={() => toggleChannelPref('inAppNotifications', item.key)}
                            className="accent-[#7C3AED]"
                          />
                          In-App
                        </label>
                        <label className="flex items-center gap-1.5 text-[#CBD5E1] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={emailOn}
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

            {privacyNotice && <p className="text-xs text-[#C084FC]">{privacyNotice}</p>}

            <button
              type="submit"
              disabled={savingPrivacy}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#6D28D9] via-[#7C3AED] to-[#9333EA] text-xs font-semibold text-white shadow-[0_4px_18px_rgba(124,58,237,0.35)]"
            >
              {savingPrivacy ? 'Saving...' : 'Save Preferences'}
            </button>
          </form>

          {/* Support & Account Appeal Submission */}
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

          {/* Blocked Users */}
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
        </div>
      )}
    </div>
  );
}
