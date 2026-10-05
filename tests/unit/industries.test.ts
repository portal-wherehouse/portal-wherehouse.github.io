// The sample warehouse for every kind of business: each seed is valid, and each one fills every feature the sample
// shows (records with a story, orders to pick, running low, lots and expiry, counts, moves, incoming, transfers).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Engine } from '../../src/demo/engine';
import { DEFAULT_INDUSTRY, INDUSTRIES, industry, industryFromSearch, isIndustry, sampleSpots } from '../../src/demo/industries';
import { seedSample } from '../../src/demo/seed';
import { productKey, warehouseDate } from '../../src/domain/receiving';
import { addDays } from '../../src/domain/work';
import { lowStock, stockByKey } from '../../src/domain/stock';
import { normalizeCode, rackFields } from '../../src/domain/codes';
import { GROUPS } from '../../src/site/for/groups';

const OWNER = 'user-owner',
  MANAGER = 'user-supervisor',
  VIEWER = 'user-viewer';

describe('sample businesses', () => {
  it('has one sample for each "Wherehouse for" group, in the same order', () => {
    expect(INDUSTRIES.map((i) => i.id)).toEqual(GROUPS.map((g) => g.id));
    expect(DEFAULT_INDUSTRY).toBe('warehouses');
    expect(industry('nope').id).toBe('warehouses');
    expect(isIndustry('lumberyards')).toBe(true);
    expect(isIndustry('lumber')).toBe(false);
    expect(industryFromSearch('?demo=1&kind=rentals')).toBe('rentals');
    expect(industryFromSearch('?demo=1&kind=bogus')).toBeNull();
    expect(industryFromSearch('?demo=1')).toBeNull();
  });

  it('keeps visible copy plain: no em dashes, and no repeats inside a sample', () => {
    for (const s of INDUSTRIES) {
      const text = JSON.stringify({ ...s, setup: Object.values(s.setup) });
      expect(text, s.id).not.toMatch(/—/);
      expect(text.toLowerCase(), s.id).not.toMatch(/\bthings\b/);
      const codes = [...s.products.map((p) => p.code), ...s.low.map((p) => p.code), s.lot.code];
      expect(new Set(codes.map(normalizeCode)).size, s.id).toBe(codes.length);
      const spots = [...Object.values(sampleSpots(s)), s.receiving, s.quarantine, ...s.staging];
      expect(new Set(spots).size, s.id).toBe(spots.length);
      for (const code of Object.values(sampleSpots(s))) expect(rackFields(code).zone, code).not.toBeNull();
      expect(new Set(s.boxes).size, s.id).toBe(4);
      expect(new Set(s.orders.map((o) => o.ref)).size, s.id).toBe(4);
    }
  });
});

describe.each(INDUSTRIES.map((s) => [s.id, s] as const))('the %s sample', (_id, s) => {
  const db = seedSample(s.id);
  const engine = new Engine(db);
  const spaces = Object.values(db.workspaces);
  const main = spaces.find((w) => w.name === s.workspace)!;
  const overflow = spaces.find((w) => w.name === s.overflow)!;
  const mine = (ws: string) => Object.values(db.pallets).filter((p) => p.workspace_id === ws);
  const at = sampleSpots(s);

  it('has two warehouses with its own names, words and people', () => {
    expect(spaces).toHaveLength(2);
    expect(main).toBeDefined();
    expect(overflow).toBeDefined();
    const wh = Object.values(db.warehouses).find((w) => w.workspace_id === main.id)!;
    expect(wh.name).toBe(s.facility);
    expect(wh.setup).toMatchObject({ thing: s.setup.thing, job: s.setup.job, jobs_on: true });
    expect(db.users[MANAGER].name).toBe(s.people[1]);
    expect(Object.values(db.jobs).filter((j) => j.workspace_id === main.id).map((j) => j.code)).toEqual(s.jobs.map(([c]) => normalizeCode(c)));
  });

  it('tells the six records\' story: one moved, one waiting for a spot, one on hold, one dispatched', () => {
    const six = mine(main.id).filter((p) => /^P-00000[1-6]$/.test(p.code)).sort((a, b) => a.code.localeCompare(b.code));
    expect(six.map((p) => p.description)).toEqual(s.stock);
    expect(six[1].state).toBe('RECEIVED');
    expect(six[4].hold?.reason).toBe(s.hold);
    expect(six[5].state).toBe('DISPATCHED');
    expect(db.locations[six[0].current_location_id!].code).toBe(at.b11);
    // The next record received is P-000007, as the walkthrough and imports expect.
    expect(db.counters[main.id]).toBe(6);
  });

  it('has four orders to pick, each line in stock, with its boxes and staging spots', () => {
    const orders = Object.values(db.orders).filter((o) => o.workspace_id === main.id);
    expect(orders.map((o) => o.external_ref).sort()).toEqual(s.orders.map((o) => o.ref).sort());
    expect(orders.map((o) => o.customer.name).sort()).toEqual(s.orders.map((o) => o.customer).sort());
    expect(orders.filter((o) => o.method === 'ship').every((o) => o.customer.address)).toBe(true);
    const codes = new Set(mine(main.id).filter((p) => p.state === 'STORED').map((p) => normalizeCode(p.receiving?.product_code ?? '')));
    for (const o of orders) for (const l of o.lines) expect(codes.has(normalizeCode(l.product_code)), l.product_code).toBe(true);
    expect(Object.values(db.warehouses).find((w) => w.workspace_id === main.id)!.orders).toMatchObject({ on: true, box_types: s.boxes });
    expect(Object.values(db.locations).filter((l) => l.workspace_id === main.id && l.kind === 'STAGING').map((l) => l.code).sort()).toEqual([...s.staging].sort());
  });

  it('runs low on two products, with more in the second warehouse for one of them', () => {
    const products = Object.values(db.products).filter((p) => p.workspace_id === main.id);
    const low = lowStock(products, stockByKey(mine(main.id)));
    expect(low.map((r) => r.product.code).sort()).toEqual(s.low.map((p) => normalizeCode(p.code)).sort());
    expect(engine.stockElsewhere(OWNER, main.id, s.low[1].code)).toEqual([{ workspace_id: overflow.id, name: s.overflow, units: 2, qty: 40 }]);
    expect(db.products[productKey(main.id, s.products[1].code)]).toMatchObject({ min_qty: 2 });
  });

  it('tracks lots with expiry dates, one of them expired', () => {
    const lots = mine(main.id).filter((p) => p.receiving?.lot);
    expect(lots).toHaveLength(4);
    expect(lots.every((p) => p.description === s.lot.description)).toBe(true);
    const today = new Date().toISOString().slice(0, 10);
    expect(lots.filter((p) => p.receiving!.expires_on! < today)).toHaveLength(1);
  });

  it('has a count to do, a count to review, three moves to do and a quarantine spot', () => {
    const counts = Object.values(db.counts).filter((c) => c.workspace_id === main.id);
    expect(counts.find((c) => c.name === `Zone ${s.zones[1]}`)).toMatchObject({ status: 'OPEN', repeat: 'weekly' });
    expect(counts.find((c) => c.name === at.a12)?.status).toBe('REVIEW');
    expect(Object.values(db.tasks).filter((t) => t.workspace_id === main.id && t.status === 'OPEN')).toHaveLength(3);
    expect(Object.values(db.locations).some((l) => l.workspace_id === main.id && l.kind === 'QUARANTINE' && l.code === s.quarantine)).toBe(true);
  });

  it('has an incoming delivery list that is not stock yet', () => {
    const incoming = Object.values(db.shipments).filter((r) => r.workspace_id === main.id);
    expect(incoming.map((r) => r.description)).toEqual(s.incoming.rows.map((r) => r.description));
    expect(incoming.every((r) => !r.pallet_id)).toBe(true);
    expect(Object.values(db.imports).find((i) => i.workspace_id === main.id)?.name).toBe(s.incoming.name);
  });

  it('limits the viewer to the main warehouse, and finds 26 records there', () => {
    expect(db.memberships.filter((m) => m.user_id === VIEWER && m.active).map((m) => m.workspace_id)).toEqual([main.id]);
    expect(db.memberships.find((m) => m.user_id === VIEWER && m.workspace_id === overflow.id)).toMatchObject({ active: false, limited: true });
    expect(mine(main.id).filter((p) => p.state !== 'DISPATCHED' && p.state !== 'RETIRED')).toHaveLength(25);
    expect(mine(overflow.id)).toHaveLength(5);
  });
});

describe('sample dates follow the warehouse time zone', () => {
  afterEach(() => vi.useRealTimers());

  for (const now of ['2026-10-02T00:30:00Z', '2026-10-02T05:10:00Z', '2026-10-01T23:50:00Z', '2026-10-01T12:00:00Z'])
    it(`a count due today is due today in Chicago at ${now}`, () => {
      vi.useFakeTimers({ now: new Date(now), toFake: ['Date'] });
      for (const s of INDUSTRIES) {
        const db = seedSample(s.id);
        const main = Object.values(db.workspaces).find((w) => w.name === s.workspace)!;
        const wh = Object.values(db.warehouses).find((w) => w.workspace_id === main.id)!;
        const today = warehouseDate(wh.timezone, new Date());
        const counts = Object.values(db.counts).filter((c) => c.workspace_id === main.id);
        expect(counts.map((c) => c.due_on), s.id).toEqual([today, today]);
        const expiry = Object.values(db.pallets)
          .filter((p) => p.workspace_id === main.id && p.receiving?.lot)
          .map((p) => [p.receiving!.lot, p.receiving!.expires_on]);
        expect(Object.fromEntries(expiry), s.id).toEqual({ 'L-2405': addDays(today, -5), 'L-2409': addDays(today, 9), 'L-2410': addDays(today, 24), 'L-2502': addDays(today, 140) });
      }
    });
});
