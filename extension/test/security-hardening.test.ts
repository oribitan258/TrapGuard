// Final-Exam security hardening — adversarial-input regression locks.
//
// These tests pin the engine's behaviour against MALICIOUS files (the primary
// in-scope adversary): a professor / attacker crafting a document to crash,
// hang, OOM, or pollution-exploit the scanner. Each test locks a guarantee that
// a future dependency bump or refactor must not silently regress.
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { scan } from '../src/engine/scan';
import { isAdversarial } from '../src/engine/keywords';
import { parseXml } from '../src/engine/ooxml/xml';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

function fileFrom(bytes: Uint8Array, name: string, type: string): File {
  return new File([bytes.slice()], name, { type });
}

describe('H-1 — OOXML decompression bomb is refused (fail-open OVERSIZED, no OOM)', () => {
  it('DOCX whose document.xml declares a huge expansion → OVERSIZED', async () => {
    // 60 MB uncompressed inside a ~60 KB zip — well over the 100 MB-per-entry
    // intent at scale; use a payload above the cap to assert the guard fires.
    const huge = 'A'.repeat(120 * 1024 * 1024); // 120 MB > MAX_ENTRY_UNCOMPRESSED
    const zip = new JSZip();
    zip.file('word/document.xml', huge);
    const bytes = await zip.generateAsync({
      type: 'uint8array',
      compression: 'DEFLATE',
      compressionOptions: { level: 9 },
    });
    expect(bytes.length).toBeLessThan(2 * 1024 * 1024); // genuinely small on disk

    const report = await scan(fileFrom(bytes, 'bomb.docx', DOCX_MIME));
    expect(report.verdict).toBe('error');
    expect(report.error?.code).toBe('OVERSIZED');
    expect(report.threats).toEqual([]); // fail open — never a spurious block
  });

  it('PPTX with an oversized presentation part → OVERSIZED', async () => {
    const huge = 'B'.repeat(120 * 1024 * 1024);
    const zip = new JSZip();
    // presentation.xml is read first; an oversized one trips the guard.
    zip.file('ppt/presentation.xml', huge);
    const bytes = await zip.generateAsync({
      type: 'uint8array',
      compression: 'DEFLATE',
      compressionOptions: { level: 9 },
    });
    const report = await scan(fileFrom(bytes, 'bomb.pptx', PPTX_MIME));
    expect(report.verdict).toBe('error');
    expect(report.error?.code).toBe('OVERSIZED');
  });

  it('a normal small DOCX is unaffected by the cap (no false positive)', async () => {
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      `<?xml version="1.0"?><w:document xmlns:w="x"><w:body><w:p><w:r><w:t>hello</w:t></w:r></w:p></w:body></w:document>`,
    );
    const bytes = await zip.generateAsync({ type: 'uint8array' });
    const report = await scan(fileFrom(bytes, 'ok.docx', DOCX_MIME));
    expect(report.verdict).toBe('clean');
  });
});

describe('H-2 — XML prototype pollution is impossible', () => {
  it('a __proto__ attribute never pollutes Object.prototype', () => {
    const polluted = `<w:body __proto__="x"><w:p constructor="y"/></w:body>`;
    // parseXml may throw (parser rejects the reserved name) — that's fine; the
    // guarantee is that Object.prototype is NEVER mutated.
    try {
      parseXml(polluted);
    } catch {
      /* parser's own prototype-pollution guard — acceptable */
    }
    expect(({} as Record<string, unknown>).x).toBeUndefined();
    expect((Object.prototype as Record<string, unknown>).x).toBeUndefined();
  });

  it('a DOCX carrying a __proto__ attribute scans without crashing or polluting', async () => {
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      `<w:document xmlns:w="x"><w:body __proto__="x"><w:p><w:r><w:t>hi</w:t></w:r></w:p></w:body></w:document>`,
    );
    const bytes = await zip.generateAsync({ type: 'uint8array' });
    const report = await scan(fileFrom(bytes, 'pp.docx', DOCX_MIME));
    // Either a clean parse or a fail-open error — never a throw, never pollution.
    expect(['clean', 'error']).toContain(report.verdict);
    expect(({} as Record<string, unknown>).x).toBeUndefined();
  });
});

describe('H-3 — XML entity expansion (billion-laughs / XXE) does not expand', () => {
  it('DTD-defined entities are not expanded', () => {
    const bomb = `<?xml version="1.0"?>
<!DOCTYPE lolz [
 <!ENTITY lol "lol">
 <!ENTITY lol2 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;">
 <!ENTITY lol3 "&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;">
]>
<w:t>&lol3;</w:t>`;
    const out = JSON.stringify(parseXml(bomb));
    expect(out.length).toBeLessThan(10_000); // no exponential blow-up
    expect(out).not.toContain('lollollol');
  });
});

describe('H-4 — keyword/jailbreak matching is ReDoS-safe (linear)', () => {
  it('isAdversarial stays fast on pathological inputs', () => {
    const inputs = [
      'ignore ' + ' '.repeat(60_000) + 'previous instructions',
      'a'.repeat(300_000),
      'act as ' + 'if you are '.repeat(8_000),
      'AI '.repeat(120_000),
    ];
    const start = performance.now();
    for (const inp of inputs) isAdversarial(inp);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(1000); // linear: well under 1s for all four
  });
});
