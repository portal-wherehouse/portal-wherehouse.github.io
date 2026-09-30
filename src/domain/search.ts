// Search ranking (page 13): exact codes first, then prefixes, then descriptions and names.
// Explicit keyset pagination with a stable tie-breaker so paging never repeats or skips.

import { normalizeCode, parsePalletCode } from './codes';
import type { Job, Location, Pallet, PalletState } from './types';

export interface SearchRow {
  pallet: Pallet;
  job: Job;
  location: Location | null;
  lastLocation: Location | null;
}

export interface SearchFilters {
  q?: string;
  states?: PalletState[];
  job_id?: string;
  location_id?: string;
  include_archived?: boolean;
  cursor?: string | null;
  limit?: number;
}

export interface RankedRow extends SearchRow {
  rank: number;
}

export const DEFAULT_PAGE = 50;
export const MAX_PAGE = 100;

/** 0 = exact code, 1 = code prefix, 2 = text match, -1 = no match. */
export function rankRow(row: SearchRow, rawQuery: string): number {
  const q = normalizeCode(rawQuery);
  if (!q) return 0;
  const palletCode = row.pallet.code;
  const asPallet = parsePalletCode(q);
  const supplierCode = normalizeCode(row.pallet.supplier_ref ?? '');
  if (supplierCode && q === supplierCode) return 0;
  const jobCode = normalizeCode(row.job.code);
  const locCode = row.location ? normalizeCode(row.location.code) : '';
  if (q === palletCode || asPallet === palletCode || q === jobCode || (locCode && q === locCode)) return 0;
  if (palletCode.startsWith(q) || jobCode.startsWith(q) || (locCode && locCode.startsWith(q))) return 1;
  const hay = `${row.pallet.description} ${row.job.name} ${row.pallet.supplier_ref ?? ''} ${row.pallet.notes ?? ''}`.toUpperCase();
  const words = q.split(' ').filter(Boolean);
  if (words.every((w) => hay.includes(w))) return 2;
  return -1;
}

function sortKey(r: RankedRow): string {
  return `${r.rank}|${r.pallet.code}`;
}

export function searchRows(rows: SearchRow[], f: SearchFilters): { items: RankedRow[]; next_cursor: string | null; total: number } {
  const limit = Math.min(Math.max(f.limit ?? DEFAULT_PAGE, 1), MAX_PAGE);
  const ranked: RankedRow[] = [];
  for (const row of rows) {
    const p = row.pallet;
    if (p.archived_at && !f.include_archived) continue;
    if (f.states && f.states.length && !f.states.includes(p.state)) continue;
    if (f.job_id && p.job_id !== f.job_id) continue;
    if (f.location_id && p.current_location_id !== f.location_id) continue;
    const rank = rankRow(row, f.q ?? '');
    if (rank < 0) continue;
    ranked.push({ ...row, rank });
  }
  ranked.sort((a, b) => (sortKey(a) < sortKey(b) ? -1 : sortKey(a) > sortKey(b) ? 1 : 0));
  const start = f.cursor ? ranked.findIndex((r) => sortKey(r) > f.cursor!) : 0;
  const from = start < 0 ? ranked.length : start;
  const items = ranked.slice(from, from + limit);
  const next_cursor = from + limit < ranked.length ? sortKey(items[items.length - 1]) : null;
  return { items, next_cursor, total: ranked.length };
}
