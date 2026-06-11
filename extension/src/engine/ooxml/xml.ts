// Minimal order-preserving XML model for the OOXML workers (Phase 4).
//
// DOCX/PPTX detection mirrors the Python engine, which reads the package XML via
// python-docx / python-pptx (namespace-qualified, document-order). We parse the
// same XML with fast-xml-parser in `preserveOrder` mode — order matters for run
// enumeration (`w:r`), paragraph enumeration (`w:p`), and run-text concatenation
// (`w:t`/`w:tab`/`w:br`…). Real OOXML always uses the standard `w:`/`p:`/`a:`
// prefixes (python-{docx,pptx} write them; Word/PowerPoint emit them), so tag
// matching is by prefixed name — exactly the names the oracle's `qn()` resolves.
import { XMLParser } from 'fast-xml-parser';

/** A normalized element node. `text` is this element's IMMEDIATE text only. */
export interface XmlNode {
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  /** Concatenation of this element's direct `#text` children (no descendants). */
  text: string;
}

// preserveOrder gives an array of single-key objects; attributes under ":@",
// text under "#text". parseTagValue/parseAttributeValue off so "0"/"FFFFFF"/
// "-6000000" stay strings; trimValues off so we control whitespace ourselves.
// htmlEntities decodes numeric character references (`&#73;` → "I", `&#1488;` →
// Hebrew) the way lxml (python-docx/pptx) does — a honeypot can obfuscate the
// hidden instruction with numeric refs; the default leaves them literal, which
// would silently miss the payload and break parity with the oracle.
const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
  htmlEntities: true,
});

type PoNode = Record<string, unknown>;

function toNodes(arr: readonly PoNode[]): XmlNode[] {
  const out: XmlNode[] = [];
  for (const po of arr) {
    const keys = Object.keys(po);
    const tagKey = keys.find((k) => k !== ':@' && k !== '#text');
    if (tagKey === undefined) continue; // bare text node — handled by the parent
    const rawChildren = (po[tagKey] as PoNode[]) ?? [];
    const attrs = (po[':@'] as Record<string, string>) ?? {};
    const children: XmlNode[] = [];
    let text = '';
    for (const c of rawChildren) {
      if (Object.prototype.hasOwnProperty.call(c, '#text') && Object.keys(c).length === 1) {
        text += String(c['#text']);
      } else {
        children.push(...toNodes([c]));
      }
    }
    out.push({ name: tagKey, attrs, children, text });
  }
  return out;
}

/** Parse an XML string into normalized root nodes. */
export function parseXml(xml: string): XmlNode[] {
  return toNodes(parser.parse(xml) as PoNode[]);
}

/** Direct children of `node` with tag name `name`. */
export function childrenNamed(node: XmlNode, name: string): XmlNode[] {
  return node.children.filter((c) => c.name === name);
}

/** First direct child with tag name `name`, or undefined. */
export function firstChild(node: XmlNode, name: string): XmlNode | undefined {
  return node.children.find((c) => c.name === name);
}

/** First descendant (depth-first, pre-order) with tag name `name`, or undefined. */
export function firstDescendant(node: XmlNode, name: string): XmlNode | undefined {
  for (const c of node.children) {
    if (c.name === name) return c;
    const deep = firstDescendant(c, name);
    if (deep !== undefined) return deep;
  }
  return undefined;
}

/** Attribute value (by qualified name, e.g. "w:val") or undefined. */
export function attr(node: XmlNode, name: string): string | undefined {
  return node.attrs[name];
}
