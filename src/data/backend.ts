// The local demo backend: the engine, its persistence, a simulated network, and recovery.
//
// Real (Stage A):  command rules, receipts, versions, history, persistence on this device.
// Simulated:        the network (latency, lost responses, offline), other devices, and sign-in.
// See docs/architecture.md for what Stage B replaces.

import { createStore, del, get, set, type UseStore } from 'idb-keyval';
import { uuid } from '../domain/codes';
import type { CommandEnvelope, CommandKind, CommandResult, Pallet } from '../domain/types';
import { Engine, type Db, DB_SCHEMA_VERSION } from '../demo/engine';
import { seedFixture, type FixtureName } from '../demo/seed';
import { Outbox, type OutboxEntry, type OutboxStorage } from './outbox';

export type NetworkMode = 'online' | 'offline';

export interface DemoFaults {
  /** The next command commits on the server but its response never arrives. */
  loseNextResponse: boolean;
  /** The next command fails before reaching the server. */
  failNextCommand: boolean;
  /** Simulated round-trip time. */
  latencyMs: number;
}

export type Outcome =
  | { status: 'result'; result: CommandResult }
  | { status: 'unknown'; command_id: string; message: string }
  | { status: 'queued'; entry: OutboxEntry }
  | { status: 'offline'; message: string };

export interface PendingSend {
  actor_id: string;
  command: CommandEnvelope;
  sent_at: string;
}

const DB_KEY = 'db';
const META_KEY = 'meta';
const PENDING_KEY = 'pending';
const OUTBOX_KEY = 'outbox';

interface Meta {
  fixture: FixtureName;
  created_at: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class Backend {
  db!: Db;
  engine!: Engine;
  meta!: Meta;
  storageOk = true;
  storageError: string | null = null;
  network: NetworkMode = 'online';
  /** Snapshot of what this device had cached when it went offline. */
  cache: { db: Db; engine: Engine; at: string } | null = null;
  faults: DemoFaults = { loseNextResponse: false, failNextCommand: false, latencyMs: 220 };
  pending: PendingSend[] = [];
  outbox!: Outbox;
  version = 0;
  lastSync = new Date().toISOString();
  private listeners = new Set<() => void>();
  private store: UseStore | null = null;
  private channel: BroadcastChannel | null = null;

  static async open(): Promise<Backend> {
    const b = new Backend();
    await b.init();
    return b;
  }

  private async init() {
    try {
      this.store = createStore('pallet-locator-demo', 'kv');
      const [db, meta, pending] = await Promise.all([get<Db>(DB_KEY, this.store), get<Meta>(META_KEY, this.store), get<PendingSend[]>(PENDING_KEY, this.store)]);
      if (db && meta && db.schema === DB_SCHEMA_VERSION) {
        this.db = db;
        this.meta = meta;
        this.pending = pending ?? [];
      } else {
        await this.seed('tiny');
      }
    } catch (err) {
      this.storageOk = false;
      this.storageError = err instanceof Error ? err.message : 'Storage unavailable';
      this.store = null;
      this.db = seedFixture('tiny');
      this.meta = { fixture: 'tiny', created_at: new Date().toISOString() };
    }
    this.engine = new Engine(this.db);
    const storage: OutboxStorage = {
      load: async () => (this.store ? ((await get<OutboxEntry[]>(OUTBOX_KEY, this.store)) ?? []) : []),
      save: async (entries) => {
        if (!this.store) throw new Error('Device storage is unavailable, so nothing can be queued.');
        await set(OUTBOX_KEY, entries, this.store);
      },
    };
    this.outbox = new Outbox(storage);
    await this.outbox.init();
    this.outbox.subscribe(() => this.bump(false));
    try {
      this.channel = new BroadcastChannel('pallet-locator-demo');
      this.channel.onmessage = () => void this.reload();
    } catch {
      this.channel = null;
    }
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private bump(broadcast: boolean) {
    this.version++;
    for (const fn of this.listeners) fn();
    if (broadcast) this.channel?.postMessage({ type: 'changed' });
  }

  /** Read engine: the live store while online, the cached snapshot while offline. */
  get reader(): Engine {
    return this.network === 'offline' && this.cache ? this.cache.engine : this.engine;
  }

  private async save() {
    if (!this.store) return;
    try {
      await Promise.all([set(DB_KEY, this.db, this.store), set(META_KEY, this.meta, this.store)]);
    } catch (err) {
      this.storageOk = false;
      this.storageError = err instanceof Error ? err.message : 'Storage write failed';
    }
  }

  private async savePending() {
    if (!this.store) return;
    try {
      await set(PENDING_KEY, this.pending, this.store);
    } catch {
      /* recoverable on the next save */
    }
  }

  async reload() {
    if (!this.store) return;
    try {
      const db = await get<Db>(DB_KEY, this.store);
      if (db) {
        this.db = db;
        this.engine = new Engine(this.db);
        this.lastSync = new Date().toISOString();
        this.bump(false);
      }
    } catch {
      /* keep what we have */
    }
  }

  /** Serialize writes across tabs, and see other tabs' writes before running a command. */
  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    const locks = typeof navigator !== 'undefined' ? (navigator as Navigator & { locks?: LockManager }).locks : undefined;
    if (!locks || !this.store) return fn();
    let entered = false;
    try {
      return (await locks.request('pallet-locator-demo-db', async () => {
        entered = true;
        return this.lockedRun(fn);
      })) as T;
    } catch (err) {
      // Some embedded frames refuse the Web Locks API; a single tab does not need it.
      if (entered) throw err;
      return fn();
    }
  }

  private async lockedRun<T>(fn: () => Promise<T>): Promise<T> {
    const db = await get<Db>(DB_KEY, this.store!);
    if (db) {
      this.db = db;
      this.engine = new Engine(this.db);
    }
    return fn();
  }

  /** The server side of a command: commit and persist. */
  private async serverExecute(actorId: string, cmd: CommandEnvelope): Promise<CommandResult> {
    return this.withLock(async () => {
      const r = this.engine.execute(actorId, cmd);
      await this.save();
      this.lastSync = new Date().toISOString();
      return r;
    });
  }

  /**
   * Send a command over the simulated network. The command is persisted locally before sending,
   * so a lost response can be recovered with the same command ID after a reload.
   */
  async send(actorId: string, cmd: CommandEnvelope): Promise<Outcome> {
    if (this.network === 'offline') {
      return { status: 'offline', message: 'Offline: changes are unavailable until the connection returns.' };
    }
    this.pending = [...this.pending.filter((p) => p.command.command_id !== cmd.command_id), { actor_id: actorId, command: cmd, sent_at: new Date().toISOString() }];
    await this.savePending();
    await sleep(this.faults.latencyMs);
    if (this.faults.failNextCommand) {
      this.faults.failNextCommand = false;
      this.bump(false);
      return { status: 'unknown', command_id: cmd.command_id, message: 'The request did not reach the server.' };
    }
    const result = await this.serverExecute(actorId, cmd);
    this.bump(true);
    if (this.faults.loseNextResponse) {
      this.faults.loseNextResponse = false;
      this.bump(false);
      return { status: 'unknown', command_id: cmd.command_id, message: 'The response was lost on the way back.' };
    }
    await this.settle(cmd.command_id);
    return { status: 'result', result };
  }

  private async settle(commandId: string) {
    this.pending = this.pending.filter((p) => p.command.command_id !== commandId);
    await this.savePending();
    this.bump(false);
  }

  /** Recover a command with an unknown result: read its receipt, or resend the exact same command. */
  async recover(actorId: string, workspaceId: string, commandId: string): Promise<Outcome> {
    if (this.network === 'offline') return { status: 'offline', message: 'Reconnect to check this result.' };
    await sleep(this.faults.latencyMs);
    const found = this.engine.recover(actorId, workspaceId, commandId);
    if (found.status === 'found') {
      await this.settle(commandId);
      return { status: 'result', result: found.result };
    }
    const pend = this.pending.find((p) => p.command.command_id === commandId && p.actor_id === actorId);
    if (!pend) return { status: 'unknown', command_id: commandId, message: 'The server has no record of this request, and it is no longer saved on this device.' };
    return this.send(actorId, pend.command);
  }

  async discardPending(commandId: string) {
    await this.settle(commandId);
  }

  pendingFor(actorId: string, workspaceId: string): PendingSend[] {
    return this.pending.filter((p) => p.actor_id === actorId && p.command.workspace_id === workspaceId);
  }

  // ---------------------------------------------------------------- offline (Stage C simulation)

  setNetwork(mode: NetworkMode) {
    if (mode === this.network) return;
    if (mode === 'offline') {
      const snapshot = structuredClone(this.db);
      this.cache = { db: snapshot, engine: new Engine(snapshot), at: new Date().toISOString() };
    } else {
      this.cache = null;
    }
    this.network = mode;
    this.bump(false);
  }

  async queueOffline(entry: Omit<OutboxEntry, 'status' | 'attempts' | 'last_error' | 'server_state' | 'resolved_at'>): Promise<Outcome> {
    const saved = await this.outbox.enqueue(entry);
    return { status: 'queued', entry: saved };
  }

  async sync(actorId: string, workspaceId: string) {
    if (this.network === 'offline') return null;
    const stats = await this.outbox.replay(actorId, workspaceId, async (cmd) => {
      await sleep(this.faults.latencyMs / 2);
      const r = await this.serverExecute(actorId, cmd);
      this.bump(true);
      return r;
    });
    return stats;
  }

  // ---------------------------------------------------------------- demo tools

  setFaults(patch: Partial<DemoFaults>) {
    this.faults = { ...this.faults, ...patch };
    this.bump(false);
  }

  /** Another phone changes a pallet directly on the server (it bypasses this device's cache). */
  async simulateOtherDevice(actorId: string, workspaceId: string, kind: CommandKind, pallet: Pallet, payload: Record<string, unknown>): Promise<CommandResult> {
    const cmd: CommandEnvelope = { schema_version: 1, command_id: uuid(), workspace_id: workspaceId, kind, pallet_id: pallet.id, expected_version: this.db.pallets[pallet.id].version, payload };
    const r = await this.serverExecute(actorId, cmd);
    this.bump(true);
    return r;
  }

  async adminAsOther(actorId: string, cmd: CommandEnvelope): Promise<CommandResult> {
    const r = await this.serverExecute(actorId, cmd);
    this.bump(true);
    return r;
  }

  async seed(fixture: FixtureName) {
    this.db = seedFixture(fixture);
    this.meta = { fixture, created_at: new Date().toISOString() };
    this.engine = new Engine(this.db);
    this.pending = [];
    this.cache = null;
    this.network = 'online';
    if (this.store) {
      await this.save();
      await this.savePending();
      try {
        await del(OUTBOX_KEY, this.store);
      } catch {
        /* ignore */
      }
    }
  }

  /** Reset touches only this demo's own storage, never anything else. */
  async reset(fixture: FixtureName) {
    await this.seed(fixture);
    if (this.outbox) await this.outbox.clearAll();
    this.bump(true);
  }

  /** Estimated bytes used by the local database (photos dominate). */
  approxSize(): number {
    try {
      return JSON.stringify(this.db).length;
    } catch {
      return 0;
    }
  }
}
