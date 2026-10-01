import { expect, test, type Page } from '@playwright/test';
import { nav, portalReady, signInAs, typeCode, watchErrors } from './helpers';

// Stock in the sample: minimums and on-hand counts on Products, Running low (bring from the Overflow yard, note a
// reorder), the stock reports with CSV downloads, quantity changes with a reason and with approval, and the
// dispatch slip for a send that is not an order. Set SHOTS_DIR to save screenshots for review.

const SHOTS = process.env.SHOTS_DIR;
async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `${SHOTS}/${name}-${width}.png`, fullPage: true });
  }
}

async function noSideScroll(page: Page) {
  const before = page.viewportSize();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  if (before) await page.setViewportSize(before);
}

async function openPallet(page: Page, code: string) {
  await nav(page, 'Find');
  await page.locator('#find-q').fill(code);
  await page.locator('button.result', { hasText: code }).first().click();
  await expect(page.locator('.page-title')).toContainText(code);
}

test('products show what is on hand against a minimum', async ({ page }) => {
  const errors = watchErrors(page);
  await signInAs(page, 'supervisor');
  await page.goto('/?demo=1#products');
  await portalReady(page);
  const row = (name: string) => page.locator('[data-testid="product-list"] .import-row', { hasText: name });
  await expect(row('AA batteries').getByTestId('stock-chip')).toHaveText('Low: 1 of 4 pallets');
  await expect(row('Packing tape').getByTestId('stock-chip')).toHaveText('4 pallets · min 2');
  await expect(row('Work gloves').getByTestId('stock-chip')).toHaveText('3 pallets on hand');
  await expect(page.getByText('2 products are running low')).toBeVisible();

  await row('Work gloves').getByRole('button', { name: /Edit/ }).click();
  await page.locator('#prod-min').fill('2.5');
  await expect(page.getByText('Use whole numbers when counting pallets')).toBeVisible();
  await page.locator('#prod-min').fill('5');
  await page.locator('#prod-reorder').fill('6');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(row('Work gloves').getByTestId('stock-chip')).toHaveText('Low: 3 of 5 pallets');
  await expect(page.getByText('3 products are running low')).toBeVisible();
  await shot(page, 'products');
  await noSideScroll(page);
  expect(errors).toEqual([]);
});

test('running low: note a reorder, then bring stock over from the Overflow yard', async ({ page }) => {
  const errors = watchErrors(page);
  await signInAs(page, 'supervisor');
  await page.goto('/?demo=1#overview');
  await portalReady(page);
  const card = page.getByTestId('low-stock-card');
  await expect(card).toContainText('Running low');
  await expect(card.locator('.attention-count')).toHaveText('2');
  await card.click();
  await expect(page.getByRole('tab', { name: /Running low/ })).toHaveAttribute('aria-selected', 'true');
  const bat = page.getByTestId('low-row').filter({ hasText: 'AA batteries' });
  const zip = page.getByTestId('low-row').filter({ hasText: 'Zip ties' });
  await expect(bat).toContainText('1');
  await expect(bat).toContainText('of 4 pallets');
  await expect(bat).toContainText('Bring in 6 pallets (the reorder quantity).');
  await expect(bat).toContainText('None in your other warehouses.');
  await expect(zip.getByRole('button', { name: 'Bring from Overflow yard (2 pallets)' })).toBeVisible();

  await bat.getByRole('button', { name: 'Note a reorder' }).click();
  await bat.locator('input').fill('PO 4471, due Friday');
  await bat.getByRole('button', { name: 'Save reorder note' }).click();
  await expect(bat).toContainText('Reorder noted by');
  await expect(bat).toContainText('PO 4471, due Friday');
  await shot(page, 'running-low');
  await noSideScroll(page);
  await page.setViewportSize({ width: 1280, height: 900 });

  await zip.getByRole('button', { name: 'Bring from Overflow yard (2 pallets)' }).click();
  await expect(page.locator('.warehouse-name-button')).toHaveText('Overflow yard');
  await expect(page.getByRole('heading', { name: 'New transfer' })).toBeVisible();
  await expect(page.locator('#tr-dest option:checked')).toHaveText('Main yard');
  await expect(page.getByText('2 pallets of product ZIP-100 picked, oldest first.')).toBeVisible();
  await expect(page.locator('.tr-picked li')).toHaveCount(2);
  await shot(page, 'restock-transfer');
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('button', { name: 'Transfer now' }).click();
  await expect(page.locator('.page-title')).toContainText('TR-0001');

  // Back at the main yard, the zip ties are no longer short.
  await page.locator('.warehouse-name-button').click();
  await page.getByRole('menu', { name: 'Warehouse menu' }).getByRole('menuitem', { name: /Sample warehouse|Main yard/ }).click();
  await page.goto('/?demo=1#reconcile?q=low');
  await expect(page.getByTestId('low-row')).toHaveCount(1);
  await expect(page.getByTestId('low-row')).toContainText('AA batteries');
  expect(errors).toEqual([]);
});

test('stock reports, each with a CSV download', async ({ page }) => {
  const errors = watchErrors(page);
  await signInAs(page, 'supervisor');
  await page.goto('/?demo=1#overview');
  await portalReady(page);
  await nav(page, 'Stock');
  await page.locator('.page-tabs').getByRole('button', { name: 'Reports' }).click();
  await expect(page.getByRole('heading', { name: 'Stock reports' })).toBeVisible();
  const product = page.getByTestId('report-product');
  await expect(product.getByRole('row', { name: /AA batteries/ })).toContainText('Running low');
  await expect(product.getByRole('row', { name: /Packing tape/ })).toContainText('OK');
  const download = page.waitForEvent('download');
  await product.getByRole('button', { name: 'Download CSV' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^wherehouse-stock-by-product-\d{4}-\d{2}-\d{2}\.csv$/);
  await shot(page, 'report-product');

  for (const [tab, id, text] of [
    ['By warehouse', 'warehouse', 'Overflow yard'],
    ['By zone', 'zone', 'Zone A'],
    ['Aging', 'aging', '0 to 30 days'],
    ['Transfers', 'transfers', 'No transfers'],
    ['Counts and adjustments', 'adjustments', 'Used 3: 10 → 7 cases'],
  ] as const) {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.getByRole('tab', { name: tab }).click();
    await expect(page.getByTestId(`report-${id}`)).toContainText(text);
    await noSideScroll(page);
  }
  await shot(page, 'report-adjustments');
  // The map and the reports share the Stock menu item.
  await page.locator('.page-tabs').getByRole('button', { name: 'Map' }).click();
  await expect(page.getByRole('heading', { name: 'Stock', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('change a quantity with a reason, and approve an operator change', async ({ page, context }) => {
  const errors = watchErrors(page);
  await signInAs(page, 'supervisor');
  await page.goto('/?demo=1#overview');
  await portalReady(page);
  await openPallet(page, 'P-000301');
  await page.getByRole('button', { name: 'Change quantity' }).click();
  const sheet = page.getByRole('dialog', { name: 'Change quantity' });
  await expect(sheet).toContainText('Recorded now: 7 cases');
  await sheet.getByRole('button', { name: 'Used', exact: true }).click();
  await sheet.locator('#adj-amount').fill('9');
  await expect(sheet).toContainText('Only 7 recorded');
  await sheet.locator('#adj-amount').fill('2');
  await expect(sheet.getByTestId('adjust-preview')).toContainText('7');
  await expect(sheet.getByTestId('adjust-preview')).toContainText('5');
  await sheet.locator('#adj-note').fill('For the van');
  await shot(page, 'adjust-sheet');
  await page.setViewportSize({ width: 1280, height: 900 });
  await sheet.getByRole('button', { name: 'Save quantity' }).click();
  await expect(page.getByText('Quantity changed: Used').first()).toBeVisible();
  await expect(page.getByTestId('adjust-line').first()).toContainText('Used 2: 7 → 5 cases');

  // Turn on approval, then an operator asks for a change.
  await nav(page, 'Settings');
  await page.getByTestId('approval-setting').getByRole('checkbox').click();
  await expect(page.getByTestId('approval-setting').getByRole('checkbox')).toBeChecked();
  await expect(page.getByText('Operators now ask a manager to approve quantity changes.')).toBeVisible();

  const crew = await context.newPage();
  await signInAs(crew, 'operator');
  await crew.goto('/?demo=1#find');
  await expect(crew.locator('.topbar')).toBeVisible();
  await crew.locator('#find-q').fill('P-000301');
  await crew.locator('button.result', { hasText: 'P-000301' }).first().click();
  await crew.getByRole('button', { name: 'Change quantity' }).click();
  const ask = crew.getByRole('dialog', { name: 'Change quantity' });
  await ask.getByRole('button', { name: 'Damaged' }).click();
  await ask.locator('#adj-amount').fill('1');
  await expect(ask).toContainText('A manager approves quantity changes');
  await ask.getByRole('button', { name: 'Ask for approval' }).click();
  await expect(crew.getByText('Quantity change requested').first()).toBeVisible();
  await expect(crew.getByTestId('pending-adjust')).toContainText('Waiting for a manager to approve.');
  await crew.close();

  await page.goto('/?demo=1#reconcile?q=approvals');
  await expect(page.getByRole('tab', { name: /Quantity changes/ })).toHaveAttribute('aria-selected', 'true');
  const pending = page.getByTestId('pending-adjust');
  await expect(pending).toContainText('Damaged 1: 5 → 4 cases');
  await shot(page, 'approvals');
  await page.setViewportSize({ width: 1280, height: 900 });
  await pending.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText('P-000301: quantity change approved')).toBeVisible();
  await openPallet(page, 'P-000301');
  await expect(page.getByText('Quantity change approved').first()).toBeVisible();
  await expect(page.locator('dl.kv')).toContainText('4');
  expect(errors).toEqual([]);
});

test('ship two pallets on one send and print its dispatch slip', async ({ page }) => {
  const errors = watchErrors(page);
  await signInAs(page, 'supervisor');
  await page.goto('/?demo=1#overview');
  await portalReady(page);
  await nav(page, 'Ship');
  await typeCode(page, 'P-000201');
  const sheet = page.getByRole('dialog', { name: 'Dispatch pallet' });
  await sheet.locator('#act-dest').fill('Riverside site');
  await sheet.locator('#act-note').fill('Truck 4, driver Sam');
  await sheet.getByRole('button', { name: 'Dispatch' }).click();
  const panel = page.getByTestId('send-panel');
  await expect(panel).toContainText('D-000002');
  await expect(panel).toContainText('1 pallet');

  await typeCode(page, 'P-000202');
  await expect(sheet).toContainText('Joins dispatch D-000002');
  await expect(sheet.locator('#act-dest')).toHaveValue('Riverside site');
  await sheet.getByRole('button', { name: 'Dispatch' }).click();
  await expect(panel).toContainText('2 pallets: P-000201, P-000202');
  await shot(page, 'ship-send');
  await page.setViewportSize({ width: 1280, height: 900 });

  await panel.getByRole('button', { name: 'Print dispatch slip' }).click();
  const slip = page.getByRole('dialog', { name: 'Dispatch slip' });
  await expect(slip.locator('.bc128 svg')).toBeVisible();
  await expect(slip).toContainText('Riverside site');
  await expect(slip).toContainText('Truck 4, driver Sam');
  await expect(slip).toContainText('P-000201');
  await expect(slip).toContainText('P-000202');
  await expect(slip).toContainText('Received by (signature)');
  await shot(page, 'dispatch-slip');
  await noSideScroll(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await slip.getByRole('button', { name: 'Close' }).click();

  // A new send gets the next number, and the pallet record reprints its slip.
  await panel.getByRole('button', { name: 'Start a new send' }).click();
  await expect(panel).toBeHidden();
  await openPallet(page, 'P-000202');
  await expect(page.getByTestId('dispatch-line')).toContainText('D-000002');
  await page.getByTestId('dispatch-line').getByRole('button', { name: 'Dispatch slip' }).click();
  await expect(page.getByRole('dialog', { name: 'Dispatch slip' })).toContainText('P-000201');
  expect(errors).toEqual([]);
});
