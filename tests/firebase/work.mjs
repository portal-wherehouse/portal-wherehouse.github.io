import './local-only.mjs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { doc, getDoc, collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';

// Scheduled counts, move tasks, lots and expiry, returns with a condition and warehouse access per person, through the
// real command function and the Firestore rules.
export async function testWork({ client, ok, issueKey, adminDb }) {
  const boss = await client('wk-owner'),
    crew = await client('wk-operator'),
    lead = await client('wk-manager');
  const { workspaceId: A } = await boss.call('createWarehouse', { name: 'Work main', usageKey: await issueKey(boss.user.email) });
  await adminDb.doc(`licenses/${A}`).update({ features: { multiWarehouse: true, maxWarehouses: 3 } });
  const { workspaceId: B } = await boss.call('createWarehouse', { name: 'Work overflow', sourceWorkspaceId: A, usageKey: await issueKey(boss.user.email) });
  const envelope = (ws, kind, payload, more = {}) => ({ schema_version: 1, command_id: randomUUID(), workspace_id: ws, kind, payload, ...more });
  const send = (who, ws, kind, payload, more) => who.call('command', envelope(ws, kind, payload, more));
  const must = async (p) => {
    const r = await p;
    assert.equal(r.ok, true, JSON.stringify(r));
    return r;
  };
  const at = (p) => ({ pallet_id: p.id, expected_version: p.version });
  for (const ws of [A, B]) {
    await must(send(boss, ws, 'invite_member', { name: 'Operator', email: crew.user.email, role: 'OPERATOR' }));
    await must(send(boss, ws, 'invite_member', { name: 'Manager', email: lead.user.email, role: 'SUPERVISOR' }));
  }
  const spot = async (code, kind = 'RACK') => (await must(send(boss, A, 'create_location', { code, kind }))).target_id;
  const b1 = await spot('B-01-01'),
    b2 = await spot('B-02-01'),
    q1 = await spot('QUARANTINE-01', 'QUARANTINE');
  const today = new Date().toISOString().slice(0, 10);
  const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

  // ---------------------------------------------------------------- lots and expiry
  assert.equal((await send(crew, A, 'set_lots', { on: true })).code, 'FORBIDDEN');
  await must(send(lead, A, 'set_lots', { on: true }));
  const units = [];
  for (const [lot, days, where_] of [['L-1', -3, b1], ['L-2', 10, b1], ['L-3', 90, b2]]) {
    const r = await must(send(crew, A, 'receive', { description: 'Sanitizer', receiving: { product_code: 'SAN-1', lot, expires_on: day(days) } }));
    units.push((await must(send(crew, A, 'place', { location_id: where_ }, at(r.current_state)))).current_state);
  }
  const soon = await getDocs(query(collection(crew.db, 'workspaces', A, 'pallets'), where('expiry_due', '<=', day(30)), orderBy('expiry_due'), limit(100)));
  assert.deepEqual(soon.docs.map((d) => d.get('receiving.lot')), ['L-1', 'L-2']);
  ok('lot and expiry are saved on receive, and Expiring soon lists what expires in 30 days or already expired');

  // ---------------------------------------------------------------- move tasks
  assert.equal((await send(crew, A, 'queue_moves', { lines: [{ pallet_id: units[0].id, to_location_id: q1 }] })).code, 'FORBIDDEN');
  const queued = await must(send(lead, A, 'queue_moves', { lines: [{ pallet_id: units[0].id, to_location_id: q1 }], assigned_to: crew.user.uid, note: 'Expired' }));
  const taskId = queued.created_ids[0];
  const open = await getDocs(query(collection(crew.db, 'workspaces', A, 'tasks'), where('status', '==', 'OPEN'), limit(100)));
  assert.deepEqual(open.docs.map((d) => d.id), [taskId]);
  units[0] = (await must(send(crew, A, 'move', { location_id: q1 }, at(units[0])))).current_state;
  const done = (await getDoc(doc(crew.db, 'workspaces', A, 'tasks', taskId))).data();
  assert.equal(done.status, 'DONE');
  assert.equal(done.done_location_code, 'QUARANTINE-01');
  ok('a manager queues a move, and the crew member moving the pallet completes it in the same save');

  // ---------------------------------------------------------------- scheduled counts
  assert.equal((await send(crew, A, 'schedule_count', { scope: 'zone', zone: 'B', assigned_to: crew.user.uid, due_on: today, repeat: 'none' })).code, 'FORBIDDEN');
  const scheduled = await must(send(lead, A, 'schedule_count', { scope: 'zone', zone: 'B', assigned_to: crew.user.uid, due_on: today, repeat: 'weekly' }));
  let count = (await getDoc(doc(crew.db, 'workspaces', A, 'counts', scheduled.target_id))).data();
  assert.deepEqual(count.location_codes, ['B-01-01', 'B-02-01']);
  // L-2 is not found on B-01-01.
  const spots = [
    { location_id: b1, pallet_ids: [], unknown: ['NOT-A-CODE'] },
    { location_id: b2, pallet_ids: [units[2].id], unknown: [] },
  ];
  // A count is sent with the version the person saw.
  await assert.rejects(send(crew, A, 'submit_count', { count_id: count.id, spots }));
  await must(send(crew, A, 'submit_count', { count_id: count.id, spots }, { expected_version: count.version }));
  count = (await getDoc(doc(crew.db, 'workspaces', A, 'counts', count.id))).data();
  assert.equal(count.status, 'REVIEW');
  assert.deepEqual(count.lines.map((l) => [l.code, l.kind]).sort(), [[units[1].code, 'missing'], [units[2].code, 'matched']].sort());
  assert.equal((await getDoc(doc(crew.db, 'workspaces', A, 'pallets', units[1].id))).get('state'), 'STORED');
  assert.equal((await send(crew, A, 'review_count', { count_id: count.id, approve: true }, { expected_version: count.version })).code, 'FORBIDDEN');
  await must(send(lead, A, 'review_count', { count_id: count.id, approve: true }, { expected_version: count.version }));
  count = (await getDoc(doc(crew.db, 'workspaces', A, 'counts', count.id))).data();
  assert.equal(count.status, 'DONE');
  assert.equal((await getDoc(doc(crew.db, 'workspaces', A, 'pallets', units[1].id))).get('state'), 'MISSING');
  const verified = (await getDoc(doc(crew.db, 'workspaces', A, 'pallets', units[2].id))).data();
  assert.equal(verified.version, units[2].version + 1);
  const ev = (await getDoc(doc(crew.db, 'workspaces', A, 'events', `${units[2].id}_${verified.version}`))).data();
  assert.equal(ev.type, 'verify_location');
  const next = (await getDoc(doc(crew.db, 'workspaces', A, 'counts', count.next_id))).data();
  assert.equal(next.status, 'OPEN');
  assert.equal(next.assigned_to, crew.user.uid);
  ok('a scheduled count is sent by its person, reviewed by a manager, saved, and the weekly one comes back');

  // ---------------------------------------------------------------- returns with a condition
  const out = await must(send(crew, A, 'dispatch', { destination: 'Customer' }, at(verified)));
  const back = await must(send(crew, A, 'return', { condition: 'damaged', location_id: q1, reason: 'Damaged in transit' }, at(out.current_state)));
  assert.equal(back.current_state.state, 'STORED');
  assert.equal(back.current_state.current_location_id, q1);
  assert.equal(back.current_state.hold.reason, 'Returned damaged: Damaged in transit');
  const held = await getDocs(query(collection(lead.db, 'workspaces', A, 'pallets'), where('archived_at', '==', null), where('has_hold', '==', true), orderBy('code'), limit(100)));
  assert.ok(held.docs.some((d) => d.id === verified.id));
  ok('a damaged return goes to quarantine on hold with its reason');

  // ---------------------------------------------------------------- warehouse access per person
  const pB = await must(send(crew, B, 'receive', { description: 'Overflow stock' }));
  assert.equal((await send(crew, A, 'set_access', { user_id: lead.user.uid, workspace_ids: [A] })).code, 'FORBIDDEN');
  assert.equal((await send(lead, A, 'set_access', { user_id: boss.user.uid, workspace_ids: [A] })).code, 'FORBIDDEN');
  await must(send(lead, A, 'set_access', { user_id: crew.user.uid, workspace_ids: [A] }));
  const member = (await adminDb.doc(`workspaces/${B}/members/${crew.user.uid}`).get()).data();
  assert.equal(member.active, false);
  assert.equal(member.limited, true);
  assert.equal(member.role, 'OPERATOR');
  const profile = (await adminDb.doc(`users/${crew.user.uid}`).get()).data();
  assert.deepEqual(profile.workspaces.includes(B), false);
  assert.equal(profile.workspaces.includes(A), true);
  await assert.rejects(send(crew, B, 'receive', { description: 'Blocked' }));
  await assert.rejects(getDoc(doc(crew.db, 'workspaces', B, 'pallets', pB.current_state.id)));
  await must(send(crew, A, 'receive', { description: 'Still allowed here' }));
  const audit = await getDocs(query(collection(lead.db, 'workspaces', B, 'audit'), where('action', '==', 'set_access'), limit(10)));
  assert.equal(audit.size, 1);
  ok('a manager limits a teammate to one warehouse: the other refuses their commands and reads');

  await must(send(lead, A, 'set_access', { user_id: crew.user.uid, workspace_ids: [A, B] }));
  assert.equal((await adminDb.doc(`users/${crew.user.uid}`).get()).get('workspaces').includes(B), true);
  await must(send(crew, B, 'receive', { description: 'Access given back' }));
  assert.equal((await getDoc(doc(crew.db, 'workspaces', B, 'pallets', pB.current_state.id))).exists(), true);
  ok('giving access back restores the same role there');
}
