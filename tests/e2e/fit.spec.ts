import { test, expect } from '@playwright/test';

const VERDICT = /great fit|good fit|with limits|with some limits/i;

test('the "is it for me" page answers typed and picked businesses honestly', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/#fit');
  await page.getByRole('textbox', { name: 'Your kind of business' }).fill('tire shpo');
  await page.getByRole('button', { name: 'Check', exact: true }).click();
  const detail = page.getByTestId('fit-detail');
  await expect(detail).toContainText('Tire shop');
  await expect(detail).toContainText('Receive a set');
  await page.getByRole('tab', { name: /Stores & back rooms/ }).click();
  await page.locator('.fit-tile', { hasText: 'Online store' }).click();
  await expect(detail).toContainText('What it won’t do');
  await expect(detail).toContainText('Yes, with some limits');
  await expect(detail).toContainText('count units yet');
  await page.getByRole('textbox', { name: 'Your kind of business' }).fill('dog grooming');
  await page.getByRole('button', { name: 'Check', exact: true }).click();
  const unknown = page.getByTestId('fit-unknown');
  for (const q of await unknown.getByRole('radiogroup').all()) await q.getByRole('radio', { name: 'Yes' }).click();
  await expect(unknown).toContainText('great fit');
  await page.screenshot({ path: 'test-results/fit-page.png', fullPage: false });
});

test('tiles and chips keep the verdict for the detail card', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/#fit');
  await page.getByRole('button', { name: /Show all \d+ kinds of business/ }).click();
  expect(await page.locator('.fit-tile').count()).toBeGreaterThanOrEqual(55);
  await expect(page.locator('.fit-grid')).not.toContainText(VERDICT);
  await expect(page.locator('.fit-marquee')).not.toContainText(VERDICT);
  await page.locator('.fit-tile', { hasText: 'Small warehouse' }).click();
  await expect(page.getByTestId('fit-detail')).toContainText('Yes. It’s a great fit.');
});

test('a marquee chip pauses under the pointer and opens its business', async ({ page }) => {
  await page.goto('/#fit');
  const row = page.locator('.fit-marquee-row').first();
  const box = (await row.boundingBox())!;
  const y = box.y + box.height / 2;
  await page.mouse.move(640, y);
  const before = (await row.boundingBox())!.x;
  await page.waitForTimeout(400);
  expect((await row.boundingBox())!.x).toBe(before);
  const name = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('.fit-chip')?.textContent?.trim(), [640, y]);
  expect(name).toBeTruthy();
  await page.mouse.click(640, y);
  const detail = page.getByTestId('fit-detail');
  await expect(detail.locator('.site-eyebrow')).toHaveText(name!);
  await expect(detail.getByRole('heading', { level: 2 })).toContainText(/^Yes/);
});

test('marquee chips are keyboard buttons, each business once', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/#fit');
  const marquee = page.getByRole('group', { name: 'Businesses people ask about' });
  const chip = marquee.getByRole('button', { name: 'Tire shop', exact: true });
  await expect(chip).toHaveCount(1);
  await expect(marquee.locator('.fit-chip[aria-hidden="true"]').first()).toHaveAttribute('tabindex', '-1');
  await chip.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('fit-detail')).toContainText('Tire shop');
});

test('the headline erases the whole word and types a new one', async ({ page }) => {
  await page.goto('/#fit');
  const typed = page.getByTestId('fit-typed');
  const first = (await typed.textContent())!;
  expect(first.length).toBeGreaterThan(2);
  // Record every change for one full cycle.
  const seen: string[] = await typed.evaluate(
    (el) =>
      new Promise<string[]>((done) => {
        const out: string[] = [];
        new MutationObserver(() => out.push(el.textContent ?? '')).observe(el, { childList: true, characterData: true, subtree: true });
        setTimeout(() => done(out), 5500);
      }),
  );
  const cleared = seen.indexOf('');
  expect(cleared).toBeGreaterThan(0);
  // Erasing is quick: only a handful of steps from the full word to nothing.
  expect(cleared).toBeLessThanOrEqual(10);
  // Then it types something else, one letter at a time.
  const next = seen.slice(cleared + 1).reduce((a, b) => (b.length > a.length ? b : a), '');
  expect(next.length).toBeGreaterThan(2);
  expect(next).not.toBe(first);
});

test('survey icons stay small on the website', async ({ page }) => {
  await page.goto('/#start');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  const box = await page.locator('.survey-why svg').boundingBox();
  expect(box!.width).toBeLessThanOrEqual(24);
  await page.screenshot({ path: 'test-results/survey-q1.png' });
});
