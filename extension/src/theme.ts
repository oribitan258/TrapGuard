// Theme preference, persisted to chrome.storage.sync (Phase 6).
//
// CLAUDE.md note: this OVERRIDES the legacy "dark only" mandate. A manual
// light/dark choice is persisted (default dark — the brand identity). The theme
// is applied by toggling the `light` class on a UI root (the popup/options/
// onboarding page roots AND the Shadow-DOM overlay card) — see tailwind.css.
import { useEffect, useState } from 'react';

/** chrome.storage.sync key for the theme preference. */
export const THEME_KEY = 'tg.theme';

/** The theme — dark by default (brand identity), light is the manual opt-in. */
export type Theme = 'light' | 'dark';

const DEFAULT_THEME: Theme = 'dark';

/** Read the persisted theme once (defaults to dark). */
export async function getTheme(): Promise<Theme> {
  const res = await browser.storage.sync.get(THEME_KEY);
  return res[THEME_KEY] === 'light' ? 'light' : 'dark';
}

/** React hook for the theme. Persists changes to storage.sync. */
export function useTheme(): { theme: Theme; setTheme: (t: Theme) => void } {
  const [theme, setThemeState] = useState<Theme>(DEFAULT_THEME);

  useEffect(() => {
    let active = true;
    void getTheme().then((t) => {
      if (active) setThemeState(t);
    });
    return () => {
      active = false;
    };
  }, []);

  const setTheme = (next: Theme): void => {
    setThemeState(next);
    void browser.storage.sync.set({ [THEME_KEY]: next });
  };

  return { theme, setTheme };
}
