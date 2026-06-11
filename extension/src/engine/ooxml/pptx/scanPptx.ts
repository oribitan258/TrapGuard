// PPTX scan entry — Phase 4. Port of workers/pptx_worker.py `_scan`.
//
// Parses the presentation (ordered slides + notes), runs the two PPTX layers per
// slide in the SAME order as the oracle (speaker_notes then off_slide), and
// derives the verdict. file.pages = slide count. A non-OPC package or one
// missing the presentation part → CORRUPT (python-pptx raises on open → the gate
// must NOT treat such a file as clean); any other throw → INTERNAL. Both keep
// the gate fail-open.
import { loadPackage, DecompressionLimitError } from '../zip';
import {
  corruptReport,
  internalErrorReport,
  encryptedReport,
  oversizedReport,
  isEncryptedOoxml,
} from '../report';
import { parsePresentation } from './model';
import { scanSpeakerNotes } from './layers/speakerNotes';
import { scanOffSlide } from './layers/offSlide';
import type { FileInfo, Report, ThreatItem } from '../../schema';

const PRESENTATION_PART = 'ppt/presentation.xml';

export async function scanPptx(file: File, fileInfo: FileInfo): Promise<Report> {
  let pkg;
  try {
    const data = new Uint8Array(await file.arrayBuffer());
    // A password-encrypted PPTX is an OLE2/CFB container, not a ZIP — report it
    // accurately as ENCRYPTED instead of letting JSZip reject it as CORRUPT.
    if (isEncryptedOoxml(data)) return encryptedReport(fileInfo);
    pkg = await loadPackage(data);
  } catch (err) {
    if (err instanceof DecompressionLimitError) return oversizedReport(fileInfo);
    return corruptReport(fileInfo);
  }
  // A valid zip with no presentation part is not a PPTX — python-pptx raises on
  // open. Treat as CORRUPT, never a silent clean (which would ALLOW the upload).
  if (!pkg.has(PRESENTATION_PART)) return corruptReport(fileInfo);

  try {
    const slides = await parsePresentation(pkg);
    const allThreats: ThreatItem[] = [];
    slides.forEach((slide, slideIdx) => {
      const slideNum = slideIdx + 1;
      allThreats.push(...scanSpeakerNotes(slide, slideNum));
      allThreats.push(...scanOffSlide(slide, slideNum));
    });

    return {
      ok: true,
      file: { ...fileInfo, pages: slides.length },
      verdict: allThreats.length > 0 ? 'infected' : 'clean',
      threats: allThreats,
      sanitized: false,
      error: null,
    };
  } catch (err) {
    // A slide/notes part may declare a decompression bomb → OVERSIZED, not INTERNAL.
    if (err instanceof DecompressionLimitError) return oversizedReport(fileInfo);
    return internalErrorReport(fileInfo);
  }
}
