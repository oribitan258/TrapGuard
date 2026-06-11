// Dynamic content-script registration for opt-in AI sites (Phase 6).
//
// Static sites (ChatGPT/Claude) ship in the manifest. Recommended + custom sites
// are injected at runtime: the user grants the per-host permission (requires a
// user gesture → an options-page button) and we register the SAME gate + bridge
// content scripts for that host via chrome.scripting. Registrations persist across
// sessions; the background re-applies them on install/update/startup as a safety net.
//
// The new scripts only take effect on the NEXT page load, hence the UI's
// "יחול בהפעלה מחדש" (applies on reload) note.
import { originPattern } from './sites';

// Built content-script paths (WXT output names — see .output/chrome-mv3).
const GATE_JS = 'content-scripts/gate.js';
const BRIDGE_JS = 'content-scripts/bridge.js';

function scriptIds(host: string): { gate: string; bridge: string } {
  const safe = host.replace(/[^a-z0-9.]/gi, '_');
  return { gate: `tg-gate-${safe}`, bridge: `tg-bridge-${safe}` };
}

/** Has the user granted the host permission for this site? */
export async function isSitePermitted(host: string): Promise<boolean> {
  return browser.permissions.contains({ origins: [originPattern(host)] });
}

/** Register the gate + bridge for a host (idempotent). Permission must already be held. */
export async function ensureRegistered(host: string): Promise<void> {
  const ids = scriptIds(host);
  const existing = await browser.scripting
    .getRegisteredContentScripts({ ids: [ids.gate, ids.bridge] })
    .catch(() => [] as { id: string }[]);
  const have = new Set(existing.map((s) => s.id));

  const toAdd: Parameters<typeof browser.scripting.registerContentScripts>[0] = [];
  if (!have.has(ids.bridge)) {
    toAdd.push({
      id: ids.bridge,
      matches: [originPattern(host)],
      js: [BRIDGE_JS],
      runAt: 'document_end',
    });
  }
  if (!have.has(ids.gate)) {
    toAdd.push({
      id: ids.gate,
      matches: [originPattern(host)],
      js: [GATE_JS],
      runAt: 'document_start',
      world: 'MAIN',
    });
  }
  if (toAdd.length > 0) await browser.scripting.registerContentScripts(toAdd);
}

/**
 * Request the host permission (MUST be called from a user gesture) and, if
 * granted, register the content scripts. Returns whether the site is now active.
 */
export async function requestAndRegister(host: string): Promise<boolean> {
  const granted = await browser.permissions.request({ origins: [originPattern(host)] });
  if (!granted) return false;
  await ensureRegistered(host);
  return true;
}

/** Unregister the content scripts and drop the host permission. */
export async function unregisterSite(host: string): Promise<void> {
  const ids = scriptIds(host);
  await browser.scripting
    .unregisterContentScripts({ ids: [ids.gate, ids.bridge] })
    .catch(() => {});
  await browser.permissions.remove({ origins: [originPattern(host)] }).catch(() => {});
}
