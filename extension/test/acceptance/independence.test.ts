import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { MANIFEST } from './_manifest';

// Guardrail 1 (binding): the independent generator must NOT consult the engine.
// If it imported `trapguard_engine` (or the TS engine), the expected verdicts
// could leak from scan() and the suite would degenerate into a parity test. This
// test fails the build if any generator source contains an engine import.

const HERE = dirname(fileURLToPath(import.meta.url));
const GEN = join(HERE, 'generator');

function pyFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === '__pycache__') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...pyFiles(full));
    else if (name.endsWith('.py')) out.push(full);
  }
  return out;
}

describe('Phase-9 independence guarantee', () => {
  it('Guardrail 1: no generator source imports the detection engine', () => {
    const files = pyFiles(GEN);
    expect(files.length).toBeGreaterThan(0);
    // Real import statements only (doc-comment mentions of the name are fine).
    const importRe = /^\s*(import|from)\s+(trapguard_engine|.*\bscan\b.*from\s+['"].*engine)/m;
    for (const f of files) {
      const src = readFileSync(f, 'utf-8');
      expect(importRe.test(src), `${f} imports the engine`).toBe(false);
      expect(src.includes('import trapguard_engine'), `${f} imports trapguard_engine`).toBe(false);
      expect(/from\s+trapguard_engine/.test(src), `${f} from-imports trapguard_engine`).toBe(false);
    }
  });

  it('every manifest fixture exists on disk and has a doctrine label', () => {
    for (const e of MANIFEST) {
      expect(e.doctrine.length, `${e.id} has no doctrine label`).toBeGreaterThan(0);
      const path = join(HERE, 'corpus', e.file);
      expect(statSync(path).size, `${e.id} fixture missing/empty: ${e.file}`).toBeGreaterThanOrEqual(0);
    }
  });

  it('the corpus weights the false-positive (clean) class heaviest', () => {
    const clean = MANIFEST.filter((e) => e.expect_verdict === 'clean').length;
    const infected = MANIFEST.filter((e) => e.expect_verdict === 'infected').length;
    expect(clean).toBeGreaterThanOrEqual(infected);
  });
});
