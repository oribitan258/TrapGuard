// Line-level span aggregation — the format-agnostic core of
// engine/trapguard_engine/layers/_aggregate.py.
//
// Shaped text — RTL Hebrew especially, but also justified/kerned Latin from real
// Word/Chrome/LaTeX output — is split into ONE SPAN PER WORD. Checking
// isAdversarial per span then misses every multi-word injection ("בינה
// מלאכותית", "include the word", "in your answer"), because no single word is
// adversarial on its own. These helpers regroup the spans of a line, join them,
// and evaluate the phrase as a whole.
//
// Phase 2 ports the pure join + adversarial-phrase logic, which is reused by the
// upcoming PDF structural layers. The PyMuPDF page traversal (`page.get_text
// ("dict")` → blocks → lines → keep_span → union_bbox) is pdf.js-specific and
// lands in Phase 3 (pdf-worker); it will sit on top of these helpers.
import { isAdversarial } from './keywords';

/** Minimal span shape: only the text matters for adversarial-phrase checks. */
export interface SpanLike {
  text?: string;
}

/**
 * Return (direct, spaced) reconstructions of the spans' text — `_join` in
 * _aggregate.py. `direct` keeps any space spans; `spaced` re-inserts single
 * spaces for PDFs that drop them.
 */
export function joinSpans(spans: readonly SpanLike[]): { direct: string; spaced: string } {
  const direct = spans.map((s) => s.text ?? '').join('').trim();
  const spaced = spans
    .map((s) => (s.text ?? '').trim())
    .filter((t) => t.length > 0)
    .join(' ');
  return { direct, spaced };
}

/**
 * Join the kept spans of a line and return the adversarial phrase, trying the
 * direct reconstruction first then the spaced one (mirrors `adversarial_lines`'
 * per-line decision). Returns null when neither reconstruction is adversarial.
 * A single-span line behaves exactly as the old per-span check.
 */
export function adversarialPhrase(spans: readonly SpanLike[]): string | null {
  const { direct, spaced } = joinSpans(spans);
  if (isAdversarial(direct)) return direct;
  if (isAdversarial(spaced)) return spaced;
  return null;
}
