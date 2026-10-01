// The Dashboard is always ready for a scanner: a Ready to scan light, scanner status, the last scan's result, a
// camera button, and a status dot in the top bar. Scans there open what was scanned (through Scan anywhere).

import { expect, test, type Page } from '@playwright/test';
import { encodeCode128 } from '../../src/device/code128';
import { portalReady, signInAs, watchErrors, wedgeScan } from './helpers';

const panel = (page: Page) => page.getByTestId('scan-ready');

test('the Dashboard says Ready to scan, with a green dot in the top bar that opens Scanners', async ({ page }) => {
  const errors = watchErrors(page);
  await signInAs(page, 'owner');
  await page.goto('/#overview');
  await portalReady(page);
  await expect(panel(page).getByRole('heading', { name: 'Ready to scan' })).toBeVisible();
  await expect(panel(page)).toHaveClass(/is-ready/);
  await expect(page.getByTestId('scan-ready-scanner')).toContainText('No scanner seen yet. Scan any label to check.');
  await expect(page.getByTestId('dashboard-camera-start')).toBeVisible();
  // Nothing on the Dashboard takes the keyboard from the scanner: only the hidden scanner input has focus.
  await expect(page.getByTestId('scan-catcher')).toBeFocused();

  const chip = page.getByTestId('scan-chip');
  await expect(chip).toHaveAccessibleName('Ready to scan. Open Scanners');
  await expect(chip).toHaveClass(/is-ready/);

  // A window over the page pauses scanning, and both the panel and the dot say so.
  await page.getByRole('button', { name: /^Account:/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(panel(page).getByRole('heading', { name: 'Scanning paused' })).toBeAttached();
  await expect(panel(page)).toContainText('Paused while a window is open');
  await expect(chip).toHaveAccessibleName('Scanning paused. Open Scanners');
  await page.keyboard.press('Escape');
  await expect(panel(page).getByRole('heading', { name: 'Ready to scan' })).toBeVisible();

  await chip.click();
  await expect(page.locator('#main h1')).toHaveText('Scanners');
  await expect(page.getByTestId('scan-chip')).toBeVisible();
  expect(errors).toEqual([]);
});

test('a scanner scan on the Dashboard opens the pallet, and the panel shows the result', async ({ page }) => {
  await signInAs(page, 'owner');
  await page.goto('/#overview');
  await portalReady(page);
  await wedgeScan(page, 'P-000016');
  await expect(page.locator('#main .page-head')).toContainText('P-000016');

  await page.getByRole('navigation', { name: 'Main' }).first().getByRole('button', { name: 'Dashboard', exact: true }).click();
  await expect(page.getByTestId('scan-ready-last')).toContainText('P-000016');
  await expect(page.getByTestId('scan-ready-last')).toContainText('Opened pallet P-000016.');
  await expect(page.getByTestId('scan-ready-scanner')).toContainText('Scanner connected');

  // A code that matches nothing stays on the Dashboard and says so, with the code.
  await wedgeScan(page, 'ZZ-NOPE-42');
  await expect(page.getByTestId('scan-ready-last')).toContainText('ZZ-NOPE-42');
  await expect(page.getByTestId('scan-ready-last')).toContainText('Not on record in this warehouse');
  await expect(page.locator('#main h1')).toHaveText('Dashboard');

  // A rack label shows what is there.
  await wedgeScan(page, 'A-03-01');
  await expect(page.locator('#main h1')).toContainText('A-03-01');
});

test('the Dashboard listens even with Scan anywhere off, and reads a phone scanner that types into the hidden input', async ({ page }) => {
  await signInAs(page, 'operator');
  await page.addInitScript(() => localStorage.setItem('wh.scanner', JSON.stringify({ scanAnywhere: false })));
  await page.goto('/#overview');
  await expect(page.getByTestId('crew-home')).toBeVisible();
  await expect(panel(page).getByRole('heading', { name: 'Ready to scan' })).toBeVisible();
  const catcher = page.getByTestId('scan-catcher');
  await expect(catcher).toBeFocused();
  // An Android keyboard service (DataWedge keystroke output) puts the whole code in at once, with no Enter.
  await catcher.evaluate((el: HTMLInputElement) => {
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Unidentified', keyCode: 229, bubbles: true }));
    el.value = 'P-000017';
    el.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: 'P-000017', bubbles: true }));
  });
  await expect(page.locator('#main .page-head')).toContainText('P-000017');
});

test('Scan with camera starts an inline camera on the Dashboard, and a camera scan opens the pallet', async ({ page }) => {
  await signInAs(page, 'operator');
  await page.addInitScript(({ widths, modules }) => {
    Object.defineProperty(window, 'BarcodeDetector', { value: undefined, configurable: true });
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      value: async () => {
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 480;
        const context = canvas.getContext('2d')!;
        context.fillStyle = 'white';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = 'black';
        let x = (canvas.width - modules * 3) / 2;
        for (let i = 0; i < widths.length; i++) {
          if (i % 2 === 0) context.fillRect(x, 140, widths[i] * 3, 200);
          x += widths[i] * 3;
        }
        return canvas.captureStream(10);
      },
    });
  }, encodeCode128('P-000016'));
  await page.goto('/#overview');
  const start = page.getByTestId('dashboard-camera-start');
  await expect(start).toBeVisible();
  await start.click();
  await expect(page.locator('#main .page-head')).toContainText('P-000016');
  await page.getByRole('navigation', { name: 'Main' }).first().getByRole('button', { name: 'Dashboard', exact: true }).click();
  await expect(page.getByTestId('scan-ready-last')).toContainText('Camera');
  await expect(page.getByTestId('scan-ready-last')).toContainText('Opened pallet P-000016.');
});

test('on a phone, the Dashboard and its scan panel fit without scrolling sideways', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const role of ['owner', 'operator'] as const) {
    await page.context().clearCookies();
    await signInAs(page, role);
    await page.goto('about:blank');
    await page.goto('/#overview');
    await expect(panel(page).getByRole('heading', { name: 'Ready to scan' })).toBeVisible();
    await expect(page.getByTestId('scan-chip')).toBeVisible();
    await expect(page.getByTestId('dashboard-camera-start')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  }
});
