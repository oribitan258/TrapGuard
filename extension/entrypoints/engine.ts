// TrapGuard detection engine — Web Worker entrypoint.
//
// Built by WXT as an "unlisted script" → a stable /engine.js at the extension
// root, spawned as a Worker by the isolated-world bridge via a blob: URL.
// (A content-script worker can't `new Worker(runtime.getURL(...))` cross-origin;
// the bridge fetches this bundle and spawns it from a blob: URL that inherits
// the document origin — so engine.js MUST stay ONE self-contained bundle.)
//
// Phase 2: the STUB filename verdict is gone. This worker now runs the real
// unified engine (src/engine/scan.ts) — TXT/MD zero_width detection ported 1:1
// from the Python sidecar — and derives the gate Verdict from the Report. The
// engine is stateless and pure TS (no external deps yet), so it inlines into
// engine.js with no code-split. pdf.js / jszip layers slot in at Phases 3–4.
// There is strictly ONE engine — every upload converges through this worker.
import type { WorkerInbound, WorkerOutbound, ReportMessage } from '../src/engine/messages';
import { scan } from '../src/engine/scan';

const PHASE = 5;

export default defineUnlistedScript(() => {
  // At runtime this runs in a DedicatedWorkerGlobalScope, whose postMessage takes
  // a single argument; the DOM lib types `self` as Window
  // (postMessage(message, targetOrigin)). Narrow it rather than fight the lib.
  const reply = (message: WorkerOutbound): void => {
    (self as unknown as { postMessage(message: unknown): void }).postMessage(message);
  };

  self.addEventListener('message', (event: MessageEvent<WorkerInbound>) => {
    const data = event.data;
    if (data?.type === 'ping') {
      reply({ type: 'pong', engine: 'trapguard', phase: PHASE });
      return;
    }
    if (data?.type === 'scan') {
      const { id, file } = data;
      scan(file)
        .then((report) => {
          // Phase 5: send the full Report so the bridge can render the
          // Alert & Reveal overlay with the verbatim payload. The gate
          // acts only on report.verdict.
          const message: ReportMessage = { type: 'report', id, verdict: report.verdict, report };
          reply(message);
        })
        .catch(() => {
          // Fail OPEN: a scan crash must never block the upload. 'error' allows.
          const errorReport = {
            ok: false,
            file: { path: file.name, type: 'txt' as const, size_bytes: file.size, pages: null },
            verdict: 'error' as const,
            threats: [],
            sanitized: false,
            error: { code: 'INTERNAL' as const, message: `שגיאה פנימית במנוע הסריקה` },
          };
          reply({ type: 'report', id, verdict: 'error', report: errorReport });
        });
    }
  });
});
