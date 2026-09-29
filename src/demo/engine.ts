// Local command engine: the demo stand-in for the Postgres command functions (pages 17, 21-23).
//
// It follows the same transaction sequence the online design requires:
//   1. authenticate the actor and check current membership and role
//   2. reserve the workspace-scoped command ID with a canonical payload hash
//   3. re-read referenced rows and check expected_version and active flags
//   4. validate the transition and compute the next state from server values
//   5. update the pallet, insert the event, and write the command receipt together
// Writes go through an undo log so a failure part-way rolls back everything, including the receipt.
//
// MOCKED: authentication (the actor ID is trusted from the demo account switcher), network,
// and database locks (JavaScript runs one command at a time; the store adds a cross-tab lock).

import { BRAND } from '../brand';
import { canonicalJson, formatPalletCode, generateToken, hashString, normalizeCode, parseLabelPayload, parsePalletCode, rackFields, uuid } from '../domain/codes';
import { validateEnvelope } from '../domain/commands';
import { searchRows, type SearchFilters, type SearchRow } from '../domain/search';
import { checkTransition, roleAllows } from '../domain/transitions';
import type {
  AdminAudit,
  Attachment,
  CommandAccepted,
  CommandEnvelope,
  CommandReceipt,
  CommandRejected,
  CommandResult,
  ErrorCode,
  ImportBatch,
  Job,
  LabelToken,
  Location,
  LocationKind,
  Membership,
  Pallet,
  PalletCommandKind,
  PalletEvent,
  PalletLineage,
  PalletSnapshot,
  Role,
  RowError,
  User,
  Warehouse,
  Workspace,
} from '../domain/types';
import { LOCATION_KINDS } from '../domain/types';

export const DB_SCHEMA_VERSION = 2;

export interface Db {
  schema: number;
  seed: number | null;
  users: Record<string, User>;
  workspaces: Record<string, Workspace>;
  memberships: Membership[];
  warehouses: Record<string, Warehouse>;
  locations: Record<string, Location>;
  jobs: Record<string, Job>;
  pallets: Record<string, Pallet>;
  /** Events per pallet, ascending by revision. Append-only. */
  events: Record<string, PalletEvent[]>;
  receipts: Record<string, CommandReceipt>;
  labels: Record<string, LabelToken>;
  attachments: Record<string, Attachment>;
  audit: AdminAudit[];
  lineage: PalletLineage[];
  imports: Record<string, ImportBatch>;
  counters: Record<string, number>;
}

export function emptyDb(): Db {
  return {
    schema: DB_SCHEMA_VERSION,
    seed: null,
    users: {},
    workspaces: {},
    memberships: [],
    warehouses: {},
    locations: {},
    jobs: {},
    pallets: {},
    events: {},
    receipts: {},
    labels: {},
    attachments: {},
    audit: [],
    lineage: [],
    imports: {},
    counters: {},
  };
}

export interface Faults {
  /** D04: make the event insert throw after the pallet row was updated. */
  failEventInsert?: boolean;
}

export interface EngineOptions {
  clock?: () => string;
  newId?: () => string;
  newToken?: () => string;
  faults?: Faults;
}

export class ReadError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

type Undo = () => void;

class Tx {
  private undo: Undo[] = [];
  constructor(private db: Db) {}

  put<K extends 'pallets' | 'jobs' | 'locations' | 'attachments' | 'labels' | 'workspaces' | 'warehouses' | 'users' | 'imports'>(
    table: K,
    key: string,
    value: Db[K][string],
  ) {
    const t = this.db[table] as Record<string, unknown>;
    const had = Object.prototype.hasOwnProperty.call(t, key);
    const prev = t[key];
    t[key] = value;
    this.undo.push(() => {
      if (had) t[key] = prev;
      else delete t[key];
    });
  }

  appendEvent(ev: PalletEvent) {
    const list = (this.db.events[ev.pallet_id] ??= []);
    const last = list[list.length - 1];
    if (last && last.revision + 1 !== ev.revision) throw new Error('revision gap');
    if (list.some((e) => e.revision === ev.revision)) throw new Error('duplicate revision');
    list.push(ev);
    this.undo.push(() => {
      list.pop();
      if (list.length === 0) delete this.db.events[ev.pallet_id];
    });
  }

  appendAudit(a: AdminAudit) {
    this.db.audit.push(a);
    this.undo.push(() => this.db.audit.pop());
  }

  receipt(key: string, r: CommandReceipt) {
    if (this.db.receipts[key]) throw new Error('receipt exists');
    this.db.receipts[key] = r;
    this.undo.push(() => delete this.db.receipts[key]);
  }

  counter(ws: string): number {
    const prev = this.db.counters[ws] ?? 0;
    this.db.counters[ws] = prev + 1;
    this.undo.push(() => (this.db.counters[ws] = prev));
    return prev + 1;
  }

  membership(m: Membership) {
    this.db.memberships.push(m);
    this.undo.push(() => this.db.memberships.pop());
  }

  updateMembership(m: Membership, patch: Partial<Membership>) {
    const prev = { ...m };
    Object.assign(m, patch);
    this.undo.push(() => Object.assign(m, prev));
  }

  lineage(l: PalletLineage) {
    this.db.lineage.push(l);
    this.undo.push(() => this.db.lineage.pop());
  }

  rollback() {
    for (let i = this.undo.length - 1; i >= 0; i--) this.undo[i]();
    this.undo = [];
  }
}

export interface PalletDetail {
  pallet: Pallet;
  job: Job;
  location: Location | null;
  lastLocation: Location | null;
  attachments: Attachment[];
  label: LabelToken | null;
  holdBy: User | null;
}

export class Engine {
  clock: () => string;
  newId: () => string;
  newToken: () => string;
  faults: Faults;

  constructor(
    public db: Db,
    opts: EngineOptions = {},
  ) {
    this.clock = opts.clock ?? (() => new Date().toISOString());
    this.newId = opts.newId ?? (() => uuid());
    this.newToken = opts.newToken ?? (() => generateToken());
    this.faults = opts.faults ?? {};
  }

  // ---------------------------------------------------------------- identity

  membership(actorId: string | null | undefined, workspaceId: string): Membership | null {
    if (!actorId) return null;
    return this.db.memberships.find((m) => m.workspace_id === workspaceId && m.user_id === actorId && m.active) ?? null;
  }

  private requireMember(actorId: string | null | undefined, workspaceId: string, min: Role = 'VIEWER'): Membership {
    if (!actorId) throw new ReadError('AUTH_REQUIRED', 'Sign in to continue.');
    const m = this.membership(actorId, workspaceId);
    if (!m) throw new ReadError('FORBIDDEN', 'You do not have access to this company.');
    const rank = { VIEWER: 0, OPERATOR: 1, SUPERVISOR: 2, OWNER: 3 };
    if (rank[m.role] < rank[min]) throw new ReadError('FORBIDDEN', 'Your role does not allow this.');
    return m;
  }

  activeWarehouse(workspaceId: string): Warehouse | null {
    return Object.values(this.db.warehouses).find((w) => w.workspace_id === workspaceId && w.active) ?? null;
  }

  // ---------------------------------------------------------------- setup (fixtures only)

  /** Create a workspace and its initial owner in one operation (page 27). Used by fixtures. */
  createWorkspace(owner: User, name: string, warehouse: { code: string; name: string; timezone: string }): { workspace: Workspace; warehouse: Warehouse } {
    const tx = new Tx(this.db);
    const now = this.clock();
    const ws: Workspace = { id: this.newId(), name, created_at: now };
    const wh: Warehouse = { id: this.newId(), workspace_id: ws.id, code: warehouse.code, name: warehouse.name, timezone: warehouse.timezone, active: true };
    tx.put('users', owner.id, owner);
    tx.put('workspaces', ws.id, ws);
    tx.put('warehouses', wh.id, wh);
    tx.membership({ workspace_id: ws.id, user_id: owner.id, role: 'OWNER', active: true });
    return { workspace: ws, warehouse: wh };
  }

  addMember(workspaceId: string, user: User, role: Role) {
    this.db.users[user.id] = user;
    this.db.memberships.push({ workspace_id: workspaceId, user_id: user.id, role, active: true });
  }

  setMembershipActive(workspaceId: string, userId: string, active: boolean) {
    const m = this.db.memberships.find((x) => x.workspace_id === workspaceId && x.user_id === userId);
    if (!m) return;
    if (!active && m.role === 'OWNER') {
      const owners = this.db.memberships.filter((x) => x.workspace_id === workspaceId && x.role === 'OWNER' && x.active);
      if (owners.length <= 1) throw new Error('A company must keep at least one active owner.');
    }
    m.active = active;
  }

  // ---------------------------------------------------------------- commands

  execute(actorId: string | null | undefined, raw: unknown): CommandResult {
    const correlation_id = this.newId().slice(0, 8);
    const guessId = typeof raw === 'object' && raw && 'command_id' in raw ? String((raw as { command_id: unknown }).command_id) : '';
    const guessKind = typeof raw === 'object' && raw && 'kind' in raw ? String((raw as { kind: unknown }).kind) : '';
    const fail = (code: ErrorCode, message: string, extra: Partial<CommandRejected> = {}): CommandRejected => ({
      ok: false,
      command_id: guessId,
      kind: guessKind,
      code,
      message,
      correlation_id,
      ...extra,
    });

    if (!actorId) return fail('AUTH_REQUIRED', 'Sign in to continue.');
    const v = validateEnvelope(raw);
    if (!v.ok) return fail('INVALID_INPUT', v.message);
    const cmd = v.cmd;

    // 1. Current membership and role, checked when the command is accepted.
    const member = this.membership(actorId, cmd.workspace_id);
    if (!member) return fail('FORBIDDEN', 'You do not have access to this company.');
    if (!roleAllows(member.role, cmd.kind)) return fail('FORBIDDEN', `Your role (${member.role.toLowerCase()}) cannot do this.`);

    // 2. Reserve the command key with a canonical payload hash.
    const key = `${cmd.workspace_id}:${cmd.command_id}`;
    const payload_hash = hashString(
      canonicalJson({ kind: cmd.kind, workspace_id: cmd.workspace_id, pallet_id: cmd.pallet_id ?? null, expected_version: cmd.expected_version ?? null, payload: cmd.payload }),
    );
    const existing = this.db.receipts[key];
    if (existing) {
      if (existing.actor_id !== actorId || existing.payload_hash !== payload_hash) {
        return fail('COMMAND_KEY_REUSED', 'This request ID was already used for a different request.');
      }
      return { ...existing.result, replayed: true };
    }

    // 3-5. One transaction.
    const tx = new Tx(this.db);
    const now = this.clock();
    try {
      const result = this.run(tx, actorId, cmd, now, correlation_id);
      tx.receipt(key, { workspace_id: cmd.workspace_id, command_id: cmd.command_id, actor_id: actorId, payload_hash, result, completed_at: now });
      return result;
    } catch (err) {
      tx.rollback();
      return {
        ok: false,
        command_id: cmd.command_id,
        kind: cmd.kind,
        code: 'TEMPORARY_FAILURE',
        message: 'The change was not saved. Try again.',
        correlation_id,
      };
    }
  }

  /** Recover the saved result of a command whose response was lost (D01). */
  recover(actorId: string, workspaceId: string, commandId: string): { status: 'found'; result: CommandResult } | { status: 'unknown' } {
    if (!this.membership(actorId, workspaceId)) return { status: 'unknown' };
    const r = this.db.receipts[`${workspaceId}:${commandId}`];
    if (!r || r.actor_id !== actorId) return { status: 'unknown' };
    return { status: 'found', result: { ...r.result, replayed: true } };
  }

  private run(tx: Tx, actorId: string, cmd: CommandEnvelope, now: string, correlation_id: string): CommandResult {
    const reject = (code: ErrorCode, message: string, current?: Pallet | null): CommandRejected => ({
      ok: false,
      command_id: cmd.command_id,
      kind: cmd.kind,
      code,
      message,
      correlation_id,
      ...(current !== undefined ? { current } : {}),
    });
    const ws = cmd.workspace_id;
    const p = cmd.payload as Record<string, unknown>;

    switch (cmd.kind) {
      case 'receive':
        return this.receive(tx, actorId, cmd, now, reject);
      case 'create_job':
      case 'close_job':
      case 'reopen_job':
      case 'create_location':
      case 'rename_location':
      case 'deactivate_location':
      case 'reactivate_location':
      case 'invite_member':
      case 'change_role':
      case 'remove_member':
      case 'import_batch':
        return this.admin(tx, actorId, cmd, now, reject);
    }

    // Pallet commands: lock order is jobs, locations, then the pallet (single-threaded here).
    const pallet = this.db.pallets[cmd.pallet_id!];
    if (!pallet || pallet.workspace_id !== ws) return reject('NOT_FOUND', 'Pallet not found.');
    const job = this.db.jobs[pallet.job_id];
    let location: Location | null = null;
    if (typeof p.location_id === 'string') {
      const loc = this.db.locations[p.location_id];
      if (!loc || loc.workspace_id !== ws) return reject('NOT_FOUND', 'Location not found.');
      location = loc;
    }
    let newJob: Job | null = null;
    if (cmd.kind === 'reassign_job') {
      const j = this.db.jobs[String(p.job_id)];
      if (!j || j.workspace_id !== ws) return reject('NOT_FOUND', 'Job not found.');
      newJob = j;
    }
    if (cmd.expected_version !== pallet.version) {
      return reject('VERSION_CONFLICT', `${pallet.code} changed since you loaded it (now version ${pallet.version}). Review the current record.`, pallet);
    }

    const kind = cmd.kind as PalletCommandKind;
    const outcome = checkTransition(kind, { pallet, job, location, newJob, payload: p, now, actorId });
    if (!outcome.ok) return reject(outcome.code, outcome.message, outcome.code === 'INVALID_STATE' ? pallet : undefined);

    const detail = { ...outcome.detail };

    if (kind === 'add_photo') {
      const active = Object.values(this.db.attachments).filter((a) => a.pallet_id === pallet.id && a.state === 'ready');
      if (active.length >= 3) return reject('INVALID_INPUT', 'A pallet can have up to three photos. Remove one first.');
      const media = String(p.media_type);
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(media)) return reject('INVALID_INPUT', 'Photos must be JPEG, PNG, or WebP.');
      const bytes = Number(p.bytes);
      if (bytes > 5 * 1024 * 1024) return reject('INVALID_INPUT', 'Photos are limited to 5 MB.');
      const dataUrl = String(p.data_url);
      if (!dataUrl.startsWith(`data:${media};base64,`)) return reject('INVALID_INPUT', 'Photo content does not match its type.');
      const attId = String(p.attachment_id);
      if (this.db.attachments[attId]) return reject('INVALID_INPUT', 'That photo was already added.');
      tx.put('attachments', attId, {
        id: attId,
        workspace_id: ws,
        pallet_id: pallet.id,
        data_url: dataUrl,
        thumb_url: String(p.thumb_url),
        media_type: media,
        bytes,
        state: 'ready',
        created_by: actorId,
        created_at: now,
      });
      detail.attachment_id = attId;
    }
    if (kind === 'remove_photo') {
      const att = this.db.attachments[String(p.attachment_id)];
      if (!att || att.pallet_id !== pallet.id || att.state !== 'ready') return reject('NOT_FOUND', 'Photo not found.');
      if (!String(p.reason ?? '').trim()) return reject('INVALID_INPUT', 'Enter why the photo is removed.');
      tx.put('attachments', att.id, { ...att, state: 'removed' });
      detail.attachment_id = att.id;
    }
    let createdIds: string[] | undefined;
    if (kind === 'split') {
      const children = (p.children as { description: string; job_id: string }[]).map((c) => ({ description: c.description.trim(), job_id: c.job_id }));
      for (const [i, c] of children.entries()) {
        const j = this.db.jobs[c.job_id];
        if (!j || j.workspace_id !== ws) return reject('NOT_FOUND', `Portion ${i + 1}: job not found.`);
        if (j.status !== 'OPEN') return reject('JOB_CLOSED', `Portion ${i + 1}: job ${j.code} is closed.`);
      }
      const parentLoc = pallet.current_location_id!;
      const locCode = this.db.locations[parentLoc]?.code ?? '';
      createdIds = [];
      const childCodes: string[] = [];
      for (const c of children) {
        const n = tx.counter(ws);
        const child: Pallet = {
          id: this.newId(),
          workspace_id: ws,
          warehouse_id: pallet.warehouse_id,
          code: formatPalletCode(n),
          job_id: c.job_id,
          description: c.description,
          notes: null,
          supplier_ref: pallet.supplier_ref,
          state: 'STORED',
          current_location_id: parentLoc,
          last_confirmed_location_id: parentLoc,
          last_confirmed_at: now,
          hold: null,
          version: 1,
          received_at: now,
          updated_at: now,
          archived_at: null,
          label_needs_reprint: false,
        };
        tx.put('pallets', child.id, child);
        const token = this.newToken();
        tx.put('labels', token, { workspace_id: ws, token, kind: 'P', target_id: child.id, created_at: now, revoked_at: null });
        tx.lineage({ workspace_id: ws, parent_id: pallet.id, child_id: child.id, split_command_id: cmd.command_id, created_at: now });
        tx.appendEvent({
          id: this.newId(),
          schema_version: 1,
          workspace_id: ws,
          pallet_id: child.id,
          revision: 1,
          type: 'split_child',
          actor_id: actorId,
          accepted_at: now,
          observed_at: null,
          before_state: null,
          after_state: this.snapshot(child),
          reason: outcome.reason,
          command_id: cmd.command_id,
          detail: { split_from: pallet.code, inherited_location: locCode },
        });
        createdIds.push(child.id);
        childCodes.push(child.code);
      }
      detail.children = childCodes.join(', ');
    }
    if (kind === 'rotate_label') {
      const old = this.activeLabel(pallet.id);
      if (old) tx.put('labels', old.token, { ...old, revoked_at: now });
      const token = this.newToken();
      tx.put('labels', token, { workspace_id: ws, token, kind: 'P', target_id: pallet.id, created_at: now, revoked_at: null });
    }

    const before = this.snapshot(pallet);
    const next: Pallet = { ...pallet, ...outcome.patch, version: pallet.version + 1, updated_at: now };
    tx.put('pallets', next.id, next);
    if (this.faults.failEventInsert) throw new Error('forced event insert failure');
    const event: PalletEvent = {
      id: this.newId(),
      schema_version: 1,
      workspace_id: ws,
      pallet_id: next.id,
      revision: next.version,
      type: kind,
      actor_id: actorId,
      accepted_at: now,
      observed_at: null,
      before_state: before,
      after_state: this.snapshot(next),
      reason: outcome.reason,
      command_id: cmd.command_id,
      detail,
    };
    tx.appendEvent(event);
    const res = this.accepted(cmd, now, event.id, next);
    if (createdIds) res.created_ids = createdIds;
    return res;
  }

  private accepted(cmd: CommandEnvelope, now: string, eventId: string | null, pallet: Pallet | null, targetId: string | null = null): CommandAccepted {
    return {
      ok: true,
      command_id: cmd.command_id,
      kind: cmd.kind,
      accepted_at: now,
      event_id: eventId,
      pallet_id: pallet?.id ?? null,
      new_version: pallet?.version ?? null,
      current_state: pallet ? { ...pallet } : null,
      target_id: targetId ?? pallet?.id ?? null,
    };
  }

  private receive(tx: Tx, actorId: string, cmd: CommandEnvelope, now: string, reject: (c: ErrorCode, m: string) => CommandRejected): CommandResult {
    const p = cmd.payload as { job_id: string; description: string; notes?: string; supplier_ref?: string };
    const wh = this.activeWarehouse(cmd.workspace_id);
    if (!wh) return reject('INVALID_STATE', 'This company has no active warehouse.');
    const job = this.db.jobs[p.job_id];
    if (!job || job.workspace_id !== cmd.workspace_id) return reject('NOT_FOUND', 'Job not found.');
    if (job.status !== 'OPEN') return reject('JOB_CLOSED', `Job ${job.code} is closed. Choose an open job.`);
    const description = p.description.trim();
    if (!description) return reject('INVALID_INPUT', 'Description is required.');
    if (description.length > 160) return reject('INVALID_INPUT', 'Description is limited to 160 characters.');
    const notes = (p.notes ?? '').trim();
    if (notes.length > 1000) return reject('INVALID_INPUT', 'Notes are limited to 1,000 characters.');
    const supplier = (p.supplier_ref ?? '').trim();
    if (supplier.length > 80) return reject('INVALID_INPUT', 'Supplier reference is limited to 80 characters.');

    const n = tx.counter(cmd.workspace_id);
    const pallet: Pallet = {
      id: this.newId(),
      workspace_id: cmd.workspace_id,
      warehouse_id: wh.id,
      code: formatPalletCode(n),
      job_id: job.id,
      description,
      notes: notes || null,
      supplier_ref: supplier || null,
      state: 'RECEIVED',
      current_location_id: null,
      last_confirmed_location_id: null,
      last_confirmed_at: null,
      hold: null,
      version: 1,
      received_at: now,
      updated_at: now,
      archived_at: null,
      label_needs_reprint: false,
    };
    tx.put('pallets', pallet.id, pallet);
    const token = this.newToken();
    tx.put('labels', token, { workspace_id: cmd.workspace_id, token, kind: 'P', target_id: pallet.id, created_at: now, revoked_at: null });
    if (this.faults.failEventInsert) throw new Error('forced event insert failure');
    const event: PalletEvent = {
      id: this.newId(),
      schema_version: 1,
      workspace_id: cmd.workspace_id,
      pallet_id: pallet.id,
      revision: 1,
      type: 'receive',
      actor_id: actorId,
      accepted_at: now,
      observed_at: null,
      before_state: null,
      after_state: this.snapshot(pallet),
      reason: null,
      command_id: cmd.command_id,
      detail: { job: job.code },
    };
    tx.appendEvent(event);
    return this.accepted(cmd, now, event.id, pallet);
  }

  private admin(tx: Tx, actorId: string, cmd: CommandEnvelope, now: string, reject: (c: ErrorCode, m: string, cur?: Pallet | null) => CommandRejected): CommandResult {
    const ws = cmd.workspace_id;
    const p = cmd.payload as Record<string, string | undefined>;
    const reason = (p.reason ?? '').trim() || null;
    const audit = (targetId: string, before: Record<string, unknown> | null, after: Record<string, unknown> | null) => {
      const a: AdminAudit = { id: this.newId(), workspace_id: ws, actor_id: actorId, action: cmd.kind as AdminAudit['action'], target_id: targetId, before, after, reason, accepted_at: now, command_id: cmd.command_id };
      tx.appendAudit(a);
      return a;
    };
    const wh = this.activeWarehouse(ws);
    if (!wh) return reject('INVALID_STATE', 'This company has no active warehouse.');

    const findJob = () => {
      const j = this.db.jobs[p.job_id ?? ''];
      return j && j.workspace_id === ws ? j : null;
    };
    const findLoc = () => {
      const l = this.db.locations[p.location_id ?? ''];
      return l && l.workspace_id === ws ? l : null;
    };
    const versionOk = (v: number) => cmd.expected_version === undefined || cmd.expected_version === v;

    switch (cmd.kind) {
      case 'create_job': {
        const code = normalizeCode(p.code ?? '');
        const name = (p.name ?? '').trim();
        if (!code || code.length > 20) return reject('INVALID_INPUT', 'Job code is required (up to 20 characters).');
        if (!name || name.length > 120) return reject('INVALID_INPUT', 'Job name is required (up to 120 characters).');
        if (Object.values(this.db.jobs).some((j) => j.workspace_id === ws && normalizeCode(j.code) === code)) {
          return reject('INVALID_INPUT', `Job ${code} already exists.`);
        }
        const job: Job = { id: this.newId(), workspace_id: ws, code, name, destination_notes: (p.destination_notes ?? '').trim() || null, status: 'OPEN', version: 1, created_at: now, updated_at: now };
        tx.put('jobs', job.id, job);
        const a = audit(job.id, null, { code, name, status: 'OPEN' });
        return this.accepted(cmd, now, a.id, null, job.id);
      }
      case 'close_job':
      case 'reopen_job': {
        const job = findJob();
        if (!job) return reject('NOT_FOUND', 'Job not found.');
        if (!versionOk(job.version)) return reject('VERSION_CONFLICT', `Job ${job.code} changed since you loaded it.`);
        if (cmd.kind === 'close_job') {
          if (job.status === 'CLOSED') return reject('INVALID_STATE', `Job ${job.code} is already closed.`);
          const pallets = Object.values(this.db.pallets).filter((x) => x.job_id === job.id);
          const active = pallets.filter((x) => ['RECEIVED', 'STORED', 'MISSING'].includes(x.state));
          const held = pallets.filter((x) => x.hold && x.state !== 'RETIRED');
          if (active.length || held.length) {
            const parts = [];
            if (active.length) parts.push(`${active.length} pallet${active.length === 1 ? ' is' : 's are'} still received, stored, or missing`);
            if (held.length) parts.push(`${held.length} hold${held.length === 1 ? '' : 's'} unresolved`);
            return reject('INVALID_STATE', `Job ${job.code} cannot close: ${parts.join('; ')}.`);
          }
        } else if (job.status === 'OPEN') return reject('INVALID_STATE', `Job ${job.code} is already open.`);
        const next: Job = { ...job, status: cmd.kind === 'close_job' ? 'CLOSED' : 'OPEN', version: job.version + 1, updated_at: now };
        tx.put('jobs', job.id, next);
        const a = audit(job.id, { status: job.status }, { status: next.status });
        return this.accepted(cmd, now, a.id, null, job.id);
      }
      case 'create_location': {
        const code = normalizeCode(p.code ?? '');
        const kind = (p.kind ?? '') as LocationKind;
        if (!code || code.length > 30) return reject('INVALID_INPUT', 'Location code is required (up to 30 characters).');
        if (!LOCATION_KINDS.includes(kind)) return reject('INVALID_INPUT', 'Choose a location kind.');
        if (Object.values(this.db.locations).some((l) => l.warehouse_id === wh.id && normalizeCode(l.code) === code)) {
          return reject('INVALID_INPUT', `Location ${code} already exists in ${wh.code}.`);
        }
        const loc: Location = { id: this.newId(), workspace_id: ws, warehouse_id: wh.id, code, kind, ...rackFields(code), active: true, version: 1, created_at: now, updated_at: now };
        tx.put('locations', loc.id, loc);
        const token = this.newToken();
        tx.put('labels', token, { workspace_id: ws, token, kind: 'L', target_id: loc.id, created_at: now, revoked_at: null });
        const a = audit(loc.id, null, { code, kind });
        return this.accepted(cmd, now, a.id, null, loc.id);
      }
      case 'rename_location': {
        const loc = findLoc();
        if (!loc) return reject('NOT_FOUND', 'Location not found.');
        if (!versionOk(loc.version)) return reject('VERSION_CONFLICT', `${loc.code} changed since you loaded it.`);
        const code = normalizeCode(p.code ?? '');
        if (!code || code.length > 30) return reject('INVALID_INPUT', 'Location code is required (up to 30 characters).');
        if (code === loc.code) return reject('INVALID_INPUT', 'That is already its code.');
        if (Object.values(this.db.locations).some((l) => l.warehouse_id === loc.warehouse_id && l.id !== loc.id && normalizeCode(l.code) === code)) {
          return reject('INVALID_INPUT', `Location ${code} already exists.`);
        }
        const next: Location = { ...loc, code, ...rackFields(code), version: loc.version + 1, updated_at: now };
        tx.put('locations', loc.id, next);
        const a = audit(loc.id, { code: loc.code }, { code });
        return this.accepted(cmd, now, a.id, null, loc.id);
      }
      case 'deactivate_location':
      case 'reactivate_location': {
        const loc = findLoc();
        if (!loc) return reject('NOT_FOUND', 'Location not found.');
        if (!versionOk(loc.version)) return reject('VERSION_CONFLICT', `${loc.code} changed since you loaded it.`);
        const activate = cmd.kind === 'reactivate_location';
        if (loc.active === activate) return reject('INVALID_STATE', `${loc.code} is already ${activate ? 'active' : 'inactive'}.`);
        if (!activate) {
          const here = Object.values(this.db.pallets).filter((x) => x.current_location_id === loc.id);
          if (here.length) return reject('INVALID_STATE', `${loc.code} still has ${here.length} pallet${here.length === 1 ? '' : 's'} recorded. Move them first.`);
        }
        const next: Location = { ...loc, active: activate, version: loc.version + 1, updated_at: now };
        tx.put('locations', loc.id, next);
        const a = audit(loc.id, { active: loc.active }, { active: activate });
        return this.accepted(cmd, now, a.id, null, loc.id);
      }
      case 'invite_member': {
        const actor = this.membership(actorId, ws)!;
        const name = (p.name ?? '').trim();
        const email = (p.email ?? '').trim().toLowerCase();
        const role = (p.role ?? '') as Role;
        if (!name) return reject('INVALID_INPUT', 'Enter a name.');
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return reject('INVALID_INPUT', 'Enter a valid email address.');
        if (!['OWNER', 'SUPERVISOR', 'OPERATOR', 'VIEWER'].includes(role)) return reject('INVALID_INPUT', 'Choose a role.');
        if ((role === 'OWNER' || role === 'SUPERVISOR') && actor.role !== 'OWNER') return reject('FORBIDDEN', 'Only an owner can grant supervisor or owner access.');
        const existingUser = Object.values(this.db.users).find((u) => u.email.toLowerCase() === email);
        if (existingUser && this.db.memberships.some((m) => m.workspace_id === ws && m.user_id === existingUser.id && m.active)) {
          return reject('INVALID_INPUT', `${email} already has access.`);
        }
        const user: User = existingUser ?? { id: this.newId(), name, email };
        if (!existingUser) tx.put('users', user.id, user);
        const prior = this.db.memberships.find((m) => m.workspace_id === ws && m.user_id === user.id);
        if (prior) tx.updateMembership(prior, { role, active: true });
        else tx.membership({ workspace_id: ws, user_id: user.id, role, active: true });
        const a = audit(user.id, null, { email, role });
        return this.accepted(cmd, now, a.id, null, user.id);
      }
      case 'change_role':
      case 'remove_member': {
        const actor = this.membership(actorId, ws)!;
        const target = this.db.memberships.find((m) => m.workspace_id === ws && m.user_id === p.user_id && m.active);
        if (!target) return reject('NOT_FOUND', 'Person not found.');
        const privileged = (r: Role) => r === 'OWNER' || r === 'SUPERVISOR';
        const newRole = cmd.kind === 'change_role' ? ((p.role ?? '') as Role) : null;
        if (newRole && !['OWNER', 'SUPERVISOR', 'OPERATOR', 'VIEWER'].includes(newRole)) return reject('INVALID_INPUT', 'Choose a role.');
        if (actor.role !== 'OWNER' && (privileged(target.role) || (newRole && privileged(newRole)))) {
          return reject('FORBIDDEN', 'Only an owner can change supervisor or owner access.');
        }
        const leavesOwner = target.role === 'OWNER' && (cmd.kind === 'remove_member' || newRole !== 'OWNER');
        if (leavesOwner) {
          const owners = this.db.memberships.filter((m) => m.workspace_id === ws && m.role === 'OWNER' && m.active);
          if (owners.length <= 1) return reject('INVALID_STATE', 'A company must keep at least one active owner.');
        }
        if (newRole === target.role) return reject('INVALID_INPUT', 'That is already their role.');
        const before = { role: target.role, active: target.active };
        if (cmd.kind === 'change_role') tx.updateMembership(target, { role: newRole! });
        else tx.updateMembership(target, { active: false });
        const a = audit(target.user_id, before, { role: target.role, active: target.active });
        return this.accepted(cmd, now, a.id, null, target.user_id);
      }
      case 'import_batch':
        return this.importBatch(tx, actorId, cmd, now, wh, reject);
    }
    return reject('INVALID_INPUT', 'Unknown command.');
  }

  /** Atomic, repeat-safe CSV import (page 27). The command ID is the batch ID. */
  private importBatch(
    tx: Tx,
    actorId: string,
    cmd: CommandEnvelope,
    now: string,
    wh: Warehouse,
    reject: (c: ErrorCode, m: string, cur?: Pallet | null) => CommandRejected,
  ): CommandResult {
    const ws = cmd.workspace_id;
    const p = cmd.payload as { import_kind: 'locations' | 'jobs' | 'pallets'; checksum: string; rows: Record<string, string>[] };
    const rows = p.rows;
    const errors: RowError[] = [];
    const err = (i: number, column: string, message: string) => errors.push({ row: i + 2, column, message });
    const member = this.membership(actorId, ws)!;
    if (rows.length === 0) return reject('INVALID_INPUT', 'The file has no data rows.');
    if (rows.length > 200) return reject('INVALID_INPUT', `A batch is limited to 200 rows; this file has ${rows.length}. Split it into smaller files.`);
    const get = (r: Record<string, string>, k: string) => (r[k] ?? '').trim();
    const created: string[] = [];
    let skipped = 0;

    if (p.import_kind === 'jobs' || p.import_kind === 'locations') {
      if (member.role !== 'OWNER' && member.role !== 'SUPERVISOR') return reject('FORBIDDEN', 'Only supervisors and owners can import jobs or locations.');
    }

    if (p.import_kind === 'jobs') {
      const seen = new Map<string, number>();
      const existing = new Set(Object.values(this.db.jobs).filter((j) => j.workspace_id === ws).map((j) => normalizeCode(j.code)));
      rows.forEach((r, i) => {
        const code = normalizeCode(get(r, 'job_code'));
        const name = get(r, 'job_name');
        if (!code) err(i, 'job_code', 'Job code is required.');
        else if (code.length > 20) err(i, 'job_code', 'Job code is limited to 20 characters.');
        else if (existing.has(code)) err(i, 'job_code', `Job ${code} already exists.`);
        else if (seen.has(code)) err(i, 'job_code', `Duplicate of row ${seen.get(code)! + 2}.`);
        else seen.set(code, i);
        if (!name) err(i, 'job_name', 'Job name is required.');
        else if (name.length > 120) err(i, 'job_name', 'Job name is limited to 120 characters.');
      });
      if (errors.length) return { ...reject('INVALID_INPUT', `${errors.length} problem${errors.length === 1 ? '' : 's'} found. Nothing was imported.`), errors };
      for (const r of rows) {
        const job: Job = { id: this.newId(), workspace_id: ws, code: normalizeCode(get(r, 'job_code')), name: get(r, 'job_name'), destination_notes: get(r, 'destination_notes') || null, status: 'OPEN', version: 1, created_at: now, updated_at: now };
        tx.put('jobs', job.id, job);
        created.push(job.id);
      }
    } else if (p.import_kind === 'locations') {
      const seen = new Map<string, number>();
      const existing = new Map(Object.values(this.db.locations).filter((l) => l.warehouse_id === wh.id).map((l) => [normalizeCode(l.code), l]));
      const toCreate: { code: string; kind: LocationKind }[] = [];
      rows.forEach((r, i) => {
        const whCode = normalizeCode(get(r, 'warehouse_code'));
        const code = normalizeCode(get(r, 'location_code'));
        const kind = normalizeCode(get(r, 'kind')) as LocationKind;
        if (whCode !== normalizeCode(wh.code)) err(i, 'warehouse_code', `Expected ${wh.code}.`);
        if (!LOCATION_KINDS.includes(kind)) err(i, 'kind', `Kind must be one of ${LOCATION_KINDS.join(', ')}.`);
        if (!code) return err(i, 'location_code', 'Location code is required.');
        if (code.length > 30) return err(i, 'location_code', 'Location code is limited to 30 characters.');
        if (seen.has(code)) return err(i, 'location_code', `Duplicate of row ${seen.get(code)! + 2}.`);
        seen.set(code, i);
        const ex = existing.get(code);
        if (ex) {
          if (ex.kind !== kind && LOCATION_KINDS.includes(kind)) err(i, 'kind', `${code} already exists as ${ex.kind}. Imports never silently change a location.`);
          else skipped++;
          return;
        }
        toCreate.push({ code, kind });
      });
      if (errors.length) return { ...reject('INVALID_INPUT', `${errors.length} problem${errors.length === 1 ? '' : 's'} found. Nothing was imported.`), errors };
      for (const t of toCreate) {
        const loc: Location = { id: this.newId(), workspace_id: ws, warehouse_id: wh.id, code: t.code, kind: t.kind, ...rackFields(t.code), active: true, version: 1, created_at: now, updated_at: now };
        tx.put('locations', loc.id, loc);
        const token = this.newToken();
        tx.put('labels', token, { workspace_id: ws, token, kind: 'L', target_id: loc.id, created_at: now, revoked_at: null });
        created.push(loc.id);
      }
    } else {
      const jobsByCode = new Map(Object.values(this.db.jobs).filter((j) => j.workspace_id === ws).map((j) => [normalizeCode(j.code), j]));
      rows.forEach((r, i) => {
        const job = jobsByCode.get(normalizeCode(get(r, 'job_code')));
        const d = get(r, 'description');
        if (!get(r, 'job_code')) err(i, 'job_code', 'Job code is required.');
        else if (!job) err(i, 'job_code', `Job ${normalizeCode(get(r, 'job_code'))} does not exist.`);
        else if (job.status !== 'OPEN') err(i, 'job_code', `Job ${job.code} is closed.`);
        if (!d) err(i, 'description', 'Description is required.');
        else if (d.length > 160) err(i, 'description', 'Description is limited to 160 characters.');
        if (get(r, 'notes').length > 1000) err(i, 'notes', 'Notes are limited to 1,000 characters.');
      });
      if (errors.length) return { ...reject('INVALID_INPUT', `${errors.length} problem${errors.length === 1 ? '' : 's'} found. Nothing was imported.`), errors };
      rows.forEach((r, i) => {
        const job = jobsByCode.get(normalizeCode(get(r, 'job_code')))!;
        const n = tx.counter(ws);
        const pallet: Pallet = {
          id: this.newId(),
          workspace_id: ws,
          warehouse_id: wh.id,
          code: formatPalletCode(n),
          job_id: job.id,
          description: get(r, 'description'),
          notes: get(r, 'notes') || null,
          supplier_ref: get(r, 'supplier_ref') || null,
          state: 'RECEIVED',
          current_location_id: null,
          last_confirmed_location_id: null,
          last_confirmed_at: null,
          hold: null,
          version: 1,
          received_at: now,
          updated_at: now,
          archived_at: null,
          label_needs_reprint: false,
        };
        tx.put('pallets', pallet.id, pallet);
        const token = this.newToken();
        tx.put('labels', token, { workspace_id: ws, token, kind: 'P', target_id: pallet.id, created_at: now, revoked_at: null });
        tx.appendEvent({
          id: this.newId(),
          schema_version: 1,
          workspace_id: ws,
          pallet_id: pallet.id,
          revision: 1,
          type: 'import_receive',
          actor_id: actorId,
          accepted_at: now,
          observed_at: null,
          before_state: null,
          after_state: this.snapshot(pallet),
          reason: null,
          command_id: cmd.command_id,
          detail: { import_batch: cmd.command_id, source_row: i + 2 },
        });
        created.push(pallet.id);
      });
    }
    const summary = `${created.length} ${p.import_kind} created${skipped ? `, ${skipped} already existed` : ''}`;
    tx.put('imports', cmd.command_id, { id: cmd.command_id, workspace_id: ws, kind: p.import_kind, checksum: p.checksum, status: 'committed', summary, created_ids: created, actor_id: actorId, created_at: now });
    tx.appendAudit({ id: this.newId(), workspace_id: ws, actor_id: actorId, action: 'import_batch', target_id: cmd.command_id, before: null, after: { kind: p.import_kind, summary }, reason: null, accepted_at: now, command_id: cmd.command_id });
    const res = this.accepted(cmd, now, null, null, cmd.command_id);
    res.created_ids = created;
    return res;
  }

  snapshot(p: Pallet): PalletSnapshot {
    const job = this.db.jobs[p.job_id];
    const cur = p.current_location_id ? this.db.locations[p.current_location_id] : null;
    const last = p.last_confirmed_location_id ? this.db.locations[p.last_confirmed_location_id] : null;
    return {
      state: p.state,
      current_location_id: p.current_location_id,
      current_location_code: cur?.code ?? null,
      last_confirmed_location_id: p.last_confirmed_location_id,
      last_confirmed_location_code: last?.code ?? null,
      job_id: p.job_id,
      job_code: job?.code ?? '?',
      hold: !!p.hold,
      hold_reason: p.hold?.reason ?? null,
      description: p.description,
      archived: !!p.archived_at,
    };
  }

  activeLabel(targetId: string): LabelToken | null {
    return Object.values(this.db.labels).find((l) => l.target_id === targetId && !l.revoked_at) ?? null;
  }

  // ---------------------------------------------------------------- reads

  context(actorId: string, workspaceId: string) {
    const m = this.requireMember(actorId, workspaceId);
    const ws = this.db.workspaces[workspaceId];
    return {
      workspace: ws,
      role: m.role,
      user: this.db.users[actorId],
      warehouse: this.activeWarehouse(workspaceId),
      jobs: Object.values(this.db.jobs)
        .filter((j) => j.workspace_id === workspaceId)
        .sort((a, b) => a.code.localeCompare(b.code)),
      locations: Object.values(this.db.locations)
        .filter((l) => l.workspace_id === workspaceId)
        .sort((a, b) => a.code.localeCompare(b.code)),
      members: this.db.memberships
        .filter((x) => x.workspace_id === workspaceId)
        .map((x) => ({ ...x, user: this.db.users[x.user_id] })),
    };
  }

  private rows(workspaceId: string): SearchRow[] {
    return Object.values(this.db.pallets)
      .filter((p) => p.workspace_id === workspaceId)
      .map((pallet) => ({
        pallet,
        job: this.db.jobs[pallet.job_id],
        location: pallet.current_location_id ? this.db.locations[pallet.current_location_id] : null,
        lastLocation: pallet.last_confirmed_location_id ? this.db.locations[pallet.last_confirmed_location_id] : null,
      }));
  }

  search(actorId: string, workspaceId: string, filters: SearchFilters) {
    this.requireMember(actorId, workspaceId);
    return { ...searchRows(this.rows(workspaceId), filters), refreshed_at: this.clock() };
  }

  pallet(actorId: string, workspaceId: string, palletId: string): PalletDetail {
    this.requireMember(actorId, workspaceId);
    const pallet = this.db.pallets[palletId];
    // Opaque denial: another workspace's pallet looks exactly like a missing one.
    if (!pallet || pallet.workspace_id !== workspaceId) throw new ReadError('NOT_FOUND', 'Pallet not found.');
    return {
      pallet,
      job: this.db.jobs[pallet.job_id],
      location: pallet.current_location_id ? this.db.locations[pallet.current_location_id] : null,
      lastLocation: pallet.last_confirmed_location_id ? this.db.locations[pallet.last_confirmed_location_id] : null,
      attachments: Object.values(this.db.attachments)
        .filter((a) => a.pallet_id === pallet.id && a.state === 'ready')
        .sort((a, b) => a.created_at.localeCompare(b.created_at)),
      label: this.activeLabel(pallet.id),
      holdBy: pallet.hold ? this.db.users[pallet.hold.applied_by] ?? null : null,
    };
  }

  history(actorId: string, workspaceId: string, palletId: string): PalletEvent[] {
    this.pallet(actorId, workspaceId, palletId);
    return [...(this.db.events[palletId] ?? [])].reverse();
  }

  /** Resolve a scanned payload or a typed code to a pallet or location in this workspace (page 16). */
  resolve(actorId: string, workspaceId: string, text: string): { type: 'pallet'; pallet: Pallet } | { type: 'location'; location: Location } {
    this.requireMember(actorId, workspaceId);
    const raw = text.trim();
    if (!raw) throw new ReadError('INVALID_INPUT', 'Scan a label or type the printed code.');
    if (raw.length > 128) throw new ReadError('INVALID_INPUT', `That is not a ${BRAND.name} label.`);
    const label = parseLabelPayload(raw);
    if (label) {
      const t = this.db.labels[label.token];
      if (!t || t.workspace_id !== workspaceId || t.kind !== label.kind) throw new ReadError('NOT_FOUND', 'This label is not recognized in this company.');
      if (t.revoked_at) throw new ReadError('INVALID_STATE', 'This label was replaced. Use the new label or type the printed code.');
      if (t.kind === 'P') return { type: 'pallet', pallet: this.db.pallets[t.target_id] };
      const loc = this.db.locations[t.target_id];
      const wh = this.activeWarehouse(workspaceId);
      if (wh && loc.warehouse_id !== wh.id) throw new ReadError('INVALID_INPUT', 'That rack label belongs to a different warehouse.');
      return { type: 'location', location: loc };
    }
    if (/^PL\d*:/i.test(raw) || /^[a-z]+:\/\//i.test(raw)) throw new ReadError('INVALID_INPUT', `That is not a ${BRAND.name} label.`);
    const palletCode = parsePalletCode(raw);
    if (palletCode) {
      const p = Object.values(this.db.pallets).find((x) => x.workspace_id === workspaceId && x.code === palletCode);
      if (p) return { type: 'pallet', pallet: p };
    }
    const code = normalizeCode(raw);
    const wh = this.activeWarehouse(workspaceId);
    const loc = Object.values(this.db.locations).find((l) => l.workspace_id === workspaceId && l.warehouse_id === wh?.id && normalizeCode(l.code) === code);
    if (loc) return { type: 'location', location: loc };
    throw new ReadError('NOT_FOUND', `No pallet or location with code ${code}.`);
  }

  occupancy(workspaceId: string): Record<string, number> {
    const out: Record<string, number> = {};
    for (const p of Object.values(this.db.pallets)) {
      if (p.workspace_id === workspaceId && p.current_location_id) out[p.current_location_id] = (out[p.current_location_id] ?? 0) + 1;
    }
    return out;
  }

  jobCounts(workspaceId: string): Record<string, Record<string, number>> {
    const out: Record<string, Record<string, number>> = {};
    for (const p of Object.values(this.db.pallets)) {
      if (p.workspace_id !== workspaceId) continue;
      const c = (out[p.job_id] ??= {});
      c[p.state] = (c[p.state] ?? 0) + 1;
      if (p.hold && p.state !== 'RETIRED') c.HOLD = (c.HOLD ?? 0) + 1;
    }
    return out;
  }

  /** Reconciliation view (page 15). */
  reconciliation(actorId: string, workspaceId: string) {
    this.requireMember(actorId, workspaceId);
    const rows = this.rows(workspaceId).filter((r) => !r.pallet.archived_at);
    const byAge = (a: SearchRow, b: SearchRow) => a.pallet.updated_at.localeCompare(b.pallet.updated_at);
    return {
      unplaced: rows.filter((r) => r.pallet.state === 'RECEIVED').sort(byAge),
      missing: rows.filter((r) => r.pallet.state === 'MISSING').sort(byAge),
      holds: rows.filter((r) => r.pallet.hold && r.pallet.state !== 'RETIRED').sort(byAge),
      reprint: rows.filter((r) => r.pallet.label_needs_reprint && r.pallet.state !== 'RETIRED').sort(byAge),
    };
  }

  lineageOf(workspaceId: string, palletId: string): { parent: Pallet | null; children: Pallet[] } {
    const up = this.db.lineage.find((l) => l.workspace_id === workspaceId && l.child_id === palletId);
    const down = this.db.lineage.filter((l) => l.workspace_id === workspaceId && l.parent_id === palletId);
    return { parent: up ? this.db.pallets[up.parent_id] : null, children: down.map((l) => this.db.pallets[l.child_id]) };
  }

  /** Workspace-wide activity, newest first. */
  activity(actorId: string, workspaceId: string, limit = 200): PalletEvent[] {
    this.requireMember(actorId, workspaceId);
    const all: PalletEvent[] = [];
    for (const list of Object.values(this.db.events)) for (const e of list) if (e.workspace_id === workspaceId) all.push(e);
    all.sort((a, b) => (a.accepted_at < b.accepted_at ? 1 : a.accepted_at > b.accepted_at ? -1 : b.revision - a.revision));
    return all.slice(0, limit);
  }

  auditLog(actorId: string, workspaceId: string): AdminAudit[] {
    this.requireMember(actorId, workspaceId, 'SUPERVISOR');
    return this.db.audit.filter((a) => a.workspace_id === workspaceId).reverse();
  }

  /** Export rows (page 28). Supervisor/Owner only, checked here and not just by hiding a button. */
  exportData(actorId: string, workspaceId: string) {
    this.requireMember(actorId, workspaceId, 'SUPERVISOR');
    const wh = this.activeWarehouse(workspaceId);
    const loc = (id: string | null) => (id ? this.db.locations[id]?.code ?? '' : '');
    const generated_at = this.clock();
    const pallets = Object.values(this.db.pallets)
      .filter((p) => p.workspace_id === workspaceId)
      .sort((a, b) => a.code.localeCompare(b.code));
    const jobs = Object.values(this.db.jobs).filter((j) => j.workspace_id === workspaceId);
    const counts = this.jobCounts(workspaceId);
    const occ = this.occupancy(workspaceId);
    const users = this.db.users;
    return {
      manifest: { schema_version: 1, generated_at, workspace: this.db.workspaces[workspaceId]?.name, warehouse: wh?.code, warehouse_timezone: wh?.timezone, filters: 'none', timestamps: 'ISO 8601 UTC' },
      pallets: pallets.map((p) => ({
        pallet_id: p.id,
        pallet_code: p.code,
        job_id: p.job_id,
        job_code: this.db.jobs[p.job_id]?.code,
        warehouse: wh?.code,
        state: p.state,
        hold: p.hold ? 'yes' : 'no',
        hold_reason: p.hold?.reason ?? '',
        current_rack: loc(p.current_location_id),
        last_confirmed_rack: loc(p.last_confirmed_location_id),
        last_confirmed_at: p.last_confirmed_at ?? '',
        description: p.description,
        version: p.version,
        received_at: p.received_at,
        archived_at: p.archived_at ?? '',
      })),
      events: pallets.flatMap((p) =>
        (this.db.events[p.id] ?? []).map((e) => ({
          event_id: e.id,
          pallet_id: p.id,
          pallet_code: p.code,
          revision: e.revision,
          type: e.type,
          actor_id: e.actor_id,
          actor_name: users[e.actor_id]?.name ?? '',
          accepted_at: e.accepted_at,
          observed_at: e.observed_at ?? '',
          previous_state: e.before_state?.state ?? '',
          new_state: e.after_state.state,
          previous_location: e.before_state?.current_location_code ?? '',
          new_location: e.after_state.current_location_code ?? '',
          reason: e.reason ?? '',
          command_id: e.command_id,
        })),
      ),
      locations: Object.values(this.db.locations)
        .filter((l) => l.workspace_id === workspaceId)
        .sort((a, b) => a.code.localeCompare(b.code))
        .map((l) => ({ location_id: l.id, code: l.code, kind: l.kind, active: l.active ? 'yes' : 'no', warehouse: wh?.code, recorded_pallets: occ[l.id] ?? 0 })),
      jobs: jobs
        .sort((a, b) => a.code.localeCompare(b.code))
        .map((j) => {
          const c = counts[j.id] ?? {};
          const changed = pallets.filter((p) => p.job_id === j.id).reduce((m, p) => (p.updated_at > m ? p.updated_at : m), j.updated_at);
          return {
            job_id: j.id,
            job_code: j.code,
            job_name: j.name,
            status: j.status,
            received: c.RECEIVED ?? 0,
            stored: c.STORED ?? 0,
            dispatched: c.DISPATCHED ?? 0,
            missing: c.MISSING ?? 0,
            retired: c.RETIRED ?? 0,
            on_hold: c.HOLD ?? 0,
            last_changed_at: changed,
          };
        }),
    };
  }
}
