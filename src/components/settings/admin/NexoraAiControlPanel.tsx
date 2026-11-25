import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Bot,
  CheckCircle2,
  Coins,
  Megaphone,
  MessageSquare,
  PackageCheck,
  Radio,
  Save,
  Send,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import {
  draftAnnouncementWithAi,
  draftReleaseWithAi,
  fetchGeminiStatus,
  fetchPushStatus,
  GEMINI_CHAT_MODELS,
  GeminiChatModelId,
} from '../../../services/ai/geminiClientService';
import {
  ownerApproveAndAnnounceRelease,
  ownerApproveAndPublishAnnouncement,
  saveAnnouncementDraft,
  saveChannelAiConfig,
  saveGlobalAiSettings,
  saveReleaseHistoryItem,
  sendTestAnnouncementToOwner,
  subscribeAllAiUsage,
  subscribeAnnouncementRecords,
  subscribeChannelAiConfigs,
  subscribeDeliveryReports,
  subscribeGlobalAiSettings,
  subscribeReleaseHistory,
} from '../../../services/ai/nexoraAiFirestoreService';
import { extractReadableErrorMessage } from '../../../services/firebase/errorHandler';
import {
  AIChannelConfig,
  AISettings,
  AIUsageRecord,
  AnnouncementAudience,
  AnnouncementCategory,
  AnnouncementRecord,
  DeliveryReport,
  PlatformRole,
  ReleaseHistoryItem,
  Space,
  UserProfile,
} from '../../../types/nexora';
import {
  ANNOUNCEMENT_CATEGORIES,
  DEFAULT_AI_SETTINGS,
  formatRelativeTime,
} from '../../../utils/validation';

interface NexoraAiControlPanelProps {
  actor: UserProfile;
  myRole: PlatformRole;
  spaces: Space[];
}

export function NexoraAiControlPanel({ actor, myRole, spaces }: NexoraAiControlPanelProps) {
  const isOwner = myRole.role === 'owner';
  const [subTab, setSubTab] = useState<'overview' | 'channels' | 'announcements' | 'releases'>(
    'overview'
  );

  // Server status booleans (never any API keys)
  const [geminiConfigured, setGeminiConfigured] = useState<boolean | null>(null);
  const [pushConfigured, setPushConfigured] = useState<boolean | null>(null);
  const [pushStatusNote, setPushStatusNote] = useState('');

  // Live Firestore data
  const [settings, setSettings] = useState<AISettings>(DEFAULT_AI_SETTINGS);
  const [prohibitedInput, setProhibitedInput] = useState(
    DEFAULT_AI_SETTINGS.prohibitedTopics.join(', ')
  );
  const [usageRecords, setUsageRecords] = useState<AIUsageRecord[]>([]);
  const [channelConfigs, setChannelConfigs] = useState<AIChannelConfig[]>([]);
  const [announcements, setAnnouncements] = useState<AnnouncementRecord[]>([]);
  const [releases, setReleases] = useState<ReleaseHistoryItem[]>([]);
  const [deliveryReports, setDeliveryReports] = useState<DeliveryReport[]>([]);

  // Feedback
  const [savingSettings, setSavingSettings] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Channel Editor Form
  const [selectedSpaceId, setSelectedSpaceId] = useState<string>('');
  const [customChannelId, setCustomChannelId] = useState<string>('');
  const [channelTargetType, setChannelTargetType] = useState<'space' | 'group_chat'>('space');
  const [channelName, setChannelName] = useState<string>('');
  const [channelEnabled, setChannelEnabled] = useState<boolean>(true);
  const [channelMode, setChannelMode] = useState<'direct_only' | 'auto_and_direct'>('auto_and_direct');
  const [channelFrequency, setChannelFrequency] = useState<'low' | 'balanced' | 'high'>('balanced');
  const [channelCooldown, setChannelCooldown] = useState<number>(15);
  const [channelWelcomeNew, setChannelWelcomeNew] = useState<boolean>(true);
  const [channelProhibited, setChannelProhibited] = useState<string>('');
  const [savingChannel, setSavingChannel] = useState(false);

  // Announcement Studio Form
  const [annCategory, setAnnCategory] = useState<AnnouncementCategory>('product_release');
  const [annAudience, setAnnAudience] = useState<AnnouncementAudience>('all');
  const [annTopic, setAnnTopic] = useState('');
  const [annTitle, setAnnTitle] = useState('');
  const [annBody, setAnnBody] = useState('');
  const [annSchedule, setAnnSchedule] = useState('');
  const [annAiGenerated, setAnnAiGenerated] = useState(false);
  const [draftingAnn, setDraftingAnn] = useState(false);
  const [savingAnn, setSavingAnn] = useState(false);

  // Release Automation Form
  const [relVersion, setRelVersion] = useState('1.0.0');
  const [relPlatform, setRelPlatform] = useState<'web' | 'android' | 'all'>('all');
  const [relStatus, setRelStatus] = useState<'draft' | 'published'>('draft');
  const [relNotes, setRelNotes] = useState('');
  const [relAiTitle, setRelAiTitle] = useState('');
  const [relAiBody, setRelAiBody] = useState('');
  const [androidServerInfo, setAndroidServerInfo] = useState<{
    available: boolean;
    versionName: string;
    versionCode: number;
    downloadUrl: string | null;
  } | null>(null);
  const [draftingRel, setDraftingRel] = useState(false);
  const [savingRel, setSavingRel] = useState(false);

  useEffect(() => {
    fetchGeminiStatus()
      .then((s) => {
        setGeminiConfigured(s.configured);
        setPushConfigured(Boolean(s.pushConfigured));
      })
      .catch(() => {});
    fetchPushStatus()
      .then((p) => {
        setPushConfigured(p.configured);
        setPushStatusNote(p.message);
      })
      .catch(() => {});
    fetch('/api/app/android-release')
      .then((r) => (r.ok ? r.json() : null))
      .then((info) => {
        if (info) {
          setAndroidServerInfo(info);
          if (info.versionName) setRelVersion(String(info.versionName));
        }
      })
      .catch(() => {});

    const u1 = subscribeGlobalAiSettings((s) => {
      setSettings(s);
      setProhibitedInput(s.prohibitedTopics.join(', '));
    });
    const u2 = subscribeAllAiUsage(setUsageRecords);
    const u3 = subscribeChannelAiConfigs(setChannelConfigs);
    const u4 = subscribeAnnouncementRecords(setAnnouncements);
    const u5 = subscribeReleaseHistory(setReleases);
    const u6 = subscribeDeliveryReports(setDeliveryReports);
    return () => {
      u1();
      u2();
      u3();
      u4();
      u5();
      u6();
    };
  }, []);

  useEffect(() => {
    if (!selectedSpaceId && spaces.length > 0) {
      setSelectedSpaceId(spaces[0].id);
      setChannelName(spaces[0].name);
    }
  }, [spaces, selectedSpaceId]);

  const usageSummary = useMemo(() => {
    return usageRecords.reduce(
      (acc, r) => {
        acc.requests += r.requestsCount || 0;
        acc.tokens += r.totalTokens || 0;
        acc.costUsd += r.estimatedCostUsd || 0;
        return acc;
      },
      { requests: 0, tokens: 0, costUsd: 0 }
    );
  }, [usageRecords]);

  const handleSaveGlobalSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback('');
    setErrorMsg('');
    setSavingSettings(true);
    try {
      await saveGlobalAiSettings({
        actor,
        actorRole: myRole.role,
        settings: {
          ...settings,
          prohibitedTopics: prohibitedInput
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
        },
      });
      setFeedback('Global Nexora AI settings saved and recorded to Audit Log.');
    } catch (err) {
      setErrorMsg(extractReadableErrorMessage(err, 'Unable to save Nexora AI settings.'));
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSaveChannelConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetId =
      channelTargetType === 'space' ? selectedSpaceId : customChannelId.trim();
    if (!targetId) {
      setErrorMsg('Select a Space or enter a Group Chat conversation ID.');
      return;
    }
    setSavingChannel(true);
    setFeedback('');
    setErrorMsg('');
    try {
      await saveChannelAiConfig({
        actor,
        actorRole: myRole.role,
        config: {
          channelId: targetId,
          targetType: channelTargetType,
          targetId,
          channelName:
            channelName.trim() ||
            spaces.find((s) => s.id === targetId)?.name ||
            `Channel ${targetId.slice(0, 8)}`,
          enabled: channelEnabled,
          mode: channelMode,
          responseFrequency: channelFrequency,
          cooldownSeconds: channelCooldown,
          prohibitedTopics: channelProhibited
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
          moderationEnabled: true,
          welcomeNewParticipants: channelWelcomeNew,
        },
      });
      setFeedback('Channel AI participation rules saved.');
    } catch (err) {
      setErrorMsg(extractReadableErrorMessage(err, 'Unable to save channel AI rules.'));
    } finally {
      setSavingChannel(false);
    }
  };

  const handleGenerateAnnouncementDraft = async () => {
    if (!annTopic.trim()) {
      setErrorMsg('Enter an announcement topic or bullet notes before generating with Gemini.');
      return;
    }
    setDraftingAnn(true);
    setFeedback('');
    setErrorMsg('');
    try {
      const draft = await draftAnnouncementWithAi({
        category: annCategory,
        audience: annAudience,
        topic: annTopic.trim(),
      });
      setAnnTitle(draft.title);
      setAnnBody(draft.body);
      setAnnAiGenerated(true);
      setFeedback('Gemini generated an announcement draft. Review, test, and approve before publishing.');
    } catch (err) {
      setErrorMsg(extractReadableErrorMessage(err, 'Unable to draft announcement with Gemini.'));
    } finally {
      setDraftingAnn(false);
    }
  };

  const handleSaveAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!annTitle.trim() || !annBody.trim()) return;
    setSavingAnn(true);
    setFeedback('');
    setErrorMsg('');
    try {
      await saveAnnouncementDraft({
        actor,
        actorRole: myRole.role,
        title: annTitle,
        body: annBody,
        category: annCategory,
        audience: annAudience,
        scheduledFor: annSchedule || undefined,
        aiGenerated: annAiGenerated,
      });
      setAnnTitle('');
      setAnnBody('');
      setAnnTopic('');
      setAnnSchedule('');
      setAnnAiGenerated(false);
      setFeedback('Announcement saved to queue. Owner approval is required to publish globally.');
    } catch (err) {
      setErrorMsg(extractReadableErrorMessage(err, 'Could not save announcement draft.'));
    } finally {
      setSavingAnn(false);
    }
  };

  const handleGenerateReleaseSummary = async () => {
    setDraftingRel(true);
    setFeedback('');
    setErrorMsg('');
    try {
      const res = await draftReleaseWithAi({
        versionName: relVersion.trim() || '1.0.0',
        platform: relPlatform,
        highlights: relNotes.trim() || 'Stability improvements and Nexora AI updates.',
        releaseStatus: relStatus,
      });
      setRelAiTitle(res.title);
      setRelAiBody(res.releaseNotes);
      setFeedback('Gemini generated version release notes referencing verified links.');
    } catch (err) {
      setErrorMsg(extractReadableErrorMessage(err, 'Could not draft release notes.'));
    } finally {
      setDraftingRel(false);
    }
  };

  const handleSaveRelease = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!relVersion.trim() || !relNotes.trim()) return;
    setSavingRel(true);
    setFeedback('');
    setErrorMsg('');
    try {
      await saveReleaseHistoryItem({
        actor,
        actorRole: myRole.role,
        version: relVersion.trim(),
        notes: relNotes.trim(),
        status: relStatus,
        downloadLinks: {
          web: settings.officialLinks.webAppUrl,
          android: androidServerInfo?.available
            ? androidServerInfo.downloadUrl || settings.officialLinks.androidApkUrl
            : settings.officialLinks.androidApkUrl,
        },
        aiSummaryTitle: relAiTitle.trim() || undefined,
        aiSummaryBody: relAiBody.trim() || undefined,
      });
      setFeedback(
        relStatus === 'draft'
          ? 'Draft release saved. Draft releases cannot be announced globally until Published.'
          : 'Published release saved. Ready for Owner approval & global update announcement.'
      );
    } catch (err) {
      setErrorMsg(extractReadableErrorMessage(err, 'Could not save release record.'));
    } finally {
      setSavingRel(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold text-white flex items-center gap-2">
            <Sparkles size={18} className="text-[#C084FC]" /> Nexora AI Control Centre
          </h2>
          <p className="text-xs text-[#94A3B8]">
            Manage global AI status, tier allowances, community channels, owner-approved announcements, and release updates.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span
            className={`px-2.5 py-1 rounded-lg border font-medium ${
              geminiConfigured
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-amber-500/10 border-amber-500/30 text-amber-200'
            }`}
          >
            Gemini Server: {geminiConfigured === null ? 'Checking...' : geminiConfigured ? 'Configured' : 'Key Not Set'}
          </span>
          <span
            className={`px-2.5 py-1 rounded-lg border font-medium ${
              pushConfigured
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-white/5 border-white/15 text-[#CBD5E1]'
            }`}
          >
            FCM Push: {pushConfigured ? 'Ready' : 'Credentials Pending'}
          </span>
        </div>
      </div>

      {/* Sub-navigation */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar border-b border-white/[0.08] pb-2">
        {[
          { id: 'overview', label: 'Overview & Controls', icon: Bot },
          { id: 'channels', label: 'Community Channels', icon: MessageSquare },
          { id: 'announcements', label: 'Announcements Studio', icon: Megaphone },
          { id: 'releases', label: 'Releases & Delivery Logs', icon: PackageCheck },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = subTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setSubTab(tab.id as typeof subTab);
                setFeedback('');
                setErrorMsg('');
              }}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                active
                  ? 'bg-[#7C3AED] text-white'
                  : 'text-[#94A3B8] hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <Icon size={13} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {feedback && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-200">
          {feedback}
        </div>
      )}
      {errorMsg && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-200">
          {errorMsg}
        </div>
      )}

      {/* TAB 1: OVERVIEW & GLOBAL CONTROLS */}
      {subTab === 'overview' && (
        <div className="space-y-5">
          {/* Telemetry Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-4 rounded-xl bg-[#08070F] border border-[#8B5CF6]/20 space-y-1">
              <p className="text-[11px] text-[#94A3B8] flex items-center gap-1.5">
                <Activity size={13} className="text-[#C084FC]" /> Total AI Requests Logged
              </p>
              <p className="font-display text-xl font-bold text-white font-mono-tabular">
                {usageSummary.requests.toLocaleString()}
              </p>
            </div>
            <div className="p-4 rounded-xl bg-[#08070F] border border-[#8B5CF6]/20 space-y-1">
              <p className="text-[11px] text-[#94A3B8] flex items-center gap-1.5">
                <Sparkles size={13} className="text-sky-300" /> Gemini Tokens Consumed
              </p>
              <p className="font-display text-xl font-bold text-white font-mono-tabular">
                {usageSummary.tokens.toLocaleString()}
              </p>
            </div>
            <div className="p-4 rounded-xl bg-[#08070F] border border-[#8B5CF6]/20 space-y-1">
              <p className="text-[11px] text-[#94A3B8] flex items-center gap-1.5">
                <Coins size={13} className="text-amber-300" /> Estimated AI Cost (USD)
              </p>
              <p className="font-display text-xl font-bold text-white font-mono-tabular">
                ${usageSummary.costUsd.toFixed(4)}
              </p>
            </div>
          </div>

          <form onSubmit={handleSaveGlobalSettings} className="space-y-4 p-4 rounded-xl bg-[#08070F] border border-white/10">
            <div className="flex flex-wrap items-center gap-5">
              <label className="flex items-center gap-2 text-xs font-semibold text-white cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.enabled}
                  onChange={(e) => setSettings((s) => ({ ...s, enabled: e.target.checked }))}
                  className="accent-[#7C3AED]"
                />
                <span>Global Nexora AI Enabled</span>
              </label>
              <label className="flex items-center gap-2 text-xs font-semibold text-white cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.welcomeEnabled}
                  onChange={(e) => setSettings((s) => ({ ...s, welcomeEnabled: e.target.checked }))}
                  className="accent-[#7C3AED]"
                />
                <span>Automated New-Member Welcome Enabled</span>
              </label>
              <label className="flex items-center gap-2 text-xs font-semibold text-white cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.ownerUnlimited}
                  onChange={(e) => setSettings((s) => ({ ...s, ownerUnlimited: e.target.checked }))}
                  className="accent-[#7C3AED]"
                />
                <span>Owner Unlimited Allowance</span>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <label className="block space-y-1 sm:col-span-2 lg:col-span-1">
                <span className="text-[11px] text-[#94A3B8]">Default Gemini Model</span>
                <select
                  value={settings.defaultModel}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, defaultModel: e.target.value as GeminiChatModelId }))
                  }
                  className="w-full px-3 py-2 rounded-xl bg-[#0D0B16] border border-white/15 text-xs text-white"
                >
                  {GEMINI_CHAT_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-[11px] text-[#94A3B8]">Free Daily Limit</span>
                <input
                  type="number"
                  min={0}
                  max={5000}
                  value={settings.freeDailyLimit}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, freeDailyLimit: Number(e.target.value) || 0 }))
                  }
                  className="w-full px-3 py-2 rounded-xl bg-[#0D0B16] border border-white/15 text-xs text-white"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[11px] text-[#94A3B8]">Plus Daily Limit</span>
                <input
                  type="number"
                  min={0}
                  max={10000}
                  value={settings.plusDailyLimit}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, plusDailyLimit: Number(e.target.value) || 0 }))
                  }
                  className="w-full px-3 py-2 rounded-xl bg-[#0D0B16] border border-white/15 text-xs text-white"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[11px] text-[#94A3B8]">Pro Daily Limit</span>
                <input
                  type="number"
                  min={0}
                  max={100000}
                  value={settings.proDailyLimit}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, proDailyLimit: Number(e.target.value) || 0 }))
                  }
                  className="w-full px-3 py-2 rounded-xl bg-[#0D0B16] border border-white/15 text-xs text-white"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[11px] text-[#94A3B8]">Rate Limit / Min</span>
                <input
                  type="number"
                  min={1}
                  max={300}
                  value={settings.rateLimitPerMinute}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, rateLimitPerMinute: Math.max(1, Number(e.target.value) || 1) }))
                  }
                  className="w-full px-3 py-2 rounded-xl bg-[#0D0B16] border border-white/15 text-xs text-white"
                />
              </label>
            </div>

            <label className="block space-y-1">
              <span className="text-[11px] text-[#94A3B8]">Official Nexora AI Personality System Prompt</span>
              <textarea
                rows={3}
                maxLength={2000}
                value={settings.personalityPrompt}
                onChange={(e) => setSettings((s) => ({ ...s, personalityPrompt: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl bg-[#0D0B16] border border-white/15 text-xs text-white"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-[11px] text-[#94A3B8]">New Member Welcome Guidance Template</span>
              <textarea
                rows={2}
                maxLength={1000}
                value={settings.welcomePromptTemplate}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, welcomePromptTemplate: e.target.value }))
                }
                className="w-full px-3 py-2 rounded-xl bg-[#0D0B16] border border-white/15 text-xs text-white"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-[11px] text-[#94A3B8]">Global Prohibited Topics (comma-separated)</span>
              <input
                type="text"
                value={prohibitedInput}
                onChange={(e) => setProhibitedInput(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#0D0B16] border border-white/15 text-xs text-white"
              />
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block space-y-1">
                <span className="text-[11px] text-[#94A3B8]">Official Web App Link</span>
                <input
                  type="text"
                  value={settings.officialLinks.webAppUrl}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      officialLinks: { ...s.officialLinks, webAppUrl: e.target.value },
                    }))
                  }
                  className="w-full px-3 py-2 rounded-xl bg-[#0D0B16] border border-white/15 text-xs text-white"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[11px] text-[#94A3B8]">Official Android APK Link</span>
                <input
                  type="text"
                  value={settings.officialLinks.androidApkUrl}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      officialLinks: { ...s.officialLinks, androidApkUrl: e.target.value },
                    }))
                  }
                  className="w-full px-3 py-2 rounded-xl bg-[#0D0B16] border border-white/15 text-xs text-white"
                />
              </label>
            </div>

            <button
              type="submit"
              disabled={savingSettings}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#6D28D9] to-[#7C3AED] text-xs font-semibold text-white"
            >
              <Save size={14} /> {savingSettings ? 'Saving...' : 'Save Global AI Settings'}
            </button>
          </form>
        </div>
      )}

      {/* TAB 2: COMMUNITY CHANNELS */}
      {subTab === 'channels' && (
        <div className="space-y-4">
          <div className="p-3 rounded-xl bg-[#08070F] border border-[#8B5CF6]/20 text-xs text-[#CBD5E1] flex items-center gap-2">
            <ShieldCheck size={15} className="text-emerald-400 shrink-0" />
            <span>
              Privacy Guarantee: Private 1-on-1 DMs are strictly excluded from automatic community AI monitoring. Only selected Spaces and Group Chats support Mode B auto-participation.
            </span>
          </div>

          <form onSubmit={handleSaveChannelConfig} className="p-4 rounded-xl bg-[#08070F] border border-white/10 space-y-3">
            <h3 className="text-xs font-semibold text-white">Configure Space or Group Chat AI Rules</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="block space-y-1">
                <span className="text-[11px] text-[#94A3B8]">Channel Type</span>
                <select
                  value={channelTargetType}
                  onChange={(e) =>
                    setChannelTargetType(e.target.value as 'space' | 'group_chat')
                  }
                  className="w-full px-3 py-2 rounded-xl bg-[#0D0B16] border border-white/15 text-xs text-white"
                >
                  <option value="space">Space Discussions</option>
                  <option value="group_chat">Group Chat Thread</option>
                </select>
              </label>

              {channelTargetType === 'space' ? (
                <label className="block space-y-1">
                  <span className="text-[11px] text-[#94A3B8]">Select Space</span>
                  <select
                    value={selectedSpaceId}
                    onChange={(e) => {
                      setSelectedSpaceId(e.target.value);
                      const found = spaces.find((s) => s.id === e.target.value);
                      if (found) setChannelName(found.name);
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-[#0D0B16] border border-white/15 text-xs text-white"
                  >
                    {spaces.map((sp) => (
                      <option key={sp.id} value={sp.id}>
                        {sp.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label className="block space-y-1">
                  <span className="text-[11px] text-[#94A3B8]">Group Conversation ID</span>
                  <input
                    type="text"
                    value={customChannelId}
                    onChange={(e) => setCustomChannelId(e.target.value)}
                    placeholder="Conversation ID"
                    className="w-full px-3 py-2 rounded-xl bg-[#0D0B16] border border-white/15 text-xs text-white"
                  />
                </label>
              )}

              <label className="block space-y-1">
                <span className="text-[11px] text-[#94A3B8]">Operating Mode</span>
                <select
                  value={channelMode}
                  onChange={(e) =>
                    setChannelMode(e.target.value as 'direct_only' | 'auto_and_direct')
                  }
                  className="w-full px-3 py-2 rounded-xl bg-[#0D0B16] border border-white/15 text-xs text-white"
                >
                  <option value="direct_only">Mode A — Direct Mention Only (@Nexora)</option>
                  <option value="auto_and_direct">Mode A + B — Auto Community Participation</option>
                </select>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="block space-y-1">
                <span className="text-[11px] text-[#94A3B8]">Response Frequency</span>
                <select
                  value={channelFrequency}
                  onChange={(e) =>
                    setChannelFrequency(e.target.value as 'low' | 'balanced' | 'high')
                  }
                  className="w-full px-3 py-2 rounded-xl bg-[#0D0B16] border border-white/15 text-xs text-white"
                >
                  <option value="low">Low (Questions Only)</option>
                  <option value="balanced">Balanced (Helpful Discussions)</option>
                  <option value="high">High (Active Co-Host)</option>
                </select>
              </label>

              <label className="block space-y-1">
                <span className="text-[11px] text-[#94A3B8]">Cooldown (Seconds)</span>
                <input
                  type="number"
                  min={0}
                  max={3600}
                  value={channelCooldown}
                  onChange={(e) => setChannelCooldown(Math.max(0, Number(e.target.value) || 0))}
                  className="w-full px-3 py-2 rounded-xl bg-[#0D0B16] border border-white/15 text-xs text-white"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-[11px] text-[#94A3B8]">Channel Prohibited Topics</span>
                <input
                  type="text"
                  value={channelProhibited}
                  onChange={(e) => setChannelProhibited(e.target.value)}
                  placeholder="Optional extra keywords..."
                  className="w-full px-3 py-2 rounded-xl bg-[#0D0B16] border border-white/15 text-xs text-white"
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-5 pt-1">
              <label className="flex items-center gap-2 text-xs text-white cursor-pointer">
                <input
                  type="checkbox"
                  checked={channelEnabled}
                  onChange={(e) => setChannelEnabled(e.target.checked)}
                  className="accent-[#7C3AED]"
                />
                <span>Enable Nexora AI in this channel</span>
              </label>
              <label className="flex items-center gap-2 text-xs text-white cursor-pointer">
                <input
                  type="checkbox"
                  checked={channelWelcomeNew}
                  onChange={(e) => setChannelWelcomeNew(e.target.checked)}
                  className="accent-[#7C3AED]"
                />
                <span>Welcome new participants</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={savingChannel}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#7C3AED] text-xs font-semibold text-white"
            >
              <Save size={13} /> {savingChannel ? 'Saving...' : 'Save Channel AI Rules'}
            </button>
          </form>

          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-white">Configured Community Channels</h3>
            {channelConfigs.length === 0 ? (
              <p className="text-xs text-[#64748B]">
                No custom channel configurations saved yet. By default, Spaces respond when members mention @Nexora.
              </p>
            ) : (
              channelConfigs.map((cfg) => (
                <div
                  key={cfg.channelId}
                  className="p-3.5 rounded-xl bg-[#08070F] border border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs"
                >
                  <div>
                    <p className="font-semibold text-white">
                      {cfg.channelName}{' '}
                      <span className="text-[#94A3B8] font-normal">({cfg.targetType})</span>
                    </p>
                    <p className="text-[11px] text-[#94A3B8]">
                      Mode: {cfg.mode} · Frequency: {cfg.responseFrequency} · Cooldown: {cfg.cooldownSeconds}s
                    </p>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${
                      cfg.enabled
                        ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                        : 'bg-white/5 text-[#94A3B8] border border-white/10'
                    }`}
                  >
                    {cfg.enabled ? 'Active' : 'Disabled'}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 3: ANNOUNCEMENTS STUDIO */}
      {subTab === 'announcements' && (
        <div className="space-y-5">
          <form onSubmit={handleSaveAnnouncement} className="p-4 rounded-xl bg-[#08070F] border border-white/10 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="block space-y-1">
                <span className="text-[11px] text-[#94A3B8]">Category</span>
                <select
                  value={annCategory}
                  onChange={(e) => setAnnCategory(e.target.value as AnnouncementCategory)}
                  className="w-full px-3 py-2 rounded-xl bg-[#0D0B16] border border-white/15 text-xs text-white"
                >
                  {ANNOUNCEMENT_CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-1">
                <span className="text-[11px] text-[#94A3B8]">Audience Target</span>
                <select
                  value={annAudience}
                  onChange={(e) => setAnnAudience(e.target.value as AnnouncementAudience)}
                  className="w-full px-3 py-2 rounded-xl bg-[#0D0B16] border border-white/15 text-xs text-white"
                >
                  <option value="all">All Registered Members</option>
                  <option value="free">Free Tier Members</option>
                  <option value="plus">Nexora Plus Members</option>
                  <option value="pro">Nexora Pro Members</option>
                  <option value="staff">Staff &amp; Moderators</option>
                </select>
              </label>

              <label className="block space-y-1">
                <span className="text-[11px] text-[#94A3B8]">Schedule Time (Optional)</span>
                <input
                  type="datetime-local"
                  value={annSchedule}
                  onChange={(e) => setAnnSchedule(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#0D0B16] border border-white/15 text-xs text-white"
                />
              </label>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={annTopic}
                onChange={(e) => setAnnTopic(e.target.value)}
                placeholder="Describe announcement topic for Gemini (e.g., New Dark Spaces audio rooms launched today)..."
                className="flex-1 px-3 py-2 rounded-xl bg-[#0D0B16] border border-white/15 text-xs text-white"
              />
              <button
                type="button"
                disabled={draftingAnn}
                onClick={() => void handleGenerateAnnouncementDraft()}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-[#8B5CF6]/40 text-xs font-semibold text-[#E9D5FF]"
              >
                <Sparkles size={13} /> {draftingAnn ? 'Drafting...' : 'Generate with Gemini'}
              </button>
            </div>

            <input
              type="text"
              required
              maxLength={120}
              value={annTitle}
              onChange={(e) => setAnnTitle(e.target.value)}
              placeholder="Announcement Title"
              className="w-full px-3 py-2 rounded-xl bg-[#0D0B16] border border-white/15 text-xs text-white"
            />
            <textarea
              rows={3}
              required
              maxLength={2000}
              value={annBody}
              onChange={(e) => setAnnBody(e.target.value)}
              placeholder="Announcement body (members see this in notifications, banner, and push alerts)..."
              className="w-full px-3 py-2 rounded-xl bg-[#0D0B16] border border-white/15 text-xs text-white"
            />

            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={savingAnn}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#7C3AED] text-xs font-semibold text-white"
              >
                <Save size={13} /> {savingAnn ? 'Saving...' : 'Save Draft'}
              </button>
              <button
                type="button"
                disabled={!annTitle.trim() || !annBody.trim()}
                onClick={async () => {
                  setErrorMsg('');
                  try {
                    await sendTestAnnouncementToOwner({
                      actor,
                      title: annTitle,
                      body: annBody,
                      sourceId: `preview_${Date.now()}`,
                    });
                    setFeedback('Test notification dispatched to your own account & logged in Delivery Reports.');
                  } catch (err) {
                    setErrorMsg(extractReadableErrorMessage(err, 'Test send failed.'));
                  }
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-white disabled:opacity-40"
              >
                <Send size={13} /> Send Test to Me
              </button>
            </div>
          </form>

          {/* Approval Queue & History */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-semibold text-white">Announcement Queue &amp; Owner Approval Gate</h3>
            {announcements.length === 0 ? (
              <p className="text-xs text-[#64748B]">No announcements drafted yet.</p>
            ) : (
              announcements.map((item) => (
                <div
                  key={item.id}
                  className="p-4 rounded-xl bg-[#08070F] border border-white/10 space-y-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold text-white">{item.title}</p>
                      <p className="text-[11px] text-[#94A3B8]">
                        {item.category} · Audience: {item.audience} · Status: {item.status}
                        {item.ownerApproved ? ' · Owner Approved' : ' · Pending Owner Approval'}
                      </p>
                    </div>
                    {item.status !== 'published' && (
                      <button
                        type="button"
                        disabled={!isOwner}
                        onClick={async () => {
                          setErrorMsg('');
                          setFeedback('');
                          try {
                            const rep = await ownerApproveAndPublishAnnouncement({
                              actor,
                              actorRole: myRole.role,
                              isOwner,
                              announcement: item,
                            });
                            setFeedback(
                              `Published globally! Delivered ${rep.deliveredCount} in-app notifications.`
                            );
                          } catch (err) {
                            setErrorMsg(
                              extractReadableErrorMessage(err, 'Could not publish announcement.')
                            );
                          }
                        }}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-xs font-semibold text-white"
                      >
                        <CheckCircle2 size={13} />{' '}
                        {isOwner ? 'Owner Approve & Publish Globally' : 'Requires Owner Approval'}
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-[#CBD5E1] whitespace-pre-wrap">{item.body}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 4: RELEASES & DELIVERY LOGS */}
      {subTab === 'releases' && (
        <div className="space-y-5">
          {androidServerInfo && (
            <div className="p-3.5 rounded-xl bg-[#08070F] border border-[#8B5CF6]/20 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div>
                <p className="font-semibold text-white">
                  Current Server Android Build: v{androidServerInfo.versionName} (code {androidServerInfo.versionCode})
                </p>
                <p className="text-[11px] text-[#94A3B8]">
                  APK Availability: {androidServerInfo.available ? `Published (${androidServerInfo.downloadUrl})` : 'APK build artifact not hosted yet'}
                </p>
              </div>
              <span className="text-[11px] text-[#C084FC]">
                {pushStatusNote || (pushConfigured ? 'FCM Push ready' : 'FCM credentials optional')}
              </span>
            </div>
          )}

          <form onSubmit={handleSaveRelease} className="p-4 rounded-xl bg-[#08070F] border border-white/10 space-y-3">
            <h3 className="text-xs font-semibold text-white">Version Update Release Notes &amp; Automation</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="block space-y-1">
                <span className="text-[11px] text-[#94A3B8]">Version Number</span>
                <input
                  type="text"
                  required
                  value={relVersion}
                  onChange={(e) => setRelVersion(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#0D0B16] border border-white/15 text-xs text-white"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[11px] text-[#94A3B8]">Target Platform</span>
                <select
                  value={relPlatform}
                  onChange={(e) => setRelPlatform(e.target.value as 'web' | 'android' | 'all')}
                  className="w-full px-3 py-2 rounded-xl bg-[#0D0B16] border border-white/15 text-xs text-white"
                >
                  <option value="all">Web + Android</option>
                  <option value="web">Web Platform</option>
                  <option value="android">Android TWA / APK</option>
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-[11px] text-[#94A3B8]">Release Status</span>
                <select
                  value={relStatus}
                  onChange={(e) => setRelStatus(e.target.value as 'draft' | 'published')}
                  className="w-full px-3 py-2 rounded-xl bg-[#0D0B16] border border-white/15 text-xs text-white"
                >
                  <option value="draft">Draft (Blocked from Global Announce)</option>
                  <option value="published">Published (Eligible for Owner Approval)</option>
                </select>
              </label>
            </div>

            <textarea
              rows={2}
              required
              value={relNotes}
              onChange={(e) => setRelNotes(e.target.value)}
              placeholder="List what changed in this release (new features, performance fixes, security patches)..."
              className="w-full px-3 py-2 rounded-xl bg-[#0D0B16] border border-white/15 text-xs text-white"
            />

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={draftingRel}
                onClick={() => void handleGenerateReleaseSummary()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-[#8B5CF6]/40 text-xs font-semibold text-[#E9D5FF]"
              >
                <Sparkles size={13} /> {draftingRel ? 'Generating...' : 'Draft Release Summary with Gemini'}
              </button>
              <button
                type="submit"
                disabled={savingRel}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#7C3AED] text-xs font-semibold text-white"
              >
                <Save size={13} /> {savingRel ? 'Saving...' : 'Save Release Record'}
              </button>
            </div>

            {(relAiTitle || relAiBody) && (
              <div className="p-3 rounded-xl bg-[#0D0B16] border border-[#8B5CF6]/25 space-y-2">
                <input
                  type="text"
                  value={relAiTitle}
                  onChange={(e) => setRelAiTitle(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg bg-[#08070F] border border-white/10 text-xs font-semibold text-white"
                />
                <textarea
                  rows={2}
                  value={relAiBody}
                  onChange={(e) => setRelAiBody(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg bg-[#08070F] border border-white/10 text-xs text-[#CBD5E1]"
                />
              </div>
            )}
          </form>

          {/* Releases List */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-white">Release History &amp; Version Update Gate</h3>
            {releases.map((rel) => (
              <div
                key={rel.id}
                className="p-3.5 rounded-xl bg-[#08070F] border border-white/10 flex flex-wrap items-center justify-between gap-2"
              >
                <div>
                  <p className="text-xs font-semibold text-white">
                    v{rel.version} · {rel.status === 'published' ? 'Published' : 'Draft'}
                  </p>
                  <p className="text-[11px] text-[#94A3B8] line-clamp-2">
                    {rel.aiSummaryTitle || rel.notes}
                  </p>
                </div>
                {rel.ownerApproved ? (
                  <span className="text-[11px] text-emerald-300 font-semibold">
                    Announced Globally
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={!isOwner || rel.status !== 'published'}
                    onClick={async () => {
                      setErrorMsg('');
                      setFeedback('');
                      try {
                        const rep = await ownerApproveAndAnnounceRelease({
                          actor,
                          actorRole: myRole.role,
                          isOwner,
                          release: rel,
                        });
                        setFeedback(`Version v${rel.version} update announced to ${rep.deliveredCount} members.`);
                      } catch (err) {
                        setErrorMsg(extractReadableErrorMessage(err, 'Could not announce release.'));
                      }
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-xs font-semibold text-white"
                  >
                    <Radio size={12} />{' '}
                    {rel.status !== 'published'
                      ? 'Draft Blocked'
                      : isOwner
                      ? 'Owner Approve & Announce'
                      : 'Owner Approval Required'}
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Delivery Reports */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-white">Recent Notification &amp; Push Delivery Reports</h3>
            {deliveryReports.length === 0 ? (
              <p className="text-xs text-[#64748B]">No delivery telemetry recorded yet.</p>
            ) : (
              deliveryReports.slice(0, 12).map((rep) => (
                <div
                  key={rep.id}
                  className="p-3 rounded-xl bg-[#08070F] border border-white/[0.07] flex flex-wrap items-center justify-between gap-2 text-xs"
                >
                  <div>
                    <p className="font-medium text-white">
                      [{rep.sourceType.toUpperCase()}] {rep.sourceId}
                    </p>
                    <p className="text-[11px] text-[#94A3B8]">
                      Delivered: {rep.deliveredCount} / {rep.recipientCount} · Failed: {rep.failedCount} · Status: {rep.status}
                    </p>
                  </div>
                  <span className="text-[11px] text-[#64748B]">
                    {formatRelativeTime(rep.createdAt)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
