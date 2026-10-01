import { test, expect, type Page } from '@playwright/test';
import { signInAs, watchErrors } from './helpers';

async function turnOnMeasurements(page: Page) {
  await page.goto('/?demo=1#overview');
  await page.getByRole('button', { name: 'Warehouse settings' }).click();
  const box = page.getByTestId('measurements-setting').getByLabel('Advanced weight and dimensions logging');
  await box.click();
  await expect(box).toBeChecked();
  await page.keyboard.press('Escape');
}

async function setCapacity(page: Page, index: number, spaces: string, weight?: string) {
  await page.goto('/?demo=1#locations');
  const row = page.locator('tbody tr.click').nth(index);
  const code = (await row.locator('td').first().textContent())!.trim();
  await row.click();
  await page.getByTestId('location-capacity').getByRole('button', { name: /capacity/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Standard pallet spaces').fill(spaces);
  if (weight) await dialog.getByLabel('Weight limit (lb, optional)').fill(weight);
  if (weight) await expect(dialog).toContainText('Every pallet moved here needs a weight');
  await dialog.getByRole('button', { name: 'Save capacity' }).click();
  await expect(dialog).toContainText('Capacity saved');
  await dialog.getByRole('button', { name: 'Done' }).click();
  return code;
}

test('Move suggests the location with the most room, and a weight limit asks for the pallet weight', async ({ page }) => {
  const errors = watchErrors(page);
  await signInAs(page, 'owner');
  await turnOnMeasurements(page);

  const roomy = await setCapacity(page, 0, '20');
  const heavy = await setCapacity(page, 2, '30', '1000');
  await expect(page.getByTestId('location-capacity')).toContainText('1,000 lb left');

  await page.goto('/?demo=1#move');
  await page.getByTestId('needs-placement').locator('.result').first().click();
  const suggestions = page.getByTestId('move-suggestions');
  await expect(suggestions.locator('.suggest-row').first()).toContainText(roomy);
  // The weight-limited spot has more room but needs a weight first.
  await expect(suggestions).not.toContainText(heavy);
  await suggestions.getByRole('button', { name: 'Add est. weight' }).click();
  await suggestions.getByLabel('Estimated weight (lb)').fill('400');
  await suggestions.getByRole('button', { name: /^Save to/ }).click();
  await expect(suggestions.locator('.suggest-row').first()).toContainText(heavy);
  await expect(suggestions.locator('.suggest-row').first()).toContainText('1,000 lb left');
  await suggestions.locator('.suggest-row').first().click();
  await expect(page.locator('.big-result')).toContainText(`Placed at ${heavy}`);
  expect(errors).toEqual([]);
});

test('a pallet without a weight is stopped at a weight-limited location, with a fix', async ({ page }) => {
  await signInAs(page, 'owner');
  await turnOnMeasurements(page);
  const heavy = await setCapacity(page, 2, '4', '5000');
  await page.goto('/?demo=1#move');
  await page.getByTestId('needs-placement').locator('.result').first().click();
  await page.getByPlaceholder('A-03-02').fill(heavy);
  await page.getByPlaceholder('A-03-02').press('Enter');
  const problem = page.getByTestId('fit-problem');
  await expect(problem).toContainText('has a weight limit');
  await problem.getByRole('button', { name: 'Add pallet weight' }).click();
  await problem.getByLabel('Estimated weight (lb)').fill('700');
  await problem.getByRole('button', { name: /^Save to/ }).click();
  await page.getByRole('button', { name: `Place: ${heavy}` }).click();
  await expect(page.locator('.big-result')).toContainText(`Placed at ${heavy}`);
});
