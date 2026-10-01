// Transfers between two warehouses of one account: the pure rules, and the engine commands with roles,
// version conflicts, partial receiving, cancelling, "Transfer now", scans and account isolation.
import { describe, expect, it } from 'vitest';
import { Engine, ReadError } from '../../src/demo/engine';
import { seedSample } from '../../src/demo/seed';
import { makeLabelPayload, uuid } from '../../src/domain/codes';
import { checkTransition, moveBlocker } from '../../src/domain/transitions';
import { formatTransferNumber, parseTransferNumber, statusFromLines, transferBlocker } from '../../src/domain/transfers';
import type { CommandEnvelope, CommandKind, CommandResult, Pallet, Transfer, TransferLine } from '../../src/domain/types';

const OWNER = 'user-owner',
  MANAGER = 'user-supervisor',
  OPERATOR = 'user-operator',
  VIEWER = 'user-viewer';

function setup() {
  const engine = new Engine(seedSample());
  const db = engine.db;
  const main = Object.values(db.workspaces).find((w) => w.name === 'Sample warehouse')!.id;
  const overflow = Object.values(db.workspaces).find((w) => w.name === 'Overflow yard')!.id;
  const pallet = (code: string, ws = main): Pallet => Object.values(db.pallets).find((p) => p.code === code && p.workspace_id === ws)!;
  const loc = (code: string, ws: string) => Object.values(db.locations).find((l) => l.code === code && l.workspace_id === ws)!;
  const run = (actor: string, ws: string, kind: CommandKind, payload: Record<string, unknown>, more: Partial<CommandEnvelope> = {}): CommandResult =>
    engine.execute(actor, { schema_version: 1, command_id: uuid(), workspace_id: ws, kind, payload, ...more });
  const line = (p: Pallet) => ({ pallet_id: p.id, expected_version: p.version });
  const transfer = (id: string): Transfer => db.transfers[id];
  const receive = (actor: string, t: Transfer, l: TransferLine, location_id?: string) =>
    run(actor, t.to_workspace_id, 'receive_transfer', location_id ? { transfer_id: t.id, location_id } : { transfer_id: t.id }, { pallet_id: l.pallet_id, expected_version: l.version });
  return { engine, db, main, overflow, pallet, loc, run, line, transfer, receive };
}

function created(r: CommandResult): string {
  if (!r.ok) throw new Error(`${r.code}: ${r.message}`);
  return r.target_id!;
}

describe('transfer rules', () => {
  it('formats and reads transfer numbers as printed, typed or scanned', () => {
    expect(formatTransferNumber(1)).toBe('TR-0001');
    expect(formatTransferNumber(12345)).toBe('TR-12345');
    expect(parseTransferNumber('TR-0001')).toBe('TR-0001');
    expect(parseTransferNumber(' tr 7 ')).toBe('TR-0007');
    expect(parseTransferNumber('tr0042')).toBe('TR-0042');
    expect(parseTransferNumber('P-000001')).toBeNull();
    expect(parseTransferNumber('TRUCK')).toBeNull();
  });

  it('follows the lines: in transit, partly received, received; returned lines do not count', () => {
    const l = (status: TransferLine['status']) => ({ status }) as TransferLine;
    expect(statusFromLines([l('IN_TRANSIT'), l('IN_TRANSIT')], 'IN_TRANSIT')).toBe('IN_TRANSIT');
    expect(statusFromLines([l('RECEIVED'), l('IN_TRANSIT')], 'IN_TRANSIT')).toBe('PARTLY_RECEIVED');
    expect(statusFromLines([l('RECEIVED'), l('RECEIVED')], 'PARTLY_RECEIVED')).toBe('RECEIVED');
    expect(statusFromLines([l('RECEIVED'), l('RETURNED')], 'PARTLY_RECEIVED')).toBe('RECEIVED');
    expect(statusFromLines([l('WAITING')], 'DRAFT')).toBe('DRAFT');
    expect(statusFromLines([l('RETURNED')], 'CANCELLED')).toBe('CANCELLED');
  });

  it('only stored pallets and pallets awaiting placement, without a hold, can go', () => {
    const s = setup();
    expect(transferBlocker(s.pallet('P-000001'))).toBeNull();
    expect(transferBlocker(s.pallet('P-000002'))).toBeNull();
    expect(transferBlocker(s.pallet('P-000005'))).toMatch(/on hold/);
    expect(transferBlocker(s.pallet('P-000006'))).toMatch(/dispatched/);
  });
});

describe('transfer commands', () => {
  it('sends: pallets go in transit, leave their spots, and history is written at the origin', () => {
    const s = setup();
    const p1 = s.pallet('P-000001'),
      p3 = s.pallet('P-000003');
    const rack = s.loc('A-01-01', s.main);
    const loadBefore = rack.load_pallets ?? 0;
    const id = created(s.run(OPERATOR, s.main, 'create_transfer', { to_workspace_id: s.overflow, lines: [s.line(p1), s.line(p3)], note: 'Truck 4', send: true }));
    const t = s.transfer(id);
    expect(t.number).toBe('TR-0001');
    expect(t.status).toBe('IN_TRANSIT');
    expect(t.lines.map((l) => [l.code, l.status, l.from_location_code])).toEqual([
      ['P-000001', 'IN_TRANSIT', 'B-01-01'],
      ['P-000003', 'IN_TRANSIT', 'A-01-01'],
    ]);
    const after = s.db.pallets[p3.id];
    expect(after.state).toBe('IN_TRANSIT');
    expect(after.current_location_id).toBeNull();
    expect(after.workspace_id).toBe(s.main);
    expect(after.transfer?.number).toBe('TR-0001');
    expect(after.version).toBe(p3.version + 1);
    expect(s.db.locations[rack.id].load_pallets).toBe(loadBefore - 1);
    const last = s.db.events[p3.id].at(-1)!;
    expect(last.type).toBe('transfer_send');
    expect(last.workspace_id).toBe(s.main);
    expect(last.detail.to_warehouse).toBe('Overflow yard');
    // Both warehouses list it.
    expect(s.engine.transfers(OPERATOR, s.main).map((x) => x.id)).toContain(id);
    expect(s.engine.transfers(OPERATOR, s.overflow).map((x) => x.id)).toContain(id);
  });

  it('blocks every pallet command while in transit, and explains it in Move', () => {
    const s = setup();
    const p = s.pallet('P-000003');
    created(s.run(OPERATOR, s.main, 'create_transfer', { to_workspace_id: s.overflow, lines: [s.line(p)], send: true }));
    const now = s.db.pallets[p.id];
    const input = (payload: Record<string, unknown>) => ({ pallet: now, job: undefined, payload, now: new Date().toISOString(), actorId: OPERATOR });
    expect(checkTransition('move', input({}))).toMatchObject({ ok: false, code: 'INVALID_STATE' });
    expect(checkTransition('dispatch', input({ destination: 'Site' }))).toMatchObject({ ok: false, code: 'INVALID_STATE' });
    const blocked = moveBlocker(now);
    expect(blocked?.route).toBe('transfer');
    expect(blocked?.message).toContain('in transit to Overflow yard on TR-0001');
    const moved = s.run(OPERATOR, s.main, 'move', { location_id: s.loc('A-01-02', s.main).id }, { pallet_id: p.id, expected_version: now.version });
    expect(moved.ok).toBe(false);
  });

  it('saves a draft that leaves pallets in place, then sends it with the transfer version', () => {
    const s = setup();
    const p = s.pallet('P-000003');
    const id = created(s.run(OPERATOR, s.main, 'create_transfer', { to_workspace_id: s.overflow, lines: [s.line(p)] }));
    expect(s.transfer(id).status).toBe('DRAFT');
    expect(s.db.pallets[p.id].state).toBe('STORED');
    const stale = s.run(OPERATOR, s.main, 'send_transfer', { transfer_id: id }, { expected_version: s.transfer(id).version + 5 });
    expect(stale.ok === false && stale.code).toBe('VERSION_CONFLICT');
    const fromDest = s.run(OPERATOR, s.overflow, 'send_transfer', { transfer_id: id }, { expected_version: s.transfer(id).version });
    expect(fromDest.ok === false && fromDest.code).toBe('INVALID_STATE');
    expect(s.run(OPERATOR, s.main, 'send_transfer', { transfer_id: id }, { expected_version: s.transfer(id).version }).ok).toBe(true);
    expect(s.transfer(id).status).toBe('IN_TRANSIT');
    expect(s.transfer(id).sent_by).toBe(OPERATOR);
  });

  it('rejects a pallet that changed since it was picked, and pallets that cannot go', () => {
    const s = setup();
    const p = s.pallet('P-000003');
    const stale = s.run(OPERATOR, s.main, 'create_transfer', { to_workspace_id: s.overflow, lines: [{ pallet_id: p.id, expected_version: p.version - 1 }], send: true });
    expect(stale.ok === false && stale.code).toBe('VERSION_CONFLICT');
    const held = s.run(OPERATOR, s.main, 'create_transfer', { to_workspace_id: s.overflow, lines: [s.line(s.pallet('P-000005'))], send: true });
    expect(held.ok === false && held.code).toBe('INVALID_STATE');
    const twice = s.run(OPERATOR, s.main, 'create_transfer', { to_workspace_id: s.overflow, lines: [s.line(p), s.line(p)], send: true });
    expect(twice.ok).toBe(false);
    const same = s.run(OPERATOR, s.main, 'create_transfer', { to_workspace_id: s.main, lines: [s.line(p)], send: true });
    expect(same.ok).toBe(false);
    // Nothing moved and no number was used.
    expect(s.db.pallets[p.id].state).toBe('STORED');
    expect(Object.keys(s.db.transfers)).toHaveLength(0);
  });

  it('viewers cannot create, send or receive', () => {
    const s = setup();
    const r = s.run(VIEWER, s.main, 'create_transfer', { to_workspace_id: s.overflow, lines: [s.line(s.pallet('P-000003'))], send: true });
    expect(r.ok === false && r.code).toBe('FORBIDDEN');
    const id = created(s.run(OPERATOR, s.main, 'create_transfer', { to_workspace_id: s.overflow, lines: [s.line(s.pallet('P-000003'))], send: true }));
    const t = s.transfer(id);
    const viewer = s.receive(VIEWER, t, t.lines[0]);
    expect(viewer.ok === false && viewer.code).toBe('FORBIDDEN');
  });

  it('receives one pallet at a time onto a spot or awaiting placement, partly then fully', () => {
    const s = setup();
    const p1 = s.pallet('P-000001'),
      p2 = s.pallet('P-000002');
    const id = created(s.run(OPERATOR, s.main, 'create_transfer', { to_workspace_id: s.overflow, lines: [s.line(p1), s.line(p2)], send: true }));
    const spot = s.loc('C-01-02', s.overflow);
    let t = s.transfer(id);
    // Only at the destination.
    const atOrigin = s.run(OPERATOR, s.main, 'receive_transfer', { transfer_id: id }, { pallet_id: p1.id, expected_version: t.lines[0].version });
    expect(atOrigin.ok === false && atOrigin.code).toBe('INVALID_STATE');
    // A stale version is a conflict.
    const stale = s.receive(OPERATOR, t, { ...t.lines[0], version: t.lines[0].version - 1 });
    expect(stale.ok === false && stale.code).toBe('VERSION_CONFLICT');
    expect(s.receive(OPERATOR, t, t.lines[0], spot.id).ok).toBe(true);
    t = s.transfer(id);
    expect(t.status).toBe('PARTLY_RECEIVED');
    const moved = s.db.pallets[p1.id];
    expect(moved.workspace_id).toBe(s.overflow);
    expect(moved.code).toBe('P-000001');
    expect(moved.state).toBe('STORED');
    expect(moved.current_location_id).toBe(spot.id);
    expect(moved.transfer).toBeNull();
    // The job with the same code is kept at the destination.
    expect(s.db.jobs[moved.job_id].workspace_id).toBe(s.overflow);
    expect(s.db.jobs[moved.job_id].code).toBe('JOB-1');
    // Its label follows, so scanning it at the destination finds the same record.
    const token = s.engine.activeLabel(p1.id)!.token;
    expect(s.engine.resolve(OPERATOR, s.overflow, makeLabelPayload('P', token))).toMatchObject({ type: 'pallet', pallet: { id: p1.id } });
    const ev = s.db.events[p1.id].at(-1)!;
    expect(ev.type).toBe('transfer_receive');
    expect(ev.workspace_id).toBe(s.overflow);
    // Receiving it again is refused.
    const again = s.receive(OPERATOR, t, t.lines[0]);
    expect(again.ok === false && again.code).toBe('INVALID_STATE');

    expect(s.receive(OPERATOR, t, t.lines[1]).ok).toBe(true);
    t = s.transfer(id);
    expect(t.status).toBe('RECEIVED');
    expect(t.received_by).toBe(OPERATOR);
    expect(s.db.pallets[p2.id].state).toBe('RECEIVED');
    expect(s.db.pallets[p2.id].current_location_id).toBeNull();
    // The other job code does not exist there, so the pallet has no job; the history says which it was.
    expect(t.lines[1].to_location_code).toBeNull();
    expect(t.log.map((x) => x.action)).toEqual(['created', 'sent', 'received', 'received']);
  });

  it('only managers and owners cancel a sent transfer, with a reason; pallets not received go back', () => {
    const s = setup();
    const p1 = s.pallet('P-000001'),
      p3 = s.pallet('P-000003');
    const id = created(s.run(OPERATOR, s.main, 'create_transfer', { to_workspace_id: s.overflow, lines: [s.line(p1), s.line(p3)], send: true }));
    let t = s.transfer(id);
    expect(s.receive(OPERATOR, t, t.lines[0]).ok).toBe(true);
    t = s.transfer(id);
    const operator = s.run(OPERATOR, s.main, 'cancel_transfer', { transfer_id: id, reason: 'Truck broke down' }, { expected_version: t.version });
    expect(operator.ok === false && operator.code).toBe('FORBIDDEN');
    const noReason = s.run(MANAGER, s.main, 'cancel_transfer', { transfer_id: id }, { expected_version: t.version });
    expect(noReason.ok).toBe(false);
    const stale = s.run(MANAGER, s.main, 'cancel_transfer', { transfer_id: id, reason: 'Truck broke down' }, { expected_version: t.version - 1 });
    expect(stale.ok === false && stale.code).toBe('VERSION_CONFLICT');
    expect(s.run(MANAGER, s.overflow, 'cancel_transfer', { transfer_id: id, reason: 'Truck broke down' }, { expected_version: t.version }).ok).toBe(true);
    t = s.transfer(id);
    expect(t.status).toBe('CANCELLED');
    expect(t.cancel_reason).toBe('Truck broke down');
    expect(t.lines.map((l) => l.status)).toEqual(['RECEIVED', 'RETURNED']);
    // The received pallet stays; the other is back on the rack it left from.
    expect(s.db.pallets[p1.id].workspace_id).toBe(s.overflow);
    const back = s.db.pallets[p3.id];
    expect(back.workspace_id).toBe(s.main);
    expect(back.state).toBe('STORED');
    expect(back.current_location_id).toBe(s.loc('A-01-01', s.main).id);
    expect(s.db.events[p3.id].at(-1)!.type).toBe('transfer_return');
    const twice = s.run(MANAGER, s.main, 'cancel_transfer', { transfer_id: id, reason: 'Again' }, { expected_version: t.version });
    expect(twice.ok).toBe(false);
  });

  it('operators can cancel a draft', () => {
    const s = setup();
    const id = created(s.run(OPERATOR, s.main, 'create_transfer', { to_workspace_id: s.overflow, lines: [s.line(s.pallet('P-000003'))] }));
    expect(s.run(OPERATOR, s.main, 'cancel_transfer', { transfer_id: id }, { expected_version: s.transfer(id).version }).ok).toBe(true);
    expect(s.transfer(id).status).toBe('CANCELLED');
    expect(s.db.pallets[s.pallet('P-000003').id].state).toBe('STORED');
  });

  it('"Transfer now" sends and receives in one step, and numbers continue per account', () => {
    const s = setup();
    created(s.run(OPERATOR, s.main, 'create_transfer', { to_workspace_id: s.overflow, lines: [s.line(s.pallet('P-000003'))] }));
    const p = s.pallet('P-000004');
    const id = created(s.run(OPERATOR, s.main, 'transfer_now', { to_workspace_id: s.overflow, lines: [s.line(p)], location_id: s.loc('C-01-01', s.overflow).id }));
    const t = s.transfer(id);
    expect(t.number).toBe('TR-0002');
    expect(t.status).toBe('RECEIVED');
    expect(s.db.pallets[p.id]).toMatchObject({ workspace_id: s.overflow, state: 'STORED' });
    expect(s.db.events[p.id].slice(-2).map((e) => [e.type, e.workspace_id])).toEqual([
      ['transfer_send', s.main],
      ['transfer_receive', s.overflow],
    ]);
    // A transfer started at the other warehouse takes the next number.
    const back = created(s.run(OPERATOR, s.overflow, 'create_transfer', { to_workspace_id: s.main, lines: [s.line(s.db.pallets[p.id])], send: true }));
    expect(s.transfer(back).number).toBe('TR-0003');
  });

  it('a spot that cannot take the pallet rolls the whole step back', () => {
    const s = setup();
    const p = s.pallet('P-000003');
    s.db.locations[s.loc('C-01-01', s.overflow).id].active = false;
    const r = s.run(OPERATOR, s.main, 'transfer_now', { to_workspace_id: s.overflow, lines: [s.line(p)], location_id: s.loc('C-01-01', s.overflow).id });
    expect(r.ok === false && r.code).toBe('INACTIVE_LOCATION');
    expect(s.db.pallets[p.id]).toMatchObject({ workspace_id: s.main, state: 'STORED' });
    expect(Object.keys(s.db.transfers)).toHaveLength(0);
  });

  it('replays a retried command instead of repeating it', () => {
    const s = setup();
    const cmd: CommandEnvelope = { schema_version: 1, command_id: uuid(), workspace_id: s.main, kind: 'create_transfer', payload: { to_workspace_id: s.overflow, lines: [s.line(s.pallet('P-000003'))], send: true } };
    const first = s.engine.execute(OPERATOR, cmd);
    const again = s.engine.execute(OPERATOR, cmd);
    expect(again.ok && again.replayed).toBe(true);
    expect(again.ok && first.ok && again.target_id).toBe(first.ok && first.target_id);
    expect(Object.keys(s.db.transfers)).toHaveLength(1);
  });

  it('stays inside one account, and needs access at the destination', () => {
    const s = setup();
    const stranger = { id: 'user-stranger', name: 'Other owner', email: 'other@example.com' };
    const { workspace } = s.engine.createWorkspace(stranger, 'Other company', { code: 'X', name: 'Other yard', timezone: 'UTC' });
    s.engine.addMember(workspace.id, s.db.users[OWNER], 'OWNER');
    const other = s.run(OWNER, s.main, 'create_transfer', { to_workspace_id: workspace.id, lines: [s.line(s.pallet('P-000003'))], send: true });
    expect(other.ok === false && other.code).toBe('NOT_FOUND');
    expect(s.engine.transferTargets(OWNER, s.main).map((t) => t.name)).toEqual(['Overflow yard']);
    // Without a membership at the destination, a person cannot send there.
    s.engine.setMembershipActive(s.overflow, OPERATOR, false);
    const noAccess = s.run(OPERATOR, s.main, 'create_transfer', { to_workspace_id: s.overflow, lines: [s.line(s.pallet('P-000003'))], send: true });
    expect(noAccess.ok === false && noAccess.code).toBe('FORBIDDEN');
    expect(s.engine.transferTargets(OPERATOR, s.main)).toEqual([]);
  });
});

describe('transfer scans and hints', () => {
  it('finds the transfer from its slip, and explains pallets on the way or gone', () => {
    const s = setup();
    const p = s.pallet('P-000003');
    const id = created(s.run(OPERATOR, s.main, 'create_transfer', { to_workspace_id: s.overflow, lines: [s.line(p)], send: true }));
    const token = s.engine.activeLabel(p.id)!.token;
    expect(s.engine.transferForScan(OPERATOR, s.overflow, 'tr1')?.transfer.id).toBe(id);
    expect(s.engine.transferForScan(OPERATOR, s.overflow, makeLabelPayload('P', token))?.line?.code).toBe('P-000003');
    // At the destination the pallet is not here yet: the error says where it is.
    let err: unknown;
    try {
      s.engine.resolve(OPERATOR, s.overflow, 'P-000003');
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ReadError);
    expect((err as ReadError).message).toBe('P-000003 is on its way here on TR-0001. Open the transfer to receive it.');
    expect((err as ReadError).transferId).toBe(id);
    // The slip number itself is not a pallet or a location.
    expect(() => s.engine.resolve(OPERATOR, s.main, 'TR-0001')).toThrow(/transfer slip/);
    const t = s.transfer(id);
    expect(s.receive(OPERATOR, t, t.lines[0]).ok).toBe(true);
    expect(() => s.engine.resolve(OPERATOR, s.main, makeLabelPayload('P', token))).toThrow('P-000003 moved to Overflow yard on TR-0001.');
  });

  it('asks for the label when two pallets in one warehouse share a code', () => {
    const s = setup();
    const p = s.pallet('P-000101', s.overflow);
    s.db.pallets[p.id] = { ...p, code: 'P-000003' };
    created(s.run(OPERATOR, s.main, 'transfer_now', { to_workspace_id: s.overflow, lines: [s.line(s.pallet('P-000003'))] }));
    expect(() => s.engine.resolve(OPERATOR, s.overflow, 'P-000003')).toThrow(/2 pallets here use the code P-000003/);
  });
});
