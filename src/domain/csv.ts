// CSV reading and writing (pages 27-28). UTF-8, RFC 4180 quoting, spreadsheet-formula protection.

/** Cells that spreadsheet software could run as formulas get a leading apostrophe. */
export function protectCell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  return /^[\s]*[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s.trim()) ? `'${s}` : s;
}

export function quoteCell(s: string): string {
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  const cols = columns ?? (rows[0] ? Object.keys(rows[0]) : []);
  const lines = [cols.map(quoteCell).join(',')];
  for (const r of rows) lines.push(cols.map((c) => quoteCell(protectCell(r[c]))).join(','));
  return lines.join('\r\n') + '\r\n';
}

/** Parse CSV text into header + rows. Handles quotes, escaped quotes, CRLF, and a UTF-8 BOM. */
export function parseCsv(text: string): { header: string[]; rows: string[][] } {
  const src = text.replace(/^﻿/, '');
  const out: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"' && cell === '') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      out.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    out.push(row);
  }
  const nonEmpty = out.filter((r) => r.some((c) => c.trim() !== ''));
  const [header = [], ...rows] = nonEmpty;
  return { header: header.map((h) => h.trim().toLowerCase()), rows };
}

export type ImportKind = 'locations' | 'jobs' | 'pallets' | 'shipments';

export const IMPORT_TEMPLATES: Record<ImportKind, { required: string[]; optional: string[]; sample: string[][]; who: string; policy: string }> = {
  shipments: {
    required: ['description'],
    optional: ['barcode', 'quantity', 'unit', 'product_code', 'category', 'job_code', 'job_name', 'destination', 'remind_on', 'notes', 'details_json', 'supplier_ref'],
    sample: [
      ['Seasoned white oak splits, 16 in', '006141411234567890', '1', 'pallet', '', 'Hardwood', '', '', '', '', '', '', ''],
      ['Campfire bundles, 0.75 cu ft', '012345678905', '48', 'bundles', '012345678905', 'Bundles', '', '', '', '', '', '{"Grade":"A"}', ''],
    ],
    who: 'Supervisors and owners',
    policy: "Each row loads a pallet's barcode and details into your system, so the pallet is identified the moment it's scanned in on Receive. It's counted as stock once it's scanned in.",
  },
  locations: {
    required: ['warehouse_code', 'location_code', 'kind'],
    optional: [],
    sample: [
      ['WH-01', 'C-01-01', 'RACK'],
      ['WH-01', 'C-01-02', 'RACK'],
      ['WH-01', 'STAGING-01', 'STAGING'],
    ],
    who: 'Supervisors and owners',
    policy: 'Creates missing locations. Existing codes are left unchanged, never silently renamed.',
  },
  jobs: {
    required: ['job_code', 'job_name'],
    optional: ['destination_notes'],
    sample: [
      ['J-250', 'Hospital wing expansion', 'North tower dock'],
      ['J-251', 'Retail storefront', 'Main St. alley'],
    ],
    who: 'Supervisors and owners',
    policy: 'Creates OPEN jobs. A code that already exists is an error.',
  },
  pallets: {
    required: ['description'],
    optional: ['job_code', 'job_name', 'notes', 'supplier_ref'],
    sample: [
      ['Acoustic ceiling grid', 'J-214', '', 'Two crates strapped together', 'ACME-4471'],
      ['Stone veneer', 'J-221', 'Retail storefront', '', ''],
    ],
    who: 'Supervisors and owners',
    policy: 'Only for pallets already sitting in your warehouse, such as when you start using Wherehouse. Each row becomes a pallet on hand right away, with a new label to print. For a delivery that hasn\'t arrived yet, use Incoming instead.',
  },
};

export function templateCsv(kind: ImportKind): string {
  const t = IMPORT_TEMPLATES[kind];
  const cols = [...t.required, ...t.optional];
  const rows = t.sample.map((s) => Object.fromEntries(cols.map((c, i) => [c, s[i] ?? ''])));
  return toCsv(rows, cols);
}

export interface ParsedImport {
  kind: ImportKind;
  rows: Record<string, string>[];
  headerErrors: string[];
  unknownHeaders: string[];
}

/** Guess which import a CSV is for from its header row, so a file isn't checked against the wrong template. */
export function detectImportKind(text: string, allowed: readonly ImportKind[] = Object.keys(IMPORT_TEMPLATES) as ImportKind[]): ImportKind | null {
  const header = new Set(parseCsv(text).header);
  if (!header.size) return null;
  const fits = allowed.filter((k) => IMPORT_TEMPLATES[k].required.every((c) => header.has(c)));
  // A list of goods is what's coming in, not stock on hand, so Incoming wins over Pallets.
  const order = (k: ImportKind) => (k === 'shipments' ? 0 : k === 'pallets' ? 2 : 1);
  const exact = fits.filter((k) => [...header].every((h) => !h || IMPORT_TEMPLATES[k].required.includes(h) || IMPORT_TEMPLATES[k].optional.includes(h))).sort((a, b) => order(a) - order(b));
  if (exact.length) return exact[0];
  const loose = fits.filter((k) => k !== 'pallets' || !fits.includes('shipments'));
  return loose.length === 1 ? loose[0] : null;
}

export function prepareImport(kind: ImportKind, text: string): ParsedImport {
  const t = IMPORT_TEMPLATES[kind];
  const { header, rows } = parseCsv(text);
  const known = new Set([...t.required, ...t.optional]);
  const headerErrors: string[] = [];
  const missing = t.required.filter((c) => !header.includes(c));
  if (missing.length) headerErrors.push(`Missing required column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}.`);
  const unknownHeaders = header.filter((h) => h && !known.has(h));
  if (unknownHeaders.length) headerErrors.push(`Unknown column${unknownHeaders.length > 1 ? 's' : ''}: ${unknownHeaders.join(', ')}. Remove or rename them.`);
  const dupes = header.filter((h, i) => header.indexOf(h) !== i);
  if (dupes.length) headerErrors.push(`Duplicate column: ${dupes.join(', ')}.`);
  const objs = rows.map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])));
  return { kind, rows: objs, headerErrors, unknownHeaders };
}

/** Which of the file's columns feeds each template field (field -> file header, lower case). */
export type ColumnMap = Record<string, string>;

export interface SavedImportTemplate {
  id: string;
  name: string;
  kind: ImportKind;
  map: ColumnMap;
  /** The file's header row, normalized, so the same spreadsheet layout is recognized next time. */
  headerKey: string;
}

const SYNONYMS: Record<string, string[]> = {
  description: ['description', 'desc', 'item', 'item description', 'product', 'product name', 'contents', 'material', 'name', 'what'],
  job_code: ['job code', 'job', 'job number', 'job no', 'order', 'order number', 'order no', 'project', 'project number', 'customer order'],
  job_name: ['job name', 'customer', 'customer name', 'project name', 'order name'],
  notes: ['notes', 'note', 'comments', 'comment', 'remarks', 'memo'],
  supplier_ref: ['supplier ref', 'supplier reference', 'supplier tag', 'tag', 'reference', 'ref', 'po', 'po number', 'bol', 'lot', 'lot number'],
  warehouse_code: ['warehouse code', 'warehouse', 'site', 'facility'],
  location_code: ['location code', 'location', 'rack', 'bin', 'slot', 'area', 'spot'],
  kind: ['kind', 'type', 'location type'],
  destination_notes: ['destination notes', 'destination', 'deliver to', 'ship to'],
  barcode: ['barcode', 'sscc', 'gtin', 'upc', 'ean', 'upc code', 'item barcode', 'scan code', 'supplier ref', 'supplier reference', 'tag', 'lpn'],
  product_code: ['product code', 'sku', 'item code', 'item number', 'part number'],
  quantity: ['quantity', 'qty', 'count', 'amount'],
  unit: ['unit', 'units', 'uom'],
  destination: ['destination', 'deliver to', 'ship to'],
  remind_on: ['remind on', 'due', 'due date', 'date'],
  details_json: ['details json', 'details'],
  category: ['category', 'group', 'product type', 'class', 'department'],
};
const norm = (h: string) => h.toLowerCase().replace(/#/g, ' number').replace(/[_\-.:\/]+/g, ' ').replace(/\s+/g, ' ').trim();

export function headerKey(text: string): string {
  return parseCsv(text).header.map(norm).join('|');
}

/** Best guess at which file column feeds each field. Each file column is used once. */
export function guessMapping(kind: ImportKind, header: string[]): ColumnMap {
  const t = IMPORT_TEMPLATES[kind];
  const map: ColumnMap = {};
  const used = new Set<string>();
  for (const field of [...t.required, ...t.optional]) {
    const words = [norm(field), ...(SYNONYMS[field] ?? [])];
    const hit = words.map((w) => header.find((h) => !used.has(h) && norm(h) === w)).find(Boolean);
    if (hit) { map[field] = hit; used.add(hit); }
  }
  return map;
}

/** Rewrite a CSV under the template's column names. Columns the map doesn't use are left out. */
export function applyMapping(kind: ImportKind, text: string, map: ColumnMap): string {
  const t = IMPORT_TEMPLATES[kind];
  const { header, rows } = parseCsv(text);
  const fields = [...t.required, ...t.optional].filter((f) => map[f]);
  const idx = fields.map((f) => header.indexOf(map[f]));
  const lines = [fields.join(',')];
  for (const r of rows) lines.push(idx.map((i) => quoteCell(i >= 0 ? (r[i] ?? '').trim() : '')).join(','));
  return lines.join('\r\n') + '\r\n';
}
