// Content-type sniffing for binary upload payloads that arrive WITHOUT a
// filename — i.e. the alternative egress sinks (WebSocket / WebRTC / sendBeacon)
// the gate now intercepts (Red-Team Vector 5 remediation). The unified engine
// (`scan()`) picks its detection path from the file EXTENSION, so a raw
// ArrayBuffer/Blob must be given a synthetic name with the right extension via a
// magic-byte sniff, or PDF/OOXML honeypots sent over these transports would be
// scanned as plain text and missed.
//
// Conservative by design: only the unambiguous magic numbers are classified;
// anything else falls back to `.txt` (the engine's text path still catches
// zero-width / keyword payloads). No detection-semantics change — this only
// assigns a name to nameless bytes.

/** Binary sink payloads smaller than this are treated as control/ping frames,
 *  not file uploads, and are NOT scanned (avoids breaking small messaging). */
export const FILE_SINK_MIN_BYTES = 512;

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46]; // "%PDF"
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // "PK\x03\x04" (OOXML container)

function startsWith(bytes: Uint8Array, sig: readonly number[]): boolean {
  if (bytes.length < sig.length) return false;
  for (let i = 0; i < sig.length; i++) if (bytes[i] !== sig[i]) return false;
  return true;
}

/** Naive forward search for an ASCII substring in the bytes (bounded scan). */
function containsAscii(bytes: Uint8Array, ascii: string): boolean {
  const needle = ascii.split('').map((c) => c.charCodeAt(0));
  const limit = bytes.length - needle.length;
  for (let i = 0; i <= limit; i++) {
    let hit = true;
    for (let j = 0; j < needle.length; j++) {
      if (bytes[i + j] !== needle[j]) { hit = false; break; }
    }
    if (hit) return true;
  }
  return false;
}

/**
 * Return a synthetic upload filename whose extension routes the bytes to the
 * correct `scan()` engine path. OOXML (a ZIP) is disambiguated by peeking for a
 * `ppt/` or `word/` member path; an unclassifiable ZIP falls back to `.txt`.
 */
export function sniffUploadName(bytes: Uint8Array): string {
  if (startsWith(bytes, PDF_MAGIC)) return 'upload.pdf';
  if (startsWith(bytes, ZIP_MAGIC)) {
    if (containsAscii(bytes, 'ppt/')) return 'upload.pptx';
    if (containsAscii(bytes, 'word/')) return 'upload.docx';
    return 'upload.txt';
  }
  return 'upload.txt';
}
