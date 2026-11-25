import React, { useState } from 'react';
import { Bot, Film, Sparkles } from 'lucide-react';
import { AnimateImagePanel } from '../../components/ai/AnimateImagePanel';
import { GeminiChatbotPanel } from '../../components/ai/GeminiChatbotPanel';

interface NexoraAIPageProps {
  initialTab?: 'chatbot' | 'animate';
}

export function NexoraAIPage({ initialTab = 'chatbot' }: NexoraAIPageProps) {
  const [tab, setTab] = useState<'chatbot' | 'animate'>(initialTab);

  return (
    <div className="w-full space-y-5 sm:space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#C084FC]">
            <Sparkles size={13} />
            <span>Official Intelligent Assistant · Google Gemini</span>
          </div>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-white">
            Nexora AI
          </h1>
          <p className="text-xs sm:text-sm text-[#94A3B8]">
            Private persistent AI conversations with Nexora guidance, creative writing, and photo-to-video animation.
          </p>
        </div>

        <div className="flex items-center gap-1.5 p-1 bg-[#0D0B16] border border-[#8B5CF6]/20 rounded-xl">
          <button
            type="button"
            onClick={() => setTab('chatbot')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              tab === 'chatbot'
                ? 'bg-gradient-to-r from-[#6D28D9] to-[#7C3AED] text-white'
                : 'text-[#94A3B8] hover:text-white'
            }`}
          >
            <Bot size={14} />
            <span>Nexora AI Chat</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('animate')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              tab === 'animate'
                ? 'bg-gradient-to-r from-[#6D28D9] to-[#7C3AED] text-white'
                : 'text-[#94A3B8] hover:text-white'
            }`}
          >
            <Film size={14} />
            <span>Animate Image</span>
          </button>
        </div>
      </div>

      {tab === 'chatbot' ? <GeminiChatbotPanel /> : <AnimateImagePanel />}
    </div>
  );
}
