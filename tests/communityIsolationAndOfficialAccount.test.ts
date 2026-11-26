import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { Timestamp } from 'firebase/firestore';
import {
  FOUNDER_OWNER_EMAIL,
  canCommentOnPost,
  filterSearchablePosts,
  isCommunityPost,
  isOfficialOwnerAccount,
  isPersonalTimelinePost,
  isPlatformVerifiedAccount,
} from '../src/utils/validation';
import { aggregateCreatorAnalytics } from '../src/services/firebase/analyticsService';
import type { Post, UserProfile, VerifiedBadgeRecord } from '../src/types/nexora';

test('1. Community Isolation helpers separate Space posts from personal & public timeline posts', () => {
  const personalPublic = {
    id: 'p_personal',
    authorId: 'u_alice',
    audience: 'public',
    text: 'Personal timeline update',
  } as unknown as Post;

  const personalFollowers = {
    id: 'p_followers',
    authorId: 'u_alice',
    audience: 'followers',
    spaceId: '',
    text: 'Followers timeline update',
  } as unknown as Post;

  const spaceAudiencePost = {
    id: 'p_space_aud',
    authorId: 'u_alice',
    audience: 'space',
    spaceId: 'sp_builders',
    text: 'Strictly inside Space',
  } as unknown as Post;

  const legacySpaceIdPost = {
    id: 'p_space_legacy',
    authorId: 'u_alice',
    audience: 'public',
    spaceId: 'sp_builders',
    text: 'Tagged with spaceId must remain isolated',
  } as unknown as Post;

  assert.equal(isCommunityPost(personalPublic), false);
  assert.equal(isCommunityPost(personalFollowers), false);
  assert.equal(isCommunityPost(spaceAudiencePost), true);
  assert.equal(isCommunityPost(legacySpaceIdPost), true);

  assert.equal(isPersonalTimelinePost(personalPublic), true);
  assert.equal(isPersonalTimelinePost(personalFollowers), true);
  assert.equal(isPersonalTimelinePost(spaceAudiencePost), false);
  assert.equal(isPersonalTimelinePost(legacySpaceIdPost), false);
});

test('2. General public search discovery & creator analytics exclude community posts', () => {
  const viewerUid = 'u_viewer';
  const posts = [
    {
      id: 'p_pub',
      authorId: 'u_creator',
      audience: 'public',
      text: 'Public launch update',
      likesCount: 25,
      commentsCount: 4,
      repostsCount: 2,
      savesCount: 1,
      createdAt: Timestamp.fromDate(new Date('2026-11-24T10:00:00Z')),
    },
    {
      id: 'p_space',
      authorId: 'u_creator',
      audience: 'space',
      spaceId: 'sp_joined',
      text: 'Space-only event recap',
      likesCount: 99,
      commentsCount: 30,
      repostsCount: 0,
      savesCount: 0,
      createdAt: Timestamp.fromDate(new Date('2026-11-24T11:00:00Z')),
    },
  ] as unknown as Post[];

  const publicOnlySearch = filterSearchablePosts(
    posts,
    viewerUid,
    [],
    [],
    ['sp_joined'],
    new Set(),
    new Set(),
    true
  );
  assert.deepEqual(
    publicOnlySearch.map((p) => p.id),
    ['p_pub']
  );

  const creator = {
    uid: 'u_creator',
    displayName: 'Creator',
    username: 'creator',
    email: 'creator@example.com',
    followersCount: 120,
  } as unknown as UserProfile;

  const analytics = aggregateCreatorAnalytics({
    profile: creator,
    dailyRows: [],
    posts,
    vibes: [],
    preset: '7d',
    now: new Date('2026-11-25T12:00:00Z'),
  });
  assert.deepEqual(
    analytics.topPosts.map((p) => p.id),
    ['p_pub']
  );
});

test('3. Permission tier matrix: Regular, Verified, and Official Nexora Owner commenting rules', () => {
  const officialOwner = {
    uid: 'uid_owner',
    email: FOUNDER_OWNER_EMAIL,
    username: 'nexora',
    displayName: 'Nexora Official',
    verified: true,
    isOfficialOwner: true,
    officialTitle: 'Official Nexora Account',
  } as unknown as UserProfile;

  const verifiedUser = {
    uid: 'uid_verified',
    email: 'verified@example.com',
    username: 'verified_member',
    displayName: 'Verified Member',
    verified: true,
  } as unknown as UserProfile;

  const regularUnverifiedUser = {
    uid: 'uid_regular',
    email: 'regular@example.com',
    username: 'regular_member',
    displayName: 'Regular Member',
    verified: false,
  } as unknown as UserProfile;

  const badgeVerifiedUser = {
    uid: 'uid_badge_verified',
    email: 'badge@example.com',
    username: 'badge_member',
    displayName: 'Badge Member',
    verified: false,
  } as unknown as UserProfile;

  const badgesMap: Record<string, VerifiedBadgeRecord> = {
    uid_owner: {
      uid: 'uid_owner',
      badgeType: 'founder',
      badges: ['founder', 'verified_identity'],
    } as unknown as VerifiedBadgeRecord,
    uid_badge_verified: {
      uid: 'uid_badge_verified',
      badgeType: 'creator',
      badges: ['creator'],
    } as unknown as VerifiedBadgeRecord,
  };

  assert.equal(isOfficialOwnerAccount(officialOwner, badgesMap), true);
  assert.equal(isOfficialOwnerAccount(verifiedUser, badgesMap), false);
  assert.equal(isOfficialOwnerAccount(regularUnverifiedUser, badgesMap), false);

  assert.equal(isPlatformVerifiedAccount(officialOwner, badgesMap), true);
  assert.equal(isPlatformVerifiedAccount(verifiedUser, badgesMap), true);
  assert.equal(isPlatformVerifiedAccount(badgeVerifiedUser, badgesMap), true);
  assert.equal(isPlatformVerifiedAccount(regularUnverifiedUser, badgesMap), false);

  const ownerPost = {
    id: 'post_owner_1',
    authorId: officialOwner.uid,
    audience: 'public',
    text: 'Official platform announcement',
  } as unknown as Post;

  const regularPost = {
    id: 'post_regular_1',
    authorId: regularUnverifiedUser.uid,
    audience: 'public',
    text: 'Community member update',
  } as unknown as Post;

  // Regular unverified user can comment on normal posts, NOT on Official Owner posts
  const unverifiedOnRegular = canCommentOnPost({
    post: regularPost,
    currentUser: regularUnverifiedUser,
    authorUser: regularUnverifiedUser,
    badgesMap,
  });
  assert.equal(unverifiedOnRegular.allowed, true);
  assert.equal(unverifiedOnRegular.isOfficialOwnerPost, false);

  const unverifiedOnOwner = canCommentOnPost({
    post: ownerPost,
    currentUser: regularUnverifiedUser,
    authorUser: officialOwner,
    badgesMap,
  });
  assert.equal(unverifiedOnOwner.allowed, false);
  assert.equal(unverifiedOnOwner.isOfficialOwnerPost, true);
  assert.equal(unverifiedOnOwner.requiresVerification, true);
  assert.match(unverifiedOnOwner.reason || '', /verified/i);

  // Verified user & badge-verified user CAN comment on Official Owner posts
  const verifiedOnOwner = canCommentOnPost({
    post: ownerPost,
    currentUser: verifiedUser,
    authorUser: officialOwner,
    badgesMap,
  });
  assert.equal(verifiedOnOwner.allowed, true);

  const badgeVerifiedOnOwner = canCommentOnPost({
    post: ownerPost,
    currentUser: badgeVerifiedUser,
    authorUser: officialOwner,
    badgesMap,
  });
  assert.equal(badgeVerifiedOnOwner.allowed, true);

  // Official Owner CAN comment on their own posts
  const ownerOnOwner = canCommentOnPost({
    post: ownerPost,
    currentUser: officialOwner,
    authorUser: officialOwner,
    badgesMap,
  });
  assert.equal(ownerOnOwner.allowed, true);
});

test('4. Firestore security rules enforce backend commenting restriction, community isolation, and open follows/likes', () => {
  const rules = fs.readFileSync('firestore.rules', 'utf8');

  // Official owner verified-only comment enforcement on backend
  assert.match(rules, /function isTargetOfficialOwner\(uid\)/);
  assert.match(rules, /function isCallerPlatformVerified\(\)/);
  assert.match(
    rules,
    /!isTargetOfficialOwner\(get\(\/databases\/\$\(database\)\/documents\/posts\/\$\(postId\)\)\.data\.authorId\)/
  );

  // Community isolation enforcement on backend post creation and update
  assert.match(rules, /function isSpaceMember\(spaceId\)/);
  assert.match(rules, /incoming\(\)\.audience == 'space'/);
  assert.match(rules, /isSpaceMember\(incoming\(\)\.spaceId\)/);
  assert.match(rules, /existing\(\)\.audience == 'space'/);
  assert.match(rules, /incoming\(\)\.audience == 'space'/);

  // Non-founder protection against client spoofing official owner flags
  assert.match(
    rules,
    /!\('isOfficialOwner' in incoming\(\)\) \|\| incoming\(\)\.isOfficialOwner == false \|\| isFounderOwner\(\)/
  );

  // Likes & follows allow all authenticated email-verified active members (including unverified platform badge status)
  assert.match(
    rules,
    /match \/likes\/\{userId\}[\s\S]*?allow create: if isValidId\(postId\) && isValidId\(userId\) && isVerified\(\) && isOwner\(userId\)/
  );
  assert.match(
    rules,
    /match \/followers\/\{followerId\}[\s\S]*?allow create: if isValidId\(userId\) && isValidId\(followerId\)[\s\S]*?isVerified\(\)[\s\S]*?isOwner\(followerId\)/
  );
});

test('5. Service and UI layers enforce community isolation and official account safeguards', () => {
  const socialService = fs.readFileSync('src/services/firebase/socialService.ts', 'utf8');
  const postComposer = fs.readFileSync('src/features/posts/PostComposer.tsx', 'utf8');
  const postCard = fs.readFileSync('src/features/posts/PostCard.tsx', 'utf8');
  const profilePage = fs.readFileSync('src/pages/profile/ProfilePage.tsx', 'utf8');
  const homePage = fs.readFileSync('src/pages/home/HomePage.tsx', 'utf8');

  // Reposting Space posts is explicitly blocked in socialService & UI
  assert.match(socialService, /if \(isCommunityPost\(originalPost\)\)/);
  assert.match(socialService, /canCommentOnPost/);
  assert.match(socialService, /postIsCommunity \? 'spaces' : 'social'|category: notifCategory/);

  // Home/Create composer cannot create Space posts unless explicitly inside SpacesPage (defaultSpaceId)
  assert.equal(/Space: /.test(postComposer), false);

  // PostCard hides repost on community posts and shows verification gate for unverified users
  assert.match(postCard, /!postIsCommunity/);
  assert.match(postCard, /Verified Account Required to Comment/);
  assert.match(postCard, /Official Nexora/);

  // ProfilePage and HomePage filter timelines through isPersonalTimelinePost
  assert.match(profilePage, /posts\.filter\(isPersonalTimelinePost\)/);
  assert.match(homePage, /posts\.filter\(isPersonalTimelinePost\)/);
});

test('6. Legacy user/post counter updates and atomic like/save/follow transactions stay resilient', () => {
  const rules = fs.readFileSync('firestore.rules', 'utf8');
  const socialService = fs.readFileSync('src/services/firebase/socialService.ts', 'utf8');
  const postCard = fs.readFileSync('src/features/posts/PostCard.tsx', 'utf8');

  assert.match(rules, /function isValidUserCounterUpdate\(data\)/);
  assert.match(rules, /function isValidPostCounterUpdate\(data\)/);
  assert.match(rules, /affectedKeys\(\)\.hasOnly\(\['followersCount', 'updatedAt'\]\)\s*&& isValidUserCounterUpdate\(incoming\(\)\)/);
  assert.match(rules, /'followingCount', 'postsCount', 'isOnline', 'lastActiveAt', 'updatedAt'/);
  assert.match(rules, /'likesCount', 'commentsCount', 'repostsCount', 'savesCount', 'pollCounts', 'giftsCount', 'updatedAt'/);
  assert.match(rules, /\!\('followersCount' in existing\(\)\)/);

  // Verify togglePostLike and toggleSavePost use atomic runTransaction & Math.max(0, ...)
  assert.match(socialService, /export async function togglePostLike[\s\S]*?runTransaction\(db/);
  assert.match(socialService, /export async function toggleSavePost[\s\S]*?runTransaction\(db/);
  assert.match(socialService, /Math\.max\(0, currentLikes - 1\)/);
  assert.match(socialService, /Math\.max\(0, currentSaves - 1\)/);

  // PostCard guards overlapping like clicks
  assert.match(postCard, /const \[likeBusy, setLikeBusy\] = useState\(false\)/);
});
