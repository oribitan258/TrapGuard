import { test, expect, readBlock } from '../fixtures';
import { prepareHostile } from './host';

// RED TEAM — Vector 1 REMEDIATION regression.
//
// Originally PARTIAL BLINDING: a hostile page could hide/remove the overlay host
// node; the infected upload stayed HELD (not allowed) but the reveal was
// defeated and resolution waited on the 30 s auto-block. The fix adds a
// suppression monitor: if the INFECTED card is hidden / removed / obscured while
// its verdict is pending, the gate is force-resolved to BLOCK immediately. This
// can never fail open (a clean upload shows no card); worst case it blocks an
// already-infected upload the user could not have safely seen anyway.

const HOST_ID = 'trapguard-overlay-host';

const INFECTED_UPLOAD = `window.__run = async () => {
  const fd = new FormData();
  fd.append('file', infectedFile('evil.txt'), 'evil.txt');
  fetch('/api/upload', { method: 'POST', body: fd }).catch(() => {});
};`;

test('hiding the overlay (display:none) FORCE-BLOCKS the pending infected upload', async ({
  context,
}) => {
  const { page, uploadHits } = await prepareHostile(
    context,
    `const s = document.createElement('style');
     s.textContent = '#${HOST_ID}{display:none !important;visibility:hidden !important}';
     document.documentElement.appendChild(s);
     ${INFECTED_UPLOAD}`,
  );
  await page.evaluate(() => (window as unknown as { __run: () => Promise<void> }).__run());

  // The card mounts (hidden) → the suppression monitor trips after its grace
  // window → the gate is force-resolved to BLOCK.
  await expect
    .poll(() => readBlock(page).then((b) => b?.verdict ?? null), { timeout: 15_000 })
    .toBe('infected');
  // The infected upload never reached the endpoint.
  expect(uploadHits).toEqual([]);
});

test('removing the overlay host node FORCE-BLOCKS (DOM removal != allow)', async ({ context }) => {
  const { page, uploadHits } = await prepareHostile(
    context,
    `${INFECTED_UPLOAD}
     // Once the host node appears, rip it out of the DOM.
     const obs = new MutationObserver(() => {
       const el = document.getElementById('${HOST_ID}');
       if (el) { el.remove(); obs.disconnect(); }
     });
     obs.observe(document.documentElement, { childList: true, subtree: true });`,
  );
  await page.evaluate(() => (window as unknown as { __run: () => Promise<void> }).__run());

  await expect
    .poll(() => readBlock(page).then((b) => b?.verdict ?? null), { timeout: 15_000 })
    .toBe('infected');
  expect(uploadHits).toEqual([]);
});
