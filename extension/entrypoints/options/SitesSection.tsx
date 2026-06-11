// Supported-sites management (Phase 6).
//  • Built-in sites (ChatGPT/Claude) — enable/disable toggle (gate honors it).
//  • Recommended sites (Gemini/Copilot/Perplexity) — opt-in: toggling on requests
//    the host permission + registers the gate/bridge dynamically.
//  • Custom sites — user adds an https host, then grants it like a recommended one.
// Dynamic sites take effect on the next page load → "יחול בהפעלה מחדש" note.
import { useEffect, useState } from 'react';
import { STATIC_SITES, RECOMMENDED_SITES, normalizeHost, type SupportedSite } from '../../src/sites';
import { useSiteToggles, useCustomSites, setSiteEnabled } from '../../src/settings';
import { requestAndRegister, unregisterSite, isSitePermitted } from '../../src/registration';
import { Toggle } from '../../src/ui/Brand';

function SiteRow({
  site,
  on,
  onToggle,
  onRemove,
}: {
  site: SupportedSite;
  on: boolean;
  onToggle: () => void;
  onRemove?: () => void;
}) {
  return (
    <div className="flex items-center justify-between border-b border-border py-3.5 last:border-b-0">
      <div className="min-w-0">
        <div className="text-sm font-medium">{site.label}</div>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`הסר ${site.label}`}
            className="text-text-secondary transition-colors hover:text-error"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M3 4h10M6.5 4V3h3v1M5 4l.5 8h5L11 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
        <Toggle on={on} onChange={onToggle} label={site.label} />
      </div>
    </div>
  );
}

export function SitesSection() {
  const builtinHosts = STATIC_SITES.map((s) => s.host);
  const { enabled, toggle } = useSiteToggles(builtinHosts);
  const { sites: customSites, add, remove } = useCustomSites();

  // Permission state for the dynamic (recommended + custom) sites.
  const dynamicSites = [...RECOMMENDED_SITES, ...customSites];
  const [permitted, setPermitted] = useState<Record<string, boolean>>({});
  const [draft, setDraft] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    let active = true;
    void Promise.all(
      dynamicSites.map(async (s) => [s.host, await isSitePermitted(s.host)] as const),
    ).then((pairs) => {
      if (active) setPermitted(Object.fromEntries(pairs));
    });
    return () => {
      active = false;
    };
    // Re-check when the set of dynamic hosts changes.
  }, [customSites.map((s) => s.host).join(',')]);

  // NOTE: permissions.request must run inside the click gesture — do NOT await
  // anything before calling requestAndRegister().
  const toggleDynamic = (host: string): void => {
    if (permitted[host]) {
      void unregisterSite(host).then(() => {
        setPermitted((p) => ({ ...p, [host]: false }));
        void setSiteEnabled(host, false);
      });
    } else {
      void requestAndRegister(host).then((ok) => {
        if (ok) {
          setPermitted((p) => ({ ...p, [host]: true }));
          void setSiteEnabled(host, true);
        }
      });
    }
  };

  const submitCustom = (): void => {
    const host = normalizeHost(draft);
    if (!host) {
      setErr('כתובת לא תקינה - הזן דומיין כמו example.com');
      return;
    }
    if (
      STATIC_SITES.some((s) => s.host === host) ||
      RECOMMENDED_SITES.some((s) => s.host === host) ||
      customSites.some((s) => s.host === host)
    ) {
      setErr('האתר כבר קיים ברשימה');
      return;
    }
    add(host, host);
    setDraft('');
    setErr('');
  };

  return (
    <section className="mb-6 rounded-xl border border-border bg-surface p-6">
      <h2 className="text-sm font-semibold">אתרים נתמכים</h2>

      {/* Built-in (statically injected) */}
      <div className="mt-2">
        {STATIC_SITES.map((site) => (
          <SiteRow
            key={site.host}
            site={site}
            on={enabled[site.host] ?? true}
            onToggle={() => toggle(site.host)}
          />
        ))}
      </div>

      {/* Recommended (opt-in) */}
      <h3 className="mt-6 text-xs font-semibold uppercase tracking-wider text-text-secondary">
        אתרים מומלצים
      </h3>
      <div className="mt-1">
        {RECOMMENDED_SITES.map((site) => (
          <SiteRow
            key={site.host}
            site={site}
            on={permitted[site.host] ?? false}
            onToggle={() => toggleDynamic(site.host)}
          />
        ))}
      </div>

      {/* Custom sites */}
      {customSites.length > 0 && (
        <>
          <h3 className="mt-6 text-xs font-semibold uppercase tracking-wider text-text-secondary">
            אתרים מותאמים אישית
          </h3>
          <div className="mt-1">
            {customSites.map((site) => (
              <SiteRow
                key={site.host}
                site={site}
                on={permitted[site.host] ?? false}
                onToggle={() => toggleDynamic(site.host)}
                onRemove={() => {
                  void unregisterSite(site.host);
                  void setSiteEnabled(site.host, false);
                  remove(site.host);
                }}
              />
            ))}
          </div>
        </>
      )}

      {/* Add custom */}
      <div className="mt-5">
        <label className="text-xs font-medium text-text-secondary">הוסף אתר מותאם אישית</label>
        <div className="mt-2 flex items-center gap-2">
          <input
            dir="ltr"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              if (err) setErr('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitCustom();
            }}
            placeholder="example.com"
            className="h-9 flex-1 rounded-lg border border-border bg-bg px-3 font-mono text-xs text-text-primary outline-none [unicode-bidi:isolate] focus:border-text-secondary"
          />
          <button
            type="button"
            onClick={submitCustom}
            className="h-9 shrink-0 rounded-lg bg-crimson px-4 text-[13px] font-semibold text-white transition-[filter] hover:brightness-110"
          >
            הוסף
          </button>
        </div>
        {err && <p className="mt-2 text-xs text-error">{err}</p>}
      </div>

      <p className="mt-4 text-xs leading-relaxed text-text-secondary">
        הפעלת אתר מומלץ או מותאם דורשת אישור הרשאה, <strong>ויחול בהפעלה מחדש</strong> של הדף.
      </p>
    </section>
  );
}
