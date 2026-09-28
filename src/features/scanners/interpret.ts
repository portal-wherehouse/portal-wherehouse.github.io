// What a scanned code means in this company: a command barcode, a job, a pallet, a rack, or nothing we know.
// Shared by Scan anywhere (which opens it) and the Scanner setup test pad (which only describes it).

import { normalizeCode } from '../../domain/codes';
import type { Job, Location, Pallet } from '../../domain/types';
import { ReadError, type Engine } from '../../demo/engine';
import { SCAN_COMMANDS, parseScanCommand, type ScanCommand } from '../../device/scanCommands';

export type ScanMeaning =
  | { kind: 'command'; command: ScanCommand; label: string }
  | { kind: 'job'; job: Job }
  | { kind: 'pallet'; pallet: Pallet; location: Location | null }
  | { kind: 'location'; location: Location; pallets: number }
  | { kind: 'unknown'; message: string };

/** Job codes as printed on paperwork: J-214, j214. */
const JOB_CODE = /^J-?(\d{1,6})$/i;

export function interpretScan(engine: Engine, actorId: string, workspaceId: string, text: string): ScanMeaning {
  const command = parseScanCommand(text);
  if (command) return { kind: 'command', command, label: SCAN_COMMANDS.find((c) => c.id === command)?.label ?? command };

  const jm = JOB_CODE.exec(text.trim());
  if (jm) {
    const want = normalizeCode(`J-${jm[1]}`);
    const job = Object.values(engine.db.jobs).find((j) => j.workspace_id === workspaceId && (normalizeCode(j.code) === want || normalizeCode(j.code) === normalizeCode(text)));
    return job ? { kind: 'job', job } : { kind: 'unknown', message: `No job ${want} in this company.` };
  }

  try {
    const r = engine.resolve(actorId, workspaceId, text);
    if (r.type === 'pallet') {
      const loc = r.pallet.current_location_id ? (engine.db.locations[r.pallet.current_location_id] ?? null) : null;
      return { kind: 'pallet', pallet: r.pallet, location: loc };
    }
    const pallets = Object.values(engine.db.pallets).filter((p) => p.workspace_id === workspaceId && p.current_location_id === r.location.id).length;
    return { kind: 'location', location: r.location, pallets };
  } catch (e) {
    return { kind: 'unknown', message: e instanceof ReadError ? e.message : 'That code could not be read.' };
  }
}

/** A scan shortened for a toast or a list, so a long product barcode cannot flood the screen. */
export function shortScan(text: string, max = 32): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
