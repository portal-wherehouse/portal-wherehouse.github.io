// DRAFT. NOT DEPLOYED. NOT COMPILED: this folder is outside tsconfig.json, and the firebase-functions and
// firebase-admin packages are not installed in this repo.
//
// A sketch of the one callable Cloud Function every change goes through. It runs the same five steps
// as the local command engine (src/demo/engine.ts, header comment) inside one Firestore transaction:
//   1. check current membership and role
//   2. reserve the command ID with a canonical payload hash (receipt lookup)
//   3. re-read referenced documents and check expected_version
//   4. validate the transition and compute the next state from server values
//   5. write the pallet, the event and the receipt together
// Design and reasoning: docs/data-storage.md, section 4.

import { onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, type DocumentReference, type Transaction } from 'firebase-admin/firestore';

// The shared domain package: today's src/domain files, moved so the app and the function import the
// exact same rules (migration plan, step 3). Nothing here re-implements a rule.
import { validateEnvelope } from '@wherehouse/domain/commands';
import { canonicalJson, hashString, uuid } from '@wherehouse/domain/codes';
import { checkTransition, roleAllows } from '@wherehouse/domain/transitions';
import type {
  CommandAccepted,
  CommandEnvelope,
  CommandReceipt,
  CommandRejected,
  CommandResult,
  ErrorCode,
  Job,
  Location,
  Pallet,
  PalletCommandKind,
  PalletEvent,
  PalletSnapshot,
  Role,
} from '@wherehouse/domain/types';

initializeApp();
const db = getFirestore();
// Domain objects use null, never undefined, but be safe: Firestore rejects undefined values.
db.settings({ ignoreUndefinedProperties: true });

/** workspaces/{ws}/members/{uid} */
interface MemberDoc {
  uid: string;
  role: Role;
  active: boolean;
  name: string;
  email: string;
}

type Reject = (code: ErrorCode, message: string, current?: Pallet | null) => CommandRejected;

export const command = onCall(
  {
    // Same region family as the Firestore location chosen in the console (for nam5, us-central1).
    region: 'us-central1',
    // A ceiling on runaway cost. Raise it when real traffic says so.
    maxInstances: 20,
    // Turn on once App Check is set up for the web app.
    enforceAppCheck: false,
  },
  async (request): Promise<CommandResult> => {
    const correlation_id = uuid().slice(0, 8);
    const raw: unknown = request.data;
    const guess = (k: 'command_id' | 'kind') => (typeof raw === 'object' && raw && k in raw ? String((raw as Record<string, unknown>)[k]) : '');
    const fail = (code: ErrorCode, message: string): CommandRejected => ({ ok: false, command_id: guess('command_id'), kind: guess('kind'), code, message, correlation_id });

    // 0. Who is asking comes from the verified ID token, never from the payload.
    const uid = request.auth?.uid;
    if (!uid) return fail('AUTH_REQUIRED', 'Sign in to continue.');
    const v = validateEnvelope(raw);
    if (!v.ok) return fail('INVALID_INPUT', v.message);
    const cmd = v.cmd;

    const payload_hash = hashString(
      canonicalJson({ kind: cmd.kind, workspace_id: cmd.workspace_id, pallet_id: cmd.pallet_id ?? null, expected_version: cmd.expected_version ?? null, payload: cmd.payload }),
    );
    const ws = db.collection('workspaces').doc(cmd.workspace_id);

    try {
      // Firestore may run this callback more than once if documents it read change underneath it.
      // Keep it free of side effects outside the transaction, and take the clock inside it.
      return await db.runTransaction(async (tx) => {
        const now = new Date().toISOString();
        const reject: Reject = (code, message, current) => ({
          ok: false,
          command_id: cmd.command_id,
          kind: cmd.kind,
          code,
          message,
          correlation_id,
          ...(current !== undefined ? { current } : {}),
        });

        // 1. Current membership and role. Like the engine, these refusals write no receipt.
        const member = await read<MemberDoc>(tx, ws.collection('members').doc(uid));
        if (!member || !member.active) return fail('FORBIDDEN', 'You do not have access to this workspace.');
        if (!roleAllows(member.role, cmd.kind)) return fail('FORBIDDEN', `Your role (${member.role.toLowerCase()}) cannot do this.`);

        // 2. Reserve the command ID. Same ID + same actor + same payload = the original answer.
        const receiptRef = ws.collection('receipts').doc(cmd.command_id);
        const existing = await read<CommandReceipt>(tx, receiptRef);
        if (existing) {
          if (existing.actor_id !== uid || existing.payload_hash !== payload_hash) {
            return reject('COMMAND_KEY_REUSED', 'This request ID was already used for a different request.');
          }
          return { ...existing.result, replayed: true };
        }

        // 3 to 5. Run the command. All reads happen inside run() before any write, as Firestore requires.
        const result = await run(tx, ws, uid, cmd, now, reject);

        // Accepted AND rejected outcomes get a receipt, exactly as in the engine, so a retry of a
        // rejected command returns the same rejection instead of trying again.
        const receipt: CommandReceipt = { workspace_id: cmd.workspace_id, command_id: cmd.command_id, actor_id: uid, payload_hash, result, completed_at: now };
        tx.create(receiptRef, receipt);
        return result;
      });
    } catch (err) {
      // A thrown error aborts the transaction: nothing was written, receipt included (scenario D04).
      logger.error('command failed', { correlation_id, kind: cmd.kind, err });
      return { ok: false, command_id: cmd.command_id, kind: cmd.kind, code: 'TEMPORARY_FAILURE', message: 'The change was not saved. Try again.', correlation_id };
    }
  },
);

/**
 * Steps 3 to 5 for one command.
 *
 * Two ways to fill this in:
 *   A. Port each case from Engine.run / receive / admin, reading documents with tx.get(). The `move`
 *      family is shown below.
 *   B. (Recommended once the domain package is shared.) Read the handful of documents the command kind
 *      needs into a small Db-shaped object, run the unchanged `new Engine(miniDb, { clock, newId }).execute()`
 *      on it, and turn what changed into tx.set / tx.create calls. One copy of the logic, by construction.
 * Either way, the 38 scenarios in src/lab/scenarios.ts must pass against the emulator before deploy.
 */
async function run(tx: Transaction, ws: DocumentReference, uid: string, cmd: CommandEnvelope, now: string, reject: Reject): Promise<CommandResult> {
  switch (cmd.kind) {
    case 'receive':
      // Reads: active warehouse (query where active == true, limit 1), the job, private/counters.
      // Writes: new pallet (code from the counter), its label token, the counter, event revision 1.
      throw new Error('receive: port from Engine.receive');
    case 'create_job':
    case 'close_job':
    case 'reopen_job':
    case 'create_location':
    case 'rename_location':
    case 'deactivate_location':
    case 'reactivate_location':
    case 'invite_member':
    case 'change_role':
    case 'remove_member':
    case 'import_batch':
      // Port from Engine.admin and Engine.importBatch. Each writes an audit document.
      // Member changes also update users/{uid}.workspaces in the same transaction.
      throw new Error(`${cmd.kind}: port from Engine.admin`);
  }
  return runPalletCommand(tx, ws, uid, cmd, now, reject);
}

async function runPalletCommand(tx: Transaction, ws: DocumentReference, uid: string, cmd: CommandEnvelope, now: string, reject: Reject): Promise<CommandResult> {
  const kind = cmd.kind as PalletCommandKind;
  const p = cmd.payload;

  // 3. Re-read everything the decision depends on, from the server, inside the transaction.
  //    Paths are under this workspace, so another company's IDs simply are not found.
  const palletRef = ws.collection('pallets').doc(cmd.pallet_id!);
  const pallet = await read<Pallet>(tx, palletRef);
  if (!pallet) return reject('NOT_FOUND', 'Pallet not found.');
  const job = await read<Job>(tx, ws.collection('jobs').doc(pallet.job_id));
  let location: Location | null = null;
  if (typeof p.location_id === 'string') {
    location = await read<Location>(tx, ws.collection('locations').doc(p.location_id));
    if (!location) return reject('NOT_FOUND', 'Location not found.');
  }
  let newJob: Job | null = null;
  if (kind === 'reassign_job') {
    newJob = await read<Job>(tx, ws.collection('jobs').doc(String(p.job_id)));
    if (!newJob) return reject('NOT_FOUND', 'Job not found.');
  }
  // The event stores location codes, so read the pallet's current and last-confirmed locations too.
  const current = pallet.current_location_id ? await read<Location>(tx, ws.collection('locations').doc(pallet.current_location_id)) : null;
  const confirmed = pallet.last_confirmed_location_id ? await read<Location>(tx, ws.collection('locations').doc(pallet.last_confirmed_location_id)) : null;
  // Kind-specific reads also go here, before any write: photo count for add_photo, the active label
  // for rotate_label, private/counters and child jobs for split.

  if (cmd.expected_version !== pallet.version) {
    return reject('VERSION_CONFLICT', `${pallet.code} changed since you loaded it (now version ${pallet.version}). Review the current record.`, pallet);
  }

  // 4. The same pure rule function the local engine calls.
  const outcome = checkTransition(kind, { pallet, job: job!, location, newJob, payload: p, now, actorId: uid });
  if (!outcome.ok) return reject(outcome.code, outcome.message, outcome.code === 'INVALID_STATE' ? pallet : undefined);

  // 5. Write the pallet and its history entry. The receipt is written by the caller, in the same transaction.
  const next: Pallet = { ...pallet, ...outcome.patch, version: pallet.version + 1, updated_at: now };
  const codes = new Map<string, string>();
  for (const l of [current, confirmed, location]) if (l) codes.set(l.id, l.code);
  const event: PalletEvent = {
    id: `${pallet.id}_${next.version}`,
    schema_version: 1,
    workspace_id: cmd.workspace_id,
    pallet_id: pallet.id,
    revision: next.version,
    type: kind,
    actor_id: uid,
    accepted_at: now,
    observed_at: null,
    before_state: snapshot(pallet, job!, codes),
    after_state: snapshot(next, newJob ?? job!, codes),
    reason: outcome.reason,
    command_id: cmd.command_id,
    detail: { ...outcome.detail },
  };
  tx.set(palletRef, withoutId(next));
  // create() fails if the document exists, so a duplicate revision cannot be written even by a bug.
  tx.create(ws.collection('events').doc(event.id), event);

  const accepted: CommandAccepted = {
    ok: true,
    command_id: cmd.command_id,
    kind: cmd.kind,
    accepted_at: now,
    event_id: event.id,
    pallet_id: next.id,
    new_version: next.version,
    current_state: next,
    target_id: next.id,
  };
  return accepted;
}

// ------------------------------------------------------------------ helpers

async function read<T extends { id?: string }>(tx: Transaction, ref: DocumentReference): Promise<T | null> {
  const snap = await tx.get(ref);
  return snap.exists ? ({ id: snap.id, ...snap.data() } as T) : null;
}

/** Documents do not repeat their own ID as a field. */
function withoutId<T extends { id: string }>(value: T): Omit<T, 'id'> {
  const { id: _id, ...rest } = value;
  return rest;
}

/** Mirrors Engine.snapshot: the operational values needed to explain a change (blueprint page 20). */
function snapshot(p: Pallet, job: Job, codes: Map<string, string>): PalletSnapshot {
  return {
    state: p.state,
    current_location_id: p.current_location_id,
    current_location_code: p.current_location_id ? codes.get(p.current_location_id) ?? null : null,
    last_confirmed_location_id: p.last_confirmed_location_id,
    last_confirmed_location_code: p.last_confirmed_location_id ? codes.get(p.last_confirmed_location_id) ?? null : null,
    job_id: p.job_id,
    job_code: job.code,
    hold: !!p.hold,
    hold_reason: p.hold?.reason ?? null,
    description: p.description,
    archived: !!p.archived_at,
  };
}

// ------------------------------------------------------------------ the other functions (outlines)
//
// exportWorkspace (callable): checks Supervisor or Owner, reads the workspace, and returns the same
//   CSV files Engine.exportData builds today, so export stays role-checked on the server.
// createWorkspace (callable): a new customer's first sign-in. Creates the workspace, its warehouse and
//   the owner membership in one transaction, like Engine.createWorkspace.
// claimInvites (callable): after sign-in, turns workspaces/*/invites/{email} into memberships, only when
//   request.auth.token.email_verified is true.
// cleanOrphanPhotos (scheduled, daily): deletes uploads older than 24 hours with no attachment document.
// weeklyExport (scheduled, weekly): exports the database to a backup bucket for long-term keeping.
