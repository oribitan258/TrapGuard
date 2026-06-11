import { describe, it, expect } from 'vitest';
import { scan } from '../../src/engine/scan';
import { byGroup, fileFor, type ManifestEntry } from './_manifest';

// Tier-1 TWO-CONDITION AND-GATE DOCTRINE (NON-NEGOTIABLE). For every structural
// (non-zero_width) layer, a finding requires BOTH a concealment anomaly AND an
// adversarial keyword:
//   anomaly_only (innocent, concealed)  → clean
//   keyword_only (adversarial, VISIBLE) → clean
//   both                                → infected (the layer fires)
// Neither condition alone is ever a finding.

const AG = byGroup('and_gate');

function byLayer(): Map<string, Record<string, ManifestEntry>> {
  const m = new Map<string, Record<string, ManifestEntry>>();
  for (const e of AG) {
    const layer = e.and_gate!.layer;
    if (!m.has(layer)) m.set(layer, {});
    m.get(layer)![e.and_gate!.role] = e;
  }
  return m;
}

describe('Tier-1 AND-gate: every structural layer needs anomaly + keyword', () => {
  const layers = byLayer();

  it('the matrix is complete — every structural layer has all three roles', () => {
    const expectedLayers = [
      'color_threshold', 'micro_font', 'spatial', 'z_index',
      'white_on_white', 'hidden_attr', 'tiny_font', 'speaker_notes', 'off_slide',
    ];
    for (const layer of expectedLayers) {
      const roles = layers.get(layer);
      expect(roles, `missing AND-gate layer ${layer}`).toBeTruthy();
      for (const role of ['anomaly_only', 'keyword_only', 'both']) {
        expect(roles![role], `${layer} missing role ${role}`).toBeTruthy();
      }
    }
  });

  it.each(AG.map((e) => [e.id, e] as const))('%s', async (_id, entry) => {
    const report = await scan(fileFor(entry));
    const role = entry.and_gate!.role;
    if (role === 'both') {
      expect(report.verdict, `${entry.id}: ${entry.doctrine}`).toBe('infected');
      const fired = new Set(report.threats.map((t) => t.layer));
      expect(fired.has(entry.and_gate!.layer), `${entry.id}: expected ${entry.and_gate!.layer}`).toBe(true);
    } else {
      expect(
        report.verdict,
        `${entry.id}: ${entry.doctrine}\n  unexpected findings: ${JSON.stringify(report.threats)}`,
      ).toBe('clean');
      expect(report.threats).toEqual([]);
    }
  });
});
