import { expect, test } from '@playwright/test';
import { watchErrors } from './helpers';
const pages=[['mission','Make warehouse work easier.'],['product','A place for every pallet.'],['hardware','Start with a printer and a phone.'],['pricing','One warehouse. One price.'],['customers','Start small. Make it routine.'],['founder','Less time looking. More time moving.'],['contact','Tell us how your warehouse works.'],['security','Shared with your crew. Controlled by you.'],['simple','You need to find a pallet. Not run another system.'],['showcase','From delivery to dispatch.']];
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
 await page.getByRole('button',{name:'Printing & scanning →',exact:true}).click();await expect(page).toHaveURL(/#hardware$/);await page.goBack();await expect(page).toHaveURL(/#product$/);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth)).toBeLessThanOrEqual(1);
});
test('walkthrough contains only the requested one-second placeholder',async({page})=>{
 await page.goto('/#showcase');const video=page.locator('video');await expect(video).toBeVisible();
 await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>v.duration)).toBeCloseTo(1,1);
 await expect(page.getByText('Animation placeholder · the full warehouse walkthrough will go here.')).toBeVisible();
});
