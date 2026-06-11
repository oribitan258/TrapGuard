import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { scan } from '../../src/engine/scan';
import type { ThreatItem } from '../../src/engine/schema';

// TXT/MD differential parity (Phase 2 gate). The frozen corpus/ bytes + golden
// .json are produced by oracle/generate_txt_corpus.py running the REAL Python
// engine (txt_worker.scan). Here the TS engine re-scans the SAME bytes and must
// yield the IDENTICAL verdict + threat list (layer | location | payload) for
// every file. Any divergence fails the build — this is the parity guarantee.

interface GoldenEntry {
  file: string;
  verdict: string;
  threats: ThreatItem[];
}

const here = dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(
  readFileSync(join(here, 'golden.json'), 'utf-8'),
) as GoldenEntry[];

describe('TXT/MD differential parity vs Python oracle', () => {
  it('the corpus is non-trivial (both verdicts represented)', () => {
    expect(golden.length).toBeGreaterThanOrEqual(20);
    expect(golden.some((g) => g.verdict === 'infected')).toBe(true);
    expect(golden.some((g) => g.verdict === 'clean')).toBe(true);
  });

  it.each(golden.map((g) => [g.file, g] as const))(
    'parity: %s',
    async (_name, entry) => {
      const bytes = readFileSync(join(here, 'corpus', entry.file));
      const file = new File([new Uint8Array(bytes)], entry.file, { type: 'text/plain' });

      const report = await scan(file);

      expect(report.verdict).toBe(entry.verdict);
      // Full threat-list parity: layer, severity, location, payload, details —
      // in document order. extracted_text must be the verbatim hidden payload.
      expect(report.threats).toEqual(entry.threats);
      for (const t of report.threats) {
        expect(t.extracted_text.length).toBeGreaterThan(0); // never empty
      }
    },
  );
});
