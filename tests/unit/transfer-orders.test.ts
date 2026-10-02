// A transfer picked as an order: a manager turns a draft transfer into a pick order for the receiving warehouse,
// the order is picked, packed and handed off like any other, and handing it off sends the transfer.
import { describe, expect, it } from 'vitest';
import { Engine } from '../../src/demo/engine';
import { seedSample } from '../../src/demo/seed';
import { uuid } from '../../src/domain/codes';
import { validateEnvelope } from '../../src/domain/commands';
import { nextStops, orderUnits, ordersOf, type Order } from '../../src/domain/orders';
import type { CommandEnvelope, CommandKind, CommandResult, Pallet, Transfer } from '../../src/domain/types';

const OWNER = 'user-owner',
  MANAGER = 'user-supervisor',
  OPERATOR = 'user-operator';

function setup() {
  const engine = new Engine(seedSample());
  const db = engine.db;
  // The sending warehouse is the one with orders on; the receiving one is another warehouse of the same account.
  const main = Object.values(db.warehouses).find((w) => w.active && ordersOf(w).on)!.workspace_id;
  const account = db.workspaces[main].account_id;
  const other = Object.values(db.workspaces).find((w) => w.id !== main && w.account_id === account)!.id;
  const run = (actor: string, ws: string, kind: CommandKind, payload: Record<string, unknown>, more: Partial<CommandEnvelope> = {}): CommandResult =>
    engine.execute(actor, { schema_version: 1, command_id: uuid(), workspace_id: ws, kind, payload, ...more });
  /** Stored pallets here, off hold and not waiting on any order. */
  const free = (n: number): Pallet[] => {
    const busy = new Set(Object.values(db.batches).flatMap((b) => b.stops.flatMap((s) => s.suggested.map((u) => u.pallet_id))));
    return Object.values(db.pallets)
      .filter((p) => p.workspace_id === main && p.state === 'STORED' && !p.hold && !p.archived_at && !busy.has(p.id))
      .sort((a, b) => a.code.localeCompare(b.code))
      .slice(0, n);
  };
  const draft = (pallets: Pallet[]) => ok(run(OPERATOR, main, 'create_transfer', { to_workspace_id: other, lines: pallets.map((p) => ({ pallet_id: p.id, expected_version: p.version })) }));
  const transfer = (id: string): Transfer => db.transfers[id];
  const pickTransfer = (actor: string, id: string) => run(actor, main, 'pick_transfer', { transfer_id: id }, { expected_version: transfer(id).version });
  const order = (t: Transfer): Order => db.orders[t.order!.id];
  /** Pick the order's batch, pack every unit in one box. */
  const pickAndPack = (o: Order, skip = new Set<string>()) => {
    const batchId = ok(run(MANAGER, main, 'start_batch', { order_ids: [o.id] }));
    for (;;) {
      const b = db.batches[batchId];
      const { current } = nextStops(b);
      if (!current) break;
      const unit = current.suggested[0]?.pallet_id;
      if (!unit || skip.has(unit)) {
        ok(run(MANAGER, main, 'short_pick', { batch_id: b.id, stop_key: current.key, reason: 'not_at_spot' }));
        continue;
      }
      ok(run(MANAGER, main, 'pick', { batch_id: b.id, stop_key: current.key }, { pallet_id: unit, expected_version: db.pallets[unit].version }));
    }
    ok(run(MANAGER, main, 'finish_batch', { batch_id: batchId, reason: '' }));
    const now = db.orders[o.id];
    ok(run(MANAGER, main, 'pack', { order_id: o.id, unit_ids: orderUnits(now).map((u) => u.pallet_id), box_type: ordersOf(Object.values(db.warehouses).find((w) => w.workspace_id === main && w.active)).box_types[0] }));
    return db.orders[o.id];
  };
  return { engine, db, main, other, run, free, draft, transfer, pickTransfer, order, pickAndPack };
}

function ok(r: CommandResult): string {
  if (!r.ok) throw new Error(`${r.code}: ${r.message}`);
  return r.target_id!;
}
function fails(r: CommandResult, code: string, text?: RegExp) {
  expect(r.ok).toBe(false);
  if (r.ok) return;
  expect(r.code).toBe(code);
  if (text) expect(r.message).toMatch(text);
}

describe('pick a transfer as an order', () => {
  it('needs a manager, the version they saw, and Orders and picking on', () => {
    const s = setup();
    const id = s.draft(s.free(2));
    fails(s.pickTransfer(OPERATOR, id), 'FORBIDDEN');
    fails(s.run(MANAGER, s.main, 'pick_transfer', { transfer_id: id }, { expected_version: s.transfer(id).version + 1 }), 'VERSION_CONFLICT');
    expect(validateEnvelope({ schema_version: 1, command_id: uuid(), workspace_id: s.main, kind: 'pick_transfer', payload: { transfer_id: id } }).ok).toBe(false);
    // Picked at the sending warehouse only.
    fails(s.run(MANAGER, s.other, 'pick_transfer', { transfer_id: id }, { expected_version: s.transfer(id).version }), 'INVALID_STATE', /picked at/);
    // With orders off, it says how to turn them on.
    const wh = Object.values(s.db.warehouses).find((w) => w.workspace_id === s.main && w.active)!;
    ok(s.run(OWNER, s.main, 'set_orders', { ...ordersOf(wh), on: false }));
    fails(s.pickTransfer(MANAGER, id), 'INVALID_STATE', /Orders and picking is off/);
    expect(s.transfer(id).order ?? null).toBeNull();
  });

  it('creates an order of the pallets for the receiving warehouse, linked both ways', () => {
    const s = setup();
    const pallets = s.free(2);
    const id = s.draft(pallets);
    const r = s.pickTransfer(MANAGER, id);
    ok(r);
    const t = s.transfer(id);
    const o = s.order(t);
    expect(r.ok && r.created_ids).toEqual([o.id]);
    expect(t.status).toBe('DRAFT');
    expect(t.order).toEqual({ id: o.id, code: o.code });
    expect(t.log.at(-1)?.text).toContain(`Picking as order ${o.code}`);
    expect(o.status).toBe('OPEN');
    expect(o.customer.name).toBe(t.to_name);
    expect(o.transfer).toEqual({ id: t.id, number: t.number, to_workspace_id: s.other, to_name: t.to_name });
    expect(o.allow_subs).toBe(false);
    expect(o.lines.map((l) => [l.pallet_id, l.qty])).toEqual(pallets.map((p) => [p.id, 1]));
    // While the order is under way, the transfer is not sent, cancelled or picked twice.
    fails(s.run(OPERATOR, s.main, 'send_transfer', { transfer_id: id }, { expected_version: t.version }), 'INVALID_STATE', new RegExp(`picked as ${o.code}`));
    fails(s.run(OPERATOR, s.main, 'cancel_transfer', { transfer_id: id }, { expected_version: t.version }), 'INVALID_STATE', /Cancel that order first/);
    fails(s.pickTransfer(MANAGER, id), 'INVALID_STATE', /already being picked/);
  });

  it('only pallets on a spot can be picked', () => {
    const s = setup();
    const waiting = Object.values(s.db.pallets).find((p) => p.workspace_id === s.main && p.state === 'RECEIVED' && !p.hold && !p.archived_at);
    if (!waiting) return;
    const id = s.draft([waiting]);
    fails(s.pickTransfer(MANAGER, id), 'INVALID_STATE', /not on a spot/);
  });

  it('picks the very pallets on the transfer, and handing off sends the transfer', () => {
    const s = setup();
    const pallets = s.free(2);
    const from = pallets.map((p) => s.db.locations[p.current_location_id!].code);
    const id = s.draft(pallets);
    ok(s.pickTransfer(MANAGER, id));
    const o = s.order(s.transfer(id));
    // Another order's batch does not take them while the transfer's order waits.
    const batchId = ok(s.run(MANAGER, s.main, 'start_batch', { order_ids: [o.id] }));
    const b = s.db.batches[batchId];
    expect(b.stops.map((x) => x.suggested.map((u) => u.pallet_id)).flat().sort()).toEqual(pallets.map((p) => p.id).sort());
    expect(b.stops.every((x) => x.pallet_id)).toBe(true);
    // A different record is refused, even of the same product.
    const stranger = Object.values(s.db.pallets).find((p) => p.workspace_id === s.main && p.state === 'STORED' && !p.hold && !pallets.some((x) => x.id === p.id))!;
    const stop = nextStops(b).current!;
    fails(s.run(MANAGER, s.main, 'pick', { batch_id: b.id, stop_key: stop.key }, { pallet_id: stranger.id, expected_version: stranger.version }), 'INVALID_INPUT', /This stop needs P-/);
    fails(s.run(MANAGER, s.main, 'substitute', { batch_id: b.id, stop_key: stop.key }, { pallet_id: stranger.id, expected_version: stranger.version }), 'INVALID_STATE');
    // Pick, pack, then hand off.
    ok(s.run(MANAGER, s.main, 'finish_batch', { batch_id: batchId, reason: 'Starting again' }));
    const reopened = s.db.orders[o.id];
    expect(reopened.status).toBe('OPEN');
    const packed = s.pickAndPack(reopened);
    expect(packed.status).toBe('PACKED');
    for (const p of pallets) expect(s.db.pallets[p.id].state).toBe('PICKED');
    // The plain handoff would record the pallets as gone; a transfer's order is sent as its transfer.
    const pkgs = packed.package_ids;
    fails(s.run(OPERATOR, s.main, 'hand_off', { order_id: o.id, package_ids: pkgs, carrier: 'Own truck' }, { expected_version: packed.version }), 'INVALID_STATE', /Hand it off as that transfer/);
    fails(s.run(OPERATOR, s.main, 'hand_off_transfer', { transfer_id: id, order_id: o.id, package_ids: pkgs }, { expected_version: packed.version - 1 }), 'VERSION_CONFLICT');
    ok(s.run(OPERATOR, s.main, 'hand_off_transfer', { transfer_id: id, order_id: o.id, package_ids: pkgs, carrier: 'Own truck' }, { expected_version: packed.version }));
    const t = s.transfer(id);
    expect(t.status).toBe('IN_TRANSIT');
    expect(t.sent_by).toBe(OPERATOR);
    expect(t.lines.map((l) => [l.status, l.from_location_code])).toEqual(from.map((c) => ['IN_TRANSIT', c]));
    expect(t.log.at(-1)?.text).toMatch(new RegExp(`with order ${o.code} by Own truck`));
    const done = s.db.orders[o.id];
    expect(done.status).toBe('DONE');
    expect(done.handoff?.destination).toContain(`Sent to ${t.to_name} on ${t.number}`);
    for (const k of done.package_ids) expect(s.db.packages[k].status).toBe('HANDED_OFF');
    for (const p of pallets) {
      const now = s.db.pallets[p.id];
      expect(now.state).toBe('IN_TRANSIT');
      expect(now.order ?? null).toBeNull();
      expect(now.transfer?.id).toBe(id);
      expect(s.db.events[p.id].at(-1)?.type).toBe('transfer_send');
    }
    // The other warehouse receives them as usual.
    const line = t.lines[0];
    ok(s.run(OPERATOR, s.other, 'receive_transfer', { transfer_id: id }, { pallet_id: line.pallet_id, expected_version: line.version }));
    expect(s.db.pallets[line.pallet_id].workspace_id).toBe(s.other);
    expect(s.transfer(id).status).toBe('PARTLY_RECEIVED');
  });

  it('a pallet that could not be picked comes off the transfer and stays', () => {
    const s = setup();
    const pallets = s.free(2);
    const id = s.draft(pallets);
    ok(s.pickTransfer(MANAGER, id));
    const packed = s.pickAndPack(s.order(s.transfer(id)), new Set([pallets[1].id]));
    ok(s.run(OPERATOR, s.main, 'hand_off_transfer', { transfer_id: id, order_id: packed.id, package_ids: packed.package_ids }, { expected_version: packed.version }));
    const t = s.transfer(id);
    expect(t.lines.map((l) => l.pallet_id)).toEqual([pallets[0].id]);
    expect(t.log.at(-1)?.text).toContain(`left off the transfer: ${pallets[1].code}`);
    expect(s.db.pallets[pallets[1].id].state).toBe('MISSING');
  });

  it('a cancelled order leaves the transfer a draft that can be sent or picked again', () => {
    const s = setup();
    const id = s.draft(s.free(1));
    ok(s.pickTransfer(MANAGER, id));
    const o = s.order(s.transfer(id));
    ok(s.run(MANAGER, s.main, 'cancel_order', { order_id: o.id, reason: 'Sending it by hand' }, { expected_version: o.version }));
    ok(s.pickTransfer(MANAGER, id));
    expect(s.transfer(id).order?.id).not.toBe(o.id);
    const again = s.order(s.transfer(id));
    ok(s.run(MANAGER, s.main, 'cancel_order', { order_id: again.id }, { expected_version: again.version }));
    ok(s.run(OPERATOR, s.main, 'send_transfer', { transfer_id: id }, { expected_version: s.transfer(id).version }));
    expect(s.transfer(id).status).toBe('IN_TRANSIT');
  });
});
