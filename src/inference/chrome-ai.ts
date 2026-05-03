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
