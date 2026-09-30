import type { PalletInfo } from './receiving';
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
  address?: string;
  phone?: string;
  contact_email?: string;
  receiving_notes?: string;
  version?: number;
  updated_at?: string;
  /** Advanced weight and dimensions logging: locations can have weight and size limits that moves must respect. */
  advanced_measurements?: boolean;
  /** What this warehouse calls the things it tracks and how it groups work; see domain/terms.ts. */
  setup?: WarehouseSetup;
  /** A new self-serve warehouse is locked to the setup checklist until it is done or skipped; see features/onboarding. */
  onboarding?: Onboarding;
  id: string;
  workspace_id: string;
  code: string;
  name: string;
  timezone: string;
  active: boolean;
}

export interface OnboardingZone {
  letter: string;
  name: string;
  kind: LocationKind;
}

export interface Onboarding {
  /** 'pending' locks the app to the checklist; 'skipped' unlocks it with steps still open; 'done' when finished. */
  state: 'pending' | 'skipped' | 'done';
  /** Wizard steps finished, by id. */
  done: string[];
  zones: OnboardingZone[];
  /** What happens to a record when the thing leaves: kept as sent out, or retired off the list. */
  leave: 'dispatch' | 'retire' | null;
  /** Photos and paperwork saved online, or printed on paper only. */
  files: 'cloud' | 'paper' | null;
  /** How things get their barcodes. */
  barcodes: 'import' | 'scan' | 'print' | null;
}

export interface WarehouseSetup {
  /** The "What do you store?" answer, or null before anyone chose. */
  preset: string | null;
  thing: string;
  things: string;
  job: string;
  jobs: string;
  /** Off hides jobs everywhere; records keep any job they already have. */
  jobs_on: boolean;
}

/** How much a location holds. Spaces are floor pallet positions; stacking multiplies them. */
export interface LocationCapacity {
  spaces: number;
  stacking: number;
  /** Advanced only: the most weight the location may carry, in pounds. */
  max_weight_lb: number | null;
  /** Advanced only: the size of one pallet space on one level, in inches. */
  length_in: number | null;
  width_in: number | null;
  height_in: number | null;
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
  capacity?: LocationCapacity | null;
  /** Kept up to date by every move: stored pallets here and their recorded weight. */
  load_pallets?: number;
  load_weight_lb?: number;
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
  receiving?: PalletInfo;
  shipment_id?: string;
  id: string;
  workspace_id: string;
  warehouse_id: string;
  code: string;
  /** Empty string means no job assigned. Existing job IDs remain unchanged. */
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
  receiving?: PalletInfo;
  state: PalletState;
  current_location_id: string | null;
  current_location_code: string | null;
  last_confirmed_location_id: string | null;
  last_confirmed_location_code: string | null;
  /** Empty string means no job assigned. Existing job IDs remain unchanged. */
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

export const ISSUE_KINDS = ['DAMAGED', 'MISSING', 'WRONG', 'OTHER'] as const;
export type IssueKind = (typeof ISSUE_KINDS)[number];
export const ISSUE_STATUSES = ['NEW', 'APPROVED', 'FILED', 'DISMISSED'] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];

/** A problem someone flagged on the floor (damage, missing items), waiting for a manager. */
export interface Issue {
  id: string;
  workspace_id: string;
  warehouse_id: string;
  kind: IssueKind;
  description: string;
  pallet_ids: string[];
  /** Codes at the time of the report, so the list reads without loading every pallet. */
  pallet_codes: string[];
  /** Photos are stored as pallet photos; the issue points at them. */
  attachment_ids: string[];
  reported_by: string;
  reporter_name: string;
  created_at: string;
  status: IssueStatus;
  reviewed_by: string | null;
  reviewer_name: string | null;
  reviewed_at: string | null;
  review_note: string | null;
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
  'update_warehouse',
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
  'rename_import',
  'save_product',
  'report_issue',
  'update_issue',
  'set_location_capacity',
  'set_measurements',
  'set_setup',
  'set_onboarding',
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
  kind: 'locations' | 'jobs' | 'pallets' | 'shipments';
  checksum: string;
  status: 'committed';
  summary: string;
  created_ids: string[];
  actor_id: string;
  created_at: string;
  /** A name people choose for the batch; older batches have none. */
  name?: string;
  file_name?: string | null;
  /** The spreadsheet as imported, under template column names. Older batches have none. */
  rows?: Record<string, string>[];
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
