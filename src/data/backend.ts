// The local demo backend: the engine, its persistence, a simulated network, and recovery.
//
// Real (Stage A):  command rules, receipts, versions, history, persistence on this device.
// Simulated:        the network (latency, lost responses, offline), other devices, and sign-in.
// See docs/architecture.md for what Stage B replaces.

import { createStore, del, get, set, setMany, type UseStore } from 'idb-keyval';
import { BRAND } from '../brand';
import { canonicalJson, hashString, uuid } from '../domain/codes';
import { PALLET_STATES, type CommandEnvelope, type CommandKind, type CommandResult, type Pallet } from '../domain/types';
import { Engine, type Db, DB_SCHEMA_VERSION } from '../demo/engine';
import { seedFixture, seedSample, type FixtureName } from '../demo/seed';
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
  /** Set when the data came from a backup file (Data and storage screen). */
  restored_from?: { exported_at: string; restored_at: string };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class Backend {
  sampleMode=false;
  mode: 'demo' | 'firebase' = 'demo';
  authUid: string | null = null;
  loading = false;
  cloudError = '';
  configured = false;
  async logout() {}
  async chooseWorkspace(_id: string) {}
  /** Every spot of the active warehouse. This device already holds them all; the live backend reads past its first page. */
  async loadAllLocations(): Promise<void> {}
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

  static async open(sampleMode=false): Promise<Backend> {
    const b = new Backend();b.sampleMode=sampleMode;
    await b.init();
    return b;
  }

  private async init() {
    try {
      this.store = createStore(this.sampleMode?'wherehouse-sample-v5':'pallet-locator-demo', 'kv');
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
    for(const u of Object.values(this.db.users)){if(u.name==='Demo Supervisor')u.name='Demo Manager';if(u.email.endsWith('@northfield.example'))u.email=u.email.replace('@northfield.example','@sample.example').replace('supervisor@','manager@');}
    for(const ws of Object.values(this.db.workspaces)){if(ws.name === 'Northfield Builders')ws.name='Sample warehouse';if(ws.name === 'Harborline Supply')ws.name='Second sample warehouse';}
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
      // A restore or reset in another tab also wiped the unsent requests and the offline queue, so this
      // tab drops its copies too instead of writing them back and replaying them into the new data.
      this.channel.onmessage = (e: MessageEvent) => void (e.data?.type === 'reset' ? this.reloadAll() : this.reload());
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

  protected bump(broadcast: boolean, type: 'changed' | 'reset' = 'changed') {
    this.version++;
    for (const fn of this.listeners) fn();
    if (broadcast) this.channel?.postMessage({ type });
  }

  /** Read engine: the live store while online, the cached snapshot while offline. */
  get reader(): Engine {
    return this.network === 'offline' && this.cache ? this.cache.engine : this.engine;
  }

  private storageFailure(err: unknown): Error {
    this.storageOk = false;
    this.storageError = err instanceof Error ? err.message : 'Storage write failed';
    return new Error(`Could not save on this device: ${this.storageError}`);
  }

  private async save() {
    if (!this.store) throw this.storageFailure('Local storage is unavailable');
    try {
      await setMany([[DB_KEY, this.db], [META_KEY, this.meta]], this.store);
      this.storageOk = true;
      this.storageError = null;
    } catch (err) { throw this.storageFailure(err); }
  }

  private async savePending() {
    if (!this.store) throw this.storageFailure('Local storage is unavailable');
    try { await set(PENDING_KEY, this.pending, this.store); }
    catch (err) { throw this.storageFailure(err); }
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

  /** After another tab replaced everything: the data, its details, unsent requests and the offline queue. */
  async reloadAll() {
    if (!this.store) return;
    try {
      const [db, meta, pending] = await Promise.all([get<Db>(DB_KEY, this.store), get<Meta>(META_KEY, this.store), get<PendingSend[]>(PENDING_KEY, this.store)]);
      if (db) {
        this.db = db;
        this.engine = new Engine(this.db);
      }
      if (meta) this.meta = meta;
      this.pending = pending ?? [];
      this.cache = null;
      this.network = 'online';
      await this.outbox.init();
      this.lastSync = new Date().toISOString();
      this.bump(false);
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
    try {
      return await this.withLock(async () => {
        if (!this.store) throw new Error('Local storage is unavailable');
        // Execute against a private copy. Publish the new state only after the database transaction
        // commits, so quota/IO failures cannot create an in-memory success or recoverable fake receipt.
        const candidate = structuredClone(this.db);
        const engine = new Engine(candidate);
        const result = engine.execute(actorId, cmd);
        await setMany([[DB_KEY, candidate], [META_KEY, this.meta]], this.store);
        this.db = candidate;
        this.engine = engine;
        this.storageOk = true;
        this.storageError = null;
        this.lastSync = new Date().toISOString();
        return result;
      });
    } catch (err) {
      this.storageFailure(err);
      return this.unsaved(cmd);
    }
  }

  private unsaved(cmd: CommandEnvelope): CommandResult {
    return { ok: false, command_id: cmd.command_id, kind: cmd.kind, code: 'TEMPORARY_FAILURE',
      correlation_id: '-', message: 'Device storage failed. Nothing was saved. Free space or enable storage, then try again.' };
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
    try { await this.savePending(); }
    catch {
      this.pending = this.pending.filter(p => p.command.command_id !== cmd.command_id);
      this.bump(false);
      return { status: 'result', result: this.unsaved(cmd) };
    }
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
    try { await this.savePending(); }
    catch { /* The command receipt is durable; a stale pending entry replays it safely. */ }
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
    this.db = this.sampleMode&&fixture==='tiny'?seedSample():seedFixture(fixture);
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
    this.bump(true, 'reset');
  }

  /** Estimated bytes used by the local database (photos dominate). */
  approxSize(): number {
    try {
      return JSON.stringify(this.db).length;
    } catch {
      return 0;
    }
  }

  // ---------------------------------------------------------------- backup and restore

  /** A whole-device backup: every table this browser holds, as plain JSON, with a checksum. */
  exportSnapshot(): Snapshot {
    const db = structuredClone(this.db);
    return {
      format: SNAPSHOT_FORMAT,
      snapshot_version: SNAPSHOT_VERSION,
      db_schema: db.schema,
      app: BRAND.name,
      exported_at: new Date().toISOString(),
      fixture: this.meta.fixture,
      source_created_at: this.meta.created_at,
      counts: snapshotCounts(db),
      checksum: dbChecksum(db),
      db,
    };
  }

  /**
   * Replace everything on this device with a validated backup. Like a reset, it clears unsent
   * requests and the offline queue, because they were made against the data being replaced.
   * The database, meta, pending list and queue are written in one storage transaction first,
   * so a failed write changes nothing.
   */
  async importSnapshot(input: unknown): Promise<SnapshotImport> {
    const check = checkSnapshot(input);
    if (!check.ok) return check;
    return this.withLock(async () => {
      const now = new Date().toISOString();
      const db = structuredClone(check.snapshot.db);
      const meta: Meta = {
        fixture: check.snapshot.fixture === 'scenario' ? 'scenario' : 'tiny',
        created_at: check.snapshot.source_created_at || now,
        restored_from: { exported_at: check.snapshot.exported_at, restored_at: now },
      };
      let persisted = false;
      if (this.store) {
        try {
          await setMany([[DB_KEY, db], [META_KEY, meta], [PENDING_KEY, []], [OUTBOX_KEY, []]], this.store);
          persisted = true;
        } catch (err) {
          const why = err instanceof Error ? err.message : 'storage write failed';
          return { ok: false as const, problems: [`This browser could not save the backup (${why}). Nothing was changed.`] };
        }
      }
      this.db = db;
      this.meta = meta;
      this.engine = new Engine(this.db);
      this.pending = [];
      this.cache = null;
      this.network = 'online';
      if (this.outbox) await this.outbox.clearAll();
      this.lastSync = now;
      this.bump(true, 'reset');
      return { ok: true as const, counts: check.counts, persisted, warnings: check.warnings };
    });
  }
}

// ---------------------------------------------------------------- snapshot format

/** Stable file identifier. Deliberately not the brand name, so a rename never breaks old backups. */
export const SNAPSHOT_FORMAT = 'wherehouse.snapshot';
export const SNAPSHOT_VERSION = 1;

export interface SnapshotCounts {
  workspaces: number;
  users: number;
  pallets: number;
  events: number;
  jobs: number;
  locations: number;
  photos: number;
  receipts: number;
}

export interface Snapshot {
  format: typeof SNAPSHOT_FORMAT;
  snapshot_version: typeof SNAPSHOT_VERSION;
  db_schema: number;
  /** For people reading the file; not checked. */
  app: string;
  exported_at: string;
  fixture: FixtureName;
  source_created_at: string;
  counts: SnapshotCounts;
  /** Hash of the canonical database JSON, so a damaged or edited file is caught before restore. */
  checksum: string;
  db: Db;
}

export type SnapshotCheck =
  | { ok: true; snapshot: Snapshot; counts: SnapshotCounts; workspaces: string[]; warnings: string[] }
  | { ok: false; problems: string[] };

export type SnapshotImport = { ok: true; counts: SnapshotCounts; persisted: boolean; warnings: string[] } | { ok: false; problems: string[] };

export function snapshotCounts(db: Db): SnapshotCounts {
  return {
    workspaces: Object.keys(db.workspaces).length,
    users: Object.keys(db.users).length,
    pallets: Object.keys(db.pallets).length,
    events: Object.values(db.events).reduce((n, l) => n + l.length, 0),
    jobs: Object.keys(db.jobs).length,
    locations: Object.keys(db.locations).length,
    photos: Object.values(db.attachments).filter((a) => a.state === 'ready').length,
    receipts: Object.keys(db.receipts).length,
  };
}

export function dbChecksum(db: Db): string {
  return hashString(canonicalJson(db));
}

const RECORD_TABLES = ['users', 'workspaces', 'warehouses', 'locations', 'jobs', 'pallets', 'events', 'receipts', 'labels', 'attachments', 'imports', 'counters'] as const;
const LIST_TABLES = ['memberships', 'audit', 'lineage'] as const;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
/** A record of the table by its own key only: never an inherited name like "constructor". */
const own = <T,>(table: Record<string, T>, id: unknown): T | undefined => (isStr(id) && Object.hasOwn(table, id) ? table[id] : undefined);
const ROLES = ['OWNER', 'SUPERVISOR', 'OPERATOR', 'VIEWER'];

/** validateSnapshot that never throws: anything it did not foresee is reported as a damaged file. */
export function checkSnapshot(input: unknown): SnapshotCheck {
  try {
    return validateSnapshot(input);
  } catch {
    return { ok: false, problems: ['This backup is damaged: part of it is not in the shape a backup should have. Nothing was changed.'] };
  }
}

/**
 * Check a parsed backup file before anything is replaced: the format and versions, every table's
 * shape, ids that match their keys, references between tables, history that ends at each pallet's
 * version, at least one active owner per company, and the checksum. Returns readable problems.
 */
export function validateSnapshot(input: unknown): SnapshotCheck {
  const problems: string[] = [];
  const warnings: string[] = [];
  const fail = (...p: string[]): SnapshotCheck => ({ ok: false, problems: p });
  if (!isObj(input)) return fail('This is not a backup file. Expected a JSON object.');
  if (input.format !== SNAPSHOT_FORMAT) return fail(`This is not a ${BRAND.name} backup file (its format is ${input.format === undefined ? 'missing' : JSON.stringify(input.format)}).`);
  if (input.snapshot_version !== SNAPSHOT_VERSION) return fail(`This backup uses file version ${String(input.snapshot_version)}. This app reads version ${SNAPSHOT_VERSION}.`);
  const db = input.db;
  if (!isObj(db)) return fail('The backup has no database section.');
  if (input.db_schema !== DB_SCHEMA_VERSION || db.schema !== DB_SCHEMA_VERSION) {
    return fail(`This backup was made with data schema ${String(db.schema ?? input.db_schema)}. This app uses schema ${DB_SCHEMA_VERSION}, and there is no automatic upgrade between them yet.`);
  }
  for (const t of RECORD_TABLES) if (!isObj(db[t])) problems.push(`The ${t} table is missing or is not a set of records.`);
  for (const t of LIST_TABLES) if (!Array.isArray(db[t])) problems.push(`The ${t} table is missing or is not a list.`);
  // Orders, pick batches and packages came later: an older backup has none, which is fine.
  for (const t of ['orders', 'batches', 'packages']) if (db[t] !== undefined && !isObj(db[t])) problems.push(`The ${t} table is not a set of records.`);
  if (!(db.seed === null || typeof db.seed === 'number')) problems.push('The seed value is not a number.');
  if (problems.length) return { ok: false, problems };
  const d = db as unknown as Db;

  const keyed = (table: 'users' | 'workspaces' | 'warehouses' | 'locations' | 'jobs' | 'pallets' | 'attachments' | 'imports') => {
    for (const [k, v] of Object.entries(d[table])) {
      if (!isObj(v) || v.id !== k) problems.push(`A record in ${table} (${k.slice(0, 12)}) does not match its key.`);
    }
  };
  (['users', 'workspaces', 'warehouses', 'locations', 'jobs', 'pallets', 'attachments', 'imports'] as const).forEach(keyed);
  for (const [k, v] of Object.entries(d.labels)) if (!isObj(v) || v.token !== k) problems.push(`Label ${k.slice(0, 12)} does not match its key.`);
  // A company's pallet counter is keyed by its id; its order, batch and package counters by `id:O`, `id:B` and `id:K`.
  for (const [k, v] of Object.entries(d.counters)) if (typeof v !== 'number' || !own(d.workspaces, k.replace(/:[OBKD]$/, ''))) problems.push(`Counter ${k.slice(0, 12)} is not a number for a known company.`);
  if (problems.length) return { ok: false, problems: cap(problems) };

  // Every entry of the lists is a record of the right shape, before anything reads its fields.
  d.memberships.forEach((m, i) => {
    if (!isObj(m) || !isStr(m.workspace_id) || !isStr(m.user_id) || !ROLES.includes(m.role as string) || typeof m.active !== 'boolean') problems.push(`Membership ${i + 1} is not a complete record.`);
  });
  d.audit.forEach((a, i) => {
    if (!isObj(a) || !isStr(a.id) || !isStr(a.workspace_id) || !isStr(a.actor_id) || !isStr(a.action) || !isStr(a.accepted_at)) problems.push(`Admin log entry ${i + 1} is not a complete record.`);
  });
  d.lineage.forEach((l, i) => {
    if (!isObj(l) || !isStr(l.workspace_id) || !isStr(l.parent_id) || !isStr(l.child_id)) problems.push(`Split record ${i + 1} is not a complete record.`);
  });
  for (const [k, r] of Object.entries(d.receipts)) if (!isObj(r) || k !== `${r.workspace_id}:${r.command_id}` || !isObj(r.result)) problems.push(`Request receipt ${k.slice(0, 12)} is not a complete record.`);
  for (const [k, ev] of Object.entries(d.events)) if (!Array.isArray(ev) || ev.some((e) => !isObj(e))) problems.push(`The history for ${k.slice(0, 12)} is not a list of entries.`);
  if (problems.length) return { ok: false, problems: cap(problems) };

  // References point at records in the file, and at records of the same company.
  const ws = (id: unknown) => !!own(d.workspaces, id);
  for (const m of d.memberships) {
    if (!ws(m.workspace_id) || !own(d.users, m.user_id)) problems.push('A membership points at a company or person that is not in the file.');
  }
  for (const w of Object.values(d.warehouses)) if (!ws(w.workspace_id)) problems.push(`Warehouse ${w.code} belongs to a company that is not in the file.`);
  for (const l of Object.values(d.locations)) {
    const wh = own(d.warehouses, l.warehouse_id);
    if (!ws(l.workspace_id) || !wh) problems.push(`Location ${l.code} points at a missing company or warehouse.`);
    else if (wh.workspace_id !== l.workspace_id) problems.push(`Location ${l.code} points at another company's warehouse.`);
  }
  for (const j of Object.values(d.jobs)) if (!ws(j.workspace_id)) problems.push(`Job ${j.code} belongs to a company that is not in the file.`);
  for (const p of Object.values(d.pallets)) {
    const code = typeof p.code === 'string' ? p.code : p.id;
    if (!ws(p.workspace_id)) problems.push(`Pallet ${code} belongs to a company that is not in the file.`);
    const job = own(d.jobs, p.job_id);
    if (p.job_id !== '' && !job) problems.push(`Pallet ${code} points at a job that is not in the file.`);
    else if (job && job.workspace_id !== p.workspace_id) problems.push(`Pallet ${code} points at another company's job.`);
    for (const id of [p.current_location_id, p.last_confirmed_location_id]) {
      if (id === null || id === undefined) continue;
      const loc = own(d.locations, id);
      if (!loc) problems.push(`Pallet ${code} points at a location that is not in the file.`);
      else if (loc.workspace_id !== p.workspace_id) problems.push(`Pallet ${code} points at another company's location.`);
    }
    if (!PALLET_STATES.includes(p.state)) problems.push(`Pallet ${code} has an unknown state.`);
    if (typeof p.version !== 'number') problems.push(`Pallet ${code} has no version number.`);
    const ev = own(d.events, p.id);
    if (!Array.isArray(ev) || ev.length === 0) problems.push(`Pallet ${code} has no history.`);
    // A transferred pallet keeps its history: earlier entries belong to the warehouse where they happened.
    else if (ev.some((e, i) => e.pallet_id !== p.id || !ws(e.workspace_id) || (i > 0 && e.revision !== ev[i - 1].revision + 1)) || ev[ev.length - 1].revision !== p.version) {
      problems.push(`Pallet ${code} has history that does not line up with its version.`);
    }
  }
  for (const k of Object.keys(d.events)) if (!own(d.pallets, k)) problems.push('History exists for a pallet that is not in the file.');
  for (const a of Object.values(d.attachments)) {
    const p = own(d.pallets, a.pallet_id);
    if (!p || p.workspace_id !== a.workspace_id) problems.push('A photo belongs to a pallet that is not in the file, or to another company.');
  }
  for (const t of Object.values(d.labels)) {
    const target = t.kind === 'P' ? own(d.pallets, t.target_id) : t.kind === 'L' ? own(d.locations, t.target_id) : undefined;
    if (!target || target.workspace_id !== t.workspace_id) problems.push(`Label ${t.token.slice(0, 12)} points at a record that is not in the file, or at another company's.`);
  }
  for (const l of d.lineage) {
    const parent = own(d.pallets, l.parent_id);
    const child = own(d.pallets, l.child_id);
    // Either side of a split may since have moved to another warehouse on a transfer.
    if (!parent || !child || !ws(l.workspace_id)) problems.push('A split record points at pallets that are not in the file, or at another company.');
  }
  for (const a of d.audit) if (!ws(a.workspace_id)) problems.push('An admin log entry belongs to a company that is not in the file.');
  const names = Object.values(d.workspaces).map((w) => (typeof w.name === 'string' ? w.name : w.id));
  if (names.length === 0) problems.push('The backup has no companies in it.');
  for (const w of Object.values(d.workspaces)) {
    if (!d.memberships.some((m) => m.workspace_id === w.id && m.role === 'OWNER' && m.active)) problems.push(`${w.name} has no active owner.`);
  }
  if (problems.length) return { ok: false, problems: cap(problems) };

  if (typeof input.checksum === 'string') {
    if (input.checksum !== dbChecksum(d)) return fail('The file was changed or damaged after it was made: its checksum does not match. Restore from an unedited backup.');
  } else warnings.push('This file has no checksum, so edits to it cannot be detected.');

  const snapshot: Snapshot = {
    format: SNAPSHOT_FORMAT,
    snapshot_version: SNAPSHOT_VERSION,
    db_schema: DB_SCHEMA_VERSION,
    app: typeof input.app === 'string' ? input.app : BRAND.name,
    exported_at: typeof input.exported_at === 'string' ? input.exported_at : '',
    fixture: input.fixture === 'scenario' ? 'scenario' : 'tiny',
    source_created_at: typeof input.source_created_at === 'string' ? input.source_created_at : '',
    counts: snapshotCounts(d),
    checksum: typeof input.checksum === 'string' ? input.checksum : dbChecksum(d),
    db: d,
  };
  return { ok: true, snapshot, counts: snapshot.counts, workspaces: names, warnings };
}

function cap(problems: string[], max = 8): string[] {
  const unique = [...new Set(problems)];
  return unique.length > max ? [...unique.slice(0, max), `And ${unique.length - max} more problems.`] : unique;
}
