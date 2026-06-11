// Detect prompt-injection keywords via regex: known adversarial instruction
// patterns matched on the WHOLE LINE (shaped/RTL PDFs split a phrase into one
// span per word, so a jailbreak phrase never lives in a single span). Port of
// layers/regex_keyword.py — patterns copied verbatim (case-insensitive, NO `g`
// flag so `.test`/`.exec` stay stateless).
import type { PdfPageData } from '../extract';
import { unionBbox } from '../lines';
import type { ThreatItem } from '../../schema';

const PATTERNS: RegExp[] = [
  /ignore\s+(all\s+)?previous\s+instructions?/i,
  /disregard\s+(all\s+)?(previous|prior)\s+instructions?/i,
  /do\s+not\s+follow\s+(your\s+)?(previous|prior|original)\s+instructions?/i,
  /forget\s+(all\s+)?previous\s+instructions?/i,
  /you\s+are\s+now\s+a\s+different\s+(AI|assistant|model)/i,
  /act\s+as\s+(if\s+you\s+are\s+)?a?\s*(DAN|jailbreak)/i,
  /DAN\s+mode/i,
  /jailbreak\s+mode/i,
  /system\s+prompt\s+override/i,
  /override\s+(the\s+)?system\s+prompt/i,
];

export function scanRegexKeyword(
  page: PdfPageData,
  pageNum: number,
  extraKeywords?: readonly string[],
): ThreatItem[] {
  const patterns =
    extraKeywords && extraKeywords.length
      ? [...PATTERNS, ...extraKeywords.filter((k) => k.trim()).map((k) => new RegExp(k, 'i'))]
      : PATTERNS;

  const threats: ThreatItem[] = [];
  for (const line of page.onPageLines) {
    const spans = line.spans;
    if (spans.length === 0) continue;
    const lineText = spans.map((s) => s.text).join('').trim();
    if (!lineText) continue;
    for (const pattern of patterns) {
      const match = pattern.exec(lineText);
      if (match) {
        threats.push({
          layer: 'regex_keyword',
          severity: 'high',
          location: { page: pageNum, bbox: unionBbox(spans) },
          extracted_text: lineText,
          details: { pattern: pattern.source, match: match[0] },
        });
        break;
      }
    }
  }
  return threats;
}
