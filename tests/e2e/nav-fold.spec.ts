import { test, expect } from '@playwright/test';
import { signInAs } from './helpers';

test('desktop sidebar groups start open and a folded group stays folded after a refresh', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signInAs(page, 'owner');
  await page.goto('/?demo=1#overview');
  const groups = page.locator('.sidebar details');
  const n = await groups.count();
  for (let i = 0; i < n; i++) await expect(groups.nth(i)).toHaveAttribute('open', '');
  const last = groups.nth(n - 1);
  await last.locator('summary').click();
  await expect(last).not.toHaveAttribute('open', '');
  const title = (await last.locator('summary').innerText()).trim();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('pl.navFolded') ?? '')).toContain(title);
  await page.reload();
  await expect(page.locator('.sidebar details').nth(n - 1)).not.toHaveAttribute('open', '');
  await expect(page.locator('.sidebar details').nth(0)).toHaveAttribute('open', '');
});
