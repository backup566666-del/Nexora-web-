import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowUpRight,
  Award,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Gift,
  History,
  Loader2,
  RefreshCw,
  Send,
  Share2,
  Sparkles,
  UserPlus,
  Users,
  Wallet,
  X,
  XCircle,
} from 'lucide-react';
import { extractReadableErrorMessage } from '../../services/firebase/errorHandler';
import {
  buildReferralShareUrl,
  ensurePersonalInvitationCode,
  seedStarterTasksIfEmpty,
  submitFreeTaskProof,
} from '../../services/firebase/rewardsService';
import {
  InvitationRecord,
  NavSection,
  ProfileContentTab,
  ReferralClaim,
  RewardsConfig,
  TaskItem,
  TaskSubmission,
  UserProfile,
  WalletAccount,
} from '../../types/nexora';
import {
  computeConvertedNaira,
  evaluateStarterTaskReadiness,
  formatNaira,
  formatRelativeTime,
} from '../../utils/validation';

interface ProfileTasksPanelProps {
  profile: UserProfile;
  tasks: TaskItem[];
  submissions: TaskSubmission[];
  wallet: WalletAccount;
  rewardsConfig: RewardsConfig;
  invitations: InvitationRecord[];
  referralClaims: ReferralClaim[];
  postsCount: number;
  followingCount: number;
  joinedSpacesCount: number;
  onEditProfile: () => void;
  onNavigate?: (
    section: NavSection,
    targetId?: string,
    profileTab?: ProfileContentTab
  ) => void;
  onNotify?: (message: string) => void;
}

const TASK_CATEGORIES: Array<{ id: 'all' | TaskItem['category']; label: string }> = [
  { id: 'all', label: 'All Tasks' },
  { id: 'onboarding', label: 'Onboarding' },
  { id: 'content', label: 'Content' },
  { id: 'community', label: 'Community' },
  { id: 'engagement', label: 'Engagement' },
  { id: 'social', label: 'Invites & Social' },
];

export function ProfileTasksPanel({
  profile,
  tasks,
  submissions,
  wallet,
  rewardsConfig,
  invitations,
  referralClaims,
  postsCount,
  followingCount,
  joinedSpacesCount,
  onEditProfile,
  onNavigate,
  onNotify,
}: ProfileTasksPanelProps) {
  const [categoryFilter, setCategoryFilter] = useState<'all' | TaskItem['category']>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'submitted'>('all');

  const [seedingTasks, setSeedingTasks] = useState(false);
  const [seedTriedOnce, setSeedTriedOnce] = useState(false);

  const [inviteProvisioning, setInviteProvisioning] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [localInviteFallback, setLocalInviteFallback] = useState<InvitationRecord | null>(null);
  const [copiedType, setCopiedType] = useState<'code' | 'url' | null>(null);

  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);
  const [proofText, setProofText] = useState('');
  const [proofUrl, setProofUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const personalInvite = useMemo(
    () => invitations.find((i) => i.kind === 'personal') || localInviteFallback,
    [invitations, localInviteFallback]
  );

  // Auto-seed starter tasks once if no tasks exist yet
  useEffect(() => {
    if (!profile?.uid || tasks.length > 0 || seedTriedOnce) return;
    setSeedTriedOnce(true);
    setSeedingTasks(true);
    void seedStarterTasksIfEmpty(profile).finally(() => {
      setSeedingTasks(false);
    });
  }, [profile?.uid, tasks.length, seedTriedOnce]);

  // Auto-provision personal invite code if missing
  useEffect(() => {
    if (!profile?.uid || personalInvite || inviteProvisioning) return;
    let cancelled = false;
    setInviteProvisioning(true);
    setInviteError('');
    void ensurePersonalInvitationCode(profile)
      .then((rec) => {
        if (!cancelled && rec) {
          setLocalInviteFallback(rec);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setInviteError(
            extractReadableErrorMessage(err, 'Unable to initialize your personal invitation link.')
          );
        }
      })
      .finally(() => {
        if (!cancelled) setInviteProvisioning(false);
      });
    return () => {
      cancelled = true;
    };
  }, [profile?.uid, personalInvite]);

  const handleRetryInviteCode = async () => {
    setInviteProvisioning(true);
    setInviteError('');
    try {
      const rec = await ensurePersonalInvitationCode(profile);
      if (rec) setLocalInviteFallback(rec);
    } catch (err) {
      setInviteError(
        extractReadableErrorMessage(err, 'Unable to generate your personal invitation link.')
      );
    } finally {
      setInviteProvisioning(false);
    }
  };

  const handleManualSeedTasks = async () => {
    setSeedingTasks(true);
    setFeedback(null);
    try {
      const count = await seedStarterTasksIfEmpty(profile);
      setFeedback({
        type: 'ok',
        text:
          count > 0
            ? `Loaded ${count} starter earning task${count === 1 ? '' : 's'}.`
            : 'Free starter tasks are up to date.',
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: extractReadableErrorMessage(err, 'Could not load starter tasks right now.'),
      });
    } finally {
      setSeedingTasks(false);
    }
  };

  const submissionByTaskId = useMemo(() => {
    const map: Record<string, TaskSubmission> = {};
    submissions.forEach((s) => {
      map[s.taskId] = s;
    });
    return map;
  }, [submissions]);

  const activeTasks = useMemo(
    () => tasks.filter((t) => t.active && t.freeToParticipate),
    [tasks]
  );

  const qualifiedReferrals = useMemo(
    () => referralClaims.filter((c) => c.status === 'qualified').length,
    [referralClaims]
  );

  const pendingReferrals = useMemo(
    () => referralClaims.filter((c) => c.status === 'pending' || c.status === 'flagged').length,
    [referralClaims]
  );

  const referralsPerPoint = Math.max(1, rewardsConfig.referralsPerPoint || 10);
  const currentCycleProgress = qualifiedReferrals % referralsPerPoint;
  const progressPct = Math.round((currentCycleProgress / referralsPerPoint) * 100);
  const referralUrl = personalInvite ? buildReferralShareUrl(personalInvite.code) : '';

  const filteredTasks = useMemo(() => {
    return activeTasks.filter((t) => {
      if (categoryFilter !== 'all' && t.category !== categoryFilter) return false;
      const submitted = Boolean(submissionByTaskId[t.id]);
      if (statusFilter === 'open' && submitted) return false;
      if (statusFilter === 'submitted' && !submitted) return false;
      return true;
    });
  }, [activeTasks, categoryFilter, statusFilter, submissionByTaskId]);

  const earnedFromTasks = useMemo(
    () =>
      submissions
        .filter((s) => s.status === 'approved')
        .reduce((sum, s) => sum + Number(s.rewardPoints || 0), 0),
    [submissions]
  );

  const pendingTaskPoints = useMemo(
    () =>
      submissions
        .filter((s) => s.status === 'pending')
        .reduce((sum, s) => sum + Number(s.rewardPoints || 0), 0),
    [submissions]
  );

  const nairaBalance = computeConvertedNaira(wallet.availablePoints, rewardsConfig.pointRateNaira);

  const handleCopy = async (text: string, type: 'code' | 'url') => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedType(type);
      onNotify?.(type === 'code' ? 'Invitation code copied!' : 'Invitation link copied!');
      setTimeout(() => setCopiedType(null), 2000);
    } catch {
      setFeedback({ type: 'err', text: 'Clipboard permission denied. Please copy manually.' });
    }
  };

  const handleNativeShare = async () => {
    if (!referralUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join me on Nexora',
          text: `Join Nexora with my invitation code ${personalInvite?.code}`,
          url: referralUrl,
        });
        return;
      } catch {
        // User cancelled or share unsupported
      }
    }
    await handleCopy(referralUrl, 'url');
  };

  const handleOpenProofModal = (task: TaskItem, suggestedProof?: string) => {
    setSelectedTask(task);
    setProofText(suggestedProof || '');
    setProofUrl('');
    setFeedback(null);
  };

  const handleStarterQuickAction = async (
    actionType: 'edit_profile' | 'create_post' | 'open_spaces' | 'open_home' | 'copy_invite'
  ) => {
    if (actionType === 'edit_profile') {
      onEditProfile();
    } else if (actionType === 'create_post') {
      onNavigate?.('create');
    } else if (actionType === 'open_spaces') {
      onNavigate?.('spaces');
    } else if (actionType === 'open_home') {
      onNavigate?.('home');
    } else if (actionType === 'copy_invite') {
      if (referralUrl) {
        await handleCopy(referralUrl, 'url');
      } else {
        await handleRetryInviteCode();
      }
    }
  };

  const handleSubmitProof = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTask) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      await submitFreeTaskProof(profile, selectedTask, proofText, proofUrl);
      setSelectedTask(null);
      setProofText('');
      setProofUrl('');
      setFeedback({
        type: 'ok',
        text: `Submitted "${selectedTask.title}" (+${selectedTask.rewardPoints} KP pending verification).`,
      });
      onNotify?.('Task proof submitted for verification!');
    } catch (err) {
      setFeedback({
        type: 'err',
        text: extractReadableErrorMessage(err, 'Unable to submit task proof.'),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      {feedback && (
        <div
          className={`flex items-center justify-between gap-3 px-4 py-3 rounded-xl border text-xs ${
            feedback.type === 'ok'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-200'
          }`}
        >
          <span className="flex items-center gap-2">
            {feedback.type === 'ok' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
            <span>{feedback.text}</span>
          </span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="p-1 rounded-lg hover:bg-white/10"
            aria-label="Dismiss notice"
          >
            <X size={13} />
          </button>
        </div>
      )}

      {/* Top Grid: Wallet Earning Summary + Personal Invitation Card */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Wallet Balance & Quick Links */}
        <section className="lg:col-span-5 rounded-2xl bg-[#0E0B1A] border border-white/[0.08] p-4 sm:p-5 flex flex-col justify-between gap-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                  <Wallet size={15} className="text-emerald-300" />
                </div>
                <div>
                  <h3 className="font-display text-sm font-semibold text-white">
                    Key Points Balance
                  </h3>
                  <p className="text-[11px] text-[#94A3B8]">
                    {nairaBalance !== null
                      ? `Est. value: ${formatNaira(nairaBalance)}`
                      : 'Naira rate configured by Owner'}
                  </p>
                </div>
              </div>
              {onNavigate && (
                <button
                  type="button"
                  onClick={() => onNavigate('wallet')}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-[11px] font-medium text-[#E2E8F0] whitespace-nowrap"
                >
                  <span>Open Wallet</span>
                  <ArrowUpRight size={12} />
                </button>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2.5 pt-1">
              <div className="rounded-xl bg-[#08070F] border border-white/[0.06] p-3">
                <p className="text-[10px] text-[#94A3B8]">Available</p>
                <p className="font-mono-tabular text-lg font-bold text-white mt-0.5">
                  {wallet.availablePoints}{' '}
                  <span className="text-[11px] font-medium text-emerald-300">KP</span>
                </p>
              </div>
              <div className="rounded-xl bg-[#08070F] border border-white/[0.06] p-3">
                <p className="text-[10px] text-[#94A3B8]">Pending</p>
                <p className="font-mono-tabular text-lg font-bold text-amber-300 mt-0.5">
                  {pendingTaskPoints}{' '}
                  <span className="text-[11px] font-medium text-[#94A3B8]">KP</span>
                </p>
              </div>
              <div className="rounded-xl bg-[#08070F] border border-white/[0.06] p-3">
                <p className="text-[10px] text-[#94A3B8]">Tasks Won</p>
                <p className="font-mono-tabular text-lg font-bold text-[#C084FC] mt-0.5">
                  {earnedFromTasks}{' '}
                  <span className="text-[11px] font-medium text-[#94A3B8]">KP</span>
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/[0.06] text-[11px] text-[#94A3B8]">
            <span>Min withdrawal: {formatNaira(rewardsConfig.minWithdrawalNaira)}</span>
            {onNavigate && (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => onNavigate('tasks')}
                  className="text-[#C084FC] hover:text-white font-medium whitespace-nowrap"
                >
                  Full Tasks Page
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('rewards-history')}
                  className="inline-flex items-center gap-1 text-[#CBD5E1] hover:text-white font-medium whitespace-nowrap"
                >
                  <History size={11} />
                  <span>History</span>
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Personal Invitation & 10-Referral Milestone Card */}
        <section className="lg:col-span-7 rounded-2xl bg-gradient-to-br from-[#120E24] via-[#0D0B18] to-[#0A131A] border border-[#8B5CF6]/25 p-4 sm:p-5 flex flex-col justify-between gap-4">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[#7C3AED]/20 border border-[#8B5CF6]/35 flex items-center justify-center">
                  <UserPlus size={15} className="text-[#C084FC]" />
                </div>
                <div>
                  <h3 className="font-display text-sm font-semibold text-white">
                    Invite Friends &amp; Earn Key Points
                  </h3>
                  <p className="text-[11px] text-[#94A3B8]">
                    Earn {rewardsConfig.pointsPerMilestone || 1} Key Point per{' '}
                    {referralsPerPoint} qualified registrations
                  </p>
                </div>
              </div>
              {onNavigate && (
                <button
                  type="button"
                  onClick={() => onNavigate('invite')}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#7C3AED]/20 hover:bg-[#7C3AED]/30 border border-[#8B5CF6]/35 text-[11px] font-semibold text-[#E9D5FF] whitespace-nowrap"
                >
                  <span>Invite Dashboard</span>
                  <ArrowUpRight size={12} />
                </button>
              )}
            </div>

            {inviteError ? (
              <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-200">
                <span>{inviteError}</span>
                <button
                  type="button"
                  onClick={() => void handleRetryInviteCode()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 font-semibold text-white whitespace-nowrap"
                >
                  <RefreshCw size={12} /> Retry
                </button>
              </div>
            ) : personalInvite ? (
              <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
                <div className="flex-1 min-w-0 px-3 py-2.5 rounded-xl bg-[#07060D] border border-white/10 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[10px] text-[#94A3B8]">Personal Referral Link</p>
                    <p className="font-mono-tabular text-xs font-semibold text-white truncate">
                      {referralUrl}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleCopy(personalInvite.code, 'code')}
                    className="shrink-0 px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-[11px] font-mono-tabular font-semibold text-[#E9D5FF]"
                    title="Copy referral code"
                  >
                    {copiedType === 'code' ? 'Copied!' : personalInvite.code}
                  </button>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => void handleCopy(referralUrl, 'url')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-[#6D28D9] to-[#7C3AED] hover:opacity-95 text-xs font-semibold text-white whitespace-nowrap min-h-[40px]"
                  >
                    {copiedType === 'url' ? <Check size={13} /> : <Copy size={13} />}
                    <span>{copiedType === 'url' ? 'Copied' : 'Copy Link'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleNativeShare()}
                    className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-xs font-medium text-white whitespace-nowrap min-h-[40px]"
                    title="Share referral link"
                  >
                    <Share2 size={13} />
                    <span className="hidden sm:inline">Share</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3 px-3.5 py-3 rounded-xl bg-[#07060D] border border-white/10 text-xs text-[#94A3B8]">
                <span className="flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin text-[#C084FC]" />
                  <span>Provisioning your unique invitation link...</span>
                </span>
                {!inviteProvisioning && (
                  <button
                    type="button"
                    onClick={() => void handleRetryInviteCode()}
                    className="px-2.5 py-1 rounded-lg bg-[#7C3AED] text-white text-[11px] font-semibold"
                  >
                    Generate
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2 pt-1">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <span className="text-[#CBD5E1] flex items-center gap-1.5">
                <Users size={12} className="text-emerald-400" />
                <span>
                  <strong className="font-mono-tabular text-white">{qualifiedReferrals}</strong>{' '}
                  qualified
                </span>
                <span className="text-[#64748B]">·</span>
                <span>
                  <strong className="font-mono-tabular text-amber-300">{pendingReferrals}</strong>{' '}
                  pending review
                </span>
              </span>
              <span className="font-mono-tabular text-[#C084FC] font-semibold">
                {currentCycleProgress}/{referralsPerPoint} toward next +
                {rewardsConfig.pointsPerMilestone || 1} KP
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#7C3AED] to-emerald-400 transition-all duration-300"
                style={{ width: `${Math.max(4, progressPct)}%` }}
              />
            </div>
          </div>
        </section>
      </div>

      {/* Free Tasks Header + Filters */}
      <section className="rounded-2xl bg-[#0D0B16] border border-white/[0.08] p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <Gift size={16} className="text-amber-300 shrink-0" />
              <h3 className="font-display text-base font-bold text-white">
                Free Earning Tasks
              </h3>
              <span className="text-[11px] text-[#94A3B8] font-mono-tabular">
                · {activeTasks.length} active
              </span>
            </div>
            <p className="text-xs text-[#94A3B8]">
              100% free to participate — complete community actions and submit proof to earn Key Points.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            {(['all', 'open', 'submitted'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold capitalize whitespace-nowrap transition-colors ${
                  statusFilter === st
                    ? 'bg-[#7C3AED] text-white'
                    : 'bg-white/[0.04] text-[#94A3B8] hover:text-white'
                }`}
              >
                {st === 'all' ? 'All' : st === 'open' ? 'Available' : 'Submitted'}
              </button>
            ))}
          </div>
        </div>

        {/* Category Filter Strip */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
          {TASK_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCategoryFilter(cat.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                categoryFilter === cat.id
                  ? 'bg-white/[0.12] text-white border border-[#8B5CF6]/40'
                  : 'bg-white/[0.03] text-[#94A3B8] hover:text-white border border-transparent'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Tasks List */}
        {!rewardsConfig.tasksEnabled ? (
          <div className="p-8 rounded-2xl bg-[#08070F] border border-amber-500/25 text-center space-y-1">
            <p className="text-sm font-semibold text-white">Tasks are temporarily paused</p>
            <p className="text-xs text-[#94A3B8]">
              Nexora administration has temporarily paused new task submissions.
            </p>
          </div>
        ) : seedingTasks && activeTasks.length === 0 ? (
          <div className="p-10 rounded-2xl bg-[#08070F] border border-white/[0.06] flex items-center justify-center gap-2.5 text-xs text-[#94A3B8]">
            <Loader2 size={15} className="animate-spin text-[#C084FC]" />
            <span>Loading free starter tasks...</span>
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="p-8 rounded-2xl bg-[#08070F] border border-white/[0.06] text-center space-y-3">
            <Sparkles size={22} className="mx-auto text-[#C084FC]" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-white">
                {activeTasks.length === 0
                  ? 'No free tasks loaded yet'
                  : 'No tasks match this filter'}
              </p>
              <p className="text-xs text-[#94A3B8]">
                {activeTasks.length === 0
                  ? 'Load starter tasks to start earning Key Points on your profile.'
                  : 'Try switching categories or filter status above.'}
              </p>
            </div>
            {activeTasks.length === 0 && (
              <button
                type="button"
                onClick={() => void handleManualSeedTasks()}
                disabled={seedingTasks}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-[#6D28D9] to-[#7C3AED] text-xs font-semibold text-white"
              >
                <RefreshCw size={13} />
                <span>Load Free Starter Tasks</span>
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredTasks.map((task) => {
              const sub = submissionByTaskId[task.id];
              const readiness = evaluateStarterTaskReadiness(task.id, {
                username: profile.username,
                hasBio: Boolean(profile.bio && profile.bio.trim().length > 0),
                hasAvatar: Boolean(profile.avatarUrl && profile.avatarUrl.trim().length > 0),
                postsCount,
                followingCount,
                joinedSpacesCount,
                personalInviteCode: personalInvite?.code,
                qualifiedReferrals,
              });

              return (
                <article
                  key={task.id}
                  className="rounded-2xl bg-[#08070F] border border-white/[0.08] hover:border-[#8B5CF6]/35 p-4 flex flex-col justify-between gap-4 transition-colors"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-medium capitalize text-[#C084FC]">
                        {task.category} · Free Task
                      </span>
                      <span className="inline-flex items-center gap-1 font-mono-tabular text-xs font-bold text-amber-300">
                        <Award size={13} />+{task.rewardPoints} KP
                      </span>
                    </div>

                    <div className="space-y-1">
                      <h4 className="font-display text-sm font-semibold text-white">
                        {task.title}
                      </h4>
                      <p className="text-xs text-[#94A3B8] leading-relaxed">
                        {task.description}
                      </p>
                    </div>

                    {readiness.isStarter && !sub && (
                      <div className="flex items-center gap-1.5 text-[11px]">
                        {readiness.readyToSubmit ? (
                          <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
                        ) : (
                          <Clock size={13} className="text-amber-300 shrink-0" />
                        )}
                        <span
                          className={
                            readiness.readyToSubmit ? 'text-emerald-300 font-medium' : 'text-[#CBD5E1]'
                          }
                        >
                          {readiness.statusLabel}
                        </span>
                      </div>
                    )}

                    <p className="text-[11px] text-[#94A3B8] bg-white/[0.02] border border-white/[0.05] rounded-xl px-3 py-2 leading-relaxed">
                      <span className="text-[#CBD5E1] font-medium">Proof required:</span>{' '}
                      {task.proofInstructions}
                    </p>
                  </div>

                  {sub ? (
                    <div className="pt-3 border-t border-white/[0.06] space-y-1.5">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span
                          className={`inline-flex items-center gap-1.5 font-semibold ${
                            sub.status === 'approved'
                              ? 'text-emerald-300'
                              : sub.status === 'rejected'
                              ? 'text-rose-300'
                              : 'text-amber-300'
                          }`}
                        >
                          {sub.status === 'approved' ? (
                            <CheckCircle2 size={13} />
                          ) : sub.status === 'rejected' ? (
                            <XCircle size={13} />
                          ) : (
                            <Clock size={13} />
                          )}
                          <span>
                            {sub.status === 'approved'
                              ? `Approved (+${sub.rewardPoints} KP)`
                              : sub.status === 'rejected'
                              ? 'Rejected'
                              : 'Pending Review'}
                          </span>
                        </span>
                        <span className="text-[11px] text-[#64748B]">
                          {formatRelativeTime(sub.createdAt)}
                        </span>
                      </div>
                      {sub.reviewerNote && (
                        <p className="text-[11px] text-[#94A3B8]">Note: {sub.reviewerNote}</p>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-white/[0.06]">
                      {readiness.actionType && readiness.actionLabel && (
                        <button
                          type="button"
                          onClick={() => void handleStarterQuickAction(readiness.actionType!)}
                          className="px-3 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-xs font-medium text-[#E2E8F0] whitespace-nowrap min-h-[38px]"
                        >
                          {readiness.actionLabel}
                        </button>
                      )}
                      {task.actionUrl && (
                        <a
                          href={task.actionUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-xs font-medium text-[#E2E8F0] whitespace-nowrap min-h-[38px] inline-flex items-center gap-1"
                        >
                          <span>Open Link</span>
                          <ArrowUpRight size={12} />
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => handleOpenProofModal(task, readiness.suggestedProof)}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#6D28D9] to-[#7C3AED] hover:opacity-95 text-xs font-semibold text-white whitespace-nowrap min-h-[38px]"
                      >
                        <Send size={12} />
                        <span>Submit Proof</span>
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Proof Submission Modal */}
      {selectedTask && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => !submitting && setSelectedTask(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-[#0E0C18] border border-[#8B5CF6]/35 p-5 space-y-4 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold text-[#C084FC]">
                  Submit Free Task Proof · +{selectedTask.rewardPoints} KP
                </p>
                <h4 className="font-display text-base font-bold text-white mt-0.5">
                  {selectedTask.title}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => !submitting && setSelectedTask(null)}
                className="p-1.5 rounded-lg hover:bg-white/10 text-[#94A3B8] hover:text-white"
                aria-label="Close modal"
              >
                <X size={16} />
              </button>
            </div>

            <p className="text-xs text-[#94A3B8] bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
              {selectedTask.proofInstructions}
            </p>

            <form onSubmit={(e) => void handleSubmitProof(e)} className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[#CBD5E1] block">
                  Completion Proof Details
                </label>
                <textarea
                  value={proofText}
                  onChange={(e) => setProofText(e.target.value)}
                  rows={3}
                  required
                  minLength={3}
                  maxLength={1000}
                  placeholder="Describe how you completed this task..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#07060D] border border-white/10 focus:border-[#8B5CF6] outline-none text-xs text-white placeholder:text-[#64748B]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[#CBD5E1] block">
                  Proof URL (optional)
                </label>
                <input
                  type="url"
                  value={proofUrl}
                  onChange={(e) => setProofUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#07060D] border border-white/10 focus:border-[#8B5CF6] outline-none text-xs text-white placeholder:text-[#64748B]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => setSelectedTask(null)}
                  className="px-4 py-2 rounded-xl bg-white/[0.05] text-xs font-medium text-[#CBD5E1] hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || proofText.trim().length < 3}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-[#6D28D9] to-[#7C3AED] text-xs font-semibold text-white disabled:opacity-50"
                >
                  {submitting ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                  <span>Submit for Verification</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
