// The unified TrapGuard detection engine — the single convergence point for
// every uploaded file (Unified Engine Doctrine). Stateless: scan(file) → Report.
//
// TXT/MD (Phase 2), PDF (Phase 3), and DOCX/PPTX (Phase 4) all converge here.
// TXT/MD is 1:1 with the Python `txt_worker` (zero_width over BOM-stripped,
// CPython-split lines); PDF via pdf.js; DOCX/PPTX via JSZip + fast-xml-parser.
// Every format now has a real scan path — no format fails open by default.
import { scanZeroWidth } from './layers/zeroWidth';
import { decodeUtf8StripBom, pythonSplitlines } from './text';
import { scanPdf } from './pdf/scanPdf';
import { scanDocx } from './ooxml/docx/scanDocx';
import { scanPptx } from './ooxml/pptx/scanPptx';
import type { FileInfo, FileType, Report } from './schema';

function fileTypeFromName(name: string): FileType {
  const lower = name.toLowerCase();
  if (lower.endsWith('.md')) return 'md';
  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.docx')) return 'docx';
  if (lower.endsWith('.pptx')) return 'pptx';
  return 'txt';
}

function isTextFile(type: FileType): boolean {
  return type === 'txt' || type === 'md';
}

// Hard cap on the file we will read into the Worker. Above this we refuse to
// allocate the ArrayBuffer (pdf.js / JSZip would buffer the whole file) and
// return a structured OVERSIZED error — the gate fails open, so the upload is
// allowed unscanned rather than risking an OOM crash in the Worker. 50 MB
// comfortably covers real assignment files (the largest honeypot fixtures are
// a few MB) while bounding memory.
const MAX_FILE_BYTES = 50 * 1024 * 1024;
// Hebrew, user-facing (CLAUDE.md language mandate). Internal enum stays English.
const ERR_OVERSIZED = 'הקובץ גדול מדי לסריקה (מעל 50 מ"ב)';

/** Scan a File and return the full Report. The single engine entry point. */
export async function scan(file: File): Promise<Report> {
  const type = fileTypeFromName(file.name);
  const fileInfo: FileInfo = {
    path: file.name,
    type,
    size_bytes: file.size,
    pages: null,
  };

  // Size guard FIRST — before any arrayBuffer() read — so an oversized file can
  // never OOM the Worker. file.size is metadata; reading it costs nothing.
  if (file.size > MAX_FILE_BYTES) {
    return {
      ok: false,
      file: fileInfo,
      verdict: 'error',
      threats: [],
      sanitized: false,
      error: { code: 'OVERSIZED', message: ERR_OVERSIZED },
    };
  }

  if (isTextFile(type)) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    return scanTextContent(bytes, fileInfo);
  }

  if (type === 'pdf') {
    return scanPdf(file, fileInfo);
  }

  if (type === 'docx') {
    return scanDocx(file, fileInfo);
  }

  if (type === 'pptx') {
    return scanPptx(file, fileInfo);
  }

  // Unreachable: fileTypeFromName only returns the five handled FileTypes.
  return {
    ok: true,
    file: fileInfo,
    verdict: 'clean',
    threats: [],
    sanitized: false,
    error: null,
  };
}

/** TXT/MD scan — mirrors txt_worker._scan (zero_width is the sole TXT layer). */
function scanTextContent(bytes: Uint8Array, fileInfo: FileInfo): Report {
  const content = decodeUtf8StripBom(bytes);
  const lines = pythonSplitlines(content);
  const threats = scanZeroWidth(lines);
  return {
    ok: true,
    file: fileInfo,
    verdict: threats.length > 0 ? 'infected' : 'clean',
    threats,
    sanitized: false,
    error: null,
  };
}
