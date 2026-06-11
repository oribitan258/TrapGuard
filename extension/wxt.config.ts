import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';
import { SUPPORTED_MATCHES } from './src/sites';

// TrapGuard MV3 extension — WXT config.
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'TrapGuard',
    // Hebrew-only user-facing copy (CLAUDE.md Language & RTL mandate).
    description:
      'מזהה מלכודות הוראות מוסתרות בקבצים אקדמיים לפני העלאתם לכלי AI.',
    // Explicit so the chrome://extensions card AND the toolbar button always
    // render the TrapGuard red-shield logo (files live in public/icon/).
    icons: {
      16: 'icon/16.png',
      32: 'icon/32.png',
      48: 'icon/48.png',
      128: 'icon/128.png',
    },
    action: {
      default_title: 'TrapGuard',
      default_icon: {
        16: 'icon/16.png',
        32: 'icon/32.png',
        48: 'icon/48.png',
        128: 'icon/128.png',
      },
    },
    // options_ui is auto-derived by WXT from the options/ entrypoint; open_in_tab
    // is set via the <meta name="manifest.open_in_tab"> tag in options/index.html
    // (a manifest-config options_ui here is OVERRIDDEN by the entrypoint, which
    // is why the built manifest shipped open_in_tab:false through Phase 6).
    // 'storage' backs the settings + scan history; 'scripting' backs the dynamic
    // registration of the gate/bridge on user-added AI sites (Phase 6).
    permissions: ['storage', 'scripting'],
    // Defense-in-depth (Final-Exam hardening H-5): pin the extension-page CSP
    // explicitly instead of relying on the MV3 default. 'self' only — the
    // popup/options/onboarding pages are bundled React with NO eval and make NO
    // network calls (100% local; fonts load from the extension origin = 'self').
    // This forbids inline scripts and any remote/eval code on our own pages.
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self'; base-uri 'self'",
    },
    host_permissions: [...SUPPORTED_MATCHES],
    // Opt-in AI surfaces (recommended Gemini/Copilot/Perplexity + user customs)
    // are granted at runtime via chrome.permissions.request — declared broad here
    // so any https host the user adds can be requested. NOT requested at install;
    // the install prompt only covers host_permissions above.
    optional_host_permissions: ['https://*/*'],
    // The engine Worker (/engine.js, the entrypoints/engine.ts unlisted script)
    // is spawned from the isolated-world bridge, so it must be web-accessible.
    // Broad matches so the bridge can also spawn it on dynamically-registered
    // sites; the file is the stateless detection engine (no secrets, no user data).
    web_accessible_resources: [
      {
        // engine.js (Worker) + self-hosted fonts (Phase 7). The fonts back the
        // Shadow-DOM overlay's @font-face rules, which load from the extension
        // origin on the host page — so they must be web-accessible. They carry
        // no secrets or user data (just woff2 glyphs).
        resources: ['engine.js', 'fonts/*.woff2'],
        matches: ['https://*/*'],
        // Rotate the resource URL per session so the broad `matches` can't be
        // abused to fingerprint the extension via a static path. The bridge
        // always resolves it through browser.runtime.getURL(), so this is transparent.
        use_dynamic_url: true,
      },
    ],
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
