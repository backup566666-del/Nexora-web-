import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { storage } from '../firebase/config';

if (typeof storage === 'object' && storage !== null) {
  storage.maxUploadRetryTime = 3500;
  storage.maxOperationRetryTime = 3500;
}

export type MediaCategory = 'image' | 'video' | 'audio' | 'document';

export interface UploadedMediaResult {
  url: string;
  category: MediaCategory;
  fileName: string;
  storageBacked: boolean;
}

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];
const ALLOWED_AUDIO_TYPES = ['audio/webm', 'audio/mpeg', 'audio/wav', 'audio/ogg'];
const ALLOWED_DOC_TYPES = ['application/pdf', 'text/plain'];

export function detectMediaCategory(file: File): MediaCategory | null {
  if (ALLOWED_IMAGE_TYPES.includes(file.type)) return 'image';
  if (ALLOWED_VIDEO_TYPES.includes(file.type)) return 'video';
  if (ALLOWED_AUDIO_TYPES.includes(file.type)) return 'audio';
  if (ALLOWED_DOC_TYPES.includes(file.type)) return 'document';
  return null;
}

export function validateMediaFile(file: File, expected?: MediaCategory[]): MediaCategory {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error('File exceeds the 20 MB upload limit.');
  }
  const category = detectMediaCategory(file);
  if (!category) {
    throw new Error(`Unsupported file type (${file.type || 'unknown'}).`);
  }
  if (expected && !expected.includes(category)) {
    throw new Error(`Please select a valid ${expected.join(' or ')} file.`);
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
  const bitmap = await createImageBitmap(file);
  const initialScale = Math.min(1, maxWidth / Math.max(1, bitmap.width));
  let width = Math.max(1, Math.round(bitmap.width * initialScale));
  let height = Math.max(1, Math.round(bitmap.height * initialScale));

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    throw new Error('Canvas compression is unavailable.');
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

      // Downscale dimensions if quality reduction alone wasn't enough for complex/noisy images
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
    throw new Error('Image remains too large after compression. Please select a smaller or simpler image.');
  }
  return dataUrl;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Failed to read media file.'));
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
      throw new Error('Identity document image is too complex. Please upload a clearer cropped photo.');
    }
    return { dataUrl, fileName: safeName };
  }

  if (file.size > 320_000) {
    throw new Error('PDF/Text identity documents must be under 320 KB, or upload an image scan (JPG/PNG/WebP).');
  }
  const dataUrl = await blobToDataUrl(file);
  if (dataUrl.length > 445_000) {
    throw new Error('Encoded identity document exceeds the confidential 450 KB vault cap.');
  }
  return { dataUrl, fileName: safeName };
}

async function tryFirebaseStorageUpload(
  storagePath: string,
  file: Blob,
  contentType: string
): Promise<string | null> {
  if (Date.now() < storageProbeBlockedUntil) {
    return null;
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
      storageProbeBlockedUntil = Date.now() + STORAGE_PROBE_BACKOFF_MS;
      return null;
    }
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
    const code = (err as { code?: string })?.code ?? '';
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
      storageProbeBlockedUntil = Date.now() + STORAGE_PROBE_BACKOFF_MS;
    }
    return null;
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

  const remoteUrl = await tryFirebaseStorageUpload(storagePath, file, file.type);
  if (remoteUrl) {
    return {
      url: remoteUrl,
      category,
      fileName: safeName,
      storageBacked: true,
    };
  }

  // Bounded inline fallback when Firebase Storage bucket is not yet provisioned in Console
  if (category === 'image') {
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
    };
  }

  if (file.size <= INLINE_BINARY_MAX_BYTES) {
    const dataUrl = await blobToDataUrl(file);
    return {
      url: dataUrl,
      category,
      fileName: safeName,
      storageBacked: false,
    };
  }

  throw new Error(
    'Large video/audio uploads require Firebase Storage to be enabled and CORS-configured in your Firebase Console.'
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
  const remoteUrl = await tryFirebaseStorageUpload(
    storagePath,
    blob,
    blob.type || 'application/octet-stream'
  );
  if (remoteUrl) {
    return {
      url: remoteUrl,
      category,
      fileName: safeName,
      storageBacked: true,
    };
  }

  if (category === 'image') {
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
    };
  }

  if (blob.size <= INLINE_BINARY_MAX_BYTES) {
    const dataUrl = await blobToDataUrl(blob);
    return {
      url: dataUrl,
      category,
      fileName: safeName,
      storageBacked: false,
    };
  }

  throw new Error(
    'Recording exceeds 260 KB inline fallback limit. Enable Firebase Storage in your Firebase Console for multi-megabyte media.'
  );
}
