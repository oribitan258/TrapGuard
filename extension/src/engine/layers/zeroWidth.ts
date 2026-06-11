// Zero-width Unicode detection — ported 1:1 from
// engine/trapguard_engine/layers/zero_width.py.
//
// Zero-width chars are always suspicious — no innocent use in student documents.
// This is the SOLE layer without the two-condition AND gate: a zero-width
// codepoint satisfies the structural-anomaly condition by definition and is
// flagged regardless of whether the surrounding text is adversarial. Payload
// includes the visible line context so the UI can show the professor's trap.
import type { ThreatItem } from '../schema';

// Single source of truth for the zero-width codepoint set (8 codepoints), copied
// verbatim from zero_width.py `ZERO_WIDTH_CHARS`. Written as `\u` escapes so the
// codepoints are explicit and never invisible in source.
export const ZERO_WIDTH_CHARS: ReadonlySet<string> = new Set<string>([
  '\u200B', // Zero Width Space        U+200B
  '\u200C', // Zero Width Non-Joiner   U+200C
  '\uFEFF', // BOM / ZWNBSP            U+FEFF
  '\u200D', // Zero Width Joiner       U+200D
  '\u2060', // Word Joiner             U+2060
  '\u200E', // Left-to-Right Mark      U+200E
  '\u200F', // Right-to-Left Mark      U+200F
  '\u2800', // Braille Pattern Blank   U+2800
  // Bidirectional override / embedding / isolate controls ("Trojan Source"
  // class, CVE-2021-42574): reorder displayed text without changing the logical
  // bytes — no innocent use in a student document (Phase 9 / QA-09). Written as
  // \u escapes (not literals): the override codepoints would otherwise reorder
  // these very source lines in an editor.
  '\u202A', // Left-to-Right Embedding  U+202A
  '\u202B', // Right-to-Left Embedding  U+202B
  '\u202C', // Pop Directional Format   U+202C
  '\u202D', // Left-to-Right Override   U+202D
  '\u202E', // Right-to-Left Override   U+202E
  '\u2066', // Left-to-Right Isolate    U+2066
  '\u2067', // Right-to-Left Isolate    U+2067
  '\u2068', // First Strong Isolate     U+2068
  '\u2069', // Pop Directional Isolate  U+2069
]);

/**
 * Scan already-split lines for zero-width codepoints. Mirrors
 * `zero_width.scan_layer`: per line, build the visible context (all zero-width
 * chars stripped, then trimmed), then emit one finding per zero-width codepoint
 * with its 1-based line/col and the reconstructed payload.
 *
 * Iteration is by code point (`for…of` + a manual counter), matching CPython's
 * `enumerate(line)` which indexes by code point, not UTF-16 unit.
 */
export function scanZeroWidth(lines: readonly string[]): ThreatItem[] {
  const threats: ThreatItem[] = [];
  let lineIdx = 0;
  for (const line of lines) {
    const visible = [...line].filter((c) => !ZERO_WIDTH_CHARS.has(c)).join('').trim();
    let colIdx = 0;
    for (const char of line) {
      if (ZERO_WIDTH_CHARS.has(char)) {
        const codepoint = `U+${char.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`;
        const payload = visible ? `${visible} [${codepoint}]` : `[${codepoint}]`;
        threats.push({
          layer: 'zero_width',
          severity: 'high',
          location: { line: lineIdx + 1, col: colIdx + 1, codepoint },
          extracted_text: payload,
          details: { codepoint },
        });
      }
      colIdx++;
    }
    lineIdx++;
  }
  return threats;
}
