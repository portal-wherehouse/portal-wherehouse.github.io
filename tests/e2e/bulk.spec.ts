import { test, expect } from '@playwright/test';
import { type Page } from '@playwright/test';
import { signInAs, watchErrors } from './helpers';

/** The sample has one pallet waiting for a rack; add three more. */
async function addUnplaced(page: Page) {
  await page.goto('/?demo=1#import');
  await page.getByLabel('CSV text').fill('description,supplier_ref\nOak splits,T-1\nHickory splits,T-2\nCherry splits,T-3\n');
  await page.getByRole('group', { name: 'What to import' }).getByRole('button', { name: 'Pallets on hand' }).click();
  await page.getByRole('button', { name: /^Import 3/ }).click();
  await expect(page.locator('#main')).toContainText('Batch committed: 3 pallets created');
}

// A tiny valid PNG, as a phone photo stand-in.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP4z8CAFWEXHbQSACj/P8Fu7N9hAAAAAElFTkSuQmCC', 'base64');

test('select several pallets waiting for placement and place them all at once', async ({ page }) => {
  const errors = watchErrors(page);
  await signInAs(page, 'owner');
  await addUnplaced(page);
  await page.goto('/?demo=1#move');
  const panel = page.getByTestId('needs-placement');
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: 'Select', exact: true }).click();
  const bar = page.getByRole('region', { name: 'Selected pallets' });
  await expect(bar.getByRole('button', { name: /Place all/ })).toBeDisabled();
  await expect(bar.getByRole('button', { name: /Cancel selection/ })).toBeEnabled();

  const boxes = panel.getByRole('checkbox');
  const first = (await boxes.nth(0).getAttribute('aria-label'))!.replace('Select ', '');
  const second = (await boxes.nth(1).getAttribute('aria-label'))!.replace('Select ', '');
  await boxes.nth(0).click();
  await panel.locator('.sel-row').nth(1).locator('.result').click(); // tapping the row ticks it too
  await expect(bar).toContainText('2 selected');
  await bar.getByRole('button', { name: /Place all/ }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Are you sure?');
  await dialog.getByLabel('Put them all at').selectOption({ index: 1 });
  const where = (await dialog.getByLabel('Put them all at').locator('option:checked').textContent())!.trim();
  await dialog.getByRole('button', { name: 'Yes, place them' }).click();
  await expect(dialog.getByTestId('bulk-result')).toContainText('2 pallets done');
  await expect(dialog.getByTestId('bulk-result')).toContainText(`${first} and ${second} are now at ${where}`);
  await dialog.getByRole('button', { name: 'Done' }).click();
  // Both stay in the list with a check mark, though they no longer need placement.
  await expect(panel.getByLabel(`${first} done`)).toBeVisible();
  await expect(panel.getByLabel(`${second} done`)).toBeVisible();
  expect(errors).toEqual([]);
});

test('bulk hold on Find reports each pallet, and failures say why', async ({ page }) => {
  await signInAs(page, 'supervisor');
  await page.goto('/?demo=1#find');
  await page.getByRole('button', { name: /^On hold/ }).first().click();
  await expect(page.locator('.result').first()).toBeVisible();
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  const bar = page.getByRole('region', { name: 'Selected pallets' });
  await bar.getByRole('button', { name: /^Select all/ }).click();
  await bar.getByRole('button', { name: /Put on hold/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Hold reason').fill('Recount');
  await dialog.getByRole('button', { name: 'Yes, put on hold' }).click();
  // They were all on hold already, so none change and each says why.
  await expect(dialog.getByTestId('bulk-result')).toContainText('not changed');
  await expect(dialog.getByTestId('bulk-result')).toContainText('already on hold');
});

test('replace labels prints one label per selected pallet', async ({ page }) => {
  await signInAs(page, 'owner');
  await addUnplaced(page);
  await page.goto('/?demo=1#reconcile');
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  const bar = page.getByRole('region', { name: 'Selected pallets' });
  await page.getByRole('checkbox').nth(0).click();
  await page.getByRole('checkbox').nth(1).click();
  await bar.getByRole('button', { name: /Replace labels/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Yes, continue' }).click();
  await expect(page.getByRole('dialog')).toContainText('Print 2 labels');
});

test('flag an issue with a photo; a manager sees who sent it, approves and files it', async ({ page }) => {
  const errors = watchErrors(page);
  await signInAs(page, 'supervisor');
  await page.goto('/?demo=1#find');
  await page.locator('.result').first().click();
  const code = (await page.locator('h1').textContent())!.trim();
  await page.getByRole('button', { name: 'Flag issue' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Damaged' }).click();
  await dialog.getByLabel('What happened?').fill('Forklift punctured the wrap');
  await dialog.getByLabel(/Photos/).setInputFiles({ name: 'damage.png', mimeType: 'image/png', buffer: PNG });
  await expect(dialog.getByAltText('Photo 1')).toBeVisible();
  await dialog.getByRole('button', { name: 'Review and send' }).click();
  await expect(dialog).toContainText('Are you sure?');
  await dialog.getByRole('button', { name: 'Yes, send to managers' }).click();
  await expect(dialog).toContainText('Sent to your managers');
  await dialog.getByRole('button', { name: 'Done' }).click();

  await page.goto('/?demo=1#people');
  const issues = page.getByTestId('issues-panel');
  await expect(issues).toContainText(code);
  await expect(issues).toContainText('Forklift punctured the wrap');
  await issues.locator('.import-row').first().click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toContainText('Reported by');
  await expect(sheet.getByAltText('Issue photo 1')).toBeVisible();
  await sheet.getByRole('button', { name: 'Approve' }).click();
  await sheet.getByRole('button', { name: 'Yes, approve' }).click();
  await expect(sheet).toContainText('Approved.');
  await sheet.getByRole('button', { name: 'Mark as filed' }).click();
  await sheet.getByLabel('Manager note (optional)').fill('Claim sent');
  await sheet.getByRole('button', { name: 'Yes, mark as filed' }).click();
  await expect(sheet).toContainText('Marked as filed.');
  expect(errors).toEqual([]);
});
