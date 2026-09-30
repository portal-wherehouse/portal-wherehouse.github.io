import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { OfflineStore } from '../../src/data/offlineStore';
import { emptyDb } from '../../src/demo/engine';
import { Outbox, memoryStorage, type OutboxEntry } from '../../src/data/outbox';
import { licenseAccess, RENEWAL_GRACE_MS } from '../../src/domain/license';

const entry = (id: string) => ({
  command: {schema_version:1 as const,command_id:id,workspace_id:'warehouse',kind:'move' as const,pallet_id:'pallet',expected_version:1,payload:{location_id:'rack'}},
  actor_id:'crew',workspace_id:'warehouse',pallet_id:'pallet',pallet_code:'P-000001',expected_version:1,
  kind:'move' as const,from_code:'A-01-01',to_code:'A-01-02',created_at:new Date().toISOString(),
});

describe('live offline durability and separation',()=>{
  it('keeps snapshots bounded and separate by project, user and warehouse',async()=>{
    const a=new OfflineStore('demo-wherehouse','alice'),b=new OfflineStore('demo-wherehouse','bob');
    const db=emptyDb();
    for(let i=0;i<800;i++)db.pallets[`p${i}`]={id:`p${i}`} as any;
    const saved={db,at:new Date().toISOString(),verifiedAt:Date.now(),expiresAt:Date.now()+1000,summary:null};
    await a.save('one',saved);await a.saveQueue([{...entry('request'),status:'queued',attempts:0,last_error:null,server_state:null,resolved_at:null}]);
    expect(Object.keys((await a.load('one'))!.db.pallets)).toHaveLength(500);
    expect(await b.load('one')).toBeUndefined();expect(await b.loadQueue()).toEqual([]);
    expect(await a.load('two')).toBeUndefined();expect(await new OfflineStore('other-project','alice').load('one')).toBeUndefined();
    await a.forget('one');expect(await a.load('one')).toBeUndefined();expect(await a.loadQueue()).toHaveLength(1);
  });
  it('never claims queued when device storage fails',async()=>{
    const outbox=new Outbox(memoryStorage(true));await outbox.init();
    await expect(outbox.enqueue(entry('full'))).rejects.toThrow('storage is full');expect(outbox.entries).toEqual([]);
  });
  it('does not replay an explicitly discarded command',async()=>{
    const store=memoryStorage(),outbox=new Outbox(store);await outbox.init();
    await outbox.enqueue(entry('discarded'));await outbox.discard('discarded',new Date().toISOString());
    const reopened=new Outbox(store);await reopened.init();const send=vi.fn();
    await reopened.replay('crew','warehouse',send);expect(send).not.toHaveBeenCalled();
  });
  it('retains the original ID after a lost response and reload',async()=>{
    const store=memoryStorage(),outbox=new Outbox(store);await outbox.init();await outbox.enqueue(entry('same-id'));
    await outbox.replay('crew','warehouse',async()=>{throw Error('connection lost');});
    const reopened=new Outbox(store);await reopened.init();expect(reopened.entries[0].command.command_id).toBe('same-id');expect(reopened.entries[0].status).toBe('queued');
    // A second account cannot replay another person's queued work.
    const send=vi.fn();await reopened.replay('another-user','warehouse',send);expect(send).not.toHaveBeenCalled();
  });
  it('fails closed if a saved queue cannot be read',async()=>{
    const outbox=new Outbox({load:async()=>{throw Error('disk unreadable');},save:async(_entries:OutboxEntry[])=>{}});
    await expect(outbox.init(true)).rejects.toThrow('disk unreadable');
  });
});

describe('renewal grace',()=>{
  it('separates active, grace and revoked access at exact boundaries',()=>{
    const now=1_800_000_000_000;
    expect(licenseAccess(true,now+1,now)).toBe('active');
    expect(licenseAccess(true,now,now)).toBe('read-only');
    expect(licenseAccess(true,now-RENEWAL_GRACE_MS+1,now)).toBe('read-only');
    expect(licenseAccess(true,now-RENEWAL_GRACE_MS,now)).toBe('blocked');
    expect(licenseAccess(false,now+1000,now)).toBe('blocked');
  });
});
