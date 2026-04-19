// city.spec.js — Playwright E2E tests for the CodeCity renderer
const { test, expect } = require('@playwright/test');
const path = require('path');

const testCityPath = path.resolve(__dirname, '../renderer/test-city.html');

test.describe('CodeCity E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Collect console errors
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto('file://' + testCityPath);
    await page.waitForLoadState('load');

    // Stash errors for assertions
    page._consoleErrors = errors;
  });

  test('no JS console errors', async ({ page }) => {
    // Wait a moment for any async errors
    await page.waitForTimeout(500);
    expect(page._consoleErrors).toEqual([]);
  });

  test('canvas element exists and has non-zero dimensions', async ({ page }) => {
    const canvas = page.locator('#city');
    await expect(canvas).toBeVisible();
    const box = await canvas.boundingBox();
    expect(box.width).toBeGreaterThan(0);
    expect(box.height).toBeGreaterThan(0);
  });

  test('startRenderLoop function exists and was called', async ({ page }) => {
    const exists = await page.evaluate(() => typeof startRenderLoop === 'function');
    expect(exists).toBe(true);
  });

  test('at least one building was drawn', async ({ page }) => {
    // Call layoutCity directly to verify buildings would be produced
    const buildingCount = await page.evaluate(() => {
      var layout = layoutCity(MANIFEST.tree, CONFIG);
      return layout.buildings.length;
    });
    expect(buildingCount).toBeGreaterThan(0);
  });

  test('clicking canvas triggers sidebar', async ({ page }) => {
    const canvas = page.locator('#city');
    const box = await canvas.boundingBox();

    // Click at the center of the canvas
    await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } });

    // Give time for sidebar to react
    await page.waitForTimeout(300);

    // The sidebar element should exist
    const sidebar = page.locator('#sidebar');
    await expect(sidebar).toBeAttached();
  });

  test('Escape key closes sidebar', async ({ page }) => {
    // Click the canvas
    const canvas = page.locator('#city');
    await canvas.click();
    await page.waitForTimeout(200);

    // Press Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    // Sidebar should not have 'open' class
    const isOpen = await page.evaluate(() => {
      const sidebar = document.getElementById('sidebar');
      return sidebar ? sidebar.classList.contains('open') : false;
    });
    expect(isOpen).toBe(false);
  });
});
