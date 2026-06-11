// Phase 6 unit vectors for the pure (browser-free) settings/sites/history logic.
import { describe, it, expect, beforeEach } from 'vitest';
import { normalizeHost } from '../src/sites';
import { isInterceptionActive } from '../src/settings';
import { entryFromReport, appendHistory, HISTORY_KEY, type HistoryEntry } from '../src/history';
import type { Report } from '../src/engine/schema';

describe('normalizeHost', () => {
  it('accepts a bare host', () => {
    expect(normalizeHost('gemini.google.com')).toBe('gemini.google.com');
  });
  it('lowercases + strips scheme/path/www', () => {
    expect(normalizeHost('HTTPS://www.Example.com/foo/bar')).toBe('example.com');
    expect(normalizeHost('  perplexity.ai  ')).toBe('perplexity.ai');
  });
  it('rejects invalid hosts', () => {
    expect(normalizeHost('')).toBeNull();
    expect(normalizeHost('localhost')).toBeNull(); // no dot / no TLD
    expect(normalizeHost('no spaces.com here')).toBeNull();
    expect(normalizeHost('http://')).toBeNull();
    expect(normalizeHost('-bad-.com')).toBeNull();
  });
});

describe('isInterceptionActive', () => {
  it('is off while paused, regardless of host', () => {
    expect(isInterceptionActive('chatgpt.com', true, { 'chatgpt.com': true })).toBe(false);
  });
  it('is off for an explicitly disabled host', () => {
    expect(isInterceptionActive('claude.ai', false, { 'claude.ai': false })).toBe(false);
  });
  it('defaults ON for unknown hosts (protection on by default)', () => {
    expect(isInterceptionActive('new.ai', false, {})).toBe(true);
  });
  it('is on for an enabled host', () => {
    expect(isInterceptionActive('chatgpt.com', false, { 'chatgpt.com': true })).toBe(true);
  });
});

function makeReport(over: Partial<Report>): Report {
  return {
    ok: true,
    file: { path: 'x.txt', type: 'txt', size_bytes: 1, pages: null },
    verdict: 'clean',
    threats: [],
    sanitized: false,
    error: null,
    ...over,
  };
}

describe('entryFromReport', () => {
  it('captures verbatim payload + layer + location for infected', () => {
    const report = makeReport({
      verdict: 'infected',
      threats: [
        {
          layer: 'zero_width',
          severity: 'high',
          location: { line: 3, col: 12 },
          extracted_text: 'hidden ☠ instruction',
        },
      ],
    });
    const e = entryFromReport('assignment.txt', report);
    expect(e.name).toBe('assignment.txt');
    expect(e.verdict).toBe('infected');
    expect(e.layer).toBe('zero_width');
    expect(e.payload).toBe('hidden ☠ instruction');
    expect(e.location).toEqual({ line: 3, col: 12 });
    expect(e.fileType).toBe('txt');
    expect(typeof e.ts).toBe('number');
  });

  it('records nulls for a clean scan (no threat)', () => {
    const e = entryFromReport('clean.txt', makeReport({ verdict: 'clean' }));
    expect(e.verdict).toBe('clean');
    expect(e.layer).toBeNull();
    expect(e.payload).toBeNull();
    expect(e.location).toBeNull();
  });

  it('caps the stored payload to 1000 chars', () => {
    const long = 'a'.repeat(5000);
    const report = makeReport({
      verdict: 'infected',
      threats: [{ layer: 'micro_font', severity: 'high', location: {}, extracted_text: long }],
    });
    const e = entryFromReport('big.pdf', report);
    expect(e.payload).toHaveLength(1000);
  });
});

describe('appendHistory serialization (concurrent reports)', () => {
  // In-memory storage.local mock whose get/set resolve asynchronously, so a
  // naive read-modify-write would interleave and drop entries.
  let store: Record<string, unknown> = {};
  beforeEach(() => {
    store = {};
    const tick = () => new Promise((r) => setTimeout(r, 0));
    (globalThis as unknown as { browser: unknown }).browser = {
      storage: {
        local: {
          async get(key: string) {
            await tick();
            return key in store ? { [key]: store[key] } : {};
          },
          async set(items: Record<string, unknown>) {
            await tick();
            Object.assign(store, items);
          },
        },
      },
    };
  });

  function makeEntry(name: string): HistoryEntry {
    return {
      id: name,
      name,
      fileType: 'txt',
      verdict: 'clean',
      layer: null,
      payload: null,
      location: null,
      ts: Date.now(),
    };
  }

  it('keeps every entry when appends race', async () => {
    await Promise.all([
      appendHistory(makeEntry('a')),
      appendHistory(makeEntry('b')),
      appendHistory(makeEntry('c')),
    ]);
    const saved = store[HISTORY_KEY] as HistoryEntry[];
    expect(saved.map((e) => e.id).sort()).toEqual(['a', 'b', 'c']);
  });
});
