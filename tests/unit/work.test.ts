// Scheduled counts, move tasks, lots and expiry dates, warehouse access per person and returns with a condition.
import { describe, expect, it } from 'vitest';
import { Engine } from '../../src/demo/engine';
import { pickableStock } from '../../src/demo/orderEngine';
import { seedSample } from '../../src/demo/seed';
import { uuid } from '../../src/domain/codes';
import { validateEnvelope } from '../../src/domain/commands';
import { searchRows } from '../../src/domain/search';
import { addDays, addMonth, countLines, expiringPallets, expiryState, expiryText, moveTaskId, nextDue, zoneSpots } from '../../src/domain/work';
import type { CommandAccepted, CommandEnvelope, CommandKind, CommandResult, CountTask, Location, Pallet } from '../../src/domain/types';

const OWNER = 'user-owner',
  MANAGER = 'user-supervisor',
  OPERATOR = 'user-operator',
  VIEWER = 'user-viewer';

function setup() {
  const engine = new Engine(seedSample());
  const db = engine.db;
  const ws = Object.values(db.workspaces).find((w) => w.name === 'Sample warehouse')!.id;
  const overflow = Object.values(db.workspaces).find((w) => w.name === 'Overflow yard')!.id;
  const run = (actor: string, kind: CommandKind, payload: Record<string, unknown>, pallet?: Pallet, more: Partial<CommandEnvelope> = {}): CommandResult =>
    engine.execute(actor, {
      schema_version: 1,
      command_id: uuid(),
      workspace_id: ws,
      kind,
      payload,
      ...(pallet ? { pallet_id: pallet.id, expected_version: db.pallets[pallet.id].version } : {}),
      ...more,
    });
  const pallet = (code: string, w = ws): Pallet => Object.values(db.pallets).find((p) => p.code === code && p.workspace_id === w)!;
  const spot = (code: string, w = ws): Location => Object.values(db.locations).find((l) => l.code === code && l.workspace_id === w)!;
  const count = (name: string, status?: string): CountTask => Object.values(db.counts).find((c) => c.workspace_id === ws && c.name === name && (!status || c.status === status))!;
  const at = (code: string) => Object.values(db.pallets).filter((p) => p.workspace_id === ws && p.state === 'STORED' && p.current_location_id === spot(code).id);
  return { engine, db, ws, overflow, run, pallet, spot, count, at };
}

function ok(r: CommandResult): CommandAccepted {
  if (!r.ok) throw new Error(`${r.code}: ${r.message}`);
  return r;
}

const today = () => new Date().toISOString().slice(0, 10);

describe('dates and helpers', () => {
  it('repeats weekly and monthly, keeping month ends real', () => {
    expect(addDays('2026-02-27', 3)).toBe('2026-03-02');
    expect(addMonth('2026-01-31')).toBe('2026-02-28');
    expect(addMonth('2026-12-15')).toBe('2027-01-15');
    expect(nextDue('2026-10-01', 'weekly')).toBe('2026-10-08');
    expect(nextDue('2026-10-01', 'monthly')).toBe('2026-11-01');
    expect(nextDue('2026-10-01', 'none')).toBeNull();
  });

  it('says how close an expiry date is', () => {
    expect(expiryState('2026-09-30', '2026-10-01')).toBe('expired');
    expect(expiryState('2026-10-31', '2026-10-01')).toBe('soon');
    expect(expiryState('2026-11-01', '2026-10-01')).toBe('ok');
    expect(expiryState('', '2026-10-01')).toBe('none');
    expect(expiryText('2026-09-28', '2026-10-01')).toBe('Expired 3 days ago');
    expect(expiryText('2026-10-01', '2026-10-01')).toBe('Expires today');
    expect(expiryText('2026-10-02', '2026-10-01')).toBe('Expires in 1 day');
  });

  it('compares a count with the records: matched, missing and unexpected', () => {
    const s = setup();
    const a = s.spot('A-01-02');
    const here = s.at('A-01-02');
    const stranger = s.pallet('P-000001');
    const lines = countLines(a, [here[0], stranger], here, (id) => (id ? s.db.locations[id]?.code ?? null : null));
    expect(lines.map((l) => [l.code, l.kind])).toEqual([
      [here[0].code, 'matched'],
      ['P-000001', 'unexpected'],
      ...here.slice(1).map((p) => [p.code, 'missing']),
    ]);
    expect(lines.find((l) => l.kind === 'unexpected')!.from_code).toBe('B-01-01');
  });

  it('finds the active spots of a zone in walk order', () => {
    const s = setup();
    const wh = Object.values(s.db.warehouses).find((w) => w.workspace_id === s.ws)!;
    expect(zoneSpots(Object.values(s.db.locations), wh.id, 'b').map((l) => l.code)).toEqual(['B-01-01', 'B-02-01', 'B-02-02']);
  });
});

describe('scheduled and assigned counts', () => {
  it('the sample has a weekly count for the operator and one waiting for review', () => {
    const s = setup();
    const weekly = s.count('Zone B');
    expect(weekly.status).toBe('OPEN');
    expect(weekly.assigned_to).toBe(OPERATOR);
    expect(weekly.repeat).toBe('weekly');
    expect(weekly.location_codes).toEqual(['B-01-01', 'B-02-01', 'B-02-02']);
    const waiting = s.count('A-01-02');
    expect(waiting.status).toBe('REVIEW');
    expect(waiting.lines.filter((l) => l.kind === 'missing').map((l) => l.code)).toEqual(['P-000004']);
  });

  it('only managers schedule, and only the assigned person or a manager sends the count', () => {
    const s = setup();
    const spot = s.spot('B-02-02');
    expect(s.run(OPERATOR, 'schedule_count', { scope: 'spot', location_id: spot.id, assigned_to: OPERATOR, due_on: today(), repeat: 'none' })).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(s.run(MANAGER, 'schedule_count', { scope: 'spot', location_id: spot.id, assigned_to: VIEWER, due_on: today(), repeat: 'none' })).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
    expect(s.run(MANAGER, 'schedule_count', { scope: 'zone', zone: 'Z', assigned_to: OPERATOR, due_on: today(), repeat: 'none' })).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect(s.run(MANAGER, 'schedule_count', { scope: 'spot', location_id: spot.id, assigned_to: OPERATOR, due_on: '2020-01-01', repeat: 'none' })).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
    const r = ok(s.run(MANAGER, 'schedule_count', { scope: 'spot', location_id: spot.id, assigned_to: MANAGER, due_on: today(), repeat: 'monthly' }));
    const c = s.db.counts[r.target_id!];
    const send = { count_id: c.id, spots: [{ location_id: spot.id, pallet_ids: s.at('B-02-02').map((p) => p.id), unknown: [] }] };
    expect(s.run(OPERATOR, 'submit_count', send, undefined, { expected_version: c.version })).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(validateEnvelope({ schema_version: 1, command_id: uuid(), workspace_id: s.ws, kind: 'submit_count', payload: send })).toMatchObject({ ok: false });
  });

  it('a count that matches the records saves at once, confirms each pallet and schedules the next one', () => {
    const s = setup();
    const c = s.count('Zone B');
    const spots = c.location_ids.map((id) => ({ location_id: id, pallet_ids: Object.values(s.db.pallets).filter((p) => p.state === 'STORED' && p.current_location_id === id).map((p) => p.id), unknown: [] }));
    const before = s.pallet('P-000001').version;
    ok(s.run(OPERATOR, 'submit_count', { count_id: c.id, spots }, undefined, { expected_version: c.version }));
    const done = s.db.counts[c.id];
    expect(done.status).toBe('DONE');
    expect(done.lines.every((l) => l.kind === 'matched' && l.result === 'saved')).toBe(true);
    expect(s.pallet('P-000001').version).toBe(before + 1);
    expect(s.db.events[s.pallet('P-000001').id].at(-1)).toMatchObject({ type: 'verify_location', detail: { count: 'Zone B' } });
    const next = s.db.counts[done.next_id!];
    expect(next).toMatchObject({ status: 'OPEN', name: 'Zone B', assigned_to: OPERATOR, due_on: addDays(c.due_on, 7) });
  });

  it('differences wait for a manager, who saves them or sends the count back', () => {
    const s = setup();
    const c = s.count('Zone B');
    const b1 = s.spot('B-01-01');
    // P-000003 is on A-01-01 in the records but was found on B-01-01; one sanitizer pallet on B-01-01 was not found.
    const onB1 = s.at('B-01-01');
    const gone = onB1.find((p) => p.code.startsWith('P-0004'))!;
    const spots = c.location_ids.map((id) => ({
      location_id: id,
      pallet_ids: id === b1.id ? [...onB1.filter((p) => p.id !== gone.id).map((p) => p.id), s.pallet('P-000003').id] : Object.values(s.db.pallets).filter((p) => p.state === 'STORED' && p.current_location_id === id).map((p) => p.id),
      unknown: id === b1.id ? ['XYZ-1'] : [],
    }));
    ok(s.run(OPERATOR, 'submit_count', { count_id: c.id, spots }, undefined, { expected_version: c.version }));
    let cur = s.db.counts[c.id];
    expect(cur.status).toBe('REVIEW');
    expect(cur.unknown).toEqual([{ location_code: 'B-01-01', raw: 'XYZ-1' }]);
    expect(s.pallet(gone.code).state).toBe('STORED');
    expect(s.run(OPERATOR, 'review_count', { count_id: c.id, approve: true }, undefined, { expected_version: cur.version })).toMatchObject({ ok: false, code: 'FORBIDDEN' });

    // Sent back: counted again from scratch.
    ok(s.run(MANAGER, 'review_count', { count_id: c.id, approve: false, note: 'Check B-01-01 again.' }, undefined, { expected_version: cur.version }));
    cur = s.db.counts[c.id];
    expect(cur).toMatchObject({ status: 'OPEN', lines: [], review_note: 'Check B-01-01 again.' });
    ok(s.run(OPERATOR, 'submit_count', { count_id: c.id, spots }, undefined, { expected_version: cur.version }));
    cur = s.db.counts[c.id];

    // Someone moves P-000001 before the review: that line is skipped, the rest are saved.
    ok(s.run(OPERATOR, 'move', { location_id: s.spot('A-02-02').id }, s.pallet('P-000001')));
    ok(s.run(MANAGER, 'review_count', { count_id: c.id, approve: true }, undefined, { expected_version: cur.version }));
    cur = s.db.counts[c.id];
    expect(cur.status).toBe('DONE');
    expect(s.pallet(gone.code).state).toBe('MISSING');
    expect(s.pallet('P-000003').current_location_id).toBe(b1.id);
    expect(cur.lines.find((l) => l.code === 'P-000001')!.result).toBe('skipped');
    expect(cur.lines.find((l) => l.code === 'P-000003')).toMatchObject({ kind: 'unexpected', from_code: 'A-01-01', result: 'saved' });
    expect(s.db.counts[cur.next_id!].status).toBe('OPEN');
  });

  it('a pallet on record on one spot of the count and found on another is a move, not missing', () => {
    const s = setup();
    const r = ok(s.run(MANAGER, 'schedule_count', { scope: 'zone', zone: 'A', assigned_to: OPERATOR, due_on: today(), repeat: 'none' }));
    const c = s.db.counts[r.target_id!];
    const a1 = s.spot('A-01-01');
    const a2 = s.spot('A-01-02');
    const p3 = s.pallet('P-000003');
    const spots = c.location_ids.map((id) => ({ location_id: id, pallet_ids: Object.values(s.db.pallets).filter((p) => p.state === 'STORED' && p.current_location_id === id && p.id !== p3.id).map((p) => p.id).concat(id === a2.id ? [p3.id] : []), unknown: [] }));
    ok(s.run(OPERATOR, 'submit_count', { count_id: c.id, spots }, undefined, { expected_version: c.version }));
    const lines = s.db.counts[c.id].lines.filter((l) => l.pallet_id === p3.id);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ kind: 'unexpected', location_id: a2.id, from_code: a1.code });
  });
});

describe('move tasks', () => {
  it('the sample queues three moves, two for the operator', () => {
    const s = setup();
    const open = s.engine.moveTasks(OPERATOR, s.ws).filter((t) => t.status === 'OPEN');
    expect(open.map((t) => [t.code, t.to_location_code, t.assigned_to])).toEqual([
      ['P-000002', 'A-01-01', OPERATOR],
      ['P-000003', 'B-02-01', OPERATOR],
      ['P-000401', 'QUARANTINE-01', null],
    ]);
  });

  it('moving the pallet where the task says completes it in the same save; elsewhere does not', () => {
    const s = setup();
    const p3 = s.pallet('P-000003');
    ok(s.run(OPERATOR, 'move', { location_id: s.spot('B-01-01').id }, p3));
    expect(s.db.tasks[moveTaskId(p3.id)].status).toBe('OPEN');
    ok(s.run(OPERATOR, 'move', { location_id: s.spot('B-02-01').id }, s.pallet('P-000003')));
    expect(s.db.tasks[moveTaskId(p3.id)]).toMatchObject({ status: 'DONE', done_by_name: 'Demo Operator', done_location_code: 'B-02-01' });
    const p2 = s.pallet('P-000002');
    ok(s.run(OPERATOR, 'place', { location_id: s.spot('A-01-01').id }, p2));
    expect(s.db.tasks[moveTaskId(p2.id)].status).toBe('DONE');
  });

  it('managers queue and cancel; a put-away without a spot is only for pallets waiting for one', () => {
    const s = setup();
    const p4 = s.pallet('P-000004');
    expect(s.run(OPERATOR, 'queue_moves', { lines: [{ pallet_id: p4.id, to_location_id: s.spot('B-02-02').id }] })).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(s.run(MANAGER, 'queue_moves', { lines: [{ pallet_id: p4.id, to_location_id: null }] })).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
    expect(s.run(MANAGER, 'queue_moves', { lines: [{ pallet_id: p4.id, to_location_id: p4.current_location_id }] })).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
    expect(s.run(MANAGER, 'queue_moves', { lines: [{ pallet_id: s.pallet('P-000006').id, to_location_id: s.spot('B-02-02').id }] })).toMatchObject({ ok: false, code: 'INVALID_STATE' });
    const r = ok(s.run(MANAGER, 'queue_moves', { lines: [{ pallet_id: p4.id, to_location_id: s.spot('B-02-02').id }], assigned_to: OPERATOR }));
    expect(r.created_ids).toEqual([moveTaskId(p4.id)]);
    ok(s.run(MANAGER, 'cancel_move', { task_id: moveTaskId(p4.id), reason: 'Not needed' }));
    expect(s.db.tasks[moveTaskId(p4.id)].status).toBe('CANCELLED');
    expect(s.run(MANAGER, 'cancel_move', { task_id: moveTaskId(p4.id) })).toMatchObject({ ok: false, code: 'INVALID_STATE' });
  });
});

describe('lots and expiry dates', () => {
  it('lists what expires in the next 30 days and what already expired, soonest first', () => {
    const s = setup();
    const list = expiringPallets(Object.values(s.db.pallets).filter((p) => p.workspace_id === s.ws), today());
    expect(list.map((p) => p.receiving?.lot)).toEqual(['L-2405', 'L-2409', 'L-2410']);
    expect(Object.values(s.db.warehouses).find((w) => w.workspace_id === s.ws)!.lots).toBe(true);
  });

  it('Find and picking take the earliest expiry first', () => {
    const s = setup();
    const rows = Object.values(s.db.pallets)
      .filter((p) => p.workspace_id === s.ws)
      .map((pallet) => ({ pallet, job: undefined, location: null, lastLocation: null }));
    expect(searchRows(rows, { q: 'SAN-500' }).items.map((r) => r.pallet.receiving?.lot)).toEqual(['L-2405', 'L-2409', 'L-2410', 'L-2502']);
    expect(pickableStock(s.engine, s.ws, 'SAN-500', new Set()).map((p) => p.receiving?.lot)).toEqual(['L-2405', 'L-2409', 'L-2410', 'L-2502']);
  });

  it('a lot and expiry date are saved on receive, and a real date is required', () => {
    const s = setup();
    const r = ok(s.run(OPERATOR, 'receive', { description: 'Sanitizer', receiving: { product_code: 'SAN-500', lot: 'L-9', expires_on: '2027-03-01' } }));
    expect(r.current_state!.receiving).toMatchObject({ lot: 'L-9', expires_on: '2027-03-01' });
    expect(s.run(OPERATOR, 'receive', { description: 'Sanitizer', receiving: { expires_on: '2027-02-30' } })).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
  });

  it('only managers turn lot tracking on or off', () => {
    const s = setup();
    expect(s.run(OPERATOR, 'set_lots', { on: false })).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    ok(s.run(MANAGER, 'set_lots', { on: false }));
    expect(s.run(MANAGER, 'set_lots', { on: false })).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
  });
});

describe('warehouse access per person', () => {
  it('the sample viewer can open the main warehouse only, and the engine refuses the other one', () => {
    const s = setup();
    expect(s.engine.membership(VIEWER, s.ws)).not.toBeNull();
    expect(s.engine.membership(VIEWER, s.overflow)).toBeNull();
    expect(() => s.engine.search(VIEWER, s.overflow, {})).toThrow();
    const map = s.engine.accessMap(MANAGER, s.ws);
    expect(map.warehouses.map((w) => w.name)).toEqual(['Main yard', 'Overflow yard']);
    expect(map.access[VIEWER]).toEqual([s.ws]);
    expect(map.access[OPERATOR].sort()).toEqual([s.ws, s.overflow].sort());
  });

  it('a manager limits an operator to one warehouse: commands there are refused until access is given back', () => {
    const s = setup();
    const at = (ws: string, kind: CommandKind, payload: Record<string, unknown>) => s.engine.execute(OPERATOR, { schema_version: 1, command_id: uuid(), workspace_id: ws, kind, payload });
    ok(at(s.overflow, 'receive', { description: 'Before the limit' }));
    expect(s.run(OPERATOR, 'set_access', { user_id: MANAGER, workspace_ids: [s.ws] })).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(s.run(MANAGER, 'set_access', { user_id: MANAGER, workspace_ids: [s.ws] })).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(s.run(MANAGER, 'set_access', { user_id: OWNER, workspace_ids: [s.ws] })).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(s.run(MANAGER, 'set_access', { user_id: OPERATOR, workspace_ids: ['elsewhere'] })).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    ok(s.run(MANAGER, 'set_access', { user_id: OPERATOR, workspace_ids: [s.ws] }));
    expect(at(s.overflow, 'receive', { description: 'After the limit' })).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    ok(at(s.ws, 'receive', { description: 'Still fine here' }));
    // A transfer to the warehouse they cannot open is refused too.
    const p = s.pallet('P-000004');
    expect(s.engine.execute(OPERATOR, { schema_version: 1, command_id: uuid(), workspace_id: s.ws, kind: 'transfer_now', payload: { to_workspace_id: s.overflow, lines: [{ pallet_id: p.id, expected_version: p.version }] } })).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(s.db.memberships.find((m) => m.workspace_id === s.overflow && m.user_id === OPERATOR)).toMatchObject({ active: false, limited: true, role: 'OPERATOR' });
    expect(s.run(MANAGER, 'set_access', { user_id: OPERATOR, workspace_ids: [s.ws] })).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
    ok(s.run(MANAGER, 'set_access', { user_id: OPERATOR, workspace_ids: [s.ws, s.overflow] }));
    ok(at(s.overflow, 'receive', { description: 'Access given back' }));
    // Both warehouses keep the change in their admin audit log.
    const logged = s.db.audit.filter((a) => a.action === 'set_access' && a.target_id === OPERATOR);
    expect(logged.filter((a) => a.workspace_id === s.overflow)).toHaveLength(2);
    expect(logged.filter((a) => a.workspace_id === s.ws)).toHaveLength(2);
  });

  it('the last owner of a warehouse cannot be limited out of it', () => {
    const s = setup();
    // A second owner in the main warehouse only.
    s.engine.addMember(s.ws, { id: 'user-2', name: 'Second owner', email: 'second@sample.example' }, 'OWNER');
    expect(s.engine.execute('user-2', { schema_version: 1, command_id: uuid(), workspace_id: s.ws, kind: 'set_access', payload: { user_id: OWNER, workspace_ids: [s.ws] } })).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  });
});

describe('returns with a condition', () => {
  it('restock puts it back on a spot; damaged holds it in quarantine with the reason', () => {
    const s = setup();
    const p6 = s.pallet('P-000006');
    expect(s.run(OPERATOR, 'return', { condition: 'restock' }, p6)).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
    expect(s.run(OPERATOR, 'return', { condition: 'restock', location_id: s.spot('QUARANTINE-01').id }, p6)).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
    const r = ok(s.run(OPERATOR, 'return', { condition: 'restock', location_id: s.spot('B-02-02').id, reason: 'Unused' }, p6));
    expect(r.current_state).toMatchObject({ state: 'STORED', current_location_id: s.spot('B-02-02').id, hold: null });
    expect(s.db.events[p6.id].at(-1)).toMatchObject({ type: 'return', reason: 'Unused', detail: { condition: 'restock', to_location: 'B-02-02' } });

    ok(s.run(OPERATOR, 'dispatch', { destination: 'Customer' }, s.pallet('P-000006')));
    expect(s.run(OPERATOR, 'return', { condition: 'damaged', location_id: s.spot('QUARANTINE-01').id }, s.pallet('P-000006'))).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
    expect(s.run(OPERATOR, 'return', { condition: 'damaged', location_id: s.spot('B-02-02').id, reason: 'Crushed' }, s.pallet('P-000006'))).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
    const d = ok(s.run(OPERATOR, 'return', { condition: 'damaged', location_id: s.spot('QUARANTINE-01').id, reason: 'Damaged in transit' }, s.pallet('P-000006')));
    expect(d.current_state).toMatchObject({ state: 'STORED', current_location_id: s.spot('QUARANTINE-01').id, hold: { reason: 'Returned damaged: Damaged in transit' } });
  });

  it('a return without a condition still works as before', () => {
    const s = setup();
    const r = ok(s.run(OPERATOR, 'return', { condition_note: 'Wrap intact' }, s.pallet('P-000006')));
    expect(r.current_state).toMatchObject({ state: 'RECEIVED', current_location_id: null });
  });
});
