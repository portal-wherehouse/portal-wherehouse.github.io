import { test, expect } from '@playwright/test';
import { signInAs } from './helpers';

test('desktop sidebar: daily groups start open, setup is one item, and each fold stays after a refresh', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signInAs(page, 'owner');
  await page.goto('/?demo=1#overview');
  const group = (title: string) => page.locator('.sidebar details', { has: page.locator('summary', { hasText: title }) });
  await expect(group('Daily work')).toHaveAttribute('open', '');
  await expect(group('Inventory')).toHaveAttribute('open', '');
  // The setup tools are not a group in the sidebar any more: one "Settings and setup" item opens their page.
  await expect(group('Setup')).toHaveCount(0);
  await expect(page.locator('.sidebar .nav-foot').getByRole('button', { name: 'Settings and setup' })).toBeVisible();

  await group('Inventory').locator('summary').click();
  await expect(group('Inventory')).not.toHaveAttribute('open', '');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('pl.navFolded') ?? '')).toContain('Inventory');

  await page.reload();
  await expect(group('Inventory')).not.toHaveAttribute('open', '');
  await expect(group('Daily work')).toHaveAttribute('open', '');
});
