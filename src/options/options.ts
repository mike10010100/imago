import { getSettings, setSettings, getApiKeys, setApiKeys } from '../storage';
import { DEFAULT_PROMPT } from '../prompt';
import type { Provider, StyleMode, Settings, ApiKeys } from '../types';

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

  const deleteRow = document.getElementById('model-delete-row') as HTMLElement;
  deleteRow.hidden = !settings.modelDownloaded;

  const downloadRow = document.getElementById('model-download-row') as HTMLElement;
  downloadRow.hidden = settings.modelDownloaded;

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

  const settings = await getSettings();
  const gemmaDot = document.getElementById('gemma-dot') as HTMLElement;
  const gemmaBadge = document.getElementById('gemma-badge') as HTMLElement;
  if (settings.modelDownloaded) {
    gemmaDot.classList.add('active');
    gemmaBadge.textContent = 'Ready';
    gemmaBadge.className = 'badge';
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

  document.getElementById('download-model-btn')!.addEventListener('click', () => {
    const btn = document.getElementById('download-model-btn') as HTMLButtonElement;
    const status = document.getElementById('download-status') as HTMLElement;
    btn.disabled = true;
    btn.textContent = 'Downloading…';
    status.textContent = 'This may take several minutes';
    chrome.runtime.sendMessage({ type: 'DOWNLOAD_MODEL' }, () => void chrome.runtime.lastError);
  });

  // Update download progress badge while model is downloading
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type !== 'MODEL_DOWNLOAD_PROGRESS') return;
    const status = document.getElementById('download-status') as HTMLElement;
    status.textContent = `${message.payload.progress}%`;
  });

  // When modelDownloaded flips to true, update the Gemma row and swap buttons
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync' || !changes.modelDownloaded?.newValue) return;
    const downloadRow = document.getElementById('model-download-row') as HTMLElement;
    downloadRow.hidden = true;
    const deleteRow = document.getElementById('model-delete-row') as HTMLElement;
    deleteRow.hidden = false;
    const gemmaDot = document.getElementById('gemma-dot') as HTMLElement;
    gemmaDot.classList.add('active');
    const gemmaBadge = document.getElementById('gemma-badge') as HTMLElement;
    gemmaBadge.textContent = 'Ready';
    gemmaBadge.className = 'badge';
  });

  // Also show download button again if model is deleted while options page is open
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync' || changes.modelDownloaded?.newValue !== false) return;
    const downloadRow = document.getElementById('model-download-row') as HTMLElement;
    downloadRow.hidden = false;
    const btn = document.getElementById('download-model-btn') as HTMLButtonElement;
    btn.disabled = false;
    btn.textContent = 'Download model (~2 GB)';
    (document.getElementById('download-status') as HTMLElement).textContent = '';
  });

  document.getElementById('delete-model-btn')?.addEventListener('click', async () => {
    if (!confirm('Delete the cached Gemma 4 E2B model (~2 GB)?')) return;
    const cacheKeys = await caches.keys();
    await Promise.all(
      cacheKeys
        .filter((k) => k.includes('transformers') || k.includes('onnx'))
        .map((k) => caches.delete(k)),
    );
    await setSettings({ modelDownloaded: false });
    const deleteRow = document.getElementById('model-delete-row') as HTMLElement;
    deleteRow.hidden = true;
    const gemmaBadge = document.getElementById('gemma-badge') as HTMLElement;
    gemmaBadge.textContent = 'Not downloaded';
    gemmaBadge.className = 'badge badge-blue';
    const gemmaDot = document.getElementById('gemma-dot') as HTMLElement;
    gemmaDot.className = 'dot';
  });

  document.getElementById('reset-all-btn')!.addEventListener('click', async () => {
    if (!confirm('Reset all settings to defaults?')) return;
    await setSettings({
      provider: 'auto', style: 'brief', customPrompt: null,
      preferBuiltinAI: true,
    });
    await setApiKeys({ anthropic: '', openai: '', gemini: '', customEndpoint: '', customKey: '' });
    location.reload();
  });

  document.getElementById('save-btn')!.addEventListener('click', async () => {
    const customPromptInput = (document.getElementById('custom-prompt-input') as HTMLTextAreaElement).value.trim();
    const apiKeyInput = (document.getElementById('api-key-input') as HTMLInputElement).value.trim();
    const preferBuiltinAI = (document.getElementById('prefer-builtin-ai') as HTMLInputElement).checked;
    const customEndpoint = (document.getElementById('custom-endpoint-input') as HTMLInputElement).value.trim();

    await setSettings({
      provider: currentProvider,
      style: currentStyle,
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
