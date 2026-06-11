// First-run onboarding flag + opener (Phase 6).
// The 3-step tour is shown once on install; the "seen" flag (storage.sync) lets
// the options page offer a "הצג מדריך מחדש" replay, and guards the background
// from re-opening the tour on a reinstall where the flag already synced back.

/** chrome.storage.sync key for the onboarding-seen flag. */
export const ONBOARDING_SEEN_KEY = 'tg.onboarding.seen';

export async function hasSeenOnboarding(): Promise<boolean> {
  const res = await browser.storage.sync.get(ONBOARDING_SEEN_KEY);
  return res[ONBOARDING_SEEN_KEY] === true;
}

export async function markOnboardingSeen(): Promise<void> {
  await browser.storage.sync.set({ [ONBOARDING_SEEN_KEY]: true });
}

/** Open the onboarding page in a new tab. */
export function openOnboarding(): void {
  void browser.tabs.create({ url: browser.runtime.getURL('/onboarding.html') });
}
