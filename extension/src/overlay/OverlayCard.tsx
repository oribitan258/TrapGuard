// Alert & Reveal overlay card — the core product value.
//
// Renders inside a Shadow DOM root injected by the bridge. Receives the full
// Report from the engine and shows:
//   • verbatim payload (attacker-controlled text — MUST be plain text, never HTML)
//   • detection layer description (Hebrew)
//   • location label (Hebrew)
//   • Block upload / Allow anyway buttons
//
// SECURITY: `extracted_text` is attacker-controlled. React escapes all text
// nodes automatically. NEVER pass it to dangerouslySetInnerHTML or eval.
// The payload block uses direction:auto + unicode-bidi:isolate so Hebrew OR
// English payloads render correctly.
//
// STYLING: Tailwind v4 logical-property classes only (no inline `style`).
// The bridge injects the Tailwind sheet + fonts into the shadow root, so these
// classes resolve there and never leak into / inherit from the host page.
// RTL: logical utilities only (end-*, border-s-*, text-start). No physical l/r.
import { useEffect, useState } from 'react';
import type { Report } from '../engine/schema';
import { LAYER_DESCRIPTIONS, formatLocation, sanitizeDisplayName } from './localize';

// Auto-block countdown in seconds (safety net if user ignores the overlay).
const AUTO_BLOCK_SECONDS = 30;

interface Props {
  report: Report;
  /** Resolved theme — toggles the `light` token overrides on this root (Phase 6). */
  theme?: 'light' | 'dark';
  onBlock: () => void;
  onAllow: () => void;
}

export function OverlayCard({ report, theme = 'dark', onBlock, onAllow }: Props) {
  const [countdown, setCountdown] = useState(AUTO_BLOCK_SECONDS);

  // Auto-block countdown
  useEffect(() => {
    if (countdown <= 0) { onBlock(); return; }
    const id = window.setInterval(() => setCountdown((n) => n - 1), 1000);
    return () => window.clearInterval(id);
  }, [countdown, onBlock]);

  const primaryThreat = report.threats[0];
  if (!primaryThreat) return null;

  // Display-sanitized (bidi-spoof-safe); the PAYLOAD below stays verbatim.
  const filename    = sanitizeDisplayName(report.file.path.split(/[\\/]/).pop() ?? report.file.path);
  const desc        = LAYER_DESCRIPTIONS[primaryThreat.layer] ?? primaryThreat.layer;
  const locationStr = formatLocation(primaryThreat.location, report.file.type);
  const extraCount  = report.threats.length - 1;

  return (
    <div dir="rtl" lang="he" className={`fixed end-6 bottom-6 z-[2147483647] font-ui${theme === 'light' ? ' light' : ''}`}>
      <aside
        role="alertdialog"
        aria-live="assertive"
        aria-label="זוהתה מלכודת אקדמית"
        data-testid="tg-overlay"
        className="w-90 overflow-hidden rounded-xl border border-border bg-surface text-text-primary shadow-[0_8px_32px_rgba(0,0,0,0.55)] animate-tg-slide-in"
      >
        {/* ── 1. HEADER ─────────────────────────────────────────────── */}
        <div className="flex items-start justify-between p-4">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex items-center gap-2">
              {/* Shield icon inline SVG — no external dep */}
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="shrink-0 text-crimson">
                <path d="M8 1.5 13.5 3.5v3.8c0 3.3-2.2 5.8-5.5 7.2C4.7 13.1 2.5 10.6 2.5 7.3V3.5L8 1.5Z" fill="currentColor" />
              </svg>
              <h2 className="m-0 text-sm font-semibold leading-tight">זוהתה מלכודת אקדמית</h2>
            </div>
            <span
              dir="ltr"
              data-testid="tg-filename"
              className="inline-block max-w-[280px] overflow-hidden text-ellipsis whitespace-nowrap text-start font-mono text-xs text-text-secondary [unicode-bidi:isolate]"
            >
              {filename}
            </span>
          </div>

          {/* countdown + close */}
          <div className="flex shrink-0 items-center gap-1.5">
            <span
              aria-label={`חסימה אוטומטית בעוד ${countdown} שניות`}
              className="text-[11px] tabular-nums text-text-secondary"
            >
              {countdown}
            </span>
            <button
              type="button"
              onClick={onBlock}
              aria-label="סגור וחסום"
              className="flex size-6 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent p-0 text-text-secondary transition-colors hover:bg-white/5 hover:text-text-primary"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M2 2 12 12M12 2 2 12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        <div className="h-px bg-border" />

        {/* ── 2. METADATA ───────────────────────────────────────────── */}
        <div className="flex flex-col gap-1 px-4 py-3">
          <p className="m-0 text-[13px] leading-normal text-text-secondary">{desc}</p>
          {locationStr && (
            <p className="m-0 text-xs text-text-secondary opacity-75">
              נמצא ב: <span dir="ltr" className="[unicode-bidi:isolate]">{locationStr}</span>
            </p>
          )}
          {extraCount > 0 && (
            <p className="m-0 text-xs text-text-secondary opacity-[0.65]">
              +{extraCount} {extraCount === 1 ? 'ממצא נוסף' : 'ממצאים נוספים'}
            </p>
          )}
        </div>

        {/* ── 3. PAYLOAD BLOCK (Alert & Reveal core value) ──────────── */}
        <div className="px-4 pb-4">
          <div className="mb-1.5 text-start text-[11px] font-medium uppercase tracking-[0.06em] text-text-secondary">
            הוראה מוסתרת
          </div>

          {/*
            SECURITY: attacker-controlled text. React renders this as a text node
            (escaped). direction:auto + unicode-bidi:isolate handles Hebrew / English.
          */}
          <div
            dir="auto"
            data-testid="tg-payload"
            className="max-h-[120px] overflow-y-auto whitespace-pre-wrap rounded-md border-s-[3px] border-crimson bg-bg px-3 py-2.5 font-mono text-xs leading-[1.6] text-text-primary [overflow-wrap:anywhere] [unicode-bidi:isolate]"
          >
            {primaryThreat.extracted_text}
          </div>
        </div>

        <div className="h-px bg-border" />

        {/* ── 4. MANUAL REMOVAL GUIDANCE ────────────────────────────── */}
        <div className="px-4 py-3">
          <p className="m-0 text-xs leading-normal text-text-secondary">
            הסר ידנית את ההוראה הנ"ל מהקובץ לפני העלאה חוזרת.
          </p>
        </div>

        <div className="h-px bg-border" />

        {/* ── 5. CTA ROW ────────────────────────────────────────────── */}
        <div className="flex items-center gap-2.5 px-4 py-3.5">
          {/* PRIMARY: Block upload */}
          <button
            type="button"
            data-testid="tg-block-btn"
            onClick={onBlock}
            className="h-9 flex-1 cursor-pointer rounded-lg border-0 bg-crimson font-ui text-[13px] font-semibold text-white transition-[filter] hover:brightness-[1.15]"
          >
            חסום העלאה
          </button>

          {/* SECONDARY: Allow anyway */}
          <button
            type="button"
            data-testid="tg-allow-btn"
            onClick={onAllow}
            className="h-9 shrink-0 cursor-pointer whitespace-nowrap rounded-lg border border-border bg-transparent px-3.5 font-ui text-[13px] font-medium text-text-primary transition-colors hover:border-text-secondary hover:bg-white/5"
          >
            אפשר בכל זאת
          </button>
        </div>
      </aside>
    </div>
  );
}
