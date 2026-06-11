import { test, expect, prepareSite, readBlock } from '../fixtures';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LAYER_DESCRIPTIONS } from '../../src/overlay/localize';

// Acceptance E2E — Alert & Reveal in the LIVE overlay (the core product value).
// On a real infected upload the Shadow-DOM overlay must show: the verbatim hidden
// payload, the Hebrew layer description, the Hebrew location ("עמוד N"), and
// block / allow controls. Uses a frozen acceptance-corpus PDF (micro_font).
const HERE = path.dirname(fileURLToPath(import.meta.url));
const MICRO_PDF = path.resolve(HERE, '../../test/acceptance/corpus/pdf/tp_micro_en.pdf');

test('chatgpt: overlay reveals payload + Hebrew layer + location, then blocks', async ({ context }) => {
  const { page, uploadHits } = await prepareSite(context, 'chatgpt');

  await page.setInputFiles('#file', MICRO_PDF);
  void page.click('#send');

  const overlay = page.locator('[data-testid="tg-overlay"]');
  await expect(overlay).toBeVisible({ timeout: 15_000 });

  // Verbatim payload (the planted reveal-word) is shown.
  const payload = page.locator('[data-testid="tg-payload"]');
  await expect(payload).toBeVisible();
  await expect(payload).toContainText('quantum');

  // Hebrew layer description + Hebrew page location.
  await expect(overlay).toContainText(LAYER_DESCRIPTIONS['micro_font'] as string);
  await expect(overlay).toContainText('עמוד');

  // Block controls present in Hebrew; user blocks.
  await expect(page.locator('[data-testid="tg-block-btn"]')).toHaveText(/חסום/);
  await page.locator('[data-testid="tg-block-btn"]').click();

  // The block marker is set asynchronously as the held fetch resolves to a
  // verdict — poll rather than read once (avoids the settle race).
  await expect.poll(() => readBlock(page).then((b) => b?.verdict ?? null), { timeout: 10_000 }).toBe('infected');
  expect(uploadHits).toEqual([]);
});

test('chatgpt: user can ALLOW anyway and the upload proceeds', async ({ context }) => {
  const { page, uploadHits } = await prepareSite(context, 'chatgpt');

  await page.setInputFiles('#file', MICRO_PDF);
  void page.click('#send');

  const allowBtn = page.locator('[data-testid="tg-allow-btn"]');
  await expect(allowBtn).toBeVisible({ timeout: 15_000 });
  await expect(allowBtn).toHaveText(/אפשר/);
  await allowBtn.click();

  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __uploadStatus?: number }).__uploadStatus ?? null), {
      timeout: 10_000,
    })
    .toBe(200);
  expect(uploadHits.length).toBeGreaterThan(0);
});
