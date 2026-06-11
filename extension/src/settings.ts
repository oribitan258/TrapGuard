// Persisted user settings.
//
// Storage areas (deliberate):
//  • chrome.storage.sync  — preferences safe to replicate across devices:
//      site enable map (SITES_ENABLED_KEY), custom-site list (CUSTOM_SITES_KEY),
//      theme (see theme.ts), onboarding-seen flag.
//  • chrome.storage.local — per-device / privacy-sensitive state:
//      the global pause flag (PAUSE_KEY) and the scan history (see history.ts).
//      History holds revealed payloads, so it MUST NOT sync across devices.
import { useEffect, useState } from 'react';
import { CUSTOM_SITES_KEY, type SupportedSite } from './sites';

/** chrome.storage.sync key for the per-host enable map (host → enabled). */
export const SITES_ENABLED_KEY = 'tg.sites.enabled';

/** chrome.storage.local key for the global pause flag (per-device, not synced). */
export const PAUSE_KEY = 'tg.paused';

export type SiteEnabledMap = Record<string, boolean>;

/**
 * Controlled enable map for the supported sites, persisted to chrome.storage.sync.
 * Unknown/absent hosts default to enabled (true) — protection is on by default.
 */
export function useSiteToggles(hosts: string[]): {
  enabled: SiteEnabledMap;
  toggle: (host: string) => void;
} {
  const [enabled, setEnabled] = useState<SiteEnabledMap>(() =>
    Object.fromEntries(hosts.map((h) => [h, true])),
  );

  useEffect(() => {
    let active = true;
    void browser.storage.sync.get(SITES_ENABLED_KEY).then((res) => {
      const stored = res[SITES_ENABLED_KEY] as SiteEnabledMap | undefined;
      if (active && stored) setEnabled((prev) => ({ ...prev, ...stored }));
    });
    return () => {
      active = false;
    };
  }, []);

  const toggle = (host: string): void => {
    setEnabled((prev) => {
      const next = { ...prev, [host]: !(prev[host] ?? true) };
      void browser.storage.sync.set({ [SITES_ENABLED_KEY]: next });
      return next;
    });
  };

  return { enabled, toggle };
}

/** Set a single host's enabled flag (used outside React, e.g. when (un)registering). */
export async function setSiteEnabled(host: string, value: boolean): Promise<void> {
  const res = await browser.storage.sync.get(SITES_ENABLED_KEY);
  const map = { ...(res[SITES_ENABLED_KEY] as SiteEnabledMap | undefined) };
  map[host] = value;
  await browser.storage.sync.set({ [SITES_ENABLED_KEY]: map });
}

// ── Custom (user-added) sites ─────────────────────────────────────────────────

/** Controlled list of user-added custom sites, persisted to chrome.storage.sync. */
export function useCustomSites(): {
  sites: SupportedSite[];
  add: (host: string, label: string) => void;
  remove: (host: string) => void;
} {
  const [sites, setSites] = useState<SupportedSite[]>([]);

  useEffect(() => {
    let active = true;
    void browser.storage.sync.get(CUSTOM_SITES_KEY).then((res) => {
      const stored = res[CUSTOM_SITES_KEY] as SupportedSite[] | undefined;
      if (active && Array.isArray(stored)) setSites(stored);
    });
    const onChanged = (
      changes: Record<string, { newValue?: unknown }>,
      area: string,
    ): void => {
      if (area === 'sync' && changes[CUSTOM_SITES_KEY]) {
        const next = changes[CUSTOM_SITES_KEY].newValue;
        if (Array.isArray(next)) setSites(next as SupportedSite[]);
      }
    };
    browser.storage.onChanged.addListener(onChanged);
    return () => {
      active = false;
      browser.storage.onChanged.removeListener(onChanged);
    };
  }, []);

  const persist = (next: SupportedSite[]): void => {
    setSites(next);
    void browser.storage.sync.set({ [CUSTOM_SITES_KEY]: next });
  };

  const add = (host: string, label: string): void => {
    if (sites.some((s) => s.host === host)) return;
    persist([...sites, { host, label, builtin: false }]);
  };

  const remove = (host: string): void => {
    persist(sites.filter((s) => s.host !== host));
  };

  return { sites, add, remove };
}

// ── Global pause ──────────────────────────────────────────────────────────────

/** Controlled global pause flag, persisted to chrome.storage.local (per-device). */
export function usePause(): { paused: boolean; setPaused: (v: boolean) => void } {
  const [paused, setPausedState] = useState(false);

  useEffect(() => {
    let active = true;
    void browser.storage.local.get(PAUSE_KEY).then((res) => {
      if (active) setPausedState(res[PAUSE_KEY] === true);
    });
    const onChanged = (
      changes: Record<string, { newValue?: unknown }>,
      area: string,
    ): void => {
      if (area === 'local' && changes[PAUSE_KEY]) {
        setPausedState(changes[PAUSE_KEY].newValue === true);
      }
    };
    browser.storage.onChanged.addListener(onChanged);
    return () => {
      active = false;
      browser.storage.onChanged.removeListener(onChanged);
    };
  }, []);

  const setPaused = (v: boolean): void => {
    setPausedState(v);
    void browser.storage.local.set({ [PAUSE_KEY]: v });
  };

  return { paused, setPaused };
}

// ── Active computation (shared by the bridge's gate-config) ────────────────────

/** Read the raw enable map + pause flag, no React. */
export async function readGateState(): Promise<{
  paused: boolean;
  enabled: SiteEnabledMap;
}> {
  const [localRes, syncRes] = await Promise.all([
    browser.storage.local.get(PAUSE_KEY),
    browser.storage.sync.get(SITES_ENABLED_KEY),
  ]);
  return {
    paused: localRes[PAUSE_KEY] === true,
    enabled: (syncRes[SITES_ENABLED_KEY] as SiteEnabledMap | undefined) ?? {},
  };
}

/** Is interception active for `host`? Off while paused or when the host is disabled. */
export function isInterceptionActive(
  host: string,
  paused: boolean,
  enabled: SiteEnabledMap,
): boolean {
  if (paused) return false;
  return enabled[host] ?? true; // unknown host → on by default
}
