import {issueKey,licenseStore} from './keys.mjs';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
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
 const second=await browser.newPage();await second.goto('http://127.0.0.1:4175/#signin');await second.getByLabel('Email',{exact:true}).fill(email);await second.getByLabel('Password',{exact:true}).fill(password);await second.getByRole('button',{name:'Sign in',exact:true}).click();await second.locator('#find-q').fill('Shared browser pallet');await second.locator('.result').waitFor();
 await second.reload();await second.locator('#find-q').fill('Shared browser pallet');await second.locator('.result').waitFor();
 await second.goto('http://127.0.0.1:4175/#settings');await second.getByRole('button',{name:'Sign out',exact:true}).click();await second.goto('http://127.0.0.1:4175/#find');await second.getByLabel('Email',{exact:true}).waitFor();assert.equal(await second.locator('.result').count(),0);
 await page.goto('http://127.0.0.1:4175/#people');await page.getByRole('heading',{name:'Manager dashboard',exact:true}).waitFor();await page.screenshot({path:'test-results/manager-dashboard.png'});
 await page.goto('http://127.0.0.1:4175/#find');await page.locator('#find-q').fill('Shared browser pallet');await page.locator('.result').waitFor();await page.screenshot({path:'test-results/live-warehouse.png'});
 const {db}=licenseStore();const ownerUser=await getAuth().getUserByEmail(email);const profile=await db.doc(`users/${ownerUser.uid}`).get();await db.doc(`licenses/${profile.get('owned_workspace')}`).update({active:false});
 await page.getByText('Activate my warehouse with a usage key',{exact:true}).waitFor();assert.equal(await page.locator('.result').count(),0);console.log('PASS live app clears warehouse data after license revocation');

 assert.deepEqual(errors,[]);console.log('PASS live sign-in, warehouse creation, live-only interface, receiving, second-device records, reload and sign-out');
} finally {await browser?.close();vite.kill();}
