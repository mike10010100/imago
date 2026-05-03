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
