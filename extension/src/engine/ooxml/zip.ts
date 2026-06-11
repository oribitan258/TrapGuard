// OOXML package (ZIP/OPC) access for the DOCX/PPTX workers (Phase 4).
//
// jszip is pure JS, so it inlines into the single engine.js bundle (same
// constraint as pdf.js). DOCX/PPTX are ZIP containers (OPC); python-{docx,pptx}
// open them via the same package model. A non-ZIP / truncated file makes
// `loadAsync` reject → the worker maps it to a CORRUPT error (fail-open gate).
//
// SECURITY (decompression bomb, Final-Exam hardening H-1): a tiny ZIP can
// declare a multi-GB uncompressed entry (a "zip bomb") — decompressing it would
// OOM the Worker. JSZip decompresses LAZILY (loadAsync only reads the central
// directory; `.async()` inflates), and the entry's DECLARED uncompressed size is
// readable BEFORE inflating. So we reject any entry / package whose declared
// expansion exceeds a generous cap, returning a DecompressionLimitError the
// workers map to a structured OVERSIZED error (fail open) — the file is allowed
// unscanned rather than crashing the Worker. The text parts we actually read
// (document.xml, slide/notes XML, rels) are KB–low-MB in real files, so the cap
// only ever fires on a bomb (zero false positives). NOTE: the declared size is
// attacker-controlled; a falsified central directory could under-report and
// still inflate large — the Worker-crash handler in the bridge is the backstop
// (an OOM kills the Worker → in-flight scans resolve as 'error' → fail open).
import JSZip from 'jszip';

/** Per-entry declared-uncompressed cap. Real OOXML text parts are KB–low-MB. */
const MAX_ENTRY_UNCOMPRESSED = 100 * 1024 * 1024; // 100 MB
/** Cumulative declared-uncompressed cap across every entry we read. */
const MAX_TOTAL_UNCOMPRESSED = 200 * 1024 * 1024; // 200 MB

/** Thrown when a package's declared decompressed size exceeds the caps above. */
export class DecompressionLimitError extends Error {
  constructor(message = 'decompressed size exceeds limit') {
    super(message);
    this.name = 'DecompressionLimitError';
  }
}

/** JSZip stores the declared uncompressed size on the internal `_data`. */
function declaredUncompressedSize(entry: JSZip.JSZipObject): number | null {
  const data = (entry as unknown as { _data?: { uncompressedSize?: unknown } })._data;
  const size = data?.uncompressedSize;
  return typeof size === 'number' && Number.isFinite(size) ? size : null;
}

/** Loaded OPC package — a thin wrapper over the JSZip instance. */
export interface Package {
  /** Read an entry as UTF-8 text, or null if the entry is absent. */
  text(path: string): Promise<string | null>;
  /** True if the entry exists. */
  has(path: string): boolean;
}

export async function loadPackage(data: Uint8Array): Promise<Package> {
  const zip = await JSZip.loadAsync(data);
  // Cumulative budget across all reads on THIS package (shared closure state).
  let totalUncompressed = 0;
  return {
    async text(path: string): Promise<string | null> {
      const entry = zip.file(path);
      if (!entry) return null;
      const declared = declaredUncompressedSize(entry);
      if (declared !== null) {
        if (declared > MAX_ENTRY_UNCOMPRESSED) throw new DecompressionLimitError();
        totalUncompressed += declared;
        if (totalUncompressed > MAX_TOTAL_UNCOMPRESSED) throw new DecompressionLimitError();
      }
      return entry.async('string');
    },
    has(path: string): boolean {
      return zip.file(path) !== null;
    },
  };
}
