// Scheduled counts, move tasks, the lots setting and warehouse access, inside the command engine. Runs in the same
// transaction as every other command (the sample's undo log, or the Firebase command function's Firestore
// transaction), so a count and every pallet its review changes are saved together or not at all.
//
// Counts: a manager schedules a count of a zone or a spot for a person (once, weekly or monthly). That person scans
// each spot in the Scan station's Count mode and sends the result. A count that matches the records is saved at
// once; one with differences waits for a manager, who approves it (each difference is saved as a location check,
// a missing mark, a move or a found record) or sends it back to be counted again.
//
// Move tasks: a manager queues "move this pallet to that spot" or "put these away". The crew's ordinary move or
// placement completes the task in the same transaction, so a task is never left open after the pallet moved.
//
// Warehouse access: a manager chooses which of the account's warehouses a teammate can open. Access elsewhere is
// paused (the membership stays, marked limited), so the engine, the command function and the Firestore rules all
// refuse that warehouse until a manager gives it back.
//
// The Firebase command function loads exactly what these rules read (firebase/functions/src/work.ts); keep the two
// in step.

import { warehouseDate } from '../domain/receiving';
import { checkTransition, ROLE_RANK } from '../domain/transitions';
import type { AdminAudit, CommandEnvelope, CommandRejected, CommandResult, CountLine, CountRepeat, CountTask, ErrorCode, Location, MoveTask, Pallet, PalletCommandKind, Role } from '../domain/types';
import { countDifferences, countLines, expectedAt, MAX_COUNT_LINES, MAX_COUNT_SPOTS, moveTaskId, nextDue, zoneSpots } from '../domain/work';
import type { Engine, Tx } from './engine';

type Reject = (code: ErrorCode, message: string, current?: Pallet | null) => CommandRejected;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function workCommand(e: Engine, tx: Tx, actorId: string, cmd: CommandEnvelope, now: string, reject: Reject): CommandResult {
  const ws = cmd.workspace_id;
  e.commandId = cmd.command_id;
  if (cmd.kind === 'set_access') return setAccess(e, tx, actorId, cmd, now, reject);
  const wh = e.activeWarehouse(ws);
  if (!wh) return reject('INVALID_STATE', 'This company has no active warehouse.');
  const p = cmd.payload as Record<string, unknown>;
  const member = e.membership(actorId, ws)!;
  const manager = ROLE_RANK[member.role] >= ROLE_RANK.SUPERVISOR;
  const actorName = e.db.users[actorId]?.name ?? '';
  const today = warehouseDate(wh.timezone || 'UTC', new Date(now));
  const audit = (targetId: string, before: Record<string, unknown> | null, after: Record<string, unknown> | null, reason: string | null = null) => {
    const a: AdminAudit = { id: e.newId(), workspace_id: ws, actor_id: actorId, action: cmd.kind as AdminAudit['action'], target_id: targetId, before, after, reason, accepted_at: now, command_id: cmd.command_id };
    tx.appendAudit(a);
    return a.id;
  };
  /** An active teammate here who can count and move: operator or above. */
  const worker = (id: unknown) => {
    const m = typeof id === 'string' ? e.membership(id, ws) : null;
    return m && ROLE_RANK[m.role] >= ROLE_RANK.OPERATOR ? m : null;
  };
  const findCount = (): CountTask | null => {
    const c = e.db.counts[String(p.count_id ?? '')];
    return c && c.workspace_id === ws ? c : null;
  };

  switch (cmd.kind) {
    case 'set_lots': {
      const on = !!p.on;
      if (!!wh.lots === on) return reject('INVALID_INPUT', on ? 'Lot and expiry tracking is already on.' : 'Lot and expiry tracking is already off.');
      // No version bump, like set_measurements: it must not conflict with an open warehouse details form.
      tx.put('warehouses', wh.id, { ...wh, lots: on, updated_at: now });
      return e.accepted(cmd, now, audit(wh.id, { lots: !!wh.lots }, { lots: on }), null, wh.id);
    }

    case 'schedule_count': {
      const q = p as { scope: 'zone' | 'spot'; zone?: string; location_id?: string; assigned_to: string; due_on: string; repeat: CountRepeat; note?: string };
      const locations = Object.values(e.db.locations).filter((l) => l.workspace_id === ws);
      let spots: Location[];
      let name: string;
      if (q.scope === 'zone') {
        const zone = (q.zone ?? '').trim().toUpperCase();
        if (!zone) return reject('INVALID_INPUT', 'Choose the zone to count.');
        spots = zoneSpots(locations, wh.id, zone);
        if (!spots.length) return reject('NOT_FOUND', `Zone ${zone} has no active spots.`);
        if (spots.length > MAX_COUNT_SPOTS) return reject('INVALID_INPUT', `Zone ${zone} has ${spots.length} spots. A count covers up to ${MAX_COUNT_SPOTS}, so schedule single spots instead.`);
        name = `Zone ${zone}`;
      } else {
        const loc = e.db.locations[q.location_id ?? ''];
        if (!loc || loc.workspace_id !== ws || loc.warehouse_id !== wh.id) return reject('NOT_FOUND', 'Choose the spot to count.');
        if (!loc.active) return reject('INACTIVE_LOCATION', `${loc.code} is inactive. Choose an active spot.`);
        spots = [loc];
        name = loc.code;
      }
      const who = worker(q.assigned_to);
      if (!who) return reject('INVALID_INPUT', 'Choose a teammate who can count here (operator, manager or owner).');
      if (q.due_on < today) return reject('INVALID_INPUT', 'Choose today or a later day.');
      const note = (q.note ?? '').trim();
      const count: CountTask = {
        id: e.newId(),
        workspace_id: ws,
        warehouse_id: wh.id,
        name,
        scope: q.scope,
        zone: q.scope === 'zone' ? (q.zone ?? '').trim().toUpperCase() : null,
        location_ids: spots.map((l) => l.id),
        location_codes: spots.map((l) => l.code),
        assigned_to: who.user_id,
        assigned_name: e.db.users[who.user_id]?.name ?? '',
        due_on: q.due_on,
        repeat: q.repeat,
        status: 'OPEN',
        note: note || null,
        created_by: actorId,
        created_by_name: actorName,
        created_at: now,
        submitted_at: null,
        submitted_by_name: null,
        lines: [],
        unknown: [],
        reviewed_at: null,
        reviewed_by_name: null,
        review_note: null,
        next_id: null,
        version: 1,
        updated_at: now,
      };
      tx.put('counts', count.id, count);
      const a = audit(count.id, null, { name, assigned_to: count.assigned_name, due_on: count.due_on, repeat: count.repeat });
      const r = e.accepted(cmd, now, a, null, count.id);
      r.created_ids = [count.id];
      return r;
    }

    case 'cancel_count': {
      const c = findCount();
      if (!c) return reject('NOT_FOUND', 'Count not found.');
      if (c.status !== 'OPEN' && c.status !== 'REVIEW') return reject('INVALID_STATE', `The count of ${c.name} is already ${c.status === 'DONE' ? 'saved' : 'cancelled'}.`);
      const reason = String(p.reason ?? '').trim();
      tx.put('counts', c.id, { ...c, status: 'CANCELLED', review_note: reason || c.review_note, version: c.version + 1, updated_at: now });
      return e.accepted(cmd, now, audit(c.id, { status: c.status }, { status: 'CANCELLED' }, reason || null), null, c.id);
    }

    case 'submit_count': {
      const c = findCount();
      if (!c) return reject('NOT_FOUND', 'Count not found.');
      if (cmd.expected_version !== c.version) return reject('VERSION_CONFLICT', `The count of ${c.name} changed since you opened it. Open it again.`);
      if (c.status !== 'OPEN') return reject('INVALID_STATE', c.status === 'REVIEW' ? `The count of ${c.name} was already sent for review.` : `The count of ${c.name} is ${c.status === 'DONE' ? 'already saved' : 'cancelled'}.`);
      if (c.assigned_to !== actorId && !manager) return reject('FORBIDDEN', `This count is assigned to ${c.assigned_name}.`);
      const spots = p.spots as { location_id: string; pallet_ids: string[]; unknown: string[] }[];
      const sent = spots.map((s) => s.location_id);
      if (new Set(sent).size !== sent.length || sent.length !== c.location_ids.length || !c.location_ids.every((id) => sent.includes(id))) {
        return reject('INVALID_INPUT', `Count every spot on this count once: ${c.location_codes.join(', ')}.`);
      }
      const here = Object.values(e.db.pallets).filter((x) => x.workspace_id === ws);
      const codeOf = (id: string | null) => (id ? (e.db.locations[id]?.code ?? null) : null);
      let lines: CountLine[] = [];
      const unknown: CountTask['unknown'] = [];
      const seen = new Map<string, string>();
      for (const s of spots) {
        const spot = e.db.locations[s.location_id];
        if (!spot || spot.workspace_id !== ws) return reject('NOT_FOUND', 'A spot on this count was not found.');
        const scanned: Pallet[] = [];
        for (const id of new Set(s.pallet_ids)) {
          const pal = e.db.pallets[id];
          if (!pal || pal.workspace_id !== ws) return reject('NOT_FOUND', 'A pallet you scanned was not found in this warehouse. Count that spot again.');
          if (seen.has(id)) return reject('INVALID_INPUT', `${pal.code} was scanned on ${seen.get(id)} and on ${spot.code}. Count those spots again.`);
          seen.set(id, spot.code);
          scanned.push(pal);
        }
        lines.push(...countLines(spot, scanned, expectedAt(here, spot.id), codeOf));
        for (const raw of new Set(s.unknown.map((u) => u.trim()).filter(Boolean))) unknown.push({ location_code: spot.code, raw });
      }
      // A pallet on record at one spot of this count and scanned on another is simply in the wrong spot: a move, not missing.
      lines = lines.filter((l) => l.kind !== 'missing' || !seen.has(l.pallet_id));
      if (lines.length > MAX_COUNT_LINES) return reject('INVALID_INPUT', `This count lists ${lines.length} pallets. Split it into smaller counts of up to ${MAX_COUNT_LINES}.`);
      const next: CountTask = { ...c, lines, unknown, submitted_at: now, submitted_by_name: actorName, review_note: null, version: c.version + 1, updated_at: now, status: 'REVIEW' };
      const differences = countDifferences(next);
      // A count that matches the records needs no review: every pallet gets a location check now.
      if (!differences) {
        applyCount(e, tx, next, actorId, now);
        next.status = 'DONE';
        next.reviewed_at = now;
        next.reviewed_by_name = actorName;
        repeatCount(e, tx, next, actorId, actorName, now);
      }
      tx.put('counts', c.id, next);
      const a = audit(c.id, { status: c.status }, { status: next.status, pallets: lines.length, differences });
      return e.accepted(cmd, now, a, null, c.id);
    }

    case 'review_count': {
      const c = findCount();
      if (!c) return reject('NOT_FOUND', 'Count not found.');
      if (cmd.expected_version !== c.version) return reject('VERSION_CONFLICT', `The count of ${c.name} changed since you opened it. Review it again.`);
      if (c.status !== 'REVIEW') return reject('INVALID_STATE', c.status === 'OPEN' ? `The count of ${c.name} has not been sent yet.` : `The count of ${c.name} is ${c.status === 'DONE' ? 'already saved' : 'cancelled'}.`);
      const note = String(p.note ?? '').trim();
      const next: CountTask = { ...c, lines: c.lines.map((l) => ({ ...l })), reviewed_at: now, reviewed_by_name: actorName, review_note: note || null, version: c.version + 1, updated_at: now };
      let saved = 0;
      if (p.approve) {
        saved = applyCount(e, tx, next, actorId, now);
        next.status = 'DONE';
        repeatCount(e, tx, next, actorId, actorName, now);
      } else {
        // Sent back: count it again. The earlier result is dropped; the note says why.
        Object.assign(next, { status: 'OPEN', lines: [], unknown: [], submitted_at: null, submitted_by_name: null });
      }
      tx.put('counts', c.id, next);
      const a = audit(c.id, { status: c.status }, { status: next.status, saved, skipped: next.lines.filter((l) => l.result === 'skipped').length }, note || null);
      return e.accepted(cmd, now, a, null, c.id);
    }

    case 'queue_moves': {
      const q = p as { lines: { pallet_id: string; to_location_id: string | null }[]; assigned_to?: string; note?: string };
      if (new Set(q.lines.map((l) => l.pallet_id)).size !== q.lines.length) return reject('INVALID_INPUT', 'A pallet is listed twice.');
      const who = q.assigned_to ? worker(q.assigned_to) : null;
      if (q.assigned_to && !who) return reject('INVALID_INPUT', 'Choose a teammate who can move pallets here (operator, manager or owner).');
      const note = (q.note ?? '').trim();
      const ids: string[] = [];
      for (const l of q.lines) {
        const pal = e.db.pallets[l.pallet_id];
        if (!pal || pal.workspace_id !== ws) return reject('NOT_FOUND', 'A pallet on this list was not found in this warehouse.');
        if ((pal.state !== 'STORED' && pal.state !== 'RECEIVED') || pal.archived_at) return reject('INVALID_STATE', `${pal.code} cannot be moved now. Only stored pallets and pallets waiting for a spot can.`, pal);
        let to: Location | null = null;
        if (l.to_location_id) {
          to = e.db.locations[l.to_location_id] ?? null;
          if (!to || to.workspace_id !== ws || to.warehouse_id !== wh.id) return reject('NOT_FOUND', `The spot for ${pal.code} was not found.`);
          if (!to.active) return reject('INACTIVE_LOCATION', `${to.code} is inactive. Choose an active spot.`);
          if (pal.state === 'STORED' && pal.current_location_id === to.id) return reject('INVALID_INPUT', `${pal.code} is already on ${to.code}.`);
        } else if (pal.state !== 'RECEIVED') return reject('INVALID_INPUT', `Choose where ${pal.code} goes. "Put away" without a spot is for pallets waiting for one.`);
        const task: MoveTask = {
          id: moveTaskId(pal.id),
          workspace_id: ws,
          pallet_id: pal.id,
          code: pal.code,
          description: pal.description,
          to_location_id: to?.id ?? null,
          to_location_code: to?.code ?? null,
          from_location_code: pal.current_location_id ? (e.db.locations[pal.current_location_id]?.code ?? null) : null,
          assigned_to: who?.user_id ?? null,
          assigned_name: who ? (e.db.users[who.user_id]?.name ?? '') : null,
          note: note || null,
          status: 'OPEN',
          created_by: actorId,
          created_by_name: actorName,
          created_at: now,
          done_at: null,
          done_by_name: null,
          done_location_code: null,
          updated_at: now,
        };
        tx.put('tasks', task.id, task);
        ids.push(task.id);
      }
      const a = audit(ids[0], null, { tasks: ids.length, assigned_to: who ? (e.db.users[who.user_id]?.name ?? '') : null });
      const r = e.accepted(cmd, now, a, null, ids[0]);
      r.created_ids = ids;
      return r;
    }

    case 'cancel_move': {
      const t = e.db.tasks[String(p.task_id)];
      if (!t || t.workspace_id !== ws) return reject('NOT_FOUND', 'Move task not found.');
      if (t.status !== 'OPEN') return reject('INVALID_STATE', `The move of ${t.code} is already ${t.status === 'DONE' ? 'done' : 'cancelled'}.`);
      const reason = String(p.reason ?? '').trim();
      tx.put('tasks', t.id, { ...t, status: 'CANCELLED', updated_at: now });
      return e.accepted(cmd, now, audit(t.id, { status: 'OPEN' }, { status: 'CANCELLED' }, reason || null), null, t.id);
    }
  }
  return reject('INVALID_INPUT', 'Unknown command.');
}

/** Save each line of an approved count. A pallet that changed after the count is skipped and left for a recount. */
function applyCount(e: Engine, tx: Tx, c: CountTask, actorId: string, now: string): number {
  let saved = 0;
  for (const line of c.lines) {
    const pal = e.db.pallets[line.pallet_id];
    const spot = e.db.locations[line.location_id];
    line.result = 'skipped';
    if (!pal || pal.workspace_id !== c.workspace_id || pal.version !== line.version || !spot) continue;
    let kind: PalletCommandKind | null = null;
    let reason: string | null = null;
    if (line.kind === 'matched') kind = 'verify_location';
    else if (line.kind === 'missing') {
      kind = 'mark_missing';
      reason = `Not found on ${spot.code} during the count of ${c.name}.`;
    } else if (pal.state === 'MISSING') {
      kind = 'locate';
      reason = `Found on ${spot.code} during the count of ${c.name}.`;
    } else if (pal.state === 'STORED') kind = 'move';
    else if (pal.state === 'RECEIVED') kind = 'place';
    if (!kind) continue;
    const outcome = checkTransition(kind, { pallet: pal, job: e.db.jobs[pal.job_id], location: spot, payload: { location_id: spot.id, reason }, now, actorId });
    if (!outcome.ok) continue;
    const next: Pallet = { ...pal, ...outcome.patch, version: pal.version + 1, updated_at: now };
    e.palletEvent(tx, pal, next, kind, actorId, now, outcome.reason, { ...outcome.detail, count: c.name, count_id: c.id });
    line.result = 'saved';
    saved++;
  }
  return saved;
}

/** A repeating count schedules its next one when it is saved, for the same spots and person. */
function repeatCount(e: Engine, tx: Tx, c: CountTask, actorId: string, actorName: string, now: string) {
  const due = nextDue(c.due_on, c.repeat);
  if (!due) return;
  const next: CountTask = {
    ...c,
    id: e.newId(),
    due_on: due,
    status: 'OPEN',
    created_by: actorId,
    created_by_name: actorName,
    created_at: now,
    submitted_at: null,
    submitted_by_name: null,
    lines: [],
    unknown: [],
    reviewed_at: null,
    reviewed_by_name: null,
    review_note: null,
    next_id: null,
    version: 1,
    updated_at: now,
  };
  tx.put('counts', next.id, next);
  c.next_id = next.id;
}

/**
 * Which of the account's warehouses a teammate can open. Every warehouse whose access changes must be one the actor
 * manages; owner access stays an owner's decision, and no warehouse loses its last owner.
 */
function setAccess(e: Engine, tx: Tx, actorId: string, cmd: CommandEnvelope, now: string, reject: Reject): CommandResult {
  const ws = cmd.workspace_id;
  const q = cmd.payload as { user_id: string; workspace_ids: string[] };
  const account = e.db.workspaces[ws]?.account_id;
  if (!account) return reject('INVALID_STATE', 'This warehouse is not part of an account with other warehouses.');
  if (q.user_id === actorId) return reject('FORBIDDEN', 'Ask another manager to change your own access.');
  const all = Object.values(e.db.workspaces).filter((w) => w.account_id === account);
  const want = new Set(q.workspace_ids);
  if ([...want].some((id) => !all.some((w) => w.id === id))) return reject('NOT_FOUND', 'That warehouse is not part of this account.');
  const here = e.db.memberships.find((m) => m.workspace_id === ws && m.user_id === q.user_id);
  if (!here) return reject('NOT_FOUND', 'Person not found.');
  const name = (id: string) => e.activeWarehouse(id)?.name ?? e.db.workspaces[id]?.name ?? 'Warehouse';
  const person = e.db.users[q.user_id]?.name ?? 'This person';
  const before = all.filter((w) => e.db.memberships.some((m) => m.workspace_id === w.id && m.user_id === q.user_id && m.active)).map((w) => name(w.id));
  let changed = 0;
  let firstAudit: string | null = null;
  for (const w of all) {
    const tm = e.db.memberships.find((m) => m.workspace_id === w.id && m.user_id === q.user_id);
    const has = !!tm?.active;
    const keep = want.has(w.id);
    if (keep === has) continue;
    const actor = e.membership(actorId, w.id);
    if (!actor || ROLE_RANK[actor.role] < ROLE_RANK.SUPERVISOR) return reject('FORBIDDEN', `You cannot change access at ${name(w.id)}. Ask a manager there.`);
    const role: Role = tm?.role ?? here.role;
    if (role === 'OWNER' && actor.role !== 'OWNER') return reject('FORBIDDEN', 'Only an owner can change owner access.');
    if (!keep) {
      if (role === 'OWNER' && e.db.memberships.filter((m) => m.workspace_id === w.id && m.role === 'OWNER' && m.active).length <= 1) {
        return reject('INVALID_STATE', `${name(w.id)} must keep at least one active owner.`);
      }
      tx.updateMembership(tm!, { active: false, limited: true });
    } else if (tm) tx.updateMembership(tm, { active: true, limited: false });
    else tx.membership({ workspace_id: w.id, user_id: q.user_id, role, active: true });
    changed++;
    const a: AdminAudit = {
      id: e.newId(),
      workspace_id: w.id,
      actor_id: actorId,
      action: 'set_access',
      target_id: q.user_id,
      before: { access: has ? 'yes' : 'no' },
      after: { access: keep ? 'yes' : 'no', person },
      reason: null,
      accepted_at: now,
      command_id: cmd.command_id,
    };
    tx.appendAudit(a);
    firstAudit ??= a.id;
  }
  if (!changed) return reject('INVALID_INPUT', 'Nothing changed.');
  const after = all.filter((w) => want.has(w.id)).map((w) => name(w.id));
  if (!e.db.audit.some((a) => a.command_id === cmd.command_id && a.workspace_id === ws)) {
    const a: AdminAudit = { id: e.newId(), workspace_id: ws, actor_id: actorId, action: 'set_access', target_id: q.user_id, before: { warehouses: before.join(', ') }, after: { warehouses: after.join(', '), person }, reason: null, accepted_at: now, command_id: cmd.command_id };
    tx.appendAudit(a);
    firstAudit = a.id;
  }
  return e.accepted(cmd, now, firstAudit, null, q.user_id);
}

/** What a scheduled count or a move task means for the person reading the list. */
export function countSummaryText(c: CountTask): string {
  const d = countDifferences(c);
  return d ? `${plural(d, 'difference')} to review` : 'Matches the records';
}
