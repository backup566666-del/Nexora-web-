import {
  AdminPermission,
  InternalRole,
  PlatformConfig,
  PlatformRole,
  VerifiedBadgeType,
} from '../types/nexora';

// Founder email cryptographically anchored in Firestore Security Rules
export const FOUNDER_OWNER_EMAIL = 'backup566666@gmail.com';

// Validation constants synchronized directly with firebase-blueprint.json
export const BLUEPRINT_LIMITS = {
  ID_REGEX: /^[a-zA-Z0-9_-]+$/,
  USERNAME_REGEX: /^[a-z0-9_]+$/,
  DISPLAY_NAME_MAX: 80,
  USERNAME_MIN: 3,
  USERNAME_MAX: 30,
  BIO_MAX: 400,
  WEBSITE_MAX: 200,
  LOCATION_MAX: 100,
  POST_TEXT_MAX: 2000,
  COMMENT_TEXT_MAX: 1000,
  STORY_TEXT_MAX: 500,
  VIBE_CAPTION_MAX: 400,
  SPACE_NAME_MAX: 60,
  SPACE_DESC_MAX: 400,
  CHAT_MESSAGE_MAX: 2000,
  MAX_HASHTAGS: 10,
  MAX_MENTIONS: 10,
  MAX_MEDIA_ITEMS: 4,
  MAX_INTERESTS: 10,
  MAX_POLL_OPTIONS: 4,
  RATIONALE_MAX: 600,
  REVIEW_NOTE_MAX: 300,
  ANNOUNCEMENT_TITLE_MAX: 100,
  ANNOUNCEMENT_MSG_MAX: 500,
  POLICY_MAX: 2000,
  ID_DOC_PREVIEW_MAX: 450000,
} as const;

export const ALL_ADMIN_PERMISSIONS: { key: AdminPermission; label: string; description: string }[] = [
  { key: 'manage_admins', label: 'Staff & Roles', description: 'Appoint moderators/reviewers and update staff access.' },
  { key: 'manage_communities', label: 'Community Control', description: 'Approve, verify, suspend Spaces and manage owners.' },
  { key: 'manage_verification', label: 'Verification Centre', description: 'Grant or revoke verified and special platform badges.' },
  { key: 'review_identity_docs', label: 'Identity Docs', description: 'Inspect restricted government identity documents.' },
  { key: 'manage_platform', label: 'Platform Config', description: 'Control branding, maintenance mode, and feature toggles.' },
  { key: 'view_analytics', label: 'Platform Analytics', description: 'Read real-time platform growth and engagement metrics.' },
  { key: 'moderate_content', label: 'Moderation & Safety', description: 'Resolve reports, remove posts/vibes, suspend accounts.' },
  { key: 'manage_notifications', label: 'Broadcast Notices', description: 'Publish platform announcements and targeted notices.' },
  { key: 'view_audit_logs', label: 'Audit Logs', description: 'Inspect immutable administrative audit history.' },
];

export const ROLE_DEFAULT_PERMISSIONS: Record<InternalRole, AdminPermission[]> = {
  owner: [
    'manage_admins',
    'manage_communities',
    'manage_verification',
    'review_identity_docs',
    'manage_platform',
    'view_analytics',
    'moderate_content',
    'manage_notifications',
    'view_audit_logs',
  ],
  administrator: [
    'manage_admins',
    'manage_communities',
    'manage_verification',
    'review_identity_docs',
    'manage_platform',
    'view_analytics',
    'moderate_content',
    'manage_notifications',
    'view_audit_logs',
  ],
  moderator: ['manage_communities', 'moderate_content', 'view_analytics', 'view_audit_logs'],
  verification_reviewer: ['manage_verification', 'review_identity_docs', 'view_audit_logs'],
  support: ['view_analytics', 'manage_notifications'],
};

export const ROLE_LABELS: Record<InternalRole, string> = {
  owner: 'Founder & Owner',
  administrator: 'Administrator',
  moderator: 'Moderator',
  verification_reviewer: 'Verification Reviewer',
  support: 'Support Specialist',
};

export const BADGE_LABELS: Record<VerifiedBadgeType, string> = {
  owner: 'Official Nexora Owner',
  verified: 'Verified Account',
  partner: 'Official Partner',
  creator: 'Featured Creator',
  founder_circle: 'Founder Circle',
};

export const DEFAULT_PLATFORM_CONFIG: PlatformConfig = {
  platformName: 'NEXORA',
  slogan: 'CONNECT. CREATE. SHARE. BELONG.',
  description: 'Next-generation desktop social network for creators, thinkers, and thriving Spaces.',
  logoMode: 'standard',
  supportEmail: FOUNDER_OWNER_EMAIL,
  maintenanceMode: false,
  maintenanceMessage: 'Nexora is undergoing scheduled infrastructure maintenance. We will be back online shortly.',
  features: {
    registrationOpen: true,
    communityApprovalRequired: false,
    vibesEnabled: true,
    spacesEnabled: true,
    chatEnabled: true,
    storiesEnabled: true,
  },
  contentPolicy:
    'Respect community members, verify original attribution, uphold zero harassment or impersonation, and protect private user data.',
  updatedBy: 'system',
};

export function hasAdminPermission(
  roleDoc: PlatformRole | null | undefined,
  permission: AdminPermission
): boolean {
  if (!roleDoc || !roleDoc.active) return false;
  if (roleDoc.role === 'owner') return true;
  return Array.isArray(roleDoc.permissions) && roleDoc.permissions.includes(permission);
}

export function sanitizeString(value: string, maxLength: number): string {
  return value.trim().slice(0, maxLength);
}

export function normalizeUsername(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, BLUEPRINT_LIMITS.USERNAME_MAX);
}

export function isValidUsername(username: string): boolean {
  return (
    username.length >= BLUEPRINT_LIMITS.USERNAME_MIN &&
    username.length <= BLUEPRINT_LIMITS.USERNAME_MAX &&
    BLUEPRINT_LIMITS.USERNAME_REGEX.test(username)
  );
}

export function isValidDocumentId(id: string): boolean {
  return id.length >= 1 && id.length <= 128 && BLUEPRINT_LIMITS.ID_REGEX.test(id);
}

export function extractHashtags(text: string): string[] {
  const matches = text.match(/#[a-zA-Z0-9_]{1,35}/g) ?? [];
  return Array.from(new Set(matches.map((tag) => tag.slice(1).toLowerCase()))).slice(
    0,
    BLUEPRINT_LIMITS.MAX_HASHTAGS
  );
}

export function extractMentions(text: string): string[] {
  const matches = text.match(/@[a-zA-Z0-9_]{2,30}/g) ?? [];
  return Array.from(new Set(matches.map((m) => m.slice(1).toLowerCase()))).slice(
    0,
    BLUEPRINT_LIMITS.MAX_MENTIONS
  );
}

export function formatRelativeTime(dateInput: Date | { toDate?: () => Date } | null | undefined): string {
  if (!dateInput) return 'Just now';
  const date = typeof (dateInput as { toDate?: () => Date }).toDate === 'function'
    ? (dateInput as { toDate: () => Date }).toDate()
    : dateInput instanceof Date
    ? dateInput
    : new Date();

  const diffSeconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (diffSeconds < 45) return 'Just now';
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m`;
  if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h`;
  if (diffSeconds < 604800) return `${Math.floor(diffSeconds / 86400)}d`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatCompactCount(count: number): string {
  if (!Number.isFinite(count) || count < 0) return '0';
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(count);
}
