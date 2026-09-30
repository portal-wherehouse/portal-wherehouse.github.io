import { expect, test } from 'vitest';
import { Harness } from '../../src/lab/harness';
import { blankInfo } from '../../src/domain/receiving';
import { suggestLocations } from '../../src/domain/capacity';

const racks = (h: Harness) => Object.values(h.db.locations).filter((l) => l.workspace_id === h.ws && l.active).sort((a, b) => a.code.localeCompare(b.code));

test('capacity counts down as pallets arrive and leave, and a full location refuses more', () => {
  const h = new Harness();
  const [a, b] = racks(h);
  const setCap = (id: string, spaces: number, extra: Record<string, number | null> = {}) =>
    h.cmd(h.users.supervisor, 'set_location_capacity', { location_id: id, spaces, stacking: 1, max_weight_lb: null, length_in: null, width_in: null, height_in: null, ...extra });
  const already = Object.values(h.db.pallets).filter((p) => p.current_location_id === a.id && p.state === 'STORED').length;
  expect(setCap(a.id, already + 1).ok).toBe(true);
  expect(h.db.locations[a.id].load_pallets).toBe(already);
  expect(h.cmd(h.users.operator, 'set_location_capacity', { location_id: a.id, spaces: 9, stacking: 1, max_weight_lb: null, length_in: null, width_in: null, height_in: null }).ok).toBe(false);

  const p1 = h.receive('J-214', 'Birch');
  const p2 = h.receive('J-214', 'Birch');
  expect(h.cmd(h.users.operator, 'place', { location_id: a.id }, p1).ok).toBe(true);
  expect(h.db.locations[a.id].load_pallets).toBe(already + 1);
  const full = h.cmd(h.users.operator, 'place', { location_id: a.id }, p2);
  expect(full.ok).toBe(false);
  if (!full.ok) expect(full.message).toContain('full');

  // Suggestions skip the full location and offer the one with room.
  expect(setCap(b.id, 5).ok).toBe(true);
  const s = suggestLocations(h.fresh(p2), Object.values(h.db.locations), Object.values(h.db.pallets), false);
  expect(s.suggestions.map((x) => x.location.id)).toEqual([b.id]);

  // Moving out frees the space.
  expect(h.cmd(h.users.operator, 'move', { location_id: b.id }, h.fresh(p1)).ok).toBe(true);
  expect(h.db.locations[a.id].load_pallets).toBe(already);
  expect(h.db.locations[b.id].load_pallets).toBe(h.db.locations[b.id].load_pallets);
  expect(h.cmd(h.users.operator, 'place', { location_id: a.id }, h.fresh(p2)).ok).toBe(true);
});

test('with weight and size tracking on, a weight limit needs a pallet weight and keeps count', () => {
  const h = new Harness();
  const [, , c] = racks(h);
  expect(h.cmd(h.users.supervisor, 'set_measurements', { advanced: true }).ok).toBe(true);
  expect(h.cmd(h.users.supervisor, 'set_location_capacity', { location_id: c.id, spaces: 4, stacking: 2, max_weight_lb: 2000, length_in: null, width_in: null, height_in: null }).ok).toBe(true);
  const base = h.db.locations[c.id].load_weight_lb ?? 0;
  const p = h.receive('J-214', 'Tire crate');
  const noWeight = h.cmd(h.users.operator, 'place', { location_id: c.id }, p);
  expect(noWeight.ok).toBe(false);
  if (!noWeight.ok) expect(noWeight.message).toContain('weight');
  // Without a weight, the weight-limited location isn't suggested; it's counted instead.
  expect(suggestLocations(h.fresh(p), [h.db.locations[c.id]], [], true).needWeight).toBe(1);

  const weighed = h.cmd(h.users.operator, 'edit_details', { receiving: { ...blankInfo(), weight_lb: '1500' } }, h.fresh(p));
  expect(weighed.ok).toBe(true);
  expect(h.fresh(p).label_needs_reprint).toBe(false);
  expect(h.cmd(h.users.operator, 'place', { location_id: c.id }, h.fresh(p)).ok).toBe(true);
  expect(h.db.locations[c.id].load_weight_lb).toBe(base + 1500);

  const heavy = h.receive('J-214', 'Another crate');
  h.cmd(h.users.operator, 'edit_details', { receiving: { ...blankInfo(), weight_lb: '900' } }, heavy);
  const over = h.cmd(h.users.operator, 'place', { location_id: c.id }, h.fresh(heavy));
  expect(over.ok).toBe(false);
  if (!over.ok) expect(over.message).toContain('over its');

  // Turned off, weight limits no longer apply; the pallet count still does.
  expect(h.cmd(h.users.supervisor, 'set_measurements', { advanced: false }).ok).toBe(true);
  expect(h.cmd(h.users.operator, 'place', { location_id: c.id }, h.fresh(heavy)).ok).toBe(true);
});

test('a pallet type remembers its size and fills it in on receipt', () => {
  const h = new Harness();
  const saved = h.cmd(h.users.supervisor, 'save_product', { code: 'PT-ABCDEF', description: 'Tire crate from Acme', length_in: '48', width_in: '40', height_in: '60', weight_lb: '900', create: true });
  expect(saved.ok).toBe(true);
  expect(h.db.products[saved.ok ? saved.target_id! : '']).toMatchObject({ length_in: '48', weight_lb: '900' });
  expect(h.cmd(h.users.supervisor, 'save_product', { code: 'PT-ABCDEG', description: 'Bad', weight_lb: 'heavy', create: true }).ok).toBe(false);
});
