import { blankInfo, receivingSchema } from './receiving';
import { STATE_LABEL } from './display';
import { adjustQty, withQty } from './stock';
// Pure transition checker (blueprint pages 7, 12, 14, 15, 21).
// Given the locked, re-read server values, decide whether a command is allowed and what it changes.
// The engine owns persistence; this module owns the rules.

import type { AdjustReason, CommandKind, ErrorCode, EventType, Job, Location, Pallet, PalletCommandKind, PalletState, Role } from './types';

export const ROLE_RANK: Record<Role, number> = { VIEWER: 0, OPERATOR: 1, SUPERVISOR: 2, OWNER: 3 };

export const MIN_ROLE: Record<CommandKind, Role> = {
  receive: 'OPERATOR',
  place: 'OPERATOR',
  move: 'OPERATOR',
  verify_location: 'OPERATOR',
  dispatch: 'OPERATOR',
  return: 'OPERATOR',
  mark_missing: 'OPERATOR',
  apply_hold: 'OPERATOR',
  edit_details: 'OPERATOR',
  add_photo: 'OPERATOR',
  locate: 'SUPERVISOR',
  clear_hold: 'SUPERVISOR',
  reassign_job: 'SUPERVISOR',
  remove_photo: 'SUPERVISOR',
  correct: 'SUPERVISOR',
  retire: 'SUPERVISOR',
  archive: 'SUPERVISOR',
  rotate_label: 'SUPERVISOR',
  label_applied: 'OPERATOR',
  split: 'SUPERVISOR',
  update_warehouse: 'SUPERVISOR',
  create_job: 'SUPERVISOR',
  close_job: 'SUPERVISOR',
  reopen_job: 'SUPERVISOR',
  create_location: 'SUPERVISOR',
  rename_location: 'SUPERVISOR',
  deactivate_location: 'SUPERVISOR',
  reactivate_location: 'SUPERVISOR',
  invite_member: 'SUPERVISOR',
  change_role: 'SUPERVISOR',
  remove_member: 'SUPERVISOR',
  import_batch: 'SUPERVISOR',
  rename_import: 'SUPERVISOR',
  save_product: 'SUPERVISOR',
  report_issue: 'OPERATOR',
  update_issue: 'SUPERVISOR',
  set_location_capacity: 'SUPERVISOR',
  set_measurements: 'SUPERVISOR',
  set_setup: 'SUPERVISOR',
  set_onboarding: 'SUPERVISOR',
  create_transfer: 'OPERATOR',
  send_transfer: 'OPERATOR',
  receive_transfer: 'OPERATOR',
  // Anyone who can send may cancel a draft. Once sent, the engine requires a manager or owner.
  cancel_transfer: 'OPERATOR',
  transfer_now: 'OPERATOR',
  // Turning a draft transfer into a pick order is a manager's call; anyone who hands off orders can send it that way.
  pick_transfer: 'SUPERVISOR',
  hand_off_transfer: 'OPERATOR',
  // Orders: operators pick, pack, stage and hand off; managers manage orders and batches and decide substitutions;
  // owners choose the settings (box types, cart size, substitution policy).
  set_orders: 'OWNER',
  create_order: 'SUPERVISOR',
  cancel_order: 'SUPERVISOR',
  // An operator starts the next batch for themselves; choosing orders or a picker is checked as a manager's in the engine.
  start_batch: 'OPERATOR',
  assign_tote: 'OPERATOR',
  short_pick: 'OPERATOR',
  // Finishing with stops still open is a manager's call; the engine checks it.
  finish_batch: 'OPERATOR',
  decide_sub: 'SUPERVISOR',
  pack: 'OPERATOR',
  stage_package: 'OPERATOR',
  hand_off: 'OPERATOR',
  pick: 'OPERATOR',
  substitute: 'OPERATOR',
  // Stock: operators record quantity changes (a manager approves them when the warehouse asks for that); managers set
  // minimums on products, note reorders and decide whether quantity changes need approval.
  adjust_qty: 'OPERATOR',
  review_adjust: 'SUPERVISOR',
  note_reorder: 'SUPERVISOR',
  set_adjust_approval: 'SUPERVISOR',
  // Managers schedule counts and review their differences; the person a count is assigned to runs it (the engine checks).
  schedule_count: 'SUPERVISOR',
  cancel_count: 'SUPERVISOR',
  submit_count: 'OPERATOR',
  review_count: 'SUPERVISOR',
  // Managers queue moves; the crew completes them by moving the pallet, which needs no extra command.
  queue_moves: 'SUPERVISOR',
  cancel_move: 'SUPERVISOR',
  set_lots: 'SUPERVISOR',
  set_access: 'SUPERVISOR',
};

export function roleAllows(role: Role | null | undefined, kind: CommandKind): boolean {
  if (!role) return false;
  return ROLE_RANK[role] >= ROLE_RANK[MIN_ROLE[kind]];
}

export { STATE_LABEL } from './display';

export const COMMAND_LABEL: Record<CommandKind, string> = {
  receive: 'Received',
  place: 'Placed',
  move: 'Moved',
  verify_location: 'Verified location',
  dispatch: 'Dispatched',
  return: 'Return recorded',
  mark_missing: 'Marked missing',
  locate: 'Found',
  apply_hold: 'Hold applied',
  clear_hold: 'Hold cleared',
  reassign_job: 'Job changed',
  edit_details: 'Details edited',
  add_photo: 'Photo added',
  remove_photo: 'Photo removed',
  correct: 'Correction',
  retire: 'Retired',
  archive: 'Archived',
  rotate_label: 'Label replaced',
  label_applied: 'New label applied',
  split: 'Split',
  update_warehouse: 'Warehouse details updated',
  create_job: 'Job created',
  close_job: 'Job closed',
  reopen_job: 'Job reopened',
  create_location: 'Location created',
  rename_location: 'Location renamed',
  deactivate_location: 'Location deactivated',
  reactivate_location: 'Location reactivated',
  invite_member: 'Person invited',
  change_role: 'Role changed',
  remove_member: 'Access removed',
  import_batch: 'Import committed',
  rename_import: 'Import renamed',
  save_product: 'Product saved',
  report_issue: 'Issue reported',
  update_issue: 'Issue reviewed',
  set_location_capacity: 'Location capacity set',
  set_measurements: 'Weight and size tracking changed',
  set_setup: 'Warehouse setup changed',
  set_onboarding: 'Setup checklist updated',
  create_transfer: 'Transfer created',
  send_transfer: 'Transfer sent',
  receive_transfer: 'Received from transfer',
  cancel_transfer: 'Transfer cancelled',
  transfer_now: 'Transferred',
  pick_transfer: 'Transfer picked as an order',
  hand_off_transfer: 'Transfer handed off',
  set_orders: 'Orders settings changed',
  create_order: 'Order created',
  cancel_order: 'Order cancelled',
  start_batch: 'Pick batch started',
  assign_tote: 'Tote assigned',
  short_pick: 'Short recorded',
  finish_batch: 'Pick batch finished',
  decide_sub: 'Substitute decided',
  pack: 'Packed',
  stage_package: 'Package staged',
  hand_off: 'Handed off',
  pick: 'Picked',
  substitute: 'Picked as substitute',
  adjust_qty: 'Quantity changed',
  review_adjust: 'Quantity change reviewed',
  note_reorder: 'Reorder noted',
  set_adjust_approval: 'Quantity approval changed',
  schedule_count: 'Count scheduled',
  cancel_count: 'Count cancelled',
  submit_count: 'Count sent for review',
  review_count: 'Count reviewed',
  queue_moves: 'Moves queued',
  cancel_move: 'Move task cancelled',
  set_lots: 'Lot tracking changed',
  set_access: 'Warehouse access changed',
};

export const EVENT_LABEL: Record<EventType, string> = {
  ...(COMMAND_LABEL as Record<PalletCommandKind, string>),
  split_child: 'Created by split',
  import_receive: 'Received by import',
  transfer_send: 'Sent on transfer',
  transfer_receive: 'Received from transfer',
  transfer_return: 'Back from cancelled transfer',
  pack: 'Packed',
  unpick: 'Back from an order',
  hand_off: 'Handed off',
  pick_missing: 'Not found while picking',
  pick_hold: 'Damaged while picking',
};

export interface TransitionInput {
  pallet: Pallet;
  job: Job | undefined;
  /** Destination or observed location, already checked to belong to the same workspace. */
  location?: Location | null;
  newJob?: Job | null;
  payload: Record<string, unknown>;
  now: string;
  actorId: string;
}

export type PalletPatch = Partial<
  Pick<
    Pallet,
    | 'receiving'
    | 'state'
    | 'current_location_id'
    | 'last_confirmed_location_id'
    | 'last_confirmed_at'
    | 'hold'
    | 'job_id'
    | 'description'
    | 'notes'
    | 'supplier_ref'
    | 'archived_at'
    | 'label_needs_reprint'
    | 'pending_adjust'
  >
>;

export type TransitionOutcome =
  | { ok: true; patch: PalletPatch; reason: string | null; detail: Record<string, string | number | boolean | null> }
  | { ok: false; code: ErrorCode; message: string };

const reject = (code: ErrorCode, message: string): TransitionOutcome => ({ ok: false, code, message });

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function needsReason(payload: Record<string, unknown>): string | null {
  const r = str(payload.reason);
  return r.length > 0 ? r : null;
}

function locationGuard(pallet: Pallet, loc: Location | null | undefined): TransitionOutcome | null {
  if (!loc) return reject('NOT_FOUND', 'That location was not found.');
  if (loc.warehouse_id !== pallet.warehouse_id) {
    return reject('INVALID_INPUT', 'That label belongs to a different warehouse.');
  }
  if (!loc.active) return reject('INACTIVE_LOCATION', `${loc.code} is inactive. Choose an active location.`);
  return null;
}

/** Explain why an ordinary Move cannot proceed, with the route the operator should take instead (page 12). */
export function moveBlocker(pallet: Pallet): { code: ErrorCode; message: string; route?: 'return' | 'locate' | 'transfer' } | null {
  switch (pallet.state) {
    case 'IN_TRANSIT':
      return { code: 'INVALID_STATE', message: inTransitMessage(pallet), route: 'transfer' };
    case 'PICKED':
      return { code: 'INVALID_STATE', message: pickedMessage(pallet) };
    case 'DISPATCHED':
      return { code: 'INVALID_STATE', message: `${pallet.code} was dispatched. Record a return before placing it.`, route: 'return' };
    case 'MISSING':
      return { code: 'INVALID_STATE', message: `${pallet.code} is marked missing. A supervisor records where it was found.`, route: 'locate' };
    case 'RETIRED':
      return { code: 'INVALID_STATE', message: `${pallet.code} is retired and cannot be moved.` };
    default:
      return null;
  }
}

/** Why a unit picked for an order stays with it, and what to do instead. */
export function pickedMessage(pallet: Pallet): string {
  const o = pallet.order;
  return o ? `${pallet.code} is picked for ${o.order_code}${o.package_code ? ` (package ${o.package_code})` : ''}. It leaves with its order, or goes back to stock when the order is cancelled.` : `${pallet.code} is picked for an order.`;
}

/** What may still change on a unit picked for an order: its details, photos and label. */
const WHILE_PICKED: readonly PalletCommandKind[] = ['edit_details', 'add_photo', 'remove_photo', 'rotate_label', 'label_applied'];

/** Why nothing can change a pallet on its way to another warehouse, and what to do instead. */
export function inTransitMessage(pallet: Pallet): string {
  const t = pallet.transfer;
  return t
    ? `${pallet.code} is in transit to ${t.to_name} on ${t.number}. Receive it at ${t.to_name}, or cancel the transfer.`
    : `${pallet.code} is in transit to another warehouse. Receive it there, or cancel the transfer.`;
}

export function checkTransition(kind: PalletCommandKind, input: TransitionInput): TransitionOutcome {
  const { pallet, job, location, newJob, payload, now, actorId } = input;
  const reason = needsReason(payload);

  // A pallet on a transfer belongs to the transfer until it is received or the transfer is cancelled.
  if (pallet.state === 'IN_TRANSIT') return reject('INVALID_STATE', inTransitMessage(pallet));
  if (pallet.state === 'PICKED' && !WHILE_PICKED.includes(kind) && kind !== 'review_adjust') {
    return reject('INVALID_STATE', kind === 'pick' || kind === 'substitute' ? `${pallet.code} is already picked${pallet.order ? ` for ${pallet.order.order_code}` : ''}.` : pickedMessage(pallet));
  }

  if (pallet.state === 'RETIRED' && !['correct', 'archive', 'review_adjust'].includes(kind)) {
    return reject('INVALID_STATE', `${pallet.code} is retired. A supervisor can correct a mistaken retirement.`);
  }

  switch (kind) {
    case 'place': {
      if (pallet.state !== 'RECEIVED') {
        const b = moveBlocker(pallet);
        if (b) return reject(b.code, b.message);
        return reject('INVALID_STATE', `${pallet.code} is already stored. Use Move.`);
      }
      const g = locationGuard(pallet, location);
      if (g) return g;
      return {
        ok: true,
        patch: { state: 'STORED', current_location_id: location!.id, last_confirmed_location_id: location!.id, last_confirmed_at: now },
        reason: null,
        detail: { to_location: location!.code },
      };
    }
    case 'move': {
      const b = moveBlocker(pallet);
      if (b) return reject(b.code, b.message);
      if (pallet.state !== 'STORED') return reject('INVALID_STATE', `${pallet.code} is awaiting placement. Use Place.`);
      const g = locationGuard(pallet, location);
      if (g) return g;
      if (location!.id === pallet.current_location_id) {
        return reject('INVALID_STATE', `${pallet.code} is already recorded at ${location!.code}. Use Confirm still here.`);
      }
      return {
        ok: true,
        patch: { current_location_id: location!.id, last_confirmed_location_id: location!.id, last_confirmed_at: now },
        reason: null,
        detail: { to_location: location!.code },
      };
    }
    case 'verify_location': {
      if (pallet.state !== 'STORED') return reject('INVALID_STATE', `Only a stored pallet can be verified in place.`);
      const g = locationGuard(pallet, location);
      if (g) return g;
      if (location!.id !== pallet.current_location_id) {
        return reject('INVALID_STATE', `${pallet.code} is recorded somewhere else. Use Move instead.`);
      }
      return { ok: true, patch: { last_confirmed_location_id: location!.id, last_confirmed_at: now }, reason: null, detail: { at_location: location!.code } };
    }
    case 'dispatch': {
      if (pallet.state !== 'STORED') {
        return reject('INVALID_STATE', `${pallet.code} is ${STATE_LABEL[pallet.state].toLowerCase()}. Only a pallet stored on a rack or area can be dispatched.`);
      }
      if (pallet.hold) return reject('INVALID_STATE', `${pallet.code} is on hold (${pallet.hold.reason}). A supervisor must clear the hold first.`);
      if (job && job.status !== 'OPEN') return reject('JOB_CLOSED', `Job ${job.code} is closed.`);
      const destination = str(payload.destination);
      if (!destination) return reject('INVALID_INPUT', 'Enter a destination.');
      if (destination.length > 200) return reject('INVALID_INPUT', 'Destination is limited to 200 characters.');
      return {
        ok: true,
        patch: { state: 'DISPATCHED', current_location_id: null },
        reason: str(payload.note) || null,
        detail: { destination },
      };
    }
    case 'return': {
      if (pallet.state !== 'DISPATCHED') return reject('INVALID_STATE', 'Only a dispatched pallet can be returned.');
      if (job && job.status !== 'OPEN') return reject('JOB_CLOSED', `Job ${job.code} is closed. A supervisor must reopen it before the return.`);
      const holdReason = str(payload.hold_reason);
      const condition = str(payload.condition_note);
      if (condition.length > 1000) return reject('INVALID_INPUT', 'Condition note is limited to 1,000 characters.');
      const why = str(payload.reason);
      if (why.length > 500) return reject('INVALID_INPUT', 'Reasons are limited to 500 characters.');
      const kind = payload.condition === 'restock' || payload.condition === 'damaged' ? payload.condition : null;
      // Restock: back into stock on a spot. Damaged: held with the reason, in a quarantine spot when one is chosen.
      // The spot counts only with a condition; a plain return waits for placement as before.
      const spot = kind ? location : null;
      if (kind === 'restock' && !spot) return reject('INVALID_INPUT', 'Choose the spot it goes back to.');
      if (kind === 'damaged' && !why && !holdReason) return reject('INVALID_INPUT', 'Say what is wrong with it.');
      if (spot) {
        const g = locationGuard(pallet, spot);
        if (g) return g;
        if (kind === 'damaged' && spot.kind !== 'QUARANTINE') return reject('INVALID_INPUT', `${spot.code} is not a quarantine spot. Choose a quarantine spot for damaged returns.`);
        if (kind === 'restock' && spot.kind === 'QUARANTINE') return reject('INVALID_INPUT', `${spot.code} is a quarantine spot. Restocked returns go to a spot they can be used from.`);
      }
      const patch: PalletPatch = spot
        ? { state: 'STORED', current_location_id: spot.id, last_confirmed_location_id: spot.id, last_confirmed_at: now }
        : { state: 'RECEIVED', current_location_id: null };
      const holdText = kind === 'damaged' ? `Returned damaged: ${why || holdReason}` : holdReason;
      // A return may add a hold but never silently clears one.
      if (holdText && !pallet.hold) patch.hold = { reason: holdText, applied_by: actorId, applied_at: now };
      return {
        ok: true,
        patch,
        reason: [why, condition].filter(Boolean).join(' · ') || null,
        detail: { hold_added: !!patch.hold, condition: kind, return_reason: why || null, to_location: spot?.code ?? null },
      };
    }
    case 'mark_missing': {
      if (pallet.state !== 'STORED' && pallet.state !== 'RECEIVED') {
        return reject('INVALID_STATE', 'Only a received or stored pallet can be marked missing.');
      }
      if (!reason) return reject('INVALID_INPUT', 'Enter a reason.');
      return { ok: true, patch: { state: 'MISSING', current_location_id: null }, reason, detail: {} };
    }
    case 'locate': {
      if (pallet.state !== 'MISSING') return reject('INVALID_STATE', 'Only a missing pallet can be recorded as found.');
      if (!reason) return reject('INVALID_INPUT', 'Enter where and how it was found.');
      const g = locationGuard(pallet, location);
      if (g) return g;
      return {
        ok: true,
        patch: { state: 'STORED', current_location_id: location!.id, last_confirmed_location_id: location!.id, last_confirmed_at: now },
        reason,
        detail: { to_location: location!.code },
      };
    }
    case 'apply_hold': {
      if (pallet.state === 'DISPATCHED') return reject('INVALID_STATE', 'A dispatched pallet cannot be put on hold.');
      if (pallet.hold) return reject('INVALID_STATE', `${pallet.code} is already on hold.`);
      if (!reason) return reject('INVALID_INPUT', 'Enter a hold reason.');
      return { ok: true, patch: { hold: { reason, applied_by: actorId, applied_at: now } }, reason, detail: {} };
    }
    case 'clear_hold': {
      if (!pallet.hold) return reject('INVALID_STATE', `${pallet.code} is not on hold.`);
      if (!reason) return reject('INVALID_INPUT', 'Enter why the hold is cleared.');
      return { ok: true, patch: { hold: null }, reason, detail: { cleared_hold: pallet.hold.reason } };
    }
    case 'reassign_job': {
      if (pallet.state === 'DISPATCHED') return reject('INVALID_STATE', 'A dispatched pallet keeps its job for history.');
      if (!newJob) return reject('NOT_FOUND', 'That job was not found.');
      if (newJob.status !== 'OPEN') return reject('JOB_CLOSED', `Job ${newJob.code} is closed.`);
      if (newJob.id === pallet.job_id) return reject('INVALID_INPUT', `${pallet.code} is already on ${newJob.code}.`);
      if (!reason) return reject('INVALID_INPUT', 'Enter a reason for the change.');
      return {
        ok: true,
        patch: { job_id: newJob.id, label_needs_reprint: true },
        reason,
        detail: { from_job: job?.code ?? null, to_job: newJob.code },
      };
    }
    case 'edit_details': {
      const patch: PalletPatch = {};
      const detail: Record<string, string | null> = {};
      if (payload.description !== undefined) {
        const d = str(payload.description);
        if (!d) return reject('INVALID_INPUT', 'Description is required.');
        if (d.length > 160) return reject('INVALID_INPUT', 'Description is limited to 160 characters.');
        if (d !== pallet.description) {
          patch.description = d;
          patch.label_needs_reprint = true;
          detail.description = d;
        }
      }
      if (payload.notes !== undefined) {
        const n = str(payload.notes);
        if (n.length > 1000) return reject('INVALID_INPUT', 'Notes are limited to 1,000 characters.');
        if ((n || null) !== pallet.notes) {
          patch.notes = n || null;
          detail.notes = n || null;
        }
      }
      if (payload.supplier_ref !== undefined) {
        const s = str(payload.supplier_ref);
        if (s.length > 80) return reject('INVALID_INPUT', 'Supplier reference is limited to 80 characters.');
        if ((s || null) !== pallet.supplier_ref) {
          patch.supplier_ref = s || null;
          detail.supplier_ref = s || null;
        }
      }
      if (payload.receiving !== undefined) {
        const parsed = receivingSchema.safeParse(payload.receiving);
        if (!parsed.success) return reject('INVALID_INPUT', parsed.error.issues[0].message);
        if (JSON.stringify(parsed.data) !== JSON.stringify(pallet.receiving)) {
          patch.receiving = parsed.data;
          // Weight, size and contents aren't printed on the pallet label, so recording them needs no reprint.
          const printed = (r: object | null | undefined) => {
            const { weight_lb: _w, length_in: _l, width_in: _wi, height_in: _h, contents: _c, contents_unknown: _u, ...rest } = { ...blankInfo(), ...(r ?? {}) };
            return JSON.stringify(rest);
          };
          if (printed(parsed.data) !== printed(pallet.receiving)) patch.label_needs_reprint = true;
          detail.pallet_details = JSON.stringify(parsed.data);
        }
      }
      if (Object.keys(patch).length === 0) return reject('INVALID_INPUT', 'Nothing changed.');
      return { ok: true, patch, reason: str(payload.reason) || null, detail };
    }
    case 'correct': {
      if (!reason) return reject('INVALID_INPUT', 'A correction needs a reason.');
      const target = str(payload.state) as PalletState;
      if (!['RECEIVED', 'STORED', 'MISSING', 'DISPATCHED'].includes(target)) {
        return reject('INVALID_INPUT', 'Choose the pallet’s actual state.');
      }
      const patch: PalletPatch = { state: target, archived_at: null };
      if (target === 'STORED') {
        const g = locationGuard(pallet, location);
        if (g) return g;
        patch.current_location_id = location!.id;
        patch.last_confirmed_location_id = location!.id;
        patch.last_confirmed_at = now;
      } else {
        patch.current_location_id = null;
      }
      const unchanged =
        target === pallet.state && (patch.current_location_id ?? null) === pallet.current_location_id && pallet.state !== 'RETIRED';
      if (unchanged) return reject('INVALID_INPUT', 'That is already the recorded state.');
      return {
        ok: true,
        patch,
        reason,
        detail: { corrects_event_id: str(payload.corrects_event_id) || null, to_location: location?.code ?? null },
      };
    }
    case 'retire': {
      if (!reason) return reject('INVALID_INPUT', 'Enter why this pallet is retired.');
      return { ok: true, patch: { state: 'RETIRED', current_location_id: null }, reason, detail: {} };
    }
    case 'archive': {
      if (pallet.state !== 'RETIRED') return reject('INVALID_STATE', 'Only retired pallets can be archived.');
      if (pallet.archived_at) return reject('INVALID_STATE', `${pallet.code} is already archived.`);
      return { ok: true, patch: { archived_at: now }, reason, detail: {} };
    }
    case 'rotate_label': {
      if (!reason) return reject('INVALID_INPUT', 'Enter why the label is being replaced.');
      return { ok: true, patch: { label_needs_reprint: true }, reason, detail: {} };
    }
    case 'label_applied': {
      if (!pallet.label_needs_reprint) return reject('INVALID_STATE', `${pallet.code} has no pending label reprint.`);
      if (pallet.state === 'RETIRED') return reject('INVALID_STATE', 'Retired pallets do not need labels.');
      return { ok: true, patch: { label_needs_reprint: false }, reason: null, detail: {} };
    }
    case 'split': {
      if (pallet.state !== 'STORED') return reject('INVALID_STATE', 'Only a stored pallet can be split.');
      if (pallet.hold) return reject('INVALID_STATE', `${pallet.code} is on hold. Clear the hold before splitting.`);
      const children = Array.isArray(payload.children) ? payload.children : [];
      if (children.length < 2) return reject('INVALID_INPUT', 'A split needs at least two portions, including any remainder.');
      if (children.length > 20) return reject('INVALID_INPUT', 'A split is limited to 20 portions.');
      for (const [i, c] of children.entries()) {
        const d = str((c as { description?: unknown }).description);
        if (!d) return reject('INVALID_INPUT', `Portion ${i + 1} needs a description.`);
        if (d.length > 160) return reject('INVALID_INPUT', `Portion ${i + 1}: description is limited to 160 characters.`);
      }
      if (!reason) return reject('INVALID_INPUT', 'Confirm you physically verified the portions and give a reason.');
      return { ok: true, patch: { state: 'RETIRED', current_location_id: null }, reason, detail: { portions: children.length } };
    }
    case 'pick':
    case 'substitute': {
      // The order engine runs the rest (batch, stop, order); these are the record's own rules.
      if (pallet.state !== 'STORED') {
        const b = moveBlocker(pallet);
        return reject('INVALID_STATE', b ? b.message : `${pallet.code} is not in a spot yet. Put it away first.`);
      }
      if (pallet.hold) return reject('INVALID_STATE', `${pallet.code} is on hold (${pallet.hold.reason}). Pick another unit.`);
      return { ok: true, patch: { state: 'PICKED', current_location_id: null }, reason: null, detail: {} };
    }
    case 'adjust_qty': {
      if (pallet.state !== 'STORED' && pallet.state !== 'RECEIVED') return reject('INVALID_STATE', `${pallet.code} is ${STATE_LABEL[pallet.state].toLowerCase()}. Only a pallet here can have its quantity changed.`);
      if (pallet.pending_adjust) return reject('INVALID_STATE', `${pallet.code} has a quantity change waiting for a manager. It needs approving or turning down first.`);
      const why = payload.reason as AdjustReason;
      const amount = Number(payload.amount);
      const r = adjustQty(pallet.receiving?.quantity, why, amount);
      if (!r.ok) return reject('INVALID_INPUT', r.message);
      return adjusted(pallet, why, amount, r.from, r.to, str(payload.note) || null);
    }
    case 'review_adjust': {
      const pend = pallet.pending_adjust;
      if (!pend) return reject('INVALID_STATE', `${pallet.code} has no quantity change waiting for approval.`);
      const note = str(payload.note) || null;
      const detail = { adjust_reason: pend.reason, amount: pend.amount, from_qty: pend.from_qty, to_qty: pend.to_qty, unit: pallet.receiving?.unit || null, requested_by: pend.by_name, approved: !!payload.approve };
      if (!payload.approve) return { ok: true, patch: { pending_adjust: null }, reason: note, detail };
      if (pallet.state !== 'STORED' && pallet.state !== 'RECEIVED') return reject('INVALID_STATE', `${pallet.code} is ${STATE_LABEL[pallet.state].toLowerCase()} now. Turn the change down instead.`);
      // Worked out again from the quantity recorded now, in case details were edited while it waited.
      const r = adjustQty(pallet.receiving?.quantity, pend.reason, pend.amount);
      if (!r.ok) return reject('INVALID_STATE', `${r.message} Turn the change down, or ask for a new one.`);
      const a = adjusted(pallet, pend.reason, pend.amount, r.from, r.to, note);
      if (a.ok) Object.assign(a.detail, { requested_by: pend.by_name, approved: true });
      return a.ok ? { ...a, patch: { ...a.patch, pending_adjust: null } } : a;
    }
    case 'add_photo':
    case 'remove_photo':
      // Attachment checks live in the engine; the pallet itself only gains a revision.
      return { ok: true, patch: {}, reason, detail: {} };
    case 'receive':
      return reject('INVALID_INPUT', 'Receive creates a new pallet and has no transition from an existing one.');
  }
}

/**
 * A quantity change: the new quantity text, keeping any words after the number. Using up the last of it retires the
 * pallet, since nothing is left to keep track of.
 */
function adjusted(pallet: Pallet, why: AdjustReason, amount: number, from: number | null, to: number, note: string | null): TransitionOutcome {
  const receiving = { ...blankInfo(), ...(pallet.receiving ?? {}), quantity: withQty(pallet.receiving?.quantity, to) };
  const gone = to === 0;
  const patch: PalletPatch = { receiving };
  if (gone) Object.assign(patch, { state: 'RETIRED', current_location_id: null });
  return { ok: true, patch, reason: note, detail: { adjust_reason: why, amount, from_qty: from, to_qty: to, unit: pallet.receiving?.unit || null, retired: gone } };
}

/** Actions to offer on a pallet record for this role. The server re-checks everything. */
export function availableActions(pallet: Pallet, role: Role | null): PalletCommandKind[] {
  if (!role || pallet.state === 'IN_TRANSIT') return [];
  const out: PalletCommandKind[] = [];
  const add = (k: PalletCommandKind, when: boolean) => when && roleAllows(role, k) && out.push(k);
  if (pallet.state === 'PICKED') {
    for (const k of WHILE_PICKED) add(k, k !== 'label_applied' || pallet.label_needs_reprint);
    add('review_adjust', !!pallet.pending_adjust);
    return out;
  }
  const s = pallet.state;
  add('place', s === 'RECEIVED');
  add('move', s === 'STORED');
  add('verify_location', s === 'STORED');
  add('dispatch', s === 'STORED' && !pallet.hold);
  add('return', s === 'DISPATCHED');
  add('mark_missing', s === 'STORED' || s === 'RECEIVED');
  add('locate', s === 'MISSING');
  add('apply_hold', !pallet.hold && s !== 'DISPATCHED' && s !== 'RETIRED');
  add('clear_hold', !!pallet.hold && s !== 'RETIRED');
  add('reassign_job', s !== 'DISPATCHED' && s !== 'RETIRED');
  add('edit_details', s !== 'RETIRED');
  add('add_photo', s !== 'RETIRED');
  add('correct', true);
  add('retire', s !== 'RETIRED');
  add('archive', s === 'RETIRED' && !pallet.archived_at);
  add('rotate_label', s !== 'RETIRED');
  add('label_applied', pallet.label_needs_reprint && s !== 'RETIRED');
  add('split', s === 'STORED' && !pallet.hold);
  add('adjust_qty', (s === 'STORED' || s === 'RECEIVED') && !pallet.pending_adjust);
  add('review_adjust', !!pallet.pending_adjust);
  return out;
}

/** Invariant from page 7: current_location_id is non-null iff state is STORED. */
export function checkPalletInvariants(p: Pallet): string[] {
  const problems: string[] = [];
  if ((p.state === 'STORED') !== (p.current_location_id !== null)) {
    problems.push(`${p.code}: state ${p.state} with current_location_id ${p.current_location_id}`);
  }
  if (p.archived_at && p.state !== 'RETIRED') problems.push(`${p.code}: archived while ${p.state}`);
  if (p.version < 1) problems.push(`${p.code}: version ${p.version}`);
  return problems;
}
