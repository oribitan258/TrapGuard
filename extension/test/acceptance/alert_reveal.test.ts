import { describe, it, expect } from 'vitest';
import { scan } from '../../src/engine/scan';
import { infectedEntries, fileFor } from './_manifest';
import type { Report, ThreatItem } from '../../src/engine/schema';

// Tier-1 ALERT & REVEAL + SCHEMA CONTRACT (HIGHEST product priority). Every
// finding must carry the verbatim hidden payload, a correct location for its
// format (page / paragraph / slide / line), a valid layer, and the Report /
// ThreatItem / Verdict shapes must be well-formed. A finding without a readable
// payload is, per CLAUDE.md, a bug.

const VALID_LAYERS = new Set<string>([
  'color_threshold', 'micro_font', 'spatial', 'z_index', 'regex_keyword',
  'hidden_attr', 'white_on_white', 'tiny_font', 'speaker_notes', 'off_slide', 'zero_width',
]);
const VALID_SEVERITY = new Set(['low', 'medium', 'high']);

function assertReportShape(report: Report): void {
  expect(typeof report.ok).toBe('boolean');
  expect(report.file).toBeTruthy();
  expect(typeof report.file.path).toBe('string');
  expect(Array.isArray(report.threats)).toBe(true);
  expect(typeof report.sanitized).toBe('boolean');
}

function assertThreatShape(t: ThreatItem): void {
  expect(VALID_LAYERS.has(t.layer), `invalid layer ${t.layer}`).toBe(true);
  expect(VALID_SEVERITY.has(t.severity), `invalid severity ${t.severity}`).toBe(true);
  expect(t.location && typeof t.location === 'object').toBeTruthy();
  // Alert & Reveal core invariant — the verbatim payload is NEVER empty.
  expect(typeof t.extracted_text).toBe('string');
  expect(t.extracted_text.length).toBeGreaterThan(0);
}

describe('Tier-1 Alert & Reveal: verbatim payload + location + schema', () => {
  it.each(infectedEntries().map((e) => [e.id, e] as const))(
    '%s reveals the hidden instruction with a location',
    async (_id, entry) => {
      const report = await scan(fileFor(entry));
      assertReportShape(report);
      expect(report.verdict).toBe('infected');
      expect(report.threats.length).toBeGreaterThan(0);
      for (const t of report.threats) assertThreatShape(t);

      // The location of at least one finding carries the format's location key
      // (page / paragraph / slide / line) — the user must see WHERE the trap is.
      if (entry.location_key) {
        const located = report.threats.some(
          (t) => entry.location_key! in t.location && t.location[entry.location_key!] != null,
        );
        expect(located, `${entry.id}: no finding carries location key "${entry.location_key}"`).toBe(true);
      }
    },
  );
});
