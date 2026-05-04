# Alt Text Generator

A Chrome MV3 extension that generates WCAG-compliant alt text for any image via right-click context menu, using a three-tier inference cascade:

1. **Chrome Built-in AI** — instant, no API key, requires Chrome 131+ with Gemini Nano
2. **Gemma 4 E2B** — runs fully in-browser via WebGPU (one-time ~2 GB download)
3. **Cloud API** — Anthropic, OpenAI, Gemini, or a custom OpenAI-compatible endpoint

## Requirements

- Node.js 20+
- Chrome 131+ (for Chrome Built-in AI; all other tiers work on any Chromium-based browser)

## Setup

```bash
npm install
npm run build
```

## Loading the Extension in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode** (toggle, top-right)
3. Click **Load unpacked** → select the `dist/` folder

The extension is now active. Right-click any image on any page and choose **Generate Alt Text**.

## Development

```bash
npm run dev          # watch mode — rebuilds on save
npm run typecheck    # TypeScript check (both DOM and worker contexts)
npm test             # unit tests (Vitest, 31 tests)
npx playwright test  # integration tests (requires built dist/)
```

After editing source files in watch mode, go to `chrome://extensions` and click the refresh icon on the extension card to reload it in the browser.

## Configuration

Open the extension's options page (click the extension icon → **Options**, or visit `chrome://extensions` → Details → Extension options) to configure:

- **AI Provider** — Auto (cascade), or pin to a specific provider
- **API Keys** — stored in `chrome.storage.local` (device-only, never synced)
- **Style** — Brief (1–2 sentences) or Detailed (full description)
- **Custom prompt** — override the default with your own, using `{style}` as a placeholder

## Project Structure

```
src/
  types.ts                  # Shared types across all extension contexts
  storage.ts                # chrome.storage abstraction (sync for settings, local for keys)
  prompt.ts                 # Prompt construction + {style} interpolation
  inference/
    chrome-ai.ts            # Chrome Built-in AI (Prompt API) provider
    cloud.ts                # Anthropic / OpenAI / Gemini / Custom providers
    cascade.ts              # Tier selection logic
  background/
    service-worker.ts       # Context menu, cascade routing, offscreen lifecycle
  offscreen/
    offscreen.html          # Offscreen document entry point
    offscreen.ts            # Gemma 4 E2B host (WebGPU, promise-cached model)
  content/
    content.ts              # Injected script: tracks right-click, handles messages
    popup.ts                # Shadow DOM popup component
  options/
    options.html / .css / .ts
tests/
  unit/                     # Vitest unit tests
  integration/              # Playwright extension tests
```

## Manual Smoke Test

1. Load the extension (see above)
2. Navigate to any image-heavy page (e.g. a news site)
3. Right-click an image → **Generate Alt Text**
4. Verify: a loading popup appears near the image
5. Verify: after generation, alt text appears with a Copy button and source label
6. Click **Copy** → paste into a text editor and verify the text matches
7. Open extension options → verify the cascade status shows correctly
