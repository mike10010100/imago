import { describe, it, expect } from 'vitest';
import { buildPrompt, DEFAULT_PROMPT } from '../../src/prompt';

describe('buildPrompt', () => {
  it('interpolates brief style into default prompt', () => {
    const result = buildPrompt('brief', null);
    expect(result).toContain('1–2 sentences, concise and purposeful');
    expect(result).not.toContain('{style}');
  });

  it('interpolates detailed style into default prompt', () => {
    const result = buildPrompt('detailed', null);
    expect(result).toContain('thorough, including context, mood, and visual details');
    expect(result).not.toContain('{style}');
  });

  it('uses custom prompt template with {style} interpolation', () => {
    const result = buildPrompt('brief', 'Be {style} when describing this.');
    expect(result).toBe('Be 1–2 sentences, concise and purposeful when describing this.');
  });

  it('uses custom prompt unchanged when it has no {style}', () => {
    const result = buildPrompt('brief', 'Just describe the image in one sentence.');
    expect(result).toBe('Just describe the image in one sentence.');
  });

  it('exports DEFAULT_PROMPT as a non-empty string', () => {
    expect(typeof DEFAULT_PROMPT).toBe('string');
    expect(DEFAULT_PROMPT.length).toBeGreaterThan(0);
    expect(DEFAULT_PROMPT).toContain('{style}');
  });
});
