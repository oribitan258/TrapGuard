// TrapGuard options page — הגדרות + היסטוריית סריקות.
// Hebrew/RTL. Tailwind v4 logical properties only. Light/dark theme (Phase 6).
//
// There are NO detection-layer toggles — every layer is always on (threat-model
// doctrine, not user-configurable). File types are shown read-only so the user
// KNOWS what is scanned (disabling a type would mean silent missed detections).
import { useState } from 'react';
import { Logotype } from '../../src/ui/Brand';
import { useTheme, type Theme } from '../../src/theme';
import { openOnboarding } from '../../src/onboarding';
import { SitesSection } from './SitesSection';
import { HistoryView } from './HistoryView';

// Single source of truth: the manifest version (from package.json via WXT).
// A hardcoded constant here drifted from the shipped manifest (Final-Exam F-2).
const VERSION = browser.runtime.getManifest().version;
const REPO_URL = 'https://github.com/oribitan258/TrapGuard';

const STEPS: string[] = [
  'אתם מעלים קובץ לכלי AI נתמך (כמו ChatGPT או Claude).',
  'TrapGuard עוצר את ההעלאה ובודק את הקובץ בתוך הדפדפן - לפני שהוא יוצא מהמכשיר.',
  'אם מתגלה הוראה מוסתרת, מוצג לכם הטקסט החבוי המדויק ומיקומו בקובץ.',
  'אתם מחליטים: לחסום את ההעלאה או לאפשר אותה בכל זאת.',
];

const THEME_OPTIONS: Array<{ key: Theme; label: string }> = [
  { key: 'light', label: 'בהיר' },
  { key: 'dark', label: 'כהה' },
];

function ThemeControl() {
  const { theme, setTheme } = useTheme();
  return (
    <section className="mb-6 rounded-xl border border-border bg-surface p-6">
      <h2 className="text-sm font-semibold">ערכת נושא</h2>
      <p className="mt-1.5 text-xs leading-relaxed text-text-secondary">
        בחרו את מראה התוסף - בהיר או כהה.
      </p>
      <div className="mt-3 inline-flex rounded-lg border border-border p-1">
        {THEME_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            type="button"
            onClick={() => setTheme(opt.key)}
            className={`rounded-md px-5 py-1.5 text-[13px] font-medium transition-colors ${
              theme === opt.key ? 'bg-crimson text-white' : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </section>
  );
}

type Tab = 'settings' | 'history';

export function App() {
  const { theme } = useTheme();
  const [tab, setTab] = useState<Tab>('settings');

  return (
    <div
      dir="rtl"
      lang="he"
      className={`min-h-screen bg-bg text-text-primary font-ui${theme === 'light' ? ' light' : ''}`}
    >
      <div className="mx-auto flex max-w-2xl flex-col px-4 pt-10 pb-0">

        {/* ── Header ───────────────────────────────────────────── */}
        <header className="mb-6 flex items-center justify-between">
          <Logotype />
          <span className="text-xs text-text-secondary">
            גרסה <span dir="ltr" className="font-mono [unicode-bidi:isolate]">{VERSION}</span>
          </span>
        </header>

        {/* ── Tabs ─────────────────────────────────────────────── */}
        <nav className="mb-6 flex gap-1 border-b border-border">
          {([['settings', 'הגדרות'], ['history', 'היסטוריית סריקות']] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                tab === key
                  ? 'border-crimson text-text-primary'
                  : 'border-transparent text-text-secondary hover:text-text-primary'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        {tab === 'history' ? (
          <HistoryView />
        ) : (
          <>
            {/* ── Theme ──────────────────────────────────────────── */}
            <ThemeControl />

            {/* ── Supported sites + custom URLs ──────────────────── */}
            <SitesSection />

            {/* ── How it works ───────────────────────────────────── */}
            <section className="mb-6 rounded-xl border border-border bg-surface p-6">
              <h2 className="text-sm font-semibold">איך זה עובד?</h2>
              <ol className="mt-3 flex flex-col gap-3">
                {STEPS.map((step, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-bg text-xs font-semibold text-text-secondary">
                      {i + 1}
                    </span>
                    <span className="text-sm leading-relaxed text-text-secondary">{step}</span>
                  </li>
                ))}
              </ol>
              <button
                type="button"
                onClick={openOnboarding}
                className="mt-4 rounded-lg border border-border px-4 py-2 text-xs font-medium text-text-secondary transition-colors hover:border-text-secondary hover:text-text-primary"
              >
                הצג מדריך מחדש
              </button>
            </section>

            {/* ── About + contact ────────────────────────────────── */}
            <section className="mb-6 rounded-xl border border-border bg-surface p-6">
              <h2 className="text-sm font-semibold">אודות</h2>
              <p className="mt-3 text-sm leading-relaxed text-text-secondary">
                פותח על ידי אורי ביתן · כל הזכויות שמורות © 2025-2026
              </p>
              <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
                <span className="text-sm">דווח על בעיה</span>
                <a
                  href={`${REPO_URL}/issues`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-xs text-blue hover:underline"
                >
                  <span dir="ltr" className="[unicode-bidi:isolate]">github.com/oribitan258/TrapGuard</span>
                </a>
              </div>
            </section>
          </>
        )}

        {/* ── Footer ───────────────────────────────────────────── */}
        <footer className="py-6 text-center text-xs text-text-tertiary">
          TrapGuard · גרסה <span dir="ltr" className="font-mono [unicode-bidi:isolate]">{VERSION}</span>
        </footer>

      </div>
    </div>
  );
}
