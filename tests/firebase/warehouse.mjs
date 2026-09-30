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
}
