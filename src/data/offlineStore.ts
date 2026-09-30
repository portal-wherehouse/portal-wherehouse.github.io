import { createStore, del, get, set, update } from "idb-keyval";
import { emptyDb, type Db } from "../demo/engine";
import type { OutboxEntry } from "./outbox";

export const OFFLINE_ACCESS_MS = 24 * 60 * 60 * 1000;
export const MAX_OFFLINE_MOVES = 100;
const store = createStore("wherehouse-offline-v1", "records");

export interface OfflineSnapshot {
  db: Db;
  at: string;
  verifiedAt: number;
  expiresAt: number;
  summary: unknown;
}

/** Only previously opened records are retained, never whole collections or photo files. */
function boundedDb(current: Db, previous?: Db): Db {
  const db = emptyDb();
  for (const table of [
    "workspaces",
    "warehouses",
    "users",
    "jobs",
    "locations",
    "pallets",
    "labels",
    "attachments",
  ] as const) {
    const values = { ...previous?.[table], ...current[table] };
    const cap = table === "labels" ? 1500 : 500;
    (db[table] as object) = Object.fromEntries(
      Object.entries(values).slice(-cap),
    );
  }
  db.memberships = structuredClone(current.memberships);
  // History is an online/paginated feature. Keep only the currently visible page.
  for (const event of Object.values(current.events)
    .flat()
    .sort((a, b) => b.accepted_at.localeCompare(a.accepted_at))
    .slice(0, 100))
    (db.events[event.pallet_id] ??= []).push(event);
  for (const events of Object.values(db.events))
    events.sort((a, b) => a.revision - b.revision);
  db.lineage = current.lineage.slice(-100);
  return db;
}

export class OfflineStore {
  constructor(
    readonly project: string,
    readonly uid: string,
  ) {}
  private key(part: string) {
    return `${this.project}:${this.uid}:${part}`;
  }
  async rememberWorkspaces(ids: string[]) {
    await set(this.key("workspaces"), ids, store);
  }
  async workspaces(): Promise<string[]> {
    return (await get(this.key("workspaces"), store)) ?? [];
  }
  async load(ws: string): Promise<OfflineSnapshot | undefined> {
    return get(this.key(ws), store);
  }
  async forget(ws: string) {
    await del(this.key(ws), store);
  }
  async save(ws: string, snapshot: OfflineSnapshot) {
    await update<OfflineSnapshot>(
      this.key(ws),
      (previous) => ({ ...snapshot, db: boundedDb(snapshot.db, previous?.db) }),
      store,
    );
  }
  async loadQueue(): Promise<OutboxEntry[]> {
    return (await get(this.key("queue"), store)) ?? [];
  }
  async saveQueue(entries: OutboxEntry[]) {
    await set(this.key("queue"), entries, store);
  }

  /** Serializes queue edits/replay across tabs; unsupported browsers fail closed for queuing. */
  async lock<T>(action: () => Promise<T>): Promise<T> {
    if (!navigator.locks)
      throw new Error(
        "Offline saving is unavailable in this browser. Use a current browser and reconnect before moving pallets.",
      );
    return navigator.locks.request(this.key("queue-lock"), action);
  }
}
