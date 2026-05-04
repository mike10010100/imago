import {
  AutoProcessor,
  Gemma4ForConditionalGeneration,
  load_image,
  env,
} from '@huggingface/transformers';
import type { InferenceRequest, InferenceResult, ExtensionMessage } from '../types';

if (env.backends.onnx.wasm) env.backends.onnx.wasm.proxy = false;

const MODEL_ID = 'onnx-community/gemma-4-E2B-it-ONNX';

type Processor = {
  apply_chat_template(messages: unknown, options: unknown): unknown;
  (prompt: unknown, image: unknown, options: unknown): Promise<{ input_ids: { dims: number[] } }>;
  batch_decode(tokens: unknown, options: unknown): string[];
};

type Model = {
  generate(inputs: unknown): Promise<unknown>;
};

type ModelState = { processor: Processor; model: Model };

let modelPromise: Promise<ModelState> | null = null;

function getModel(): Promise<ModelState> {
  if (!modelPromise) {
    modelPromise = (async () => {
      const processor = (await AutoProcessor.from_pretrained(MODEL_ID)) as unknown as Processor;
      const model = (await (Gemma4ForConditionalGeneration as unknown as {
        from_pretrained(id: string, opts: unknown): Promise<Model>;
      }).from_pretrained(MODEL_ID, {
        dtype: 'q4f16',
        device: 'webgpu',
      }));
      await chrome.storage.sync.set({ modelDownloaded: true });
      return { processor, model };
    })().catch((err: unknown) => {
      modelPromise = null;
      throw err;
    });
  }
  return modelPromise;
}

async function handleGenerate(request: InferenceRequest): Promise<InferenceResult> {
  const { processor, model } = await getModel();

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
    const inputs = await processor(prompt, image, { add_special_tokens: false });

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

    return { altText, source: 'gemma-4-e2b' };
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
