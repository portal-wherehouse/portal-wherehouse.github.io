// Backup and restore of the local store: a snapshot survives a JSON round trip, restores exactly
// what was saved (in memory and in IndexedDB), and a damaged or foreign file changes nothing.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { Backend, SNAPSHOT_FORMAT, validateSnapshot, type Snapshot } from '../../src/data/backend';
import { DB_SCHEMA_VERSION } from '../../src/demo/engine';
import { uuid } from '../../src/domain/codes';
import type { CommandEnvelope } from '../../src/domain/types';

const OWNER = 'user-owner';

beforeEach(() => {
  // A fresh, empty IndexedDB for every test.
  globalThis.indexedDB = new IDBFactory();
});

async function open() {
  const b = await Backend.open();
  b.faults.latencyMs = 0;
  return b;
}

function wsOf(b: Backend) {
  return Object.values(b.db.workspaces).find((w) => w.name === 'Sample warehouse')!.id;
}

function viaFile(s: Snapshot): unknown {
  return JSON.parse(JSON.stringify(s));
}

async function receiveOne(b: Backend) {
  const ws = wsOf(b);
  const job = Object.values(b.db.jobs).find((j) => j.workspace_id === ws && j.status === 'OPEN')!;
  const cmd: CommandEnvelope = { schema_version: 1, command_id: uuid(), workspace_id: ws, kind: 'receive', payload: { job_id: job.id, description: 'Snapshot test pallet' } };
  const out = await b.send(OWNER, cmd);
  expect(out.status).toBe('result');
  return cmd;
}

describe('snapshot export', () => {
  it('is versioned, counted, and valid after a JSON round trip', async () => {
    const b = await open();
    expect(b.storageOk).toBe(true);
    const s = b.exportSnapshot();
    expect(s.format).toBe(SNAPSHOT_FORMAT);
    expect(s.db_schema).toBe(DB_SCHEMA_VERSION);
    expect(s.counts.pallets).toBe(Object.keys(b.db.pallets).length);
    expect(s.counts.workspaces).toBe(1);
    const check = validateSnapshot(viaFile(s));
    expect(check.ok).toBe(true);
    if (check.ok) {
      expect(check.workspaces).toEqual(['Sample warehouse']);
      expect(check.warnings).toEqual([]);
    }
  });

  it('is a copy: later changes do not leak into an exported snapshot', async () => {
    const b = await open();
    const s = b.exportSnapshot();
    const before = s.counts.pallets;
    await receiveOne(b);
    expect(Object.keys(s.db.pallets).length).toBe(before);
    expect(Object.keys(b.db.pallets).length).toBe(before + 1);
  });
});

describe('snapshot import', () => {
  it('restores the saved state, persists it, clears queued work and notifies subscribers', async () => {
    const b = await open();
    const snap = viaFile(b.exportSnapshot());
    const pallets = Object.keys(b.db.pallets).length;
    await receiveOne(b);
    expect(Object.keys(b.db.pallets).length).toBe(pallets + 1);

    let calls = 0;
    b.subscribe(() => calls++);
    const res = await b.importSnapshot(snap);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.persisted).toBe(true);
    expect(calls).toBeGreaterThan(0);
    expect(Object.keys(b.db.pallets).length).toBe(pallets);
    expect(b.engine.db).toBe(b.db);
    expect(b.pending).toEqual([]);
    expect(b.outbox.entries).toEqual([]);
    expect(b.meta.restored_from?.restored_at).toBeTruthy();

    // A fresh start (a reload) reads the restored data from IndexedDB.
    const again = await open();
    expect(Object.keys(again.db.pallets).length).toBe(pallets);
    expect(again.meta.restored_from).toBeTruthy();
  });

  it('keeps the engine working after a restore, including receipts from before the backup', async () => {
    const b = await open();
    const earlier = await receiveOne(b);
    const snap = viaFile(b.exportSnapshot());
    await b.importSnapshot(snap);
    // The same command ID replays its saved result rather than receiving a second pallet.
    const replay = await b.send(OWNER, earlier);
    expect(replay.status === 'result' && replay.result.ok && replay.result.replayed).toBe(true);
    const count = Object.keys(b.db.pallets).length;
    await receiveOne(b);
    expect(Object.keys(b.db.pallets).length).toBe(count + 1);
  });

  it('round-trips the busy warehouse with both companies', async () => {
    const b = await open();
    await b.reset('scenario');
    const snap = viaFile(b.exportSnapshot());
    await b.reset('tiny');
    const res = await b.importSnapshot(snap);
    expect(res.ok).toBe(true);
    expect(b.meta.fixture).toBe('scenario');
    expect(Object.keys(b.db.workspaces).length).toBe(2);
  });
});

describe('snapshot validation', () => {
  const bad = async (mutate: (s: Record<string, unknown> & { db: Record<string, unknown> }) => unknown, expected: RegExp) => {
    const b = await open();
    const s = viaFile(b.exportSnapshot()) as Record<string, unknown> & { db: Record<string, unknown> };
    const input = mutate(s) ?? s;
    const pallets = Object.keys(b.db.pallets).length;
    const res = await b.importSnapshot(input);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.problems.join(' ')).toMatch(expected);
    // Nothing changed.
    expect(Object.keys(b.db.pallets).length).toBe(pallets);
  };

  it('refuses things that are not a backup', async () => {
    await bad(() => 'hello', /not a backup file/);
    await bad(() => [1, 2, 3], /not a backup file/);
    await bad((s) => ({ ...s, format: 'something-else' }), /format/);
  });

  it('refuses other file and schema versions', async () => {
    await bad((s) => ({ ...s, snapshot_version: 2 }), /file version 2/);
    await bad((s) => ({ ...s, db_schema: 1, db: { ...s.db, schema: 1 } }), /schema 1/);
  });

  it('refuses a missing table or a broken reference', async () => {
    await bad((s) => ({ ...s, db: { ...s.db, pallets: undefined } }), /pallets table/);
    await bad((s) => {
      const pallets = s.db.pallets as Record<string, { job_id: string }>;
      const first = Object.values(pallets)[0];
      first.job_id = 'no-such-job';
      return s;
    }, /points at a job/);
  });

  it('refuses a file edited after it was made', async () => {
    await bad((s) => {
      const pallets = s.db.pallets as Record<string, { description: string }>;
      Object.values(pallets)[0].description = 'Edited by hand';
      return s;
    }, /checksum/);
  });

  it('accepts a file without a checksum, with a warning', async () => {
    const b = await open();
    const s = viaFile(b.exportSnapshot()) as Record<string, unknown>;
    delete s.checksum;
    const check = validateSnapshot(s);
    expect(check.ok).toBe(true);
    if (check.ok) expect(check.warnings.join(' ')).toMatch(/no checksum/);
  });
});
