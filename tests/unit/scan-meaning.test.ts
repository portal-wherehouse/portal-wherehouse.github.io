// What a scan on the Dashboard (Scan anywhere) means: records, product barcodes, and codes not on record.
import { describe, expect, it } from 'vitest';
import { Engine } from '../../src/demo/engine';
import { seedFixture } from '../../src/demo/seed';
import { NOT_ON_RECORD, interpretScan } from '../../src/features/scanners/interpret';

const NOW = Date.UTC(2026, 8, 23, 17, 0, 0);
const ACTOR = 'user-owner';
/** A valid EAN-13 product barcode. */
const EAN = '4006381333931';

function setup() {
  const db = seedFixture('tiny', { now: NOW });
  const engine = new Engine(db);
  const ws = Object.values(db.workspaces).find((w) => w.name === 'Sample warehouse')!.id;
  return { db, engine, ws };
}

describe('interpretScan', () => {
  it('opens pallets and racks by their printed codes', () => {
    const { engine, ws } = setup();
    expect(interpretScan(engine, ACTOR, ws, 'P-000016').kind).toBe('pallet');
    expect(interpretScan(engine, ACTOR, ws, 'a-03-01').kind).toBe('location');
    expect(interpretScan(engine, ACTOR, ws, 'CMD:MODE_MOVE').kind).toBe('command');
  });

  it('finds the pallets received with a product barcode', () => {
    const { db, engine, ws } = setup();
    const pallet = Object.values(db.pallets).find((p) => p.workspace_id === ws && p.code === 'P-000016')!;
    pallet.supplier_ref = EAN;
    const m = interpretScan(engine, ACTOR, ws, EAN);
    expect(m).toMatchObject({ kind: 'product', reference: EAN, barcode: 'gtin', pallets: 1 });
  });

  it('says a code matching nothing is not on record', () => {
    const { engine, ws } = setup();
    expect(interpretScan(engine, ACTOR, ws, 'ZZ-NOPE-42')).toEqual({ kind: 'unknown', message: NOT_ON_RECORD });
    // A product barcode no pallet was received with, when every record is on this device.
    expect(interpretScan(engine, ACTOR, ws, EAN)).toEqual({ kind: 'unknown', message: NOT_ON_RECORD });
  });

  it('searches for a product barcode when this device holds only part of the records', () => {
    const { engine, ws } = setup();
    expect(interpretScan(engine, ACTOR, ws, EAN, { partial: true })).toMatchObject({ kind: 'product', pallets: null });
    // Free text is still not on record: only real product and pallet barcodes are worth a search.
    expect(interpretScan(engine, ACTOR, ws, 'ZZ-NOPE-42', { partial: true }).kind).toBe('unknown');
  });

  it('keeps the specific message for a label from another company', () => {
    const { engine, ws } = setup();
    const m = interpretScan(engine, ACTOR, ws, 'PL1:P:AAAAAAAAAAAAAAAA');
    expect(m.kind).toBe('unknown');
    if (m.kind === 'unknown') expect(m.message).toMatch(/not recognized in this company/);
  });
});
