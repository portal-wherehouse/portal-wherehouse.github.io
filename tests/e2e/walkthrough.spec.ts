// The blueprint's example shift (page 6), done through the real UI with typed codes,
// plus the offline queue and the in-app integrity lab.

import { expect, test, type Page } from '@playwright/test';

async function startAsPriya(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Take the guided tour' }).click();
  await expect(page.getByText('You are Priya Nair (Operator)')).toBeVisible();
  // Keep the tour tracking, but out of the way of the buttons under it.
  const minimize = page.getByRole('button', { name: 'Minimize tour' });
  if (await minimize.isVisible()) await minimize.click();
}

const nav = (page: Page, name: string) => page.locator('.sidebar').getByRole('button', { name, exact: true }).click();

async function typeCode(page: Page, code: string) {
  await page.locator('#manual-code').fill(code);
  await page.locator('#manual-code').press('Enter');
}

test('example shift: receive, place, move, find, dispatch, return, place again', async ({ page }) => {
  await startAsPriya(page);

  await nav(page, 'Receive');
  await page.locator('#rcv-job').selectOption({ label: 'J-214 · School renovation' });
  await page.locator('#rcv-desc').fill('Lighting fixtures');
  await page.getByRole('button', { name: 'Save pallet' }).click();
  await expect(page.getByText('P-000042').first()).toBeVisible();

  await page.getByRole('button', { name: 'Place now' }).click();
  await typeCode(page, 'A-03-02');
  await page.getByRole('button', { name: 'Place: A-03-02' }).click();
  await expect(page.getByText('Placed at A-03-02')).toBeVisible();

  await nav(page, 'Move');
  await typeCode(page, 'p-42');
  await typeCode(page, 'B-01-01');
  await page.getByRole('button', { name: 'Move: B-01-01' }).click();
  await expect(page.getByText('Moved to B-01-01')).toBeVisible();

  await nav(page, 'Find');
  await page.locator('#find-q').fill('J-214');
  await page.locator('.result', { hasText: 'P-000042' }).click();
  await expect(page.locator('.tl-item')).toHaveCount(3);

  await page.getByRole('button', { name: 'Dispatch pallet' }).click();
  await page.locator('.sheet').getByRole('button', { name: 'Dispatch', exact: true }).click();
  await expect(page.locator('.tl-item')).toHaveCount(4);

  await page.getByRole('button', { name: 'Record return' }).first().click();
  await page.locator('.sheet').getByRole('button', { name: 'Record return' }).click();
  await expect(page.locator('.tl-item')).toHaveCount(5);

  await page.getByRole('button', { name: 'Place', exact: true }).click();
  await typeCode(page, 'A-02-01');
  await page.getByRole('button', { name: 'Place: A-02-01' }).click();
  await expect(page.getByText('Placed at A-02-01')).toBeVisible();

  await nav(page, 'Find');
  await page.locator('#find-q').fill('P-000042');
  await page.locator('.result', { hasText: 'P-000042' }).click();
  await expect(page.locator('.tl-item')).toHaveCount(6);
  await expect(page.getByText('Example shift · 7/7')).toBeVisible();
});

test('offline move is queued, then saved when the connection returns', async ({ page }) => {
  await startAsPriya(page);
  await nav(page, 'Sync and offline');
  await page.getByRole('button', { name: 'Offline (dead zone)' }).click();
  await nav(page, 'Move');
  await typeCode(page, 'P-000014');
  await typeCode(page, 'A-03-02');
  await page.getByRole('button', { name: 'Queue: move A-03-02' }).click();
  await expect(page.getByText('Queued on this device, not confirmed')).toBeVisible();
  await page.getByRole('button', { name: 'Reconnect' }).click();
  await expect(page.getByText('Back online: 1 queued change saved')).toBeVisible();
});

test('integrity lab: every blueprint scenario passes in the browser', async ({ page }) => {
  await startAsPriya(page);
  await nav(page, 'Integrity lab');
  const run = page.getByRole('button', { name: /^Run all/ });
  const total = Number((await run.textContent())?.match(/\((\d+)\)/)?.[1]);
  await run.click();
  await expect(page.getByText(`${total} passed`)).toBeVisible({ timeout: 45_000 });
  await expect(page.locator('.fail')).toHaveCount(0);
});

test('viewer cannot change anything', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Tom Becker/ }).click();
  await page.getByRole('button', { name: /Continue as Tom Becker/ }).click();
  await nav(page, 'Receive');
  await expect(page.getByText('Receiving pallets needs Operator access')).toBeVisible();
});
