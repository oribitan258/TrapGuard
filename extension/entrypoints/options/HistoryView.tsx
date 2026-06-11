// Scan-history page (Phase 6). Reference design: designs/VeilGuardScanHistory.jsx.
// Metadata only, local-only (see src/history.ts). Filter chips (all/clean/infected)
// + filename search + expandable verbatim-payload rows + "נקה היסטוריה" clear.
import { useState } from 'react';
import { useHistory, type HistoryEntry } from '../../src/history';
import { LAYER_DESCRIPTIONS, formatLocation, sanitizeDisplayName } from '../../src/overlay/localize';

type FilterKey = 'all' | 'clean' | 'infected';

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: 'all', label: 'הכול' },
  { key: 'clean', label: 'נקי' },
  { key: 'infected', label: 'נגוע' },
];

function VerdictBadge({ verdict }: { verdict: HistoryEntry['verdict'] }) {
  const map: Record<HistoryEntry['verdict'], { label: string; cls: string }> = {
    clean: { label: 'נקי', cls: 'border-emerald text-emerald' },
    infected: { label: 'נגוע', cls: 'border-crimson text-crimson' },
    unscannable: { label: 'לא נסרק', cls: 'border-amber text-amber' },
    error: { label: 'שגיאה', cls: 'border-border text-text-secondary' },
  };
  const v = map[verdict];
  return (
    <span className={`inline-flex h-[22px] shrink-0 items-center rounded-full border-[1.5px] px-2.5 text-xs font-medium ${v.cls}`}>
      {v.label}
    </span>
  );
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const time = d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  const date = d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' });
  return `${date} ${time}`;
}

function Row({ entry }: { entry: HistoryEntry }) {
  const [open, setOpen] = useState(false);
  const expandable = entry.verdict === 'infected' && entry.payload != null;
  const desc = entry.layer ? (LAYER_DESCRIPTIONS[entry.layer] ?? entry.layer) : '';
  const loc = entry.layer ? formatLocation(entry.location ?? {}, entry.fileType ?? '') : '';

  return (
    <>
      <div
        className={`flex items-center gap-3 border-b border-border py-3.5 ${expandable ? 'cursor-pointer' : ''}`}
        onClick={() => expandable && setOpen((o) => !o)}
      >
        {/* File icon */}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0 text-text-secondary">
          <path d="M6 2.5h8L19 7.5V20a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 20V4A1.5 1.5 0 0 1 6 2.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
          <path d="M14 2.5V7.5H19" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
        <span dir="ltr" className="min-w-0 flex-1 truncate text-sm font-medium [unicode-bidi:isolate]">
          {sanitizeDisplayName(entry.name)}
        </span>
        <VerdictBadge verdict={entry.verdict} />
        <span dir="ltr" className="shrink-0 text-xs text-text-secondary [unicode-bidi:isolate]">
          {formatTime(entry.ts)}
        </span>
        {expandable && (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" className={`shrink-0 text-text-secondary transition-transform ${open ? 'rotate-180' : ''}`}>
            <path d="M3.5 5.5 7 9l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>

      {expandable && open && (
        <div className="mb-2 rounded-lg border-s-[3px] border-crimson bg-bg p-4">
          <div className="mb-1 text-[11px] font-medium uppercase tracking-[0.06em] text-text-secondary">
            הוראה מוסתרת
          </div>
          {/* SECURITY: attacker-controlled text — React-escaped text node only. */}
          <div dir="auto" className="whitespace-pre-wrap rounded-md bg-surface px-3 py-2.5 font-mono text-xs leading-relaxed text-text-primary [overflow-wrap:anywhere] [unicode-bidi:isolate]">
            {entry.payload}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {entry.layer && (
              <span dir="ltr" className="inline-flex h-[22px] items-center rounded-full border-[1.5px] border-crimson px-2.5 font-mono text-[11px] text-crimson [unicode-bidi:isolate]">
                {entry.layer}
              </span>
            )}
            {desc && <span className="text-xs text-text-secondary">{desc}</span>}
            {loc && (
              <span className="text-xs text-text-secondary">
                נמצא ב: <span dir="ltr" className="[unicode-bidi:isolate]">{loc}</span>
              </span>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export function HistoryView() {
  const { entries, clear } = useHistory();
  const [filter, setFilter] = useState<FilterKey>('all');
  const [query, setQuery] = useState('');

  const visible = entries.filter((e) => {
    if (filter === 'clean' && e.verdict !== 'clean') return false;
    if (filter === 'infected' && e.verdict !== 'infected') return false;
    if (query.trim() && !e.name.toLowerCase().includes(query.trim().toLowerCase())) return false;
    return true;
  });

  return (
    <section className="mb-6 rounded-xl border border-border bg-surface p-6">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold">היסטוריית סריקות</h2>
        <span className="text-xs text-text-secondary">
          <span dir="ltr" className="[unicode-bidi:isolate]">{entries.length}</span> קבצים נסרקו
        </span>
      </div>

      {/* Controls: filter chips + search */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`h-7 rounded-full border-[1.5px] px-3 text-xs font-medium transition-colors ${
                filter === f.key ? 'border-crimson text-crimson' : 'border-border text-text-secondary'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="חפש לפי שם קובץ..."
          className="h-8 w-56 rounded-lg border border-border bg-bg px-3 text-xs text-text-primary outline-none focus:border-text-secondary"
        />
      </div>

      {/* List */}
      {visible.length === 0 ? (
        <p className="py-8 text-center text-sm text-text-secondary">
          {entries.length === 0 ? 'עדיין לא נסרקו קבצים.' : 'אין תוצאות התואמות לסינון.'}
        </p>
      ) : (
        <div>
          {visible.map((e) => (
            <Row key={e.id} entry={e} />
          ))}
        </div>
      )}

      {/* Clear */}
      {entries.length > 0 && (
        <div className="mt-5 flex justify-start border-t border-border pt-4">
          <button
            type="button"
            onClick={clear}
            className="rounded-lg border border-border px-4 py-2 text-xs font-medium text-text-secondary transition-colors hover:border-error hover:text-error"
          >
            נקה היסטוריה
          </button>
        </div>
      )}
    </section>
  );
}
