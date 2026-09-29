// Fictional Northfield Builders shift. This validates software behavior, not customer ROI.
import { expect, test } from 'vitest';
import { Harness } from '../../src/lab/harness';

test('simulated warehouse shift: 24 pallets across 3 jobs retain identity and traceable locations', () => {
  const h = new Harness();
  const jobCodes = ['J-198', 'J-203', 'J-214'];
  const pallets = Array.from({ length: 24 }, (_, i) => h.receive(jobCodes[i % 3], `Pilot delivery ${i + 1}`));
  expect(new Set(pallets.map(p => p.code)).size).toBe(24);
  for (const [i, pallet] of pallets.entries()) {
    expect(h.cmd(h.users.operator, 'place', { location_id: h.loc('A-03-02').id }, pallet).ok).toBe(true);
    const intent = h.envelope('move', { location_id: h.loc('B-01-01').id }, h.fresh(pallet));
    expect(h.engine.execute(h.users.operator, intent).ok).toBe(true);
    // A repeated scan/request must not create a second move.
    const repeated = h.engine.execute(h.users.operator, intent);
    expect(repeated.ok && repeated.replayed).toBe(true);
    expect(h.events(pallet)).toHaveLength(3);
    expect(h.fresh(pallet).job_id).toBe(h.job(jobCodes[i % 3]).id);
    if (i < 12) {
      expect(h.cmd(h.users.operator, 'dispatch', { destination: `Site for ${jobCodes[i % 3]}` }, h.fresh(pallet)).ok).toBe(true);
      expect(h.fresh(pallet).current_location_id).toBe(null);
    }
    if (i < 3) {
      expect(h.cmd(h.users.operator, 'return', { condition_note: 'Unused material returned' }, h.fresh(pallet)).ok).toBe(true);
      expect(h.cmd(h.users.operator, 'place', { location_id: h.loc('A-02-01').id }, h.fresh(pallet)).ok).toBe(true);
      expect(h.events(pallet)).toHaveLength(6);
    }
  }
  const final = pallets.map(p => h.fresh(p));
  expect(final.filter(p => p.state === 'STORED')).toHaveLength(15);
  expect(final.filter(p => p.state === 'DISPATCHED')).toHaveLength(9);
  expect(pallets.reduce((n, p) => n + h.events(p).length, 0)).toBe(90);
  // An unscanned move cannot update software; physical verification is still required.
  expect(h.fresh(pallets[23]).current_location_id).toBe(h.loc('B-01-01').id);
});
