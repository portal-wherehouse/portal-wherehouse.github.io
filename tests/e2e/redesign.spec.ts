// The scan-first layout: a short, grouped sidebar, every older screen still reachable by its link, and the
// shared scan flow that keeps the camera on from one scan to the next.

import { expect, test, type Page } from '@playwright/test';
import { fakeCamera, portalReady, show, signInAs, typeCode, watchErrors } from './helpers';

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

test('the owner sees Dashboard, the daily groups, and one Settings and setup item above Help', async ({ page }) => {
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
    },
    foot: ['Settings and setup', 'Help'],
  });
  // The setup tools live on one page, opened from a single menu item.
  await page.locator('.sidebar').getByRole('button', { name: 'Settings and setup' }).click();
  const hub = page.getByTestId('setup-hub');
  for (const tool of ['Spots and labels', 'Products and barcodes', 'People', 'Scanners and printers', 'Import and export', 'Settings']) await expect(hub.getByRole('button', { name: new RegExp(`^${tool}`) })).toBeVisible();
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
    ['labels', 'Labels', 'Settings and setup'],
    ['export', 'Export', 'Settings and setup'],
    ['data', 'Data and storage', 'Settings and setup'],
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

test('Move with the camera: scan the pallet, scan the spot, saved at once, and the camera stays on for the next one', async ({ page }) => {
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
  // One scan of the spot saves: no rescan, no tap.
  const started = Date.now();
  await show(page, 'A-03-02');
  await expect(prompt).toHaveText('Saved. Scan the next pallet');
  expect(Date.now() - started).toBeLessThan(2000);
  await expect(page.getByTestId('move-flow-flash')).toHaveText('P-000014 is on A-03-02. Saved.');
  await expect(page.locator('.big-result')).toContainText('Moved to A-03-02');

  // The same camera stream is still running, and was never asked for twice.
  const cam = await page.evaluate(() => {
    const w = window as unknown as { __streams: MediaStream[]; __calls: number };
    return { calls: w.__calls, state: w.__streams[0].getVideoTracks()[0].readyState };
  });
  expect(cam).toEqual({ calls: 1, state: 'live' });
  await expect(page.getByTestId('move-flow-camera').locator('video')).toBeVisible();
  // The spot still in view after the save is the same scan, not a wrong one.
  await page.waitForTimeout(2700);
  await expect(page.getByTestId('move-flow-flash')).not.toHaveClass(/is-error/);
  expect(errors).toEqual([]);
});

test('Move with a scanner: two scans save it, and a wrong scan does not advance', async ({ page }) => {
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
  await expect(prompt).toHaveText('Saved. Scan the next pallet');
  // Ready for the next pallet straight away.
  await typeCode(page, 'P-000016');
  await expect(prompt).toHaveText('Now scan the spot');
});

test('Move asks for a second scan only when the move is unusual', async ({ page }) => {
  await signInAs(page, 'operator');
  await page.goto('/#move');
  await portalReady(page);
  const prompt = page.locator('#move-flow-prompt');
  await typeCode(page, 'P-000014');
  await expect(prompt).toHaveText('Now scan the spot');
  await typeCode(page, 'A-03-02');
  await expect(prompt).toHaveText('Saved. Scan the next pallet');
  // The same pallet onto the spot it is already on: confirm it is still there.
  await page.waitForTimeout(700);
  await typeCode(page, 'P-000014');
  await expect(prompt).toHaveText('Now scan the spot');
  await typeCode(page, 'A-03-02');
  await expect(prompt).toHaveText('Scan A-03-02 again to confirm');
  await expect(page.getByTestId('move-flow-flash')).toContainText('already recorded at A-03-02');
  await page.waitForTimeout(700);
  await typeCode(page, 'A-03-02');
  await expect(prompt).toHaveText('Saved. Scan the next pallet');
  await expect(page.locator('.big-result')).toContainText('Confirmed at A-03-02');
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
