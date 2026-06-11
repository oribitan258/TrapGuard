// Detect off-MediaBox text: spans positioned entirely outside the visible page
// area. Port of layers/spatial.py. PyMuPDF expands the clip to harvest off-page
// text; pdf.js's operator list already contains every op regardless of clip, so
// we simply test each span against the page rect. Coordinates are pdf.js-native
// (bottom-left); PyMuPDF is top-left — irrelevant here since the check is a pure
// rectangle intersection in one consistent space.
import { adversarialLines } from '../lines';
import type { PdfPageData, Rect } from '../extract';
import type { ThreatItem } from '../../schema';

function intersects(a: Rect, b: Rect): boolean {
  return a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
}

export function scanSpatial(page: PdfPageData, pageNum: number): ThreatItem[] {
  const pageRect = page.pageRect;
  const offPage = (s: { bbox: Rect }): boolean => !intersects(s.bbox, pageRect);

  const threats: ThreatItem[] = [];
  for (const { phrase, bbox } of adversarialLines(page.lines, offPage)) {
    threats.push({
      layer: 'spatial',
      severity: 'high',
      location: { page: pageNum, bbox },
      extracted_text: phrase,
      details: { page_rect: [...pageRect], span_bbox: [...bbox] },
    });
  }
  return threats;
}
