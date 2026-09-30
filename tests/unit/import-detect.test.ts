import { describe, expect, it } from 'vitest';
import { detectImportKind } from '../../src/domain/csv';

describe('import file detection', () => {
  it('recognizes each template by its header row', () => {
    expect(detectImportKind('warehouse_code,location_code,kind\nWH-01,A-01-01,RACK\n')).toBe('locations');
    expect(detectImportKind('job_code,job_name,destination_notes\nJ-1,Job,\n')).toBe('jobs');
    // A list of goods is an Incoming list, not stock on hand.
    expect(detectImportKind('job_code,description,notes,supplier_ref\nFW-103,"Oak, 16 in",,TC-1\n')).toBe('shipments');
    expect(detectImportKind('Job_Code, Description\nFW-103,Oak\n')).toBe('shipments');
    expect(detectImportKind('description,barcode,quantity,unit\nOak,012345678905,48,logs\n')).toBe('shipments');
    // Only where Incoming isn't offered does it fall back to pallets on hand.
    expect(detectImportKind('description,supplier_ref\nOak,TC-1\n', ['locations', 'jobs', 'pallets'])).toBe('pallets');
  });
  it('leaves unknown or empty files alone', () => {
    expect(detectImportKind('name,qty\nOak,1\n')).toBeNull();
    expect(detectImportKind('')).toBeNull();
  });
  it('only picks templates that are offered', () => {
    expect(detectImportKind('barcode,job_code\n0123,J-1\n', ['locations', 'jobs', 'pallets'])).toBeNull();
  });
});
