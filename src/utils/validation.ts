import {
  AdminPermission,
  AnyVerifiedBadgeType,
  BadgeConfig,
  BadgeDefinition,
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
  Space,
  SubscriptionPlan,
  SubscriptionTier,
  UserProfile,
  UserSubscription,
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
  messages: true,
  spaces: true,
  subscriptions: true,
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
  suspendedUserIds: Set<string> = new Set()
): Post[] {
  const blocked = new Set(blockedUserIds);
  const following = new Set(followingIds);
  const joinedSpaces = new Set(joinedSpaceIds);
  return posts.filter((post) => {
    if (!post || !post.id) return false;
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
