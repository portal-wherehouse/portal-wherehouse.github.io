import {test,expect} from '@playwright/test';
import {signInAs} from './helpers';

test('receive general stock without choosing a job and open its record',async({page})=>{
 await signInAs(page,'owner');await page.goto('/?demo=1#receive');
 await expect(page.getByRole('button',{name:'Add job (optional)',exact:true})).toBeVisible();
 await expect(page.locator('#rcv-job')).toBeHidden();
 await page.locator('#rcv-desc').fill('General stock example');
 await page.getByRole('button',{name:'Save pallet',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Pallet saved',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Open record',exact:true}).click();
 await expect(page.getByText('No job assigned',{exact:true})).toBeVisible();
 await expect(page.locator('#main')).toContainText('General stock example');
});

test('create a job from Receive without losing the pallet details on a phone',async({page})=>{
 await page.setViewportSize({width:375,height:900});
 await signInAs(page,'owner');await page.goto('/?demo=1#receive');
 await page.locator('#rcv-desc').fill('Pallet description stays here');
 await page.getByRole('button',{name:'Add job (optional)',exact:true}).click();
 await page.getByRole('button',{name:'New job',exact:true}).click();
 await page.locator('#job-code').fill('J-NEW');await page.locator('#job-name').fill('New receiving project');
 await page.getByRole('button',{name:'Create job',exact:true}).click();
 await expect(page.getByRole('dialog')).toBeHidden();
 await expect(page.locator('#rcv-desc')).toHaveValue('Pallet description stays here');
 await expect(page.locator('#rcv-job option:checked')).toHaveText('J-NEW · New receiving project');
 await page.getByRole('button',{name:'Save pallet',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Pallet saved',exact:true})).toBeVisible();
});
