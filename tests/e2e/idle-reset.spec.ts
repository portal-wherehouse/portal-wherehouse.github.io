import { test, expect } from '@playwright/test';
import { signInAs } from './helpers';

test('reopening the portal after two hours away starts on the Dashboard, but a link to another screen still opens it', async ({ page }) => {
  await signInAs(page, 'owner');
  await page.goto('/?demo=1#move');
  await expect(page.getByRole('heading', { name: 'Move pallet', exact: true })).toBeVisible();
  const away = () => page.evaluate(() => localStorage.setItem('pl.lastActive', String(Date.now() - 3 * 60 * 60 * 1000)));
  // Same screen reopened later: Dashboard.
  await away();
  await page.goto('about:blank');
  await page.goto('/?demo=1#move');
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
  // A link to a different screen: that screen.
  await away();
  await page.goto('about:blank');
  await page.goto('/?demo=1#find');
  await expect(page.locator('#find-q')).toBeVisible();
});
