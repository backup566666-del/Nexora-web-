import { auth } from '../firebase/config';

export type GeminiChatModelId =
  | 'gemini-4-carbon'
  | 'gemini-4-neon'
  | 'gemini-4-hydrogen'
  | 'gemini-3.1-flash-lite';

export type VideoAspectRatio = '16:9' | '9:16';

export interface GeminiModelOption {
  id: GeminiChatModelId;
  label: string;
  purpose: string;
  description: string;
  requiresBilling: boolean;
}

export const GEMINI_CHAT_MODELS: readonly GeminiModelOption[] = [
  {
    id: 'gemini-4-hydrogen',
    label: 'Gemini 4 Hydrogen',
    purpose: 'General tasks',
    description: 'Balanced capability for everyday writing, brainstorming, and Q&A.',
    requiresBilling: false,
  },
  {
    id: 'gemini-3.1-flash-lite',
    label: 'Gemini 3.1 Flash-Lite',
    purpose: 'Fast tasks',
    description: 'Low-latency replies for quick drafts, summaries, and captions.',
    requiresBilling: false,
  },
  {
    id: 'gemini-4-carbon',
    label: 'Gemini 4 Carbon',
    purpose: 'Deep reasoning tasks',
    description: 'Flagship reasoning for multi-step analysis, planning, and technical depth.',
    requiresBilling: true,
  },
  {
    id: 'gemini-4-neon',
    label: 'Gemini 4 Neon',
    purpose: 'Complex interactive tasks',
    description: 'High-capability model for intricate interactive workflows and synthesis.',
    requiresBilling: true,
  },
] as const;

export interface ChatbotRolePreset {
  id: string;
  label: string;
  systemInstruction: string;
}

export const CHATBOT_ROLE_PRESETS: readonly ChatbotRolePreset[] = [
  {
    id: 'nexora-creative',
    label: 'Nexora Creator Strategist',
    systemInstruction:
      'You are Nexora AI, a concise creative strategist for social creators. Help draft engaging posts, Vibes scripts, Space discussion prompts, and growth ideas in clear, practical language.',
  },
  {
    id: 'deep-analyst',
    label: 'Technical & Strategy Analyst',
    systemInstruction:
      'You are an analytical reasoning partner. Break complex problems into clear, structured steps, highlight trade-offs accurately, and verify assumptions before concluding.',
  },
  {
    id: 'community-host',
    label: 'Space Community Host',
    systemInstruction:
      'You are a thoughtful community facilitator for Nexora Spaces. Suggest inclusive discussion prompts, event formats, and respectful moderation wording.',
  },
  {
    id: 'concise-editor',
    label: 'Concise Copy Editor',
    systemInstruction:
      'You are an incisive copy editor. Tighten drafts for clarity, punchy hooks, and natural tone without fluff or unnecessary buzzwords.',
  },
] as const;

export interface GeminiServerStatus {
  configured: boolean;
  chatModels: GeminiChatModelId[];
  videoModel: string;
  videoAspectRatios: VideoAspectRatio[];
}

export interface ChatTurnMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  model?: GeminiChatModelId;
  createdAt: number;
}

export interface AnimateImageResult {
  interactionId: string;
  model: string;
  aspectRatio: VideoAspectRatio;
  mimeType: string;
  videoBase64: string | null;
  videoUri: string | null;
}

async function getAuthHeader(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Please sign in with your verified Nexora account first.');
  }
  const token = await user.getIdToken();
  return {
    Authorization: `Bearer ${token}`,
  };
}

export async function fetchGeminiStatus(): Promise<GeminiServerStatus> {
  const res = await fetch('/api/ai/status', {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error('Unable to check Nexora AI status right now.');
  }
  return (await res.json()) as GeminiServerStatus;
}

export async function sendGeminiChatMessage(params: {
  model: GeminiChatModelId;
  systemInstruction: string;
  history: Pick<ChatTurnMessage, 'role' | 'text'>[];
  message: string;
}): Promise<{ model: GeminiChatModelId; reply: string }> {
  const authHeaders = await getAuthHeader();
  const res = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
    },
    body: JSON.stringify({
      model: params.model,
      systemInstruction: params.systemInstruction,
      history: params.history,
      message: params.message,
    }),
  });

  const data = (await res.json().catch(() => ({}))) as {
    model?: GeminiChatModelId;
    reply?: string;
    error?: string;
  };

  if (!res.ok) {
    throw new Error(data.error || 'Gemini could not reply right now. Please try again.');
  }

  return {
    model: data.model || params.model,
    reply: typeof data.reply === 'string' ? data.reply : '',
  };
}

export async function animateImageWithGemini(params: {
  imageBase64: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  prompt: string;
  aspectRatio: VideoAspectRatio;
}): Promise<AnimateImageResult> {
  const authHeaders = await getAuthHeader();
  const res = await fetch('/api/ai/animate-image', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
    },
    body: JSON.stringify({
      imageBase64: params.imageBase64,
      mimeType: params.mimeType,
      prompt: params.prompt,
      aspectRatio: params.aspectRatio,
    }),
  });

  const data = (await res.json().catch(() => ({}))) as Partial<AnimateImageResult> & {
    error?: string;
  };

  if (!res.ok) {
    throw new Error(data.error || 'Unable to animate this photo right now. Please try again.');
  }

  return {
    interactionId: data.interactionId || '',
    model: data.model || 'gemini-omni-1.2-flash',
    aspectRatio: data.aspectRatio === '9:16' ? '9:16' : '16:9',
    mimeType: data.mimeType || 'video/mp4',
    videoBase64: data.videoBase64 || null,
    videoUri: data.videoUri || null,
  };
}

export function base64VideoToBlobUrl(
  base64: string,
  mimeType = 'video/mp4'
): { blob: Blob; url: string } {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: mimeType });
  const url = URL.createObjectURL(blob);
  return { blob, url };
}
