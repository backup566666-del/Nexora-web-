import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Bot,
  EyeOff,
  History,
  Loader2,
  MessageSquarePlus,
  RotateCcw,
  Save,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  User as UserIcon,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import {
  AiQuotaSnapshot,
  CHATBOT_ROLE_PRESETS,
  ChatTurnMessage,
  fetchAiQuota,
  fetchGeminiStatus,
  GEMINI_CHAT_MODELS,
  GeminiChatModelId,
  sendGeminiChatMessage,
} from '../../services/ai/geminiClientService';
import {
  appendAiConversationMessage,
  clearAllMyAiHistory,
  createAiConversation,
  deleteAiConversationAndMessages,
  setSaveAiHistoryPreference,
  subscribeAiConversationMessages,
  subscribeMyAiConversations,
} from '../../services/ai/nexoraAiFirestoreService';
import { extractReadableErrorMessage } from '../../services/firebase/errorHandler';
import { AIConversation } from '../../types/nexora';

interface GeminiChatbotPanelProps {
  compact?: boolean;
  initialPrompt?: string;
}

const NEXORA_QUICK_STARTERS = [
  'How do I customize my Nexora Home feed and layout?',
  'How do Spaces Discussions, Audio Lounge, and AI work?',
  'Compare Nexora Free, Plus, and Pro memberships',
  'Help me write a catchy caption and hashtags for a new Vibe',
];

export function GeminiChatbotPanel({
  compact = false,
  initialPrompt = '',
}: GeminiChatbotPanelProps) {
  const { profile, userPrefs, effectiveTier, myRole } = useAuth();
  const [selectedModel, setSelectedModel] = useState<GeminiChatModelId>('gemini-4-hydrogen');
  const [selectedPresetId, setSelectedPresetId] = useState<string>(CHATBOT_ROLE_PRESETS[0].id);
  const [systemInstruction, setSystemInstruction] = useState<string>(
    CHATBOT_ROLE_PRESETS[0].systemInstruction
  );
  const [showInstructions, setShowInstructions] = useState<boolean>(false);
  const [showHistoryDrawer, setShowHistoryDrawer] = useState<boolean>(false);

  const [conversations, setConversations] = useState<AIConversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatTurnMessage[]>([]);
  const [saveHistory, setSaveHistory] = useState<boolean>(userPrefs?.saveAiHistory !== false);

  const [input, setInput] = useState<string>(initialPrompt);
  const [sending, setSending] = useState<boolean>(false);
  const [clearingAll, setClearingAll] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [serverConfigured, setServerConfigured] = useState<boolean | null>(null);
  const [quota, setQuota] = useState<AiQuotaSnapshot | null>(null);

  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSaveHistory(userPrefs?.saveAiHistory !== false);
  }, [userPrefs?.saveAiHistory]);

  useEffect(() => {
    let cancelled = false;
    fetchGeminiStatus()
      .then((status) => {
        if (!cancelled) setServerConfigured(status.configured);
      })
      .catch(() => {
        if (!cancelled) setServerConfigured(null);
      });
    fetchAiQuota()
      .then((q) => {
        if (!cancelled) setQuota(q);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [profile?.uid]);

  useEffect(() => {
    if (!profile?.uid) return;
    return subscribeMyAiConversations(profile.uid, (items) => {
      setConversations(items);
    });
  }, [profile?.uid]);

  useEffect(() => {
    if (!activeConvId || !profile?.uid) return;
    return subscribeAiConversationMessages(activeConvId, profile.uid, (docs) => {
      setMessages(
        docs.map((d) => ({
          id: d.id,
          role: d.role,
          text: d.text,
          model: d.model,
          createdAt: d.createdAt?.toMillis?.() || Date.now(),
        }))
      );
    });
  }, [activeConvId, profile?.uid]);

  useEffect(() => {
    const el = threadRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, sending]);

  const activeModelMeta =
    GEMINI_CHAT_MODELS.find((m) => m.id === selectedModel) || GEMINI_CHAT_MODELS[0];

  const handleSelectPreset = (presetId: string) => {
    setSelectedPresetId(presetId);
    const found = CHATBOT_ROLE_PRESETS.find((p) => p.id === presetId);
    if (found) {
      setSystemInstruction(found.systemInstruction);
    }
  };

  const handleNewConversation = () => {
    if (sending) return;
    setActiveConvId(null);
    setMessages([]);
    setErrorMsg('');
  };

  const handleToggleSaveHistory = async () => {
    const next = !saveHistory;
    setSaveHistory(next);
    if (profile?.uid) {
      await setSaveAiHistoryPreference(profile.uid, next).catch(() => {});
    }
  };

  const handleDeleteConversation = async (convId: string) => {
    if (!profile?.uid || sending) return;
    try {
      await deleteAiConversationAndMessages(convId, profile.uid);
      if (activeConvId === convId) {
        setActiveConvId(null);
        setMessages([]);
      }
    } catch (err) {
      setErrorMsg(extractReadableErrorMessage(err, 'Could not delete conversation.'));
    }
  };

  const handleClearAllHistory = async () => {
    if (!profile?.uid || sending || clearingAll) return;
    setClearingAll(true);
    try {
      await clearAllMyAiHistory(profile.uid);
      setActiveConvId(null);
      setMessages([]);
    } catch (err) {
      setErrorMsg(extractReadableErrorMessage(err, 'Unable to clear AI conversation history.'));
    } finally {
      setClearingAll(false);
    }
  };

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || sending) return;

    setErrorMsg('');
    const historySnapshot = messages.map((m) => ({ role: m.role, text: m.text }));
    const optimisticUserId = `u_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const userTurn: ChatTurnMessage = {
      id: optimisticUserId,
      role: 'user',
      text: trimmed,
      createdAt: Date.now(),
    };

    if (!saveHistory || !activeConvId) {
      setMessages((prev) => [...prev, userTurn]);
    }
    setInput('');
    setSending(true);

    try {
      const result = await sendGeminiChatMessage({
        model: selectedModel,
        systemInstruction,
        history: historySnapshot,
        message: trimmed,
      });

      if (result.quota) {
        setQuota(result.quota);
      }

      const replyText = result.reply || 'No response text was returned.';

      if (saveHistory && profile?.uid) {
        const isNewThread = !activeConvId;
        const targetConvId =
          activeConvId ||
          (await createAiConversation({
            uid: profile.uid,
            title: trimmed.split('\n')[0].slice(0, 72) || 'Nexora AI Chat',
            model: selectedModel,
            saveHistory: true,
          }));

        await appendAiConversationMessage({
          convId: targetConvId,
          uid: profile.uid,
          role: 'user',
          text: trimmed,
          model: selectedModel,
        });
        await appendAiConversationMessage({
          convId: targetConvId,
          uid: profile.uid,
          role: 'model',
          text: replyText,
          model: result.model,
          promptTokens: result.usage?.promptTokens,
          outputTokens: result.usage?.outputTokens,
          totalTokens: result.usage?.totalTokens,
          estimatedCostUsd: result.usage?.estimatedCostUsd,
        });

        if (isNewThread) {
          setActiveConvId(targetConvId);
        }
      } else {
        const assistantTurn: ChatTurnMessage = {
          id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          role: 'model',
          text: replyText,
          model: result.model,
          createdAt: Date.now(),
        };
        setMessages((prev) => [...prev, assistantTurn]);
      }
    } catch (err) {
      setErrorMsg(
        extractReadableErrorMessage(
          err,
          'Nexora AI could not process that message. Please try again.',
          { feature: 'nexora-ai-chat' }
        )
      );
      setInput(trimmed);
      setMessages((prev) => prev.filter((item) => item.id !== optimisticUserId));
    } finally {
      setSending(false);
    }
  };

  const displayTier =
    myRole?.role === 'owner'
      ? 'Owner Unlimited'
      : effectiveTier === 'pro'
      ? 'Nexora Pro'
      : effectiveTier === 'plus'
      ? 'Nexora Plus'
      : 'Free Member';

  return (
    <div
      className={`flex rounded-2xl bg-[#0D0B16] border border-[#8B5CF6]/20 overflow-hidden ${
        compact ? 'h-full min-h-[460px]' : 'min-h-[640px] lg:h-[calc(100dvh-14.5rem)]'
      }`}
    >
      {/* Persistent Saved Conversation History Sidebar */}
      {!compact && (
        <aside
          className={`${
            showHistoryDrawer ? 'flex' : 'hidden lg:flex'
          } w-full lg:w-64 xl:w-72 shrink-0 flex-col border-r border-white/[0.08] bg-[#0A0812]`}
        >
          <div className="p-3.5 border-b border-white/[0.07] space-y-2.5">
            <button
              type="button"
              onClick={() => {
                handleNewConversation();
                setShowHistoryDrawer(false);
              }}
              className="w-full inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-[#6D28D9] to-[#7C3AED] hover:brightness-110 text-xs font-semibold text-white transition-all"
            >
              <MessageSquarePlus size={14} />
              <span>New Nexora AI Chat</span>
            </button>

            <button
              type="button"
              onClick={() => void handleToggleSaveHistory()}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl border text-[11px] font-medium transition-colors ${
                saveHistory
                  ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-200'
                  : 'bg-amber-500/10 border-amber-500/25 text-amber-200'
              }`}
            >
              <span className="inline-flex items-center gap-1.5">
                {saveHistory ? <Save size={12} /> : <EyeOff size={12} />}
                <span>{saveHistory ? 'Saving Chat History' : 'Private Ephemeral Mode'}</span>
              </span>
              <span className="text-[10px] uppercase">{saveHistory ? 'ON' : 'OFF'}</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5">
            {conversations.length === 0 ? (
              <div className="p-4 text-center space-y-1.5">
                <History size={18} className="mx-auto text-[#64748B]" />
                <p className="text-[11px] text-[#94A3B8]">
                  Saved Nexora AI threads appear here privately for your account only.
                </p>
              </div>
            ) : (
              conversations.map((conv) => {
                const active = conv.id === activeConvId;
                return (
                  <div
                    key={conv.id}
                    className={`group flex items-center gap-2 p-2.5 rounded-xl border transition-colors ${
                      active
                        ? 'bg-[#7C3AED]/20 border-[#8B5CF6]/50 text-white'
                        : 'bg-[#0E0C1A] border-white/[0.05] text-[#CBD5E1] hover:border-[#8B5CF6]/30'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setActiveConvId(conv.id);
                        setSelectedModel(conv.model);
                        setShowHistoryDrawer(false);
                      }}
                      className="flex-1 text-left min-w-0"
                    >
                      <p className="text-xs font-medium truncate">{conv.title}</p>
                      <p className="text-[10px] text-[#64748B] truncate mt-0.5">
                        {conv.lastMessagePreview || `${conv.messageCount} messages`}
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteConversation(conv.id)}
                      aria-label={`Delete ${conv.title}`}
                      className="opacity-70 lg:opacity-0 lg:group-hover:opacity-100 p-1.5 rounded-lg hover:bg-rose-500/20 text-[#94A3B8] hover:text-rose-300 transition"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {conversations.length > 0 && (
            <div className="p-3 border-t border-white/[0.07]">
              <button
                type="button"
                disabled={clearingAll || sending}
                onClick={() => void handleClearAllHistory()}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 text-[11px] font-medium text-rose-200 disabled:opacity-40"
              >
                <Trash2 size={12} />
                <span>{clearingAll ? 'Clearing...' : 'Clear All History'}</span>
              </button>
            </div>
          )}
        </aside>
      )}

      {/* Main Conversational Workspace */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar: Identity + Tier Allowance + Controls */}
        <div className="p-4 sm:p-5 border-b border-white/[0.08] bg-[#0B0914] space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#6D28D9] to-[#9333EA] flex items-center justify-center shrink-0 shadow-[0_0_20px_rgba(147,51,234,0.35)]">
                <Sparkles size={17} className="text-white" />
              </div>
              <div className="min-w-0">
                <h2 className="font-display text-sm sm:text-base font-semibold text-white truncate">
                  Nexora AI
                </h2>
                <p className="text-[11px] text-[#94A3B8] truncate">
                  Official Assistant · Powered by {activeModelMeta.label}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#120F1F] border border-[#8B5CF6]/25 text-[11px] text-[#E9D5FF]">
                <ShieldCheck size={12} className="text-[#C084FC]" />
                <span>{displayTier}</span>
                {quota && !quota.isOwner && (
                  <span className="font-mono-tabular text-[#94A3B8]">
                    · {quota.remaining}/{quota.dailyLimit} left today
                  </span>
                )}
              </div>

              {!compact && (
                <button
                  type="button"
                  onClick={() => setShowHistoryDrawer((v) => !v)}
                  className="lg:hidden inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#120F1F] border border-white/10 text-xs font-medium text-[#CBD5E1]"
                >
                  <History size={13} />
                  <span>History ({conversations.length})</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowInstructions((v) => !v)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-colors ${
                  showInstructions
                    ? 'bg-[#7C3AED]/20 border-[#8B5CF6]/50 text-[#E9D5FF]'
                    : 'bg-[#120F1F] border-white/10 text-[#CBD5E1] hover:text-white'
                }`}
              >
                <Settings2 size={13} />
                <span>Role Setup</span>
              </button>

              <button
                type="button"
                onClick={handleNewConversation}
                disabled={sending}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#120F1F] border border-white/10 hover:border-[#8B5CF6]/40 disabled:opacity-40 text-xs font-medium text-[#CBD5E1] hover:text-white transition-colors"
              >
                <RotateCcw size={13} />
                <span>New Chat</span>
              </button>
            </div>
          </div>

          {/* 4 Gemini Model Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
            {GEMINI_CHAT_MODELS.map((model) => {
              const active = selectedModel === model.id;
              return (
                <button
                  key={model.id}
                  type="button"
                  onClick={() => setSelectedModel(model.id)}
                  className={`text-left p-2.5 rounded-xl border transition-all ${
                    active
                      ? 'bg-gradient-to-br from-[#6D28D9]/25 to-[#9333EA]/15 border-[#8B5CF6] shadow-[0_0_20px_rgba(124,58,237,0.18)]'
                      : 'bg-[#08070F] border-white/10 hover:border-[#8B5CF6]/40'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="text-xs font-semibold text-white truncate">{model.label}</span>
                  </div>
                  <p className="text-[11px] font-medium text-[#C084FC] mt-0.5">{model.purpose}</p>
                  {!compact && (
                    <p className="text-[11px] text-[#94A3B8] mt-1 line-clamp-2">{model.description}</p>
                  )}
                </button>
              );
            })}
          </div>

          {showInstructions && (
            <div className="p-3.5 rounded-xl bg-[#08070F] border border-[#8B5CF6]/20 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label
                  htmlFor="gemini-system-instruction"
                  className="text-xs font-semibold text-white"
                >
                  Assistant Tone &amp; Focus Preset
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {CHATBOT_ROLE_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleSelectPreset(preset.id)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors ${
                        selectedPresetId === preset.id
                          ? 'bg-[#7C3AED] border-[#8B5CF6] text-white'
                          : 'bg-[#120F1F] border-white/10 text-[#94A3B8] hover:text-white'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
              <textarea
                id="gemini-system-instruction"
                rows={2}
                maxLength={3500}
                value={systemInstruction}
                onChange={(e) => {
                  setSelectedPresetId('custom');
                  setSystemInstruction(e.target.value);
                }}
                placeholder="Customize how Nexora AI formats answers or collaborates with you..."
                className="w-full rounded-xl bg-[#0D0B16] border border-white/10 focus:border-[#8B5CF6] px-3 py-2 text-xs text-white placeholder:text-[#64748B] outline-none resize-y"
              />
            </div>
          )}

          {serverConfigured === false && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-100">
              <AlertCircle size={15} className="text-amber-300 shrink-0 mt-0.5" />
              <p className="leading-snug">
                Live Nexora AI replies are waiting on server Gemini configuration. Configure your server Gemini credential to activate responses.
              </p>
            </div>
          )}

          {quota?.globalEnabled === false && !quota.isOwner && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-100">
              <AlertCircle size={15} className="text-amber-300 shrink-0 mt-0.5" />
              <p className="leading-snug">
                Nexora AI is temporarily paused by platform administration. Please check back shortly.
              </p>
            </div>
          )}
        </div>

        {/* Scrollable Multi-Turn Conversation Thread */}
        <div
          ref={threadRef}
          aria-label="Nexora AI conversation history"
          className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 bg-[#08070F]"
        >
          {messages.length === 0 ? (
            <div className="h-full min-h-[200px] flex flex-col items-center justify-center text-center max-w-lg mx-auto space-y-3 py-8">
              <div className="w-12 h-12 rounded-2xl bg-[#7C3AED]/15 border border-[#8B5CF6]/30 flex items-center justify-center text-[#C084FC]">
                <Bot size={22} />
              </div>
              <div className="space-y-1">
                <h3 className="font-display text-sm font-semibold text-white">
                  Welcome to Nexora AI
                </h3>
                <p className="text-xs text-[#94A3B8] leading-relaxed">
                  Ask general questions, draft Posts or Vibes, learn Nexora features, or collaborate inside enabled Spaces — privately scoped to your account.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2 pt-1">
                {NEXORA_QUICK_STARTERS.map((starter) => (
                  <button
                    key={starter}
                    type="button"
                    onClick={() => setInput(starter)}
                    className="px-3 py-1.5 rounded-xl bg-[#0D0B16] border border-[#8B5CF6]/20 hover:border-[#8B5CF6] text-[11px] text-[#CBD5E1] hover:text-white transition-colors"
                  >
                    {starter}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((turn) => {
              const isUser = turn.role === 'user';
              return (
                <div
                  key={turn.id}
                  className={`flex items-start gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
                >
                  {!isUser && (
                    <div className="w-8 h-8 rounded-xl bg-[#7C3AED]/20 border border-[#8B5CF6]/35 flex items-center justify-center text-[#C084FC] shrink-0 mt-0.5">
                      <Bot size={15} />
                    </div>
                  )}

                  <div
                    className={`max-w-[85%] sm:max-w-[78%] rounded-2xl px-4 py-3 text-xs sm:text-sm leading-relaxed whitespace-pre-wrap ${
                      isUser
                        ? 'bg-gradient-to-r from-[#6D28D9] to-[#7C3AED] text-white'
                        : 'bg-[#120F1F] border border-white/10 text-[#E2E8F0]'
                    }`}
                  >
                    {!isUser && (
                      <p className="text-[10px] font-semibold text-[#C084FC] mb-1">
                        Nexora AI ·{' '}
                        {GEMINI_CHAT_MODELS.find((m) => m.id === turn.model)?.label ||
                          activeModelMeta.label}
                      </p>
                    )}
                    {turn.text}
                  </div>

                  {isUser && (
                    <div className="w-8 h-8 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center text-white shrink-0 mt-0.5">
                      <UserIcon size={15} />
                    </div>
                  )}
                </div>
              );
            })
          )}

          {sending && (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-[#7C3AED]/20 border border-[#8B5CF6]/35 flex items-center justify-center text-[#C084FC] shrink-0">
                <Loader2 size={15} className="animate-spin" />
              </div>
              <div className="rounded-2xl px-4 py-2.5 bg-[#120F1F] border border-white/10 text-xs text-[#CBD5E1]">
                Nexora AI is thinking...
              </div>
            </div>
          )}
        </div>

        {/* Inline Error Banner */}
        {errorMsg && (
          <div className="px-4 py-2.5 bg-rose-500/10 border-t border-rose-500/25 flex items-center gap-2 text-xs text-rose-200">
            <AlertCircle size={14} className="text-rose-400 shrink-0" />
            <span className="flex-1">{errorMsg}</span>
          </div>
        )}

        {/* Composer */}
        <form
          onSubmit={handleSend}
          className="p-3 sm:p-4 border-t border-white/[0.08] bg-[#0B0914] flex items-end gap-2.5"
        >
          <textarea
            rows={1}
            maxLength={16000}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            placeholder={`Ask Nexora AI anything... (Shift+Enter for new line)`}
            className="flex-1 max-h-36 min-h-[44px] rounded-xl bg-[#06060A] border border-[#8B5CF6]/25 focus:border-[#8B5CF6] px-3.5 py-2.5 text-xs sm:text-sm text-white placeholder:text-[#64748B] outline-none resize-y"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="min-h-[44px] px-4 rounded-xl bg-gradient-to-r from-[#6D28D9] via-[#7C3AED] to-[#9333EA] hover:brightness-110 disabled:opacity-45 text-xs font-semibold text-white inline-flex items-center gap-2 shrink-0"
          >
            {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            <span>Send</span>
          </button>
        </form>
      </div>
    </div>
  );
}
