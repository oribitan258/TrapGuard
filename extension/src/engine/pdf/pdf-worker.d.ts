// Ambient types for the pdf.js *worker* build, which ships no `.d.ts`.
// We import it ONLY to register `WorkerMessageHandler` on `globalThis` so pdf.js
// runs its parser in-thread (LoopbackPort fake worker) instead of spawning a
// separate Worker — keeping engine.js a single self-contained bundle.
declare module 'pdfjs-dist/build/pdf.worker.mjs' {
  export const WorkerMessageHandler: {
    setup(handler: unknown, port: unknown): void;
  };
}
