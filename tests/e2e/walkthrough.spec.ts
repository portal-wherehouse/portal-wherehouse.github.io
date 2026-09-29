// The blueprint's example shift (page 6), done through the real UI with typed codes and tracked by the
// "Practice shift" checklist, plus the offline queue, the in-app integrity lab and the viewer's limits.

import { expect, test, type Page } from '@playwright/test';
import { nav, portalReady, signInAs, typeCode, watchErrors } from './helpers';

/** The real way in: website home, "Try the demo", the front door, then a role. */
async function enterPortalAs(page: Page, role: 'Owner' | 'Supervisor' | 'Operator' | 'Viewer') {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: /Know where/ })).toBeVisible();
  await page.getByRole('button', { name: 'Sign in' }).first().click();
  await expect(page).toHaveURL(/#signin$/);
  await expect(page.getByRole('heading', { name: 'Welcome to the portal.' })).toBeVisible();
  // The role cards are labels around a visually hidden radio: click the card like a person would.
  const radio = page.getByRole('radio', { name: new RegExp(`^${role}\\b`) });
  await page.locator('label.door-role').filter({ has: page.locator('.door-role-name', { hasText: new RegExp(`^${role}$`) }) }).click();
  await expect(radio).toBeChecked();
  await page.getByRole('button', { name: 'Continue to the portal' }).click();
  await portalReady(page);
  await expect(page.locator('.demo-strip')).toContainText(`You are using the ${role} account`);
}

test('example shift through the practice shift: receive, place, move, find, dispatch, return, place again', async ({ page }) => {
  const errors = watchErrors(page);
  await enterPortalAs(page, 'Operator');

  // Settings starts the practice shift checklist.
  await nav(page, 'Settings');
  await page.getByRole('button', { name: 'Start the practice shift' }).click();
  const shift = page.getByRole('complementary', { name: 'Practice shift' });
  await expect(shift.getByRole('heading', { name: 'Practice shift · 0/7' })).toBeVisible();
  // Keep it tracking, but out of the way of the buttons under it.
  await shift.getByRole('button', { name: 'Minimize practice shift' }).click();
  await expect(shift.getByRole('button', { name: 'Expand practice shift' })).toBeVisible();

  await nav(page, 'Receive');
  await page.locator('#rcv-job').selectOption({ label: 'J-214 · School renovation' });
  await page.locator('#rcv-desc').fill('Lighting fixtures');
  await page.getByRole('button', { name: 'Save pallet' }).click();
  await expect(page.getByText('P-000042').first()).toBeVisible();
  await expect(shift.getByRole('heading', { name: 'Practice shift · 1/7' })).toBeVisible();

  await page.getByRole('button', { name: 'Place now' }).click();
  await typeCode(page, 'A-03-02');
  await page.getByRole('button', { name: 'Place: A-03-02' }).click();
  await expect(page.getByText('Placed at A-03-02')).toBeVisible();
  await expect(shift.getByRole('heading', { name: 'Practice shift · 2/7' })).toBeVisible();

  await nav(page, 'Move');
  await typeCode(page, 'p-42');
  await typeCode(page, 'B-01-01');
  await page.getByRole('button', { name: 'Move: B-01-01' }).click();
  await expect(page.getByText('Moved to B-01-01')).toBeVisible();
  await expect(shift.getByRole('heading', { name: 'Practice shift · 3/7' })).toBeVisible();

  await nav(page, 'Find');
  await page.locator('#find-q').fill('J-214');
  await page.locator('.result', { hasText: 'P-000042' }).click();
  await expect(page.locator('.tl-item')).toHaveCount(3);
  await expect(shift.getByRole('heading', { name: 'Practice shift · 4/7' })).toBeVisible();

  await page.getByRole('button', { name: 'Dispatch pallet' }).click();
  await page.locator('.sheet').getByRole('button', { name: 'Dispatch', exact: true }).click();
  await expect(page.locator('.tl-item')).toHaveCount(4);
  await expect(shift.getByRole('heading', { name: 'Practice shift · 5/7' })).toBeVisible();

  await page.getByRole('button', { name: 'Record return' }).first().click();
  await page.locator('.sheet').getByRole('button', { name: 'Record return' }).click();
  await expect(page.locator('.tl-item')).toHaveCount(5);
  await expect(shift.getByRole('heading', { name: 'Practice shift · 6/7' })).toBeVisible();

  await page.getByRole('button', { name: 'Place', exact: true }).click();
  await typeCode(page, 'A-02-01');
  await page.getByRole('button', { name: 'Place: A-02-01' }).click();
  await expect(page.getByText('Placed at A-02-01')).toBeVisible();

  await nav(page, 'Find');
  await page.locator('#find-q').fill('P-000042');
  await page.locator('.result', { hasText: 'P-000042' }).click();
  await expect(page.locator('.tl-item')).toHaveCount(6);
  await expect(shift.getByRole('heading', { name: 'Practice shift · 7/7' })).toBeVisible();

  // The finished checklist leads back to the pallet, without exposing developer tools.
  await shift.getByRole('button', { name: 'Expand practice shift' }).click();
  await expect(shift.getByText('Shift complete.')).toBeVisible();
  await expect(shift.getByRole('button', { name: 'Review pallet history' })).toBeVisible();
  await expect(shift.getByRole('button', { name: 'Open the lab' })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the Guide also starts the practice shift, and it can be closed', async ({ page }) => {
  await signInAs(page, 'operator');
  await page.goto('/#guide');
  await portalReady(page);
  await page.getByRole('button', { name: 'Start the practice shift' }).click();
  const shift = page.getByRole('complementary', { name: 'Practice shift' });
  await expect(shift.getByRole('heading', { name: 'Practice shift · 0/7' })).toBeVisible();
  await expect(shift.getByText('Receive a delivery')).toBeVisible();
  await shift.getByRole('button', { name: 'Take me there' }).click();
  await expect(page).toHaveURL(/#receive$/);
  await shift.getByRole('button', { name: 'Close practice shift' }).click();
  await expect(shift).toHaveCount(0);
});

test('offline move is queued, then saved when the connection returns', async ({ page }) => {
  await signInAs(page, 'operator');
  await page.goto('/#sync');
  await portalReady(page);
  await page.getByRole('button', { name: 'Offline (dead zone)' }).click();
  await nav(page, 'Move');
  await typeCode(page, 'P-000014');
  await typeCode(page, 'A-03-02');
  await page.getByRole('button', { name: 'Queue: move A-03-02' }).click();
  await expect(page.getByText('Queued on this device, not confirmed')).toBeVisible();
  await page.getByRole('button', { name: 'Reconnect' }).click();
  await expect(page.getByText('Back online: 1 queued change saved')).toBeVisible();
});

test('integrity lab: every blueprint scenario passes in the browser', async ({ page }) => {
  await signInAs(page, 'operator');
  await page.goto('/#lab');
  await portalReady(page);
  const run = page.getByRole('button', { name: /^Run all/ });
  const total = Number((await run.textContent())?.match(/\((\d+)\)/)?.[1]);
  expect(total).toBeGreaterThan(0);
  await run.click();
  await expect(page.getByText(`${total} passed`)).toBeVisible({ timeout: 45_000 });
  await expect(page.locator('.fail')).toHaveCount(0);
});

test('the Demo Viewer role cannot change anything', async ({ page }) => {
  await enterPortalAs(page, 'Viewer');
  await expect(page.getByRole('button', { name: /^Account: .*Demo Viewer$/ })).toBeVisible();
  await expect(page.locator('.sidebar').getByRole('button', {name:'Receive',exact:true})).toHaveCount(0);
  await page.goto('/#receive');
  await expect(page.getByText('Receiving pallets needs Operator access')).toBeVisible();
  await page.goto('/#move');
  await expect(page.getByText('Moving pallets needs Operator access')).toBeVisible();
  // The Scan station leaves only Look up open.
  await page.goto('/#station');
  await expect(page.getByText('Look up only for Viewer accounts')).toBeVisible();
  await expect(page.getByRole('group', { name: 'Station mode' }).getByRole('button', { name: /Move/ })).toBeDisabled();
});
