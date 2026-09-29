// Smoke test: every portal page opens from its link with its heading and without errors, and no page
// of the website or the portal scrolls sideways on a phone.

import { expect, test } from '@playwright/test';
import { signInAs, watchErrors } from './helpers';

const PORTAL: [hash: string, h1: string][] = [
  ['overview', 'Overview'],
  ['receive', 'Receive a pallet'],
  ['move', 'Move pallet'],
  ['find', 'Find materials'],
  ['map', 'Warehouse map'],
  ['activity', 'Activity'],
  ['reconcile', 'Reconcile'],
  ['jobs', 'Jobs'],
  ['locations', 'Locations'],
  ['labels', 'Labels'],
  ['import', 'Import'],
  ['export', 'Export'],
  ['people', 'People'],
  ['sync', 'Sync and offline'],
  ['lab', 'Integrity lab'],
  ['guide', 'Guide'],
  ['settings', 'Settings'],
  ['about', 'About'],
  ['more', 'More'],
  ['help', 'Help'],
  ['scanners', 'Scanners'],
  ['station', 'Scan station'],
  ['data', 'Data and storage'],
];

const SITE = ['', 'product', 'showcase', 'simple', 'hardware', 'industries', 'customers', 'pricing', 'founder', 'contact', 'security', 'signin'];

/** A fresh document for each link, like opening it in a new tab. */
async function open(page: import('@playwright/test').Page, hash: string) {
  await page.goto('about:blank');
  await page.goto(hash ? `/#${hash}` : '/');
}

test('every portal page opens from its link, with its heading and no errors', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await signInAs(page, 'owner');
  for (const [hash, title] of PORTAL) {
    await open(page, hash);
    await expect(page.locator('#main h1'), `#${hash}`).toHaveText(title);
    await expect(page.locator('.sidebar [aria-current="page"]'), `#${hash} is marked in the sidebar`).toHaveCount(hash === 'more' ? 0 : 1);
  }
  expect(errors).toEqual([]);
});

test('on a phone, no website or portal page scrolls sideways', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = watchErrors(page);
  const wide: string[] = [];
  for (const hash of SITE) {
    await open(page, hash);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (over > 0) wide.push(`#${hash || 'home'} by ${over}px`);
  }
  await signInAs(page, 'owner');
  for (const [hash] of PORTAL) {
    await open(page, hash);
    await expect(page.locator('#main h1')).toBeVisible();
    await expect(page.locator('.bottom-nav')).toBeVisible();
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (over > 0) wide.push(`#${hash} by ${over}px`);
  }
  expect(wide).toEqual([]);
  expect(errors).toEqual([]);
});

test('on a phone, the bottom tabs and More reach the portal pages', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAs(page, 'operator');
  await page.goto('/#find');
  const tabs = page.getByRole('navigation', { name: 'Main' }).filter({ has: page.locator('button', { hasText: 'More' }) }).last();
  await tabs.getByRole('button', { name: 'Receive' }).click();
  await expect(page.locator('#main h1')).toHaveText('Receive a pallet');
  await tabs.getByRole('button', { name: 'Move' }).click();
  await expect(page.locator('#main h1')).toHaveText('Move pallet');
  await tabs.getByRole('button', { name: 'More' }).click();
  await expect(page.locator('#main h1')).toHaveText('More');
  await page.locator('#main').getByRole('button', { name: /Scan station/ }).click();
  await expect(page.locator('#main h1')).toHaveText('Scan station');
  await expect(tabs.getByRole('button', { name: 'More' })).toHaveAttribute('aria-current', 'page');
});
