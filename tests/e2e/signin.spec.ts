import { expect,test } from '@playwright/test';
import { portalReady,watchErrors } from './helpers';
test('sample entry offers management and employee views plus setup practice',async({page})=>{
 const errors=watchErrors(page);await page.goto('/?demo=1#signin');
 await expect(page.getByRole('heading',{name:'Sample warehouse',exact:true})).toBeVisible();
 await expect(page.locator('.sample-choice')).toHaveCount(3);await expect(page.getByRole('radio')).toHaveCount(0);
 await page.getByRole('button',{name:'View a management dashboard'}).click();await portalReady(page);
 await expect(page).toHaveURL(/#overview$/);await expect(page.locator('.sample-note').first()).toBeVisible();
 await page.locator('.sidebar').getByRole('button',{name:'Find',exact:true}).click();await expect(page.locator('.result')).toHaveCount(6);
 for(const description of await page.locator('.result .desc').allTextContents())expect(description).toMatch(/^Example pallet [1-6]$/);
 expect(errors).toEqual([]);
});
test('employee sample keeps floor actions and explains them without a tour overlay',async({page})=>{
 const errors=watchErrors(page);await page.goto('/?demo=1#signin');await page.getByRole('button',{name:'View an employee dashboard'}).click();await portalReady(page);
 await expect(page).toHaveURL(/#overview$/);
 await expect(page.getByTestId('crew-home')).toBeVisible();await expect(page.locator('.sample-note').first()).toBeVisible();await page.getByRole('button',{name:'Show the full dashboard'}).click();
 await expect(page.locator('.warehouse-identity')).toContainText('Operator');await page.locator('.warehouse-actions').getByRole('button',{name:'Find',exact:true}).click();
 await expect(page.locator('.sidebar').getByRole('button',{name:'Receive',exact:true})).toBeVisible();
 await expect(page.locator('.sidebar').getByRole('button',{name:'People',exact:true})).toHaveCount(0);
 await page.locator('.result').filter({hasText:'Example pallet 1'}).click();await expect(page.locator('.tl-item')).toHaveCount(3);await expect(page.locator('.sample-note').first()).toBeVisible();
 expect(errors).toEqual([]);
});
test('a direct sample receiving link continues to its requested page',async({page})=>{
 await page.goto('/?demo=1#receive');await page.getByRole('button',{name:'View an employee dashboard'}).click();await portalReady(page);
 await expect(page.getByRole('heading',{name:'Receive a pallet'})).toBeVisible();
});

for (const [view, width] of [['management',1280],['employee',390]] as const) {
 test(`${view} sample Help starts an optional tour and every stop finishes`,async({page})=>{
  const errors=watchErrors(page);await page.setViewportSize({width,height:900});
  await page.goto('/?demo=1#signin');await page.getByRole('button',{name:`View ${view==='employee'?'an':'a'} ${view} dashboard`}).click();
  await expect(page.locator('.ptour-card')).toHaveCount(0);
  await page.goto('/?demo=1#help');await page.locator('.help-quick').getByRole('button',{name:/^Take the tour/}).click();
  const card=page.locator('.ptour-card');await expect(card).toBeVisible();
  await expect(page.locator('.sample-note')).toHaveCount(0);
  await card.getByRole('button',{name:'Start the tour',exact:true}).click();
  let stopped=false;
  for(let i=0;i<30;i++){
   await expect(card).toBeVisible();
   await expect(card).not.toContainText('Sign-in is off');
   expect(new URL(page.url()).hash).not.toMatch(/^#(lab|sync|guide|about)$/);
   if(view==='employee')expect(new URL(page.url()).hash).not.toMatch(/^#(people|import|export)$/);
   if(await card.getByRole('button',{name:'Finish',exact:true}).count()){stopped=true;break;}
   await card.getByRole('button',{name:'Next',exact:true}).click();
  }
  expect(stopped).toBe(true);
  await card.getByRole('button',{name:'Start the practice shift',exact:true}).click();
  await expect(card).toHaveCount(0);
  if(width<700)await page.getByRole('button',{name:'Expand practice shift'}).click();
  await expect(page.getByRole('complementary',{name:'Practice shift'})).toContainText('JOB-1');
  await page.getByRole('button',{name:'Close practice shift'}).click();
  await page.goto('/?demo=1#find');await expect(page.locator('.result')).toHaveCount(6);await expect(page.locator('.sample-note').first()).toBeVisible();
  // It can be restarted and dismissed without forcing another tour.
  await page.goto('/?demo=1#help');await page.locator('.help-quick').getByRole('button',{name:/^Take the tour/}).click();
  await expect(card).toBeVisible();await page.keyboard.press('Escape');await expect(card).toHaveCount(0);
  expect(errors).toEqual([]);
 });
}

for(const width of [1280,375]){
 test(`Dashboard is first; refresh keeps Move until two hours away (${width}px)`,async({page})=>{
  await page.setViewportSize({width,height:900});
  await page.addInitScript(()=>localStorage.setItem('pl.prefs',JSON.stringify({startTab:'move'})));
  await page.goto('/?demo=1#signin');await page.getByRole('button',{name:'View a management dashboard'}).click();
  await expect(page.getByRole('heading',{name:'Dashboard',exact:true})).toBeVisible();
  await expect(page.locator(width>960?'.sidebar .nav-item':'.bottom-nav button').first()).toHaveText(/^Dashboard\d*$/);
  await expect(page.getByRole('region',{name:'Warehouse analytics'})).toBeVisible();
  await page.locator('.warehouse-actions').getByRole('button',{name:'Move',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Move pallet',exact:true})).toBeVisible();
  // A quick refresh keeps your place.
  await page.reload();
  await expect(page.getByRole('heading',{name:'Move pallet',exact:true})).toBeVisible();
  // After two hours away, a refresh starts on the Dashboard.
  await page.evaluate(()=>localStorage.setItem('pl.lastActive',String(Date.now()-3*60*60*1000)));
  await page.reload();
  await expect(page.getByRole('heading',{name:'Dashboard',exact:true})).toBeVisible();
  await expect(page).toHaveURL(/#overview$/);
  await expect(page.locator('.warehouse-greeting')).toContainText('Welcome,');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
 });
}
