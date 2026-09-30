import { test, expect } from '@playwright/test';

test('the "is it for me" page answers typed and picked businesses honestly', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/#fit');
  await page.getByRole('textbox', { name: 'Your kind of business' }).fill('tire shpo');
  await page.getByRole('button', { name: 'Check', exact: true }).click();
  const detail = page.getByTestId('fit-detail');
  await expect(detail).toContainText('Tire shop');
  await expect(detail).toContainText('Receive a set');
  await page.getByRole('tab', { name: /Stores & back rooms/ }).click();
  await page.locator('.fit-tile', { hasText: 'Online store' }).click();
  await expect(detail).toContainText('What it won’t do');
  await page.getByRole('textbox', { name: 'Your kind of business' }).fill('dog grooming');
  await page.getByRole('button', { name: 'Check', exact: true }).click();
  const unknown = page.getByTestId('fit-unknown');
  for (const q of await unknown.getByRole('radiogroup').all()) await q.getByRole('radio', { name: 'Yes' }).click();
  await expect(unknown).toContainText('great fit');
  await page.screenshot({ path: 'test-results/fit-page.png', fullPage: false });
});

test('survey icons stay small on the website', async ({ page }) => {
  await page.goto('/#start');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  const box = await page.locator('.survey-why svg').boundingBox();
  expect(box!.width).toBeLessThanOrEqual(24);
  await page.screenshot({ path: 'test-results/survey-q1.png' });
});
