// Detect micro-font text: font size below threshold (< 2pt), invisible to the
// naked eye. Port of layers/micro_font.py (1:1 constant).
import { adversarialLines } from '../lines';
import type { PdfPageData } from '../extract';
import type { ThreatItem } from '../../schema';

const MIN_SIZE_PT = 2.0;

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function scanMicroFont(page: PdfPageData, pageNum: number): ThreatItem[] {
  const threats: ThreatItem[] = [];
  for (const { phrase, bbox, kept } of adversarialLines(page.onPageLines, (s) => s.size < MIN_SIZE_PT)) {
    const size = Math.min(...kept.map((s) => s.size));
    threats.push({
      layer: 'micro_font',
      severity: 'high',
      location: { page: pageNum, bbox },
      extracted_text: phrase,
      details: { size_pt: round3(size) },
    });
  }
  return threats;
}
