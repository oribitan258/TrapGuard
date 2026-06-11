// Shared error reports for the OOXML workers. Mirrors the Python workers'
// error contract: a non-OPC / unparseable package → CORRUPT; any other
// unexpected exception caught at the worker boundary → INTERNAL (docx_worker.py
// / pptx_worker.py wrap the WHOLE _scan in try/except → INTERNAL). Both keep the
// gate fail-open (verdict 'error' is non-infected → the upload is allowed).
import type { ErrorCode, FileInfo, Report } from '../schema';

// Hebrew, user-facing (CLAUDE.md language mandate). Internal enum values English.
const ERR_CORRUPT = 'מבנה הקובץ פגום או לא חוקי';
const ERR_INTERNAL = 'שגיאה פנימית במנוע הסריקה';
const ERR_ENCRYPTED = 'הקובץ מוצפן ולא ניתן לסריקה';
// Decompression-bomb guard (H-1): the file's DECOMPRESSED content is too large
// to scan safely. Reuses the OVERSIZED code/overlay (a user-actionable "too big"
// notice that fails open) — distinct message because the on-disk file itself may
// be small while its declared expansion is enormous.
const ERR_OVERSIZED = 'תוכן הקובץ הדחוס גדול מדי לסריקה בטוחה';

// Password-encrypted OOXML files are NOT ZIP packages: MS Office wraps them in
// an OLE2 / Compound File Binary (CFB) container (an EncryptedPackage stream),
// which begins with this 8-byte signature. JSZip.loadAsync would reject such a
// file as CORRUPT; sniffing the magic first lets us report the accurate
// ENCRYPTED state (and a clearer Hebrew message) instead. (Phase 7.)
const CFB_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] as const;

function errorReport(fileInfo: FileInfo, code: ErrorCode, message: string): Report {
  return {
    ok: false,
    file: fileInfo,
    verdict: 'error',
    threats: [],
    sanitized: false,
    error: { code, message },
  };
}

export function corruptReport(fileInfo: FileInfo): Report {
  return errorReport(fileInfo, 'CORRUPT', ERR_CORRUPT);
}

export function internalErrorReport(fileInfo: FileInfo): Report {
  return errorReport(fileInfo, 'INTERNAL', ERR_INTERNAL);
}

export function encryptedReport(fileInfo: FileInfo): Report {
  return errorReport(fileInfo, 'ENCRYPTED', ERR_ENCRYPTED);
}

export function oversizedReport(fileInfo: FileInfo): Report {
  return errorReport(fileInfo, 'OVERSIZED', ERR_OVERSIZED);
}

/** True if the bytes start with the OLE2/CFB signature (an encrypted OOXML). */
export function isEncryptedOoxml(bytes: Uint8Array): boolean {
  if (bytes.length < CFB_MAGIC.length) return false;
  for (let i = 0; i < CFB_MAGIC.length; i++) {
    if (bytes[i] !== CFB_MAGIC[i]) return false;
  }
  return true;
}
