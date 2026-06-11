// Single source of truth for the AI surfaces TrapGuard injects on.
//
// Two tiers (Phase 6):
//  • STATIC sites (ChatGPT incl. legacy + Claude) are injected via the manifest —
//    host_permissions + the gate/bridge `content_scripts` `matches`. Always present.
//  • DYNAMIC sites (recommended Gemini/Copilot/Perplexity + user-added customs)
//    require a runtime `chrome.permissions.request` + `chrome.scripting
//    .registerContentScripts` (see src/registration.ts). They are NOT in the
//    manifest, so the gate only runs on them after the user grants + reloads.
//
// SUPPORTED_MATCHES (static only) is imported by wxt.config.ts (host_permissions,
// web_accessible_resources) and by the gate/bridge content scripts (their
// `matches`), so they can never drift apart.

export const SUPPORTED_MATCHES = [
  'https://chatgpt.com/*',
  'https://chat.openai.com/*',
  'https://claude.ai/*',
] as const;

export interface SupportedSite {
  /** Bare host, e.g. "chatgpt.com" — also the chrome.storage toggle key. */
  host: string;
  /** Hebrew/brand display name. */
  label: string;
  /** True = injected via the manifest (always granted). False = dynamic (opt-in). */
  builtin: boolean;
}

/** Statically injected surfaces (manifest host_permissions + content_scripts). */
export const STATIC_SITES: SupportedSite[] = [
  { host: 'chatgpt.com', label: 'ChatGPT', builtin: true },
  { host: 'chat.openai.com', label: 'ChatGPT (Legacy)', builtin: true },
  { host: 'claude.ai', label: 'Claude', builtin: true },
];

/** Recommended extra surfaces — opt-in (need a permission grant + reload). */
export const RECOMMENDED_SITES: SupportedSite[] = [
  { host: 'gemini.google.com', label: 'Gemini', builtin: false },
  { host: 'copilot.microsoft.com', label: 'Copilot', builtin: false },
  { host: 'perplexity.ai', label: 'Perplexity', builtin: false },
];

/** Built-in sites shown in the popup/options before any user customs. */
export const SUPPORTED_SITES: SupportedSite[] = [...STATIC_SITES, ...RECOMMENDED_SITES];

/** A host is statically injected (no permission grant needed) iff it's builtin. */
export function isBuiltinHost(host: string): boolean {
  return STATIC_SITES.some((s) => s.host === host);
}

/** Match-pattern / origin for a bare host. */
export function originPattern(host: string): string {
  return `https://${host}/*`;
}

// ── Custom (user-added) sites, persisted to chrome.storage.sync ───────────────

/** chrome.storage.sync key for the user's custom-site list. */
export const CUSTOM_SITES_KEY = 'tg.sites.custom';

/**
 * Validate + normalize a user-entered host. Accepts a bare host or a full URL,
 * returns the lowercased bare host, or null if it isn't a plausible https host.
 * Rejects builtins/recommendeds (already listed) and obviously invalid input.
 */
export function normalizeHost(input: string): string | null {
  let raw = input.trim().toLowerCase();
  if (raw === '') return null;
  // Strip scheme + path if a full URL was pasted.
  try {
    if (raw.includes('://')) raw = new URL(raw).hostname;
  } catch {
    return null;
  }
  raw = raw.replace(/^www\./, '').replace(/\/.*$/, '');
  // A valid host: labels of [a-z0-9-] joined by dots, at least one dot, valid TLD.
  if (!/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(raw)) {
    return null;
  }
  return raw;
}
