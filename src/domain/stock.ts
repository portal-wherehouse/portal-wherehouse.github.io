// Stock on hand, minimums and quantity changes. Pure, so the engine (demo and the Firebase command function), the
// screens and the tests share one set of rules.
//
// One record is one pallet (or whatever the warehouse calls it). A product's stock is its pallets that are here:
// received or stored, not archived. Pallets on hold are here but cannot be used, so they do not count toward a minimum.
// A minimum counts pallets, or, when a product says so, the quantity recorded on each pallet (48 tires, 2.5 cords).

import { barcodeMatchKey, type ProductMemory } from './receiving';
import type { AdjustReason, Pallet } from './types';

// ------------------------------------------------------------------ quantities

/** The leading number of a quantity as people type it: "48", "1,200", "2.5 cords". Null when there is none. */
export function parseQty(text: string | null | undefined): number | null {
  const m = /^\s*(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?/.exec(text ?? '');
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, '') + (m[2] ?? ''));
  return Number.isFinite(n) ? n : null;
}

/** A number as a quantity: no trailing zeros, at most three decimals. */
export function fmtQty(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}

/** The quantity text with its number replaced, keeping any words after it ("48 logs" → "45 logs"). */
export function withQty(text: string | null | undefined, n: number): string {
  const t = text ?? '';
  const m = /^\s*(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?/.exec(t);
  return m ? fmtQty(n) + t.slice(m[0].length) : fmtQty(n);
}

// ------------------------------------------------------------------ quantity changes

export const ADJUST_REASONS: AdjustReason[] = ['used', 'damaged', 'write_off', 'found', 'counted'];

export const ADJUST_LABEL: Record<AdjustReason, string> = {
  used: 'Used',
  damaged: 'Damaged',
  write_off: 'Written off',
  found: 'Found extra',
  counted: 'Counted',
};

/** What the amount means for each reason, for the form. */
export const ADJUST_HINT: Record<AdjustReason, string> = {
  used: 'Taken out for use. The amount comes off.',
  damaged: 'Broken or spoiled. The amount comes off.',
  write_off: 'Lost, expired or stolen. The amount comes off.',
  found: 'More than recorded. The amount is added.',
  counted: 'You counted it. Enter the new total.',
};

/** Reasons that take some away; "found" adds and "counted" sets the total. */
export const ADJUST_SUBTRACTS: Record<AdjustReason, boolean> = { used: true, damaged: true, write_off: true, found: false, counted: false };

export type AdjustOutcome = { ok: true; from: number | null; to: number } | { ok: false; message: string };

/** The quantity after a change, from the quantity recorded now. Subtracting needs a recorded number to subtract from. */
export function adjustQty(current: string | null | undefined, reason: AdjustReason, amount: number): AdjustOutcome {
  if (!Number.isFinite(amount) || amount < 0) return { ok: false, message: 'Enter an amount of 0 or more.' };
  const from = parseQty(current);
  if (reason === 'counted') {
    if (from !== null && from === amount) return { ok: false, message: `The quantity is already ${fmtQty(amount)}.` };
    return { ok: true, from, to: amount };
  }
  if (amount === 0) return { ok: false, message: 'Enter how many.' };
  if (reason === 'found') return { ok: true, from, to: (from ?? 0) + amount };
  if (from === null) return { ok: false, message: 'No quantity is recorded yet. Use Counted to record how many there are.' };
  if (amount > from) return { ok: false, message: `Only ${fmtQty(from)} recorded. Enter ${fmtQty(from)} or less, or use Counted.` };
  return { ok: true, from, to: Math.round((from - amount) * 1000) / 1000 };
}

/** One line for history and reports: "Used 3: 10 → 7 tires". */
export function adjustLine(reason: AdjustReason, amount: number, from: number | null, to: number, unit?: string | null): string {
  const what = reason === 'counted' ? 'Counted' : `${ADJUST_LABEL[reason]} ${fmtQty(amount)}`;
  return `${what}: ${from === null ? 'none recorded' : fmtQty(from)} → ${fmtQty(to)}${unit ? ` ${unit}` : ''}`;
}

// ------------------------------------------------------------------ on hand

/** Here and countable: received or stored, not archived. */
export function isHere(p: Pallet): boolean {
  return !p.archived_at && (p.state === 'RECEIVED' || p.state === 'STORED');
}

/** The product a pallet belongs to, as a match key (equivalent GTINs agree); '' when it has none. */
export function productKeyOf(p: Pallet): string {
  const code = p.receiving?.product_code?.trim();
  return code ? barcodeMatchKey(code) : '';
}

export interface Stock {
  /** Pallets here and not on hold. */
  units: number;
  /** The quantity on those pallets, where a number is recorded. */
  qty: number;
  /** Pallets here but on hold. */
  held: number;
}

export const NO_STOCK: Stock = { units: 0, qty: 0, held: 0 };

/** Stock per product, keyed by barcodeMatchKey of the product code. */
export function stockByKey(pallets: Iterable<Pallet>): Map<string, Stock> {
  const out = new Map<string, Stock>();
  for (const p of pallets) {
    if (!isHere(p)) continue;
    const key = productKeyOf(p);
    if (!key) continue;
    const s = out.get(key) ?? { units: 0, qty: 0, held: 0 };
    if (p.hold) s.held++;
    else {
      s.units++;
      s.qty += parseQty(p.receiving?.quantity) ?? 0;
    }
    out.set(key, s);
  }
  return out;
}

export function stockOf(product: Pick<ProductMemory, 'code'>, byKey: Map<string, Stock>): Stock {
  return byKey.get(barcodeMatchKey(product.code)) ?? NO_STOCK;
}

/** What the minimum is compared with: pallets, or their quantity. */
export function measure(product: Pick<ProductMemory, 'count_by'>, s: Stock): number {
  return product.count_by === 'quantity' ? Math.round(s.qty * 1000) / 1000 : s.units;
}

/** The word for what the minimum counts: "pallets", or the product's unit ("tires"). */
export function measureWord(product: Pick<ProductMemory, 'count_by' | 'unit'>, n = 2): string {
  if (product.count_by === 'quantity') return product.unit?.trim() || (n === 1 ? 'unit' : 'units');
  return n === 1 ? 'pallet' : 'pallets';
}

export function hasMinimum(p: Pick<ProductMemory, 'min_qty'>): boolean {
  return typeof p.min_qty === 'number' && p.min_qty > 0;
}

/** Below its minimum. Having exactly the minimum is enough. */
export function isLow(product: Pick<ProductMemory, 'min_qty' | 'count_by'>, s: Stock): boolean {
  return hasMinimum(product) && measure(product, s) < product.min_qty!;
}

export interface LowRow {
  product: ProductMemory;
  on_hand: number;
  min: number;
  /** How many to bring in: the reorder quantity, or enough to reach the minimum. */
  suggest: number;
  stock: Stock;
}

/** How many to bring in for a product that is low. */
export function suggestQty(product: Pick<ProductMemory, 'min_qty' | 'reorder_qty'>, onHand: number): number {
  const short = Math.max(0, (product.min_qty ?? 0) - onHand);
  return Math.max(product.reorder_qty ?? 0, Math.ceil(short));
}

/** Products below their minimum, the emptiest first (by how much of the minimum is left). */
export function lowStock(products: Iterable<ProductMemory>, byKey: Map<string, Stock>): LowRow[] {
  const rows: LowRow[] = [];
  for (const product of products) {
    const s = stockOf(product, byKey);
    if (!isLow(product, s)) continue;
    const on = measure(product, s);
    rows.push({ product, on_hand: on, min: product.min_qty!, suggest: suggestQty(product, on), stock: s });
  }
  return rows.sort((a, b) => a.on_hand / a.min - b.on_hand / b.min || a.product.description.localeCompare(b.product.description));
}

// ------------------------------------------------------------------ dispatch slips

/** D-000012: one number per send, printed on the dispatch slip as a Code 128 barcode. */
export function formatDispatchRef(n: number): string {
  return `D-${String(n).padStart(6, '0')}`;
}

/** D-000012 as printed, typed (d12, D 000012) or scanned from a slip; null when it is not a dispatch reference. */
export function parseDispatchRef(text: string): string | null {
  const m = /^\s*D[\s-]?0*(\d{1,9})\s*$/i.exec(text);
  return m && Number(m[1]) > 0 ? formatDispatchRef(Number(m[1])) : null;
}

export function dispatchRefNumber(ref: string): number {
  return Number(ref.slice(2));
}
