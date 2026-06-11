// Detect prompt-injection keywords in PPTX speaker notes.
// Port of engine/trapguard_engine/layers/speaker_notes.py.
//
// Three ordered paths, each emitting at most ONE finding per slide (the Python
// layer returns on the first hit):
//   1. jailbreak raw patterns (over the original notes text)
//   2. jailbreak collapsed patterns (over alpha-only text — defeats spacing)
//   3. is_adversarial fallback (academic-style injections)
// `details.pattern`/`match`/`scan` are part of the full OOXML parity tuple, so
// the pattern source strings are copied VERBATIM from the Python layer.
import { isAdversarial } from '../../../keywords';
import type { ThreatItem } from '../../../schema';
import type { PptxSlide } from '../model';

const RAW_SOURCES: string[] = [
  'ignore\\s+(all\\s+)?previous\\s+instructions?',
  'disregard\\s+(all\\s+)?(previous|prior)\\s+instructions?',
  'do\\s+not\\s+follow\\s+(your\\s+)?(previous|prior|original)\\s+instructions?',
  'forget\\s+(all\\s+)?previous\\s+instructions?',
  'you\\s+are\\s+now\\s+a\\s+different\\s+(AI|assistant|model)',
  'act\\s+as\\s+(if\\s+you\\s+are\\s+)?a?\\s*(DAN|jailbreak)',
  'DAN\\s+mode',
  'jailbreak\\s+mode',
  'system\\s+prompt\\s+override',
  'override\\s+(the\\s+)?system\\s+prompt',
];

const COLLAPSED_SOURCES: string[] = [
  'ignore(all)?previousinstructions?',
  'disregard(all)?(previous|prior)instructions?',
  'donotfollow(your)?(previous|prior|original)instructions?',
  'forget(all)?previousinstructions?',
  'youarenowadifferent(ai|assistant|model)',
  'actasa?(dan|jailbreak)',
  'danmode',
  'jailbreakmode',
  'systempromptoverride',
  'override(the)?systemprompt',
];

interface Pat {
  source: string;
  re: RegExp;
}

const RAW: Pat[] = RAW_SOURCES.map((s) => ({ source: s, re: new RegExp(s, 'i') }));
const COLLAPSED: Pat[] = COLLAPSED_SOURCES.map((s) => ({ source: s, re: new RegExp(s, 'i') }));

export function scanSpeakerNotes(slide: PptxSlide, slideNum: number): ThreatItem[] {
  const threats: ThreatItem[] = [];
  const text = slide.notesText;
  if (text === null) return threats;
  if (!text.trim()) return threats;

  // Path 1: jailbreak raw patterns.
  for (const p of RAW) {
    const m = p.re.exec(text);
    if (m) {
      threats.push({
        layer: 'speaker_notes',
        severity: 'high',
        location: { slide: slideNum, shape_id: null },
        extracted_text: text.trim(),
        details: { pattern: p.source, match: m[0], scan: 'raw' },
      });
      return threats;
    }
  }

  // Path 2: jailbreak collapsed (alpha-only) patterns.
  const collapsed = text.replace(/[^a-zA-Z]/g, '');
  if (collapsed) {
    for (const p of COLLAPSED) {
      const m = p.re.exec(collapsed);
      if (m) {
        threats.push({
          layer: 'speaker_notes',
          severity: 'high',
          location: { slide: slideNum, shape_id: null },
          extracted_text: text.trim(),
          details: { pattern: p.source, match: m[0], scan: 'collapsed' },
        });
        return threats;
      }
    }
  }

  // Path 3: academic-style injection.
  if (isAdversarial(text)) {
    threats.push({
      layer: 'speaker_notes',
      severity: 'high',
      location: { slide: slideNum, shape_id: null },
      extracted_text: text.trim(),
      details: { scan: 'adversarial_keywords' },
    });
  }

  return threats;
}
