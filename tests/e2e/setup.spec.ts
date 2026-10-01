import { test, expect } from '@playwright/test';
import { signInAs } from './helpers';

test('choosing "Big single items" renames pallets to items and hides jobs', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signInAs(page, 'supervisor');
  await page.goto('/?demo=1#overview');
  await page.getByRole('button', { name: 'Warehouse settings' }).click();
  const setup = page.getByTestId('setup-setting');
  await setup.getByRole('radio', { name: /Big single items/ }).click();
  await setup.getByRole('button', { name: 'Save setup' }).click();
  await expect(setup).toContainText('Saved.');
  await page.keyboard.press('Escape');
  const nav = page.locator('.sidebar');
  await expect(nav.getByRole('button', { name: /Item types/ })).toBeVisible();
  await expect(nav.getByRole('button', { name: /^Jobs/ })).toHaveCount(0);
  await page.goto('/?demo=1#move');
  await expect(page.locator('body')).not.toContainText(/\bpallet/i);
});

test('crew get a simple Find, Move, Add screen, with the full dashboard a tap away', async ({ page }) => {
  await signInAs(page, 'operator');
  await page.goto('/?demo=1#overview');
  const home = page.getByTestId('crew-home');
  await expect(home.locator('.crew-tile')).toHaveCount(3);
  await home.getByRole('button', { name: 'Move' }).click();
  await expect(page).toHaveURL(/#move/);
  await page.goto('/?demo=1#overview');
  await page.getByRole('button', { name: 'Show the full dashboard' }).click();
  await expect(page.locator('.warehouse-metrics')).toBeVisible();
});

test('the website survey is short, tailored to the business, and leads to the free trial', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?demo=1#start');
  const s = page.getByTestId('setup-survey');
  await expect(s).toContainText('Find your plan · about 2 minutes');
  await s.getByRole('button', { name: 'Start', exact: true }).click();
  await s.getByRole('radio', { name: /Auto and truck parts/ }).click();
  await expect(s).toContainText('Which kinds of parts do you stock?');
  await expect(s.getByRole('checkbox', { name: /Full pallets/ })).toHaveCount(0);
  await s.getByRole('checkbox', { name: /Tires and wheels/ }).click();
  await s.getByRole('checkbox', { name: /Engines and transmissions/ }).click();
  await s.getByRole('button', { name: /other kinds of inventory/ }).click();
  await expect(s.getByRole('checkbox', { name: /Records and archive boxes/ })).toBeVisible();
  await s.getByRole('button', { name: 'Continue' }).click();
  // A refresh comes back to the same question with the same answers.
  await page.reload();
  await expect(s).toContainText('About how many parts do you keep on hand?');
  await s.getByRole('radio', { name: /^Large/ }).click();
  await expect(s).toContainText('How many people will receive, move or look up parts?');
  await s.getByRole('radio', { name: /2 to 5/ }).click();
  await expect(s.getByRole('radio', { name: /Cloud document backup: \+\$5\.99\/month/ })).toBeVisible();
  await s.getByRole('radio', { name: /Paper records: \+\$0\.00, included/ }).click();
  await expect(s.getByRole('textbox')).toHaveAttribute('placeholder', 'Enter your zip code');
  await s.getByRole('textbox').fill('29403');
  await s.getByRole('button', { name: 'Continue' }).click();
  const results = s.getByTestId('survey-results');
  await expect(results.getByTestId('plan-choice')).toContainText('Starter');
  await expect(results.getByTestId('next-survey')).toContainText('tires and wheels');
  await expect(results.getByTestId('zone-plan')).toHaveCount(0);
  await results.getByRole('button', { name: /Start your free trial/ }).click();
  await expect(page).toHaveURL(/#signin/);
  expect(await page.evaluate(() => localStorage.getItem('pl.survey'))).toContain('auto');
});

test('the setup survey picks up from the plan survey and works out the real numbers', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signInAs(page, 'supervisor');
  await page.goto('/?demo=1#overview');
  await page.evaluate(() =>
    localStorage.setItem(
      'pl.survey',
      JSON.stringify({ profile: 'auto', word: '', groups: ['tires', 'drivetrain', 'fluids'], size: 2, layout: {}, limits: [], people: 'small', hold: null, holdWord: '', hasPrinter: null, printer: null, scanner: null, files: 'paper', zip: '29403' }),
    ),
  );
  await page.goto('/?demo=1#overview');
  await page.getByRole('button', { name: 'Warehouse settings' }).click();
  await page.getByRole('button', { name: 'Retake the setup survey' }).click();
  const s = page.getByTestId('setup-survey');
  await expect(s).toContainText('We filled in what you told us');
  await s.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(s.getByRole('radio', { name: /Auto and truck parts/ })).toHaveAttribute('aria-checked', 'true');
  await s.getByRole('button', { name: 'Continue' }).click();
  await s.getByRole('button', { name: 'Continue' }).click();
  await expect(s.getByTestId('layout-tires')).toBeVisible();
  await expect(s.getByRole('radio', { name: 'Tires and wheels: 250 to 1,000' })).toHaveAttribute('aria-checked', 'true');
  await s.getByRole('button', { name: 'Engines and transmissions: more areas' }).click();
  await expect(s.getByTestId('layout-tally')).toContainText('zones');
  await s.getByRole('button', { name: 'Continue' }).click();
  await s.getByRole('checkbox', { name: /Shelf weight limits/ }).click();
  await s.getByRole('button', { name: 'Continue' }).click();
  await s.getByRole('button', { name: 'Continue' }).click();
  await expect(s).toContainText('pays for a transmission');
  await s.getByRole('radio', { name: /Yes, for customers/ }).click();
  await expect(s).toContainText('printer for labels');
  await expect(s).toContainText('Question 7 of 8');
  await s.getByRole('radio', { name: 'Yes', exact: true }).click();
  // "Which printer?" follows up on question 7, so the total stays 8.
  await expect(s).toContainText('Which printer is it?');
  await expect(s).toContainText('Question 7 of 8');
  await s.getByRole('radio', { name: /Handheld label maker/ }).click();
  await expect(s.getByTestId('printer-verdict')).toContainText('Not a fit');
  await s.getByRole('button', { name: 'Continue' }).click();
  await expect(s).toContainText('just not as fast');
  await expect(s).toContainText('Question 8 of 8');
  await s.getByRole('radio', { name: /^Both/ }).click();
  const results = s.getByTestId('survey-results');
  await expect(results.getByTestId('zone-plan')).toContainText('Tires and wheels');
  await expect(results).toContainText('Avery 5160');
  await expect(results).toContainText('weight limit');
  await expect(results).toContainText('These are estimates');
  await results.getByRole('button', { name: /Use this setup/ }).click();
  await expect(s).toHaveCount(0);
  await expect(page.getByTestId('setup-setting')).toContainText('Parts');
});

test('a manager can retake the survey in the portal and apply it', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signInAs(page, 'supervisor');
  await page.goto('/?demo=1#overview');
  await page.getByRole('button', { name: 'Warehouse settings' }).click();
  await page.getByRole('button', { name: 'Retake the setup survey' }).click();
  const s = page.getByTestId('setup-survey');
  await s.getByRole('button', { name: 'Start', exact: true }).click();
  await s.getByRole('radio', { name: /Auto and truck parts/ }).click();
  await s.getByRole('checkbox', { name: /Boxed parts/ }).click();
  await s.getByRole('button', { name: 'Continue' }).click();
  await s.getByRole('button', { name: 'Continue' }).click();
  await s.getByRole('checkbox', { name: /None of these/ }).click();
  await s.getByRole('button', { name: 'Continue' }).click();
  await s.getByRole('radio', { name: /Just me/ }).click();
  await s.getByRole('radio', { name: /No, we don’t reserve/ }).click();
  await s.getByRole('radio', { name: /No, not yet/ }).click();
  await s.getByRole('radio', { name: /Phone camera/ }).click();
  await s.getByTestId('survey-results').getByRole('button', { name: /Use this setup/ }).click();
  await expect(s).toHaveCount(0);
  await expect(page.getByTestId('setup-setting')).toContainText('Parts');
});

test('the plan survey recommends a plan, checks the zip for a tech visit and offers the trial', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const answer = async (zip: string) => {
    await page.goto('about:blank');
    await page.goto('/?demo=1#start');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    const s = page.getByTestId('setup-survey');
    await s.getByRole('button', { name: 'Start', exact: true }).click();
    await s.getByRole('radio', { name: /Furniture and appliances/ }).click();
    await s.getByRole('checkbox', { name: /Sofas and large furniture/ }).click();
    await s.getByRole('button', { name: 'Continue' }).click();
    await s.getByRole('radio', { name: /^Small/ }).click();
    await s.getByRole('radio', { name: /6 to 15/ }).click();
    await s.getByRole('radio', { name: /Cloud document backup/ }).click();
    await s.getByRole('textbox').fill(zip);
    await s.getByRole('button', { name: 'Continue' }).click();
    return s.getByTestId('plan-choice');
  };
  let plan = await answer('29464');
  await expect(plan).toContainText('Plus');
  await expect(plan).toContainText('$54.99/month');
  await expect(plan.getByTestId('way-tech')).toContainText('We cover 29464');
  await plan.getByRole('button', { name: /Pay now/ }).click();
  await expect(plan).toContainText('Online payment isn’t switched on yet');
  await expect(plan.getByTestId('way-diy')).toContainText('difficult process');
  await expect(plan.getByTestId('way-diy')).toContainText('expect about 1 hour to create');
  plan = await answer('90210');
  await expect(plan.getByTestId('way-tech')).toContainText('isn’t available in 90210');
  await expect(plan.getByTestId('way-tech').getByRole('link', { name: /Contact us/ })).toHaveAttribute('href', /^mailto:/);
});

test('the setup checklist has its own page, not a card on the dashboard', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signInAs(page, 'supervisor');
  await page.goto('/?demo=1#overview');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect(page.getByTestId('getting-started')).toHaveCount(0);
  // The sample warehouse is already set up, so the sidebar has no checklist to come back to.
  await expect(page.locator('.sidebar').getByTestId('checklist-nav')).toHaveCount(0);
  await page.goto('/?demo=1#checklist');
  const list = page.getByTestId('getting-started');
  await expect(list).toContainText('Your warehouse is set up');
  await expect(list.locator('[data-done="true"]')).toHaveCount(6);
  const dot = await list.locator('.ck-dot').first().boundingBox();
  expect(Math.round(dot!.width)).toBe(Math.round(dot!.height));
});
