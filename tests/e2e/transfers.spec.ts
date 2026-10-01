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

test('with one warehouse, Transfers is not in the menu and the page explains how to add one', async ({ page }) => {
  await signInAs(page, 'owner');
  await page.goto('/#overview');
  await portalReady(page);
  await expect(page.locator('.sidebar').getByRole('button', { name: 'Transfers', exact: true, includeHidden: true })).toHaveCount(0);
  await page.goto('/#transfers');
  await expect(page.getByRole('heading', { name: 'Transfers need a second warehouse' })).toBeVisible();
  await expect(page.getByText(/choose Add warehouse/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'New transfer' })).toHaveCount(0);
});
