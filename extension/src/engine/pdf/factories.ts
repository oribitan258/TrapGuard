// pdf.js factories for a DOM-less Web Worker.
//
// The engine runs in a DedicatedWorker (engine.js, blob: URL). A Worker has
// `OffscreenCanvas` + `DOMMatrix` natively but NO `document`, so pdf.js's default
// `DOMCanvasFactory`/`DOMFilterFactory` (which call `document.createElement`)
// would crash. These replacements use `OffscreenCanvas` and never touch the DOM.
//
// In Vitest the same classes run against an `@napi-rs/canvas`-backed
// `OffscreenCanvas` polyfill (see test/differential/pdfjsPolyfill.ts), so the
// engine code path is identical in tests and in production.

/** A pdf.js BaseCanvasFactory that allocates `OffscreenCanvas` instead of DOM. */
export class OffscreenCanvasFactory {
  readonly #enableHWA: boolean;

  constructor({ enableHWA = false }: { enableHWA?: boolean } = {}) {
    this.#enableHWA = enableHWA;
  }

  create(width: number, height: number): { canvas: OffscreenCanvas; context: unknown } {
    if (width <= 0 || height <= 0) throw new Error('Invalid canvas size');
    const canvas = new OffscreenCanvas(width, height);
    return {
      canvas,
      context: canvas.getContext('2d', { willReadFrequently: !this.#enableHWA }),
    };
  }

  reset(cc: { canvas: OffscreenCanvas | null }, width: number, height: number): void {
    if (!cc.canvas) throw new Error('Canvas is not specified');
    if (width <= 0 || height <= 0) throw new Error('Invalid canvas size');
    cc.canvas.width = width;
    cc.canvas.height = height;
  }

  destroy(cc: { canvas: OffscreenCanvas | null; context: unknown }): void {
    if (!cc.canvas) throw new Error('Canvas is not specified');
    cc.canvas.width = cc.canvas.height = 0;
    cc.canvas = null;
    cc.context = null;
  }
}

/**
 * A no-op pdf.js FilterFactory. The default `DOMFilterFactory` lazily creates a
 * `<div>` for SVG filters (blend modes / high-contrast); in a DOM-less Worker
 * that would throw. Our pages (text + opaque fills + images) need no filters, so
 * returning "none" everywhere is correct and keeps the engine document-free.
 */
export class NoopFilterFactory {
  addFilter(): string {
    return 'none';
  }
  addHCMFilter(): string {
    return 'none';
  }
  addAlphaFilter(): string {
    return 'none';
  }
  addLuminosityFilter(): string {
    return 'none';
  }
  addHighlightHCMFilter(): string {
    return 'none';
  }
  addKnockoutFilter(): string {
    return 'none';
  }
  addSelectionHCMFilter(): string {
    return 'none';
  }
  addSelectionFilter(): string {
    return 'none';
  }
  createSelectionStyle(): null {
    return null;
  }
  destroy(): void {
    /* nothing to release */
  }
}
