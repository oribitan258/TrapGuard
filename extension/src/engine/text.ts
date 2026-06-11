// Text decoding + line splitting helpers — faithful to the Python TXT/MD worker
// (engine/trapguard_engine/workers/txt_worker.py).
//
// These two operations decide line numbers and the per-line visible context the
// zero_width layer reports, so they MUST match CPython byte-for-byte to keep the
// differential parity green.

/**
 * Decode `bytes` as UTF-8 the way `path.read_text(encoding="utf-8-sig",
 * errors="replace")` does:
 *  - invalid byte sequences become U+FFFD (TextDecoder's default non-fatal
 *    replace mode == Python `errors="replace"`),
 *  - a SINGLE leading BOM (U+FEFF) is stripped — an encoding artifact emitted by
 *    Notepad / VS Code / Excel on Windows; flagging it is a false positive.
 *
 * `ignoreBOM: true` keeps the BOM in the decoded output so we strip exactly one
 * leading U+FEFF ourselves; any mid-document U+FEFF is preserved and still
 * detected by the zero_width layer (genuine ZWNBSP injection).
 */
export function decodeUtf8StripBom(bytes: Uint8Array): string {
  const raw = new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes);
  return raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
}

// CPython `str.splitlines()` boundary set: LF, CR, CRLF, VT (U+000B), FF
// (U+000C), FS/GS/RS (U+001C–U+001E), NEL (U+0085), LS (U+2028), PS (U+2029).
// CRLF is listed first so it is consumed as one boundary, not two empty lines.
// The FS/GS/RS control codepoints are deliberate (they ARE splitlines
// boundaries); parity depends on them, hence the rule exception.
// eslint-disable-next-line no-control-regex
const LINE_BOUNDARY = /\r\n|[\n\r\v\f\x1C\x1D\x1E\x85\u2028\u2029]/g;

/**
 * Replicate CPython `str.splitlines()`: split on the boundary set above and —
 * unlike `String.prototype.split` — emit NO trailing empty element when the
 * text ends on a boundary (`"a\n".splitlines() == ["a"]`).
 */
export function pythonSplitlines(s: string): string[] {
  const lines: string[] = [];
  let prev = 0;
  LINE_BOUNDARY.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = LINE_BOUNDARY.exec(s)) !== null) {
    lines.push(s.slice(prev, match.index));
    prev = LINE_BOUNDARY.lastIndex;
  }
  if (prev < s.length) lines.push(s.slice(prev));
  return lines;
}
