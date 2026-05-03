import { pipeline, env } from '@huggingface/transformers';
import type { InferenceRequest, InferenceResult, ExtensionMessage } from '../types';

if (env.backends.onnx.wasm) env.backends.onnx.wasm.proxy = false;

const MODEL_ID = 'onnx-community/gemma-4-e2b-it';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TextGenPipeline = (input: any, options?: any) => Promise<any>;
let pipe: TextGenPipeline | null = null;

async function loadModel(): Promise<void> {
  if (pipe !== null) return;
  pipe = (await pipeline('text-generation', MODEL_ID, {
    device: 'webgpu',
    progress_callback: (info: { progress?: number; status?: string }) => {
      if (info.status === 'progress' && typeof info.progress === 'number') {
        chrome.runtime.sendMessage({
          type: 'MODEL_DOWNLOAD_PROGRESS',
          payload: { progress: Math.round(info.progress) },
        } satisfies ExtensionMessage);
      }
    },
  })) as unknown as TextGenPipeline;
  await chrome.storage.sync.set({ modelDownloaded: true });
}

async function handleGenerate(request: InferenceRequest): Promise<InferenceResult> {
  await loadModel();

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
    return true;
  },
);
