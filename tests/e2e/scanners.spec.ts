// Hardware scanners in keyboard-wedge mode, emulated with fast key bursts that end in Enter while no
// text field has focus (src/device/wedge.ts: default 50 ms max gap, 4 characters minimum, Enter or
// Tab suffix), routed by src/device/scanRouter.tsx to the screen that is listening. Plus the Scan
// station's put-away and count.
//
// Demo data used (tiny fixture): P-000016 and P-000017 and P-000032 are on rack A-03-01; P-000022 is
// on A-02-01; P-000013 and P-000037 are received but not placed; P-000014 and P-000027 are on
// A-01-01; A-03-02 is empty; P-999999 does not exist.

import { expect, test, type Page } from '@playwright/test';
import { CODE128_PATTERNS } from '../../src/device/code128';
import { blurFields, portalReady, signInAs, watchErrors, wedgeScan } from './helpers';

/**
 * Read a Code 128 barcode back from the SVG the app draws (Barcode128.tsx: one path, a
 * "M{x} 0h{w}v100h{-w}z" rectangle per bar). Returns the text, or throws if the bars or the
 * checksum are wrong, so a printed command sheet is proven scannable, not just labelled.
 */
function decodeCode128Path(d: string): string {
  const bars = [...d.matchAll(/M([\d.]+) 0h([\d.]+)v100h-?[\d.]+z/g)].map((m) => ({ x: Number(m[1]), w: Number(m[2]) }));
  const widths: number[] = [];
  bars.forEach((b, i) => {
    widths.push(b.w);
    if (i < bars.length - 1) widths.push(bars[i + 1].x - (b.x + b.w));
  });
  const values: number[] = [];
  for (let i = 0; i + 6 <= widths.length; i += 6) {
    const pattern = widths.slice(i, i + 6).join('');
    if (widths.length - i === 7 && widths.slice(i).join('') === CODE128_PATTERNS[106]) break;
    const v = CODE128_PATTERNS.indexOf(pattern);
    if (v < 0 || v > 105) throw new Error(`not a Code 128 symbol: ${pattern}`);
    values.push(v);
  }
  const [start, ...rest] = values;
  const check = rest.pop()!;
  const sum = rest.reduce((acc, v, i) => acc + v * (i + 1), start) % 103;
  if (sum !== check) throw new Error(`checksum ${check} should be ${sum}`);
  let set: 'B' | 'C' = start === 105 ? 'C' : 'B';
  if (start !== 104 && start !== 105) throw new Error(`unexpected start code ${start}`);
  let text = '';
  for (const v of rest) {
    if (v === 99) set = 'C';
    else if (v === 100) set = 'B';
    else text += set === 'C' ? String(v).padStart(2, '0') : String.fromCharCode(v + 32);
  }
  return text;
}

// Emulated key bursts are timed by the test runner, not by scanner hardware. On an overloaded machine
// wedgeScan fails loudly when its own burst was too slow; one retry in a fresh browser covers that.
// A real app failure fails both times (and a pass on retry is reported as flaky, not hidden).
test.describe.configure({ retries: 1 });

async function openStation(page: Page, role: 'operator' | 'owner' = 'operator') {
  await signInAs(page, role);
  await page.goto('/#station');
  await portalReady(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Scan station' })).toBeVisible();
  await expect(page.locator('.st-listen')).toHaveText('Listening for scanners');
}

const modeButton = (page: Page, name: string) => page.getByRole('group', { name: 'Station mode' }).getByRole('button', { name: new RegExp(`^${name}`) });
const prompt = (page: Page) => page.locator('#st-prompt');
const flash = (page: Page) => page.locator('.st-flash');
const logItems = (page: Page) => page.getByRole('region', { name: 'Session log' }).locator('.st-log-item');

test.describe('keyboard-wedge scanner emulation', () => {
  test('Scanners test pad: a fast burst is a scan, slow typing is not', async ({ page }) => {
    const errors = watchErrors(page);
    await signInAs(page, 'owner');
    await page.goto('/#scanners');
    await portalReady(page);
    const pad = page.locator('.scn-pad');
    await expect(pad.getByText('Listening', { exact: true })).toBeVisible();

    // A person typing (120 ms between keys, well over the 50 ms limit) is not a scanner.
    await blurFields(page);
    await page.keyboard.type('P-000016', { delay: 120 });
    await page.keyboard.press('Enter');
    await expect(pad.getByText('Pick up your scanner and scan any label or barcode.')).toBeVisible();
    await expect(page.getByTestId('scan-latest')).toHaveCount(0);

    // A scanner burst is.
    await wedgeScan(page, 'P-000016');
    const hit = page.getByTestId('scan-latest');
    await expect(hit.getByTestId('scan-text')).toHaveText('P-000016');
    await expect(hit).toContainText('Pallet P-000016');
    await expect(hit).toContainText('Scanner (keyboard mode)');
    await expect(hit).toContainText('Scanner speed.');

    // Shorter than the 4-character minimum: ignored.
    await wedgeScan(page, 'A1');
    await expect(hit.getByTestId('scan-text')).toHaveText('P-000016');

    // Racks and command barcodes are recognised too.
    await wedgeScan(page, 'A-03-01');
    await expect(hit.getByTestId('scan-text')).toHaveText('A-03-01');
    await wedgeScan(page, 'CMD:CONFIRM');
    await expect(hit.getByTestId('scan-text')).toHaveText('CMD:CONFIRM');
    await expect(page.getByRole('list', { name: 'Earlier scans' }).locator('li')).toHaveCount(2);
    expect(errors).toEqual([]);
  });

  test('a scan typed into a text field stays in the field', async ({ page }) => {
    await openStation(page);
    const box = page.locator('#st-code');
    await box.click();
    await page.keyboard.type('P-000016', { delay: 5 });
    // The field got the characters; the station did not look anything up yet.
    await expect(box).toHaveValue('P-000016');
    await expect(page.locator('.st-look')).toHaveCount(0);
    await box.fill('');
  });

  test('a scanner that ends with Tab instead of Enter also works', async ({ page }) => {
    await signInAs(page, 'operator');
    await page.goto('/#find');
    await portalReady(page);
    await wedgeScan(page, 'P-000016', { suffix: 'Tab' });
    await expect(page.getByText('Scanned P-000016. Opening the pallet.')).toBeVisible();
    await expect(page.locator('#main .page-head')).toContainText('P-000016');
  });

  test('the website Scanners page shows what a scanner sent', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/#hardware');
    await page.getByText('Open scanner test',{exact:true}).click();
    const panel = page.locator('.hw-test');
    await panel.scrollIntoViewIfNeeded();
    await expect(panel.getByText('Listening for scans')).toBeVisible();
    await expect(panel.getByText('Waiting for a scan')).toBeVisible();
    await wedgeScan(page, 'A-03-02');
    await expect(panel.locator('.hw-received')).toHaveText('A-03-02');
    await expect(panel).toContainText('Spot code A-03-02');
    await expect(panel).toContainText('Scanner speed. The portal will treat this as a scan.');
    await wedgeScan(page, 'CMD:MODE_COUNT');
    await expect(panel.locator('.hw-received')).toHaveText('CMD:MODE_COUNT');
    await expect(panel).toContainText('Command barcode: Count mode');
    // Still the website: scans here never open the portal.
    await expect(page).toHaveURL(/#hardware$/);
    expect(errors).toEqual([]);
  });

  test('the printed command barcodes encode their commands, and scanning one switches the station', async ({ page }) => {
    await signInAs(page, 'operator');
    await page.goto('/#scanners');
    await portalReady(page);
    const sheet = page.locator('#command-sheet');
    const cards = sheet.locator('.scn-cmd-grid .scn-cmd-card');
    await expect(cards).toHaveCount(7);
    const expected = ['CMD:CONFIRM', 'CMD:CANCEL', 'CMD:FINISH', 'CMD:MODE_LOOKUP', 'CMD:MODE_MOVE', 'CMD:MODE_PUTAWAY', 'CMD:MODE_COUNT'];
    for (let i = 0; i < expected.length; i++) {
      const d = await cards.nth(i).locator('.bc128 svg path').getAttribute('d');
      expect(decodeCode128Path(d!)).toBe(expected[i]);
      await expect(cards.nth(i).locator('.bc128-text')).toHaveText(expected[i]);
    }

    // Scan what the Count mode card actually encodes: it opens the Scan station in Count mode.
    const count = cards.filter({ hasText: 'Count mode' });
    const text = decodeCode128Path((await count.locator('.bc128 svg path').getAttribute('d'))!);
    // The Scanners page has its own test pad listening first; pause it so the scan goes to the portal.
    await page.locator('.scn-pad').getByRole('button', { name: /Pause/ }).click();
    await wedgeScan(page, text);
    await expect(page).toHaveURL(/#station(\?|$)/);
    await expect(modeButton(page, 'Count')).toHaveAttribute('aria-pressed', 'true');
  });

  test('Scan station Look up: scanning a pallet and a rack shows where they are', async ({ page }) => {
    const errors = watchErrors(page);
    await openStation(page);
    await expect(modeButton(page, 'Look up')).toHaveAttribute('aria-pressed', 'true');
    await expect(prompt(page)).toHaveText('Scan any pallet or rack');

    await wedgeScan(page, 'P-000016');
    const look = page.locator('.st-look');
    await expect(look.locator('.st-bigcode')).toHaveText('P-000016');
    await expect(look.locator('.st-look-desc')).toHaveText('Plumbing fixtures');
    await expect(look).toContainText('A-03-01');
    await expect(logItems(page).first()).toContainText('Scanner');

    await wedgeScan(page, 'A-03-01');
    await expect(page.locator('.st-work')).toContainText('P-000032');
    await expect(page.locator('.st-work')).toContainText('P-000017');
    await expect(page.getByRole('region', { name: 'Session log' }).locator('.st-log-count')).toHaveText('2 scans');
    expect(errors).toEqual([]);
  });

  test('command barcodes switch the Scan station mode', async ({ page }) => {
    await openStation(page);
    await wedgeScan(page, 'CMD:MODE_COUNT');
    await expect(modeButton(page, 'Count')).toHaveAttribute('aria-pressed', 'true');
    await expect(modeButton(page, 'Look up')).toHaveAttribute('aria-pressed', 'false');
    await expect(prompt(page)).toHaveText('Scan the rack to count');
    await expect(flash(page)).toContainText('Count mode.');

    await wedgeScan(page, 'CMD:MODE_PUTAWAY');
    await expect(modeButton(page, 'Put-away')).toHaveAttribute('aria-pressed', 'true');
    await expect(prompt(page)).toHaveText('Scan the rack first');

    await wedgeScan(page, 'CMD:MODE_MOVE');
    await expect(modeButton(page, 'Move')).toHaveAttribute('aria-pressed', 'true');
    await expect(prompt(page)).toHaveText('Scan a pallet');

    await wedgeScan(page, 'CMD:MODE_LOOKUP');
    await expect(modeButton(page, 'Look up')).toHaveAttribute('aria-pressed', 'true');
    await expect(prompt(page)).toHaveText('Scan any pallet or rack');
  });

  test('Scan station Move: pallet, rack, then the same rack again confirms', async ({ page }) => {
    await openStation(page);
    await wedgeScan(page, 'CMD:MODE_MOVE');
    await wedgeScan(page, 'P-000019');
    await expect(prompt(page)).toHaveText('Now scan the rack');
    await wedgeScan(page, 'B-01-01');
    await expect(prompt(page)).toHaveText('Scan B-01-01 again to confirm');
    // The station ignores the same code within 600 ms as a scanner double read (DOUBLE_READ_MS in
    // src/features/station/logic.ts); a person re-aiming at the rack label takes longer than that.
    await page.waitForTimeout(700);
    await wedgeScan(page, 'B-01-01');
    await expect(prompt(page)).toHaveText('Saved. Scan the next pallet');

    // Look it up to be sure the record moved.
    await wedgeScan(page, 'CMD:MODE_LOOKUP');
    await wedgeScan(page, 'P-000019');
    await expect(page.locator('.st-look')).toContainText('B-01-01');
  });

  test('Scan station Move: Enter on the page confirms, like the Confirm barcode', async ({ page }) => {
    await openStation(page);
    await wedgeScan(page, 'CMD:MODE_MOVE');
    await wedgeScan(page, 'P-000013');
    await wedgeScan(page, 'A-03-02');
    await expect(prompt(page)).toHaveText('Scan A-03-02 again to confirm');
    // The scanner's own Enter is part of the scan; a separate Enter a moment later is a person confirming.
    await page.waitForTimeout(300);
    await blurFields(page);
    await page.keyboard.press('Enter');
    await expect(prompt(page)).toHaveText('Saved. Scan the next pallet');
    await expect(logItems(page).first()).toContainText('Result');
  });

  test('Find: with nothing waiting, a scan opens the pallet, the rack, or the station', async ({ page }) => {
    const errors = watchErrors(page);
    await signInAs(page, 'operator');
    await page.goto('/#find');
    await portalReady(page);

    await wedgeScan(page, 'P-000016');
    await expect(page.getByText('Scanned P-000016. Opening the pallet.')).toBeVisible();
    await expect(page.locator('#main .page-head')).toContainText('P-000016');

    await wedgeScan(page, 'A-03-01');
    await expect(page.getByText('Scanned A-03-01. Opening the rack.')).toBeVisible();
    await expect(page.locator('#main .page-head')).toContainText('A-03-01');

    await wedgeScan(page, 'CMD:MODE_COUNT');
    await expect(page).toHaveURL(/#station(\?|$)/);
    await expect(modeButton(page, 'Count')).toHaveAttribute('aria-pressed', 'true');

    // An unknown code says so and stays put.
    await page.locator('.sidebar').getByRole('button', { name: 'Find', exact: true }).click();
    await wedgeScan(page, 'P-999999');
    await expect(page.locator('.toast', { hasText: 'Scanned P-999999.' })).toBeVisible();
    await expect(page).toHaveURL(/#find$/);
    expect(errors).toEqual([]);
  });

  test('Move screen: two scans, then scanning the rack again saves the move', async ({ page }) => {
    await signInAs(page, 'operator');
    await page.goto('/#move');
    await portalReady(page);
    await wedgeScan(page, 'P-000016');
    await expect(page.getByText('P-000016').first()).toBeVisible();
    await wedgeScan(page, 'B-01-01');
    await expect(page.getByRole('button', { name: 'Move: B-01-01' })).toBeVisible();
    // A second read within 600 ms counts as a scanner double read, so wait like a person would.
    await page.waitForTimeout(700);
    await wedgeScan(page, 'B-01-01');
    await expect(page.getByText('Moved to B-01-01')).toBeVisible();
  });

  // The same code read again within 600 ms is a double read, never the confirming rescan.
  test('Move screen: a scanner double read of the rack does not skip the review', async ({ page }) => {
    await signInAs(page, 'operator');
    await page.goto('/#move');
    await portalReady(page);
    await wedgeScan(page, 'P-000016');
    await expect(page.getByText('P-000016').first()).toBeVisible();
    // Two reads of the same label about 100 ms apart, as a scanner in continuous mode sends them.
    await wedgeScan(page, 'B-01-01');
    await wedgeScan(page, 'B-01-01');
    await expect(page.getByRole('button', { name: 'Move: B-01-01' })).toBeVisible();
    await expect(page.getByText('Moved to B-01-01')).toHaveCount(0);
  });
});

test.describe('Scan station put-away and count', () => {
  test('put-away: scan a rack, two pallets, Finish and review, Save all', async ({ page }) => {
    const errors = watchErrors(page);
    await openStation(page);
    await modeButton(page, 'Put-away').click();
    await expect(prompt(page)).toHaveText('Scan the rack first');

    await wedgeScan(page, 'A-03-02');
    await expect(prompt(page)).toHaveText('Now scan the pallets');
    await wedgeScan(page, 'P-000013'); // received, not placed yet: a place
    await wedgeScan(page, 'P-000014'); // stored on A-01-01: a move
    const lines = page.getByRole('list', { name: 'Pallets in this put-away' }).locator('.st-line');
    await expect(lines).toHaveCount(2);
    await expect(lines.nth(0)).toContainText('P-000013');
    await expect(lines.nth(1)).toContainText('P-000014');
    await expect(prompt(page)).toHaveText('Scan the next pallet');

    await page.getByRole('button', { name: 'Finish and review' }).click();
    await expect(prompt(page)).toHaveText('Save 2 to A-03-02?');
    await page.getByRole('button', { name: /^Save all 2/ }).click();
    await expect(prompt(page)).toHaveText('Put-away saved');
    await expect(page.locator('.st-tally .tag.ok')).toHaveText('2 saved');
    await expect(lines.filter({ has: page.locator('.tag', { hasText: /saved/i }) })).toHaveCount(2);

    // Both pallets are now recorded on A-03-02.
    await modeButton(page, 'Look up').click();
    await wedgeScan(page, 'A-03-02');
    await expect(page.locator('.st-work')).toContainText('P-000013');
    await expect(page.locator('.st-work')).toContainText('P-000014');
    expect(errors).toEqual([]);
  });

  test('count: typed codes, Finish and compare shows matched, missing, unexpected and unknown', async ({ page }) => {
    const errors = watchErrors(page);
    await openStation(page);
    await modeButton(page, 'Count').click();
    const box = page.locator('#st-code');
    for (const code of ['A-03-01', 'P-000016', 'P-000017', 'P-000022', 'P-999999']) {
      await box.fill(code);
      await box.press('Enter');
      await expect(box).toHaveValue('');
    }
    await expect(prompt(page)).toHaveText('Scan the next pallet');
    await page.getByRole('button', { name: 'Finish and compare' }).click();

    const tile = (label: string) => page.locator('.st-sum', { has: page.locator('.st-sum-label', { hasText: new RegExp(`^\\s*${label}$`) }) }).locator('.st-sum-n');
    await expect(tile('Matched')).toHaveText('2');
    await expect(tile('Missing from the scan')).toHaveText('1');
    await expect(tile('Unexpected')).toHaveText('1');
    await expect(tile('Unknown codes')).toHaveText('1');

    const section = (title: string) => page.locator('.st-section', { has: page.locator('.st-section-title', { hasText: title }) });
    await expect(section('Matched')).toContainText('P-000016');
    await expect(section('Matched')).toContainText('P-000017');
    await expect(section('Missing from the scan')).toContainText('P-000032');
    await expect(section('Unexpected')).toContainText('P-000022');
    await expect(section('Unknown codes')).toContainText('P-999999');
    await expect(prompt(page)).toHaveText('Confirm 2 matched');

    await page.getByRole('button', { name: /^Confirm all 2/ }).click();
    await expect(flash(page)).toContainText('2 matched pallets confirmed on A-03-01.');
    await expect(page.getByRole('button', { name: 'All confirmed' })).toBeDisabled();
    await expect(prompt(page)).toHaveText('Count of A-03-01 done');
    expect(errors).toEqual([]);
  });

  test('leaving with an unsaved put-away asks first', async ({ page }) => {
    await openStation(page);
    await modeButton(page, 'Put-away').click();
    await wedgeScan(page, 'A-03-02');
    await wedgeScan(page, 'P-000037');
    await page.locator('.sidebar').getByRole('button', { name: 'Find', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Leave this screen?' });
    await expect(sheet).toContainText('1 pallet in the put-away to A-03-02 is not saved. Leaving the Scan station discards it.');
    await sheet.getByRole('button', { name: 'Stay here' }).click();
    await expect(page).toHaveURL(/#station(\?|$)/);
    await expect(page.getByRole('list', { name: 'Pallets in this put-away' }).locator('.st-line')).toHaveCount(1);
    await page.locator('.sidebar').getByRole('button', { name: 'Find', exact: true }).click();
    await page.getByRole('dialog', { name: 'Leave this screen?' }).getByRole('button', { name: 'Leave and discard' }).click();
    await expect(page).toHaveURL(/#find$/);
  });

  test('count, hands free: rack, pallets, then the Finish and Confirm barcodes', async ({ page }) => {
    await openStation(page);
    await wedgeScan(page, 'CMD:MODE_COUNT');
    await wedgeScan(page, 'A-01-01');
    await expect(prompt(page)).toHaveText('Scan every pallet on A-01-01');
    await wedgeScan(page, 'P-000014');
    await wedgeScan(page, 'P-000027');
    await wedgeScan(page, 'CMD:FINISH');
    await expect(prompt(page)).toHaveText('Confirm 2 matched');
    await wedgeScan(page, 'CMD:CONFIRM');
    await expect(flash(page)).toContainText('2 matched pallets confirmed on A-01-01.');
    await expect(prompt(page)).toHaveText('Count matches the records');
  });
});
