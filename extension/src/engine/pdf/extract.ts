// PyMuPDF-equivalent page traversal for pdf.js — the source of truth for the PDF
// layers. PyMuPDF exposes `page.get_text("dict")` → blocks → lines → spans, each
// span carrying {text, color, size, bbox}. pdf.js exposes none of that in one
// call: `getTextContent` lacks color and splits shaped (RTL/kerned) text into
// per-glyph items; the operator list carries color + per-run glyphs but no
// grouping. So we walk the OPERATOR LIST once — tracking the graphics + text
// state machine (CTM, text matrix, font size, fill color) — to rebuild spans
// with {text, color, size, bbox, opIndex}, then group them into lines by
// baseline. This reproduces the oracle's span/line model (verified byte-for-byte
// on the differential corpus, incl. shaped Hebrew where each word is its own
// run and inter-word spaces are their own runs).
import { OPS } from './pdfjs';
import type { PdfPage } from './pdfjs';

type Mat = [number, number, number, number, number, number];
const IDENT: Mat = [1, 0, 0, 1, 0, 0];

function mul(m: Mat, n: Mat): Mat {
  return [
    m[0] * n[0] + m[1] * n[2],
    m[0] * n[1] + m[1] * n[3],
    m[2] * n[0] + m[3] * n[2],
    m[2] * n[1] + m[3] * n[3],
    m[4] * n[0] + m[5] * n[2] + n[4],
    m[4] * n[1] + m[5] * n[3] + n[5],
  ];
}
function apply(m: Mat, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}
function scaleOf(m: Mat): number {
  return Math.hypot(m[2], m[3]) || Math.hypot(m[0], m[1]);
}

/** A native-PDF axis-aligned rect: [x0, y0, x1, y1] (bottom-left origin). */
export type Rect = [number, number, number, number];

/** One reconstructed text span — mirrors a PyMuPDF dict span. */
export interface PdfSpan {
  text: string;
  /** Fill color as RGB 0–255 (the foreground color of the glyphs). */
  color: [number, number, number];
  /** Effective font size in points (font size × text/CTM scale). */
  size: number;
  /** Native bbox [x0, y0, x1, y1] (bottom-left origin). */
  bbox: Rect;
  /** Operator-list index of the showText op — the draw order (z-order). */
  opIndex: number;
}

export interface PdfLine {
  spans: PdfSpan[];
}

export interface PdfImage {
  bbox: Rect;
  opIndex: number;
}

export interface PdfFill {
  bbox: Rect;
  color: [number, number, number];
  /** Fill alpha (graphics-state `ca`); 1 = opaque. */
  alpha: number;
  opIndex: number;
}

export interface PdfPageData {
  /**
   * Lines whose text lies ON the page (intersects the MediaBox). PyMuPDF's
   * `get_text("dict")` clips to the page by default, so the on-page layers
   * (color_threshold, micro_font, z_index, regex_keyword) only ever see these.
   */
  onPageLines: PdfLine[];
  /**
   * ALL lines, including off-page ones. Only the spatial layer looks here — it
   * mirrors PyMuPDF's expanded clip and flags lines that fall OUTSIDE the page.
   */
  lines: PdfLine[];
  images: PdfImage[];
  fills: PdfFill[];
  /** Page rectangle (MediaBox) in native coords. */
  pageRect: Rect;
  /** Length of on-page extracted text, trimmed — 0 ⇒ no text layer. */
  textChars: number;
}

interface Glyph {
  unicode?: string;
  width?: number;
  isSpace?: boolean;
}
function isGlyph(g: unknown): g is Glyph {
  return typeof g === 'object' && g !== null;
}

function parseColorHex(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}
function grayToRgb(g: number): [number, number, number] {
  const v = Math.round(g * 255);
  return [v, v, v];
}
function cmykToRgb(c: number, m: number, y: number, k: number): [number, number, number] {
  return [
    Math.round(255 * (1 - Math.min(1, c + k))),
    Math.round(255 * (1 - Math.min(1, m + k))),
    Math.round(255 * (1 - Math.min(1, y + k))),
  ];
}

function toMat(arg: unknown): Mat {
  const a = arg as ArrayLike<number>;
  return [a[0] ?? 1, a[1] ?? 0, a[2] ?? 0, a[3] ?? 1, a[4] ?? 0, a[5] ?? 0];
}

const FILL_PAINT_OPS = new Set<number>([
  OPS.fill,
  OPS.eoFill,
  OPS.fillStroke,
  OPS.eoFillStroke,
  OPS.closeFillStroke,
  OPS.closeEOFillStroke,
]);

/** Walk the operator list once and rebuild the PyMuPDF-equivalent page model. */
export async function extractPage(page: PdfPage): Promise<PdfPageData> {
  const view = page.view as number[]; // [x0, y0, x1, y1] MediaBox (native)
  const pageRect: Rect = [view[0] ?? 0, view[1] ?? 0, view[2] ?? 0, view[3] ?? 0];
  const opl = await page.getOperatorList();
  const fnArray = opl.fnArray;
  const argsArray = opl.argsArray as unknown[][];

  let ctm: Mat = IDENT;
  const ctmStack: Mat[] = [];
  let tm: Mat = IDENT;
  let tlm: Mat = IDENT;
  let fontSize = 0;
  let charSpacing = 0;
  let wordSpacing = 0;
  let hScale = 1;
  let fill: [number, number, number] = [0, 0, 0];
  let alpha = 1;

  const spans: PdfSpan[] = [];
  const images: PdfImage[] = [];
  const fills: PdfFill[] = [];

  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    const a = argsArray[i] ?? [];
    switch (fn) {
      case OPS.save:
        ctmStack.push(ctm);
        break;
      case OPS.restore:
        ctm = ctmStack.pop() ?? ctm;
        break;
      case OPS.transform:
        ctm = mul(toMat(a), ctm);
        break;
      case OPS.beginText:
        tm = IDENT;
        tlm = IDENT;
        break;
      case OPS.setTextMatrix:
        tm = toMat(a[0]);
        tlm = tm;
        break;
      case OPS.moveText: {
        const tx = Number(a[0] ?? 0);
        const ty = Number(a[1] ?? 0);
        tlm = mul([1, 0, 0, 1, tx, ty], tlm);
        tm = tlm;
        break;
      }
      case OPS.nextLine:
        tlm = mul([1, 0, 0, 1, 0, -fontSize], tlm);
        tm = tlm;
        break;
      case OPS.setCharSpacing:
        charSpacing = Number(a[0] ?? 0);
        break;
      case OPS.setWordSpacing:
        wordSpacing = Number(a[0] ?? 0);
        break;
      case OPS.setHScale:
        hScale = Number(a[0] ?? 100) / 100;
        break;
      case OPS.setFont:
        fontSize = Number(a[1] ?? 0);
        break;
      case OPS.setFillRGBColor:
        fill = parseColorHex(String(a[0] ?? '#000000'));
        break;
      case OPS.setFillGray:
        fill = grayToRgb(Number(a[0] ?? 0));
        break;
      case OPS.setFillCMYKColor:
        fill = cmykToRgb(Number(a[0] ?? 0), Number(a[1] ?? 0), Number(a[2] ?? 0), Number(a[3] ?? 0));
        break;
      case OPS.setGState: {
        // Track fill alpha (`ca`) from the ExtGState array of [key, value] pairs.
        const entries = a[0] as Array<[string, unknown]> | undefined;
        if (Array.isArray(entries)) {
          for (const [k, v] of entries) {
            if (k === 'ca' && typeof v === 'number') alpha = v;
          }
        }
        break;
      }
      case OPS.showText: {
        const glyphs = (a[0] as unknown[]) ?? [];
        const render = mul(tm, ctm);
        const size = fontSize * scaleOf(render);
        const start = apply(render, 0, 0);
        let local: Mat = tm;
        let text = '';
        for (const g of glyphs) {
          if (isGlyph(g)) {
            text += g.unicode ?? '';
            const w0 = (g.width ?? 0) / 1000;
            const adv = (w0 * fontSize + charSpacing + (g.isSpace ? wordSpacing : 0)) * hScale;
            local = mul([1, 0, 0, 1, adv, 0], local);
          } else {
            const adv = (-Number(g) / 1000) * fontSize * hScale;
            local = mul([1, 0, 0, 1, adv, 0], local);
          }
        }
        if (text.length > 0) {
          const end = apply(mul(local, ctm), 0, 0);
          const x0 = Math.min(start[0], end[0]);
          const x1 = Math.max(start[0], end[0]);
          const y = start[1];
          const bbox: Rect = [x0, y - 0.2 * size, x1, y + 0.8 * size];
          spans.push({ text, color: fill, size, bbox, opIndex: i });
        }
        break;
      }
      case OPS.paintImageXObject:
      case OPS.paintInlineImageXObject:
      case OPS.paintImageMaskXObject:
      case OPS.paintImageXObjectRepeat: {
        // The image is drawn in the unit square [0,1]² transformed by the CTM.
        const c0 = apply(ctm, 0, 0);
        const c1 = apply(ctm, 1, 1);
        images.push({
          bbox: [
            Math.min(c0[0], c1[0]),
            Math.min(c0[1], c1[1]),
            Math.max(c0[0], c1[0]),
            Math.max(c0[1], c1[1]),
          ],
          opIndex: i,
        });
        break;
      }
      case OPS.constructPath: {
        const paintOp = Number(a[0]);
        if (!FILL_PAINT_OPS.has(paintOp)) break;
        const mm = a[2] as ArrayLike<number> | undefined;
        if (!mm) break;
        // minMax is the path bbox in user space; map its corners through the CTM.
        const p0 = apply(ctm, mm[0] ?? 0, mm[1] ?? 0);
        const p1 = apply(ctm, mm[2] ?? 0, mm[3] ?? 0);
        fills.push({
          bbox: [
            Math.min(p0[0], p1[0]),
            Math.min(p0[1], p1[1]),
            Math.max(p0[0], p1[0]),
            Math.max(p0[1], p1[1]),
          ],
          color: fill,
          alpha,
          opIndex: i,
        });
        break;
      }
      default:
        break;
    }
  }

  const lines = groupLines(spans);
  const onPageLines = lines.filter((l) => rectsIntersect(unionBboxOf(l.spans), pageRect));
  const onPageText = onPageLines
    .map((l) => l.spans.map((s) => s.text).join(''))
    .join('')
    .trim();
  return { onPageLines, lines, images, fills, pageRect, textChars: onPageText.length };
}

function rectsIntersect(a: Rect, b: Rect): boolean {
  return a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
}

function unionBboxOf(spans: readonly PdfSpan[]): Rect {
  return [
    Math.min(...spans.map((s) => s.bbox[0])),
    Math.min(...spans.map((s) => s.bbox[1])),
    Math.max(...spans.map((s) => s.bbox[2])),
    Math.max(...spans.map((s) => s.bbox[3])),
  ];
}

/** Group spans into lines by baseline Y, preserving operator (reading) order. */
function groupLines(spans: PdfSpan[]): PdfLine[] {
  const buckets = new Map<number, PdfSpan[]>();
  for (const s of spans) {
    const baseline = Math.round(s.bbox[1] + 0.2 * s.size); // recover baseline y
    const key = Math.round(baseline);
    const arr = buckets.get(key);
    if (arr) arr.push(s);
    else buckets.set(key, [s]);
  }
  return [...buckets.values()].map((arr) => ({ spans: arr }));
}
