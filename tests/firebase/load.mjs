import './local-only.mjs';
// LOCAL ONLY. The hard guard runs before any SDK connection or seed operation.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { mkdir,writeFile,rm } from 'node:fs/promises';
import { initializeApp,deleteApp } from 'firebase/app';
import { getAuth,connectAuthEmulator,signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore,connectFirestoreEmulator,collection,query,where,orderBy,limit,startAfter,getDocs,doc,getDoc } from 'firebase/firestore/lite';
import { getFunctions,connectFunctionsEmulator,httpsCallable } from 'firebase/functions';
import { getStorage,connectStorageEmulator,ref,uploadBytes } from 'firebase/storage';
import { issueKey,licenseStore } from './keys.mjs';
if(process.env.GCLOUD_PROJECT!=='demo-wherehouse'||process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8080'||process.env.FIREBASE_STORAGE_EMULATOR_HOST!=='127.0.0.1:9199')throw Error('Refusing load test outside the demo-wherehouse local emulators.');
const require=createRequire(new URL('../../firebase/functions/package.json',import.meta.url));
require('firebase-admin/app').initializeApp({projectId:'demo-wherehouse',storageBucket:'demo-wherehouse.appspot.com'});
const {getAuth:adminAuth}=require('firebase-admin/auth');const {db,Timestamp}=licenseStore();
const suffix=Date.now(),password='Local-only-load-123!',apps=[];
async function client(i){
 const user=await adminAuth().createUser({email:`load-${suffix}-${i}@example.com`,password,emailVerified:true});
 const app=initializeApp({apiKey:'demo-key',projectId:'demo-wherehouse',authDomain:'demo-wherehouse.firebaseapp.com',storageBucket:'demo-wherehouse.appspot.com'},'load-'+i);apps.push(app);
 const auth=getAuth(app);connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});await signInWithEmailAndPassword(auth,user.email,password);
 const store=getFirestore(app);connectFirestoreEmulator(store,'127.0.0.1',8080);const fn=getFunctions(app);connectFunctionsEmulator(fn,'127.0.0.1',5001);const storage=getStorage(app);connectStorageEmulator(storage,'127.0.0.1',9199);storage.maxUploadRetryTime=20000;storage.maxOperationRetryTime=20000;
 return{user,auth,store,storage,call:async(name,data)=>(await httpsCallable(fn,name,{timeout:40000})(data)).data};
}
async function download(user,path){
 const token=await user.auth.currentUser.getIdToken();
 const response=await fetch('http://127.0.0.1:9199/v0/b/demo-wherehouse.appspot.com/o/'+encodeURIComponent(path)+'?alt=media',{headers:{Authorization:'Bearer '+token,Connection:'close'},signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw Error(`Photo download ${response.status}: ${await response.text()}`);
 return response.arrayBuffer();
}
const measurements=[];
const pullMetrics=async()=>await(await fetch('http://127.0.0.1:5001/__test/metrics')).json();
const ms=()=>performance.now();
async function scenario(users,records){
 const owner=users[0];const {workspaceId:ws}=await owner.call('createWarehouse',{name:`Local ${records} records`,usageKey:await issueKey(owner.user.email)});
 for(const u of users.slice(1))await owner.call('authorizeEmail',{workspaceId:ws,email:u.user.email,name:'Load employee',role:'OPERATOR'});
 const env=(kind,payload,extra={})=>({schema_version:1,command_id:randomUUID(),workspace_id:ws,kind,payload,...extra});
 const send=(u,kind,payload,extra)=>u.call('command',env(kind,payload,extra));
 const job=await send(owner,'create_job',{code:'JOB-LOAD',name:'Load test job'}),a=await send(owner,'create_location',{code:'A-01-01',kind:'RACK'}),b=await send(owner,'create_location',{code:'A-01-02',kind:'RACK'});
 const root=db.doc(`workspaces/${ws}`),wh=(await root.collection('warehouses').limit(1).get()).docs[0].id;
 // 10,000 current pallet documents + 40,000 immutable events. Seed cost is reported separately.
 const pallets=records?10000:0;const seedStart=ms();let seedWrites=0;
 for(let offset=0;offset<pallets;offset+=80){const batch=db.batch();for(let i=offset;i<Math.min(offset+80,pallets);i++){
  const id=`old-${String(i).padStart(6,'0')}`,code=`P-${String(100000+i).padStart(6,'0')}`,now='2025-01-01T12:00:00.000Z';
  const p={id,workspace_id:ws,warehouse_id:wh,code,job_id:job.target_id,description:`Accumulated pallet ${i}`,notes:null,supplier_ref:null,state:'STORED',current_location_id:a.target_id,last_confirmed_location_id:a.target_id,last_confirmed_at:now,hold:null,version:4,received_at:now,updated_at:now,archived_at:null,label_needs_reprint:false,has_hold:false,search_terms:['accumulated','pallet',String(i)]};
  batch.set(root.collection('pallets').doc(id),p);seedWrites++;
  const snapshot={state:'STORED',current_location_id:a.target_id,current_location_code:'A-01-01',last_confirmed_location_id:a.target_id,last_confirmed_location_code:'A-01-01',job_id:job.target_id,job_code:'JOB-LOAD',hold:false,hold_reason:null,description:p.description,archived:false};
  for(let rev=1;rev<=4;rev++){batch.create(root.collection('events').doc(`${id}_${rev}`),{id:`${id}_${rev}`,schema_version:1,workspace_id:ws,pallet_id:id,revision:rev,type:rev===1?'receive':'move',actor_id:owner.user.uid,accepted_at:now,observed_at:null,before_state:rev===1?null:snapshot,after_state:snapshot,reason:null,command_id:`seed-${id}-${rev}`,detail:{}});seedWrites++;}
 }await batch.commit();}
 if(pallets){seedWrites+=2;await root.collection('jobs').doc(job.target_id).update({'counts.STORED':pallets});await root.collection('locations').doc(a.target_id).update({pallet_count:pallets});}
 const seedMs=ms()-seedStart;await pullMetrics();
 const observations=[],photoDownloads=[];const started=ms();
 await Promise.all(users.map(async(u,index)=>{
  for(let cycle=0;cycle<4;cycle++){
   let t=ms();const receiveCmd=env('receive',{job_id:job.target_id,description:`Measured pallet ${index} ${cycle}`});let r=await u.call('command',receiveCmd);assert.equal(r.ok,true,JSON.stringify(r));observations.push({operation:'receive',key:receiveCmd.command_id,clientMs:ms()-t});let p=r.current_state;
   const replay=await u.call('command',receiveCmd);assert.equal(replay.replayed,true);assert.equal(replay.current_state.id,p.id);
   r=await send(u,'place',{location_id:a.target_id},{pallet_id:p.id,expected_version:p.version});assert.equal(r.ok,true);p=r.current_state;
   const moveCmd=env('move',{location_id:b.target_id},{pallet_id:p.id,expected_version:p.version});t=ms();r=await u.call('command',moveCmd);assert.equal(r.ok,true,JSON.stringify(r));observations.push({operation:'move',key:moveCmd.command_id,clientMs:ms()-t});p=r.current_state;
   t=ms();const found=await getDocs(query(collection(u.store,'workspaces',ws,'pallets'),where('code','==',p.code),orderBy('code'),limit(50)));assert.equal(found.size,1,`Exact lookup failed: ${p.code}, user ${index}, cycle ${cycle}`);observations.push({operation:'find',reads:Math.max(1,found.size),writes:0,retries:0,clientMs:ms()-t,functionMs:null,photoBytes:0});
   if(cycle===0){
    const uploadId=randomUUID(),bytes=new Uint8Array(512*1024),thumb=new Uint8Array(24*1024);bytes.set([255,216,255,224]);thumb.set([255,216,255,224]);
    const reservation=await u.call('reservePhotoUpload',{workspaceId:ws,uploadId,bytes:bytes.length,thumbBytes:thumb.length});
    await Promise.all([uploadBytes(ref(u.storage,reservation.full),bytes,{contentType:'image/jpeg',customMetadata:{uploadedBy:u.user.uid}}),uploadBytes(ref(u.storage,reservation.thumb),thumb,{contentType:'image/jpeg',customMetadata:{uploadedBy:u.user.uid}})]);
    r=await u.call('command',{...env('add_photo',{attachment_id:randomUUID(),data_url:`storage://${reservation.full}`,thumb_url:`storage://${reservation.thumb}`,media_type:'image/jpeg',bytes:bytes.length},{pallet_id:p.id,expected_version:p.version}),command_id:uploadId});assert.equal(r.ok,true,JSON.stringify(r));p=r.current_state;
    photoDownloads.push({u,reservation});
   }
   const dispatchCmd=env('dispatch',{destination:'Example job site'},{pallet_id:p.id,expected_version:p.version});t=ms();r=await u.call('command',dispatchCmd);assert.equal(r.ok,true,JSON.stringify(r));observations.push({operation:'dispatch',key:dispatchCmd.command_id,clientMs:ms()-t});
  }
 }));
 await Promise.all(photoDownloads.map(async({u,reservation})=>{for(const [operation,path]of [['photo_thumbnail',reservation.thumb],['photo_detail',reservation.full]]){const t=ms();const data=await download(u,path);observations.push({operation,reads:0,writes:0,retries:0,clientMs:ms()-t,functionMs:null,photoBytes:data.byteLength});}}));
 const metrics=await pullMetrics();
 for(const o of observations){if(o.key){const m=metrics.find(m=>m.key===o.key);assert.ok(m);Object.assign(o,{reads:m.reads,writes:m.writes,retries:m.retries,transactionMs:m.ms,functionMs:m.handlerMs,photoBytes:0});assert.ok(m.reads<120,`Unbounded read count: ${m.reads}`);}}
 // A targeted read of a far-away old pallet proves 50-record opening does not hide it.
 if(pallets){const found=await getDocs(query(collection(owner.store,'workspaces',ws,'pallets'),where('code','==','P-109999'),limit(50)));assert.equal(found.docs[0]?.id,'old-009999');const first=await getDocs(query(collection(owner.store,'workspaces',ws,'events'),where('pallet_id','==','old-009999'),orderBy('revision','desc'),limit(2)));const next=await getDocs(query(collection(owner.store,'workspaces',ws,'events'),where('pallet_id','==','old-009999'),orderBy('revision','desc'),startAfter(first.docs.at(-1)),limit(2)));assert.deepEqual([...first.docs,...next.docs].map(d=>d.data().revision),[4,3,2,1]);}
 const replays=metrics.filter(m=>m.writes===0);assert.ok(replays.length>=users.length*4);
 measurements.push({users:users.length,accumulatedRecords:records,seedWrites,seedMs,wallMs:ms()-started,observations,allFunctionMetrics:metrics});
 await mkdir('docs/measurements',{recursive:true});await writeFile('docs/measurements/firebase-load-partial.json',JSON.stringify({status:'incomplete',measurements},null,2));
 console.log(`LOAD PASS users=${users.length} accumulated=${records}; measured=${observations.length}, max command reads=${Math.max(...metrics.map(x=>x.reads))}`);
 return {ws,owner,root};
}
try{
 const clients=[];for(let i=0;i<10;i++)clients.push(await client(i));
 // Each account can own one warehouse. New owners keep test scenarios isolated.
 let last;
 for(const [count,records]of [[1,0],[10,0],[1,50000],[10,50000]]){
  const owner=await client('owner-'+count+'-'+records);last=await scenario([owner,...clients.slice(0,count-1)],records);
 }
 // Expired orphan cleanup and the commit-vs-cleanup state fence.
 const {ws,owner,root}=last;const orphan=randomUUID();const reserved=await owner.call('reservePhotoUpload',{workspaceId:ws,uploadId:orphan,bytes:8,thumbBytes:4});
 await uploadBytes(ref(owner.storage,reserved.full),new Uint8Array(8),{contentType:'image/jpeg',customMetadata:{uploadedBy:owner.user.uid}});
 await root.collection('uploads').doc(orphan).update({expires_at:Timestamp.fromMillis(Date.now()-24*3600000-1000)});
 await fetch('http://127.0.0.1:5001/__test/cleanup',{method:'POST'});assert.equal((await root.collection('uploads').doc(orphan).get()).get('state'),'deleted');await assert.rejects(download(owner,reserved.full));
 const committed=(await root.collection('uploads').where('state','==','committed').limit(1).get()).docs[0];assert.ok(committed);assert.ok((await download(owner,committed.get('full'))).byteLength>0);const recorded=(await root.collection('pallets').doc(committed.get('pallet_id')).get()).data();const removed=await owner.call('command',{schema_version:1,command_id:randomUUID(),workspace_id:ws,kind:'remove_photo',pallet_id:recorded.id,expected_version:recorded.version,payload:{attachment_id:committed.get('attachment_id'),reason:'Local history retention check'}});assert.equal(removed.ok,true,JSON.stringify(removed));await fetch('http://127.0.0.1:5001/__test/cleanup',{method:'POST'});assert.ok((await download(owner,committed.get('full'))).byteLength>0);console.log('PASS expired orphan deleted; active and removed historical photos retained');
 await mkdir('docs/measurements',{recursive:true});await writeFile('docs/measurements/firebase-load.json',JSON.stringify({date:new Date().toISOString(),environment:'demo-wherehouse emulators; local handler timings, not production billing',notes:['Seed operations excluded from operation measurements.','SDK document/query reads include empty-query minimum; security-rule dependent reads and index scans are estimated separately.','Read-only Find/photos invoke no Cloud Function. Photo buffers model 512 KiB detail and 24 KiB thumbnail; browser tests verify actual compression.','Transaction metrics include retry reads; writes are the final successful attempt.'],measurements},null,2));
await rm('docs/measurements/firebase-load-partial.json',{force:true});
}finally{await Promise.all(apps.map(deleteApp));}
