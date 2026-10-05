// Making spots for a zone during setup: the codes, and sending them to the server in batches it accepts.

import { hashString, uuid } from '../../domain/codes';
import type { CommandKind, LocationKind } from '../../domain/types';
import type { Outcome } from '../../data/backend';

/** The most spots one press of "Create" makes; the server takes them 80 at a time. */
export const MAX_NEW_SPOTS = 3000;
export const SPOT_BATCH = 80;
export const pad2 = (n: number) => String(n).padStart(2, '0');

/** Spot codes for a zone: A-01-03-2 for racks (aisle, bay, level), B-07 for floor lanes. */
export function zoneCodes(letter: string, rack: boolean, aisles: number, bays: number, levels: number): string[] {
  const out: string[] = [];
  if (!rack) {
    for (let b = 1; b <= bays; b++) out.push(`${letter}-${pad2(b)}`);
    return out;
  }
  for (let a = 1; a <= aisles; a++)
    for (let b = 1; b <= bays; b++)
      for (let l = 1; l <= levels; l++) out.push(`${letter}-${pad2(a)}-${pad2(b)}${levels > 1 ? `-${levels > 9 ? pad2(l) : l}` : ''}`);
  return out;
}

/**
 * Make spots in batches the server accepts. Stops at the first refusal and says how far it got, so nothing
 * fails silently. Spots that already exist are skipped by the server, so pressing Create again is safe.
 */
export async function createSpots(
  send: (kind: CommandKind, payload: Record<string, unknown>, pallet: null, opts: { commandId: string }) => Promise<Outcome>,
  warehouseCode: string,
  codes: string[],
  kind: LocationKind,
  name: string,
  onProgress?: (made: number) => void,
): Promise<{ made: number; error: string }> {
  let made = 0;
  for (let i = 0; i < codes.length; i += SPOT_BATCH) {
    const rows = codes.slice(i, i + SPOT_BATCH).map((c) => ({ warehouse_code: warehouseCode, location_code: c, kind }));
    const o = await send('import_batch', { import_kind: 'locations', checksum: hashString(JSON.stringify(rows)), rows, name }, null, { commandId: uuid() });
    if (!(o.status === 'result' && o.result.ok)) {
      const why =
        o.status === 'result' && !o.result.ok
          ? o.result.message
          : o.status === 'offline'
            ? o.message
            : 'The server did not answer, so some of these spots may already be saved.';
      const done = made ? `${made.toLocaleString('en-US')} of ${codes.length.toLocaleString('en-US')} spots were created. ` : 'No spots were created. ';
      return { made, error: `${done}The server refused the rest: ${why} Press Create again to retry; spots that already exist are skipped.` };
    }
    made += rows.length;
    onProgress?.(made);
  }
  return { made, error: '' };
}

