import { test, expect } from '@playwright/test';
import { portalReady, signInAs } from './helpers';
import { encodeCode128 } from '../../src/device/code128';

test('the Scan station leads with the camera, and a camera scan works like a scanner scan', async ({ page }) => {
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
  await page.goto('/#station');
  await portalReady(page);
  const start = page.getByTestId('station-camera-start');
  await expect(start).toBeVisible();
  // The camera comes before the mode buttons.
  const camTop = (await start.boundingBox())!.y;
  const modesTop = (await page.locator('.st-modes').boundingBox())!.y;
  expect(camTop).toBeLessThan(modesTop);
  await start.click();
  const hit = page.getByRole('region', { name: 'Session log' }).locator('.st-log-item').first();
  await expect(hit).toContainText('P-000016');
  await expect(hit).toContainText('Camera');
  await page.getByRole('button', { name: 'Stop camera' }).click();
  await expect(start).toBeVisible();
});
