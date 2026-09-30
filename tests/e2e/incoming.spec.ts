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
  await expect(page.getByText("Importing a delivery list doesn't add stock")).toBeVisible();
  await page.getByRole('button', { name: /^Import 2/ }).click();
  await expect(page.locator('#main')).toContainText('2 items added to Incoming. No stock was added.');
  await page.goto('/?demo=1#find');
  await expect(page.locator('.result')).toHaveCount(before);

  // From the list: search, open, Receive pallet, save.
  await page.goto('/?demo=1#incoming');
  await expect(page.getByTestId('incoming-list').locator('.import-row')).toHaveCount(2);
  await page.getByLabel('Search incoming').fill('birch');
  await page.getByTestId('incoming-list').locator('.import-row').click();
  await page.getByRole('button', { name: 'Receive pallet' }).click();
  await expect(page.locator('#rcv-desc')).toHaveValue('Birch bundles');
  await expect(page.locator('#pallet-quantity')).toHaveValue('48');
  await page.getByRole('button', { name: 'Save pallet', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Pallet saved', exact: true })).toBeVisible();
  await page.goto('/?demo=1#incoming');
  await expect(page.getByTestId('incoming-list').locator('.import-row')).toHaveCount(1);

  // By scan: the barcode on the list fills everything in.
  await page.goto('/?demo=1#receive');
  await scan(page, 'TC-OAK-1');
  await expect(page.locator('#rcv-desc')).toHaveValue('Red oak splits');
  await expect(page.locator('#rcv-category')).toHaveValue('Hardwood');
  await page.getByRole('button', { name: 'Save pallet', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Pallet saved', exact: true })).toBeVisible();
  await page.goto('/?demo=1#incoming');
  await expect(page.getByText('Everything on your lists has been received.')).toBeVisible();
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
  await page.getByRole('button', { name: 'Receive another for' }).click();
  await page.locator('#rcv-desc').fill('');
  await scan(page, 'MY-KINDLING-9');
  await expect(page.locator('#rcv-desc')).toHaveValue('Pine kindling, 1 cu ft');
  await expect(page.locator('#rcv-category')).toHaveValue('Kindling');
  await page.goto('/?demo=1#products');
  await page.getByRole('button', { name: 'Leave and discard' }).click();
  await expect(page.getByTestId('product-list')).toContainText('Pine kindling, 1 cu ft');
});

test('your own product gets a made-up code and prints on a product label', async ({ page }) => {
  await signInAs(page, 'owner');
  await page.goto('/?demo=1#products');
  await page.getByRole('button', { name: 'New product' }).click();
  await page.getByLabel('Product name').fill('House blend firewood, 1/2 cord');
  await page.getByRole('button', { name: 'Make a code' }).click();
  await expect(page.locator('#prod-code')).toHaveValue(/^PR-[A-Z2-9]{6}$/);
  await page.getByLabel('Category (optional)').fill('Firewood');
  await page.getByRole('button', { name: 'Save and print labels' }).click();
  await expect(page.getByRole('dialog').locator('.product-label')).toHaveCount(1);
  await page.getByLabel('How many').fill('3');
  await expect(page.locator('#print-root .product-label')).toHaveCount(3);
  await expect(page.locator('#print-root .product-label').first()).toContainText('PRODUCT');
});
