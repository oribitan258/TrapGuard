// Self-hosted fonts (Phase 7 — "100% local" hardening).
//
// Heebo (UI, Hebrew + Latin) and JetBrains Mono (monospace payload/paths) are
// bundled as woff2 under public/fonts/ and loaded from the EXTENSION origin —
// NEVER from fonts.googleapis.com. This kills the last external network call.
//
// One source of truth used by every surface:
//   • popup / options / onboarding pages → installPageFonts() (extension origin)
//   • Shadow-DOM overlay → fontFaceCss() prepended to the injected <style>
//
// The @font-face url() points at browser.runtime.getURL('/fonts/…'), so the
// rules are scoped (no leak into the host document) and resolve to the
// extension's own resource. unicode-range values mirror Google Fonts' Hebrew /
// Latin subsets verbatim so the browser fetches only the subset it needs.

import type { PublicPath } from 'wxt/browser';

export interface FontFaceSpec {
  family: string;
  weight: number;
  /** Extension-root path of the woff2 (a typed WXT PublicPath). */
  path: PublicPath;
  /** unicode-range so the browser only loads the subset it needs. */
  range: string;
}

// Google Fonts subset ranges (copied verbatim for parity with the old CDN @import).
const HEBREW_RANGE = 'U+0590-05FF, U+200C-2010, U+20AA, U+25CC, U+FB1D-FB4F';
const LATIN_RANGE =
  'U+0000-00FF, U+0131, U+0152-0153, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD';

export const FONT_FACES: readonly FontFaceSpec[] = [
  // Heebo — UI (Hebrew + Latin), four weights used by the design tokens.
  { family: 'Heebo', weight: 400, path: '/fonts/heebo-he-400.woff2', range: HEBREW_RANGE },
  { family: 'Heebo', weight: 500, path: '/fonts/heebo-he-500.woff2', range: HEBREW_RANGE },
  { family: 'Heebo', weight: 600, path: '/fonts/heebo-he-600.woff2', range: HEBREW_RANGE },
  { family: 'Heebo', weight: 700, path: '/fonts/heebo-he-700.woff2', range: HEBREW_RANGE },
  { family: 'Heebo', weight: 400, path: '/fonts/heebo-lat-400.woff2', range: LATIN_RANGE },
  { family: 'Heebo', weight: 500, path: '/fonts/heebo-lat-500.woff2', range: LATIN_RANGE },
  { family: 'Heebo', weight: 600, path: '/fonts/heebo-lat-600.woff2', range: LATIN_RANGE },
  { family: 'Heebo', weight: 700, path: '/fonts/heebo-lat-700.woff2', range: LATIN_RANGE },
  // JetBrains Mono — monospace payload / paths (Latin only, same as old CDN).
  { family: 'JetBrains Mono', weight: 400, path: '/fonts/jbmono-lat-400.woff2', range: LATIN_RANGE },
  { family: 'JetBrains Mono', weight: 500, path: '/fonts/jbmono-lat-500.woff2', range: LATIN_RANGE },
] as const;

/**
 * Build the @font-face CSS. `resolve` maps a PublicPath to a loadable URL —
 * browser.runtime.getURL in every context (pages + content script).
 * `font-display: swap` so Hebrew text paints immediately in the fallback stack.
 */
export function fontFaceCss(resolve: (path: PublicPath) => string): string {
  return FONT_FACES.map(
    (f) =>
      `@font-face{font-family:'${f.family}';font-style:normal;font-weight:${f.weight};` +
      `font-display:swap;src:url('${resolve(f.path)}') format('woff2');` +
      `unicode-range:${f.range};}`,
  ).join('\n');
}

/**
 * Inject the @font-face rules into an extension PAGE (popup/options/onboarding).
 * Idempotent — guarded by a marked <style> so React StrictMode double-mounts and
 * re-imports don't duplicate it.
 */
export function installPageFonts(): void {
  if (typeof document === 'undefined') return;
  const ID = 'tg-fonts';
  if (document.getElementById(ID)) return;
  const style = document.createElement('style');
  style.id = ID;
  style.textContent = fontFaceCss((path) => browser.runtime.getURL(path));
  document.head.appendChild(style);
}
