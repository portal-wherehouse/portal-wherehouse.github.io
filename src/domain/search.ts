// Search ranking (page 13): exact codes first, then prefixes, then descriptions and names.
// Explicit keyset pagination with a stable tie-breaker so paging never repeats or skips.

import { normalizeCode, parsePalletCode } from './codes';
import type { Job, Location, Pallet, PalletState } from './types';

export interface SearchRow {
  pallet: Pallet;
  job: Job | undefined;
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

/** 0 = exact code, 1 = code prefix, 2 = text match, 3 = near match (a typo), -1 = no match. */
export function rankRow(row: SearchRow, rawQuery: string): number {
  const q = normalizeCode(rawQuery);
  if (!q) return 0;
  const palletCode = row.pallet.code;
  const asPallet = parsePalletCode(q);
  const supplierCode = normalizeCode(row.pallet.supplier_ref ?? '');
  if ((supplierCode && q === supplierCode) || (row.pallet.receiving?.product_code && q === normalizeCode(row.pallet.receiving.product_code))) return 0;
  const jobCode = normalizeCode(row.job?.code ?? '');
  const locCode = row.location ? normalizeCode(row.location.code) : '';
  if (q === palletCode || asPallet === palletCode || q === jobCode || (locCode && q === locCode)) return 0;
  if (palletCode.startsWith(q) || jobCode.startsWith(q) || (locCode && locCode.startsWith(q))) return 1;
  const hay = `${row.pallet.description} ${row.job?.name ?? ''} ${row.pallet.supplier_ref ?? ''} ${row.pallet.notes ?? ''} ${row.pallet.receiving?.product_code ?? ''} ${row.pallet.receiving?.destination ?? ''} ${(row.pallet.receiving?.fields??[]).map(f=>f.name+' '+f.value).join(' ')} ${(row.pallet.receiving?.contents??[]).map(c=>c.name+' '+c.sku).join(' ')}`.toUpperCase();
  const words = q.split(' ').filter(Boolean);
  if (words.every((w) => hay.includes(w))) return 2;
  // Near misses: every word the person typed is one slip (two for long words) from a word on the record.
  // Only for words: a code or barcode with digits in it is exact or nothing, because 420261000043 and
  // 420261000044 are two different products, not a typo, and a scan is never misspelled.
  const tokens = hay.split(/[^\p{L}\p{N}]+/u).filter((t) => t.length > 2);
  if (words.every((w) => w.length >= 4 && !/\p{N}/u.test(w) && tokens.some((t) => nearWord(w, t, w.length >= 7 ? 2 : 1)))) return 3;
  return -1;
}

/** Whether a is within max edits of b, or of the start of b ("DEWALT" typed as "DWALT", "IMPCT" for "IMPACT"). */
export function nearWord(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max && b.length < a.length) return false;
  const target = b.length > a.length + max ? b.slice(0, a.length + max) : b;
  let prev = Array.from({ length: target.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= target.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === target[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > max) return false;
    prev = cur;
  }
  // Allow b to run on past a: the best score over every prefix of target.
  return Math.min(...prev.slice(Math.max(0, a.length - max))) <= max;
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
