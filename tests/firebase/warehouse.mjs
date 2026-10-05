import './local-only.mjs';
import assert from 'node:assert/strict';
export async function testWarehouse({owner,operator,outsider,ws,send,adminDb,issueKey}) {
 const facility=(await adminDb.collection(`workspaces/${ws}/warehouses`).limit(1).get()).docs[0];
 const payload={name:'Updated warehouse',code:'CHS',address:'Charleston, SC',timezone:'America/New_York',phone:'',contact_email:'',receiving_notes:'Use receiving door 2'};
 await assert.rejects(send(operator,'update_warehouse',payload,{expected_version:1}),e=>e.code==='functions/permission-denied');
 const result=await send(owner,'update_warehouse',payload,{expected_version:1});assert.equal(result.ok,true,JSON.stringify(result));
 assert.equal((await facility.ref.get()).get('address'),'Charleston, SC');assert.equal((await adminDb.doc(`workspaces/${ws}`).get()).get('name'),'Updated warehouse');
 const stale=await send(owner,'update_warehouse',{...payload,name:'Stale edit'},{expected_version:1});assert.equal(stale.code,'VERSION_CONFLICT');
 const usageKey=await issueKey(owner.user.email),data={name:'Additional warehouse',sourceWorkspaceId:ws,usageKey};
 await assert.rejects(owner.call('createWarehouse',data),e=>e.code==='functions/permission-denied'&&/current plan/.test(e.message));
 await assert.rejects(outsider.call('createWarehouse',data));
 await adminDb.doc(`licenses/${ws}`).update({features:{multiWarehouse:true,maxWarehouses:2}});
 const added=await owner.call('createWarehouse',data);assert.notEqual(added.workspaceId,ws);
 assert.equal((await owner.call('createWarehouse',data)).workspaceId,added.workspaceId);
 assert.equal((await adminDb.doc(`users/${owner.user.uid}`).get()).get('owned_workspace'),ws);
 assert.equal((await adminDb.doc(`licenses/${added.workspaceId}`).get()).get('features.multiWarehouse'),true);
 await assert.rejects(owner.call('createWarehouse',{...data,usageKey:await issueKey(owner.user.email)}),e=>e.code==='functions/resource-exhausted');
 const before=(await adminDb.doc(`licenses/${ws}`).get()).get('expires_at').toMillis();
 await owner.call('createWarehouse',{name:'Renew additional',workspaceId:added.workspaceId,usageKey:await issueKey(owner.user.email)});
 assert.equal((await adminDb.doc(`licenses/${ws}`).get()).get('expires_at').toMillis(),before);
 console.log('PASS warehouse edit permissions/version conflicts, server-side basic-plan gate, keyed additional warehouse, retry recovery and capacity limit');
 await testManySpots({owner,ws,send,adminDb,code:(await facility.ref.get()).get('code')});
}

// The setup wizard's "Create 175 spots": a zone with 50 spots grows to 3 aisles x 15 bays x 5 levels, sent 80 at a time.
async function testManySpots({owner,ws,send,adminDb,code}) {
 const codes=[];for(let a=1;a<=3;a++)for(let b=1;b<=15;b++)for(let l=1;l<=5;l++)codes.push(`Z-${String(a).padStart(2,'0')}-${String(b).padStart(2,'0')}-${l}`);
 const batch=async(list,name)=>{for(let i=0;i<list.length;i+=80){const rows=list.slice(i,i+80).map(c=>({warehouse_code:code,location_code:c,kind:'RACK'}));const r=await send(owner,'import_batch',{import_kind:'locations',checksum:`${name}-${i}`,rows,name});assert.equal(r.ok,true,JSON.stringify(r));}};
 await batch(codes.slice(0,50),'Setup: zone Z');
 // More than 80 rows in one request is refused with a message, never silently.
 await assert.rejects(send(owner,'import_batch',{import_kind:'locations',checksum:'too-many',rows:codes.slice(50,131).map(c=>({warehouse_code:code,location_code:c,kind:'RACK'}))}),e=>e.code==='functions/invalid-argument'&&/80 rows/.test(e.message));
 await batch(codes.slice(50),'Setup: zone Z more');
 const made=await adminDb.collection(`workspaces/${ws}/locations`).where('zone','==','Z').get();
 assert.equal(made.size,225);
 // Every spot has its label token, so all 225 print.
 const labels=await adminDb.collection(`workspaces/${ws}/labels`).where('kind','==','L').get();
 assert.ok(made.docs.every(d=>labels.docs.some(l=>l.get('target_id')===d.id)));
 // Sending every code again skips the existing spots instead of failing or duplicating them.
 await batch(codes,'Setup: zone Z again');
 assert.equal((await adminDb.collection(`workspaces/${ws}/locations`).where('zone','==','Z').get()).size,225);
 console.log('PASS 225 setup spots created in batches of 80 on a zone that had 50, with the oversized batch refused by message');
}
