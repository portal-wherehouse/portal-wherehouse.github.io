// Stock reports: on hand by product, by warehouse and by zone, aging, transfers, and counts and adjustments.
// Pure: each takes the records and returns rows for the screen and the CSV download, so both always agree.

import { STATE_LABEL } from './display';
import { barcodeMatchKey, type ProductMemory } from './receiving';
import { ADJUST_LABEL, adjustLine, fmtQty, hasMinimum, isHere, isLow, measure, parseQty, productKeyOf, type Stock } from './stock';
import { TRANSFER_STATUS_LABEL } from './transfers';
import type { AdjustReason, Location, Pallet, PalletEvent, PalletState, Transfer, User } from './types';

export const REPORTS = ['product', 'warehouse', 'zone', 'aging', 'transfers', 'adjustments'] as const;
export type ReportId = (typeof REPORTS)[number];

export const REPORT_TITLE: Record<ReportId, string> = {
  product: 'On hand by product',
  warehouse: 'By warehouse',
  zone: 'By zone',
  aging: 'Aging',
  transfers: 'Transfers',
  adjustments: 'Counts and adjustments',
};

export const REPORT_WHAT: Record<ReportId, string> = {
  product: 'How many of each product are here, with minimums. Pallets without a product code are grouped by description.',
  warehouse: 'Pallets in each of your warehouses, by status.',
  zone: 'Pallets here by zone, and the areas outside the racks.',
  aging: 'How long each pallet here has been in the warehouse, oldest first.',
  transfers: 'Transfers to and from this warehouse.',
  adjustments: 'Counts, quantity changes, write-offs and pallets marked missing or found.',
};

/** CSV file name for a report, with the date it was made. */
export function reportFile(id: ReportId, at: string): string {
  const name = { product: 'stock-by-product', warehouse: 'stock-by-warehouse', zone: 'stock-by-zone', aging: 'stock-aging', transfers: 'transfers', adjustments: 'counts-and-adjustments' }[id];
  return `wherehouse-${name}-${at.slice(0, 10)}.csv`;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const day = 86_400_000;

// ------------------------------------------------------------------ on hand by product

export interface ProductRow {
  key: string;
  /** Empty when the pallets have no product code. */
  code: string;
  name: string;
  unit: string;
  /** Here and not on hold. */
  units: number;
  held: number;
  /** Quantity on the pallets here and not on hold, when any has a number. */
  qty: number | null;
  min: number | null;
  count_by: 'units' | 'quantity';
  status: 'low' | 'ok' | 'none';
  linked: boolean;
}

/** Every product with stock or a minimum, then pallets without a product code grouped by description. */
export function productReport(pallets: Iterable<Pallet>, products: Iterable<ProductMemory>): ProductRow[] {
  const byKey = new Map<string, ProductRow>();
  for (const p of products) {
    const key = 'p:' + barcodeMatchKey(p.code);
    byKey.set(key, { key, code: p.code, name: p.description, unit: p.unit ?? '', units: 0, held: 0, qty: null, min: hasMinimum(p) ? p.min_qty! : null, count_by: p.count_by ?? 'units', status: 'none', linked: true });
  }
  const loose = new Map<string, ProductRow>();
  for (const p of pallets) {
    if (!isHere(p)) continue;
    const pk = productKeyOf(p);
    let row: ProductRow | undefined;
    if (pk) {
      const key = 'p:' + pk;
      row = byKey.get(key);
      if (!row) {
        row = { key, code: p.receiving!.product_code.trim(), name: p.description, unit: p.receiving?.unit ?? '', units: 0, held: 0, qty: null, min: null, count_by: 'units', status: 'none', linked: true };
        byKey.set(key, row);
      }
    } else {
      const key = 'd:' + p.description.trim().toLowerCase();
      row = loose.get(key);
      if (!row) {
        row = { key, code: '', name: p.description.trim(), unit: p.receiving?.unit ?? '', units: 0, held: 0, qty: null, min: null, count_by: 'units', status: 'none', linked: false };
        loose.set(key, row);
      }
    }
    if (p.hold) {
      row.held++;
      continue;
    }
    row.units++;
    const q = parseQty(p.receiving?.quantity);
    if (q !== null) row.qty = (row.qty ?? 0) + q;
    if (!row.unit && p.receiving?.unit) row.unit = p.receiving.unit;
  }
  const linked = [...byKey.values()].filter((r) => r.units || r.held || r.min !== null);
  for (const r of linked) {
    if (r.min === null) continue;
    const s: Stock = { units: r.units, qty: r.qty ?? 0, held: r.held };
    r.status = isLow({ min_qty: r.min, count_by: r.count_by }, s) ? 'low' : 'ok';
  }
  const byName = (a: ProductRow, b: ProductRow) => a.name.localeCompare(b.name) || a.code.localeCompare(b.code);
  return [...linked.sort((a, b) => (a.status === 'low' ? 0 : 1) - (b.status === 'low' ? 0 : 1) || byName(a, b)), ...[...loose.values()].sort(byName)];
}

export function productCsv(rows: ProductRow[]): Record<string, unknown>[] {
  return rows.map((r) => ({
    product_code: r.code,
    product: r.name,
    on_hand: r.units,
    on_hold: r.held,
    quantity: r.qty === null ? '' : fmtQty(r.qty),
    unit: r.unit,
    minimum: r.min ?? '',
    minimum_counts: r.min === null ? '' : r.count_by === 'quantity' ? 'quantity' : 'pallets',
    status: r.status === 'low' ? 'running low' : r.status === 'ok' ? 'ok' : '',
  }));
}

/** The number a product row compares with its minimum. */
export function rowMeasure(r: ProductRow): number {
  return measure({ count_by: r.count_by }, { units: r.units, qty: r.qty ?? 0, held: r.held });
}

// ------------------------------------------------------------------ by warehouse

export interface WarehouseRow {
  workspace_id: string;
  name: string;
  current: boolean;
  counts: Partial<Record<PalletState, number>>;
  holds: number | null;
}

/** Status counts for one warehouse's pallets (archived ones left out), as the Dashboard counts them. */
export function stateCounts(pallets: Iterable<Pallet>): { counts: Record<PalletState, number>; holds: number } {
  const counts = { RECEIVED: 0, STORED: 0, IN_TRANSIT: 0, PICKED: 0, DISPATCHED: 0, MISSING: 0, RETIRED: 0 } as Record<PalletState, number>;
  let holds = 0;
  for (const p of pallets) {
    if (p.archived_at) continue;
    counts[p.state]++;
    if (p.hold && p.state !== 'RETIRED') holds++;
  }
  return { counts, holds };
}

export function warehouseCsv(rows: WarehouseRow[]): Record<string, unknown>[] {
  return rows.map((r) => ({
    warehouse: r.name,
    on_hand: (r.counts.STORED ?? 0) + (r.counts.RECEIVED ?? 0),
    stored: r.counts.STORED ?? 0,
    waiting_for_a_spot: r.counts.RECEIVED ?? 0,
    on_hold: r.holds ?? '',
    in_transit: r.counts.IN_TRANSIT ?? 0,
    picked_for_orders: r.counts.PICKED ?? 0,
    missing: r.counts.MISSING ?? 0,
    dispatched: r.counts.DISPATCHED ?? 0,
  }));
}

// ------------------------------------------------------------------ by zone

export interface ZoneRow {
  key: string;
  zone: string;
  units: number;
  held: number;
  spots_used: number;
  spots: number;
}

/** Racks group by the zone in their code (A-02-01 is zone A); other areas by kind; unplaced pallets on their own row. */
export function zoneReport(pallets: Iterable<Pallet>, locations: Iterable<Location>): ZoneRow[] {
  const locs = new Map<string, Location>();
  for (const l of locations) locs.set(l.id, l);
  const zoneOf = (l: Location) => (l.zone && l.aisle ? `Zone ${l.zone}` : AREA_NAME[l.kind] ?? 'Other areas');
  const rows = new Map<string, ZoneRow & { used: Set<string> }>();
  const row = (zone: string) => {
    let r = rows.get(zone);
    if (!r) rows.set(zone, (r = { key: zone, zone, units: 0, held: 0, spots_used: 0, spots: 0, used: new Set() }));
    return r;
  };
  for (const l of locs.values()) if (l.active) row(zoneOf(l)).spots++;
  for (const p of pallets) {
    if (!isHere(p)) continue;
    const l = p.current_location_id ? locs.get(p.current_location_id) : undefined;
    const r = row(l ? zoneOf(l) : p.state === 'RECEIVED' ? WAITING : 'Spot not loaded');
    if (p.hold) r.held++;
    else r.units++;
    if (l) r.used.add(l.id);
  }
  const order = (z: string) => (z.startsWith('Zone ') ? 0 : z === WAITING ? 2 : 1);
  return [...rows.values()]
    .map(({ used, ...r }) => ({ ...r, spots_used: used.size }))
    .filter((r) => r.units || r.held || r.spots)
    .sort((a, b) => order(a.zone) - order(b.zone) || a.zone.localeCompare(b.zone, undefined, { numeric: true }));
}

const WAITING = 'Waiting for a spot';
const AREA_NAME: Partial<Record<Location['kind'], string>> = { RECEIVING: 'Receiving', STAGING: 'Staging', QUARANTINE: 'Quarantine', FLOOR: 'Floor areas', RACK: 'Other racks' };

export function zoneCsv(rows: ZoneRow[]): Record<string, unknown>[] {
  return rows.map((r) => ({ zone: r.zone, on_hand: r.units, on_hold: r.held, spots_with_stock: r.spots_used, active_spots: r.spots }));
}

// ------------------------------------------------------------------ aging

export const AGE_BANDS = [
  { label: '0 to 30 days', max: 30 },
  { label: '31 to 60 days', max: 60 },
  { label: '61 to 90 days', max: 90 },
  { label: 'Over 90 days', max: Infinity },
] as const;

export interface AgingRow {
  pallet: Pallet;
  days: number;
  band: number;
  spot: string;
}

/** Whole days since it was received here (or at the warehouse it came from on a transfer). */
export function daysHere(p: Pallet, now: number): number {
  return Math.max(0, Math.floor((now - new Date(p.received_at).getTime()) / day));
}

export function agingReport(pallets: Iterable<Pallet>, locations: Record<string, Location>, now: number): { rows: AgingRow[]; bands: { label: string; units: number }[] } {
  const rows: AgingRow[] = [];
  for (const p of pallets) {
    if (!isHere(p)) continue;
    const days = daysHere(p, now);
    rows.push({ pallet: p, days, band: AGE_BANDS.findIndex((b) => days <= b.max), spot: p.current_location_id ? (locations[p.current_location_id]?.code ?? '') : '' });
  }
  rows.sort((a, b) => b.days - a.days || a.pallet.code.localeCompare(b.pallet.code));
  return { rows, bands: AGE_BANDS.map((b, i) => ({ label: b.label, units: rows.filter((r) => r.band === i).length })) };
}

export function agingCsv(rows: AgingRow[]): Record<string, unknown>[] {
  return rows.map((r) => ({
    pallet_code: r.pallet.code,
    description: r.pallet.description,
    product_code: r.pallet.receiving?.product_code ?? '',
    quantity: r.pallet.receiving?.quantity ?? '',
    unit: r.pallet.receiving?.unit ?? '',
    status: STATE_LABEL[r.pallet.state],
    spot: r.spot,
    on_hold: r.pallet.hold ? 'yes' : 'no',
    received_at: r.pallet.received_at,
    days_on_hand: r.days,
    age: AGE_BANDS[r.band]?.label ?? '',
  }));
}

// ------------------------------------------------------------------ transfers

export interface TransferRow {
  t: Transfer;
  direction: 'out' | 'in';
  units: number;
  received: number;
}

export function transferReport(transfers: Iterable<Transfer>, workspaceId: string): TransferRow[] {
  return [...transfers]
    .filter((t) => t.from_workspace_id === workspaceId || t.to_workspace_id === workspaceId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.number.localeCompare(a.number))
    .map((t) => ({ t, direction: t.from_workspace_id === workspaceId ? 'out' : 'in', units: t.lines.filter((l) => l.status !== 'RETURNED').length, received: t.lines.filter((l) => l.status === 'RECEIVED').length }));
}

export function transferCsv(rows: TransferRow[]): Record<string, unknown>[] {
  return rows.map(({ t, direction, units, received }) => ({
    transfer: t.number,
    direction: direction === 'out' ? 'sent' : 'received',
    from: t.from_name,
    to: t.to_name,
    status: TRANSFER_STATUS_LABEL[t.status],
    pallets: units,
    pallets_received: received,
    pallet_codes: t.lines.map((l) => l.code).join(' '),
    created_at: t.created_at,
    created_by: t.created_by_name,
    sent_at: t.sent_at ?? '',
    received_at: t.received_at ?? '',
    cancelled_at: t.cancelled_at ?? '',
    note: t.note ?? '',
  }));
}

// ------------------------------------------------------------------ counts and adjustments

/** History entries that count stock or change it outside normal moves. */
export const ADJUSTMENT_EVENTS = ['verify_location', 'adjust_qty', 'review_adjust', 'mark_missing', 'locate', 'retire', 'correct'] as const;

const ADJUSTMENT_KIND: Record<string, string> = {
  verify_location: 'Counted, still here',
  mark_missing: 'Marked missing',
  locate: 'Found',
  retire: 'Retired',
  correct: 'Correction',
};

export interface AdjustmentRow {
  e: PalletEvent;
  kind: string;
  detail: string;
  code: string;
  description: string;
  spot: string;
  person: string;
}

/** What one history entry changed, in words. */
export function adjustmentDetail(e: PalletEvent): { kind: string; detail: string } {
  const d = e.detail;
  if (e.type === 'adjust_qty' || e.type === 'review_adjust') {
    const reason = d.adjust_reason as AdjustReason | undefined;
    const line = reason ? adjustLine(reason, Number(d.amount ?? 0), d.from_qty === null || d.from_qty === undefined ? null : Number(d.from_qty), Number(d.to_qty ?? 0), d.unit ? String(d.unit) : null) : '';
    if (e.type === 'adjust_qty' && d.pending) return { kind: `${reason ? ADJUST_LABEL[reason] : 'Quantity'}, waiting for approval`, detail: line };
    if (e.type === 'review_adjust') return { kind: d.approved ? 'Quantity change approved' : 'Quantity change not approved', detail: line };
    return { kind: reason ? ADJUST_LABEL[reason] : 'Quantity changed', detail: line + (d.retired ? '. Used up, so it was retired.' : '') };
  }
  if (e.type === 'verify_location') return { kind: ADJUSTMENT_KIND.verify_location, detail: String(d.at_location ?? e.after_state.current_location_code ?? '') };
  if (e.type === 'locate') return { kind: ADJUSTMENT_KIND.locate, detail: d.to_location ? `On ${String(d.to_location)}` : '' };
  if (e.type === 'correct') return { kind: ADJUSTMENT_KIND.correct, detail: `${STATE_LABEL[e.before_state?.state ?? e.after_state.state]} → ${STATE_LABEL[e.after_state.state]}` };
  return { kind: ADJUSTMENT_KIND[e.type] ?? e.type, detail: e.before_state?.current_location_code ? `Was on ${e.before_state.current_location_code}` : '' };
}

export function adjustmentReport(events: Iterable<PalletEvent>, pallets: Record<string, Pallet>, users: Record<string, User>, workspaceId: string): AdjustmentRow[] {
  const types = new Set<string>(ADJUSTMENT_EVENTS);
  const rows: AdjustmentRow[] = [];
  for (const e of events) {
    if (e.workspace_id !== workspaceId || !types.has(e.type)) continue;
    const { kind, detail } = adjustmentDetail(e);
    rows.push({
      e,
      kind,
      detail,
      code: pallets[e.pallet_id]?.code ?? String(e.detail.pallet_code ?? ''),
      description: e.after_state.description,
      spot: e.after_state.current_location_code ?? e.before_state?.current_location_code ?? '',
      person: users[e.actor_id]?.name ?? String(e.detail.actor_name ?? ''),
    });
  }
  return rows.sort((a, b) => b.e.accepted_at.localeCompare(a.e.accepted_at) || b.e.revision - a.e.revision);
}

export function adjustmentCsv(rows: AdjustmentRow[]): Record<string, unknown>[] {
  return rows.map((r) => ({
    when: r.e.accepted_at,
    pallet_code: r.code,
    description: r.description,
    what: r.kind,
    detail: r.detail,
    reason: r.e.reason ?? '',
    spot: r.spot,
    person: r.person,
  }));
}

export const totalUnits = (rows: { units: number }[]) => sum(rows.map((r) => r.units));
