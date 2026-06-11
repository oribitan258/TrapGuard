// PDF line aggregation — the pdf.js page-traversal layer on top of the
// format-agnostic core in aggregate.ts (`adversarialPhrase`). Port of
// _aggregate.py `adversarial_lines` / `_union_bbox`: for each line, keep the
// spans satisfying a concealment predicate, join them, and yield a hit when the
// joined phrase is adversarial. A single-span line behaves exactly as a per-span
// check, so existing (Latin, one-span) detections are unchanged.
import { adversarialPhrase } from '../aggregate';
import type { PdfLine, PdfSpan, Rect } from './extract';

export interface LineHit {
  phrase: string;
  bbox: Rect;
  kept: PdfSpan[];
}

export function unionBbox(spans: readonly PdfSpan[]): Rect {
  return [
    Math.min(...spans.map((s) => s.bbox[0])),
    Math.min(...spans.map((s) => s.bbox[1])),
    Math.max(...spans.map((s) => s.bbox[2])),
    Math.max(...spans.map((s) => s.bbox[3])),
  ];
}

export function adversarialLines(lines: readonly PdfLine[], keepSpan: (s: PdfSpan) => boolean): LineHit[] {
  const hits: LineHit[] = [];
  for (const line of lines) {
    const kept = line.spans.filter(keepSpan);
    if (kept.length === 0) continue;
    const phrase = adversarialPhrase(kept);
    if (phrase === null) continue;
    hits.push({ phrase, bbox: unionBbox(kept), kept });
  }
  return hits;
}
