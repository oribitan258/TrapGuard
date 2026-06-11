// z_index visual confirmation — the OffscreenCanvas half of "op-list draw-order +
// OffscreenCanvas uniformity" (CLAUDE.md). Port of z_index.py `_region_hidden`:
// render the page and check whether a covered text region comes back
// (near-)uniform. A region buried under an opaque object renders uniform (the
// text is genuinely not visible → hidden → flag); a visible warning on a shaded
// callout renders with text strokes (wide luminance range → NOT hidden → clean).
//
// The engine runs in a Worker (native OffscreenCanvas, no document). pdf.js never
// needs to draw glyphs correctly here: this probe only ever runs on regions an
// opaque object was painted OVER (draw-order pre-filter), so the region is the
// cover's flat color regardless of whether the buried glyphs rendered — making it
// font-data-independent (we ship no standard fonts).
import type { PdfPage } from './pdfjs';
import type { Rect } from './extract';

const UNIFORM_RANGE_MAX = 12; // gray range at/below which a region shows no text

export interface RegionProbe {
  hidden(rect: Rect): boolean;
}

/** Render the page once at 72dpi (scale 1) and return a region-uniformity probe. */
export async function makeRegionProbe(page: PdfPage): Promise<RegionProbe> {
  const viewport = page.getViewport({ scale: 1 });
  const w = Math.max(1, Math.ceil(viewport.width));
  const h = Math.max(1, Math.ceil(viewport.height));
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d', {
    willReadFrequently: true,
  }) as OffscreenCanvasRenderingContext2D | null;
  if (!ctx) return { hidden: () => false };

  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, w, h);
  await page.render({
    canvasContext: ctx as unknown as CanvasRenderingContext2D,
    canvas: canvas as unknown as HTMLCanvasElement,
    viewport,
    background: 'white',
  }).promise;

  return {
    hidden(rect: Rect): boolean {
      const [vx0, vy0, vx1, vy1] = viewport.convertToViewportRectangle(rect);
      const x = Math.max(0, Math.floor(Math.min(vx0, vx1)));
      const y = Math.max(0, Math.floor(Math.min(vy0, vy1)));
      const rw = Math.min(w - x, Math.max(1, Math.ceil(Math.abs(vx1 - vx0))));
      const rh = Math.min(h - y, Math.max(1, Math.ceil(Math.abs(vy1 - vy0))));
      if (rw <= 0 || rh <= 0) return false;
      const data = ctx.getImageData(x, y, rw, rh).data;
      let mn = 255;
      let mx = 0;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i] ?? 0;
        const g = data[i + 1] ?? 0;
        const b = data[i + 2] ?? 0;
        const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
        if (lum < mn) mn = lum;
        if (lum > mx) mx = lum;
      }
      return mx - mn <= UNIFORM_RANGE_MAX;
    },
  };
}
