// PDF scan entry — Phase 3. Port of workers/pdf_worker.py `_scan`.
//
// Opens the PDF in-thread via pdf.js (single-bundle, see pdfjs.ts), rebuilds the
// PyMuPDF-equivalent page model per page (extract.ts), runs the 5 layers, and
// derives the verdict. Image-only / no-text-layer PDFs return `unscannable`
// (we cannot read pixels without OCR — never a false "clean"). Encrypted /
// corrupt / empty PDFs return a structured `error` (fail-open at the gate).
import { openPdf } from './pdfjs';
import { extractPage } from './extract';
import { scanColorThreshold } from './layers/colorThreshold';
import { scanMicroFont } from './layers/microFont';
import { scanSpatial } from './layers/spatial';
import { scanZIndex } from './layers/zIndex';
import { scanRegexKeyword } from './layers/regexKeyword';
import type { ErrorCode, FileInfo, Report, ThreatItem } from '../schema';

// Hebrew, user-facing (CLAUDE.md language mandate). Internal enum values stay English.
const IMAGE_ONLY_REASON = 'קובץ מבוסס תמונה — אין שכבת טקסט לסריקה';
const ERR_ENCRYPTED = 'הקובץ מוצפן ולא ניתן לסריקה';
const ERR_CORRUPT = 'מבנה הקובץ פגום או לא חוקי';

export async function scanPdf(file: File, fileInfo: FileInfo): Promise<Report> {
  const data = new Uint8Array(await file.arrayBuffer());
  const loadingTask = openPdf(data);
  let doc;
  try {
    doc = await loadingTask.promise;
  } catch (err) {
    await loadingTask.destroy().catch(() => undefined);
    return errorReport(fileInfo, err);
  }

  try {
    const pageCount = doc.numPages;
    const allThreats: ThreatItem[] = [];
    let textChars = 0;
    let hasImages = false;

    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      const page = await doc.getPage(pageNum);
      const pageData = await extractPage(page);
      textChars += pageData.textChars;
      if (!hasImages && pageData.images.length > 0) hasImages = true;

      // Same order as pdf_worker.py.
      allThreats.push(...scanColorThreshold(pageData, pageNum));
      allThreats.push(...scanMicroFont(pageData, pageNum));
      allThreats.push(...scanSpatial(pageData, pageNum));
      allThreats.push(...(await scanZIndex(pageData, pageNum, page)));
      allThreats.push(...scanRegexKeyword(pageData, pageNum));

      page.cleanup();
    }

    let verdict: Report['verdict'];
    let reason: string | null = null;
    if (allThreats.length > 0) {
      verdict = 'infected';
    } else if (textChars === 0 && hasImages) {
      verdict = 'unscannable';
      reason = IMAGE_ONLY_REASON;
    } else {
      verdict = 'clean';
    }

    const report: Report = {
      ok: true,
      file: { ...fileInfo, pages: pageCount },
      verdict,
      threats: allThreats,
      sanitized: false,
      error: null,
    };
    if (reason !== null) report.reason = reason;
    return report;
  } finally {
    await loadingTask.destroy().catch(() => undefined);
  }
}

function errorReport(fileInfo: FileInfo, err: unknown): Report {
  const name = err && typeof err === 'object' ? (err as { name?: string }).name : undefined;
  const encrypted = name === 'PasswordException';
  const code: ErrorCode = encrypted ? 'ENCRYPTED' : 'CORRUPT';
  return {
    ok: false,
    file: { ...fileInfo, pages: null },
    verdict: 'error',
    threats: [],
    sanitized: false,
    error: { code, message: encrypted ? ERR_ENCRYPTED : ERR_CORRUPT },
  };
}
