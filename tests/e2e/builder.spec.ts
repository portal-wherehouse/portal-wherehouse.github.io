import { test, expect } from '@playwright/test';
import { signInAs } from './helpers';

test('build a small rack, then print all its labels on Avery 5160 sheets', async ({ page }) => {
  await signInAs(page, 'supervisor');
  await page.goto('/?demo=1#locations');
  await page.getByRole('button', { name: 'Build a rack' }).click();
  await page.getByLabel('Zone letter').fill('Z');
  await page.getByLabel('Bays or sections each').fill('2');
  await page.getByLabel('Levels or shelves each').fill('2');
  await expect(page.getByTestId('builder-preview')).toContainText('Z-01-01-1');
  await expect(page.getByTestId('builder-preview')).toContainText('Z-01-02-2');
  await page.getByRole('button', { name: 'Create 4 spots' }).click();
  await expect(page.getByTestId('builder-done')).toContainText('4 new spots created');
  await page.getByRole('button', { name: 'Print all 4 labels' }).click();
  await page.getByRole('button', { name: /Avery 5160/ }).click();
  await expect(page.locator('.sheet .label-5160')).toHaveCount(4);
});
