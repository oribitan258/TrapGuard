// Error-state overlay (Phase 7 — robustness).
//
// Shown in the Shadow-DOM root for a verdict of 'error' (corrupt / encrypted /
// oversized / internal). TrapGuard could NOT verify the file, so per the
// fail-open doctrine the DEFAULT action is to allow: an auto-allow countdown
// releases the upload if the user does nothing. The user may still choose to
// block an unverifiable file, or allow it immediately.
//
// This card carries NO payload (there is no detected hidden text) — it only
// reports, in Hebrew, why the scan could not complete.
//
// STYLING: Tailwind v4 logical-property classes only (no inline `style`). RTL.
import { useEffect, useState } from 'react';
import type { Report } from '../engine/schema';
import { ERROR_TITLES, ERROR_TITLE_FALLBACK, sanitizeDisplayName } from './localize';

// Auto-allow countdown (seconds). Must stay well under the gate's 120s scan
// timeout — even when QUEUED behind other cards (bridge shows one at a time) —
// so the bridge resolves the verdict before the gate fails open itself.
const AUTO_ALLOW_SECONDS = 20;

interface Props {
  report: Report;
  /** Resolved theme — toggles the `light` token overrides on this root. */
  theme?: 'light' | 'dark';
  onBlock: () => void;
  onAllow: () => void;
}

export function OverlayNotice({ report, theme = 'dark', onBlock, onAllow }: Props) {
  const [countdown, setCountdown] = useState(AUTO_ALLOW_SECONDS);

  // Auto-ALLOW countdown (fail-open default for an unverifiable file).
  useEffect(() => {
    if (countdown <= 0) { onAllow(); return; }
    const id = window.setInterval(() => setCountdown((n) => n - 1), 1000);
    return () => window.clearInterval(id);
  }, [countdown, onAllow]);

  // Display-sanitized (bidi-spoof-safe) — see sanitizeDisplayName in localize.ts.
  const filename = sanitizeDisplayName(report.file.path.split(/[\\/]/).pop() ?? report.file.path);
  const code = report.error?.code ?? 'INTERNAL';
  const title = ERROR_TITLES[code] ?? ERROR_TITLE_FALLBACK;
  const reason = report.error?.message ?? '';

  return (
    <div dir="rtl" lang="he" className={`fixed end-6 bottom-6 z-[2147483647] font-ui${theme === 'light' ? ' light' : ''}`}>
      <aside
        role="alertdialog"
        aria-live="polite"
        aria-label={title}
        data-testid="tg-overlay-notice"
        className="w-90 overflow-hidden rounded-xl border border-border bg-surface text-text-primary shadow-[0_8px_32px_rgba(0,0,0,0.55)] animate-tg-slide-in"
      >
        {/* ── HEADER ─────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between p-4">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex items-center gap-2">
              {/* Warning triangle — amber (this is a notice, not a threat). */}
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="shrink-0 text-amber">
                <path d="M8 1.6 15 14H1L8 1.6Z" fill="currentColor" opacity="0.9" />
                <path d="M8 6v3.5M8 11.4v.1" stroke="#1C1C1E" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              <h2 className="m-0 text-sm font-semibold leading-tight">{title}</h2>
            </div>
            <span
              dir="ltr"
              data-testid="tg-notice-filename"
              className="inline-block max-w-[280px] overflow-hidden text-ellipsis whitespace-nowrap text-start font-mono text-xs text-text-secondary [unicode-bidi:isolate]"
            >
              {filename}
            </span>
          </div>

          {/* countdown + close (close = allow, the fail-open default) */}
          <div className="flex shrink-0 items-center gap-1.5">
            <span
              aria-label={`אישור אוטומטי בעוד ${countdown} שניות`}
              className="text-[11px] tabular-nums text-text-secondary"
            >
              {countdown}
            </span>
            <button
              type="button"
              onClick={onAllow}
              aria-label="סגור ואפשר"
              className="flex size-6 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent p-0 text-text-secondary transition-colors hover:bg-white/5 hover:text-text-primary"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M2 2 12 12M12 2 2 12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        <div className="h-px bg-border" />

        {/* ── BODY ───────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-1.5 px-4 py-3">
          {reason && <p className="m-0 text-[13px] leading-normal text-text-secondary">{reason}</p>}
          <p className="m-0 text-xs leading-normal text-text-secondary opacity-75">
            TrapGuard לא הצליח לבדוק את הקובץ. ניתן לאפשר את ההעלאה או לחסום אותה.
          </p>
        </div>

        <div className="h-px bg-border" />

        {/* ── CTA ROW ────────────────────────────────────────────────── */}
        <div className="flex items-center gap-2.5 px-4 py-3.5">
          {/* PRIMARY: Allow (the fail-open default for an unverifiable file). */}
          <button
            type="button"
            data-testid="tg-notice-allow-btn"
            onClick={onAllow}
            className="h-9 flex-1 cursor-pointer rounded-lg border-0 bg-blue font-ui text-[13px] font-semibold text-white transition-[filter] hover:brightness-[1.15]"
          >
            אפשר העלאה
          </button>

          {/* SECONDARY: Block anyway. */}
          <button
            type="button"
            data-testid="tg-notice-block-btn"
            onClick={onBlock}
            className="h-9 shrink-0 cursor-pointer whitespace-nowrap rounded-lg border border-border bg-transparent px-3.5 font-ui text-[13px] font-medium text-text-primary transition-colors hover:border-text-secondary hover:bg-white/5"
          >
            חסום בכל זאת
          </button>
        </div>
      </aside>
    </div>
  );
}
