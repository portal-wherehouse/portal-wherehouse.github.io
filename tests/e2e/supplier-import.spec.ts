import { test, expect } from '@playwright/test';
import { signInAs } from './helpers';

const firewood = 'job_code,description,notes,supplier_ref\nFW-103,"Red oak, 16 in",Top rack,TC-1\nFW-104,Birch bundles,,TC-2\n';
const supplier = 'PO #,Item Description,Qty,Customer\n4471,Cedar kindling,1,Hearth & Home\n4472,White ash,2,\n';

test('pallets import adds jobs the warehouse does not have yet', async ({ page }) => {
  await signInAs(page, 'owner');
  await page.goto('/?demo=1#import');
  await page.getByLabel('CSV text').fill(firewood);
  await expect(page.getByRole('group', { name: 'What to import' }).getByRole('button', { name: 'Pallets' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: /^Import 2/ }).click();
  await expect(page.locator('#main')).toContainText('2 new jobs added');
});

test('a supplier file is matched once, saved as a template and reused automatically', async ({ page }) => {
  await signInAs(page, 'owner');
  await page.goto('/?demo=1#import');
  await page.getByRole('group', { name: 'What to import' }).getByRole('button', { name: 'Pallets' }).click();
  await page.getByLabel('CSV text').fill(supplier);
  const matcher = page.getByTestId('column-matcher');
  await expect(matcher).toBeVisible();
  await expect(page.getByLabel('Column for description')).toHaveValue('item description');
  await expect(page.getByLabel('Column for supplier_ref')).toHaveValue('po #');
  await page.getByLabel('Template name').fill('Timber Creek');
  await page.getByRole('button', { name: 'Save as template' }).click();
  await page.goto('about:blank');
  await page.goto('/?demo=1#import');
  await page.getByLabel('CSV text').fill(supplier);
  await expect(page.getByText('Using your saved template “Timber Creek”', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Import 2/ })).toBeEnabled();
  await page.getByRole('button', { name: /^Import 2/ }).click();
  await expect(page.locator('#main')).toContainText('Batch ID');
});
