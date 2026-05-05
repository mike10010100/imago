export type Provider = 'auto' | 'anthropic' | 'openai' | 'gemini' | 'custom';
export type StyleMode = 'brief' | 'detailed';
export type LocalModel = 'e2b' | 'e4b';

export interface Settings {
  provider: Provider;
  style: StyleMode;
  customPrompt: string | null;
  preferBuiltinAI: boolean;
  modelDownloaded: boolean;
  e4bDownloaded: boolean;
  localModel: LocalModel;
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
  localModelId?: string;
}

export interface InferenceResult {
  altText: string;
  source: 'chrome-ai' | 'gemma-4-e2b' | 'gemma-4-e4b' | 'anthropic' | 'openai' | 'gemini' | 'custom';
}

export type ExtensionMessage =
  | { type: 'GENERATE_ALT_TEXT'; payload: InferenceRequest }
  | { type: 'ALT_TEXT_RESULT'; payload: InferenceResult }
  | { type: 'MODEL_DOWNLOAD_PROGRESS'; payload: { progress: number } }
  | { type: 'SHOW_POPUP'; payload: { result?: InferenceResult; error?: string; imageUrl: string } }
  | { type: 'REGENERATE'; payload: { imageUrl: string; style: StyleMode } }
  | { type: 'CHECK_CHROME_AI' }
  | { type: 'DOWNLOAD_MODEL' }
  | { type: 'PRELOAD_MODEL'; payload: { modelId: string } }
  | { type: 'MODEL_LOADED'; payload: { modelId: string } }
  | { type: 'MODEL_LOAD_ERROR'; payload: { error: string } };
