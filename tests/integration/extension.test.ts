import { test, expect, chromium } from '@playwright/test';
import path from 'path';

const HEADLESS = process.env.CI === 'true' || process.env.HEADLESS === 'true';

const EXTENSION_PATH = path.resolve(__dirname, '../../dist');

test.describe('Alt Text Generator extension', () => {
  test('options page loads and shows Auto provider selected', async () => {
    const context = await chromium.launchPersistentContext('', {
      headless: HEADLESS,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
      ],
    });
    try {
      const background = context.serviceWorkers()[0] ??
        await context.waitForEvent('serviceworker', { timeout: 10_000 });
      const extensionId = background.url().split('/')[2];

      const page = await context.newPage();
      await page.goto(`chrome-extension://${extensionId}/options.html`);

      // Auto tab should be active
      const activeTab = page.locator('.tab.active');
      await expect(activeTab).toHaveText('Auto');

      // Brief style card should be active
      const briefCard = page.locator('.style-card.active');
      await expect(briefCard).toContainText('Brief');
    } finally {
      await context.close();
    }
  });

  test('options page saves and reloads settings', async () => {
    const context = await chromium.launchPersistentContext('', {
      headless: HEADLESS,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
      ],
    });
    try {
      const background = context.serviceWorkers()[0] ??
        await context.waitForEvent('serviceworker', { timeout: 10_000 });
      const extensionId = background.url().split('/')[2];

      const page = await context.newPage();
      await page.goto(`chrome-extension://${extensionId}/options.html`);

      // Switch to Detailed style
      await page.locator('.style-card[data-style="detailed"]').click();
      await expect(page.locator('.style-card[data-style="detailed"]')).toHaveClass(/active/);

      // Save
      await page.locator('#save-btn').click();
      await expect(page.locator('#save-btn')).toBeDisabled();

      // Reload and verify persisted
      await page.reload();
      await expect(page.locator('.style-card[data-style="detailed"]')).toHaveClass(/active/);
    } finally {
      await context.close();
    }
  });
});
