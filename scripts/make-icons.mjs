// Renders the PNG app icons from the SVG sources (run once after changing public/icon*.svg).
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
for (const [src, size, out] of [
  ['public/icon.svg', 192, 'public/icon-192.png'],
  ['public/icon.svg', 512, 'public/icon-512.png'],
  ['public/icon-maskable.svg', 512, 'public/icon-maskable-512.png'],
  ['public/icon-maskable.svg', 180, 'public/apple-touch-icon.png'],
]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  const svg = readFileSync(src, 'utf8').replace('<svg ', `<svg width="${size}" height="${size}" `);
  await page.setContent(`<body style="margin:0;background:transparent">${svg}</body>`);
  await page.screenshot({ path: out, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  await page.close();
}
await browser.close();
