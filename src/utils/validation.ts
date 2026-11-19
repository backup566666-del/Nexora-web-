// Validation constants synchronized directly with firebase-blueprint.json
export const BLUEPRINT_LIMITS = {
  ID_REGEX: /^[a-zA-Z0-9_-]+$/,
  USERNAME_REGEX: /^[a-z0-9_]+$/,
  DISPLAY_NAME_MAX: 80,
  USERNAME_MIN: 3,
  USERNAME_MAX: 30,
  BIO_MAX: 400,
  WEBSITE_MAX: 200,
  LOCATION_MAX: 100,
  POST_TEXT_MAX: 2000,
  COMMENT_TEXT_MAX: 1000,
  STORY_TEXT_MAX: 500,
  VIBE_CAPTION_MAX: 400,
  SPACE_NAME_MAX: 60,
  SPACE_DESC_MAX: 400,
  CHAT_MESSAGE_MAX: 2000,
  MAX_HASHTAGS: 10,
  MAX_MENTIONS: 10,
  MAX_MEDIA_ITEMS: 4,
  MAX_INTERESTS: 10,
  MAX_POLL_OPTIONS: 4,
} as const;

export function sanitizeString(value: string, maxLength: number): string {
  return value.trim().slice(0, maxLength);
}

export function normalizeUsername(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, BLUEPRINT_LIMITS.USERNAME_MAX);
}

export function isValidUsername(username: string): boolean {
  return (
    username.length >= BLUEPRINT_LIMITS.USERNAME_MIN &&
    username.length <= BLUEPRINT_LIMITS.USERNAME_MAX &&
    BLUEPRINT_LIMITS.USERNAME_REGEX.test(username)
  );
}

export function isValidDocumentId(id: string): boolean {
  return id.length >= 1 && id.length <= 128 && BLUEPRINT_LIMITS.ID_REGEX.test(id);
}

export function extractHashtags(text: string): string[] {
  const matches = text.match(/#[a-zA-Z0-9_]{1,35}/g) ?? [];
  return Array.from(new Set(matches.map((tag) => tag.slice(1).toLowerCase()))).slice(
    0,
    BLUEPRINT_LIMITS.MAX_HASHTAGS
  );
}

export function extractMentions(text: string): string[] {
  const matches = text.match(/@[a-zA-Z0-9_]{2,30}/g) ?? [];
  return Array.from(new Set(matches.map((m) => m.slice(1).toLowerCase()))).slice(
    0,
    BLUEPRINT_LIMITS.MAX_MENTIONS
  );
}

export function formatRelativeTime(dateInput: Date | { toDate?: () => Date } | null | undefined): string {
  if (!dateInput) return 'Just now';
  const date = typeof (dateInput as { toDate?: () => Date }).toDate === 'function'
    ? (dateInput as { toDate: () => Date }).toDate()
    : dateInput instanceof Date
    ? dateInput
    : new Date();

  const diffSeconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (diffSeconds < 45) return 'Just now';
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m`;
  if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h`;
  if (diffSeconds < 604800) return `${Math.floor(diffSeconds / 86400)}d`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatCompactCount(count: number): string {
  if (!Number.isFinite(count) || count < 0) return '0';
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(count);
}
