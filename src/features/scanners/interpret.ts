// What a scanned code means in this company: a command barcode, a job, a pallet, a rack, a supplier or product
// barcode, or nothing on record. Shared by Scan anywhere (which opens it) and the Scanner setup test pad (which only describes it).

import { normalizeCode } from '../../domain/codes';
import { barcodeMatchKey, productKey, type ProductMemory } from '../../domain/receiving';
import { readSupplierBarcode, type SupplierBarcode } from '../../domain/supplierBarcode';
import type { Job, Location, Pallet } from '../../domain/types';
import { ReadError, type Engine } from '../../demo/engine';
import { SCAN_COMMANDS, parseScanCommand, type ScanCommand } from '../../device/scanCommands';

export type ScanMeaning =
  | { kind: 'command'; command: ScanCommand; label: string }
  | { kind: 'job'; job: Job }
  | { kind: 'pallet'; pallet: Pallet; location: Location | null }
  | { kind: 'location'; location: Location; pallets: number }
  /**
   * A supplier label or product barcode. `pallets` counts the pallets received with it, or is null when this device
   * holds only part of the records (a live warehouse), so Find has to search for them.
   */
  | { kind: 'product'; reference: string; barcode: SupplierBarcode['kind']; pallets: number | null; product: ProductMemory | null }
  | { kind: 'unknown'; message: string };

/** What the Dashboard and Scan anywhere say about a code that matches nothing. */
export const NOT_ON_RECORD = 'Not on record in this warehouse. No pallet, rack or product barcode matches it.';

/** A supplier or product barcode this warehouse knows, or might know when its records are only partly loaded. */
function productScan(engine: Engine, workspaceId: string, text: string, partial: boolean): ScanMeaning | null {
  let code: SupplierBarcode;
  try {
    code = readSupplierBarcode(text);
  } catch {
    return null;
  }
  const key = barcodeMatchKey(code.reference);
  const product = engine.db.products?.[productKey(workspaceId, code.reference)] ?? null;
  const pallets = Object.values(engine.db.pallets).filter(
    (p) =>
      p.workspace_id === workspaceId &&
      !p.archived_at &&
      p.state !== 'RETIRED' &&
      ((p.supplier_ref && barcodeMatchKey(p.supplier_ref) === key) || (p.receiving?.product_code && barcodeMatchKey(p.receiving.product_code) === key)),
  ).length;
  if (pallets || product) return { kind: 'product', reference: code.reference, barcode: code.kind, pallets, product };
  // A live warehouse keeps most pallets on the server, so a real product barcode is worth a search there.
  // Anything else, like a random code, is reported as not on record.
  if (partial && (code.kind === 'gtin' || code.kind === 'sscc')) return { kind: 'product', reference: code.reference, barcode: code.kind, pallets: null, product: null };
  return null;
}

/** Job codes as printed on paperwork: J-214, j214. */
const JOB_CODE = /^J-?(\d{1,6})$/i;

/** With `partial`, this device holds only part of the records (a live warehouse), so a product barcode with no local match still gets a search. */
export function interpretScan(engine: Engine, actorId: string, workspaceId: string, text: string, { partial = false }: { partial?: boolean } = {}): ScanMeaning {
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
    if (e instanceof ReadError && e.code === 'NOT_FOUND' && !e.message.startsWith('This label')) return productScan(engine, workspaceId, text, partial) ?? { kind: 'unknown', message: NOT_ON_RECORD };
    if (e instanceof ReadError && e.code === 'INVALID_INPUT') return productScan(engine, workspaceId, text, partial) ?? { kind: 'unknown', message: e.message };
    return { kind: 'unknown', message: e instanceof ReadError ? e.message : 'That code could not be read.' };
  }
}

/** A scan shortened for a toast or a list, so a long product barcode cannot flood the screen. */
export function shortScan(text: string, max = 32): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
