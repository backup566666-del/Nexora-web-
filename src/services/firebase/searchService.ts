import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { db } from './config';
import {
  Post,
  Space,
  SpaceDiscussion,
  UserProfile,
  Vibe,
} from '../../types/nexora';
import {
  computePostEngagementScore,
  filterSearchablePosts,
  filterSearchableSpaces,
  filterSearchableUsers,
} from '../../utils/validation';

export type SearchResultCategory =
  | 'all'
  | 'people'
  | 'posts'
  | 'vibes'
  | 'spaces'
  | 'topics'
  | 'discussions'
  | 'polls';

export interface SearchDiscoveryBundle {
  people: UserProfile[];
  posts: Post[];
  vibes: Vibe[];
  spaces: Space[];
  topics: Array<{ tag: string; count: number; engagement: number }>;
  discussions: Array<SpaceDiscussion & { spaceId: string; spaceName: string }>;
  polls: Post[];
}

export async function loadSearchableCorpus(params: {
  viewerUid: string;
  blockedUserIds: string[];
  followingIds: Set<string>;
  directoryUsers: UserProfile[];
  feedPosts: Post[];
  spaces: Space[];
}): Promise<{
  users: UserProfile[];
  posts: Post[];
  vibes: Vibe[];
  spaces: Space[];
  discussions: Array<SpaceDiscussion & { spaceId: string; spaceName: string }>;
  joinedSpaceIds: string[];
}> {
  // Resolve which spaces the viewer has joined to safely filter private space items
  const joinedSpaceIds: string[] = [];
  await Promise.all(
    params.spaces.slice(0, 30).map(async (s) => {
      if (s.ownerId === params.viewerUid) {
        joinedSpaceIds.push(s.id);
        return;
      }
      if (!s.isPrivate) {
        joinedSpaceIds.push(s.id);
        return;
      }
      try {
        const memSnap = await getDocs(
          query(collection(db, 'spaces', s.id, 'members'), where('uid', '==', params.viewerUid), limit(1))
        );
        if (!memSnap.empty) joinedSpaceIds.push(s.id);
      } catch {
        // Not a member or inaccessible private space
      }
    })
  );

  // Pull Vibes safely
  let rawVibes: Vibe[] = [];
  try {
    const vSnap = await getDocs(
      query(collection(db, 'vibes'), where('viewsCount', '>=', 0), orderBy('createdAt', 'desc'), limit(40))
    );
    rawVibes = vSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Vibe, 'id'>) }));
  } catch {
    rawVibes = [];
  }

  // Pull recent Space discussions only from public active spaces or spaces the user joined
  const accessibleSpaces = filterSearchableSpaces(params.spaces, params.viewerUid, joinedSpaceIds);
  const discussions: Array<SpaceDiscussion & { spaceId: string; spaceName: string }> = [];
  await Promise.all(
    accessibleSpaces
      .filter((s) => joinedSpaceIds.includes(s.id) || !s.isPrivate)
      .slice(0, 6)
      .map(async (s) => {
        try {
          const dSnap = await getDocs(
            query(collection(db, 'spaces', s.id, 'discussions'), orderBy('createdAt', 'desc'), limit(15))
          );
          dSnap.docs.forEach((docItem) => {
            const d = docItem.data() as Omit<SpaceDiscussion, 'id'>;
            if (!params.blockedUserIds.includes(d.authorId)) {
              discussions.push({
                id: docItem.id,
                ...d,
                spaceId: s.id,
                spaceName: s.name,
              });
            }
          });
        } catch {
          // Skip spaces where discussions require membership
        }
      })
  );

  const suspendedUids = new Set(
    params.directoryUsers.filter((u) => u.suspended).map((u) => u.uid)
  );
  const privateSpaceIds = new Set(
    params.spaces.filter((s) => s.isPrivate).map((s) => s.id)
  );
  const followingArray = Array.from(params.followingIds);

  const safeUsers = filterSearchableUsers(
    params.directoryUsers,
    params.viewerUid,
    params.blockedUserIds,
    followingArray
  );

  const safePosts = filterSearchablePosts(
    params.feedPosts,
    params.viewerUid,
    params.blockedUserIds,
    followingArray,
    joinedSpaceIds,
    privateSpaceIds,
    suspendedUids
  );

  const blockedSet = new Set(params.blockedUserIds);
  const safeVibes = rawVibes.filter(
    (v) => !blockedSet.has(v.authorId) && !suspendedUids.has(v.authorId)
  );

  return {
    users: safeUsers,
    posts: safePosts,
    vibes: safeVibes,
    spaces: accessibleSpaces,
    discussions,
    joinedSpaceIds,
  };
}

export function executeDiscoverySearch(params: {
  queryText: string;
  users: UserProfile[];
  posts: Post[];
  vibes: Vibe[];
  spaces: Space[];
  discussions: Array<SpaceDiscussion & { spaceId: string; spaceName: string }>;
  sortMode: 'relevance' | 'recent' | 'popular';
}): SearchDiscoveryBundle {
  const q = params.queryText.trim().toLowerCase().replace(/^[@#]/, '');

  const matchText = (val: string | undefined | null) =>
    !q || (val || '').toLowerCase().includes(q);

  let people = params.users.filter(
    (u) =>
      matchText(u.displayName) ||
      matchText(u.username) ||
      matchText(u.bio) ||
      (u.interests || []).some((i) => matchText(i))
  );

  let posts = params.posts.filter(
    (p) =>
      matchText(p.text) ||
      matchText(p.authorName) ||
      matchText(p.authorUsername) ||
      (p.hashtags || []).some((h) => matchText(h)) ||
      (p.pollOptions || []).some((o) => matchText(o))
  );

  let vibes = params.vibes.filter(
    (v) =>
      matchText(v.caption) ||
      matchText(v.authorName) ||
      matchText(v.authorUsername) ||
      matchText(v.audioTrack) ||
      (v.hashtags || []).some((h) => matchText(h))
  );

  let spaces = params.spaces.filter(
    (s) =>
      matchText(s.name) ||
      matchText(s.description) ||
      matchText(s.category)
  );

  const discussions = params.discussions.filter(
    (d) => matchText(d.text) || matchText(d.authorName) || matchText(d.spaceName)
  );

  const topicMap = new Map<string, { count: number; engagement: number }>();
  params.posts.forEach((p) => {
    const score = computePostEngagementScore(p);
    (p.hashtags || []).forEach((tag) => {
      const key = tag.toLowerCase();
      if (!q || key.includes(q)) {
        const cur = topicMap.get(key) || { count: 0, engagement: 0 };
        cur.count += 1;
        cur.engagement += score + 1;
        topicMap.set(key, cur);
      }
    });
  });
  params.vibes.forEach((v) => {
    const score = (v.likesCount || 0) + (v.viewsCount || 0);
    (v.hashtags || []).forEach((tag) => {
      const key = tag.toLowerCase();
      if (!q || key.includes(q)) {
        const cur = topicMap.get(key) || { count: 0, engagement: 0 };
        cur.count += 1;
        cur.engagement += score + 1;
        topicMap.set(key, cur);
      }
    });
  });

  const topics = Array.from(topicMap.entries())
    .map(([tag, stats]) => ({ tag, ...stats }))
    .sort((a, b) => b.engagement - a.engagement || b.count - a.count);

  if (params.sortMode === 'popular') {
    people = [...people].sort((a, b) => (b.followersCount || 0) - (a.followersCount || 0));
    posts = [...posts].sort((a, b) => computePostEngagementScore(b) - computePostEngagementScore(a));
    vibes = [...vibes].sort((a, b) => (b.viewsCount || 0) - (a.viewsCount || 0));
    spaces = [...spaces].sort((a, b) => (b.membersCount || 0) - (a.membersCount || 0));
  } else if (params.sortMode === 'recent') {
    posts = [...posts].sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
    vibes = [...vibes].sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
    spaces = [...spaces].sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
  } else if (q) {
    // Relevance boost for exact username/name prefix matches
    people = [...people].sort((a, b) => {
      const aExact = a.username.toLowerCase().startsWith(q) || a.displayName.toLowerCase().startsWith(q) ? 1 : 0;
      const bExact = b.username.toLowerCase().startsWith(q) || b.displayName.toLowerCase().startsWith(q) ? 1 : 0;
      return bExact - aExact || (b.followersCount || 0) - (a.followersCount || 0);
    });
  } else {
    people = [...people].sort((a, b) => (b.followersCount || 0) - (a.followersCount || 0));
  }

  const polls = posts.filter((p) => p.type === 'poll' || (p.pollOptions && p.pollOptions.length >= 2));

  return { people, posts, vibes, spaces, topics, discussions, polls };
}
