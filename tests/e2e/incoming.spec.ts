import { test, expect, type Page } from '@playwright/test';
import { signInAs } from './helpers';

const list = 'description,barcode,quantity,unit,category\nRed oak splits,TC-OAK-1,1,pallet,Hardwood\nBirch bundles,,48,bundles,Bundles\n';

async function scan(page: Page, code: string) {
  await page.getByRole('button', { name: 'Scan supplier barcode', exact: true }).click();
  await page.getByLabel('Printed barcode number').fill(code);
  await page.getByRole('button', { name: 'Use barcode', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
}

test('a delivery list goes to Incoming, adds no stock, and each item is received by scan or from the list', async ({ page }) => {
  await signInAs(page, 'owner');
  await page.goto('/?demo=1#find');
  await expect(page.locator('.result').first()).toBeVisible();
  const before = await page.locator('.result').count();

  await page.goto('/?demo=1#import');
  await page.getByLabel('CSV text').fill(list);
  await expect(page.getByRole('group', { name: 'What to import' }).getByRole('button', { name: 'Incoming' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText("Each row loads a pallet's barcode info into your system")).toBeVisible();
  await page.getByRole('button', { name: /^Import 2/ }).click();
  await expect(page.locator('#main')).toContainText('2 items added to Incoming. No stock was added.');
  await page.goto('/?demo=1#find');
  await expect(page.locator('.result')).toHaveCount(before);

  // From the list: search, open, Receive pallet, save. The sample already expects two deliveries of its own.
  await page.goto('/?demo=1#incoming');
  const rows = page.getByTestId('incoming-list').locator('.import-row');
  await expect(rows).toHaveCount(4);
  await expect(rows.filter({ hasText: 'Canned beans, 120 cases' })).toHaveCount(1);
  await page.getByLabel('Search incoming').fill('birch');
  await page.getByTestId('incoming-list').locator('.import-row').click();
  await page.getByRole('button', { name: 'Receive pallet' }).click();
  await expect(page.locator('#rcv-desc')).toHaveValue('Birch bundles');
  await expect(page.locator('#pallet-quantity')).toHaveValue('48');
  await page.getByRole('button', { name: 'Save pallet', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Pallet saved', exact: true })).toBeVisible();
  await page.goto('/?demo=1#incoming');
  await expect(rows).toHaveCount(3);

  // By scan: the barcode on the list fills everything in.
  await page.goto('/?demo=1#receive');
  await scan(page, 'TC-OAK-1');
  await expect(page.locator('#rcv-desc')).toHaveValue('Red oak splits');
  await expect(page.locator('#rcv-category')).toHaveValue('Hardwood');
  await page.getByRole('button', { name: 'Save pallet', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Pallet saved', exact: true })).toBeVisible();
  await page.goto('/?demo=1#incoming');
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: /Red oak|Birch/ })).toHaveCount(0);
});

test('an unknown barcode becomes a saved product, and the next scan fills it in', async ({ page }) => {
  await signInAs(page, 'owner');
  await page.goto('/?demo=1#receive');
  await scan(page, 'MY-KINDLING-9');
  await expect(page.getByText('New barcode', { exact: true })).toBeVisible();
  await page.locator('#rcv-desc').fill('Pine kindling, 1 cu ft');
  await page.locator('#rcv-category').fill('Kindling');
  await page.getByRole('button', { name: 'Save pallet', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Pallet saved', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Receive another', exact: true }).click();
  await page.locator('#rcv-desc').fill('');
  await scan(page, 'MY-KINDLING-9');
  await expect(page.locator('#rcv-desc')).toHaveValue('Pine kindling, 1 cu ft');
  await expect(page.locator('#rcv-category')).toHaveValue('Kindling');
  await page.goto('/?demo=1#products');
  await page.getByRole('button', { name: 'Leave and discard' }).click();
  await expect(page.getByTestId('product-list')).toContainText('Pine kindling, 1 cu ft');
});

test('a product gets a generated barcode, a size, and prints on a sticker', async ({ page }) => {
  await signInAs(page, 'owner');
  await page.goto('/?demo=1#import');
  await page.getByTestId('pallet-type-panel').getByRole('button', { name: 'New product' }).click();
  await page.getByLabel('Product name').fill('Tire crate from Acme Supply');
  await page.getByRole('button', { name: 'Generate barcode' }).click();
  await expect(page.locator('#prod-code')).toHaveValue(/^PT-[A-Z2-9]{6}$/);
  const code = await page.locator('#prod-code').inputValue();
  await page.getByLabel('Length (in)').fill('48');
  await page.getByLabel('Width (in)').fill('40');
  await page.getByLabel('Height (in)').fill('60');
  await page.getByLabel('Estimated weight (lb)').fill('900');
  await page.getByRole('button', { name: 'Save and print now' }).click();
  await expect(page.getByRole('dialog').locator('.product-label')).toHaveCount(1);
  await expect(page.getByRole('dialog').locator('.product-label')).toContainText('48 × 40 × 60 in, about 900 lb');
  await page.getByLabel('How many').fill('3');
  await expect(page.locator('#print-root .product-label')).toHaveCount(3);
  await expect(page.locator('#print-root .product-label').first()).toContainText('PRODUCT');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.goto('/?demo=1#products');
  await expect(page.getByTestId('product-list')).toContainText('Tire crate from Acme Supply');
  await expect(page.getByTestId('product-list')).toContainText(code);
});
