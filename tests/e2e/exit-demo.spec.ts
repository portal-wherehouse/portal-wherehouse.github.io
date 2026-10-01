import { test, expect } from '@playwright/test';

test('the sample warehouse has a large Exit demo button that goes back to the website', async ({ page }) => {
  await page.goto('/?demo=1#signin');
  await page.getByTestId('practice-setup').click();
  const exit = page.getByTestId('exit-demo');
  await expect(exit).toBeVisible();
  const box = await exit.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  await exit.click();
  await expect(page).not.toHaveURL(/demo=1/);
  await expect(page.getByTestId('exit-demo')).toHaveCount(0);
});
