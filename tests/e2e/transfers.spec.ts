import { expect, test } from '@playwright/test';
import { nav, portalReady, signInAs, typeCode, watchErrors, wedgeScan } from './helpers';

// The full sample flow: send two pallets from the main yard to the Overflow yard, see them in transit in Find,
// switch warehouse, open the transfer from its slip barcode, and receive both.
test('transfer between the two sample warehouses, from sending to receiving', async ({ page }) => {
  const errors = watchErrors(page);
  await signInAs(page, 'owner');
  await page.goto('/?demo=1#overview');
  await portalReady(page);

  await nav(page, 'Transfers');
  await expect(page.getByRole('heading', { name: 'Transfers', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'New transfer' }).click();
  await expect(page.locator('#tr-dest')).toHaveValue(/.+/);
  await expect(page.locator('#tr-dest option:checked')).toHaveText('Overflow yard');

  // One by scanning (typed into the scan box), one from the list.
  await typeCode(page, 'P-000003');
  await expect(page.getByText('P-000003 added.')).toBeVisible();
  await page.locator('.tr-pick', { hasText: 'P-000004' }).locator('input').check();
  // A pallet on hold cannot be added.
  await expect(page.locator('.tr-pick', { hasText: 'P-000005' }).locator('input')).toBeDisabled();
  await page.locator('#tr-note').fill('Truck 4');
  await page.screenshot({ path: 'test-results/transfer-new.png', fullPage: true });
  await page.getByRole('button', { name: /^Send 2 pallets/ }).click();

  await expect(page.locator('.page-title')).toContainText('TR-0001');
  await expect(page.locator('.page-title')).toContainText('In transit');
  await expect(page.getByText('On the way to Overflow yard')).toBeVisible();

  // The slip carries a barcode of the transfer number.
  await page.getByRole('button', { name: 'Slip' }).click();
  const slip = page.getByRole('dialog', { name: 'Transfer slip' });
  await expect(slip.locator('.bc128 svg')).toBeVisible();
  await expect(slip.getByText('Truck 4')).toBeVisible();
  await page.screenshot({ path: 'test-results/transfer-slip.png' });
  await slip.getByRole('button', { name: 'Close' }).click();

  // Find shows where the pallet is now.
  await nav(page, 'Find');
  await page.locator('#find-q').fill('P-000003');
  await expect(page.getByText('In transit to Overflow yard, TR-0001').first()).toBeVisible();

  // Switch to the destination.
  await page.locator('.warehouse-name-button').click();
  await page.getByRole('menu', { name: 'Warehouse menu' }).getByRole('menuitem', { name: /Overflow yard/ }).click();
  await expect(page.locator('.warehouse-name-button')).toHaveText('Overflow yard');

  // Scanning the slip opens the transfer.
  await wedgeScan(page, 'TR-0001');
  await expect(page.locator('.page-title')).toContainText('TR-0001');
  await expect(page.getByRole('heading', { name: 'Receive at Overflow yard' })).toBeVisible();

  // Receive one by scanning its label code, onto the receiving area, then the other with its button.
  await expect(page.locator('#tr-spot option:checked')).toHaveText('RECEIVING-01');
  await typeCode(page, 'P-000003');
  await expect(page.getByText('P-000003 received on RECEIVING-01.')).toBeVisible();
  await page.screenshot({ path: 'test-results/transfer-receive.png', fullPage: true });
  await expect(page.locator('.page-title')).toContainText('Partly received');
  await page.getByRole('button', { name: 'Receive P-000004' }).click();
  await expect(page.locator('.page-title')).toContainText('Received');
  await expect(page.getByRole('heading', { name: 'Receive at Overflow yard' })).toBeHidden();

  await nav(page, 'Transfers');
  await page.getByRole('tab', { name: /All/ }).click();
  await page.screenshot({ path: 'test-results/transfer-list.png' });
  await page.setViewportSize({ width: 375, height: 800 });
  await page.screenshot({ path: 'test-results/transfer-list-375.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  await page.getByRole('button', { name: /TR-0001/ }).click();
  await page.screenshot({ path: 'test-results/transfer-detail-375.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  await page.setViewportSize({ width: 1280, height: 900 });
  // The pallet keeps its record and history at the new warehouse.
  await page.getByRole('row', { name: /P-000003/ }).click();
  await expect(page.getByText('Received from transfer').first()).toBeVisible();
  await expect(page.getByText('Sent on transfer').first()).toBeVisible();

  expect(page.url()).not.toContain('error');
  expect(errors).toEqual([]);
});

test('with one warehouse, Transfers is in the menu and the page explains how to add one', async ({ page }) => {
  const errors = watchErrors(page);
  await signInAs(page, 'owner');
  await page.goto('/#overview');
  await portalReady(page);
  await nav(page, 'Transfers');
  await expect(page.getByRole('heading', { name: 'Transfers', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Transfers need a second warehouse' })).toBeVisible();
  await expect(page.getByText(/choose Add warehouse/)).toBeVisible();
  await expect(page.getByTestId('transfers-one-warehouse')).toContainText('Or pick it as an order');
  await expect(page.getByRole('button', { name: 'New transfer' })).toHaveCount(0);
  await page.screenshot({ path: 'test-results/transfers-one-warehouse.png', fullPage: true });
  // The button opens the warehouse menu, where Add warehouse is.
  await page.getByRole('button', { name: 'Add a warehouse' }).click();
  await expect(page.getByRole('menu', { name: 'Warehouse menu' }).getByRole('menuitem', { name: /Add warehouse/ })).toBeVisible();
  await page.keyboard.press('Escape');

  // On a phone, More lists it too, and nothing scrolls sideways.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#more');
  await page.locator('.more-menu').getByRole('button', { name: /^Transfers/ }).click();
  await expect(page.getByRole('heading', { name: 'Transfers need a second warehouse' })).toBeVisible();
  await page.screenshot({ path: 'test-results/transfers-one-warehouse-390.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});

// A draft transfer picked as an order: picked, packed and handed off on the Pick orders screens, which sends the
// transfer. The pallets are taken from the list (stored ones, on a spot), so the test does not depend on sample codes.
test('pick a transfer as an order: pack and hand off, and the transfer goes in transit', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await signInAs(page, 'owner');
  await page.goto('/?demo=1#transfers');
  await portalReady(page);
  await page.getByRole('button', { name: 'New transfer' }).click();
  const free = page.locator('.tr-pick:not(.blocked)').filter({ hasNotText: 'Waiting for placement' });
  const codes: string[] = [];
  for (let i = 0; i < 2; i++) {
    const row = free.nth(i);
    codes.push((await row.locator('.pcode').innerText()).trim());
    await row.locator('input').check();
  }
  await page.getByRole('button', { name: 'Save as draft' }).click();
  await expect(page.locator('.page-title')).toContainText('Draft');
  const number = ((await page.locator('.page-title .mono').innerText()) ?? '').trim();
  expect(number).toMatch(/^TR-\d+/);

  // A manager picks it as an order for the other warehouse.
  const panel = page.getByTestId('pick-as-order');
  await expect(panel).toContainText('Pick as an order');
  await page.screenshot({ path: 'test-results/transfer-pick-as-order.png', fullPage: true });
  await panel.getByRole('button', { name: 'Pick as an order' }).click();
  await expect(page.locator('.n-title', { hasText: /^Picking as order O-\d+/ })).toBeVisible();
  await expect(page.getByTestId('transfer-order-status')).toContainText('Ready to pick');
  await expect(page.getByRole('button', { name: /^Send to/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Cancel transfer' })).toHaveCount(0);
  const orderCode = ((await page.locator('.n-title', { hasText: /^Picking as order O-\d+/ }).innerText()).match(/O-\d+/) ?? [''])[0];

  // Pick it now: the batch holds this order only, and each stop is one of the transfer's pallets.
  await page.getByRole('button', { name: 'Pick it now' }).click();
  await expect(page.locator('#orders-flow-prompt')).toHaveText(/Scan a tote for A|Scan the item/);
  if ((await page.getByRole('button', { name: 'Use letters only' }).count()) > 0) await page.getByRole('button', { name: 'Use letters only' }).click();
  const flash = page.getByTestId('orders-flow-flash');
  for (let i = 0; i < 2; i++) {
    const unit = ((await page.locator('.flow-demo .demo-label').first().innerText()).split('\n')[0] ?? '').trim();
    expect(codes).toContain(unit);
    await typeCode(page, unit);
    await expect(flash).toContainText(new RegExp(`${unit} is in tote|done`));
  }
  await expect(flash).toContainText(/done/);

  // Pack both pallets into one package.
  await page.locator('.orders-tabs').getByRole('button', { name: /^Pack/ }).click();
  await typeCode(page, codes[0]);
  await expect(page.locator('#orders-flow-prompt')).toHaveText('Scan each item (1 of 2)');
  await typeCode(page, codes[1]);
  await expect(page.locator('#orders-flow-prompt')).toHaveText('Choose the box');
  await page.locator('.box-buttons').getByRole('button').first().click();
  await expect(page.getByTestId('packed-package')).toContainText(/K-\d+/);

  // Hand off: the order, its package, then send to the other warehouse.
  await page.locator('.orders-tabs').getByRole('button', { name: /^Hand off/ }).click();
  await typeCode(page, orderCode);
  await expect(page.locator('#orders-flow-prompt')).toHaveText('Scan every package (0 of 1)');
  await expect(page.locator('.flow-prompt-sub')).toContainText(`Transfer ${number}`);
  const pkg = ((await page.locator('.flow-demo .demo-label').first().innerText()).split('\n')[0] ?? '').trim();
  await typeCode(page, pkg);
  await expect(page.locator('#orders-flow-prompt')).toHaveText('Confirm the handoff');
  await page.getByLabel('Carrier').fill('Own truck');
  await page.getByTestId('confirm-handoff').click();
  await expect(flash).toContainText(`${orderCode} handed off. ${number} is in transit to`);

  // The transfer is in transit, and shows its order as done.
  await nav(page, 'Transfers');
  await page.getByRole('tab', { name: /All/ }).click();
  await page.getByRole('button', { name: new RegExp(number) }).click();
  await expect(page.locator('.page-title')).toContainText('In transit');
  await expect(page.getByTestId('transfer-order-status')).toContainText(`Picked as order ${orderCode} · Done`);
  await expect(page.getByRole('row', { name: new RegExp(codes[0]) })).toContainText('In transit');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/transfer-picked-390.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  // The order links back to its transfer.
  await page.getByTestId('transfer-order-status').getByRole('button', { name: orderCode }).click();
  await expect(page.getByTestId('order-transfer')).toContainText(`${number} to`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});

test('with Orders and picking off, an owner can turn it on from the transfer', async ({ page }) => {
  await signInAs(page, 'owner');
  await page.goto('/?demo=1#settings');
  await portalReady(page);
  const toggle = page.getByTestId('orders-setting').getByLabel('Pick customer orders');
  await expect(toggle).toBeChecked();
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await nav(page, 'Transfers');
  await page.getByRole('button', { name: 'New transfer' }).click();
  await page.locator('.tr-pick:not(.blocked)').filter({ hasNotText: 'Waiting for placement' }).first().locator('input').check();
  await page.getByRole('button', { name: 'Save as draft' }).click();
  const panel = page.getByTestId('pick-as-order');
  await expect(panel).toContainText('Orders and picking is off');
  await panel.getByRole('button', { name: 'Turn on Orders and picking' }).click();
  await expect(panel.getByRole('button', { name: 'Pick as an order' })).toBeVisible();
  await expect(page.locator('.sidebar').getByRole('button', { name: 'Pick orders', includeHidden: true })).toHaveCount(1);
});
