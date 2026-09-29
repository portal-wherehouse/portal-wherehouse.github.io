import test from 'node:test';import assert from 'node:assert/strict';import{assertLocal,localEnvironment}from './guard.mjs';
test('accepts only the complete local emulator configuration',()=>{assert.doesNotThrow(()=>assertLocal(localEnvironment));assert.throws(()=>assertLocal({}),/LOCAL TESTS ONLY/);});
test('rejects live or missing endpoints before SDK initialization',()=>{for(const key of Object.keys(localEnvironment)){assert.throws(()=>assertLocal({...localEnvironment,[key]:'production'}),/LOCAL TESTS ONLY/);assert.throws(()=>assertLocal({...localEnvironment,[key]:''}),/LOCAL TESTS ONLY/);}});
test('rejects conflicting project and web config',()=>{for(const key of ['GOOGLE_CLOUD_PROJECT','GCP_PROJECT','CLOUDSDK_CORE_PROJECT'])assert.throws(()=>assertLocal({...localEnvironment,[key]:'production'}));assert.throws(()=>assertLocal({...localEnvironment,VITE_FIREBASE_APPCHECK_SITE_KEY:'live-key'}));assert.throws(()=>assertLocal({...localEnvironment,VITE_FIREBASE_CONFIG:JSON.stringify({projectId:'production'})}));assert.throws(()=>assertLocal({...localEnvironment,FIREBASE_CONFIG:'/tmp/real-project.json'}));});
test('launcher rejects supplied live configuration without overriding it',()=>{assert.doesNotThrow(()=>assertLocal({},false));assert.throws(()=>assertLocal({FIRESTORE_EMULATOR_HOST:'firestore.googleapis.com'},false));});

test('deployment indexes do not duplicate automatic single-field indexes', async()=>{
 const {readFile}=await import('node:fs/promises');
 const config=JSON.parse(await readFile(new URL('../../firebase/firestore.indexes.json',import.meta.url),'utf8'));
 for(const index of config.indexes){
  const fields=index.fields.filter(field=>field.fieldPath!=='__name__');
  const name=index.fields.find(field=>field.fieldPath==='__name__');
  const automatic=index.queryScope==='COLLECTION'&&fields.length===1&&fields[0].order&&(!name||name.order===fields[0].order);
  assert.ok(!automatic,`${index.collectionGroup}: use single-field controls instead of a redundant composite index`);
 }
 for(const collectionGroup of ['events','audit'])assert.ok(!config.fieldOverrides.some(field=>field.collectionGroup===collectionGroup&&['accepted_at','*'].includes(field.fieldPath)),`${collectionGroup} activity ordering must retain automatic indexing`);
});
