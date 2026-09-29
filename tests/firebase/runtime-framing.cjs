// firebase-tools 14.17's Storage rules runtime parses each stdout chunk as one
// JSON message. Concurrent replies can share a chunk and get silently dropped.
// Frame by newline instead. This changes transport only, never rules/results.
// Applied only to the locally launched emulator CLI; no production code loads it.
const {createInterface}=require('node:readline');
if(process.env.GCLOUD_PROJECT!=='demo-wherehouse'||process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8080'||process.env.FIREBASE_STORAGE_EMULATOR_HOST!=='127.0.0.1:9199')throw Error('Refusing emulator transport patch outside local demo tests.');
const {StorageRulesRuntime}=require('../../node_modules/firebase-tools/lib/emulator/storage/rules/runtime.js');
const start=StorageRulesRuntime.prototype.start;
StorageRulesRuntime.prototype.start=async function(...args){
 const result=await start.apply(this,args);const stream=this._childprocess?.stdout;
 if(stream&&!stream.__wherehouseFramed){const handlers=stream.listeners('data');if(handlers.length!==1)throw Error('Storage emulator changed; review the local line-framing adapter.');stream.removeListener('data',handlers[0]);const lines=createInterface({input:stream,crlfDelay:Infinity});lines.on('line',line=>handlers[0](Buffer.from(line)));stream.__wherehouseFramed=true;}
 return result;
};
