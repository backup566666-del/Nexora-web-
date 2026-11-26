import { Timestamp } from 'firebase/firestore';

export type NavSection =
  | 'home'
  | 'vibes'
  | 'create'
  | 'chat'
  | 'spaces'
  | 'profile'
  | 'settings'
  | 'search'
  | 'notifications'
  | 'analytics'
  | 'subscriptions'
  | 'studio'
  | 'ai'
  | 'invite'
  | 'tasks'
  | 'wallet'
  | 'rewards-history'
  | 'dexora'
  | 'privacy';

export type ThemeMode = 'dark' | 'light' | 'system';

export type AudienceType = 'public' | 'followers' | 'space';
export type PostType = 'text' | 'photo' | 'video' | 'poll' | 'repost';
export type StoryType = 'image' | 'video' | 'text';
export type StoryPrivacy = 'public' | 'followers' | 'close';
export type MessageType = 'text' | 'image' | 'video' | 'voice' | 'document';
export type MessageDeliveryStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

export type SubscriptionTier = 'free' | 'plus' | 'pro';
export type BillingCycle = 'monthly' | 'yearly';

export type ProfileLayoutVariant = 'classic' | 'spotlight' | 'compact' | 'showcase';

export interface ProfileCustomisation {
  themeId: string;
  backgroundColor: string;
  accentColor: string;
  gradientId: string;
  bannerPresetId: string;
  bannerImageUrl?: string;
  avatarFrameId: string;
  staticDecorationId: string;
  animatedDecorationId: string;
  effectId: string;
  layoutVariant: ProfileLayoutVariant;
  cardOpacity?: number;
  updatedAt?: Timestamp;
}

export type NotificationCategory =
  | 'account'
  | 'social'
  | 'badges'
  | 'gifts'
  | 'admin'
  | 'security'
  | 'messages'
  | 'spaces'
  | 'subscriptions'
  | 'rewards'
  | 'bots';

export type NotificationType =
  | 'like'
  | 'comment'
  | 'reply'
  | 'mention'
  | 'follow'
  | 'repost'
  | 'space_invite'
  | 'space_announcement'
  | 'event_reminder'
  | 'message'
  | 'announcement'
  | 'security_alert'
  | 'admin_notice'
  | 'badge_awarded'
  | 'badge_revoked'
  | 'identity_decision'
  | 'staff_role_change'
  | 'community_status'
  | 'verification_decision'
  | 'collab_invite'
  | 'collab_response'
  | 'post_tag'
  | 'gift_received'
  | 'support_ticket'
  | 'subscription_notice'
  | 'subscription_renewal'
  | 'ai_welcome'
  | 'referral_reward'
  | 'task_reward'
  | 'withdrawal_update'
  | 'wallet_adjustment'
  | 'bot_alert'
  | 'bot_welcome'
  | 'deployment_failed'
  | 'privacy_update'
  | 'system_update';

// --- Governance & 5-Tier RBAC ---
export type InternalRole =
  | 'owner'
  | 'administrator'
  | 'moderator'
  | 'verification_reviewer'
  | 'support';

export type AdminPermission =
  | 'manage_admins'
  | 'manage_communities'
  | 'manage_verification'
  | 'review_identity_docs'
  | 'manage_platform'
  | 'view_analytics'
  | 'moderate_content'
  | 'manage_notifications'
  | 'view_audit_logs'
  | 'manage_rewards'
  | 'manage_withdrawals';

// Complete 20 Canonical Nexora Badges
export type VerifiedBadgeType =
  | 'verified_identity'
  | 'founder'
  | 'official_organization'
  | 'official_media'
  | 'creator'
  | 'influencer'
  | 'artist'
  | 'professional'
  | 'educator'
  | 'journalist'
  | 'community_founder'
  | 'community_leader'
  | 'moderator'
  | 'community_champion'
  | 'early_member'
  | 'pioneer'
  | 'top_contributor'
  | 'trendsetter'
  | 'supporter'
  | 'legend';

// Legacy aliases preserved for backward compatibility with existing Firestore documents
export type LegacyBadgeType = 'owner' | 'verified' | 'partner' | 'founder_circle';
export type AnyVerifiedBadgeType = VerifiedBadgeType | LegacyBadgeType;

export type BadgeCategory = 'identity' | 'official' | 'creator' | 'community' | 'achievement';

export interface BadgeDefinition {
  id: VerifiedBadgeType;
  name: string;
  shortLabel: string;
  category: BadgeCategory;
  description: string;
  eligibility: string;
  accentColor: string;
  bgTint: string;
  borderTint: string;
  applicationEligible: boolean;
  achievementAutoEligible: boolean;
}

export interface PlatformRole {
  uid: string;
  email: string;
  displayName: string;
  username: string;
  role: InternalRole;
  permissions: AdminPermission[];
  active: boolean;
  ownerBadge: boolean;
  specialBadge?: string;
  assignedBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface VerifiedBadgeRecord {
  uid: string;
  badgeType: AnyVerifiedBadgeType;
  label: string;
  badges?: AnyVerifiedBadgeType[];
  labels?: string[];
  updatedBy: string;
  updatedAt: Timestamp;
}

export interface BadgeConfig {
  badgeId: VerifiedBadgeType;
  enabled: boolean;
  autoAward: boolean;
  minFollowers: number;
  minPosts: number;
  minLikes: number;
  accountAgeDays: number;
  customCriteriaNote: string;
  updatedBy: string;
  updatedAt?: Timestamp;
}

export interface VerificationRequest {
  id: string;
  uid: string;
  displayName: string;
  username: string;
  avatarUrl?: string;
  requestedBadge: AnyVerifiedBadgeType;
  category: string;
  rationale: string;
  referenceLink?: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewerUid?: string;
  reviewerNote?: string;
  reviewedAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface IdentityVerificationRequest {
  id: string;
  uid: string;
  displayName: string;
  username: string;
  legalFullName: string;
  documentType: 'passport' | 'national_id' | 'drivers_license';
  documentCountry: string;
  documentPreviewUrl: string;
  documentFileName: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewerUid?: string;
  reviewerNote?: string;
  reviewedAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface PlatformFeatureToggles {
  registrationOpen: boolean;
  communityApprovalRequired: boolean;
  vibesEnabled: boolean;
  spacesEnabled: boolean;
  chatEnabled: boolean;
  storiesEnabled: boolean;
}

export interface PlatformConfig {
  platformName: string;
  slogan: string;
  description: string;
  logoMode: 'standard' | 'minimal' | 'monochrome';
  supportEmail: string;
  maintenanceMode: boolean;
  maintenanceMessage: string;
  features: PlatformFeatureToggles;
  contentPolicy: string;
  updatedBy: string;
  updatedAt?: Timestamp;
}

export interface PlatformAnnouncement {
  id: string;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'security';
  active: boolean;
  authorUid: string;
  authorName: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ModerationReport {
  id: string;
  reporterId: string;
  targetType: 'post' | 'user' | 'space' | 'vibe' | 'gift' | 'collab' | 'message';
  targetId: string;
  reason: string;
  status?: 'open' | 'resolved' | 'dismissed';
  resolutionNote?: string;
  resolvedBy?: string;
  resolvedAt?: Timestamp;
  createdAt: Timestamp;
}

export type AuditLogCategory =
  | 'admin'
  | 'community'
  | 'verification'
  | 'identity'
  | 'platform'
  | 'moderation'
  | 'notification'
  | 'billing'
  | 'customisation'
  | 'ai'
  | 'rewards'
  | 'wallet'
  | 'bots'
  | 'privacy';

export interface AuditLogEntry {
  id: string;
  actorUid: string;
  actorName: string;
  actorRole: string;
  action: string;
  category: AuditLogCategory;
  targetType: string;
  targetId: string;
  targetLabel?: string;
  result: 'success' | 'rejected';
  details?: string;
  createdAt: Timestamp;
}

export interface PlatformAnalyticsSnapshot {
  totalUsers: number;
  onlineUsers: number;
  suspendedUsers: number;
  verifiedUsers: number;
  registrations24h: number;
  registrations7d: number;
  totalPosts: number;
  totalEngagement: number;
  totalVibes: number;
  totalVibeViews: number;
  totalSpaces: number;
  activeSpaces: number;
  pendingSpaces: number;
  suspendedSpaces: number;
  openReports: number;
  pendingVerifications: number;
  computedAt: Date;
}

// --- Core Social Entities ---
export interface UserProfile {
  uid: string;
  displayName: string;
  username: string;
  bio: string;
  avatarUrl: string;
  coverUrl: string;
  coverPositionY: number;
  website: string;
  location: string;
  interests: string[];
  verified: boolean;
  isOfficialOwner?: boolean;
  officialTitle?: string;
  suspended?: boolean;
  suspendedReason?: string;
  suspendedAt?: Timestamp;
  onboardingCompleted: boolean;
  followersCount: number;
  followingCount: number;
  postsCount: number;
  likesCount: number;
  isOnline: boolean;
  lastActiveAt?: Timestamp;
  subscriptionTier?: SubscriptionTier;
  profileCustomisation?: ProfileCustomisation;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface PrivacySettings {
  profileVisibility: 'public' | 'followers';
  storyPrivacy: StoryPrivacy;
  allowDMs: 'everyone' | 'followers';
  showOnlineStatus: boolean;
  allowTags?: 'everyone' | 'followers' | 'nobody';
  allowCollaborations?: 'everyone' | 'followers' | 'nobody';
  communityPrivacy?: 'visible' | 'members_only' | 'hidden';
  messageVisibility?: 'everyone' | 'followers' | 'none';
  allowBotProcessing?: boolean;
  emailNotifications?: Record<NotificationCategory, boolean>;
  inAppNotifications?: Record<NotificationCategory, boolean>;
}

export interface UserPrivate {
  uid: string;
  email: string;
  blockedUserIds: string[];
  privacySettings: PrivacySettings;
  updatedAt: Timestamp;
}

export type HomepageLayoutMode = 'command' | 'editorial' | 'stream';
export type HomepageFeedDensity = 'comfortable' | 'compact';
export type HomepageFeedSort = 'all' | 'trending' | 'media' | 'discussions' | 'polls';
export type HomepageSectionId = 'stories' | 'creators' | 'spaces' | 'trending';

export interface HomepageCustomization {
  layout: HomepageLayoutMode;
  showStories: boolean;
  showRecommendedCreators: boolean;
  showSuggestedSpaces: boolean;
  showTrendingTopics: boolean;
  showVibesShelf: boolean;
  feedDensity: HomepageFeedDensity;
  defaultFeedFilter: HomepageFeedSort;
  sectionOrder: HomepageSectionId[];
}

export interface UserPreferences {
  uid: string;
  pinnedConvIds: string[];
  mutedConvIds: string[];
  recentSearches: string[];
  homepagePrefs?: HomepageCustomization;
  themeMode?: ThemeMode;
  saveAiHistory?: boolean;
  updatedAt?: Timestamp;
}

export interface CollaboratorProfileSummary {
  uid: string;
  displayName: string;
  username: string;
  avatarUrl?: string;
}

export interface Post {
  id: string;
  authorId: string;
  authorName: string;
  authorUsername: string;
  authorAvatar: string;
  authorVerified: boolean;
  spaceId: string;
  spaceName: string;
  type: PostType;
  text: string;
  mediaUrls: string[];
  mediaTypes: string[];
  hashtags: string[];
  mentions: string[];
  taggedUids?: string[];
  taggedUsernames?: string[];
  collaboratorInviteUids?: string[];
  collaboratorUids?: string[];
  declinedCollaboratorUids?: string[];
  collaboratorProfiles?: Record<string, CollaboratorProfileSummary>;
  giftsCount?: number;
  location: string;
  audience: AudienceType;
  pollOptions: string[];
  pollCounts: number[];
  repostOfId: string;
  likesCount: number;
  commentsCount: number;
  repostsCount: number;
  savesCount: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface PostComment {
  id: string;
  postId: string;
  authorId: string;
  authorName: string;
  authorUsername: string;
  authorAvatar: string;
  authorVerified: boolean;
  parentCommentId: string;
  text: string;
  createdAt: Timestamp;
}

export interface Story {
  id: string;
  authorId: string;
  authorName: string;
  authorUsername: string;
  authorAvatar: string;
  authorVerified: boolean;
  type: StoryType;
  text: string;
  mediaUrl: string;
  bgGradient: string;
  privacy: StoryPrivacy;
  viewsCount: number;
  createdAt: Timestamp;
  expiresAt: Timestamp;
}

export interface StoryView {
  id: string;
  uid: string;
  viewerName: string;
  viewerAvatar: string;
  reaction: string;
  viewedAt: Timestamp;
}

export interface Vibe {
  id: string;
  authorId: string;
  authorName: string;
  authorUsername: string;
  authorAvatar: string;
  authorVerified: boolean;
  videoUrl: string;
  thumbnailUrl: string;
  caption: string;
  hashtags: string[];
  audioTrack: string;
  filterPreset: string;
  textOverlay: string;
  trimStart: number;
  trimEnd: number;
  duration: number;
  likesCount: number;
  commentsCount: number;
  repostsCount: number;
  savesCount: number;
  viewsCount: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Space {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  coverUrl: string;
  coverPositionY: number;
  ownerId: string;
  ownerName: string;
  ownerUsername: string;
  verified: boolean;
  status?: 'active' | 'pending' | 'suspended';
  suspensionReason?: string;
  membersCount: number;
  isPrivate: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface SpaceMember {
  uid: string;
  role: 'owner' | 'admin' | 'member';
  displayName: string;
  username: string;
  avatarUrl: string;
  joinedAt: Timestamp;
}

export interface SpaceDiscussion {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  text: string;
  channel: string;
  isAi?: boolean;
  isBot?: boolean;
  botId?: string;
  botName?: string;
  commandName?: string;
  aiTriggeredBy?: string;
  pollQuestion?: string;
  pollOptions?: string[];
  pollVotes?: Record<string, number>;
  createdAt: Timestamp;
}

export interface SpaceEvent {
  id: string;
  title: string;
  description: string;
  scheduledFor: string;
  hostId: string;
  hostName: string;
  createdAt: Timestamp;
}

export interface Conversation {
  id: string;
  isGroup: boolean;
  title: string;
  participantIds: string[];
  participantNames: Record<string, string>;
  participantAvatars: Record<string, string>;
  lastMessageText: string;
  lastMessageSenderId: string;
  lastMessageAt?: Timestamp;
  readBy?: Record<string, Timestamp>;
  typingBy?: Record<string, Timestamp>;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  type: MessageType;
  text: string;
  mediaUrl: string;
  fileName: string;
  replyToId: string;
  replyToText: string;
  reactions: Record<string, string[]>;
  edited: boolean;
  deleted: boolean;
  deliveryStatus?: MessageDeliveryStatus;
  localId?: string;
  isAi?: boolean;
  aiTriggeredBy?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type NotificationTargetType =
  | 'post'
  | 'vibe'
  | 'profile'
  | 'chat'
  | 'space'
  | 'subscription'
  | 'settings'
  | 'rewards'
  | 'wallet'
  | 'invite'
  | 'tasks'
  | 'dexora'
  | 'bots'
  | 'privacy'
  | 'system';

export interface NotificationItem {
  id: string;
  recipientId: string;
  actorId: string;
  actorName: string;
  actorAvatar: string;
  type: NotificationType;
  category?: NotificationCategory;
  title?: string;
  targetType?: NotificationTargetType;
  targetId: string;
  dedupeKey?: string;
  preview: string;
  read: boolean;
  createdAt: Timestamp;
}

// --- Creator Analytics ---
export interface CreatorAnalyticsDaily {
  id: string; // `${uid}_${YYYY-MM-DD}`
  uid: string;
  dateKey: string; // YYYY-MM-DD
  profileVisits: number;
  postImpressions: number;
  vibeViews: number;
  followersDelta: number;
  updatedAt?: Timestamp;
}

// --- Subscriptions, Billing & Discord Nitro-Inspired Customisation Studio ---
export interface SubscriptionPlan {
  id: SubscriptionTier;
  name: string;
  tagline: string;
  badgeLabel: string;
  badgeColor: string;
  monthlyPriceCents: number | null;
  yearlyPriceCents: number | null;
  currency: string;
  stripeMonthlyPriceId?: string;
  stripeYearlyPriceId?: string;
  enabled: boolean;
  pricingConfigured: boolean;
  benefits: string[];
  sortOrder: number;
  updatedBy?: string;
  updatedAt?: Timestamp;
}

export interface UserSubscription {
  uid: string;
  tier: SubscriptionTier;
  billingCycle: BillingCycle | 'none';
  status: 'active' | 'canceled' | 'past_due' | 'expired' | 'free';
  cancelAtPeriodEnd: boolean;
  provider: 'stripe' | 'admin' | 'free';
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  lastSessionId?: string;
  receiptRef?: string;
  verifiedByServer: boolean;
  startedAt?: Timestamp;
  currentPeriodEnd?: Timestamp;
  updatedAt?: Timestamp;
}

export interface PaymentTransaction {
  id: string;
  uid: string;
  userDisplayName?: string;
  userUsername?: string;
  planId: SubscriptionTier;
  billingCycle: BillingCycle;
  amountCents: number;
  currency: string;
  status: 'paid' | 'pending' | 'failed' | 'refunded' | 'canceled';
  provider: 'stripe' | 'admin';
  stripeSessionId?: string;
  stripePaymentIntentId?: string;
  receiptNumber: string;
  errorMessage?: string;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

export type CustomisationCategory =
  | 'theme'
  | 'background'
  | 'accent'
  | 'gradient'
  | 'banner'
  | 'avatar_frame'
  | 'static_decoration'
  | 'animated_decoration'
  | 'effect'
  | 'layout';

export interface CustomisationItem {
  id: string;
  category: CustomisationCategory;
  name: string;
  description: string;
  requiredTier: SubscriptionTier;
  enabled: boolean;
  previewValue: string;
  secondaryValue?: string;
  animated?: boolean;
  imageUrl?: string;
  sortOrder: number;
  updatedBy?: string;
  updatedAt?: Timestamp;
}


// --- Free Virtual Gifting ---
export interface VirtualGiftCatalogItem {
  id: string;
  name: string;
  description: string;
  emoji: string;
  category: 'celebration' | 'creator' | 'community' | 'appreciation';
  accentColor: string;
  tier: 'free' | 'future_premium';
  enabled: boolean;
  sortOrder: number;
  createdBy?: string;
  updatedAt?: Timestamp;
}

export interface GiftTransaction {
  id: string;
  giftId: string;
  giftName: string;
  giftEmoji: string;
  giftAccent: string;
  senderUid: string;
  senderName: string;
  senderUsername: string;
  senderAvatar?: string;
  recipientUid: string;
  recipientName: string;
  recipientUsername: string;
  targetType: 'profile' | 'post';
  targetId: string;
  message?: string;
  anonymous: boolean;
  createdAt: Timestamp;
}

// --- Email Logs & Support Submissions ---
export interface EmailLogEntry {
  id: string;
  recipientUid?: string;
  recipientEmailMasked: string;
  eventType: string;
  category: NotificationCategory;
  subject: string;
  provider: 'resend' | 'smtp' | 'none';
  status: 'sent' | 'not_configured' | 'skipped' | 'failed';
  error?: string;
  actorUid: string;
  createdAt: Timestamp;
}

export interface ContactSubmission {
  id: string;
  uid?: string;
  name: string;
  email: string;
  category: 'support' | 'appeal' | 'verification_help' | 'bug' | 'partnership';
  subject: string;
  message: string;
  status: 'open' | 'in_review' | 'resolved';
  adminNote?: string;
  handledBy?: string;
  handledAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// --- Advanced Admin Presence System (Owner & Authorized Admins Only) ---
export type AdminPresenceStatus = 'online' | 'idle' | 'dnd' | 'invisible';
export type AdminManualMode = 'auto' | 'idle' | 'dnd' | 'invisible';
export type PublicAdminPresenceStatus = 'online' | 'idle' | 'dnd' | 'offline';

export interface AdminPresenceSession {
  sessionId: string;
  status: 'online' | 'idle';
  lastSeenMs: number;
  deviceType: 'web' | 'mobile' | 'android_twa';
}

export interface AdminPresencePublic {
  uid: string;
  role: InternalRole;
  status: PublicAdminPresenceStatus;
  updatedAt?: Timestamp;
}

export interface AdminPresencePrivate {
  uid: string;
  manualMode: AdminManualMode;
  sessions: Record<string, AdminPresenceSession>;
  updatedAt?: Timestamp;
}

// --- Private Admin System Diagnostics ---
export type ErrorDiagnosticCategory =
  | 'upload'
  | 'permission'
  | 'network'
  | 'auth'
  | 'validation'
  | 'runtime'
  | 'unknown';

export interface ErrorDiagnosticEntry {
  id: string;
  category: ErrorDiagnosticCategory;
  feature: string;
  requestId: string;
  httpStatus: number;
  errorCode: string;
  diagnosticMessage: string;
  redactedStack?: string;
  actorUid: string;
  resolved: boolean;
  resolvedBy?: string;
  resolvedAt?: Timestamp;
  createdAt?: Timestamp;
}

// --- Nexora AI Platform Assistant, Automation & Announcements ---
export type AiChatModelId =
  | 'gemini-4-hydrogen'
  | 'gemini-3.1-flash-lite'
  | 'gemini-4-neon'
  | 'gemini-4-carbon';

export interface AIConversation {
  id: string;
  uid: string;
  title: string;
  model: AiChatModelId;
  saveHistory: boolean;
  messageCount: number;
  lastMessagePreview: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface AIMessage {
  id: string;
  convId: string;
  uid: string;
  role: 'user' | 'model';
  text: string;
  model?: AiChatModelId;
  promptTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  estimatedCostUsd?: number;
  createdAt?: Timestamp;
}

export interface AIOfficialLinks {
  webAppUrl: string;
  androidApkUrl: string;
  docsUrl: string;
  supportUrl: string;
}

export interface AISettings {
  id?: string;
  enabled: boolean;
  defaultModel: AiChatModelId;
  personalityPrompt: string;
  welcomeEnabled: boolean;
  welcomePromptTemplate: string;
  freeDailyLimit: number;
  plusDailyLimit: number;
  proDailyLimit: number;
  ownerUnlimited: boolean;
  rateLimitPerMinute: number;
  prohibitedTopics: string[];
  officialLinks: AIOfficialLinks;
  updatedBy: string;
  updatedAt?: Timestamp;
}

export interface AIUsageRecord {
  id: string;
  uid: string;
  dateKey: string;
  tier: SubscriptionTier;
  requestsCount: number;
  promptTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  lastRequestMs?: number;
  updatedAt?: Timestamp;
}

export interface AIChannelConfig {
  channelId: string;
  targetType: 'space' | 'group_chat';
  targetId: string;
  channelName: string;
  enabled: boolean;
  mode: 'direct_only' | 'auto_and_direct';
  responseFrequency: 'low' | 'balanced' | 'high';
  cooldownSeconds: number;
  prohibitedTopics: string[];
  moderationEnabled: boolean;
  welcomeNewParticipants: boolean;
  lastBotReplyMs?: number;
  updatedBy: string;
  updatedAt?: Timestamp;
}

export type AnnouncementCategory =
  | 'product_release'
  | 'new_feature'
  | 'maintenance'
  | 'security'
  | 'community_event'
  | 'subscription_update';

export type AnnouncementAudience = 'all' | 'free' | 'plus' | 'pro' | 'staff';

export interface AnnouncementRecord {
  id: string;
  title: string;
  body: string;
  category: AnnouncementCategory;
  audience: AnnouncementAudience;
  status: 'draft' | 'approved' | 'scheduled' | 'published' | 'failed';
  scheduledFor?: string;
  aiGenerated: boolean;
  ownerApproved: boolean;
  approvedBy?: string;
  deliveryStats?: {
    inAppCount?: number;
    pushCount?: number;
    failedCount?: number;
  };
  createdBy: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  publishedAt?: Timestamp;
}

export interface DeviceTokenRecord {
  id: string;
  uid: string;
  token: string;
  platform: 'web' | 'android_twa' | 'ios_pwa';
  pushConsent: boolean;
  enabled: boolean;
  userAgent?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface ReleaseHistoryItem {
  id: string;
  version: string;
  notes: string;
  status: 'draft' | 'published';
  downloadLinks?: {
    web?: string;
    android?: string;
  };
  aiSummaryTitle?: string;
  aiSummaryBody?: string;
  ownerApproved: boolean;
  approvedBy?: string;
  announcementId?: string;
  notifiedAt?: Timestamp;
  createdBy: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface DeliveryReport {
  id: string;
  sourceType: 'welcome' | 'announcement' | 'release' | 'test';
  sourceId: string;
  channel: 'in_app' | 'push' | 'email' | 'multi';
  recipientCount: number;
  deliveredCount: number;
  failedCount: number;
  failureDetails?: string[];
  status: 'completed' | 'partial' | 'failed';
  createdBy: string;
  createdAt?: Timestamp;
}

// --- Invitations, Tasks & Rewards, Wallet & Nigerian Bank Withdrawals ---
export type WithdrawalStatus =
  | 'pending'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'processing'
  | 'paid';

export interface RewardsConfig {
  id: 'global';
  withdrawalsOpen: boolean;
  /** Strictly null until configured by the Founder/Owner. Never hardcoded. */
  pointRateNaira: number | null;
  minWithdrawalNaira: number;
  referralsPerPoint: number;
  pointsPerMilestone: number;
  invitationsEnabled: boolean;
  tasksEnabled: boolean;
  lockReason?: string;
  updatedBy: string;
  updatedAt?: Timestamp;
}

export interface InvitationRecord {
  code: string;
  ownerUid: string;
  ownerName: string;
  ownerUsername: string;
  kind: 'personal' | 'admin';
  label?: string;
  active: boolean;
  totalRegistrations: number;
  qualifiedReferralsCount: number;
  milestonesAwarded: number;
  pointsEarned: number;
  createdBy: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export type ReferralClaimStatus = 'pending' | 'qualified' | 'flagged' | 'rejected';

export interface ReferralClaim {
  id: string; // inviteeUid
  inviteeUid: string;
  inviteeName: string;
  inviteeUsername: string;
  inviterUid: string;
  inviterName: string;
  inviterUsername: string;
  invitationCode: string;
  status: ReferralClaimStatus;
  rewardStatus: 'uncounted' | 'counted' | 'milestone_paid' | 'blocked';
  fraudScore: number;
  fraudSignals: string[];
  deviceHash?: string;
  registeredAt?: Timestamp;
  qualifiedAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface ReferralFraudAlert {
  id: string;
  claimId: string;
  inviteeUid: string;
  inviterUid: string;
  invitationCode: string;
  fraudScore: number;
  signals: string[];
  status: 'open' | 'dismissed' | 'confirmed_fraud';
  reviewedBy?: string;
  reviewNote?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface TaskItem {
  id: string;
  title: string;
  description: string;
  category: 'community' | 'social' | 'engagement' | 'content' | 'onboarding';
  rewardPoints: number;
  /** Enforced true: tasks on Nexora must never require a deposit or paid subscription */
  freeToParticipate: true;
  active: boolean;
  maxCompletionsPerUser: number;
  proofInstructions: string;
  actionUrl?: string;
  submissionsCount: number;
  approvedCount: number;
  createdBy: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export type TaskSubmissionStatus = 'pending' | 'approved' | 'rejected';

export interface TaskSubmission {
  id: string; // `${taskId}_${uid}`
  taskId: string;
  taskTitle: string;
  uid: string;
  userDisplayName: string;
  userUsername: string;
  proofText: string;
  proofUrl?: string;
  rewardPoints: number;
  status: TaskSubmissionStatus;
  reviewerUid?: string;
  reviewerNote?: string;
  reviewedAt?: Timestamp;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface WalletAccount {
  uid: string;
  availablePoints: number;
  pendingPoints: number;
  lockedPoints: number;
  lifetimeEarnedPoints: number;
  lifetimeWithdrawnPoints: number;
  lifetimeWithdrawnNaira: number;
  frozen?: boolean;
  freezeReason?: string;
  updatedAt?: Timestamp;
}

export type WalletTransactionType =
  | 'referral_milestone'
  | 'task_reward'
  | 'admin_credit'
  | 'admin_debit'
  | 'withdrawal_lock'
  | 'withdrawal_refund'
  | 'withdrawal_paid';

export interface WalletTransaction {
  id: string;
  uid: string;
  type: WalletTransactionType;
  direction: 'credit' | 'debit';
  points: number;
  nairaEquivalent?: number | null;
  pointRateNaira?: number | null;
  referenceId: string;
  description: string;
  actorUid: string;
  balanceAfterAvailable: number;
  createdAt?: Timestamp;
}

export interface WithdrawalRequest {
  id: string;
  uid: string;
  userDisplayName: string;
  userUsername: string;
  pointsRequested: number;
  pointRateNaira: number;
  nairaAmount: number;
  bankName: string;
  bankCode: string;
  accountNumberMasked: string;
  accountHolderName: string;
  accountVerificationStatus: 'verified' | 'unverified_manual' | 'not_configured';
  verificationProvider: 'paystack' | 'flutterwave' | 'none';
  status: WithdrawalStatus;
  paymentReference?: string;
  adminNote?: string;
  reviewedBy?: string;
  paidBy?: string;
  paidAt?: Timestamp;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface WithdrawalPrivatePII {
  withdrawalId: string;
  uid: string;
  bankName: string;
  bankCode: string;
  accountNumber: string;
  accountHolderName: string;
  verificationProvider: 'paystack' | 'flutterwave' | 'none';
  providerResponseSummary?: string;
  createdAt?: Timestamp;
}

export interface NigerianBankInfo {
  name: string;
  code: string;
  slug?: string;
}

export interface BankProviderStatus {
  configured: boolean;
  provider: 'paystack' | 'flutterwave' | 'none';
  message: string;
}

export interface BankAccountResolution {
  verified: boolean;
  verificationStatus: 'verified' | 'not_configured' | 'failed';
  provider: 'paystack' | 'flutterwave' | 'none';
  bankCode: string;
  bankName?: string;
  accountNumber: string;
  accountName?: string;
  message: string;
}

export type ProfileContentTab =
  | 'posts'
  | 'videos'
  | 'photos'
  | 'tagged'
  | 'collabs'
  | 'gifts'
  | 'tasks'
  | 'spaces'
  | 'saved';

export interface StarterTaskSeedDefinition {
  id:
    | 'starter_complete_profile'
    | 'starter_publish_first_post'
    | 'starter_join_community_space'
    | 'starter_engage_creators'
    | 'starter_invite_member';
  title: string;
  description: string;
  category: TaskItem['category'];
  rewardPoints: number;
  maxCompletionsPerUser: number;
  proofInstructions: string;
  actionUrl: string;
}

// --- Nexora Official Bot Ecosystem, Dexora & Privacy Protection ---
export type BotPermissionKey =
  | 'read_messages'
  | 'send_messages'
  | 'delete_messages'
  | 'manage_members'
  | 'manage_roles'
  | 'manage_channels'
  | 'send_notifications'
  | 'access_community_info'
  | 'manage_support_tickets'
  | 'access_moderation_tools';

export type BotSlashCommandName =
  | 'help'
  | 'about'
  | 'rules'
  | 'profile'
  | 'warn'
  | 'timeout'
  | 'ban'
  | 'unban'
  | 'kick'
  | 'mute'
  | 'unmute'
  | 'clear'
  | 'announce'
  | 'poll'
  | 'lock'
  | 'unlock'
  | 'memberinfo'
  | 'serverinfo'
  | 'stats'
  | 'ticket'
  | 'support';

export interface BotSlashCommandMeta {
  name: BotSlashCommandName;
  usage: string;
  description: string;
  category: 'info' | 'moderation' | 'community' | 'support';
  requiredSpaceRole: 'member' | 'admin' | 'owner';
  requiredBotPermission: BotPermissionKey;
}

export interface BotNotificationSettings {
  welcomeNewMembers: boolean;
  securityAlerts: boolean;
  supportReplies: boolean;
  maintenanceNotices: boolean;
  deploymentFailures: boolean;
}

export interface BotDefinition {
  id: string;
  accountName: string;
  botName: string;
  username: string;
  accountType: 'official_system_account' | 'community_bot';
  official: boolean;
  protected: boolean;
  verified: boolean;
  description: string;
  purpose: string;
  status: 'active' | 'offline' | 'deploying' | 'error';
  enabled: boolean;
  version: string;
  availableUpdateVersion?: string;
  defaultPermissions: BotPermissionKey[];
  enabledCommands: BotSlashCommandName[];
  notificationSettings: BotNotificationSettings;
  autoRestartOnCrash: boolean;
  maxAutoRestarts: number;
  uptimeStartedMs?: number;
  restartCount: number;
  lastError?: string;
  updatedBy: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface BotDeploymentRecord {
  id: string;
  botId: string;
  botName: string;
  version: string;
  trigger: 'startup' | 'manual' | 'auto_restart' | 'update';
  status: 'deploying' | 'succeeded' | 'failed' | 'restarted';
  commandsRegistered: number;
  uptimeSeconds: number;
  errorSummary?: string;
  actorUid: string;
  createdAt?: Timestamp;
}

export interface BotActivityLog {
  id: string;
  botId: string;
  botName: string;
  spaceId?: string;
  actorUid: string;
  actorName: string;
  eventType: 'command' | 'moderation' | 'welcome' | 'support' | 'deployment' | 'error' | 'security';
  command?: string;
  summary: string;
  severity: 'info' | 'warning' | 'error';
  createdAt?: Timestamp;
}

export interface SpaceBotConfig {
  spaceId: string;
  enabled: boolean;
  botId: string;
  welcomeEnabled: boolean;
  autoModEnabled: boolean;
  spamProtectionEnabled: boolean;
  repeatedMessageThreshold: number;
  blockedWords: string[];
  rulesText: string;
  lockedChannels: string[];
  permissions: BotPermissionKey[];
  enabledCommands: BotSlashCommandName[];
  updatedBy: string;
  updatedAt?: Timestamp;
}

export interface SpaceMemberModerationState {
  id: string; // `${spaceId}_${targetUid}`
  spaceId: string;
  targetUid: string;
  targetUsername: string;
  targetDisplayName: string;
  warningsCount: number;
  lastWarningReason?: string;
  mutedUntilMs?: number;
  banned: boolean;
  banReason?: string;
  updatedBy: string;
  updatedAt?: Timestamp;
}

export interface DexoraSupportTicket {
  id: string;
  uid: string;
  userDisplayName: string;
  userUsername: string;
  category: 'account' | 'security' | 'community' | 'bug' | 'billing' | 'verification' | 'other';
  subject: string;
  message: string;
  status: 'open' | 'bot_replied' | 'escalated' | 'resolved';
  botResponse?: string;
  responderName: string;
  adminNote?: string;
  handledBy?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface PrivacyDeletionRequest {
  id: string;
  uid: string;
  userDisplayName: string;
  userUsername: string;
  email: string;
  scope: 'account_and_profile' | 'ai_history_only' | 'community_activity';
  reason: string;
  status: 'pending' | 'processing' | 'completed' | 'canceled';
  processedBy?: string;
  resolutionSummary?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}


