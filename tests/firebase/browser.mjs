import './local-only.mjs';
import {issueKey,licenseStore} from './keys.mjs';
import { chromium } from '@playwright/test';
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
const vite=spawn('node',['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','4175'],{stdio:'ignore',env:{...process.env,VITE_FIREBASE_EMULATORS:'true',VITE_FIREBASE_CONFIG:JSON.stringify({apiKey:'demo-key',projectId:'demo-wherehouse',authDomain:'demo-wherehouse.firebaseapp.com',storageBucket:'demo-wherehouse.appspot.com',appId:'demo-app'})}});
let browser;
try {
 for(let i=0;i<50;i++){try{if((await fetch('http://127.0.0.1:4175')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message)); page.on('console',m=>{if(m.type()==='error')console.log('BROWSER_ERROR',m.text());});
 await page.goto('http://127.0.0.1:4175/#signin');await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await page.getByText('Activate my warehouse with a usage key',{exact:true}).click();await page.getByLabel('Warehouse name',{exact:true}).fill('Browser warehouse');await page.getByLabel('Usage key',{exact:true}).fill(usageKey);await page.getByRole('button',{name:'Activate warehouse',exact:true}).click();
 await page.getByRole('heading',{name:'Locations',exact:true}).waitFor().catch(async e=>{console.log((await page.locator('body').innerText()).slice(0,4000));throw e;});assert.equal(await page.locator('.demo-strip').count(),0);assert.equal(await page.getByRole('button',{name:'Practice shift',exact:true}).count(),0);
 await page.goto('http://127.0.0.1:4175/#jobs');await page.getByRole('button',{name:'New job',exact:true}).click();
 await page.locator('#job-code').fill('J-LIVE');await page.locator('#job-name').fill('Live browser delivery');await page.getByRole('button',{name:'Create job',exact:true}).click();
 await page.getByRole('heading',{name:'Live browser delivery',exact:true}).waitFor().catch(async e=>{console.log((await page.locator('body').innerText()).slice(-4000));throw e;});
 await page.goto('http://127.0.0.1:4175/#receive');await page.locator('#rcv-job').selectOption({label:'J-LIVE · Live browser delivery'});await page.locator('#rcv-desc').fill('Shared browser pallet');await page.getByRole('button',{name:'Save pallet',exact:true}).click();await page.getByRole('heading',{name:'Pallet saved',exact:true}).waitFor();
 // Add a real browser-compressed image, then prove another sign-in downloads no photo bytes.
 await page.getByRole('button',{name:'Open record',exact:true}).click();await page.getByRole('heading',{name:/P-000/}).waitFor();
 const imageData=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=1800;c.height=1200;const x=c.getContext('2d');const data=x.createImageData(c.width,c.height);for(let i=0;i<data.data.length;i+=4){data.data[i]=(i*17)%255;data.data[i+1]=Math.floor(i/123)%255;data.data[i+2]=(i*31)%255;data.data[i+3]=255;}x.putImageData(data,0,0);x.fillStyle='white';x.font='70px sans-serif';x.fillText('LABEL DETAIL 12345',60,150);return c.toDataURL('image/png').split(',')[1];});
 await page.locator('input[type=file]').setInputFiles({name:'detail.png',mimeType:'image/png',buffer:Buffer.from(imageData,'base64')});await page.getByRole('button',{name:'Open photo',exact:true}).waitFor();
 const second=await browser.newPage();await second.goto('http://127.0.0.1:4175/#signin');await second.getByLabel('Email',{exact:true}).fill(email);await second.getByLabel('Password',{exact:true}).fill(password);await second.getByRole('button',{name:'Sign in',exact:true}).click();await second.locator('#find-q').fill('Shared browser pallet');await second.locator('.result').waitFor();
 await second.reload();await second.locator('#find-q').fill('Shared browser pallet');await second.locator('.result').waitFor();
 const openingUsage=await second.evaluate(()=>window.__wherehouseBackend.usage());assert.equal(openingUsage.photoBytes,0);assert.ok(openingUsage.reads<250);
 await second.locator('.result').click();const thumbButton=second.getByRole('button',{name:'Open photo',exact:true});await thumbButton.scrollIntoViewIfNeeded();await thumbButton.locator('img').waitFor();
 const thumbUsage=await second.evaluate(()=>window.__wherehouseBackend.usage());assert.ok(thumbUsage.photoBytes>0&&thumbUsage.photoBytes<=128*1024);
 await thumbButton.click();await second.locator('.lightbox img').waitFor();const fullUsage=await second.evaluate(()=>window.__wherehouseBackend.usage());assert.ok(fullUsage.photoBytes>thumbUsage.photoBytes);
 await mkdir('docs/measurements',{recursive:true});await writeFile('docs/measurements/browser-photos.json',JSON.stringify({openingUsage,thumbnailBytes:thumbUsage.photoBytes,detailBytes:fullUsage.photoBytes-thumbUsage.photoBytes,description:'Actual browser canvas compression, authenticated image fetches; sign-in and Find download zero photo bytes.'},null,2));
 console.log('PASS sign-in loads zero photo bytes; visible thumbnail and opened detail download separately');

 await page.goto('http://127.0.0.1:4175/#overview');await page.getByRole('heading',{name:'Overview',exact:true}).waitFor();await page.getByText('Pallets on hand',{exact:true}).waitFor();assert.equal(await page.getByRole('alert').count(),0);
 await page.goto('http://127.0.0.1:4175/#activity');await page.getByRole('heading',{name:'Activity',exact:true}).waitFor();await page.locator('.t tbody tr').first().waitFor();await page.getByLabel('Kind of change').selectOption('movement');await page.locator('.t tbody tr').first().waitFor();assert.equal(await page.getByRole('alert').count(),0);console.log('PASS bounded overview counts and filtered shared activity');
 await second.goto('http://127.0.0.1:4175/#settings');await second.getByRole('button',{name:'Sign out',exact:true}).click();await second.goto('http://127.0.0.1:4175/#find');await second.getByLabel('Email',{exact:true}).waitFor();assert.equal(await second.locator('.result').count(),0);
 await page.goto('http://127.0.0.1:4175/#help');await page.getByRole('button',{name:'Take the tour',exact:true}).click();
 const tour=page.locator('.ptour-card');await tour.waitFor();await tour.getByRole('button',{name:'Start the tour',exact:true}).click();
 await tour.getByRole('heading',{name:'The top bar',exact:true}).waitFor();assert.ok((await tour.innerText()).includes('verified account'));
 await page.keyboard.press('Escape');await tour.waitFor({state:'detached'});assert.equal(await page.getByRole('complementary',{name:'Practice shift'}).count(),0);
 assert.equal(await page.getByRole('link',{name:'Open sample warehouse',exact:true}).count(),1);console.log('PASS customer Help tour opens and practice stays separate from customer records');
 await page.goto('http://127.0.0.1:4175/#people');await page.getByRole('heading',{name:'Manager dashboard',exact:true}).waitFor();await page.screenshot({path:'test-results/manager-dashboard.png'});
 await page.goto('http://127.0.0.1:4175/#find');await page.locator('#find-q').fill('Shared browser pallet');await page.locator('.result').waitFor();await page.screenshot({path:'test-results/live-warehouse.png'});
 const {db}=licenseStore();const ownerUser=await getAuth().getUserByEmail(email);const profile=await db.doc(`users/${ownerUser.uid}`).get();await db.doc(`licenses/${profile.get('owned_workspace')}`).update({active:false});
 await page.getByText('Activate my warehouse with a usage key',{exact:true}).waitFor();assert.equal(await page.locator('.result').count(),0);console.log('PASS live app clears warehouse data after license revocation');

 assert.deepEqual(errors,[]);console.log('PASS live sign-in, warehouse creation, live-only interface, receiving, second-device records, reload and sign-out');
} finally {await browser?.close();vite.kill();}
