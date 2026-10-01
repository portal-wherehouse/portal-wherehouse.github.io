// The scan-first layout: a short, grouped sidebar, every older screen still reachable by its link, and the
// shared scan flow that keeps the camera on from one scan to the next.

import { expect, test, type Page } from '@playwright/test';
import { encodeCode128 } from '../../src/device/code128';
import { portalReady, signInAs, typeCode, watchErrors } from './helpers';

/** The sidebar as text: each group's title and its items, then the items at the foot. */
async function sidebar(page: Page) {
  const side = page.locator('.sidebar');
  const groups: Record<string, string[]> = {};
  for (const g of await side.locator('.nav-group').all()) {
    const title = (await g.locator('summary').innerText()).trim();
    groups[title] = (await g.locator('.nav-item').allTextContents()).map((t) => t.trim());
  }
  const foot = (await side.locator('.nav-foot .nav-item').allTextContents()).map((t) => t.replace(/\d+$/, '').trim());
  return { groups, foot };
}

test('the owner sees Dashboard, three groups and Help, with Setup folded', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await signInAs(page, 'owner');
  await page.goto('/#overview');
  await portalReady(page);
  await expect(page.locator('.sidebar .dashboard-nav')).toContainText('Dashboard');
  expect(await sidebar(page)).toEqual({
    groups: {
      'Daily work': ['Receive', 'Put away and move', 'Ship', 'Find', 'Jobs'],
      Inventory: ['Stock', 'Counts', 'History'],
      Setup: ['Spots and labels', 'Products and barcodes', 'People', 'Scanners and printers', 'Import and export', 'Settings'],
    },
    foot: ['Help'],
  });
  const setup = page.locator('.sidebar details', { has: page.locator('summary', { hasText: 'Setup' }) });
  await expect(setup).not.toHaveAttribute('open', '');
  // The old menu names are gone from the sidebar.
  for (const old of ['Needs attention', 'Incoming', 'Scan station', 'Integrity lab', 'Guide', 'About', 'Labels', 'Export', 'Data and storage', 'Manager dashboard']) {
    await expect(page.locator('.sidebar').getByRole('button', { name: old, exact: true, includeHidden: true })).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test('an operator sees the daily work and inventory, with Settings and Help at the foot', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signInAs(page, 'operator');
  // Past the operator's simple home, to the full portal.
  await page.addInitScript(() => localStorage.setItem('pl.crewFull', '1'));
  await page.goto('/#find');
  await portalReady(page);
  const { groups, foot } = await sidebar(page);
  expect(Object.keys(groups)).toEqual(['Daily work', 'Inventory']);
  expect(groups['Daily work']).toEqual(expect.arrayContaining(['Receive', 'Put away and move', 'Find']));
  expect(groups.Inventory).toEqual(['Stock', 'Counts', 'History']);
  expect(foot).toEqual(['Settings', 'Help']);
});

test('older screens still open from their links, and mark the item that covers them', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signInAs(page, 'owner');
  const cases: [hash: string, h1: string | RegExp, item: string][] = [
    ['incoming', 'Incoming', 'Receive'],
    ['reconcile', 'Needs attention', 'Dashboard'],
    ['labels', 'Labels', 'Spots and labels'],
    ['export', 'Export', 'Import and export'],
    ['data', 'Data and storage', 'Settings'],
    ['station', 'Scan station', 'Counts'],
    ['guide', 'Guide', 'Help'],
    ['about', 'About', 'Help'],
    ['move?q=ship', 'Ship pallet', 'Ship'],
    ['move?q=stage', 'Stage pallet', 'Put away and move'],
  ];
  for (const [hash, h1, item] of cases) {
    await page.goto('about:blank');
    await page.goto(`/#${hash}`);
    await expect(page.locator('#main h1'), `#${hash}`).toHaveText(h1);
    await expect(page.locator('.sidebar [aria-current="page"]'), `#${hash}`).toHaveText(new RegExp(`^${item}`));
  }
  // The tabs on the covering screens lead back and forth.
  await page.goto('/#receive');
  await page.locator('.page-tabs').getByRole('button', { name: /Incoming/ }).click();
  await expect(page.locator('#main h1')).toHaveText('Incoming');
  await expect(page).toHaveURL(/#incoming$/);
});

/** A fake camera that shows one Code 128 label at a time; `window.__show(text)` changes it, '' shows nothing. */
async function fakeCamera(page: Page, labels: string[]) {
  const patterns = Object.fromEntries(labels.map((l) => [l, encodeCode128(l)]));
  await page.addInitScript((patterns) => {
    const w = window as unknown as { __show: (t: string) => void; __streams: MediaStream[]; __calls: number };
    let showing = '';
    w.__show = (t) => (showing = t);
    w.__streams = [];
    w.__calls = 0;
    Object.defineProperty(window, 'BarcodeDetector', { value: undefined, configurable: true });
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      value: async () => {
        w.__calls++;
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 480;
        const c = canvas.getContext('2d')!;
        const draw = () => {
          c.fillStyle = 'white';
          c.fillRect(0, 0, canvas.width, canvas.height);
          const p = patterns[showing];
          if (p) {
            c.fillStyle = 'black';
            let x = (canvas.width - p.modules * 3) / 2;
            for (let i = 0; i < p.widths.length; i++) {
              if (i % 2 === 0) c.fillRect(x, 140, p.widths[i] * 3, 200);
              x += p.widths[i] * 3;
            }
          }
        };
        draw();
        setInterval(draw, 50);
        const stream = canvas.captureStream(10);
        w.__streams.push(stream);
        return stream;
      },
    });
  }, patterns);
}

const show = (page: Page, text: string) => page.evaluate((t) => (window as unknown as { __show: (t: string) => void }).__show(t), text);

test('Move with the camera: scan the pallet, scan the spot, saved, and the camera stays on for the next one', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = watchErrors(page);
  await fakeCamera(page, ['P-000014', 'A-03-02']);
  await signInAs(page, 'operator');
  await page.goto('/#move');
  await portalReady(page);
  const prompt = page.locator('#move-flow-prompt');
  await expect(prompt).toHaveText('Scan the pallet');
  await page.getByTestId('move-flow-camera-start').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __streams: MediaStream[] }).__streams.length)).toBe(1);

  await show(page, 'P-000014');
  await expect(prompt).toHaveText('Now scan the spot');
  await show(page, 'A-03-02');
  await expect(prompt).toHaveText('Scan A-03-02 again to save');
  // Look away, then scan the spot again to save: no tap needed.
  await show(page, '');
  await page.waitForTimeout(2700);
  await show(page, 'A-03-02');
  await expect(prompt).toHaveText('Saved. Scan the next pallet');
  await expect(page.getByTestId('move-flow-flash')).toHaveText('P-000014 is on A-03-02. Saved.');
  await expect(page.locator('.big-result')).toContainText('Moved to A-03-02');

  // The same camera stream is still running, and was never asked for twice.
  const cam = await page.evaluate(() => {
    const w = window as unknown as { __streams: MediaStream[]; __calls: number };
    return { calls: w.__calls, state: w.__streams[0].getVideoTracks()[0].readyState };
  });
  expect(cam).toEqual({ calls: 1, state: 'live' });
  await expect(page.getByTestId('move-flow-camera').locator('video')).toBeVisible();
  expect(errors).toEqual([]);
});

test('Move with a scanner: two scans and a rescan save it, and a wrong scan does not advance', async ({ page }) => {
  await signInAs(page, 'operator');
  await page.goto('/#move');
  await portalReady(page);
  const prompt = page.locator('#move-flow-prompt');
  await typeCode(page, 'A-03-02');
  await expect(page.getByTestId('move-flow-flash')).toHaveClass(/is-error/);
  await expect(prompt).toHaveText('Scan the pallet');
  await typeCode(page, 'P-000014');
  await expect(prompt).toHaveText('Now scan the spot');
  await typeCode(page, 'A-03-02');
  await expect(prompt).toHaveText('Scan A-03-02 again to save');
  // A second read within a moment is the same scan read twice, so a real rescan comes a little later.
  await page.waitForTimeout(700);
  await typeCode(page, 'A-03-02');
  await expect(prompt).toHaveText('Saved. Scan the next pallet');
  // Ready for the next pallet straight away.
  await typeCode(page, 'P-000016');
  await expect(prompt).toHaveText('Now scan the spot');
});

test('on a phone, the Dashboard and Move mid-flow do not scroll sideways', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAs(page, 'owner');
  await page.goto('/#overview');
  await expect(page.locator('#main h1')).toHaveText('Dashboard');
  const tabs = page.locator('.bottom-nav');
  await expect(tabs.getByRole('button')).toHaveText(['Dashboard', 'Receive', 'Move', 'Find', 'More']);
  const over = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(await over()).toBeLessThanOrEqual(0);
  await page.goto('/#move');
  await typeCode(page, 'P-000014');
  await expect(page.locator('#move-flow-prompt')).toHaveText('Now scan the spot');
  expect(await over()).toBeLessThanOrEqual(0);
});
