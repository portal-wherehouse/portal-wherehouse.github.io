// Find's ranking: typo tolerance for words, exact matching for codes and barcodes.
import { describe, expect, it } from 'vitest';
import { searchRows, type SearchRow } from '../../src/domain/search';
import type { Pallet } from '../../src/domain/types';

function row(code: string, description: string, product_code?: string): SearchRow {
  const pallet = {
    id: code,
    workspace_id: 'ws',
    code,
    description,
    state: 'STORED',
    job_id: '',
    current_location_id: null,
    supplier_ref: null,
    notes: null,
    archived_at: null,
    receiving: product_code ? { product_code } : undefined,
  } as unknown as Pallet;
  return { pallet, job: undefined, location: null, lastLocation: null };
}

// Products whose barcodes differ from 420261000043 by one or two digits, and one exact match.
const rows = [
  row('P-000001', 'Cedar planks', '420261000043'),
  row('P-000002', 'Cedar shims', '420261000044'),
  row('P-000003', 'Oak planks', '420261000053'),
  row('P-000004', 'Pine planks', '420261001143'),
  row('P-000005', 'DeWalt impact driver'),
];
const codes = (q: string) => searchRows(rows, { q }).items.map((r) => r.pallet.code);

describe('search', () => {
  it('finds only the exact product for a scanned barcode, not near-miss numbers', () => {
    expect(codes('420261000043')).toEqual(['P-000001']);
    expect(codes('420261000045')).toEqual([]);
  });

  it('still forgives a typo in a word', () => {
    expect(codes('DWALT')).toEqual(['P-000005']);
    expect(codes('impct drivr')).toEqual(['P-000005']);
    expect(codes('cedr')).toEqual(['P-000001', 'P-000002']);
  });

  it('keeps exact code and text matches', () => {
    expect(codes('P-000003')[0]).toBe('P-000003');
    expect(codes('planks')).toEqual(['P-000001', 'P-000003', 'P-000004']);
    expect(codes('4202610000')).toEqual(['P-000001', 'P-000002', 'P-000003']);
  });
});
