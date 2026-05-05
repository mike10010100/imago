import {
  AutoProcessor,
  Gemma4ForConditionalGeneration,
  load_image,
  env,
} from '@huggingface/transformers';
import type { InferenceRequest, InferenceResult, ExtensionMessage } from '../types';

if (env.backends.onnx.wasm) {
  env.backends.onnx.wasm.proxy = false;
  // SharedArrayBuffer (required for multi-threading) is not available in extension
  // pages without COOP/COEP headers, so force single-threaded WASM execution.
  env.backends.onnx.wasm.numThreads = 1;
  // Point ONNX Runtime at locally bundled wasm/mjs files instead of jsDelivr CDN.
  // MV3 CSP blocks external scripts; 'self' (chrome-extension://<id>/) is allowed.
  env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL('assets/ort/');
}

export const MODEL_IDS = {
  e2b: 'onnx-community/gemma-4-E2B-it-ONNX',
  e4b: 'onnx-community/gemma-4-E4B-it-ONNX',
} as const;

const DEFAULT_MODEL_ID = MODEL_IDS.e2b;

type Processor = {
  apply_chat_template(messages: unknown, options: unknown): unknown;
  (prompt: unknown, image: unknown, audio: unknown, options: unknown): Promise<{ input_ids: { dims: number[] } }>;
  batch_decode(tokens: unknown, options: unknown): string[];
};

type Model = {
  generate(inputs: unknown): Promise<unknown>;
};

type ModelState = { processor: Processor; model: Model; device: 'webgpu' | 'wasm' };

const modelCache = new Map<string, Promise<ModelState>>();

async function detectDevice(): Promise<'webgpu' | 'wasm'> {
  if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
    try {
      const adapter = await (navigator as unknown as { gpu: { requestAdapter(): Promise<unknown> } }).gpu.requestAdapter();
      if (adapter) return 'webgpu';
    } catch {
      // WebGPU unavailable
    }
  }
  return 'wasm';
}

function broadcastProgress(progress: number): void {
  chrome.runtime.sendMessage(
    { type: 'MODEL_DOWNLOAD_PROGRESS', payload: { progress } } satisfies ExtensionMessage,
    () => void chrome.runtime.lastError,
  );
}

function broadcastError(error: string): void {
  chrome.runtime.sendMessage(
    { type: 'MODEL_LOAD_ERROR', payload: { error } } satisfies ExtensionMessage,
    () => void chrome.runtime.lastError,
  );
}

function makeProgressCallback(): (info: { status: string; progress?: number }) => void {
  let last = -1;
  return (info: { status: string; progress?: number }) => {
    if (info.status === 'progress' && typeof info.progress === 'number') {
      const pct = Math.round(info.progress);
      if (pct - last >= 5) {
        last = pct;
        broadcastProgress(pct);
      }
    }
  };
}

function getModel(modelId: string): Promise<ModelState> {
  if (!modelCache.has(modelId)) {
    const promise = (async () => {
      const device = await detectDevice();
      // q4f16 requires GPU float16 support; q4 works on both WebGPU and WASM
      const dtype = device === 'webgpu' ? 'q4f16' : 'q4';

      // Use separate callbacks so model weight progress starts fresh after processor finishes
      const processor = (await AutoProcessor.from_pretrained(modelId, {
        progress_callback: makeProgressCallback(),
      })) as unknown as Processor;
      const model = (await (Gemma4ForConditionalGeneration as unknown as {
        from_pretrained(id: string, opts: unknown): Promise<Model>;
      }).from_pretrained(modelId, { dtype, device, progress_callback: makeProgressCallback() }));
      // Offscreen docs can't access chrome.storage — notify service worker to update it
      chrome.runtime.sendMessage(
        { type: 'MODEL_LOADED', payload: { modelId } } satisfies ExtensionMessage,
        () => void chrome.runtime.lastError,
      );
      return { processor, model, device };
    })().catch((err: unknown) => {
      modelCache.delete(modelId);
      throw err;
    });
    modelCache.set(modelId, promise);
  }
  return modelCache.get(modelId)!;
}

async function handleGenerate(request: InferenceRequest): Promise<InferenceResult> {
  const modelId = request.localModelId ?? DEFAULT_MODEL_ID;
  const { processor, model } = await getModel(modelId);

  let objectUrl: string | null = null;
  try {
    const blob: Blob = request.imageBase64
      ? base64ToBlob(request.imageBase64, request.mimeType)
      : await fetch(request.imageUrl).then((r) => {
          if (!r.ok) throw new Error(`Failed to fetch image: ${r.status}`);
          return r.blob();
        });

    objectUrl = URL.createObjectURL(blob);

    const messages = [
      {
        role: 'user',
        content: [
          { type: 'image' },
          { type: 'text', text: request.prompt },
        ],
      },
    ];

    const prompt = processor.apply_chat_template(messages, {
      enable_thinking: false,
      add_generation_prompt: true,
    });

    const image = await load_image(objectUrl);
    const inputs = await processor(prompt, image, null, { add_special_tokens: false });

    const outputs = await model.generate({
      ...inputs,
      max_new_tokens: 256,
      do_sample: false,
    });

    const inputLen = inputs.input_ids.dims.at(-1) ?? 0;
    const decoded = processor.batch_decode(
      (outputs as { slice(a: null, b: [number, null]): unknown }).slice(null, [inputLen, null]),
      { skip_special_tokens: true },
    );

    const altText = decoded[0]?.trim();
    if (!altText) throw new Error('Gemma returned empty response');

    const isE4B = modelId === MODEL_IDS.e4b;
    return { altText, source: isE4B ? 'gemma-4-e4b' : 'gemma-4-e2b' };
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
    return true;
  },
);

chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, _sender, sendResponse: (r: unknown) => void) => {
    if (message.type !== 'PRELOAD_MODEL') return false;
    getModel(message.payload.modelId)
      .then(() => sendResponse({ ok: true }))
      .catch((err: Error) => {
        broadcastError(err.message);
        sendResponse({ error: err.message });
      });
    return true;
  },
);
