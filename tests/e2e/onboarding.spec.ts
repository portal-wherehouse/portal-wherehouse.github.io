import { test, expect } from '@playwright/test';

test('a new warehouse is locked to the setup wizard until every step is done', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/?demo=1#signin');
  await page.getByTestId('practice-setup').click();
  const wizard = page.getByTestId('setup-wizard');
  await expect(wizard).toBeVisible();
  const nav = page.locator('.sidebar');
  await expect(nav.getByTestId('setup-nav')).toBeVisible();
  await expect(nav.getByRole('button', { name: /^Receive/ })).toHaveAttribute('aria-disabled', 'true');
  await page.goto('/?demo=1#find');
  await expect(wizard).toBeVisible();

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
  await expect(nav.getByTestId('setup-nav')).toHaveCount(0);
  await expect(nav.getByRole('button', { name: /^Receive/ })).not.toHaveAttribute('aria-disabled', 'true');
});
