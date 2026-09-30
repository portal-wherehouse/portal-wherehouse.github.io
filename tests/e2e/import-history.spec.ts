import { test, expect } from '@playwright/test';
import { signInAs } from './helpers';

test('an import is named, found by search, reopened with its spreadsheet, renamed and its labels printed', async ({ page }) => {
  await signInAs(page, 'owner');
  await page.goto('/?demo=1#import');
  await page.getByLabel('CSV text').fill('description,supplier_ref\nRed oak,TC-1\nWhite birch,TC-2\nCedar kindling,TC-3\n');
  await page.getByLabel('Name this import').fill('Timber Creek truck');
  await page.getByRole('button', { name: /^Import 3/ }).click();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Import another' }).click();

  const history = page.getByTestId('import-history');
  await history.getByLabel('Search imports').fill('birch');
  await expect(history.locator('.import-row')).toHaveCount(1);
  await history.getByLabel('Search imports').fill('no such thing');
  await expect(history.locator('.import-row')).toHaveCount(0);
  await history.getByLabel('Search imports').fill('timber');
  await history.locator('.import-row').first().click();

  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('heading', { name: 'Timber Creek truck' })).toBeVisible();
  await expect(sheet.locator('tbody tr')).toHaveCount(3);
  await expect(sheet.locator('tbody')).toContainText('P-000007');
  await sheet.getByLabel('Search this import').fill('cedar');
  await expect(sheet.locator('tbody tr')).toHaveCount(1);

  await sheet.getByLabel('Import name').fill('Timber Creek, Sep 30');
  await sheet.getByRole('button', { name: 'Rename' }).click();
  await expect(sheet.getByRole('heading', { name: 'Timber Creek, Sep 30' })).toBeVisible();

  await sheet.getByRole('button', { name: 'Print all 3 labels' }).click();
  await expect(page.locator('#print-root .label-card')).toHaveCount(3);
});
