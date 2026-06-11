import { SUPPORTED_MATCHES } from '../src/sites';
import type { WorkerInbound, WorkerOutbound } from '../src/engine/messages';
import type { Report } from '../src/engine/schema';
import {
  TG_CHANNEL,
  isCrossWorldMessage,
  type ScanVerdict,
  type BridgeHello,
  type GateConfig,
} from '../src/protocol';
import {
  readGateState,
  isInterceptionActive,
  SITES_ENABLED_KEY,
  PAUSE_KEY,
} from '../src/settings';
import { entryFromReport, appendHistory } from '../src/history';
import { getTheme, type Theme } from '../src/theme';
import { fontFaceCss } from '../src/fonts';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { OverlayCard } from '../src/overlay/OverlayCard';
import { OverlayNotice } from '../src/overlay/OverlayNotice';
import tailwindCss from '../src/assets/tailwind.css?inline';

// ── bridge ──────────────────────────────────────────────────────────────────
// Isolated-world content script. Responsibilities (Phase 6):
//   1. Relay: gate (MAIN) ⇄ engine Worker ⇄ gate
//   2. Overlay: mount a Shadow-DOM Alert & Reveal card for infected scans
//   3. Hold: for infected verdicts, delay the scan-verdict to gate until the
//      user clicks "Block upload" or "Allow anyway" in the overlay.
//   4. Gate-config: read the pause flag + per-host enable map and tell the gate
//      whether to intercept on this host (the MAIN world has no chrome.*).
//   5. History: append a metadata-only record for every scanned file.
//
// SECURITY: payload text is attacker-controlled. It is passed as a React prop
// and rendered as a text node (escaped). Never concatenated into HTML strings.

async function spawnEngineWorker(): Promise<Worker> {
  const source = await (await fetch(browser.runtime.getURL('/engine.js'))).text();
  const blobUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  const worker = new Worker(blobUrl);
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 10_000);
  return worker;
}

// ── Shadow DOM overlay host ──────────────────────────────────────────────────

let shadowHost: HTMLElement | null = null;
let shadowRoot: ShadowRoot | null = null;
let reactRoot: ReturnType<typeof ReactDOM.createRoot> | null = null;

function ensureShadowRoot(): { host: HTMLElement; root: ShadowRoot; react: ReturnType<typeof ReactDOM.createRoot> } {
  if (shadowHost && shadowRoot && reactRoot) {
    return { host: shadowHost, root: shadowRoot, react: reactRoot };
  }
  const host = document.createElement('div');
  host.id = 'trapguard-overlay-host';
  // Keep it out of the flow / tab order; pointer-events restored by the card
  host.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;pointer-events:none;';
  document.body.appendChild(host);

  const root = host.attachShadow({ mode: 'open' });

  // Inject Tailwind CSS + self-hosted fonts into the shadow root so styles are
  // scoped to our overlay and never leak into (or inherit from) the host page.
  // Phase 7: fonts load from the EXTENSION origin (browser.runtime.getURL), not
  // fonts.googleapis.com — zero external network calls. The @font-face rules are
  // scoped to this shadow root; on a strict-CSP host that blocks the extension
  // font-src the overlay degrades to the system Hebrew stack (same as before).
  const style = document.createElement('style');
  style.textContent = [
    fontFaceCss((path) => browser.runtime.getURL(path)),
    tailwindCss,
    // Ensure pointer-events work on the mounted card container
    `#tg-mount { pointer-events: auto; }`,
  ].join('\n');
  root.appendChild(style);

  const mountPoint = document.createElement('div');
  mountPoint.id = 'tg-mount';
  root.appendChild(mountPoint);

  const react = ReactDOM.createRoot(mountPoint);

  shadowHost = host;
  shadowRoot = root;
  reactRoot = react;
  return { host, root, react: reactRoot };
}

// Render an overlay card (infected → OverlayCard, error → OverlayNotice). The
// chosen component must accept { report, theme, onBlock, onAllow }; both choices
// resolve to a gate verdict via onBlock ('infected') / onAllow ('clean').
//
// QUEUED + COALESCED (Final-Exam fix F-1): react.render() REPLACES whatever
// card is showing. Before this queue, a second infected report arriving while a
// card was up (two trapped files selected together — the capture-phase prewarm
// scans them concurrently) clobbered the first card: its verdict was never
// sent, and the gate failed OPEN at its scan timeout — silently ALLOWING a
// confirmed threat. Cards now show one at a time; dismissing one presents next.
//
// Coalescing: the SAME file is often scanned twice for one upload — the prewarm
// scans the picked File, then FormData.append(..., filename) WRAPS it in a new
// File object, so the gate's per-reference cache misses and a second scan runs.
// Reports that match a showing/queued card's identity key (verdict|name|size|
// error-code) bind their verdict resolution to that card: ONE user decision
// answers every duplicate scan of the same file. (Caveat: the gate's
// Request-clone path renames raw blobs to 'upload.bin', so that duplicate shape
// doesn't coalesce — it degrades to a second sequential card, never a silent
// allow.)
interface OverlayRequest {
  key: string;
  Component: typeof OverlayCard | typeof OverlayNotice;
  report: Report;
  theme: Theme;
  blockActions: Array<() => void>;
  allowActions: Array<() => void>;
}

const overlayQueue: OverlayRequest[] = [];
let showingRequest: OverlayRequest | null = null;
let overlaySeq = 0;

// ── overlay-suppression failsafe (Red-Team Vector 1) ─────────────────────────
// A hostile host page can hide / remove / cover the overlay host node to defeat
// Alert & Reveal and trick the user into a blind allow. For an INFECTED card the
// safe default is BLOCK, so if the card is suppressed WHILE ITS VERDICT IS
// PENDING we force-resolve to BLOCK rather than letting it sit (or be silently
// allowed). This NEVER fails open: it only ever turns a confirmed-infected hold
// into an immediate block — a clean upload shows no card and is never affected.
const SUPPRESS_GRACE_MS = 700; // > the 300ms slide-in (opacity 0→1) so the
// entrance animation is never mistaken for suppression.
const SUPPRESS_POLL_MS = 200;
let stopSuppressMonitor: (() => void) | null = null;

function overlaySuppressed(host: HTMLElement, root: ShadowRoot): boolean {
  if (!document.body.contains(host)) return true; // host node removed
  const cs = getComputedStyle(host);
  if (cs.display === 'none' || cs.visibility === 'hidden') return true;
  if (parseFloat(cs.opacity || '1') < 0.1) return true;
  const card = root.querySelector('[data-testid="tg-overlay"]') as HTMLElement | null;
  if (!card) return false; // not rendered yet (within grace) → not suppressed
  const rect = card.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return true; // collapsed
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  if (cx < 0 || cy < 0 || cx > window.innerWidth || cy > window.innerHeight) return true; // off-screen
  // Occlusion: with an OPEN shadow root, elementFromPoint over our card returns
  // the host element. Anything else on top means an attacker overlay (or
  // pointer-events:none letting clicks fall through) is covering us.
  const top = document.elementFromPoint(cx, cy);
  if (top !== host && !(top !== null && host.contains(top))) return true;
  return false;
}

/** Watch the infected card; on suppression after the grace window, fire onSuppressed. */
function startSuppressionMonitor(
  host: HTMLElement,
  root: ShadowRoot,
  onSuppressed: () => void,
): () => void {
  let stopped = false;
  let interval: number | undefined;
  const stop = (): void => {
    stopped = true;
    window.clearTimeout(graceTimer);
    if (interval !== undefined) window.clearInterval(interval);
  };
  const graceTimer = window.setTimeout(() => {
    if (stopped) return;
    interval = window.setInterval(() => {
      if (stopped) return;
      if (overlaySuppressed(host, root)) {
        stop();
        onSuppressed();
      }
    }, SUPPRESS_POLL_MS);
  }, SUPPRESS_GRACE_MS);
  return stop;
}

// Hard cap on cards held at once (showing + queued). Each card auto-decides in
// ≤30s, so 3 cards resolve every verdict within 90s — safely inside the gate's
// 120s fail-open deadline. WITHOUT this cap, the 4th+ queued verdict would
// outlive the deadline and the gate would fail open — the silent-ALLOW failure
// F-1 exists to prevent. Overflow reports are resolved IMMEDIATELY instead:
// infected → block (safe + honest for an engine-confirmed threat; the payload
// stays revealed in scan history), error notice → allow (its fail-open default).
const MAX_QUEUED_CARDS = 3;

function presentNextOverlay(): void {
  const { host, root, react } = ensureShadowRoot();
  // Tear down any monitor from the card we're replacing (decision or advance).
  if (stopSuppressMonitor) { stopSuppressMonitor(); stopSuppressMonitor = null; }
  const next = overlayQueue.shift();
  showingRequest = next ?? null;
  if (next === undefined) {
    react.render(React.createElement(React.Fragment, null));
    return;
  }
  host.style.pointerEvents = 'none'; // card itself re-enables via its own style

  const settle = (actions: ReadonlyArray<() => void>): void => {
    if (stopSuppressMonitor) { stopSuppressMonitor(); stopSuppressMonitor = null; }
    presentNextOverlay();
    for (const act of actions) act();
  };

  // Unique key per card: consecutive renders of the SAME component type would
  // otherwise reconcile in place and carry the previous card's countdown state.
  react.render(
    React.createElement(next.Component, {
      key: `tg-card-${++overlaySeq}`,
      report: next.report,
      theme: next.theme,
      onBlock: () => settle(next.blockActions),
      onAllow: () => settle(next.allowActions),
    }),
  );

  // Vector-1 failsafe: only the INFECTED card (block is the safe default). If the
  // page suppresses it while pending, force-resolve to BLOCK.
  if (next.Component === OverlayCard) {
    stopSuppressMonitor = startSuppressionMonitor(host, root, () => settle(next.blockActions));
  }
}

function showOverlay(
  key: string,
  Component: typeof OverlayCard | typeof OverlayNotice,
  report: Report,
  theme: Theme,
  onBlock: () => void,
  onAllow: () => void,
): void {
  const existing =
    showingRequest !== null && showingRequest.key === key
      ? showingRequest
      : overlayQueue.find((r) => r.key === key);
  if (existing !== undefined) {
    existing.blockActions.push(onBlock);
    existing.allowActions.push(onAllow);
    return;
  }
  const depth = (showingRequest !== null ? 1 : 0) + overlayQueue.length;
  if (depth >= MAX_QUEUED_CARDS) {
    // Overflow: resolve now so no verdict can outlive the gate's deadline.
    if (Component === OverlayCard) onBlock();
    else onAllow();
    return;
  }
  overlayQueue.push({ key, Component, report, theme, blockActions: [onBlock], allowActions: [onAllow] });
  if (showingRequest === null) presentNextOverlay();
}

// ── bridge core ──────────────────────────────────────────────────────────────

async function startBridge(): Promise<void> {
  const nonce = crypto.randomUUID();
  const host = window.location.hostname;

  let worker: Worker;
  try {
    worker = await spawnEngineWorker();
  } catch (err) {
    console.warn('[TrapGuard] engine worker spawn failed; gate will fail open:', err);
    return;
  }

  // id → { origin, filename } for gate's pending scan. We hold infected ones
  // until the user decides; filename feeds the (metadata-only) scan history.
  const inflight = new Map<string, { origin: string; filename: string }>();

  function sendVerdictToGate(id: string, verdict: import('../src/engine/verdict').Verdict, targetOrigin: string): void {
    const scanVerdict: ScanVerdict = {
      channel: TG_CHANNEL,
      kind: 'scan-verdict',
      nonce,
      id,
      verdict,
      reason: '',
    };
    window.postMessage(scanVerdict, targetOrigin);
  }

  // ── gate-config: tell the MAIN-world gate whether to intercept here ──────────
  async function pushGateConfig(): Promise<void> {
    const { paused, enabled } = await readGateState();
    const active = isInterceptionActive(host, paused, enabled);
    const cfg: GateConfig = { channel: TG_CHANNEL, kind: 'gate-config', nonce, active };
    window.postMessage(cfg, window.location.origin);
  }

  // Re-push whenever the pause flag (local) or the per-host enable map (sync) changes.
  browser.storage.onChanged.addListener((changes, area) => {
    if ((area === 'local' && changes[PAUSE_KEY]) || (area === 'sync' && changes[SITES_ENABLED_KEY])) {
      void pushGateConfig();
    }
  });

  // A dead/crashed worker can never answer: flush every in-flight scan as
  // 'error' (non-blocking → fail open) so uploads resolve immediately instead
  // of hanging until the gate's scan timeout. scan() already catches its own
  // exceptions (INTERNAL report); this only fires on uncaught worker errors.
  worker.addEventListener('error', () => {
    for (const [id, pending] of inflight) {
      sendVerdictToGate(id, 'error', pending.origin);
    }
    inflight.clear();
  });

  worker.addEventListener('message', (event: MessageEvent<WorkerOutbound>) => {
    const data = event.data;
    if (data?.type === 'pong') {
      console.debug('[TrapGuard] engine worker alive:', data);
      return;
    }
    if (data?.type === 'report') {
      const pending = inflight.get(data.id);
      if (pending === undefined) return;
      inflight.delete(data.id);

      // History: metadata only, local-only (see history.ts). Fire-and-forget.
      void appendHistory(entryFromReport(pending.filename, data.report));

      // Only USER-ACTIONABLE file conditions get the error overlay: the file is
      // corrupt, encrypted, or oversized — something the user can fix and decide
      // about. Engine-internal failures (INTERNAL/TIMEOUT/IO/UNSUPPORTED) keep
      // failing open SILENTLY (as before Phase 7): a transient engine throw must
      // never alarm the user or delay an otherwise-fine upload.
      const showNotice =
        data.verdict === 'error' &&
        (data.report.error?.code === 'CORRUPT' ||
          data.report.error?.code === 'ENCRYPTED' ||
          data.report.error?.code === 'OVERSIZED');

      if (data.verdict === 'infected' || showNotice) {
        // Hold the gate verdict — show an overlay (themed), wait for the user.
        //   • infected → OverlayCard (Alert & Reveal, auto-BLOCK default)
        //   • error    → OverlayNotice (corrupt/encrypted/oversized; auto-ALLOW
        //                default per the fail-open doctrine — the upload is for an
        //                UNVERIFIABLE file, never a confirmed threat).
        // A storage read must never swallow the overlay: default to dark on error,
        // otherwise the gate would hang until its fail-open timeout with no UI.
        const isInfected = data.verdict === 'infected';
        const Component = isInfected ? OverlayCard : OverlayNotice;
        // Identity key for coalescing duplicate scans of the same file (the
        // prewarm File vs. its FormData re-wrap) onto one card / one decision.
        const overlayKey = [
          data.verdict,
          data.report.file.path,
          String(data.report.file.size_bytes),
          data.report.error?.code ?? '',
        ].join('|');
        void getTheme()
          .catch((): Theme => 'dark')
          .then((theme) => {
            showOverlay(
              overlayKey,
              Component,
              data.report,
              theme,
              // Block → 'infected' (the only verdict the gate blocks on).
              () => { sendVerdictToGate(data.id, 'infected', pending.origin); },
              // Allow → a non-blocking verdict; keep 'error' honest for the error card.
              () => { sendVerdictToGate(data.id, isInfected ? 'clean' : 'error', pending.origin); },
            );
          });
      } else {
        // Clean / unscannable / engine-internal error: relay immediately.
        sendVerdictToGate(data.id, data.verdict, pending.origin);
      }
    }
  });

  const announce = (): void => {
    const hello: BridgeHello = { channel: TG_CHANNEL, kind: 'bridge-hello', nonce };
    window.postMessage(hello, window.location.origin);
    void pushGateConfig();
  };

  window.addEventListener('message', (event: MessageEvent<unknown>) => {
    if (event.source !== window) return;
    if (!isCrossWorldMessage(event.data)) return;
    const msg = event.data;

    if (msg.kind === 'gate-hello') {
      announce();
      return;
    }

    if (msg.kind === 'scan-request') {
      if (msg.nonce !== nonce) return;
      inflight.set(msg.id, {
        origin: event.origin || window.location.origin,
        filename: msg.file.name,
      });
      const scan: WorkerInbound = { type: 'scan', id: msg.id, file: msg.file };
      worker.postMessage(scan);
    }
  });

  const ping: WorkerInbound = { type: 'ping' };
  worker.postMessage(ping);
  announce();

  console.debug('[TrapGuard] bridge ready (isolated world): relay + overlay + gate-config armed');
}

export default defineContentScript({
  matches: [...SUPPORTED_MATCHES],
  main() {
    void startBridge();
  },
});
