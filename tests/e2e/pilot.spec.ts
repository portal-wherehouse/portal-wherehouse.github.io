import { expect, test } from '@playwright/test';
import { nav, signInAs, typeCode, watchErrors } from './helpers';

test('operator receives matching pallets, prints both labels, places and retrieves the second', async ({ page }) => {
  const errors = watchErrors(page);
  await signInAs(page, 'operator');
  await page.goto('/#receive');
  const sidebar = page.locator('.sidebar');
  await expect(page.getByRole('button', {name:'Practice shift',exact:true})).toBeVisible();
  await expect(page.getByRole('button', {name:'Take the tour',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button', {name:'Online. Open Sync and offline'})).toHaveCount(0);
  await expect(page.getByText('Local demo', {exact:true})).toBeVisible();
  await expect(sidebar.getByRole('button', {name:'Manager dashboard',exact:true})).toHaveCount(0);
  await expect(sidebar.getByRole('button', {name:'Integrity lab',exact:true})).toHaveCount(0);
  await page.locator('#rcv-job').selectOption({label:'J-214 · School renovation'});
  await page.locator('#rcv-desc').fill('Pilot lighting fixtures');
  await page.locator('#rcv-sup').fill('PO-PILOT-01');
  await page.locator('#rcv-note').fill('Only this pallet has damaged wrapping');
  await page.getByRole('button', {name:'Save pallet',exact:true}).click();
  await expect(page.getByRole('heading', {name:'Pallet saved'})).toBeVisible();
  await page.getByRole('button', {name:'Receive another like this'}).click();
  await expect(page.locator('#rcv-desc')).toHaveValue('Pilot lighting fixtures');
  // New receipts must not silently reuse a supplier pallet identifier.
  await expect(page.locator('#rcv-sup')).toHaveValue('');
  // A purchase order can legitimately cover both pallets when entered explicitly.
  await page.locator('#rcv-sup').fill('PO-PILOT-01');
  await expect(page.locator('#rcv-note')).toHaveValue('');
  await page.getByRole('button', {name:'Save pallet',exact:true}).click();
  await expect(page.getByText('P-000043').first()).toBeVisible();
  await page.getByRole('button', {name:'Print all 2 labels from this receiving session'}).click();
  const labels = page.getByRole('dialog', {name:'Print 2 labels'});
  await expect(labels.getByText('P-000042', {exact:true}).first()).toBeVisible();
  await expect(labels.getByText('P-000043', {exact:true}).first()).toBeVisible();
  await labels.getByRole('button', {name:'Close',exact:true}).click();
  await page.getByRole('button', {name:'Place now',exact:true}).click();
  await typeCode(page, 'A-03-02');
  await expect(page.getByRole('button', {name:/Demo: another phone/})).toHaveCount(0);
  await page.getByRole('button', {name:'Place: A-03-02',exact:true}).click();
  await expect(page.getByText('Placed at A-03-02')).toBeVisible();
  await nav(page,'Find');
  await page.locator('#find-q').fill('P-000043');
  await page.locator('.result').click();
  await expect(page.locator('.tl-item')).toHaveCount(2);
  await expect(page.getByText('Identity',{exact:true})).toHaveCount(0);
  await expect(page.getByText('Label token',{exact:true})).toHaveCount(0);
  await page.screenshot({path:'test-results/pilot-record.png',fullPage:true});
  expect(errors).toEqual([]);
});

test('price and included remote support are visible on desktop and phone', async ({page})=>{
 await page.goto('/#pricing');await expect(page.locator('main')).toContainText('$29');await expect(page.locator('main')).toContainText('Remote support for the whole app');await page.screenshot({path:'test-results/pricing-desktop.png',fullPage:true});
 await page.goto('/');await expect(page.locator('.home-hero')).toContainText('$29/warehouse/month');await expect(page.getByText('Customer logo',{exact:true})).toHaveCount(0);await page.screenshot({path:'test-results/home-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'test-results/home-phone.png',fullPage:true});
});
