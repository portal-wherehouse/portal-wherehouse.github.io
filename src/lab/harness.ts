// Test harness shared by the in-app Integrity Lab and the Vitest suite.
// Every scenario runs against its own freshly seeded engine, never the user's warehouse.

import { uuid } from '../domain/codes';
import type { CommandEnvelope, CommandKind, CommandResult, Job, Location, Pallet } from '../domain/types';
import { Engine, type Db } from '../demo/engine';
import { DEMO_USERS, seedTiny } from '../demo/seed';

export const FIXED_NOW = Date.UTC(2026, 8, 23, 17, 0, 0);

export class AssertionFailed extends Error {}

export interface EvidenceLine {
  label: string;
  detail: string;
  ok?: boolean;
}

export class Harness {
  engine: Engine;
  db: Db;
  ws: string;
  lines: EvidenceLine[] = [];
  t: number;
  users = {
    owner: DEMO_USERS[0].id,
    supervisor: DEMO_USERS[1].id,
    operator: DEMO_USERS[2].id,
    viewer: DEMO_USERS[3].id,
  };

  constructor(db?: Db) {
    this.db = db ?? seedTiny({ now: FIXED_NOW });
    this.t = FIXED_NOW;
    this.engine = new Engine(this.db, { clock: () => new Date((this.t += 60_000)).toISOString() });
    this.ws = Object.values(this.db.workspaces).find((w) => w.name === 'Northfield Builders')!.id;
  }

  note(label: string, detail: string, ok?: boolean) {
    this.lines.push({ label, detail, ok });
  }

  expect(cond: unknown, label: string, detail = '') {
    this.lines.push({ label, detail, ok: !!cond });
    if (!cond) throw new AssertionFailed(`${label}${detail ? `: ${detail}` : ''}`);
  }

  equal<T>(actual: T, expected: T, label: string) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    this.lines.push({ label, detail: ok ? `= ${fmt(expected)}` : `expected ${fmt(expected)}, got ${fmt(actual)}`, ok });
    if (!ok) throw new AssertionFailed(`${label}: expected ${fmt(expected)}, got ${fmt(actual)}`);
  }

  envelope(kind: CommandKind, payload: Record<string, unknown>, pallet?: Pallet | null, opts: { commandId?: string; expectedVersion?: number; ws?: string } = {}): CommandEnvelope {
    return {
      schema_version: 1,
      command_id: opts.commandId ?? uuid(),
      workspace_id: opts.ws ?? this.ws,
      kind,
      payload,
      ...(pallet ? { pallet_id: pallet.id, expected_version: opts.expectedVersion ?? this.db.pallets[pallet.id]?.version ?? pallet.version } : {}),
    };
  }

  cmd(actor: string, kind: CommandKind, payload: Record<string, unknown>, pallet?: Pallet | null, opts: { commandId?: string; expectedVersion?: number; ws?: string } = {}): CommandResult {
    return this.engine.execute(actor, this.envelope(kind, payload, pallet, opts));
  }

  job(code: string, ws = this.ws): Job {
    const j = Object.values(this.db.jobs).find((x) => x.code === code && x.workspace_id === ws);
    if (!j) throw new Error(`job ${code} missing`);
    return j;
  }

  loc(code: string, ws = this.ws): Location {
    const l = Object.values(this.db.locations).find((x) => x.code === code && x.workspace_id === ws);
    if (!l) throw new Error(`location ${code} missing`);
    return l;
  }

  pallet(code: string, ws = this.ws): Pallet {
    const p = Object.values(this.db.pallets).find((x) => x.code === code && x.workspace_id === ws);
    if (!p) throw new Error(`pallet ${code} missing`);
    return p;
  }

  fresh(p: Pallet): Pallet {
    return this.db.pallets[p.id];
  }

  events(p: Pallet) {
    return this.db.events[p.id] ?? [];
  }

  eventCount(): number {
    return Object.values(this.db.events).reduce((n, l) => n + l.length, 0);
  }

  /** Create a pallet for a job through the receive command. */
  receive(jobCode: string, description: string, actor = this.users.operator): Pallet {
    const r = this.cmd(actor, 'receive', { job_id: this.job(jobCode).id, description });
    if (!r.ok) throw new AssertionFailed(`receive failed: ${r.message}`);
    return r.current_state!;
  }
}

function fmt(v: unknown): string {
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
}

export interface ScenarioResult {
  id: string;
  pass: boolean;
  ms: number;
  lines: EvidenceLine[];
  error: string | null;
}

export interface Scenario {
  id: string;
  group: 'Walkthrough' | 'Functional' | 'Database & retries' | 'Security' | 'Offline' | 'Import & export' | 'Labels & search' | 'Invariants' | 'Performance';
  title: string;
  page: number;
  /** Plain-language description of what is being proven. */
  proves: string;
  run: (h: Harness) => void | Promise<void>;
  /** Build a different starting database, when the default tiny fixture is not enough. */
  setup?: () => Db;
}

export async function runScenario(s: Scenario): Promise<ScenarioResult> {
  const started = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const h = new Harness(s.setup ? s.setup() : undefined);
  try {
    await s.run(h);
    return { id: s.id, pass: true, ms: elapsed(started), lines: h.lines, error: null };
  } catch (err) {
    return { id: s.id, pass: false, ms: elapsed(started), lines: h.lines, error: err instanceof Error ? err.message : String(err) };
  }
}

function elapsed(start: number) {
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return Math.round((now - start) * 10) / 10;
}
