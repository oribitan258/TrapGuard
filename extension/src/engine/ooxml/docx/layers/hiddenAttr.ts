// Detect hidden runs via the `w:vanish` attribute (DOCX hidden-text injection).
// Port of engine/trapguard_engine/layers/hidden_attr.py.
//
// Two-condition AND gate: structural anomaly (run.font.hidden is True) AND
// is_adversarial(text). A hidden run with innocent text passes silently.
import { isAdversarial } from '../../../keywords';
import type { ThreatItem } from '../../../schema';
import type { DocxParagraph } from '../model';

export function scanHiddenAttr(para: DocxParagraph, paraIdx: number): ThreatItem[] {
  const threats: ThreatItem[] = [];
  para.runs.forEach((run, runIdx) => {
    if (run.hidden === true) {
      const text = run.text.trim();
      if (!isAdversarial(text)) return;
      threats.push({
        layer: 'hidden_attr',
        severity: 'high',
        location: { paragraph: paraIdx + 1, run: runIdx + 1 },
        extracted_text: text,
        details: { attribute: 'w:vanish' },
      });
    }
  });
  return threats;
}
