import type { StyleMode } from './types';

export const DEFAULT_PROMPT =
  'Generate concise, descriptive alt text for this image following WCAG 2.1 guidelines.\n' +
  'Be {style}: describe what is shown and its purpose.\n' +
  'Do not start with "Image of" or "Picture of".';

const STYLE_DESCRIPTIONS: Record<StyleMode, string> = {
  brief: '1–2 sentences, concise and purposeful',
  detailed: 'thorough, including context, mood, and visual details',
};

export function buildPrompt(style: StyleMode, customPrompt: string | null): string {
  const template = customPrompt ?? DEFAULT_PROMPT;
  return template.replaceAll('{style}', STYLE_DESCRIPTIONS[style]);
}
