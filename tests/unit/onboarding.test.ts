import { expect, test } from 'vitest';
import { Harness } from '../../src/lab/harness';

const progress = { done: ['words'], zones: [{ letter: 'A', name: 'Main racks', kind: 'RACK' }], leave: null, files: null, barcodes: null };

test('managers can skip the setup checklist, and a late progress save does not lock it again', () => {
  const h = new Harness();
  const wh = () => Object.values(h.db.warehouses).find((w) => w.workspace_id === h.ws && w.active)!;
  expect(h.cmd(h.users.supervisor, 'set_onboarding', { ...progress, state: 'pending' }).ok).toBe(true);
  expect(h.cmd(h.users.operator, 'set_onboarding', { ...progress, state: 'skipped' }).ok).toBe(false);
  expect(h.cmd(h.users.supervisor, 'set_onboarding', { ...progress, state: 'skipped' }).ok).toBe(true);
  expect(wh().onboarding?.state).toBe('skipped');
  expect(h.cmd(h.users.supervisor, 'set_onboarding', { ...progress, done: ['words', 'zones'], state: 'pending' }).ok).toBe(true);
  expect(wh().onboarding).toMatchObject({ state: 'skipped', done: ['words', 'zones'] });
  expect(h.cmd(h.users.supervisor, 'set_onboarding', { ...progress, state: 'done' }).ok).toBe(true);
  expect(wh().onboarding?.state).toBe('done');
  expect(h.cmd(h.users.supervisor, 'set_onboarding', { ...progress, state: 'later' }).ok).toBe(false);
});
