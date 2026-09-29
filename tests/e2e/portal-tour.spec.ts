// The portal's "Take the tour" walkthrough (src/features/tour/PortalTour.tsx and stops.ts): start it
// from the top bar, step through every stop with Next as it opens each portal page, and finish cleanly.

import { expect, test, type Page } from '@playwright/test';
import { portalReady, signInAs, watchErrors } from './helpers';

// The exhaustive management/developer tour is opt-in; everyday onboarding is the practice shift.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('pl.prefs', JSON.stringify({ advancedTools: true })));
});

/**
 * Every stop in order: its card title, and the page it opens (a hash, '' for record pages that have
 * no link of their own, or null for stops that stay on the current screen).
 */
const STOPS: { title: string; hash: string | null; record?: RegExp }[] = [
  { title: 'Welcome to the Wherehouse Portal', hash: null },
  { title: 'The top bar', hash: null },
  { title: 'Getting around', hash: null },
  { title: 'Receive', hash: 'receive' },
  { title: 'Move', hash: 'move' },
  { title: 'Find', hash: 'find' },
  { title: 'A pallet record', hash: '', record: /P-\d{6}/ },
  { title: 'Its history', hash: '', record: /P-\d{6}/ },
  { title: 'Overview', hash: 'overview' },
  { title: 'Warehouse map', hash: 'map' },
  { title: 'Needs attention', hash: 'reconcile' },
  { title: 'Activity', hash: 'activity' },
  { title: 'Jobs', hash: 'jobs' },
  { title: 'Pick lists', hash: '', record: /J-\d{3}/ },
  { title: 'Locations', hash: 'locations' },
  { title: 'Labels', hash: 'labels' },
  { title: 'Import', hash: 'import' },
  { title: 'Export', hash: 'export' },
  { title: 'People and roles', hash: 'people' },
  { title: 'Scan station', hash: 'station' },
  { title: 'Scanners', hash: 'scanners' },
  { title: 'Sync and offline', hash: 'sync' },
  { title: 'Integrity lab', hash: 'lab' },
  { title: 'Guide', hash: 'guide' },
  { title: 'Data and storage', hash: 'data' },
  { title: 'Help', hash: 'help' },
  { title: 'Settings', hash: 'settings' },
  { title: 'About', hash: 'about' },
  { title: 'You’re ready', hash: null },
];

async function expectCardOnScreen(page: Page) {
  const card = page.locator('.ptour-card');
  const box = await card.boundingBox();
  const vp = page.viewportSize()!;
  expect(box, 'tour card has a box').not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(-1);
  expect(box!.y).toBeGreaterThanOrEqual(-1);
  expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(vp.height + 1);
}

async function walkTheTour(page: Page) {
  const errors = watchErrors(page);
  await signInAs(page, 'owner');
  await page.goto('/#find');
  await expect(page.locator('.topbar')).toBeVisible();

  await page.getByRole('button', { name: 'Take the tour' }).click();
  const card = page.locator('.ptour-card');
  await expect(card).toBeVisible();
  await expect(card.locator('.ptour-count')).toHaveText(`${STOPS.length} stops · about 5 minutes`);
  await expect(card.getByRole('list', { name: 'Chapters' }).getByRole('button')).toHaveCount(6);

  for (let i = 0; i < STOPS.length; i++) {
    const stop = STOPS[i];
    await test.step(`stop ${i + 1}: ${stop.title}`, async () => {
      await expect(card).toBeVisible();
      await expect(card.getByRole('heading', { level: 2 })).toHaveText(stop.title);
      if (i > 0) await expect(card.locator('.ptour-count')).toHaveText(`Step ${i + 1} of ${STOPS.length}`);
      if (stop.hash) await expect(page).toHaveURL(new RegExp(`#${stop.hash}$`));
      if (stop.hash === '') {
        // Records link with their id (#pallet/<id>, #job/<id>), so a reload reopens them.
        await expect.poll(() => new URL(page.url()).hash).toMatch(/^#(pallet|job)\/[\w-]+$/);
        await expect(page.locator('#main .page-head').first()).toContainText(stop.record!);
      }
      // Stops about part of the screen light that part up; the first and last are centred cards.
      if (i > 0 && i < STOPS.length - 1) await expect(page.locator('.ptour-spot')).toBeVisible();
      await expect(card.locator('.ptour-body')).not.toBeEmpty();
      await expectCardOnScreen(page);

      if (i === 0) await card.getByRole('button', { name: 'Start the tour' }).click();
      else if (i < STOPS.length - 1) await card.getByRole('button', { name: 'Next' }).click();
    });
  }

  // The last stop offers the practice shift and Help, then Finish closes the tour.
  await expect(card.getByRole('button', { name: 'Start the practice shift' })).toBeVisible();
  await expect(card.getByRole('button', { name: 'Open Help' })).toBeVisible();
  await card.getByRole('button', { name: 'Finish' }).click();
  await expect(page.locator('.ptour')).toHaveCount(0);
  await expect(page.locator('.ptour-spacer')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Take the tour' })).toBeFocused();
  // The portal is usable again.
  await expect(page.locator('#main')).toBeVisible();
  expect(errors).toEqual([]);
}

test.describe('portal walkthrough', () => {
  test('desktop: every stop, with Next, then Finish', async ({ page }) => {
    test.setTimeout(120_000);
    await walkTheTour(page);
  });

  test('phone: every stop, with Next, then Finish', async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await walkTheTour(page);
  });

  test('Back, the chapter list, arrow keys and Esc', async ({ page }) => {
    await signInAs(page, 'owner');
    await page.goto('/#find');
    await portalReady(page);
    await page.getByRole('button', { name: 'Take the tour' }).click();
    const card = page.locator('.ptour-card');

    // Jump straight to a chapter from the intro.
    await card.getByRole('button', { name: /^Jump to Scanning/ }).click();
    await expect(card.getByRole('heading', { level: 2 })).toHaveText('Scan station');
    await expect(page).toHaveURL(/#station$/);

    await card.getByRole('button', { name: 'Back' }).click();
    await expect(card.getByRole('heading', { level: 2 })).toHaveText('People and roles');
    await expect(page).toHaveURL(/#people$/);

    await page.keyboard.press('ArrowRight');
    await expect(card.getByRole('heading', { level: 2 })).toHaveText('Scan station');
    await page.keyboard.press('ArrowLeft');
    await expect(card.getByRole('heading', { level: 2 })).toHaveText('People and roles');

    await page.keyboard.press('Escape');
    await expect(page.locator('.ptour')).toHaveCount(0);
  });

  test('the last stop starts the practice shift', async ({ page }) => {
    await signInAs(page, 'operator');
    await page.goto('/#find');
    await portalReady(page);
    await page.getByRole('button', { name: 'Take the tour' }).click();
    const card = page.locator('.ptour-card');
    await card.getByRole('button', { name: 'Start the tour' }).click();
    // Arrow keys move through the stops too.
    for (let i = 1; i < STOPS.length - 1; i++) {
      await expect(card.locator('.ptour-count')).toHaveText(`Step ${i + 1} of ${STOPS.length}`);
      await page.keyboard.press('ArrowRight');
    }
    await expect(card.getByRole('heading', { level: 2 })).toHaveText('You’re ready');
    await card.getByRole('button', { name: 'Start the practice shift' }).click();
    await expect(page.locator('.ptour')).toHaveCount(0);
    await expect(page).toHaveURL(/#receive$/);
    await expect(page.getByRole('complementary', { name: 'Practice shift' })).toBeVisible();
  });
});
