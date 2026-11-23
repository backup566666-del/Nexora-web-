import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BarChart3,
  Eye,
  Film,
  Heart,
  MessageSquare,
  Repeat2,
  TrendingUp,
  Users,
} from 'lucide-react';
import { CreatorAnalyticsDaily, NavSection, Post, UserProfile, Vibe } from '../../types/nexora';
import {
  aggregateCreatorAnalytics,
  AnalyticsRangePreset,
  subscribeCreatorAnalyticsDaily,
  toUtcDateKey,
} from '../../services/firebase/analyticsService';
import { subscribeVibes } from '../../services/firebase/socialService';
import { formatCompactCount } from '../../utils/validation';

interface CreatorAnalyticsPageProps {
  profile: UserProfile;
  feedPosts: Post[];
  onNavigate: (section: NavSection, targetId?: string) => void;
}

export const CreatorAnalyticsPage: React.FC<CreatorAnalyticsPageProps> = ({
  profile,
  feedPosts,
  onNavigate,
}) => {
  const [dailyRows, setDailyRows] = useState<CreatorAnalyticsDaily[]>([]);
  const [vibes, setVibes] = useState<Vibe[]>([]);
  const [preset, setPreset] = useState<AnalyticsRangePreset>('30d');
  const [customStart, setCustomStart] = useState(() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 14);
    return toUtcDateKey(d);
  });
  const [customEnd, setCustomEnd] = useState(() => toUtcDateKey());

  useEffect(() => {
    const u1 = subscribeCreatorAnalyticsDaily(profile.uid, setDailyRows);
    const u2 = subscribeVibes(setVibes);
    return () => {
      u1();
      u2();
    };
  }, [profile.uid]);

  const summary = useMemo(
    () =>
      aggregateCreatorAnalytics({
        profile,
        dailyRows,
        posts: feedPosts,
        vibes,
        preset,
        customStart,
        customEnd,
      }),
    [profile, dailyRows, feedPosts, vibes, preset, customStart, customEnd]
  );

  // Compute SVG polyline coordinates for daily reach (visits + post impressions + vibe views)
  const chartPoints = useMemo(() => {
    const series = summary.dailySeries;
    if (series.length === 0) return { width: 640, height: 180, linePath: '', areaPath: '', maxVal: 1 };
    const width = 640;
    const height = 180;
    const padX = 12;
    const padY = 16;
    const totals = series.map((d) => d.profileVisits + d.postImpressions + d.vibeViews);
    const maxVal = Math.max(1, ...totals);
    const stepX = series.length > 1 ? (width - padX * 2) / (series.length - 1) : 0;

    const coords = totals.map((val, idx) => {
      const x = padX + idx * stepX;
      const y = height - padY - (val / maxVal) * (height - padY * 2);
      return { x, y, val };
    });

    const linePath = coords.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`).join(' ');
    const areaPath =
      coords.length > 0
        ? `${linePath} L ${coords[coords.length - 1].x.toFixed(1)} ${(height - padY).toFixed(1)} L ${coords[0].x.toFixed(1)} ${(height - padY).toFixed(1)} Z`
        : '';

    return { width, height, linePath, areaPath, maxVal };
  }, [summary.dailySeries]);

  const kpis = [
    {
      label: 'Profile Visits',
      value: formatCompactCount(summary.totalProfileVisits),
      sub: 'Aggregate period visits',
      icon: Users,
    },
    {
      label: 'Post Impressions',
      value: formatCompactCount(summary.totalPostImpressions),
      sub: 'Feed & discovery views',
      icon: Eye,
    },
    {
      label: 'Vibe Views',
      value: formatCompactCount(summary.totalVibeViews),
      sub: 'Total short-video plays',
      icon: Film,
    },
    {
      label: 'Followers',
      value: formatCompactCount(summary.currentFollowers),
      sub:
        summary.netFollowersInRange !== 0
          ? `${summary.netFollowersInRange > 0 ? '+' : ''}${summary.netFollowersInRange} in range`
          : 'Current audience total',
      icon: TrendingUp,
    },
    {
      label: 'Likes Received',
      value: formatCompactCount(summary.totalLikes),
      sub: `${summary.totalSaves} saves`,
      icon: Heart,
    },
    {
      label: 'Comments & Replies',
      value: formatCompactCount(summary.totalComments),
      sub: `${summary.totalReposts} reposts`,
      icon: MessageSquare,
    },
  ];

  return (
    <div className="space-y-5">
      {/* Header & Date Filter Controls */}
      <section className="rounded-2xl bg-[#0D0B16] border border-[#8B5CF6]/20 p-5 sm:p-6 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-[#7C3AED]/20 border border-[#8B5CF6]/30 flex items-center justify-center text-[#C084FC]">
                <BarChart3 size={18} />
              </div>
              <h1 className="font-display text-xl sm:text-2xl font-bold text-white">
                Creator Analytics
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-[#94A3B8]">
              Live performance insights for @{profile.username} across your Posts, Vibes, and profile reach.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {([
              { id: '7d', label: '7 Days' },
              { id: '30d', label: '30 Days' },
              { id: '90d', label: '90 Days' },
              { id: 'custom', label: 'Custom' },
            ] as const).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setPreset(opt.id)}
                className={`min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                  preset === opt.id
                    ? 'bg-[#7C3AED] text-white'
                    : 'bg-[#120F1E] border border-white/10 text-[#94A3B8] hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {preset === 'custom' && (
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <label className="flex items-center gap-2 text-xs text-[#CBD5E1]">
              <span>From</span>
              <input
                type="date"
                value={customStart}
                max={customEnd}
                onChange={(e) => setCustomStart(e.target.value)}
                className="min-h-[40px] rounded-xl bg-[#120F1E] border border-white/10 px-3 text-xs text-white"
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-[#CBD5E1]">
              <span>To</span>
              <input
                type="date"
                value={customEnd}
                min={customStart}
                max={toUtcDateKey()}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="min-h-[40px] rounded-xl bg-[#120F1E] border border-white/10 px-3 text-xs text-white"
              />
            </label>
          </div>
        )}
      </section>

      {/* Primary KPI Grid */}
      <section className="grid grid-cols-2 lg:grid-cols-3 gap-3.5">
        {kpis.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.label}
              className="rounded-2xl bg-[#0D0B16] border border-[#8B5CF6]/15 p-4 sm:p-5 space-y-2"
            >
              <div className="flex items-center justify-between text-[#94A3B8]">
                <span className="text-xs font-medium">{item.label}</span>
                <Icon size={15} className="text-[#C084FC]" />
              </div>
              <p className="font-mono-tabular text-2xl sm:text-3xl font-bold text-white">
                {item.value}
              </p>
              <p className="text-[11px] text-[#64748B]">{item.sub}</p>
            </div>
          );
        })}
      </section>

      {/* Reach & Engagement Trend Chart */}
      <section className="rounded-2xl bg-[#0D0B16] border border-[#8B5CF6]/15 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-base font-semibold text-white flex items-center gap-2">
              <Activity size={16} className="text-[#C084FC]" />
              Daily Reach & Content Impressions
            </h2>
            <p className="text-xs text-[#94A3B8]">
              Combined profile visits, post impressions, and Vibe views (Engagement rate:{' '}
              <span className="font-mono-tabular text-white font-semibold">{summary.engagementRatePct}%</span>)
            </p>
          </div>
          <div className="text-xs font-mono-tabular text-[#94A3B8]">
            {summary.dailySeries[0]?.dateKey} — {summary.dailySeries[summary.dailySeries.length - 1]?.dateKey}
          </div>
        </div>

        <div className="w-full overflow-x-auto">
          <svg
            viewBox={`0 0 ${chartPoints.width} ${chartPoints.height}`}
            className="w-full h-44 min-w-[360px]"
            role="img"
            aria-label="Creator reach over time chart"
          >
            <defs>
              <linearGradient id="nexoraReachFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0.02" />
              </linearGradient>
            </defs>
            <line x1="12" y1="45" x2="628" y2="45" stroke="rgba(255,255,255,0.06)" strokeDasharray="4 4" />
            <line x1="12" y1="105" x2="628" y2="105" stroke="rgba(255,255,255,0.06)" strokeDasharray="4 4" />
            <line x1="12" y1="164" x2="628" y2="164" stroke="rgba(255,255,255,0.1)" />
            {chartPoints.areaPath && <path d={chartPoints.areaPath} fill="url(#nexoraReachFill)" />}
            {chartPoints.linePath && (
              <path
                d={chartPoints.linePath}
                fill="none"
                stroke="#C084FC"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
          </svg>
        </div>
      </section>

      {/* Top Performing Content Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="rounded-2xl bg-[#0D0B16] border border-[#8B5CF6]/15 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold text-white">Top Performing Posts</h2>
            <button
              type="button"
              onClick={() => onNavigate('profile')}
              className="text-xs text-[#C084FC] hover:underline"
            >
              View Profile
            </button>
          </div>
          {summary.topPosts.length === 0 ? (
            <p className="text-xs text-[#64748B] py-6 text-center">
              Publish posts in this date range to see top-performing updates.
            </p>
          ) : (
            <div className="space-y-2.5">
              {summary.topPosts.map((post, index) => (
                <div
                  key={post.id}
                  className="p-3.5 rounded-xl bg-[#120F1E] border border-white/[0.06] space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2 text-[11px] text-[#94A3B8]">
                    <span className="font-mono-tabular font-semibold text-[#C084FC]">#{index + 1}</span>
                    <span className="font-mono-tabular">
                      {post.likesCount} likes · {post.commentsCount} comments · {post.repostsCount} reposts
                    </span>
                  </div>
                  <p className="text-xs text-white line-clamp-2">{post.text || 'Media update'}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl bg-[#0D0B16] border border-[#8B5CF6]/15 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold text-white">Top Performing Vibes</h2>
            <button
              type="button"
              onClick={() => onNavigate('vibes')}
              className="text-xs text-[#C084FC] hover:underline"
            >
              Open Vibes
            </button>
          </div>
          {summary.topVibes.length === 0 ? (
            <p className="text-xs text-[#64748B] py-6 text-center">
              Share Vibes in this date range to track video views and reactions.
            </p>
          ) : (
            <div className="space-y-2.5">
              {summary.topVibes.map((vibe, index) => (
                <button
                  key={vibe.id}
                  type="button"
                  onClick={() => onNavigate('vibes', vibe.id)}
                  className="w-full p-3.5 rounded-xl bg-[#120F1E] border border-white/[0.06] hover:border-[#8B5CF6]/35 text-left space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2 text-[11px] text-[#94A3B8]">
                    <span className="font-mono-tabular font-semibold text-[#C084FC]">#{index + 1}</span>
                    <span className="font-mono-tabular inline-flex items-center gap-2">
                      <span>{formatCompactCount(vibe.viewsCount)} views</span>
                      <span>{vibe.likesCount} likes</span>
                      <Repeat2 size={11} /> {vibe.repostsCount}
                    </span>
                  </div>
                  <p className="text-xs text-white line-clamp-1">{vibe.caption || 'Untitled Vibe'}</p>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
