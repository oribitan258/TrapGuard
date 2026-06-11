// Detect white / near-white text on white background in DOCX runs.
// Port of engine/trapguard_engine/layers/white_on_white.py.
//
// Reads `w:rPr/w:color/@w:val` directly (like the Python layer), computes the
// Euclidean ΔE from white, and gates ΔE<25 AND is_adversarial. ΔE<10 → high.
import { isAdversarial } from '../../../keywords';
import type { Severity, ThreatItem } from '../../../schema';
import { pyRound } from '../../round';
import type { DocxParagraph } from '../model';

const WHITE_THRESHOLD = 25.0;

export function scanWhiteOnWhite(para: DocxParagraph, paraIdx: number): ThreatItem[] {
  const threats: ThreatItem[] = [];
  para.runs.forEach((run, runIdx) => {
    const val = run.colorVal;
    if (!val || val === 'auto' || val.length !== 6) return;
    // Python `int(val[0:2], 16)` rejects ANY non-hex char (raises → skip);
    // JS parseInt partial-parses ("a!"→10), so require pure hex first.
    if (!/^[0-9a-fA-F]{6}$/.test(val)) return;
    const r = parseInt(val.slice(0, 2), 16);
    const g = parseInt(val.slice(2, 4), 16);
    const b = parseInt(val.slice(4, 6), 16);
    const delta = Math.sqrt((255 - r) ** 2 + (255 - g) ** 2 + (255 - b) ** 2);
    if (delta < WHITE_THRESHOLD) {
      const text = run.text.trim();
      if (!isAdversarial(text)) return;
      const severity: Severity = delta < 10.0 ? 'high' : 'medium';
      threats.push({
        layer: 'white_on_white',
        severity,
        location: { paragraph: paraIdx + 1, run: runIdx + 1 },
        extracted_text: text,
        details: { rgb: [r, g, b], euclidean: pyRound(delta, 2) },
      });
    }
  });
  return threats;
}
