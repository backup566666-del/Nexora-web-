import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage } from '../firebase/config';

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

export async function compressImageToDataUrl(
  file: Blob,
  maxWidth = 1080,
  quality = 0.78,
  maxBytes = 240_000
): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxWidth / Math.max(1, bitmap.width));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas compression is unavailable.');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  let currentQuality = quality;
  let dataUrl = canvas.toDataURL('image/webp', currentQuality);
  if (!dataUrl.startsWith('data:image/webp')) {
    dataUrl = canvas.toDataURL('image/jpeg', currentQuality);
  }
  while (dataUrl.length > maxBytes && currentQuality > 0.35) {
    currentQuality -= 0.1;
    dataUrl = canvas.toDataURL('image/jpeg', currentQuality);
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
  try {
    const storageRef = ref(storage, storagePath);
    const uploadPromise = uploadBytes(storageRef, file, { contentType }).then((snap) =>
      getDownloadURL(snap.ref)
    );
    const timeoutPromise = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), 5000)
    );
    return await Promise.race([uploadPromise, timeoutPromise]);
  } catch {
    return null;
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

  // Fallback when Firebase Storage bucket CORS/rules are not yet enabled in Console
  if (category === 'image') {
    const dataUrl = await compressImageToDataUrl(file);
    return {
      url: dataUrl,
      category,
      fileName: safeName,
      storageBacked: false,
    };
  }

  if (file.size <= 350_000) {
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

  if (blob.size <= 350_000) {
    const dataUrl = await blobToDataUrl(blob);
    return {
      url: dataUrl,
      category,
      fileName: safeName,
      storageBacked: false,
    };
  }

  throw new Error(
    'Recording exceeds 350 KB inline fallback limit. Enable Firebase Storage in your Firebase Console for multi-megabyte media.'
  );
}
