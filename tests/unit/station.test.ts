// Scan station rules: what each scan means per mode, put-away planning, count classification,
// and that the commands they produce pass the real engine (seeded tiny fixture).
import { describe, expect, it } from 'vitest';
import { Engine } from '../../src/demo/engine';
import { seedFixture } from '../../src/demo/seed';
import { makeLabelPayload, uuid } from '../../src/domain/codes';
import type { CommandEnvelope, Location, Pallet, Role } from '../../src/domain/types';
import {
  agoLong,
  canMarkMissing,
  canRecordFound,
  classifyCount,
  commandFor,
  initialStation,
  isDoubleRead,
  makeCtx,
  modeAccess,
  modeFromQuery,
  outcomeToResult,
  planLine,
  promptFor,
  readScan,
  stationReducer,
  unsavedWork,
  whereLine,
  type CommandSpec,
  type LineResult,
  type StationAction,
  type StationState,
  type Step,
} from '../../src/features/station/logic';

const NOW = Date.UTC(2026, 8, 23, 17, 0, 0);
const USERS: Record<Role, string> = { OWNER: 'user-owner', SUPERVISOR: 'user-supervisor', OPERATOR: 'user-operator', VIEWER: 'user-viewer' };

function setup(role: Role = 'OPERATOR', confirmByRescan = true) {
  const db = seedFixture('tiny', { now: NOW });
  const engine = new Engine(db);
  const ws = Object.values(db.workspaces).find((w) => w.name === 'Northfield Builders')!.id;
  const actor = USERS[role];
  let t = NOW;
  const ctx = () => makeCtx(engine.db, ws, role, confirmByRescan);
  const pallet = (pred: (p: Pallet) => boolean): Pallet => {
    const p = Object.values(engine.db.pallets).find((x) => x.workspace_id === ws && pred(x));
    if (!p) throw new Error('no such pallet in the fixture');
    return p;
  };
  const byCode = (code: string) => pallet((p) => p.code === code);
  const loc = (code: string): Location => Object.values(engine.db.locations).find((l) => l.workspace_id === ws && l.code === code)!;
  const label = (p: Pallet | Location) => makeLabelPayload('code' in p && 'job_id' in p ? 'P' : 'L', engine.activeLabel(p.id)!.token);
  /** Scan a code a comfortable second after the last one. */
  const scan = (s: StationState, text: string, gapMs = 1000): Step => {
    t += gapMs;
    const scanned = readScan(text, (x) => engine.resolve(actor, ws, x));
    return stationReducer(s, { type: 'SCAN', raw: text, source: 'wedge', at: t, scanned }, ctx());
  };
  const act = (s: StationState, a: StationAction): Step => stationReducer(s, a, ctx());
  /** Run a planned command through the engine the way the station does, with the version seen at scan time. */
  const exec = (spec: CommandSpec, as = actor): LineResult => {
    const id = uuid();
    const cmd: CommandEnvelope = { schema_version: 1, command_id: id, workspace_id: ws, kind: spec.kind, pallet_id: spec.pallet.id, expected_version: spec.expectedVersion, payload: spec.payload };
    return outcomeToResult({ status: 'result', result: engine.execute(as, cmd) }, id);
  };
  /** Another person changes a pallet directly (bumps its version). */
  const otherMoves = (p: Pallet, to: Location) => {
    const cur = engine.db.pallets[p.id];
    const r = engine.execute(USERS.SUPERVISOR, {
      schema_version: 1,
      command_id: uuid(),
      workspace_id: ws,
      kind: 'move',
      pallet_id: cur.id,
      expected_version: cur.version,
      payload: { location_id: to.id },
    });
    expect(r.ok).toBe(true);
  };
  return { db, engine, ws, actor, ctx, pallet, byCode, loc, label, scan, act, exec, otherMoves };
}

describe('Scan station: modes and roles', () => {
  it('lets a Viewer look up only, and explains why', () => {
    expect(modeAccess('VIEWER', 'lookup').ok).toBe(true);
    for (const m of ['move', 'putaway', 'count'] as const) {
      const a = modeAccess('VIEWER', m);
      expect(a.ok).toBe(false);
      if (!a.ok) expect(a.reason).toMatch(/Operator/);
    }
    for (const m of ['lookup', 'move', 'putaway', 'count'] as const) expect(modeAccess('OPERATOR', m).ok).toBe(true);
    expect(modeAccess(null, 'lookup').ok).toBe(false);
  });

  it('keeps Mark missing and Record found for supervisors and owners', () => {
    expect(canMarkMissing('OPERATOR')).toBe(false);
    expect(canMarkMissing('SUPERVISOR')).toBe(true);
    expect(canMarkMissing('OWNER')).toBe(true);
    expect(canMarkMissing('VIEWER')).toBe(false);
    expect(canRecordFound('OPERATOR')).toBe(false);
    expect(canRecordFound('SUPERVISOR')).toBe(true);
  });

  it('reads a preselected mode from the route and switches modes from command barcodes', () => {
    expect(modeFromQuery('count')).toBe('count');
    expect(modeFromQuery('Put-away')).toBe('putaway');
    expect(modeFromQuery('lookup')).toBe('lookup');
    expect(modeFromQuery('nonsense')).toBeNull();
    expect(modeFromQuery(undefined)).toBeNull();

    const op = setup('OPERATOR');
    const r = op.scan(initialStation(), 'CMD:MODE_PUTAWAY');
    expect(r.state.mode).toBe('putaway');
    expect(r.verdict).toBe(true);

    const viewer = setup('VIEWER');
    const v = viewer.scan(initialStation(), 'CMD:MODE_MOVE');
    expect(v.state.mode).toBe('lookup');
    expect(v.verdict).toBe('error');
    expect(v.state.log[0].text).toMatch(/Operator/);
  });

  it('reads command barcodes, labels, typed codes and unknown codes', () => {
    const { engine, ws, actor, byCode, loc, label } = setup();
    const resolve = (x: string) => engine.resolve(actor, ws, x);
    expect(readScan('CMD:FINISH', resolve)).toEqual({ type: 'command', command: 'FINISH' });
    expect(readScan('cmd:confirm', resolve)).toEqual({ type: 'command', command: 'CONFIRM' });
    expect(readScan('CMD:LAUNCH', resolve).type).toBe('unknown');
    const p = byCode('P-000016');
    const byLabel = readScan(label(p), resolve);
    expect(byLabel.type === 'pallet' && byLabel.pallet.id).toBe(p.id);
    const typed = readScan('a-03-01', resolve);
    expect(typed.type === 'location' && typed.location.id).toBe(loc('A-03-01').id);
    const unknown = readScan('P-999999', resolve);
    expect(unknown.type).toBe('unknown');
    if (unknown.type === 'unknown') expect(unknown.message).toMatch(/No pallet or location/);
  });

  it('treats a repeat of the same code within a moment as one scan', () => {
    expect(isDoubleRead({ raw: 'A', at: 1000 }, 'A', 1300, 'wedge')).toBe(true);
    expect(isDoubleRead({ raw: 'A', at: 1000 }, 'A', 1700, 'wedge')).toBe(false);
    expect(isDoubleRead({ raw: 'A', at: 1000 }, 'B', 1100, 'wedge')).toBe(false);
    expect(isDoubleRead({ raw: 'A', at: 1000 }, 'A', 3000, 'camera')).toBe(true);
    const { scan } = setup();
    const first = scan(initialStation(), 'A-03-01');
    const again = scan(first.state, 'A-03-01', 200);
    expect(again.state).toBe(first.state);
  });
});

describe('Scan station: Look up', () => {
  it('shows where a pallet was last confirmed and what a rack holds', () => {
    const { scan, byCode, ctx, loc } = setup('VIEWER');
    const p = byCode('P-000016');
    const a = scan(initialStation(), p.code);
    expect(a.state.lookup).toEqual({ type: 'pallet', id: p.id });
    expect(a.state.flash?.text).toBe('At A-03-01');
    expect(whereLine(p, ctx().codeOf, Date.parse(p.last_confirmed_at!) + 2 * 3600_000)).toBe('Last confirmed at A-03-01, 2 hours ago');

    const b = scan(a.state, 'A-03-01');
    expect(b.state.lookup).toEqual({ type: 'location', id: loc('A-03-01').id });
    expect(b.state.flash?.text).toBe('3 pallets recorded here');

    const c = scan(b.state, 'Z-99-99');
    expect(c.verdict).toBe('error');
    expect(c.state.lookup?.type).toBe('unknown');
    expect(c.state.log).toHaveLength(3);
  });

  it('words every state honestly', () => {
    const { pallet, ctx } = setup();
    const codeOf = ctx().codeOf;
    expect(
      whereLine(
        pallet((p) => p.state === 'RECEIVED'),
        codeOf,
      ),
    ).toMatch(/^Not placed yet/);
    expect(
      whereLine(
        pallet((p) => p.state === 'MISSING' && !!p.last_confirmed_location_id),
        codeOf,
      ),
    ).toMatch(/^Marked missing. It was last confirmed at [AB]-/);
    expect(
      whereLine(
        pallet((p) => p.state === 'DISPATCHED'),
        codeOf,
      ),
    ).toMatch(/^Dispatched/);
    expect(agoLong(new Date(NOW - 30_000).toISOString(), NOW)).toBe('just now');
    expect(agoLong(new Date(NOW - 60_000).toISOString(), NOW)).toBe('1 minute ago');
    expect(agoLong(new Date(NOW - 5 * 60_000).toISOString(), NOW)).toBe('5 minutes ago');
    expect(agoLong(new Date(NOW - 3600_000).toISOString(), NOW)).toBe('1 hour ago');
    expect(agoLong(new Date(NOW - 3 * 86400_000).toISOString(), NOW)).toBe('3 days ago');
    expect(agoLong(null, NOW)).toBe('never');
  });
});

describe('Scan station: Move', () => {
  it('places a received pallet: pallet, rack, then the same rack again confirms', () => {
    const { scan, act, exec, pallet, loc, engine } = setup();
    const p = pallet((x) => x.state === 'RECEIVED' && !x.hold);
    let s = act(initialStation(), { type: 'MODE', mode: 'move' }).state;
    expect(promptFor(s, { confirmByRescan: true }).text).toBe('Scan a pallet');

    const rackFirst = scan(s, 'B-02-02');
    expect(rackFirst.verdict).toBe('error');
    expect(rackFirst.state.flash?.text).toMatch(/Scan the pallet first/);

    s = scan(s, p.code).state;
    expect(s.move.phase).toBe('rack');
    expect(promptFor(s, { confirmByRescan: true }).text).toBe('Now scan the rack');

    s = scan(s, 'B-02-02').state;
    expect(s.move.phase).toBe('confirm');
    expect(s.move.intent).toBe('place');
    expect(promptFor(s, { confirmByRescan: true }).text).toBe('Scan B-02-02 again to confirm');

    const rescan = scan(s, 'B-02-02');
    expect(rescan.effect).toEqual({ kind: 'save-move' });

    const spec = commandFor(s.move.intent!, s.move.pallet!, s.move.rack!);
    const result = exec(spec);
    expect(result.status).toBe('saved');
    s = act(act(rescan.state, { type: 'MOVE_SAVING', commandId: 'c1' }).state, { type: 'MOVE_RESULT', result }).state;
    expect(s.move.phase).toBe('done');
    expect(s.log[0].kind).toBe('save');
    const after = engine.db.pallets[p.id];
    expect(after.state).toBe('STORED');
    expect(after.current_location_id).toBe(loc('B-02-02').id);

    // The next pallet scan starts the next move straight away.
    const next = scan(s, pallet((x) => x.state === 'STORED').code);
    expect(next.state.move.phase).toBe('rack');
  });

  it('decides move or confirm-still-here exactly like the Move screen', () => {
    const { scan, act, byCode } = setup();
    const p = byCode('P-000016'); // stored at A-03-01
    let s = act(initialStation(), { type: 'MODE', mode: 'move' }).state;
    s = scan(s, p.code).state;
    const elsewhere = scan(s, 'B-02-02').state;
    expect(elsewhere.move.intent).toBe('move');
    expect(elsewhere.flash?.text).toMatch(/Move P-000016 from A-03-01 to B-02-02/);
    const same = scan(s, 'A-03-01').state;
    expect(same.move.intent).toBe('verify_location');
    // Scanning a different rack while confirming changes the destination instead of saving.
    const changed = scan(elsewhere, 'A-01-01');
    expect(changed.effect).toBeNull();
    expect(changed.state.move.rack?.code).toBe('A-01-01');
    expect(changed.state.flash?.text).toMatch(/^Changed to A-01-01/);
  });

  it('confirms with the Confirm barcode or Enter when rescanning is turned off', () => {
    const { scan, act, byCode } = setup('OPERATOR', false);
    let s = act(initialStation(), { type: 'MODE', mode: 'move' }).state;
    s = scan(scan(s, byCode('P-000016').code).state, 'B-02-02').state;
    expect(promptFor(s, { confirmByRescan: false }).text).toBe('Scan Confirm to save');
    expect(scan(s, 'B-02-02').effect).toBeNull();
    expect(scan(s, 'CMD:CONFIRM').effect).toEqual({ kind: 'save-move' });
    expect(act(s, { type: 'CONFIRM' }).effect).toEqual({ kind: 'save-move' });
  });

  it('refuses a second pallet, blocked pallets, and resets on Cancel', () => {
    const { scan, act, byCode, pallet } = setup();
    let s = act(initialStation(), { type: 'MODE', mode: 'move' }).state;
    const dispatched = scan(s, pallet((p) => p.state === 'DISPATCHED').code);
    expect(dispatched.verdict).toBe('error');
    expect(dispatched.state.move.phase).toBe('pallet');
    expect(dispatched.state.flash?.text).toMatch(/Record a return/);

    s = scan(s, byCode('P-000016').code).state;
    const other = scan(s, byCode('P-000017').code);
    expect(other.verdict).toBe('error');
    expect(other.state.move.pallet?.code).toBe('P-000016');

    const cancelled = scan(s, 'CMD:CANCEL').state;
    expect(cancelled.move.phase).toBe('pallet');
    expect(cancelled.move.pallet).toBeNull();
  });

  it('shows a conflict instead of overwriting when someone else moved the pallet first', () => {
    const { scan, act, exec, byCode, loc, otherMoves, engine } = setup();
    const p = byCode('P-000016');
    let s = act(initialStation(), { type: 'MODE', mode: 'move' }).state;
    s = scan(scan(s, p.code).state, 'B-02-02').state;
    otherMoves(p, loc('A-01-01'));
    const result = exec(commandFor(s.move.intent!, s.move.pallet!, s.move.rack!));
    expect(result.status).toBe('conflict');
    s = act(s, { type: 'MOVE_RESULT', result }).state;
    expect(s.move.phase).toBe('rack');
    expect(s.move.pallet?.version).toBe(engine.db.pallets[p.id].version);
    expect(s.flash?.text).toMatch(/Someone else changed P-000016 first/);
    // Deciding again uses the newer record.
    s = scan(s, 'A-01-01').state;
    expect(s.move.intent).toBe('verify_location');
  });

  it('keeps the command ID after a lost response and asks for the result on Confirm', () => {
    const { scan, act, byCode } = setup();
    let s = act(initialStation(), { type: 'MODE', mode: 'move' }).state;
    s = scan(scan(s, byCode('P-000016').code).state, 'B-02-02').state;
    s = act(s, { type: 'MOVE_SAVING', commandId: 'cmd-1' }).state;
    const lost = outcomeToResult({ status: 'unknown', command_id: 'cmd-1', message: 'The response was lost on the way back.' }, 'cmd-1');
    s = act(s, { type: 'MOVE_RESULT', result: lost }).state;
    expect(s.move.phase).toBe('unknown');
    expect(s.move.commandId).toBe('cmd-1');
    expect(scan(s, 'CMD:CONFIRM').effect).toEqual({ kind: 'recover-move' });
    expect(scan(s, 'CMD:CANCEL').verdict).toBe('error');
    expect(scan(s, 'A-01-01').verdict).toBe('error');
  });
});

describe('Scan station: Put-away', () => {
  it('plans each pallet against the rack and saves them all with their scanned versions', () => {
    const { scan, act, exec, pallet, byCode, loc, engine } = setup();
    const rack = loc('B-02-02');
    const received = pallet((p) => p.state === 'RECEIVED' && !p.hold);
    const elsewhere = byCode('P-000016'); // A-03-01
    const here = pallet((p) => p.state === 'STORED' && p.current_location_id === rack.id);
    const dispatched = pallet((p) => p.state === 'DISPATCHED');

    let s = act(initialStation(), { type: 'MODE', mode: 'putaway' }).state;
    expect(scan(s, received.code).verdict).toBe('error'); // rack first
    s = scan(s, rack.code).state;
    expect(s.putaway.phase).toBe('scanning');
    s = scan(s, received.code).state;
    s = scan(s, elsewhere.code).state;
    s = scan(s, here.code).state;
    const blocked = scan(s, dispatched.code);
    expect(blocked.verdict).toBe('error');
    s = blocked.state;
    const dup = scan(s, received.code);
    expect(dup.state.putaway.lines).toHaveLength(4);
    s = dup.state;

    const [l1, l2, l3, l4] = s.putaway.lines;
    expect([l1.intent, l1.what]).toEqual(['place', 'Place here']);
    expect([l2.intent, l2.what]).toEqual(['move', 'Move from A-03-01']);
    expect([l3.intent, l3.what]).toEqual(['verify_location', 'Already here']);
    expect(l4.intent).toBeNull();
    expect(l4.result.status).toBe('blocked');

    // Another rack mid-list is refused; Finish reviews; Confirm saves.
    expect(scan(s, 'A-01-01').verdict).toBe('error');
    s = scan(s, 'CMD:FINISH').state;
    expect(s.putaway.phase).toBe('review');
    expect(promptFor(s, { confirmByRescan: true }).text).toBe('Save 3 to B-02-02?');
    const go = scan(s, 'CMD:CONFIRM');
    expect(go.effect).toEqual({ kind: 'save-putaway' });
    s = act(go.state, { type: 'PUTAWAY_PHASE', phase: 'saving' }).state;

    for (const line of s.putaway.lines) {
      if (!line.intent) continue;
      const r = exec(commandFor(line.intent, line.pallet, rack));
      s = act(s, { type: 'LINE_RESULT', list: 'putaway', key: line.key, result: r }).state;
    }
    s = act(s, { type: 'PUTAWAY_PHASE', phase: 'done' }).state;
    expect(s.putaway.lines.map((l) => l.result.status)).toEqual(['saved', 'saved', 'saved', 'blocked']);
    for (const p of [received, elsewhere, here]) expect(engine.db.pallets[p.id].current_location_id).toBe(rack.id);
    expect(engine.db.pallets[here.id].version).toBe(here.version + 1);
    expect(promptFor(s, { confirmByRescan: true }).text).toBe('Put-away saved');
    expect(unsavedWork(s)).toBeNull();

    // A new rack starts the next put-away.
    const next = scan(s, 'A-01-01').state;
    expect(next.putaway.rack?.code).toBe('A-01-01');
    expect(next.putaway.lines).toHaveLength(0);
  });

  it('reports a conflict on one line without stopping the others, and can plan it again', () => {
    const { scan, act, exec, byCode, loc, otherMoves, engine } = setup();
    const rack = loc('B-02-02');
    const a = byCode('P-000016');
    const b = byCode('P-000017');
    let s = act(initialStation(), { type: 'START_RACK', mode: 'putaway', rack }).state;
    s = scan(scan(s, a.code).state, b.code).state;
    expect(unsavedWork(s)).toMatch(/2 pallets in the put-away to B-02-02/);
    otherMoves(a, loc('A-01-01'));
    for (const line of s.putaway.lines) s = act(s, { type: 'LINE_RESULT', list: 'putaway', key: line.key, result: exec(commandFor(line.intent!, line.pallet, rack)) }).state;
    const [ra, rb] = s.putaway.lines.map((l) => l.result);
    expect(ra.status).toBe('conflict');
    expect(rb.status).toBe('saved');
    if (ra.status === 'conflict') expect(ra.current?.current_location_id).toBe(loc('A-01-01').id);

    s = act(s, { type: 'REPLAN_LINE', key: a.id, pallet: engine.db.pallets[a.id] }).state;
    const line = s.putaway.lines[0];
    expect(line.what).toBe('Move from A-01-01');
    expect(line.result.status).toBe('pending');
    expect(exec(commandFor(line.intent!, line.pallet, rack)).status).toBe('saved');
  });

  it('Cancel from the review goes back to scanning and keeps the list', () => {
    const { scan, act, byCode, loc } = setup();
    let s = act(initialStation(), { type: 'START_RACK', mode: 'putaway', rack: loc('B-02-02') }).state;
    s = scan(s, byCode('P-000016').code).state;
    s = scan(s, 'CMD:FINISH').state;
    s = scan(s, 'CMD:CANCEL').state;
    expect(s.putaway.phase).toBe('scanning');
    expect(s.putaway.lines).toHaveLength(1);
    s = scan(s, 'CMD:CANCEL').state;
    expect(s.putaway.phase).toBe('rack');
    expect(s.putaway.lines).toHaveLength(0);
  });

  it('plans hold and inactive cases', () => {
    const { pallet, loc, ctx } = setup();
    const held = pallet((p) => p.state === 'STORED' && !!p.hold);
    const line = planLine(held, loc('A-01-01'), ctx().codeOf);
    expect(line.intent).toBe('move');
    expect(line.detail).toMatch(/hold stays on/);
    const inactive = { ...loc('A-01-01'), active: false };
    expect(planLine(held, inactive, ctx().codeOf).intent).toBeNull();
  });
});

describe('Scan station: Count', () => {
  it('classifies a rack count and confirms the matched pallets', () => {
    const { scan, act, exec, ctx, pallet, byCode, loc, engine } = setup();
    const rack = loc('A-03-01');
    const recorded = ctx().palletsAt(rack.id);
    expect(recorded.map((p) => p.code)).toEqual(['P-000016', 'P-000017', 'P-000032']);
    const elsewhere = byCode('P-000014'); // A-01-01
    const received = pallet((p) => p.state === 'RECEIVED' && !p.hold);
    const missing = pallet((p) => p.state === 'MISSING');

    let s = scan(initialStation(), 'CMD:MODE_COUNT').state;
    expect(scan(s, recorded[0].code).verdict).toBe('error'); // rack first
    s = scan(s, rack.code).state;
    s = scan(s, recorded[0].code).state;
    expect(s.flash).toEqual({ tone: 'ok', text: 'On record here' });
    s = scan(s, recorded[2].code).state;
    s = scan(s, elsewhere.code).state;
    expect(s.flash).toEqual({ tone: 'warn', text: 'Recorded at A-01-01' });
    s = scan(s, received.code).state;
    s = scan(s, missing.code).state;
    const unk = scan(s, 'P-999999');
    expect(unk.verdict).toBe('error');
    s = unk.state;
    expect(unsavedWork(s)).toMatch(/count of A-03-01 is not finished/);

    s = scan(s, 'CMD:FINISH').state;
    const r = s.count.report!;
    expect(r.matched.map((x) => x.pallet.code)).toEqual(['P-000016', 'P-000032']);
    expect(r.missing.map((x) => x.pallet.code)).toEqual(['P-000017']);
    expect(r.unexpected.map((x) => [x.pallet.code, x.fix])).toEqual([
      [elsewhere.code, 'move'],
      [received.code, 'place'],
      [missing.code, 'locate'],
    ]);
    expect(r.unknown.map((u) => u.raw)).toEqual(['P-999999']);
    expect(s.flash?.text).toBe('2 matched, 1 missing, 3 unexpected, 1 unknown');
    expect(promptFor(s, { confirmByRescan: true }).text).toBe('Confirm 2 matched');

    // A new rack is refused until the matched pallets are confirmed.
    expect(scan(s, 'B-01-01').verdict).toBe('error');
    const go = scan(s, 'CMD:CONFIRM');
    expect(go.effect).toEqual({ kind: 'confirm-count' });
    s = go.state;
    for (const row of s.count.report!.matched) {
      const before = engine.db.pallets[row.key];
      const res = exec(commandFor('verify_location', row.pallet, rack));
      expect(res.status).toBe('saved');
      s = act(s, { type: 'LINE_RESULT', list: 'matched', key: row.key, result: res }).state;
      const after = engine.db.pallets[row.key];
      expect(after.version).toBe(before.version + 1);
      expect(after.last_confirmed_location_id).toBe(rack.id);
      expect(engine.db.events[row.key].at(-1)!.type).toBe('verify_location');
    }
    expect(scan(s, 'CMD:CONFIRM').effect).toBeNull();

    // Move the unexpected stored pallet here.
    const moveRow = s.count.report!.unexpected[0];
    expect(exec(commandFor(moveRow.fix!, moveRow.pallet, rack)).status).toBe('saved');
    expect(engine.db.pallets[elsewhere.id].current_location_id).toBe(rack.id);

    // Skip the missing one; then the next rack starts a fresh count.
    s = act(s, { type: 'SKIP', key: r.missing[0].key }).state;
    expect(s.count.report!.missing[0].result.status).toBe('skipped');
    const next = scan(s, 'B-01-01').state;
    expect(next.count.rack?.code).toBe('B-01-01');
    expect(next.count.scanned).toHaveLength(0);
  });

  it('marks a pallet missing from a count only for a supervisor, with a reason', () => {
    const sup = setup('SUPERVISOR');
    const rack = sup.loc('A-03-01');
    const report = classifyCount(rack, [], [], sup.ctx().palletsAt(rack.id), sup.ctx().codeOf);
    expect(report.missing).toHaveLength(3);
    const row = report.missing[0];
    expect(sup.exec(commandFor('mark_missing', row.pallet, null, '')).status).toBe('failed');
    const ok = sup.exec(commandFor('mark_missing', row.pallet, null, 'Not on A-03-01 during the count.'));
    expect(ok.status).toBe('saved');
    expect(sup.engine.db.pallets[row.key].state).toBe('MISSING');

    // A missing pallet found on the rack is recorded as found (supervisor, with a reason).
    const missing = sup.pallet((p) => p.state === 'MISSING' && p.id !== row.key);
    expect(sup.exec(commandFor('locate', missing, rack, 'Found on A-03-01 during the count.')).status).toBe('saved');
    expect(sup.engine.db.pallets[missing.id].current_location_id).toBe(rack.id);
  });

  it('Cancel from the review goes back to scanning with the scans kept', () => {
    const { scan, loc, byCode } = setup();
    let s = scan(initialStation(), 'CMD:MODE_COUNT').state;
    s = scan(s, loc('A-03-01').code).state;
    s = scan(s, byCode('P-000016').code).state;
    s = scan(s, 'CMD:FINISH').state;
    expect(s.count.phase).toBe('review');
    s = scan(s, 'CMD:CANCEL').state;
    expect(s.count.phase).toBe('scanning');
    expect(s.count.scanned).toHaveLength(1);
    // Scanning a pallet in the review also goes back to scanning and counts it.
    s = scan(s, 'CMD:FINISH').state;
    s = scan(s, byCode('P-000017').code).state;
    expect(s.count.phase).toBe('scanning');
    expect(s.count.scanned).toHaveLength(2);
  });

  it('switches rack only before anything was scanned', () => {
    const { scan, byCode } = setup();
    let s = scan(initialStation(), 'CMD:MODE_COUNT').state;
    s = scan(s, 'A-03-01').state;
    s = scan(s, 'A-03-02').state;
    expect(s.count.rack?.code).toBe('A-03-02');
    s = scan(s, byCode('P-000016').code).state;
    const refused = scan(s, 'A-03-01');
    expect(refused.verdict).toBe('error');
    expect(refused.state.count.rack?.code).toBe('A-03-02');
  });
});

describe('Scan station: save outcomes', () => {
  it('maps every backend outcome to a line result', () => {
    expect(outcomeToResult({ status: 'queued', entry: {} as never }, 'x')).toEqual({ status: 'queued' });
    expect(outcomeToResult({ status: 'offline', message: 'Offline' }, 'x')).toEqual({ status: 'failed', message: 'Offline' });
    expect(outcomeToResult({ status: 'unknown', command_id: 'x', message: 'Lost' }, 'x')).toEqual({ status: 'unknown', commandId: 'x', message: 'Lost' });
    expect(outcomeToResult({ status: 'result', result: { ok: false, command_id: 'x', kind: 'move', code: 'INACTIVE_LOCATION', message: 'A-01-01 is inactive.', correlation_id: '-' } }, 'x')).toEqual({
      status: 'failed',
      message: 'A-01-01 is inactive.',
    });
  });
});
