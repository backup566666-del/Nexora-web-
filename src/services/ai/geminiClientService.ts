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
  pushConfigured?: boolean;
  chatModels: GeminiChatModelId[];
  videoModel: string;
  videoAspectRatios: VideoAspectRatio[];
}

export interface AiUsageMetrics {
  promptTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

export interface AiQuotaSnapshot {
  allowed: boolean;
  tier: 'free' | 'plus' | 'pro';
  isOwner: boolean;
  dailyLimit: number;
  dailyUsed: number;
  remaining: number;
  rateLimitPerMinute: number;
  globalEnabled?: boolean;
  defaultModel?: GeminiChatModelId;
  welcomeEnabled?: boolean;
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

export async function fetchAiQuota(): Promise<AiQuotaSnapshot> {
  const authHeaders = await getAuthHeader();
  const res = await fetch('/api/ai/quota', {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      ...authHeaders,
    },
  });
  if (!res.ok) {
    throw new Error('Unable to check Nexora AI allowance right now.');
  }
  return (await res.json()) as AiQuotaSnapshot;
}

export async function sendGeminiChatMessage(params: {
  model: GeminiChatModelId;
  systemInstruction: string;
  history: Pick<ChatTurnMessage, 'role' | 'text'>[];
  message: string;
}): Promise<{
  model: GeminiChatModelId;
  reply: string;
  usage?: AiUsageMetrics;
  quota?: AiQuotaSnapshot;
}> {
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
    usage?: AiUsageMetrics;
    quota?: AiQuotaSnapshot;
    error?: string;
  };

  if (!res.ok) {
    throw new Error(data.error || 'Nexora AI could not reply right now. Please try again.');
  }

  return {
    model: data.model || params.model,
    reply: typeof data.reply === 'string' ? data.reply : '',
    usage: data.usage,
    quota: data.quota,
  };
}

export async function callCommunityAiReply(params: {
  targetType: 'space' | 'group_chat' | 'private_dm';
  channelId: string;
  channelName?: string;
  senderId: string;
  senderName: string;
  text: string;
  isAi?: boolean;
  isNewParticipant?: boolean;
  recentMessages?: { author: string; text: string }[];
}): Promise<{
  responded: boolean;
  reply?: string;
  model?: GeminiChatModelId;
  reason?: string;
  error?: string;
}> {
  const authHeaders = await getAuthHeader();
  const res = await fetch('/api/ai/community-reply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
    },
    body: JSON.stringify(params),
  });
  const data = (await res.json().catch(() => ({}))) as {
    responded?: boolean;
    reply?: string;
    model?: GeminiChatModelId;
    decision?: { reason?: string };
    error?: string;
  };
  if (!res.ok) {
    return {
      responded: false,
      error: data.error || data.decision?.reason || 'Community AI could not reply.',
    };
  }
  return {
    responded: Boolean(data.responded),
    reply: data.reply,
    model: data.model,
    reason: data.decision?.reason,
  };
}

export async function requestWelcomeFromAi(params: {
  displayName: string;
  username: string;
}): Promise<{
  generated: boolean;
  configured: boolean;
  disabled?: boolean;
  messageText: string;
  reason?: string;
  error?: string;
}> {
  const authHeaders = await getAuthHeader();
  const res = await fetch('/api/ai/welcome', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
    },
    body: JSON.stringify(params),
  });
  const data = (await res.json().catch(() => ({}))) as {
    generated?: boolean;
    configured?: boolean;
    disabled?: boolean;
    messageText?: string;
    reason?: string;
    error?: string;
  };
  return {
    generated: Boolean(data.generated),
    configured: Boolean(data.configured),
    disabled: Boolean(data.disabled),
    messageText: typeof data.messageText === 'string' ? data.messageText : '',
    reason: data.reason,
    error: data.error,
  };
}

export async function draftAnnouncementWithAi(params: {
  category: string;
  audience: string;
  topic: string;
}): Promise<{ title: string; summary: string; body: string; model: GeminiChatModelId }> {
  const authHeaders = await getAuthHeader();
  const res = await fetch('/api/ai/draft-announcement', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
    },
    body: JSON.stringify(params),
  });
  const data = (await res.json().catch(() => ({}))) as {
    title?: string;
    summary?: string;
    body?: string;
    model?: GeminiChatModelId;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error || 'Could not generate announcement draft.');
  }
  return {
    title: data.title || 'Nexora Update',
    summary: data.summary || '',
    body: data.body || '',
    model: data.model || 'gemini-4-hydrogen',
  };
}

export async function draftReleaseWithAi(params: {
  versionName: string;
  platform: 'web' | 'android' | 'all';
  highlights: string;
  releaseStatus?: 'draft' | 'published';
}): Promise<{
  title: string;
  summary: string;
  releaseNotes: string;
  downloadUrl: string;
  androidAvailable: boolean;
  model: GeminiChatModelId;
}> {
  const authHeaders = await getAuthHeader();
  const res = await fetch('/api/ai/draft-release', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
    },
    body: JSON.stringify(params),
  });
  const data = (await res.json().catch(() => ({}))) as {
    title?: string;
    summary?: string;
    releaseNotes?: string;
    downloadUrl?: string;
    androidAvailable?: boolean;
    model?: GeminiChatModelId;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error || 'Could not draft release notes.');
  }
  return {
    title: data.title || `Nexora v${params.versionName}`,
    summary: data.summary || '',
    releaseNotes: data.releaseNotes || '',
    downloadUrl: data.downloadUrl || '/',
    androidAvailable: Boolean(data.androidAvailable),
    model: data.model || 'gemini-4-hydrogen',
  };
}

export async function fetchPushStatus(): Promise<{ configured: boolean; message: string }> {
  try {
    const res = await fetch('/api/push/status');
    if (!res.ok) throw new Error('Push status failed');
    return (await res.json()) as { configured: boolean; message: string };
  } catch {
    return {
      configured: false,
      message: 'Unable to check server push configuration.',
    };
  }
}

export async function sendPushNotificationRequest(params: {
  tokens: string[];
  title: string;
  body: string;
  link?: string;
  purpose?: 'announcement' | 'release' | 'test' | 'self_welcome';
  targetUid?: string;
}): Promise<{
  configured: boolean;
  status: 'sent' | 'partial' | 'not_configured' | 'failed';
  deliveredCount: number;
  failedCount: number;
  failureDetails: string[];
}> {
  const authHeaders = await getAuthHeader();
  const res = await fetch('/api/push/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
    },
    body: JSON.stringify(params),
  });
  const data = (await res.json().catch(() => ({}))) as {
    configured?: boolean;
    status?: 'sent' | 'partial' | 'not_configured' | 'failed';
    deliveredCount?: number;
    failedCount?: number;
    failureDetails?: string[];
  };
  return {
    configured: Boolean(data.configured),
    status: data.status || 'failed',
    deliveredCount: Number(data.deliveredCount || 0),
    failedCount: Number(data.failedCount || 0),
    failureDetails: Array.isArray(data.failureDetails) ? data.failureDetails : [],
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
