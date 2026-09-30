import { describe, expect, it } from 'vitest';
import { BLANK_ANSWERS, recommend } from '../../src/domain/survey';

describe('setup survey recommendation', () => {
  it('uses the preset words and turns grouping on only when asked', () => {
    const r = recommend({ ...BLANK_ANSWERS, store: 'items', group: 'none' });
    expect(r.setup).toMatchObject({ preset: 'items', thing: 'Item', things: 'Items', jobs_on: false });
    expect(recommend({ ...BLANK_ANSWERS, store: 'items', group: 'customer' }).setup).toMatchObject({ job: 'Customer', jobs: 'Customers', jobs_on: true });
  });
  it('takes custom words and cleans them', () => {
    const r = recommend({ ...BLANK_ANSWERS, store: 'custom', word: ' tote!! ', group: 'other', groupWord: 'rental' });
    expect(r.setup).toMatchObject({ thing: 'Tote', things: 'Totes', job: 'Rental', jobs: 'Rentals' });
  });
  it('judges printers and suggests one when there is none', () => {
    expect(recommend({ ...BLANK_ANSWERS, hasPrinter: 'yes', printer: 'thermal4' }).printer.verdict).toBe('works');
    expect(recommend({ ...BLANK_ANSWERS, hasPrinter: 'yes', printer: 'handheld' }).printer.verdict).toBe('no');
    expect(recommend({ ...BLANK_ANSWERS, hasPrinter: 'no', count: 'over10000' }).printer.body).toMatch(/thermal/);
  });
  it('turns on limits, suggests import for big counts and crew for teams', () => {
    const r = recommend({ ...BLANK_ANSWERS, limits: 'yes', count: 'to10000', people: 'small', places: ['yard'] });
    expect(r.advanced).toBe(true);
    expect(r.steps.join(' ')).toMatch(/Import/);
    expect(r.steps.join(' ')).toMatch(/crew/);
    expect(r.labels.join(' ')).toMatch(/weatherproof/);
  });
  it('plans storage zones in order and explains shared spots', () => {
    const r = recommend({ ...BLANK_ANSWERS, places: ['racks', 'shelves'], zones: { racks: 'few', shelves: 'one' }, perSpot: 'many' });
    expect(r.spots[0]).toMatch(/zones A to C/);
    expect(r.spots[1]).toMatch(/zone D/);
    expect(r.spots.join(' ')).toMatch(/list what is in it/);
  });
  it('flags narrow label printers', () => {
    expect(recommend({ ...BLANK_ANSWERS, hasPrinter: 'yes', printer: 'brother' }).printer.verdict).toBe('no');
    expect(recommend({ ...BLANK_ANSWERS, hasPrinter: 'yes', printer: 'dymoXL' }).labels[0]).toMatch(/4×6/);
  });
});
