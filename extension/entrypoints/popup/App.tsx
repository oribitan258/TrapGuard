// TrapGuard popup — compact, practical status surface (Phase 6).
// Only the essentials: brand, active/paused status, the global pause toggle, and
// a tap-through to the full settings (sites, history, theme). Hebrew/RTL only.
import { ShieldLogo, Toggle, Wordmark } from '../../src/ui/Brand';
import { usePause } from '../../src/settings';
import { useTheme } from '../../src/theme';

export function App() {
  const { paused, setPaused } = usePause();
  const { theme } = useTheme();

  return (
    <main
      dir="rtl"
      lang="he"
      className={`flex w-64 flex-col bg-bg font-ui text-text-primary${theme === 'light' ? ' light' : ''}`}
    >
      {/* ── Header: brand + status ─────────────────────────────── */}
      <header className="flex items-center gap-2.5 px-4 py-3.5">
        <ShieldLogo size={22} />
        <Wordmark className="text-sm leading-none" />
        <div className="ms-auto flex items-center gap-1.5">
          <span
            aria-label={paused ? 'מושהה' : 'פעיל'}
            className={`size-2 rounded-full ${paused ? 'bg-amber' : 'bg-emerald shadow-[0_0_6px_#30D158aa]'}`}
          />
          <span className={`text-xs font-medium ${paused ? 'text-amber' : 'text-emerald'}`}>
            {paused ? 'מושהה' : 'פעיל'}
          </span>
        </div>
      </header>

      {/* ── Global pause (the one control) ─────────────────────── */}
      <section className="mx-4 flex items-center justify-between rounded-xl border border-border bg-surface px-3.5 py-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">הגנה פעילה</span>
          <span className="text-xs text-text-secondary">
            {paused ? 'הסריקה מושהית' : 'סורק העלאות לכלי AI'}
          </span>
        </div>
        <Toggle on={!paused} onChange={() => setPaused(!paused)} label="הפעל/השהה הגנה" />
      </section>

      {/* ── Tap-through to full settings ───────────────────────── */}
      <button
        type="button"
        onClick={() => browser.runtime.openOptionsPage()}
        className="mt-3 mb-1 flex items-center justify-between px-4 py-3 text-sm text-text-secondary transition-colors duration-150 hover:text-text-primary"
      >
        <span>הגדרות והיסטוריה</span>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" className="rtl:rotate-180">
          <path d="M5.5 3.5 9 7l-3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </main>
  );
}
