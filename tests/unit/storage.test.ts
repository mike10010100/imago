import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSettings, setSettings, getApiKeys, setApiKeys } from '../../src/storage';

const syncStore: Record<string, unknown> = {};
const localStore: Record<string, unknown> = {};

vi.stubGlobal('chrome', {
  storage: {
    sync: {
      get: vi.fn((defaults: Record<string, unknown>) =>
        Promise.resolve({ ...defaults, ...syncStore })
      ),
      set: vi.fn((values: Record<string, unknown>) => {
        Object.assign(syncStore, values);
        return Promise.resolve();
      }),
    },
    local: {
      get: vi.fn((defaults: Record<string, unknown>) =>
        Promise.resolve({ ...defaults, ...localStore })
      ),
      set: vi.fn((values: Record<string, unknown>) => {
        Object.assign(localStore, values);
        return Promise.resolve();
      }),
    },
  },
});

beforeEach(() => {
  Object.keys(syncStore).forEach((k) => delete syncStore[k]);
  Object.keys(localStore).forEach((k) => delete localStore[k]);
});

describe('getSettings', () => {
  it('returns defaults when storage is empty', async () => {
    const s = await getSettings();
    expect(s.provider).toBe('auto');
    expect(s.style).toBe('brief');
    expect(s.preferBuiltinAI).toBe(true);
    expect(s.modelDownloaded).toBe(false);
    expect(s.customPrompt).toBeNull();
  });

  it('returns stored values over defaults', async () => {
    syncStore.style = 'detailed';
    const s = await getSettings();
    expect(s.style).toBe('detailed');
  });
});

describe('setSettings', () => {
  it('persists partial settings', async () => {
    await setSettings({ style: 'detailed', provider: 'openai' });
    const s = await getSettings();
    expect(s.style).toBe('detailed');
    expect(s.provider).toBe('openai');
  });

  it('never touches local storage', async () => {
    await setSettings({ provider: 'anthropic' });
    expect(localStore.provider).toBeUndefined();
  });

  it('preserves false boolean over default true', async () => {
    await setSettings({ preferBuiltinAI: false });
    const s = await getSettings();
    expect(s.preferBuiltinAI).toBe(false);
  });

  it('round-trips a non-null customPrompt', async () => {
    await setSettings({ customPrompt: 'describe the chart in detail' });
    const s = await getSettings();
    expect(s.customPrompt).toBe('describe the chart in detail');
  });
});

describe('getApiKeys / setApiKeys', () => {
  it('returns empty strings when no keys stored', async () => {
    const keys = await getApiKeys();
    expect(keys.anthropic).toBe('');
    expect(keys.openai).toBe('');
  });

  it('stores API keys in local storage only', async () => {
    await setApiKeys({ anthropic: 'sk-ant-test123' });
    const keys = await getApiKeys();
    expect(keys.anthropic).toBe('sk-ant-test123');
    expect(syncStore.anthropic).toBeUndefined(); // never touches sync
  });

  it('persists custom endpoint', async () => {
    await setApiKeys({ customEndpoint: 'http://localhost:11434/v1', customKey: 'ollama' });
    const keys = await getApiKeys();
    expect(keys.customEndpoint).toBe('http://localhost:11434/v1');
    expect(keys.customKey).toBe('ollama');
  });
});
