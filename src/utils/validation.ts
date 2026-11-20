import {
  AdminPermission,
  AnyVerifiedBadgeType,
  BadgeConfig,
  BadgeDefinition,
  InternalRole,
  NotificationCategory,
  PlatformConfig,
  PlatformRole,
  Post,
  PrivacySettings,
  VerifiedBadgeType,
  VirtualGiftCatalogItem,
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
  MAX_TAGGED_USERS: 10,
  MAX_COLLABORATORS: 5,
  MAX_MEDIA_ITEMS: 4,
  MAX_INTERESTS: 10,
  MAX_POLL_OPTIONS: 4,
  RATIONALE_MAX: 600,
  REVIEW_NOTE_MAX: 300,
  ANNOUNCEMENT_TITLE_MAX: 100,
  ANNOUNCEMENT_MSG_MAX: 500,
  POLICY_MAX: 2000,
  ID_DOC_PREVIEW_MAX: 450000,
  GIFT_MESSAGE_MAX: 240,
  CONTACT_SUBJECT_MAX: 120,
  CONTACT_MESSAGE_MAX: 1500,
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

// Complete 20 Canonical Nexora Badges
export const ALL_CANONICAL_BADGES: VerifiedBadgeType[] = [
  'verified_identity',
  'founder',
  'official_organization',
  'official_media',
  'creator',
  'influencer',
  'artist',
  'professional',
  'educator',
  'journalist',
  'community_founder',
  'community_leader',
  'moderator',
  'community_champion',
  'early_member',
  'pioneer',
  'top_contributor',
  'trendsetter',
  'supporter',
  'legend',
];

export const ALL_VALID_BADGE_VALUES = [
  ...ALL_CANONICAL_BADGES,
  'owner',
  'verified',
  'partner',
  'founder_circle',
] as const;

export const BADGE_CATALOG: Record<VerifiedBadgeType, BadgeDefinition> = {
  verified_identity: {
    id: 'verified_identity',
    name: 'Verified Identity',
    shortLabel: 'Verified ID',
    category: 'identity',
    description: 'Official Blue Check confirming the account holder verified a real government identity document.',
    eligibility: 'Granted automatically when Nexora Identity Verification is reviewed and approved.',
    accentColor: '#38BDF8',
    bgTint: 'rgba(56,189,248,0.16)',
    borderTint: 'rgba(56,189,248,0.45)',
    applicationEligible: false,
    achievementAutoEligible: false,
  },
  founder: {
    id: 'founder',
    name: 'Founder',
    shortLabel: 'Founder',
    category: 'official',
    description: 'Permanent platform founder and executive steward crest reserved for Nexora ownership.',
    eligibility: 'Exclusive to the verified Nexora Founder account.',
    accentColor: '#60A5FA',
    bgTint: 'rgba(59,130,246,0.18)',
    borderTint: 'rgba(96,165,250,0.50)',
    applicationEligible: false,
    achievementAutoEligible: false,
  },
  official_organization: {
    id: 'official_organization',
    name: 'Official Organization',
    shortLabel: 'Official Org',
    category: 'official',
    description: 'Recognizes verified companies, institutions, studios, and official partner entities.',
    eligibility: 'Granted after verifying organization domain, registry, or official partnership.',
    accentColor: '#6366F1',
    bgTint: 'rgba(99,102,241,0.16)',
    borderTint: 'rgba(129,140,248,0.45)',
    applicationEligible: true,
    achievementAutoEligible: false,
  },
  official_media: {
    id: 'official_media',
    name: 'Official Media',
    shortLabel: 'Official Media',
    category: 'official',
    description: 'Identifies recognized newsrooms, broadcasters, digital publications, and press channels.',
    eligibility: 'Granted upon editorial outlet verification.',
    accentColor: '#0EA5E9',
    bgTint: 'rgba(14,165,233,0.16)',
    borderTint: 'rgba(56,189,248,0.45)',
    applicationEligible: true,
    achievementAutoEligible: false,
  },
  creator: {
    id: 'creator',
    name: 'Creator',
    shortLabel: 'Creator',
    category: 'creator',
    description: 'Honors active digital storytellers, filmmakers, podcasters, and multimedia publishers.',
    eligibility: 'Consistent original Posts & Vibes with engaged followers or admin creator approval.',
    accentColor: '#A855F7',
    bgTint: 'rgba(168,85,247,0.16)',
    borderTint: 'rgba(192,132,252,0.45)',
    applicationEligible: true,
    achievementAutoEligible: true,
  },
  influencer: {
    id: 'influencer',
    name: 'Influencer',
    shortLabel: 'Influencer',
    category: 'creator',
    description: 'Celebrates high-reach personalities driving major conversation and audience engagement.',
    eligibility: 'Large community reach, high post engagement, or creator outreach approval.',
    accentColor: '#EC4899',
    bgTint: 'rgba(236,72,153,0.16)',
    borderTint: 'rgba(244,114,182,0.45)',
    applicationEligible: true,
    achievementAutoEligible: true,
  },
  artist: {
    id: 'artist',
    name: 'Artist',
    shortLabel: 'Artist',
    category: 'creator',
    description: 'Spotlights visual artists, musicians, illustrators, designers, and creative craftspeople.',
    eligibility: 'Verified creative portfolio shared on Nexora.',
    accentColor: '#F43F5E',
    bgTint: 'rgba(244,63,94,0.16)',
    borderTint: 'rgba(251,113,133,0.45)',
    applicationEligible: true,
    achievementAutoEligible: false,
  },
  professional: {
    id: 'professional',
    name: 'Professional',
    shortLabel: 'Professional',
    category: 'creator',
    description: 'Marks credentialed specialists, engineers, founders, and industry practitioners.',
    eligibility: 'Verified domain expertise and authentic public professional standing.',
    accentColor: '#14B8A6',
    bgTint: 'rgba(20,184,166,0.16)',
    borderTint: 'rgba(45,212,191,0.45)',
    applicationEligible: true,
    achievementAutoEligible: false,
  },
  educator: {
    id: 'educator',
    name: 'Educator',
    shortLabel: 'Educator',
    category: 'creator',
    description: 'Recognizes teachers, professors, researchers, and educational content mentors.',
    eligibility: 'Demonstrated academic or community teaching contributions.',
    accentColor: '#10B981',
    bgTint: 'rgba(16,185,129,0.16)',
    borderTint: 'rgba(52,211,153,0.45)',
    applicationEligible: true,
    achievementAutoEligible: false,
  },
  journalist: {
    id: 'journalist',
    name: 'Journalist',
    shortLabel: 'Journalist',
    category: 'creator',
    description: 'Designates verified independent reporters, correspondents, and investigative writers.',
    eligibility: 'Published reporting credentials reviewed by Nexora verification staff.',
    accentColor: '#06B6D4',
    bgTint: 'rgba(6,182,212,0.16)',
    borderTint: 'rgba(34,211,238,0.45)',
    applicationEligible: true,
    achievementAutoEligible: false,
  },
  community_founder: {
    id: 'community_founder',
    name: 'Community Founder',
    shortLabel: 'Space Founder',
    category: 'community',
    description: 'Awarded to builders who establish active, welcoming, high-trust Nexora Spaces.',
    eligibility: 'Launch and maintain an active Nexora Space in good standing.',
    accentColor: '#8B5CF6',
    bgTint: 'rgba(139,92,246,0.16)',
    borderTint: 'rgba(167,139,250,0.45)',
    applicationEligible: true,
    achievementAutoEligible: false,
  },
  community_leader: {
    id: 'community_leader',
    name: 'Community Leader',
    shortLabel: 'Leader',
    category: 'community',
    description: 'Honors stewards who organize events, spark dialogue, and elevate Space culture.',
    eligibility: 'Recognized Space leadership or verified community steward nomination.',
    accentColor: '#22C55E',
    bgTint: 'rgba(34,197,94,0.16)',
    borderTint: 'rgba(74,222,128,0.45)',
    applicationEligible: true,
    achievementAutoEligible: false,
  },
  moderator: {
    id: 'moderator',
    name: 'Moderator',
    shortLabel: 'Moderator',
    category: 'community',
    description: 'Identifies trusted platform and community moderators protecting safety and civility.',
    eligibility: 'Appointed to an official Nexora moderation or Space safety role.',
    accentColor: '#34D399',
    bgTint: 'rgba(52,211,153,0.16)',
    borderTint: 'rgba(110,231,183,0.45)',
    applicationEligible: false,
    achievementAutoEligible: false,
  },
  community_champion: {
    id: 'community_champion',
    name: 'Community Champion',
    shortLabel: 'Champion',
    category: 'community',
    description: 'Celebrates members known for welcoming newcomers, constructive feedback, and kindness.',
    eligibility: 'Nominated by community peers or evaluated by platform leadership.',
    accentColor: '#F59E0B',
    bgTint: 'rgba(245,158,11,0.16)',
    borderTint: 'rgba(251,191,36,0.45)',
    applicationEligible: true,
    achievementAutoEligible: false,
  },
  early_member: {
    id: 'early_member',
    name: 'Early Member',
    shortLabel: 'Early Member',
    category: 'achievement',
    description: 'Honors founding-era members who joined Nexora during its earliest public chapters.',
    eligibility: 'Earned by early account tenure or pioneer cohort grant.',
    accentColor: '#C084FC',
    bgTint: 'rgba(192,132,252,0.16)',
    borderTint: 'rgba(216,180,254,0.45)',
    applicationEligible: false,
    achievementAutoEligible: true,
  },
  pioneer: {
    id: 'pioneer',
    name: 'Pioneer',
    shortLabel: 'Pioneer',
    category: 'achievement',
    description: 'Reserved for early trailblazers who shaped Nexora culture, features, and feedback.',
    eligibility: 'Awarded to Founder Circle members and pioneering community contributors.',
    accentColor: '#A78BFA',
    bgTint: 'rgba(167,139,250,0.16)',
    borderTint: 'rgba(196,181,253,0.45)',
    applicationEligible: false,
    achievementAutoEligible: true,
  },
  top_contributor: {
    id: 'top_contributor',
    name: 'Top Contributor',
    shortLabel: 'Top Contributor',
    category: 'achievement',
    description: 'Earned by prolific members whose posts, collaborations, and insights lift the feed.',
    eligibility: 'High volume of original Posts and community likes (or admin evaluation).',
    accentColor: '#F97316',
    bgTint: 'rgba(249,115,22,0.16)',
    borderTint: 'rgba(251,146,60,0.45)',
    applicationEligible: false,
    achievementAutoEligible: true,
  },
  trendsetter: {
    id: 'trendsetter',
    name: 'Trendsetter',
    shortLabel: 'Trendsetter',
    category: 'achievement',
    description: 'Awarded when posts and Vibes inspire widespread discussion, reposts, and collaborations.',
    eligibility: 'Achieved via breakout post/Vibe engagement milestones.',
    accentColor: '#FB7185',
    bgTint: 'rgba(251,113,133,0.16)',
    borderTint: 'rgba(253,164,175,0.45)',
    applicationEligible: false,
    achievementAutoEligible: true,
  },
  supporter: {
    id: 'supporter',
    name: 'Supporter',
    shortLabel: 'Supporter',
    category: 'achievement',
    description: 'Recognizes generous community supporters who uplift creators with encouragement and free gifts. Separate from Identity Verification.',
    eligibility: 'Granted for positive platform support and creator appreciation — does not verify legal identity.',
    accentColor: '#EAB308',
    bgTint: 'rgba(234,179,8,0.16)',
    borderTint: 'rgba(250,204,21,0.45)',
    applicationEligible: true,
    achievementAutoEligible: false,
  },
  legend: {
    id: 'legend',
    name: 'Legend',
    shortLabel: 'Legend',
    category: 'achievement',
    description: 'Nexora’s highest community honor celebrating enduring excellence, impact, and trust.',
    eligibility: 'Top-tier multi-milestone achievement or special founder distinction.',
    accentColor: '#FBBF24',
    bgTint: 'rgba(251,191,36,0.18)',
    borderTint: 'rgba(252,211,77,0.55)',
    applicationEligible: false,
    achievementAutoEligible: true,
  },
};

export const BADGE_LABELS: Record<AnyVerifiedBadgeType, string> = {
  ...Object.fromEntries(ALL_CANONICAL_BADGES.map((key) => [key, BADGE_CATALOG[key].name])),
  owner: 'Founder',
  verified: 'Verified Identity',
  partner: 'Official Organization',
  founder_circle: 'Pioneer',
} as Record<AnyVerifiedBadgeType, string>;

export function normalizeBadgeType(raw?: string | null): VerifiedBadgeType {
  switch (raw) {
    case 'owner':
    case 'founder':
      return 'founder';
    case 'verified':
    case 'verified_identity':
      return 'verified_identity';
    case 'partner':
    case 'official_organization':
      return 'official_organization';
    case 'founder_circle':
    case 'pioneer':
      return 'pioneer';
    default:
      if (raw && (ALL_CANONICAL_BADGES as string[]).includes(raw)) {
        return raw as VerifiedBadgeType;
      }
      return 'verified_identity';
  }
}

export function normalizeBadgeList(
  list?: Array<string | null | undefined>,
  primary?: string | null
): VerifiedBadgeType[] {
  const seen = new Set<VerifiedBadgeType>();
  if (primary) {
    seen.add(normalizeBadgeType(primary));
  }
  if (Array.isArray(list)) {
    for (const item of list) {
      if (item) seen.add(normalizeBadgeType(item));
    }
  }
  return Array.from(seen);
}

export const APPLICATION_ELIGIBLE_BADGES: BadgeDefinition[] = ALL_CANONICAL_BADGES.map(
  (id) => BADGE_CATALOG[id]
).filter((badge) => badge.applicationEligible);

export const ACHIEVEMENT_BADGES: BadgeDefinition[] = ALL_CANONICAL_BADGES.map(
  (id) => BADGE_CATALOG[id]
).filter((badge) => badge.achievementAutoEligible);

export const DEFAULT_BADGE_CONFIGS: Record<VerifiedBadgeType, BadgeConfig> = Object.fromEntries(
  ALL_CANONICAL_BADGES.map((id) => {
    const defaults: Record<string, Partial<BadgeConfig>> = {
      creator: { autoAward: true, minFollowers: 5, minPosts: 3, minLikes: 10, accountAgeDays: 0 },
      influencer: { autoAward: true, minFollowers: 50, minPosts: 10, minLikes: 100, accountAgeDays: 0 },
      early_member: { autoAward: true, minFollowers: 0, minPosts: 1, minLikes: 0, accountAgeDays: 0 },
      pioneer: { autoAward: false, minFollowers: 10, minPosts: 5, minLikes: 25, accountAgeDays: 7 },
      top_contributor: { autoAward: true, minFollowers: 10, minPosts: 15, minLikes: 50, accountAgeDays: 0 },
      trendsetter: { autoAward: true, minFollowers: 20, minPosts: 5, minLikes: 75, accountAgeDays: 0 },
      legend: { autoAward: true, minFollowers: 100, minPosts: 30, minLikes: 250, accountAgeDays: 14 },
    };
    const d = defaults[id] || {};
    return [
      id,
      {
        badgeId: id,
        enabled: true,
        autoAward: d.autoAward ?? false,
        minFollowers: d.minFollowers ?? 0,
        minPosts: d.minPosts ?? 0,
        minLikes: d.minLikes ?? 0,
        accountAgeDays: d.accountAgeDays ?? 0,
        customCriteriaNote: BADGE_CATALOG[id].eligibility,
        updatedBy: 'system',
      } satisfies BadgeConfig,
    ];
  })
) as Record<VerifiedBadgeType, BadgeConfig>;

// --- Free Virtual Gift Catalog (Strictly Free) ---
export const FREE_GIFT_CATALOG: VirtualGiftCatalogItem[] = [
  {
    id: 'gift_sparkle',
    name: 'Nexora Spark',
    description: 'A luminous violet spark to brighten a creator’s post or profile.',
    emoji: '✨',
    category: 'appreciation',
    accentColor: '#A855F7',
    tier: 'free',
    enabled: true,
    sortOrder: 1,
  },
  {
    id: 'gift_violet_rose',
    name: 'Velvet Bloom',
    description: 'Send gratitude and warm creative energy.',
    emoji: '🪻',
    category: 'appreciation',
    accentColor: '#C084FC',
    tier: 'free',
    enabled: true,
    sortOrder: 2,
  },
  {
    id: 'gift_flame',
    name: 'Hyper Flame',
    description: 'Celebrate a bold idea, Vibe, or conversation starter.',
    emoji: '🔥',
    category: 'celebration',
    accentColor: '#F97316',
    tier: 'free',
    enabled: true,
    sortOrder: 3,
  },
  {
    id: 'gift_crown',
    name: 'Creator Crown',
    description: 'Salute standout craftsmanship and originality.',
    emoji: '👑',
    category: 'creator',
    accentColor: '#FBBF24',
    tier: 'free',
    enabled: true,
    sortOrder: 4,
  },
  {
    id: 'gift_rocket',
    name: 'Launch Boost',
    description: 'Cheer on an upcoming launch, milestone, or collaboration.',
    emoji: '🚀',
    category: 'celebration',
    accentColor: '#38BDF8',
    tier: 'free',
    enabled: true,
    sortOrder: 5,
  },
  {
    id: 'gift_heart',
    name: 'Prism Heart',
    description: 'Pure community support with zero cost attached.',
    emoji: '💜',
    category: 'community',
    accentColor: '#8B5CF6',
    tier: 'free',
    enabled: true,
    sortOrder: 6,
  },
  {
    id: 'gift_mic',
    name: 'Spotlight Star',
    description: 'Give center-stage applause for inspiring storytelling.',
    emoji: '🌟',
    category: 'creator',
    accentColor: '#EC4899',
    tier: 'free',
    enabled: true,
    sortOrder: 7,
  },
  {
    id: 'gift_coffee',
    name: 'Studio Fuel',
    description: 'A friendly virtual espresso for late-night builders and artists.',
    emoji: '☕',
    category: 'community',
    accentColor: '#14B8A6',
    tier: 'free',
    enabled: true,
    sortOrder: 8,
  },
];

export const DEFAULT_NOTIFICATION_CHANNELS: Record<NotificationCategory, boolean> = {
  account: true,
  social: true,
  badges: true,
  gifts: true,
  admin: true,
  security: true,
};

export function withPrivacyDefaults(settings?: Partial<PrivacySettings> | null): PrivacySettings {
  return {
    profileVisibility: settings?.profileVisibility === 'followers' ? 'followers' : 'public',
    storyPrivacy:
      settings?.storyPrivacy === 'followers' || settings?.storyPrivacy === 'close'
        ? settings.storyPrivacy
        : 'public',
    allowDMs: settings?.allowDMs === 'followers' ? 'followers' : 'everyone',
    showOnlineStatus: settings?.showOnlineStatus !== false,
    allowTags:
      settings?.allowTags === 'followers' || settings?.allowTags === 'nobody'
        ? settings.allowTags
        : 'everyone',
    allowCollaborations:
      settings?.allowCollaborations === 'followers' || settings?.allowCollaborations === 'nobody'
        ? settings.allowCollaborations
        : 'everyone',
    emailNotifications: {
      ...DEFAULT_NOTIFICATION_CHANNELS,
      ...(settings?.emailNotifications || {}),
    },
    inAppNotifications: {
      ...DEFAULT_NOTIFICATION_CHANNELS,
      ...(settings?.inAppNotifications || {}),
    },
  };
}

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

export function maskEmail(email: string): string {
  const trimmed = (email || '').trim();
  const atIndex = trimmed.indexOf('@');
  if (atIndex <= 1) return trimmed ? '***' : 'n/a';
  const local = trimmed.slice(0, atIndex);
  const domain = trimmed.slice(atIndex + 1);
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
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

export function computePostEngagementScore(post: Post): number {
  return (
    (post.likesCount || 0) +
    (post.commentsCount || 0) * 2 +
    (post.repostsCount || 0) * 2 +
    (post.giftsCount || 0) * 3 +
    (post.savesCount || 0)
  );
}

export function rankTrendingPosts(posts: Post[]): Post[] {
  return [...posts].sort((a, b) => {
    const scoreDiff = computePostEngagementScore(b) - computePostEngagementScore(a);
    if (scoreDiff !== 0) return scoreDiff;
    const aTime = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
    const bTime = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
    return bTime - aTime;
  });
}
