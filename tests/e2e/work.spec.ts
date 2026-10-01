import { expect, test, type Page } from '@playwright/test';
import { nav, portalReady, signInAs, typeCode, watchErrors } from './helpers';

// Scheduled counts, moves to do, lots and expiry, returns with a condition and warehouse access per person, as the
// sample shows them on first open.

async function noSideScroll(page: Page) {
  const before = page.viewportSize();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  if (before) await page.setViewportSize(before);
}

async function stationType(page: Page, code: string) {
  await page.locator('#st-code').fill(code);
  await page.locator('#st-code').press('Enter');
}

async function openPallet(page: Page, code: string) {
  await nav(page, 'Find');
  await page.locator('#find-q').fill(code);
  await page.locator('button.result', { hasText: code }).first().click();
  await expect(page.locator('.page-title')).toContainText(code);
}

test('scheduled count: the operator sees it on the dashboard, counts each spot and sends it', async ({ page }) => {
  const errors = watchErrors(page);
  await signInAs(page, 'operator');
  await page.goto('/?demo=1#overview');
  await portalReady(page);
  const card = page.getByTestId('my-counts-card');
  await expect(card).toContainText('Zone B');
  await expect(page.getByTestId('my-moves-card')).toContainText('Moves to do');
  await noSideScroll(page);
  await card.click();

  const panel = page.getByTestId('scheduled-counts');
  await expect(panel.getByTestId('count-row').filter({ hasText: 'Zone B' })).toContainText('Due today');
  await noSideScroll(page);
  await panel.getByRole('button', { name: 'Start Zone B' }).click();
  const run = page.getByTestId('count-run');
  await expect(run).toBeVisible();
  const spots = (await run.locator('.sc-spot').allTextContents()).map((t) => t.trim());
  expect(spots.length).toBeGreaterThan(1);
  await expect(page.locator('#st-prompt')).toHaveText(`Scan ${spots[0]}`);

  // A spot that is not on the count is refused.
  await stationType(page, 'A-01-01');
  await expect(page.locator('.st-flash')).toContainText('A-01-01 is not on Zone B');
  await expect(run.getByTestId('send-count')).toBeDisabled();

  for (const [i, spot] of spots.entries()) {
    await stationType(page, spot);
    await page.getByRole('button', { name: 'Finish and compare' }).click();
    await expect(page.locator('.st-flash')).toContainText(`${spot} counted`);
    if (i < spots.length - 1) await expect(page.locator('#st-prompt')).toHaveText(`Scan ${spots[i + 1]}`);
  }
  await expect(page.locator('#st-prompt')).toHaveText('Send the count');
  await noSideScroll(page);
  await run.getByTestId('send-count').click();
  await expect(page.locator('.st-flash')).toContainText('Zone B is sent. A manager reviews the differences');
  await expect(page.getByTestId('count-run')).toHaveCount(0);
  await expect(page.getByText('2 counts you sent are waiting for a manager.')).toBeVisible();
  expect(errors).toEqual([]);
});

test('scheduled count: a manager reviews the differences, saves them and schedules another', async ({ page }) => {
  const errors = watchErrors(page);
  await signInAs(page, 'supervisor');
  await page.goto('/?demo=1#overview');
  await portalReady(page);
  await page.getByTestId('review-counts-card').click();
  const panel = page.getByTestId('scheduled-counts');
  await panel.getByRole('button', { name: 'Review A-01-02' }).click();
  const review = page.getByTestId('count-review');
  await expect(review.locator('.task-row')).toHaveCount(1);
  const missing = (await review.locator('.task-row .pcode').textContent())!.trim();
  await expect(review).toContainText('Not found. Saving marks it missing.');
  await noSideScroll(page);
  await review.getByRole('button', { name: 'Save the count' }).click();
  await expect(page.getByText('Count saved to the records')).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Review A-01-02' })).toHaveCount(0);

  await panel.getByRole('button', { name: 'Schedule a count' }).click();
  await page.getByRole('button', { name: 'One spot' }).click();
  await page.locator('#sc-spot').selectOption({ label: 'A-01-01' });
  await page.locator('#sc-repeat').selectOption('monthly');
  await page.locator('.sheet').getByRole('button', { name: 'Schedule', exact: true }).click();
  await expect(page.getByText('Count scheduled')).toBeVisible();
  await expect(panel.getByTestId('count-row').filter({ hasText: 'A-01-01' })).toContainText('every month');

  await openPallet(page, missing);
  await expect(page.locator('.page-head, .page-title').first()).toBeVisible();
  await expect(page.getByText('Missing', { exact: true }).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('moves to do: scan the pallet, then its spot, and the list ticks off with the camera still on', async ({ page }) => {
  const errors = watchErrors(page);
  await signInAs(page, 'operator');
  await page.goto('/?demo=1#move?q=tasks');
  await portalReady(page);
  const list = page.getByTestId('move-tasks');
  await expect(list.getByTestId('task-row')).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'To do' })).toHaveAttribute('aria-pressed', 'true');
  await noSideScroll(page);

  await typeCode(page, 'P-000002');
  await expect(page.getByText('P-000002 scanned. Take it to A-01-01.')).toBeVisible();
  await typeCode(page, 'A-01-01');
  await expect(page.getByText('P-000002 is on A-01-01. 2 moves left.')).toBeVisible();
  await expect(list.getByTestId('task-row')).toHaveCount(2);

  await typeCode(page, 'P-000003');
  await typeCode(page, 'A-01-01');
  await expect(page.getByText('That is A-01-01. Take P-000003 to B-02-01.')).toBeVisible();
  await typeCode(page, 'B-02-01');
  await expect(page.getByText('P-000003 is on B-02-01. 1 move left.')).toBeVisible();
  await expect(list.getByTestId('task-row')).toHaveCount(1);
  await expect(list.locator('.task-done summary')).toContainText('Done recently · 2');
  expect(errors).toEqual([]);
});

test('moves to do: a manager queues pallets to put away and cancels one', async ({ page }) => {
  const errors = watchErrors(page);
  await signInAs(page, 'supervisor');
  await page.goto('/?demo=1#move?q=tasks');
  await portalReady(page);
  const list = page.getByTestId('move-tasks');
  await list.getByRole('button', { name: 'Queue moves' }).click();
  await page.locator('#q-codes').fill('P-000005, NOPE-1');
  await expect(page.locator('.sheet')).toContainText('NOPE-1');
  await page.locator('#q-codes').fill('P-000005');
  await page.locator('#q-to').selectOption({ label: 'A-01-01' });
  await page.locator('.sheet').getByRole('button', { name: 'Queue 1 move' }).click();
  await expect(page.getByText('1 move queued')).toBeVisible();
  await expect(list.getByTestId('task-row')).toHaveCount(4);
  await list.getByRole('button', { name: 'Cancel the move of P-000005' }).click();
  await page.locator('.sheet').getByRole('button', { name: 'Cancel the move' }).click();
  await expect(list.getByTestId('task-row')).toHaveCount(3);
  await noSideScroll(page);
  expect(errors).toEqual([]);
});

test('lots and expiry: Expiring soon, receive fields, the Settings toggle and oldest first in Find', async ({ page }) => {
  const errors = watchErrors(page);
  await signInAs(page, 'supervisor');
  await page.goto('/?demo=1#reconcile?q=expiring');
  await portalReady(page);
  await expect(page.getByRole('tab', { name: /Expiring soon/ })).toHaveAttribute('aria-selected', 'true');
  const rows = page.locator('.result-card');
  await expect(rows).toHaveCount(3);
  await expect(rows.first()).toContainText('Lot L-2405');
  await expect(rows.first()).toContainText('Expired 5 days ago');
  await expect(rows.nth(1)).toContainText('Expires in 9 days');
  await noSideScroll(page);

  await nav(page, 'Find');
  await page.locator('#find-q').fill('SAN-500');
  await expect(page.locator('button.result').first()).toContainText('Lot L-2405');

  await nav(page, 'Receive');
  await expect(page.locator('#pallet-lot')).toBeVisible();
  await expect(page.locator('#pallet-expires')).toBeVisible();
  await noSideScroll(page);

  await nav(page, 'Settings');
  const setting = page.getByTestId('lots-setting');
  await setting.getByLabel('Track lots and expiry').click();
  await expect(page.getByText('Receive no longer asks for lots')).toBeVisible();
  await expect(setting.getByLabel('Track lots and expiry')).not.toBeChecked();
  await nav(page, 'Receive');
  await expect(page.locator('#rcv-desc')).toBeVisible();
  await expect(page.locator('#pallet-lot')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('returns: a damaged return goes on hold in quarantine with its reason', async ({ page }) => {
  const errors = watchErrors(page);
  await signInAs(page, 'supervisor');
  await page.goto('/?demo=1#overview');
  await portalReady(page);
  await openPallet(page, 'P-000402');
  await page.getByRole('button', { name: 'Dispatch pallet' }).click();
  await page.locator('#act-dest').fill('Corner store');
  await page.locator('.sheet').getByRole('button', { name: 'Dispatch', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Record return' }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Record return' }).first().click();
  const sheet = page.locator('.sheet');
  await sheet.getByRole('button', { name: 'Damaged' }).click();
  await expect(sheet.locator('#act-ret-spot')).toHaveValue(/.+/);
  // A damaged return needs a reason.
  await sheet.getByRole('button', { name: 'Record return' }).click();
  await expect(sheet.getByText('Required.')).toBeVisible();
  await sheet.getByRole('button', { name: 'Damaged in transit' }).click();
  await noSideScroll(page);
  await sheet.getByRole('button', { name: 'Record return' }).click();
  await expect(page.locator('.sheet')).toHaveCount(0);
  await expect(page.getByText('Returned damaged: Damaged in transit').first()).toBeVisible();
  await expect(page.getByText('QUARANTINE-01').first()).toBeVisible();

  // Restock puts a returned pallet back on a spot it can be picked from.
  await openPallet(page, 'P-000403');
  await page.getByRole('button', { name: 'Dispatch pallet' }).click();
  await page.locator('#act-dest').fill('Corner store');
  await page.locator('.sheet').getByRole('button', { name: 'Dispatch', exact: true }).click();
  await page.getByRole('button', { name: 'Record return' }).first().click();
  await sheet.getByRole('button', { name: 'Restock' }).click();
  await expect(sheet.locator('#act-ret-spot')).toHaveValue(/.+/);
  await sheet.getByRole('button', { name: 'Record return' }).click();
  await expect(page.locator('.sheet')).toHaveCount(0);
  await expect(page.getByText('Stored', { exact: true }).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('warehouse access: the viewer works in the main warehouse only, and a manager limits the operator', async ({ page }) => {
  const errors = watchErrors(page);
  await signInAs(page, 'owner');
  await page.goto('/?demo=1#people');
  await portalReady(page);
  const viewer = page.locator('.member').filter({ has: page.getByText('Viewer', { exact: true }) });
  await expect(viewer.getByTestId('member-access')).toHaveText('Only this warehouse');
  const operator = page.locator('.member').filter({ has: page.getByText('Operator', { exact: true }) });
  await expect(operator.getByTestId('member-access')).toHaveText('All warehouses');
  await noSideScroll(page);

  await operator.getByRole('button', { name: /^Warehouses for/ }).click();
  const sheet = page.locator('.sheet');
  await expect(sheet.getByLabel(/Main yard/)).toBeDisabled();
  await sheet.getByLabel(/Overflow yard/).uncheck();
  await sheet.getByRole('button', { name: 'Save access' }).click();
  await expect(page.getByText(/can open this warehouse only/)).toBeVisible();
  await expect(operator.getByTestId('member-access')).toHaveText('Only this warehouse');
  expect(errors).toEqual([]);
});
