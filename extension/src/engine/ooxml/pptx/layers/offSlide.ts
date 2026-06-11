// Detect shapes positioned off-slide (negative coordinates) in PPTX.
// Port of engine/trapguard_engine/layers/off_slide.py.
//
// Two-condition AND gate: structural anomaly (left<0 or top<0, both present)
// AND is_adversarial(shape text). Shapes without an xfrm (None coords) or
// without a text frame are skipped.
import { isAdversarial } from '../../../keywords';
import type { ThreatItem } from '../../../schema';
import type { PptxSlide } from '../model';

export function scanOffSlide(slide: PptxSlide, slideNum: number): ThreatItem[] {
  const threats: ThreatItem[] = [];
  for (const shape of slide.shapes) {
    const { left, top } = shape;
    if (left === null || top === null) continue;
    if (left < 0 || top < 0) {
      const text = shape.text;
      if (text === null || !isAdversarial(text)) continue;
      threats.push({
        layer: 'off_slide',
        severity: 'high',
        location: { slide: slideNum, shape_id: shape.shapeId },
        extracted_text: text,
        details: { left_emu: left, top_emu: top },
      });
    }
  }
  return threats;
}
