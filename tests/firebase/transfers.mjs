import './local-only.mjs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { doc, getDoc, setDoc, collection, getDocs, query, where, limit } from 'firebase/firestore';

// Transfers between two warehouses of one account, through the real command function and Firestore rules.
export async function testTransfers({ client, ok, issueKey, adminDb }) {
  const boss = await client('tr-owner'), worker = await client('tr-operator'), stranger = await client('tr-stranger');
  const { workspaceId: A } = await boss.call('createWarehouse', { name: 'Transfer main', usageKey: await issueKey(boss.user.email) });
  await adminDb.doc(`licenses/${A}`).update({ features: { multiWarehouse: true, maxWarehouses: 3 } });
  const { workspaceId: B } = await boss.call('createWarehouse', { name: 'Transfer overflow', sourceWorkspaceId: A, usageKey: await issueKey(boss.user.email) });
  const { workspaceId: X } = await stranger.call('createWarehouse', { name: 'Someone else', usageKey: await issueKey(stranger.user.email) });
  const envelope = (ws, kind, payload, more = {}) => ({ schema_version: 1, command_id: randomUUID(), workspace_id: ws, kind, payload, ...more });
  const send = (who, ws, kind, payload, more) => who.call('command', envelope(ws, kind, payload, more));
  const must = async (p) => {
    const r = await p;
    assert.equal(r.ok, true, JSON.stringify(r));
    return r;
  };
  for (const ws of [A, B]) await must(send(boss, ws, 'invite_member', { name: 'Operator', email: worker.user.email, role: 'OPERATOR' }));
  const jobA = await must(send(boss, A, 'create_job', { code: 'J-1', name: 'Shared job' }));
  await must(send(boss, B, 'create_job', { code: 'J-1', name: 'Shared job' }));
  const rackA = await must(send(boss, A, 'create_location', { code: 'A-01-01', kind: 'RACK' }));
  const dock = await must(send(boss, B, 'create_location', { code: 'RCV-01', kind: 'RECEIVING' }));
  const pallets = [];
  for (let i = 1; i <= 3; i++) {
    const r = await must(send(worker, A, 'receive', { job_id: jobA.target_id, description: `Transfer pallet ${i}` }));
    let p = r.current_state;
    if (i < 3) p = (await must(send(worker, A, 'place', { location_id: rackA.target_id }, { pallet_id: p.id, expected_version: p.version }))).current_state;
    pallets.push(p);
  }
  const line = (p) => ({ pallet_id: p.id, expected_version: p.version });

  const foreign = await send(boss, A, 'create_transfer', { to_workspace_id: X, lines: [line(pallets[0])], send: true });
  assert.equal(foreign.code, 'NOT_FOUND');
  assert.equal((await getDoc(doc(boss.db, 'workspaces', A, 'pallets', pallets[0].id))).get('state'), 'STORED');
  ok('a transfer cannot reach a warehouse of another account');

  const stale = await send(worker, A, 'create_transfer', { to_workspace_id: B, lines: [{ pallet_id: pallets[0].id, expected_version: pallets[0].version - 1 }], send: true });
  assert.equal(stale.code, 'VERSION_CONFLICT');
  ok('a transfer rejects a pallet that changed since it was picked');

  const created = await must(send(worker, A, 'create_transfer', { to_workspace_id: B, lines: [line(pallets[0]), line(pallets[1])], note: 'Truck 4', send: true }));
  const id = created.target_id;
  const atA = (await getDoc(doc(worker.db, 'workspaces', A, 'transfers', id))).data();
  const atB = (await getDoc(doc(worker.db, 'workspaces', B, 'transfers', id))).data();
  assert.equal(atA.number, 'TR-0001');
  assert.deepEqual(atA, atB);
  assert.equal(atA.status, 'IN_TRANSIT');
  const sent = (await getDoc(doc(worker.db, 'workspaces', A, 'pallets', pallets[0].id))).data();
  assert.equal(sent.state, 'IN_TRANSIT');
  assert.equal(sent.current_location_id, null);
  assert.equal(sent.transfer.number, 'TR-0001');
  assert.equal((await getDoc(doc(worker.db, 'workspaces', A, 'locations', rackA.target_id))).get('load_pallets'), 0);
  const scanned = await getDocs(query(collection(worker.db, 'workspaces', B, 'transfers'), where('keys', 'array-contains', pallets[0].code), limit(5)));
  assert.equal(scanned.size, 1);
  ok('sending puts pallets in transit, off their spots, with the same transfer in both warehouses');

  await assert.rejects(getDoc(doc(stranger.db, 'workspaces', B, 'transfers', id)));
  await assert.rejects(setDoc(doc(boss.db, 'workspaces', B, 'transfers', id), { status: 'RECEIVED' }));
  await assert.rejects(getDoc(doc(boss.db, 'transferCounters', boss.user.uid)));
  ok('transfers are member-read-only; clients cannot write them or read the counter');

  const early = await send(worker, A, 'cancel_transfer', { transfer_id: id, reason: 'Wrong truck' }, { expected_version: atA.version });
  assert.equal(early.code, 'FORBIDDEN');
  ok('an operator cannot cancel a transfer that was sent');

  const conflict = await send(worker, B, 'receive_transfer', { transfer_id: id, location_id: dock.target_id }, { pallet_id: pallets[0].id, expected_version: atB.lines[0].version - 1 });
  assert.equal(conflict.code, 'VERSION_CONFLICT');
  await must(send(worker, B, 'receive_transfer', { transfer_id: id, location_id: dock.target_id }, { pallet_id: pallets[0].id, expected_version: atB.lines[0].version }));
  const moved = (await getDoc(doc(worker.db, 'workspaces', B, 'pallets', pallets[0].id))).data();
  assert.equal(moved.workspace_id, B);
  assert.equal(moved.code, pallets[0].code);
  assert.equal(moved.state, 'STORED');
  assert.equal(moved.current_location_id, dock.target_id);
  assert.ok(moved.job_id, 'the job with the same code is kept');
  assert.equal((await adminDb.doc(`workspaces/${A}/pallets/${pallets[0].id}`).get()).exists, false);
  const history = await getDocs(query(collection(worker.db, 'workspaces', B, 'events'), where('pallet_id', '==', pallets[0].id), limit(50)));
  const types = history.docs.map((d) => d.get('type'));
  for (const t of ['receive', 'place', 'transfer_send', 'transfer_receive']) assert.ok(types.includes(t), `${t} in ${types}`);
  const labels = await getDocs(query(collection(worker.db, 'workspaces', B, 'labels'), where('target_id', '==', pallets[0].id), limit(5)));
  assert.equal(labels.size, 1);
  const partly = (await getDoc(doc(worker.db, 'workspaces', A, 'transfers', id))).data();
  assert.equal(partly.status, 'PARTLY_RECEIVED');
  assert.deepEqual(partly, (await getDoc(doc(worker.db, 'workspaces', B, 'transfers', id))).data());
  const again = await send(worker, B, 'receive_transfer', { transfer_id: id }, { pallet_id: pallets[0].id, expected_version: moved.version });
  assert.equal(again.code, 'INVALID_STATE');
  ok('receiving moves the pallet record, label and history to the destination; both copies show partly received');

  const cancelled = await must(send(boss, A, 'cancel_transfer', { transfer_id: id, reason: 'Second truck cancelled' }, { expected_version: partly.version }));
  assert.equal(cancelled.ok, true);
  const back = (await getDoc(doc(boss.db, 'workspaces', A, 'pallets', pallets[1].id))).data();
  assert.equal(back.state, 'STORED');
  assert.equal(back.current_location_id, rackA.target_id);
  assert.equal((await getDoc(doc(boss.db, 'workspaces', B, 'transfers', id))).get('status'), 'CANCELLED');
  ok('an owner cancels with a reason: pallets not received return to their spot, received ones stay');

  const now = envelope(A, 'transfer_now', { to_workspace_id: B, lines: [line(pallets[2])] });
  const direct = await worker.call('command', now);
  assert.equal(direct.ok, true, JSON.stringify(direct));
  const replay = await worker.call('command', now);
  assert.equal(replay.target_id, direct.target_id);
  const second = (await getDoc(doc(worker.db, 'workspaces', B, 'transfers', direct.target_id))).data();
  assert.equal(second.number, 'TR-0002');
  assert.equal(second.status, 'RECEIVED');
  const arrived = (await getDoc(doc(worker.db, 'workspaces', B, 'pallets', pallets[2].id))).data();
  assert.equal(arrived.state, 'RECEIVED');
  assert.equal((await adminDb.doc(`workspaces/${A}/pallets/${pallets[2].id}`).get()).exists, false);
  assert.equal((await adminDb.doc(`transferCounters/${boss.user.uid}`).get()).get('value'), 2);
  const nowHistory = await getDocs(query(collection(worker.db, 'workspaces', B, 'events'), where('pallet_id', '==', pallets[2].id), limit(50)));
  assert.ok(nowHistory.docs.some((d) => d.get('type') === 'transfer_send'));
  ok('transfer now sends and receives in one step, numbers per account, and a retry does not repeat it');

  // Pick a transfer as an order: the order lives at the sending warehouse, and handing it off sends the transfer.
  const readAt = async (who, ws, table, docId) => (await getDoc(doc(who.db, 'workspaces', ws, table, docId))).data();
  const loose = [];
  for (let i = 1; i <= 2; i++) {
    const r = await must(send(worker, A, 'receive', { description: `Order transfer pallet ${i}` }));
    loose.push((await must(send(worker, A, 'place', { location_id: rackA.target_id }, { pallet_id: r.current_state.id, expected_version: r.current_state.version }))).current_state);
  }
  const draftId = (await must(send(worker, A, 'create_transfer', { to_workspace_id: B, lines: loose.map(line) }))).target_id;
  let draftAt = await readAt(boss, A, 'transfers', draftId);
  assert.equal((await send(worker, A, 'pick_transfer', { transfer_id: draftId }, { expected_version: draftAt.version })).code, 'FORBIDDEN');
  // Picking is on by default now; an owner who turned it off gets a clear refusal.
  await must(send(boss, A, 'set_orders', { on: false, cart_size: 4, box_types: ['Pallet wrap'], subs: 'never' }));
  draftAt = await readAt(boss, A, 'transfers', draftId);
  const ordersOff = await send(boss, A, 'pick_transfer', { transfer_id: draftId }, { expected_version: draftAt.version });
  assert.equal(ordersOff.code, 'INVALID_STATE');
  assert.match(ordersOff.message, /Orders and picking is off/);
  await must(send(boss, A, 'set_orders', { on: true, cart_size: 4, box_types: ['Pallet wrap'], subs: 'never' }));
  const asOrder = await must(send(boss, A, 'pick_transfer', { transfer_id: draftId }, { expected_version: draftAt.version }));
  const trOrderId = asOrder.created_ids[0];
  let trOrder = await readAt(worker, A, 'orders', trOrderId);
  assert.equal(trOrder.code, 'O-000001');
  assert.equal(trOrder.customer.name, 'Transfer overflow');
  assert.equal(trOrder.transfer.id, draftId);
  draftAt = await readAt(worker, A, 'transfers', draftId);
  assert.deepEqual(draftAt.order, { id: trOrderId, code: 'O-000001' });
  assert.deepEqual(draftAt, await readAt(worker, B, 'transfers', draftId));
  assert.equal((await adminDb.doc(`workspaces/${A}/private/seq_O`).get()).get('value'), 1);
  assert.equal((await send(worker, A, 'send_transfer', { transfer_id: draftId }, { expected_version: draftAt.version })).code, 'INVALID_STATE');
  ok('a manager picks a draft transfer as an order for the other warehouse, once orders are on; both copies link it');

  const trBatchId = (await must(send(worker, A, 'start_batch', {}))).target_id;
  let trBatch = await readAt(worker, A, 'batches', trBatchId);
  assert.deepEqual(trBatch.stops.map((s) => s.pallet_id).sort(), loose.map((p) => p.id).sort());
  for (const s of trBatch.stops) {
    const u = await readAt(worker, A, 'pallets', s.suggested[0].pallet_id);
    await must(send(worker, A, 'pick', { batch_id: trBatchId, stop_key: s.key }, { pallet_id: u.id, expected_version: u.version }));
  }
  await must(send(worker, A, 'finish_batch', { batch_id: trBatchId, reason: '' }));
  trOrder = await readAt(worker, A, 'orders', trOrderId);
  const trPkg = await must(send(worker, A, 'pack', { order_id: trOrderId, unit_ids: trOrder.lines.flatMap((l) => l.units.map((u) => u.pallet_id)), box_type: 'Pallet wrap' }));
  trOrder = await readAt(worker, A, 'orders', trOrderId);
  assert.equal(trOrder.status, 'PACKED');
  assert.equal((await send(worker, A, 'hand_off', { order_id: trOrderId, package_ids: [trPkg.target_id], carrier: 'Own truck' }, { expected_version: trOrder.version })).code, 'INVALID_STATE');
  const handoff = envelope(A, 'hand_off_transfer', { transfer_id: draftId, order_id: trOrderId, package_ids: [trPkg.target_id], carrier: 'Own truck' }, { expected_version: trOrder.version });
  const handed = await worker.call('command', handoff);
  assert.equal(handed.ok, true, JSON.stringify(handed));
  assert.equal((await worker.call('command', handoff)).target_id, handed.target_id);
  const shipped = await readAt(worker, A, 'transfers', draftId);
  assert.equal(shipped.status, 'IN_TRANSIT');
  assert.deepEqual(shipped, await readAt(worker, B, 'transfers', draftId));
  assert.deepEqual(shipped.lines.map((l) => l.from_location_code), ['A-01-01', 'A-01-01']);
  assert.equal((await readAt(worker, A, 'orders', trOrderId)).status, 'DONE');
  assert.equal((await readAt(worker, A, 'packages', trPkg.target_id)).status, 'HANDED_OFF');
  for (const p of loose) {
    const now = await readAt(worker, A, 'pallets', p.id);
    assert.equal(now.state, 'IN_TRANSIT');
    assert.equal(now.order, null);
    assert.equal(now.transfer.id, draftId);
  }
  const arriving = shipped.lines[0];
  await must(send(worker, B, 'receive_transfer', { transfer_id: draftId, location_id: dock.target_id }, { pallet_id: arriving.pallet_id, expected_version: arriving.version }));
  assert.equal((await readAt(worker, B, 'pallets', arriving.pallet_id)).state, 'STORED');
  ok('picking, packing and handing off the order sends the transfer in both warehouses, once; the other end receives it');
}
