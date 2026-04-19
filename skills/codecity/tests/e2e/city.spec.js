// city.spec.js — Playwright E2E tests for the CodeCity renderer.
//
// test-city.html is built by global-setup.js: it runs build.sh on the
// committed dist/city-template.html + the committed fixture manifest +
// defaults.json. So these tests exercise the exact HTML the skill ships.
// Any drift between src/ and dist/ is caught because a stale dist usually
// breaks rendering or crashes the bundle.

const { test, expect } = require('@playwright/test');
const path = require('path');

const testCityPath = path.resolve(__dirname, '.generated/test-city.html');

test.describe('CodeCity E2E', () => {
  test.beforeEach(async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto('file://' + testCityPath);

    // main.js runs on module load; wait for its side effects — the tree
    // sidebar gets populated and the canvas gets a non-zero backing store.
    await page.waitForFunction(() => {
      const c = document.getElementById('city');
      const tree = document.querySelector('#tree-sidebar .tree-title');
      return c && c.width > 0 && c.height > 0 && tree;
    }, null, { timeout: 10_000 });

    page._consoleErrors = errors;
  });

  test('no JS console errors', async ({ page }) => {
    await page.waitForTimeout(300);
    expect(page._consoleErrors).toEqual([]);
  });

  test('canvas element exists and has non-zero dimensions', async ({ page }) => {
    const canvas = page.locator('#city');
    await expect(canvas).toBeVisible();
    const box = await canvas.boundingBox();
    expect(box.width).toBeGreaterThan(0);
    expect(box.height).toBeGreaterThan(0);
  });

  test('manifest fixture has files to render as buildings', async ({ page }) => {
    const fileCount = await page.evaluate(() => {
      const m = JSON.parse(document.getElementById('codecity-manifest').textContent);
      const stack = [m.tree];
      let n = 0;
      while (stack.length) {
        const node = stack.pop();
        if (node.type === 'file') n++;
        if (node.children) stack.push(...node.children);
      }
      return n;
    });
    expect(fileCount).toBeGreaterThan(0);
  });

  test('clicking canvas triggers sidebar', async ({ page }) => {
    const canvas = page.locator('#city');
    const box = await canvas.boundingBox();
    await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } });
    await page.waitForTimeout(300);
    const sidebar = page.locator('#sidebar');
    await expect(sidebar).toBeAttached();
  });

  test('Escape key closes sidebar', async ({ page }) => {
    const canvas = page.locator('#city');
    await canvas.click();
    await page.waitForTimeout(200);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    const isOpen = await page.evaluate(() => {
      const sidebar = document.getElementById('sidebar');
      return sidebar ? sidebar.classList.contains('open') : false;
    });
    expect(isOpen).toBe(false);
  });

  test('tree sidebar is rendered with folder/file tree', async ({ page }) => {
    const treeSidebar = page.locator('#tree-sidebar');
    await expect(treeSidebar).toBeAttached();
    await expect(page.locator('.tree-title')).toBeVisible();
    expect(await page.locator('.tree-item').count()).toBeGreaterThan(0);
    expect(await page.locator('.tree-dir').count()).toBeGreaterThan(0);
    expect(await page.locator('.tree-file').count()).toBeGreaterThan(0);
  });

  test('tree sidebar directories are collapsible', async ({ page }) => {
    const firstDirToggle = page.locator('.tree-dir .tree-toggle').first();
    await expect(firstDirToggle).toBeVisible();
    await firstDirToggle.click();
    await page.waitForTimeout(200);
    const firstDir = page.locator('.tree-dir').first();
    expect(await firstDir.evaluate(el => el.classList.contains('tree-expanded'))).toBe(true);
    await firstDirToggle.click();
    await page.waitForTimeout(200);
    expect(await firstDir.evaluate(el => el.classList.contains('tree-collapsed'))).toBe(true);
  });
});
