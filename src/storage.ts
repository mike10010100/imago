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
  const result = await chrome.storage.sync.get(SETTINGS_DEFAULTS);
  return result as Settings;
}

export async function setSettings(partial: Partial<Settings>): Promise<void> {
  await chrome.storage.sync.set(partial);
}

export async function getApiKeys(): Promise<ApiKeys> {
  const result = await chrome.storage.local.get(API_KEY_DEFAULTS);
  return result as ApiKeys;
}

export async function setApiKeys(partial: Partial<ApiKeys>): Promise<void> {
  await chrome.storage.local.set(partial);
}
