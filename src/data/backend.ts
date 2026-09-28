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
  /** Set when the data came from a backup file (Data and storage screen). */
  restored_from?: { exported_at: string; restored_at: string };
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
    const check = validateSnapshot(input);
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
      this.bump(true);
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
  for (const [k, v] of Object.entries(d.counters)) if (typeof v !== 'number' || !d.workspaces[k]) problems.push(`Counter ${k.slice(0, 12)} is not a number for a known company.`);
  if (problems.length) return { ok: false, problems: cap(problems) };

  const ws = (id: unknown) => typeof id === 'string' && !!d.workspaces[id];
  for (const m of d.memberships) {
    if (!isObj(m) || !ws(m.workspace_id) || !d.users[m.user_id]) problems.push('A membership points at a company or person that is not in the file.');
  }
  for (const w of Object.values(d.warehouses)) if (!ws(w.workspace_id)) problems.push(`Warehouse ${w.code} belongs to a company that is not in the file.`);
  for (const l of Object.values(d.locations)) if (!ws(l.workspace_id) || !d.warehouses[l.warehouse_id]) problems.push(`Location ${l.code} points at a missing company or warehouse.`);
  for (const j of Object.values(d.jobs)) if (!ws(j.workspace_id)) problems.push(`Job ${j.code} belongs to a company that is not in the file.`);
  for (const p of Object.values(d.pallets)) {
    const code = typeof p.code === 'string' ? p.code : p.id;
    if (!ws(p.workspace_id)) problems.push(`Pallet ${code} belongs to a company that is not in the file.`);
    if (!d.jobs[p.job_id]) problems.push(`Pallet ${code} points at a job that is not in the file.`);
    if (p.current_location_id !== null && !d.locations[p.current_location_id]) problems.push(`Pallet ${code} points at a location that is not in the file.`);
    if (!PALLET_STATES.includes(p.state)) problems.push(`Pallet ${code} has an unknown state.`);
    if (typeof p.version !== 'number') problems.push(`Pallet ${code} has no version number.`);
    const ev = d.events[p.id];
    if (!Array.isArray(ev) || ev.length === 0) problems.push(`Pallet ${code} has no history.`);
    else if (ev.some((e, i) => !isObj(e) || e.pallet_id !== p.id || (i > 0 && e.revision !== ev[i - 1].revision + 1)) || ev[ev.length - 1].revision !== p.version) {
      problems.push(`Pallet ${code} has history that does not line up with its version.`);
    }
  }
  for (const k of Object.keys(d.events)) if (!d.pallets[k]) problems.push('History exists for a pallet that is not in the file.');
  for (const a of Object.values(d.attachments)) if (!d.pallets[a.pallet_id]) problems.push('A photo belongs to a pallet that is not in the file.');
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
