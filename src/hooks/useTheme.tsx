import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './useAuth';
import { saveUserThemePreference } from '../services/firebase/socialService';
import { ThemeMode } from '../types/nexora';
import { normalizeThemeMode, resolveEffectiveTheme } from '../utils/validation';

const STORAGE_KEY = 'nexora_theme_mode';

interface ThemeContextValue {
  themeMode: ThemeMode;
  resolvedTheme: 'dark' | 'light';
  savingTheme: boolean;
  setThemeMode: (nextMode: ThemeMode) => Promise<void>;
  cycleThemeMode: () => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue>({
  themeMode: 'dark',
  resolvedTheme: 'dark',
  savingTheme: false,
  setThemeMode: async () => {},
  cycleThemeMode: async () => {},
});

function readStoredThemeMode(): ThemeMode {
  try {
    if (typeof window !== 'undefined') {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) return normalizeThemeMode(raw);
    }
  } catch {
    // Ignore storage access errors
  }
  return 'dark';
}

function getSystemPrefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return true;
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyThemeToDocument(resolved: 'dark' | 'light') {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (resolved === 'dark') {
    root.classList.add('dark');
    root.setAttribute('data-theme', 'dark');
    root.style.colorScheme = 'dark';
  } else {
    root.classList.remove('dark');
    root.setAttribute('data-theme', 'light');
    root.style.colorScheme = 'light';
  }
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    metaTheme.setAttribute('content', resolved === 'dark' ? '#06060A' : '#F6F5FB');
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { user, accountVerified, userPrefs } = useAuth();
  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => readStoredThemeMode());
  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(() => getSystemPrefersDark());
  const [savingTheme, setSavingTheme] = useState(false);
  const lastSyncedFirestoreThemeRef = useRef<ThemeMode | undefined>(undefined);

  // Track OS color scheme changes live for System Default mode
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      setSystemPrefersDark(e.matches);
    };
    setSystemPrefersDark(mq.matches);
    mq.addEventListener('change', handleChange);
    return () => mq.removeEventListener('change', handleChange);
  }, []);

  // Sync cross-device preference from Firestore user_preferences
  useEffect(() => {
    const remoteMode = userPrefs?.themeMode;
    if (!remoteMode) {
      lastSyncedFirestoreThemeRef.current = undefined;
      return;
    }
    const normalized = normalizeThemeMode(remoteMode);
    if (lastSyncedFirestoreThemeRef.current !== normalized) {
      lastSyncedFirestoreThemeRef.current = normalized;
      setThemeModeState(normalized);
      try {
        window.localStorage.setItem(STORAGE_KEY, normalized);
      } catch {
        // Ignore storage restrictions
      }
    }
  }, [userPrefs?.themeMode]);

  const resolvedTheme = useMemo(
    () => resolveEffectiveTheme(themeMode, systemPrefersDark),
    [themeMode, systemPrefersDark]
  );

  useEffect(() => {
    applyThemeToDocument(resolvedTheme);
  }, [resolvedTheme]);

  const setThemeMode = useCallback(
    async (nextMode: ThemeMode) => {
      const normalized = normalizeThemeMode(nextMode);
      setThemeModeState(normalized);
      lastSyncedFirestoreThemeRef.current = normalized;
      try {
        window.localStorage.setItem(STORAGE_KEY, normalized);
      } catch {
        // Ignore storage restrictions
      }

      if (user?.uid && accountVerified) {
        setSavingTheme(true);
        try {
          await saveUserThemePreference(user.uid, userPrefs, normalized);
        } catch {
          // Keep optimistic local preference if network fails momentarily
        } finally {
          setSavingTheme(false);
        }
      }
    },
    [user?.uid, accountVerified, userPrefs]
  );

  const cycleThemeMode = useCallback(async () => {
    const order: ThemeMode[] = ['dark', 'light', 'system'];
    const idx = order.indexOf(themeMode);
    const next = order[(idx + 1) % order.length];
    await setThemeMode(next);
  }, [themeMode, setThemeMode]);

  return (
    <ThemeContext.Provider
      value={{
        themeMode,
        resolvedTheme,
        savingTheme,
        setThemeMode,
        cycleThemeMode,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
