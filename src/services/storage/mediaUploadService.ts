import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { storage } from '../firebase/config';
import { formatStorageErrorMessage } from '../firebase/errorHandler';

if (typeof storage === 'object' && storage !== null) {
  storage.maxUploadRetryTime = 3500;
  storage.maxOperationRetryTime = 3500;
}

export type MediaCategory = 'image' | 'video' | 'audio' | 'document';

export type MediaUploadErrorKind =
  | 'video_too_large'
  | 'unsupported_video'
  | 'video_upload_failed'
  | 'image_upload_failed'
  | 'file_too_large'
  | 'unsupported_file'
  | 'unknown';

export class MediaUploadError extends Error {
  readonly mediaKind: MediaUploadErrorKind;
  readonly code: string;
  readonly path: string;
  readonly diagnosticDetail: string;

  constructor(
    mediaKind: MediaUploadErrorKind,
    friendlyMessage: string,
    opts?: { code?: string; path?: string; diagnosticDetail?: string }
  ) {
    super(friendlyMessage);
    this.name = 'MediaUploadError';
    this.mediaKind = mediaKind;
    this.code = opts?.code || `media/${mediaKind}`;
    this.path = opts?.path || 'media';
    this.diagnosticDetail = opts?.diagnosticDetail || friendlyMessage;
  }
}

export interface UploadedMediaResult {
  url: string;
  category: MediaCategory;
  fileName: string;
  storageBacked: boolean;
  storageDiagnostic?: string;
}

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];
const ALLOWED_AUDIO_TYPES = ['audio/webm', 'audio/mpeg', 'audio/wav', 'audio/ogg'];
const ALLOWED_DOC_TYPES = ['application/pdf', 'text/plain'];

const VIDEO_EXTENSION_REGEX = /\.(mp4|mov|webm|m4v|avi|mkv|3gp|wmv|flv)$/i;

function isLikelyVideoFile(file: File): boolean {
  return file.type.startsWith('video/') || VIDEO_EXTENSION_REGEX.test(file.name || '');
}

export function detectMediaCategory(file: File): MediaCategory | null {
  if (ALLOWED_IMAGE_TYPES.includes(file.type)) return 'image';
  if (ALLOWED_VIDEO_TYPES.includes(file.type)) return 'video';
  if (ALLOWED_AUDIO_TYPES.includes(file.type)) return 'audio';
  if (ALLOWED_DOC_TYPES.includes(file.type)) return 'document';
  return null;
}

export function validateMediaFile(file: File, expected?: MediaCategory[]): MediaCategory {
  const likelyVideo = isLikelyVideoFile(file) || (expected?.length === 1 && expected[0] === 'video');

  if (file.size > MAX_FILE_SIZE_BYTES) {
    if (likelyVideo) {
      throw new MediaUploadError(
        'video_too_large',
        'Your video is too large. Please upload a smaller video.',
        { code: 'media/video-too-large', diagnosticDetail: `Video size ${file.size} exceeded ${MAX_FILE_SIZE_BYTES} bytes.` }
      );
    }
    throw new MediaUploadError(
      'file_too_large',
      'This file is too large. Please choose a smaller file.',
      { code: 'media/file-too-large', diagnosticDetail: `File size ${file.size} exceeded ${MAX_FILE_SIZE_BYTES} bytes.` }
    );
  }

  const category = detectMediaCategory(file);
  if (!category) {
    if (likelyVideo) {
      throw new MediaUploadError(
        'unsupported_video',
        'This video format is not supported.',
        { code: 'media/unsupported-video', diagnosticDetail: `Unsupported video MIME type "${file.type || 'unknown'}".` }
      );
    }
    throw new MediaUploadError(
      'unsupported_file',
      'This file format is not supported.',
      { code: 'media/unsupported-file', diagnosticDetail: `Unsupported file MIME type "${file.type || 'unknown'}".` }
    );
  }

  if (expected && !expected.includes(category)) {
    if (expected.length === 1 && expected[0] === 'video') {
      throw new MediaUploadError(
        'unsupported_video',
        'This video format is not supported.',
        { code: 'media/unsupported-video', diagnosticDetail: `Expected video, received ${category}.` }
      );
    }
    throw new MediaUploadError(
      'unsupported_file',
      'This file format is not supported.',
      { code: 'media/unsupported-file', diagnosticDetail: `Expected ${expected.join('/')}, received ${category}.` }
    );
  }

  return category;
}

export interface InlineCompressionLimits {
  maxWidth: number;
  quality: number;
  maxBytes: number;
}

const STORAGE_PROBE_BACKOFF_MS = 10 * 60 * 1000;
const INLINE_BINARY_MAX_BYTES = 260_000; // <= ~350 KB base64, safely under 400 KB rule caps
let storageProbeBlockedUntil = 0;

export function resolveInlineCompressionLimits(folderPath: string): InlineCompressionLimits {
  if (folderPath.includes('/avatar')) {
    return { maxWidth: 512, quality: 0.8, maxBytes: 150_000 };
  }
  if (folderPath.includes('/cover')) {
    return { maxWidth: 1280, quality: 0.78, maxBytes: 300_000 };
  }
  if (folderPath.startsWith('posts/')) {
    return { maxWidth: 1080, quality: 0.76, maxBytes: 185_000 };
  }
  if (folderPath.startsWith('stories/')) {
    return { maxWidth: 1080, quality: 0.78, maxBytes: 280_000 };
  }
  return { maxWidth: 1080, quality: 0.78, maxBytes: 200_000 };
}

function encodeCanvasBestFormat(canvas: HTMLCanvasElement, quality: number): string {
  const webp = canvas.toDataURL('image/webp', quality);
  if (webp.startsWith('data:image/webp')) {
    return webp;
  }
  return canvas.toDataURL('image/jpeg', quality);
}

export async function compressImageToDataUrl(
  file: Blob,
  maxWidth = 1080,
  quality = 0.78,
  maxBytes = 200_000
): Promise<string> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch (err) {
    throw new MediaUploadError(
      'image_upload_failed',
      "We couldn't upload your image. Please try again.",
      {
        code: 'media/image-decode-failed',
        diagnosticDetail: err instanceof Error ? err.message : 'Image bitmap decoding failed.',
      }
    );
  }

  const initialScale = Math.min(1, maxWidth / Math.max(1, bitmap.width));
  let width = Math.max(1, Math.round(bitmap.width * initialScale));
  let height = Math.max(1, Math.round(bitmap.height * initialScale));

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    throw new MediaUploadError(
      'image_upload_failed',
      "We couldn't upload your image. Please try again.",
      { code: 'media/canvas-unavailable', diagnosticDetail: '2D canvas context unavailable.' }
    );
  }

  let dataUrl = '';
  try {
    for (let pass = 0; pass < 5; pass++) {
      canvas.width = width;
      canvas.height = height;
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(bitmap, 0, 0, width, height);

      let currentQuality = quality;
      dataUrl = encodeCanvasBestFormat(canvas, currentQuality);
      while (dataUrl.length > maxBytes && currentQuality > 0.42) {
        currentQuality = Math.max(0.4, currentQuality - 0.1);
        dataUrl = canvas.toDataURL('image/jpeg', currentQuality);
      }

      if (dataUrl.length <= maxBytes) {
        return dataUrl;
      }

      const nextWidth = Math.max(160, Math.round(width * 0.74));
      const nextHeight = Math.max(160, Math.round(height * 0.74));
      if (nextWidth === width && nextHeight === height) break;
      width = nextWidth;
      height = nextHeight;
    }
  } finally {
    bitmap.close();
  }

  if (dataUrl.length > maxBytes) {
    throw new MediaUploadError(
      'file_too_large',
      'This image is too large. Please choose a smaller image.',
      { code: 'media/image-too-large', diagnosticDetail: `Compressed size ${dataUrl.length} exceeded ${maxBytes}` }
    );
  }
  return dataUrl;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () =>
      reject(
        new MediaUploadError('unknown', "We couldn't upload your file. Please try again.", {
          code: 'media/read-failed',
          diagnosticDetail: 'FileReader failed to read blob.',
        })
      );
    reader.readAsDataURL(blob);
  });
}

/**
 * Confidential identity verification documents are encoded directly as bounded
 * inline Data URLs inside Firestore `/identity_verifications/{id}` so access
 * is strictly enforced by Firestore RBAC security rules (`review_identity_docs` or `owner`)
 * rather than unauthenticated public download URLs.
 */
export async function encodeRestrictedIdentityDocument(
  file: File
): Promise<{ dataUrl: string; fileName: string }> {
  const category = validateMediaFile(file, ['image', 'document']);
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);

  if (category === 'image') {
    const dataUrl = await compressImageToDataUrl(file, 1400, 0.82, 420_000);
    if (dataUrl.length > 445_000) {
      throw new MediaUploadError(
        'file_too_large',
        'This image is too large. Please choose a clearer cropped photo.',
        { code: 'media/id-doc-too-large' }
      );
    }
    return { dataUrl, fileName: safeName };
  }

  if (file.size > 320_000) {
    throw new MediaUploadError(
      'file_too_large',
      'This document is too large. Please upload a smaller PDF or an image scan.',
      { code: 'media/id-doc-too-large' }
    );
  }
  const dataUrl = await blobToDataUrl(file);
  if (dataUrl.length > 445_000) {
    throw new MediaUploadError(
      'file_too_large',
      'This document is too large. Please upload a smaller file.',
      { code: 'media/id-doc-too-large' }
    );
  }
  return { dataUrl, fileName: safeName };
}

interface StorageAttemptResult {
  url: string | null;
  diagnostic?: string;
  code?: string;
}

let lastStorageDiagnostic: string | undefined;
let lastStorageCode: string | undefined;

async function tryFirebaseStorageUpload(
  storagePath: string,
  file: Blob,
  contentType: string
): Promise<StorageAttemptResult> {
  if (Date.now() < storageProbeBlockedUntil) {
    return { url: null, diagnostic: lastStorageDiagnostic, code: lastStorageCode };
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  let uploadTask: ReturnType<typeof uploadBytesResumable> | undefined;
  try {
    const storageRef = ref(storage, storagePath);
    uploadTask = uploadBytesResumable(storageRef, file, { contentType });
    const uploadPromise = new Promise<string>((resolve, reject) => {
      uploadTask!.on(
        'state_changed',
        undefined,
        (error) => reject(error),
        async () => {
          try {
            const url = await getDownloadURL(uploadTask!.snapshot.ref);
            resolve(url);
          } catch (err) {
            reject(err);
          }
        }
      );
    });
    const timeoutPromise = new Promise<'TIMEOUT'>((resolve) => {
      timer = setTimeout(() => {
        try {
          uploadTask?.cancel();
        } catch {
          // Ignore cancellation errors on aborted upload
        }
        resolve('TIMEOUT');
      }, 4000);
    });
    const result = await Promise.race([uploadPromise, timeoutPromise]);
    if (result === 'TIMEOUT') {
      const diagnostic = formatStorageErrorMessage(
        { code: 'storage/retry-limit-exceeded', message: 'Upload timed out after 4000ms.' },
        storagePath
      );
      lastStorageDiagnostic = diagnostic;
      lastStorageCode = 'storage/retry-limit-exceeded';
      storageProbeBlockedUntil = Date.now() + STORAGE_PROBE_BACKOFF_MS;
      console.warn('[Firebase Storage fallback]', diagnostic);
      return { url: null, diagnostic, code: lastStorageCode };
    }
    lastStorageDiagnostic = undefined;
    lastStorageCode = undefined;
    return { url: result };
  } catch (err) {
    const diagnostic = formatStorageErrorMessage(err, storagePath);
    const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
    const code = (err as { code?: string })?.code ?? 'storage/unknown';
    if (
      code === 'storage/bucket-not-found' ||
      code === 'storage/project-not-found' ||
      code === 'storage/unauthorized' ||
      code === 'storage/retry-limit-exceeded' ||
      code === 'storage/canceled' ||
      msg.includes('404') ||
      msg.includes('not found') ||
      msg.includes('cors')
    ) {
      lastStorageDiagnostic = diagnostic;
      lastStorageCode = code;
      storageProbeBlockedUntil = Date.now() + STORAGE_PROBE_BACKOFF_MS;
    }
    console.warn('[Firebase Storage fallback]', diagnostic);
    return { url: null, diagnostic, code };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function uploadMediaAsset(
  file: File,
  folderPath: string,
  expected?: MediaCategory[]
): Promise<UploadedMediaResult> {
  const category = validateMediaFile(file, expected);
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 64);
  const storagePath = `${folderPath}/${Date.now()}_${safeName}`;

  const storageAttempt = await tryFirebaseStorageUpload(storagePath, file, file.type);
  if (storageAttempt.url) {
    return {
      url: storageAttempt.url,
      category,
      fileName: safeName,
      storageBacked: true,
    };
  }

  // Bounded inline fallback when Firebase Storage bucket is unavailable
  if (category === 'image') {
    try {
      const limits = resolveInlineCompressionLimits(folderPath);
      const dataUrl = await compressImageToDataUrl(
        file,
        limits.maxWidth,
        limits.quality,
        limits.maxBytes
      );
      return {
        url: dataUrl,
        category,
        fileName: safeName,
        storageBacked: false,
        storageDiagnostic: storageAttempt.diagnostic,
      };
    } catch (err) {
      if (err instanceof MediaUploadError) throw err;
      throw new MediaUploadError(
        'image_upload_failed',
        "We couldn't upload your image. Please try again.",
        {
          code: storageAttempt.code || 'media/image-upload-failed',
          path: storagePath,
          diagnosticDetail:
            storageAttempt.diagnostic || (err instanceof Error ? err.message : 'Image upload failed.'),
        }
      );
    }
  }

  if (file.size <= INLINE_BINARY_MAX_BYTES) {
    const dataUrl = await blobToDataUrl(file);
    return {
      url: dataUrl,
      category,
      fileName: safeName,
      storageBacked: false,
      storageDiagnostic: storageAttempt.diagnostic,
    };
  }

  if (category === 'video') {
    throw new MediaUploadError(
      'video_too_large',
      'Your video is too large. Please upload a smaller video.',
      {
        code: storageAttempt.code || 'media/video-too-large',
        path: storagePath,
        diagnosticDetail:
          storageAttempt.diagnostic ||
          `Video size ${file.size} exceeds inline cap (${INLINE_BINARY_MAX_BYTES} bytes) while Storage returned fallback.`,
      }
    );
  }

  throw new MediaUploadError(
    'file_too_large',
    'This file is too large. Please choose a smaller file.',
    {
      code: storageAttempt.code || 'media/file-too-large',
      path: storagePath,
      diagnosticDetail:
        storageAttempt.diagnostic || `File size ${file.size} exceeds ${INLINE_BINARY_MAX_BYTES} bytes fallback limit.`,
    }
  );
}

export async function uploadBlobAsset(
  blob: Blob,
  fileName: string,
  folderPath: string,
  category: MediaCategory
): Promise<UploadedMediaResult> {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 64);
  const storagePath = `${folderPath}/${Date.now()}_${safeName}`;
  const storageAttempt = await tryFirebaseStorageUpload(
    storagePath,
    blob,
    blob.type || 'application/octet-stream'
  );
  if (storageAttempt.url) {
    return {
      url: storageAttempt.url,
      category,
      fileName: safeName,
      storageBacked: true,
    };
  }

  if (category === 'image') {
    try {
      const limits = resolveInlineCompressionLimits(folderPath);
      const dataUrl = await compressImageToDataUrl(
        blob,
        limits.maxWidth,
        limits.quality,
        limits.maxBytes
      );
      return {
        url: dataUrl,
        category,
        fileName: safeName,
        storageBacked: false,
        storageDiagnostic: storageAttempt.diagnostic,
      };
    } catch (err) {
      if (err instanceof MediaUploadError) throw err;
      throw new MediaUploadError(
        'image_upload_failed',
        "We couldn't upload your image. Please try again.",
        {
          code: storageAttempt.code || 'media/image-upload-failed',
          path: storagePath,
          diagnosticDetail:
            storageAttempt.diagnostic || (err instanceof Error ? err.message : 'Image upload failed.'),
        }
      );
    }
  }

  if (blob.size <= INLINE_BINARY_MAX_BYTES) {
    const dataUrl = await blobToDataUrl(blob);
    return {
      url: dataUrl,
      category,
      fileName: safeName,
      storageBacked: false,
      storageDiagnostic: storageAttempt.diagnostic,
    };
  }

  if (category === 'video') {
    throw new MediaUploadError(
      'video_upload_failed',
      "Your video couldn't be uploaded. Please try again.",
      {
        code: storageAttempt.code || 'media/video-upload-failed',
        path: storagePath,
        diagnosticDetail:
          storageAttempt.diagnostic || `Video blob ${blob.size} bytes exceeded inline fallback limit.`,
      }
    );
  }

  throw new MediaUploadError(
    'file_too_large',
    'This file is too large. Please choose a smaller file.',
    {
      code: storageAttempt.code || 'media/file-too-large',
      path: storagePath,
      diagnosticDetail:
        storageAttempt.diagnostic || `Blob ${blob.size} bytes exceeded inline fallback limit.`,
    }
  );
}
