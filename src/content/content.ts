import { showPopup, updatePopup, destroyPopup } from './popup';
import type { ExtensionMessage } from '../types';

let lastImageRect: { top: number; right: number; bottom: number; left: number } = {
  top: 80,
  right: 280,
  bottom: 180,
  left: 20,
};

document.addEventListener('contextmenu', (e: MouseEvent) => {
  const target = e.target as HTMLElement;
  if (target.tagName === 'IMG') {
    const r = target.getBoundingClientRect();
    lastImageRect = { top: r.top, right: r.right, bottom: r.bottom, left: r.left };
  }
});

chrome.runtime.onMessage.addListener((message: ExtensionMessage) => {
  if (message.type !== 'SHOW_POPUP') return;

  const { result, error } = message.payload;

  if (!result && !error) {
    showPopup({ imageUrl: message.payload.imageUrl, anchorRect: lastImageRect });
  } else {
    updatePopup(result, error);
  }
});
