// Background service worker (Phase 6). Two jobs:
//   1. First-run onboarding — open the 3-step tour once, on fresh install.
//   2. Re-apply dynamic content-script registrations for opt-in AI sites after
//      an install/update/startup (dynamic registrations are cleared on update).
import { RECOMMENDED_SITES, type SupportedSite } from '../src/sites';
import { CUSTOM_SITES_KEY } from '../src/sites';
import { ensureRegistered, isSitePermitted } from '../src/registration';
import { hasSeenOnboarding, openOnboarding } from '../src/onboarding';

async function reapplyRegistrations(): Promise<void> {
  const res = await browser.storage.sync.get(CUSTOM_SITES_KEY);
  const custom = (res[CUSTOM_SITES_KEY] as SupportedSite[] | undefined) ?? [];
  const candidates = [...RECOMMENDED_SITES, ...custom];
  for (const site of candidates) {
    // Only (re)register sites the user actually granted permission for.
    if (await isSitePermitted(site.host)) {
      await ensureRegistered(site.host).catch((err) =>
        console.warn('[TrapGuard] re-register failed for', site.host, err),
      );
    }
  }
}

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
      void hasSeenOnboarding().then((seen) => {
        if (!seen) openOnboarding();
      });
    }
    void reapplyRegistrations();
  });

  browser.runtime.onStartup.addListener(() => {
    void reapplyRegistrations();
  });
});
