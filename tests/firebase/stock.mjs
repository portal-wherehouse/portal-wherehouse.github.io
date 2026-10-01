import './local-only.mjs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { doc, getDoc, collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';

// Stock: counts per product, Running low on the Dashboard summary, quantity changes with approval, reorder notes and
// dispatch numbers, through the real command function, the summary and count functions, and the Firestore rules.
export async function testStock({ client, ok, issueKey, adminDb }) {
  const boss = await client('st-owner'), worker = await client('st-operator');
  const { workspaceId: A } = await boss.call('createWarehouse', { name: 'Stock main', usageKey: await issueKey(boss.user.email) });
  await adminDb.doc(`licenses/${A}`).update({ features: { multiWarehouse: true, maxWarehouses: 3 } });
  const { workspaceId: B } = await boss.call('createWarehouse', { name: 'Stock overflow', sourceWorkspaceId: A, usageKey: await issueKey(boss.user.email) });
  const envelope = (ws, kind, payload, more = {}) => ({ schema_version: 1, command_id: randomUUID(), workspace_id: ws, kind, payload, ...more });
  const send = (who, ws, kind, payload, more) => who.call('command', envelope(ws, kind, payload, more));
  const must = async (p) => {
    const r = await p;
    assert.equal(r.ok, true, JSON.stringify(r));
    return r;
  };
  const productId = (ws, code) => `p_${encodeURIComponent(ws)}_${encodeURIComponent(code)}`;
  const at = (p) => ({ pallet_id: p.id, expected_version: p.version });
  for (const ws of [A, B]) await must(send(boss, ws, 'invite_member', { name: 'Operator', email: worker.user.email, role: 'OPERATOR' }));
  const rack = await must(send(boss, A, 'create_location', { code: 'A-01-01', kind: 'RACK' }));
  const rackB = await must(send(boss, B, 'create_location', { code: 'B-01-01', kind: 'RACK' }));

  await must(send(boss, A, 'save_product', { code: 'BAT-AA', description: 'AA batteries', unit: 'cases', create: true, min_qty: 3, reorder_qty: 5 }));
  const kept = await must(send(boss, A, 'save_product', { code: 'BAT-AA', description: 'AA batteries, case of 24' }));
  const saved = (await getDoc(doc(worker.db, 'workspaces', A, 'products', kept.target_id))).data();
  assert.equal(saved.min_qty, 3);
  assert.equal(saved.reorder_qty, 5);
  assert.equal(saved.description, 'AA batteries, case of 24');
  ok('a product keeps its minimum and reorder quantity when other details change');

  const units = [];
  for (let i = 0; i < 2; i++) {
    const r = await must(send(worker, A, 'receive', { description: 'AA batteries', receiving: { product_code: 'BAT-AA', quantity: '10', unit: 'cases' } }));
    units.push((await must(send(worker, A, 'place', { location_id: rack.target_id }, at(r.current_state)))).current_state);
  }
  await must(send(worker, B, 'receive', { description: 'AA batteries', receiving: { product_code: 'BAT-AA', quantity: '4', unit: 'cases' } }));
  const id = productId(A, 'BAT-AA');
  const counted = await boss.call('getDirectoryCounts', { workspaceId: A, table: 'products', ids: [id] });
  assert.deepEqual(counted.values[id], { units: 2, qty: 0, held: 0 });
  await assert.rejects(boss.call('getDirectoryCounts', { workspaceId: A, table: 'products', ids: ['p_../x'] }));
  ok('stock per product is counted on the server');

  units[1] = (await must(send(boss, A, 'apply_hold', { reason: 'Leaking' }, at(units[1])))).current_state;
  const withQty = await boss.call('getDirectoryCounts', { workspaceId: A, table: 'products', ids: [id], qty: true });
  assert.deepEqual(withQty.values[id], { units: 1, qty: 10, held: 1 });
  const elsewhere = await boss.call('getDirectoryCounts', { workspaceId: B, table: 'products', ids: [productId(B, 'BAT-AA')], qty: true });
  assert.deepEqual(elsewhere.values[productId(B, 'BAT-AA')], { units: 1, qty: 4, held: 0 });
  ok('pallets on hold are counted apart, and another warehouse counts a product it never saved');

  const summary = await boss.call('getWarehouseSummary', { workspaceId: A });
  assert.equal(summary.stock_version, 1);
  assert.equal(summary.low_stock.length, 1);
  assert.equal(summary.low_stock[0].product.code, 'BAT-AA');
  assert.equal(summary.low_stock[0].on_hand, 1);
  assert.equal(summary.low_stock[0].suggest, 5);
  ok('the Dashboard summary lists products running low');

  assert.equal((await send(worker, A, 'note_reorder', { product_id: id, note: 'PO 1' })).code, 'FORBIDDEN');
  await must(send(boss, A, 'note_reorder', { product_id: id, note: 'PO 4471' }));
  assert.equal((await getDoc(doc(worker.db, 'workspaces', A, 'products', id))).get('reorder_note.note'), 'PO 4471');
  const third = await must(send(worker, A, 'receive', { description: 'AA batteries', receiving: { product_code: 'BAT-AA', quantity: '10', unit: 'cases' } }));
  assert.equal((await getDoc(doc(worker.db, 'workspaces', A, 'products', id))).get('reorder_note'), null);
  ok('a manager notes a reorder, and receiving the product clears it');

  const used = await must(send(worker, A, 'adjust_qty', { reason: 'used', amount: 3, note: 'Shop' }, at(units[0])));
  assert.equal(used.current_state.receiving.quantity, '7');
  const ev = (await getDoc(doc(worker.db, 'workspaces', A, 'events', `${units[0].id}_${used.current_state.version}`))).data();
  assert.equal(ev.type, 'adjust_qty');
  assert.equal(ev.detail.adjust_reason, 'used');
  assert.equal(ev.detail.to_qty, 7);
  ok('an operator records a quantity change with a reason');

  assert.equal((await send(worker, A, 'set_adjust_approval', { on: true })).code, 'FORBIDDEN');
  await must(send(boss, A, 'set_adjust_approval', { on: true }));
  const asked = await must(send(worker, A, 'adjust_qty', { reason: 'damaged', amount: 2 }, at(used.current_state)));
  const waiting = (await getDoc(doc(worker.db, 'workspaces', A, 'pallets', units[0].id))).data();
  assert.equal(waiting.receiving.quantity, '7');
  assert.equal(waiting.pending_adjust.to_qty, 5);
  assert.equal(waiting.has_pending_adjust, true);
  const list = await getDocs(query(collection(boss.db, 'workspaces', A, 'pallets'), where('archived_at', '==', null), where('has_pending_adjust', '==', true), orderBy('code'), limit(100)));
  assert.deepEqual(list.docs.map((d) => d.id), [units[0].id]);
  assert.equal((await send(worker, A, 'review_adjust', { approve: true }, at(asked.current_state))).code, 'FORBIDDEN');
  const approved = await must(send(boss, A, 'review_adjust', { approve: true }, at(asked.current_state)));
  assert.equal(approved.current_state.receiving.quantity, '5');
  assert.equal((await getDoc(doc(worker.db, 'workspaces', A, 'pallets', units[0].id))).get('has_pending_adjust'), false);
  ok("with approval on, an operator's change waits until a manager approves it");

  const first = await must(send(worker, A, 'dispatch', { destination: 'Riverside site', note: 'Truck 4' }, at(approved.current_state)));
  assert.equal(first.current_state.dispatch.ref, 'D-000001');
  assert.equal((await adminDb.doc(`workspaces/${A}/private/seq_D`).get()).get('value'), 1);
  const placedB = (await must(send(boss, A, 'clear_hold', { reason: 'Checked' }, at(units[1])))).current_state;
  await must(send(worker, A, 'dispatch', { destination: 'Riverside site', join_ref: 'D-000001' }, at(placedB)));
  const thirdPlaced = (await must(send(worker, A, 'place', { location_id: rack.target_id }, at(third.current_state)))).current_state;
  const unknown = await send(worker, A, 'dispatch', { destination: 'X', join_ref: 'D-000005' }, at(thirdPlaced));
  assert.equal(unknown.code, 'INVALID_INPUT');
  assert.match(unknown.message, /not a dispatch/);
  const slip = await getDocs(query(collection(worker.db, 'workspaces', A, 'pallets'), where('dispatch.ref', '==', 'D-000001'), orderBy('code'), limit(100)));
  assert.equal(slip.size, 2);
  const other = await must(send(worker, B, 'receive', { description: 'Overflow pallet' }));
  const otherPlaced = await must(send(worker, B, 'place', { location_id: rackB.target_id }, at(other.current_state)));
  assert.equal((await must(send(worker, B, 'dispatch', { destination: 'Depot' }, at(otherPlaced.current_state)))).current_state.dispatch.ref, 'D-000001');
  ok('each send gets a dispatch number per warehouse, pallets can join it, and its slip lists them');
}
