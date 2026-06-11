// DOCX scan entry — Phase 4. Port of workers/docx_worker.py `_scan`.
//
// Unzips `word/document.xml`, walks paragraphs/runs (python-docx-equivalent
// model), runs the three DOCX layers per paragraph in the SAME order as the
// oracle, and derives the verdict. The Python worker wraps the WHOLE _scan in
// try/except → INTERNAL, and maps an open failure to CORRUPT; we mirror both so
// a malformed package or a layer-time throw yields a structured error Report
// (fail-open at the gate), never an uncaught exception.
import { loadPackage, DecompressionLimitError } from '../zip';
import {
  corruptReport,
  internalErrorReport,
  encryptedReport,
  oversizedReport,
  isEncryptedOoxml,
} from '../report';
import { parseDocument } from './model';
import { scanHiddenAttr } from './layers/hiddenAttr';
import { scanWhiteOnWhite } from './layers/whiteOnWhite';
import { scanTinyFont } from './layers/tinyFont';
import type { FileInfo, Report, ThreatItem } from '../../schema';

export async function scanDocx(file: File, fileInfo: FileInfo): Promise<Report> {
  let documentXml: string | null;
  try {
    const data = new Uint8Array(await file.arrayBuffer());
    // A password-encrypted DOCX is an OLE2/CFB container, not a ZIP — report it
    // accurately as ENCRYPTED instead of letting JSZip reject it as CORRUPT.
    if (isEncryptedOoxml(data)) return encryptedReport(fileInfo);
    const pkg = await loadPackage(data);
    documentXml = await pkg.text('word/document.xml');
  } catch (err) {
    // A declared decompression bomb → OVERSIZED (fail open), not CORRUPT.
    if (err instanceof DecompressionLimitError) return oversizedReport(fileInfo);
    return corruptReport(fileInfo);
  }
  if (documentXml === null) return corruptReport(fileInfo);

  try {
    const paragraphs = parseDocument(documentXml);
    const allThreats: ThreatItem[] = [];
    paragraphs.forEach((para, paraIdx) => {
      allThreats.push(...scanHiddenAttr(para, paraIdx));
      allThreats.push(...scanWhiteOnWhite(para, paraIdx));
      allThreats.push(...scanTinyFont(para, paraIdx));
    });

    return {
      ok: true,
      file: fileInfo,
      verdict: allThreats.length > 0 ? 'infected' : 'clean',
      threats: allThreats,
      sanitized: false,
      error: null,
    };
  } catch {
    return internalErrorReport(fileInfo);
  }
}
