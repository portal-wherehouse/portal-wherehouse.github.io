// Scheduled counts, move tasks, lots and expiry dates, and warehouse access. Pure, so the engine (the sample and the
// Firebase command function), the screens and the tests share one set of rules.

import type { CountLine, CountLineKind, CountRepeat, CountTask, Location, MoveTask, Pallet } from './types';

// ------------------------------------------------------------------ dates

/** Add days to a YYYY-MM-DD date. */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The same day next month, or the month's last day when it is shorter (Jan 31 → Feb 28). */
export function addMonth(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const year = m === 12 ? y + 1 : y;
  const month = m === 12 ? 1 : m + 1;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

/** When the next count of a repeating series is due. */
export function nextDue(day: string, repeat: CountRepeat): string | null {
  if (repeat === 'weekly') return addDays(day, 7);
  if (repeat === 'monthly') return addMonth(day);
  return null;
}

export const REPEAT_LABEL: Record<CountRepeat, string> = { none: 'Once', weekly: 'Every week', monthly: 'Every month' };

// ------------------------------------------------------------------ counts

/** Spots one count covers: at most this many, so a count stays one walk and one save. */
export const MAX_COUNT_SPOTS = 20;
/** Pallets one count can list (scanned or on record), so its review saves in one step. */
export const MAX_COUNT_LINES = 180;

/** The active spots of a zone, in walk order. */
export function zoneSpots(locations: Location[], warehouseId: string, zone: string): Location[] {
  const z = zone.trim().toUpperCase();
  return locations
    .filter((l) => l.warehouse_id === warehouseId && l.active && (l.zone ?? '').toUpperCase() === z)
    .sort((a, b) => a.code.localeCompare(b.code, 'en', { numeric: true }));
}

/** Zone letters that have at least one active spot. */
export function zonesOf(locations: Location[], warehouseId: string): string[] {
  return [...new Set(locations.filter((l) => l.warehouse_id === warehouseId && l.active && l.zone).map((l) => l.zone!.toUpperCase()))].sort();
}

/** Pallets the records say are on a spot now: the ones a count of that spot expects to find. */
export function expectedAt(pallets: Pallet[], locationId: string): Pallet[] {
  return pallets.filter((p) => p.state === 'STORED' && !p.archived_at && p.current_location_id === locationId);
}

/** Compare what was scanned on one spot with the records: matched, missing from the scan, and unexpected. */
export function countLines(spot: Location, scanned: Pallet[], expected: Pallet[], codeOf: (id: string | null) => string | null): CountLine[] {
  const seen = new Set(scanned.map((p) => p.id));
  const line = (p: Pallet, kind: CountLineKind): CountLine => ({
    pallet_id: p.id,
    code: p.code,
    description: p.description,
    location_id: spot.id,
    location_code: spot.code,
    kind,
    from_code: kind === 'unexpected' ? codeOf(p.current_location_id) : null,
    state: p.state,
    version: p.version,
    result: null,
  });
  const out: CountLine[] = [];
  for (const p of scanned) out.push(line(p, p.state === 'STORED' && p.current_location_id === spot.id ? 'matched' : 'unexpected'));
  for (const p of expected) if (!seen.has(p.id)) out.push(line(p, 'missing'));
  return out;
}

/** Differences a manager reviews: anything not matched, and codes nobody recognized. */
export function countDifferences(c: Pick<CountTask, 'lines' | 'unknown'>): number {
  return c.lines.filter((l) => l.kind !== 'matched').length + c.unknown.length;
}

/** A count is late once its due day has passed. */
export function countDueState(c: Pick<CountTask, 'due_on' | 'status'>, today: string): 'late' | 'today' | 'later' {
  if (c.due_on < today) return 'late';
  return c.due_on === today ? 'today' : 'later';
}

/** Open counts first by due day, then the ones waiting for review. */
export function sortCounts(list: CountTask[]): CountTask[] {
  const rank = { OPEN: 0, REVIEW: 1, DONE: 2, CANCELLED: 3 } as const;
  return [...list].sort((a, b) => rank[a.status] - rank[b.status] || a.due_on.localeCompare(b.due_on) || a.name.localeCompare(b.name));
}

// ------------------------------------------------------------------ move tasks

/** One open task per pallet: its id comes from the pallet, so a move finds its task without searching. */
export function moveTaskId(palletId: string): string {
  return `mt_${palletId}`;
}

/** Tasks a move or placement completes: an open task for that pallet with no spot named, or naming this spot. */
export function taskDoneBy(task: MoveTask | undefined, palletId: string, locationId: string): boolean {
  return !!task && task.status === 'OPEN' && task.pallet_id === palletId && (!task.to_location_id || task.to_location_id === locationId);
}

/** The crew's list: theirs first, then anyone's, then the ones assigned to someone else; oldest first in each. */
export function sortTasks(list: MoveTask[], me: string | null): MoveTask[] {
  const rank = (t: MoveTask) => (t.assigned_to === me ? 0 : t.assigned_to ? 2 : 1);
  return [...list].sort((a, b) => rank(a) - rank(b) || a.created_at.localeCompare(b.created_at) || a.code.localeCompare(b.code));
}

/** At most this many pallets go on one "put these away" request. */
export const MAX_QUEUE = 50;

// ------------------------------------------------------------------ lots and expiry

/** Within this many days, a lot shows on Expiring soon. */
export const EXPIRY_WINDOW_DAYS = 30;

export type ExpiryState = 'expired' | 'soon' | 'ok' | 'none';

export function expiryState(expiresOn: string | null | undefined, today: string, window = EXPIRY_WINDOW_DAYS): ExpiryState {
  if (!expiresOn) return 'none';
  if (expiresOn < today) return 'expired';
  return expiresOn <= addDays(today, window) ? 'soon' : 'ok';
}

/** The expiry date of a pallet, or null. */
export function expiresOn(p: Pallet): string | null {
  return p.receiving?.expires_on || null;
}

/** First expired, first out: the earliest expiry first, then pallets with no date. */
export function compareExpiry(a: Pallet, b: Pallet): number {
  const x = expiresOn(a) ?? '9999-12-31';
  const y = expiresOn(b) ?? '9999-12-31';
  return x < y ? -1 : x > y ? 1 : 0;
}

/** Pallets here (received or stored, not archived) that expire within the window or already expired, soonest first. */
export function expiringPallets(pallets: Pallet[], today: string, window = EXPIRY_WINDOW_DAYS): Pallet[] {
  const limit = addDays(today, window);
  return pallets
    .filter((p) => !p.archived_at && ['RECEIVED', 'STORED', 'MISSING'].includes(p.state) && !!expiresOn(p) && expiresOn(p)! <= limit)
    .sort((a, b) => compareExpiry(a, b) || a.code.localeCompare(b.code));
}

/** "Expired 3 days ago", "Expires today", "Expires in 12 days". */
export function expiryText(expiresOnDay: string, today: string): string {
  const days = Math.round((Date.parse(`${expiresOnDay}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (days < 0) return `Expired ${-days === 1 ? 'yesterday' : `${-days} days ago`}`;
  if (days === 0) return 'Expires today';
  return `Expires in ${days === 1 ? '1 day' : `${days} days`}`;
}

// ------------------------------------------------------------------ returns

/** What came back: put back into stock on a spot, or damaged and held in quarantine. */
export type ReturnCondition = 'restock' | 'damaged';

/** Reasons offered for a damaged return; people can also type their own. */
export const DAMAGE_REASONS = ['Damaged in transit', 'Opened or used', 'Defective', 'Wrong item sent back', 'Missing parts'];
