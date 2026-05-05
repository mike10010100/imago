import { getSettings, getApiKeys } from '../storage';
import { buildPrompt } from '../prompt';
import { runCascade } from '../inference/cascade';
import { isChromeAIAvailable } from '../inference/chrome-ai';
import { MODEL_IDS } from '../offscreen/offscreen';
import type { InferenceRequest, InferenceResult, ExtensionMessage } from '../types';

const OFFSCREEN_URL = chrome.runtime.getURL('offscreen.html');

async function ensureOffscreenDocument(): Promise<void> {
  if (await chrome.offscreen.hasDocument()) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: [chrome.offscreen.Reason.WORKERS],
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

    const sendToTab = (msg: ExtensionMessage) =>
      chrome.tabs.sendMessage(tabId, msg, () => void chrome.runtime.lastError);

    sendToTab({ type: 'SHOW_POPUP', payload: { imageUrl } } satisfies ExtensionMessage);

    const { imageBase64, mimeType } = await fetchImageBytes(imageUrl);
    const settings = await getSettings();
    const apiKeys = await getApiKeys();
    const prompt = buildPrompt(settings.style, settings.customPrompt);

    const localModelId = MODEL_IDS[settings.localModel];
    const request: InferenceRequest = { imageBase64, imageUrl, mimeType, prompt, localModelId };

    try {
      const result = await runCascade(
        request,
        settings,
        apiKeys,
        generateWithGemmaViaOffscreen,
      );
      sendToTab({ type: 'SHOW_POPUP', payload: { result, imageUrl } } satisfies ExtensionMessage);
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      const userMessage = mapErrorMessage(error, settings);
      sendToTab({ type: 'SHOW_POPUP', payload: { error: userMessage, imageUrl } } satisfies ExtensionMessage);
    }
  },
);

chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, _sender, sendResponse) => {
    if (message.type !== 'REGENERATE') return false;
    const { imageUrl, style } = message.payload;

    (async () => {
      try {
        const { imageBase64, mimeType } = await fetchImageBytes(imageUrl);
        const settings = await getSettings();
        const apiKeys = await getApiKeys();
        const prompt = buildPrompt(style, settings.customPrompt);
        const localModelId = MODEL_IDS[settings.localModel];
        const request: InferenceRequest = { imageBase64, imageUrl, mimeType, prompt, localModelId };
        const result = await runCascade(request, settings, apiKeys, generateWithGemmaViaOffscreen);
        sendResponse({ result });
      } catch (err) {
        sendResponse({ error: err instanceof Error ? err.message : 'Unknown error' });
      }
    })();

    return true;
  },
);

chrome.runtime.onMessage.addListener(
  (message: { type: string }, _sender, sendResponse: (r: unknown) => void) => {
    if (message.type !== 'CHECK_CHROME_AI') return false;
    isChromeAIAvailable()
      .then((available) => sendResponse({ available }))
      .catch(() => sendResponse({ available: false }));
    return true;
  },
);

chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, _sender, sendResponse: (r: unknown) => void) => {
    if (message.type !== 'DOWNLOAD_MODEL') return false;
    (async () => {
      const settings = await getSettings();
      const modelId = MODEL_IDS[settings.localModel];
      await ensureOffscreenDocument();
      chrome.runtime.sendMessage(
        { type: 'PRELOAD_MODEL', payload: { modelId } } satisfies ExtensionMessage,
        () => void chrome.runtime.lastError,
      );
      sendResponse({ ok: true });
    })().catch((err: Error) => sendResponse({ error: err.message }));
    return true;
  },
);

chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, _sender, sendResponse: (r: unknown) => void) => {
    if (message.type !== 'MODEL_LOADED') return false;
    const storageKey = message.payload.modelId === MODEL_IDS.e4b ? 'e4bDownloaded' : 'modelDownloaded';
    chrome.storage.sync.set({ [storageKey]: true }).catch(console.error);
    sendResponse({});
    return false;
  },
);

function mapErrorMessage(raw: string, _settings: unknown): string {
  if (raw.includes('WebGPU') || raw.includes('webgpu')) {
    return "Your browser doesn't support local AI (WebGPU required) — add a cloud API key in Settings.";
  }
  if (raw.includes('huggingface.co') || raw.includes('locate file') || raw.includes('from_pretrained')) {
    return "Couldn't download the AI model from HuggingFace. Check your connection, or add a cloud API key in Settings.";
  }
  if (raw.includes('API key') || raw.includes('401') || raw.includes('403')) {
    return 'API key invalid or missing — check Settings.';
  }
  if (raw.includes('timed out')) {
    return 'Generation timed out. The model may still be downloading — try again, or add a cloud API key in Settings.';
  }
  if (raw.includes('imageBase64 is required') || raw.includes('CORS') || raw.includes('Failed to fetch image')) {
    return "This image can't be accessed due to security restrictions.";
  }
  return raw;
}
