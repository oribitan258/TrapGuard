// Shared loader for the Phase 9 acceptance suite. Reads the FROZEN, doctrine-
// labelled manifest.json + corpus/** produced by generator/gen_corpus.py and
// exposes typed entries + a File factory. The expectations here come ONLY from
// the manifest (i.e. from the generator's intent labels) — never from scan().
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { Layer, ErrorCode } from '../../src/engine/schema';
import type { Verdict } from '../../src/engine/verdict';

export interface ManifestEntry {
  id: string;
  file: string; // "<format>/<name>" relative to corpus/
  format: 'txt' | 'md' | 'pdf' | 'docx' | 'pptx';
  group: 'tp' | 'tn' | 'and_gate' | 'robustness' | 'frontier';
  tier: 1 | 2;
  expect_verdict: Verdict;
  expect_layers: Layer[];
  payload_substr: string | null;
  location_key: string | null;
  doctrine: string;
  expect_error_code?: ErrorCode;
  and_gate?: { layer: Layer; role: 'anomaly_only' | 'keyword_only' | 'both' };
  xfail?: boolean;
}

const HERE = dirname(fileURLToPath(import.meta.url));
const CORPUS = join(HERE, 'corpus');

export const MANIFEST: ManifestEntry[] = JSON.parse(
  readFileSync(join(HERE, 'manifest.json'), 'utf-8'),
) as ManifestEntry[];

export function byGroup(group: ManifestEntry['group']): ManifestEntry[] {
  return MANIFEST.filter((e) => e.group === group);
}

/** Construct the File the engine will scan, preserving the real extension. */
export function fileFor(entry: ManifestEntry): File {
  const bytes = readFileSync(join(CORPUS, entry.file));
  const name = entry.file.split('/').pop()!;
  return new File([new Uint8Array(bytes)], name, { type: 'application/octet-stream' });
}

/** All fixtures the doctrine labels as `infected` (across every group). */
export function infectedEntries(): ManifestEntry[] {
  return MANIFEST.filter((e) => e.expect_verdict === 'infected' && !e.xfail);
}
