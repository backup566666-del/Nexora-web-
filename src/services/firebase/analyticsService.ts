import {
  collection,
  doc,
  increment,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Unsubscribe,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from './config';
import { CreatorAnalyticsDaily, Post, UserProfile, Vibe } from '../../types/nexora';

export type AnalyticsRangePreset = '7d' | '30d' | '90d' | 'custom';

export interface AnalyticsDayBucket {
  dateKey: string;
  label: string;
  profileVisits: number;
  postImpressions: number;
  vibeViews: number;
  followersDelta: number;
}

export interface AggregatedCreatorAnalytics {
  totalProfileVisits: number;
  totalPostImpressions: number;
  totalVibeViews: number;
  totalLikes: number;
  totalComments: number;
  totalReposts: number;
  totalSaves: number;
  currentFollowers: number;
  netFollowersInRange: number;
  engagementRatePct: number;
  dailySeries: AnalyticsDayBucket[];
  topPosts: Post[];
  topVibes: Vibe[];
}

export function toUtcDateKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

const sessionRecordedEvents = new Set<string>();

async function incrementDailyMetric(
  targetUid: string,
  field: 'profileVisits' | 'postImpressions' | 'vibeViews' | 'followersDelta',
  delta: number
): Promise<void> {
  if (!targetUid) return;
  const dateKey = toUtcDateKey();
  const docId = `${targetUid}_${dateKey}`;
  const ref = doc(db, 'creator_analytics_daily', docId);
  try {
    await updateDoc(ref, {
      [field]: increment(delta),
      updatedAt: serverTimestamp(),
    });
  } catch {
    try {
      await setDoc(ref, {
        uid: targetUid,
        dateKey,
        profileVisits: field === 'profileVisits' ? Math.max(0, delta) : 0,
        postImpressions: field === 'postImpressions' ? Math.max(0, delta) : 0,
        vibeViews: field === 'vibeViews' ? Math.max(0, delta) : 0,
        followersDelta: field === 'followersDelta' ? delta : 0,
        updatedAt: serverTimestamp(),
      });
    } catch {
      // Analytics tracking must never disrupt primary user actions
    }
  }
}

export async function recordProfileVisit(targetUid: string, viewerUid?: string | null): Promise<void> {
  if (!targetUid || !viewerUid || targetUid === viewerUid) return;
  const key = `visit:${targetUid}:${toUtcDateKey()}`;
  if (sessionRecordedEvents.has(key)) return;
  sessionRecordedEvents.add(key);
  await incrementDailyMetric(targetUid, 'profileVisits', 1);
}

export async function recordPostImpression(
  authorUid: string,
  postId: string,
  viewerUid?: string | null
): Promise<void> {
  if (!authorUid || !postId || !viewerUid || authorUid === viewerUid) return;
  const key = `post_imp:${postId}:${toUtcDateKey()}`;
  if (sessionRecordedEvents.has(key)) return;
  sessionRecordedEvents.add(key);
  await incrementDailyMetric(authorUid, 'postImpressions', 1);
}

export async function recordVibeAnalyticsView(
  authorUid: string,
  vibeId: string,
  viewerUid?: string | null
): Promise<void> {
  if (!authorUid || !vibeId || !viewerUid || authorUid === viewerUid) return;
  const key = `vibe_view:${vibeId}:${toUtcDateKey()}`;
  if (sessionRecordedEvents.has(key)) return;
  sessionRecordedEvents.add(key);
  await incrementDailyMetric(authorUid, 'vibeViews', 1);
}

export function subscribeCreatorAnalyticsDaily(
  uid: string,
  callback: (rows: CreatorAnalyticsDaily[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'creator_analytics_daily'),
    where('uid', '==', uid),
    limit(120)
  );
  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs
        .map((d) => d.data() as CreatorAnalyticsDaily)
        .sort((a, b) => a.dateKey.localeCompare(b.dateKey));
      callback(rows);
    },
    () => callback([])
  );
}

function enumerateDateKeys(startKey: string, endKey: string): string[] {
  const out: string[] = [];
  const start = new Date(`${startKey}T00:00:00Z`);
  const end = new Date(`${endKey}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    return out;
  }
  const cursor = new Date(start);
  let guard = 0;
  while (cursor <= end && guard < 120) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    guard += 1;
  }
  return out;
}

export function resolveDateBounds(
  preset: AnalyticsRangePreset,
  customStart?: string,
  customEnd?: string,
  now = new Date()
): { startKey: string; endKey: string } {
  const endKey = customEnd && preset === 'custom' ? customEnd : toUtcDateKey(now);
  if (preset === 'custom' && customStart && customEnd && customStart <= customEnd) {
    return { startKey: customStart, endKey: customEnd };
  }
  const days = preset === '7d' ? 6 : preset === '90d' ? 89 : 29;
  const startDate = new Date(now);
  startDate.setUTCDate(startDate.getUTCDate() - days);
  return { startKey: toUtcDateKey(startDate), endKey };
}

export function aggregateCreatorAnalytics(params: {
  profile: UserProfile;
  dailyRows: CreatorAnalyticsDaily[];
  posts: Post[];
  vibes: Vibe[];
  preset: AnalyticsRangePreset;
  customStart?: string;
  customEnd?: string;
  now?: Date;
}): AggregatedCreatorAnalytics {
  const { startKey, endKey } = resolveDateBounds(
    params.preset,
    params.customStart,
    params.customEnd,
    params.now
  );

  const rowMap = new Map<string, CreatorAnalyticsDaily>();
  params.dailyRows.forEach((row) => {
    if (row.dateKey >= startKey && row.dateKey <= endKey) {
      rowMap.set(row.dateKey, row);
    }
  });

  const allKeys = enumerateDateKeys(startKey, endKey);
  const dailySeries: AnalyticsDayBucket[] = allKeys.map((dateKey) => {
    const row = rowMap.get(dateKey);
    return {
      dateKey,
      label: dateKey.slice(5),
      profileVisits: Math.max(0, row?.profileVisits || 0),
      postImpressions: Math.max(0, row?.postImpressions || 0),
      vibeViews: Math.max(0, row?.vibeViews || 0),
      followersDelta: row?.followersDelta || 0,
    };
  });

  const ownPosts = params.posts.filter((p) => p.authorId === params.profile.uid);
  const ownVibes = params.vibes.filter((v) => v.authorId === params.profile.uid);

  const postsInRange = ownPosts.filter((p) => {
    const ms = p.createdAt?.toMillis?.();
    if (!ms) return true;
    const key = toUtcDateKey(new Date(ms));
    return key >= startKey && key <= endKey;
  });

  const vibesInRange = ownVibes.filter((v) => {
    const ms = v.createdAt?.toMillis?.();
    if (!ms) return true;
    const key = toUtcDateKey(new Date(ms));
    return key >= startKey && key <= endKey;
  });

  const totalProfileVisits = dailySeries.reduce((s, d) => s + d.profileVisits, 0);
  const totalPostImpressions = dailySeries.reduce((s, d) => s + d.postImpressions, 0);
  const trackedVibeViews = dailySeries.reduce((s, d) => s + d.vibeViews, 0);
  const vibeModelViews = vibesInRange.reduce((s, v) => s + (v.viewsCount || 0), 0);
  const totalVibeViews = Math.max(trackedVibeViews, vibeModelViews);
  const netFollowersInRange = dailySeries.reduce((s, d) => s + d.followersDelta, 0);

  const totalLikes =
    postsInRange.reduce((s, p) => s + (p.likesCount || 0), 0) +
    vibesInRange.reduce((s, v) => s + (v.likesCount || 0), 0);
  const totalComments =
    postsInRange.reduce((s, p) => s + (p.commentsCount || 0), 0) +
    vibesInRange.reduce((s, v) => s + (v.commentsCount || 0), 0);
  const totalReposts =
    postsInRange.reduce((s, p) => s + (p.repostsCount || 0), 0) +
    vibesInRange.reduce((s, v) => s + (v.repostsCount || 0), 0);
  const totalSaves =
    postsInRange.reduce((s, p) => s + (p.savesCount || 0), 0) +
    vibesInRange.reduce((s, v) => s + (v.savesCount || 0), 0);

  const reachBaseline = totalPostImpressions + totalVibeViews + totalProfileVisits;
  const totalInteractions = totalLikes + totalComments + totalReposts + totalSaves;
  const engagementRatePct =
    reachBaseline > 0 ? Number(((totalInteractions / reachBaseline) * 100).toFixed(1)) : 0;

  const topPosts = [...postsInRange]
    .sort((a, b) => {
      const scoreA = (a.likesCount || 0) + (a.commentsCount || 0) * 2 + (a.repostsCount || 0) * 2 + (a.savesCount || 0);
      const scoreB = (b.likesCount || 0) + (b.commentsCount || 0) * 2 + (b.repostsCount || 0) * 2 + (b.savesCount || 0);
      return scoreB - scoreA;
    })
    .slice(0, 5);

  const topVibes = [...vibesInRange]
    .sort((a, b) => (b.viewsCount || 0) + (b.likesCount || 0) * 2 - ((a.viewsCount || 0) + (a.likesCount || 0) * 2))
    .slice(0, 5);

  return {
    totalProfileVisits,
    totalPostImpressions,
    totalVibeViews,
    totalLikes,
    totalComments,
    totalReposts,
    totalSaves,
    currentFollowers: params.profile.followersCount || 0,
    netFollowersInRange,
    engagementRatePct,
    dailySeries,
    topPosts,
    topVibes,
  };
}
