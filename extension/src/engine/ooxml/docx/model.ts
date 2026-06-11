// DOCX document model — a faithful, minimal port of the python-docx accessors
// the layers depend on (Document.paragraphs, Paragraph.runs, Run.text,
// Font.hidden, Font.size, and the raw `w:rPr/w:color` lookup white_on_white
// reads directly).
//
// Document.paragraphs == direct `w:p` children of `w:body` (CT_Body.p_lst).
// Paragraph.runs      == direct `w:r` children of `w:p`   (CT_P.r_lst).
// We read the SAME `word/document.xml` bytes the oracle reads, so paragraph/run
// indices coincide automatically.
import { attr, childrenNamed, firstChild, parseXml, type XmlNode } from '../xml';

export interface DocxRun {
  /** python-docx Run.text — inner-content elements mapped to their text. */
  text: string;
  /** python-docx Font.hidden (`w:rPr/w:vanish` OnOff) — null if unset. */
  hidden: boolean | null;
  /** Font size in points (`w:rPr/w:sz` half-points / 2) — null if unset. */
  sizePt: number | null;
  /** Raw `w:rPr/w:color/@w:val` (white_on_white reads this directly) — or null. */
  colorVal: string | null;
}

export interface DocxParagraph {
  runs: DocxRun[];
}

// ST_OnOff per python-docx: absent attr → True (OptionalAttribute default);
// present → True only for exactly "1"/"true"/"on" (CASE-SENSITIVE), False for
// "0"/"false"/"off". A non-canonical value makes python-docx RAISE (→ the file
// scans as 'error', fail-open → allowed); we map it to False (not hidden →
// non-infected → also allowed), so the gate outcome matches and we never raise a
// false-positive block on a malformed attribute.
const ON_VALUES = new Set(['1', 'true', 'on']);

function onOff(node: XmlNode): boolean {
  const val = attr(node, 'w:val');
  if (val === undefined) return true;
  return ON_VALUES.has(val);
}

// ST_HpsMeasure.convert_from_xml: a value containing 'm'/'n'/'p' is a universal
// measure ("1pt", "2mm"); otherwise Pt(int(str)/2). python-docx `int()` rejects
// non-integers (e.g. "3.0") → the file errors (fail-open). We return null for
// anything python-docx wouldn't cleanly turn into a size (→ layer skips → also
// fail-open), and the real numeric/universal cases byte-match.
const UNIVERSAL_EMU_PER_UNIT: Record<string, number> = {
  mm: 36000,
  cm: 360000,
  in: 914400,
  pt: 12700,
  pc: 152400,
  pi: 152400,
};
const EMU_PER_PT = 12700;

function sizePtFromVal(szVal: string): number | null {
  if (/[mnp]/.test(szVal)) {
    const unit = szVal.slice(-2);
    const mult = UNIVERSAL_EMU_PER_UNIT[unit];
    if (mult === undefined) return null;
    const quantity = Number(szVal.slice(0, -2));
    if (!Number.isFinite(quantity)) return null;
    const emu = Math.round(quantity * mult); // Python int(round(...))
    return emu / EMU_PER_PT;
  }
  if (!/^[0-9]+$/.test(szVal)) return null; // int() would raise on non-integer
  return Number(szVal) / 2;
}

/** Run.text: concat of `w:br|w:cr|w:noBreakHyphen|w:ptab|w:t|w:tab` in order. */
function runText(r: XmlNode): string {
  let out = '';
  for (const c of r.children) {
    switch (c.name) {
      case 'w:t':
        out += c.text;
        break;
      case 'w:tab':
      case 'w:ptab':
        out += '\t';
        break;
      case 'w:cr':
        out += '\n';
        break;
      case 'w:br': {
        // CT_Br: textWrapping (default) → "\n"; page/column → "".
        const type = attr(c, 'w:type') ?? 'textWrapping';
        out += type === 'textWrapping' ? '\n' : '';
        break;
      }
      case 'w:noBreakHyphen':
        out += '-';
        break;
      default:
        break;
    }
  }
  return out;
}

function parseRun(r: XmlNode): DocxRun {
  const rPr = firstChild(r, 'w:rPr');
  let hidden: boolean | null = null;
  let sizePt: number | null = null;
  let colorVal: string | null = null;
  if (rPr !== undefined) {
    const vanish = firstChild(rPr, 'w:vanish');
    if (vanish !== undefined) hidden = onOff(vanish);

    const sz = firstChild(rPr, 'w:sz');
    const szVal = sz !== undefined ? attr(sz, 'w:val') : undefined;
    if (szVal !== undefined) sizePt = sizePtFromVal(szVal);

    const color = firstChild(rPr, 'w:color');
    if (color !== undefined) colorVal = attr(color, 'w:val') ?? null;
  }
  return { text: runText(r), hidden, sizePt, colorVal };
}

/** Parse `word/document.xml` into the paragraph/run model the layers consume. */
export function parseDocument(documentXml: string): DocxParagraph[] {
  const roots = parseXml(documentXml);
  const doc = roots.find((n) => n.name === 'w:document');
  if (doc === undefined) return [];
  const body = firstChild(doc, 'w:body');
  if (body === undefined) return [];
  return childrenNamed(body, 'w:p').map((p) => ({
    runs: childrenNamed(p, 'w:r').map(parseRun),
  }));
}
