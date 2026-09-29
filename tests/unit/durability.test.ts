import 'fake-indexeddb/auto';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { Backend } from '../../src/data/backend';
import { uuid } from '../../src/domain/codes';
import type { CommandEnvelope } from '../../src/domain/types';

beforeEach(() => { globalThis.indexedDB = new IDBFactory(); });
afterEach(() => vi.restoreAllMocks());
async function setup() {
  const backend = await Backend.open();
  backend.faults.latencyMs = 0;
  const job = Object.values(backend.db.jobs).find(j => j.status === 'OPEN')!;
  const command: CommandEnvelope = { schema_version: 1, command_id: uuid(), workspace_id: job.workspace_id,
    kind: 'receive', payload: { job_id: job.id, description: 'Durable receipt' } };
  return { backend, command };
}
describe('durable command acknowledgements', () => {
  it('rolls back all visible state when the database commit fails; retry creates one pallet', async () => {
    const { backend, command } = await setup();
    const before = structuredClone(backend.db);
    const put = IDBObjectStore.prototype.put;
    let fail = true;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value, key) {
      if (key === 'db' && fail) { fail = false; throw new DOMException('Storage is full', 'QuotaExceededError'); }
      return put.call(this, value, key);
    });
    const failed = await backend.send('user-operator', command);
    expect(failed.status === 'result' && !failed.result.ok && failed.result.code).toBe('TEMPORARY_FAILURE');
    expect(backend.db).toEqual(before);
    expect(backend.engine.db).toBe(backend.db);
    expect(backend.storageOk).toBe(false);
    const retry = await backend.send('user-operator', command);
    expect(retry.status === 'result' && retry.result.ok).toBe(true);
    expect(Object.keys(backend.db.pallets)).toHaveLength(Object.keys(before.pallets).length + 1);
    const reopened = await Backend.open();
    expect(reopened.db).toEqual(backend.db);
  });
  it('does not execute when the request cannot be persisted', async () => {
    const { backend, command } = await setup();
    const before = structuredClone(backend.db);
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(() => { throw new Error('Request storage failed'); });
    const failed = await backend.send('user-operator', command);
    expect(failed.status === 'result' && !failed.result.ok).toBe(true);
    expect(backend.db).toEqual(before);
    expect(backend.pending).toHaveLength(0);
  });
  it('retains a committed success when pending-request cleanup fails; replay does not duplicate it', async () => {
    const { backend, command } = await setup();
    const original = IDBObjectStore.prototype.put;
    let writes = 0;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value, key) {
      if (key === 'pending' && ++writes === 2) throw new Error('Cleanup failed');
      return original.call(this, value, key);
    });
    const result = await backend.send('user-operator', command);
    expect(result.status === 'result' && result.result.ok).toBe(true);
    const count = Object.keys(backend.db.pallets).length;
    const reopened = await Backend.open(); reopened.faults.latencyMs = 0;
    const recovered = await reopened.recover('user-operator', command.workspace_id, command.command_id);
    expect(recovered.status === 'result' && recovered.result.ok).toBe(true);
    expect(Object.keys(reopened.db.pallets)).toHaveLength(count);
  });
});
