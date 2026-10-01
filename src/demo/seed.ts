import { DEFAULT_SETUP } from '../domain/terms';
// Deterministic fictional warehouses (blueprint page 29).
// Every record is produced by running real commands through the engine, never by writing
// snapshots directly, so the fixture obeys the same rules the app enforces.
// All companies, people, jobs, and contents are invented.

import { mulberry32, uuid, generateToken } from '../domain/codes';
import type { CommandEnvelope, CommandKind, Job, Location, LocationKind, Pallet, User } from '../domain/types';
import { Engine, emptyDb, type Db } from './engine';

export const DEFAULT_SEED = 214;
export const FIXTURE_SCHEMA_VERSION = 1;

export type FixtureName = 'tiny' | 'scenario' | 'fresh';

export interface FixtureInfo {
  name: FixtureName;
  seed: number;
  schema_version: number;
  workspaces: { id: string; name: string }[];
  users: { id: string; name: string; role: string; workspace: string }[];
}

export const DEMO_USERS: User[] = [
  { id: 'user-owner', name: 'Demo Owner', email: 'owner@sample.example' },
  { id: 'user-supervisor', name: 'Demo Manager', email: 'manager@sample.example' },
  { id: 'user-operator', name: 'Demo Operator', email: 'operator@sample.example' },
  { id: 'user-viewer', name: 'Demo Viewer', email: 'viewer@sample.example' },
];

const JOBS: [string, string, string][] = [
  ['J-214', 'School renovation', 'Maple Street school, north loading door'],
  ['J-215', 'School renovation phase 2', 'Maple Street school, gym entrance'],
  ['J-198', 'Clinic fit-out', 'Riverside clinic, rear dock'],
  ['J-203', 'Library HVAC upgrade', 'Central library, service alley'],
  ['J-221', 'Office lobby remodel', 'Harbor office tower, basement dock'],
  ['J-226', 'Parking garage lighting', 'Civic garage, level P1'],
  ['J-230', 'Fire station reroof', 'Station 7, apparatus bay'],
  ['J-233', 'Community pool', 'Westside pool, equipment room'],
  ['J-237', 'Transit shelter retrofit', 'Route 12 shelters, yard staging'],
  ['J-190', 'Courthouse doors', 'County courthouse, east service door'],
];

const RACKS = ['A-01-01', 'A-01-02', 'A-02-01', 'A-02-02', 'A-03-01', 'A-03-02', 'B-01-01', 'B-01-02', 'B-02-01', 'B-02-02'];

type Step =
  | ['place', string]
  | ['move', string]
  | ['verify']
  | ['dispatch', string]
  | ['missing', string]
  | ['hold', string]
  | ['retire', string];

/** The tiny fixture: 30 pallets, 10 jobs, 12 locations, 4 role accounts. */
const TINY_PALLETS: [string, string, Step[]][] = [
  ['J-214', 'Door hardware', [['place', 'A-02-02'], ['move', 'B-01-01']]],
  ['J-214', 'Ceiling tile', []],
  ['J-215', 'Lighting fixtures', [['place', 'A-01-01']]],
  ['J-215', 'Door hardware', [['place', 'A-01-02']]],
  ['J-198', 'Plumbing fixtures', [['place', 'A-03-01']]],
  ['J-198', 'Copper pipe fittings', [['place', 'A-03-01']]],
  ['J-198', 'Medical casework', [['place', 'B-02-01'], ['hold', 'Crushed corner. Inspect before use.']]],
  ['J-203', 'HVAC diffusers', [['place', 'B-01-02']]],
  ['J-203', 'Ductwork sections', [['place', 'B-01-02'], ['verify']]],
  ['J-203', 'Insulation batts', [['place', 'RECEIVING-01'], ['dispatch', 'Central library, service alley']]],
  ['J-221', 'Floor tile', [['place', 'A-02-01']]],
  ['J-221', 'Floor tile', [['place', 'A-02-01']]],
  ['J-221', 'Lobby light fixtures', [['place', 'B-02-02']]],
  ['J-221', 'Glass door hardware', [['place', 'A-03-02'], ['missing', 'Not at A-03-02 during the Friday count.']]],
  ['J-226', 'LED high-bay lights', [['place', 'B-02-02']]],
  ['J-226', 'Electrical conduit', [['place', 'A-01-01']]],
  ['J-226', 'Wire spools', [['place', 'A-01-02'], ['move', 'B-02-01']]],
  ['J-230', 'Roofing membrane', [['place', 'B-01-01']]],
  ['J-230', 'Roof insulation board', [['place', 'A-02-02']]],
  ['J-230', 'Flashing and trim', [['hold', 'Wrong color delivered. Waiting on supplier.']]],
  ['J-233', 'Pool tile', [['place', 'A-03-01']]],
  ['J-233', 'Pump assembly', [['place', 'B-02-01']]],
  ['J-233', 'Chemical feeder', [['place', 'A-02-01'], ['missing', 'Not found during rack check.']]],
  ['J-237', 'Shelter glass panels', [['place', 'A-01-02']]],
  ['J-237', 'Anchor bolts', [['place', 'B-01-02']]],
  ['J-237', 'Bench kits', []],
  ['J-190', 'Courthouse door slabs', [['place', 'RECEIVING-01'], ['dispatch', 'County courthouse, east service door']]],
  ['J-190', 'Door frames', [['place', 'A-03-02'], ['dispatch', 'County courthouse, east service door']]],
  ['J-215', 'Drywall screws', [['place', 'B-02-02'], ['retire', 'Duplicate record entered by mistake.']]],
  ['J-198', 'Plumbing fixtures', [['place', 'A-02-02']]],
];

/** Builds commands with deterministic IDs and a controllable clock. */
class Driver {
  engine: Engine;
  t: number;
  rand: () => number;
  ws!: string;
  jobs = new Map<string, Job>();
  locs = new Map<string, Location>();

  constructor(
    public db: Db,
    seed: number,
    start: number,
  ) {
    this.rand = mulberry32(seed);
    this.t = start;
    this.engine = new Engine(db, {
      clock: () => new Date(this.t).toISOString(),
      newId: () => uuid(this.rand),
      newToken: () => generateToken(this.rand),
    });
  }

  tick(minMinutes: number, maxMinutes: number) {
    this.t += Math.round((minMinutes + this.rand() * (maxMinutes - minMinutes)) * 60_000);
  }

  run(actor: string, kind: CommandKind, payload: Record<string, unknown>, pallet?: Pallet): Pallet | null {
    const cmd: CommandEnvelope = {
      schema_version: 1,
      command_id: uuid(this.rand),
      workspace_id: this.ws,
      kind,
      payload,
      ...(pallet ? { pallet_id: pallet.id, expected_version: this.db.pallets[pallet.id].version } : {}),
    };
    const r = this.engine.execute(actor, cmd);
    if (!r.ok) throw new Error(`fixture command ${kind} failed: ${r.code} ${r.message}`);
    return r.current_state;
  }

  setupWorkspace(owner: User, name: string, others: [User, 'SUPERVISOR' | 'OPERATOR' | 'VIEWER'][], facility = { code: 'WH-01', name: 'Main yard' }) {
    const { workspace } = this.engine.createWorkspace(owner, name, { ...facility, timezone: 'America/Chicago' });
    this.ws = workspace.id;
    // The sample is a pallet yard that has already answered "What do you store?".
    for (const w of Object.values(this.db.warehouses)) if (w.workspace_id === this.ws) w.setup = { ...DEFAULT_SETUP, preset: 'pallets' };
    for (const [u, role] of others) this.engine.addMember(this.ws, u, role);
    return workspace;
  }

  addLocations(actor: string, codes: [string, LocationKind][]) {
    for (const [code, kind] of codes) {
      const r = this.engine.execute(actor, { schema_version: 1, command_id: uuid(this.rand), workspace_id: this.ws, kind: 'create_location', payload: { code, kind } });
      if (!r.ok) throw new Error(r.message);
      this.locs.set(code, this.db.locations[r.target_id!]);
    }
  }

  addJobs(actor: string, jobs: [string, string, string][]) {
    for (const [code, name, dest] of jobs) {
      const r = this.engine.execute(actor, { schema_version: 1, command_id: uuid(this.rand), workspace_id: this.ws, kind: 'create_job', payload: { code, name, destination_notes: dest } });
      if (!r.ok) throw new Error(r.message);
      this.jobs.set(code, this.db.jobs[r.target_id!]);
    }
  }

  apply(actor: string, supervisor: string, p: Pallet, step: Step): Pallet {
    const cur = this.db.pallets[p.id];
    switch (step[0]) {
      case 'place':
        return this.run(actor, 'place', { location_id: this.locs.get(step[1])!.id }, cur)!;
      case 'move':
        return this.run(actor, 'move', { location_id: this.locs.get(step[1])!.id }, cur)!;
      case 'verify':
        return this.run(actor, 'verify_location', { location_id: cur.current_location_id }, cur)!;
      case 'dispatch':
        return this.run(actor, 'dispatch', { destination: step[1] }, cur)!;
      case 'missing':
        return this.run(actor, 'mark_missing', { reason: step[1] }, cur)!;
      case 'hold':
        return this.run(actor, 'apply_hold', { reason: step[1] }, cur)!;
      case 'retire':
        return this.run(supervisor, 'retire', { reason: step[1] }, cur)!;
    }
  }
}

function dayStart(now: number, daysAgo: number, hour: number): number {
  const d = new Date(now);
  d.setHours(hour, 0, 0, 0);
  return d.getTime() - daysAgo * 86_400_000;
}

export function seedTiny(opts: { now?: number; seed?: number } = {}): Db {
  const seed = opts.seed ?? DEFAULT_SEED;
  const now = opts.now ?? Date.now();
  const db = emptyDb();
  db.seed = seed;
  const d = new Driver(db, seed, dayStart(now, 6, 7));
  const [dana, marcus, priya, tom] = DEMO_USERS;
  d.setupWorkspace(dana, 'Sample warehouse', [
    [marcus, 'SUPERVISOR'],
    [priya, 'OPERATOR'],
    [tom, 'VIEWER'],
  ]);
  d.addLocations(dana.id, [['RECEIVING-01', 'RECEIVING'], ['QUARANTINE-01', 'QUARANTINE'], ...RACKS.map((c) => [c, 'RACK'] as [string, LocationKind])]);
  d.addJobs(marcus.id, JOBS);
  // Start pallet numbering so the walkthrough's first receipt becomes P-000042.
  db.counters[d.ws] = 11;

  // Day 1-3: receipts with most placements shortly after.
  const created: Pallet[] = [];
  const plans = TINY_PALLETS;
  plans.forEach(([job, description, steps], i) => {
    if (i === 10) d.t = dayStart(now, 5, 7);
    if (i === 20) d.t = dayStart(now, 4, 7);
    d.tick(8, 25);
    const p = d.run(priya.id, 'receive', { job_id: d.jobs.get(job)!.id, description })!;
    created.push(p);
    const first = steps[0];
    if (first && (first[0] === 'place' || first[0] === 'hold')) {
      d.tick(3, 15);
      d.apply(priya.id, marcus.id, p, first);
    }
  });
  // Day 5-6: the follow-up actions.
  d.t = dayStart(now, 2, 8);
  plans.forEach(([, , steps], i) => {
    const rest = steps[0] && (steps[0][0] === 'place' || steps[0][0] === 'hold') ? steps.slice(1) : steps;
    for (const s of rest) {
      d.tick(10, 50);
      d.apply(priya.id, marcus.id, created[i], s);
    }
  });
  // J-190 is fully dispatched, so it can be closed: the closed-job case (F02).
  d.t = dayStart(now, 1, 16);
  const r = d.engine.execute(marcus.id, { schema_version: 1, command_id: uuid(d.rand), workspace_id: d.ws, kind: 'close_job', payload: { job_id: d.jobs.get('J-190')!.id, reason: 'All material delivered.' } });
  if (!r.ok) throw new Error(r.message);
  return db;
}

/**
 * The scenario fixture: 200 pallets in workspace A (140 stored, 20 received, 20 dispatched,
 * 10 missing, 10 retired, 8 holds) plus workspace B that reuses readable codes to test isolation.
 */
export function seedScenario(opts: { now?: number; seed?: number } = {}): Db {
  const seed = opts.seed ?? DEFAULT_SEED;
  const now = opts.now ?? Date.now();
  const db = emptyDb();
  db.seed = seed;
  const d = new Driver(db, seed, dayStart(now, 20, 7));
  const [dana, marcus, priya, tom] = DEMO_USERS;
  d.setupWorkspace(dana, 'Sample warehouse', [
    [marcus, 'SUPERVISOR'],
    [priya, 'OPERATOR'],
    [tom, 'VIEWER'],
  ]);
  d.addLocations(dana.id, [['RECEIVING-01', 'RECEIVING'], ['QUARANTINE-01', 'QUARANTINE'], ...RACKS.map((c) => [c, 'RACK'] as [string, LocationKind])]);
  d.addJobs(marcus.id, JOBS.slice(0, 9).concat([['J-241', 'Warehouse mezzanine', 'Own yard, building 2']]));
  const descs = ['Lighting fixtures', 'Door hardware', 'Floor tile', 'Ceiling tile', 'Drywall screws', 'Copper pipe fittings', 'Electrical conduit', 'Plumbing fixtures', 'HVAC diffusers', 'Insulation batts', 'Anchor bolts', 'Wire spools'];
  const jobs = [...d.jobs.values()];
  const plan: string[] = [
    ...Array(140).fill('STORED'),
    ...Array(20).fill('RECEIVED'),
    ...Array(20).fill('DISPATCHED'),
    ...Array(10).fill('MISSING'),
    ...Array(10).fill('RETIRED'),
  ];
  // Deterministic shuffle so states are spread over time and jobs.
  for (let i = plan.length - 1; i > 0; i--) {
    const j = Math.floor(d.rand() * (i + 1));
    [plan[i], plan[j]] = [plan[j], plan[i]];
  }
  const racks = RACKS.map((c) => d.locs.get(c)!);
  let holds = 0;
  plan.forEach((target, i) => {
    d.tick(20, 140);
    const job = jobs[Math.floor(d.rand() * jobs.length)];
    let p = d.run(priya.id, 'receive', { job_id: job.id, description: descs[Math.floor(d.rand() * descs.length)] })!;
    if (target === 'RECEIVED') {
      if (holds < 3 && i % 3 === 0) {
        p = d.run(priya.id, 'apply_hold', { reason: 'Inspection pending.' }, p)!;
        holds++;
      }
      return;
    }
    d.tick(2, 20);
    p = d.run(priya.id, 'place', { location_id: racks[Math.floor(d.rand() * racks.length)].id }, p)!;
    if (d.rand() < 0.3) {
      d.tick(30, 600);
      const choices = racks.filter((r) => r.id !== p.current_location_id);
      p = d.run(priya.id, 'move', { location_id: choices[Math.floor(d.rand() * choices.length)].id }, p)!;
    }
    if (target === 'STORED' && holds < 8 && i % 11 === 0) {
      p = d.run(priya.id, 'apply_hold', { reason: 'Damaged wrap. Inspect.' }, p)!;
      holds++;
    }
    if (target === 'DISPATCHED') p = d.run(priya.id, 'dispatch', { destination: job.destination_notes ?? job.name }, p)!;
    if (target === 'MISSING') p = d.run(priya.id, 'mark_missing', { reason: 'Not found during cycle count.' }, p)!;
    if (target === 'RETIRED') p = d.run(marcus.id, 'retire', { reason: 'Consolidated during cleanup.' }, p)!;
  });
  // Top up holds on stored pallets deterministically if the spread fell short.
  for (const p of Object.values(db.pallets)) {
    if (holds >= 8) break;
    if (p.state === 'STORED' && !p.hold) {
      d.run(marcus.id, 'apply_hold', { reason: 'Quality check.' }, p);
      holds++;
    }
  }

  // Workspace B reuses readable codes (J-214, A-03-02, P-000001...) under different identities.
  const rosa: User = { id: 'user-harbor', name: 'Second warehouse owner', email: 'owner@harborline.example' };
  const wsA = d.ws;
  d.jobs = new Map();
  d.locs = new Map();
  d.setupWorkspace(rosa, 'Second sample warehouse', [[marcus, 'VIEWER']]);
  d.addLocations(rosa.id, [['RECEIVING-01', 'RECEIVING'], ['A-03-02', 'RACK'], ['B-01-01', 'RACK']]);
  d.addJobs(rosa.id, [['J-214', 'Marina boardwalk', 'Pier 4'], ['J-300', 'Ferry terminal', 'Terminal B']]);
  for (let i = 0; i < 12; i++) {
    d.tick(30, 90);
    const p = d.run(rosa.id, 'receive', { job_id: [...d.jobs.values()][i % 2].id, description: i % 2 ? 'Marine hardware' : 'Lighting fixtures' })!;
    if (i % 3 !== 0) d.run(rosa.id, 'place', { location_id: [...d.locs.values()][1 + (i % 2)].id }, p);
  }
  d.ws = wsA;
  return db;
}

export function fixtureInfo(db: Db, name: FixtureName): FixtureInfo {
  return {
    name,
    seed: db.seed ?? DEFAULT_SEED,
    schema_version: FIXTURE_SCHEMA_VERSION,
    workspaces: Object.values(db.workspaces).map((w) => ({ id: w.id, name: w.name })),
    users: db.memberships.map((m) => ({ id: m.user_id, name: db.users[m.user_id]?.name ?? m.user_id, role: m.role, workspace: db.workspaces[m.workspace_id]?.name ?? '' })),
  };
}

export function seedFixture(name: FixtureName, opts: { now?: number; seed?: number } = {}): Db {
  return name === 'scenario' ? seedScenario(opts) : name === 'fresh' ? seedFresh() : seedTiny(opts);
}

/** A brand-new self-serve warehouse, locked to the setup wizard, for practicing setup in the sample. */
export function seedFresh(): Db {
  const db = emptyDb();
  const engine = new Engine(db);
  const [owner, manager, employee] = DEMO_USERS;
  const { workspace } = engine.createWorkspace(owner, 'My new warehouse', { code: 'WH-01', name: 'My new warehouse', timezone: 'America/New_York', onboarding: true });
  engine.addMember(workspace.id, manager, 'SUPERVISOR');
  engine.addMember(workspace.id, employee, 'OPERATOR');
  return db;
}

/** The public sample is deliberately small; stress fixtures remain available to development tests. */
export function seedSample():Db{
 const db=emptyDb(),d=new Driver(db,DEFAULT_SEED,dayStart(Date.now(),1,9));const [owner,manager,employee,viewer]=DEMO_USERS;
 d.setupWorkspace(owner,'Sample warehouse',[[manager,'SUPERVISOR'],[employee,'OPERATOR'],[viewer,'VIEWER']]);
 d.addJobs(manager.id,[['JOB-1','Example job 1','Example delivery address'],['JOB-2','Example job 2','Example delivery address']]);
 d.addLocations(owner.id,[['A-01-01','RACK'],['A-01-02','RACK'],['B-01-01','RACK'],['RECEIVING-01','RECEIVING']]);
 for(let i=1;i<=6;i++){
  let p=d.run(employee.id,'receive',{job_id:d.jobs.get(i<=3?'JOB-1':'JOB-2')!.id,description:`Example pallet ${i}`})!;
  if(i!==2)p=d.run(employee.id,'place',{location_id:d.locs.get(i<=3?'A-01-01':'A-01-02')!.id},p)!;
  if(i===1)d.run(employee.id,'move',{location_id:d.locs.get('B-01-01')!.id},p);
  if(i===5)d.run(employee.id,'apply_hold',{reason:'Example: waiting for a damage check.'},p);
  if(i===6)d.run(employee.id,'dispatch',{destination:'Example job 2'},p);
 }
 // A second warehouse in the same account, so Transfers can be tried. Its pallet numbers start at 101,
 // so codes stay distinct from the main yard's while pallets move between the two.
 const main=d.ws;d.jobs=new Map();d.locs=new Map();
 d.setupWorkspace(owner,'Overflow yard',[[manager,'SUPERVISOR'],[employee,'OPERATOR'],[viewer,'VIEWER']],{code:'WH-02',name:'Overflow yard'});
 d.addJobs(manager.id,[['JOB-1','Example job 1','Example delivery address']]);
 d.addLocations(owner.id,[['RECEIVING-01','RECEIVING'],['C-01-01','RACK'],['C-01-02','RACK']]);
 db.counters[d.ws]=100;
 for(let i=1;i<=3;i++){
  const p=d.run(employee.id,'receive',{job_id:d.jobs.get('JOB-1')!.id,description:`Overflow pallet ${i}`})!;
  d.run(employee.id,'place',{location_id:d.locs.get(i===3?'C-01-02':'C-01-01')!.id},p);
 }
 d.ws=main;
 return db;
}
