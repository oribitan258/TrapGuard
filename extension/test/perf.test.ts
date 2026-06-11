import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { scan } from '../src/engine/scan';

// Phase 7 performance pass. Times the engine on deliberately LARGE inputs to
// confirm the Worker parse path stays well under the 3 s budget on a mid-range
// machine. Fixtures are generated out-of-band (see handoff) into test/.perf/
// and are gitignored; the suite self-skips when they are absent so CI stays
// green without them.
//
// Generate locally with:
//   uv --project legacy/engine run python <gen script> extension/test/.perf
//   (200-page PDF + 8000-paragraph DOCX)

const here = dirname(fileURLToPath(import.meta.url));
const PERF_DIR = join(here, '.perf');
const PDF = join(PERF_DIR, 'perf_big.pdf');
const DOCX = join(PERF_DIR, 'perf_big.docx');
const BUDGET_MS = 3000;

const hasFixtures = existsSync(PDF) && existsSync(DOCX);

describe.skipIf(!hasFixtures)('engine performance (large inputs)', () => {
  it(`200-page PDF scans under ${BUDGET_MS}ms`, async () => {
    const file = new File([new Uint8Array(readFileSync(PDF))], 'perf_big.pdf', {
      type: 'application/pdf',
    });
    const t0 = performance.now();
    const report = await scan(file);
    const ms = performance.now() - t0;
    console.log(`[perf] PDF 200pp: ${ms.toFixed(0)}ms verdict=${report.verdict} pages=${report.file.pages}`);
    expect(report.verdict).not.toBe('error');
    expect(ms).toBeLessThan(BUDGET_MS);
  });

  it(`8000-paragraph DOCX scans under ${BUDGET_MS}ms`, async () => {
    const file = new File([new Uint8Array(readFileSync(DOCX))], 'perf_big.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    const t0 = performance.now();
    const report = await scan(file);
    const ms = performance.now() - t0;
    console.log(`[perf] DOCX 8000p: ${ms.toFixed(0)}ms verdict=${report.verdict}`);
    expect(report.verdict).not.toBe('error');
    expect(ms).toBeLessThan(BUDGET_MS);
  });
});
