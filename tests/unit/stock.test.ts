// Stock: on-hand counts, minimums and Running low, quantity changes with reasons and approval, reorder notes,
// dispatch numbers for the dispatch slip, and the stock reports.
import { describe, expect, it } from 'vitest';
import { Engine } from '../../src/demo/engine';
import { seedSample } from '../../src/demo/seed';
import { uuid } from '../../src/domain/codes';
import { validateEnvelope } from '../../src/domain/commands';
import { productKey, type ProductMemory } from '../../src/domain/receiving';
import { adjustmentReport, agingReport, productReport, transferReport, zoneReport, stateCounts, reportFile } from '../../src/domain/reports';
import {
  adjustLine,
  adjustQty,
  fmtQty,
  formatDispatchRef,
  isLow,
  lowStock,
  measure,
  parseDispatchRef,
  parseQty,
  stockByKey,
  stockOf,
  suggestQty,
  withQty,
} from '../../src/domain/stock';
import type { CommandEnvelope, CommandKind, CommandResult, Pallet } from '../../src/domain/types';

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
  const product = (code: string): ProductMemory => db.products[productKey(ws, code)];
  const here = (w = ws) => Object.values(db.pallets).filter((p) => p.workspace_id === w);
  const low = () => lowStock(Object.values(db.products).filter((p) => p.workspace_id === ws), stockByKey(here()));
  return { engine, db, ws, overflow, run, pallet, product, here, low };
}

function ok(r: CommandResult): CommandResult {
  if (!r.ok) throw new Error(`${r.code}: ${r.message}`);
  return r;
}

/** The pallet of a product in the main yard, here and not on hold. */
function unitOf(s: ReturnType<typeof setup>, code: string): Pallet {
  return s.here().find((p) => p.receiving?.product_code === code && (p.state === 'STORED' || p.state === 'RECEIVED'))!;
}

describe('quantities', () => {
  it('reads the leading number of a quantity as people type it', () => {
    expect(parseQty('48')).toBe(48);
    expect(parseQty('1,200 logs')).toBe(1200);
    expect(parseQty('2.5 cords')).toBe(2.5);
    expect(parseQty('about 4')).toBeNull();
    expect(parseQty('')).toBeNull();
    expect(parseQty(null)).toBeNull();
  });
  it('replaces the number and keeps the words after it', () => {
    expect(withQty('48 logs', 45)).toBe('45 logs');
    expect(withQty('1,200', 1100)).toBe('1100');
    expect(withQty('', 3)).toBe('3');
    expect(fmtQty(2.50000001)).toBe('2.5');
  });
  it('works out each reason from the quantity recorded now', () => {
    expect(adjustQty('10', 'used', 3)).toEqual({ ok: true, from: 10, to: 7 });
    expect(adjustQty('10', 'damaged', 10)).toEqual({ ok: true, from: 10, to: 0 });
    expect(adjustQty('10', 'write_off', 0.5)).toEqual({ ok: true, from: 10, to: 9.5 });
    expect(adjustQty('10', 'found', 2)).toEqual({ ok: true, from: 10, to: 12 });
    expect(adjustQty('', 'found', 2)).toEqual({ ok: true, from: null, to: 2 });
    expect(adjustQty('10', 'counted', 8)).toEqual({ ok: true, from: 10, to: 8 });
    expect(adjustQty('', 'counted', 8)).toEqual({ ok: true, from: null, to: 8 });
    expect(adjustQty('10', 'used', 11)).toMatchObject({ ok: false, message: expect.stringMatching(/Only 10 recorded/) });
    expect(adjustQty('', 'used', 1)).toMatchObject({ ok: false, message: expect.stringMatching(/Counted/) });
    expect(adjustQty('10', 'used', 0)).toMatchObject({ ok: false });
    expect(adjustQty('10', 'counted', 10)).toMatchObject({ ok: false, message: expect.stringMatching(/already 10/) });
    expect(adjustQty('10', 'used', -1)).toMatchObject({ ok: false });
  });
  it('describes a change in one line', () => {
    expect(adjustLine('used', 3, 10, 7, 'tires')).toBe('Used 3: 10 → 7 tires');
    expect(adjustLine('counted', 8, null, 8, null)).toBe('Counted: none recorded → 8');
  });
});

describe('minimums', () => {
  const p = (min: number | null, count_by: 'units' | 'quantity' = 'units', reorder_qty: number | null = null) => ({ min_qty: min, count_by, reorder_qty });
  it('counts pallets here and not on hold, or the quantity on them', () => {
    const s = { units: 3, qty: 7.5, held: 2 };
    expect(measure(p(4), s)).toBe(3);
    expect(measure(p(4, 'quantity'), s)).toBe(7.5);
    expect(isLow(p(4), s)).toBe(true);
    expect(isLow(p(3), s)).toBe(false);
    expect(isLow(p(8, 'quantity'), s)).toBe(true);
    expect(isLow(p(null), s)).toBe(false);
    expect(isLow(p(0), s)).toBe(false);
  });
  it('suggests the reorder quantity, or enough to reach the minimum', () => {
    expect(suggestQty(p(5), 2)).toBe(3);
    expect(suggestQty(p(5, 'units', 10), 2)).toBe(10);
    expect(suggestQty(p(5, 'units', 1), 2)).toBe(3);
    expect(suggestQty(p(2.5, 'quantity'), 1)).toBe(2);
  });
  it('lists the sample products that are running low, emptiest first, and leaves the rest out', () => {
    const s = setup();
    const rows = s.low();
    expect(rows.map((r) => r.product.code)).toEqual(['BAT-AA', 'ZIP-100']);
    expect(rows[0]).toMatchObject({ on_hand: 1, min: 4, suggest: 6 });
    expect(rows[1]).toMatchObject({ on_hand: 2, min: 4, suggest: 2 });
    // Packing tape has a minimum of 2 and 4 on hand.
    expect(stockOf(s.product('TAPE-48'), stockByKey(s.here()))).toMatchObject({ units: 4 });
  });
  it('leaves pallets on hold out of the count', () => {
    const s = setup();
    ok(s.run(MANAGER, 'apply_hold', { reason: 'Checking' }, s.pallet('P-000201')));
    const by = stockByKey(s.here());
    expect(stockOf(s.product('GLV-12'), by)).toMatchObject({ units: 2, held: 1 });
  });
  it('finds the product in the other warehouse for a transfer', () => {
    const s = setup();
    expect(s.engine.stockElsewhere(MANAGER, s.ws, 'ZIP-100')).toEqual([{ workspace_id: s.overflow, name: 'Overflow yard', units: 2, qty: 40 }]);
    expect(s.engine.stockElsewhere(MANAGER, s.ws, 'BAT-AA')).toEqual([]);
  });
});

describe('save_product minimums', () => {
  it('saves a minimum and reorder quantity, keeps them when left out, and clears them with null', () => {
    const s = setup();
    ok(s.run(MANAGER, 'save_product', { code: 'GLV-12', description: 'Work gloves, box of 12', min_qty: 5, reorder_qty: 12 }));
    expect(s.product('GLV-12')).toMatchObject({ min_qty: 5, reorder_qty: 12, count_by: 'units' });
    ok(s.run(MANAGER, 'save_product', { code: 'GLV-12', description: 'Work gloves, 12 pairs' }));
    expect(s.product('GLV-12')).toMatchObject({ description: 'Work gloves, 12 pairs', min_qty: 5, reorder_qty: 12 });
    ok(s.run(MANAGER, 'save_product', { code: 'GLV-12', description: 'Work gloves, 12 pairs', min_qty: null, reorder_qty: null }));
    expect(s.product('GLV-12')).toMatchObject({ min_qty: null, reorder_qty: null });
  });
  it('counts whole pallets, and allows decimals when counting the quantity', () => {
    const s = setup();
    const bad = s.run(MANAGER, 'save_product', { code: 'GLV-12', description: 'Gloves', min_qty: 2.5 });
    expect(bad).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
    ok(s.run(MANAGER, 'save_product', { code: 'GLV-12', description: 'Gloves', min_qty: 2.5, count_by: 'quantity' }));
    expect(s.product('GLV-12')).toMatchObject({ min_qty: 2.5, count_by: 'quantity' });
    expect(validateEnvelope({ schema_version: 1, command_id: uuid(), workspace_id: s.ws, kind: 'save_product', payload: { code: 'X', description: 'Y', min_qty: -1 } }).ok).toBe(false);
  });
  it('keeps the minimum when a delivery is received with "Save as a product"', () => {
    const s = setup();
    ok(s.run(OPERATOR, 'receive', { description: 'AA batteries', receiving: { product_code: 'BAT-AA', quantity: '6', unit: 'cases' }, remember_product: true }));
    expect(s.product('BAT-AA')).toMatchObject({ min_qty: 4, reorder_qty: 6 });
  });
});

describe('reorder notes', () => {
  it('a manager notes a reorder; receiving the product clears it', () => {
    const s = setup();
    const id = s.product('BAT-AA').id;
    expect(s.run(OPERATOR, 'note_reorder', { product_id: id, note: 'PO 1' })).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    ok(s.run(MANAGER, 'note_reorder', { product_id: id, note: 'PO 4471, due Friday' }));
    expect(s.product('BAT-AA').reorder_note).toMatchObject({ note: 'PO 4471, due Friday', by_name: expect.any(String) });
    ok(s.run(OPERATOR, 'receive', { description: 'AA batteries', receiving: { product_code: 'BAT-AA', quantity: '6', unit: 'cases' } }));
    expect(s.product('BAT-AA').reorder_note).toBeNull();
    expect(s.run(MANAGER, 'note_reorder', { product_id: id, clear: true })).toMatchObject({ ok: false, code: 'INVALID_STATE' });
  });
  it('can be cleared by hand, and refuses a product from another warehouse', () => {
    const s = setup();
    const id = s.product('ZIP-100').id;
    ok(s.run(MANAGER, 'note_reorder', { product_id: id }));
    ok(s.run(MANAGER, 'note_reorder', { product_id: id, clear: true }));
    expect(s.product('ZIP-100').reorder_note).toBeNull();
    expect(s.run(MANAGER, 'note_reorder', { product_id: productKey(s.overflow, 'ZIP-100') })).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  });
});

describe('adjust_qty', () => {
  it('records the reason, changes the quantity and keeps the unit words', () => {
    const s = setup();
    const p = unitOf(s, 'BAT-AA');
    expect(p.receiving?.quantity).toBe('7');
    const r = ok(s.run(OPERATOR, 'adjust_qty', { reason: 'used', amount: 2, note: 'Shop' }, p));
    expect(r.ok && r.current_state?.receiving?.quantity).toBe('5');
    const ev = s.engine.history(OPERATOR, s.ws, p.id)[0]!;
    expect(ev).toMatchObject({ type: 'adjust_qty', reason: 'Shop', detail: { adjust_reason: 'used', amount: 2, from_qty: 7, to_qty: 5, unit: 'cases', retired: false } });
  });
  it('retires a pallet when nothing is left', () => {
    const s = setup();
    const p = unitOf(s, 'BAT-AA');
    ok(s.run(OPERATOR, 'adjust_qty', { reason: 'damaged', amount: 7 }, p));
    expect(s.db.pallets[p.id]).toMatchObject({ state: 'RETIRED', current_location_id: null });
    expect(s.low()[0]).toMatchObject({ product: { code: 'BAT-AA' }, on_hand: 0 });
  });
  it('refuses more than recorded, a pallet that is not here, a viewer and an old version', () => {
    const s = setup();
    const p = unitOf(s, 'BAT-AA');
    expect(s.run(OPERATOR, 'adjust_qty', { reason: 'used', amount: 8 }, p)).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
    expect(s.run(VIEWER, 'adjust_qty', { reason: 'used', amount: 1 }, p)).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    const old = { ...p };
    ok(s.run(OPERATOR, 'adjust_qty', { reason: 'found', amount: 1 }, p));
    expect(s.engine.execute(OPERATOR, { schema_version: 1, command_id: uuid(), workspace_id: s.ws, kind: 'adjust_qty', payload: { reason: 'used', amount: 1 }, pallet_id: old.id, expected_version: old.version })).toMatchObject({ ok: false, code: 'VERSION_CONFLICT' });
    const gone = s.pallet('P-000006');
    expect(gone.state).toBe('DISPATCHED');
    expect(s.run(OPERATOR, 'adjust_qty', { reason: 'counted', amount: 3 }, gone)).toMatchObject({ ok: false, code: 'INVALID_STATE' });
  });
  it('records a first count on a pallet with no quantity', () => {
    const s = setup();
    const p = s.pallet('P-000001');
    expect(s.run(OPERATOR, 'adjust_qty', { reason: 'used', amount: 1 }, p)).toMatchObject({ ok: false });
    ok(s.run(OPERATOR, 'adjust_qty', { reason: 'counted', amount: 12 }, p));
    expect(s.db.pallets[p.id].receiving?.quantity).toBe('12');
  });
  it('validates the reason and amount', () => {
    const s = setup();
    const base = { schema_version: 1, command_id: uuid(), workspace_id: s.ws, kind: 'adjust_qty', pallet_id: 'x', expected_version: 1 };
    expect(validateEnvelope({ ...base, payload: { reason: 'stolen', amount: 1 } }).ok).toBe(false);
    expect(validateEnvelope({ ...base, payload: { reason: 'used', amount: -2 } }).ok).toBe(false);
    expect(validateEnvelope({ ...base, payload: { reason: 'used', amount: 1.2345 } }).ok).toBe(false);
    expect(validateEnvelope({ ...base, payload: { reason: 'used', amount: 1.25 } }).ok).toBe(true);
  });
});

describe('approving quantity changes', () => {
  it('only a manager turns approval on, and only once', () => {
    const s = setup();
    expect(s.run(OPERATOR, 'set_adjust_approval', { on: true })).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    ok(s.run(MANAGER, 'set_adjust_approval', { on: true }));
    expect(s.run(OWNER, 'set_adjust_approval', { on: true })).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
    expect(Object.values(s.db.warehouses).find((w) => w.workspace_id === s.ws && w.active)!.adjust_approval).toBe(true);
  });
  it("holds an operator's change until a manager approves it", () => {
    const s = setup();
    ok(s.run(MANAGER, 'set_adjust_approval', { on: true }));
    const p = unitOf(s, 'BAT-AA');
    ok(s.run(OPERATOR, 'adjust_qty', { reason: 'used', amount: 2, note: 'Two for the van' }, p));
    const waiting = s.db.pallets[p.id];
    expect(waiting.receiving?.quantity).toBe('7');
    expect(waiting.pending_adjust).toMatchObject({ reason: 'used', amount: 2, from_qty: 7, to_qty: 5, note: 'Two for the van', by: OPERATOR });
    expect(s.engine.history(OPERATOR, s.ws, p.id)[0]!.detail).toMatchObject({ pending: true });
    expect(s.engine.reconciliation(MANAGER, s.ws).approvals.map((r) => r.pallet.id)).toEqual([p.id]);
    // One change at a time.
    expect(s.run(OPERATOR, 'adjust_qty', { reason: 'used', amount: 1 }, waiting)).toMatchObject({ ok: false, code: 'INVALID_STATE' });
    expect(s.run(OPERATOR, 'review_adjust', { approve: true }, waiting)).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    ok(s.run(MANAGER, 'review_adjust', { approve: true }, waiting));
    expect(s.db.pallets[p.id]).toMatchObject({ pending_adjust: null, receiving: { quantity: '5' } });
    expect(s.engine.history(MANAGER, s.ws, p.id)[0]).toMatchObject({ type: 'review_adjust', detail: { approved: true, to_qty: 5 } });
  });
  it('a turned-down change leaves the quantity alone; managers save at once', () => {
    const s = setup();
    ok(s.run(MANAGER, 'set_adjust_approval', { on: true }));
    const p = unitOf(s, 'BAT-AA');
    ok(s.run(OPERATOR, 'adjust_qty', { reason: 'write_off', amount: 7 }, p));
    ok(s.run(MANAGER, 'review_adjust', { approve: false, note: 'They are on the shelf' }, s.db.pallets[p.id]));
    expect(s.db.pallets[p.id]).toMatchObject({ state: 'STORED', pending_adjust: null, receiving: { quantity: '7' } });
    expect(s.run(MANAGER, 'review_adjust', { approve: true }, s.db.pallets[p.id])).toMatchObject({ ok: false, code: 'INVALID_STATE' });
    ok(s.run(MANAGER, 'adjust_qty', { reason: 'found', amount: 1 }, s.db.pallets[p.id]));
    expect(s.db.pallets[p.id].receiving?.quantity).toBe('8');
  });
  it('works an approved change out again from the quantity recorded now', () => {
    const s = setup();
    ok(s.run(MANAGER, 'set_adjust_approval', { on: true }));
    const p = unitOf(s, 'BAT-AA');
    ok(s.run(OPERATOR, 'adjust_qty', { reason: 'used', amount: 6 }, p));
    ok(s.run(MANAGER, 'edit_details', { description: p.description, notes: '', supplier_ref: '', receiving: { ...p.receiving, quantity: '4' } }, s.db.pallets[p.id]));
    const r = s.run(MANAGER, 'review_adjust', { approve: true }, s.db.pallets[p.id]);
    expect(r).toMatchObject({ ok: false, code: 'INVALID_STATE' });
  });
});

describe('dispatch numbers', () => {
  it('formats, reads and refuses dispatch numbers', () => {
    expect(formatDispatchRef(12)).toBe('D-000012');
    expect(parseDispatchRef('d12')).toBe('D-000012');
    expect(parseDispatchRef('D 000012')).toBe('D-000012');
    expect(parseDispatchRef('D-0')).toBeNull();
    expect(parseDispatchRef('P-000012')).toBeNull();
  });
  it('gives each send a number, lets pallets join it, and lists them for the slip', () => {
    const s = setup();
    // The sample already dispatched one pallet: D-000001.
    expect(s.pallet('P-000006').dispatch).toMatchObject({ ref: 'D-000001', destination: 'Example job 2' });
    const a = s.pallet('P-000201'),
      b = s.pallet('P-000202');
    const r1 = ok(s.run(OPERATOR, 'dispatch', { destination: 'Riverside site', note: 'Truck 4' }, a));
    expect(r1.ok && r1.current_state?.dispatch).toMatchObject({ ref: 'D-000002', destination: 'Riverside site', note: 'Truck 4', by_name: expect.any(String) });
    ok(s.run(OPERATOR, 'dispatch', { destination: 'Riverside site', join_ref: 'D-000002' }, b));
    expect(s.engine.dispatchUnits(OPERATOR, s.ws, 'D-000002').map((p) => p.code)).toEqual(['P-000201', 'P-000202']);
    expect(s.engine.history(OPERATOR, s.ws, b.id)[0]!.detail).toMatchObject({ dispatch_ref: 'D-000002' });
    // A number this warehouse has not given out yet cannot be joined.
    expect(s.run(OPERATOR, 'dispatch', { destination: 'X', join_ref: 'D-000009' }, s.pallet('P-000203'))).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
    // The next send gets the next number, and a return keeps the slip it left on.
    const r3 = ok(s.run(OPERATOR, 'dispatch', { destination: 'Depot' }, s.pallet('P-000203')));
    expect(r3.ok && r3.current_state?.dispatch?.ref).toBe('D-000003');
    ok(s.run(OPERATOR, 'return', {}, s.db.pallets[a.id]));
    expect(s.db.pallets[a.id].dispatch?.ref).toBe('D-000002');
  });
});

describe('reports', () => {
  it('on hand by product: products with stock or a minimum, then unlabeled pallets by description', () => {
    const s = setup();
    const rows = productReport(s.here(), Object.values(s.db.products).filter((p) => p.workspace_id === s.ws));
    expect(rows.slice(0, 2).map((r) => [r.code, r.status])).toEqual([
      ['BAT-AA', 'low'],
      ['ZIP-100', 'low'],
    ]);
    expect(rows.find((r) => r.code === 'TAPE-48')).toMatchObject({ units: 4, status: 'ok', qty: 4 });
    expect(rows.find((r) => r.code === 'BAT-AA')).toMatchObject({ units: 1, qty: 7, unit: 'cases' });
    // Example pallet 5 is on hold.
    expect(rows.find((r) => r.name === 'Example pallet 5')).toMatchObject({ linked: false, units: 0, held: 1 });
    expect(rows.find((r) => r.name === 'Example pallet 6')).toBeUndefined();
  });
  it('by warehouse, by zone and aging', () => {
    const s = setup();
    const wh = s.engine.warehouseRows(MANAGER, s.ws);
    expect(wh.map((w) => [w.name, w.current])).toEqual([
      ['Main yard', true],
      ['Overflow yard', false],
    ]);
    expect(wh[1].counts.STORED).toBe(5);
    expect(stateCounts(s.here(s.overflow)).counts.STORED).toBe(5);
    const zones = zoneReport(s.here(), Object.values(s.db.locations).filter((l) => l.workspace_id === s.ws));
    expect(zones.map((z) => z.zone)).toContain('Zone A');
    expect(zones.find((z) => z.zone === 'Waiting for a spot')).toMatchObject({ units: 1 });
    const now = Date.now();
    const { rows, bands } = agingReport(s.here(), s.db.locations, now + 45 * 86_400_000);
    expect(bands.reduce((n, b) => n + b.units, 0)).toBe(rows.length);
    expect(bands[1].units).toBe(rows.length);
  });
  it('transfers and the counts and adjustments history', () => {
    const s = setup();
    ok(s.run(OPERATOR, 'transfer_now', { to_workspace_id: s.overflow, lines: [{ pallet_id: s.pallet('P-000001').id, expected_version: s.pallet('P-000001').version }] }));
    const tr = transferReport(Object.values(s.db.transfers), s.ws);
    expect(tr).toHaveLength(1);
    expect(tr[0]).toMatchObject({ direction: 'out', units: 1 });
    const events = Object.values(s.db.events).flat();
    const adj = adjustmentReport(events, s.db.pallets, s.db.users, s.ws);
    expect(adj.map((r) => r.kind)).toContain('Used');
    expect(adj.find((r) => r.kind === 'Used')).toMatchObject({ detail: 'Used 3: 10 → 7 cases', code: 'P-000301' });
    expect(reportFile('aging', '2026-10-01T10:00:00Z')).toBe('wherehouse-stock-aging-2026-10-01.csv');
  });
});
