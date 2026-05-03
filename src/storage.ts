import type { Settings, ApiKeys } from './types';

const SETTINGS_DEFAULTS: Settings = {
  provider: 'auto',
  style: 'brief',
  customPrompt: null,
  preferBuiltinAI: true,
  modelDownloaded: false,
};

const API_KEY_DEFAULTS: ApiKeys = {
  anthropic: '',
  openai: '',
  gemini: '',
  customEndpoint: '',
  customKey: '',
};

export async function getSettings(): Promise<Settings> {
  const result = await chrome.storage.sync.get(SETTINGS_DEFAULTS as unknown as Record<string, unknown>);
  return result as unknown as Settings;
}

export async function setSettings(partial: Partial<Settings>): Promise<void> {
  await chrome.storage.sync.set(partial as unknown as Record<string, unknown>);
}

export async function getApiKeys(): Promise<ApiKeys> {
  const result = await chrome.storage.local.get(API_KEY_DEFAULTS as unknown as Record<string, unknown>);
  return result as unknown as ApiKeys;
}

export async function setApiKeys(partial: Partial<ApiKeys>): Promise<void> {
  await chrome.storage.local.set(partial as unknown as Record<string, unknown>);
}
