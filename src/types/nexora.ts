import { Timestamp } from 'firebase/firestore';

export type NavSection = 'home' | 'vibes' | 'create' | 'chat' | 'spaces' | 'profile' | 'settings';

export type AudienceType = 'public' | 'followers' | 'space';
export type PostType = 'text' | 'photo' | 'video' | 'poll' | 'repost';
export type StoryType = 'image' | 'video' | 'text';
export type StoryPrivacy = 'public' | 'followers' | 'close';
export type MessageType = 'text' | 'image' | 'video' | 'voice' | 'document';
export type NotificationType = 'like' | 'comment' | 'follow' | 'repost' | 'space_invite' | 'message';

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
