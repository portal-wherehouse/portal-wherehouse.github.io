// The blueprint's test matrix (pages 6, 29-31) as runnable scenarios.
// The same list runs in the in-app Integrity Lab and in `npm test`.

import { makeLabelPayload, mulberry32, parseLabelPayload, uuid } from '../domain/codes';
import { parseCsv, prepareImport, toCsv } from '../domain/csv';
import { searchRows } from '../domain/search';
import { checkPalletInvariants } from '../domain/transitions';
import type { CommandKind, Pallet, PalletState } from '../domain/types';
import { mergeNewer } from '../data/merge';
import { Outbox, eligibility, memoryStorage } from '../data/outbox';
import { Engine, emptyDb, type Db } from '../demo/engine';
import { DEMO_USERS, seedScenario, seedTiny } from '../demo/seed';
import { initialMove, moveReducer } from '../features/move/machine';
import { FIXED_NOW, type Scenario } from './harness';

const S: Scenario[] = [];
const add = (s: Scenario) => S.push(s);

// ------------------------------------------------------------------ walkthrough

add({
  id: 'W01',
  group: 'Walkthrough',
  title: 'A complete example shift',
  page: 6,
  proves: 'Receive P-000042 for J-214, place, move, find, dispatch, return and place again. Identity never changes; every step adds exactly one version and one event.',
  run(h) {
    const { operator, viewer } = h.users;
    const r1 = h.cmd(operator, 'receive', { job_id: h.job('J-214').id, description: 'Lighting fixtures' });
    h.expect(r1.ok, '08:10 Receive accepted');
    const p = r1.ok ? r1.current_state! : (null as never);
    h.equal(p.code, 'P-000042', 'Server allocated the readable code');
    h.equal([p.state, p.current_location_id, p.version], ['RECEIVED', null, 1], 'RECEIVED, location unassigned, version 1');
    const r2 = h.cmd(operator, 'place', { location_id: h.loc('A-03-02').id }, p);
    h.expect(r2.ok, '08:12 Place at A-03-02 accepted');
    h.equal([h.fresh(p).state, h.fresh(p).version], ['STORED', 2], 'STORED at A-03-02, version 2');
    const r3 = h.cmd(operator, 'move', { location_id: h.loc('B-01-01').id }, p);
    h.expect(r3.ok, '10:42 Move to B-01-01 accepted');
    const moveEv = h.events(p).at(-1)!;
    h.equal([moveEv.before_state?.current_location_code, moveEv.after_state.current_location_code], ['A-03-02', 'B-01-01'], 'Previous location preserved in the event');
    const found = h.engine.search(viewer, h.ws, { q: 'J-214' });
    const hit = found.items.find((i) => i.pallet.id === p.id);
    h.expect(hit && hit.location?.code === 'B-01-01', '11:00 Viewer searches J-214', hit ? `${hit.pallet.code} at ${hit.location?.code}` : 'not found');
    h.expect(found.items.some((i) => i.pallet.state === 'RECEIVED'), 'J-214 results include the unplaced pallet');
    const r4 = h.cmd(operator, 'dispatch', { destination: 'Maple Street school' }, p);
    h.expect(r4.ok, '14:15 Dispatch accepted');
    h.equal([h.fresh(p).state, h.fresh(p).current_location_id, h.fresh(p).version], ['DISPATCHED', null, 4], 'DISPATCHED, rack cleared, version 4');
    const r5 = h.cmd(operator, 'return', { condition_note: 'Intact' }, p);
    h.expect(r5.ok, 'Next day: return recorded');
    h.equal([h.fresh(p).state, h.fresh(p).current_location_id, h.fresh(p).version], ['RECEIVED', null, 5], 'RECEIVED and unassigned, version 5');
    const r6 = h.cmd(operator, 'place', { location_id: h.loc('A-02-01').id }, p);
    h.expect(r6.ok, 'Next day: placed at A-02-01');
    h.equal([h.fresh(p).id, h.fresh(p).code, h.fresh(p).version], [p.id, 'P-000042', 6], 'Same UUID and code, version 6');
    h.equal(h.events(p).map((e) => e.revision), [1, 2, 3, 4, 5, 6], 'One event per accepted command');
  },
});

// ------------------------------------------------------------------ functional (page 30)

add({
  id: 'F01',
  group: 'Functional',
  title: 'Receive with an open job',
  page: 30,
  proves: 'One pallet and a revision-1 event, with no location assigned.',
  run(h) {
    const before = Object.keys(h.db.pallets).length;
    const p = h.receive('J-221', 'Stone veneer');
    h.equal(Object.keys(h.db.pallets).length, before + 1, 'Exactly one new pallet');
    h.equal(h.events(p).map((e) => [e.revision, e.type]), [[1, 'receive']], 'Revision-1 receive event');
    h.equal(p.current_location_id, null, 'Location unassigned');
  },
});

add({
  id: 'F02',
  group: 'Functional',
  title: 'Receive with a closed job',
  page: 30,
  proves: 'A clear rejection, and no new pallet or event.',
  run(h) {
    const pallets = Object.keys(h.db.pallets).length;
    const events = h.eventCount();
    const r = h.cmd(h.users.operator, 'receive', { job_id: h.job('J-190').id, description: 'Late door stops' });
    h.expect(!r.ok && r.code === 'JOB_CLOSED', 'Rejected with JOB_CLOSED', r.ok ? 'accepted' : r.message);
    h.equal([Object.keys(h.db.pallets).length, h.eventCount()], [pallets, events], 'No pallet or event created');
  },
});

add({
  id: 'F03',
  group: 'Functional',
  title: 'Place an unassigned pallet',
  page: 30,
  proves: 'STORED with exactly one current location and a placement event.',
  run(h) {
    const p = h.pallet('P-000013'); // Ceiling tile, J-214, RECEIVED
    h.equal(p.state, 'RECEIVED', 'Starts RECEIVED');
    const r = h.cmd(h.users.operator, 'place', { location_id: h.loc('A-03-02').id }, p);
    h.expect(r.ok, 'Place accepted');
    h.equal([h.fresh(p).state, h.fresh(p).current_location_id], ['STORED', h.loc('A-03-02').id], 'STORED at A-03-02');
    h.equal(h.events(p).at(-1)!.type, 'place', 'Placement event recorded');
  },
});

add({
  id: 'F04',
  group: 'Functional',
  title: 'Move between two racks',
  page: 30,
  proves: 'Old and new locations appear in history, with one version increase.',
  run(h) {
    const p = h.pallet('P-000016'); // Plumbing fixtures at A-03-01
    const v = p.version;
    const r = h.cmd(h.users.operator, 'move', { location_id: h.loc('B-01-02').id }, p);
    h.expect(r.ok, 'Move accepted');
    const ev = h.events(p).at(-1)!;
    h.equal([ev.before_state?.current_location_code, ev.after_state.current_location_code], ['A-03-01', 'B-01-02'], 'Event shows old and new rack');
    h.equal(h.fresh(p).version, v + 1, 'Version increased by exactly one');
  },
});

add({
  id: 'F05',
  group: 'Functional',
  title: 'Scan the rack before the pallet',
  page: 30,
  proves: 'Recoverable guidance and no write.',
  run(h) {
    const events = h.eventCount();
    const s = moveReducer(initialMove, { type: 'SCAN_LOCATION', location: h.loc('A-01-01'), raw: 'A-01-01', at: 1 });
    h.equal(s.stage, 'EXPECT_PALLET', 'Scanner still expects a pallet');
    h.equal(s.message?.text, 'Scan the pallet first. Then scan the rack.', 'Guidance shown');
    h.equal(h.eventCount(), events, 'Nothing written');
  },
});

add({
  id: 'F06',
  group: 'Functional',
  title: 'Scan the same frame repeatedly',
  page: 30,
  proves: 'One selection and at most one submitted command, even when a camera reports the same label many times.',
  run(h) {
    const p = h.pallet('P-000014');
    const loc = h.loc('A-03-02');
    let s = initialMove;
    for (let i = 0; i < 10; i++) s = moveReducer(s, { type: 'SCAN_PALLET', pallet: p, raw: 'PL1:P:X', at: 1000 + i * 30 });
    h.equal(s.stage, 'EXPECT_LOCATION', 'Ten identical pallet frames select once');
    for (let i = 0; i < 10; i++) s = moveReducer(s, { type: 'SCAN_LOCATION', location: loc, raw: 'PL1:L:Y', at: 2000 + i * 30 });
    h.equal(s.stage, 'REVIEW', 'Ten identical rack frames produce one review');
    s = moveReducer(s, { type: 'CONFIRM', commandId: 'cmd-first-tap' });
    s = moveReducer(s, { type: 'CONFIRM', commandId: 'cmd-second-tap' });
    h.equal(s.commandId, 'cmd-first-tap', 'A second tap cannot create a second command');
    const env = h.envelope('move', { location_id: loc.id }, p, { commandId: s.commandId! });
    const a = h.engine.execute(h.users.operator, env);
    const b = h.engine.execute(h.users.operator, env);
    h.expect(a.ok && b.ok && b.replayed, 'Resubmitting the same command replays the saved result');
    h.equal(h.events(p).filter((e) => e.type === 'move').length, 1, 'One move event');
  },
});

add({
  id: 'F07',
  group: 'Functional',
  title: 'Dispatch a held pallet',
  page: 30,
  proves: 'Rejected; the hold and the location stay unchanged.',
  run(h) {
    const p = h.pallet('P-000018'); // Medical casework, on hold at B-02-01
    h.expect(p.hold, 'Pallet is on hold', p.hold?.reason ?? '');
    const r = h.cmd(h.users.operator, 'dispatch', { destination: 'Clinic' }, p);
    h.expect(!r.ok && r.code === 'INVALID_STATE', 'Dispatch rejected', r.ok ? '' : r.message);
    h.equal([!!h.fresh(p).hold, h.fresh(p).current_location_id, h.fresh(p).version], [true, p.current_location_id, p.version], 'Hold, rack and version unchanged');
  },
});

add({
  id: 'F08',
  group: 'Functional',
  title: 'Dispatch, then return intact',
  page: 30,
  proves: 'Identity is retained, the return becomes RECEIVED, and the rack is unassigned.',
  run(h) {
    const p = h.pallet('P-000026'); // LED high-bay lights at B-02-02
    h.expect(h.cmd(h.users.operator, 'dispatch', { destination: 'Civic garage, level P1' }, p).ok, 'Dispatched');
    h.expect(h.cmd(h.users.operator, 'return', { condition_note: 'Unused, wrap intact' }, p).ok, 'Return recorded');
    const f = h.fresh(p);
    h.equal([f.id, f.code, f.state, f.current_location_id], [p.id, p.code, 'RECEIVED', null], 'Same identity, RECEIVED, unassigned');
  },
});

add({
  id: 'F09',
  group: 'Functional',
  title: 'Mark missing, then locate',
  page: 30,
  proves: 'The historical rack is kept, and a new confirmed rack appears only after an authorized locate.',
  run(h) {
    const p = h.pallet('P-000022'); // Floor tile at A-02-01
    const last = p.last_confirmed_location_id;
    h.expect(h.cmd(h.users.operator, 'mark_missing', { reason: 'Not at A-02-01' }, p).ok, 'Marked missing');
    h.equal([h.fresh(p).state, h.fresh(p).current_location_id, h.fresh(p).last_confirmed_location_id], ['MISSING', null, last], 'Current rack cleared, last confirmed kept');
    const denied = h.cmd(h.users.operator, 'locate', { location_id: h.loc('B-02-02').id, reason: 'Found it' }, p);
    h.expect(!denied.ok && denied.code === 'FORBIDDEN', 'Operator cannot record found', denied.ok ? '' : denied.message);
    const ok = h.cmd(h.users.supervisor, 'locate', { location_id: h.loc('B-02-02').id, reason: 'Found behind B-02-02 during count' }, p);
    h.expect(ok.ok, 'Supervisor records found');
    h.equal([h.fresh(p).state, h.fresh(p).current_location_id], ['STORED', h.loc('B-02-02').id], 'STORED at the observed rack');
  },
});

add({
  id: 'F10',
  group: 'Functional',
  title: 'Rename a location',
  page: 30,
  proves: 'Identity and label token unchanged; the current code updates; historical snapshots keep the old code.',
  run(h) {
    const loc = h.loc('B-01-01');
    const token = h.engine.activeLabel(loc.id)!.token;
    const r = h.cmd(h.users.supervisor, 'rename_location', { location_id: loc.id, code: 'B-01-01A', reason: 'Beam re-numbered' });
    h.expect(r.ok, 'Rename accepted');
    h.equal([h.db.locations[loc.id].id, h.db.locations[loc.id].code], [loc.id, 'B-01-01A'], 'Same UUID, new code');
    h.equal(h.engine.activeLabel(loc.id)!.token, token, 'QR token unchanged: reprinting is optional');
    const old = Object.values(h.db.events).flat().filter((e) => e.after_state.current_location_id === loc.id);
    h.expect(old.length > 0 && old.every((e) => e.after_state.current_location_code === 'B-01-01'), 'Historical events still say B-01-01', `${old.length} events checked`);
    h.expect(h.db.audit.some((a) => a.action === 'rename_location' && a.target_id === loc.id), 'Rename written to the admin audit log');
  },
});

add({
  id: 'F11',
  group: 'Functional',
  title: 'Correct an older mistaken entry',
  page: 30,
  proves: 'A correction is a new event; earlier entries stay visible; the current version is checked.',
  run(h) {
    const p = h.pallet('P-000012'); // Door hardware, placed A-02-02 then moved to B-01-01
    const wrongMove = h.events(p).find((e) => e.type === 'move')!;
    const before = h.events(p).length;
    const stale = h.cmd(h.users.supervisor, 'correct', { corrects_event_id: wrongMove.id, state: 'STORED', location_id: h.loc('A-02-02').id, reason: 'Never left A-02-02' }, p, { expectedVersion: p.version - 1 });
    h.expect(!stale.ok && stale.code === 'VERSION_CONFLICT', 'Stale correction rejected');
    const r = h.cmd(h.users.supervisor, 'correct', { corrects_event_id: wrongMove.id, state: 'STORED', location_id: h.loc('A-02-02').id, reason: 'Never left A-02-02' }, p);
    h.expect(r.ok, 'Correction accepted');
    h.equal(h.events(p).length, before + 1, 'Exactly one new event; nothing edited');
    h.expect(h.events(p).some((e) => e.id === wrongMove.id && e.after_state.current_location_code === 'B-01-01'), 'Original move still visible, unchanged');
    h.equal(h.events(p).at(-1)!.detail.corrects_event_id, wrongMove.id, 'Correction references the mistaken event');
  },
});

add({
  id: 'F12',
  group: 'Functional',
  title: 'Search duplicate descriptions',
  page: 30,
  proves: 'Identical descriptions stay separate records with distinct codes.',
  run(h) {
    const r = h.engine.search(h.users.viewer, h.ws, { q: 'floor tile' });
    const codes = r.items.map((i) => i.pallet.code);
    h.equal(codes.length, 2, 'Two pallets called "Floor tile"');
    h.expect(new Set(codes).size === 2, 'Distinct codes', codes.join(', '));
    h.expect(r.items[0].location?.code === r.items[1].location?.code, 'Even on the same rack they stay separate', r.items[0].location?.code ?? '');
  },
});

add({
  id: 'F13',
  group: 'Functional',
  title: 'Controlled split',
  page: 14,
  proves: 'Two supervisors split the same version: exactly one commits. Retrying returns the same children. The parent retires with lineage.',
  run(h) {
    const parent = h.pallet('P-000033'); // Pump assembly at B-02-01
    const job = h.job('J-233').id;
    const children = [
      { description: 'Pump assembly: motor', job_id: job },
      { description: 'Pump assembly: housing (remainder)', job_id: job },
    ];
    const cmdA = h.envelope('split', { children, reason: 'Physically separated and verified' }, parent);
    const cmdB = h.envelope('split', { children: [...children, { description: 'Extra', job_id: job }], reason: 'Second supervisor' }, parent);
    const a = h.engine.execute(h.users.supervisor, cmdA);
    const b = h.engine.execute(h.users.owner, cmdB);
    h.expect(a.ok, 'First split commits', a.ok ? `${a.created_ids?.length} children` : a.message);
    h.expect(!b.ok && b.code === 'VERSION_CONFLICT', 'Second split gets a conflict');
    const again = h.engine.execute(h.users.supervisor, cmdA);
    h.expect(again.ok && JSON.stringify(again.created_ids) === JSON.stringify(a.ok ? a.created_ids : []), 'Retry returns the same children');
    h.equal(h.fresh(parent).state, 'RETIRED', 'Parent retired');
    const lineage = h.engine.lineageOf(h.ws, parent.id);
    h.equal(lineage.children.length, 2, 'Lineage links two children');
    h.expect(lineage.children.every((c) => c.current_location_id === parent.current_location_id && c.state === 'STORED'), 'Children inherit the parent location explicitly');
    h.expect(lineage.children.every((c) => h.events(c)[0].type === 'split_child'), 'Each child has its own creation event');
  },
});

add({
  id: 'F14',
  group: 'Functional',
  title: 'Close a job with material still here',
  page: 9,
  proves: 'A job cannot close while pallets are received, stored, or missing, or while holds are unresolved.',
  run(h) {
    const r = h.cmd(h.users.supervisor, 'close_job', { job_id: h.job('J-230').id, reason: 'Done' });
    h.expect(!r.ok && r.code === 'INVALID_STATE', 'Close refused', r.ok ? '' : r.message);
    h.equal(h.job('J-230').status, 'OPEN', 'Job stays open');
  },
});

// ------------------------------------------------------------------ database & retries (page 31)

add({
  id: 'D01',
  group: 'Database & retries',
  title: 'Response lost after commit',
  page: 31,
  proves: 'The same command recovers the original result, and only one event exists.',
  run(h) {
    const p = h.pallet('P-000014');
    const env = h.envelope('move', { location_id: h.loc('A-03-02').id }, p);
    const first = h.engine.execute(h.users.operator, env);
    h.note('Response discarded', 'the client never saw it');
    const rec = h.engine.recover(h.users.operator, h.ws, env.command_id);
    h.expect(rec.status === 'found' && rec.result.ok, 'Recover finds the saved receipt');
    h.equal(rec.status === 'found' && rec.result.ok ? rec.result.event_id : null, first.ok ? first.event_id : 'x', 'Same event ID as the original');
    const retry = h.engine.execute(h.users.operator, env);
    h.expect(retry.ok && retry.replayed, 'Retrying the same command replays, not re-executes');
    h.equal(h.events(p).filter((e) => e.command_id === env.command_id).length, 1, 'One event for this command');
  },
});

add({
  id: 'D02',
  group: 'Database & retries',
  title: 'Concurrent moves from one revision',
  page: 31,
  proves: 'Two phones both load version N. One move is accepted; the other gets an explicit conflict with the current summary.',
  run(h) {
    const p = h.pallet('P-000014');
    const v = p.version;
    const phoneA = h.envelope('move', { location_id: h.loc('A-03-02').id }, p, { expectedVersion: v });
    const phoneB = h.envelope('move', { location_id: h.loc('B-01-01').id }, p, { expectedVersion: v });
    const a = h.engine.execute(h.users.operator, phoneA);
    const b = h.engine.execute(h.users.supervisor, phoneB);
    h.expect(a.ok, 'Phone A commits version ' + (v + 1));
    h.expect(!b.ok && b.code === 'VERSION_CONFLICT', 'Phone B receives VERSION_CONFLICT');
    h.expect(!b.ok && b.current?.version === v + 1 && b.current.current_location_id === h.loc('A-03-02').id, 'Conflict shows the newer state', 'A-03-02, version ' + (v + 1));
    h.equal(h.events(p).length, v + 1, 'Exactly one new event');
  },
});

add({
  id: 'D03',
  group: 'Database & retries',
  title: 'Reused command ID with a changed payload',
  page: 31,
  proves: 'COMMAND_KEY_REUSED, and no extra mutation.',
  run(h) {
    const p = h.pallet('P-000014');
    const id = uuid();
    h.expect(h.cmd(h.users.operator, 'move', { location_id: h.loc('A-03-02').id }, p, { commandId: id }).ok, 'Original command accepted');
    const snapshot = JSON.stringify(h.fresh(p));
    const r = h.cmd(h.users.operator, 'move', { location_id: h.loc('B-01-01').id }, p, { commandId: id, expectedVersion: p.version });
    h.expect(!r.ok && r.code === 'COMMAND_KEY_REUSED', 'Changed payload rejected');
    h.equal(JSON.stringify(h.fresh(p)), snapshot, 'Pallet unchanged');
  },
});

add({
  id: 'D04',
  group: 'Database & retries',
  title: 'Event insert forced to fail',
  page: 31,
  proves: 'The pallet update and the command receipt roll back together.',
  run(h) {
    const p = h.pallet('P-000014');
    const before = JSON.stringify(h.fresh(p));
    const receipts = Object.keys(h.db.receipts).length;
    h.engine.faults.failEventInsert = true;
    const env = h.envelope('move', { location_id: h.loc('A-03-02').id }, p);
    const r = h.engine.execute(h.users.operator, env);
    h.engine.faults.failEventInsert = false;
    h.expect(!r.ok && r.code === 'TEMPORARY_FAILURE', 'Command reports a temporary failure');
    h.equal(JSON.stringify(h.fresh(p)), before, 'Pallet row rolled back');
    h.equal(Object.keys(h.db.receipts).length, receipts, 'No receipt was kept');
    h.expect(h.engine.recover(h.users.operator, h.ws, env.command_id).status === 'unknown', 'Recover reports unknown after rollback');
    const retry = h.engine.execute(h.users.operator, env);
    h.expect(retry.ok && !retry.replayed, 'Retrying the same ID succeeds once the fault clears');
  },
});

add({
  id: 'D05',
  group: 'Database & retries',
  title: 'Old read arrives after a new write',
  page: 31,
  proves: 'The client keeps the newer confirmed version.',
  run(h) {
    const p = h.pallet('P-000014');
    const oldRead = { ...h.fresh(p) };
    const r = h.cmd(h.users.operator, 'move', { location_id: h.loc('A-03-02').id }, p);
    const newer = r.ok ? r.current_state! : oldRead;
    const kept = mergeNewer(newer, oldRead)!;
    h.equal([kept.version, kept.current_location_id], [newer.version, h.loc('A-03-02').id], 'Delayed older read ignored');
  },
});

add({
  id: 'D06',
  group: 'Database & retries',
  title: 'Job closes during a receipt',
  page: 31,
  proves: 'Active status is re-checked inside the transaction, so the result is consistent.',
  run(h) {
    const created = h.cmd(h.users.supervisor, 'create_job', { code: 'J-999', name: 'Short job' });
    h.expect(created.ok, 'Supervisor creates J-999');
    const jobId = created.ok ? created.target_id! : '';
    h.note('Operator opens the Receive form', 'J-999 is OPEN in their dropdown');
    h.expect(h.cmd(h.users.supervisor, 'close_job', { job_id: jobId, reason: 'Cancelled' }).ok, 'Supervisor closes J-999');
    const r = h.cmd(h.users.operator, 'receive', { job_id: jobId, description: 'Late delivery' });
    h.expect(!r.ok && r.code === 'JOB_CLOSED', 'Receipt rejected against the closed job');
    h.expect(!Object.values(h.db.pallets).some((p) => p.job_id === jobId), 'No pallet attached to the closed job');
  },
});

add({
  id: 'D07',
  group: 'Database & retries',
  title: 'Inactive location during a move',
  page: 23,
  proves: 'Deactivation is blocked while pallets are recorded there, and moves into an inactive location are rejected.',
  run(h) {
    const busy = h.cmd(h.users.supervisor, 'deactivate_location', { location_id: h.loc('A-01-01').id, reason: 'Beam repair' });
    h.expect(!busy.ok && busy.code === 'INVALID_STATE', 'Cannot deactivate a rack with pallets', busy.ok ? '' : busy.message);
    h.expect(h.cmd(h.users.supervisor, 'deactivate_location', { location_id: h.loc('A-03-02').id, reason: 'Beam repair' }).ok, 'Empty rack A-03-02 deactivated');
    const r = h.cmd(h.users.operator, 'move', { location_id: h.loc('A-03-02').id }, h.pallet('P-000014'));
    h.expect(!r.ok && r.code === 'INACTIVE_LOCATION', 'Move into it rejected with INACTIVE_LOCATION');
  },
});

// ------------------------------------------------------------------ security (page 26, 31)

function twoWorkspaces(): Db {
  return seedScenario({ now: FIXED_NOW });
}

add({
  id: 'S01',
  group: 'Security',
  title: 'Known UUID from another workspace',
  page: 31,
  proves: 'Reads, writes and label lookups are denied without leaking the other company’s description.',
  setup: twoWorkspaces,
  run(h) {
    const wsB = Object.values(h.db.workspaces).find((w) => w.name === 'Second sample warehouse')!.id;
    const foreign = Object.values(h.db.pallets).find((p) => p.workspace_id === wsB)!;
    const token = h.engine.activeLabel(foreign.id)!.token;
    let leaked = '';
    try {
      h.engine.pallet(h.users.operator, h.ws, foreign.id);
      leaked = 'read succeeded';
    } catch (e) {
      leaked = String((e as Error).message);
    }
    h.expect(leaked === 'Pallet not found.', 'Read returns an opaque not-found', leaked);
    const w = h.cmd(h.users.operator, 'move', { location_id: h.loc('A-01-01').id }, foreign, { expectedVersion: foreign.version });
    h.expect(!w.ok && w.code === 'NOT_FOUND' && !JSON.stringify(w).includes(foreign.description), 'Move denied, no description in the error');
    let label = '';
    try {
      h.engine.resolve(h.users.operator, h.ws, makeLabelPayload('P', token));
    } catch (e) {
      label = (e as Error).message;
    }
    h.expect(label.includes('not recognized'), 'Scanning their label resolves nothing here', label);
    const direct = h.cmd(h.users.operator, 'move', { location_id: h.loc('A-01-01').id }, foreign, { ws: wsB, expectedVersion: foreign.version });
    h.expect(!direct.ok && direct.code === 'FORBIDDEN', 'Naming their workspace ID does not grant access');
    const sameCode = h.engine.search(h.users.operator, h.ws, { q: 'J-214' }).items;
    h.expect(sameCode.every((i) => i.pallet.workspace_id === h.ws), 'Search for a shared code only returns our records', `${sameCode.length} results`);
  },
});

add({
  id: 'S02',
  group: 'Security',
  title: 'Viewer calls a mutation directly',
  page: 31,
  proves: 'The server rejects it even when the interface is bypassed.',
  run(h) {
    const p = h.pallet('P-000014');
    const kinds: CommandKind[] = ['move', 'dispatch', 'mark_missing', 'apply_hold'];
    for (const k of kinds) {
      const r = h.cmd(h.users.viewer, k, { location_id: h.loc('A-03-02').id, destination: 'x', reason: 'x' }, p);
      h.expect(!r.ok && r.code === 'FORBIDDEN', `Viewer ${k} rejected`);
    }
    let exported = '';
    try {
      h.engine.exportData(h.users.viewer, h.ws);
      exported = 'allowed';
    } catch (e) {
      exported = (e as Error).message;
    }
    h.expect(exported !== 'allowed', 'Viewer cannot export through a direct call', exported);
  },
});

add({
  id: 'S03',
  group: 'Security',
  title: 'Operator calls a supervisor function',
  page: 31,
  proves: 'Permission denied and history unchanged.',
  run(h) {
    const p = h.pallet('P-000012');
    const events = h.events(p).length;
    for (const k of ['correct', 'retire', 'clear_hold', 'reassign_job', 'split'] as CommandKind[]) {
      const r = h.cmd(h.users.operator, k, { state: 'RECEIVED', reason: 'x', job_id: h.job('J-215').id, children: [] }, p);
      h.expect(!r.ok && r.code === 'FORBIDDEN', `Operator ${k} rejected`);
    }
    h.equal(h.events(p).length, events, 'History unchanged');
  },
});

add({
  id: 'S04',
  group: 'Security',
  title: 'Removed member submits queued work',
  page: 31,
  proves: 'The server denies it and the queued command is visibly blocked.',
  async run(h) {
    const p = h.pallet('P-000014');
    const outbox = new Outbox(memoryStorage());
    await outbox.init();
    const cmd = h.envelope('move', { location_id: h.loc('A-03-02').id }, p);
    await outbox.enqueue({ command: cmd, actor_id: h.users.operator, workspace_id: h.ws, pallet_id: p.id, pallet_code: p.code, expected_version: p.version, kind: 'move', from_code: 'A-01-02', to_code: 'A-03-02', created_at: new Date(FIXED_NOW).toISOString() });
    h.note('Queued offline by the operator', cmd.command_id.slice(0, 8));
    h.expect(h.cmd(h.users.owner, 'remove_member', { user_id: h.users.operator, reason: 'Left the company' }).ok, 'Owner removes the operator');
    await outbox.replay(h.users.operator, h.ws, async (c) => h.engine.execute(h.users.operator, c));
    const e = outbox.entries[0];
    h.equal([e.status, e.last_error?.code], ['blocked', 'FORBIDDEN'], 'Queued command blocked with FORBIDDEN');
    h.equal(h.fresh(p).version, p.version, 'Pallet unchanged');
  },
});

add({
  id: 'S05',
  group: 'Security',
  title: 'Owner removal and role grants',
  page: 4,
  proves: 'A warehouse keeps an owner. Managers can add managers; only owners grant ownership.',
  run(h) {
    const r = h.cmd(h.users.owner, 'remove_member', { user_id: h.users.owner, reason: 'Testing' });
    h.expect(!r.ok && r.code === 'INVALID_STATE', 'Last owner cannot be removed', r.ok ? '' : r.message);
    const g = h.cmd(h.users.supervisor, 'change_role', { user_id: h.users.operator, role: 'SUPERVISOR', reason: 'Promotion' });
    h.expect(g.ok, 'Manager can grant manager access');
    const blocked = h.cmd(h.users.supervisor, 'change_role', { user_id: h.users.operator, role: 'OWNER', reason: 'Blocked escalation' });
    h.expect(!blocked.ok && blocked.code === 'FORBIDDEN', 'Manager cannot grant ownership');
    const o = h.cmd(h.users.owner, 'change_role', { user_id: h.users.operator, role: 'OWNER', reason: 'Promotion' });
    h.expect(o.ok, 'Owner can');
    h.expect(h.db.audit.some((a) => a.action === 'change_role' && a.target_id === h.users.operator), 'Role change is in the audit log');
  },
});

// ------------------------------------------------------------------ offline (page 24, 31)

add({
  id: 'O01',
  group: 'Offline',
  title: 'Device storage write fails',
  page: 31,
  proves: 'No false “queued” confirmation.',
  async run(h) {
    const outbox = new Outbox(memoryStorage(true));
    await outbox.init();
    const p = h.pallet('P-000014');
    let error = '';
    try {
      await outbox.enqueue({ command: h.envelope('move', { location_id: h.loc('A-03-02').id }, p), actor_id: h.users.operator, workspace_id: h.ws, pallet_id: p.id, pallet_code: p.code, expected_version: p.version, kind: 'move', from_code: null, to_code: 'A-03-02', created_at: '' });
    } catch (e) {
      error = (e as Error).message;
    }
    h.expect(error.length > 0, 'Enqueue throws instead of pretending', error);
    h.equal(outbox.entries.length, 0, 'Nothing listed as queued');
  },
});

add({
  id: 'O02',
  group: 'Offline',
  title: 'Offline change conflicts on reconnect',
  page: 31,
  proves: 'The queue stops for that pallet and shows the current state and the queued observation separately.',
  async run(h) {
    const p = h.pallet('P-000014');
    const outbox = new Outbox(memoryStorage());
    await outbox.init();
    const q1 = h.envelope('move', { location_id: h.loc('A-03-02').id }, p);
    await outbox.enqueue({ command: q1, actor_id: h.users.operator, workspace_id: h.ws, pallet_id: p.id, pallet_code: p.code, expected_version: p.version, kind: 'move', from_code: 'A-01-02', to_code: 'A-03-02', created_at: '' });
    h.expect(h.cmd(h.users.supervisor, 'move', { location_id: h.loc('B-02-02').id }, p).ok, 'Meanwhile a supervisor moves it online');
    const stats = await outbox.replay(h.users.operator, h.ws, async (c) => h.engine.execute(h.users.operator, c));
    h.equal(stats.conflicts, 1, 'One conflict');
    const e = outbox.entries[0];
    h.equal([e.status, e.to_code, e.server_state?.current_location_id], ['conflict', 'A-03-02', h.loc('B-02-02').id], 'Both the queued destination and the server location are kept');
    h.equal(h.fresh(p).current_location_id, h.loc('B-02-02').id, 'Server record not overwritten');
  },
});

add({
  id: 'O03',
  group: 'Offline',
  title: 'What can be queued offline',
  page: 24,
  proves: 'Only moves and checks for cached stored pallets, one unresolved change per pallet.',
  async run(h) {
    const outbox = new Outbox(memoryStorage());
    await outbox.init();
    const stored = h.pallet('P-000014');
    const received = h.pallet('P-000013');
    h.expect(!eligibility('dispatch', stored, true, []).ok, 'Dispatch is online-only');
    h.expect(!eligibility('move', received, true, []).ok, 'Unplaced pallets need a connection');
    h.expect(eligibility('move', stored, true, []).ok, 'A stored pallet can be moved offline');
    await outbox.enqueue({ command: h.envelope('move', { location_id: h.loc('A-03-02').id }, stored), actor_id: h.users.operator, workspace_id: h.ws, pallet_id: stored.id, pallet_code: stored.code, expected_version: stored.version, kind: 'move', from_code: null, to_code: 'A-03-02', created_at: '' });
    h.expect(!eligibility('move', stored, true, outbox.entries).ok, 'A second offline change to the same pallet waits');
    h.equal(outbox.pending(h.users.supervisor, h.ws).length, 0, 'Another user never sees or replays this queue');
  },
});

add({
  id: 'O04',
  group: 'Offline',
  title: 'Crash while sending',
  page: 36,
  proves: 'A restart keeps the same command ID and replays without duplicating.',
  async run(h) {
    const storage = memoryStorage();
    const outbox = new Outbox(storage);
    await outbox.init();
    const p = h.pallet('P-000014');
    const cmd = h.envelope('move', { location_id: h.loc('A-03-02').id }, p);
    await outbox.enqueue({ command: cmd, actor_id: h.users.operator, workspace_id: h.ws, pallet_id: p.id, pallet_code: p.code, expected_version: p.version, kind: 'move', from_code: null, to_code: 'A-03-02', created_at: '' });
    h.engine.execute(h.users.operator, cmd);
    h.note('Server committed, then the browser closed', 'before the acknowledgment arrived');
    storage.data[0].status = 'sending';
    const restarted = new Outbox(storage);
    await restarted.init();
    h.equal([restarted.entries[0].status, restarted.entries[0].command.command_id], ['queued', cmd.command_id], 'Back to queued with the same command ID');
    await restarted.replay(h.users.operator, h.ws, async (c) => h.engine.execute(h.users.operator, c));
    h.equal(restarted.entries[0].status, 'acknowledged', 'Replay acknowledged from the saved receipt');
    h.equal(h.events(p).filter((e) => e.command_id === cmd.command_id).length, 1, 'Still one event');
  },
});

// ------------------------------------------------------------------ import & export

add({
  id: 'I01',
  group: 'Import & export',
  title: 'Atomic, repeat-safe CSV import',
  page: 27,
  proves: 'A malformed row blocks the whole batch; the same batch twice creates no duplicates; a changed file under the same batch ID is rejected.',
  run(h) {
    const bad = prepareImport('pallets', 'job_code,description\nJ-214,Grid\nJ-404,Mystery\nJ-190,Late\n');
    const batchBad = uuid();
    const before = Object.keys(h.db.pallets).length;
    const r = h.cmd(h.users.supervisor, 'import_batch', { import_kind: 'pallets', checksum: 'x', rows: bad.rows }, null, { commandId: batchBad });
    h.expect(!r.ok && r.errors?.length === 2, 'Two row errors reported', r.ok ? '' : (r.errors ?? []).map((e) => `row ${e.row} ${e.column}`).join('; '));
    h.equal(Object.keys(h.db.pallets).length, before, 'Nothing imported');
    const good = prepareImport('pallets', 'job_code,description\nj-214 ,Acoustic grid\nJ-221,Stone veneer\n');
    const batch = uuid();
    const a = h.cmd(h.users.supervisor, 'import_batch', { import_kind: 'pallets', checksum: 'abc', rows: good.rows }, null, { commandId: batch });
    const b = h.cmd(h.users.supervisor, 'import_batch', { import_kind: 'pallets', checksum: 'abc', rows: good.rows }, null, { commandId: batch });
    h.expect(a.ok && b.ok && b.replayed, 'Second submission replays');
    h.equal(Object.keys(h.db.pallets).length, before + 2, 'Two pallets, not four');
    const c = h.cmd(h.users.supervisor, 'import_batch', { import_kind: 'pallets', checksum: 'def', rows: [...good.rows, { job_code: 'J-214', description: 'Sneaky' }] }, null, { commandId: batch });
    h.expect(!c.ok && c.code === 'COMMAND_KEY_REUSED', 'Changed file with the same batch ID rejected');
    const imported = a.ok ? h.db.pallets[a.created_ids![0]] : null;
    h.equal([imported?.state, imported?.current_location_id, h.events(imported!)[0].type], ['RECEIVED', null, 'import_receive'], 'Imported as RECEIVED, no invented history');
  },
});

add({
  id: 'I02',
  group: 'Import & export',
  title: 'Spreadsheet-safe exports',
  page: 28,
  proves: 'Cells starting with = + - @ are neutralized, quoting is correct, and exports reconcile with the app.',
  run(h) {
    const csv = toCsv([{ a: '=HYPERLINK("x")', b: 'Line, with comma', c: '+1', d: '-5', e: '@SUM' }]);
    const parsed = parseCsv(csv).rows[0];
    h.equal(parsed, [`'=HYPERLINK("x")`, 'Line, with comma', "'+1", '-5', "'@SUM"], 'Formulas neutralized, plain numbers kept');
    const ex = h.engine.exportData(h.users.supervisor, h.ws);
    const counts: Record<string, number> = { STORED: 0, RECEIVED: 0, DISPATCHED: 0, MISSING: 0, RETIRED: 0 };
    for (const p of ex.pallets) counts[p.state]++;
    h.equal(counts, { STORED: 21, RECEIVED: 3, DISPATCHED: 3, MISSING: 2, RETIRED: 1 }, 'Exported state counts match the fixture');
    h.equal(ex.events.length, h.eventCount(), 'Every event exported');
  },
});

// ------------------------------------------------------------------ labels & search

add({
  id: 'L01',
  group: 'Labels & search',
  title: 'Only our exact label format scans',
  page: 16,
  proves: 'Typed, versioned tokens; arbitrary URLs and oversized payloads are refused.',
  run(h) {
    h.expect(parseLabelPayload('PL1:P:ABCDEFGHJKMNPQRS') !== null, 'PL1:P:<token> accepted');
    h.expect(parseLabelPayload('https://evil.example/#PL1:P:ABCDEFGHJKMNPQRS')?.token === 'ABCDEFGHJKMNPQRS', 'Our payload inside a URL fragment is extracted, never navigated to');
    h.expect(parseLabelPayload('https://evil.example/login') === null, 'Other URLs refused');
    h.expect(parseLabelPayload('PL1:X:ABCDEFGHJKMNPQRS') === null, 'Unknown label type refused');
    h.expect(parseLabelPayload('PL1:P:' + 'A'.repeat(200)) === null, 'Oversized payload refused');
    const p = h.pallet('P-000014');
    const token = h.engine.activeLabel(p.id)!.token;
    h.expect(h.cmd(h.users.supervisor, 'rotate_label', { reason: 'Label photographed by a visitor' }, p).ok, 'Supervisor rotates the label');
    let msg = '';
    try {
      h.engine.resolve(h.users.operator, h.ws, makeLabelPayload('P', token));
    } catch (e) {
      msg = (e as Error).message;
    }
    h.expect(msg.includes('replaced'), 'Old label now says it was replaced', msg);
    h.expect(h.engine.resolve(h.users.operator, h.ws, 'p-14').type === 'pallet', 'Typed code still works for damaged labels');
    h.expect(h.fresh(p).label_needs_reprint, 'Pallet joins the reprint list');
    h.expect(h.cmd(h.users.operator, 'label_applied', {}, h.fresh(p)).ok, 'Operator confirms the new label is on');
    h.expect(!h.fresh(p).label_needs_reprint, 'Pallet leaves the reprint list');
    const again = h.cmd(h.users.operator, 'label_applied', {}, h.fresh(p));
    h.expect(!again.ok && again.code === 'INVALID_STATE', 'Confirming twice is refused', again.ok ? '' : again.message);
  },
});

add({
  id: 'L02',
  group: 'Labels & search',
  title: 'Search order and pagination',
  page: 13,
  proves: 'Exact codes first, then prefixes, then descriptions; paging never repeats or skips.',
  setup: () => seedScenario({ now: FIXED_NOW }),
  run(h) {
    const r = h.engine.search(h.users.viewer, h.ws, { q: 'J-214' });
    h.expect(r.items.length > 0 && r.items.every((i) => i.rank === 0), 'Exact job code matches rank first');
    const code = r.items[0].pallet.code;
    const exact = h.engine.search(h.users.viewer, h.ws, { q: `  ${code.toLowerCase()} ` });
    h.equal(exact.items[0].pallet.code, code, 'Lowercase, padded pallet code finds the exact pallet first');
    const all: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const page: ReturnType<typeof h.engine.search> = h.engine.search(h.users.viewer, h.ws, { q: '', limit: 37, cursor, include_archived: true });
      all.push(...page.items.map((i) => i.pallet.id));
      cursor = page.next_cursor;
      pages++;
    } while (cursor && pages < 50);
    const total = Object.values(h.db.pallets).filter((p) => p.workspace_id === h.ws).length;
    h.equal([all.length, new Set(all).size], [total, total], `${pages} pages: no repeats, no gaps`);
  },
});

// ------------------------------------------------------------------ invariants & oracle

add({
  id: 'V01',
  group: 'Invariants',
  title: 'Fixture state counts and invariants',
  page: 29,
  proves: 'The 200-pallet scenario has 140/20/20/10/10 by state with 8 holds; every pallet obeys the state/location rule and its history reconciles.',
  setup: () => seedScenario({ now: FIXED_NOW }),
  run(h) {
    const mine = Object.values(h.db.pallets).filter((p) => p.workspace_id === h.ws);
    const counts: Record<string, number> = { STORED: 0, RECEIVED: 0, DISPATCHED: 0, MISSING: 0, RETIRED: 0 };
    for (const p of mine) counts[p.state]++;
    h.equal(counts, { STORED: 140, RECEIVED: 20, DISPATCHED: 20, MISSING: 10, RETIRED: 10 }, 'State totals');
    h.equal(mine.filter((p) => p.hold).length, 8, 'Eight holds');
    const problems = Object.values(h.db.pallets).flatMap(checkPalletInvariants);
    h.equal(problems, [], 'State/location invariant holds for every pallet');
    const mismatched = Object.values(h.db.pallets).filter((p) => {
      const evs = h.db.events[p.id] ?? [];
      const last = evs.at(-1);
      return evs.length !== p.version || !last || last.after_state.state !== p.state || last.after_state.current_location_id !== p.current_location_id;
    });
    h.equal(mismatched.map((p) => p.code), [], 'Latest event matches every current record; event count equals version');
  },
});

add({
  id: 'V02',
  group: 'Invariants',
  title: 'Independent oracle over 600 generated commands',
  page: 29,
  proves: 'A separate reference model predicts which commands are accepted and the resulting state. It shares no code with the engine.',
  run(h) {
    type O = { state: PalletState; loc: string | null; version: number; hold: boolean; job: string };
    const oracle = new Map<string, O>();
    for (const p of Object.values(h.db.pallets)) oracle.set(p.id, { state: p.state, loc: p.current_location_id, version: p.version, hold: !!p.hold, job: p.job_id });
    const rand = mulberry32(214);
    const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
    const pallets = Object.values(h.db.pallets);
    const locs = Object.values(h.db.locations);
    const jobs = Object.values(h.db.jobs);
    const actors = [h.users.operator, h.users.operator, h.users.supervisor, h.users.viewer];
    const kinds: CommandKind[] = ['place', 'move', 'verify_location', 'dispatch', 'return', 'mark_missing', 'locate', 'apply_hold', 'clear_hold', 'retire', 'reassign_job'];
    const supervisorOnly = new Set(['locate', 'clear_hold', 'retire', 'reassign_job']);
    let accepted = 0;
    let disagreements = 0;
    const first: string[] = [];
    for (let i = 0; i < 600; i++) {
      const p = pick(pallets);
      const o = oracle.get(p.id)!;
      const kind = pick(kinds);
      const actor = pick(actors);
      const loc = pick(locs);
      const job = pick(jobs);
      const stale = rand() < 0.1;
      const expected = stale ? o.version - 1 || 99 : o.version;
      const payload: Record<string, unknown> = { location_id: kind === 'verify_location' && rand() < 0.7 && o.loc ? o.loc : loc.id, destination: 'Site', reason: 'Generated', job_id: job.id };
      const jobOpen = h.db.jobs[o.job].status === 'OPEN';
      const locId = payload.location_id as string;
      // Independent prediction.
      let predict = actor !== h.users.viewer && !(supervisorOnly.has(kind) && actor === h.users.operator) && !stale && o.state !== 'RETIRED';
      if (predict) {
        switch (kind) {
          case 'place': predict = o.state === 'RECEIVED'; break;
          case 'move': predict = o.state === 'STORED' && locId !== o.loc; break;
          case 'verify_location': predict = o.state === 'STORED' && locId === o.loc; break;
          case 'dispatch': predict = o.state === 'STORED' && !o.hold && jobOpen; break;
          case 'return': predict = o.state === 'DISPATCHED' && jobOpen; break;
          case 'mark_missing': predict = o.state === 'STORED' || o.state === 'RECEIVED'; break;
          case 'locate': predict = o.state === 'MISSING'; break;
          case 'apply_hold': predict = !o.hold && o.state !== 'DISPATCHED'; break;
          case 'clear_hold': predict = o.hold; break;
          case 'retire': predict = true; break;
          case 'reassign_job': predict = o.state !== 'DISPATCHED' && job.status === 'OPEN' && job.id !== o.job; break;
        }
      }
      const r = h.cmd(actor, kind, payload, p, { expectedVersion: expected });
      if (r.ok !== predict) {
        disagreements++;
        if (first.length < 3) first.push(`${kind} on ${p.code} (${o.state}): oracle ${predict}, engine ${r.ok ? 'accepted' : r.code}`);
      }
      if (r.ok) {
        accepted++;
        o.version++;
        switch (kind) {
          case 'place': case 'move': case 'locate': o.state = 'STORED'; o.loc = locId; break;
          case 'dispatch': o.state = 'DISPATCHED'; o.loc = null; break;
          case 'return': o.state = 'RECEIVED'; o.loc = null; break;
          case 'mark_missing': o.state = 'MISSING'; o.loc = null; break;
          case 'apply_hold': o.hold = true; break;
          case 'clear_hold': o.hold = false; break;
          case 'retire': o.state = 'RETIRED'; o.loc = null; break;
          case 'reassign_job': o.job = job.id; break;
        }
      }
    }
    h.note('Generated commands', `600 with seed 214, ${accepted} accepted`);
    h.equal(disagreements, 0, 'Oracle and engine agree on every accept/reject' + (first.length ? ` (${first.join('; ')})` : ''));
    const diffs = Object.values(h.db.pallets).filter((p) => {
      const o = oracle.get(p.id)!;
      return o.state !== p.state || o.loc !== p.current_location_id || o.version !== p.version || o.hold !== !!p.hold || o.job !== p.job_id;
    });
    h.equal(diffs.map((p) => p.code), [], 'Oracle state equals engine state for every pallet');
    h.equal(Object.values(h.db.pallets).flatMap(checkPalletInvariants), [], 'Invariants hold after every generated sequence');
  },
});

// ------------------------------------------------------------------ performance

add({
  id: 'P01',
  group: 'Performance',
  title: 'Search across 10,000 pallets',
  page: 32,
  proves: 'Measures search time on a generated 10,000-pallet workspace against the blueprint’s proposed target (95th percentile under one second). A measurement, not a capacity promise.',
  setup: () => {
    const db = emptyDb();
    const e = new Engine(db, { clock: () => new Date(FIXED_NOW).toISOString() });
    const owner = DEMO_USERS[0];
    const { workspace } = e.createWorkspace(owner, 'Sample warehouse', { code: 'WH-01', name: 'Main yard', timezone: 'America/Chicago' });
    for (const u of DEMO_USERS.slice(1)) e.addMember(workspace.id, u, u.id === 'user-viewer' ? 'VIEWER' : u.id === 'user-supervisor' ? 'SUPERVISOR' : 'OPERATOR');
    const run = (kind: CommandKind, payload: Record<string, unknown>, p?: Pallet) =>
      e.execute(owner.id, { schema_version: 1, command_id: uuid(), workspace_id: workspace.id, kind, payload, ...(p ? { pallet_id: p.id, expected_version: p.version } : {}) });
    const locs: string[] = [];
    for (let a = 0; a < 20; a++) for (let b = 1; b <= 10; b++) {
      const r = run('create_location', { code: `${String.fromCharCode(65 + a)}-${String(b).padStart(2, '0')}-01`, kind: 'RACK' });
      if (r.ok) locs.push(r.target_id!);
    }
    const jobs: string[] = [];
    for (let j = 0; j < 100; j++) {
      const r = run('create_job', { code: `J-${1000 + j}`, name: `Generated job ${j}` });
      if (r.ok) jobs.push(r.target_id!);
    }
    const descs = ['Lighting fixtures', 'Door hardware', 'Floor tile', 'Ceiling tile', 'Anchor bolts', 'Wire spools', 'HVAC diffusers'];
    for (let i = 0; i < 10_000; i++) {
      const r = run('receive', { job_id: jobs[i % jobs.length], description: descs[i % descs.length] });
      if (r.ok && i % 4 !== 0) {
        const placed = run('place', { location_id: locs[i % locs.length] }, r.current_state!);
        if (placed.ok && i % 3 === 0) run('move', { location_id: locs[(i * 7) % locs.length] }, placed.current_state!);
      }
    }
    return db;
  },
  run(h) {
    const total = Object.keys(h.db.pallets).length;
    const events = h.eventCount();
    h.note('Generated workspace', `${total.toLocaleString()} pallets, ${events.toLocaleString()} events`);
    const queries = ['J-1042', 'P-004242', 'floor tile', 'J-10', 'A-03-01', 'anchor', 'P-00', 'ceiling tile', 'J-1099', 'hardware'];
    const times: number[] = [];
    for (let round = 0; round < 5; round++) {
      for (const q of queries) {
        const t0 = performance.now();
        h.engine.search(h.users.viewer, h.ws, { q });
        times.push(performance.now() - t0);
      }
    }
    times.sort((a, b) => a - b);
    const p95 = times[Math.floor(times.length * 0.95) - 1];
    h.note('Median', `${times[Math.floor(times.length / 2)].toFixed(1)} ms`);
    h.expect(p95 < 1000, '95th percentile under the 1,000 ms target', `${p95.toFixed(1)} ms across ${times.length} searches`);
    // Sanity: the pure ranking function agrees with the engine on the exact-code case.
    const rows = Object.values(h.db.pallets).map((pallet) => ({ pallet, job: h.db.jobs[pallet.job_id], location: null, lastLocation: null }));
    h.equal(searchRows(rows, { q: 'P-004242' }).items[0]?.pallet.code, 'P-004242', 'Exact pallet code ranks first');
  },
});

export const SCENARIOS: Scenario[] = S;

export const GROUPS = [...new Set(S.map((s) => s.group))];

/** Used by the tiny fixture check so the lab reports what it ran against. */
export function tinyFixtureSummary() {
  const db = seedTiny({ now: FIXED_NOW });
  return { pallets: Object.keys(db.pallets).length, events: Object.values(db.events).flat().length };
}
