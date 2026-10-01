import { SETUP_PRESETS } from './terms';
import { receivingSchema } from './receiving';
// Command envelope validation at the boundary (page 22). The server derives actor identity;
// the client never supplies a trusted role, location, timestamp, or revision.

import { z } from 'zod';
import { ADMIN_COMMANDS, PALLET_COMMANDS, type CommandEnvelope, type CommandKind } from './types';

const id = z.string().min(1).max(64);
const text = (max: number) => z.string().max(max);
const reason = text(500).optional();
/** A count or quantity: 0 or more, up to three decimals (2.5 cords). */
const quantity = z.number().nonnegative().max(1_000_000_000).refine((n) => Math.abs(n * 1000 - Math.round(n * 1000)) < 1e-6, 'Use at most three decimals.');
/** Pallets picked for a transfer, each with the version the person saw when picking it. */
const transferLines = z.array(z.object({ pallet_id: id, expected_version: z.number().int().positive() })).min(1).max(50);

export const PAYLOAD_SCHEMAS: Record<CommandKind, z.ZodType<Record<string, unknown>>> = {
  receive: z.object({
    receiving: receivingSchema.optional(),
    remember_product: z.boolean().optional(),
    shipment_id: id.optional(),
    job_id: id.or(z.literal('')).optional(),
    description: text(400),
    notes: text(2000).optional(),
    supplier_ref: text(200).optional(),
  }),
  place: z.object({ location_id: id }),
  move: z.object({ location_id: id }),
  verify_location: z.object({ location_id: id }),
  // A send gets a new dispatch reference (D-000012) unless it joins one this warehouse already issued.
  dispatch: z.object({ destination: text(400), note: text(1000).optional(), join_ref: z.string().regex(/^D-\d{6,9}$/).optional() }),
  return: z.object({ condition_note: text(2000).optional(), hold_reason: text(500).optional() }),
  mark_missing: z.object({ reason }),
  locate: z.object({ location_id: id, reason }),
  apply_hold: z.object({ reason }),
  clear_hold: z.object({ reason }),
  reassign_job: z.object({ job_id: id, reason }),
  edit_details: z.object({
    receiving: receivingSchema.optional(),
    description: text(400).optional(),
    notes: text(2000).optional(),
    supplier_ref: text(200).optional(),
    reason,
  }),
  add_photo: z.object({
    attachment_id: id,
    data_url: z.string().max(8_000_000),
    thumb_url: z.string().max(400_000),
    media_type: z.string().max(40),
    bytes: z.number().int().nonnegative(),
  }),
  remove_photo: z.object({ attachment_id: id, reason }),
  correct: z.object({ corrects_event_id: id.optional(), state: z.string().max(20), location_id: id.optional(), reason }),
  retire: z.object({ reason }),
  archive: z.object({ reason }),
  rotate_label: z.object({ reason }),
  label_applied: z.object({}),
  split: z.object({
    children: z.array(z.object({ description: text(400), job_id: id.or(z.literal('')) })).max(40),
    reason,
  }),
  update_warehouse: z.object({ name: text(100), code: text(20), timezone: text(100), address: text(250), phone: text(40), contact_email: z.union([z.literal(''), z.string().email().max(120)]), receiving_notes: text(500) }),
  create_job: z.object({ code: text(40), name: text(200), destination_notes: text(1000).optional() }),
  close_job: z.object({ job_id: id, reason }),
  reopen_job: z.object({ job_id: id, reason }),
  create_location: z.object({ code: text(40), kind: z.string().max(20) }),
  rename_location: z.object({ location_id: id, code: text(40), reason }),
  deactivate_location: z.object({ location_id: id, reason }),
  reactivate_location: z.object({ location_id: id, reason }),
  invite_member: z.object({ name: text(120), email: text(200), role: z.string().max(20) }),
  change_role: z.object({ user_id: id, role: z.string().max(20), reason }),
  remove_member: z.object({ user_id: id, reason }),
  import_batch: z.object({
    import_kind: z.enum(['locations', 'jobs', 'pallets', 'shipments', 'orders']),
    checksum: z.string().max(64),
    rows: z.array(z.record(z.string(), z.string().max(1000))).max(1000),
    name: text(80).optional(),
    file_name: text(200).optional(),
  }),
  rename_import: z.object({ import_id: id, name: text(80) }),
  report_issue: z.object({
    issue_kind: z.enum(['DAMAGED', 'MISSING', 'WRONG', 'OTHER']),
    description: text(2000),
    pallet_ids: z.array(id).min(1).max(50),
    attachment_ids: z.array(id).max(6).optional(),
  }),
  update_issue: z.object({ issue_id: id, status: z.enum(['NEW', 'APPROVED', 'FILED', 'DISMISSED']), note: text(1000).optional() }),
  save_product: z.object({ code: text(80), description: text(160), unit: text(40).optional(), category: text(60).optional(), length_in: text(8).optional(), width_in: text(8).optional(), height_in: text(8).optional(), weight_lb: text(12).optional(), home_location_id: z.string().max(80).nullable().optional(), create: z.boolean().optional(), min_qty: quantity.nullable().optional(), reorder_qty: quantity.nullable().optional(), count_by: z.enum(['units', 'quantity']).optional() }),
  set_location_capacity: z.object({
    location_id: id,
    spaces: z.number().int().min(0).max(10000),
    stacking: z.number().int().min(1).max(20),
    max_weight_lb: z.number().nonnegative().max(10_000_000).nullable(),
    length_in: z.number().nonnegative().max(10_000).nullable(),
    width_in: z.number().nonnegative().max(10_000).nullable(),
    height_in: z.number().nonnegative().max(10_000).nullable(),
  }),
  set_measurements: z.object({ advanced: z.boolean() }),
  set_setup: z.object({
    preset: z.enum(SETUP_PRESETS).nullable(),
    thing: z.string().trim().min(1).max(24),
    things: z.string().trim().min(1).max(24),
    job: z.string().trim().min(1).max(24),
    jobs: z.string().trim().min(1).max(24),
    jobs_on: z.boolean(),
    advanced: z.boolean().optional(),
  }),
  set_onboarding: z.object({
    state: z.enum(['pending', 'skipped', 'done']),
    done: z.array(z.string().max(24)).max(20),
    zones: z
      .array(
        z.object({
          letter: z.string().trim().regex(/^[A-Z]{1,3}$/),
          name: z.string().trim().min(1).max(40),
          kind: z.enum(['RACK', 'RECEIVING', 'QUARANTINE', 'STAGING', 'FLOOR']),
        }),
      )
      .max(26),
    leave: z.enum(['dispatch', 'retire']).nullable(),
    files: z.enum(['cloud', 'paper']).nullable(),
    barcodes: z.enum(['import', 'scan', 'print']).nullable(),
  }),
  create_transfer: z.object({ to_workspace_id: id, lines: transferLines, note: text(500).optional(), send: z.boolean().optional() }),
  send_transfer: z.object({ transfer_id: id }),
  receive_transfer: z.object({ transfer_id: id, location_id: id.optional() }),
  cancel_transfer: z.object({ transfer_id: id, reason }),
  transfer_now: z.object({ to_workspace_id: id, lines: transferLines.max(20), note: text(500).optional(), location_id: id.optional() }),
  // Orders and picking (src/demo/orderEngine.ts).
  set_orders: z.object({
    on: z.boolean(),
    cart_size: z.number().int().min(1).max(8),
    box_types: z.array(z.string().trim().min(1).max(40)).max(12),
    subs: z.enum(['ask', 'allow', 'never']),
  }),
  create_order: z.object({
    external_ref: text(40).optional(),
    customer: z.object({ name: text(120), phone: text(40).optional(), email: text(120).optional(), address: text(300).optional() }),
    method: z.enum(['ship', 'pickup']),
    due_at: z.union([z.literal(''), z.string().datetime()]).optional(),
    allow_subs: z.boolean(),
    notes: text(1000).optional(),
    lines: z.array(z.object({ product_code: text(80), qty: z.number().int().min(1).max(999) })).min(1).max(50),
  }),
  cancel_order: z.object({ order_id: id, reason }),
  start_batch: z.object({ order_ids: z.array(id).min(1).max(8).optional(), assign_to: id.optional() }),
  assign_tote: z.object({ batch_id: id, letter: z.string().regex(/^[A-H]$/), tote_code: text(12) }),
  short_pick: z.object({ batch_id: id, stop_key: text(40), reason: z.enum(['not_at_spot', 'damaged', 'wrong_item', 'cant_reach', 'no_stock']) }),
  finish_batch: z.object({ batch_id: id, reason }),
  decide_sub: z.object({ order_id: id, pallet_id: id, approve: z.boolean(), note: text(500).optional() }),
  pack: z.object({ order_id: id, unit_ids: z.array(id).min(1).max(100), box_type: text(40), weight_lb: z.number().nonnegative().max(100_000).nullable().optional() }),
  stage_package: z.object({ package_id: id, location_id: id }),
  hand_off: z.object({
    order_id: id,
    package_ids: z.array(id).min(1).max(50),
    collected_by: text(120).optional(),
    carrier: text(60).optional(),
    tracking: text(80).optional(),
    refused_ids: z.array(id).max(50).optional(),
  }),
  pick: z.object({ batch_id: id, stop_key: text(40) }),
  substitute: z.object({ batch_id: id, stop_key: text(40) }),
  // Stock: quantity changes with a reason, their approval, minimums and reorder notes (src/domain/stock.ts).
  adjust_qty: z.object({ reason: z.enum(['used', 'damaged', 'write_off', 'found', 'counted']), amount: quantity, note: text(500).optional() }),
  review_adjust: z.object({ approve: z.boolean(), note: text(500).optional() }),
  note_reorder: z.object({ product_id: text(400).min(1), note: text(300).optional(), clear: z.boolean().optional() }),
  set_adjust_approval: z.object({ on: z.boolean() }),
};

const ALL_KINDS = [...PALLET_COMMANDS, ...ADMIN_COMMANDS] as [CommandKind, ...CommandKind[]];

export const EnvelopeSchema = z.object({
  schema_version: z.literal(1),
  command_id: z.string().min(8).max(64),
  workspace_id: id,
  kind: z.enum(ALL_KINDS),
  pallet_id: id.optional(),
  expected_version: z.number().int().positive().optional(),
  payload: z.record(z.string(), z.unknown()),
});

/** Commands that act on an existing pallet and must carry pallet_id + expected_version. */
export const VERSIONED_PALLET_COMMANDS = PALLET_COMMANDS.filter((k) => k !== 'receive');

export function validateEnvelope(
  cmd: unknown,
): { ok: true; cmd: CommandEnvelope } | { ok: false; message: string } {
  const env = EnvelopeSchema.safeParse(cmd);
  if (!env.success) return { ok: false, message: `Invalid command: ${env.error.issues[0]?.message ?? 'shape'}` };
  const c = env.data as CommandEnvelope;
  const payload = PAYLOAD_SCHEMAS[c.kind].safeParse(c.payload);
  if (!payload.success) {
    const issue = payload.error.issues[0];
    return { ok: false, message: `Invalid ${c.kind} payload: ${issue?.path.join('.') || 'value'} ${issue?.message ?? ''}`.trim() };
  }
  if (c.kind === 'receive_transfer' && (!c.pallet_id || c.expected_version === undefined)) {
    return { ok: false, message: 'receive_transfer requires pallet_id and expected_version.' };
  }
  if ((c.kind === 'send_transfer' || c.kind === 'cancel_transfer' || c.kind === 'cancel_order' || c.kind === 'hand_off') && c.expected_version === undefined) {
    return { ok: false, message: `${c.kind} requires expected_version.` };
  }
  if ((VERSIONED_PALLET_COMMANDS as readonly string[]).includes(c.kind)) {
    if (!c.pallet_id || c.expected_version === undefined) {
      return { ok: false, message: `${c.kind} requires pallet_id and expected_version.` };
    }
  }
  return { ok: true, cmd: { ...c, payload: payload.data } };
}
