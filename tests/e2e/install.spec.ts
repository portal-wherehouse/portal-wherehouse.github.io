// Home-screen app: the phone banner, the install steps in Help, hiding both inside the installed app,
// Android's one-tap Install, and the "New version ready" prompt after a deploy.

import { expect, test, type Page } from '@playwright/test';
import { portalReady, signInAs, watchErrors } from './helpers';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36';

const banner = (page: Page) => page.getByRole('complementary', { name: 'Install Wherehouse' });

test.describe('on an iPhone', () => {
  test.use({ userAgent: IPHONE, viewport: { width: 390, height: 844 }, hasTouch: true });

  test('offers to install, shows the Safari steps, and Not now hides the banner', async ({ page }) => {
    const errors = watchErrors(page);
    await signInAs(page, 'owner');
    await page.goto('/#overview');
    await expect(page.locator('.topbar')).toBeVisible();
    await expect(banner(page)).toBeVisible();
    await expect(banner(page)).toContainText('Install Wherehouse on this phone');

    await banner(page).getByRole('button', { name: 'Show me how' }).click();
    const section = page.locator('#help-install');
    await expect(section).toBeVisible();
    await expect(section.getByRole('button', { name: 'iPhone or iPad' })).toHaveAttribute('aria-pressed', 'true');
    await expect(section).toContainText('Add to Home Screen');
    await expect(section).toContainText('Share');
    await expect(section.getByRole('button', { name: /^Install Wherehouse/ })).toHaveCount(0);
    // The steps for other devices are one tap away.
    await section.getByRole('button', { name: 'Android' }).click();
    await expect(section).toContainText('Add to home screen');
    await section.getByRole('button', { name: 'Computer' }).click();
    await expect(section).toContainText('Install page as app');

    await page.goto('/#find');
    await banner(page).getByRole('button', { name: 'Not now' }).click();
    await expect(banner(page)).toHaveCount(0);
    await page.reload();
    await expect(page.locator('.topbar')).toBeVisible();
    await expect(banner(page)).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('inside the installed app, the banner and the install steps are gone', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'standalone', { value: true, configurable: true });
    });
    await signInAs(page, 'owner');
    await page.goto('/#overview');
    await expect(page.locator('.topbar')).toBeVisible();
    await expect(banner(page)).toHaveCount(0);
    await page.goto('/#help');
    await expect(page.getByRole('heading', { level: 1, name: 'Help' })).toBeVisible();
    await expect(page.locator('#help-install')).toHaveCount(0);
    await expect(page.locator('.help-nav')).not.toContainText('Install app');
  });
});

test.describe('on an Android phone', () => {
  test.use({ userAgent: ANDROID, viewport: { width: 412, height: 915 }, hasTouch: true });

  test('Install opens the browser prompt in one tap', async ({ page }) => {
    await signInAs(page, 'owner');
    await page.goto('/#overview');
    await expect(page.locator('.topbar')).toBeVisible();
    await expect(banner(page).getByRole('button', { name: 'Show me how' })).toBeVisible();
    // Chrome fires this once the app qualifies for installing.
    await page.evaluate(() => {
      const e = new Event('beforeinstallprompt', { cancelable: true }) as Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> };
      e.prompt = async () => {
        (window as unknown as { __prompted: boolean }).__prompted = true;
      };
      e.userChoice = Promise.resolve({ outcome: 'accepted' });
      window.dispatchEvent(e);
    });
    await banner(page).getByRole('button', { name: 'Install Wherehouse' }).click();
    expect(await page.evaluate(() => (window as unknown as { __prompted?: boolean }).__prompted)).toBe(true);
    await expect(banner(page)).toHaveCount(0);
  });
});

test('computers get no banner, and Help has the install steps', async ({ page }) => {
  await signInAs(page, 'owner');
  await page.goto('/#help?q=install');
  await portalReady(page);
  await expect(banner(page)).toHaveCount(0);
  const section = page.locator('#help-install');
  await expect(section).toBeVisible();
  await expect(section.getByRole('button', { name: 'Computer' })).toHaveAttribute('aria-pressed', 'true');
  await expect(section).toContainText('Microsoft Edge');
});

test('a newer deploy shows New version ready, and Reload loads it', async ({ page }) => {
  await page.route('**/version.json*', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ build: 'newer-build' }) }));
  await signInAs(page, 'owner');
  await page.goto('/#overview');
  await portalReady(page);
  const prompt = page.locator('.toasts').getByRole('status').filter({ hasText: 'New version ready' });
  await expect(prompt).toBeVisible();
  await page.evaluate(() => ((window as unknown as { __before: boolean }).__before = true));
  await prompt.getByRole('button', { name: 'Reload' }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __before?: boolean }).__before ?? false)).toBe(false);
  await portalReady(page);
});

test('the current deploy shows no update prompt', async ({ page }) => {
  await signInAs(page, 'owner');
  await page.goto('/#overview');
  await portalReady(page);
  const check = page.waitForResponse((r) => r.url().includes('version.json'));
  await page.reload();
  expect((await check).ok()).toBe(true);
  await portalReady(page);
  await page.waitForTimeout(500);
  await expect(page.getByText('New version ready')).toHaveCount(0);
});
