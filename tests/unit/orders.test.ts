// Orders and picking: the pure rules, and every engine command from a new order to the handoff, with roles,
// version conflicts, shorts, substitutes and the "Orders and picking" switch.
import { describe, expect, it } from 'vitest';
import { Engine } from '../../src/demo/engine';
import { seedSample, seedTiny } from '../../src/demo/seed';
import { uuid } from '../../src/domain/codes';
import {
  batchProgress,
  compareSpots,
  draftOrders,
  nextStops,
  parseDue,
  parseOrderCode,
  parsePackageCode,
  parseToteCode,
  pickQueue,
  sameProduct,
  sortStops,
  type Order,
  type PickBatch,
  type PickStop,
} from '../../src/domain/orders';
import { checkTransition } from '../../src/domain/transitions';
import { validateEnvelope } from '../../src/domain/commands';
import type { CommandEnvelope, CommandKind, CommandResult, Pallet, PalletCommandKind } from '../../src/domain/types';
import { SNAPSHOT_FORMAT, SNAPSHOT_VERSION, validateSnapshot } from '../../src/data/backend';
import { DB_SCHEMA_VERSION } from '../../src/demo/engine';

const OWNER = 'user-owner',
  MANAGER = 'user-supervisor',
  OPERATOR = 'user-operator',
  VIEWER = 'user-viewer';

function setup() {
  const engine = new Engine(seedSample());
  const db = engine.db;
  const ws = Object.values(db.workspaces).find((w) => w.name === 'Sample warehouse')!.id;
  const run = (actor: string, kind: CommandKind, payload: Record<string, unknown>, more: Partial<CommandEnvelope> = {}): CommandResult =>
    engine.execute(actor, { schema_version: 1, command_id: uuid(), workspace_id: ws, kind, payload, ...more });
  const pallet = (code: string): Pallet => Object.values(db.pallets).find((p) => p.code === code && p.workspace_id === ws)!;
  const loc = (code: string) => Object.values(db.locations).find((l) => l.code === code && l.workspace_id === ws)!;
  const order = (ref: string): Order => Object.values(db.orders).find((o) => o.external_ref === ref || o.code === ref)!;
  const batch = (id: string): PickBatch => db.batches[id];
  /** Pick a stop with one of the units the batch suggested for it (or the given unit). */
  const pick = (actor: string, b: PickBatch, stop: PickStop, unitId?: string, kind: 'pick' | 'substitute' = 'pick') => {
    const id = unitId ?? stop.suggested.find((u) => !stop.picked.includes(u.pallet_id))!.pallet_id;
    return run(actor, kind, { batch_id: b.id, stop_key: stop.key }, { pallet_id: id, expected_version: db.pallets[id].version });
  };
  /** Pick every open stop of a batch, in walk order. */
  const pickAll = (actor: string, batchId: string) => {
    for (;;) {
      const { current } = nextStops(batch(batchId));
      // A stop with no stock to suggest is left for the picker to record short.
      if (!current || !current.suggested.length) return;
      for (let i = current.picked.length; i < current.qty; i++) ok(pick(actor, batch(batchId), batch(batchId).stops.find((s) => s.key === current.key)!));
    }
  };
  return { engine, db, ws, run, pallet, loc, order, batch, pick, pickAll };
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

describe('order rules', () => {
  it('reads order, package and tote codes as printed, typed or scanned', () => {
    expect(parseOrderCode('O-000012')).toBe('O-000012');
    expect(parseOrderCode('o 12')).toBe('O-000012');
    expect(parsePackageCode('k-45')).toBe('K-000045');
    expect(parseToteCode('T7')).toBe('T-07');
    expect(parseToteCode('T-0')).toBeNull();
    expect(parseOrderCode('P-000012')).toBeNull();
  });

  it('matches GTINs whatever their zero padding, and walks spots in natural order', () => {
    expect(sameProduct('012345678905', '0012345678905')).toBe(true);
    expect(sameProduct('GLV-12', 'glv-12')).toBe(false);
    expect(sameProduct('GLV-12', 'GLV-12')).toBe(true);
    expect(['B-01-01', 'A-01-10', null, 'A-01-02'].sort(compareSpots)).toEqual(['A-01-02', 'A-01-10', 'B-01-01', null]);
    const s = (key: string, location_code: string | null, slot: string) => ({ key, location_code, slot }) as PickStop;
    expect(sortStops([s('1', 'B-01', 'A'), s('2', null, 'A'), s('3', 'A-02', 'B'), s('4', 'A-02', 'A')]).map((x) => x.key)).toEqual(['4', '3', '1', '2']);
  });

  it('groups CSV rows into orders and reports every bad cell with its row', () => {
    const rows: Record<string, string>[] = [
      { order_ref: '1001', customer: 'Ann', product: 'GLV-12', qty: '2', method: 'pickup', due: '2026-10-02 10:00', substitutes_ok: 'yes' },
      { order_ref: '1001', customer: '', product: 'TAPE-48', qty: '1' },
      { order_ref: '1002', customer: 'Bo', product: 'GLV-12', qty: 'two', method: 'drone' },
      { order_ref: '', customer: 'Cy', product: '' },
    ];
    const { orders, errors } = draftOrders(rows);
    expect(orders.find((o) => o.external_ref === '1001')).toMatchObject({ method: 'pickup', allow_subs: true, lines: [{ product_code: 'GLV-12', qty: 2 }, { product_code: 'TAPE-48', qty: 1 }] });
    expect(errors.map((e) => `${e.row}:${e.column}`)).toEqual(expect.arrayContaining(['4:qty', '4:method', '5:order_ref', '5:product']));
    expect(parseDue('10/2/2026 2:30 PM')).toBe(new Date(2026, 9, 2, 14, 30).toISOString());
    expect(parseDue('soon')).toBe('invalid');
  });

  it('a picked unit stays with its order: only details, photos and labels can change', () => {
    const p = { code: 'P-1', state: 'PICKED', hold: null, description: 'Old name' } as unknown as Pallet;
    const ctx = (kind: PalletCommandKind) => checkTransition(kind, { pallet: p, job: undefined, payload: { location_id: 'x', description: 'New name', destination: 'Out' }, now: '', actorId: '' });
    expect(ctx('move').ok).toBe(false);
    expect(ctx('dispatch').ok).toBe(false);
    expect(ctx('edit_details').ok).toBe(true);
  });

  it('versioned order commands must carry the version the person saw', () => {
    const env = (kind: CommandKind, payload: Record<string, unknown>, more = {}) => validateEnvelope({ schema_version: 1, command_id: 'cmd-12345678', workspace_id: 'w', kind, payload, ...more });
    expect(env('hand_off', { order_id: 'o', package_ids: ['k'] }).ok).toBe(false);
    expect(env('hand_off', { order_id: 'o', package_ids: ['k'] }, { expected_version: 3 }).ok).toBe(true);
    expect(env('pick', { batch_id: 'b', stop_key: 'A1-1' }).ok).toBe(false);
    expect(env('pick', { batch_id: 'b', stop_key: 'A1-1' }, { pallet_id: 'p', expected_version: 1 }).ok).toBe(true);
    expect(env('short_pick', { batch_id: 'b', stop_key: 'A1-1', reason: 'lost' }).ok).toBe(false);
  });
});

describe('the sample warehouse', () => {
  it('has orders on, four orders ready to pick, staging spots, and stock numbered apart from the examples', () => {
    const s = setup();
    const wh = Object.values(s.db.warehouses).find((w) => w.workspace_id === s.ws)!;
    expect(wh.orders?.on).toBe(true);
    expect(pickQueue(Object.values(s.db.orders)).map((o) => o.customer.name)).toEqual(['Jordan Lee', 'Lakeside Dental', 'Maria Ortiz', 'Northside Print Shop']);
    expect(s.loc('STAGING-01').kind).toBe('STAGING');
    expect(s.pallet('P-000201').receiving?.product_code).toBe('GLV-12');
    expect(s.db.counters[s.ws]).toBe(6);
    expect(s.db.counters[`${s.ws}:O`]).toBe(4);
  });

  it('a backup with orders passes the backup checks', () => {
    const s = setup();
    const check = validateSnapshot(JSON.parse(JSON.stringify({ format: SNAPSHOT_FORMAT, snapshot_version: SNAPSHOT_VERSION, db_schema: DB_SCHEMA_VERSION, db: s.db })));
    expect(check.ok ? [] : check.problems).toEqual([]);
  });

  it('warehouses created before orders have them off, and every order command says so', () => {
    const engine = new Engine(seedTiny());
    const ws = Object.values(engine.db.workspaces)[0].id;
    const r = engine.execute('user-supervisor', { schema_version: 1, command_id: uuid(), workspace_id: ws, kind: 'start_batch', payload: {} });
    fails(r, 'INVALID_STATE', /Orders and picking is off/);
  });
});

describe('settings and orders', () => {
  it('only an owner turns orders on or changes the cart and boxes; a job word of "Order" goes back to "Job"', () => {
    const s = setup();
    const settings = { on: true, cart_size: 6, box_types: ['Bag', ' Bag ', 'Crate'], subs: 'allow' };
    fails(s.run(MANAGER, 'set_orders', settings), 'FORBIDDEN');
    const wh = Object.values(s.db.warehouses).find((w) => w.workspace_id === s.ws)!;
    s.db.warehouses[wh.id] = { ...wh, setup: { ...wh.setup!, job: 'Order', jobs: 'Orders' } };
    ok(s.run(OWNER, 'set_orders', settings));
    const after = s.db.warehouses[wh.id];
    expect(after.orders).toEqual({ on: true, cart_size: 6, box_types: ['Bag', 'Crate'], subs: 'allow' });
    expect(after.setup?.job).toBe('Job');
    fails(s.run(OWNER, 'set_orders', { ...settings, box_types: [] }), 'INVALID_INPUT', /box type/);
  });

  it('managers create orders from saved products or stock codes; operators and viewers cannot', () => {
    const s = setup();
    const draft = { customer: { name: 'Test Co' }, method: 'ship', allow_subs: false, lines: [{ product_code: 'GLV-12', qty: 1 }, { product_code: 'GLV-12', qty: 2 }] };
    fails(s.run(OPERATOR, 'create_order', draft), 'FORBIDDEN');
    fails(s.run(VIEWER, 'create_order', draft), 'FORBIDDEN');
    const id = ok(s.run(MANAGER, 'create_order', { ...draft, external_ref: 'X-1' }));
    expect(s.db.orders[id]).toMatchObject({ code: 'O-000005', status: 'OPEN', lines: [{ product_code: 'GLV-12', qty: 3, description: 'Work gloves, box of 12' }] });
    fails(s.run(MANAGER, 'create_order', { ...draft, external_ref: 'X-1' }), 'INVALID_INPUT', /already exists/);
    fails(s.run(MANAGER, 'create_order', { ...draft, lines: [{ product_code: 'NOPE', qty: 1 }] }), 'INVALID_INPUT', /No product with barcode or SKU NOPE/);
  });

  it('imports orders from a sheet, all rows or none', () => {
    const s = setup();
    const imp = (rows: Record<string, string>[]) => s.run(MANAGER, 'import_batch', { import_kind: 'orders', checksum: uuid(), rows });
    const bad = imp([
      { order_ref: 'W-1', customer: 'Ann', product: 'GLV-12', qty: '1' },
      { order_ref: 'W-2', customer: 'Bo', product: 'MISSING', qty: '1' },
    ]);
    expect(bad.ok).toBe(false);
    expect(Object.values(s.db.orders).some((o) => o.external_ref === 'W-1')).toBe(false);
    ok(
      imp([
        { order_ref: 'W-1', customer: 'Ann', product: 'GLV-12', qty: '1', method: 'pickup' },
        { order_ref: 'W-1', customer: '', product: 'LMP-20', qty: '1' },
        { order_ref: 'W-2', customer: 'Bo', product: 'TAPE-48', qty: '2' },
      ]),
    );
    expect(s.order('W-1')).toMatchObject({ method: 'pickup', lines: [{ product_code: 'GLV-12' }, { product_code: 'LMP-20' }] });
    expect(s.order('W-2').lines[0].qty).toBe(2);
  });

  it('cancels an order that is not being picked, with the version the manager saw', () => {
    const s = setup();
    const o = s.order('WEB-1043');
    fails(s.run(MANAGER, 'cancel_order', { order_id: o.id, reason: 'Customer called' }, { expected_version: o.version + 1 }), 'VERSION_CONFLICT');
    fails(s.run(OPERATOR, 'cancel_order', { order_id: o.id, reason: 'x' }, { expected_version: o.version }), 'FORBIDDEN');
    ok(s.run(MANAGER, 'cancel_order', { order_id: o.id, reason: 'Customer called' }, { expected_version: o.version }));
    expect(s.order('WEB-1043').status).toBe('CANCELLED');
  });
});

describe('a batch from start to handoff', () => {
  it('starts with the soonest due orders, one tote letter each, stops walked by spot', () => {
    const s = setup();
    const id = ok(s.run(OPERATOR, 'start_batch', {}));
    const b = s.batch(id);
    expect(b.code).toBe('B-0001');
    expect(b.slots.map((x) => `${x.letter} ${x.customer}`)).toEqual(['A Jordan Lee', 'B Lakeside Dental', 'C Maria Ortiz', 'D Northside Print Shop']);
    const spots = b.stops.map((x) => x.location_code);
    expect(spots).toEqual([...spots].sort(compareSpots));
    expect(b.stops.every((x) => x.suggested.length === x.qty)).toBe(true);
    expect(s.order('WEB-1042')).toMatchObject({ status: 'PICKING', slot: 'A', batch_code: 'B-0001' });
    // One batch at a time per picker; the queue is now empty for anyone else.
    fails(s.run(OPERATOR, 'start_batch', {}), 'INVALID_STATE', /in progress/);
    fails(s.run(MANAGER, 'start_batch', {}), 'INVALID_STATE', /No orders are waiting/);
    fails(s.run(OPERATOR, 'start_batch', { order_ids: [s.order('WEB-1042').id] }), 'FORBIDDEN');
  });

  it('assigns reusable totes, never one already holding another order', () => {
    const s = setup();
    const b = s.batch(ok(s.run(OPERATOR, 'start_batch', {})));
    ok(s.run(OPERATOR, 'assign_tote', { batch_id: b.id, letter: 'A', tote_code: 't7' }));
    expect(s.batch(b.id).slots[0].tote_code).toBe('T-07');
    expect(s.order('WEB-1042').tote_code).toBe('T-07');
    fails(s.run(OPERATOR, 'assign_tote', { batch_id: b.id, letter: 'B', tote_code: 'T-07' }), 'INVALID_INPUT', /already tote A/);
    fails(s.run(OPERATOR, 'assign_tote', { batch_id: b.id, letter: 'B', tote_code: 'BOX' }), 'INVALID_INPUT', /tote label/);
    // Another picker may not touch this batch; a manager may.
    fails(s.run(VIEWER, 'assign_tote', { batch_id: b.id, letter: 'B', tote_code: 'T-08' }), 'FORBIDDEN');
    ok(s.run(MANAGER, 'assign_tote', { batch_id: b.id, letter: 'B', tote_code: 'T-08' }));
  });

  it('a pick moves the unit off its spot into the tote; a wrong product or an old version is refused', () => {
    const s = setup();
    const b = s.batch(ok(s.run(OPERATOR, 'start_batch', {})));
    const stop = nextStops(b).current!;
    const other = Object.values(s.db.pallets).find((p) => p.state === 'STORED' && p.receiving?.product_code && !sameProduct(p.receiving.product_code, stop.product_code))!;
    fails(s.pick(OPERATOR, b, stop, other.id), 'INVALID_INPUT', /This stop needs/);
    const unit = stop.suggested[0].pallet_id;
    fails(s.run(OPERATOR, 'pick', { batch_id: b.id, stop_key: stop.key }, { pallet_id: unit, expected_version: s.db.pallets[unit].version + 1 }), 'VERSION_CONFLICT');
    ok(s.pick(OPERATOR, b, stop, unit));
    const p = s.db.pallets[unit];
    expect(p.state).toBe('PICKED');
    expect(p.current_location_id).toBeNull();
    expect(p.order).toMatchObject({ slot: stop.slot, order_code: s.db.orders[stop.order_id].code });
    expect(s.db.events[unit].at(-1)!.type).toBe('pick');
    // A picked unit cannot be moved or shipped on its own.
    fails(s.run(OPERATOR, 'move', { location_id: s.loc('A-01-01').id }, { pallet_id: unit, expected_version: p.version }), 'INVALID_STATE');
    // The same scan again (a double read) is refused rather than counted twice.
    expect(s.pick(OPERATOR, s.batch(b.id), s.batch(b.id).stops.find((x) => x.key === stop.key)!, unit).ok).toBe(false);
  });

  it('a short when the unit is not at its spot marks it missing and sends the picker to the next spot with stock', () => {
    const s = setup();
    // TAPE-48 is on A-02-02 (3) and B-02-02 (1). Order WEB-1043 wants 2.
    const b = s.batch(ok(s.run(MANAGER, 'start_batch', { order_ids: [s.order('WEB-1043').id], assign_to: OPERATOR })));
    const tape = b.stops.find((x) => x.product_code === 'TAPE-48')!;
    expect(tape).toMatchObject({ location_code: 'A-02-02', qty: 2 });
    const [first, second] = tape.suggested.map((u) => u.pallet_id);
    ok(s.pick(OPERATOR, b, tape, first));
    ok(s.run(OPERATOR, 'short_pick', { batch_id: b.id, stop_key: tape.key, reason: 'not_at_spot' }));
    expect(s.db.pallets[second].state).toBe('MISSING');
    const after = s.batch(b.id);
    const old = after.stops.find((x) => x.key === tape.key)!;
    expect(old).toMatchObject({ status: 'done', qty: 1, moved_to: 'B-02-02' });
    const extra = after.stops.find((x) => x.location_code === 'B-02-02' && x.product_code === 'TAPE-48')!;
    expect(extra).toMatchObject({ status: 'open', qty: 1 });
    expect(s.order('WEB-1043').lines[0].short).toBeNull();
  });

  it('a short with no stock elsewhere leaves the line short, and shorts never block packing', () => {
    const s = setup();
    // LMP-20: two in stock. Ask for three.
    ok(s.run(MANAGER, 'create_order', { customer: { name: 'Short Co' }, method: 'pickup', allow_subs: false, lines: [{ product_code: 'LMP-20', qty: 3 }] }));
    const o = Object.values(s.db.orders).find((x) => x.customer.name === 'Short Co')!;
    const b = s.batch(ok(s.run(MANAGER, 'start_batch', { order_ids: [o.id] })));
    expect(b.stops.map((x) => [x.location_code, x.qty])).toEqual([
      ['B-02-01', 2],
      [null, 1],
    ]);
    s.pickAll(MANAGER, b.id);
    fails(s.run(MANAGER, 'finish_batch', { batch_id: b.id, reason: '' }), 'INVALID_INPUT', /why/);
    const noStock = nextStops(s.batch(b.id)).current!;
    expect(noStock.location_code).toBeNull();
    ok(s.run(MANAGER, 'short_pick', { batch_id: b.id, stop_key: noStock.key, reason: 'no_stock' }));
    ok(s.run(MANAGER, 'finish_batch', { batch_id: b.id, reason: '' }));
    const done = s.db.orders[o.id];
    expect(done.status).toBe('PICKED');
    expect(done.lines[0].short).toMatchObject({ qty: 1, reason: 'no_stock' });
    ok(s.run(MANAGER, 'pack', { order_id: o.id, unit_ids: done.lines[0].units.map((u) => u.pallet_id), box_type: 'Large box' }));
    expect(s.db.orders[o.id].status).toBe('PACKED');
  });

  it('an operator cannot finish with stops open; a manager can, with a reason', () => {
    const s = setup();
    const b = s.batch(ok(s.run(OPERATOR, 'start_batch', {})));
    fails(s.run(OPERATOR, 'finish_batch', { batch_id: b.id, reason: 'Lunch' }), 'INVALID_STATE', /still open/);
    ok(s.run(MANAGER, 'finish_batch', { batch_id: b.id, reason: 'Picker went home' }));
    // Nothing was picked: every order goes back to the queue.
    expect(pickQueue(Object.values(s.db.orders))).toHaveLength(4);
    expect(s.batch(b.id).status).toBe('DONE');
  });

  it('substitutes: only where the customer allowed them, and a manager approves or refuses before packing', () => {
    const s = setup();
    // Jordan Lee allows substitutes; Lakeside Dental does not.
    const b = s.batch(ok(s.run(MANAGER, 'start_batch', { order_ids: [s.order('WEB-1042').id, s.order('WEB-1041').id], assign_to: OPERATOR })));
    const cable = b.stops.find((x) => x.product_code === 'CBL-C2')!;
    const gloves = b.stops.find((x) => x.product_code === 'GLV-12')!;
    const oneMetre = s.pallet('P-000210');
    expect(oneMetre.receiving?.product_code).toBe('CBL-C1');
    fails(s.pick(OPERATOR, b, gloves, oneMetre.id, 'substitute'), 'INVALID_STATE', /did not allow substitutes/);
    ok(s.pick(OPERATOR, b, cable, oneMetre.id, 'substitute'));
    s.pickAll(OPERATOR, b.id);
    ok(s.run(OPERATOR, 'finish_batch', { batch_id: b.id, reason: '' }));
    const jordan = s.order('WEB-1042');
    expect(jordan.lines[0].units[0].sub?.status).toBe('pending');
    fails(s.run(OPERATOR, 'pack', { order_id: jordan.id, unit_ids: jordan.lines.flatMap((l) => l.units.map((u) => u.pallet_id)), box_type: 'Small box' }), 'INVALID_STATE', /approve the substitute/);
    fails(s.run(OPERATOR, 'decide_sub', { order_id: jordan.id, pallet_id: oneMetre.id, approve: true }), 'FORBIDDEN');
    ok(s.run(MANAGER, 'decide_sub', { order_id: jordan.id, pallet_id: oneMetre.id, approve: false, note: 'Customer wants the 2 m only' }));
    const after = s.order('WEB-1042');
    expect(after.lines[0].units).toHaveLength(0);
    expect(after.lines[0].short?.qty).toBe(1);
    // The refused unit is back in stock, waiting for a spot.
    expect(s.db.pallets[oneMetre.id]).toMatchObject({ state: 'RECEIVED', order: null });
  });

  it('pack, stage on a staging spot, and hand off every package: each unit is dispatched to the customer', () => {
    const s = setup();
    const o = s.order('WEB-1041');
    const b = s.batch(ok(s.run(MANAGER, 'start_batch', { order_ids: [o.id], assign_to: OPERATOR })));
    ok(s.run(OPERATOR, 'assign_tote', { batch_id: b.id, letter: 'A', tote_code: 'T-03' }));
    s.pickAll(OPERATOR, b.id);
    ok(s.run(OPERATOR, 'finish_batch', { batch_id: b.id, reason: '' }));
    const units = s.order('WEB-1041').lines.flatMap((l) => l.units.map((u) => u.pallet_id));
    expect(units).toHaveLength(3);
    fails(s.run(OPERATOR, 'pack', { order_id: o.id, unit_ids: units, box_type: '' }), 'INVALID_INPUT', /box/);
    const k1 = ok(s.run(OPERATOR, 'pack', { order_id: o.id, unit_ids: units.slice(0, 2), box_type: 'Medium box', weight_lb: 4.5 }));
    expect(s.db.packages[k1]).toMatchObject({ code: 'K-000001', seq: 1, status: 'PACKED' });
    expect(s.order('WEB-1041').status).toBe('PICKED');
    fails(s.run(OPERATOR, 'pack', { order_id: o.id, unit_ids: units.slice(1), box_type: 'Mailer' }), 'INVALID_STATE', /already in a package/);
    const k2 = ok(s.run(OPERATOR, 'pack', { order_id: o.id, unit_ids: units.slice(2), box_type: 'Mailer' }));
    expect(s.order('WEB-1041').status).toBe('PACKED');
    expect(s.db.pallets[units[0]].order?.package_code).toBe('K-000001');

    fails(s.run(OPERATOR, 'stage_package', { package_id: k1, location_id: s.loc('A-01-01').id }), 'INVALID_INPUT', /not a staging spot/);
    ok(s.run(OPERATOR, 'stage_package', { package_id: k1, location_id: s.loc('STAGING-01').id }));
    expect(s.order('WEB-1041').status).toBe('PACKED');
    ok(s.run(OPERATOR, 'stage_package', { package_id: k2, location_id: s.loc('STAGING-01').id }));
    expect(s.order('WEB-1041').status).toBe('STAGED');

    const v = s.order('WEB-1041').version;
    fails(s.run(OPERATOR, 'hand_off', { order_id: o.id, package_ids: [k1], carrier: 'UPS' }, { expected_version: v }), 'INVALID_INPUT', /Not scanned: K-000002/);
    fails(s.run(OPERATOR, 'hand_off', { order_id: o.id, package_ids: [k1, k2], carrier: 'UPS' }, { expected_version: v - 1 }), 'VERSION_CONFLICT');
    ok(s.run(OPERATOR, 'hand_off', { order_id: o.id, package_ids: [k1, k2], carrier: 'UPS', tracking: '1Z999' }, { expected_version: v }));
    const done = s.order('WEB-1041');
    expect(done.status).toBe('DONE');
    expect(done.handoff?.destination).toBe('Shipped by UPS, tracking 1Z999 to Lakeside Dental (O-000001)');
    for (const id of units) {
      expect(s.db.pallets[id].state).toBe('DISPATCHED');
      expect(s.db.events[id].at(-1)!.type).toBe('hand_off');
    }
    expect(s.db.packages[k1].status).toBe('HANDED_OFF');
  });

  it('a pickup needs the name of the person collecting it', () => {
    const s = setup();
    const o = s.order('WEB-1044');
    const b = s.batch(ok(s.run(MANAGER, 'start_batch', { order_ids: [o.id], assign_to: MANAGER })));
    s.pickAll(MANAGER, b.id);
    ok(s.run(MANAGER, 'finish_batch', { batch_id: b.id, reason: '' }));
    const units = s.order('WEB-1044').lines.flatMap((l) => l.units.map((u) => u.pallet_id));
    const k = ok(s.run(MANAGER, 'pack', { order_id: o.id, unit_ids: units, box_type: 'Small box' }));
    const v = s.order('WEB-1044').version;
    fails(s.run(OPERATOR, 'hand_off', { order_id: o.id, package_ids: [k] }, { expected_version: v }), 'INVALID_INPUT', /name/);
    ok(s.run(OPERATOR, 'hand_off', { order_id: o.id, package_ids: [k], collected_by: 'Maria Ortiz' }, { expected_version: v }));
    expect(String(s.db.events[units[0]].at(-1)!.detail?.destination)).toMatch(/^Picked up by Maria Ortiz for Maria Ortiz/);
  });

  it('two pickers never get the same unit, and the receipt makes a retried pick harmless', () => {
    const s = setup();
    const first = s.batch(ok(s.run(MANAGER, 'start_batch', { order_ids: [s.order('WEB-1041').id], assign_to: OPERATOR })));
    const second = s.batch(ok(s.run(MANAGER, 'start_batch', { order_ids: [s.order('WEB-1044').id], assign_to: MANAGER })));
    const a = new Set(first.stops.flatMap((x) => x.suggested.map((u) => u.pallet_id)));
    expect(second.stops.flatMap((x) => x.suggested.map((u) => u.pallet_id)).some((id) => a.has(id))).toBe(false);
    const stop = nextStops(first).current!;
    const unit = stop.suggested[0].pallet_id;
    const cmd: CommandEnvelope = { schema_version: 1, command_id: uuid(), workspace_id: s.ws, kind: 'pick', pallet_id: unit, expected_version: s.db.pallets[unit].version, payload: { batch_id: first.id, stop_key: stop.key } };
    const r1 = s.engine.execute(OPERATOR, cmd);
    const r2 = s.engine.execute(OPERATOR, cmd);
    expect(r1.ok && r2.ok).toBe(true);
    expect(s.batch(first.id).stops.find((x) => x.key === stop.key)!.picked).toEqual([unit]);
    expect(batchProgress(s.batch(first.id)).units).toBe(1);
  });
});
