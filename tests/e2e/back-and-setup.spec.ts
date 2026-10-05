import { test, expect, type Page } from '@playwright/test';
import { pickSample, signInAs } from './helpers';

/** Open the sample's fresh warehouse: new, and locked to its setup checklist. */
async function practiceSetup(page: Page, width = 1280) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/?demo=1#signin');
  await pickSample(page);
  await page.getByTestId('practice-setup').click();
  await expect(page.getByTestId('setup-wizard')).toBeVisible();
}

test('Back and Forward step through the website plan survey with the answers kept', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?demo=1#start');
  const s = page.getByTestId('setup-survey');
  await s.getByRole('button', { name: 'Start', exact: true }).click();
  await s.getByRole('radio', { name: /Auto and truck parts/ }).click();
  await expect(s).toContainText('Which kinds of parts do you stock?');
  await s.getByRole('checkbox', { name: /Tires and wheels/ }).click();
  await s.getByRole('button', { name: 'Continue' }).click();
  await expect(s).toContainText('About how many parts do you keep on hand?');

  await page.goBack();
  await expect(s).toContainText('Which kinds of parts do you stock?');
  await expect(s.getByRole('checkbox', { name: /Tires and wheels/ })).toBeChecked();
  await expect(page).toHaveURL(/#start/);
  await page.goBack();
  await expect(s.getByRole('radio', { name: /Auto and truck parts/ })).toHaveAttribute('aria-checked', 'true');
  await page.goBack();
  await expect(s).toContainText('Find your plan · about 2 minutes');
  await page.goForward();
  await page.goForward();
  await expect(s).toContainText('Which kinds of parts do you stock?');
  await expect(s.getByRole('checkbox', { name: /Tires and wheels/ })).toBeChecked();
  // The survey's own Back button agrees with the browser's.
  await page.goForward();
  await expect(s).toContainText('About how many parts do you keep on hand?');
  await s.getByRole('button', { name: 'Back' }).click();
  await expect(s).toContainText('Which kinds of parts do you stock?');
  await page.goForward();
  await expect(s).toContainText('About how many parts do you keep on hand?');
  // A refresh keeps the question, and Back still works after it.
  await page.reload();
  await expect(s).toContainText('About how many parts do you keep on hand?');
  await page.goBack();
  await expect(s).toContainText('Which kinds of parts do you stock?');
});

test('Back and Forward move between setup steps, keeping what was typed', async ({ page }) => {
  await practiceSetup(page);
  const wizard = page.getByTestId('setup-wizard');
  await wizard.getByText('Or just set the words by hand').click();
  await wizard.getByRole('radio', { name: /Parts and boxes on shelves/ }).click();
  await wizard.getByRole('button', { name: 'Save and continue' }).click();
  await expect(wizard).toContainText('Create your storage zones');
  await wizard.getByLabel('Zone 1 name').fill('Back racks');
  await wizard.getByRole('button', { name: 'Save and continue' }).click();
  await expect(wizard).toContainText('Build the spots in each zone');

  await page.goBack();
  await expect(wizard).toContainText('Create your storage zones');
  await expect(wizard.getByLabel('Zone 1 name')).toHaveValue('Back racks');
  await expect(page).not.toHaveURL(/#signin/);
  await page.goBack();
  await expect(wizard).toContainText('Your inventory and space');
  await page.goForward();
  await expect(wizard).toContainText('Create your storage zones');
  await page.goForward();
  await expect(wizard).toContainText('Build the spots in each zone');

  // Unsaved typing survives a trip away and Back.
  await wizard.getByTestId('setup-nav').getByRole('button', { name: /Storage zones/ }).click();
  await wizard.getByLabel('Zone 1 name').fill('Back racks and mezzanine');
  await wizard.getByTestId('setup-nav').getByRole('button', { name: /Barcodes/ }).click();
  await expect(wizard).toContainText('already have barcodes');
  await page.goBack();
  await expect(wizard.getByLabel('Zone 1 name')).toHaveValue('Back racks and mezzanine');
  await page.reload();
  await expect(wizard).toContainText('Create your storage zones');
  await expect(wizard.getByLabel('Zone 1 name')).toHaveValue('Back racks and mezzanine');
});

test('Back inside the portal goes to the previous page, never to sign-in', async ({ page }) => {
  await signInAs(page, 'owner');
  await page.goto('/?demo=1#overview');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  const nav = page.locator('.sidebar');
  await nav.getByRole('button', { name: 'Find', exact: true }).click();
  await expect(page).toHaveURL(/#find/);
  await nav.getByRole('button', { name: 'Stock', exact: true }).click();
  await expect(page).toHaveURL(/#map/);
  await nav.getByRole('button', { name: 'Settings and setup', exact: true }).click();
  await expect(page).toHaveURL(/#setup/);
  await page.getByTestId('hub-locations').click();
  await expect(page).toHaveURL(/#locations/);

  await page.goBack();
  await expect(page).toHaveURL(/#setup/);
  await expect(page.getByTestId('setup-hub')).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/#map/);
  await page.goBack();
  await expect(page).toHaveURL(/#find/);
  await page.goBack();
  await expect(page).toHaveURL(/#overview/);
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(/#find/);
});

test('a zone grows from 15 to 225 spots, and the label count stays the same across Back and Forward', async ({ page }) => {
  await practiceSetup(page);
  const wizard = page.getByTestId('setup-wizard');
  await wizard.getByText('Or just set the words by hand').click();
  await wizard.getByRole('radio', { name: /Parts and boxes on shelves/ }).click();
  await wizard.getByRole('button', { name: 'Save and continue' }).click();
  await wizard.getByLabel('Zone 1 name').fill('Back racks');
  await wizard.getByRole('button', { name: 'Save and continue' }).click();
  const zone = wizard.getByTestId('zone-build-A');
  await zone.getByRole('button', { name: 'Create 15 spots' }).click();
  await expect(zone.getByTestId('zone-count-A')).toHaveText(/15 spots/);

  await zone.getByLabel('Aisles or rows').fill('3');
  await zone.getByLabel('Bays or sections per aisle').fill('15');
  await zone.getByLabel('Levels or shelves').fill('5');
  await expect(zone.getByTestId('zone-math-A')).toContainText('3 aisles x 15 bays x 5 levels = 225 spots. 15 already exist, 210 new.');
  await zone.getByRole('button', { name: 'Create 210 spots' }).click();
  await expect(zone.getByTestId('zone-count-A')).toHaveText(/225 spots/);
  await expect(zone).toContainText('210 spots created.');
  await expect(zone.getByRole('button', { name: 'All built' })).toBeDisabled();

  await wizard.getByRole('button', { name: 'Save and continue' }).click();
  await expect(wizard).toContainText('already have barcodes');
  await wizard.getByTestId('setup-nav').getByRole('button', { name: /Print spot labels/ }).click();
  await wizard.getByTestId('printer-avery5160').click();
  await wizard.getByTestId('style-shelf').click();
  const count = wizard.getByTestId('print-count');
  // The receiving and staging spots every warehouse starts with print too.
  const first = (await count.textContent()) ?? '';
  expect(first).toMatch(/^2\d\d labels on \d+ sheets$/);
  for (let i = 0; i < 2; i++) {
    await page.goBack();
    await expect(wizard).toContainText('already have barcodes');
    await page.goForward();
    await expect(count).toHaveText(first);
  }
  await page.reload();
  await expect(wizard.getByTestId('print-count')).toHaveText(first);
});
