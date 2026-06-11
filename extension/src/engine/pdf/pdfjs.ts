// pdf.js bootstrap for the TrapGuard engine Worker — SINGLE-BUNDLE constraint.
//
// engine.js is spawned from a blob: URL (see entrypoints/engine.ts), which cannot
// reach extension-origin scripts. So pdf.js MUST inline into engine.js with no
// code-split and no separate pdf.worker file.
//
// pdf.js normally offloads parsing to its own Worker (`pdf.worker.mjs`). We avoid
// that by statically importing the worker's `WorkerMessageHandler` and assigning
// it to `globalThis.pdfjsWorker`. pdf.js's PDFWorker then detects a
// "main-thread message handler" and runs the parser IN-THREAD over a LoopbackPort
// (its built-in fake-worker path), SKIPPING the dynamic `import(workerSrc)`
// entirely (see pdf.mjs `_setupFakeWorkerGlobal` / `#mainThreadWorkerMessageHandler`).
// Because engine.js is itself a Worker, running the parser in-thread never blocks
// the page thread — the Unified Engine Doctrine is preserved.
import * as pdfjs from 'pdfjs-dist';
import { WorkerMessageHandler } from 'pdfjs-dist/build/pdf.worker.mjs';
import { OffscreenCanvasFactory, NoopFilterFactory } from './factories';

(globalThis as unknown as { pdfjsWorker?: { WorkerMessageHandler: unknown } }).pdfjsWorker = {
  WorkerMessageHandler,
};

export const { getDocument, OPS } = pdfjs;
export type PdfDocument = Awaited<ReturnType<typeof getDocument>['promise']>;
export type PdfPage = Awaited<ReturnType<PdfDocument['getPage']>>;

// Options not surfaced on the public DocumentInitParameters type but honoured at
// runtime: isEvalSupported (force off — MV3 CSP forbids eval), useWorkerFetch
// (off — 100%-local, never fetch external cmaps/fonts), and the DOM-less
// Canvas/Filter factories.
interface ExtraDocParams {
  isEvalSupported: boolean;
  useWorkerFetch: boolean;
  isOffscreenCanvasSupported: boolean;
  CanvasFactory: unknown;
  FilterFactory: unknown;
}

/** Open a PDF from raw bytes with the worker-safe, CSP-safe, 100%-local config. */
export function openPdf(data: Uint8Array): ReturnType<typeof getDocument> {
  const params: Parameters<typeof getDocument>[0] & ExtraDocParams = {
    data,
    useSystemFonts: false,
    disableFontFace: true,
    isEvalSupported: false,
    useWorkerFetch: false,
    isOffscreenCanvasSupported: true,
    CanvasFactory: OffscreenCanvasFactory,
    FilterFactory: NoopFilterFactory,
  };
  return getDocument(params);
}
