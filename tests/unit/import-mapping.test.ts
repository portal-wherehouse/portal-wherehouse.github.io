import { describe, expect, it } from 'vitest';
import { applyMapping, guessMapping, headerKey, parseCsv, prepareImport } from '../../src/domain/csv';

const supplier = 'PO #,Item Description,Qty,Customer,Remarks\n4471,"Oak, 16 in",1,Hearth & Home,Top rack\n4472,Birch bundles,2,,\n';

describe('supplier column matching', () => {
  it('guesses fields from common supplier headers', () => {
    const map = guessMapping('pallets', parseCsv(supplier).header);
    expect(map.description).toBe('item description');
    expect(map.supplier_ref).toBe('po #');
    expect(map.job_name).toBe('customer');
    expect(map.notes).toBe('remarks');
    expect(map.job_code).toBeUndefined();
  });

  it('rewrites the file under template columns, dropping unused ones', () => {
    const out = applyMapping('pallets', supplier, guessMapping('pallets', parseCsv(supplier).header));
    const p = prepareImport('pallets', out);
    expect(p.headerErrors).toEqual([]);
    expect(p.rows[0]).toEqual({ description: 'Oak, 16 in', job_name: 'Hearth & Home', notes: 'Top rack', supplier_ref: '4471' });
    expect(p.rows).toHaveLength(2);
  });

  it('recognizes the same layout regardless of case and punctuation', () => {
    expect(headerKey('PO #,Item Description\n')).toBe(headerKey('po number,item_description\n'));
  });
});
