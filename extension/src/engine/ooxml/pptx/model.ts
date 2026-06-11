// PPTX presentation model — a faithful, minimal port of the python-pptx
// accessors the two PPTX layers depend on:
//   Presentation.slides (order via p:sldIdLst → presentation rels)
//   Slide.has_notes_slide / notes_slide.notes_text_frame.text
//   Slide.shapes (spTree shape children, document order)
//   shape.left/top (a:off EMU, None if no xfrm), shape.shape_id (cNvPr/@id)
//   shape.has_text_frame (only p:sp) / text_frame.text
//
// We read the SAME package XML the oracle reads, so slide numbers and shape ids
// coincide automatically.
import {
  attr,
  childrenNamed,
  firstChild,
  firstDescendant,
  parseXml,
  type XmlNode,
} from '../xml';
import type { Package } from '../zip';

const SHAPE_TAGS = new Set([
  'p:sp',
  'p:grpSp',
  'p:graphicFrame',
  'p:cxnSp',
  'p:pic',
  'p:contentPart',
]);

export interface PptxShape {
  shapeId: string | null;
  left: number | null;
  top: number | null;
  /** Stripped text frame text — only p:sp shapes have a text frame. */
  text: string | null;
}

export interface PptxSlide {
  shapes: PptxShape[];
  /** notes_text_frame.text (body placeholder), or null when no notes slide. */
  notesText: string | null;
}

// ── OPC path resolution ─────────────────────────────────────────────────────

/** Resolve an OPC relationship Target against the source part's base dir. */
function resolvePath(baseDir: string, target: string): string {
  const parts = baseDir.split('/').filter((p) => p.length > 0);
  for (const seg of target.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return parts.join('/');
}

interface Rel {
  type: string;
  target: string;
}

async function readRels(pkg: Package, relsPath: string): Promise<Map<string, Rel>> {
  const map = new Map<string, Rel>();
  const xml = await pkg.text(relsPath);
  if (xml === null) return map;
  const roots = parseXml(xml);
  const rels = roots.find((n) => n.name === 'Relationships');
  if (rels === undefined) return map;
  for (const r of childrenNamed(rels, 'Relationship')) {
    const id = attr(r, 'Id');
    const type = attr(r, 'Type');
    const target = attr(r, 'Target');
    if (id !== undefined && type !== undefined && target !== undefined) {
      map.set(id, { type, target });
    }
  }
  return map;
}

// ── text extraction (mirrors python-pptx TextFrame/_Paragraph/_Run.text) ─────

function runText(r: XmlNode): string {
  // a:r.text == its a:t child text.
  return childrenNamed(r, 'a:t')
    .map((t) => t.text)
    .join('');
}

function paragraphText(p: XmlNode): string {
  // "".join(content_children text): a:r → run text, a:br → "\v", a:fld → a:t text.
  let out = '';
  for (const c of p.children) {
    if (c.name === 'a:r') out += runText(c);
    else if (c.name === 'a:br') out += '\v';
    else if (c.name === 'a:fld') out += childrenNamed(c, 'a:t').map((t) => t.text).join('');
  }
  return out;
}

function txBodyText(txBody: XmlNode): string {
  return childrenNamed(txBody, 'a:p').map(paragraphText).join('\n');
}

// ── shape extraction ─────────────────────────────────────────────────────────

function shapeOffset(shape: XmlNode): { x: number | null; y: number | null } {
  // python-pptx shape.xfrm == spPr.xfrm (p:sp/p:pic/p:cxnSp); graphicFrame uses
  // p:xfrm; grpSp uses grpSpPr/a:xfrm. Find the appropriate a:xfrm / p:xfrm.
  let xfrm: XmlNode | undefined;
  const spPr = firstChild(shape, 'p:spPr') ?? firstChild(shape, 'p:grpSpPr');
  if (spPr !== undefined) xfrm = firstChild(spPr, 'a:xfrm');
  if (xfrm === undefined) xfrm = firstChild(shape, 'p:xfrm');
  if (xfrm === undefined) return { x: null, y: null };
  const off = firstChild(xfrm, 'a:off');
  if (off === undefined) return { x: null, y: null };
  const xs = attr(off, 'x');
  const ys = attr(off, 'y');
  const x = xs !== undefined ? Number(xs) : null;
  const y = ys !== undefined ? Number(ys) : null;
  return {
    x: x !== null && Number.isFinite(x) ? x : null,
    y: y !== null && Number.isFinite(y) ? y : null,
  };
}

function parseShape(shape: XmlNode): PptxShape {
  const cNvPr = firstDescendant(shape, 'p:cNvPr');
  const idStr = cNvPr !== undefined ? attr(cNvPr, 'id') : undefined;
  let shapeId: string | null = null;
  if (idStr !== undefined) {
    const n = Number(idStr);
    shapeId = Number.isFinite(n) ? String(n) : idStr;
  }

  const { x, y } = shapeOffset(shape);

  // has_text_frame is true only for p:sp; text_frame.text stripped, or null.
  let text: string | null = null;
  if (shape.name === 'p:sp') {
    const txBody = firstChild(shape, 'p:txBody');
    if (txBody !== undefined) {
      const t = txBodyText(txBody).trim();
      text = t.length > 0 ? t : null;
    }
  }

  return { shapeId, left: x, top: y, text };
}

function spTreeShapes(slideXml: XmlNode): PptxShape[] {
  const root = firstDescendant(slideXml, 'p:cSld');
  if (root === undefined) return [];
  const spTree = firstChild(root, 'p:spTree');
  if (spTree === undefined) return [];
  return spTree.children.filter((c) => SHAPE_TAGS.has(c.name)).map(parseShape);
}

// ── notes ────────────────────────────────────────────────────────────────────

/** notes_placeholder.text_frame.text: the spTree shape whose ph type is "body". */
function notesBodyText(notesXml: XmlNode): string | null {
  const cSld = firstDescendant(notesXml, 'p:cSld');
  if (cSld === undefined) return null;
  const spTree = firstChild(cSld, 'p:spTree');
  if (spTree === undefined) return null;
  for (const sp of childrenNamed(spTree, 'p:sp')) {
    const ph = firstDescendant(sp, 'p:ph');
    if (ph !== undefined && attr(ph, 'type') === 'body') {
      const txBody = firstChild(sp, 'p:txBody');
      return txBody !== undefined ? txBodyText(txBody) : '';
    }
  }
  return null;
}

// ── presentation walk ─────────────────────────────────────────────────────────

const NOTES_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide';

/** Parse the whole presentation into ordered slides with shapes + notes text. */
export async function parsePresentation(pkg: Package): Promise<PptxSlide[]> {
  const presXml = await pkg.text('ppt/presentation.xml');
  if (presXml === null) return [];
  const pres = parseXml(presXml).find((n) => n.name === 'p:presentation');
  if (pres === undefined) return [];
  const sldIdLst = firstChild(pres, 'p:sldIdLst');
  if (sldIdLst === undefined) return [];

  const presRels = await readRels(pkg, 'ppt/_rels/presentation.xml.rels');

  const slides: PptxSlide[] = [];
  for (const sldId of childrenNamed(sldIdLst, 'p:sldId')) {
    const rId = attr(sldId, 'r:id');
    if (rId === undefined) continue;
    const rel = presRels.get(rId);
    if (rel === undefined) continue;
    const slidePath = resolvePath('ppt', rel.target); // base dir of ppt/presentation.xml
    const slideXmlStr = await pkg.text(slidePath);
    if (slideXmlStr === null) continue;
    const slideXml = parseXml(slideXmlStr).find((n) => n.name === 'p:sld');
    if (slideXml === undefined) continue;

    const shapes = spTreeShapes(slideXml);

    // notes: slide rels → notesSlide target
    let notesText: string | null = null;
    const slideDir = slidePath.split('/').slice(0, -1).join('/');
    const slideName = slidePath.split('/').slice(-1)[0];
    const slideRels = await readRels(pkg, `${slideDir}/_rels/${slideName}.rels`);
    for (const rel2 of slideRels.values()) {
      if (rel2.type === NOTES_REL) {
        const notesPath = resolvePath(slideDir, rel2.target);
        const notesXmlStr = await pkg.text(notesPath);
        if (notesXmlStr !== null) {
          const notesXml = parseXml(notesXmlStr).find((n) => n.name === 'p:notes');
          if (notesXml !== undefined) notesText = notesBodyText(notesXml);
        }
        break;
      }
    }

    slides.push({ shapes, notesText });
  }
  return slides;
}
