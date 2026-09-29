import { expect,test } from '@playwright/test';
import { portalReady,watchErrors } from './helpers';
test('sample entry offers only management and employee views',async({page})=>{
 const errors=watchErrors(page);await page.goto('/?demo=1#signin');
 await expect(page.getByRole('heading',{name:'Sample warehouse',exact:true})).toBeVisible();
 await expect(page.locator('.sample-choice')).toHaveCount(2);await expect(page.getByRole('radio')).toHaveCount(0);
 await page.getByRole('button',{name:'View a management dashboard'}).click();await portalReady(page);
 await expect(page).toHaveURL(/#overview$/);await expect(page.locator('.sample-note').first()).toBeVisible();
 await page.locator('.sidebar').getByRole('button',{name:'Find',exact:true}).click();await expect(page.locator('.result')).toHaveCount(6);
 for(const description of await page.locator('.result .desc').allTextContents())expect(description).toMatch(/^Example pallet [1-6]$/);
 expect(errors).toEqual([]);
});
test('employee sample keeps floor actions and explains them without a tour overlay',async({page})=>{
 const errors=watchErrors(page);await page.goto('/?demo=1#signin');await page.getByRole('button',{name:'View an employee dashboard'}).click();await portalReady(page);
 await expect(page).toHaveURL(/#find$/);await expect(page.locator('.sample-note').first()).toBeVisible();
 await expect(page.locator('.sidebar').getByRole('button',{name:'Receive',exact:true})).toBeVisible();
 await expect(page.locator('.sidebar').getByRole('button',{name:'Manager dashboard',exact:true})).toHaveCount(0);
 await page.locator('.result').filter({hasText:'Example pallet 1'}).click();await expect(page.locator('.tl-item')).toHaveCount(3);await expect(page.locator('.sample-note').first()).toBeVisible();
 expect(errors).toEqual([]);
});
test('a direct sample receiving link continues to its requested page',async({page})=>{
 await page.goto('/?demo=1#receive');await page.getByRole('button',{name:'View an employee dashboard'}).click();await portalReady(page);
 await expect(page.getByRole('heading',{name:'Receive a pallet'})).toBeVisible();
});
