import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ClipboardCheck,
  Clock,
  ExternalLink,
  Gift,
  Send,
  ShieldCheck,
  Sparkles,
  X,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { extractReadableErrorMessage } from '../../services/firebase/errorHandler';
import {
  seedStarterTasksIfEmpty,
  submitFreeTaskProof,
  subscribeMyTaskSubmissions,
  subscribeRewardsConfig,
  subscribeTasks,
} from '../../services/firebase/rewardsService';
import { RewardsConfig, TaskItem, TaskSubmission } from '../../types/nexora';
import { DEFAULT_REWARDS_CONFIG } from '../../utils/validation';

export function TasksPage() {
  const { profile } = useAuth();
  const [config, setConfig] = useState<RewardsConfig>({ ...DEFAULT_REWARDS_CONFIG });
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [submissions, setSubmissions] = useState<TaskSubmission[]>([]);
  const [activeCategory, setActiveCategory] = useState<'all' | TaskItem['category']>('all');
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);
  const [proofText, setProofText] = useState('');
  const [proofUrl, setProofUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [seedAttempted, setSeedAttempted] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    const unsubCfg = subscribeRewardsConfig(setConfig);
    const unsubTasks = subscribeTasks(setTasks);
    return () => {
      unsubCfg();
      unsubTasks();
    };
  }, []);

  useEffect(() => {
    if (!profile?.uid) return;
    return subscribeMyTaskSubmissions(profile.uid, setSubmissions);
  }, [profile?.uid]);

  useEffect(() => {
    if (!profile?.uid || tasks.length > 0 || seedAttempted) return;
    setSeedAttempted(true);
    void seedStarterTasksIfEmpty(profile);
  }, [profile?.uid, tasks.length, seedAttempted]);

  const submissionByTaskId = useMemo(() => {
    const map = new Map<string, TaskSubmission>();
    for (const sub of submissions) {
      map.set(sub.taskId, sub);
    }
    return map;
  }, [submissions]);

  const freeTasks = useMemo(
    () =>
      tasks.filter(
        (t) =>
          t.freeToParticipate === true &&
          (activeCategory === 'all' || t.category === activeCategory)
      ),
    [tasks, activeCategory]
  );

  if (!profile) return null;

  const approvedPointsTotal = submissions
    .filter((s) => s.status === 'approved')
    .reduce((acc, s) => acc + (s.rewardPoints || 0), 0);

  const handleSubmitProof = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTask || submitting) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      await submitFreeTaskProof(profile, selectedTask, proofText, proofUrl);
      setFeedback({
        type: 'ok',
        text: `Proof submitted for "${selectedTask.title}". It is now queued for admin verification.`,
      });
      setSelectedTask(null);
      setProofText('');
      setProofUrl('');
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
    <div className="space-y-6">
      {/* Free Tasks Header */}
      <div className="rounded-2xl border border-white/10 bg-[#0D0D14]/90 p-6 sm:p-7 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-emerald-400">
              <ShieldCheck size={14} />
              100% Free Community Tasks
            </div>
            <h1 className="font-display text-2xl font-bold text-white">Tasks &amp; Rewards</h1>
            <p className="text-sm text-[#94A3B8] max-w-2xl">
              Complete free Nexora community tasks, submit verification proof, and earn Key Points once verified. Zero deposits or paid subscriptions are ever required to earn rewards.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="px-4 py-2.5 rounded-xl border border-white/10 bg-white/[0.03]">
              <p className="text-[11px] uppercase tracking-wider text-[#94A3B8]">Earned from Tasks</p>
              <p className="font-mono-tabular text-lg font-bold text-white">{approvedPointsTotal} KP</p>
            </div>
          </div>
        </div>

        {/* Category Filter Tabs */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {(['all', 'onboarding', 'community', 'social', 'engagement', 'content'] as const).map(
            (cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(cat)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold capitalize border transition ${
                  activeCategory === cat
                    ? 'bg-[#7C3AED] border-[#7C3AED] text-white'
                    : 'bg-white/5 border-white/10 text-[#94A3B8] hover:text-white'
                }`}
              >
                {cat}
              </button>
            )
          )}
        </div>
      </div>

      {!config.tasksEnabled && (
        <div className="px-4 py-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-300 text-sm">
          New task submissions are temporarily paused by Nexora administration.
        </div>
      )}

      {feedback && (
        <div
          className={`px-4 py-3 rounded-xl border text-sm ${
            feedback.type === 'ok'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* Tasks List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {freeTasks.length === 0 ? (
          <div className="md:col-span-2 rounded-2xl border border-dashed border-white/15 bg-[#0D0D14]/60 p-10 text-center space-y-2">
            <Gift size={26} className="mx-auto text-[#64748B]" />
            <p className="text-sm font-semibold text-white">No free tasks published in this category yet</p>
            <p className="text-xs text-[#94A3B8]">
              Administrators can publish new community tasks anytime from Settings → Nexora Administration → Rewards &amp; Payments.
            </p>
          </div>
        ) : (
          freeTasks.map((task) => {
            const mySub = submissionByTaskId.get(task.id);
            const canSubmit = task.active && config.tasksEnabled && !mySub;

            return (
              <div
                key={task.id}
                className="rounded-2xl border border-white/10 bg-[#0D0D14]/90 p-5 flex flex-col justify-between gap-4"
              >
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
                          Free Task
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-[10px] font-medium uppercase tracking-wider text-[#94A3B8]">
                          {task.category}
                        </span>
                        {!task.active && (
                          <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-[10px] text-[#94A3B8]">
                            Closed
                          </span>
                        )}
                      </div>
                      <h3 className="font-display text-base font-semibold text-white">{task.title}</h3>
                    </div>

                    <div className="shrink-0 px-3 py-1.5 rounded-xl bg-violet-500/15 border border-violet-500/30 text-right">
                      <p className="font-mono-tabular text-sm font-bold text-violet-300">
                        +{task.rewardPoints} KP
                      </p>
                    </div>
                  </div>

                  <p className="text-sm text-[#CBD5E1] leading-relaxed">{task.description}</p>
                  <div className="rounded-xl bg-white/[0.03] border border-white/10 p-3 text-xs text-[#94A3B8]">
                    <span className="font-semibold text-white">Verification Proof:</span> {task.proofInstructions}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/10">
                  {task.actionUrl ? (
                    <a
                      href={task.actionUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-violet-400 hover:underline"
                    >
                      Open Task Link
                      <ExternalLink size={12} />
                    </a>
                  ) : (
                    <span className="text-xs text-[#64748B]">
                      {task.approvedCount} member(s) rewarded
                    </span>
                  )}

                  {mySub ? (
                    <span
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold capitalize ${
                        mySub.status === 'approved'
                          ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                          : mySub.status === 'rejected'
                          ? 'bg-rose-500/15 border-rose-500/30 text-rose-300'
                          : 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                      }`}
                    >
                      {mySub.status === 'approved' ? (
                        <CheckCircle2 size={13} />
                      ) : mySub.status === 'rejected' ? (
                        <XCircle size={13} />
                      ) : (
                        <Clock size={13} />
                      )}
                      {mySub.status}
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={!canSubmit}
                      onClick={() => {
                        setSelectedTask(task);
                        setProofText('');
                        setProofUrl('');
                      }}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#6366F1] text-xs font-semibold text-white disabled:opacity-40"
                    >
                      <Send size={13} />
                      Submit Proof
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* My Task Reward History */}
      <div className="rounded-2xl border border-white/10 bg-[#0D0D14]/90 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ClipboardCheck size={18} className="text-violet-400" />
            <h2 className="font-display text-lg font-semibold text-white">Your Submission &amp; Reward History</h2>
          </div>
          <span className="font-mono-tabular text-xs text-[#94A3B8]">{submissions.length} item(s)</span>
        </div>

        {submissions.length === 0 ? (
          <p className="text-sm text-[#94A3B8]">No task submissions recorded yet.</p>
        ) : (
          <div className="divide-y divide-white/10">
            {submissions.map((sub) => (
              <div
                key={sub.id}
                className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-0.5">
                  <p className="text-sm font-semibold text-white">{sub.taskTitle}</p>
                  <p className="text-xs text-[#94A3B8] line-clamp-1">{sub.proofText}</p>
                  {sub.reviewerNote && (
                    <p className="text-xs text-[#CBD5E1]">Reviewer note: {sub.reviewerNote}</p>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="font-mono-tabular text-sm font-semibold text-white">
                    +{sub.rewardPoints} KP
                  </span>
                  <span
                    className={`px-2.5 py-1 rounded-lg border text-xs font-medium capitalize ${
                      sub.status === 'approved'
                        ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                        : sub.status === 'rejected'
                        ? 'bg-rose-500/15 border-rose-500/30 text-rose-300'
                        : 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                    }`}
                  >
                    {sub.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Proof Submission Modal */}
      {selectedTask && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl border border-white/15 bg-[#0D0D14] p-6 space-y-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-violet-400">
                  Submit Free Task Proof (+{selectedTask.rewardPoints} KP)
                </p>
                <h3 className="font-display text-lg font-bold text-white mt-0.5">{selectedTask.title}</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTask(null)}
                className="p-1.5 rounded-lg text-[#94A3B8] hover:text-white hover:bg-white/10"
              >
                <X size={16} />
              </button>
            </div>

            <div className="rounded-xl bg-white/[0.03] border border-white/10 p-3 text-xs text-[#CBD5E1]">
              {selectedTask.proofInstructions}
            </div>

            <form onSubmit={handleSubmitProof} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">
                  Proof Details / Summary *
                </label>
                <textarea
                  value={proofText}
                  onChange={(e) => setProofText(e.target.value)}
                  required
                  minLength={3}
                  maxLength={1000}
                  rows={4}
                  placeholder="Describe what you completed or paste verification details..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-[#64748B]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">
                  Optional Link / Reference URL
                </label>
                <input
                  type="url"
                  value={proofUrl}
                  onChange={(e) => setProofUrl(e.target.value)}
                  maxLength={400}
                  placeholder="https://..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-[#64748B]"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedTask(null)}
                  className="px-4 py-2 rounded-xl border border-white/15 bg-white/5 text-xs font-semibold text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#6366F1] text-xs font-semibold text-white disabled:opacity-50"
                >
                  <Sparkles size={13} />
                  {submitting ? 'Submitting...' : 'Submit for Verification'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
