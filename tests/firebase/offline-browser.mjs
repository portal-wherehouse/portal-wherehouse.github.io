import './local-only.mjs';
import assert from 'node:assert/strict';
import { expect } from '@playwright/test';

export async function testOfflineWarehouse(page, db, uid, ws) {
  await page.goto('http://127.0.0.1:4175/#find');
  await page.locator('#find-q').fill('Shared browser pallet');
  await page.locator('.result').click();
  await page.getByRole('heading',{name:/^P-000/}).waitFor();
  const fixture = await page.evaluate(async () => {
    const b = window.__wherehouseBackend;
    const call = async (kind,payload,pallet) => {
      const outcome = await b.send(b.authUid,{schema_version:1,command_id:crypto.randomUUID(),workspace_id:b.activeWorkspace,kind,payload,...(pallet?{pallet_id:pallet.id,expected_version:pallet.version}:{})});
      if(outcome.status!=='result'||!outcome.result.ok)throw Error(JSON.stringify(outcome));
      return outcome.result;
    };
    const p=Object.values(b.db.pallets).find(p=>p.description==='Shared browser pallet');
    const a=await call('create_location',{code:'A-01-01',kind:'RACK'});
    const z=await call('create_location',{code:'A-01-02',kind:'RACK'});
    const placed=await call('place',{location_id:a.target_id},p);
    return {id:p.id,code:p.code,a:a.target_id,z:z.target_id,version:placed.current_state.version};
  });
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
  // An online reload attaches the installed shell worker before the dead-zone test.
  await page.reload();await page.getByRole('heading',{name:'Dashboard',exact:true}).waitFor();
  await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true);
  await page.locator('.warehouse-actions').getByRole('button',{name:'Move',exact:true}).click();
  await page.context().setOffline(true);
  await expect.poll(()=>page.evaluate(()=>!!window.__wherehouseBackend.cache)).toBe(true);
  await page.locator('#manual-code').fill(fixture.code);await page.locator('#manual-code').press('Enter');
  await page.locator('#manual-code').fill('A-01-02');await page.locator('#manual-code').press('Enter');
  await page.getByRole('button',{name:'Queue: move A-01-02',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.__wherehouseBackend.outbox.entries.filter(e=>e.status==='queued').length)).toBe(1);
  const queued=await page.evaluate(()=>window.__wherehouseBackend.outbox.entries[0]);
  assert.equal((await db.doc(`workspaces/${ws}/pallets/${fixture.id}`).get()).get('version'),fixture.version);
  // A full offline reload must retain the account-scoped queue and cached records.
  await page.reload();await page.getByRole('heading',{name:'Dashboard',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.__wherehouseBackend.outbox.entries[0].command.command_id),queued.command.command_id);
  assert.equal(await page.evaluate(()=>window.__wherehouseBackend.db.pallets[Object.keys(window.__wherehouseBackend.db.pallets)[0]].current_location_id),fixture.a);
  // Original request IDs are retained when reconnecting, so exactly one history row is added.
  await page.context().setOffline(false);
  await expect.poll(()=>page.evaluate(()=>window.__wherehouseBackend.outbox.entries[0]?.status),{timeout:20000}).toBe('acknowledged');
  const moved=await db.doc(`workspaces/${ws}/pallets/${fixture.id}`).get();
  assert.equal(moved.get('version'),fixture.version+1);assert.equal(moved.get('current_location_id'),fixture.z);
  await page.evaluate(async()=>{const b=window.__wherehouseBackend;await b.sync(b.authUid,b.activeWorkspace);});
  assert.equal((await db.doc(`workspaces/${ws}/pallets/${fixture.id}`).get()).get('version'),fixture.version+1);
  console.log('PASS real offline Move, durable reload, no optimistic confirmed location, reconnect and exactly-once history');

  // Queue another move, then a second device verifies the pallet first.
  await page.evaluate(async()=>{const b=window.__wherehouseBackend;await b.preloadScan('P-000001');});
  await page.context().setOffline(true);
  await expect.poll(()=>page.evaluate(()=>!!window.__wherehouseBackend.cache)).toBe(true);
  await page.evaluate(async ({id,a})=>{
    const b=window.__wherehouseBackend,p=b.db.pallets[id];
    await b.queueOffline({actor_id:b.authUid,workspace_id:b.activeWorkspace,pallet_id:id,pallet_code:p.code,expected_version:p.version,kind:'move',from_code:'A-01-02',to_code:'A-01-01',created_at:new Date().toISOString(),command:{schema_version:1,command_id:crypto.randomUUID(),workspace_id:b.activeWorkspace,kind:'move',pallet_id:id,expected_version:p.version,payload:{location_id:a}}});
  },fixture);
  // Use the actual callable with a local Auth emulator token for the concurrent device.
  const token=await page.evaluate(()=>window.__wherehouseBackend.auth.currentUser.getIdToken());
  const response=await fetch('http://127.0.0.1:5001/demo-wherehouse/us-east1/command',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({data:{schema_version:1,command_id:crypto.randomUUID(),workspace_id:ws,kind:'verify_location',pallet_id:fixture.id,expected_version:fixture.version+1,payload:{location_id:fixture.z}}})});
  assert.equal((await response.json()).result.ok,true);
  await page.context().setOffline(false);
  await expect.poll(()=>page.evaluate(()=>window.__wherehouseBackend.outbox.entries.at(-1)?.status),{timeout:20000}).toBe('conflict');
  assert.equal((await db.doc(`workspaces/${ws}/pallets/${fixture.id}`).get()).get('current_location_id'),fixture.z);
  await page.evaluate(()=>{location.hash='sync';});
  await page.getByText('Someone changed this pallet first',{exact:true}).waitFor();
  console.log('PASS concurrent change stops offline replay for a human decision');

  // Expiry leaves the dashboard and complete CSV export available to the owner.
  const license=db.doc(`licenses/${ws}`),snapshot=await license.get();
  const Timestamp=snapshot.get('expires_at').constructor;
  await license.update({expires_at:Timestamp.fromMillis(Date.now()-1000)});
  await page.getByText('Renewal due · read-only access',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Export records',exact:true}).click();
  await page.getByRole('button',{name:'Prepare complete export',exact:true}).click();
  await page.getByRole('heading',{name:'Export',exact:true}).waitFor();
  assert.ok(await page.getByText('events.csv',{exact:true}).count());
  await license.update({expires_at:snapshot.get('expires_at')});
  await expect(page.getByText('Renewal due · read-only access',{exact:true})).toHaveCount(0);
  assert.equal(await page.evaluate(()=>window.__wherehouseBackend.authUid),uid);
  console.log('PASS read-only renewal banner, complete export and restoration without replacing the warehouse');
}
