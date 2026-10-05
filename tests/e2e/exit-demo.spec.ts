import { test, expect } from '@playwright/test';
import { pickSample } from './helpers';

test('the sample warehouse has a large Exit demo button that goes back to the website home page', async ({ page }) => {
  await page.goto('/?demo=1#signin');
  await pickSample(page);
  await page.getByTestId('practice-setup').click();
  const exit = page.getByTestId('exit-demo');
  await expect(exit).toBeVisible();
  const box = await exit.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  await exit.click();
  await expect(page).not.toHaveURL(/demo=1/);
  await expect(page.getByTestId('exit-demo')).toHaveCount(0);
  await expect(page.locator('.home-hero')).toBeVisible();
});

for (const width of [390, 1280])
  test(`Exit demo from a sample dashboard lands on the home page, not a sign-in page (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/?demo=1&kind=rentals#signin');
    await page.getByRole('button', { name: 'View a management dashboard' }).click();
    await expect(page.locator('.topbar')).toBeVisible();
    await page.getByTestId('exit-demo').click();
    await expect(page.locator('.home-hero')).toBeVisible();
    const url = new URL(page.url());
    expect(url.search).toBe('');
    expect(url.hash).toBe('');
    await expect(page.getByRole('heading', { name: 'Sample warehouse', exact: true })).toHaveCount(0);
    await expect(page.getByTestId('hero-sample')).toHaveText(/Try the sample warehouse for your business/);
  });
