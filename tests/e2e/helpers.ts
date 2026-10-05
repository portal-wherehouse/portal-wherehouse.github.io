// Shared helpers for the end-to-end specs. Not a spec itself (Playwright only runs *.spec.ts).

import { expect, type Page } from '@playwright/test';
import { encodeCode128 } from '../../src/device/code128';

export type DemoRole = 'owner' | 'supervisor' | 'operator' | 'viewer';

/**
 * Sign in without the front door: the app reads localStorage "pl.actor" on load (sign-in is off
 * while the product is tested). Call before the first page.goto.
 */
export async function signInAs(page: Page, role: DemoRole) {
  await page.addInitScript((actor) => {
    try {
      localStorage.setItem('pl.actor', actor);
    } catch {
      /* the test will fail on its own assertions */
    }
  }, `user-${role}`);
}

/** Collect uncaught page errors and console errors, to assert none happened. */
export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    // Web fonts and the favicon are fetched from the network, which the test sandbox may not reach.
    if (/fonts\.g|favicon|net::ERR_|Failed to load resource/.test(text)) return;
    errors.push(`console: ${text}`);
  });
  return errors;
}

/** The portal sidebar (desktop width). Setup tools open from the "Settings and setup" page for managers. */
export const nav = async (page: Page, name: string) => {
  const button=page.locator('.sidebar').getByRole('button',{name,exact:true,includeHidden:true});
  const hub=page.locator('.sidebar').getByRole('button',{name:'Settings and setup',exact:true});
  if(!(await button.count()) && await hub.count()){
    await hub.click();
    await page.getByTestId('setup-hub').getByRole('button',{name:new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}`)}).first().click();
    return;
  }
  const group=button.locator('xpath=ancestor::details');
  if(await group.count() && !(await group.getAttribute('open')) && !await button.isVisible())await group.locator('summary').click();
  await button.click();
};

/** Type a code into the Move/Receive scan panel's manual box, like a person would. */
export async function typeCode(page: Page, code: string) {
  await page.locator('#manual-code').fill(code);
  await page.locator('#manual-code').press('Enter');
}

/** Wait until the portal shell is showing (signed in). */
export async function portalReady(page: Page) {
  await expect(page.locator('.topbar')).toBeVisible();
  await expect(page.locator('.sidebar')).toBeVisible();
}

/** Move focus off any text field so key presses reach the document, like a scanner on an idle screen. */
export async function blurFields(page: Page) {
  // Blur on every check: a screen that is still rendering the last step can move focus after the first blur.
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const a = document.activeElement as HTMLElement | null;
          if (a && a !== document.body && typeof a.blur === 'function') a.blur();
          const now = document.activeElement as HTMLElement | null;
          return !now || now === document.body ? 'body' : `${now.tagName.toLowerCase()}${now.id ? '#' + now.id : ''}${now.className ? '.' + String(now.className).split(' ').join('.') : ''}`;
        }),
      { message: 'focus should leave every field before a scanner scan' },
    )
    .toBe('body');
}

/** Defaults from src/device/scanRouter.tsx and src/device/wedge.ts. */
export const WEDGE_MAX_GAP_MS = 50;
/** wedge.ts suffixGapMs: the Enter may lag the last character by max(2 x gap, gap + 30) ms. */
export const WEDGE_SUFFIX_GAP_MS = Math.max(WEDGE_MAX_GAP_MS * 2, WEDGE_MAX_GAP_MS + 30);

/**
 * Emulate a USB/Bluetooth keyboard-wedge scanner: the code arrives as a fast burst of key presses
 * (5 ms apart, well under the default 50 ms gap in src/device/wedge.ts) and ends with Enter (or Tab).
 *
 * A real scanner's keys are timed by the hardware; these are timed by the test runner, so on an
 * overloaded machine a key can arrive late and the app (correctly) reads the burst as typing. The
 * burst's own timing is measured in the page, and a burst that was too slow to be a scanner fails
 * with a message that says so, instead of a misleading app assertion further down.
 */
export async function wedgeScan(page: Page, code: string, { suffix = 'Enter' }: { suffix?: 'Enter' | 'Tab' } = {}) {
  await blurFields(page);
  // Let the page finish rendering the previous scan, so the first key is not held up behind it.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const w = window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void };
        if (w.requestIdleCallback) w.requestIdleCallback(() => resolve(), { timeout: 300 });
        else setTimeout(resolve, 30);
      }),
  );
  await page.evaluate(() => {
    const w = window as unknown as { __wedgeKeys?: number[]; __wedgeHook?: boolean };
    w.__wedgeKeys = [];
    if (!w.__wedgeHook) {
      w.__wedgeHook = true;
      window.addEventListener('keydown', (e) => w.__wedgeKeys?.push(e.timeStamp), true);
    }
  });
  await page.keyboard.type(code, { delay: 5 });
  await page.keyboard.press(suffix);
  const stamps = await page.evaluate(() => (window as unknown as { __wedgeKeys?: number[] }).__wedgeKeys ?? []);
  if (stamps.length !== code.length + 1) return; // keys went somewhere unexpected; let the test's own assertions speak
  let maxGap = 0;
  for (let i = 1; i < code.length; i++) maxGap = Math.max(maxGap, stamps[i] - stamps[i - 1]);
  const enterLag = stamps[code.length] - stamps[code.length - 1];
  if (maxGap > WEDGE_MAX_GAP_MS || enterLag > WEDGE_SUFFIX_GAP_MS) {
    throw new Error(
      `The emulated scanner burst for "${code}" was slower than a scanner (largest gap ${Math.round(maxGap)} ms, ${suffix} after ${Math.round(enterLag)} ms; ` +
        `limits ${WEDGE_MAX_GAP_MS} and ${WEDGE_SUFFIX_GAP_MS} ms), so the app rightly treated it as typing. The test machine is overloaded: rerun with fewer workers.`,
    );
  }
}

/** A fake camera that shows one Code 128 label at a time; `window.__show(text)` changes it, '' shows nothing. */
export async function fakeCamera(page: Page, labels: string[]) {
  const patterns = Object.fromEntries(labels.map((l) => [l, encodeCode128(l)]));
  await page.addInitScript((patterns) => {
    const w = window as unknown as { __show: (t: string) => void; __streams: MediaStream[]; __calls: number };
    let showing = '';
    w.__show = (t) => (showing = t);
    w.__streams = [];
    w.__calls = 0;
    Object.defineProperty(window, 'BarcodeDetector', { value: undefined, configurable: true });
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      value: async () => {
        w.__calls++;
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 480;
        const c = canvas.getContext('2d')!;
        const draw = () => {
          c.fillStyle = 'white';
          c.fillRect(0, 0, canvas.width, canvas.height);
          const p = patterns[showing];
          if (p) {
            c.fillStyle = 'black';
            let x = (canvas.width - p.modules * 3) / 2;
            for (let i = 0; i < p.widths.length; i++) {
              if (i % 2 === 0) c.fillRect(x, 140, p.widths[i] * 3, 200);
              x += p.widths[i] * 3;
            }
          }
        };
        draw();
        setInterval(draw, 50);
        const stream = canvas.captureStream(10);
        w.__streams.push(stream);
        return stream;
      },
    });
  }, patterns);
}

export const show = (page: Page, text: string) => page.evaluate((t) => (window as unknown as { __show: (t: string) => void }).__show(t), text);

