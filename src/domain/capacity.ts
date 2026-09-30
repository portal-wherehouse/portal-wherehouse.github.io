// Location capacity: how many pallets a location holds, and (with advanced weight and size tracking on)
// how much weight and what size of pallet. Capacity is counted in pallet positions, the unit warehouses
// plan racking and floor space in; weight and size are separate limits, like a rack beam's load rating.

import type { Location, Pallet } from './types';

/** A standard GMA pallet footprint, in inches. Locations in simple mode assume this size. */
export const STANDARD_PALLET = { length_in: 48, width_in: 40 };

const num = (v: string | number | null | undefined): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) && n > 0 ? n : null;
};

export function palletWeight(p: Pallet): number | null {
  return num(p.receiving?.weight_lb);
}

export function palletSize(p: Pallet): { length: number; width: number; height: number } | null {
  const l = num(p.receiving?.length_in),
    w = num(p.receiving?.width_in),
    h = num(p.receiving?.height_in);
  return l && w && h ? { length: l, width: w, height: h } : null;
}

export function totalPallets(loc: Location): number | null {
  return loc.capacity ? loc.capacity.spaces * Math.max(1, loc.capacity.stacking) : null;
}

export function palletsLeft(loc: Location): number | null {
  const t = totalPallets(loc);
  return t === null ? null : Math.max(0, t - (loc.load_pallets ?? 0));
}

export function weightLeft(loc: Location, advanced: boolean): number | null {
  const max = advanced ? loc.capacity?.max_weight_lb : null;
  return max ? Math.max(0, max - (loc.load_weight_lb ?? 0)) : null;
}

const hasSize = (loc: Location) => !!(loc.capacity?.length_in && loc.capacity.width_in && loc.capacity.height_in);

export type FitProblem = 'FULL' | 'NO_WEIGHT' | 'OVER_WEIGHT' | 'NO_SIZE' | 'TOO_BIG';

/** Whether a pallet can go to a location, and why not. Pallets already there always fit. */
export function fitCheck(p: Pallet, loc: Location, advanced: boolean): { problem: FitProblem; message: string } | null {
  if (!loc.capacity || p.current_location_id === loc.id) return null;
  const left = palletsLeft(loc);
  if (left !== null && left <= 0) return { problem: 'FULL', message: `${loc.code} is full (${loc.load_pallets ?? 0} of ${totalPallets(loc)} pallets). Choose another location.` };
  if (!advanced) return null;
  const max = loc.capacity.max_weight_lb;
  if (max) {
    const w = palletWeight(p);
    if (w === null) return { problem: 'NO_WEIGHT', message: `${loc.code} has a weight limit. Add ${p.code}'s estimated weight first, or choose a location without one.` };
    if ((loc.load_weight_lb ?? 0) + w > max) return { problem: 'OVER_WEIGHT', message: `${p.code} (${fmtLb(w)}) would put ${loc.code} over its ${fmtLb(max)} limit. ${fmtLb(Math.max(0, max - (loc.load_weight_lb ?? 0)))} left.` };
  }
  if (hasSize(loc)) {
    const s = palletSize(p);
    if (!s) return { problem: 'NO_SIZE', message: `${loc.code} has a size limit. Add ${p.code}'s length, width and height first, or choose another location.` };
    const c = loc.capacity;
    const fitsFloor = (s.length <= c.length_in! && s.width <= c.width_in!) || (s.length <= c.width_in! && s.width <= c.length_in!);
    if (!fitsFloor || s.height > c.height_in!) return { problem: 'TOO_BIG', message: `${p.code} (${s.length} × ${s.width} × ${s.height} in) doesn't fit ${loc.code}'s ${c.length_in} × ${c.width_in} × ${c.height_in} in spaces.` };
  }
  return null;
}

export const fmtLb = (n: number) => `${Math.round(n).toLocaleString('en-US')} lb`;

export interface Suggestion {
  location: Location;
  left: number;
  weightLeft: number | null;
  sameProduct: boolean;
}

/**
 * Where a pallet could go, most room first. Locations holding the same product come first so like pallets
 * end up together. A pallet with no weight is only offered locations without a weight limit, unless includeLimited.
 */
export function suggestLocations(p: Pallet, locations: Location[], pallets: Pallet[], advanced: boolean): { suggestions: Suggestion[]; needWeight: number } {
  const code = p.receiving?.product_code?.trim();
  const sameAt = new Set(code ? pallets.filter((x) => x.id !== p.id && x.state === 'STORED' && x.receiving?.product_code?.trim() === code).map((x) => x.current_location_id) : []);
  let needWeight = 0;
  const out: Suggestion[] = [];
  for (const loc of locations) {
    if (!loc.active || !loc.capacity || loc.id === p.current_location_id || loc.warehouse_id !== p.warehouse_id) continue;
    const f = fitCheck(p, loc, advanced);
    if (f?.problem === 'NO_WEIGHT') needWeight++;
    if (f) continue;
    out.push({ location: loc, left: palletsLeft(loc) ?? 0, weightLeft: weightLeft(loc, advanced), sameProduct: sameAt.has(loc.id) });
  }
  out.sort((a, b) => Number(b.sameProduct) - Number(a.sameProduct) || b.left - a.left || a.location.code.localeCompare(b.location.code));
  return { suggestions: out, needWeight };
}
