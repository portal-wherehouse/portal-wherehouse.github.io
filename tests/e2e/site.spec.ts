import { expect, test } from '@playwright/test';
import { watchErrors } from './helpers';
const pages=[['mission','Make warehouse work easier.'],['product','From delivery to the right rack.'],['hardware','Start with a printer and a phone.'],['pricing','Start with what you have.'],['customers','Start small. Make it routine.'],['founder','Less time looking. More time moving.'],['contact','Let’s look at your warehouse.'],['security','Shared with your crew. Controlled by you.'],['why','The next shift shouldn’t have to guess.'],['showcase','From delivery to dispatch.']];
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
