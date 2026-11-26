import {
  AdminPermission,
  AISettings,
  AnnouncementCategory,
  AnyVerifiedBadgeType,
  BadgeConfig,
  BadgeDefinition,
  BotDefinition,
  BotPermissionKey,
  BotSlashCommandMeta,
  BotSlashCommandName,
  CustomisationItem,
  HomepageCustomization,
  HomepageFeedDensity,
  HomepageFeedSort,
  HomepageLayoutMode,
  HomepageSectionId,
  InternalRole,
  NotificationCategory,
  PlatformConfig,
  PlatformRole,
  Post,
  PrivacySettings,
  ProfileCustomisation,
  RewardsConfig,
  Space,
  SpaceBotConfig,
  SubscriptionPlan,
  SubscriptionTier,
  ThemeMode,
  UserProfile,
  UserSubscription,
  VerifiedBadgeType,
  VirtualGiftCatalogItem,
  WithdrawalStatus,
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
  { key: 'manage_rewards', label: 'Rewards, Tasks & Referrals', description: 'Configure tasks, verify submissions, review referral fraud, and adjust Key Points.' },
  { key: 'manage_withdrawals', label: 'Bank Withdrawals', description: 'Review, approve, lock, and confirm bank withdrawal payouts.' },
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
    'manage_rewards',
    'manage_withdrawals',
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
    'manage_rewards',
    'manage_withdrawals',
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
  messages: true,
  spaces: true,
  subscriptions: true,
  rewards: true,
  bots: true,
};

export const LOCKED_NOTIFICATION_CATEGORIES: NotificationCategory[] = ['security'];

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
    communityPrivacy:
      settings?.communityPrivacy === 'members_only' || settings?.communityPrivacy === 'hidden'
        ? settings.communityPrivacy
        : 'visible',
    messageVisibility:
      settings?.messageVisibility === 'followers' || settings?.messageVisibility === 'none'
        ? settings.messageVisibility
        : 'everyone',
    allowBotProcessing: settings?.allowBotProcessing !== false,
    emailNotifications: {
      ...DEFAULT_NOTIFICATION_CHANNELS,
      ...(settings?.emailNotifications || {}),
      security: true,
    },
    inAppNotifications: {
      ...DEFAULT_NOTIFICATION_CHANNELS,
      ...(settings?.inAppNotifications || {}),
      security: true,
    },
  };
}

export const ALL_HOMEPAGE_SECTIONS: {
  id: HomepageSectionId;
  label: string;
  description: string;
}[] = [
  {
    id: 'stories',
    label: 'Stories',
    description: '24-hour visual updates from creators and people you follow',
  },
  {
    id: 'creators',
    label: 'Recommended Creators',
    description: 'Suggested verified and active creators to follow',
  },
  {
    id: 'spaces',
    label: 'Suggested Spaces',
    description: 'Top communities matched by activity and interest',
  },
  {
    id: 'trending',
    label: 'Trending Topics',
    description: 'Live hashtags and active conversations across Nexora',
  },
];

export const DEFAULT_HOMEPAGE_CUSTOMIZATION: HomepageCustomization = {
  layout: 'command',
  showStories: true,
  showRecommendedCreators: true,
  showSuggestedSpaces: true,
  showTrendingTopics: true,
  showVibesShelf: true,
  feedDensity: 'comfortable',
  defaultFeedFilter: 'all',
  sectionOrder: ['stories', 'creators', 'spaces', 'trending'],
};

const VALID_HOMEPAGE_LAYOUTS: HomepageLayoutMode[] = ['command', 'editorial', 'stream'];
const VALID_HOMEPAGE_DENSITIES: HomepageFeedDensity[] = ['comfortable', 'compact'];
const VALID_HOMEPAGE_SORTS: HomepageFeedSort[] = ['all', 'trending', 'media', 'discussions', 'polls'];
const VALID_HOMEPAGE_SECTIONS: HomepageSectionId[] = ['stories', 'creators', 'spaces', 'trending'];

export function withHomepageCustomizationDefaults(
  raw?: Partial<HomepageCustomization> | null
): HomepageCustomization {
  const layout: HomepageLayoutMode =
    raw?.layout && VALID_HOMEPAGE_LAYOUTS.includes(raw.layout)
      ? raw.layout
      : DEFAULT_HOMEPAGE_CUSTOMIZATION.layout;

  const feedDensity: HomepageFeedDensity =
    raw?.feedDensity && VALID_HOMEPAGE_DENSITIES.includes(raw.feedDensity)
      ? raw.feedDensity
      : DEFAULT_HOMEPAGE_CUSTOMIZATION.feedDensity;

  const defaultFeedFilter: HomepageFeedSort =
    raw?.defaultFeedFilter && VALID_HOMEPAGE_SORTS.includes(raw.defaultFeedFilter)
      ? raw.defaultFeedFilter
      : DEFAULT_HOMEPAGE_CUSTOMIZATION.defaultFeedFilter;

  const seen = new Set<HomepageSectionId>();
  const ordered: HomepageSectionId[] = [];
  if (Array.isArray(raw?.sectionOrder)) {
    for (const item of raw.sectionOrder) {
      if (VALID_HOMEPAGE_SECTIONS.includes(item) && !seen.has(item)) {
        seen.add(item);
        ordered.push(item);
      }
    }
  }
  for (const fallbackId of VALID_HOMEPAGE_SECTIONS) {
    if (!seen.has(fallbackId)) {
      seen.add(fallbackId);
      ordered.push(fallbackId);
    }
  }

  return {
    layout,
    showStories: raw?.showStories !== false,
    showRecommendedCreators: raw?.showRecommendedCreators !== false,
    showSuggestedSpaces: raw?.showSuggestedSpaces !== false,
    showTrendingTopics: raw?.showTrendingTopics !== false,
    showVibesShelf: raw?.showVibesShelf !== false,
    feedDensity,
    defaultFeedFilter,
    sectionOrder: ordered,
  };
}

export const sanitizeHomepageCustomization = withHomepageCustomizationDefaults;

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

// --- Nexora Subscriptions & Tier Access Helpers ---
export const TIER_ORDER: Record<SubscriptionTier, number> = {
  free: 0,
  plus: 1,
  pro: 2,
};

export function canAccessTier(
  userTier: SubscriptionTier | undefined | null,
  requiredTier: SubscriptionTier
): boolean {
  const actual = TIER_ORDER[userTier || 'free'] ?? 0;
  const required = TIER_ORDER[requiredTier] ?? 0;
  return actual >= required;
}

export function resolveEffectiveSubscriptionTier(
  subscription: Partial<UserSubscription> | null | undefined,
  nowMs = Date.now()
): SubscriptionTier {
  if (!subscription || !subscription.tier || subscription.tier === 'free') {
    return 'free';
  }
  if (subscription.status === 'expired' || subscription.status === 'free' || subscription.status === 'past_due') {
    return 'free';
  }
  if (subscription.status !== 'active' && subscription.status !== 'canceled') {
    return 'free';
  }
  const endMs = subscription.currentPeriodEnd?.toMillis
    ? subscription.currentPeriodEnd.toMillis()
    : undefined;
  if (typeof endMs === 'number' && endMs <= nowMs) {
    return 'free';
  }
  return subscription.tier;
}

// Default plan catalog (prices remain null / pricingConfigured: false until admin sets pricing)
export const DEFAULT_SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: 'free',
    name: 'Nexora Free',
    tagline: 'Essential social access for creators and communities',
    badgeLabel: 'Free Member',
    badgeColor: '#94A3B8',
    monthlyPriceCents: 0,
    yearlyPriceCents: 0,
    currency: 'usd',
    enabled: true,
    pricingConfigured: true,
    sortOrder: 1,
    benefits: [
      'Full access to Home Feed, Vibes, Chat & Public Spaces',
      'Core creator analytics overview & standard notifications',
      'Essential profile colours, classic layout & starter frames',
    ],
  },
  {
    id: 'plus',
    name: 'Nexora Plus',
    tagline: 'Enhanced expression, customisation & creator insights',
    badgeLabel: 'Nexora Plus',
    badgeColor: '#A855F7',
    monthlyPriceCents: null,
    yearlyPriceCents: null,
    currency: 'usd',
    enabled: true,
    pricingConfigured: false,
    sortOrder: 2,
    benefits: [
      'Distinctive purple Nexora Plus membership badge across the platform',
      'Plus profile themes, gradient backdrops, custom banners & frames',
      'Static & selected animated avatar decorations + Spotlight layout',
    ],
  },
  {
    id: 'pro',
    name: 'Nexora Pro',
    tagline: 'Signature studio artistry & complete customisation suite',
    badgeLabel: 'Nexora Pro',
    badgeColor: '#F59E0B',
    monthlyPriceCents: null,
    yearlyPriceCents: null,
    currency: 'usd',
    enabled: true,
    pricingConfigured: false,
    sortOrder: 3,
    benefits: [
      'Signature gold Nexora Pro crest visible on profiles, posts & chat',
      'Full unlock of animated decorations, ambient effects & Pro themes',
      'All profile layouts including Showcase & priority studio drops',
    ],
  },
];

// --- Nexora Original Profile Customisation Studio Defaults & Catalog ---
export const DEFAULT_PROFILE_CUSTOMISATION: ProfileCustomisation = {
  themeId: 'theme_obsidian',
  backgroundColor: '#0A0812',
  accentColor: '#8B5CF6',
  gradientId: 'grad_none',
  bannerPresetId: 'banner_obsidian_grid',
  bannerImageUrl: '',
  avatarFrameId: 'frame_minimal',
  staticDecorationId: 'deco_none',
  animatedDecorationId: 'anim_none',
  effectId: 'effect_none',
  layoutVariant: 'classic',
  cardOpacity: 92,
};

export const DEFAULT_CUSTOMISATION_CATALOG: CustomisationItem[] = [
  // Themes
  {
    id: 'theme_obsidian',
    category: 'theme',
    name: 'Obsidian Classic',
    description: 'Nexora signature deep obsidian glass aesthetic.',
    requiredTier: 'free',
    enabled: true,
    previewValue: '#0A0812',
    secondaryValue: '#8B5CF6',
    sortOrder: 1,
  },
  {
    id: 'theme_velvet_violet',
    category: 'theme',
    name: 'Velvet Violet',
    description: 'Rich midnight plum surface with luminous violet trims.',
    requiredTier: 'plus',
    enabled: true,
    previewValue: '#130B24',
    secondaryValue: '#A855F7',
    sortOrder: 2,
  },
  {
    id: 'theme_celestial_gold',
    category: 'theme',
    name: 'Celestial Gold',
    description: 'Executive dark slate elevated with warm amber gold.',
    requiredTier: 'pro',
    enabled: true,
    previewValue: '#141008',
    secondaryValue: '#F59E0B',
    sortOrder: 3,
  },
  {
    id: 'theme_aurora_dusk',
    category: 'theme',
    name: 'Aurora Dusk',
    description: 'Deep twilight indigo paired with electric iris glow.',
    requiredTier: 'pro',
    enabled: true,
    previewValue: '#09111E',
    secondaryValue: '#38BDF8',
    sortOrder: 4,
  },

  // Background Colours
  {
    id: 'bg_obsidian',
    category: 'background',
    name: 'Deep Obsidian',
    description: 'Clean dark neutral profile surface.',
    requiredTier: 'free',
    enabled: true,
    previewValue: '#0A0812',
    sortOrder: 1,
  },
  {
    id: 'bg_midnight_plum',
    category: 'background',
    name: 'Midnight Plum',
    description: 'Subtle violet-tinted studio backdrop.',
    requiredTier: 'free',
    enabled: true,
    previewValue: '#120C21',
    sortOrder: 2,
  },
  {
    id: 'bg_indigo_abyss',
    category: 'background',
    name: 'Indigo Abyss',
    description: 'Cool deep sapphire-slate canvas.',
    requiredTier: 'plus',
    enabled: true,
    previewValue: '#0B1120',
    sortOrder: 3,
  },
  {
    id: 'bg_crimson_velvet',
    category: 'background',
    name: 'Velvet Rose',
    description: 'Muted dark burgundy studio surface.',
    requiredTier: 'pro',
    enabled: true,
    previewValue: '#1B0C18',
    sortOrder: 4,
  },

  // Accent Colours
  {
    id: 'accent_violet',
    category: 'accent',
    name: 'Nexora Violet',
    description: 'Signature violet accent colour.',
    requiredTier: 'free',
    enabled: true,
    previewValue: '#8B5CF6',
    sortOrder: 1,
  },
  {
    id: 'accent_orchid',
    category: 'accent',
    name: 'Electric Orchid',
    description: 'Vibrant magenta-violet highlights.',
    requiredTier: 'plus',
    enabled: true,
    previewValue: '#D946EF',
    sortOrder: 2,
  },
  {
    id: 'accent_cyan',
    category: 'accent',
    name: 'Glacier Cyan',
    description: 'Crisp sky cyan accent trim.',
    requiredTier: 'plus',
    enabled: true,
    previewValue: '#06B6D4',
    sortOrder: 3,
  },
  {
    id: 'accent_gold',
    category: 'accent',
    name: 'Sovereign Gold',
    description: 'Radiant Pro gold accent highlights.',
    requiredTier: 'pro',
    enabled: true,
    previewValue: '#F59E0B',
    sortOrder: 4,
  },

  // Gradient Backgrounds
  {
    id: 'grad_none',
    category: 'gradient',
    name: 'Solid Surface',
    description: 'No gradient overlay on your profile card.',
    requiredTier: 'free',
    enabled: true,
    previewValue: 'none',
    sortOrder: 1,
  },
  {
    id: 'grad_violet_nebula',
    category: 'gradient',
    name: 'Violet Nebula',
    description: 'Deep ultraviolet to midnight indigo blend.',
    requiredTier: 'plus',
    enabled: true,
    previewValue: 'linear-gradient(135deg, rgba(124,58,237,0.34) 0%, rgba(15,12,26,0.94) 55%, rgba(168,85,247,0.22) 100%)',
    sortOrder: 2,
  },
  {
    id: 'grad_prism_twilight',
    category: 'gradient',
    name: 'Prism Twilight',
    description: 'Violet, rose, and teal horizon gradient.',
    requiredTier: 'plus',
    enabled: true,
    previewValue: 'linear-gradient(135deg, rgba(139,92,246,0.3) 0%, rgba(236,72,153,0.22) 50%, rgba(14,165,233,0.22) 100%)',
    sortOrder: 3,
  },
  {
    id: 'grad_solar_crown',
    category: 'gradient',
    name: 'Solar Crown',
    description: 'Rich amber-gold and deep plum luxury blend.',
    requiredTier: 'pro',
    enabled: true,
    previewValue: 'linear-gradient(135deg, rgba(245,158,11,0.32) 0%, rgba(28,18,12,0.92) 52%, rgba(168,85,247,0.26) 100%)',
    sortOrder: 4,
  },

  // Banners
  {
    id: 'banner_obsidian_grid',
    category: 'banner',
    name: 'Obsidian Horizon',
    description: 'Clean dark violet horizon banner.',
    requiredTier: 'free',
    enabled: true,
    previewValue: 'linear-gradient(120deg, #1E1338 0%, #0D0B16 60%, #241242 100%)',
    sortOrder: 1,
  },
  {
    id: 'banner_cosmic_waves',
    category: 'banner',
    name: 'Cosmic Waves',
    description: 'Layered purple and cyan ambient waves.',
    requiredTier: 'plus',
    enabled: true,
    previewValue: 'radial-gradient(circle at 20% 25%, rgba(168,85,247,0.65), transparent 52%), radial-gradient(circle at 80% 70%, rgba(56,189,248,0.45), transparent 55%), linear-gradient(135deg, #0D0B18 0%, #1F123A 100%)',
    sortOrder: 2,
  },
  {
    id: 'banner_auric_eclipse',
    category: 'banner',
    name: 'Auric Eclipse',
    description: 'Animated eclipse halo banner for Pro creators.',
    requiredTier: 'pro',
    enabled: true,
    animated: true,
    previewValue: 'radial-gradient(circle at 50% 40%, rgba(251,191,36,0.52), rgba(139,92,246,0.28) 42%, #090710 80%)',
    sortOrder: 3,
  },

  // Profile Picture Frames
  {
    id: 'frame_minimal',
    category: 'avatar_frame',
    name: 'Clean Ring',
    description: 'Minimalist hairline avatar border.',
    requiredTier: 'free',
    enabled: true,
    previewValue: 'ring-2 ring-white/15',
    sortOrder: 1,
  },
  {
    id: 'frame_violet_halo',
    category: 'avatar_frame',
    name: 'Violet Halo',
    description: 'Luminous purple double-bevel frame.',
    requiredTier: 'plus',
    enabled: true,
    previewValue: 'ring-2 ring-purple-400 shadow-[0_0_20px_rgba(168,85,247,0.55)]',
    sortOrder: 2,
  },
  {
    id: 'frame_prism_bevel',
    category: 'avatar_frame',
    name: 'Prism Bevel',
    description: 'Iridescent violet-cyan studio border.',
    requiredTier: 'plus',
    enabled: true,
    previewValue: 'conic-violet-cyan',
    sortOrder: 3,
  },
  {
    id: 'frame_sovereign_crest',
    category: 'avatar_frame',
    name: 'Sovereign Crest',
    description: 'Refined gold-and-violet dual orbital frame.',
    requiredTier: 'pro',
    enabled: true,
    previewValue: 'conic-gold-violet',
    sortOrder: 4,
  },

  // Static Decorations
  {
    id: 'deco_none',
    category: 'static_decoration',
    name: 'No Decoration',
    description: 'Clean unadorned avatar presentation.',
    requiredTier: 'free',
    enabled: true,
    previewValue: 'none',
    sortOrder: 1,
  },
  {
    id: 'deco_spark_crest',
    category: 'static_decoration',
    name: 'Violet Spark Crest',
    description: 'Crisp faceted geometric corner crest.',
    requiredTier: 'free',
    enabled: true,
    previewValue: 'spark_crest',
    sortOrder: 2,
  },
  {
    id: 'deco_botanical_arc',
    category: 'static_decoration',
    name: 'Silver Laurel Arc',
    description: 'Precision vector laurel wreath accent.',
    requiredTier: 'plus',
    enabled: true,
    previewValue: 'laurel_arc',
    sortOrder: 3,
  },
  {
    id: 'deco_crown_pin',
    category: 'static_decoration',
    name: 'Gold Sovereign Pin',
    description: 'Pro faceted crown emblem above your avatar.',
    requiredTier: 'pro',
    enabled: true,
    previewValue: 'crown_pin',
    sortOrder: 4,
  },

  // Animated Decorations
  {
    id: 'anim_none',
    category: 'animated_decoration',
    name: 'Static Avatar',
    description: 'No animated avatar ring effect.',
    requiredTier: 'free',
    enabled: true,
    animated: false,
    previewValue: 'none',
    sortOrder: 1,
  },
  {
    id: 'anim_pulse_aura',
    category: 'animated_decoration',
    name: 'Violet Pulse Orbit',
    description: 'Smooth breathing violet orbital shimmer.',
    requiredTier: 'plus',
    enabled: true,
    animated: true,
    previewValue: 'pulse_aura',
    sortOrder: 2,
  },
  {
    id: 'anim_prism_orbit',
    category: 'animated_decoration',
    name: 'Prism Orbit Ring',
    description: 'Slow rotating prismatic energy halo.',
    requiredTier: 'pro',
    enabled: true,
    animated: true,
    previewValue: 'prism_orbit',
    sortOrder: 3,
  },
  {
    id: 'anim_stardust_halo',
    category: 'animated_decoration',
    name: 'Auric Stardust Halo',
    description: 'Orbiting gold & violet stardust particles.',
    requiredTier: 'pro',
    enabled: true,
    animated: true,
    previewValue: 'stardust_halo',
    sortOrder: 4,
  },

  // Special Profile Effects
  {
    id: 'effect_none',
    category: 'effect',
    name: 'No Ambient Effect',
    description: 'Clean static profile header.',
    requiredTier: 'free',
    enabled: true,
    previewValue: 'none',
    sortOrder: 1,
  },
  {
    id: 'effect_aurora',
    category: 'effect',
    name: 'Aurora Mist',
    description: 'Drifting soft violet and indigo northern light veil.',
    requiredTier: 'plus',
    enabled: true,
    animated: true,
    previewValue: 'aurora',
    sortOrder: 2,
  },
  {
    id: 'effect_starlight',
    category: 'effect',
    name: 'Starlight Field',
    description: 'Subtle twinkling starlight constellation shimmer.',
    requiredTier: 'pro',
    enabled: true,
    animated: true,
    previewValue: 'starlight',
    sortOrder: 3,
  },
  {
    id: 'effect_prism',
    category: 'effect',
    name: 'Prism Shimmer',
    description: 'Diagonal specular glass light sweep across your header.',
    requiredTier: 'pro',
    enabled: true,
    animated: true,
    previewValue: 'prism',
    sortOrder: 4,
  },

  // Profile Layouts
  {
    id: 'layout_classic',
    category: 'layout',
    name: 'Classic Balanced',
    description: 'Standard Nexora profile header & clean timeline layout.',
    requiredTier: 'free',
    enabled: true,
    previewValue: 'classic',
    sortOrder: 1,
  },
  {
    id: 'layout_compact',
    category: 'layout',
    name: 'Compact Minimal',
    description: 'Streamlined condensed header putting content first.',
    requiredTier: 'free',
    enabled: true,
    previewValue: 'compact',
    sortOrder: 2,
  },
  {
    id: 'layout_spotlight',
    category: 'layout',
    name: 'Creator Spotlight',
    description: 'Wide cinematic cover & prominent creator highlight bar.',
    requiredTier: 'plus',
    enabled: true,
    previewValue: 'spotlight',
    sortOrder: 3,
  },
  {
    id: 'layout_showcase',
    category: 'layout',
    name: 'Executive Showcase',
    description: 'Two-column studio hero with featured highlights & stats.',
    requiredTier: 'pro',
    enabled: true,
    previewValue: 'showcase',
    sortOrder: 4,
  },
];

export function sanitizeProfileCustomisation(
  raw?: Partial<ProfileCustomisation> | null,
  allowedTier: SubscriptionTier = 'pro'
): ProfileCustomisation {
  const base = { ...DEFAULT_PROFILE_CUSTOMISATION };
  if (!raw) return base;
  const pickIfAllowed = (itemId: string | undefined, fallback: string) => {
    if (!itemId) return fallback;
    const found = DEFAULT_CUSTOMISATION_CATALOG.find((c) => c.id === itemId);
    if (!found) return itemId.slice(0, 64);
    return canAccessTier(allowedTier, found.requiredTier) ? found.id : fallback;
  };
  const validHex = (val: string | undefined, fallback: string) =>
    val && /^#[0-9a-fA-F]{6}$/.test(val) ? val : fallback;

  return {
    themeId: pickIfAllowed(raw.themeId, base.themeId),
    backgroundColor: validHex(raw.backgroundColor, base.backgroundColor),
    accentColor: validHex(raw.accentColor, base.accentColor),
    gradientId: pickIfAllowed(raw.gradientId, base.gradientId),
    bannerPresetId: pickIfAllowed(raw.bannerPresetId, base.bannerPresetId),
    bannerImageUrl:
      typeof raw.bannerImageUrl === 'string' && canAccessTier(allowedTier, 'plus')
        ? raw.bannerImageUrl.slice(0, 400000)
        : '',
    avatarFrameId: pickIfAllowed(raw.avatarFrameId, base.avatarFrameId),
    staticDecorationId: pickIfAllowed(raw.staticDecorationId, base.staticDecorationId),
    animatedDecorationId: pickIfAllowed(raw.animatedDecorationId, base.animatedDecorationId),
    effectId: pickIfAllowed(raw.effectId, base.effectId),
    layoutVariant:
      raw.layoutVariant === 'classic' ||
      raw.layoutVariant === 'compact' ||
      (raw.layoutVariant === 'spotlight' && canAccessTier(allowedTier, 'plus')) ||
      (raw.layoutVariant === 'showcase' && canAccessTier(allowedTier, 'pro'))
        ? raw.layoutVariant
        : base.layoutVariant,
    cardOpacity:
      typeof raw.cardOpacity === 'number' && Number.isFinite(raw.cardOpacity)
        ? Math.min(100, Math.max(60, Math.round(raw.cardOpacity)))
        : 92,
  };
}

// --- Search & Discovery Privacy Filters ---
export function filterSearchableUsers(
  users: UserProfile[],
  viewerUid: string | null | undefined,
  blockedUserIds: string[] = [],
  followingIds: string[] = [],
  privateProfileUids: Set<string> = new Set()
): UserProfile[] {
  const blocked = new Set(blockedUserIds);
  const following = new Set(followingIds);
  return users.filter((u) => {
    if (!u || !u.uid) return false;
    if (u.suspended) return false;
    if (u.uid !== viewerUid && blocked.has(u.uid)) return false;
    if (u.uid !== viewerUid && privateProfileUids.has(u.uid) && !following.has(u.uid)) {
      return false;
    }
    return true;
  });
}

export function filterSearchablePosts(
  posts: Post[],
  viewerUid: string | null | undefined,
  blockedUserIds: string[] = [],
  followingIds: string[] = [],
  joinedSpaceIds: string[] = [],
  privateSpaceIds: Set<string> = new Set(),
  suspendedUserIds: Set<string> = new Set(),
  excludeCommunityPosts = false
): Post[] {
  const blocked = new Set(blockedUserIds);
  const following = new Set(followingIds);
  const joinedSpaces = new Set(joinedSpaceIds);
  return posts.filter((post) => {
    if (!post || !post.id) return false;
    if (excludeCommunityPosts && isCommunityPost(post)) return false;
    if (blocked.has(post.authorId) || suspendedUserIds.has(post.authorId)) return false;
    if (post.authorId === viewerUid) return true;
    if (post.audience === 'public') {
      if (post.spaceId && privateSpaceIds.has(post.spaceId) && !joinedSpaces.has(post.spaceId)) {
        return false;
      }
      return true;
    }
    if (post.audience === 'followers') {
      return following.has(post.authorId);
    }
    if (post.audience === 'space') {
      return Boolean(post.spaceId && joinedSpaces.has(post.spaceId));
    }
    return false;
  });
}

export function filterSearchableSpaces(
  spaces: Space[],
  viewerUid: string | null | undefined,
  joinedSpaceIds: string[] = []
): Space[] {
  const joined = new Set(joinedSpaceIds);
  return spaces.filter((s) => {
    if (!s || !s.id) return false;
    if (s.status === 'suspended' || s.status === 'pending') {
      return s.ownerId === viewerUid;
    }
    if (s.isPrivate) {
      return s.ownerId === viewerUid || joined.has(s.id);
    }
    return true;
  });
}

export const DEFAULT_AI_SETTINGS: AISettings = {
  id: 'global',
  enabled: true,
  defaultModel: 'gemini-4-hydrogen',
  personalityPrompt:
    'You are Nexora AI, the official intelligent assistant of the Nexora social networking platform. You are friendly, intelligent, professional, welcoming, and community-focused.',
  welcomeEnabled: true,
  welcomePromptTemplate:
    'Welcome a brand-new Nexora member warmly. Highlight how to explore Spaces, watch and post Vibes, connect in Chat, customize their Home feed, and ask Nexora AI anytime for help.',
  freeDailyLimit: 25,
  plusDailyLimit: 150,
  proDailyLimit: 1000,
  ownerUnlimited: true,
  rateLimitPerMinute: 15,
  prohibitedTopics: ['doxxing', 'self-harm instructions', 'malware exploit', 'credit card fraud'],
  officialLinks: {
    webAppUrl: '/',
    androidApkUrl: '/downloads/nexora-latest.apk',
    docsUrl: '/?view=landing',
    supportUrl: '/#settings:support',
  },
  updatedBy: 'system',
};

export const ANNOUNCEMENT_CATEGORIES: {
  id: AnnouncementCategory;
  label: string;
  severity: 'info' | 'warning' | 'security';
}[] = [
  { id: 'product_release', label: 'Product Release', severity: 'info' },
  { id: 'new_feature', label: 'New Feature', severity: 'info' },
  { id: 'maintenance', label: 'Scheduled Maintenance', severity: 'warning' },
  { id: 'security', label: 'Security Advisory', severity: 'security' },
  { id: 'community_event', label: 'Community Event', severity: 'info' },
  { id: 'subscription_update', label: 'Subscription & Perks', severity: 'info' },
];

// --- Global Theme & Rewards / Wallet / Withdrawal Pure Constants & Helpers ---
export const DEFAULT_MIN_WITHDRAWAL_NAIRA = 2000;
export const REFERRALS_PER_KEY_POINT = 10;
export const POINTS_PER_REFERRAL_MILESTONE = 1;

export const DEFAULT_REWARDS_CONFIG: RewardsConfig = {
  id: 'global',
  withdrawalsOpen: true,
  pointRateNaira: null, // Strictly unconfigured until set by the Founder/Owner
  minWithdrawalNaira: DEFAULT_MIN_WITHDRAWAL_NAIRA,
  referralsPerPoint: REFERRALS_PER_KEY_POINT,
  pointsPerMilestone: POINTS_PER_REFERRAL_MILESTONE,
  invitationsEnabled: true,
  tasksEnabled: true,
  lockReason: '',
  updatedBy: 'system',
};

export function normalizeThemeMode(raw: unknown): ThemeMode {
  if (raw === 'light' || raw === 'dark' || raw === 'system') {
    return raw;
  }
  return 'dark';
}

export function resolveEffectiveTheme(mode: ThemeMode, systemPrefersDark: boolean): 'dark' | 'light' {
  if (mode === 'system') {
    return systemPrefersDark ? 'dark' : 'light';
  }
  return mode === 'light' ? 'light' : 'dark';
}

export function sanitizeInviteCode(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '')
    .slice(0, 24);
}

export function generateInviteCode(seed: string): string {
  const cleanSeed = seed
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 5)
    .padEnd(3, 'X');
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 5; i += 1) {
    suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `NX-${cleanSeed}-${suffix}`.slice(0, 20);
}

export function computeConvertedNaira(
  points: number,
  pointRateNaira: number | null | undefined
): number | null {
  if (
    typeof pointRateNaira !== 'number' ||
    !Number.isFinite(pointRateNaira) ||
    pointRateNaira <= 0
  ) {
    return null;
  }
  if (!Number.isFinite(points) || points <= 0) return 0;
  return Math.round(points * pointRateNaira * 100) / 100;
}

export function formatNaira(amount: number | null | undefined): string {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) {
    return 'Rate pending';
  }
  return `₦${amount.toLocaleString('en-NG', {
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

export function calculateReferralMilestonesToAward(
  qualifiedReferralsCount: number,
  alreadyAwardedMilestones: number,
  referralsPerPoint = REFERRALS_PER_KEY_POINT
): {
  totalEarnedMilestones: number;
  newMilestonesToCredit: number;
  nextMilestoneAt: number;
  progressInCurrentBatch: number;
} {
  const step = Math.max(1, Math.floor(referralsPerPoint || REFERRALS_PER_KEY_POINT));
  const qualified = Math.max(0, Math.floor(qualifiedReferralsCount || 0));
  const paid = Math.max(0, Math.floor(alreadyAwardedMilestones || 0));
  const totalEarnedMilestones = Math.floor(qualified / step);
  const newMilestonesToCredit = Math.max(0, totalEarnedMilestones - paid);
  const progressInCurrentBatch = qualified % step;
  const nextMilestoneAt = (totalEarnedMilestones + 1) * step;
  return {
    totalEarnedMilestones,
    newMilestonesToCredit,
    nextMilestoneAt,
    progressInCurrentBatch,
  };
}

export interface ReferralFraudEvaluationInput {
  inviteeUid: string;
  inviterUid: string;
  inviteeEmail?: string;
  inviterEmail?: string;
  inviteeVerified: boolean;
  inviteeDeviceHash?: string;
  existingSameDeviceClaimsCount?: number;
  recentInviterClaimsCount24h?: number;
}

export function evaluateReferralFraudSignals(input: ReferralFraudEvaluationInput): {
  allowed: boolean;
  fraudScore: number;
  signals: string[];
  reason?: string;
} {
  const signals: string[] = [];
  let fraudScore = 0;

  if (!input.inviteeUid || !input.inviterUid || input.inviteeUid === input.inviterUid) {
    return {
      allowed: false,
      fraudScore: 100,
      signals: ['self_referral_attempt'],
      reason: 'Self-referrals are blocked and cannot earn Key Points.',
    };
  }

  const normalizedInviteeEmail = (input.inviteeEmail || '').trim().toLowerCase();
  const normalizedInviterEmail = (input.inviterEmail || '').trim().toLowerCase();
  if (normalizedInviteeEmail && normalizedInviterEmail && normalizedInviteeEmail === normalizedInviterEmail) {
    return {
      allowed: false,
      fraudScore: 100,
      signals: ['identical_email'],
      reason: 'Duplicate email referral blocked.',
    };
  }

  // Strip Gmail "+alias" and dots to detect trivial email alias farming
  const canonicalEmail = (raw: string) => {
    const [local, domain] = raw.split('@');
    if (!local || !domain) return raw;
    if (domain === 'gmail.com' || domain === 'googlemail.com') {
      return `${local.split('+')[0].replace(/\./g, '')}@gmail.com`;
    }
    return `${local.split('+')[0]}@${domain}`;
  };
  if (
    normalizedInviteeEmail &&
    normalizedInviterEmail &&
    canonicalEmail(normalizedInviteeEmail) === canonicalEmail(normalizedInviterEmail)
  ) {
    fraudScore += 75;
    signals.push('email_alias_similarity');
  }

  if (!input.inviteeVerified) {
    fraudScore += 30;
    signals.push('unverified_contact');
  }

  if ((input.existingSameDeviceClaimsCount || 0) >= 2) {
    fraudScore += 60;
    signals.push('repeated_device_fingerprint');
  }

  if ((input.recentInviterClaimsCount24h || 0) >= 25) {
    fraudScore += 45;
    signals.push('high_velocity_burst');
  }

  return {
    allowed: fraudScore < 80,
    fraudScore: Math.min(100, fraudScore),
    signals,
    reason: fraudScore >= 80 ? 'Referral flagged by automated anti-fraud screening.' : undefined,
  };
}

export function maskBankAccountNumber(accountNumber: string): string {
  const digits = (accountNumber || '').replace(/\D/g, '');
  if (digits.length < 4) return '******';
  return `${'*'.repeat(Math.max(4, digits.length - 4))}${digits.slice(-4)}`;
}

const VALID_WITHDRAWAL_TRANSITIONS: Record<WithdrawalStatus, WithdrawalStatus[]> = {
  pending: ['under_review', 'approved', 'rejected'],
  under_review: ['approved', 'rejected'],
  approved: ['processing', 'paid', 'rejected'],
  processing: ['paid', 'rejected'],
  paid: [],
  rejected: [],
};

export function canTransitionWithdrawalStatus(
  fromStatus: WithdrawalStatus,
  toStatus: WithdrawalStatus
): boolean {
  if (fromStatus === toStatus) return false;
  return VALID_WITHDRAWAL_TRANSITIONS[fromStatus]?.includes(toStatus) ?? false;
}

export function validateWithdrawalEligibility(params: {
  pointsRequested: number;
  availablePoints: number;
  frozen?: boolean;
  config: Pick<RewardsConfig, 'withdrawalsOpen' | 'pointRateNaira' | 'minWithdrawalNaira' | 'lockReason'>;
}): { ok: boolean; nairaAmount: number | null; error?: string } {
  const { pointsRequested, availablePoints, frozen, config } = params;
  if (frozen) {
    return { ok: false, nairaAmount: null, error: 'Your wallet is temporarily locked by moderation.' };
  }
  if (!config.withdrawalsOpen) {
    return {
      ok: false,
      nairaAmount: null,
      error: config.lockReason || 'Withdrawals are currently locked by Nexora administration.',
    };
  }
  if (typeof config.pointRateNaira !== 'number' || !Number.isFinite(config.pointRateNaira) || config.pointRateNaira <= 0) {
    return {
      ok: false,
      nairaAmount: null,
      error: 'Key Point conversion rate has not been set by the Nexora Owner yet.',
    };
  }
  if (!Number.isFinite(pointsRequested) || pointsRequested <= 0) {
    return { ok: false, nairaAmount: null, error: 'Enter a valid Key Points amount greater than zero.' };
  }
  if (pointsRequested > availablePoints) {
    return { ok: false, nairaAmount: null, error: 'Insufficient available Key Points balance.' };
  }
  const nairaAmount = computeConvertedNaira(pointsRequested, config.pointRateNaira);
  const minNaira = Math.max(100, config.minWithdrawalNaira || DEFAULT_MIN_WITHDRAWAL_NAIRA);
  if (nairaAmount === null || nairaAmount < minNaira) {
    return {
      ok: false,
      nairaAmount,
      error: `Minimum withdrawal is ${formatNaira(minNaira)}.`,
    };
  }
  return { ok: true, nairaAmount };
}

export const STARTER_FREE_TASKS: ReadonlyArray<{
  id:
    | 'starter_complete_profile'
    | 'starter_publish_first_post'
    | 'starter_join_community_space'
    | 'starter_engage_creators'
    | 'starter_invite_member';
  title: string;
  description: string;
  category: 'onboarding' | 'content' | 'community' | 'engagement' | 'social';
  rewardPoints: number;
  maxCompletionsPerUser: number;
  proofInstructions: string;
  actionUrl: string;
}> = [
  {
    id: 'starter_complete_profile',
    title: 'Complete Your Nexora Profile',
    description:
      'Add a display name, personal bio, and profile photo so community members recognize you across Nexora.',
    category: 'onboarding',
    rewardPoints: 1,
    maxCompletionsPerUser: 1,
    proofInstructions:
      'Make sure your bio and avatar are saved on your profile, then enter your @username or a short note to submit.',
    actionUrl: '',
  },
  {
    id: 'starter_publish_first_post',
    title: 'Publish Your First Nexora Post',
    description:
      'Introduce yourself or share an original creative thought, photo, or discussion in the community feed (100% free).',
    category: 'content',
    rewardPoints: 1,
    maxCompletionsPerUser: 1,
    proofInstructions:
      'Publish at least 1 post on Nexora, then describe what you posted so reviewers can verify it.',
    actionUrl: '',
  },
  {
    id: 'starter_join_community_space',
    title: 'Join a Community Space',
    description:
      'Discover Nexora Spaces and join a free community circle that aligns with your interests.',
    category: 'community',
    rewardPoints: 1,
    maxCompletionsPerUser: 1,
    proofInstructions:
      'Join any public Space on Nexora and type the Space name as proof of membership.',
    actionUrl: '',
  },
  {
    id: 'starter_engage_creators',
    title: 'Support & Engage Community Creators',
    description:
      'Follow creators or interact thoughtfully with posts and Vibes in your home feed.',
    category: 'engagement',
    rewardPoints: 1,
    maxCompletionsPerUser: 1,
    proofInstructions:
      'Share the creator @handle(s) or post topic you engaged with.',
    actionUrl: '',
  },
  {
    id: 'starter_invite_member',
    title: 'Share Your Personal Invite Link',
    description:
      'Copy your unique referral URL and invite genuine friends. Plus earn 1 Key Point for every 10 qualified referrals!',
    category: 'social',
    rewardPoints: 2,
    maxCompletionsPerUser: 1,
    proofInstructions:
      'Share your personal invitation link with friends and paste your referral code or share summary.',
    actionUrl: '',
  },
];

export interface StarterTaskReadiness {
  isStarter: boolean;
  readyToSubmit: boolean;
  statusLabel: string;
  actionType?: 'edit_profile' | 'create_post' | 'open_spaces' | 'open_home' | 'copy_invite';
  actionLabel?: string;
  suggestedProof?: string;
}

export function evaluateStarterTaskReadiness(
  taskId: string,
  context: {
    username?: string;
    hasBio?: boolean;
    hasAvatar?: boolean;
    postsCount?: number;
    followingCount?: number;
    joinedSpacesCount?: number;
    personalInviteCode?: string;
    qualifiedReferrals?: number;
  }
): StarterTaskReadiness {
  switch (taskId) {
    case 'starter_complete_profile': {
      const ready = Boolean(context.hasBio && context.hasAvatar);
      return {
        isStarter: true,
        readyToSubmit: ready,
        statusLabel: ready ? 'Profile ready to claim' : 'Add bio & photo to unlock',
        actionType: ready ? undefined : 'edit_profile',
        actionLabel: ready ? undefined : 'Edit Profile',
        suggestedProof: context.username
          ? `Profile completed for @${context.username} with bio and photo.`
          : 'Completed my Nexora profile bio and avatar.',
      };
    }
    case 'starter_publish_first_post': {
      const count = Number(context.postsCount || 0);
      const ready = count >= 1;
      return {
        isStarter: true,
        readyToSubmit: ready,
        statusLabel: ready ? `${count} post${count === 1 ? '' : 's'} published` : 'Publish 1 post to unlock',
        actionType: ready ? undefined : 'create_post',
        actionLabel: ready ? undefined : 'Create Post',
        suggestedProof: `Published ${Math.max(1, count)} post(s) on @${context.username || 'my_profile'}.`,
      };
    }
    case 'starter_join_community_space': {
      const count = Number(context.joinedSpacesCount || 0);
      const ready = count >= 1;
      return {
        isStarter: true,
        readyToSubmit: ready,
        statusLabel: ready ? `Member of ${count} space${count === 1 ? '' : 's'}` : 'Join 1 Space to unlock',
        actionType: ready ? undefined : 'open_spaces',
        actionLabel: ready ? undefined : 'Explore Spaces',
        suggestedProof: `Joined ${Math.max(1, count)} Nexora Space(s).`,
      };
    }
    case 'starter_engage_creators': {
      const following = Number(context.followingCount || 0);
      const ready = following >= 1;
      return {
        isStarter: true,
        readyToSubmit: ready,
        statusLabel: ready ? `Following ${following} creator${following === 1 ? '' : 's'}` : 'Follow or engage 1 creator',
        actionType: ready ? undefined : 'open_home',
        actionLabel: ready ? undefined : 'Explore Feed',
        suggestedProof: `Followed ${Math.max(1, following)} creator(s) and engaged with posts in Nexora.`,
      };
    }
    case 'starter_invite_member': {
      const hasCode = Boolean(context.personalInviteCode);
      const qualified = Number(context.qualifiedReferrals || 0);
      return {
        isStarter: true,
        readyToSubmit: hasCode,
        statusLabel:
          qualified > 0
            ? `${qualified} qualified referral${qualified === 1 ? '' : 's'}`
            : hasCode
            ? `Invite code ${context.personalInviteCode} ready`
            : 'Generate & share invite code',
        actionType: 'copy_invite',
        actionLabel: 'Copy Invite Link',
        suggestedProof: context.personalInviteCode
          ? `Shared personal invitation code ${context.personalInviteCode}.`
          : 'Shared my personal Nexora invitation link.',
      };
    }
    default:
      return {
        isStarter: false,
        readyToSubmit: true,
        statusLabel: 'Free task available',
      };
  }
}

// --- Community Isolation & Official Account Permission Helpers ---

export function isCommunityPost(
  post?: Pick<Post, 'audience' | 'spaceId'> | null
): boolean {
  if (!post) return false;
  return post.audience === 'space' || (typeof post.spaceId === 'string' && post.spaceId.trim().length > 0);
}

export function isPersonalTimelinePost(
  post?: Pick<Post, 'audience' | 'spaceId'> | null
): boolean {
  if (!post) return false;
  return !isCommunityPost(post);
}

export function isOfficialOwnerAccount(
  user?: Partial<UserProfile> | null,
  badgesMap?: Record<string, { badgeType?: string; badges?: string[] }>,
  role?: { role?: string; active?: boolean } | null
): boolean {
  if (role?.active && role.role === 'owner') return true;
  if (user?.isOfficialOwner === true) return true;
  const uid = user?.uid;
  if (uid && badgesMap?.[uid]) {
    const rec = badgesMap[uid];
    if (
      rec.badgeType === 'founder' ||
      rec.badgeType === 'owner' ||
      (Array.isArray(rec.badges) && (rec.badges.includes('founder') || rec.badges.includes('owner')))
    ) {
      return true;
    }
  }
  return false;
}

export function isPlatformVerifiedAccount(
  user?: Partial<UserProfile> | null,
  badgesMap?: Record<string, { badgeType?: string; badges?: string[] }>,
  role?: { role?: string; active?: boolean } | null
): boolean {
  if (!user) return false;
  if (isOfficialOwnerAccount(user, badgesMap, role)) return true;
  if (user.verified === true) return true;
  const uid = user.uid;
  if (uid && badgesMap?.[uid]) {
    const rec = badgesMap[uid];
    const list = normalizeBadgeList(
      rec.badges as any,
      rec.badgeType as any
    );
    if (list.length > 0) return true;
  }
  return false;
}

export interface CommentPermissionResult {
  allowed: boolean;
  isOfficialOwnerPost: boolean;
  requiresVerification: boolean;
  reason: string;
}

export function canCommentOnPost(params: {
  post: Pick<Post, 'authorId' | 'audience' | 'spaceId'>;
  currentUser?: Partial<UserProfile> | null;
  authorUser?: Partial<UserProfile> | null;
  badgesMap?: Record<string, { badgeType?: string; badges?: string[] }>;
  currentUserRole?: { role?: string; active?: boolean } | null;
}): CommentPermissionResult {
  const { post, currentUser, authorUser, badgesMap, currentUserRole } = params;
  if (!currentUser?.uid) {
    return {
      allowed: false,
      isOfficialOwnerPost: false,
      requiresVerification: false,
      reason: 'Sign in to comment on posts.',
    };
  }
  if (currentUser.suspended) {
    return {
      allowed: false,
      isOfficialOwnerPost: false,
      requiresVerification: false,
      reason: 'Suspended accounts cannot submit comments.',
    };
  }

  const authorStub: Partial<UserProfile> = authorUser || { uid: post.authorId };
  const isOfficialOwnerPost = isOfficialOwnerAccount(
    authorStub,
    badgesMap,
    currentUser.uid === post.authorId ? currentUserRole : undefined
  );

  if (!isOfficialOwnerPost) {
    return {
      allowed: true,
      isOfficialOwnerPost: false,
      requiresVerification: false,
      reason: '',
    };
  }

  // Anyone who is the Official Owner or a verified Nexora user can comment on Official Owner posts
  if (
    currentUser.uid === post.authorId ||
    isPlatformVerifiedAccount(currentUser, badgesMap, currentUserRole)
  ) {
    return {
      allowed: true,
      isOfficialOwnerPost: true,
      requiresVerification: false,
      reason: '',
    };
  }

  return {
    allowed: false,
    isOfficialOwnerPost: true,
    requiresVerification: true,
    reason:
      'Verification Required: Only verified Nexora users can comment on official Nexora owner posts. Anyone can still follow and like!',
  };
}

// --- Nexora Official Bot Ecosystem & Dexora Helpers ---

export const DEXORA_OFFICIAL_BOT_ID = 'dexora_support';
export const DEXORA_WELCOME_MESSAGE =
  "Welcome to Nexora! I'm Dexora, your official Nexora Support Assistant. I'm here to help you with account questions, platform assistance, security, and community support.";

export const DEXORA_OFFICIAL_PROFILE = {
  uid: DEXORA_OFFICIAL_BOT_ID,
  accountName: 'Dexora',
  botName: 'Dexora Support Special Bot',
  username: 'dexora',
  accountType: 'Official System Account',
  purpose: 'Customer support, platform identity, announcements, and automated assistance.',
  verified: true,
  protected: true,
  welcomeMessage: DEXORA_WELCOME_MESSAGE,
} as const;

export const RESERVED_OFFICIAL_USERNAMES = ['dexora', 'dexora_support', 'dexora_bot', 'nexora_official'] as const;

export function isReservedOfficialUsername(username: string): boolean {
  const clean = normalizeUsername(username);
  return (RESERVED_OFFICIAL_USERNAMES as readonly string[]).includes(clean);
}

export const BOT_PERMISSION_CATALOG: ReadonlyArray<{
  key: BotPermissionKey;
  label: string;
  description: string;
}> = [
  { key: 'read_messages', label: 'Read Messages', description: 'Read community messages to process slash commands and moderation.' },
  { key: 'send_messages', label: 'Send Messages', description: 'Post bot responses, welcomes, and command outputs in channels.' },
  { key: 'delete_messages', label: 'Delete Messages', description: 'Remove spam, flagged content, or cleared messages when authorized.' },
  { key: 'manage_members', label: 'Manage Members', description: 'Warn, mute, timeout, kick, or ban members when triggered by admins.' },
  { key: 'manage_roles', label: 'Manage Roles', description: 'Inspect and update community member roles where permitted.' },
  { key: 'manage_channels', label: 'Manage Channels', description: 'Lock and unlock discussion channels during moderation actions.' },
  { key: 'send_notifications', label: 'Send Notifications', description: 'Send welcomes, security notices, and official community alerts.' },
  { key: 'access_community_info', label: 'Access Community Info', description: 'Read non-private Space statistics, member counts, and rules.' },
  { key: 'manage_support_tickets', label: 'Manage Support Tickets', description: 'Create and respond to member support requests via /ticket and /support.' },
  { key: 'access_moderation_tools', label: 'Access Moderation Tools', description: 'Run automated spam/repeated-message and safety checks.' },
];

export const ALL_BOT_PERMISSION_KEYS: BotPermissionKey[] = BOT_PERMISSION_CATALOG.map((p) => p.key);

export const BOT_SLASH_COMMANDS: ReadonlyArray<BotSlashCommandMeta> = [
  { name: 'help', usage: '/help', description: 'List available bot commands and permissions.', category: 'info', requiredSpaceRole: 'member', requiredBotPermission: 'send_messages' },
  { name: 'about', usage: '/about', description: 'Show verified Nexora & Dexora bot details.', category: 'info', requiredSpaceRole: 'member', requiredBotPermission: 'send_messages' },
  { name: 'rules', usage: '/rules', description: 'Display the community rules and safety policy.', category: 'info', requiredSpaceRole: 'member', requiredBotPermission: 'access_community_info' },
  { name: 'profile', usage: '/profile [@username]', description: 'View a member summary inside the Space.', category: 'info', requiredSpaceRole: 'member', requiredBotPermission: 'access_community_info' },
  { name: 'warn', usage: '/warn @username [reason]', description: 'Issue an official moderation warning to a member.', category: 'moderation', requiredSpaceRole: 'admin', requiredBotPermission: 'manage_members' },
  { name: 'timeout', usage: '/timeout @username [minutes] [reason]', description: 'Temporarily pause a member from posting.', category: 'moderation', requiredSpaceRole: 'admin', requiredBotPermission: 'manage_members' },
  { name: 'ban', usage: '/ban @username [reason]', description: 'Ban a member from participating in this Space.', category: 'moderation', requiredSpaceRole: 'admin', requiredBotPermission: 'manage_members' },
  { name: 'unban', usage: '/unban @username', description: 'Lift an active ban inside this Space.', category: 'moderation', requiredSpaceRole: 'admin', requiredBotPermission: 'manage_members' },
  { name: 'kick', usage: '/kick @username [reason]', description: 'Remove a member from this Space.', category: 'moderation', requiredSpaceRole: 'owner', requiredBotPermission: 'manage_members' },
  { name: 'mute', usage: '/mute @username [minutes]', description: 'Mute a member in community discussions.', category: 'moderation', requiredSpaceRole: 'admin', requiredBotPermission: 'manage_members' },
  { name: 'unmute', usage: '/unmute @username', description: 'Unmute a muted Space member.', category: 'moderation', requiredSpaceRole: 'admin', requiredBotPermission: 'manage_members' },
  { name: 'clear', usage: '/clear [count]', description: 'Clear recent messages in the active channel.', category: 'moderation', requiredSpaceRole: 'admin', requiredBotPermission: 'delete_messages' },
  { name: 'announce', usage: '/announce [message]', description: 'Publish an official Space announcement.', category: 'community', requiredSpaceRole: 'admin', requiredBotPermission: 'send_notifications' },
  { name: 'poll', usage: '/poll Question | Option 1 | Option 2', description: 'Create a structured discussion poll.', category: 'community', requiredSpaceRole: 'member', requiredBotPermission: 'send_messages' },
  { name: 'lock', usage: '/lock [channel]', description: 'Lock the active channel so only Space admins can post.', category: 'moderation', requiredSpaceRole: 'admin', requiredBotPermission: 'manage_channels' },
  { name: 'unlock', usage: '/unlock [channel]', description: 'Reopen a locked discussion channel.', category: 'moderation', requiredSpaceRole: 'admin', requiredBotPermission: 'manage_channels' },
  { name: 'memberinfo', usage: '/memberinfo [@username]', description: 'Inspect Space role, warnings, and moderation state.', category: 'info', requiredSpaceRole: 'member', requiredBotPermission: 'access_community_info' },
  { name: 'serverinfo', usage: '/serverinfo', description: 'View Space profile, owner, privacy, and active bots.', category: 'info', requiredSpaceRole: 'member', requiredBotPermission: 'access_community_info' },
  { name: 'stats', usage: '/stats', description: 'Display member count, discussions, events, and posts stats.', category: 'community', requiredSpaceRole: 'member', requiredBotPermission: 'access_community_info' },
  { name: 'ticket', usage: '/ticket [issue summary]', description: 'Open a tracked support ticket with Dexora Support.', category: 'support', requiredSpaceRole: 'member', requiredBotPermission: 'manage_support_tickets' },
  { name: 'support', usage: '/support [question]', description: 'Get instant official help from Dexora Support Special Bot.', category: 'support', requiredSpaceRole: 'member', requiredBotPermission: 'manage_support_tickets' },
];

export const ALL_BOT_COMMAND_NAMES: BotSlashCommandName[] = BOT_SLASH_COMMANDS.map((c) => c.name);

export const DEFAULT_BOT_CATALOG: ReadonlyArray<Omit<BotDefinition, 'createdAt' | 'updatedAt'>> = [
  {
    id: DEXORA_OFFICIAL_BOT_ID,
    accountName: 'Dexora',
    botName: 'Dexora Support Special Bot',
    username: 'dexora',
    accountType: 'official_system_account',
    official: true,
    protected: true,
    verified: true,
    description: 'Official Nexora System Account & Support Special Bot providing verified help, community welcomes, security notices, and slash-command automation.',
    purpose: 'Customer support, platform identity, announcements, and automated assistance.',
    status: 'active',
    enabled: true,
    version: '2.4.0',
    availableUpdateVersion: '2.4.1',
    defaultPermissions: [...ALL_BOT_PERMISSION_KEYS],
    enabledCommands: [...ALL_BOT_COMMAND_NAMES],
    notificationSettings: {
      welcomeNewMembers: true,
      securityAlerts: true,
      supportReplies: true,
      maintenanceNotices: true,
      deploymentFailures: true,
    },
    autoRestartOnCrash: true,
    maxAutoRestarts: 5,
    restartCount: 0,
    updatedBy: 'system',
  },
  {
    id: 'nexora_automod',
    accountName: 'Nexora Guardian',
    botName: 'Nexora AutoMod Bot',
    username: 'nexora_guardian',
    accountType: 'community_bot',
    official: true,
    protected: false,
    verified: true,
    description: 'Automated community safety bot detecting spam bursts, repeated messages, suspicious invite links, and inappropriate phrases.',
    purpose: 'Space moderation, spam screening, warnings, mutes, and channel locks.',
    status: 'active',
    enabled: true,
    version: '1.8.0',
    defaultPermissions: [
      'read_messages',
      'send_messages',
      'delete_messages',
      'manage_members',
      'manage_channels',
      'access_community_info',
      'access_moderation_tools',
    ],
    enabledCommands: ['help', 'rules', 'warn', 'timeout', 'ban', 'unban', 'kick', 'mute', 'unmute', 'clear', 'lock', 'unlock', 'memberinfo', 'stats'],
    notificationSettings: {
      welcomeNewMembers: false,
      securityAlerts: true,
      supportReplies: false,
      maintenanceNotices: false,
      deploymentFailures: true,
    },
    autoRestartOnCrash: true,
    maxAutoRestarts: 5,
    restartCount: 0,
    updatedBy: 'system',
  },
  {
    id: 'nexora_welcome',
    accountName: 'Nexora Concierge',
    botName: 'Nexora Welcome & Events Bot',
    username: 'nexora_concierge',
    accountType: 'community_bot',
    official: true,
    protected: false,
    verified: true,
    description: 'Welcomes new Space members, shares rules and community stats, and assists with polls and announcements.',
    purpose: 'Member onboarding, community stats, announcements, and Space polls.',
    status: 'active',
    enabled: true,
    version: '1.5.2',
    defaultPermissions: [
      'read_messages',
      'send_messages',
      'send_notifications',
      'access_community_info',
    ],
    enabledCommands: ['help', 'about', 'rules', 'profile', 'announce', 'poll', 'serverinfo', 'stats'],
    notificationSettings: {
      welcomeNewMembers: true,
      securityAlerts: false,
      supportReplies: false,
      maintenanceNotices: true,
      deploymentFailures: true,
    },
    autoRestartOnCrash: true,
    maxAutoRestarts: 3,
    restartCount: 0,
    updatedBy: 'system',
  },
];

export function defaultSpaceBotConfig(spaceId: string): Omit<SpaceBotConfig, 'updatedAt'> {
  return {
    spaceId,
    enabled: true,
    botId: DEXORA_OFFICIAL_BOT_ID,
    welcomeEnabled: true,
    autoModEnabled: true,
    spamProtectionEnabled: true,
    repeatedMessageThreshold: 3,
    blockedWords: ['phishing', 'free nitro scam', 'steal password'],
    rulesText: 'Be respectful, avoid spam or repeated messages, protect member privacy, and never impersonate official Nexora staff or Dexora.',
    lockedChannels: [],
    permissions: [...ALL_BOT_PERMISSION_KEYS],
    enabledCommands: [...ALL_BOT_COMMAND_NAMES],
    updatedBy: 'system',
  };
}

export function canUserExecuteBotCommand(params: {
  commandName: BotSlashCommandName;
  spaceRole: 'owner' | 'admin' | 'member' | 'none';
  spaceConfig: Pick<SpaceBotConfig, 'enabled' | 'permissions' | 'enabledCommands'>;
}): { allowed: boolean; reason?: string; meta?: BotSlashCommandMeta } {
  const meta = BOT_SLASH_COMMANDS.find((c) => c.name === params.commandName);
  if (!meta) {
    return { allowed: false, reason: `Unknown command /${params.commandName}. Type /help for supported commands.` };
  }
  if (!params.spaceConfig.enabled) {
    return { allowed: false, reason: 'Community bots are currently disabled for this Space.' };
  }
  if (!params.spaceConfig.enabledCommands.includes(meta.name)) {
    return { allowed: false, reason: `Command /${meta.name} is disabled by this Space's administrators.`, meta };
  }
  if (!params.spaceConfig.permissions.includes(meta.requiredBotPermission)) {
    return {
      allowed: false,
      reason: `Bot permission "${meta.requiredBotPermission}" is required for /${meta.name}.`,
      meta,
    };
  }
  const rank = { none: 0, member: 1, admin: 2, owner: 3 };
  if (rank[params.spaceRole] < rank[meta.requiredSpaceRole]) {
    return {
      allowed: false,
      reason: `Only Space ${meta.requiredSpaceRole}s can run /${meta.name}.`,
      meta,
    };
  }
  return { allowed: true, meta };
}

export function evaluateMessageSafetyAndSpam(params: {
  text: string;
  recentTexts?: string[];
  blockedWords?: string[];
  repeatedThreshold?: number;
  spamProtectionEnabled?: boolean;
  autoModEnabled?: boolean;
}): { flagged: boolean; category?: 'spam_repeat' | 'blocked_phrase' | 'suspicious_link'; reason?: string } {
  const clean = (params.text || '').trim().toLowerCase();
  if (!clean) return { flagged: false };

  if (params.autoModEnabled !== false) {
    const blocked = (params.blockedWords || []).map((w) => w.trim().toLowerCase()).filter(Boolean);
    const hitWord = blocked.find((w) => clean.includes(w));
    if (hitWord) {
      return {
        flagged: true,
        category: 'blocked_phrase',
        reason: `Message matched community safety filter ("${hitWord}").`,
      };
    }
    if (/(bit\.ly|tinyurl\.com|grabify|iplogger)/i.test(clean)) {
      return {
        flagged: true,
        category: 'suspicious_link',
        reason: 'Suspicious shortened or tracking link detected by Nexora Bot AutoMod.',
      };
    }
  }

  if (params.spamProtectionEnabled !== false && Array.isArray(params.recentTexts)) {
    const threshold = Math.max(2, params.repeatedThreshold || 3);
    const sameCount = params.recentTexts.filter((t) => t.trim().toLowerCase() === clean).length;
    if (sameCount + 1 >= threshold) {
      return {
        flagged: true,
        category: 'spam_repeat',
        reason: 'Repeated message spam detected by Nexora Bot AutoMod.',
      };
    }
  }

  return { flagged: false };
}




