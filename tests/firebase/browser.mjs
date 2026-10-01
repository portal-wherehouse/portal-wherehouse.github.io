import {testOfflineWarehouse} from './offline-browser.mjs';
import {signupToken} from './signup.mjs';
import './local-only.mjs';
import {issueKey,licenseStore} from './keys.mjs';
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir,writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require=createRequire(new URL('../../firebase/functions/package.json',import.meta.url));
const {getAuth}=require('firebase-admin/auth');
const {initializeApp,getApps}=require('firebase-admin/app');
if(!getApps().length)initializeApp({projectId:'demo-wherehouse'});
const email=`browser-${Date.now()}@example.com`,password='Warehouse-test-123!';
await getAuth().createUser({email,password,emailVerified:true,displayName:'Browser owner'});
const usageKey=await issueKey(email);
const browserEnv={...process.env,VITE_FIREBASE_EMULATORS:'true',VITE_FIREBASE_CONFIG:JSON.stringify({apiKey:'demo-key',projectId:'demo-wherehouse',authDomain:'demo-wherehouse.firebaseapp.com',storageBucket:'demo-wherehouse.appspot.com',appId:'demo-app'})};
await new Promise((resolve,reject)=>{const build=spawn('node',['node_modules/vite/bin/vite.js','build','--mode','emulator','--outDir','dist-emulator'],{stdio:'inherit',env:browserEnv});build.on('exit',code=>code===0?resolve():reject(Error('Emulator browser build failed.')));});
const vite=spawn('node',['node_modules/vite/bin/vite.js','preview','--outDir','dist-emulator','--host','127.0.0.1','--port','4175'],{stdio:'ignore',env:browserEnv});
let browser;
try {
 for(let i=0;i<50;i++){try{if((await fetch('http://127.0.0.1:4175')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message)); page.on('console',m=>{if(m.type()==='error')console.log('BROWSER_ERROR',m.text());});
 // Intercept the actual Google script request with a local widget fixture. No Google
 // CAPTCHA/assessment calls or billed resources are used in this test.
 const signupPage=await browser.newPage({viewport:{width:375,height:812}});
 const checkboxFixtureToken=await signupToken();
 await signupPage.route('https://www.google.com/recaptcha/enterprise.js*',route=>route.fulfill({contentType:'application/javascript',body:`
 window.grecaptcha={enterprise:{ready:fn=>fn(),render:(element,options)=>{
  const label=document.createElement('label');const input=document.createElement('input');input.type='checkbox';
  label.append(input,document.createTextNode("I'm not a robot"));element.append(label);
  input.onchange=()=>input.checked?options.callback(${JSON.stringify(checkboxFixtureToken)}):options['expired-callback']();
  window.__expireSignupCheckbox=()=>{input.checked=false;options['expired-callback']();};return 1;
 },reset:()=>{}}};`}));
 await signupPage.goto('http://127.0.0.1:4175/#signin');
 await expect(signupPage.getByRole('group',{name:'Account verification'})).toHaveCount(0);
 // The website survey needs a verified account first; the gate sends visitors to sign-up and back.
 const signupEmail=`signup-browser-${Date.now()}@example.com`;
 await signupPage.goto('http://127.0.0.1:4175/#start');const gate=signupPage.getByTestId('account-gate');
 await gate.getByRole('heading',{name:'Create an account to begin your survey',exact:true}).waitFor();await expect(gate).toContainText('No newsletters, no spam.');await expect(signupPage.getByTestId('setup-survey')).toHaveCount(0);
 await expect(gate.getByRole('button',{name:'Continue with Google',exact:true})).toBeVisible();assert.equal(await signupPage.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false);await signupPage.screenshot({path:'test-results/start-account-gate-mobile.png',animations:'disabled'});
 await gate.getByRole('button',{name:'Create account',exact:true}).click();
 await signupPage.getByRole('heading',{name:'Create an account to begin your survey',exact:true}).waitFor();await expect(signupPage.locator('.auth-card')).toContainText('We only email you verification and sign-in codes.');
 await signupPage.getByLabel('Your name',{exact:true}).fill('New signup');
 await signupPage.getByLabel('Email',{exact:true}).fill(signupEmail);
 await signupPage.getByLabel('Password',{exact:true}).fill(password);
 const createButton=signupPage.getByRole('button',{name:'Create account',exact:true});
 await expect(createButton).toBeDisabled();
 await signupPage.getByRole('checkbox',{name:"I'm not a robot"}).check();await expect(createButton).toBeEnabled();
 await signupPage.evaluate(()=>window.__expireSignupCheckbox());await expect(createButton).toBeDisabled();
 await signupPage.getByRole('checkbox',{name:"I'm not a robot"}).check();
 assert.equal(await signupPage.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false);
 await signupPage.screenshot({path:'test-results/signup-checkbox-mobile.png'});
 await createButton.click();await signupPage.getByText('We emailed a 6-digit code to',{exact:false}).waitFor();
 await expect(signupPage.getByRole('group',{name:'Account verification'})).toHaveCount(0);
 const mailed=(await licenseStore().db.collection('mail').where('to','==',signupEmail).get()).docs.map(d=>d.get('message.subject'));assert.equal(mailed.length,1);
 await signupPage.screenshot({path:'test-results/verify-code-mobile.png',animations:'disabled'});
 await signupPage.getByLabel('Verification code',{exact:true}).fill(mailed[0].match(/\d{6}$/)[0]);await signupPage.getByRole('button',{name:'Verify',exact:true}).click();
 await signupPage.getByTestId('setup-survey').waitFor();await expect(signupPage).toHaveURL(/#start$/);assert.equal((await getAuth().getUserByEmail(signupEmail)).emailVerified,true);
 console.log('PASS the #start gate leads to sign-up, a typed email code verifies the account, and the survey begins');
 await signupPage.goto('http://127.0.0.1:4175/#signin');await signupPage.getByTestId('trial-form').waitFor();
 await signupPage.getByRole('button',{name:'Sign out',exact:true}).click();
 await expect(signupPage.getByRole('group',{name:'Account verification'})).toHaveCount(0);
 await signupPage.close();console.log('PASS mobile signup checkbox gates submission, expires, creates an account and stays off sign-in');
 await page.goto('http://127.0.0.1:4175/#signin');await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await page.getByText('Activate my warehouse with a usage key',{exact:true}).click();await page.getByLabel('Warehouse name',{exact:true}).fill('Browser warehouse');await page.getByLabel('Usage key',{exact:true}).fill('WH-invalid');await page.getByRole('button',{name:'Activate warehouse',exact:true}).click();await page.getByRole('alert').first().waitFor();assert.equal(await page.getByRole('heading',{name:'Welcome to Wherehouse.',exact:true}).count(),0);await page.getByLabel('Usage key',{exact:true}).fill(usageKey);await page.setViewportSize({width:375,height:812});await page.getByRole('button',{name:'Activate warehouse',exact:true}).click();
 await page.getByRole('heading',{name:'Welcome to Wherehouse.',exact:true}).waitFor();await page.getByText('Loading Browser warehouse…',{exact:true}).waitFor();await page.screenshot({path:'test-results/warehouse-welcome-mobile.png',animations:'disabled'});
 await page.locator('.warehouse-greeting').filter({hasText:'Welcome, Browser owner.'}).waitFor().catch(async e=>{console.log((await page.locator('body').innerText()).slice(0,4000));throw e;});assert.equal(await page.locator('.demo-strip').count(),0);assert.equal(await page.getByRole('button',{name:'Practice shift',exact:true}).count(),0);
 await expect(page.locator('.warehouse-identity')).toContainText('Owner');await expect(page.getByRole('region',{name:'Warehouse analytics'})).toBeVisible();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:'test-results/warehouse-home-mobile.png',animations:'disabled'});await page.setViewportSize({width:1280,height:900});await expect(page.locator('.sidebar .nav-item:not(.checklist-nav)').first()).toHaveText('Dashboard');await page.locator('.warehouse-actions').getByRole('button',{name:'Move',exact:true}).click();await page.getByRole('heading',{name:'Move pallet',exact:true}).waitFor();await page.evaluate(()=>localStorage.removeItem('saw-opening'));await page.addInitScript(()=>document.addEventListener('DOMContentLoaded',()=>{const check=()=>{if(document.body.innerText.includes('Opening your warehouse'))localStorage.setItem('saw-opening',location.hash+' :: '+document.body.innerText.slice(0,300));};check();new MutationObserver(check).observe(document.body,{childList:true,subtree:true,characterData:true});}));const refreshStart=Date.now();await page.reload();await page.getByRole('heading',{name:'Move pallet',exact:true}).waitFor();console.log('TIMING quick refresh to Move',Date.now()-refreshStart,'ms');assert.equal(await page.evaluate(()=>localStorage.getItem('saw-opening')),null,'A quick refresh showed the opening screen');console.log('PASS a quick refresh keeps Move and skips the opening screen');await page.evaluate(()=>localStorage.setItem('pl.lastActive',String(Date.now()-3*60*60*1000)));await page.reload();await page.getByRole('heading',{name:'Dashboard',exact:true}).waitFor();await expect(page).toHaveURL(/#overview$/);await page.screenshot({path:'test-results/warehouse-home-desktop.png',animations:'disabled'});console.log('PASS activation welcome, named loading, personal dashboard, analytics and mobile layout');
 for(const width of [1280,375]){await page.setViewportSize({width,height:900});await page.getByRole('button',{name:/^Account:/}).click();await page.getByRole('button',{name:'Account settings',exact:true}).click();await page.getByRole('heading',{name:'Account settings',exact:true}).waitFor();await page.getByRole('button',{name:/^Account:/}).click();await page.getByRole('button',{name:'Log out',exact:true}).last().waitFor();await page.screenshot({path:`test-results/account-menu-${width}.png`,animations:'disabled'});await page.keyboard.press('Escape');}
 await page.setViewportSize({width:1280,height:900});
 await page.goto('http://127.0.0.1:4175/#jobs');await page.getByRole('button',{name:'New job',exact:true}).click();
 await page.locator('#job-code').fill('J-LIVE');await page.locator('#job-name').fill('Live browser delivery');await page.getByRole('button',{name:'Create job',exact:true}).click();
 await page.getByRole('heading',{name:'Live browser delivery',exact:true}).waitFor().catch(async e=>{console.log((await page.locator('body').innerText()).slice(-4000));throw e;});
 // Import pallets (one for a job that doesn't exist yet), then print their labels from the result.
 await page.goto('http://127.0.0.1:4175/#import');await page.getByLabel('CSV text').fill('job_code,description\nJ-LIVE,Imported oak\nJ-NEWIMPORT,Imported birch\n');await page.getByRole('group',{name:'What to import'}).getByRole('button',{name:'Pallets on hand'}).click();await page.getByRole('button',{name:'Import 2 rows',exact:true}).click();
 await page.getByText('Optional.',{exact:false}).waitFor();await expect(page.getByRole('dialog').locator('.label-card')).toHaveCount(2);await expect(page.locator('#print-root .label-card')).toHaveCount(2);await expect(page.locator('#print-root')).toContainText('Imported birch');await expect(page.getByRole('button',{name:'Print',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'Close',exact:true}).click();await expect(page.locator('#main')).toContainText('2 pallets created');await page.getByRole('button',{name:'Import another',exact:true}).click();await page.getByTestId('import-history').locator('.import-row').first().click();await expect(page.getByRole('dialog').locator('tbody tr')).toHaveCount(2);await expect(page.getByRole('dialog').locator('tbody')).toContainText('P-0000');await page.getByLabel('Import name').fill('Live truck');await page.getByRole('button',{name:'Rename',exact:true}).click();await expect(page.getByRole('dialog').getByRole('heading',{name:'Live truck'})).toBeVisible();await page.getByRole('button',{name:'Close',exact:true}).click();console.log('PASS live import reopens with its spreadsheet and pallet codes, and renames');
 await page.goto('http://127.0.0.1:4175/#import');await page.getByLabel('CSV text').fill('description,barcode,quantity,unit,category\nLive walnut,LIVE-WAL-1,2,crates,Hardwood\n');await expect(page.getByRole('group',{name:'What to import'}).getByRole('button',{name:'Incoming'})).toHaveAttribute('aria-pressed','true');await page.getByRole('button',{name:'Import 1 rows',exact:true}).click();await expect(page.locator('#main')).toContainText('1 items added to Incoming');
 await page.goto('http://127.0.0.1:4175/#incoming');await page.getByTestId('incoming-list').locator('.import-row').filter({hasText:'Live walnut'}).click();await page.getByRole('button',{name:'Receive pallet',exact:true}).click();await expect(page.locator('#rcv-desc')).toHaveValue('Live walnut');await expect(page.locator('#rcv-category')).toHaveValue('Hardwood');await page.getByRole('button',{name:'Save pallet',exact:true}).click();await page.getByRole('heading',{name:'Pallet saved',exact:true}).waitFor();
 await page.goto('http://127.0.0.1:4175/#incoming');await expect(page.getByText('Everything on your lists has been received.')).toBeVisible();
 await page.goto('http://127.0.0.1:4175/#products');await page.getByRole('button',{name:'New product',exact:true}).click();await page.getByLabel('Product name').fill('Live house blend');await page.getByRole('button',{name:'Generate barcode',exact:true}).click();await page.getByLabel('Estimated weight (lb)').fill('1450');await page.getByRole('button',{name:'Save and print now',exact:true}).click();await expect(page.getByRole('dialog').locator('.product-label')).toHaveCount(1);await page.getByRole('button',{name:'Close',exact:true}).click();await expect(page.getByTestId('product-list')).toContainText('Live house blend');
 console.log('PASS live delivery list waits in Incoming, is received from it, and a product saves and prints');await page.goto('http://127.0.0.1:4175/#jobs');await expect(page.locator('#main')).toContainText('J-NEWIMPORT');console.log('PASS live pallet import adds a missing job and its labels print');
 await page.goto('http://127.0.0.1:4175/#receive');await page.locator("#rcv-job").waitFor({state:"attached"}); if (await page.getByRole("button", {name:"Add job (optional)", exact:true}).isVisible()) await page.getByRole("button", {name:"Add job (optional)", exact:true}).click();
await page.locator('#rcv-job').selectOption({label:'J-LIVE · Live browser delivery'});await page.locator('#rcv-desc').fill('Shared browser pallet');
 await page.getByRole('button',{name:'Scan supplier barcode',exact:true}).click();await page.getByLabel('Printed barcode number').fill(']C100006141411234567890');await page.getByRole('button',{name:'Use barcode',exact:true}).click();await expect(page.getByRole('dialog')).toBeHidden();await expect(page.locator('#rcv-sup')).toHaveValue('006141411234567890');
 await page.getByRole('button',{name:'Save pallet',exact:true}).click();await page.getByRole('heading',{name:'Pallet saved',exact:true}).waitFor();
 // Add a real browser-compressed image, then prove another sign-in downloads no photo bytes.
 await page.getByRole('button',{name:'Open record',exact:true}).click();await page.getByRole('heading',{name:/P-000/}).waitFor();
 const imageData=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=1800;c.height=1200;const x=c.getContext('2d');const data=x.createImageData(c.width,c.height);for(let i=0;i<data.data.length;i+=4){data.data[i]=(i*17)%255;data.data[i+1]=Math.floor(i/123)%255;data.data[i+2]=(i*31)%255;data.data[i+3]=255;}x.putImageData(data,0,0);x.fillStyle='white';x.font='70px sans-serif';x.fillText('LABEL DETAIL 12345',60,150);return c.toDataURL('image/png').split(',')[1];});
 await page.locator('input[type=file]').setInputFiles({name:'detail.png',mimeType:'image/png',buffer:Buffer.from(imageData,'base64')});await page.getByRole('button',{name:'Open photo',exact:true}).waitFor();
 const second=await browser.newPage();await second.goto('http://127.0.0.1:4175/#signin');await second.getByLabel('Email',{exact:true}).fill(email);await second.getByLabel('Password',{exact:true}).fill(password);await second.getByRole('button',{name:'Sign in',exact:true}).click();await second.locator('.warehouse-greeting').filter({hasText:'Welcome, Browser owner.'}).waitFor();await second.locator('.warehouse-actions').getByRole('button',{name:'Find',exact:true}).click();await second.locator('#find-q').fill('Shared browser pallet');await second.locator('.result').waitFor();
 await second.evaluate(()=>localStorage.setItem('pl.lastActive',String(Date.now()-3*60*60*1000)));await second.reload();await second.getByRole('heading',{name:'Dashboard',exact:true}).waitFor();await second.locator('.warehouse-actions').getByRole('button',{name:'Find',exact:true}).click();await second.locator('#find-q').fill('Shared browser pallet');await second.locator('.result').waitFor();
 await second.getByRole('button',{name:'Scan barcode',exact:true}).click();await second.getByLabel('Printed barcode number').fill('(00)006141411234567890');await second.getByRole('button',{name:'Use barcode',exact:true}).click();await expect(second.getByRole('dialog')).toBeHidden();await expect(second.locator('#find-q')).toHaveValue('006141411234567890');await expect(second.locator('.result')).toHaveCount(1);await expect(second.locator('.result')).toContainText('Shared browser pallet');console.log('PASS supplier SSCC captured on Receive and found from a second Firebase session');
 const openingUsage=await second.evaluate(()=>window.__wherehouseBackend.usage());assert.equal(openingUsage.photoBytes,0);assert.ok(openingUsage.reads<250);
 await second.locator('.result').click();const thumbButton=second.getByRole('button',{name:'Open photo',exact:true});await thumbButton.scrollIntoViewIfNeeded();await thumbButton.locator('img').waitFor();
 const thumbUsage=await second.evaluate(()=>window.__wherehouseBackend.usage());assert.ok(thumbUsage.photoBytes>0&&thumbUsage.photoBytes<=128*1024);
 await thumbButton.click();await second.locator('.lightbox img').waitFor();const fullUsage=await second.evaluate(()=>window.__wherehouseBackend.usage());assert.ok(fullUsage.photoBytes>thumbUsage.photoBytes);
 await mkdir('docs/measurements',{recursive:true});await writeFile('docs/measurements/browser-photos.json',JSON.stringify({openingUsage,thumbnailBytes:thumbUsage.photoBytes,detailBytes:fullUsage.photoBytes-thumbUsage.photoBytes,description:'Actual browser canvas compression, authenticated image fetches; dashboard opening and Find download zero photo bytes.'},null,2));
 console.log('PASS sign-in loads zero photo bytes; visible thumbnail and opened detail download separately');

 await page.goto('http://127.0.0.1:4175/#overview');await page.locator('.warehouse-greeting').filter({hasText:'Welcome, Browser owner.'}).waitFor();await page.getByText('Pallets on hand',{exact:true}).waitFor();assert.equal(await page.getByRole('alert').count(),0);
 await page.goto('http://127.0.0.1:4175/#activity');await page.getByRole('heading',{name:'History',exact:true}).waitFor();await page.locator('.t tbody tr').first().waitFor();await page.getByLabel('Kind of change').selectOption('movement');await page.locator('.t tbody tr').first().waitFor();assert.equal(await page.getByRole('alert').count(),0);console.log('PASS bounded overview counts and filtered shared activity');
 await second.goto('http://127.0.0.1:4175/#settings');await second.getByRole('button',{name:'Log out',exact:true}).click();await second.goto('http://127.0.0.1:4175/#find');await second.getByLabel('Email',{exact:true}).waitFor();assert.equal(await second.locator('.result').count(),0);
 await page.goto('http://127.0.0.1:4175/#help');await page.getByRole('button',{name:'Take the tour',exact:true}).click();
 const tour=page.locator('.ptour-card');await tour.waitFor();await tour.getByRole('button',{name:'Start the tour',exact:true}).click();
 await tour.getByRole('heading',{name:'The top bar',exact:true}).waitFor();assert.ok((await tour.innerText()).includes('verified account'));
 await page.keyboard.press('Escape');await tour.waitFor({state:'detached'});assert.equal(await page.getByRole('complementary',{name:'Practice shift'}).count(),0);
 assert.equal(await page.getByRole('link',{name:'Open sample warehouse',exact:true}).count(),1);console.log('PASS customer Help tour opens and practice stays separate from customer records');
 await page.goto('http://127.0.0.1:4175/#people');await page.getByRole('heading',{name:'People',exact:true}).waitFor();await page.screenshot({path:'test-results/manager-dashboard.png'});
 await page.goto('http://127.0.0.1:4175/#find');await page.locator('#find-q').fill('Shared browser pallet');await page.locator('.result').waitFor();await page.screenshot({path:'test-results/live-warehouse.png'});
 const {db}=licenseStore();const ownerUser=await getAuth().getUserByEmail(email);const profile=await db.doc(`users/${ownerUser.uid}`).get();await testOfflineWarehouse(page,db,ownerUser.uid,profile.get('owned_workspace'));await db.doc(`licenses/${profile.get('owned_workspace')}`).update({active:false});
 await page.getByText('Activate my warehouse with a usage key',{exact:true}).waitFor();assert.equal(await page.locator('.result').count(),0);console.log('PASS live app clears warehouse data after license revocation');

 assert.deepEqual(errors,[]);console.log('PASS live sign-in, warehouse creation, live-only interface, receiving, second-device records, reload and sign-out');
} finally {await browser?.close();vite.kill();}
