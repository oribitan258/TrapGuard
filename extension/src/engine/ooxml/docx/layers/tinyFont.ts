// Detect runs with font size below the 2pt threshold (DOCX micro-font injection).
// Port of engine/trapguard_engine/layers/tiny_font.py.
//
// python-docx Font.size returns EMU (= Pt(halfpoints/2)); the layer divides by
// 12700 to get points. Our model already exposes points (halfpoints / 2), so the
// gate is simply sizePt < 2.0 AND is_adversarial.
import { isAdversarial } from '../../../keywords';
import type { ThreatItem } from '../../../schema';
import { pyRound } from '../../round';
import type { DocxParagraph } from '../model';

const TINY_THRESHOLD_PT = 2.0;

export function scanTinyFont(para: DocxParagraph, paraIdx: number): ThreatItem[] {
  const threats: ThreatItem[] = [];
  para.runs.forEach((run, runIdx) => {
    const sizePt = run.sizePt;
    if (sizePt === null) return;
    if (sizePt < TINY_THRESHOLD_PT) {
      const text = run.text.trim();
      if (!isAdversarial(text)) return;
      threats.push({
        layer: 'tiny_font',
        severity: 'high',
        location: { paragraph: paraIdx + 1, run: runIdx + 1 },
        extracted_text: text,
        details: { size_pt: pyRound(sizePt, 4) },
      });
    }
  });
  return threats;
}
