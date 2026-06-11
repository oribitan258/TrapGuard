// Detect text buried under an overlapping opaque object (z-index stacking). Port
// of layers/z_index.py via "op-list draw-order + OffscreenCanvas uniformity":
//   * raster images — text under an opaque image block (taken as opaque), and
//   * opaque vector fills — text under a solid filled rect.
// The vector path is z-order-ambiguous from geometry alone (a fill could be a
// legit highlight BEHIND the text). It is resolved by (1) draw order — the fill
// must be painted AFTER the text to bury it — and (2) a visual render: the buried
// region must come back (near-)uniform (see render.ts). A visible warning ON a
// shaded callout box is painted BEFORE its fill is... no: its fill is painted
// FIRST and the text on top, so draw-order excludes it and it stays clean —
// preserving the visible-vs-hidden doctrine.
import { adversarialLines } from '../lines';
import { makeRegionProbe } from '../render';
import type { RegionProbe } from '../render';
import type { PdfPageData, PdfImage, PdfFill, Rect } from '../extract';
import type { PdfPage } from '../pdfjs';
import type { ThreatItem } from '../../schema';

const COVER_RATIO = 0.5; // span must be >= 50% covered by the object to flag
const OPAQUE_MIN = 0.85; // fill opacity at/above which a shape conceals
const PAGE_FILL_MAX = 0.85; // fills larger than this fraction of the page are backgrounds

function area(r: Rect): number {
  return Math.max(0, r[2] - r[0]) * Math.max(0, r[3] - r[1]);
}

function covers(obj: Rect, target: Rect): boolean {
  const ta = area(target);
  if (ta <= 0) return false;
  const ox0 = Math.max(obj[0], target[0]);
  const oy0 = Math.max(obj[1], target[1]);
  const ox1 = Math.min(obj[2], target[2]);
  const oy1 = Math.min(obj[3], target[3]);
  if (ox1 <= ox0 || oy1 <= oy0) return false;
  return ((ox1 - ox0) * (oy1 - oy0)) / ta >= COVER_RATIO;
}

function coverAfter<T extends { bbox: Rect; opIndex: number }>(
  rects: readonly T[],
  region: Rect,
  afterOp: number,
): T | undefined {
  return rects.find((r) => r.opIndex > afterOp && covers(r.bbox, region));
}

export async function scanZIndex(
  page: PdfPageData,
  pageNum: number,
  pdfPage: PdfPage,
): Promise<ThreatItem[]> {
  const images: PdfImage[] = page.images;
  const pageArea = area(page.pageRect) || 1;
  const fills: PdfFill[] = page.fills.filter(
    (f) => f.alpha >= OPAQUE_MIN && area(f.bbox) > 0 && area(f.bbox) / pageArea < PAGE_FILL_MAX,
  );
  if (images.length === 0 && fills.length === 0) return [];

  // A span is buried when an opaque object painted AFTER it covers >= 50%.
  const coveredSpan = (s: { bbox: Rect; opIndex: number }): boolean =>
    coverAfter(images, s.bbox, s.opIndex) !== undefined ||
    coverAfter(fills, s.bbox, s.opIndex) !== undefined;

  let probe: RegionProbe | null = null;
  const threats: ThreatItem[] = [];
  for (const { phrase, bbox, kept } of adversarialLines(page.onPageLines, coveredSpan)) {
    const afterOp = Math.max(...kept.map((s) => s.opIndex));
    let coverKind: 'image' | 'shape' | null = null;
    let coverRect: Rect | null = null;

    const img = coverAfter(images, bbox, afterOp);
    if (img) {
      coverKind = 'image';
      coverRect = img.bbox;
    } else {
      const fr = coverAfter(fills, bbox, afterOp);
      if (fr) {
        probe ??= await makeRegionProbe(pdfPage);
        if (probe.hidden(bbox)) {
          coverKind = 'shape';
          coverRect = fr.bbox;
        }
      }
    }

    if (coverKind === null || coverRect === null) continue;
    threats.push({
      layer: 'z_index',
      severity: 'high',
      location: { page: pageNum, bbox },
      extracted_text: phrase,
      details: { cover_kind: coverKind, covering_bbox: [...coverRect] },
    });
  }
  return threats;
}
