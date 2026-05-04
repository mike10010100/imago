import type { InferenceResult, StyleMode } from '../types';

interface PopupOptions {
  result?: InferenceResult;
  error?: string;
  imageUrl?: string;
  anchorRect: { top: number; right: number; bottom: number; left: number };
}

const SOURCE_LABELS: Record<string, string> = {
  'chrome-ai': 'Chrome AI · local',
  'gemma-4-e2b': 'Gemma 4 E2B · local',
  anthropic: 'Claude · cloud',
  openai: 'GPT-4o · cloud',
  gemini: 'Gemini · cloud',
  custom: 'Custom · cloud',
};

const POPUP_CSS = `
  :host { all: initial; font-family: system-ui, -apple-system, sans-serif; }
  .popup {
    position: fixed; z-index: 2147483647;
    background: #1e293b; border: 1px solid #334155;
    border-radius: 10px; padding: 12px 14px;
    box-shadow: 0 8px 24px rgba(0,0,0,.5); width: 264px;
    font-size: 13px; color: #e2e8f0; box-sizing: border-box;
  }
  .toggle { display: flex; gap: 6px; margin-bottom: 8px; }
  .toggle button {
    background: #334155; color: #94a3b8; border: none;
    border-radius: 4px; padding: 3px 10px; font-size: 11px; cursor: pointer;
  }
  .toggle button.active { background: #7c3aed; color: white; }
  .alt-text { font-size: 12px; line-height: 1.5; margin: 0 0 10px; }
  .footer { display: flex; align-items: center; justify-content: space-between; }
  .source { color: #475569; font-size: 10px; }
  .copy-btn {
    background: #334155; color: #e2e8f0; border: none;
    border-radius: 4px; padding: 4px 10px; font-size: 11px; cursor: pointer;
  }
  .copy-btn.copied { background: #166534; color: #86efac; }
  .error { color: #f87171; font-size: 12px; line-height: 1.4; }
  .loading { display: flex; align-items: center; gap: 8px; }
  .spinner {
    width: 8px; height: 8px; background: #7c3aed;
    border-radius: 50%; animation: pulse 1s ease-in-out infinite;
    flex-shrink: 0;
  }
  .loading-text { color: #94a3b8; font-size: 11px; }
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: .25; } }
`;

let host: HTMLElement | null = null;
let shadow: ShadowRoot | null = null;
let escapeHandler: ((e: KeyboardEvent) => void) | null = null;
let currentImageUrl: string = '';
let currentStyle: StyleMode = 'brief';

export function showPopup(options: PopupOptions): void {
  currentImageUrl = options.imageUrl ?? '';
  destroyPopup();

  host = document.createElement('div');
  shadow = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = POPUP_CSS;
  shadow.appendChild(style);

  const popup = document.createElement('div');
  popup.className = 'popup';
  placePopup(popup, options.anchorRect);
  shadow.appendChild(popup);

  document.body.appendChild(host);

  if (options.error) {
    renderError(popup, options.error);
  } else if (!options.result) {
    renderLoading(popup);
  } else {
    renderResult(popup, options.result);
  }

  setTimeout(() => document.addEventListener('click', handleOutsideClick, { once: true }), 0);
  escapeHandler = (e: KeyboardEvent) => { if (e.key === 'Escape') destroyPopup(); };
  document.addEventListener('keydown', escapeHandler);
}

export function updatePopup(result?: InferenceResult, error?: string): void {
  if (!host) return;
  if (!shadow) return;
  const popup = shadow.querySelector('.popup') as HTMLElement | null;
  if (!popup) return;

  const toggle = popup.querySelector('.toggle');
  popup.innerHTML = '';
  if (toggle) popup.appendChild(toggle);

  if (error) {
    renderError(popup, error);
  } else if (result) {
    renderResult(popup, result);
  }
}

export function destroyPopup(): void {
  host?.remove();
  host = null;
  shadow = null;
  document.removeEventListener('click', handleOutsideClick);
  if (escapeHandler) {
    document.removeEventListener('keydown', escapeHandler);
    escapeHandler = null;
  }
}

function handleOutsideClick(e: MouseEvent): void {
  if (host && e.composedPath().includes(host)) return;
  destroyPopup();
}

function renderLoading(popup: HTMLElement): void {
  const div = document.createElement('div');
  div.className = 'loading';
  div.innerHTML = '<div class="spinner"></div><span class="loading-text">Generating alt text…</span>';
  popup.appendChild(div);
}

function renderError(popup: HTMLElement, message: string): void {
  const p = document.createElement('p');
  p.className = 'error';
  p.textContent = message;
  popup.appendChild(p);
}

function renderResult(popup: HTMLElement, result: InferenceResult): void {
  const toggle = popup.querySelector('.toggle') ?? (() => {
    const t = document.createElement('div');
    t.className = 'toggle';
    popup.insertBefore(t, popup.firstChild);
    return t;
  })();
  toggle.innerHTML = `
    <button ${currentStyle === 'brief' ? 'class="active"' : ''} data-style="brief">Brief</button>
    <button ${currentStyle === 'detailed' ? 'class="active"' : ''} data-style="detailed">Detailed</button>
  `;
  (toggle as HTMLElement).onclick = (e) => {
    const btn = (e.target as HTMLElement).closest('button');
    if (!btn) return;
    const newStyle = btn.dataset.style as StyleMode;
    toggle.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    currentStyle = newStyle;
    requestRegenerate(newStyle, result);
  };

  const p = document.createElement('p');
  p.className = 'alt-text';
  p.textContent = result.altText;
  popup.appendChild(p);

  const footer = document.createElement('div');
  footer.className = 'footer';

  const source = document.createElement('span');
  source.className = 'source';
  source.textContent = SOURCE_LABELS[result.source] ?? result.source;

  const copyBtn = document.createElement('button');
  copyBtn.className = 'copy-btn';
  copyBtn.textContent = 'Copy';
  copyBtn.onclick = () => {
    navigator.clipboard.writeText(result.altText).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = result.altText;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    });
    copyBtn.textContent = 'Copied!';
    copyBtn.classList.add('copied');
    setTimeout(() => {
      copyBtn.textContent = 'Copy';
      copyBtn.classList.remove('copied');
    }, 1500);
  };

  footer.appendChild(source);
  footer.appendChild(copyBtn);
  popup.appendChild(footer);
}

function requestRegenerate(style: StyleMode, _previousResult: InferenceResult): void {
  if (!host) return;
  if (!shadow) return;
  const popup = shadow.querySelector('.popup') as HTMLElement;

  const p = popup.querySelector('.alt-text');
  const footer = popup.querySelector('.footer');
  if (p) p.textContent = 'Regenerating…';
  if (footer) (footer as HTMLElement).style.opacity = '0.4';

  chrome.runtime.sendMessage(
    { type: 'REGENERATE', payload: { imageUrl: currentImageUrl, style } },
    (response: { result?: InferenceResult; error?: string }) => {
      if (response?.result) {
        updatePopup(response.result);
      } else {
        updatePopup(undefined, response?.error ?? 'Regeneration failed');
      }
    },
  );
}

function placePopup(
  popup: HTMLElement,
  rect: { top: number; right: number; bottom: number; left: number },
): void {
  const POPUP_H = 120;
  const POPUP_W = 276;
  const GAP = 8;

  const belowFits = rect.bottom + GAP + POPUP_H <= window.innerHeight;
  const top = belowFits
    ? rect.bottom + GAP
    : Math.max(rect.top - POPUP_H - GAP, GAP);

  const left = Math.min(Math.max(rect.left, GAP), window.innerWidth - POPUP_W - GAP);

  popup.style.top = `${top}px`;
  popup.style.left = `${left}px`;
}
