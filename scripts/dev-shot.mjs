// Dev helper: screenshot one route at phone and desktop widths, in light and dark, and report
// horizontal overflow and page errors. Run from the project folder with a dev server already up:
//   node scripts/dev-shot.mjs <port> <hash-or-empty> <out-prefix> [--portal]
// --portal signs in as the demo Owner first (sign-in is off for testing).
import { chromium } from '@playwright/test';

const [port, hash = '', out = 'shot', ...flags] = process.argv.slice(2);
const portal = flags.includes('--portal');
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium' });
const report = [];
for (const [w, h, tag] of [
  [390, 844, 'phone'],
  [1280, 900, 'desktop'],
]) {
  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && !/fonts\.g|favicon|ERR_CERT|net::/.test(m.text()) && errors.push(m.text()));
    if (portal) await page.addInitScript(() => localStorage.setItem('pl.actor', 'user-owner'));
    await page.goto(`http://localhost:${port}/${hash ? '#' + hash : ''}`);
    await page.waitForTimeout(900);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const file = `${out}-${tag}-${scheme}.png`;
    await page.screenshot({ path: file, fullPage: true });
    report.push({ file, overflowPx: overflow, errors });
    await ctx.close();
  }
}
await browser.close();
console.log(JSON.stringify(report, null, 2));
