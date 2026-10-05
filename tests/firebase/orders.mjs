import './local-only.mjs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { doc, getDoc, setDoc, collection, getDocs, query, where, limit } from 'firebase/firestore';

// Orders and picking through the real command function and Firestore rules: an order from creation to handoff,
// roles, a version conflict, and member-read-only records.
export async function testOrders({ client, ok, issueKey, adminDb }) {
  const boss = await client('or-owner'), picker = await client('or-operator'), stranger = await client('or-stranger');
  const { workspaceId: W } = await boss.call('createWarehouse', { name: 'Orders warehouse', usageKey: await issueKey(boss.user.email) });
  const envelope = (kind, payload, more = {}) => ({ schema_version: 1, command_id: randomUUID(), workspace_id: W, kind, payload, ...more });
  const send = (who, kind, payload, more) => who.call('command', envelope(kind, payload, more));
  const must = async (p) => {
    const r = await p;
    assert.equal(r.ok, true, JSON.stringify(r));
    return r;
  };
  const read = async (who, table, id) => (await getDoc(doc(who.db, 'workspaces', W, table, id))).data();
  await must(send(boss, 'invite_member', { name: 'Picker', email: picker.user.email, role: 'OPERATOR' }));

  // A warehouse with no saved setting (every warehouse made before the setting existed) picks orders.
  const whDoc = (await adminDb.collection('workspaces').doc(W).collection('warehouses').get()).docs[0].data();
  assert.equal(whDoc.orders, undefined);
  const early = await send(boss, 'create_order', { customer: { name: 'Early' }, method: 'ship', allow_subs: false, lines: [{ product_code: 'SKU-1', qty: 1 }] });
  assert.equal(early.code, 'INVALID_INPUT');
  assert.match(early.message, /No product with barcode or SKU SKU-1/);
  ok('a warehouse with no saved orders setting has orders and picking on');
  await must(send(boss, 'set_orders', { on: false, cart_size: 4, box_types: ['Small box'], subs: 'ask' }));
  const off = await send(boss, 'create_order', { customer: { name: 'Early' }, method: 'ship', allow_subs: false, lines: [{ product_code: 'SKU-1', qty: 1 }] });
  assert.equal(off.code, 'INVALID_STATE');
  assert.match(off.message, /Orders and picking is off/);
  const notOwner = await send(picker, 'set_orders', { on: true, cart_size: 4, box_types: ['Small box'], subs: 'ask' });
  assert.equal(notOwner.code, 'FORBIDDEN');
  await must(send(boss, 'set_orders', { on: true, cart_size: 4, box_types: ['Small box', 'Mailer'], subs: 'ask' }));
  ok('an owner turns orders off and back on; others cannot');

  const rack1 = await must(send(boss, 'create_location', { code: 'A-01', kind: 'RACK' }));
  const rack2 = await must(send(boss, 'create_location', { code: 'A-02', kind: 'RACK' }));
  const stage = await must(send(boss, 'create_location', { code: 'STAGING-01', kind: 'STAGING' }));
  await must(send(boss, 'save_product', { code: '012345678905', description: 'Test widget', create: true }));
  const units = [];
  for (const [i, loc] of [[1, rack1], [2, rack2], [3, rack2]]) {
    const r = await must(send(picker, 'receive', { description: `Widget ${i}`, receiving: { product_code: '012345678905', quantity: '1' } }));
    units.push((await must(send(picker, 'place', { location_id: loc.target_id }, { pallet_id: r.current_state.id, expected_version: r.current_state.version }))).current_state);
  }

  const asOperator = await send(picker, 'create_order', { customer: { name: 'Ann' }, method: 'ship', allow_subs: false, lines: [{ product_code: '012345678905', qty: 2 }] });
  assert.equal(asOperator.code, 'FORBIDDEN');
  // The GTIN as 13 digits finds the product saved as 12.
  const created = await must(send(boss, 'create_order', { external_ref: 'WEB-1', customer: { name: 'Ann', address: '1 Main St' }, method: 'ship', allow_subs: false, lines: [{ product_code: '0012345678905', qty: 2 }] }));
  const orderId = created.target_id;
  let order = await read(picker, 'orders', orderId);
  assert.equal(order.code, 'O-000001');
  assert.equal(order.lines[0].description, 'Test widget');
  const dup = await send(boss, 'create_order', { external_ref: 'WEB-1', customer: { name: 'Ann' }, method: 'ship', allow_subs: false, lines: [{ product_code: '012345678905', qty: 1 }] });
  assert.equal(dup.code, 'INVALID_INPUT');
  ok('managers create orders from saved products; operators cannot; store order numbers are unique');

  const batchId = (await must(send(picker, 'start_batch', {}))).target_id;
  let batch = await read(picker, 'batches', batchId);
  assert.equal(batch.code, 'B-0001');
  assert.deepEqual(batch.stops.map((s) => [s.location_code, s.qty]), [['A-01', 1], ['A-02', 1]]);
  assert.equal((await read(picker, 'orders', orderId)).status, 'PICKING');
  await must(send(picker, 'assign_tote', { batch_id: batchId, letter: 'A', tote_code: 'T-05' }));
  ok('a batch takes the queued order and walks its stops in spot order');

  const stop0 = batch.stops[0];
  const u0 = await read(picker, 'pallets', stop0.suggested[0].pallet_id);
  const stale = await send(picker, 'pick', { batch_id: batchId, stop_key: stop0.key }, { pallet_id: u0.id, expected_version: u0.version - 1 });
  assert.equal(stale.code, 'VERSION_CONFLICT');
  await must(send(picker, 'pick', { batch_id: batchId, stop_key: stop0.key }, { pallet_id: u0.id, expected_version: u0.version }));
  const picked = await read(picker, 'pallets', u0.id);
  assert.equal(picked.state, 'PICKED');
  assert.equal(picked.current_location_id, null);
  assert.equal(picked.order.tote_code, 'T-05');
  assert.equal((await read(picker, 'locations', rack1.target_id)).load_pallets, 0);
  // The second stop's unit is not there: the third widget, on the same spot, is not suggested again.
  batch = await read(picker, 'batches', batchId);
  const stop1 = batch.stops[1];
  await must(send(picker, 'short_pick', { batch_id: batchId, stop_key: stop1.key, reason: 'damaged' }));
  batch = await read(picker, 'batches', batchId);
  const extra = batch.stops.find((s) => s.status === 'open');
  assert.ok(extra, 'the rest is found on another unit');
  const u2 = await read(picker, 'pallets', extra.suggested[0].pallet_id);
  await must(send(picker, 'pick', { batch_id: batchId, stop_key: extra.key }, { pallet_id: u2.id, expected_version: u2.version }));
  await must(send(picker, 'finish_batch', { batch_id: batchId, reason: '' }));
  assert.equal((await read(picker, 'orders', orderId)).status, 'PICKED');
  const held = units.find((u) => u.id === stop1.suggested[0].pallet_id);
  assert.ok((await read(picker, 'pallets', held.id)).hold, 'the damaged unit is put on hold');
  ok('picks move units into the tote with version checks; a damaged unit is held and replaced');

  order = await read(picker, 'orders', orderId);
  const unitIds = order.lines[0].units.map((u) => u.pallet_id);
  const pk = await must(send(picker, 'pack', { order_id: orderId, unit_ids: unitIds, box_type: 'Mailer', weight_lb: 2 }));
  const pkg = await read(picker, 'packages', pk.target_id);
  assert.equal(pkg.code, 'K-000001');
  const notStaging = await send(picker, 'stage_package', { package_id: pkg.id, location_id: rack1.target_id });
  assert.equal(notStaging.code, 'INVALID_INPUT');
  await must(send(picker, 'stage_package', { package_id: pkg.id, location_id: stage.target_id }));
  order = await read(picker, 'orders', orderId);
  assert.equal(order.status, 'STAGED');
  ok('packing makes a package; staging takes a staging spot only');

  const old = await send(picker, 'hand_off', { order_id: orderId, package_ids: [pkg.id], carrier: 'UPS' }, { expected_version: order.version - 1 });
  assert.equal(old.code, 'VERSION_CONFLICT');
  await must(send(picker, 'hand_off', { order_id: orderId, package_ids: [pkg.id], carrier: 'UPS', tracking: '1Z' }, { expected_version: order.version }));
  for (const id of unitIds) assert.equal((await read(picker, 'pallets', id)).state, 'DISPATCHED');
  assert.equal((await read(picker, 'orders', orderId)).status, 'DONE');
  assert.equal((await read(picker, 'packages', pkg.id)).status, 'HANDED_OFF');
  const history = await getDocs(query(collection(picker.db, 'workspaces', W, 'events'), where('pallet_id', '==', unitIds[0]), limit(20)));
  const types = history.docs.map((d) => d.get('type'));
  for (const t of ['receive', 'place', 'pick', 'pack', 'hand_off']) assert.ok(types.includes(t), `${t} in ${types}`);
  ok('the handoff dispatches every unit, with pick, pack and handoff in each history');

  const open = await getDocs(query(collection(picker.db, 'workspaces', W, 'orders'), where('status', 'in', ['DONE', 'CANCELLED']), limit(20)));
  assert.equal(open.size, 1);
  await assert.rejects(getDocs(query(collection(picker.db, 'workspaces', W, 'orders'))));
  await assert.rejects(getDoc(doc(stranger.db, 'workspaces', W, 'orders', orderId)));
  await assert.rejects(setDoc(doc(boss.db, 'workspaces', W, 'orders', orderId), { status: 'OPEN' }));
  await assert.rejects(setDoc(doc(boss.db, 'workspaces', W, 'batches', batchId), { status: 'PICKING' }));
  await assert.rejects(getDoc(doc(boss.db, 'workspaces', W, 'private', 'seq_O')));
  assert.equal((await adminDb.doc(`workspaces/${W}/private/seq_O`).get()).get('value'), 1);
  assert.equal((await adminDb.doc(`workspaces/${W}/private/seq_K`).get()).get('value'), 1);
  ok('orders, batches and packages are member-read-only, with bounded lists and private counters');
}
