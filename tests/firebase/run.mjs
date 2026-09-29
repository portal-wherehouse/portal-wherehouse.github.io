// Execute the exported callable HTTP handlers over TCP, with real Auth/Firestore/Storage emulators.
// This also works in environments that cannot create the Functions emulator's Unix sockets.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
const require=createRequire(new URL('../../firebase/functions/package.json',import.meta.url));
process.env.GCLOUD_PROJECT='demo-wherehouse';
process.env.FIREBASE_CONFIG=JSON.stringify({projectId:'demo-wherehouse',storageBucket:'demo-wherehouse.appspot.com'});
process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';
process.env.FIREBASE_STORAGE_EMULATOR_HOST='127.0.0.1:9199';
const express=require('express');const handlers=require('../../firebase/functions/lib/index.cjs');
const app=express();app.use(express.json({limit:'10mb'}));
for(const [name,handler] of Object.entries(handlers))app.all(`/demo-wherehouse/us-central1/${name}`,handler);
const server=app.listen(5001,'127.0.0.1',()=>{
 const test=spawn(process.execPath,[process.argv.includes('--browser-only')?'tests/firebase/browser.mjs':'tests/firebase/integration.mjs'],{stdio:'inherit',env:process.env});
 test.on('exit',code=>{if(code || process.argv.includes('--browser-only')){server.close(()=>process.exit(code));return;}const browser=spawn(process.execPath,['tests/firebase/browser.mjs'],{stdio:'inherit',env:process.env});browser.on('exit',result=>server.close(()=>process.exit(result??1)));});
});
