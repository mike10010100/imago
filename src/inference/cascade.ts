import type { Settings, ApiKeys, InferenceRequest, InferenceResult } from '../types';
import { isChromeAIAvailable, generateWithChromeAI } from './chrome-ai';
import { generateWithCloud } from './cloud';

export type GemmaFn = (request: InferenceRequest) => Promise<InferenceResult>;

export async function runCascade(
  request: InferenceRequest,
  settings: Settings,
  apiKeys: ApiKeys,
  generateWithGemma: GemmaFn,
): Promise<InferenceResult> {
  if (settings.provider !== 'auto') {
    return generateWithCloud(request, settings.provider, apiKeys);
  }

  if (settings.preferBuiltinAI && (await isChromeAIAvailable())) {
    return generateWithChromeAI(request);
  }

  return generateWithGemma(request);
}
