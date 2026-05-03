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
    const req = { ...mockRequest, imageBase64: btoa('fake-image-data') };
    const result = await generateWithChromeAI(req);
    expect(result.altText).toBe('A golden retriever on a beach.');
    expect(result.source).toBe('chrome-ai');
  });

  it('always destroys the session', async () => {
    const req = { ...mockRequest, imageBase64: btoa('fake-image-data') };
    await generateWithChromeAI(req);
    expect(mockSession.destroy).toHaveBeenCalledOnce();
  });

  it('destroys session even when prompt throws', async () => {
    mockSession.prompt.mockRejectedValue(new Error('inference failed'));
    const req = { ...mockRequest, imageBase64: btoa('fake-image-data') };
    await expect(generateWithChromeAI(req)).rejects.toThrow('inference failed');
    expect(mockSession.destroy).toHaveBeenCalledOnce();
  });

  it('passes a Blob to session.prompt when imageBase64 is set', async () => {
    const req = { ...mockRequest, imageBase64: btoa('fake-image-data') };
    await generateWithChromeAI(req);
    const calls = mockSession.prompt.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const [inputs] = calls[0];
    expect(inputs[0].value).toBeInstanceOf(Blob);
  });

  it('throws when imageBase64 is null', async () => {
    await expect(generateWithChromeAI(mockRequest)).rejects.toThrow('imageBase64 is required');
  });
});
