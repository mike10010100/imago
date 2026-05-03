import { test, expect, chromium } from '@playwright/test';
import path from 'path';

const EXTENSION_PATH = path.resolve(process.cwd(), 'dist');

test.describe('Alt Text Generator extension', () => {
  test('options page loads and shows Auto provider selected', async () => {
    const context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
      ],
    });

    // Get the extension ID from the background page
    let [background] = context.serviceWorkers();
    if (!background) background = await context.waitForEvent('serviceworker');
    const extensionId = background.url().split('/')[2];

    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html`);

    // Auto tab should be active
    const activeTab = page.locator('.tab.active');
    await expect(activeTab).toHaveText('Auto');

    // Brief style card should be active
    const briefCard = page.locator('.style-card.active');
    await expect(briefCard).toContainText('Brief');

    await context.close();
  });

  test('options page saves and reloads settings', async () => {
    const context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
      ],
    });

    let [background] = context.serviceWorkers();
    if (!background) background = await context.waitForEvent('serviceworker');
    const extensionId = background.url().split('/')[2];

    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html`);

    // Switch to Detailed style
    await page.locator('.style-card[data-style="detailed"]').click();
    await expect(page.locator('.style-card[data-style="detailed"]')).toHaveClass(/active/);

    // Save
    await page.locator('#save-btn').click();
    await expect(page.locator('#save-btn')).toHaveText('Saved!');

    // Reload and verify persisted
    await page.reload();
    await expect(page.locator('.style-card[data-style="detailed"]')).toHaveClass(/active/);

    await context.close();
  });
});
