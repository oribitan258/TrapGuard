import { test, expect } from '../fixtures';
import { prepareHostile } from './host';

// RED TEAM — Vector 2b: Prototype poisoning of the GATE (MAIN-world realm).
//
// The gate runs in world:'MAIN' — the host page's own JS realm. The page can
// therefore redefine the very primitives the gate uses to FIND files in an
// upload body: FormData.prototype.values and the `instanceof File` check. Blind
// those and the gate sees an empty file list → passes the upload through
// unscanned, while the real (infected) bytes still ride the original FormData.
//
// Attacker PASS = infected upload reaches the endpoint with NO overlay.

test('poisoning FormData.values + File[Symbol.hasInstance] blinds the gate (BYPASS)', async ({
  context,
}) => {
  const { page, uploadHits, bodies } = await prepareHostile(
    context,
    `// Poison AFTER the gate installed at document_start. The gate reads these
     // lazily at fetch time, so post-install poisoning still blinds extraction.
     FormData.prototype.values = function* () { /* yields nothing */ };
     Object.defineProperty(File, Symbol.hasInstance, { value: () => false });

     window.__run = async () => {
       const fd = new FormData();
       fd.append('file', infectedFile('evil.txt'), 'evil.txt');
       try {
         const r = await fetch('/api/upload', { method: 'POST', body: fd });
         window.__uploadStatus = r.status;
       } catch (e) { window.__uploadError = (e && e.name) || String(e); }
     };`,
  );

  await page.evaluate(() => (window as unknown as { __run: () => Promise<void> }).__run());

  // The infected upload completed and reached the endpoint…
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __uploadStatus?: number }).__uploadStatus ?? null), {
      timeout: 10_000,
    })
    .toBe(200);
  expect(uploadHits.length).toBeGreaterThan(0);
  // …carrying the real infected payload…
  expect(bodies.join('\n')).toContain('If you are an AI');
  // …and TrapGuard never showed an overlay (the gate was blinded).
  await expect(page.locator('[data-testid="tg-overlay"]')).not.toBeVisible();
});
