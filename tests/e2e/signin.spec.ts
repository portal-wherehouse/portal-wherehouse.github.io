// The portal's front door (#signin) and the demo accounts: deep links carry on after choosing a role,
// roles can be switched from the top bar, leaving the portal goes back to the website, and the busy
// sample data adds a second company that stays apart.

import { expect, test } from '@playwright/test';
import { portalReady, signInAs, watchErrors } from './helpers';

const roleCard = (page: import('@playwright/test').Page, name: RegExp) =>
  page.locator('label.door-role').filter({ has: page.locator('.door-role-name', { hasText: name }) });

test('a portal link opened without an account asks for a role, then opens that page', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/#receive');
  await expect(page.getByRole('heading', { name: 'Welcome to the portal.' })).toBeVisible();
  await expect(page.getByText('Then we will open Receive, the page you asked for.')).toBeVisible();
  await roleCard(page, /^Operator$/).click();
  await page.getByRole('button', { name: 'Continue to the portal' }).click();
  await portalReady(page);
  await expect(page).toHaveURL(/#receive$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Receive a pallet' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('the front door offers to carry on when already signed in', async ({ page }) => {
  await signInAs(page, 'supervisor');
  await page.goto('/#signin');
  await expect(page.getByRole('heading', { name: 'You are already in' })).toBeVisible();
  await expect(page.getByText('Using the Supervisor account')).toBeVisible();
  await page.getByRole('button', { name: /^Continue as Supervisor/ }).click();
  await portalReady(page);
  await expect(page.locator('.demo-strip')).toContainText('You are using the Supervisor account');
});

test('switch role from the top bar, then leave the portal', async ({ page }) => {
  const errors = watchErrors(page);
  await signInAs(page, 'owner');
  await page.goto('/#find');
  await portalReady(page);
  await expect(page.getByRole('button', { name: /^Account: .*Demo Owner$/ })).toBeVisible();

  await page.locator('.demo-strip').getByRole('button', { name: 'Switch demo account' }).click();
  const sheet = page.getByRole('dialog', { name: 'Demo accounts' });
  await expect(sheet.locator('.person')).toHaveCount(4);
  // Demo accounts carry role names, never people's names.
  for (const name of await sheet.locator('.p-name').allTextContents()) expect(name).toMatch(/^Demo (Owner|Supervisor|Operator|Viewer)$/);
  await sheet.locator('.person', { has: page.locator('.p-role', { hasText: /^Viewer$/ }) }).click();
  await expect(page.getByText('Now signed in as Demo Viewer (Viewer)')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Account: .*Demo Viewer$/ })).toBeVisible();
  await expect(page.locator('.demo-strip')).toContainText('You are using the Viewer account');

  await page.getByRole('button', { name: /^Account: .*Demo Viewer$/ }).click();
  await page.getByRole('dialog', { name: 'Demo accounts' }).getByRole('button', { name: 'Leave the portal' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Know where');
  await expect(page.locator('.topbar')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('pl.actor'))).toBeNull();
  expect(errors).toEqual([]);
});

test('the busy sample data adds a second company, Harborline Supply, that stays apart', async ({ page }) => {
  test.setTimeout(90_000);
  await signInAs(page, 'owner');
  await page.goto('/#settings');
  await portalReady(page);
  await page.getByRole('button', { name: 'Load busy warehouse' }).click();
  await page.getByRole('dialog', { name: 'Load the busy warehouse?' }).getByRole('button', { name: 'Load it' }).click();
  await expect(page.getByText('Loaded the busy warehouse: 200 pallets and a second company')).toBeVisible({ timeout: 30_000 });

  // Settings opens the account sheet, which now lists the second company's owner.
  await page.getByRole('button', { name: 'Choose another demo account' }).click();
  const sheet = page.getByRole('dialog', { name: 'Demo accounts' });
  await expect(sheet.getByText('Harborline Supply').first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);

  // The front door has its own card for the second company too.
  await page.goto('/#signin');
  await expect(page.getByRole('group', { name: 'Or try the second company' })).toBeVisible();
  await roleCard(page, /^Harborline Supply/).click();
  await page.getByRole('button', { name: 'Continue to the portal' }).click();
  await portalReady(page);
  await expect(page.locator('.wh-chip')).toHaveAttribute('title', /^Harborline Supply/);

  // Its records are its own: its J-214 is the Marina boardwalk, and none of the main yard's pallets show.
  await page.locator('.sidebar').getByRole('button', { name: 'Find', exact: true }).click();
  await page.locator('#find-q').fill('Marine hardware');
  await expect(page.locator('.result')).toHaveCount(6);
  await page.locator('#find-q').fill('Ceiling tile');
  await expect(page.getByText(/No pallets match/)).toBeVisible();
  await expect(page.locator('.result')).toHaveCount(0);

  // And the main company never sees Harborline's.
  await page.getByRole('button', { name: /^Account:/ }).click();
  await page.getByRole('dialog', { name: 'Demo accounts' }).getByRole('button', { name: 'Leave the portal' }).click();
  await page.getByRole('button', { name: 'Sign in' }).first().click();
  await roleCard(page, /^Owner$/).click();
  await page.getByRole('button', { name: 'Continue to the portal' }).click();
  await portalReady(page);
  await expect(page.locator('.wh-chip')).toHaveAttribute('title', /^Northfield Builders/);
  await page.locator('.sidebar').getByRole('button', { name: 'Find', exact: true }).click();
  await page.locator('#find-q').fill('Ceiling tile');
  await expect(page.locator('.result').first()).toBeVisible();
  await page.locator('#find-q').fill('Marine hardware');
  await expect(page.getByText(/No pallets match/)).toBeVisible();
  await expect(page.locator('.result')).toHaveCount(0);
});
