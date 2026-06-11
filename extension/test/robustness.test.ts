import { describe, it, expect } from 'vitest';
import { scan } from '../src/engine/scan';

// Phase 7 robustness: corrupt / encrypted / oversized inputs must each return a
// structured `error` Report (verdict 'error', with an error code + Hebrew
// message) and NEVER throw. These feed the overlay's error state.

const CFB_MAGIC = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

function fileOf(bytes: Uint8Array, name: string): File {
  // Copy into a fresh ArrayBuffer-backed view so the BlobPart type is concrete
  // (Uint8Array<ArrayBuffer>, not <ArrayBufferLike>).
  return new File([new Uint8Array(bytes)], name, { type: 'application/octet-stream' });
}

describe('robustness: oversized files', () => {
  it('returns OVERSIZED without reading the bytes (no OOM)', async () => {
    // A mock File over 50 MB whose arrayBuffer() throws if touched — proving the
    // size guard short-circuits BEFORE any allocation.
    const oversized = {
      name: 'huge.pdf',
      size: 50 * 1024 * 1024 + 1,
      arrayBuffer: () => {
        throw new Error('arrayBuffer must not be read for an oversized file');
      },
    } as unknown as File;

    const report = await scan(oversized);
    expect(report.verdict).toBe('error');
    expect(report.ok).toBe(false);
    expect(report.error?.code).toBe('OVERSIZED');
    expect(report.error?.message).toBeTruthy();
  });

  it('a file exactly at the 50 MB limit is still scanned (not oversized)', async () => {
    // At the boundary (== limit, not >) the guard must NOT trip. Use a tiny
    // mock that reports the boundary size but a small buffer so the txt path runs.
    const atLimit = {
      name: 'edge.txt',
      size: 50 * 1024 * 1024,
      arrayBuffer: async () => new Uint8Array([0x68, 0x69]).buffer, // "hi"
    } as unknown as File;

    const report = await scan(atLimit);
    expect(report.verdict).toBe('clean');
    expect(report.error).toBeNull();
  });
});

describe('robustness: password-encrypted OOXML', () => {
  it('encrypted DOCX (OLE2/CFB container) → ENCRYPTED', async () => {
    const report = await scan(fileOf(CFB_MAGIC, 'secret.docx'));
    expect(report.verdict).toBe('error');
    expect(report.error?.code).toBe('ENCRYPTED');
  });

  it('encrypted PPTX (OLE2/CFB container) → ENCRYPTED', async () => {
    const report = await scan(fileOf(CFB_MAGIC, 'secret.pptx'));
    expect(report.verdict).toBe('error');
    expect(report.error?.code).toBe('ENCRYPTED');
  });
});

describe('robustness: corrupt inputs never throw', () => {
  it('a non-ZIP DOCX → CORRUPT', async () => {
    const report = await scan(fileOf(new Uint8Array([1, 2, 3, 4, 5]), 'broken.docx'));
    expect(report.verdict).toBe('error');
    expect(report.error?.code).toBe('CORRUPT');
  });

  it('a non-ZIP PPTX → CORRUPT', async () => {
    const report = await scan(fileOf(new Uint8Array([1, 2, 3, 4, 5]), 'broken.pptx'));
    expect(report.verdict).toBe('error');
    expect(report.error?.code).toBe('CORRUPT');
  });

  it('a non-PDF .pdf → CORRUPT (structured, no throw)', async () => {
    const report = await scan(fileOf(new Uint8Array([1, 2, 3, 4, 5]), 'broken.pdf'));
    expect(report.verdict).toBe('error');
    expect(report.error?.code).toBe('CORRUPT');
  });
});
