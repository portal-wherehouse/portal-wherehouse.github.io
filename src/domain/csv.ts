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

export type ImportKind = 'locations' | 'jobs' | 'pallets';

export const IMPORT_TEMPLATES: Record<ImportKind, { required: string[]; optional: string[]; sample: string[][]; who: string; policy: string }> = {
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
    required: ['job_code', 'description'],
    optional: ['notes', 'supplier_ref'],
    sample: [
      ['J-214', 'Acoustic ceiling grid', 'Two crates strapped together', 'ACME-4471'],
      ['J-221', 'Stone veneer', '', ''],
    ],
    who: 'Supervisors and owners',
    policy: 'Creates pallets as RECEIVED and unassigned. Staff confirm locations by placing them; history is never invented.',
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
