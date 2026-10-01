import type { PalletInfo } from './receiving';
import type { OrdersSettings, PalletOrderRef } from './orders';
// Core domain types for Wherehouse (built from the Pallet Locator blueprint) (blueprint pages 7-9, 19-20).
// UUIDs identify records; human-readable codes support physical work.

export type Role = 'OWNER' | 'SUPERVISOR' | 'OPERATOR' | 'VIEWER';
export type PalletState = 'RECEIVED' | 'STORED' | 'IN_TRANSIT' | 'PICKED' | 'DISPATCHED' | 'MISSING' | 'RETIRED';
export type LocationKind = 'RACK' | 'RECEIVING' | 'QUARANTINE' | 'STAGING' | 'FLOOR';
export type JobStatus = 'OPEN' | 'CLOSED';

export const PALLET_STATES: PalletState[] = ['RECEIVED', 'STORED', 'IN_TRANSIT', 'PICKED', 'DISPATCHED', 'MISSING', 'RETIRED'];
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
  /** The account (its owner) this warehouse belongs to. Transfers only run between warehouses of one account. */
  account_id?: string;
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
  /** Orders and picking: off unless an owner turns it on. See domain/orders.ts. */
  orders?: OrdersSettings;
  /** Quantity changes by operators wait for a manager's approval. Off unless a manager turns it on. See domain/stock.ts. */
  adjust_approval?: boolean;
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
  /** Set while the pallet is on its way to another warehouse of the account (state IN_TRANSIT). */
  transfer?: PalletTransfer | null;
  /** Set while the unit is picked for a customer order (state PICKED): its tote, then its package. */
  order?: PalletOrderRef | null;
  /** The last time it was dispatched: the dispatch slip it left on (D-000012), where to and who sent it. */
  dispatch?: PalletDispatch | null;
  /** A quantity change an operator recorded, waiting for a manager's approval. Nothing else is adjusted meanwhile. */
  pending_adjust?: PendingAdjust | null;
}

/** One dispatch: a dispatch slip groups the pallets that left together under one reference. */
export interface PalletDispatch {
  ref: string;
  destination: string;
  note: string | null;
  at: string;
  by_name: string;
}

/** The fixed reasons a quantity can change for; see ADJUST_REASONS in domain/stock.ts. */
export type AdjustReason = 'used' | 'damaged' | 'write_off' | 'found' | 'counted';

export interface PendingAdjust {
  reason: AdjustReason;
  /** How many were used, damaged, written off or found; for "counted", the new total. */
  amount: number;
  from_qty: number | null;
  to_qty: number;
  note: string | null;
  by: string;
  by_name: string;
  at: string;
}

/** The transfer a pallet is travelling on, so Find and the record can say where it is headed. */
export interface PalletTransfer {
  id: string;
  number: string;
  from_workspace_id: string;
  from_name: string;
  to_workspace_id: string;
  to_name: string;
}

export const TRANSFER_STATUSES = ['DRAFT', 'IN_TRANSIT', 'PARTLY_RECEIVED', 'RECEIVED', 'CANCELLED'] as const;
export type TransferStatus = (typeof TRANSFER_STATUSES)[number];
export type TransferLineStatus = 'WAITING' | 'IN_TRANSIT' | 'RECEIVED' | 'RETURNED';

/** One pallet on a transfer, with what both warehouses need to know about it. */
export interface TransferLine {
  pallet_id: string;
  code: string;
  description: string;
  /** The pallet's QR label, so the receiving warehouse can match a scan to this line. */
  label_token: string | null;
  status: TransferLineStatus;
  /** The pallet's version after the last transfer step; receiving checks it like any pallet command. */
  version: number;
  from_location_id: string | null;
  from_location_code: string | null;
  to_location_code: string | null;
  received_at: string | null;
  received_by: string | null;
}

/** One step of a transfer's history, readable from both warehouses. */
export interface TransferStep {
  at: string;
  actor_id: string;
  actor_name: string;
  workspace_id: string;
  action: 'created' | 'sent' | 'received' | 'cancelled' | 'returned';
  text: string;
}

/** Pallets sent from one warehouse of an account to another. Both warehouses keep the same record. */
export interface Transfer {
  id: string;
  account_id: string;
  /** TR-0001: one sequence per account, printed on the transfer slip as a Code 128 barcode. */
  number: string;
  from_workspace_id: string;
  from_warehouse_id: string;
  from_name: string;
  to_workspace_id: string;
  to_warehouse_id: string;
  to_name: string;
  status: TransferStatus;
  note: string | null;
  lines: TransferLine[];
  /** Label tokens and codes of every line, so a scan in either warehouse finds this transfer. */
  keys: string[];
  created_by: string;
  created_by_name: string;
  created_at: string;
  sent_by: string | null;
  sent_at: string | null;
  received_by: string | null;
  received_at: string | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  log: TransferStep[];
  version: number;
  updated_at: string;
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
  'pick',
  'substitute',
  'adjust_qty',
  'review_adjust',
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
  'create_transfer',
  'send_transfer',
  'receive_transfer',
  'cancel_transfer',
  'transfer_now',
  'set_orders',
  'create_order',
  'cancel_order',
  'start_batch',
  'assign_tote',
  'short_pick',
  'finish_batch',
  'decide_sub',
  'pack',
  'stage_package',
  'hand_off',
  'note_reorder',
  'set_adjust_approval',
] as const;
export type AdminCommandKind = (typeof ADMIN_COMMANDS)[number];

export type CommandKind = PalletCommandKind | AdminCommandKind;

/** Event types: every pallet command, plus the per-child record a split creates. */
export type EventType = PalletCommandKind | 'split_child' | 'import_receive' | 'transfer_send' | 'transfer_receive' | 'transfer_return' | 'pack' | 'unpick' | 'hand_off' | 'pick_missing' | 'pick_hold';

/** Commands that change a transfer and the pallets on it, in two warehouses of one account. */
export const TRANSFER_COMMANDS = ['create_transfer', 'send_transfer', 'receive_transfer', 'cancel_transfer', 'transfer_now'] as const;
export type TransferCommandKind = (typeof TRANSFER_COMMANDS)[number];

/** Commands of orders and picking, handled together by the order engine (src/demo/orderEngine.ts). */
export const ORDER_COMMANDS = ['set_orders', 'create_order', 'cancel_order', 'start_batch', 'assign_tote', 'short_pick', 'finish_batch', 'decide_sub', 'pack', 'stage_package', 'hand_off', 'pick', 'substitute'] as const;
export type OrderCommandKind = (typeof ORDER_COMMANDS)[number];

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
  kind: 'locations' | 'jobs' | 'pallets' | 'shipments' | 'orders';
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
