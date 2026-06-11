import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { scan } from '../../src/engine/scan';
import type { ThreatItem } from '../../src/engine/schema';

// PDF differential parity (Phase 3 gate). The frozen corpus-pdf/ bytes +
// golden-pdf.json are produced by oracle/generate_pdf_corpus.py running the REAL
// Python engine (pdf_worker.scan). Here the TS pdf.js engine re-scans the SAME
// bytes and must yield the IDENTICAL verdict|layer|payload tuple per file.
//
// Geometry (bbox / euclidean / size_pt) legitimately differs between PyMuPDF
// (top-left coords, own metrics) and pdf.js (bottom-left, own metrics), so per
// CLAUDE.md ("the Python engine's verdict|layer|payload per file is the oracle")
// the parity tuple is verdict + the multiset of {layer, severity, extracted_text}
// per threat, plus error.code for errors and reason-presence for unscannable.

interface GoldenEntry {
  file: string;
  verdict: string;
  threats: ThreatItem[];
  error?: { code: string; message: string };
  reason?: string;
}

const here = dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(readFileSync(join(here, 'golden-pdf.json'), 'utf-8')) as GoldenEntry[];

/** The parity tuple per threat: layer | severity | page | verbatim payload. */
function tuples(threats: readonly ThreatItem[]): string[] {
  return threats.map((t) => `${t.layer}|${t.severity}|p${t.location.page}|${t.extracted_text}`).sort();
}

describe('PDF differential parity vs Python oracle', () => {
  it('the corpus covers every verdict class', () => {
    expect(golden.length).toBeGreaterThanOrEqual(15);
    for (const v of ['infected', 'clean', 'error', 'unscannable']) {
      expect(golden.some((g) => g.verdict === v)).toBe(true);
    }
  });

  it.each(golden.map((g) => [g.file, g] as const))('parity: %s', async (_name, entry) => {
    const bytes = readFileSync(join(here, 'corpus-pdf', entry.file));
    const file = new File([new Uint8Array(bytes)], entry.file, { type: 'application/pdf' });

    const report = await scan(file);

    expect(report.verdict).toBe(entry.verdict);

    if (entry.verdict === 'error') {
      expect(report.error?.code).toBe(entry.error?.code);
      return;
    }

    // verdict|layer|payload parity (geometry excluded — see file header).
    expect(tuples(report.threats)).toEqual(tuples(entry.threats));

    // Alert & Reveal invariant: every finding carries a verbatim, non-empty payload.
    for (const t of report.threats) {
      expect(t.extracted_text.length).toBeGreaterThan(0);
    }

    if (entry.verdict === 'unscannable') {
      expect(report.reason && report.reason.length).toBeTruthy();
    }
  });
});
