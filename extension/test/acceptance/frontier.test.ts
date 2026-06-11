import { describe, it, expect } from 'vitest';
import { scan } from '../../src/engine/scan';
import { byGroup, fileFor, type ManifestEntry } from './_manifest';

// Tier-2 FRONTIER (beyond-spec). These probe the TRUE detection ceiling with
// attacks NOT in the documented vector list: novel jailbreak phrasings, regex
// obfuscation, exotic Unicode, combined evasions. A failure is a BACKLOG
// candidate — fix if reasonable; if genuinely out-of-scope it becomes an
// approved `xfail` (Known Limitation) with a written justification. Entries
// flagged `xfail:true` in the manifest are EXPECTED to currently miss.

const FR = byGroup('frontier');

function expectInfected(entry: ManifestEntry) {
  return async () => {
    const report = await scan(fileFor(entry));
    expect(report.verdict, `${entry.id}: ${entry.doctrine}`).toBe('infected');
    if (entry.expect_layers.length) {
      const fired = new Set(report.threats.map((t) => t.layer));
      for (const layer of entry.expect_layers) {
        expect(fired.has(layer), `${entry.id}: expected ${layer}, got [${[...fired].join(', ')}]`).toBe(true);
      }
    }
  };
}

describe('Tier-2 frontier: beyond-spec attacks (maps the ceiling)', () => {
  for (const entry of FR) {
    if (entry.xfail) {
      it.fails(`${entry.id} (xfail — Known Limitation)`, expectInfected(entry));
    } else {
      it(entry.id, expectInfected(entry));
    }
  }
});
