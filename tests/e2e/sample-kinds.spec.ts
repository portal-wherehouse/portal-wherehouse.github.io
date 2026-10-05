import { expect, test, type Page } from '@playwright/test';
import { INDUSTRIES } from '../../src/demo/industries';
import { watchErrors } from './helpers';

// The sample warehouse for each kind of business: the front door's "Try the sample warehouse for your…" picker, the
// switcher at the top of every sample page, the demo-only Add warehouse button, and the sample data for every business.

const over = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

for (const width of [390, 1280]) {
  test(`pick a kind of business, open its sample, then switch business and keep the screen (${width}px)`, async ({ page }) => {
    const errors = watchErrors(page);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.goto('/?demo=1#signin');
    await expect(page.getByRole('heading', { name: 'Sample warehouse', exact: true })).toBeVisible();
    const kinds = page.getByRole('list', { name: 'Kinds of business' }).getByRole('button');
    await expect(kinds).toHaveCount(8);
    expect(await over(page)).toBeLessThanOrEqual(0);

    // Picking one shows that business and the three ways in; Change goes back to the list.
    await kinds.filter({ hasText: 'Lumberyard or building supply' }).click();
    await expect(page.locator('.sample-choice')).toHaveCount(3);
    await expect(page.locator('.sd-picked')).toContainText('lumberyard');
    await expect(page.locator('.sd-for')).toContainText('lumberyard');
    await expect(page).toHaveURL(/[?&]kind=lumberyards/);
    expect(await over(page)).toBeLessThanOrEqual(0);
    await page.getByRole('button', { name: 'Change', exact: true }).click();
    await expect(page.locator('.sample-choice')).toHaveCount(0);
    await expect(kinds).toHaveCount(8);
    await kinds.filter({ hasText: 'Lumberyard or building supply' }).click();
    await page.getByRole('button', { name: 'View a management dashboard' }).click();

    // Everything inside is the lumberyard's: its name, its orders.
    const kind = page.getByTestId('sample-kind');
    await expect(kind).toHaveValue('lumberyards');
    await expect(page.locator('.warehouse-name-button')).toHaveText('Main yard');
    await page.goto('/?demo=1&kind=lumberyards#orders');
    await expect(page.getByTestId('order-list').locator('.order-row')).toHaveCount(4);
    await expect(page.getByTestId('order-list')).toContainText('Ridgeline Homes, lot 14 framing');
    await expect(page.getByTestId('order-list')).toContainText('Kowalski Remodeling (will call)');
    expect(await over(page)).toBeLessThanOrEqual(0);

    // Switching keeps the view and the screen, and the address remembers the business.
    await kind.selectOption('rentals');
    await expect(page.getByTestId('order-list')).toContainText('Riverside Gardens wedding');
    await expect(page.getByTestId('order-list')).not.toContainText('Ridgeline Homes');
    await expect(page).toHaveURL(/[?&]kind=rentals#orders/);
    await expect(page.locator('.acct-chip')).toHaveAttribute('aria-label', /Owner/);
    expect(await over(page)).toBeLessThanOrEqual(0);
    await page.reload();
    await expect(page.getByTestId('sample-kind')).toHaveValue('rentals');
    await expect(page.getByTestId('order-list')).toContainText('Riverside Gardens wedding');
    expect(errors).toEqual([]);
  });

  test(`Add warehouse in the sample is a friendly demo button (${width}px)`, async ({ page }) => {
    const errors = watchErrors(page);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.goto('/?demo=1&kind=manufacturing#signin');
    await page.getByRole('button', { name: 'View a management dashboard' }).click();
    await page.locator('.warehouse-name-button').click();
    await page.getByRole('menu', { name: 'Warehouse menu' }).getByRole('menuitem', { name: /Add warehouse/ }).click();
    const sheet = page.getByTestId('demo-only');
    await expect(page.getByRole('heading', { name: 'Oops! This is just a demo button' })).toBeVisible();
    await expect(sheet).toContainText('create your warehouse');
    await expect(sheet.getByRole('link', { name: 'Create your warehouse' })).toHaveAttribute('href', '/#start');
    expect(await over(page)).toBeLessThanOrEqual(1);
    await sheet.getByRole('link', { name: 'Go to the homepage' }).click();
    await expect(page.locator('.home-hero')).toBeVisible();
    expect(new URL(page.url()).search).toBe('');
    expect(errors).toEqual([]);
  });
}

test('the employee view stays the employee view when the business changes', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/?demo=1&kind=facilities#signin');
  await expect(page.locator('.sample-choice')).toHaveCount(3);
  await page.getByRole('button', { name: 'View an employee dashboard' }).click();
  await expect(page.locator('.acct-chip')).toHaveAttribute('aria-label', /Demo Custodian/);
  await page.getByTestId('sample-kind').selectOption('retail');
  await expect(page.locator('.acct-chip')).toHaveAttribute('aria-label', /Demo Stock Associate/);
  await expect(page.locator('.warehouse-name-button')).toHaveText('Main store');
  await expect(page).toHaveURL(/#overview$/);
});

for (const s of INDUSTRIES)
  test(`the ${s.id} sample has its own records, orders, low stock, lots and incoming`, async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(`/?demo=1&kind=${s.id}#signin`);
    await expect(page.locator('.sd-picked')).toContainText(s.your);
    await page.getByRole('button', { name: 'View a management dashboard' }).click();
    await expect(page.getByTestId('sample-kind')).toHaveValue(s.id);
    await expect(page.locator('.warehouse-name-button')).toHaveText(s.facility);
    await page.goto(`/?demo=1&kind=${s.id}#orders`);
    await expect(page.getByTestId('order-list').locator('.order-row')).toHaveCount(4);
    for (const o of s.orders) await expect(page.getByTestId('order-list')).toContainText(o.customer);
    await page.goto(`/?demo=1&kind=${s.id}#find`);
    await page.locator('#find-q').fill(s.stock[0]);
    await expect(page.locator('.result').first()).toContainText(s.stock[0]);
    await page.goto(`/?demo=1&kind=${s.id}#reconcile?q=low`);
    await expect(page.getByTestId('low-row')).toHaveCount(2);
    await page.goto(`/?demo=1&kind=${s.id}#incoming`);
    await expect(page.getByTestId('incoming-list').locator('.import-row')).toHaveCount(2);
    await page.goto(`/?demo=1&kind=${s.id}#reconcile?q=expiring`);
    await expect(page.locator('.result-card')).toHaveCount(3);
    expect(errors).toEqual([]);
  });
