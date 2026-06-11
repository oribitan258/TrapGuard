import { describe, it, expect } from 'vitest';
import { scan } from '../../src/engine/scan';
import { byGroup, fileFor } from './_manifest';

// Tier-1 ROBUSTNESS / FAIL-OPEN. Malformed and unscannable inputs must produce a
// STRUCTURED Report and NEVER throw: corrupt → error/CORRUPT, encrypted →
// error/ENCRYPTED, image-only PDF → unscannable, empty → clean. The gate fails
// open on everything except an explicit `infected`, so a crash would silently
// allow an unscanned upload — robustness IS a security property here.

const RB = byGroup('robustness');

describe('Tier-1 robustness: malformed inputs never throw', () => {
  it.each(RB.map((e) => [e.id, e] as const))('%s → %s', async (_id, entry) => {
    let report: Awaited<ReturnType<typeof scan>> | undefined;
    await expect(
      (async () => {
        report = await scan(fileFor(entry));
      })(),
      `${entry.id}: scan threw — ${entry.doctrine}`,
    ).resolves.toBeUndefined();

    expect(report, 'no report').toBeTruthy();
    expect(report!.verdict, entry.doctrine).toBe(entry.expect_verdict);

    if (entry.expect_verdict === 'error') {
      expect(report!.ok).toBe(false);
      expect(report!.error?.code).toBe(entry.expect_error_code);
      expect(report!.error?.message, 'error message must be present (Hebrew)').toBeTruthy();
    } else {
      // unscannable / clean: no crash, no spurious threats.
      expect(report!.threats).toEqual([]);
    }
  });
});
