import { receivingSchema } from './receiving';
// Command envelope validation at the boundary (page 22). The server derives actor identity;
// the client never supplies a trusted role, location, timestamp, or revision.

import { z } from 'zod';
import { ADMIN_COMMANDS, PALLET_COMMANDS, type CommandEnvelope, type CommandKind } from './types';

const id = z.string().min(1).max(64);
const text = (max: number) => z.string().max(max);
const reason = text(500).optional();

export const PAYLOAD_SCHEMAS: Record<CommandKind, z.ZodType<Record<string, unknown>>> = {
  receive: z.object({
    receiving: receivingSchema.optional(),
    remember_product: z.boolean().optional(),
    shipment_id: id.optional(),
    job_id: id,
    description: text(400),
    notes: text(2000).optional(),
    supplier_ref: text(200).optional(),
  }),
  place: z.object({ location_id: id }),
  move: z.object({ location_id: id }),
  verify_location: z.object({ location_id: id }),
  dispatch: z.object({ destination: text(400), note: text(1000).optional() }),
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
    children: z.array(z.object({ description: text(400), job_id: id })).max(40),
    reason,
  }),
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
    import_kind: z.enum(['locations', 'jobs', 'pallets', 'shipments']),
    checksum: z.string().max(64),
    rows: z.array(z.record(z.string(), z.string().max(1000))).max(1000),
  }),
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
  if ((VERSIONED_PALLET_COMMANDS as readonly string[]).includes(c.kind)) {
    if (!c.pallet_id || c.expected_version === undefined) {
      return { ok: false, message: `${c.kind} requires pallet_id and expected_version.` };
    }
  }
  return { ok: true, cmd: { ...c, payload: payload.data } };
}
