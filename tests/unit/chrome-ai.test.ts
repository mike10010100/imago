import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
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
