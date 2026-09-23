// Stage C durable outbox (blueprint pages 24, 36): a limited offline write queue.
//
// Rules implemented here:
// - Only move and verify_location, only for already cached STORED pallets and known active locations.
// - One unresolved command per pallet.
// - The command is persisted BEFORE the UI may call it queued; a failed local write is reported, not hidden.
// - Queued is never shown as confirmed. Replay is bounded, keeps the original command ID, and stops
//   automatically on conflicts or permanent errors. Discarding requires an explicit user choice.
// - Entries are scoped to user and workspace; one user's queue never replays under another login.

import type { CommandEnvelope, CommandResult, ErrorCode, Pallet } from '../domain/types';

export type OutboxStatus = 'queued' | 'sending' | 'acknowledged' | 'conflict' | 'blocked';

export interface OutboxEntry {
  command: CommandEnvelope;
  actor_id: string;
  workspace_id: string;
  pallet_id: string;
  pallet_code: string;
  expected_version: number;
  kind: 'move' | 'verify_location';
  from_code: string | null;
  to_code: string;
  created_at: string;
  status: OutboxStatus;
  attempts: number;
  last_error: { code: ErrorCode; message: string } | null;
  /** The server's state when a conflict stopped replay. */
  server_state: Pallet | null;
  resolved_at: string | null;
}

export interface OutboxStorage {
  load(): Promise<OutboxEntry[]>;
  save(entries: OutboxEntry[]): Promise<void>;
}

export class OutboxWriteError extends Error {}

const PERMANENT: ErrorCode[] = ['FORBIDDEN', 'AUTH_REQUIRED', 'NOT_FOUND', 'INVALID_STATE', 'INACTIVE_LOCATION', 'INVALID_INPUT', 'JOB_CLOSED', 'COMMAND_KEY_REUSED'];

export function eligibility(
  kind: string,
  pallet: Pallet | null,
  locationActive: boolean,
  entries: OutboxEntry[],
): { ok: true } | { ok: false; message: string } {
  if (kind !== 'move' && kind !== 'verify_location') return { ok: false, message: 'Only moves and location checks can be saved while offline. Reconnect to do this.' };
  if (!pallet) return { ok: false, message: 'This pallet is not cached on this device. Reconnect to look it up.' };
  if (pallet.state !== 'STORED') return { ok: false, message: 'Offline moves are limited to stored pallets. Reconnect to do this.' };
  if (!locationActive) return { ok: false, message: 'That location is not known to be active. Reconnect to check it.' };
  if (entries.some((e) => e.pallet_id === pallet.id && e.status !== 'acknowledged' && !e.resolved_at)) {
    return { ok: false, message: `${pallet.code} already has an unsent change on this device. Sync or resolve it first.` };
  }
  return { ok: true };
}

export class Outbox {
  entries: OutboxEntry[] = [];
  private listeners = new Set<() => void>();

  constructor(private storage: OutboxStorage) {}

  async init() {
    try {
      this.entries = await this.storage.load();
      // A crash mid-send leaves "sending": it goes back to queued with the same command ID.
      for (const e of this.entries) if (e.status === 'sending') e.status = 'queued';
    } catch {
      this.entries = [];
    }
    this.emit();
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    for (const fn of this.listeners) fn();
  }

  forUser(actorId: string, workspaceId: string): OutboxEntry[] {
    return this.entries.filter((e) => e.actor_id === actorId && e.workspace_id === workspaceId);
  }

  pending(actorId: string, workspaceId: string): OutboxEntry[] {
    return this.forUser(actorId, workspaceId).filter((e) => !e.resolved_at && e.status !== 'acknowledged');
  }

  /** Persist first. Throws OutboxWriteError if the device could not save, so the UI never claims "queued". */
  async enqueue(entry: Omit<OutboxEntry, 'status' | 'attempts' | 'last_error' | 'server_state' | 'resolved_at'>): Promise<OutboxEntry> {
    const full: OutboxEntry = { ...entry, status: 'queued', attempts: 0, last_error: null, server_state: null, resolved_at: null };
    const next = [...this.entries, full];
    try {
      await this.storage.save(next);
    } catch (err) {
      throw new OutboxWriteError(err instanceof Error ? err.message : 'Device storage failed');
    }
    this.entries = next;
    this.emit();
    return full;
  }

  private async persist() {
    try {
      await this.storage.save(this.entries);
    } catch {
      /* status changes are recoverable: the next save retries them */
    }
    this.emit();
  }

  /**
   * Replay queued commands for this user in creation order, at most `batch` per call.
   * `send` returns a result, or throws when the network gives no answer.
   */
  async replay(actorId: string, workspaceId: string, send: (cmd: CommandEnvelope) => Promise<CommandResult>, batch = 10): Promise<{ sent: number; acknowledged: number; conflicts: number; blocked: number; unanswered: number }> {
    const stats = { sent: 0, acknowledged: 0, conflicts: 0, blocked: 0, unanswered: 0 };
    const stoppedPallets = new Set(this.entries.filter((e) => (e.status === 'conflict' || e.status === 'blocked') && !e.resolved_at).map((e) => e.pallet_id));
    const queue = this.entries.filter((e) => e.actor_id === actorId && e.workspace_id === workspaceId && e.status === 'queued').slice(0, batch);
    for (const e of queue) {
      if (stoppedPallets.has(e.pallet_id)) continue;
      e.status = 'sending';
      e.attempts++;
      await this.persist();
      let result: CommandResult;
      try {
        result = await send(e.command);
      } catch {
        e.status = 'queued';
        stats.unanswered++;
        await this.persist();
        break; // Network is unreliable: stop this round; the same command ID is retried later.
      }
      stats.sent++;
      if (result.ok) {
        e.status = 'acknowledged';
        e.last_error = null;
        e.server_state = result.current_state;
        stats.acknowledged++;
      } else if (result.code === 'VERSION_CONFLICT') {
        e.status = 'conflict';
        e.last_error = { code: result.code, message: result.message };
        e.server_state = result.current ?? null;
        stoppedPallets.add(e.pallet_id);
        stats.conflicts++;
      } else if (PERMANENT.includes(result.code)) {
        e.status = 'blocked';
        e.last_error = { code: result.code, message: result.message };
        e.server_state = result.current ?? null;
        stoppedPallets.add(e.pallet_id);
        stats.blocked++;
      } else {
        e.status = 'queued';
        e.last_error = { code: result.code, message: result.message };
      }
      await this.persist();
    }
    return stats;
  }

  /** Explicit user choice: discard a queued, conflicting, or blocked command. */
  async discard(commandId: string, now: string) {
    const e = this.entries.find((x) => x.command.command_id === commandId);
    if (!e) return;
    e.resolved_at = now;
    await this.persist();
  }

  /** Mark a conflict resolved because the user submitted a new command against the latest version. */
  async resolveWith(commandId: string, now: string) {
    await this.discard(commandId, now);
  }

  async clearAcknowledged(actorId: string, workspaceId: string) {
    this.entries = this.entries.filter((e) => !(e.actor_id === actorId && e.workspace_id === workspaceId && (e.status === 'acknowledged' || e.resolved_at)));
    await this.persist();
  }

  async clearAll() {
    this.entries = [];
    await this.persist();
  }
}

export function memoryStorage(fail = false): OutboxStorage & { data: OutboxEntry[] } {
  const s = {
    data: [] as OutboxEntry[],
    async load() {
      return structuredClone(s.data);
    },
    async save(entries: OutboxEntry[]) {
      if (fail) throw new Error('QuotaExceededError: storage is full');
      s.data = structuredClone(entries);
    },
  };
  return s;
}
