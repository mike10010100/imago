import { pipeline, env } from '@huggingface/transformers';
import type { InferenceRequest, InferenceResult, ExtensionMessage } from '../types';

if (env.backends.onnx.wasm) env.backends.onnx.wasm.proxy = false;

const MODEL_ID = 'onnx-community/gemma-4-e2b-it';

// @huggingface/transformers does not export a typed callable interface for text-generation
type TextGenPipeline = (input: unknown, options?: unknown) => Promise<unknown>;
let pipePromise: Promise<TextGenPipeline> | null = null;

function getModel(): Promise<TextGenPipeline> {
  if (!pipePromise) {
    pipePromise = (async () => {
      const p = (await pipeline('text-generation', MODEL_ID, {
        device: 'webgpu',
      })) as unknown as TextGenPipeline;
      await chrome.storage.sync.set({ modelDownloaded: true });
      return p;
    })().catch((err: unknown) => {
      pipePromise = null; // allow retry on failure
      throw err;
    });
  }
  return pipePromise;
}

async function handleGenerate(request: InferenceRequest): Promise<InferenceResult> {
  const pipe = await getModel();

  let objectUrl: string | null = null;
  try {
    const blob: Blob = request.imageBase64
      ? base64ToBlob(request.imageBase64, request.mimeType)
      : await fetch(request.imageUrl).then((r) => {
          if (!r.ok) throw new Error(`Failed to fetch image: ${r.status}`);
          return r.blob();
        });

    objectUrl = URL.createObjectURL(blob);

    const output = await pipe([
      {
        role: 'user',
        content: [
          { type: 'image', image: objectUrl },
          { type: 'text', text: request.prompt },
        ],
      },
    ], { max_new_tokens: 256 });

    const entry = (output as Array<{ generated_text: unknown }>)[0]?.generated_text;
    if (!Array.isArray(entry)) {
      throw new Error('Unexpected pipeline output shape — expected generated_text array');
    }
    const assistantContent = (entry.at(-1) as { content?: string } | undefined)?.content ?? '';
    if (!assistantContent) throw new Error('Gemma returned empty response');

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
    return true;
  },
);
