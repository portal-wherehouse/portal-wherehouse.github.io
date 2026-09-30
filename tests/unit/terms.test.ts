import { expect, test } from 'vitest';
import { Harness } from '../../src/lab/harness';
import { DEFAULT_SETUP, pluralize, swapWords } from '../../src/domain/terms';

const items = { ...DEFAULT_SETUP, thing: 'Item', things: 'Items', job: 'Order', jobs: 'Orders' };

test('swaps whole words, keeps case, fixes a/an, and leaves codes alone', () => {
  expect(swapWords('Scan a pallet, then its rack', items)).toBe('Scan an item, then its rack');
  expect(swapWords('Pallets waiting · PALLET TYPE', items)).toBe('Items waiting · ITEM TYPE');
  expect(swapWords('Change job for 3 pallets', items)).toBe('Change order for 3 items');
  expect(swapWords('An pallet', { ...items, thing: 'Bundle' })).toBe('A bundle');
  expect(swapWords('JOB-214 and palletized', items)).toBe('JOB-214 and palletized');
  expect(swapWords('Scan a pallet', DEFAULT_SETUP)).toBe('Scan a pallet');
});

test('plurals follow the usual rules', () => {
  expect(pluralize('Box')).toBe('Boxes');
  expect(pluralize('Battery')).toBe('Batteries');
  expect(pluralize('Tote')).toBe('Totes');
});

test('managers set the words; crew cannot; odd words are refused', () => {
  const h = new Harness();
  const setup = { preset: 'items', thing: 'Item', things: 'Items', job: 'Order', jobs: 'Orders', jobs_on: false };
  expect(h.cmd(h.users.operator, 'set_setup', setup).ok).toBe(false);
  expect(h.cmd(h.users.supervisor, 'set_setup', setup).ok).toBe(true);
  const wh = Object.values(h.db.warehouses).find((w) => w.workspace_id === h.ws && w.active)!;
  expect(wh.setup).toMatchObject({ thing: 'Item', jobs_on: false });
  expect(h.cmd(h.users.supervisor, 'set_setup', { ...setup, thing: '<b>' }).ok).toBe(false);
});
