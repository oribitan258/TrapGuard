// Scan history — METADATA ONLY, stored in chrome.storage.local (Phase 6).
//
// PRIVACY (NON-NEGOTIABLE): history MUST live in storage.local, never .sync —
// entries include the revealed verbatim payload, and syncing would replicate a
// professor's hidden instruction (and the user's filenames) across every device
// signed into the same browser profile. File BYTES are never stored — only a
// bounded snapshot of metadata. Ring-buffered to MAX_ENTRIES, newest first.
import { useEffect, useState } from 'react';
import type { Report } from './engine/schema';
import type { Verdict } from './engine/verdict';
import type { Layer, FileType } from './engine/schema';

/** chrome.storage.local key for the ring-buffered scan history. */
export const HISTORY_KEY = 'tg.history';

/** Ring-buffer cap — keeps the stored blob small (~<100 KB worst case). */
export const MAX_ENTRIES = 100;

/** Upper bound on a stored payload so one entry can't bloat storage. */
const PAYLOAD_CAP = 1000;

export interface HistoryEntry {
  /** Unique id (crypto.randomUUID). */
  id: string;
  /** Original filename as seen at the upload site. */
  name: string;
  fileType: FileType | null;
  verdict: Verdict;
  /** Primary threat layer (infected only). */
  layer: Layer | null;
  /** Verbatim primary payload, capped to PAYLOAD_CAP chars (infected only). */
  payload: string | null;
  /** Raw primary-threat location object (for the Hebrew location formatter). */
  location: Record<string, unknown> | null;
  /** Epoch ms. */
  ts: number;
}

/** Build a history entry from a worker Report + the real upload filename. */
export function entryFromReport(name: string, report: Report): HistoryEntry {
  const threat = report.threats[0];
  const payload =
    threat && threat.extracted_text
      ? threat.extracted_text.slice(0, PAYLOAD_CAP)
      : null;
  return {
    id: crypto.randomUUID(),
    name,
    fileType: report.file?.type ?? null,
    verdict: report.verdict,
    layer: threat?.layer ?? null,
    payload,
    location: threat?.location ?? null,
    ts: Date.now(),
  };
}

// Serialize writes within this context: appendHistory does a read-modify-write
// on storage.local, and reports can arrive concurrently (several files dropped /
// prewarmed at once). Without this chain, two interleaved get→set calls would
// read the same `prev` and the second `set` would clobber the first entry.
// (Cross-tab races remain theoretically possible — storage has no atomic update —
// but are rare and out of scope; this fixes the common single-tab burst.)
let writeChain: Promise<void> = Promise.resolve();

async function appendHistoryUnsafe(entry: HistoryEntry): Promise<void> {
  const res = await browser.storage.local.get(HISTORY_KEY);
  const prev = (res[HISTORY_KEY] as HistoryEntry[] | undefined) ?? [];
  const next = [entry, ...prev].slice(0, MAX_ENTRIES);
  await browser.storage.local.set({ [HISTORY_KEY]: next });
}

/** Append an entry, newest-first, ring-buffered to MAX_ENTRIES. */
export function appendHistory(entry: HistoryEntry): Promise<void> {
  writeChain = writeChain.then(() => appendHistoryUnsafe(entry)).catch(() => {});
  return writeChain;
}

/** Clear the entire scan history. */
export async function clearHistory(): Promise<void> {
  await browser.storage.local.remove(HISTORY_KEY);
}

/** Live-updating history list for the options page. */
export function useHistory(): { entries: HistoryEntry[]; clear: () => void } {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    let active = true;
    void browser.storage.local.get(HISTORY_KEY).then((res) => {
      const stored = res[HISTORY_KEY] as HistoryEntry[] | undefined;
      if (active && Array.isArray(stored)) setEntries(stored);
    });
    const onChanged = (
      changes: Record<string, { newValue?: unknown }>,
      area: string,
    ): void => {
      if (area === 'local' && changes[HISTORY_KEY]) {
        const next = changes[HISTORY_KEY].newValue;
        setEntries(Array.isArray(next) ? (next as HistoryEntry[]) : []);
      }
    };
    browser.storage.onChanged.addListener(onChanged);
    return () => {
      active = false;
      browser.storage.onChanged.removeListener(onChanged);
    };
  }, []);

  const clear = (): void => {
    setEntries([]);
    void clearHistory();
  };

  return { entries, clear };
}
