// Orders and picking in the sample warehouse: a whole batch from the first pick to the handoff, with the camera
// kept on throughout, the same with a keyboard-wedge scanner, the exceptions (wrong item, short, substitute), and
// a phone-width check that nothing scrolls sideways.

import { expect, test, type Page } from '@playwright/test';
import { fakeCamera, portalReady, show, signInAs, typeCode, watchErrors, wedgeScan } from './helpers';

const prompt = (page: Page) => page.locator('#orders-flow-prompt');
const flash = (page: Page) => page.getByTestId('orders-flow-flash');
const over = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
/** The first sample label offered for this step (the next item, tote, package or spot to scan). */
const nextLabel = async (page: Page) => ((await page.locator('.flow-demo .demo-label').first().innerText()).split('\n')[0] ?? '').trim();
const tab = (page: Page, name: RegExp) => page.locator('.orders-tabs').getByRole('button', { name }).click();

const UNITS = Array.from({ length: 15 }, (_, i) => `P-000${201 + i}`);
const LABELS = [...UNITS, 'T-01', 'T-02', 'T-03', 'T-04', 'K-000001', 'K-000002', 'STAGING-01', 'A-02-01', 'O-000001'];

test('pick a batch, pack, stage and hand off with the camera, which stays on throughout, on a phone', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await fakeCamera(page, LABELS);
  await page.addInitScript(() => (window.print = () => undefined));
  await signInAs(page, 'operator');
  await page.goto('/?demo=1#orders?q=pick');
  await expect(prompt(page)).toHaveText('Start picking');
  expect(await over(page)).toBeLessThanOrEqual(0);
  await page.getByTestId('orders-flow-camera-start').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __streams: MediaStream[] }).__streams.length)).toBe(1);

  // Shown, read, then taken away: a label left in view would be read again after the camera's repeat window.
  const scan = async (text: string, expected: string | RegExp) => {
    await show(page, text);
    await expect(prompt(page)).toHaveText(expected);
    await show(page, '');
  };

  await page.getByTestId('start-batch').click();
  await expect(prompt(page)).toHaveText('Scan a tote for A');
  expect(await over(page)).toBeLessThanOrEqual(0);
  await scan('T-01', 'Scan a tote for B');
  await scan('T-02', 'Scan a tote for C');
  await scan('T-03', 'Scan a tote for D');
  await scan('T-04', /^Scan the item/);
  // The stop: its spot in the largest text, how many, and the tote in its color.
  await expect(page.getByTestId('pick-spot')).toHaveText('A-02-01');
  await expect(page.getByTestId('pick-take')).toHaveText('Take 2');
  await expect(page.getByTestId('pick-stop')).toContainText('Put in');
  await expect(page.getByTestId('pick-next')).toContainText('Next:');
  expect(await over(page)).toBeLessThanOrEqual(0);

  // Every stop: scan the item, then its tote. No taps.
  for (let i = 0; i < 20 && (await page.getByTestId('pick-spot').count()); i++) {
    const unit = await nextLabel(page);
    expect(unit).toMatch(/^P-/);
    await scan(unit, /^Put it in tote [A-D]$/);
    expect(await over(page)).toBeLessThanOrEqual(0);
    const tote = await nextLabel(page);
    await show(page, tote);
    await expect(flash(page)).toContainText(new RegExp(`${unit} is in tote|B-0001 done`));
    await show(page, '');
  }
  await expect(flash(page)).toContainText('B-0001 done. 4 orders ready to pack.');

  // Pack Lakeside Dental's tote: scan the tote, each item, then choose the box.
  await tab(page, /^Pack/);
  await scan('T-02', 'Scan each item (0 of 3)');
  for (let n = 1; n <= 3; n++) await scan(await nextLabel(page), n === 3 ? 'Choose the box' : `Scan each item (${n} of 3)`);
  expect(await over(page)).toBeLessThanOrEqual(0);
  await page.locator('.box-buttons').getByRole('button', { name: 'Medium box' }).click();
  await expect(page.getByTestId('packed-package')).toContainText('K-000001');
  await page.getByRole('button', { name: 'Print 4x6 label' }).click();
  await expect(page.locator('#print-root').getByTestId('package-label')).toContainText('Lakeside Dental');
  await expect(page.locator('#print-root').getByTestId('package-label')).toContainText('Package 1 of 1');

  // Stage: the package, then a staging spot. One scan of the spot saves.
  await tab(page, /^Stage/);
  await scan('K-000001', 'Now scan a staging spot');
  await scan('STAGING-01', 'Scan a package');
  await expect(flash(page)).toHaveText('K-000001 is on STAGING-01. Saved.');
  expect(await over(page)).toBeLessThanOrEqual(0);

  // Hand off: every package, then who took it.
  await tab(page, /^Hand off/);
  await scan('K-000001', 'Confirm the handoff');
  await page.getByLabel('Carrier').fill('UPS');
  await page.getByTestId('confirm-handoff').click();
  await expect(flash(page)).toContainText('O-000001 handed off. 3 items recorded as gone.');

  // One camera session from the first tote to the handoff: never stopped, never asked for twice.
  const cam = await page.evaluate(() => {
    const w = window as unknown as { __streams: MediaStream[]; __calls: number };
    return { calls: w.__calls, state: w.__streams[0].getVideoTracks()[0].readyState };
  });
  expect(cam).toEqual({ calls: 1, state: 'live' });
  await expect(page.getByTestId('orders-flow-camera').locator('video')).toBeVisible();

  // The units left the warehouse with the order.
  await page.goto('/?demo=1#find?q=P-000201');
  await expect(page.locator('#main')).toContainText(/Dispatched|Shipped/);
  expect(errors).toEqual([]);
});

test('pick and pack with a keyboard-wedge scanner, using cart letters only', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await signInAs(page, 'operator');
  await page.goto('/?demo=1#orders?q=pick');
  await portalReady(page);
  await page.getByTestId('start-batch').click();
  await page.getByRole('button', { name: 'Use letters only' }).click();
  await expect(prompt(page)).toHaveText('Scan the item');
  // A wrong item does not count, and says what the stop needs.
  await wedgeScan(page, 'P-000204');
  await expect(flash(page)).toContainText('This stop needs Work gloves, box of 12');
  await expect(page.getByTestId('pick-take')).toHaveText('Take 2');
  // A spot scan of the right spot confirms where you are.
  await wedgeScan(page, 'A-02-01');
  await expect(flash(page)).toHaveText('At A-02-01. Scan the item.');
  for (let i = 0; i < 20 && (await page.getByTestId('pick-spot').count()); i++) {
    const unit = await nextLabel(page);
    await wedgeScan(page, unit);
    await expect(flash(page)).toContainText(new RegExp(`${unit} is in tote|B-0001 done`));
  }
  await expect(flash(page)).toContainText('B-0001 done');
  await tab(page, /^Pack/);
  // Scanning an item from a tote opens its order, no tote scan needed.
  await wedgeScan(page, 'P-000208');
  await expect(prompt(page)).toHaveText('Scan each item (1 of 2)');
  await expect(page.locator('.flow-prompt-sub')).toContainText('Jordan Lee');
  // An item from another order stays out of this box.
  await wedgeScan(page, 'P-000201');
  await expect(flash(page)).toContainText('belongs to O-000001');
  await wedgeScan(page, 'P-000212');
  await expect(prompt(page)).toHaveText('Choose the box');
  await page.locator('.box-buttons').getByRole('button', { name: 'Small box' }).click();
  await expect(page.getByTestId('packed-package')).toContainText('K-000001');
  expect(errors).toEqual([]);
});

test('short picks, substitutes and the manager board', async ({ page }) => {
  test.setTimeout(120_000);
  await signInAs(page, 'supervisor');
  await page.goto('/?demo=1#orders');
  await portalReady(page);
  await expect(page.getByTestId('order-list').locator('.order-row')).toHaveCount(4);
  await tab(page, /^Pick/);
  await page.getByTestId('start-batch').click();
  await page.getByRole('button', { name: 'Use letters only' }).click();
  // First stop: A-02-01, two gloves for tote B. One is not there.
  await typeCode(page, 'P-000201');
  await expect(flash(page)).toContainText('P-000201 is in tote B. Take 1 more.');
  await page.getByTestId('cant-pick').click();
  await page.getByRole('button', { name: 'Not at the spot' }).click();
  await expect(flash(page)).toContainText('Recorded short');
  // Walk on to Jordan Lee's cable (tote A, substitutes allowed) and offer the 1 m cable instead.
  for (let i = 0; i < 20; i++) {
    const take = await page.getByTestId('pick-stop').innerText();
    if (/USB-C cable, 2 m/.test(take) && /O-000002/.test(take)) break;
    const unit = await nextLabel(page);
    if (!unit.startsWith('P-')) {
      await page.getByTestId('cant-pick').click();
      await page.getByRole('button', { name: /No stock recorded|Not at the spot/ }).click();
    } else await typeCode(page, unit);
    await page.waitForTimeout(150);
  }
  await typeCode(page, 'P-000210');
  await expect(flash(page)).toContainText('The customer allows substitutes');
  await page.getByRole('button', { name: 'Use as substitute' }).click();
  await expect(flash(page)).toContainText('A manager will review the substitute');
  // The board lists it for review; approving clears it.
  await tab(page, /^Orders/);
  await expect(page.getByTestId('subs-waiting')).toContainText('USB-C cable, 1 m');
  await expect(page.getByTestId('batch-row')).toContainText('Demo Manager');
  await page.getByTestId('subs-waiting').getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByTestId('subs-waiting')).toHaveCount(0);
  // The order shows the substitute and the short.
  await page.getByTestId('order-list').locator('.order-row', { hasText: 'Lakeside Dental' }).click();
  await expect(page.locator('#main')).toContainText('short');
});

test('owners turn orders on in Settings; the menu then offers Pick orders', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signInAs(page, 'owner');
  await page.goto('/#settings');
  await portalReady(page);
  const side = page.locator('.sidebar');
  await expect(side.getByRole('button', { name: 'Pick orders', includeHidden: true })).toHaveCount(0);
  await page.getByTestId('orders-setting').getByLabel('Pick customer orders').click();
  await expect(page.getByTestId('orders-setting').getByLabel('Pick customer orders')).toBeChecked();
  await expect(side.getByRole('button', { name: 'Pick orders', includeHidden: true })).toHaveCount(1);
  await side.getByRole('button', { name: 'Pick orders' }).click();
  await expect(page.locator('#main h1')).toHaveText('Pick orders');
  await expect(page.getByTestId('order-list')).toHaveCount(0);
  await expect(page.locator('#main')).toContainText('No orders yet');
});
