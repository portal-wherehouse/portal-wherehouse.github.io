import {test,expect} from '@playwright/test';
import {signInAs} from './helpers';

for (const width of [375,1280]) test(`warehouse menu, basic-plan upgrade and editable details at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});await signInAs(page,'owner');await page.goto('/?demo=1#overview');
 const button=page.locator('.warehouse-name-button');await expect(button).toBeVisible();
 await button.click();const menu=page.getByRole('menu',{name:'Warehouse menu'});
 await expect(menu).toBeVisible();
 await expect(menu.getByRole('menuitem',{name:'Settings',exact:true})).toBeVisible();
 await menu.getByRole('menuitem',{name:/Add warehouse/}).click();
 await expect(page.getByRole('heading',{name:'Oops!',exact:true})).toBeVisible();
 await expect(page.getByText('Your current plan does not include this feature. Please contact us to upgrade.',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Back to warehouse',exact:true}).click();
 await page.getByRole('button',{name:'Warehouse settings',exact:true}).click();
 await page.locator('#wh-name').fill('Charleston warehouse');await page.locator('#wh-code').fill('CHS');await page.locator('#wh-address').fill('Receiving building, Charleston, SC');
 await page.getByRole('button',{name:'Save warehouse',exact:true}).click();await expect(page.getByRole('dialog')).toBeHidden();
 await expect(button).toHaveText('Charleston warehouse');
 await page.getByRole('button',{name:'Warehouse settings',exact:true}).click();
 await expect(page.locator('#wh-address')).toHaveValue('Receiving building, Charleston, SC');await expect(page.locator('#wh-code')).toHaveValue('CHS');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth)).toBeLessThanOrEqual(1);
 await page.getByRole('button',{name:'Cancel',exact:true}).click();await button.click();
 await page.screenshot({path:`test-results/warehouse-menu-${width}.png`});
});

test('employees can open the warehouse menu but cannot edit warehouse details',async({page})=>{
 await signInAs(page,'operator');await page.goto('/?demo=1#overview');await expect(page.getByRole('button',{name:'Warehouse settings',exact:true})).toBeDisabled();
 await page.locator('.warehouse-name-button').click();
 await expect(page.getByRole('menuitem',{name:'Settings',exact:true})).toBeDisabled();
 await expect(page.getByRole('menuitem',{name:/Add warehouse/})).toBeVisible();
});
