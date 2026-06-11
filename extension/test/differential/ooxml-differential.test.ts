import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { scan } from '../../src/engine/scan';
import type { ThreatItem } from '../../src/engine/schema';

// DOCX/PPTX differential parity (Phase 4 gate). The frozen corpus-ooxml/ bytes +
// golden-ooxml.json are produced by oracle/generate_ooxml_corpus.py running the
// REAL Python engine (docx_worker.scan / pptx_worker.scan). Here the TS OOXML
// engine (JSZip + fast-xml-parser) re-scans the SAME bytes and must yield the
// IDENTICAL tuple per file.
//
// Unlike the PDF tuple (geometry excluded — coord systems differ), the OOXML
// tuple is FULL: layer | severity | location | extracted_text | details. Both
// engines read the same package XML, so paragraph/run index, slide number, EMU
// coords, and detail fields are deterministic and must match byte-exact.

interface GoldenEntry {
  file: string;
  verdict: string;
  threats: ThreatItem[];
  error?: { code: string; message: string };
  reason?: string;
}

const here = dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(
  readFileSync(join(here, 'golden-ooxml.json'), 'utf-8'),
) as GoldenEntry[];

const MIME: Record<string, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

/** Deterministic JSON with recursively sorted object keys (arrays keep order). */
function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stable(obj[k])}`).join(',')}}`;
}

/** FULL parity tuple per threat. */
function tuples(threats: readonly ThreatItem[]): string[] {
  return threats
    .map(
      (t) =>
        `${t.layer}|${t.severity}|${stable(t.location)}|${t.extracted_text}|${stable(t.details ?? null)}`,
    )
    .sort();
}

describe('OOXML differential parity vs Python oracle', () => {
  it('the corpus covers DOCX + PPTX across every verdict class', () => {
    expect(golden.some((g) => g.file.endsWith('.docx'))).toBe(true);
    expect(golden.some((g) => g.file.endsWith('.pptx'))).toBe(true);
    for (const v of ['infected', 'clean', 'error']) {
      expect(golden.some((g) => g.verdict === v)).toBe(true);
    }
  });

  it.each(golden.map((g) => [g.file, g] as const))('parity: %s', async (_name, entry) => {
    const bytes = readFileSync(join(here, 'corpus-ooxml', entry.file));
    const ext = entry.file.split('.').pop() ?? '';
    const file = new File([new Uint8Array(bytes)], entry.file, { type: MIME[ext] ?? '' });

    const report = await scan(file);

    expect(report.verdict, `verdict for ${entry.file}`).toBe(entry.verdict);

    if (entry.verdict === 'error') {
      expect(report.error?.code, `error code for ${entry.file}`).toBe(entry.error?.code);
      return;
    }

    expect(tuples(report.threats), `tuples for ${entry.file}`).toEqual(tuples(entry.threats));

    // Alert & Reveal invariant: every finding carries a verbatim, non-empty payload.
    for (const t of report.threats) {
      expect(t.extracted_text.length).toBeGreaterThan(0);
    }
  });
});
