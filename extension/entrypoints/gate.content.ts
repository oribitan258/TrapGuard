import { SUPPORTED_MATCHES } from '../src/sites';
import { shouldBlock, type Verdict } from '../src/engine/verdict';
import { sniffUploadName, FILE_SINK_MIN_BYTES } from '../src/sniff';
import {
  TG_CHANNEL,
  isCrossWorldMessage,
  type ScanRequest,
  type GateHello,
} from '../src/protocol';

// ── gate ──────────────────────────────────────────────────────────────────
// MAIN-world content script, injected at document_start (before the page's own
// scripts run) so it can monkeypatch window.fetch + XMLHttpRequest.prototype.send
// AHEAD of any upload. When an upload-shaped request fires, the gate extracts the
// File, holds the request, asks the engine (via the bridge) for a verdict, and:
//   • verdict 'infected' → throw AbortError so the real request NEVER fires.
//   • anything else (incl. timeouts/errors) → release the original request.
//
// The gate blocks ONLY on an explicit 'infected' and fails OPEN otherwise — it
// must never brick a user's uploads (see shouldBlock()).
//
// MUST be injected via the manifest (CSP-exempt), never via a <script> tag —
// ChatGPT/Claude CSP would block injected tags.

const HANDSHAKE_TIMEOUT_MS = 3000;
// Generous timeout: includes engine scan time (~2s) + user reading the overlay
// and clicking block/allow. Overlay cards QUEUE (one at a time, Final-Exam fix
// F-1), each auto-decides within 30s, and the bridge caps held cards at 3
// (MAX_QUEUED_CARDS — overflow resolves immediately), so every verdict lands
// within ~90s, comfortably inside this fail-open deadline. A dead worker never
// waits this long — the bridge flushes in-flight scans as 'error' on a crash.
const SCAN_TIMEOUT_MS = 120_000;

// Document-ish MIME types we treat as scannable uploads. Empty type is allowed
// because presigned PUTs (ChatGPT step 2) frequently omit the content-type.
const DOC_MIME = /pdf|officedocument|msword|ms-powerpoint|text\/plain|text\/markdown|octet-stream/i;
function isDocumentMime(type: string): boolean {
  return type === '' ? true : DOC_MIME.test(type);
}

interface BlockDetail {
  name: string;
  type: string;
  size: number;
  verdict: Verdict;
  ts: number;
}

// Window markers the bridge handshake + E2E harness assert against. The block
// marker + 'trapguard:blocked' event are the ONLY on-demand signals the gate
// emits; the real Alert & Reveal overlay consumes a richer event in Phase 5.
interface GateWindow extends Window {
  __trapguardGate?: { phase: number; ready: boolean };
  __trapguardReady?: boolean;
  __trapguardLastBlock?: BlockDetail;
  __trapguardLastAllow?: { name: string; ts: number };
  // Last interception state pushed by the bridge (Phase 6) — for E2E assertions.
  __trapguardActive?: boolean;
}

function installGate(): void {
  const gw = window as GateWindow;

  // Whether interception is active for this host. Defaults to ON so a slow
  // gate-config can never leave an upload unprotected; the bridge flips it OFF
  // when the site is disabled or TrapGuard is globally paused (Phase 6).
  let interceptionActive = true;

  // ── cross-world handshake state ──────────────────────────────────────────
  let nonce: string | null = null;
  let resolveNonce: ((n: string) => void) | null = null;
  const noncePromise = new Promise<string>((resolve) => {
    resolveNonce = resolve;
  });
  const pendingScans = new Map<string, (verdict: Verdict) => void>();

  window.addEventListener('message', (event: MessageEvent<unknown>) => {
    if (event.source !== window) return;
    if (!isCrossWorldMessage(event.data)) return;
    const msg = event.data;

    if (msg.kind === 'bridge-hello') {
      if (nonce === null) {
        nonce = msg.nonce;
        gw.__trapguardReady = true;
        resolveNonce?.(msg.nonce);
      }
      return;
    }

    if (msg.kind === 'gate-config') {
      if (nonce !== null && msg.nonce !== nonce) return;
      interceptionActive = msg.active;
      gw.__trapguardActive = msg.active;
      return;
    }

    if (msg.kind === 'scan-verdict') {
      if (nonce !== null && msg.nonce !== nonce) return;
      const settle = pendingScans.get(msg.id);
      if (settle) {
        pendingScans.delete(msg.id);
        settle(msg.verdict);
      }
    }
  });

  // Prompt the bridge to (re)announce its nonce in case it came up first.
  const gateHello: GateHello = { channel: TG_CHANNEL, kind: 'gate-hello' };
  window.postMessage(gateHello, window.location.origin);

  // ── verdict request (one in-flight promise per File reference) ────────────
  const verdictCache = new WeakMap<File, Promise<Verdict>>();

  function getVerdict(file: File): Promise<Verdict> {
    let cached = verdictCache.get(file);
    if (cached === undefined) {
      // The returned promise must NEVER reject (fail-open doctrine): a rejection
      // here would make patchedFetch reject with a non-AbortError, and would
      // abandon the XHR deferred-send path — silently DROPPING the upload
      // (fail closed). Any unexpected throw degrades to 'clean' (allow).
      cached = requestVerdict(file).catch((): Verdict => 'clean');
      verdictCache.set(file, cached);
    }
    return cached;
  }

  async function requestVerdict(file: File): Promise<Verdict> {
    const activeNonce = await withTimeout(noncePromise, HANDSHAKE_TIMEOUT_MS);
    if (activeNonce === null) return 'clean'; // bridge never came up → fail open
    const id = crypto.randomUUID();
    return new Promise<Verdict>((resolve) => {
      let settled = false;
      const settle = (verdict: Verdict): void => {
        if (settled) return;
        settled = true;
        pendingScans.delete(id);
        resolve(verdict);
      };
      pendingScans.set(id, settle);
      const request: ScanRequest = {
        channel: TG_CHANNEL,
        kind: 'scan-request',
        nonce: activeNonce,
        id,
        file,
      };
      window.postMessage(request, window.location.origin);
      window.setTimeout(() => settle('clean'), SCAN_TIMEOUT_MS); // fail open
    });
  }

  function markBlocked(file: File, verdict: Verdict): void {
    const detail: BlockDetail = {
      name: file.name,
      type: file.type,
      size: file.size,
      verdict,
      ts: Date.now(),
    };
    gw.__trapguardLastBlock = detail;
    window.dispatchEvent(new CustomEvent<BlockDetail>('trapguard:blocked', { detail }));
  }

  // ── File extraction from request bodies ───────────────────────────────────
  function extractFiles(body: BodyInit | null | undefined, method: string): File[] {
    if (body instanceof FormData) {
      const out: File[] = [];
      for (const value of body.values()) {
        if (value instanceof File && value.size > 0) out.push(value);
      }
      return out;
    }
    if (body instanceof File) {
      return body.size > 0 ? [body] : [];
    }
    if (body instanceof Blob) {
      // Raw Blob with no filename — only the PUT-presigned-blob shape (ChatGPT
      // step 2). Wrap as a File so the engine sees a uniform input.
      if (method === 'PUT' && body.size > 0 && isDocumentMime(body.type)) {
        return [new File([body], 'upload.bin', { type: body.type })];
      }
    }
    return [];
  }

  async function extractFromRequest(req: Request): Promise<File[]> {
    const contentType = req.headers.get('content-type') ?? '';
    const clone = req.clone(); // never consume the caller's body
    if (contentType.includes('multipart/form-data')) {
      const form = await clone.formData();
      const out: File[] = [];
      for (const value of form.values()) {
        if (value instanceof File && value.size > 0) out.push(value);
      }
      return out;
    }
    if (req.method.toUpperCase() === 'PUT' && isDocumentMime(contentType)) {
      const blob = await clone.blob();
      if (blob.size > 0) return [new File([blob], 'upload.bin', { type: blob.type })];
    }
    return [];
  }

  // ── fetch patch ───────────────────────────────────────────────────────────
  const originalFetch: typeof window.fetch = window.fetch.bind(window);

  async function guardFetch(input: RequestInfo | URL, init?: RequestInit): Promise<void> {
    if (!interceptionActive) return; // site disabled / globally paused → pass through
    let files: File[] = [];
    try {
      const method = init?.method
        ? init.method.toUpperCase()
        : input instanceof Request
          ? input.method.toUpperCase()
          : 'GET';
      files = extractFiles(init?.body, method);
      if (files.length === 0 && input instanceof Request && input.body) {
        files = await extractFromRequest(input);
      }
    } catch {
      return; // extraction failure → fail open
    }
    for (const file of files) {
      const verdict = await getVerdict(file);
      if (shouldBlock(verdict)) {
        markBlocked(file, verdict);
        throw new DOMException('Blocked by TrapGuard', 'AbortError');
      }
      gw.__trapguardLastAllow = { name: file.name, ts: Date.now() };
    }
  }

  const patchedFetch: typeof window.fetch = async (input, init) => {
    await guardFetch(input, init);
    return originalFetch(input, init);
  };
  window.fetch = patchedFetch;

  // ── XHR patch ─────────────────────────────────────────────────────────────
  const xhrMethods = new WeakMap<XMLHttpRequest, string>();
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (
    this: XMLHttpRequest,
    method: string,
    url: string | URL,
    async?: boolean,
    username?: string | null,
    password?: string | null,
  ): void {
    xhrMethods.set(this, method.toUpperCase());
    // async omitted → the browser default is true; pass it explicitly because
    // call() only exposes open's full (4-6 arg) overload.
    originalOpen.call(this, method, url, async ?? true, username ?? null, password ?? null);
  };

  XMLHttpRequest.prototype.send = function (
    this: XMLHttpRequest,
    body?: Document | XMLHttpRequestBodyInit | null,
  ): void {
    const method = xhrMethods.get(this) ?? 'GET';
    const normalized = body instanceof Document ? null : (body ?? null);
    let files: File[] = [];
    if (interceptionActive) {
      try {
        files = extractFiles(normalized, method);
      } catch {
        files = [];
      }
    }
    if (files.length === 0) {
      originalSend.call(this, body ?? null);
      return;
    }
    // send() returns synchronously and the network is async anyway, so deferring
    // the real send until the verdict is transparent to the caller.
    void (async () => {
      for (const file of files) {
        const verdict = await getVerdict(file);
        if (shouldBlock(verdict)) {
          markBlocked(file, verdict);
          // Mimic an aborted request — surface error+loadend, never hit network.
          this.dispatchEvent(new ProgressEvent('error'));
          this.dispatchEvent(new ProgressEvent('loadend'));
          return;
        }
        gw.__trapguardLastAllow = { name: file.name, ts: Date.now() };
      }
      originalSend.call(this, body ?? null);
    })();
  };

  // ── alternative egress sinks (Red-Team Vector 5) ─────────────────────────
  // The fetch/XHR patches above cover the documented AI-upload transports. But a
  // site (honest or hostile) could move a file out over WebSocket, a WebRTC
  // DataChannel, or navigator.sendBeacon — all invisible to fetch/XHR. We route
  // FILE-SHAPED binary payloads on those sinks through the SAME scan engine and
  // drop them when infected. Small frames and string payloads (control/ping/JSON)
  // pass through untouched so legitimate messaging is never disturbed.

  // A scannable payload = a binary blob big enough to be a file (not a ping).
  function scannableBlob(data: unknown): Blob | null {
    if (data instanceof Blob) return data.size >= FILE_SINK_MIN_BYTES ? data : null;
    if (data instanceof ArrayBuffer) {
      return data.byteLength >= FILE_SINK_MIN_BYTES ? new Blob([data]) : null;
    }
    if (ArrayBuffer.isView(data)) {
      const view = data as ArrayBufferView;
      return view.byteLength >= FILE_SINK_MIN_BYTES ? new Blob([view as BlobPart]) : null;
    }
    return null; // strings, small/control frames → never scanned
  }

  async function blobIsInfected(blob: Blob): Promise<boolean> {
    try {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const file = new File([blob], sniffUploadName(bytes), {
        type: blob.type || 'application/octet-stream',
      });
      const verdict = await getVerdict(file);
      if (shouldBlock(verdict)) {
        markBlocked(file, verdict);
        return true;
      }
    } catch {
      /* any extraction/scan error → fail OPEN (treat as not-infected) */
    }
    return false;
  }

  // WebSocket: gate file-shaped frames, preserving per-socket send ORDER so a
  // queued scan can't let a later frame overtake an earlier one.
  const wsChains = new WeakMap<WebSocket, Promise<void>>();
  const originalWsSend = WebSocket.prototype.send;
  WebSocket.prototype.send = function (
    this: WebSocket,
    data: string | ArrayBufferLike | Blob | ArrayBufferView,
  ): void {
    if (!interceptionActive) { originalWsSend.call(this, data); return; }
    const blob = scannableBlob(data);
    const prev = wsChains.get(this);
    if (!blob && !prev) { originalWsSend.call(this, data); return; } // fast path
    const run = (prev ?? Promise.resolve()).then(async () => {
      if (blob && (await blobIsInfected(blob))) return; // drop the infected frame
      originalWsSend.call(this, data);
    });
    wsChains.set(this, run.catch(() => undefined));
  };

  // WebRTC DataChannel: same gating (guarded — not present in every context).
  if (typeof RTCDataChannel !== 'undefined') {
    const rtcChains = new WeakMap<RTCDataChannel, Promise<void>>();
    // RTCDataChannel.send is OVERLOADED (separate string/Blob/ArrayBuffer/View
    // signatures); cast to a single-union signature so .call accepts the union.
    const originalRtcSend = RTCDataChannel.prototype.send as (
      this: RTCDataChannel,
      data: string | Blob | ArrayBuffer | ArrayBufferView,
    ) => void;
    RTCDataChannel.prototype.send = function (
      this: RTCDataChannel,
      data: string | Blob | ArrayBuffer | ArrayBufferView,
    ): void {
      if (!interceptionActive) { originalRtcSend.call(this, data); return; }
      const blob = scannableBlob(data);
      const prev = rtcChains.get(this);
      if (!blob && !prev) { originalRtcSend.call(this, data); return; }
      const run = (prev ?? Promise.resolve()).then(async () => {
        if (blob && (await blobIsInfected(blob))) return;
        originalRtcSend.call(this, data);
      });
      rtcChains.set(this, run.catch(() => undefined));
    };
  }

  // navigator.sendBeacon: synchronous-return, fire-and-forget. We can't await,
  // so for a file-shaped payload we scan asynchronously and REPLAY it (best-
  // effort, matching the beacon contract) only if clean; infected is dropped.
  const originalSendBeacon = navigator.sendBeacon?.bind(navigator);
  if (originalSendBeacon) {
    navigator.sendBeacon = function (url: string | URL, data?: BodyInit | null): boolean {
      if (!interceptionActive || data == null) return originalSendBeacon(url, data ?? undefined);
      if (data instanceof FormData) {
        const files = extractFiles(data, 'POST');
        if (files.length === 0) return originalSendBeacon(url, data);
        void (async () => {
          for (const file of files) {
            const verdict = await getVerdict(file);
            if (shouldBlock(verdict)) { markBlocked(file, verdict); return; } // drop
          }
          originalSendBeacon(url, data);
        })();
        return true; // optimistic; delivered async iff clean
      }
      const blob = scannableBlob(data);
      if (!blob) return originalSendBeacon(url, data);
      void (async () => {
        if (!(await blobIsInfected(blob))) originalSendBeacon(url, data);
      })();
      return true;
    };
  }

  // ── capture-phase early grab (pre-warm the verdict cache) ─────────────────
  function prewarm(files: FileList | null | undefined): void {
    if (!interceptionActive) return;
    if (!files) return;
    for (const file of Array.from(files)) {
      if (file.size > 0) void getVerdict(file);
    }
  }
  document.addEventListener(
    'change',
    (event) => {
      const target = event.target;
      if (target instanceof HTMLInputElement && target.type === 'file') prewarm(target.files);
    },
    true,
  );
  document.addEventListener('drop', (event) => prewarm((event as DragEvent).dataTransfer?.files), true);
  document.addEventListener(
    'paste',
    (event) => prewarm((event as ClipboardEvent).clipboardData?.files),
    true,
  );

  Object.defineProperty(window, '__trapguardGate', {
    value: { phase: 1, ready: true },
    writable: false,
    configurable: true,
  });
  console.debug('[TrapGuard] gate installed (MAIN world): fetch+XHR hooked, capture grabs armed');
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => window.setTimeout(() => resolve(null), ms)),
  ]);
}

export default defineContentScript({
  matches: [...SUPPORTED_MATCHES],
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    installGate();
  },
});
