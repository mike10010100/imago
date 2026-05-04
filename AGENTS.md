# Agent Guide

This is a Chrome MV3 extension that generates alt text for images. Read this before making changes.

## Build System

Two separate Vite builds, one post-build script:

```bash
npm run build          # runs both builds + postbuild
npm run typecheck      # tsc across both tsconfig.dom.json and tsconfig.worker.json
npm test               # vitest unit tests
npx playwright test    # integration tests (needs built dist/ first)
```

**Why two builds?** Content scripts must be IIFE (no ES module imports at runtime). Everything else (service worker, offscreen, options) is ESM. `vite.config.ts` handles the ESM bundle; `vite.content.config.ts` produces the IIFE.

**Why two tsconfigs?** `tsconfig.dom.json` includes the DOM lib (content, offscreen, options). `tsconfig.worker.json` uses the service worker lib. Mixing them causes type errors. Never add `lib: ["DOM"]` to the base `tsconfig.json`.

**`scripts/postbuild.mjs`** copies `manifest.json`, `icons/`, `options.html`, `options.css`, and `offscreen.html` into `dist/`. It also rewrites the `offscreen.html` script src from `../offscreen.js` → `offscreen.js`. If you add new static assets, add them here.

## Architecture

```
Right-click image
  → service-worker.ts (context menu handler)
    → fetches image bytes (fetchImageBytes)
    → runCascade() → chrome-ai.ts | offscreen.ts (Gemma) | cloud.ts
    → sendMessage SHOW_POPUP to content script
      → content/popup.ts (Shadow DOM popup)
```

**Offscreen document** hosts the Gemma 4 E2B model. It persists across uses to keep the model warm in WebGPU memory. The model is promise-cached — a single `pipePromise` variable holds the in-flight or resolved pipeline. If you need to reload the model, set `pipePromise = null`.

**Shadow DOM popup** uses `mode: 'closed'`. The `ShadowRoot` reference must be stored in a module-level variable at creation time — `host.shadowRoot` always returns `null` for closed roots. Outside-click detection uses `e.composedPath()` because shadow DOM retargets events.

**Message passing** uses the `ExtensionMessage` discriminated union in `src/types.ts`. Every message type is in that union — add new message types there first.

## Chrome Storage

- `chrome.storage.sync` — user settings (`Settings` interface). Synced across devices.
- `chrome.storage.local` — API keys (`ApiKeys` interface). Device-only, never leaves the machine.

`chrome.storage.get()` requires casting through `unknown` due to `@types/chrome` overload restrictions. See `storage.ts` for the pattern.

## Inference Cascade

`cascade.ts` routes requests:
1. If `settings.provider !== 'auto'` → use that cloud provider directly
2. If `preferBuiltinAI` and Chrome AI is available → use Chrome AI
3. Otherwise → call `generateWithGemma` (passed in as a function to avoid importing `@huggingface/transformers` into the service worker bundle)

**Null `imageBase64`** means the image was CORS-blocked and couldn't be fetched as bytes. Chrome AI, Gemini, and Anthropic all throw in this case (their APIs don't accept arbitrary URLs). OpenAI and Custom accept URLs directly.

## Known Constraints

- `@huggingface/transformers` ships `@huggingface/tokenizers` which has internal type errors. `skipLibCheck: true` is set in `tsconfig.dom.json` to suppress them.
- The Vite configs need `const __dirname = fileURLToPath(new URL('.', import.meta.url))` because they're ESM files without `"type": "module"` in `package.json`.
- Playwright integration tests use `__dirname` (CJS) not `import.meta.url` — the project has no `"type": "module"` and Node 25's ESM detection conflicts with Playwright's CJS transform.
- `headless: false` in integration tests is controlled via `process.env.CI` or `process.env.HEADLESS`. Set `CI=true` or `HEADLESS=true` for headless CI runs.

## Testing

Unit tests mock `chrome.*` globally via `vi.stubGlobal`. They run in `jsdom` environment. Don't add DOM assertions to unit tests — use integration tests for that.

Integration tests load the built extension in a real Chromium browser. Run `npm run build` before `npx playwright test`. The tests open the options page and verify basic UI behavior.
