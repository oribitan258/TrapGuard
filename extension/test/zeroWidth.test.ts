import { describe, it, expect } from 'vitest';
import { ZERO_WIDTH_CHARS, scanZeroWidth } from '../src/engine/layers/zeroWidth';
import { decodeUtf8StripBom, pythonSplitlines } from '../src/engine/text';

// Zero-width / bidi-control codepoints built from char codes so no invisible
// literal lands in this source file. These are the members of ZERO_WIDTH_CHARS:
// the original 8 zero-width set + the 9 bidi-override controls (Phase 9 / QA-09).
const cp = (n: number): string => String.fromCharCode(n);
const ZWSP = cp(0x200b);
const ZWNJ = cp(0x200c);
const BOM = cp(0xfeff);
const ZWJ = cp(0x200d);
const WJ = cp(0x2060);
const LRM = cp(0x200e);
const RLM = cp(0x200f);
const BRAILLE = cp(0x2800);
// Bidirectional override / embedding / isolate controls ("Trojan Source").
const BIDI = [0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069].map(cp);
const ALL_CODEPOINTS = [ZWSP, ZWNJ, BOM, ZWJ, WJ, LRM, RLM, BRAILLE, ...BIDI];

describe('ZERO_WIDTH_CHARS', () => {
  it('is exactly the 17 codepoints from zero_width.py (8 zero-width + 9 bidi)', () => {
    expect(ZERO_WIDTH_CHARS.size).toBe(17);
    for (const c of ALL_CODEPOINTS) expect(ZERO_WIDTH_CHARS.has(c)).toBe(true);
  });
});

describe('decodeUtf8StripBom', () => {
  const enc = new TextEncoder();

  it('strips a single leading UTF-8 BOM (EF BB BF)', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...enc.encode('hello')]);
    expect(decodeUtf8StripBom(bytes)).toBe('hello');
  });

  it('strips only ONE leading BOM — a second U+FEFF is preserved', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, 0xef, 0xbb, 0xbf, ...enc.encode('x')]);
    expect(decodeUtf8StripBom(bytes)).toBe(`${BOM}x`);
  });

  it('preserves a mid-document U+FEFF (genuine ZWNBSP injection)', () => {
    const bytes = enc.encode(`ab${BOM}cd`);
    expect(decodeUtf8StripBom(bytes)).toBe(`ab${BOM}cd`);
  });

  it('replaces invalid bytes with U+FFFD (errors="replace" parity)', () => {
    const bytes = new Uint8Array([0xff, 0xfe, 0x41]); // invalid, then "A"
    expect(decodeUtf8StripBom(bytes)).toContain('A');
    expect(decodeUtf8StripBom(bytes)).toContain('�');
  });
});

describe('pythonSplitlines', () => {
  it('drops the trailing empty element after a final newline', () => {
    expect(pythonSplitlines('a\n')).toEqual(['a']);
  });
  it('keeps interior empty lines', () => {
    expect(pythonSplitlines('a\n\nb')).toEqual(['a', '', 'b']);
  });
  it('empty string yields no lines', () => {
    expect(pythonSplitlines('')).toEqual([]);
  });
  it('handles CRLF as one boundary', () => {
    expect(pythonSplitlines('a\r\nb\r\n')).toEqual(['a', 'b']);
  });
  it('keeps a final line that has no newline', () => {
    expect(pythonSplitlines('a\nb')).toEqual(['a', 'b']);
  });
});

describe('scanZeroWidth', () => {
  it('returns no threats for a clean line', () => {
    expect(scanZeroWidth(['a perfectly ordinary line'])).toEqual([]);
  });

  it('detects each codepoint with the correct U+XXXX', () => {
    for (const c of ALL_CODEPOINTS) {
      const threats = scanZeroWidth([`ab${c}cd`]);
      expect(threats).toHaveLength(1);
      const t = threats[0]!;
      expect(t.layer).toBe('zero_width');
      expect(t.severity).toBe('high');
      const expected = `U+${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`;
      expect(t.location).toEqual({ line: 1, col: 3, codepoint: expected });
      expect(t.details).toEqual({ codepoint: expected });
      // visible context = line with zero-width stripped, then payload suffix.
      expect(t.extracted_text).toBe(`abcd [${expected}]`);
    }
  });

  it('reports 1-based line and col across multiple lines', () => {
    const threats = scanZeroWidth(['clean', `x${ZWSP}y`]);
    expect(threats).toHaveLength(1);
    expect(threats[0]!.location).toEqual({ line: 2, col: 2, codepoint: 'U+200B' });
  });

  it('emits one finding per zero-width char on a line', () => {
    const threats = scanZeroWidth([`${ZWSP}a${ZWSP}`]);
    expect(threats).toHaveLength(2);
    expect(threats.map((t) => t.location['col'])).toEqual([1, 3]);
  });

  it('uses bracket-only payload when the line is all zero-width', () => {
    const threats = scanZeroWidth([ZWSP]);
    expect(threats[0]!.extracted_text).toBe('[U+200B]');
  });
});
