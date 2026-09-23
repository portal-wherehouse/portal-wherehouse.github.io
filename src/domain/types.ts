// Core domain types for Wherehouse (built from the Pallet Locator blueprint) (blueprint pages 7-9, 19-20).
// UUIDs identify records; human-readable codes support physical work.

export type Role = 'OWNER' | 'SUPERVISOR' | 'OPERATOR' | 'VIEWER';
export type PalletState = 'RECEIVED' | 'STORED' | 'DISPATCHED' | 'MISSING' | 'RETIRED';
export type LocationKind = 'RACK' | 'RECEIVING' | 'QUARANTINE' | 'STAGING' | 'FLOOR';
export type JobStatus = 'OPEN' | 'CLOSED';

export const PALLET_STATES: PalletState[] = ['RECEIVED', 'STORED', 'DISPATCHED', 'MISSING', 'RETIRED'];
export const LOCATION_KINDS: LocationKind[] = ['RACK', 'RECEIVING', 'QUARANTINE', 'STAGING', 'FLOOR'];

export interface User {
  id: string;
  name: string;
  email: string;
}

export interface Workspace {
  id: string;
  name: string;
  created_at: string;
}

export interface Membership {
  workspace_id: string;
  user_id: string;
  role: Role;
  active: boolean;
}

export interface Warehouse {
  id: string;
  workspace_id: string;
  code: string;
  name: string;
  timezone: string;
  active: boolean;
}

export interface Location {
  id: string;
  workspace_id: string;
  warehouse_id: string;
  code: string;
  kind: LocationKind;
  zone: string | null;
  aisle: string | null;
  bay: string | null;
  level: string | null;
  active: boolean;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface Job {
  id: string;
  workspace_id: string;
  code: string;
  name: string;
  destination_notes: string | null;
  status: JobStatus;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface Hold {
  reason: string;
  applied_by: string;
  applied_at: string;
}

export interface Pallet {
  id: string;
  workspace_id: string;
  warehouse_id: string;
  code: string;
  job_id: string;
  description: string;
  notes: string | null;
  supplier_ref: string | null;
  state: PalletState;
  current_location_id: string | null;
  last_confirmed_location_id: string | null;
  last_confirmed_at: string | null;
  hold: Hold | null;
  version: number;
  received_at: string;
  updated_at: string;
  archived_at: string | null;
  label_needs_reprint: boolean;
}

/** Operational values needed to explain a change (page 20, "Event fields"). */
export interface PalletSnapshot {
  state: PalletState;
  current_location_id: string | null;
  current_location_code: string | null;
  last_confirmed_location_id: string | null;
  last_confirmed_location_code: string | null;
  job_id: string;
  job_code: string;
  hold: boolean;
  hold_reason: string | null;
  description: string;
  archived: boolean;
}

export interface PalletEvent {
  id: string;
  schema_version: 1;
  workspace_id: string;
  pallet_id: string;
  revision: number;
  type: EventType;
  actor_id: string;
  accepted_at: string;
  observed_at: string | null;
  before_state: PalletSnapshot | null;
  after_state: PalletSnapshot;
  reason: string | null;
  command_id: string;
  detail: Record<string, string | number | boolean | null>;
}

export interface LabelToken {
  workspace_id: string;
  token: string;
  kind: 'P' | 'L';
  target_id: string;
  created_at: string;
  revoked_at: string | null;
}

export interface Attachment {
  id: string;
  workspace_id: string;
  pallet_id: string;
  data_url: string;
  thumb_url: string;
  media_type: string;
  bytes: number;
  state: 'ready' | 'removed';
  created_by: string;
  created_at: string;
}

export interface AdminAudit {
  id: string;
  workspace_id: string;
  actor_id: string;
  action: AdminCommandKind;
  target_id: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  reason: string | null;
  accepted_at: string;
  command_id: string;
}

export const PALLET_COMMANDS = [
  'receive',
  'place',
  'move',
  'verify_location',
  'dispatch',
  'return',
  'mark_missing',
  'locate',
  'apply_hold',
  'clear_hold',
  'reassign_job',
  'edit_details',
  'add_photo',
  'remove_photo',
  'correct',
  'retire',
  'archive',
  'rotate_label',
  'label_applied',
  'split',
] as const;
export type PalletCommandKind = (typeof PALLET_COMMANDS)[number];

export const ADMIN_COMMANDS = [
  'create_job',
  'close_job',
  'reopen_job',
  'create_location',
  'rename_location',
  'deactivate_location',
  'reactivate_location',
  'invite_member',
  'change_role',
  'remove_member',
  'import_batch',
] as const;
export type AdminCommandKind = (typeof ADMIN_COMMANDS)[number];

export type CommandKind = PalletCommandKind | AdminCommandKind;

/** Event types: every pallet command, plus the per-child record a split creates. */
export type EventType = PalletCommandKind | 'split_child' | 'import_receive';

export interface PalletLineage {
  workspace_id: string;
  parent_id: string;
  child_id: string;
  split_command_id: string;
  created_at: string;
}

export interface ImportBatch {
  id: string;
  workspace_id: string;
  kind: 'locations' | 'jobs' | 'pallets';
  checksum: string;
  status: 'committed';
  summary: string;
  created_ids: string[];
  actor_id: string;
  created_at: string;
}

export interface RowError {
  row: number;
  column: string;
  message: string;
}

export interface CommandEnvelope {
  schema_version: 1;
  command_id: string;
  workspace_id: string;
  kind: CommandKind;
  pallet_id?: string;
  expected_version?: number;
  payload: Record<string, unknown>;
}

export const ERROR_CODES = [
  'INVALID_INPUT',
  'AUTH_REQUIRED',
  'FORBIDDEN',
  'NOT_FOUND',
  'VERSION_CONFLICT',
  'INVALID_STATE',
  'INACTIVE_LOCATION',
  'JOB_CLOSED',
  'COMMAND_KEY_REUSED',
  'TEMPORARY_FAILURE',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export interface CommandAccepted {
  ok: true;
  command_id: string;
  kind: CommandKind;
  accepted_at: string;
  event_id: string | null;
  pallet_id: string | null;
  new_version: number | null;
  current_state: Pallet | null;
  target_id: string | null;
  /** Records created by this command (split children, imported rows). */
  created_ids?: string[];
  /** True when this result was recovered from a saved receipt instead of freshly executed. */
  replayed?: boolean;
}

export interface CommandRejected {
  ok: false;
  command_id: string;
  kind: CommandKind | string;
  code: ErrorCode;
  message: string;
  correlation_id: string;
  /** Present on VERSION_CONFLICT: the current authorized summary. */
  current?: Pallet | null;
  /** Row-level problems for imports. */
  errors?: RowError[];
  replayed?: boolean;
}

export type CommandResult = CommandAccepted | CommandRejected;

export interface CommandReceipt {
  workspace_id: string;
  command_id: string;
  actor_id: string;
  payload_hash: string;
  result: CommandResult;
  completed_at: string;
}
