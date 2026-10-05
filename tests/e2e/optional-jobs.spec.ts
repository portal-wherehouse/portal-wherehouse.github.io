import {test,expect} from '@playwright/test';
import {signInAs,typeCode} from './helpers';

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

test('with jobs off, saved, history, dispatch and hints never ask for a job that is not there',async({page})=>{
 await signInAs(page,'supervisor');await page.goto('/?demo=1#overview');
 await page.getByRole('button',{name:'Warehouse settings'}).click();
 const setup=page.getByTestId('setup-setting');
 await setup.getByRole('radio',{name:/Big single items/}).click();
 await setup.getByRole('button',{name:'Save setup'}).click();
 await expect(setup).toContainText('Saved.');
 await page.keyboard.press('Escape');
 await page.goto('/?demo=1#receive');
 await expect(page.locator('.sample-note')).toContainText('Describe the item.');
 await expect(page.locator('.sample-note')).not.toContainText(/order/i);
 await page.locator('#rcv-desc').fill('Walnut dresser');
 await page.getByRole('button',{name:'Save item',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Item saved',exact:true})).toBeVisible();
 await expect(page.locator('.big-result')).not.toContainText(/No order/);
 await expect(page.getByRole('button',{name:'Receive another',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:/Receive another for/})).toHaveCount(0);
 await typeCode(page,'A-01-01');
 await expect(page.getByText('Placed at A-01-01')).toBeVisible();
 await page.goto('/?demo=1#find');
 await page.locator('#find-q').fill('Walnut dresser');
 await page.locator('.result',{hasText:'Walnut dresser'}).click();
 await expect(page.locator('.tl-item').last()).toContainText('Created as received');
 await expect(page.locator('#main')).not.toContainText(/No order/,{useInnerText:true});
 await page.getByRole('button',{name:'Dispatch item'}).click();
 const sheet=page.locator('.sheet');
 await expect(sheet).toContainText('Leaving from A-01-01. The result will read “Dispatched from');
 await expect(sheet).not.toContainText(/No order|jobsite|for order/);
});

test('retired pallets drop out of Find unless asked for',async({page})=>{
 await signInAs(page,'supervisor');await page.goto('/?demo=1#find');
 await page.locator('#find-q').fill('Laundry detergent, 40 cases');
 await page.locator('.result',{hasText:'Laundry detergent, 40 cases'}).click();
 await page.getByRole('button',{name:'Retire pallet'}).click();
 await page.locator('#act-reason').fill('Sold off the floor.');
 await page.locator('.sheet').getByRole('button',{name:'Retire',exact:true}).click();
 await expect(page.locator('.sheet')).toHaveCount(0);
 await page.goto('/?demo=1#find');
 await page.locator('#find-q').fill('cases');
 await expect(page.locator('.result',{hasText:'Paper plates, 60 cases'})).toBeVisible();
 await expect(page.locator('.result',{hasText:'Laundry detergent, 40 cases'})).toHaveCount(0);
 await page.getByLabel('Include retired and archived').check();
 await expect(page.locator('.result',{hasText:'Laundry detergent, 40 cases'})).toBeVisible();
 await page.getByLabel('Include retired and archived').uncheck();
 await page.getByRole('group',{name:'Filter by state'}).getByRole('button',{name:'Retired'}).click();
 await expect(page.locator('.result',{hasText:'Laundry detergent, 40 cases'})).toBeVisible();
 await expect(page.locator('.result',{hasText:'Paper plates, 60 cases'})).toHaveCount(0);
});
