export type Provider = 'auto' | 'anthropic' | 'openai' | 'gemini' | 'custom';
export type StyleMode = 'brief' | 'detailed';

export interface Settings {
  provider: Provider;
  style: StyleMode;
  customPrompt: string | null;
  preferBuiltinAI: boolean;
  modelDownloaded: boolean;
}

export interface ApiKeys {
  anthropic: string;
  openai: string;
  gemini: string;
  customEndpoint: string;
  customKey: string;
}

export interface InferenceRequest {
  imageBase64: string | null;
  imageUrl: string;
  mimeType: string;
  prompt: string;
}

export interface InferenceResult {
  altText: string;
  source: 'chrome-ai' | 'gemma-4-e2b' | 'anthropic' | 'openai' | 'gemini' | 'custom';
}

export type ExtensionMessage =
  | { type: 'GENERATE_ALT_TEXT'; payload: InferenceRequest }
  | { type: 'ALT_TEXT_RESULT'; payload: InferenceResult }
  | { type: 'MODEL_DOWNLOAD_PROGRESS'; payload: { progress: number } }
  | { type: 'SHOW_POPUP'; payload: { result?: InferenceResult; error?: string; imageUrl: string } }
  | { type: 'REGENERATE'; payload: { imageUrl: string; style: StyleMode } };
