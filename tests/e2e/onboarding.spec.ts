import { test, expect, type Page } from '@playwright/test';

/** Open the sample's fresh warehouse: new, and locked to its setup checklist. */
async function practiceSetup(page: Page, width = 1280) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/?demo=1#signin');
  await page.getByTestId('practice-setup').click();
  await expect(page.getByTestId('setup-wizard')).toBeVisible();
}

test('a new warehouse is locked to the setup checklist until every step is done', async ({ page }) => {
  await practiceSetup(page);
  const wizard = page.getByTestId('setup-wizard');
  const nav = page.locator('.sidebar');
  // "Setup checklist" comes first, above Dashboard, with the wizard's steps under it.
  await expect(nav.locator('.nav-item').first()).toHaveAttribute('data-testid', 'checklist-nav');
  await expect(nav.getByTestId('setup-nav')).toBeVisible();
  await expect(nav.getByRole('button', { name: /^Dashboard/ })).toHaveAttribute('aria-disabled', 'true');
  await expect(nav.getByRole('button', { name: /^Receive/ })).toHaveAttribute('aria-disabled', 'true');

  // Every other button says why it is greyed out, and leads back to the checklist.
  await nav.getByRole('button', { name: /^Receive/ }).click({ force: true });
  const oops = page.getByTestId('setup-oops');
  await expect(oops).toContainText('You must complete or skip your warehouse checklist first.');
  await expect(page).not.toHaveURL(/#receive/);
  await oops.getByRole('button', { name: 'Close' }).click();
  await expect(oops).toHaveCount(0);
  await nav.getByRole('button', { name: /^Dashboard/ }).click({ force: true });
  await oops.getByRole('button', { name: 'Go to setup checklist' }).click();
  await expect(page).toHaveURL(/#checklist/);
  await expect(wizard).toBeVisible();
  await page.goto('/?demo=1#find');
  await expect(wizard).toBeVisible();

  await wizard.getByText('Or just set the words by hand').click();
  await wizard.getByRole('radio', { name: /Parts and boxes on shelves/ }).click();
  await wizard.getByRole('button', { name: 'Save and continue' }).click();
  await expect(wizard).toContainText('Create your storage zones');
  await wizard.getByRole('button', { name: 'Save and continue' }).click();
  await expect(wizard).toContainText('Build the spots in each zone');
  await wizard.getByTestId('zone-build-A').getByRole('button', { name: 'Create 15 spots' }).click();
  await expect(wizard.getByTestId('zone-build-A')).toContainText('15 spots');
  await wizard.getByRole('button', { name: 'Save and continue' }).click();
  await wizard.getByRole('radio', { name: /print our own labels/ }).click();
  await wizard.getByRole('button', { name: 'Save and continue' }).click();
  await wizard.getByTestId('leave-dispatch').click();
  await wizard.getByRole('button', { name: 'Save and continue' }).click();
  await wizard.getByRole('radio', { name: /Paper only/ }).click();
  await wizard.getByRole('button', { name: 'Save and continue' }).click();
  await expect(wizard).toContainText('Print all 15 spot labels');
  await wizard.getByRole('button', { name: /printed and hung them/ }).click();
  await wizard.getByRole('button', { name: /skip for now/ }).click();
  await wizard.getByRole('button', { name: 'Open my warehouse' }).click();
  await expect(wizard).toHaveCount(0);
  await expect(page).toHaveURL(/#overview/);
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect(nav.getByTestId('checklist-nav')).toHaveCount(0);
  await expect(nav.getByTestId('setup-nav')).toHaveCount(0);
  await expect(nav.getByRole('button', { name: /^Receive/ })).not.toHaveAttribute('aria-disabled', 'true');
});

test('skipping the checklist unlocks the app and keeps it in the sidebar to come back to', async ({ page }) => {
  await practiceSetup(page);
  const nav = page.locator('.sidebar');
  await page.getByTestId('skip-checklist').click();
  await expect(page.getByRole('dialog')).toContainText('You can come back to it any time from the sidebar');
  await page.getByRole('button', { name: 'Keep setting up' }).click();
  await expect(nav.getByRole('button', { name: /^Receive/ })).toHaveAttribute('aria-disabled', 'true');
  await page.getByTestId('skip-checklist').click();
  await page.getByRole('button', { name: 'Skip for now' }).click();

  await expect(page).toHaveURL(/#overview/);
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect(page.getByTestId('getting-started')).toHaveCount(0);
  await nav.getByRole('button', { name: /^Receive/ }).click();
  await expect(page.getByTestId('setup-oops')).toHaveCount(0);
  await expect(page).toHaveURL(/#receive/);

  await nav.getByTestId('checklist-nav').click();
  const wizard = page.getByTestId('setup-wizard');
  await expect(wizard).toContainText('You skipped the checklist');
  await expect(page.getByTestId('skip-checklist')).toHaveCount(0);
  await expect(nav.getByTestId('setup-nav')).toBeVisible();
  // Progress saved after skipping does not lock the app again.
  await wizard.getByText('Or just set the words by hand').click();
  await wizard.getByRole('radio', { name: /Parts and boxes on shelves/ }).click();
  await wizard.getByRole('button', { name: 'Save and continue' }).click();
  await expect(wizard).toContainText('Create your storage zones');
  await expect(nav.getByTestId('checklist-nav')).toContainText('1/8');
  await expect(nav.getByRole('button', { name: /^Receive/ })).not.toHaveAttribute('aria-disabled', 'true');
  await page.reload();
  await expect(nav.getByTestId('checklist-nav')).toBeVisible();
});

test('on a phone, the locked tabs explain themselves too', async ({ page }) => {
  await practiceSetup(page, 390);
  const tabs = page.locator('.bottom-nav');
  await expect(tabs.getByRole('button', { name: 'Find' })).toHaveAttribute('aria-disabled', 'true');
  await tabs.getByRole('button', { name: 'Find' }).click({ force: true });
  await expect(page.getByTestId('setup-oops')).toBeVisible();
  await page.getByTestId('setup-oops').getByRole('button', { name: 'Go to setup checklist' }).click();
  await expect(page).toHaveURL(/#checklist/);
  await expect(page.getByTestId('setup-wizard')).toBeVisible();
  await expect(page.getByTestId('skip-checklist')).toBeVisible();
});

test('crew see the setup-pending screen until a manager finishes or skips setup', async ({ page }) => {
  await practiceSetup(page);
  await page.getByRole('button', { name: 'Switch demo account' }).click();
  await page.getByRole('button', { name: /Operator/ }).first().click();
  await expect(page.getByTestId('setup-pending')).toBeVisible();
  const nav = page.locator('.sidebar');
  await expect(nav.getByTestId('checklist-nav')).toHaveCount(0);
  await nav.getByRole('button', { name: /^Put away and move/ }).click({ force: true });
  const oops = page.getByTestId('setup-oops');
  await expect(oops).toContainText('A manager must complete or skip the setup checklist first.');
  await expect(oops.getByRole('button', { name: 'Go to setup checklist' })).toHaveCount(0);
  await oops.getByRole('button', { name: 'Close' }).click();
  await page.goto('/?demo=1#checklist');
  await expect(page.getByTestId('setup-pending')).toBeVisible();
});

test('setup uses the warehouse word, starts spots at the survey count, keeps the barcode answer and ends on a true dashboard', async ({ page }) => {
  // A plan survey for a furniture store with a few sofas on the floor: about 7 spots.
  await page.goto('/?demo=1#signin');
  await page.evaluate(() =>
    localStorage.setItem(
      'pl.survey',
      JSON.stringify({ profile: 'furniture', word: '', groups: ['sofas'], size: 0, layout: { sofas: { place: 'floor', areas: 1, qty: 0, kept: 'own' } }, limits: [], people: 'solo', hold: 'none', holdWord: '', hasPrinter: 'no', printer: null, scanner: 'phone', files: 'paper', zip: '29403' }),
    ),
  );
  await practiceSetup(page);
  const wizard = page.getByTestId('setup-wizard');
  const nav = page.locator('.sidebar');
  await expect(wizard.getByTestId('setup-numbers')).toContainText('1 zone, about 7 spots');
  await wizard.getByText('Or just set the words by hand').click();
  await wizard.getByRole('radio', { name: /Big single items/ }).click();
  await wizard.getByRole('button', { name: 'Save and continue' }).click();
  await expect(wizard.getByTestId('zone-map')).toContainText('Sofas and large furniture');
  await wizard.getByRole('button', { name: 'Save and continue' }).click();

  const zone = wizard.getByTestId('zone-build-A');
  await expect(zone).toContainText('About 7 spots planned');
  await zone.getByRole('button', { name: 'Create 7 spots' }).click();
  await expect(zone).toContainText('7 spots');
  await wizard.getByRole('button', { name: 'Save and continue' }).click();

  await expect(wizard.getByRole('heading', { name: 'Do your items already have barcodes?' })).toBeVisible();
  await expect(wizard).not.toContainText(/pallet/i);
  await wizard.getByRole('radio', { name: /I have a list/ }).click();
  await wizard.getByRole('button', { name: 'Open Import' }).click();
  await expect(page).toHaveURL(/#import/);
  await page.getByRole('button', { name: /Back to setup/ }).click();
  await expect(wizard.getByRole('radio', { name: /I have a list/ })).toHaveAttribute('aria-checked', 'true');
  await page.reload();
  await expect(wizard.getByRole('radio', { name: /I have a list/ })).toHaveAttribute('aria-checked', 'true');
  await wizard.getByRole('button', { name: 'Save and continue' }).click();

  await expect(nav.getByTestId('setup-nav')).toContainText('When items leave');
  await expect(wizard.getByRole('heading', { name: 'When an item leaves, what happens to its record?' })).toBeVisible();
  await wizard.getByTestId('leave-dispatch').click();
  await wizard.getByRole('button', { name: 'Save and continue' }).click();
  await wizard.getByRole('radio', { name: /Paper only/ }).click();
  await wizard.getByRole('button', { name: 'Save and continue' }).click();
  await wizard.getByRole('button', { name: /printed and hung them/ }).click();
  await wizard.getByRole('button', { name: /skip for now/ }).click();
  await wizard.getByRole('button', { name: 'Open my warehouse' }).click();

  // Spots exist and orders are off, so the dashboard asks for the first item, not for racks and an order.
  const first = page.getByTestId('first-steps');
  await expect(first).toContainText('You have 7 spots. Receive your first item, then move it into a spot.');
  await expect(first).not.toContainText(/order|rack locations/i);
  await first.getByRole('button', { name: 'Receive an item' }).click();
  await expect(page).toHaveURL(/#receive/);
});
