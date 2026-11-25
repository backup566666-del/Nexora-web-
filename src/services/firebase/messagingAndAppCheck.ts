import { getApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import { deleteToken, getMessaging, getToken, isSupported, onMessage } from 'firebase/messaging';
import { doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db } from './config';

let appCheckInitialized = false;

export function initNexoraAppCheck(): { initialized: boolean; reason: string } {
  if (appCheckInitialized) {
    return { initialized: true, reason: 'Already initialized.' };
  }
  const siteKey = (import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY || '').trim();
  if (!siteKey) {
    return {
      initialized: false,
      reason: 'VITE_FIREBASE_APPCHECK_SITE_KEY is not configured; App Check remains optional.',
    };
  }
  try {
    initializeAppCheck(getApp(), {
      provider: new ReCaptchaV3Provider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
    appCheckInitialized = true;
    return { initialized: true, reason: 'Firebase App Check initialized.' };
  } catch (err) {
    return {
      initialized: false,
      reason: err instanceof Error ? err.message : 'App Check initialization skipped.',
    };
  }
}

export async function getBrowserPushAvailability(): Promise<{
  supported: boolean;
  vapidConfigured: boolean;
  permission: NotificationPermission | 'unsupported';
}> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return { supported: false, vapidConfigured: false, permission: 'unsupported' };
  }
  const supported = await isSupported().catch(() => false);
  const vapidKey = (import.meta.env.VITE_FIREBASE_VAPID_KEY || '').trim();
  return {
    supported,
    vapidConfigured: Boolean(vapidKey),
    permission: Notification.permission,
  };
}

export async function registerPushNotifications(uid: string): Promise<{
  ok: boolean;
  token?: string;
  message: string;
}> {
  if (!uid) {
    return { ok: false, message: 'Sign in before enabling push notifications.' };
  }
  const avail = await getBrowserPushAvailability();
  if (!avail.supported) {
    return { ok: false, message: 'This browser does not support Web Push messaging.' };
  }
  if (!avail.vapidConfigured) {
    return {
      ok: false,
      message: 'VITE_FIREBASE_VAPID_KEY is not configured yet. Add your Firebase Web Push certificate key in environment settings.',
    };
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return { ok: false, message: 'Notification permission was declined in your browser settings.' };
  }

  try {
    let swReg: ServiceWorkerRegistration | undefined;
    if ('serviceWorker' in navigator) {
      swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
        scope: '/firebase-cloud-messaging-push-scope',
      });
    }
    const messaging = getMessaging(getApp());
    const vapidKey = (import.meta.env.VITE_FIREBASE_VAPID_KEY || '').trim();
    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: swReg,
    });
    if (!token) {
      return { ok: false, message: 'Browser did not return a Firebase Cloud Messaging token.' };
    }

    const tokenDocId = `${uid}_web`;
    await setDoc(doc(db, 'device_tokens', tokenDocId), {
      uid,
      token,
      platform: 'web',
      pushConsent: true,
      enabled: true,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 240) : '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return { ok: true, token, message: 'Web Push alerts enabled for this browser.' };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Could not enable Web Push notifications.',
    };
  }
}

export async function unregisterPushNotifications(uid: string): Promise<void> {
  if (!uid) return;
  try {
    const supported = await isSupported().catch(() => false);
    if (supported) {
      const messaging = getMessaging(getApp());
      await deleteToken(messaging).catch(() => {});
    }
  } catch {
    // Non-blocking browser token delete
  }
  try {
    await updateDoc(doc(db, 'device_tokens', `${uid}_web`), {
      pushConsent: false,
      enabled: false,
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Token doc may not exist
  }
}

export async function subscribeForegroundPush(
  onPayload: (payload: { title: string; body: string }) => void
): Promise<() => void> {
  const supported = await isSupported().catch(() => false);
  if (!supported) return () => {};
  try {
    const messaging = getMessaging(getApp());
    return onMessage(messaging, (msg) => {
      onPayload({
        title: msg.notification?.title || 'Nexora',
        body: msg.notification?.body || '',
      });
    });
  } catch {
    return () => {};
  }
}
