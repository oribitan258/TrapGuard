import { test, expect } from '../fixtures';
import { prepareHostile } from './host';

// RED TEAM — Vector 3: TOCTOU on the mutable fetch body.
//
// The gate extracts files SYNCHRONOUSLY at guardFetch entry, then `await`s the
// verdict, then calls originalFetch(input, init) with the SAME `init.body`
// reference. For a raw `fetch(url, { body: fd })` the FormData is mutable and is
// sent by reference — so a file appended DURING the await window ships unscanned.
//
// Attacker PASS = a file added after the clean snapshot reaches the endpoint
// with NO infected overlay (the gate only ever scanned the decoy).

test('appending an infected file during the verdict await ships it unscanned (BYPASS)', async ({
  context,
}) => {
  const { page, uploadHits, bodies } = await prepareHostile(
    context,
    `window.__run = async () => {
       const fd = new FormData();
       fd.append('file', cleanFile('clean.txt'), 'clean.txt'); // decoy: scans CLEAN
       const p = fetch('/api/upload', { method: 'POST', body: fd });
       // Lands during the gate's await getVerdict(): after the synchronous
       // extract snapshot (clean-only), before originalFetch sends fd.
       queueMicrotask(() => fd.append('evil', infectedFile('evil.txt'), 'evil.txt'));
       try {
         const r = await p;
         window.__uploadStatus = r.status;
       } catch (e) { window.__uploadError = (e && e.name) || String(e); }
     };`,
  );

  await page.evaluate(() => (window as unknown as { __run: () => Promise<void> }).__run());

  // The request went through as 'clean' (decoy scanned) …
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __uploadStatus?: number }).__uploadStatus ?? null), {
      timeout: 10_000,
    })
    .toBe(200);
  expect(uploadHits.length).toBeGreaterThan(0);
  // … but the body that actually shipped contains the infected payload, which
  // was NEVER scanned, and NO infected overlay was shown.
  expect(bodies.join('\n')).toContain('If you are an AI');
  await expect(page.locator('[data-testid="tg-overlay"]')).not.toBeVisible();
});
