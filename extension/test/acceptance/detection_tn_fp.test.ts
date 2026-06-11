import { describe, it, expect } from 'vitest';
import { scan } from '../../src/engine/scan';
import { byGroup, fileFor } from './_manifest';

// Tier-1 FALSE-POSITIVE HARDENING (the highest-risk class — weighted heaviest).
// Per the Visible-vs-Hidden Doctrine: visible AI warnings (EN+HE), innocent
// concealed text (AND-gate prerequisite unmet), legit gray/small text, BOM-led
// UTF-8, and near-keyword innocents MUST all be CLEAN. A false positive here is a
// product failure.

const TN = byGroup('tn');

describe('Tier-1 false-positive hardening: innocent docs stay clean', () => {
  it('the TN corpus is the heaviest class (FP risk weighted heaviest)', () => {
    expect(TN.length).toBeGreaterThanOrEqual(30);
  });

  it.each(TN.map((e) => [e.id, e] as const))('%s → clean', async (_id, entry) => {
    const report = await scan(fileFor(entry));
    expect(
      report.verdict,
      `${entry.id}: ${entry.doctrine}\n  unexpected findings: ${JSON.stringify(report.threats)}`,
    ).toBe('clean');
    expect(report.threats).toEqual([]);
  });
});
