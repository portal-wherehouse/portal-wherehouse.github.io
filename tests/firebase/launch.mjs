import {spawn} from 'node:child_process';
import {assertLocal,localEnvironment}from './guard.mjs';
// Check caller configuration BEFORE replacing anything or starting Firebase CLI.
assertLocal(process.env,false);
if(process.argv.slice(2).some(x=>x!=='--load'))throw Error('Only --load is supported; project and endpoints are fixed.');
const env={...process.env,...localEnvironment,FIREBASE_CONFIG:JSON.stringify({projectId:'demo-wherehouse',storageBucket:'demo-wherehouse.appspot.com'}),FIREBASE_CLI_DISABLE_USAGE:'true'};
async function run(args,cwd=process.cwd()){await new Promise((resolve,reject)=>{const child=spawn(process.execPath,args,{stdio:'inherit',env,cwd});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error(`Local verification failed (${code}).`)));});}
await run(['--test','tests/firebase/guard.test.mjs']);
await run(['build.mjs'],new URL('../../firebase/functions/',import.meta.url));
await run(['node_modules/typescript/bin/tsc','-p','firebase/functions/tsconfig.json']);
await run(['--require','./tests/firebase/runtime-framing.cjs','node_modules/firebase-tools/lib/bin/firebase.js','emulators:exec','--project','demo-wherehouse','--only','auth,firestore,storage','node tests/firebase/run.mjs'+(process.argv.includes('--load')?' --load':'')]);
