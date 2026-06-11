// Ported 1:1 from src/main.overlay.tsx — layer descriptions + location formatter.
// Hebrew-only (CLAUDE.md language mandate). Runs in the bridge's isolated world.
import { ZERO_WIDTH_CHARS } from '../engine/layers/zeroWidth';

/**
 * Strip invisible Unicode format/direction controls from an attacker-influenced
 * DISPLAY string (filenames in the overlay header and scan history). A crafted
 * filename embedding an RTL override (U+202E) would otherwise visually reorder
 * in the UI (the classic "gnp.exe" shown as "exe.png" spoof). Reuses the
 * engine's own Trojan-Source codepoint set — single source of truth.
 *
 * NEVER applied to the payload: Alert & Reveal shows the hidden instruction
 * VERBATIM (doctrine); the payload block is already bidi-isolated.
 */
export function sanitizeDisplayName(name: string): string {
  return [...name].filter((c) => !ZERO_WIDTH_CHARS.has(c)).join('');
}

/** Human-readable Hebrew description of each detection layer. */
export const LAYER_DESCRIPTIONS: Record<string, string> = {
  color_threshold: 'צבע הטקסט כמעט זהה לרקע - בלתי נראה לעין',
  micro_font:      'גופן זעיר מתחת ל-2 נקודות - בלתי נראה לעין',
  spatial:         'טקסט מוסתר מחוץ לגבולות הדף',
  z_index:         'טקסט קבור מתחת לתמונה',
  regex_keyword:   'הוראה לבינה מלאכותית בטקסט מוסתר',
  hidden_attr:     'מאפיין "מוסתר" של Word הוחל על הטקסט',
  white_on_white:  'טקסט לבן על רקע לבן - בלתי נראה לעין',
  tiny_font:       'גופן זעיר בלתי נראה',
  speaker_notes:   'ההוראה הוסתרה בהערות הדובר של המצגת',
  off_slide:       'צורה עם טקסט הוסתרה מחוץ לגבולות השקף',
  zero_width:      'תווים בלתי נראים (Unicode) הוטמעו בתוך הטקסט',
};

/**
 * Hebrew title for each engine error code (Phase 7 error overlay). The verbose
 * Hebrew reason comes from report.error.message; this is the short headline.
 */
export const ERROR_TITLES: Record<string, string> = {
  ENCRYPTED: 'הקובץ מוצפן',
  CORRUPT: 'הקובץ פגום',
  OVERSIZED: 'הקובץ גדול מדי',
  UNSUPPORTED: 'סוג קובץ לא נתמך',
  TIMEOUT: 'הסריקה ארכה זמן רב מדי',
  IO: 'שגיאת קריאת קובץ',
  INTERNAL: 'שגיאת סריקה',
};

/** Fallback Hebrew title when the error code is unknown/missing. */
export const ERROR_TITLE_FALLBACK = 'לא ניתן לסרוק את הקובץ';

/** Return a Hebrew location string for a threat's location object + file type. */
export function formatLocation(
  location: Record<string, unknown>,
  fileType: string,
): string {
  if (fileType === 'pdf') {
    const page = location['page'] as number | undefined;
    return page != null ? `עמוד ${page}` : '';
  }
  if (fileType === 'docx') {
    const para = location['paragraph'] as number | undefined;
    return para != null ? `פסקה ${para}` : '';
  }
  if (fileType === 'pptx') {
    const slide = location['slide'] as number | undefined;
    return slide != null ? `שקף ${slide}` : '';
  }
  if (fileType === 'txt' || fileType === 'md') {
    const line = location['line'] as number | undefined;
    const col  = location['col']  as number | undefined;
    if (line != null && col != null) return `שורה ${line}, עמודה ${col}`;
    if (line != null) return `שורה ${line}`;
  }
  return '';
}
