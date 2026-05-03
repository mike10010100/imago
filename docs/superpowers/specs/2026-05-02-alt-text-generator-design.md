# Alt Text Generator Chrome Extension — Design Spec

**Date:** 2026-05-02
**Status:** Approved

---

## Overview

A Chrome extension that generates descriptive alt text for images via a right-click context menu. Targets accessibility-focused content creators, developers, and bloggers who need to add alt text to images. Works entirely in-browser by default — no API key required.

---

## Target Users

Primary: Web content creators, developers, and bloggers who need WCAG-compliant alt text for images they're working with.
Secondary: General users who want to understand or describe images while browsing.

---

## Core User Flow

1. User right-clicks any image on any webpage
2. Selects "Generate Alt Text" from the context menu
3. A compact floating popup appears near the image
4. Popup shows the generated alt text with a one-click copy button
5. User copies and pastes into their CMS, HTML, or wherever

---

## Architecture

### Inference Cascade

Requests resolve through three tiers in order:

**Tier 1 — Chrome Built-in AI** (`window.ai` / Prompt API)
- Used when `LanguageModel.availability()` returns available
- Zero download, instant for users on Chrome Dev/Canary with Gemini Nano set up
- Future-proof: as Chrome rolls this out to stable, users automatically benefit

**Tier 2 — Gemma 4 E2B** (Transformers.js + WebGPU, in-browser)
- Default path for the vast majority of users
- Model downloaded once (~2 GB, ONNX format), cached in browser storage
- Runs in a Manifest V3 Offscreen Document — stays warm in GPU memory across uses in a session
- Works on stable Chrome on any machine with WebGPU support

**Tier 3 — Cloud API** (user-configured)
- Anthropic (Claude), OpenAI (GPT-4o), Google Gemini — first-class support with model selectors
- Generic OpenAI-compatible endpoint (covers local Ollama, custom deployments, etc.)
- Can be set as preferred provider (overrides in-browser tiers) or left as opt-in

The abstraction boundary is a single function `generateAltText(imageData, prompt)` — callers don't know which tier ran.

### Extension Components

**Service Worker**
- Registers context menu item for image contexts
- Handles `contextMenus.onClicked`: fetches image bytes, checks tier availability, routes to appropriate inference path, forwards result to content script
- Manages Offscreen Document lifecycle (creates lazily on first Gemma use)

**Offscreen Document**
- Hosts Transformers.js + Gemma 4 E2B
- Created once, persists across uses in a browser session (model stays warm in WebGPU memory)
- Accepts image + prompt via Chrome message passing, returns generated text
- Handles model download and caching on first use

**Content Script** (injected into all pages)
- Receives result message from service worker
- Injects compact floating popup near the right-clicked image
- Dismisses on outside click or Escape

**Options Page**
- Provider selection (Auto / Anthropic / OpenAI / Gemini / Custom)
- Auto mode shows live cascade status (Chrome AI available/unavailable, Gemma cached/not downloaded)
- API key input (revealed when a cloud provider is selected)
- Alt text style toggle (Brief / Detailed)
- Advanced: custom system prompt with `{style}` interpolation
- Model management: delete cached Gemma download

### Message Flow

```
ServiceWorker  → contextMenus.onClicked → fetch image bytes
ServiceWorker  → check LanguageModel.availability()
  if available → Prompt API → result
  else         → message OffscreenDocument {image, prompt}
                 OffscreenDocument → Transformers.js → result
ServiceWorker  → message ContentScript {altText, source}
ContentScript  → inject popup near image element
```

---

## UI Design

### Result Popup (compact card style)

Appears floating near the right-clicked image. Contains:
- Brief / Detailed toggle (visible upfront, not hidden in settings)
- Generated alt text
- Source label ("Gemma 4 E2B · local" or "Chrome AI · local" or provider name)
- Copy button
- Loading state with progress indicator (first use also shows model download progress)

Dismisses on outside click or Escape key.

### Settings / Options Page

Sections:
1. **AI Provider** — tabs: Auto / Anthropic / OpenAI / Gemini / Custom
   - Auto tab shows cascade status inline with model management and a "Prefer Chrome Built-in AI when available" toggle (default on)
   - Cloud tabs reveal API key input and model selector
2. **Alt Text Style** — Brief / Detailed card toggle (default: Brief)
3. **Advanced** — `<details>` accordion with editable system prompt and reset button
4. **API Key** — disabled/hidden when Auto is selected

---

## Alt Text Prompting

### Default system prompt

```
Generate concise, descriptive alt text for this image following WCAG 2.1 guidelines.
Be {style}: describe what is shown and its purpose.
Do not start with "Image of" or "Picture of".
```

Where `{style}` interpolates to:
- `brief` → "1–2 sentences, concise and purposeful"
- `detailed` → "thorough, including context, mood, and visual details"

Custom prompts override this entirely. The `{style}` interpolation is available in custom prompts too.

---

## Error Handling

| Scenario | Behavior |
|---|---|
| Cross-origin image (CORS blocked) | Pass URL directly to model if provider supports URLs; otherwise show "This image can't be accessed" in popup |
| WebGPU unavailable | Show settings nudge: "Your browser doesn't support local AI — add a cloud API key to continue" |
| Model download interrupted | Resume via Range header; show progress with cancel option |
| Inference timeout (>30s) | Show "still working…" indicator; offer cancel |
| API key invalid / rate limited | Show error in popup with link to settings |
| No provider configured, no WebGPU | Show "Add an API key in Settings to get started" |

---

## Data & Storage

All settings stored in `chrome.storage.sync` (syncs across user's Chrome instances):
- `provider`: `"auto" | "anthropic" | "openai" | "gemini" | "custom"`
- `apiKey`: stored in `chrome.storage.local` only (not synced to other devices, not in chrome.storage.sync)
- `style`: `"brief" | "detailed"`
- `customPrompt`: string | null
- `preferBuiltinAI`: boolean (default true)
- `modelDownloaded`: boolean

API keys stored in `chrome.storage.local` only (never synced).

---

## Testing Strategy

**Unit tests** (Vitest):
- Inference cascade logic: mock Chrome AI availability + mock Transformers.js, verify tier selection
- Prompt construction: brief/detailed/custom modes, `{style}` interpolation
- Settings serialization/deserialization

**Integration tests** (Playwright + Chrome extension testing):
- Full message flow: service worker → offscreen doc → content script
- Settings page: provider switching, API key persistence, prompt reset

**Manual E2E**:
- Small set of reference images (photos, diagrams, screenshots) with qualitative alt text review
- Cross-origin image CORS handling
- First-run model download flow

---

## Out of Scope

- Automatically injecting alt text into page DOM (would require edit permissions)
- Batch processing of all images on a page
- Firefox / Safari support (Manifest V3 + Offscreen Document is Chrome-specific)
- Image generation or editing
