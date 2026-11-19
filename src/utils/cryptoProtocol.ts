/**
 * NEXORA Cryptographic Foundation (Prepared Web Crypto ECDH P-256 + AES-GCM-256)
 *
 * IMPORTANT SECURITY NOTICE:
 * This module implements genuine Web Crypto API key-pair generation and
 * authenticated symmetric encryption primitives in preparation for full
 * multi-device End-to-End Encryption (E2EE) key exchange.
 *
 * Until a verified Nexora public-key directory, key-rotation audit, and
 * cross-device verification flow are deployed and tested, the Nexora UI MUST NOT
 * advertise chat threads as actively end-to-end encrypted.
 */

export interface NexoraCryptoStatus {
  webCryptoSupported: boolean;
  protocol: 'ECDH-P256-HKDF-AES-256-GCM';
  e2eeActiveInProduction: false;
  reason: string;
}

export function getMessagingCryptoStatus(): NexoraCryptoStatus {
  const supported = typeof window !== 'undefined' && !!window.crypto?.subtle;
  return {
    webCryptoSupported: supported,
    protocol: 'ECDH-P256-HKDF-AES-256-GCM',
    e2eeActiveInProduction: false,
    reason:
      'Cryptographic primitives are prepared; full public-key distribution and multi-device verification are pending backend key-directory activation.',
  };
}

export async function generateIdentityKeyPair(): Promise<CryptoKeyPair | null> {
  if (typeof window === 'undefined' || !window.crypto?.subtle) return null;
  return window.crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits']
  );
}

export async function deriveSharedAesKey(
  privateKey: CryptoKey,
  peerPublicKey: CryptoKey
): Promise<CryptoKey> {
  return window.crypto.subtle.deriveKey(
    { name: 'ECDH', public: peerPublicKey },
    privateKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptPayloadAesGcm(
  key: CryptoKey,
  plaintext: string
): Promise<{ ivBase64: string; ciphertextBase64: string }> {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const cipherBuffer = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  );
  return {
    ivBase64: btoa(String.fromCharCode(...iv)),
    ciphertextBase64: btoa(String.fromCharCode(...new Uint8Array(cipherBuffer))),
  };
}
