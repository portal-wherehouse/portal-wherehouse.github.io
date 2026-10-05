import { expect, test, type BrowserContext } from '@playwright/test';

// Fakes a custom domain: example.test (website), www.example.test and app.example.test (portal) are all
// answered by the local preview server, so the host split can be checked end to end.
const SITE = 'https://example.test';
const APP = 'https://app.example.test';

test.use({ serviceWorkers: 'block' });

async function fakeDomain(context: BrowserContext, baseURL: string) {
  await context.route(/^https:\/\/(?:www\.|app\.)?example\.test\//, async (route) => {
    const url = new URL(route.request().url());
    // A host redirect (location.replace) can leave the old page while its files are still loading;
    // a request that outlives its page is dropped instead of failing the test.
    try {
      const response = await route.fetch({ url: `${baseURL}${url.pathname}${url.search}` });
      await route.fulfill({ response });
    } catch (e) {
      if (!/closed|detached/i.test(String(e))) throw e;
    }
  });
}

test.beforeEach(async ({ context, baseURL }) => fakeDomain(context, baseURL!));

test('the website keeps its pages and sends the portal to app.', async ({ page }) => {
  await page.goto(`${SITE}/`);
  await expect(page.locator('.home-hero')).toBeVisible();
  await expect(page.getByTestId('hero-sample')).toHaveAttribute('href', `${APP}/?demo=1#signin`);
  await page.goto(`${SITE}/#pricing`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Start with what you have.');
  await expect(page).toHaveURL(`${SITE}/#pricing`);
  await page.locator('.shell-header [data-portal-cta]').click();
  await expect(page).toHaveURL(`${APP}/#signin`);
  await expect(page.getByRole('heading', { name: 'Sample warehouse', exact: true })).toBeVisible();
});

test('portal addresses, #start and sample links on the website open on app.', async ({ page }) => {
  await page.goto(`${SITE}/#signin`);
  await expect(page).toHaveURL(`${APP}/#signin`);
  await page.goto(`${SITE}/?demo=1#signin`);
  await expect(page).toHaveURL(`${APP}/?demo=1#signin`);
  await page.goto(`https://www.example.test/#start`);
  await expect(page).toHaveURL(`${APP}/#start`);
  await page.goto(`${SITE}/#pricing`);
  await page.getByRole('button', { name: 'Start your free trial' }).first().click();
  await expect(page).toHaveURL(`${APP}/#start`);
});

test('app. opens the portal and sends website pages to the website', async ({ page }) => {
  await page.goto(`${APP}/`);
  await expect(page).toHaveURL(`${APP}/#overview`);
  await expect(page.getByRole('heading', { name: 'Sample warehouse', exact: true })).toBeVisible();
  await expect(page.locator('.home-hero')).toHaveCount(0);
  await page.getByRole('button', { name: 'Back to the website' }).click();
  await expect(page).toHaveURL(`${SITE}/`);
  await expect(page.locator('.home-hero')).toBeVisible();
  await page.goto(`${APP}/?demo=1#pricing`);
  await expect(page).toHaveURL(`${SITE}/#pricing`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Start with what you have.');
});

test('a group page opens its own sample on app., and Exit demo goes to the website home page, not app. sign-in', async ({ page }) => {
  await page.goto(`${SITE}/#for/parts`);
  await expect(page.getByTestId('group-sample')).toHaveAttribute('href', `${APP}/?demo=1&kind=parts#signin`);
  await page.getByTestId('group-sample').click();
  await expect(page).toHaveURL(`${APP}/?demo=1&kind=parts#signin`);
  await expect(page.locator('.sd-picked')).toContainText('parts room');
  await page.getByRole('button', { name: 'View a management dashboard' }).click();
  await expect(page.getByTestId('sample-kind')).toHaveValue('parts');
  await expect(page.getByTestId('exit-demo')).toHaveAttribute('href', `${SITE}/`);
  await page.getByTestId('exit-demo').click();
  await expect(page).toHaveURL(`${SITE}/`);
  await expect(page.locator('.home-hero')).toBeVisible();
});
