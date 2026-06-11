// Final-Exam F-5 regression: attacker-influenced DISPLAY strings (filenames in
// the overlay header + scan history) are stripped of invisible Unicode
// format/direction controls, killing the classic RTL-override display spoof
// ("gnp.exe" rendered as "exe.png"). The PAYLOAD pipeline stays verbatim
// (Alert & Reveal doctrine) — sanitizeDisplayName is never applied to it.
//
// Control characters are built via String.fromCharCode so this source file
// itself contains no invisible codepoints (the same hazard the engine flags).
import { describe, expect, it } from 'vitest';
import { sanitizeDisplayName } from '../src/overlay/localize';
import { ZERO_WIDTH_CHARS } from '../src/engine/layers/zeroWidth';

const RLO = String.fromCharCode(0x202e); // Right-to-Left Override
const ZWSP = String.fromCharCode(0x200b); // Zero Width Space
const FSI = String.fromCharCode(0x2068); // First Strong Isolate

describe('sanitizeDisplayName (Final-Exam F-5)', () => {
  it('strips the RTL-override display spoof from a filename', () => {
    expect(sanitizeDisplayName(`evil${RLO}fdp.exe`)).toBe('evilfdp.exe');
  });

  it('strips zero-width and isolate controls anywhere in the name', () => {
    expect(sanitizeDisplayName(`a${ZWSP}b${FSI}c.txt`)).toBe('abc.txt');
  });

  it('strips every codepoint in the engine Trojan-Source set', () => {
    for (const c of ZERO_WIDTH_CHARS) {
      expect(sanitizeDisplayName(`x${c}y.pdf`)).toBe('xy.pdf');
    }
  });

  it('passes clean Hebrew and Latin filenames through unchanged', () => {
    expect(sanitizeDisplayName('מטלה 3 - חורף.pdf')).toBe('מטלה 3 - חורף.pdf');
    expect(sanitizeDisplayName('assignment_rubric.pdf')).toBe('assignment_rubric.pdf');
  });
});
