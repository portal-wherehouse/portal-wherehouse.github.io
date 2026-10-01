// Copy rules that hold on every page of the website and the portal: no em dashes in anything a person
// can read (text, labels, tooltips, placeholders), and the old product name never appears.

import { expect, test, type Page } from '@playwright/test';
import { signInAs } from './helpers';

const SITE = ['', 'product', 'showcase', 'simple', 'hardware', 'industries', 'for', 'for/warehouses', 'for/lumberyards', 'for/contractors', 'for/parts', 'for/retail', 'for/rentals', 'for/manufacturing', 'for/facilities', 'customers', 'pricing', 'founder', 'contact', 'security', 'signin'];
const PORTAL = ['overview', 'receive', 'move', 'find', 'map', 'activity', 'reconcile', 'jobs', 'locations', 'labels', 'import', 'export', 'people', 'sync', 'lab', 'guide', 'settings', 'about', 'more', 'help', 'scanners', 'station', 'data'];

/** Every place on the page where `pattern` shows up in readable text, with a little context. */
async function findReadable(page: Page, pattern: RegExp): Promise<string[]> {
  return page.evaluate((source) => {
    const re = new RegExp(source, 'g');
    // Folded answers and previews are readable too.
    document.querySelectorAll('details').forEach((d) => (d.open = true));
    const out: string[] = [];
    const text = document.body.innerText;
    for (const m of text.matchAll(re)) out.push(text.slice(Math.max(0, (m.index ?? 0) - 40), (m.index ?? 0) + 40).replace(/\s+/g, ' '));
    for (const el of document.querySelectorAll('[aria-label], [title], [placeholder], [alt]')) {
      for (const a of ['aria-label', 'title', 'placeholder', 'alt']) {
        const v = el.getAttribute(a);
        if (v && new RegExp(source).test(v)) out.push(`${a}="${v}"`);
      }
    }
    if (new RegExp(source).test(document.title)) out.push(`<title>${document.title}`);
    return out;
  }, pattern.source);
}

async function scanAll(page: Page, pattern: RegExp): Promise<string[]> {
  const found: string[] = [];
  for (const hash of SITE) {
    await page.goto('about:blank');
    await page.goto(hash ? `/#${hash}` : '/');
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    for (const f of await findReadable(page, pattern)) found.push(`#${hash || 'home'}: ${f}`);
  }
  await signInAs(page, 'owner');
  for (const hash of PORTAL) {
    await page.goto('about:blank');
    await page.goto(`/#${hash}`);
    await expect(page.locator('#main h1')).toBeVisible();
    for (const f of await findReadable(page, pattern)) found.push(`#${hash}: ${f}`);
  }
  return found;
}

test('no em dashes in readable text on any page', async ({ page }) => {
  test.setTimeout(180_000);
  expect(await scanAll(page, /—/)).toEqual([]);
});

test('the old product name never appears on any page', async ({ page }) => {
  test.setTimeout(180_000);
  expect(await scanAll(page, /Pallet Locator/i)).toEqual([]);
});
