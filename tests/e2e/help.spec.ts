// Help (#help): the video placeholder and its chapters, the searchable FAQ, the search across all of
// Help, and the contact form that validates and keeps requests in this browser.

import { expect, test } from '@playwright/test';
import { portalReady, signInAs, watchErrors } from './helpers';

test.beforeEach(async ({ page }) => {
  await signInAs(page, 'owner');
  await page.goto('/#help');
  await portalReady(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Help' })).toBeVisible();
});

test('the video placeholder never pretends to play, and lists its chapters', async ({ page }) => {
  const errors = watchErrors(page);
  const video = page.locator('#help-video');
  await expect(video.getByRole('heading', { name: 'Video tutorial' })).toBeVisible();
  const screen = video.getByRole('group', { name: /^Video placeholder: .*Coming soon/ });
  await expect(screen).toBeVisible();
  await expect(screen.getByText('Video coming soon')).toBeVisible();

  const play = video.getByRole('button', { name: 'Play the walkthrough video (not recorded yet)' });
  await expect(play).toHaveAttribute('aria-expanded', 'false');
  await play.click();
  await expect(play).toHaveAttribute('aria-expanded', 'true');
  await expect(video.getByText('This video is not recorded yet')).toBeVisible();
  await expect(page.locator('video')).toHaveCount(0);
  await video.getByRole('button', { name: 'See the chapters' }).click();
  await expect(video.getByText('This video is not recorded yet')).toHaveCount(0);

  // What the video will cover, then its chapters: 8 at first, all of them on request.
  await expect(video.getByRole('heading', { name: 'What this video covers' })).toBeVisible();
  const chapters = video.getByRole('list', { name: 'Planned video chapters' }).getByRole('listitem');
  await expect(chapters).toHaveCount(8);
  const more = video.getByRole('button', { name: /^Show all \d+ chapters$/ });
  const total = Number((await more.textContent())?.match(/(\d+)/)?.[1]);
  expect(total).toBeGreaterThan(8);
  await more.click();
  await expect(chapters).toHaveCount(total);
  for (const row of await chapters.all()) {
    await expect(row.locator('.help-stamp')).toHaveText(/^\d{1,2}:\d{2}$/);
    await expect(row.locator('strong')).not.toBeEmpty();
    await expect(row.locator('p')).not.toBeEmpty();
    await expect(row.getByRole('button', { name: /^Go there: open / })).toBeVisible();
  }
  await video.getByRole('button', { name: 'Show fewer chapters' }).click();
  await expect(chapters).toHaveCount(8);

  // A chapter's Go there opens the real screen it describes.
  await chapters.filter({ hasText: 'Receiving a delivery' }).getByRole('button', { name: /^Go there/ }).click();
  await expect(page).toHaveURL(/#receive$/);
  expect(errors).toEqual([]);
});

test('FAQ: search filters and opens answers, and questions expand on click', async ({ page }) => {
  const faq = page.locator('#help-faq');
  const count = faq.locator('.help-faq-count');
  await expect(count).toHaveText(/^\d+ answers in \d+ groups\.$/);
  const all = Number((await count.textContent())?.match(/^(\d+)/)?.[1]);

  // Expand one question by clicking it, and close it again.
  const login = faq.locator('details', { hasText: 'Do I need a username and password?' });
  await expect(login).not.toHaveAttribute('open', '');
  await login.locator('summary').click();
  await expect(login).toHaveAttribute('open', '');
  await expect(login.locator('.help-q-body')).toBeVisible();
  await login.locator('summary').click();
  await expect(login).not.toHaveAttribute('open', '');

  // Searching narrows the list, highlights the words and opens the matches.
  await faq.locator('#help-faq-q').fill('torn');
  await expect(count).toContainText(new RegExp(`^\\d+ of ${all} answers match “torn”\\.`));
  const shown = await faq.locator('details.help-q').count();
  expect(shown).toBeGreaterThan(0);
  expect(shown).toBeLessThan(all);
  const torn = faq.locator('details', { hasText: 'The label is torn or will not scan. What now?' });
  await expect(torn).toHaveAttribute('open', '');
  await expect(torn.locator('.help-q-body')).toBeVisible();
  await expect(faq.locator('mark').first()).toBeVisible();

  await faq.getByRole('button', { name: 'Clear' }).click();
  await expect(count).toHaveText(`${all} answers in ${await faq.locator('.help-faq-cat').count()} groups.`);
  await expect(faq.locator('details.help-q')).toHaveCount(all);

  // Nothing matches: hand the question to the contact form.
  await faq.locator('#help-faq-q').fill('zzqqxx');
  await expect(count).toContainText('No answers match “zzqqxx”.');
  await faq.getByRole('button', { name: 'Ask support about this' }).click();
  await expect(page.locator('#help-msg')).toHaveValue(/I could not find an answer to: zzqqxx/);
  await expect(page.getByRole('radio', { name: 'Question' })).toBeChecked();
});

test('search across all of Help finds tutorials, chapters and answers', async ({ page }) => {
  await page.locator('#help-search').fill('scanner');
  const hits = page.locator('.help-hits');
  await expect(hits.locator('.help-hit').first()).toBeVisible();
  await expect(hits.locator('.help-hit-kind', { hasText: 'Tutorial' }).first()).toBeVisible();
  await expect(hits.locator('.help-hit-kind', { hasText: 'Video chapter' }).first()).toBeVisible();
  await expect(hits.locator('.help-hit-kind', { hasText: 'Question' }).first()).toBeVisible();
  // Picking a question opens it in place.
  await hits.locator('.help-hit', { hasText: 'Which barcode scanners work?' }).click();
  await expect(page.locator('details', { hasText: 'Which barcode scanners work?' })).toHaveAttribute('open', '');
});

test('contact form: validates, then keeps the request on this device with a reference', async ({ page }) => {
  const errors = watchErrors(page);
  const form = page.locator('form.help-form');
  await expect(page.getByText('The support inbox is not connected in this preview yet', { exact: true })).toBeVisible();
  await expect(page.locator('.help-mine')).toContainText('None yet.');

  // An empty message is refused, and the message box gets focus.
  await form.getByRole('button', { name: 'Create request' }).click();
  await expect(form.getByText('Tell us what you need. A sentence or two is plenty.')).toBeVisible();
  await expect(page.locator('#help-msg')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#help-msg')).toBeFocused();

  // A bad reply address is refused too.
  await page.locator('#help-name').fill('Test Tester');
  await page.locator('#help-email').fill('not-an-email');
  await page.locator('#help-msg').fill('P-000016 shows at A-03-01 but I cannot find it there.');
  await form.getByRole('button', { name: 'Create request' }).click();
  await expect(form.getByText('Enter an email address like name@company.com, or leave it blank.')).toBeVisible();
  await expect(page.locator('#help-email')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#help-email')).toBeFocused();

  // Fix it, pick a topic and urgency, and create the request.
  await page.locator('#help-email').fill('tester@example.com');
  await expect(page.locator('#help-email')).toHaveAttribute('aria-invalid', 'false');
  await form.getByRole('group', { name: 'Topic' }).locator('label', { hasText: 'Problem' }).click();
  await expect(page.getByRole('radio', { name: 'Problem' })).toBeChecked();
  await form.getByRole('group', { name: 'How urgent is it?' }).locator('label', { hasText: 'Blocking work' }).click();
  await expect(form.getByText('Marked URGENT in the email subject so it stands out.')).toBeVisible();
  await form.getByRole('button', { name: 'Create request' }).click();

  const done = page.locator('.help-done');
  await expect(done.getByRole('heading', { name: 'Request ready to send' })).toBeVisible();
  const ref = (await done.locator('.help-ref .mono').textContent())!.trim();
  expect(ref).toMatch(/^HELP-\d{6}-[A-Z2-9]{4}$/);
  await expect(done).toContainText('Saved on this device at');
  await expect(done.getByRole('link', { name: 'Email support now' })).toHaveAttribute('href', /^mailto:/);

  // Stored locally, listed beside the form, and still there after a reload.
  const stored = await page.evaluate(() => localStorage.getItem('wh.help.tickets'));
  expect(stored).toContain(ref);
  expect(stored).toContain('P-000016 shows at A-03-01');
  const mine = page.locator('.help-mine');
  await expect(mine.locator('.help-mine-ref')).toHaveText([ref]);
  await expect(mine).toContainText('Blocking work');
  await page.reload();
  await expect(page.locator('.help-mine .help-mine-ref')).toHaveText([ref]);

  // Remove it from this device.
  await page.getByRole('button', { name: `Remove ${ref} from this device` }).click();
  await expect(page.locator('.help-mine')).toContainText('None yet.');
  expect(await page.evaluate(() => localStorage.getItem('wh.help.tickets'))).not.toContain(ref);
  expect(errors).toEqual([]);
});
