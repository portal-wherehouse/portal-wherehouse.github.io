import { expect, test } from 'vitest';
import { Harness } from '../../src/lab/harness';
import { blankInfo } from '../../src/domain/receiving';
import { nearWord } from '../../src/domain/search';

test('a pallet can list what is on it; blank lines are dropped and edits need no reprint', () => {
  const h = new Harness();
  const contents = [
    { name: 'Air fryer', qty: '1', sku: 'AF-200' },
    { name: '', qty: '', sku: '' },
    { name: 'Toaster oven', qty: '2', sku: '' },
  ];
  const r = h.cmd(h.users.operator, 'receive', { job_id: '', description: 'Mixed half pallet', receiving: { ...blankInfo(), contents } });
  if (!r.ok) throw new Error(r.message);
  const p = r.current_state!;
  expect(p.receiving?.contents.map((c) => c.name)).toEqual(['Air fryer', 'Toaster oven']);
  const e = h.cmd(h.users.operator, 'edit_details', { receiving: { ...p.receiving, contents: [{ name: 'Air fryer', qty: '3', sku: '' }] } }, p);
  expect(e.ok).toBe(true);
  expect(h.db.pallets[p.id].receiving?.contents[0].qty).toBe('3');
  expect(h.db.pallets[p.id].label_needs_reprint).toBe(p.label_needs_reprint);
  expect(h.cmd(h.users.operator, 'receive', { job_id: '', description: 'Bad', receiving: { ...blankInfo(), contents: [{ name: '', qty: '2', sku: '' }] } }).ok).toBe(false);
});

test('search forgives a typo', () => {
  expect(nearWord('IMPCT', 'IMPACT', 1)).toBe(true);
  expect(nearWord('DWALT', 'DEWALT', 1)).toBe(true);
  expect(nearWord('FRYER', 'FRYERS', 1)).toBe(true);
  expect(nearWord('TOASTR', 'TOASTER', 1)).toBe(true);
  expect(nearWord('CHAIR', 'TABLE', 1)).toBe(false);
  expect(nearWord('REFRIGERATR', 'REFRIGERATOR', 2)).toBe(true);
});

test('a pallet type keeps its home spot, and only a real, active spot can be home', () => {
  const h = new Harness();
  const loc = Object.values(h.db.locations).find((l) => l.workspace_id === h.ws && l.active)!;
  const base = { code: 'PT-HOME1', description: 'Office chairs', create: true };
  expect(h.cmd(h.users.supervisor, 'save_product', { ...base, home_location_id: 'nope' }).ok).toBe(false);
  expect(h.cmd(h.users.supervisor, 'save_product', { ...base, home_location_id: loc.id }).ok).toBe(true);
  const saved = Object.values(h.db.products).find((p) => p.code === 'PT-HOME1')!;
  expect(saved.home_location_id).toBe(loc.id);
  expect(h.cmd(h.users.supervisor, 'save_product', { code: 'PT-HOME1', description: 'Office chairs, black' }).ok).toBe(true);
  expect(h.db.products[saved.id].home_location_id).toBe(loc.id);
});

test('the rack builder makes zone-aisle-bay-level codes', async () => {
  const { buildCodes } = await import('../../src/features/admin/RackBuilder');
  expect(buildCodes('a', 1, 2, 2, 1)).toEqual(['A-01-01', 'A-01-02', 'A-02-01', 'A-02-02']);
  expect(buildCodes('B', 3, 3, 1, 3)).toEqual(['B-03-01-1', 'B-03-01-2', 'B-03-01-3']);
  expect(buildCodes('', 1, 1, 1, 1)).toEqual([]);
});
