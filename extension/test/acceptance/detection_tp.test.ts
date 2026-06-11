import { describe, it, expect } from 'vitest';
import { scan } from '../../src/engine/scan';
import { byGroup, fileFor } from './_manifest';

// Tier-1 TRUE POSITIVES (independent acceptance). Each fixture is a real document
// that conceals a GENUINELY adversarial instruction via one documented vector.
// Expected verdict/layer/payload come from the generator's doctrine label, NOT
// from the engine. Doctrine: a concealed adversarial instruction → infected, the
// expected layer fires, and the verbatim payload is revealed (Alert & Reveal).

const TP = byGroup('tp');

describe('Tier-1 true positives: concealed honeypots are detected', () => {
  it('the TP corpus spans every format', () => {
    const formats = new Set(TP.map((e) => e.format));
    for (const f of ['txt', 'pdf', 'docx', 'pptx']) {
      expect(formats.has(f as never), `missing TP format ${f}`).toBe(true);
    }
  });

  it.each(TP.map((e) => [e.id, e] as const))('%s → infected', async (_id, entry) => {
    const report = await scan(fileFor(entry));

    expect(report.verdict, `${entry.id}: ${entry.doctrine}`).toBe('infected');

    // The expected layer(s) must be among those that fired (superset allowed —
    // a doc may legitimately trip more than one layer).
    const fired = new Set(report.threats.map((t) => t.layer));
    for (const layer of entry.expect_layers) {
      expect(fired.has(layer), `${entry.id}: expected layer ${layer}, got [${[...fired].join(', ')}]`).toBe(true);
    }

    // Alert & Reveal: at least one finding carries a non-empty payload, and the
    // planted reveal-word (when set) appears verbatim somewhere in the findings.
    expect(report.threats.length).toBeGreaterThan(0);
    for (const t of report.threats) expect(t.extracted_text.length).toBeGreaterThan(0);
    if (entry.payload_substr) {
      const revealed = report.threats.some((t) => t.extracted_text.includes(entry.payload_substr!));
      expect(revealed, `${entry.id}: payload "${entry.payload_substr}" not revealed`).toBe(true);
    }
  });
});
