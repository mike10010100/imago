# Alt Text Generator Chrome Extension — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Chrome MV3 extension that generates WCAG-compliant alt text for any image via a right-click context menu, using a three-tier inference cascade (Chrome Built-in AI → Gemma 4 E2B in-browser → Cloud API).

**Architecture:** A service worker handles context menu events and routes inference requests. Gemma 4 E2B runs in an Offscreen Document (persists across uses, stays warm in WebGPU memory). A content script injects a compact floating popup with the result near the right-clicked image. Chrome Built-in AI is tried first when available; cloud APIs are available for users with API keys.

**Tech Stack:** TypeScript, Vite 6, Vitest 3, `@huggingface/transformers` (ONNX/WebGPU), Chrome Manifest V3 (Offscreen Documents, contextMenus, storage), Playwright for integration tests.

---

## File Map

```
chrome-alt-text-generator/
├── manifest.json
├── package.json
├── tsconfig.json
├── vite.config.ts
├── vite.content.config.ts        # Separate IIFE build for content script
├── src/
│   ├── types.ts                  # Shared types across all contexts
│   ├── storage.ts                # chrome.storage abstraction
│   ├── prompt.ts                 # Prompt construction + {style} interpolation
│   ├── inference/
│   │   ├── chrome-ai.ts          # Chrome Built-in AI (Prompt API) provider
│   │   ├── cloud.ts              # Anthropic / OpenAI / Gemini / Custom providers
│   │   └── cascade.ts            # Tier selection logic
│   ├── background/
│   │   └── service-worker.ts     # Context menu, routing, offscreen lifecycle
│   ├── offscreen/
│   │   ├── offscreen.html        # Offscreen document entry point
│   │   └── offscreen.ts          # Gemma 4 E2B model host
│   ├── content/
│   │   ├── content.ts            # Injected script: tracks right-click, handles messages
│   │   └── popup.ts              # Shadow DOM popup component
│   └── options/
│       ├── options.html
│       ├── options.ts
│       └── options.css
└── tests/
    ├── unit/
    │   ├── prompt.test.ts
    │   ├── storage.test.ts
    │   ├── cascade.test.ts
    │   └── chrome-ai.test.ts
    └── integration/
        └── extension.test.ts
```

---

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `manifest.json`
- Create: `vite.config.ts`
- Create: `vite.content.config.ts`
- Create: `src/offscreen/offscreen.html`
- Create: `src/options/options.html`
- Create: `icons/icon16.png`, `icons/icon48.png`, `icons/icon128.png` (placeholder 1x1 PNGs for now)

- [ ] **Step 1: Install Node dependencies**

```bash
npm init -y
npm install --save-dev typescript vite vitest @types/chrome @playwright/test
npm install @huggingface/transformers
```

Expected: `node_modules/` created, `package.json` updated.

- [ ] **Step 2: Write `package.json` scripts**

```json
{
  "name": "alt-text-generator",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "build": "npm run build:ext && npm run build:content",
    "build:ext": "vite build",
    "build:content": "vite build --config vite.content.config.ts",
    "dev": "npm run build -- --watch",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "@playwright/test": "latest",
    "@types/chrome": "latest",
    "typescript": "latest",
    "vite": "latest",
    "vitest": "latest"
  },
  "dependencies": {
    "@huggingface/transformers": "latest"
  }
}
```

- [ ] **Step 3: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable", "WebWorker"],
    "strict": true,
    "noEmit": true,
    "types": ["chrome", "vite/client"]
  },
  "include": ["src/**/*", "tests/**/*"]
}
```

- [ ] **Step 4: Write `vite.config.ts`** (ES module build for SW, offscreen, options)

```typescript
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    target: 'chrome120',
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        'service-worker': resolve(__dirname, 'src/background/service-worker.ts'),
        offscreen: resolve(__dirname, 'src/offscreen/offscreen.ts'),
        options: resolve(__dirname, 'src/options/options.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        format: 'es',
      },
    },
  },
  optimizeDeps: {
    exclude: ['@huggingface/transformers'],
  },
});
```

- [ ] **Step 5: Write `vite.content.config.ts`** (IIFE build for content script — content scripts can't use ES module imports)

```typescript
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    target: 'chrome120',
    outDir: 'dist',
    emptyOutDir: false,
    rollupOptions: {
      input: { content: resolve(__dirname, 'src/content/content.ts') },
      output: {
        entryFileNames: '[name].js',
        format: 'iife',
        name: 'AltTextContent',
      },
    },
  },
});
```

- [ ] **Step 6: Write `manifest.json`**

```json
{
  "manifest_version": 3,
  "name": "Alt Text Generator",
  "version": "0.1.0",
  "description": "Generate WCAG-compliant alt text for images via right-click.",
  "permissions": ["contextMenus", "storage", "offscreen", "scripting"],
  "host_permissions": ["<all_urls>"],
  "background": {
    "service_worker": "service-worker.js",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content.js"],
      "run_at": "document_idle"
    }
  ],
  "options_page": "options.html",
  "action": {
    "default_title": "Alt Text Generator",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

- [ ] **Step 7: Create `src/offscreen/offscreen.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"></head>
<body><script type="module" src="../offscreen.js"></script></body>
</html>
```

Note: After build, `dist/offscreen.html` must reference `offscreen.js`. Copy `src/offscreen/offscreen.html` to `dist/` as part of the build or add a Vite plugin to handle HTML assets. Simplest: add a `postbuild` script:

```json
"postbuild:ext": "cp src/offscreen/offscreen.html dist/offscreen.html && cp src/options/options.html dist/options.html && cp -r icons dist/icons && sed -i '' 's|../offscreen.js|offscreen.js|' dist/offscreen.html"
```

- [ ] **Step 8: Create placeholder icons**

```bash
# Create 1x1 gray PNG placeholder (base64-decode this exact value)
mkdir -p icons
node -e "
const { createCanvas } = require('canvas') || (() => { throw new Error('canvas not found') })();
" 2>/dev/null || \
python3 -c "
import base64, os
# 1x1 gray PNG
data = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==')
os.makedirs('icons', exist_ok=True)
for size in ['icon16', 'icon48', 'icon128']:
    open(f'icons/{size}.png', 'wb').write(data)
print('Icons created')
"
```

Expected: `icons/icon16.png`, `icons/icon48.png`, `icons/icon128.png` created.

- [ ] **Step 9: Verify build runs without errors**

```bash
npm run build
```

Expected: `dist/` directory created with `service-worker.js`, `offscreen.js`, `options.js`, `content.js`.

- [ ] **Step 10: Commit**

```bash
git add manifest.json package.json tsconfig.json vite.config.ts vite.content.config.ts src/offscreen/offscreen.html src/options/options.html icons/
git commit -m "chore: project scaffold — manifest, Vite config, entry points"
```

---

## Task 2: Shared Types

**Files:**
- Create: `src/types.ts`

No tests needed — pure TypeScript types.

- [ ] **Step 1: Write `src/types.ts`**

```typescript
export type Provider = 'auto' | 'anthropic' | 'openai' | 'gemini' | 'custom';
export type StyleMode = 'brief' | 'detailed';

export interface Settings {
  provider: Provider;
  style: StyleMode;
  customPrompt: string | null;
  preferBuiltinAI: boolean;
  modelDownloaded: boolean;
}

export interface ApiKeys {
  anthropic: string;
  openai: string;
  gemini: string;
  customEndpoint: string;
  customKey: string;
}

export interface InferenceRequest {
  imageBase64: string | null; // base64-encoded image bytes; null if CORS blocked
  imageUrl: string;           // original src URL, used as fallback by cloud providers
  mimeType: string;
  prompt: string;
}

export interface InferenceResult {
  altText: string;
  source: 'chrome-ai' | 'gemma-4-e2b' | 'anthropic' | 'openai' | 'gemini' | 'custom';
}

// Messages passed between extension contexts via chrome.runtime.sendMessage / chrome.tabs.sendMessage
export type ExtensionMessage =
  | { type: 'GENERATE_ALT_TEXT'; payload: InferenceRequest }
  | { type: 'ALT_TEXT_RESULT'; payload: InferenceResult }
  | { type: 'MODEL_DOWNLOAD_PROGRESS'; payload: { progress: number } }
  | { type: 'SHOW_POPUP'; payload: { result?: InferenceResult; error?: string; imageUrl: string } }
  | { type: 'REGENERATE'; payload: { imageUrl: string; style: StyleMode } };
```

- [ ] **Step 2: Commit**

```bash
git add src/types.ts
git commit -m "feat: add shared types"
```

---

## Task 3: Storage Module

**Files:**
- Create: `src/storage.ts`
- Create: `tests/unit/storage.test.ts`

- [ ] **Step 1: Write the failing tests** in `tests/unit/storage.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSettings, setSettings, getApiKeys, setApiKeys } from '../../src/storage';

const syncStore: Record<string, unknown> = {};
const localStore: Record<string, unknown> = {};

vi.stubGlobal('chrome', {
  storage: {
    sync: {
      get: vi.fn((defaults: Record<string, unknown>) =>
        Promise.resolve({ ...defaults, ...syncStore })
      ),
      set: vi.fn((values: Record<string, unknown>) => {
        Object.assign(syncStore, values);
        return Promise.resolve();
      }),
    },
    local: {
      get: vi.fn((defaults: Record<string, unknown>) =>
        Promise.resolve({ ...defaults, ...localStore })
      ),
      set: vi.fn((values: Record<string, unknown>) => {
        Object.assign(localStore, values);
        return Promise.resolve();
      }),
    },
  },
});

beforeEach(() => {
  Object.keys(syncStore).forEach((k) => delete syncStore[k]);
  Object.keys(localStore).forEach((k) => delete localStore[k]);
});

describe('getSettings', () => {
  it('returns defaults when storage is empty', async () => {
    const s = await getSettings();
    expect(s.provider).toBe('auto');
    expect(s.style).toBe('brief');
    expect(s.preferBuiltinAI).toBe(true);
    expect(s.modelDownloaded).toBe(false);
    expect(s.customPrompt).toBeNull();
  });

  it('returns stored values over defaults', async () => {
    syncStore.style = 'detailed';
    const s = await getSettings();
    expect(s.style).toBe('detailed');
  });
});

describe('setSettings', () => {
  it('persists partial settings', async () => {
    await setSettings({ style: 'detailed', provider: 'openai' });
    const s = await getSettings();
    expect(s.style).toBe('detailed');
    expect(s.provider).toBe('openai');
  });
});

describe('getApiKeys / setApiKeys', () => {
  it('returns empty strings when no keys stored', async () => {
    const keys = await getApiKeys();
    expect(keys.anthropic).toBe('');
    expect(keys.openai).toBe('');
  });

  it('stores API keys in local storage only', async () => {
    await setApiKeys({ anthropic: 'sk-ant-test123' });
    const keys = await getApiKeys();
    expect(keys.anthropic).toBe('sk-ant-test123');
    expect(syncStore.anthropic).toBeUndefined(); // never touches sync
  });

  it('persists custom endpoint', async () => {
    await setApiKeys({ customEndpoint: 'http://localhost:11434/v1', customKey: 'ollama' });
    const keys = await getApiKeys();
    expect(keys.customEndpoint).toBe('http://localhost:11434/v1');
    expect(keys.customKey).toBe('ollama');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run tests/unit/storage.test.ts
```

Expected: FAIL — `Cannot find module '../../src/storage'`

- [ ] **Step 3: Write `src/storage.ts`**

```typescript
import type { Settings, ApiKeys } from './types';

const SETTINGS_DEFAULTS: Settings = {
  provider: 'auto',
  style: 'brief',
  customPrompt: null,
  preferBuiltinAI: true,
  modelDownloaded: false,
};

const API_KEY_DEFAULTS: ApiKeys = {
  anthropic: '',
  openai: '',
  gemini: '',
  customEndpoint: '',
  customKey: '',
};

export async function getSettings(): Promise<Settings> {
  const result = await chrome.storage.sync.get(SETTINGS_DEFAULTS);
  return result as Settings;
}

export async function setSettings(partial: Partial<Settings>): Promise<void> {
  await chrome.storage.sync.set(partial);
}

export async function getApiKeys(): Promise<ApiKeys> {
  const result = await chrome.storage.local.get(API_KEY_DEFAULTS);
  return result as ApiKeys;
}

export async function setApiKeys(partial: Partial<ApiKeys>): Promise<void> {
  await chrome.storage.local.set(partial);
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run tests/unit/storage.test.ts
```

Expected: PASS — 6 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/storage.ts tests/unit/storage.test.ts
git commit -m "feat: add storage module with sync/local separation"
```

---

## Task 4: Prompt Module

**Files:**
- Create: `src/prompt.ts`
- Create: `tests/unit/prompt.test.ts`

- [ ] **Step 1: Write the failing tests** in `tests/unit/prompt.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { buildPrompt, DEFAULT_PROMPT } from '../../src/prompt';

describe('buildPrompt', () => {
  it('interpolates brief style into default prompt', () => {
    const result = buildPrompt('brief', null);
    expect(result).toContain('1–2 sentences, concise and purposeful');
    expect(result).not.toContain('{style}');
  });

  it('interpolates detailed style into default prompt', () => {
    const result = buildPrompt('detailed', null);
    expect(result).toContain('thorough, including context, mood, and visual details');
    expect(result).not.toContain('{style}');
  });

  it('uses custom prompt template with {style} interpolation', () => {
    const result = buildPrompt('brief', 'Be {style} when describing this.');
    expect(result).toBe('Be 1–2 sentences, concise and purposeful when describing this.');
  });

  it('uses custom prompt unchanged when it has no {style}', () => {
    const result = buildPrompt('brief', 'Just describe the image in one sentence.');
    expect(result).toBe('Just describe the image in one sentence.');
  });

  it('exports DEFAULT_PROMPT as a non-empty string', () => {
    expect(typeof DEFAULT_PROMPT).toBe('string');
    expect(DEFAULT_PROMPT.length).toBeGreaterThan(0);
    expect(DEFAULT_PROMPT).toContain('{style}');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run tests/unit/prompt.test.ts
```

Expected: FAIL — `Cannot find module '../../src/prompt'`

- [ ] **Step 3: Write `src/prompt.ts`**

```typescript
import type { StyleMode } from './types';

export const DEFAULT_PROMPT =
  'Generate concise, descriptive alt text for this image following WCAG 2.1 guidelines.\n' +
  'Be {style}: describe what is shown and its purpose.\n' +
  'Do not start with "Image of" or "Picture of".';

const STYLE_DESCRIPTIONS: Record<StyleMode, string> = {
  brief: '1–2 sentences, concise and purposeful',
  detailed: 'thorough, including context, mood, and visual details',
};

export function buildPrompt(style: StyleMode, customPrompt: string | null): string {
  const template = customPrompt ?? DEFAULT_PROMPT;
  return template.replace('{style}', STYLE_DESCRIPTIONS[style]);
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run tests/unit/prompt.test.ts
```

Expected: PASS — 5 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/prompt.ts tests/unit/prompt.test.ts
git commit -m "feat: add prompt module with style interpolation"
```

---

## Task 5: Chrome AI Provider

**Files:**
- Create: `src/inference/chrome-ai.ts`
- Create: `tests/unit/chrome-ai.test.ts`

- [ ] **Step 1: Write the failing tests** in `tests/unit/chrome-ai.test.ts`

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';
import { isChromeAIAvailable, generateWithChromeAI } from '../../src/inference/chrome-ai';
import type { InferenceRequest } from '../../src/types';

const mockRequest: InferenceRequest = {
  imageBase64: null,
  imageUrl: 'https://example.com/dog.jpg',
  mimeType: 'image/jpeg',
  prompt: 'Describe this image.',
};

const mockSession = {
  prompt: vi.fn(),
  destroy: vi.fn().mockResolvedValue(undefined),
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('isChromeAIAvailable', () => {
  it('returns false when LanguageModel global is absent', async () => {
    expect(await isChromeAIAvailable()).toBe(false);
  });

  it('returns true when availability is "available"', async () => {
    vi.stubGlobal('LanguageModel', {
      availability: vi.fn().mockResolvedValue('available'),
    });
    expect(await isChromeAIAvailable()).toBe(true);
  });

  it('returns false when availability is "unavailable"', async () => {
    vi.stubGlobal('LanguageModel', {
      availability: vi.fn().mockResolvedValue('unavailable'),
    });
    expect(await isChromeAIAvailable()).toBe(false);
  });

  it('returns false when availability throws', async () => {
    vi.stubGlobal('LanguageModel', {
      availability: vi.fn().mockRejectedValue(new Error('not supported')),
    });
    expect(await isChromeAIAvailable()).toBe(false);
  });
});

describe('generateWithChromeAI', () => {
  beforeEach(() => {
    mockSession.prompt.mockResolvedValue('  A golden retriever on a beach.  ');
    vi.stubGlobal('LanguageModel', {
      create: vi.fn().mockResolvedValue(mockSession),
    });
  });

  it('returns trimmed alt text with chrome-ai source', async () => {
    const result = await generateWithChromeAI(mockRequest);
    expect(result.altText).toBe('A golden retriever on a beach.');
    expect(result.source).toBe('chrome-ai');
  });

  it('always destroys the session', async () => {
    await generateWithChromeAI(mockRequest);
    expect(mockSession.destroy).toHaveBeenCalledOnce();
  });

  it('destroys session even when prompt throws', async () => {
    mockSession.prompt.mockRejectedValue(new Error('inference failed'));
    await expect(generateWithChromeAI(mockRequest)).rejects.toThrow('inference failed');
    expect(mockSession.destroy).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run tests/unit/chrome-ai.test.ts
```

Expected: FAIL — `Cannot find module '../../src/inference/chrome-ai'`

- [ ] **Step 3: Write `src/inference/chrome-ai.ts`**

```typescript
import type { InferenceRequest, InferenceResult } from '../types';

// LanguageModel is a Chrome 138+ global — not in @types/chrome yet.
declare const LanguageModel: {
  availability(): Promise<'available' | 'downloading' | 'downloadable' | 'unavailable'>;
  create(options: {
    expectedInputs?: Array<{ type: 'image' | 'audio' | 'text' }>;
  }): Promise<{
    prompt(inputs: Array<{ type: string; value: unknown }>): Promise<string>;
    destroy(): Promise<void>;
  }>;
} | undefined;

export async function isChromeAIAvailable(): Promise<boolean> {
  if (typeof LanguageModel === 'undefined') return false;
  try {
    const availability = await LanguageModel.availability();
    return availability === 'available';
  } catch {
    return false;
  }
}

export async function generateWithChromeAI(
  request: InferenceRequest,
): Promise<InferenceResult> {
  // LanguageModel is guaranteed defined here — caller should check isChromeAIAvailable first.
  const session = await LanguageModel!.create({
    expectedInputs: [{ type: 'image' }, { type: 'text' }],
  });

  try {
    const imageValue: unknown = request.imageBase64
      ? base64ToBlob(request.imageBase64, request.mimeType)
      : request.imageUrl;

    const raw = await session.prompt([
      { type: 'image', value: imageValue },
      { type: 'text', value: request.prompt },
    ]);

    return { altText: raw.trim(), source: 'chrome-ai' };
  } finally {
    await session.destroy();
  }
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run tests/unit/chrome-ai.test.ts
```

Expected: PASS — 7 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/inference/chrome-ai.ts tests/unit/chrome-ai.test.ts
git commit -m "feat: add Chrome Built-in AI provider"
```

---

## Task 6: Cloud API Provider

**Files:**
- Create: `src/inference/cloud.ts`
- (No unit tests for cloud.ts — HTTP calls require integration tests; cascade tests cover routing logic)

- [ ] **Step 1: Write `src/inference/cloud.ts`**

```typescript
import type { InferenceRequest, InferenceResult, ApiKeys, Provider } from '../types';

export async function generateWithCloud(
  request: InferenceRequest,
  provider: Exclude<Provider, 'auto'>,
  apiKeys: ApiKeys,
): Promise<InferenceResult> {
  switch (provider) {
    case 'anthropic':
      return generateWithAnthropic(request, apiKeys.anthropic);
    case 'openai':
      return generateWithOpenAI(request, apiKeys.openai);
    case 'gemini':
      return generateWithGemini(request, apiKeys.gemini);
    case 'custom':
      return generateWithCustomEndpoint(request, apiKeys.customEndpoint, apiKeys.customKey);
  }
}

async function generateWithAnthropic(
  request: InferenceRequest,
  apiKey: string,
): Promise<InferenceResult> {
  if (!apiKey) throw new Error('Anthropic API key not configured');

  const imageContent = request.imageBase64
    ? {
        type: 'image',
        source: {
          type: 'base64',
          media_type: request.mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
          data: request.imageBase64,
        },
      }
    : { type: 'image', source: { type: 'url', url: request.imageUrl } };

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages: [
        {
          role: 'user',
          content: [imageContent, { type: 'text', text: request.prompt }],
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${body}`);
  }

  const data = await response.json();
  return { altText: (data.content[0].text as string).trim(), source: 'anthropic' };
}

async function generateWithOpenAI(
  request: InferenceRequest,
  apiKey: string,
): Promise<InferenceResult> {
  if (!apiKey) throw new Error('OpenAI API key not configured');

  const imageUrl = request.imageBase64
    ? `data:${request.mimeType};base64,${request.imageBase64}`
    : request.imageUrl;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 256,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: imageUrl } },
            { type: 'text', text: request.prompt },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${body}`);
  }

  const data = await response.json();
  return {
    altText: (data.choices[0].message.content as string).trim(),
    source: 'openai',
  };
}

async function generateWithGemini(
  request: InferenceRequest,
  apiKey: string,
): Promise<InferenceResult> {
  if (!apiKey) throw new Error('Gemini API key not configured');

  // Gemini supports inline base64 or file URIs; use inline if we have bytes
  const imagePart = request.imageBase64
    ? { inlineData: { mimeType: request.mimeType, data: request.imageBase64 } }
    : { fileData: { fileUri: request.imageUrl } };

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [imagePart, { text: request.prompt }] }],
        generationConfig: { maxOutputTokens: 256 },
      }),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${body}`);
  }

  const data = await response.json();
  return {
    altText: (data.candidates[0].content.parts[0].text as string).trim(),
    source: 'gemini',
  };
}

async function generateWithCustomEndpoint(
  request: InferenceRequest,
  endpoint: string,
  apiKey: string,
): Promise<InferenceResult> {
  if (!endpoint) throw new Error('Custom endpoint URL not configured');

  const imageUrl = request.imageBase64
    ? `data:${request.mimeType};base64,${request.imageBase64}`
    : request.imageUrl;

  const response = await fetch(`${endpoint.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      ...(apiKey && { Authorization: `Bearer ${apiKey}` }),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: imageUrl } },
            { type: 'text', text: request.prompt },
          ],
        },
      ],
      max_tokens: 256,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Custom API error ${response.status}: ${body}`);
  }

  const data = await response.json();
  return {
    altText: (data.choices[0].message.content as string).trim(),
    source: 'custom',
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/inference/cloud.ts
git commit -m "feat: add cloud API providers (Anthropic, OpenAI, Gemini, custom)"
```

---

## Task 7: Inference Cascade

**Files:**
- Create: `src/inference/cascade.ts`
- Create: `tests/unit/cascade.test.ts`

- [ ] **Step 1: Write the failing tests** in `tests/unit/cascade.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runCascade } from '../../src/inference/cascade';
import * as chromeAI from '../../src/inference/chrome-ai';
import * as cloud from '../../src/inference/cloud';
import type { Settings, ApiKeys, InferenceRequest, InferenceResult } from '../../src/types';

const req: InferenceRequest = {
  imageBase64: 'abc123',
  imageUrl: 'https://example.com/img.jpg',
  mimeType: 'image/jpeg',
  prompt: 'Describe.',
};

const AUTO_SETTINGS: Settings = {
  provider: 'auto',
  style: 'brief',
  customPrompt: null,
  preferBuiltinAI: true,
  modelDownloaded: true,
};

const EMPTY_KEYS: ApiKeys = {
  anthropic: '',
  openai: '',
  gemini: '',
  customEndpoint: '',
  customKey: '',
};

const gemmaResult: InferenceResult = { altText: 'A cat.', source: 'gemma-4-e2b' };
const gemmaFn = vi.fn().mockResolvedValue(gemmaResult);

afterEach(() => vi.clearAllMocks());

describe('runCascade — cloud provider selected', () => {
  it('calls cloud provider directly, skips all in-browser tiers', async () => {
    vi.spyOn(cloud, 'generateWithCloud').mockResolvedValue({ altText: 'Cloud result.', source: 'anthropic' });
    vi.spyOn(chromeAI, 'isChromeAIAvailable').mockResolvedValue(true);

    const result = await runCascade(
      req,
      { ...AUTO_SETTINGS, provider: 'anthropic' },
      EMPTY_KEYS,
      gemmaFn,
    );

    expect(result.source).toBe('anthropic');
    expect(gemmaFn).not.toHaveBeenCalled();
    expect(chromeAI.isChromeAIAvailable).not.toHaveBeenCalled();
  });
});

describe('runCascade — auto mode', () => {
  it('uses Chrome AI when available and preferBuiltinAI is true', async () => {
    vi.spyOn(chromeAI, 'isChromeAIAvailable').mockResolvedValue(true);
    vi.spyOn(chromeAI, 'generateWithChromeAI').mockResolvedValue({ altText: 'Chrome result.', source: 'chrome-ai' });

    const result = await runCascade(req, AUTO_SETTINGS, EMPTY_KEYS, gemmaFn);

    expect(result.source).toBe('chrome-ai');
    expect(gemmaFn).not.toHaveBeenCalled();
  });

  it('skips Chrome AI and uses Gemma when preferBuiltinAI is false', async () => {
    vi.spyOn(chromeAI, 'isChromeAIAvailable').mockResolvedValue(true);

    const result = await runCascade(
      req,
      { ...AUTO_SETTINGS, preferBuiltinAI: false },
      EMPTY_KEYS,
      gemmaFn,
    );

    expect(result.source).toBe('gemma-4-e2b');
    expect(chromeAI.isChromeAIAvailable).not.toHaveBeenCalled();
  });

  it('falls through to Gemma when Chrome AI is unavailable', async () => {
    vi.spyOn(chromeAI, 'isChromeAIAvailable').mockResolvedValue(false);

    const result = await runCascade(req, AUTO_SETTINGS, EMPTY_KEYS, gemmaFn);

    expect(result.source).toBe('gemma-4-e2b');
    expect(gemmaFn).toHaveBeenCalledWith(req);
  });

  it('propagates errors from Gemma', async () => {
    vi.spyOn(chromeAI, 'isChromeAIAvailable').mockResolvedValue(false);
    gemmaFn.mockRejectedValueOnce(new Error('WebGPU not available'));

    await expect(runCascade(req, AUTO_SETTINGS, EMPTY_KEYS, gemmaFn)).rejects.toThrow(
      'WebGPU not available',
    );
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run tests/unit/cascade.test.ts
```

Expected: FAIL — `Cannot find module '../../src/inference/cascade'`

- [ ] **Step 3: Write `src/inference/cascade.ts`**

```typescript
import type { Settings, ApiKeys, InferenceRequest, InferenceResult } from '../types';
import { isChromeAIAvailable, generateWithChromeAI } from './chrome-ai';
import { generateWithCloud } from './cloud';

// GemmaFn is injected so the service worker can provide the offscreen-document bridge
// and cascade.ts stays testable without a real offscreen document.
export type GemmaFn = (request: InferenceRequest) => Promise<InferenceResult>;

export async function runCascade(
  request: InferenceRequest,
  settings: Settings,
  apiKeys: ApiKeys,
  generateWithGemma: GemmaFn,
): Promise<InferenceResult> {
  // Explicit cloud provider: bypass all in-browser tiers
  if (settings.provider !== 'auto') {
    return generateWithCloud(request, settings.provider, apiKeys);
  }

  // Auto mode: try Chrome Built-in AI first if preferred
  if (settings.preferBuiltinAI && (await isChromeAIAvailable())) {
    return generateWithChromeAI(request);
  }

  // Default: Gemma 4 E2B via offscreen document
  return generateWithGemma(request);
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run tests/unit/cascade.test.ts
```

Expected: PASS — 5 tests passing.

- [ ] **Step 5: Run all unit tests to confirm nothing is broken**

```bash
npx vitest run
```

Expected: PASS — all tests passing.

- [ ] **Step 6: Commit**

```bash
git add src/inference/cascade.ts tests/unit/cascade.test.ts
git commit -m "feat: add inference cascade with Chrome AI → Gemma → cloud tiers"
```

---

## Task 8: Offscreen Document (Gemma 4 E2B)

**Files:**
- Create: `src/offscreen/offscreen.ts`

Note: Verify the correct ONNX model ID on HuggingFace before implementing. The expected ID is `onnx-community/gemma-4-e2b-it` — search HuggingFace for `gemma-4-e2b ONNX` to confirm. The Transformers.js pipeline API for VLMs uses `'text-generation'` with multi-modal message content.

- [ ] **Step 1: Write `src/offscreen/offscreen.ts`**

```typescript
import { pipeline, env } from '@huggingface/transformers';
import type { InferenceRequest, InferenceResult, ExtensionMessage } from '../types';

// Use the WebGPU backend; disable WASM proxy (offscreen document has DOM access)
env.backends.onnx.wasm.proxy = false;

// Verified HuggingFace model ID for Gemma 4 E2B in ONNX format.
// If this 404s, search https://huggingface.co/models?search=gemma-4-e2b+onnx
const MODEL_ID = 'onnx-community/gemma-4-e2b-it';

type TextGenPipeline = Awaited<ReturnType<typeof pipeline>>;
let pipe: TextGenPipeline | null = null;

async function loadModel(): Promise<void> {
  if (pipe !== null) return;
  pipe = await pipeline('text-generation', MODEL_ID, {
    device: 'webgpu',
    // Report download progress back to the service worker for the popup loading state
    progress_callback: (info: { progress?: number; status?: string }) => {
      if (info.status === 'progress' && typeof info.progress === 'number') {
        chrome.runtime.sendMessage({
          type: 'MODEL_DOWNLOAD_PROGRESS',
          payload: { progress: Math.round(info.progress) },
        } satisfies ExtensionMessage);
      }
    },
  });
  // Mark downloaded so the options page can show model management controls
  await chrome.storage.sync.set({ modelDownloaded: true });
}

async function handleGenerate(request: InferenceRequest): Promise<InferenceResult> {
  await loadModel();

  // Convert image to an object URL Transformers.js can load
  let objectUrl: string | null = null;
  try {
    const blob: Blob = request.imageBase64
      ? base64ToBlob(request.imageBase64, request.mimeType)
      : await fetch(request.imageUrl).then((r) => {
          if (!r.ok) throw new Error(`Failed to fetch image: ${r.status}`);
          return r.blob();
        });

    objectUrl = URL.createObjectURL(blob);

    const output = await (pipe as TextGenPipeline)([
      {
        role: 'user',
        content: [
          { type: 'image', image: objectUrl },
          { type: 'text', text: request.prompt },
        ],
      },
    ], { max_new_tokens: 256 });

    // Transformers.js returns an array; the last message in generated_text is the assistant's reply
    const messages = (output as Array<{ generated_text: Array<{ role: string; content: string }> }>)[0]
      .generated_text;
    const assistantContent = messages.at(-1)?.content ?? '';

    return { altText: assistantContent.trim(), source: 'gemma-4-e2b' };
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, _sender, sendResponse: (r: unknown) => void) => {
    if (message.type !== 'GENERATE_ALT_TEXT') return false;
    handleGenerate(message.payload)
      .then((result) => sendResponse(result))
      .catch((err: Error) => sendResponse({ error: err.message }));
    return true; // keep the message channel open for the async response
  },
);
```

Note: Transformers.js handles interrupted downloads automatically via the browser's Cache API — partial downloads resume on next load without any Range header implementation needed.

- [ ] **Step 2: Commit**

```bash
git add src/offscreen/offscreen.ts
git commit -m "feat: add Gemma 4 E2B offscreen document host"
```

---

## Task 9: Service Worker

**Files:**
- Create: `src/background/service-worker.ts`

- [ ] **Step 1: Write `src/background/service-worker.ts`**

```typescript
import { getSettings, getApiKeys } from '../storage';
import { buildPrompt } from '../prompt';
import { runCascade } from '../inference/cascade';
import type { InferenceRequest, InferenceResult, ExtensionMessage } from '../types';

const OFFSCREEN_URL = chrome.runtime.getURL('offscreen.html');

async function ensureOffscreenDocument(): Promise<void> {
  if (await chrome.offscreen.hasDocument()) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: [chrome.offscreen.Reason.DOM_SCRAPING],
    justification: 'Host Transformers.js + Gemma 4 E2B model inference with WebGPU',
  });
}

async function generateWithGemmaViaOffscreen(
  request: InferenceRequest,
): Promise<InferenceResult> {
  await ensureOffscreenDocument();

  return new Promise<InferenceResult>((resolve, reject) => {
    const timeoutId = setTimeout(
      () => reject(new Error('Inference timed out after 30 seconds')),
      30_000,
    );

    chrome.runtime.sendMessage(
      { type: 'GENERATE_ALT_TEXT', payload: request } satisfies ExtensionMessage,
      (response: InferenceResult & { error?: string }) => {
        clearTimeout(timeoutId);
        if (chrome.runtime.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }
        if (response?.error) return reject(new Error(response.error));
        resolve(response);
      },
    );
  });
}

async function fetchImageBytes(
  url: string,
): Promise<{ imageBase64: string | null; mimeType: string }> {
  try {
    const response = await fetch(url, { credentials: 'omit' });
    if (!response.ok) return { imageBase64: null, mimeType: 'image/jpeg' };

    const mimeType =
      response.headers.get('content-type')?.split(';')[0]?.trim() ?? 'image/jpeg';
    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return { imageBase64: btoa(binary), mimeType };
  } catch {
    // CORS blocked or network error — cloud providers can use the URL directly
    return { imageBase64: null, mimeType: 'image/jpeg' };
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'generate-alt-text',
    title: 'Generate Alt Text',
    contexts: ['image'],
  });
});

chrome.contextMenus.onClicked.addListener(
  async (info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab) => {
    if (info.menuItemId !== 'generate-alt-text' || !tab?.id) return;

    const tabId = tab.id;
    const imageUrl = info.srcUrl ?? '';

    // Notify content script to show loading state immediately
    chrome.tabs.sendMessage(tabId, {
      type: 'SHOW_POPUP',
      payload: { imageUrl },
    } satisfies ExtensionMessage);

    const { imageBase64, mimeType } = await fetchImageBytes(imageUrl);
    const settings = await getSettings();
    const apiKeys = await getApiKeys();
    const prompt = buildPrompt(settings.style, settings.customPrompt);

    const request: InferenceRequest = { imageBase64, imageUrl, mimeType, prompt };

    try {
      const result = await runCascade(
        request,
        settings,
        apiKeys,
        generateWithGemmaViaOffscreen,
      );
      chrome.tabs.sendMessage(tabId, {
        type: 'SHOW_POPUP',
        payload: { result, imageUrl },
      } satisfies ExtensionMessage);
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      // Map known errors to user-friendly messages
      const userMessage = mapErrorMessage(error, settings);
      chrome.tabs.sendMessage(tabId, {
        type: 'SHOW_POPUP',
        payload: { error: userMessage, imageUrl },
      } satisfies ExtensionMessage);
    }
  },
);

// Handle style toggle re-generation from the popup
chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, sender, sendResponse) => {
    if (message.type !== 'REGENERATE') return false;
    const { imageUrl, style } = message.payload;

    (async () => {
      const { imageBase64, mimeType } = await fetchImageBytes(imageUrl);
      const settings = await getSettings();
      const apiKeys = await getApiKeys();
      const prompt = buildPrompt(style, settings.customPrompt);
      const request: InferenceRequest = { imageBase64, imageUrl, mimeType, prompt };

      try {
        const result = await runCascade(
          request,
          settings,
          apiKeys,
          generateWithGemmaViaOffscreen,
        );
        sendResponse({ result });
      } catch (err) {
        sendResponse({ error: err instanceof Error ? err.message : 'Unknown error' });
      }
    })();

    return true;
  },
);

function mapErrorMessage(raw: string, settings: ReturnType<typeof Object.create>): string {
  if (raw.includes('WebGPU')) {
    return "Your browser doesn't support local AI — add a cloud API key in Settings to continue.";
  }
  if (raw.includes('API key') || raw.includes('401') || raw.includes('403')) {
    return 'API key invalid or missing — check Settings.';
  }
  if (raw.includes('timed out')) {
    return 'Generation timed out. Try again or switch to a cloud provider in Settings.';
  }
  if (raw.includes('fetch') || raw.includes('CORS') || raw.includes('Failed to fetch')) {
    return "This image can't be accessed due to security restrictions.";
  }
  return raw;
}
```

- [ ] **Step 2: Build and verify no TypeScript errors**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/background/service-worker.ts
git commit -m "feat: add service worker — context menu, cascade routing, error mapping"
```

---

## Task 10: Content Script + Popup

**Files:**
- Create: `src/content/popup.ts`
- Create: `src/content/content.ts`

- [ ] **Step 1: Write `src/content/popup.ts`**

```typescript
import type { InferenceResult, StyleMode } from '../types';

interface PopupOptions {
  result?: InferenceResult;
  error?: string;
  imageUrl?: string; // stored so the toggle can trigger re-generation
  anchorRect: { top: number; right: number; bottom: number; left: number };
}

const SOURCE_LABELS: Record<string, string> = {
  'chrome-ai': 'Chrome AI · local',
  'gemma-4-e2b': 'Gemma 4 E2B · local',
  anthropic: 'Claude · cloud',
  openai: 'GPT-4o · cloud',
  gemini: 'Gemini · cloud',
  custom: 'Custom · cloud',
};

const POPUP_CSS = `
  :host { all: initial; font-family: system-ui, -apple-system, sans-serif; }
  .popup {
    position: fixed; z-index: 2147483647;
    background: #1e293b; border: 1px solid #334155;
    border-radius: 10px; padding: 12px 14px;
    box-shadow: 0 8px 24px rgba(0,0,0,.5); width: 264px;
    font-size: 13px; color: #e2e8f0; box-sizing: border-box;
  }
  .toggle { display: flex; gap: 6px; margin-bottom: 8px; }
  .toggle button {
    background: #334155; color: #94a3b8; border: none;
    border-radius: 4px; padding: 3px 10px; font-size: 11px; cursor: pointer;
  }
  .toggle button.active { background: #7c3aed; color: white; }
  .alt-text { font-size: 12px; line-height: 1.5; margin: 0 0 10px; }
  .footer { display: flex; align-items: center; justify-content: space-between; }
  .source { color: #475569; font-size: 10px; }
  .copy-btn {
    background: #334155; color: #e2e8f0; border: none;
    border-radius: 4px; padding: 4px 10px; font-size: 11px; cursor: pointer;
  }
  .copy-btn.copied { background: #166534; color: #86efac; }
  .error { color: #f87171; font-size: 12px; line-height: 1.4; }
  .loading { display: flex; align-items: center; gap: 8px; }
  .spinner {
    width: 8px; height: 8px; background: #7c3aed;
    border-radius: 50%; animation: pulse 1s ease-in-out infinite;
    flex-shrink: 0;
  }
  .loading-text { color: #94a3b8; font-size: 11px; }
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: .25; } }
`;

let host: HTMLElement | null = null;
let escapeHandler: ((e: KeyboardEvent) => void) | null = null;
let currentImageUrl: string = '';

export function showPopup(options: PopupOptions): void {
  currentImageUrl = options.imageUrl ?? '';
  destroyPopup();

  host = document.createElement('div');
  const shadow = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = POPUP_CSS;
  shadow.appendChild(style);

  const popup = document.createElement('div');
  popup.className = 'popup';
  placePopup(popup, options.anchorRect);
  shadow.appendChild(popup);

  document.body.appendChild(host);

  if (options.error) {
    renderError(popup, options.error);
  } else if (!options.result) {
    renderLoading(popup);
  } else {
    renderResult(popup, options.result);
  }

  // Dismiss on next outside click
  setTimeout(() => document.addEventListener('click', handleOutsideClick, { once: true }), 0);
  escapeHandler = (e: KeyboardEvent) => { if (e.key === 'Escape') destroyPopup(); };
  document.addEventListener('keydown', escapeHandler);
}

export function updatePopup(result?: InferenceResult, error?: string): void {
  if (!host) return;
  const shadow = host.shadowRoot;
  if (!shadow) return;
  const popup = shadow.querySelector('.popup') as HTMLElement | null;
  if (!popup) return;

  // Clear all children except the toggle (if present)
  const toggle = popup.querySelector('.toggle');
  popup.innerHTML = '';
  if (toggle) popup.appendChild(toggle);

  if (error) {
    renderError(popup, error);
  } else if (result) {
    renderResult(popup, result);
  }
}

export function destroyPopup(): void {
  host?.remove();
  host = null;
  document.removeEventListener('click', handleOutsideClick);
  if (escapeHandler) {
    document.removeEventListener('keydown', escapeHandler);
    escapeHandler = null;
  }
}

function handleOutsideClick(): void {
  destroyPopup();
}

function renderLoading(popup: HTMLElement): void {
  const div = document.createElement('div');
  div.className = 'loading';
  div.innerHTML = '<div class="spinner"></div><span class="loading-text">Generating alt text…</span>';
  popup.appendChild(div);
}

function renderError(popup: HTMLElement, message: string): void {
  const p = document.createElement('p');
  p.className = 'error';
  p.textContent = message;
  popup.appendChild(p);
}

function renderResult(popup: HTMLElement, result: InferenceResult): void {
  // Toggle
  const toggle = popup.querySelector('.toggle') ?? (() => {
    const t = document.createElement('div');
    t.className = 'toggle';
    popup.insertBefore(t, popup.firstChild);
    return t;
  })();
  toggle.innerHTML = `
    <button class="active" data-style="brief">Brief</button>
    <button data-style="detailed">Detailed</button>
  `;
  toggle.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('button');
    if (!btn) return;
    const newStyle = btn.dataset.style as StyleMode;
    toggle.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    requestRegenerate(newStyle, result);
  });

  // Alt text
  const p = document.createElement('p');
  p.className = 'alt-text';
  p.textContent = result.altText;
  popup.appendChild(p);

  // Footer
  const footer = document.createElement('div');
  footer.className = 'footer';

  const source = document.createElement('span');
  source.className = 'source';
  source.textContent = SOURCE_LABELS[result.source] ?? result.source;

  const copyBtn = document.createElement('button');
  copyBtn.className = 'copy-btn';
  copyBtn.textContent = 'Copy';
  copyBtn.onclick = () => {
    navigator.clipboard.writeText(result.altText).catch(() => {
      // Fallback for pages without clipboard permission
      const ta = document.createElement('textarea');
      ta.value = result.altText;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    });
    copyBtn.textContent = 'Copied!';
    copyBtn.classList.add('copied');
    setTimeout(() => {
      copyBtn.textContent = 'Copy';
      copyBtn.classList.remove('copied');
    }, 1500);
  };

  footer.appendChild(source);
  footer.appendChild(copyBtn);
  popup.appendChild(footer);
}

function requestRegenerate(style: StyleMode, previousResult: InferenceResult): void {
  if (!host) return;
  const shadow = host.shadowRoot;
  if (!shadow) return;
  const popup = shadow.querySelector('.popup') as HTMLElement;

  // Show loading while waiting
  const p = popup.querySelector('.alt-text');
  const footer = popup.querySelector('.footer');
  if (p) p.textContent = 'Regenerating…';
  if (footer) (footer as HTMLElement).style.opacity = '0.4';

  chrome.runtime.sendMessage(
    { type: 'REGENERATE', payload: { imageUrl: currentImageUrl, style } },
    (response: { result?: InferenceResult; error?: string }) => {
      if (response?.result) {
        updatePopup(response.result);
      } else {
        updatePopup(undefined, response?.error ?? 'Regeneration failed');
      }
    },
  );
}

function placePopup(
  popup: HTMLElement,
  rect: { top: number; right: number; bottom: number; left: number },
): void {
  const top = rect.bottom + window.scrollY + 8;
  const left = Math.min(rect.left + window.scrollX, window.innerWidth - 276);
  popup.style.top = `${Math.max(top, 4)}px`;
  popup.style.left = `${Math.max(left, 4)}px`;
}
```

- [ ] **Step 2: Write `src/content/content.ts`**

```typescript
import { showPopup, updatePopup, destroyPopup } from './popup';
import type { ExtensionMessage } from '../types';

// Track the position of the last right-clicked image so we can anchor the popup
let lastImageRect: { top: number; right: number; bottom: number; left: number } = {
  top: 80,
  right: 280,
  bottom: 180,
  left: 20,
};

document.addEventListener('contextmenu', (e: MouseEvent) => {
  const target = e.target as HTMLElement;
  if (target.tagName === 'IMG') {
    const r = target.getBoundingClientRect();
    lastImageRect = { top: r.top, right: r.right, bottom: r.bottom, left: r.left };
  }
});

chrome.runtime.onMessage.addListener((message: ExtensionMessage) => {
  if (message.type !== 'SHOW_POPUP') return;

  const { result, error } = message.payload;

  if (!result && !error) {
    // Initial loading state
    showPopup({ imageUrl: message.payload.imageUrl, anchorRect: lastImageRect });
  } else {
    // Result or error — update if popup exists, otherwise show fresh
    updatePopup(result, error);
  }
});
```

- [ ] **Step 3: Build and verify**

```bash
npm run build
npx tsc --noEmit
```

Expected: Build succeeds, no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/content/content.ts src/content/popup.ts
git commit -m "feat: add content script with Shadow DOM popup"
```

---

## Task 11: Options Page

**Files:**
- Create: `src/options/options.html`
- Create: `src/options/options.css`
- Create: `src/options/options.ts`

- [ ] **Step 1: Write `src/options/options.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Alt Text Generator — Settings</title>
  <link rel="stylesheet" href="options.css">
</head>
<body>
  <div class="container">
    <header>
      <div class="logo">🖼</div>
      <div>
        <h1>Alt Text Generator</h1>
        <p class="subtitle">Settings</p>
      </div>
    </header>

    <section>
      <h2>AI Provider</h2>
      <div class="tabs" id="provider-tabs" role="tablist">
        <button class="tab active" data-provider="auto" role="tab">Auto</button>
        <button class="tab" data-provider="anthropic" role="tab">Anthropic</button>
        <button class="tab" data-provider="openai" role="tab">OpenAI</button>
        <button class="tab" data-provider="gemini" role="tab">Gemini</button>
        <button class="tab" data-provider="custom" role="tab">Custom</button>
      </div>

      <div id="panel-auto">
        <div class="cascade-status" id="cascade-status">
          <div class="status-row">
            <span class="dot" id="chrome-ai-dot"></span>
            <span>Chrome Built-in AI</span>
            <span class="badge" id="chrome-ai-badge">Checking…</span>
          </div>
          <div class="status-row">
            <span class="dot" id="gemma-dot" style="background:#334155"></span>
            <span>Gemma 4 E2B</span>
            <span class="badge badge-blue" id="gemma-badge">Not downloaded</span>
          </div>
        </div>
        <label class="checkbox-label">
          <input type="checkbox" id="prefer-builtin-ai" checked>
          Prefer Chrome Built-in AI when available
        </label>
        <div class="danger-row" id="model-delete-row" hidden>
          <span>Delete downloaded model</span>
          <button id="delete-model-btn" class="danger-btn">Delete cached model</button>
        </div>
      </div>

      <div id="panel-cloud" hidden>
        <label class="field-label">
          API Key
          <input type="password" id="api-key-input" placeholder="Paste your API key here" autocomplete="off">
        </label>
        <div id="custom-fields" hidden>
          <label class="field-label" style="margin-top:12px">
            Endpoint URL
            <input type="url" id="custom-endpoint-input" placeholder="https://localhost:11434/v1">
          </label>
        </div>
      </div>
    </section>

    <section>
      <h2>Alt Text Style</h2>
      <div class="style-cards" id="style-cards">
        <div class="style-card active" data-style="brief" tabindex="0" role="button">
          <h3>Brief</h3>
          <p>1–2 sentences. WCAG-style, concise.</p>
        </div>
        <div class="style-card" data-style="detailed" tabindex="0" role="button">
          <h3>Detailed</h3>
          <p>Full description, context, mood.</p>
        </div>
      </div>

      <details id="advanced-prompt">
        <summary>Advanced: custom prompt</summary>
        <div class="advanced-body">
          <p class="hint">Use <code>{style}</code> to interpolate the Brief/Detailed description.</p>
          <textarea id="custom-prompt-input" rows="5" spellcheck="false"></textarea>
          <button id="reset-prompt-btn" class="link-btn">Reset to default</button>
        </div>
      </details>
    </section>

    <footer>
      <span class="version">v0.1.0</span>
      <div class="actions">
        <button id="reset-all-btn">Reset all</button>
        <button id="save-btn" class="primary-btn">Save</button>
      </div>
    </footer>
  </div>
  <script type="module" src="options.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write `src/options/options.css`**

```css
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  background: #0f172a; color: #e2e8f0;
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 14px; line-height: 1.5;
}

.container {
  max-width: 560px; margin: 0 auto;
  padding: 24px 20px;
  display: flex; flex-direction: column; gap: 0;
}

header {
  display: flex; align-items: center; gap: 12px;
  padding-bottom: 20px; margin-bottom: 20px;
  border-bottom: 1px solid #1e293b;
}
.logo { font-size: 28px; }
h1 { font-size: 16px; font-weight: 600; color: #f1f5f9; }
.subtitle { color: #475569; font-size: 12px; }

section {
  padding: 20px 0;
  border-bottom: 1px solid #1e293b;
}
h2 {
  font-size: 10px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .08em; color: #94a3b8; margin-bottom: 14px;
}

.tabs { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 16px; }
.tab {
  background: #1e293b; color: #94a3b8; border: 1px solid #334155;
  border-radius: 6px; padding: 5px 12px; font-size: 12px; cursor: pointer;
}
.tab.active { background: #7c3aed; color: white; border-color: #7c3aed; }

.cascade-status {
  background: #1e293b; border-radius: 8px;
  padding: 12px 14px; display: flex; flex-direction: column; gap: 10px;
  margin-bottom: 12px;
}
.status-row { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.dot {
  width: 8px; height: 8px; border-radius: 50%;
  flex-shrink: 0; background: #334155;
}
.dot.active { background: #22c55e; }
.dot.error { background: #ef4444; }
.badge {
  margin-left: auto; background: #134e4a; color: #34d399;
  border-radius: 4px; padding: 1px 7px; font-size: 10px;
}
.badge-blue { background: #1e3a5f; color: #60a5fa; }
.badge-gray { background: #1e293b; color: #475569; }

.checkbox-label {
  display: flex; align-items: center; gap: 8px;
  font-size: 13px; color: #cbd5e1; cursor: pointer; margin-bottom: 10px;
}
.checkbox-label input { cursor: pointer; }

.danger-row {
  display: flex; align-items: center; justify-content: space-between;
  padding-top: 10px; border-top: 1px solid #334155; margin-top: 4px;
  font-size: 12px; color: #475569;
}
.danger-btn {
  background: transparent; color: #ef4444;
  border: 1px solid #450a0a; border-radius: 4px;
  padding: 3px 10px; font-size: 11px; cursor: pointer;
}

.field-label {
  display: flex; flex-direction: column; gap: 6px;
  font-size: 12px; color: #94a3b8;
}
.field-label input {
  background: #1e293b; border: 1px solid #334155; border-radius: 6px;
  color: #e2e8f0; font-size: 13px; padding: 8px 10px;
  outline: none; width: 100%;
}
.field-label input:focus { border-color: #7c3aed; }

.style-cards { display: flex; gap: 10px; margin-bottom: 14px; }
.style-card {
  flex: 1; background: #1e293b; border: 1px solid #334155;
  border-radius: 8px; padding: 10px 12px; cursor: pointer;
}
.style-card.active { border-color: #7c3aed; }
.style-card h3 { font-size: 13px; font-weight: 600; color: #e2e8f0; margin-bottom: 3px; }
.style-card p { font-size: 11px; color: #475569; }

details summary {
  color: #475569; font-size: 12px; cursor: pointer; list-style: none;
  display: flex; align-items: center; gap: 6px; user-select: none;
}
details summary::before { content: "▶"; font-size: 9px; }
details[open] summary::before { content: "▼"; }
.advanced-body { margin-top: 10px; }
.hint { color: #475569; font-size: 11px; margin-bottom: 6px; }
.hint code {
  background: #1e293b; padding: 1px 4px;
  border-radius: 3px; color: #a78bfa;
}
textarea {
  width: 100%; background: #1e293b; border: 1px solid #334155;
  border-radius: 6px; color: #e2e8f0; font-size: 12px;
  font-family: monospace; padding: 8px 10px; resize: vertical;
  outline: none;
}
textarea:focus { border-color: #7c3aed; }
.link-btn {
  background: none; border: none; color: #475569;
  font-size: 11px; cursor: pointer; padding: 4px 0; margin-top: 4px;
}

footer {
  display: flex; align-items: center; justify-content: space-between;
  padding-top: 20px;
}
.version { color: #334155; font-size: 11px; }
.actions { display: flex; gap: 10px; }
.actions button {
  background: #1e293b; color: #94a3b8; border: 1px solid #334155;
  border-radius: 6px; padding: 7px 16px; font-size: 12px; cursor: pointer;
}
.primary-btn {
  background: #7c3aed !important; color: white !important;
  border-color: #7c3aed !important; font-weight: 600 !important;
}

.save-feedback { color: #34d399; font-size: 12px; margin-right: 8px; opacity: 0; transition: opacity .3s; }
.save-feedback.visible { opacity: 1; }
```

- [ ] **Step 3: Write `src/options/options.ts`**

```typescript
import { getSettings, setSettings, getApiKeys, setApiKeys } from '../storage';
import { DEFAULT_PROMPT } from '../prompt';
import type { Provider, StyleMode, Settings, ApiKeys } from '../types';

async function init(): Promise<void> {
  const [settings, apiKeys] = await Promise.all([getSettings(), getApiKeys()]);
  applySettings(settings, apiKeys);
  checkChromeAIStatus();
  bindEvents(settings, apiKeys);
}

function applySettings(settings: Settings, apiKeys: ApiKeys): void {
  // Provider tabs
  document.querySelectorAll<HTMLButtonElement>('.tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.provider === settings.provider);
  });
  showProviderPanel(settings.provider);

  // prefer-builtin-ai checkbox
  const pbi = document.getElementById('prefer-builtin-ai') as HTMLInputElement;
  pbi.checked = settings.preferBuiltinAI;

  // Model delete row
  const deleteRow = document.getElementById('model-delete-row') as HTMLElement;
  deleteRow.hidden = !settings.modelDownloaded;

  // API key
  const apiKeyInput = document.getElementById('api-key-input') as HTMLInputElement;
  const key = getApiKeyForProvider(settings.provider, apiKeys);
  if (key) apiKeyInput.value = key;

  // Custom endpoint
  const customEndpoint = document.getElementById('custom-endpoint-input') as HTMLInputElement;
  customEndpoint.value = apiKeys.customEndpoint;
  const customFields = document.getElementById('custom-fields') as HTMLElement;
  customFields.hidden = settings.provider !== 'custom';

  // Style cards
  document.querySelectorAll<HTMLElement>('.style-card').forEach((card) => {
    card.classList.toggle('active', card.dataset.style === settings.style);
  });

  // Custom prompt
  const promptInput = document.getElementById('custom-prompt-input') as HTMLTextAreaElement;
  promptInput.value = settings.customPrompt ?? DEFAULT_PROMPT;
}

function showProviderPanel(provider: Provider): void {
  const autoPanel = document.getElementById('panel-auto') as HTMLElement;
  const cloudPanel = document.getElementById('panel-cloud') as HTMLElement;
  autoPanel.hidden = provider !== 'auto';
  cloudPanel.hidden = provider === 'auto';
}

async function checkChromeAIStatus(): Promise<void> {
  const dot = document.getElementById('chrome-ai-dot') as HTMLElement;
  const badge = document.getElementById('chrome-ai-badge') as HTMLElement;

  try {
    // Send a check message to the service worker
    const response = await new Promise<{ available: boolean }>((resolve) => {
      chrome.runtime.sendMessage({ type: 'CHECK_CHROME_AI' }, resolve);
    });
    if (response?.available) {
      dot.classList.add('active');
      badge.textContent = 'Active';
      badge.className = 'badge';
    } else {
      dot.classList.add('error');
      badge.textContent = 'Not available';
      badge.className = 'badge badge-gray';
    }
  } catch {
    badge.textContent = 'Unknown';
    badge.className = 'badge badge-gray';
  }

  // Gemma status from settings
  const settings = await getSettings();
  const gemmaDot = document.getElementById('gemma-dot') as HTMLElement;
  const gemmaBadge = document.getElementById('gemma-badge') as HTMLElement;
  if (settings.modelDownloaded) {
    gemmaDot.classList.add('active');
    gemmaBadge.textContent = 'Ready';
    gemmaBadge.className = 'badge';
  }
}

function getApiKeyForProvider(provider: Provider, apiKeys: ApiKeys): string {
  switch (provider) {
    case 'anthropic': return apiKeys.anthropic;
    case 'openai': return apiKeys.openai;
    case 'gemini': return apiKeys.gemini;
    case 'custom': return apiKeys.customKey;
    default: return '';
  }
}

function bindEvents(settings: Settings, apiKeys: ApiKeys): void {
  let currentProvider: Provider = settings.provider;
  let currentStyle: StyleMode = settings.style;

  // Provider tabs
  document.getElementById('provider-tabs')!.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.tab');
    if (!btn?.dataset.provider) return;
    currentProvider = btn.dataset.provider as Provider;
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    btn.classList.add('active');
    showProviderPanel(currentProvider);
    const customFields = document.getElementById('custom-fields') as HTMLElement;
    customFields.hidden = currentProvider !== 'custom';
    // Load the API key for the newly selected provider
    const apiKeyInput = document.getElementById('api-key-input') as HTMLInputElement;
    apiKeyInput.value = getApiKeyForProvider(currentProvider, apiKeys);
  });

  // Style cards
  document.getElementById('style-cards')!.addEventListener('click', (e) => {
    const card = (e.target as HTMLElement).closest<HTMLElement>('.style-card');
    if (!card?.dataset.style) return;
    currentStyle = card.dataset.style as StyleMode;
    document.querySelectorAll('.style-card').forEach((c) => c.classList.remove('active'));
    card.classList.add('active');
  });

  // Reset prompt
  document.getElementById('reset-prompt-btn')!.addEventListener('click', () => {
    (document.getElementById('custom-prompt-input') as HTMLTextAreaElement).value = DEFAULT_PROMPT;
  });

  // Delete model
  document.getElementById('delete-model-btn')?.addEventListener('click', async () => {
    if (!confirm('Delete the cached Gemma 4 E2B model (~2 GB)?')) return;
    // Transformers.js uses the Cache API; clear the model cache
    const cacheKeys = await caches.keys();
    await Promise.all(
      cacheKeys
        .filter((k) => k.includes('transformers') || k.includes('onnx'))
        .map((k) => caches.delete(k)),
    );
    await setSettings({ modelDownloaded: false });
    const deleteRow = document.getElementById('model-delete-row') as HTMLElement;
    deleteRow.hidden = true;
    const gemmaBadge = document.getElementById('gemma-badge') as HTMLElement;
    gemmaBadge.textContent = 'Not downloaded';
    gemmaBadge.className = 'badge badge-blue';
    const gemmaDot = document.getElementById('gemma-dot') as HTMLElement;
    gemmaDot.className = 'dot';
  });

  // Reset all
  document.getElementById('reset-all-btn')!.addEventListener('click', async () => {
    if (!confirm('Reset all settings to defaults?')) return;
    await setSettings({
      provider: 'auto', style: 'brief', customPrompt: null,
      preferBuiltinAI: true,
    });
    await setApiKeys({ anthropic: '', openai: '', gemini: '', customEndpoint: '', customKey: '' });
    location.reload();
  });

  // Save
  document.getElementById('save-btn')!.addEventListener('click', async () => {
    const customPromptInput = (document.getElementById('custom-prompt-input') as HTMLTextAreaElement).value.trim();
    const apiKeyInput = (document.getElementById('api-key-input') as HTMLInputElement).value.trim();
    const preferBuiltinAI = (document.getElementById('prefer-builtin-ai') as HTMLInputElement).checked;
    const customEndpoint = (document.getElementById('custom-endpoint-input') as HTMLInputElement).value.trim();

    await setSettings({
      provider: currentProvider,
      style: currentStyle,
      customPrompt: customPromptInput === DEFAULT_PROMPT ? null : customPromptInput || null,
      preferBuiltinAI,
    });

    // Persist API key for the current provider
    if (currentProvider !== 'auto') {
      const keyUpdate: Partial<ApiKeys> = {};
      if (currentProvider === 'anthropic') keyUpdate.anthropic = apiKeyInput;
      else if (currentProvider === 'openai') keyUpdate.openai = apiKeyInput;
      else if (currentProvider === 'gemini') keyUpdate.gemini = apiKeyInput;
      else if (currentProvider === 'custom') {
        keyUpdate.customKey = apiKeyInput;
        keyUpdate.customEndpoint = customEndpoint;
      }
      await setApiKeys(keyUpdate);
    }

    const saveBtn = document.getElementById('save-btn') as HTMLButtonElement;
    const originalText = saveBtn.textContent;
    saveBtn.textContent = 'Saved!';
    saveBtn.disabled = true;
    setTimeout(() => {
      saveBtn.textContent = originalText;
      saveBtn.disabled = false;
    }, 1500);
  });
}

init().catch(console.error);
```

- [ ] **Step 4: Add `CHECK_CHROME_AI` handler to service worker**

In `src/background/service-worker.ts`, add this listener (after the existing `REGENERATE` handler):

```typescript
// Check Chrome AI availability for the options page
chrome.runtime.onMessage.addListener(
  (message: { type: string }, _sender, sendResponse: (r: unknown) => void) => {
    if (message.type !== 'CHECK_CHROME_AI') return false;
    isChromeAIAvailable().then((available) => sendResponse({ available }));
    return true;
  },
);
```

Also add this import at the top of service-worker.ts:
```typescript
import { isChromeAIAvailable } from '../inference/chrome-ai';
```

- [ ] **Step 5: Build and verify**

```bash
npm run build
npx tsc --noEmit
```

Expected: Build succeeds, no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add src/options/ src/background/service-worker.ts
git commit -m "feat: add options page with provider tabs, style toggle, and model management"
```

---

## Task 12: End-to-End Verification

**Files:**
- Create: `tests/integration/extension.test.ts`

- [ ] **Step 1: Install Playwright Chrome extension support**

```bash
npx playwright install chromium
```

- [ ] **Step 2: Write `tests/integration/extension.test.ts`**

```typescript
import { test, expect, chromium } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(__dirname, '../../dist');

test.describe('Alt Text Generator extension', () => {
  test('options page loads and shows Auto provider selected', async () => {
    const context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
      ],
    });

    // Get the extension ID from the background page
    let [background] = context.serviceWorkers();
    if (!background) background = await context.waitForEvent('serviceworker');
    const extensionId = background.url().split('/')[2];

    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html`);

    // Auto tab should be active
    const activeTab = page.locator('.tab.active');
    await expect(activeTab).toHaveText('Auto');

    // Brief style card should be active
    const briefCard = page.locator('.style-card.active');
    await expect(briefCard).toContainText('Brief');

    await context.close();
  });

  test('options page saves and reloads settings', async () => {
    const context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
      ],
    });

    let [background] = context.serviceWorkers();
    if (!background) background = await context.waitForEvent('serviceworker');
    const extensionId = background.url().split('/')[2];

    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html`);

    // Switch to Detailed style
    await page.locator('.style-card[data-style="detailed"]').click();
    await expect(page.locator('.style-card[data-style="detailed"]')).toHaveClass(/active/);

    // Save
    await page.locator('#save-btn').click();
    await expect(page.locator('#save-btn')).toHaveText('Saved!');

    // Reload and verify persisted
    await page.reload();
    await expect(page.locator('.style-card[data-style="detailed"]')).toHaveClass(/active/);

    await context.close();
  });
});
```

- [ ] **Step 3: Add a `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'jsdom',
  },
});
```

Update `tsconfig.json` to exclude tests/integration from the Vitest run (Playwright uses its own runner):

```json
{
  "compilerOptions": { ... },
  "include": ["src/**/*"],
  "exclude": ["tests/integration/**/*"]
}
```

- [ ] **Step 4: Run unit tests**

```bash
npx vitest run
```

Expected: All unit tests PASS (prompt, storage, cascade, chrome-ai).

- [ ] **Step 5: Run integration tests**

```bash
npx playwright test tests/integration/extension.test.ts
```

Expected: Both integration tests PASS.

- [ ] **Step 6: Manual smoke test**

1. Open `chrome://extensions` → enable Developer mode → "Load unpacked" → select `dist/`
2. Navigate to any page with images (e.g., https://unsplash.com)
3. Right-click an image → "Generate Alt Text"
4. Verify: loading popup appears near the image
5. Verify: after generation, alt text appears with copy button and source label
6. Click "Copy" → paste into a text editor → verify text matches
7. Open extension options → verify Auto provider is selected, cascade status shown

- [ ] **Step 7: Final commit**

```bash
git add tests/ vitest.config.ts
git commit -m "test: add unit and integration tests, smoke test instructions"
```

---

## Dependency Check

All types, functions, and methods are consistent across tasks:

| Symbol | Defined in | Used in |
|---|---|---|
| `Settings`, `ApiKeys`, `InferenceRequest`, `InferenceResult`, `ExtensionMessage` | `src/types.ts` (Task 2) | All tasks |
| `getSettings`, `setSettings`, `getApiKeys`, `setApiKeys` | `src/storage.ts` (Task 3) | Tasks 9, 11 |
| `buildPrompt`, `DEFAULT_PROMPT` | `src/prompt.ts` (Task 4) | Tasks 9, 11 |
| `isChromeAIAvailable`, `generateWithChromeAI` | `src/inference/chrome-ai.ts` (Task 5) | Tasks 7, 9, 11 |
| `generateWithCloud` | `src/inference/cloud.ts` (Task 6) | Task 7 |
| `runCascade`, `GemmaFn` | `src/inference/cascade.ts` (Task 7) | Task 9 |
| `showPopup`, `updatePopup`, `destroyPopup` | `src/content/popup.ts` (Task 10) | Task 10 content.ts |
