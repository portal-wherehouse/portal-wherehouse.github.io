import { describe, expect, it } from 'vitest';
import { PRINTERS, STYLES, aisleOf, inches, pageCss, paginate, perPage, printableName, sizeText, zoneOf } from '../../src/features/labels/printers';

describe('print layouts', () => {
  it('fit every label grid exactly inside its page, with the published Avery offsets', () => {
    for (const p of PRINTERS)
      for (const [style, l] of Object.entries(p.styles)) {
        const width = l.margin[1] * 2 + l.cols * l.label[0] + (l.cols - 1) * l.gap[0];
        const height = l.margin[0] + l.rows * l.label[1] + (l.rows - 1) * l.gap[1];
        expect(width, `${p.id}/${style} width`).toBeCloseTo(l.page[0], 4);
        expect(height, `${p.id}/${style} height`).toBeLessThanOrEqual(l.page[1] - l.margin[0] + 1e-6);
      }
    const avery = (id: string) => PRINTERS.find((p) => p.id === id)!.styles;
    expect(avery('avery5160').shelf).toMatchObject({ margin: [0.5, 0.1875], label: [2.625, 1], cols: 3, rows: 10, gap: [0.125, 0] });
    expect(avery('avery5163').spot).toMatchObject({ margin: [0.5, 0.15625], label: [4, 2], cols: 2, rows: 5 });
    expect(perPage(avery('avery5164').spot!)).toBe(6);
  });

  it('offers only the styles a printer can make', () => {
    const styles = (id: string) => Object.keys(PRINTERS.find((p) => p.id === id)!.styles).sort();
    expect(styles('thermal2x1')).toEqual(['item', 'shelf']);
    expect(styles('strip')).toEqual(['shelf']);
    expect(styles('office')).toEqual(['item', 'poster', 'shelf', 'spot']);
    expect(STYLES.map((s) => s.id)).toEqual(['spot', 'shelf', 'poster', 'item']);
    // Thermal printers print one label per page, the size of the label.
    for (const p of PRINTERS.filter((x) => x.kind === 'thermal')) for (const l of Object.values(p.styles)) expect(l.page).toEqual(l.label);
  });

  it('writes sizes in the usual fractions and sets the page size for printing', () => {
    expect(inches(2.625)).toBe('2-5/8');
    expect(inches(10 / 3)).toBe('3-1/3');
    expect(inches(1.25)).toBe('1-1/4');
    expect(inches(4)).toBe('4');
    expect(sizeText(PRINTERS[1].styles.shelf!)).toBe('2-5/8 x 1 in');
    expect(pageCss(PRINTERS.find((p) => p.id === 'thermal4x6')!.styles.spot!)).toContain('size: 4in 6in; margin: 0;');
    expect(paginate([1, 2, 3, 4, 5, 6, 7], { ...PRINTERS[0].styles.spot! })).toEqual([[1, 2, 3, 4, 5, 6], [7]]);
  });

  it('never prints an email address as the warehouse name', () => {
    expect(printableName('lotode8536@abowned.com')).toBe('');
    expect(printableName(' Main warehouse ')).toBe('Main warehouse');
    expect(printableName(undefined)).toBe('');
  });

  it('reads zones and aisles from spot codes', () => {
    expect(zoneOf('A-01-03-2')).toBe('A');
    expect(zoneOf('B-07')).toBe('B');
    expect(aisleOf('A-01-03-2')).toBe('A-01');
    expect(aisleOf('B-07')).toBeNull();
  });
});
