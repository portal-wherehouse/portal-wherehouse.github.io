// Orders and picking: customer orders, pick batches (a cart of lettered totes), packages and handoff.
// Shapes and pure helpers shared by the engine (demo and the Firebase command function), the screens and the tests.
//
// One record is one sellable unit when it is picked: a picked unit leaves its spot (state PICKED), rides in a tote,
// is packed into a package (K-000045), waits on a staging spot, and is dispatched when the order is handed off.

import { barcodeMatchKey } from './receiving';
import type { Pallet } from './types';

export const ORDER_STATUSES = ['OPEN', 'PICKING', 'PICKED', 'PACKED', 'STAGED', 'DONE', 'CANCELLED'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  OPEN: 'Ready to pick',
  PICKING: 'Picking',
  PICKED: 'Ready to pack',
  PACKED: 'Packed',
  STAGED: 'Ready for handoff',
  DONE: 'Done',
  CANCELLED: 'Cancelled',
};

export type OrderMethod = 'ship' | 'pickup';
export const METHOD_LABEL: Record<OrderMethod, string> = { ship: 'Ship', pickup: 'Pickup' };

export interface OrderCustomer {
  name: string;
  phone: string;
  email: string;
  address: string;
}

export type SubStatus = 'pending' | 'approved' | 'rejected';

/** One unit picked for an order line: the record, where it came from, and its package once packed. */
export interface OrderUnit {
  pallet_id: string;
  code: string;
  description: string;
  product_code: string;
  batch_id: string | null;
  from_location_id: string | null;
  from_location_code: string | null;
  picked_by_name: string;
  picked_at: string;
  /** Set when this unit replaces the ordered product. Pending ones wait for a manager's decision. */
  sub: { status: SubStatus; decided_by_name: string | null; decided_at: string | null } | null;
  package_id: string | null;
}

export const SHORT_REASONS = ['not_at_spot', 'damaged', 'wrong_item', 'cant_reach', 'no_stock', 'not_picked'] as const;
export type ShortReason = (typeof SHORT_REASONS)[number];
export const SHORT_REASON_LABEL: Record<ShortReason, string> = {
  not_at_spot: 'Not at the spot',
  damaged: 'Damaged',
  wrong_item: 'Wrong item there',
  cant_reach: "Can't reach",
  no_stock: 'No stock recorded',
  not_picked: 'Not picked',
};

export interface OrderLine {
  line_no: number;
  product_code: string;
  description: string;
  qty: number;
  units: OrderUnit[];
  /** How many could not be picked, and why. Shorts never block packing. */
  short: { qty: number; reason: ShortReason; by_name: string; at: string } | null;
}

export interface OrderStep {
  at: string;
  actor_name: string;
  text: string;
}

export interface OrderHandoff {
  at: string;
  by_name: string;
  /** Who collected a pickup, or the carrier for a shipment. */
  collected_by: string | null;
  carrier: string | null;
  tracking: string | null;
  destination: string;
}

export interface Order {
  id: string;
  workspace_id: string;
  warehouse_id: string;
  /** O-000123, printed on the packing slip and package labels. */
  code: string;
  /** The web store's own order number, when there is one. */
  external_ref: string | null;
  customer: OrderCustomer;
  method: OrderMethod;
  due_at: string | null;
  allow_subs: boolean;
  notes: string | null;
  status: OrderStatus;
  lines: OrderLine[];
  batch_id: string | null;
  batch_code: string | null;
  slot: string | null;
  tote_code: string | null;
  package_ids: string[];
  handoff: OrderHandoff | null;
  created_by: string;
  created_by_name: string;
  created_at: string;
  updated_at: string;
  version: number;
  log: OrderStep[];
}

export interface PickSlot {
  letter: string;
  order_id: string;
  order_code: string;
  customer: string;
  tote_code: string | null;
}

export type StopStatus = 'open' | 'done' | 'short';

/** One place to stop on the walk: a spot, a product, how many, and the tote they go in. */
export interface PickStop {
  key: string;
  order_id: string;
  line_no: number;
  slot: string;
  location_id: string | null;
  location_code: string | null;
  product_code: string;
  description: string;
  qty: number;
  /** Units put in the tote at this stop (substitutes included). */
  picked: string[];
  /** Units the release chose, in order. Any unit of the same product may be scanned instead. */
  suggested: { pallet_id: string; code: string }[];
  status: StopStatus;
  short_reason: ShortReason | null;
  /** Set when a short sent the rest of this stop to another spot. */
  moved_to: string | null;
}

export type BatchStatus = 'PICKING' | 'DONE';

export interface PickBatch {
  id: string;
  workspace_id: string;
  warehouse_id: string;
  /** B-0042. */
  code: string;
  status: BatchStatus;
  assigned_to: string;
  assigned_name: string;
  slots: PickSlot[];
  stops: PickStop[];
  created_by: string;
  created_at: string;
  finished_at: string | null;
  version: number;
  updated_at: string;
}

export type PackageStatus = 'PACKED' | 'STAGED' | 'HANDED_OFF' | 'CANCELLED';
export const PACKAGE_STATUS_LABEL: Record<PackageStatus, string> = { PACKED: 'Packed', STAGED: 'Staged', HANDED_OFF: 'Handed off', CANCELLED: 'Cancelled' };

export interface Package {
  id: string;
  workspace_id: string;
  warehouse_id: string;
  /** K-000045, printed as Code 128 and QR on the 4 × 6 package label. */
  code: string;
  order_id: string;
  order_code: string;
  customer: string;
  method: OrderMethod;
  /** Package 1, 2… of its order. */
  seq: number;
  unit_ids: string[];
  unit_codes: string[];
  box_type: string;
  weight_lb: number | null;
  status: PackageStatus;
  location_id: string | null;
  location_code: string | null;
  packed_by_name: string;
  packed_at: string;
  staged_at: string | null;
  version: number;
  updated_at: string;
}

/** What a picked record carries while it is out of stock for an order. */
export interface PalletOrderRef {
  order_id: string;
  order_code: string;
  batch_id: string | null;
  slot: string | null;
  tote_code: string | null;
  package_id: string | null;
  package_code: string | null;
  from_location_id: string | null;
}

export type SubPolicy = 'ask' | 'allow' | 'never';
export const SUB_POLICY_LABEL: Record<SubPolicy, string> = {
  ask: 'Manager approves',
  allow: 'Allowed',
  never: 'Never',
};

export interface OrdersSettings {
  on: boolean;
  /** Orders per cart: one tote each. */
  cart_size: number;
  box_types: string[];
  subs: SubPolicy;
}

export const DEFAULT_BOX_TYPES = ['Small box', 'Medium box', 'Large box', 'Mailer'];
export const DEFAULT_ORDERS: OrdersSettings = { on: false, cart_size: 6, box_types: DEFAULT_BOX_TYPES, subs: 'ask' };
export const MAX_CART = 8;

export function ordersOf(wh: { orders?: OrdersSettings } | null | undefined): OrdersSettings {
  return { ...DEFAULT_ORDERS, ...(wh?.orders ?? {}) };
}

/** Each tote slot keeps one letter and one color, so a glance at the cart is enough. */
export const SLOT_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;
export const SLOT_COLOR: Record<string, { bg: string; ink: string; name: string }> = {
  A: { bg: '#1d5fd1', ink: '#ffffff', name: 'blue' },
  B: { bg: '#e2711d', ink: '#ffffff', name: 'orange' },
  C: { bg: '#1f8a4c', ink: '#ffffff', name: 'green' },
  D: { bg: '#7b3fbf', ink: '#ffffff', name: 'purple' },
  E: { bg: '#d6337e', ink: '#ffffff', name: 'pink' },
  F: { bg: '#0f8a8a', ink: '#ffffff', name: 'teal' },
  G: { bg: '#8a6a12', ink: '#ffffff', name: 'brown' },
  H: { bg: '#4b5563', ink: '#ffffff', name: 'gray' },
};

// ------------------------------------------------------------------ codes

export const formatOrderCode = (n: number) => `O-${String(n).padStart(6, '0')}`;
export const formatBatchCode = (n: number) => `B-${String(n).padStart(4, '0')}`;
export const formatPackageCode = (n: number) => `K-${String(n).padStart(6, '0')}`;
export const formatToteCode = (n: number) => `T-${String(n).padStart(2, '0')}`;

export function parseOrderCode(raw: string): string | null {
  const m = /^O[\s-]?0*(\d{1,7})$/i.exec(raw.trim());
  return m ? formatOrderCode(Number(m[1])) : null;
}
export function parsePackageCode(raw: string): string | null {
  const m = /^K[\s-]?0*(\d{1,7})$/i.exec(raw.trim());
  return m ? formatPackageCode(Number(m[1])) : null;
}
/** Reusable tote labels: T-01 to T-999. */
export function parseToteCode(raw: string): string | null {
  const m = /^T[\s-]?0*(\d{1,3})$/i.exec(raw.trim());
  return m && Number(m[1]) > 0 ? formatToteCode(Number(m[1])) : null;
}

/**
 * The ways one product code can be written on a record: a GTIN may be stored as 8, 12, 13 or 14 digits.
 * Used to find stock of a product with an exact-match query.
 */
export function productCodeVariants(code: string): string[] {
  const raw = code.trim();
  const key = barcodeMatchKey(raw);
  const out = new Set<string>([raw, key].filter(Boolean));
  if (/^\d{14}$/.test(key)) {
    const d = key.replace(/^0+/, '');
    for (const n of [8, 12, 13, 14]) if (d.length <= n) out.add(d.padStart(n, '0'));
  }
  return [...out].slice(0, 10);
}

/** True when two product codes name the same product (GTIN zero padding ignored). */
export function sameProduct(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return barcodeMatchKey(a) === barcodeMatchKey(b);
}

export function palletProduct(p: Pallet): string {
  return p.receiving?.product_code?.trim() ?? '';
}

// ------------------------------------------------------------------ progress

/** Units that count toward a line: picked units, minus substitutes that were refused. */
export function lineFilled(line: OrderLine): number {
  return line.units.filter((u) => !u.sub || u.sub.status !== 'rejected').length;
}

export function lineShort(line: OrderLine): number {
  return line.short?.qty ?? 0;
}

export function orderUnits(o: Order): OrderUnit[] {
  return o.lines.flatMap((l) => l.units);
}

export function pendingSubs(o: Order): OrderUnit[] {
  return orderUnits(o).filter((u) => u.sub?.status === 'pending');
}

export function orderShortQty(o: Order): number {
  return o.lines.reduce((n, l) => n + lineShort(l), 0);
}

export function orderQty(o: Order): number {
  return o.lines.reduce((n, l) => n + l.qty, 0);
}

/** Natural order of spot codes: A-01-02 before A-01-10 before B-01-01. Stops without a spot go last. */
export function compareSpots(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' });
}

/** The walk: by spot code, then by tote letter, so each spot is visited once. */
export function sortStops(stops: PickStop[]): PickStop[] {
  return [...stops].sort((x, y) => compareSpots(x.location_code, y.location_code) || x.slot.localeCompare(y.slot) || x.key.localeCompare(y.key));
}

export function batchProgress(b: PickBatch): { done: number; total: number; units: number; unitsTotal: number } {
  const total = b.stops.length;
  const done = b.stops.filter((s) => s.status !== 'open').length;
  const units = b.stops.reduce((n, s) => n + s.picked.length, 0);
  const unitsTotal = b.stops.reduce((n, s) => n + (s.moved_to ? s.picked.length : s.qty), 0);
  return { done, total, units, unitsTotal };
}

/** The next stop to walk to, and the one after it for the preview. */
export function nextStops(b: PickBatch): { current: PickStop | null; next: PickStop | null; index: number } {
  const open = b.stops.filter((s) => s.status === 'open');
  const index = open[0] ? b.stops.indexOf(open[0]) : b.stops.length;
  return { current: open[0] ?? null, next: open[1] ?? null, index };
}

/** "Due in 25 min", "Late", or a time, relative to now. */
export function dueState(o: Pick<Order, 'due_at' | 'status'>, now = Date.now()): 'late' | 'soon' | 'later' | 'none' {
  if (!o.due_at || o.status === 'DONE' || o.status === 'CANCELLED') return 'none';
  const t = Date.parse(o.due_at);
  if (!Number.isFinite(t)) return 'none';
  if (t < now) return 'late';
  if (t - now <= 60 * 60_000) return 'soon';
  return 'later';
}

/** Orders a picker can start: ready to pick, soonest due first, then oldest. */
export function pickQueue(orders: Order[]): Order[] {
  return orders
    .filter((o) => o.status === 'OPEN' && !o.batch_id && o.lines.some((l) => lineFilled(l) < l.qty))
    .sort((a, b) => (a.due_at ?? '9999').localeCompare(b.due_at ?? '9999') || a.created_at.localeCompare(b.created_at) || a.code.localeCompare(b.code));
}

/** The tote or package a picked unit is in, in a few words. */
export function whereInOrder(ref: PalletOrderRef): string {
  if (ref.package_code) return `in package ${ref.package_code} for ${ref.order_code}`;
  if (ref.tote_code) return `in tote ${ref.tote_code} for ${ref.order_code}`;
  if (ref.slot) return `in tote ${ref.slot} for ${ref.order_code}`;
  return `picked for ${ref.order_code}`;
}

// ------------------------------------------------------------------ CSV import of orders

/** One CSV row per order line. Rows with the same order number make one order. */
export interface OrderDraft {
  external_ref: string;
  customer: OrderCustomer;
  method: OrderMethod;
  due_at: string | null;
  allow_subs: boolean;
  notes: string;
  lines: { product_code: string; qty: number; row: number }[];
  rows: number[];
}

const yes = (v: string) => /^(y|yes|true|1|ok|allowed?)$/i.test(v.trim());

/** Read a due date or time typed in a spreadsheet: 2026-10-01 14:00, 10/1/2026 2:00 PM, or an ISO time. */
export function parseDue(raw: string): string | null | 'invalid' {
  const v = raw.trim();
  if (!v) return null;
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})\s*([ap]m)?)?$/i.exec(v);
  if (us) {
    let h = Number(us[4] ?? 17);
    if (us[6]) h = (h % 12) + (/p/i.test(us[6]) ? 12 : 0);
    const d = new Date(Number(us[3]), Number(us[1]) - 1, Number(us[2]), h, Number(us[5] ?? 0));
    return Number.isFinite(d.getTime()) ? d.toISOString() : 'invalid';
  }
  const local = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?$/.exec(v);
  if (local) {
    const d = new Date(Number(local[1]), Number(local[2]) - 1, Number(local[3]), Number(local[4] ?? 17), Number(local[5] ?? 0));
    return Number.isFinite(d.getTime()) ? d.toISOString() : 'invalid';
  }
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : 'invalid';
}

export function parseMethod(raw: string): OrderMethod | null {
  const v = raw.trim().toLowerCase();
  if (!v || /^(ship|shipping|shipped|deliver|delivery|mail|post)$/.test(v)) return 'ship';
  if (/^(pickup|pick up|pick-up|collect|collection|will call|curbside|in store)$/.test(v)) return 'pickup';
  return null;
}

export interface RowProblem {
  row: number;
  column: string;
  message: string;
}

/** Group import rows into orders and check every cell. Row numbers match the spreadsheet (header is row 1). */
export function draftOrders(rows: Record<string, string>[]): { orders: OrderDraft[]; errors: RowProblem[] } {
  const errors: RowProblem[] = [];
  const byRef = new Map<string, OrderDraft>();
  const get = (r: Record<string, string>, k: string) => (r[k] ?? '').trim();
  rows.forEach((r, i) => {
    const row = i + 2;
    const ref = get(r, 'order_ref');
    const customer = get(r, 'customer');
    const product = get(r, 'product');
    const qtyText = get(r, 'qty') || '1';
    const qty = Number(qtyText);
    if (!ref) errors.push({ row, column: 'order_ref', message: 'Order number is required.' });
    else if (ref.length > 40) errors.push({ row, column: 'order_ref', message: 'Order numbers are limited to 40 characters.' });
    if (!product) errors.push({ row, column: 'product', message: 'Product barcode or SKU is required.' });
    else if (product.length > 80) errors.push({ row, column: 'product', message: 'Product codes are limited to 80 characters.' });
    if (!Number.isInteger(qty) || qty < 1 || qty > 999) errors.push({ row, column: 'qty', message: 'Quantity must be a whole number from 1 to 999.' });
    const method = parseMethod(get(r, 'method'));
    if (!method) errors.push({ row, column: 'method', message: 'Method must be ship or pickup.' });
    const due = parseDue(get(r, 'due'));
    if (due === 'invalid') errors.push({ row, column: 'due', message: 'Use a date and time such as 2026-10-01 14:00.' });
    if (!ref) return;
    let d = byRef.get(ref);
    if (!d) {
      if (!customer) errors.push({ row, column: 'customer', message: 'Customer name is required on the first row of each order.' });
      else if (customer.length > 120) errors.push({ row, column: 'customer', message: 'Customer names are limited to 120 characters.' });
      d = {
        external_ref: ref,
        customer: { name: customer, phone: get(r, 'phone').slice(0, 40), email: get(r, 'email').slice(0, 120), address: get(r, 'address').slice(0, 300) },
        method: method ?? 'ship',
        due_at: due === 'invalid' ? null : due,
        allow_subs: yes(get(r, 'substitutes_ok')),
        notes: get(r, 'notes').slice(0, 1000),
        lines: [],
        rows: [],
      };
      byRef.set(ref, d);
    } else if (customer && customer !== d.customer.name) {
      errors.push({ row, column: 'customer', message: `Order ${ref} already has customer ${d.customer.name} on row ${d.rows[0]}.` });
    }
    d.rows.push(row);
    if (product && Number.isInteger(qty) && qty >= 1) {
      const same = d.lines.find((l) => sameProduct(l.product_code, product));
      if (same) same.qty += qty;
      else d.lines.push({ product_code: product, qty, row });
    }
  });
  for (const d of byRef.values()) if (d.lines.length > 50) errors.push({ row: d.rows[0], column: 'order_ref', message: `Order ${d.external_ref} has more than 50 lines.` });
  return { orders: [...byRef.values()], errors };
}
