// The public website: every page in the header, menu and footer loads with its heading and no errors,
// the portal button leads to the front door, and the home page's guided tour runs start to finish
// without ever leaving the home page.

import { expect, test, type Locator, type Page } from '@playwright/test';
import { wedgeScan, watchErrors } from './helpers';

/** Every website page: its menu label, hash and main heading. */
const PAGES = [
  { label: 'Product', hash: 'product', h1: 'A record for every pallet' },
  { label: 'See it in action', hash: 'showcase', h1: 'Everything it does, screen by screen' },
  { label: 'Why it’s simple', hash: 'simple', h1: 'Simple on purpose' },
  { label: 'Scanners', hash: 'hardware', h1: 'Works with the scanners you already own' },
  { label: 'Applications', hash: 'industries', h1: 'Built for yards that stage material by job' },
  { label: 'Customers', hash: 'customers', h1: 'Room for real stories from real yards' },
  { label: 'Pricing', hash: 'pricing', h1: 'Plans for every size of yard' },
  { label: 'About', hash: 'founder', h1: 'Built by John Henry Mims' },
] as const;

const FOOTER_EXTRA = [
  { label: 'Security and data', hash: 'security', h1: 'Your records stay yours' },
  { label: 'Contact', hash: 'contact', h1: 'Book a walkthrough' },
] as const;

const h1 = (page: Page) => page.getByRole('heading', { level: 1 });

/**
 * Open a main page from the header. The header shows its links only when all of them fit
 * (SiteShell's useNavFits); otherwise the Menu button opens the full-height menu instead.
 */
async function openFromHeader(page: Page, label: string) {
  const compact = await page.locator('.shell-header').evaluate((el) => el.hasAttribute('data-compact'));
  if (!compact) {
    await page.locator('.shell-header').getByRole('navigation', { name: 'Main' }).getByRole('button', { name: label, exact: true }).click();
    return;
  }
  await page.locator('.shell-header').getByRole('button', { name: 'Menu' }).click();
  const menu = page.getByRole('dialog', { name: 'Site menu' });
  await expect(menu).toBeVisible();
  await menu.locator('.shell-menu-item', { has: page.locator('.shell-menu-label', { hasText: label }) }).click();
  await expect(menu).toHaveCount(0);
}

test.describe('website navigation', () => {
  test('every main page opens from the header or menu with its heading and no errors', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/');
    await expect(h1(page)).toContainText('Hello');
    for (const p of PAGES) {
      await openFromHeader(page, p.label);
      await expect(page).toHaveURL(new RegExp(`#${p.hash}$`));
      await expect(h1(page)).toHaveText(p.h1);
      await expect(page.locator('.shell-footer')).toBeVisible();
    }
    // The brand button goes back home.
    await page.locator('.shell-header').getByRole('button', { name: 'Wherehouse home' }).click();
    await expect(h1(page)).toContainText('Hello');
    expect(errors).toEqual([]);
  });

  test('every footer link opens its page with its heading and no errors', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/');
    const footer = page.getByRole('navigation', { name: 'Footer' });
    for (const p of [...PAGES, ...FOOTER_EXTRA]) {
      await footer.getByRole('button', { name: p.label, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`#${p.hash}$`));
      await expect(h1(page)).toHaveText(p.h1);
    }
    expect(errors).toEqual([]);
  });

  test('every page loads directly from its link', async ({ page }) => {
    const errors = watchErrors(page);
    for (const p of [...PAGES, ...FOOTER_EXTRA]) {
      // A fresh document each time, like opening a shared link in a new tab.
      await page.goto('about:blank');
      await page.goto(`/#${p.hash}`);
      await expect(h1(page)).toHaveText(p.h1);
      await expect(page.getByRole('button', { name: 'Open Wherehouse Portal' }).first()).toBeVisible();
    }
    await page.goto('about:blank');
    await page.goto('/#home');
    await expect(h1(page)).toContainText('Hello');
    expect(errors).toEqual([]);
  });

  test('changing the hash on an open page shows that page', async ({ page }) => {
    await page.goto('/#pricing');
    await expect(h1(page)).toHaveText('Plans for every size of yard');
    await page.evaluate(() => {
      location.hash = '#security';
    });
    await expect(h1(page)).toHaveText('Your records stay yours');
  });

  test('the browser Back button returns to the previous website page', async ({ page }) => {
    await page.goto('/');
    const footer = page.getByRole('navigation', { name: 'Footer' });
    await footer.getByRole('button', { name: 'Pricing', exact: true }).click();
    await expect(h1(page)).toHaveText('Plans for every size of yard');
    await footer.getByRole('button', { name: 'Contact', exact: true }).click();
    await expect(h1(page)).toHaveText('Book a walkthrough');
    await page.goBack();
    await expect(page).toHaveURL(/#pricing$/);
    await expect(h1(page)).toHaveText('Plans for every size of yard');
  });

  test('on a phone, the menu lists every page and opens them', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = watchErrors(page);
    await page.goto('/');
    for (const p of [PAGES[0], PAGES[6], PAGES[7]]) {
      await page.getByRole('button', { name: 'Menu' }).click();
      const menu = page.getByRole('dialog', { name: 'Site menu' });
      await expect(menu.locator('.shell-menu-item')).toHaveCount(PAGES.length);
      await menu.locator('.shell-menu-item', { has: page.locator('.shell-menu-label', { hasText: p.label }) }).click();
      await expect(h1(page)).toHaveText(p.h1);
    }
    // Escape closes the menu and hands focus back to the Menu button.
    await page.getByRole('button', { name: 'Menu' }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Site menu' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Menu' })).toBeFocused();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    expect(errors).toEqual([]);
  });

  test('"Open Wherehouse Portal" leads to the sign-in front door, and back', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/');
    const hero = page.locator('.home-portal');
    await expect(hero.getByText('Already a Wherehouse customer?')).toBeVisible();
    await hero.getByRole('button', { name: 'Open Wherehouse Portal' }).click();
    await expect(page).toHaveURL(/#signin$/);
    await expect(page.getByText('Taking you to the Wherehouse Portal…')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Welcome to the portal.' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Sign-in is off while we test' })).toBeVisible();
    await expect(page.getByRole('radio')).toHaveCount(4);
    // Real sign-in is visibly off.
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeDisabled();

    await page.locator('.door-links').getByRole('button', { name: 'Back to the website' }).click();
    await expect(h1(page)).toContainText('Hello');

    // The same button sits on every page, for example Pricing's.
    await page.goto('/#pricing');
    await page.getByRole('button', { name: 'Open Wherehouse Portal' }).first().click();
    await expect(page.getByRole('heading', { name: 'Welcome to the portal.' })).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe('home page guided tour', () => {
  // One test here emulates a scanner; see the note on retries in scanners.spec.ts.
  test.describe.configure({ retries: 1 });

  /** Steps 1 and 2: receive the delivery, then look at its label. Returns the tour root. */
  async function receiveAndLabel(page: Page) {
    await page.goto('/');
    await page.getByRole('button', { name: 'Take the guided tour' }).click();
    const tour = page.locator('#tour .tt');
    await expect(tour.locator('.tt-count')).toHaveText('Step 1 of 6 · Receive');
    await expect(tour.getByRole('heading', { name: 'A delivery arrives' })).toBeVisible();
    // Next is locked until the delivery is received.
    await expect(tour.getByRole('button', { name: /^Next: Label/ })).toBeDisabled();
    const device = tour.getByRole('region', { name: 'Practice copy of the Wherehouse Portal' });
    await device.getByRole('button', { name: 'Receive it' }).click();
    await expect(tour.locator('.tt-turn')).toContainText('P-000042 is on record');
    await tour.getByRole('button', { name: /^Next: Label/ }).click();

    await expect(tour.locator('.tt-count')).toHaveText('Step 2 of 6 · Receive');
    await expect(tour.getByRole('heading', { name: 'It gets a label' })).toBeVisible();
    await tour.getByRole('button', { name: /^Next: Scan/ }).click();
    await expect(tour.locator('.tt-count')).toHaveText('Step 3 of 6 · Move');
    await expect(tour.getByRole('heading', { name: 'Put it on a rack' })).toBeVisible();
    return { tour, device };
  }

  /** Steps 4 to 6: confirm, find, history. */
  async function confirmFindHistory(page: Page, tour: Locator, device: Locator) {
    await device.getByRole('button', { name: /Review the move/ }).click();
    await expect(tour.locator('.tt-count')).toHaveText('Step 4 of 6 · Move');
    await expect(tour.getByRole('heading', { name: 'Confirm it' })).toBeVisible();
    await device.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(tour.locator('.tt-turn')).toContainText('Saved. Next, find it again.');
    await tour.getByRole('button', { name: /^Next: Find/ }).click();

    await expect(tour.locator('.tt-count')).toHaveText('Step 5 of 6 · Find');
    await expect(tour.getByRole('heading', { name: 'Find it later' })).toBeVisible();
    await expect(device.locator('[data-tt-row="P-000042"]')).toBeVisible();
    await expect(device.locator('[data-tt-row="P-000042"]')).toContainText('A-03-02');
    await tour.getByRole('button', { name: /^Next: History/ }).click();

    await expect(tour.locator('.tt-count')).toHaveText('Step 6 of 6 · Find');
    await expect(tour.getByRole('heading', { name: 'Every step is on the record' })).toBeVisible();
    await expect(tour.getByText('That’s the whole loop: Receive, Move, Find')).toBeVisible();
    await expect(tour.getByRole('button', { name: /^Next:/ })).toHaveCount(0);
    // Every step happened on the website's home page.
    expect(new URL(page.url()).hash).toBe('');
  }

  async function tapThrough(page: Page) {
    const errors = watchErrors(page);
    const { tour, device } = await receiveAndLabel(page);

    // A rack first just gets a reminder: pallet first, then the rack.
    await device.getByRole('button', { name: 'Scan the rack label A-03-02' }).click();
    await expect(device.getByText('Pallet first, then the rack')).toBeVisible();
    await device.getByRole('button', { name: 'Scan the pallet label P-000042' }).click();
    await expect(device.getByText('Pallet scanned')).toBeVisible();
    await device.getByRole('button', { name: 'Scan the rack label A-03-02' }).click();
    await expect(device.getByText('Rack scanned')).toBeVisible();

    await confirmFindHistory(page, tour, device);

    // Start over resets the tour in place.
    await tour.locator('.tt-wrap').getByRole('button', { name: 'Start over' }).click();
    await expect(tour.locator('.tt-count')).toHaveText('Step 1 of 6 · Receive');

    // Still on the website's home page: no hash, no portal, nobody signed in.
    expect(new URL(page.url()).hash).toBe('');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Hello');
    await expect(page.locator('.topbar')).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('pl.actor'))).toBeNull();
    expect(errors).toEqual([]);
  }

  test('runs start to finish with taps and never leaves the home page', async ({ page }) => {
    await tapThrough(page);
  });

  test('on a phone, runs start to finish with taps and never leaves the home page', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await tapThrough(page);
  });

  test('a keyboard-wedge scanner works in the scan step', async ({ page }) => {
    const errors = watchErrors(page);
    const { tour, device } = await receiveAndLabel(page);
    await wedgeScan(page, 'P-000042');
    await expect(device.getByText('Pallet scanned')).toBeVisible();
    await wedgeScan(page, 'A-03-02');
    await expect(device.getByText('Rack scanned')).toBeVisible();
    await confirmFindHistory(page, tour, device);
    expect(new URL(page.url()).hash).toBe('');
    await expect(page.locator('.topbar')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});
