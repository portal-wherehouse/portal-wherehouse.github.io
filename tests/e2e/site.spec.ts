import { expect, test } from '@playwright/test';
import { watchErrors } from './helpers';
const pages=[['mission','Make warehouse work easier.'],['product','From delivery to the right spot.'],['hardware','Start with a printer and a phone.'],['pricing','Start with what you have.'],['customers','Start small. Make it routine.'],['founder','Built in Charleston by the person you’ll talk to.'],['contact','Let’s look at your warehouse.'],['security','Shared with your crew. Controlled by you.'],['why','The next shift shouldn’t have to guess.'],['showcase','From delivery to dispatch.']];
test('short public pages load, pricing is consistent, and contact opens a real email draft',async({page})=>{
 const errors=watchErrors(page);await page.goto('/');await expect(page.getByRole('heading',{level:1})).toContainText('Keep your');
 await expect(page.locator('.home-hero')).toContainText('$29/warehouse/month');
 for(const [route,heading] of pages){await page.goto(`/#${route}`);await expect(page.getByRole('heading',{level:1})).toHaveText(heading);}
 await page.goto('/#pricing');await expect(page.locator('main')).toContainText('$29');await expect(page.locator('main')).toContainText('Ongoing remote support');
 await page.goto('/#contact');await expect(page.locator('main a[href^="mailto:"]')).toHaveCount(1);expect(errors).toEqual([]);
});
test('phone navigation and browser back work without overflow',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/');await page.getByRole('button',{name:'Menu',exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:/How it works/}).click();await expect(page).toHaveURL(/#product$/);
 await page.getByRole('button',{name:'Why Wherehouse →',exact:true}).click();await expect(page).toHaveURL(/#why$/);await page.goBack();await expect(page).toHaveURL(/#product$/);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth)).toBeLessThanOrEqual(1);
});
test('walkthrough contains only the requested one-second placeholder',async({page})=>{
 await page.goto('/#showcase');const video=page.locator('video');await expect(video).toBeVisible();
 await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>v.duration)).toBeCloseTo(1,1);
 await expect(page.getByText('Animation placeholder · the full warehouse walkthrough will go here.')).toBeVisible();
});


test('homepage stays below its script budget and defers the warehouse application',async({page})=>{
  const scripts:string[]=[];
  page.on('request',request=>{if(request.resourceType()==='script')scripts.push(request.url());});
  await page.goto('/');await expect(page.locator('.home-hero')).toBeVisible();
  expect(scripts.some(url=>/WarehouseApp-|backend-|firebase-/.test(url))).toBe(false);
  const bytes=await page.evaluate(()=>performance.getEntriesByType('resource').filter((entry:any)=>entry.initiatorType==='script').reduce((total,entry:any)=>total+entry.decodedBodySize,0));
  expect(bytes).toBeLessThan(400_000);
  await page.locator('.shell-header').getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(page).toHaveURL(/#signin$/);
  await expect(page.locator('[data-tour=signin], .door, .auth-shell').first()).toBeVisible();
  expect(scripts.some(url=>/WarehouseApp-/.test(url))).toBe(true);
});

test('Why Wherehouse compares price, features and support with other tools and doing it by hand', async ({ page }) => {
  await page.goto('/#simple');
  const table = page.getByTestId('compare-table');
  for (const name of ['Sortly', 'inFlow', 'Zoho Inventory', 'Fishbowl', 'By hand']) await expect(table.locator('thead')).toContainText(name);
  await expect(table).toContainText('Local, small-business support');
  await expect(page.getByRole('heading', { name: 'Why a local, small business' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Fishbowl' }).click();
  await expect(table.locator('thead th.c-fishbowl')).toBeVisible();
  await expect(table.locator('thead th.c-sortly')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('homepage shows the product, labeled examples and the founding-customer offer before setup', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await expect(page.getByTestId('hero-sample')).toHaveAttribute('href', /demo=1/);
  await expect(page.getByTestId('see-it-work')).toBeVisible();
  const examples = page.getByTestId('home-examples');
  await expect(examples.locator('.ex-card')).toHaveCount(3);
  await expect(examples.locator('.ex-tag')).toHaveText(['Example', 'Example', 'Example']);
  await expect(examples).toContainText('They are not customer stories.');
  const founding = page.getByTestId('home-founding');
  await expect(founding).toContainText('Founding customers');
  await expect(founding.locator('a[href^="mailto:support@wherehousetracking.com"]')).toHaveCount(1);
  await page.goto('/#founder');
  await expect(page.getByTestId('about-facts')).toContainText('Charleston, SC');
  await expect(page.locator('main a[href*="linkedin.com"]').first()).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ['/', '/#founder']) {
    await page.goto(route);
    await page.getByTestId(route === '/' ? 'home-founding' : 'about-facts').scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  }
  expect(errors).toEqual([]);
});

test('home page cards open a "Wherehouse for" page with an example showcase and both calls to action', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  const cards = page.getByTestId('group-cards');
  await expect(cards.locator('.fg-card')).toHaveCount(8);
  await expect(cards).toContainText('Wherehouse for lumberyards and building supply');
  await cards.getByRole('link', { name: /Wherehouse for lumberyards and building supply/ }).click();
  await expect(page).toHaveURL(/#for\/lumberyards$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Wherehouse for lumberyards and building supply.');
  await expect(page).toHaveTitle(/^Wherehouse for lumberyards and building supply · /);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  const group = page.getByTestId('group-page');
  // The sample opens already set up for this kind of business.
  await expect(group.getByRole('link', { name: 'Try the sample warehouse for your lumberyard' }).first()).toHaveAttribute('href', '?demo=1&kind=lumberyards#signin');
  await expect(group.getByRole('button', { name: 'Start your free trial' }).first()).toBeVisible();
  // The showcase: four steps that can be clicked, labeled as an example.
  const show = page.getByTestId('group-showcase');
  await expect(show.locator('.si-steps li')).toHaveCount(4);
  await show.getByRole('button', { name: /Pull the order/ }).click();
  await expect(show.getByRole('button', { name: /Pull the order/ })).toHaveAttribute('aria-current', 'step');
  await expect(show.locator('.fg-pl li')).toHaveCount(3);
  await expect(page.getByText('Example screens with sample data. Not a real customer.')).toBeVisible();
  // The other groups, without this one; the overview and the old Applications address show every group.
  await expect(group.getByTestId('group-cards').locator('.fg-card')).toHaveCount(7);
  await group.getByRole('link', { name: 'Who it’s for' }).click();
  await expect(page).toHaveURL(/#for$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Wherehouse for your kind of business.');
  await page.goto('/#industries');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Wherehouse for your kind of business.');
  await expect(page.getByTestId('group-cards').locator('.fg-card')).toHaveCount(8);
  expect(errors).toEqual([]);
});

test('the "Wherehouse for" showcase waits for a tap with reduced motion and fits a phone', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#for/rentals');
  const show = page.getByTestId('group-showcase');
  await expect(show).toHaveClass(/is-paused/);
  await expect(show.getByRole('button', { name: /Pause the example/ })).toHaveCount(0);
  await expect(show.locator('li.on')).toContainText('Pack the event');
  await show.getByRole('button', { name: /Check in the return/ }).click();
  await expect(show.locator('li.on')).toContainText('Check in the return');
  await expect(show.locator('.si-tag')).toContainText('Back');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  // The fit page links each business to its group.
  await page.goto('/#fit');
  await page.locator('.fit-tile', { hasText: 'Lumber yard' }).first().click();
  await page.getByTestId('fit-group').click();
  await expect(page).toHaveURL(/#for\/lumberyards$/);
});
