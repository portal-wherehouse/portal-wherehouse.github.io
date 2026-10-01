import { test, expect } from '@playwright/test';
import { signInAs } from './helpers';

test('desktop sidebar: daily groups start open, Setup starts folded, and each choice stays after a refresh', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signInAs(page, 'owner');
  await page.goto('/?demo=1#overview');
  const group = (title: string) => page.locator('.sidebar details', { has: page.locator('summary', { hasText: title }) });
  await expect(group('Daily work')).toHaveAttribute('open', '');
  await expect(group('Inventory')).toHaveAttribute('open', '');
  await expect(group('Setup')).not.toHaveAttribute('open', '');

  await group('Inventory').locator('summary').click();
  await expect(group('Inventory')).not.toHaveAttribute('open', '');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('pl.navFolded') ?? '')).toContain('Inventory');
  await group('Setup').locator('summary').click();
  await expect(group('Setup')).toHaveAttribute('open', '');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('pl.navOpened') ?? '')).toContain('Setup');

  await page.reload();
  await expect(group('Inventory')).not.toHaveAttribute('open', '');
  await expect(group('Setup')).toHaveAttribute('open', '');
  await expect(group('Daily work')).toHaveAttribute('open', '');
});
