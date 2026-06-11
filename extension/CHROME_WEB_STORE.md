# Chrome Web Store — Submission Guide (TrapGuard)

Phase 7 produces a **ready-to-submit** package. This file is the checklist for
finishing the listing. **Nothing here is submitted automatically** — the owner
must complete the developer-console steps.

## What the build produces

```
pnpm zip      # builds .output/chrome-mv3 + zips it
→ .output/trapguard-extension-<version>-chrome.zip   ← upload THIS
```

The zip is the packaged `.output/chrome-mv3` directory. It already contains:

- `manifest.json` — MV3, valid metadata:
  - **name:** `TrapGuard`
  - **description:** Hebrew, < 132 chars
  - **version:** `1.0.0`
  - **icons:** 16 / 32 / 48 / **128** (128×128 present — required for the store tile)
- Self-hosted fonts (`fonts/*.woff2`) — **zero external network calls**.
- Engine, gate, bridge, popup, options, onboarding, background.

## What the OWNER must supply (not in the repo)

| Item | Notes |
|---|---|
| **Developer account** | One-time US$5 registration at the Chrome Web Store developer console. |
| **Privacy policy URL** | **Required.** The extension reads file *content* locally (sensitive). State plainly: 100% local, file bytes never leave the browser, only metadata (filename, verdict, timestamp) is stored locally for scan history, nothing is transmitted. Host it (e.g. a GitHub Pages page on `oribitan258/TrapGuard`). |
| **Store listing copy** | Title, short (≤132) + detailed description. Hebrew to match the product; English optional for reach. |
| **Screenshots** | 1280×800 or 640×400, at least one. Suggest: the Alert & Reveal overlay on ChatGPT, the options page, the scan-history view. (The `e2e/screens.spec.ts` harness can produce candidates.) |
| **Promo tile (optional)** | 440×280 small promo tile improves placement. |
| **Category & language** | Category: *Productivity* (or *Developer Tools*). Primary language: Hebrew. |
| **Single-purpose statement** | "Detects hidden prompt-injection instructions in academic files before they are uploaded to AI assistants." |
| **Permission justifications** | Reviewers WILL ask. Pre-written below. |

## Permission justifications (paste into the review form)

- **`host_permissions` (chatgpt.com, chat.openai.com, claude.ai):** the gate must
  run at `document_start` on the supported AI surfaces to intercept file uploads
  before they leave the browser.
- **`optional_host_permissions: https://*/*`:** NOT requested at install. Only
  used if the user explicitly adds a custom AI site in settings; the host is then
  requested at runtime via `chrome.permissions.request` behind a user gesture.
- **`scripting`:** registers the gate/bridge content scripts on user-added custom
  AI sites (dynamic `chrome.scripting.registerContentScripts`).
- **`storage`:** settings (sync) + scan history & pause flag (local, metadata-only).
- **`web_accessible_resources` (`engine.js`, `fonts/*.woff2`, matches `https://*/*`,
  `use_dynamic_url`):** the engine Worker is spawned from the page context and the
  overlay loads bundled fonts from the extension origin; the rotating dynamic URL
  prevents fingerprinting. No secrets or user data in these resources.

## Data-use disclosures (developer console)

- Does the extension collect user data? **The extension processes file content
  locally and does NOT transmit it.** Scan history stored locally is metadata only
  (filename + verdict + timestamp + the revealed hidden text), never the file
  bytes, and never leaves the device.
- Tick: *not sold to third parties*, *not used for unrelated purposes*, *not used
  for creditworthiness/lending*.

## Pre-submit sanity

- [ ] Bump `version` in `wxt.config.ts` manifest if re-uploading.
- [ ] `pnpm compile && pnpm lint && pnpm test` all green.
- [ ] `pnpm zip` → upload the chrome zip.
- [ ] Load-unpacked `.output/chrome-mv3` once in Chrome to smoke-test the overlay.
