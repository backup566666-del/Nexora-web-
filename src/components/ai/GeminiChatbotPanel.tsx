import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Bot,
  Loader2,
  RotateCcw,
  Send,
  Settings2,
  Sparkles,
  User as UserIcon,
} from 'lucide-react';
import {
  CHATBOT_ROLE_PRESETS,
  ChatTurnMessage,
  fetchGeminiStatus,
  GEMINI_CHAT_MODELS,
  GeminiChatModelId,
  sendGeminiChatMessage,
} from '../../services/ai/geminiClientService';

interface GeminiChatbotPanelProps {
  compact?: boolean;
  initialPrompt?: string;
}

export function GeminiChatbotPanel({
  compact = false,
  initialPrompt = '',
}: GeminiChatbotPanelProps) {
  const [selectedModel, setSelectedModel] = useState<GeminiChatModelId>('gemini-4-hydrogen');
  const [selectedPresetId, setSelectedPresetId] = useState<string>(CHATBOT_ROLE_PRESETS[0].id);
  const [systemInstruction, setSystemInstruction] = useState<string>(
    CHATBOT_ROLE_PRESETS[0].systemInstruction
  );
  const [showInstructions, setShowInstructions] = useState<boolean>(!compact);
  const [messages, setMessages] = useState<ChatTurnMessage[]>([]);
  const [input, setInput] = useState<string>(initialPrompt);
  const [sending, setSending] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [serverConfigured, setServerConfigured] = useState<boolean | null>(null);

  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetchGeminiStatus()
      .then((status) => {
        if (!cancelled) setServerConfigured(status.configured);
      })
      .catch(() => {
        if (!cancelled) setServerConfigured(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

  const handleClearThread = () => {
    if (sending) return;
    setMessages([]);
    setErrorMsg('');
  };

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || sending) return;

    setErrorMsg('');
    const historySnapshot = messages.map((m) => ({ role: m.role, text: m.text }));
    const userTurn: ChatTurnMessage = {
      id: `u_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      role: 'user',
      text: trimmed,
      createdAt: Date.now(),
    };

    setMessages((prev) => [...prev, userTurn]);
    setInput('');
    setSending(true);

    try {
      const result = await sendGeminiChatMessage({
        model: selectedModel,
        systemInstruction,
        history: historySnapshot,
        message: trimmed,
      });

      const assistantTurn: ChatTurnMessage = {
        id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        role: 'model',
        text: result.reply || 'No response text was returned.',
        model: result.model,
        createdAt: Date.now(),
      };
      setMessages((prev) => [...prev, assistantTurn]);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Gemini could not process that message. Please try again.'
      );
      setInput(trimmed);
      setMessages((prev) => prev.filter((item) => item.id !== userTurn.id));
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className={`flex flex-col rounded-2xl bg-[#0D0B16] border border-[#8B5CF6]/20 overflow-hidden ${
        compact ? 'h-full min-h-[460px]' : 'min-h-[600px] lg:h-[calc(100dvh-14.5rem)]'
      }`}
    >
      {/* Top Bar: Model Picker + Role Instructions Toggle */}
      <div className="p-4 sm:p-5 border-b border-white/[0.08] bg-[#0B0914] space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#6D28D9] to-[#9333EA] flex items-center justify-center shrink-0">
              <Sparkles size={17} className="text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-sm sm:text-base font-semibold text-white truncate">
                Multi-Turn Gemini Chat
              </h2>
              <p className="text-[11px] text-[#94A3B8] truncate">
                {activeModelMeta.label} · {activeModelMeta.purpose}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
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
              onClick={handleClearThread}
              disabled={messages.length === 0 || sending}
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
                  {model.requiresBilling && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/25 shrink-0">
                      Pro Key
                    </span>
                  )}
                </div>
                <p className="text-[11px] font-medium text-[#C084FC] mt-0.5">{model.purpose}</p>
                {!compact && (
                  <p className="text-[11px] text-[#94A3B8] mt-1 line-clamp-2">{model.description}</p>
                )}
              </button>
            );
          })}
        </div>

        {/* System Instruction & Role Selector */}
        {showInstructions && (
          <div className="p-3.5 rounded-xl bg-[#08070F] border border-[#8B5CF6]/20 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label
                htmlFor="gemini-system-instruction"
                className="text-xs font-semibold text-white"
              >
                System Role & Custom Instructions
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
              maxLength={4000}
              value={systemInstruction}
              onChange={(e) => {
                setSelectedPresetId('custom');
                setSystemInstruction(e.target.value);
              }}
              placeholder="Define how this chatbot should reason, format responses, or behave..."
              className="w-full rounded-xl bg-[#0D0B16] border border-white/10 focus:border-[#8B5CF6] px-3 py-2 text-xs text-white placeholder:text-[#64748B] outline-none resize-y"
            />
          </div>
        )}

        {serverConfigured === false && (
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-100">
            <AlertCircle size={15} className="text-amber-300 shrink-0 mt-0.5" />
            <p className="leading-snug">
              Server AI configuration is not active yet. Add your Gemini API key in AI Studio Settings &gt; Secrets to enable live responses.
            </p>
          </div>
        )}
      </div>

      {/* Scrollable Multi-Turn Conversation Thread */}
      <div
        ref={threadRef}
        aria-label="Gemini conversation history"
        className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 bg-[#08070F]"
      >
        {messages.length === 0 ? (
          <div className="h-full min-h-[200px] flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-3 py-8">
            <div className="w-12 h-12 rounded-2xl bg-[#7C3AED]/15 border border-[#8B5CF6]/30 flex items-center justify-center text-[#C084FC]">
              <Bot size={22} />
            </div>
            <div className="space-y-1">
              <h3 className="font-display text-sm font-semibold text-white">
                Start a multi-turn conversation
              </h3>
              <p className="text-xs text-[#94A3B8] leading-relaxed">
                Your follow-up messages stay in context using{' '}
                <span className="text-[#E9D5FF] font-medium">{activeModelMeta.label}</span> (
                {activeModelMeta.purpose}).
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2 pt-1">
              {[
                'Outline a 3-part creator series for my Nexora Space',
                'Compare concise hooks vs storytelling captions',
                'Help me brainstorm a creative launch plan',
              ].map((starter) => (
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
                  {!isUser && turn.model && (
                    <p className="text-[10px] font-semibold text-[#C084FC] mb-1">
                      {GEMINI_CHAT_MODELS.find((m) => m.id === turn.model)?.label || turn.model}
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
              {activeModelMeta.label} is thinking...
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
          placeholder={`Message ${activeModelMeta.label}... (Shift+Enter for new line)`}
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
  );
}
