import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { scan } from '../../src/engine/scan';
import type { ThreatItem } from '../../src/engine/schema';

// TEMPORARY bug-hunting differential over the large seeded OOXML stress corpus
// (oracle/generate_ooxml_stress.py). NOT a frozen fixture set — skipped if absent.
interface GoldenEntry {
  file: string;
  verdict: string;
  threats: ThreatItem[];
  error?: { code: string; message: string };
  reason?: string;
}

const here = dirname(fileURLToPath(import.meta.url));
const goldenPath = join(here, 'golden-ooxml-stress.json');
const present = existsSync(goldenPath);
const golden: GoldenEntry[] = present
  ? (JSON.parse(readFileSync(goldenPath, 'utf-8')) as GoldenEntry[])
  : [];

function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stable(obj[k])}`).join(',')}}`;
}

function tuples(threats: readonly ThreatItem[]): string[] {
  return threats
    .map(
      (t) =>
        `${t.layer}|${t.severity}|${stable(t.location)}|${t.extracted_text}|${stable(t.details ?? null)}`,
    )
    .sort();
}

describe.skipIf(!present)('OOXML STRESS differential vs Python oracle', () => {
  it.each(golden.map((g) => [g.file, g] as const))('stress: %s', async (_name, entry) => {
    const bytes = readFileSync(join(here, 'corpus-ooxml-stress', entry.file));
    const file = new File([new Uint8Array(bytes)], entry.file, { type: '' });
    const report = await scan(file);

    expect(report.verdict, `verdict for ${entry.file}`).toBe(entry.verdict);
    if (entry.verdict === 'error') {
      expect(report.error?.code, `error code for ${entry.file}`).toBe(entry.error?.code);
      return;
    }
    expect(tuples(report.threats), `tuples for ${entry.file}`).toEqual(tuples(entry.threats));
    for (const t of report.threats) expect(t.extracted_text.length).toBeGreaterThan(0);
  });
});
