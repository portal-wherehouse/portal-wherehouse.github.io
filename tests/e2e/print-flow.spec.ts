import { test, expect, type Page } from '@playwright/test';
import { signInAs, watchErrors } from './helpers';

const PX = 96;

/** [printer, style, page size in inches, label size in inches, first label offset (top, left) in inches] */
const CASES: [string, string, [number, number], [number, number], [number, number]][] = [
  ['office', 'spot', [8.5, 11], [4, 10 / 3], [0.5, 0.25]],
  ['office', 'shelf', [8.5, 11], [2.5, 1], [0.5, 0.25]],
  ['office', 'poster', [8.5, 11], [8, 10.5], [0.25, 0.25]],
  ['office', 'item', [8.5, 11], [4, 10 / 3], [0.5, 0.25]],
  ['avery5160', 'shelf', [8.5, 11], [2.625, 1], [0.5, 0.1875]],
  ['avery5160', 'spot', [8.5, 11], [2.625, 1], [0.5, 0.1875]],
  ['avery5163', 'spot', [8.5, 11], [4, 2], [0.5, 0.15625]],
  ['avery5163', 'shelf', [8.5, 11], [4, 2], [0.5, 0.15625]],
  ['avery5164', 'spot', [8.5, 11], [4, 10 / 3], [0.5, 0.15625]],
  ['strip', 'shelf', [8.5, 11], [8 / 3, 1.25], [0.5, 0.25]],
  ['thermal4x6', 'spot', [4, 6], [4, 6], [0, 0]],
  ['thermal4x6', 'poster', [4, 6], [4, 6], [0, 0]],
  ['thermal4x6', 'item', [4, 6], [4, 6], [0, 0]],
  ['thermal2x1', 'shelf', [2, 1], [2, 1], [0, 0]],
  ['thermal225', 'shelf', [2.25, 1.25], [2.25, 1.25], [0, 0]],
  ['thermal225', 'spot', [2.25, 1.25], [2.25, 1.25], [0, 0]],
];

async function choose(page: Page, printer: string, style: string) {
  const flow = page.getByTestId('print-flow');
  const change = flow.locator('.pf-step').first().getByRole('button', { name: 'Change' });
  if (await change.isVisible()) await change.click();
  await flow.getByTestId(`printer-${printer}`).click();
  const styleCard = flow.getByTestId(`style-${style}`);
  if (await styleCard.isVisible()) await styleCard.click();
  else {
    const changeStyle = flow.locator('.pf-step').nth(1).getByRole('button', { name: 'Change' });
    if (await changeStyle.isVisible()) {
      await changeStyle.click();
      await styleCard.click();
    }
  }
  await expect(flow.getByTestId('print-preview')).toHaveAttribute('data-style', style);
  await expect(flow.getByTestId('print-preview')).toHaveAttribute('data-printer', printer);
}

test('each printer offers only its own label styles', async ({ page }) => {
  await signInAs(page, 'owner');
  await page.goto('/?demo=1#labels');
  const flow = page.getByTestId('print-flow');
  await flow.getByTestId('printer-thermal2x1').click();
  await expect(flow.getByTestId('style-shelf')).toBeVisible();
  await expect(flow.getByTestId('style-item')).toBeVisible();
  await expect(flow.getByTestId('style-spot')).toHaveCount(0);
  await expect(flow.getByTestId('style-poster')).toHaveCount(0);
  await flow.locator('.pf-step').first().getByRole('button', { name: 'Change' }).click();
  await flow.getByTestId('printer-strip').click();
  // Strip paper only makes shelf-edge labels, so it goes straight to step 3.
  await expect(flow.getByTestId('pf-style-summary')).toContainText('Shelf-edge label');
  await expect(flow.getByTestId('print-preview')).toBeVisible();
  // The choice is remembered for this warehouse.
  await page.reload();
  await expect(flow.getByTestId('pf-printer-summary')).toContainText('Shelf-edge strip paper');
  await expect(flow.getByTestId('print-preview')).toHaveAttribute('data-printer', 'strip');
});

test('every format previews at true size, with no label clipped, and prints one sheet or label per page', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  await signInAs(page, 'owner');
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/?demo=1#labels');
  for (const [printer, style, pageIn, labelIn, offsetIn] of CASES) {
    await choose(page, printer, style);
    const preview = page.getByTestId('print-preview');
    const sheet = preview.getByTestId('print-page').first();
    await expect(sheet).toBeVisible();
    const box = (await sheet.boundingBox())!;
    expect(Math.abs(box.width - pageIn[0] * PX), `${printer}/${style} page width`).toBeLessThan(1.5);
    expect(Math.abs(box.height - pageIn[1] * PX), `${printer}/${style} page height`).toBeLessThan(1.5);
    const cell = (await sheet.locator('.pp-cell').first().boundingBox())!;
    expect(Math.abs(cell.width - labelIn[0] * PX), `${printer}/${style} label width`).toBeLessThan(1.5);
    expect(Math.abs(cell.height - labelIn[1] * PX), `${printer}/${style} label height`).toBeLessThan(1.5);
    expect(Math.abs(cell.y - box.y - offsetIn[0] * PX), `${printer}/${style} top offset`).toBeLessThan(1.5);
    expect(Math.abs(cell.x - box.x - offsetIn[1] * PX), `${printer}/${style} left offset`).toBeLessThan(1.5);
    // Nothing inside a label reaches past its edge.
    const clipped = await sheet.evaluate((el) => {
      const out: string[] = [];
      for (const c of Array.from(el.querySelectorAll('.pp-cell'))) {
        const r = c.getBoundingClientRect();
        for (const d of Array.from(c.querySelectorAll('*'))) {
          const b = d.getBoundingClientRect();
          if (!b.width || !b.height) continue;
          if (b.left < r.left - 1.5 || b.top < r.top - 1.5 || b.right > r.right + 1.5 || b.bottom > r.bottom + 1.5) out.push(`${d.tagName}.${(d as HTMLElement).className?.toString?.() ?? ''}`);
        }
      }
      return out.slice(0, 5);
    });
    expect(clipped, `${printer}/${style} clipped`).toEqual([]);
    // The warehouse name prints, never an email address.
    expect(await sheet.textContent()).not.toMatch(/@/);
  }
  expect(errors).toEqual([]);
});

test('printing lays out one page per sheet with the sheet size, and thermal labels one per page', async ({ page }) => {
  await signInAs(page, 'owner');
  await page.goto('/?demo=1#labels');
  await choose(page, 'avery5160', 'shelf');
  const count = (await page.getByTestId('print-count').textContent()) ?? '';
  const [, labels, sheets] = /^(\d+) labels? on (\d+) sheets?$/.exec(count) ?? [];
  expect(Number(labels)).toBeGreaterThan(0);
  expect(Number(sheets)).toBe(Math.ceil(Number(labels) / 30));
  await page.emulateMedia({ media: 'print' });
  const printed = page.locator('.pp-print .pp-page');
  await expect(printed).toHaveCount(Number(sheets));
  await expect(printed.first()).toBeVisible();
  await expect(page.locator('.sidebar')).toBeHidden();
  expect(await page.locator('#print-root style').first().textContent()).toContain('size: 8.5in 11in');
  await page.emulateMedia({ media: 'screen' });

  await choose(page, 'thermal4x6', 'spot');
  const n = Number(/^(\d+)/.exec((await page.getByTestId('print-count').textContent()) ?? '')?.[1]);
  await page.emulateMedia({ media: 'print' });
  await expect(printed).toHaveCount(n);
  expect(await page.locator('#print-root style').first().textContent()).toContain('size: 4in 6in');
  await page.emulateMedia({ media: 'screen' });
});

test('spots can be printed by zone, by aisle or only the ones not printed yet; signs come one per zone', async ({ page }) => {
  await signInAs(page, 'owner');
  await page.goto('/?demo=1#labels');
  await choose(page, 'office', 'spot');
  const count = page.getByTestId('print-count');
  const all = Number(/^(\d+)/.exec((await count.textContent()) ?? '')?.[1]);
  await page.getByTestId('scope-zone').click();
  const zone = Number(/^(\d+)/.exec((await count.textContent()) ?? '')?.[1]);
  expect(zone).toBeLessThan(all);
  await page.getByTestId('scope-unprinted').click();
  await expect(count).toHaveText(new RegExp(`^${all} labels`));
  // Printing marks them, so "not printed yet" empties.
  await page.evaluate(() => (window.print = () => {}));
  await page.getByTestId('scope-all').click();
  await page.getByTestId('print-go').click();
  await page.getByTestId('scope-unprinted').click();
  await expect(page.getByTestId('print-flow')).toContainText('Every spot has been printed from this computer');

  await choose(page, 'office', 'poster');
  await page.getByTestId('signs-zone').click();
  const signs = page.getByTestId('print-preview').locator('.pl-sign');
  await expect(signs.first()).toContainText('Section');
});

test('the Labels page works at phone width without sideways scrolling', async ({ page }) => {
  await signInAs(page, 'owner');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?demo=1#labels');
  await choose(page, 'avery5160', 'shelf');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
