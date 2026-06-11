import {
  test as base,
  chromium,
  expect,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLAUDE_HTML, CHATGPT_HTML } from './host';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(HERE, '../.output/chrome-mv3');

// New-headless Chromium loads MV3 extensions; set TG_HEADED=1 to watch it run.
const HEADED = process.env.TG_HEADED === '1';

// Override the default `context` with a persistent one that has the unpacked
// extension loaded — the only way Chromium will run MV3 content scripts.
export const test = base.extend<{ context: BrowserContext }>({
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      headless: false,
      // TG_HIDPI=1 renders at 2x for crisp review screenshots (see screens.spec.ts).
      ...(process.env.TG_HIDPI === '1' ? { deviceScaleFactor: 2 } : {}),
      args: [
        ...(HEADED ? [] : ['--headless=new']),
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        '--no-sandbox',
      ],
    });
    await use(context);
    await context.close();
  },
});

export { expect };

export type Site = 'claude' | 'chatgpt';

interface SiteDef {
  origin: string;
  html: string;
  isUploadEndpoint: (pathname: string) => boolean;
}

const SITES: Record<Site, SiteDef> = {
  claude: {
    origin: 'https://claude.ai',
    html: CLAUDE_HTML,
    isUploadEndpoint: (p) => p === '/api/upload',
  },
  chatgpt: {
    origin: 'https://chatgpt.com',
    html: CHATGPT_HTML,
    isUploadEndpoint: (p) => p === '/__tg_blob/put',
  },
};

export interface PreparedSite {
  page: Page;
  /** "METHOD /path" for every request that reached the real upload endpoint. */
  uploadHits: string[];
}

// Write into the extension's chrome.storage via its background service worker —
// the only handle from Playwright that has chrome.* access. Used to exercise the
// Phase 6 pause flag (storage.local) before a host page loads.
export async function setExtensionStorage(
  context: BrowserContext,
  area: 'local' | 'sync',
  items: Record<string, unknown>,
): Promise<void> {
  let [sw] = context.serviceWorkers();
  if (!sw) sw = await context.waitForEvent('serviceworker');
  // Runs in the SW realm where chrome.* exists; typed loosely for the Node checker.
  await sw.evaluate(
    ({ area, items }) => {
      const c = (globalThis as unknown as {
        chrome: { storage: Record<'local' | 'sync', { set(i: Record<string, unknown>): Promise<void> }> };
      }).chrome;
      return c.storage[area].set(items);
    },
    { area, items },
  );
}

// Route the host origin to our fixture, open it, and wait until the gate has
// finished its cross-world handshake so the verdict round-trip can't race the
// upload. Returns the page plus a live record of upload-endpoint hits.
export async function prepareSite(context: BrowserContext, site: Site): Promise<PreparedSite> {
  const def = SITES[site];
  const uploadHits: string[] = [];

  await context.route(`${def.origin}/**`, async (route) => {
    const req = route.request();
    const pathname = new URL(req.url()).pathname;

    if (pathname === '/') {
      await route.fulfill({ contentType: 'text/html; charset=utf-8', body: def.html });
      return;
    }
    if (site === 'chatgpt' && pathname === '/backend-api/files') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ upload_url: `${def.origin}/__tg_blob/put` }),
      });
      return;
    }
    if (def.isUploadEndpoint(pathname)) {
      uploadHits.push(`${req.method()} ${pathname}`);
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
      return;
    }
    await route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' });
  });

  const page = await context.newPage();
  await page.goto(`${def.origin}/`);
  await page.waitForFunction(
    () => (window as unknown as { __trapguardReady?: boolean }).__trapguardReady === true,
  );
  return { page, uploadHits };
}

export interface BlockMarker {
  name: string;
  verdict: string;
}

export async function readBlock(page: Page): Promise<BlockMarker | null> {
  return page.evaluate(() => {
    const marker = (window as unknown as { __trapguardLastBlock?: BlockMarker }).__trapguardLastBlock;
    return marker ?? null;
  });
}
