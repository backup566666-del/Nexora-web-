import { Timestamp } from 'firebase/firestore';

export type NavSection = 'home' | 'vibes' | 'create' | 'chat' | 'spaces' | 'profile' | 'settings';

export type AudienceType = 'public' | 'followers' | 'space';
export type PostType = 'text' | 'photo' | 'video' | 'poll' | 'repost';
export type StoryType = 'image' | 'video' | 'text';
export type StoryPrivacy = 'public' | 'followers' | 'close';
export type MessageType = 'text' | 'image' | 'video' | 'voice' | 'document';
export type NotificationType =
  | 'like'
  | 'comment'
  | 'follow'
  | 'repost'
  | 'space_invite'
  | 'message'
  | 'announcement'
  | 'security_alert'
  | 'admin_notice';

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
  | 'view_audit_logs';

export type VerifiedBadgeType = 'owner' | 'verified' | 'partner' | 'creator' | 'founder_circle';

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
  badgeType: VerifiedBadgeType;
  label: string;
  updatedBy: string;
  updatedAt: Timestamp;
}

export interface VerificationRequest {
  id: string;
  uid: string;
  displayName: string;
  username: string;
  avatarUrl?: string;
  requestedBadge: 'verified' | 'creator' | 'partner';
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
  targetType: 'post' | 'user' | 'space' | 'vibe';
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
  | 'notification';

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
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface PrivacySettings {
  profileVisibility: 'public' | 'followers';
  storyPrivacy: StoryPrivacy;
  allowDMs: 'everyone' | 'followers';
  showOnlineStatus: boolean;
}

export interface UserPrivate {
  uid: string;
  email: string;
  blockedUserIds: string[];
  privacySettings: PrivacySettings;
  updatedAt: Timestamp;
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
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface NotificationItem {
  id: string;
  recipientId: string;
  actorId: string;
  actorName: string;
  actorAvatar: string;
  type: NotificationType;
  targetId: string;
  preview: string;
  read: boolean;
  createdAt: Timestamp;
}
