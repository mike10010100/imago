import { getSettings, setSettings, getApiKeys, setApiKeys } from '../storage';
import { DEFAULT_PROMPT } from '../prompt';
import type { Provider, StyleMode, LocalModel, Settings, ApiKeys } from '../types';

const MODEL_LABELS: Record<LocalModel, string> = { e2b: 'Gemma 4 E2B', e4b: 'Gemma 4 E4B' };
const MODEL_SIZES: Record<LocalModel, string> = { e2b: '~2 GB', e4b: '~4 GB' };

function isDownloaded(settings: Settings, model: LocalModel): boolean {
  return model === 'e4b' ? settings.e4bDownloaded : settings.modelDownloaded;
}

async function init(): Promise<void> {
  const [settings, apiKeys] = await Promise.all([getSettings(), getApiKeys()]);
  applySettings(settings, apiKeys);
  checkChromeAIStatus();
  bindEvents(settings, apiKeys);
}

function applySettings(settings: Settings, apiKeys: ApiKeys): void {
  document.querySelectorAll<HTMLButtonElement>('.tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.provider === settings.provider);
  });
  showProviderPanel(settings.provider);

  const pbi = document.getElementById('prefer-builtin-ai') as HTMLInputElement;
  pbi.checked = settings.preferBuiltinAI;

  document.querySelectorAll<HTMLElement>('.model-variant-card').forEach((card) => {
    card.classList.toggle('active', card.dataset.model === settings.localModel);
  });

  applyModelDownloadState(settings, settings.localModel);

  const apiKeyInput = document.getElementById('api-key-input') as HTMLInputElement;
  const key = getApiKeyForProvider(settings.provider, apiKeys);
  if (key) apiKeyInput.value = key;

  const customEndpoint = document.getElementById('custom-endpoint-input') as HTMLInputElement;
  customEndpoint.value = apiKeys.customEndpoint;
  const customFields = document.getElementById('custom-fields') as HTMLElement;
  customFields.hidden = settings.provider !== 'custom';

  document.querySelectorAll<HTMLElement>('.style-card').forEach((card) => {
    card.classList.toggle('active', card.dataset.style === settings.style);
  });

  const promptInput = document.getElementById('custom-prompt-input') as HTMLTextAreaElement;
  promptInput.value = settings.customPrompt ?? DEFAULT_PROMPT;
}

function applyModelDownloadState(settings: Settings, model: LocalModel): void {
  const downloaded = isDownloaded(settings, model);

  const gemmaLabel = document.getElementById('gemma-label') as HTMLElement;
  gemmaLabel.textContent = MODEL_LABELS[model];

  const gemmaDot = document.getElementById('gemma-dot') as HTMLElement;
  gemmaDot.className = downloaded ? 'dot active' : 'dot';

  const gemmaBadge = document.getElementById('gemma-badge') as HTMLElement;
  gemmaBadge.textContent = downloaded ? 'Ready' : 'Not downloaded';
  gemmaBadge.className = downloaded ? 'badge' : 'badge badge-blue';

  const downloadRow = document.getElementById('model-download-row') as HTMLElement;
  downloadRow.hidden = downloaded;

  const btn = document.getElementById('download-model-btn') as HTMLButtonElement;
  btn.textContent = `Download model (${MODEL_SIZES[model]})`;
  btn.disabled = false;

  const status = document.getElementById('download-status') as HTMLElement;
  status.textContent = '';
  status.style.color = '';

  const deleteRow = document.getElementById('model-delete-row') as HTMLElement;
  deleteRow.hidden = !downloaded;
}

function showProviderPanel(provider: Provider): void {
  const autoPanel = document.getElementById('panel-auto') as HTMLElement;
  const cloudPanel = document.getElementById('panel-cloud') as HTMLElement;
  autoPanel.hidden = provider !== 'auto';
  cloudPanel.hidden = provider === 'auto';
}

async function checkChromeAIStatus(): Promise<void> {
  const dot = document.getElementById('chrome-ai-dot') as HTMLElement;
  const badge = document.getElementById('chrome-ai-badge') as HTMLElement;

  try {
    const response = await new Promise<{ available: boolean } | undefined>((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'CHECK_CHROME_AI' }, (r: { available: boolean } | undefined) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(r);
      });
    });
    if (response?.available) {
      dot.classList.add('active');
      badge.textContent = 'Active';
      badge.className = 'badge';
    } else {
      dot.classList.add('error');
      badge.textContent = 'Not available';
      badge.className = 'badge badge-gray';
    }
  } catch {
    badge.textContent = 'Unknown';
    badge.className = 'badge badge-gray';
  }
}

function getApiKeyForProvider(provider: Provider, apiKeys: ApiKeys): string {
  switch (provider) {
    case 'anthropic': return apiKeys.anthropic;
    case 'openai': return apiKeys.openai;
    case 'gemini': return apiKeys.gemini;
    case 'custom': return apiKeys.customKey;
    default: return '';
  }
}

function bindEvents(settings: Settings, apiKeys: ApiKeys): void {
  let currentProvider: Provider = settings.provider;
  let currentStyle: StyleMode = settings.style;
  let currentLocalModel: LocalModel = settings.localModel;

  // Provider tabs
  document.getElementById('provider-tabs')!.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.tab');
    if (!btn?.dataset.provider) return;
    currentProvider = btn.dataset.provider as Provider;
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    btn.classList.add('active');
    showProviderPanel(currentProvider);
    const customFields = document.getElementById('custom-fields') as HTMLElement;
    customFields.hidden = currentProvider !== 'custom';
    const apiKeyInput = document.getElementById('api-key-input') as HTMLInputElement;
    apiKeyInput.value = getApiKeyForProvider(currentProvider, apiKeys);
  });

  // Model variant selector (E2B / E4B)
  document.getElementById('model-variant-cards')!.addEventListener('click', (e) => {
    const card = (e.target as HTMLElement).closest<HTMLElement>('.model-variant-card');
    if (!card?.dataset.model) return;
    currentLocalModel = card.dataset.model as LocalModel;
    document.querySelectorAll('.model-variant-card').forEach((c) => c.classList.remove('active'));
    card.classList.add('active');
    applyModelDownloadState(settings, currentLocalModel);
    setSettings({ localModel: currentLocalModel }).catch(console.error);
  });

  // Style cards
  document.getElementById('style-cards')!.addEventListener('click', (e) => {
    const card = (e.target as HTMLElement).closest<HTMLElement>('.style-card');
    if (!card?.dataset.style) return;
    currentStyle = card.dataset.style as StyleMode;
    document.querySelectorAll('.style-card').forEach((c) => c.classList.remove('active'));
    card.classList.add('active');
  });

  document.getElementById('reset-prompt-btn')!.addEventListener('click', () => {
    (document.getElementById('custom-prompt-input') as HTMLTextAreaElement).value = DEFAULT_PROMPT;
  });

  // Download model button
  document.getElementById('download-model-btn')!.addEventListener('click', () => {
    const btn = document.getElementById('download-model-btn') as HTMLButtonElement;
    const status = document.getElementById('download-status') as HTMLElement;
    btn.disabled = true;
    btn.textContent = 'Downloading…';
    status.textContent = 'This may take several minutes';
    status.style.color = '';
    chrome.runtime.sendMessage({ type: 'DOWNLOAD_MODEL' }, () => void chrome.runtime.lastError);
  });

  // Download progress
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'MODEL_DOWNLOAD_PROGRESS') {
      const status = document.getElementById('download-status') as HTMLElement;
      status.textContent = `${message.payload.progress}%`;
      return;
    }
    if (message.type === 'MODEL_LOAD_ERROR') {
      const btn = document.getElementById('download-model-btn') as HTMLButtonElement;
      const status = document.getElementById('download-status') as HTMLElement;
      btn.disabled = false;
      btn.textContent = `Download model (${MODEL_SIZES[currentLocalModel]})`;
      status.textContent = `Error: ${message.payload.error}`;
      status.style.color = '#ef4444';
    }
  });

  // Storage listener: model became ready
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;

    const e2bReady = changes.modelDownloaded?.newValue === true;
    const e4bReady = changes.e4bDownloaded?.newValue === true;

    if (e2bReady) settings.modelDownloaded = true;
    if (e4bReady) settings.e4bDownloaded = true;

    if ((e2bReady && currentLocalModel === 'e2b') || (e4bReady && currentLocalModel === 'e4b')) {
      applyModelDownloadState(settings, currentLocalModel);
    }
  });

  // Storage listener: model was deleted
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;

    if (changes.modelDownloaded?.newValue === false) {
      settings.modelDownloaded = false;
      if (currentLocalModel === 'e2b') applyModelDownloadState(settings, 'e2b');
    }
    if (changes.e4bDownloaded?.newValue === false) {
      settings.e4bDownloaded = false;
      if (currentLocalModel === 'e4b') applyModelDownloadState(settings, 'e4b');
    }
  });

  // Delete model
  document.getElementById('delete-model-btn')?.addEventListener('click', async () => {
    const label = MODEL_LABELS[currentLocalModel];
    if (!confirm(`Delete the cached ${label} model?`)) return;
    const cacheKeys = await caches.keys();
    await Promise.all(
      cacheKeys
        .filter((k) => k.includes('transformers') || k.includes('onnx'))
        .map((k) => caches.delete(k)),
    );
    const storageKey = currentLocalModel === 'e4b' ? 'e4bDownloaded' : 'modelDownloaded';
    await setSettings({ [storageKey]: false } as Partial<typeof settings>);
  });

  // Reset all
  document.getElementById('reset-all-btn')!.addEventListener('click', async () => {
    if (!confirm('Reset all settings to defaults?')) return;
    await setSettings({
      provider: 'auto', style: 'brief', customPrompt: null,
      preferBuiltinAI: true, localModel: 'e2b',
    });
    await setApiKeys({ anthropic: '', openai: '', gemini: '', customEndpoint: '', customKey: '' });
    location.reload();
  });

  // Save
  document.getElementById('save-btn')!.addEventListener('click', async () => {
    const customPromptInput = (document.getElementById('custom-prompt-input') as HTMLTextAreaElement).value.trim();
    const apiKeyInput = (document.getElementById('api-key-input') as HTMLInputElement).value.trim();
    const preferBuiltinAI = (document.getElementById('prefer-builtin-ai') as HTMLInputElement).checked;
    const customEndpoint = (document.getElementById('custom-endpoint-input') as HTMLInputElement).value.trim();

    await setSettings({
      provider: currentProvider,
      style: currentStyle,
      localModel: currentLocalModel,
      customPrompt: customPromptInput === DEFAULT_PROMPT ? null : customPromptInput || null,
      preferBuiltinAI,
    });

    if (currentProvider !== 'auto') {
      const keyUpdate: Partial<ApiKeys> = {};
      if (currentProvider === 'anthropic') keyUpdate.anthropic = apiKeyInput;
      else if (currentProvider === 'openai') keyUpdate.openai = apiKeyInput;
      else if (currentProvider === 'gemini') keyUpdate.gemini = apiKeyInput;
      else if (currentProvider === 'custom') {
        keyUpdate.customKey = apiKeyInput;
        keyUpdate.customEndpoint = customEndpoint;
      }
      await setApiKeys(keyUpdate);
      Object.assign(apiKeys, keyUpdate);
    }

    const saveBtn = document.getElementById('save-btn') as HTMLButtonElement;
    const originalText = saveBtn.textContent;
    saveBtn.textContent = 'Saved!';
    saveBtn.disabled = true;
    setTimeout(() => {
      saveBtn.textContent = originalText;
      saveBtn.disabled = false;
    }, 1500);
  });
}

init().catch(console.error);
