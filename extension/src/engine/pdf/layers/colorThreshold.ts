// Detect near-invisible text: foreground color within Euclidean distance of the
// white background. Port of layers/color_threshold.py (1:1 constants).
import { adversarialLines } from '../lines';
import type { PdfPageData, PdfSpan } from '../extract';
import type { Severity, ThreatItem } from '../../schema';

const THRESHOLD = 25.0; // RGB Euclidean distance from white below which text is flagged
const BG_RGB: [number, number, number] = [255, 255, 255];

function euclidean(span: PdfSpan): number {
  const [r, g, b] = span.color;
  return Math.sqrt((r - BG_RGB[0]) ** 2 + (g - BG_RGB[1]) ** 2 + (b - BG_RGB[2]) ** 2);
}

function severity(eu: number): Severity {
  return eu < 10.0 ? 'high' : 'medium';
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function scanColorThreshold(page: PdfPageData, pageNum: number): ThreatItem[] {
  const threats: ThreatItem[] = [];
  for (const { phrase, bbox, kept } of adversarialLines(page.onPageLines, (s) => euclidean(s) < THRESHOLD)) {
    const minEu = Math.min(...kept.map(euclidean));
    const fg = kept[0]?.color ?? [0, 0, 0];
    threats.push({
      layer: 'color_threshold',
      severity: severity(minEu),
      location: { page: pageNum, bbox },
      extracted_text: phrase,
      details: { fg_rgb: [...fg], bg_rgb: [...BG_RGB], euclidean: round2(minEu) },
    });
  }
  return threats;
}
