// Transfer commands touch two warehouses of one account in one transaction: the sending warehouse and the
// receiving one. Both warehouses must belong to the same account (the license owner), and every write lands
// in one of those two warehouses. The shared engine decides; this file loads what it reads and saves what changed.

import {
  getFirestore,
  type DocumentSnapshot,
  type Query,
  type Transaction,
} from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { Engine, emptyDb, type Db } from "../../../src/demo/engine";
import { reminderDate } from "../../../src/domain/receiving";
import { MAX_TRANSFER_LINES } from "../../../src/domain/transfers";
import type {
  CommandEnvelope,
  Transfer,
  User,
} from "../../../src/domain/types";
import { canEditWarehouse, canReadWarehouse } from "./access";
import { measured, searchTerms } from "./repository";

const clean = (x: unknown) => JSON.parse(JSON.stringify(x));
const validId = (x: unknown): x is string =>
  typeof x === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(x);

/** History entries copied with a pallet to the receiving warehouse, newest first. */
const HISTORY_COPY = 150;
/** History entries per pallet on a "Transfer now", which moves up to 20 pallets at once. */
const HISTORY_COPY_NOW = 8;
/** Firestore commits up to 500 writes; keep room for the receipt and the rate counter. */
const MAX_WRITES = 480;

const PAUSED =
  "Changes are paused until renewed. Existing records can be read and exported during the 14-day grace period.";

/** Rows per warehouse, as Firestore paths under workspaces/{ws}/. A transfer is stored under both warehouses. */
function partition(db: Db): Map<string, Map<string, any>> {
  const out = new Map<string, Map<string, any>>();
  const put = (ws: string | undefined, path: string, v: unknown) => {
    if (!ws) return;
    let m = out.get(ws);
    if (!m) out.set(ws, (m = new Map()));
    m.set(path, v);
  };
  for (const table of [
    "warehouses",
    "locations",
    "jobs",
    "pallets",
    "labels",
    "attachments",
  ] as const)
    for (const [id, v] of Object.entries(db[table]))
      put((v as { workspace_id?: string }).workspace_id, `${table}/${id}`, v);
  for (const list of Object.values(db.events))
    for (const ev of list)
      put(ev.workspace_id, `events/${ev.pallet_id}_${ev.revision}`, ev);
  for (const t of Object.values(db.transfers)) {
    put(t.from_workspace_id, `transfers/${t.id}`, t);
    put(t.to_workspace_id, `transfers/${t.id}`, t);
  }
  return out;
}

function frozen(rows: Map<string, Map<string, any>>) {
  return new Map(
    [...rows].map(([ws, m]) => [
      ws,
      new Map([...m].map(([k, v]) => [k, JSON.stringify(v)])),
    ]),
  );
}

export async function transferCommand(
  user: User,
  cmd: CommandEnvelope,
): Promise<unknown> {
  const store = getFirestore();
  const ws = cmd.workspace_id;
  const p = cmd.payload as Record<string, any>;
  const root = (id: string) => store.doc(`workspaces/${id}`);
  return measured(cmd.kind, cmd.command_id, async (tx: Transaction) => {
    const [licenseSnap, memberSnap, receiptSnap] = await Promise.all([
      tx.get(store.doc(`licenses/${ws}`)),
      tx.get(root(ws).collection("members").doc(user.id)),
      tx.get(root(ws).collection("receipts").doc(cmd.command_id)),
    ]);
    const license = licenseSnap.data();
    if (!memberSnap.get("active"))
      throw new HttpsError("permission-denied", "Your access was removed.");
    const db = emptyDb();
    const addMember = (id: string, snap: DocumentSnapshot) => {
      if (!snap.exists) return;
      db.memberships.push({
        workspace_id: id,
        user_id: user.id,
        role: snap.get("role"),
        active: snap.get("active") === true,
      });
      db.users[user.id] = snap.get("user") || db.users[user.id] || user;
    };
    addMember(ws, memberSnap);
    const receiptKey = `${ws}:${cmd.command_id}`;
    if (receiptSnap.exists) {
      // A retry answers from the stored receipt, without loading or changing anything.
      if (!canReadWarehouse(license))
        throw new HttpsError("permission-denied", PAUSED);
      db.receipts[receiptKey] = receiptSnap.data() as any;
      return clean(new Engine(db).execute(user.id, cmd));
    }
    if (!canEditWarehouse(license))
      throw new HttpsError("permission-denied", PAUSED);

    const rateRef = root(ws).collection("private").doc(`commands_${user.id}`);
    const rate = await tx.get(rateRef);
    const nowMinute = Math.floor(Date.now() / 60000),
      day = new Date().toISOString().slice(0, 10);
    const minuteCount =
      rate.get("minute") === nowMinute ? rate.get("minuteCount") || 0 : 0;
    const dayCount = rate.get("day") === day ? rate.get("dayCount") || 0 : 0;
    if (
      minuteCount >= (license?.limits?.commandsPerUserMinute ?? 120) ||
      dayCount >= (license?.limits?.commandsPerUserDay ?? 5000)
    )
      throw new HttpsError(
        "resource-exhausted",
        "Action allowance reached. Existing records and photos are still available. Wait for the limit to reset or contact support.",
      );

    // The account is the license owner. Only the function writes licenses, so a client cannot claim one.
    const account =
      typeof license?.owner_uid === "string" ? license.owner_uid : null;
    const workspace = (id: string) => ({
      id,
      name: "",
      created_at: "",
      ...(account ? { account_id: account } : {}),
    });
    db.workspaces[ws] = workspace(ws);

    let transfer: Transfer | null = null;
    let other: string | null = null;
    if (cmd.kind === "create_transfer" || cmd.kind === "transfer_now") {
      if (validId(p.to_workspace_id) && p.to_workspace_id !== ws)
        other = p.to_workspace_id;
    } else if (validId(p.transfer_id)) {
      const snap = await tx.get(
        root(ws).collection("transfers").doc(p.transfer_id),
      );
      if (snap.exists) {
        transfer = snap.data() as Transfer;
        db.transfers[transfer.id] = transfer;
        other =
          transfer.from_workspace_id === ws
            ? transfer.to_workspace_id
            : transfer.from_workspace_id;
      }
    }

    // Writes may land only in this warehouse and, when it is in the same account, the other one.
    const allowed = new Set([ws]);
    if (other && validId(other)) {
      const [otherLicense, otherMember] = await Promise.all([
        tx.get(store.doc(`licenses/${other}`)),
        tx.get(root(other).collection("members").doc(user.id)),
      ]);
      if (account && otherLicense.get("owner_uid") === account) {
        if (!canEditWarehouse(otherLicense.data()))
          throw new HttpsError(
            "permission-denied",
            "Changes at the other warehouse are paused until it is renewed.",
          );
        allowed.add(other);
        db.workspaces[other] = workspace(other);
        addMember(other, otherMember);
      } else if (transfer)
        throw new HttpsError(
          "failed-precondition",
          "The other warehouse on this transfer is no longer part of this account.",
        );
      // For a new transfer the engine answers "not part of this account".
    }
    if (!db.users[user.id]) db.users[user.id] = user;

    const docs = async (table: string, q: Query) => {
      const s = await tx.get(q);
      for (const d of s.docs) {
        const v: any = d.data();
        if (table === "labels") db.labels[v.token ?? d.id] = v;
        else (db as any)[table][v.id ?? d.id] = v;
      }
      return s.docs;
    };
    const one = async (table: string, id: string, at: string) => {
      if (!validId(id) || !allowed.has(at)) return;
      if ((db as any)[table][id]) return;
      const s = await tx.get(root(at).collection(table).doc(id));
      if (s.exists) (db as any)[table][id] = s.data();
    };

    for (const id of allowed)
      await docs(
        "warehouses",
        root(id).collection("warehouses").where("active", "==", true).limit(1),
      );

    const counterRef = account
      ? store.doc(`transferCounters/${account}`)
      : null;
    let counterBefore: number | undefined;
    if (
      (cmd.kind === "create_transfer" || cmd.kind === "transfer_now") &&
      counterRef &&
      other &&
      allowed.has(other)
    ) {
      counterBefore = (await tx.get(counterRef)).get("value") || 0;
      db.transfer_counters[account!] = counterBefore!;
    }

    // The pallets, read where they are now: the sending warehouse.
    const src = transfer?.from_workspace_id ?? ws;
    const dest = transfer?.to_workspace_id ?? other;
    const palletIds: string[] =
      cmd.kind === "create_transfer" || cmd.kind === "transfer_now"
        ? (Array.isArray(p.lines) ? p.lines : [])
            .map((l: any) => l?.pallet_id)
            .filter(validId)
            .slice(0, MAX_TRANSFER_LINES)
        : cmd.kind === "receive_transfer"
          ? [cmd.pallet_id].filter(validId)
          : (transfer?.lines ?? []).map((l) => l.pallet_id);
    const moving =
      cmd.kind === "receive_transfer" || cmd.kind === "transfer_now";
    const history = new Map<string, DocumentSnapshot[]>();
    for (const id of new Set(palletIds)) {
      await one("pallets", id, src);
      const pallet = db.pallets[id];
      if (!pallet) continue;
      for (const loc of [
        pallet.current_location_id,
        pallet.last_confirmed_location_id,
        transfer?.lines.find((l) => l.pallet_id === id)?.from_location_id,
      ])
        if (loc) await one("locations", loc, src);
      if (pallet.job_id) await one("jobs", pallet.job_id, src);
      if (!allowed.has(src)) continue;
      await docs(
        "labels",
        root(src)
          .collection("labels")
          .where("target_id", "==", id)
          .where("revoked_at", "==", null)
          .limit(1),
      );
      if (moving && dest && allowed.has(dest)) {
        await docs(
          "attachments",
          root(src)
            .collection("attachments")
            .where("pallet_id", "==", id)
            .limit(20),
        );
        const job = pallet.job_id ? db.jobs[pallet.job_id] : undefined;
        if (job)
          await docs(
            "jobs",
            root(dest)
              .collection("jobs")
              .where("code", "==", job.code)
              .limit(1),
          );
        const s = await tx.get(
          root(src)
            .collection("events")
            .where("pallet_id", "==", id)
            .orderBy("revision", "desc")
            .limit(
              cmd.kind === "transfer_now" ? HISTORY_COPY_NOW : HISTORY_COPY,
            ),
        );
        history.set(id, s.docs);
      }
    }
    if (moving && dest && validId(p.location_id))
      await one("locations", p.location_id, dest);

    const before = frozen(partition(db));
    const result = new Engine(db).execute(user.id, cmd);
    if (!db.receipts[receiptKey]) return clean(result);

    const after = partition(db);
    const writes: (() => void)[] = [];
    for (const [id, rows] of after) {
      const old = before.get(id) ?? new Map<string, string>();
      for (const [path, raw] of rows) {
        const text = JSON.stringify(raw);
        if (old.get(path) === text) continue;
        if (!allowed.has(id))
          throw new HttpsError(
            "internal",
            "A transfer tried to change another account.",
          );
        const table = path.split("/")[0];
        let v = JSON.parse(text);
        if (table === "pallets")
          v = {
            ...v,
            reminder_due: reminderDate(v),
            has_hold: !!v.hold,
            search_terms: searchTerms({
              ...v,
              description:
                v.description + " " + (db.jobs[v.job_id]?.name || ""),
            }),
          };
        const ref = store.doc(`workspaces/${id}/${path}`);
        writes.push(() =>
          table === "events" && !old.has(path)
            ? tx.create(ref, v)
            : tx.set(ref, v),
        );
      }
    }
    // A pallet received elsewhere leaves this warehouse: its record, label and photo records now live there.
    for (const [id, rows] of before)
      for (const path of rows.keys())
        if (!after.get(id)?.has(path)) {
          if (!allowed.has(id))
            throw new HttpsError(
              "internal",
              "A transfer tried to change another account.",
            );
          writes.push(() => tx.delete(store.doc(`workspaces/${id}/${path}`)));
        }
    // Its history comes along, so the record reads the same at the new warehouse.
    for (const [palletId, list] of history) {
      const now = db.pallets[palletId];
      if (!now || now.workspace_id === src || !allowed.has(now.workspace_id))
        continue;
      const events = root(now.workspace_id).collection("events");
      for (const d of list)
        writes.push(() => tx.set(events.doc(d.id), d.data()!));
      // "Transfer now" also sent it in this same step.
      for (const ev of db.events[palletId] ?? [])
        if (ev.workspace_id === src)
          writes.push(() =>
            tx.set(events.doc(`${ev.pallet_id}_${ev.revision}`), clean(ev)),
          );
    }
    if (
      counterRef &&
      counterBefore !== undefined &&
      db.transfer_counters[account!] !== counterBefore
    )
      writes.push(() =>
        tx.set(counterRef, {
          value: db.transfer_counters[account!],
          account_id: account,
        }),
      );
    if (writes.length > MAX_WRITES)
      throw new HttpsError(
        "resource-exhausted",
        "This transfer is too large to save at once. Send fewer pallets.",
      );
    for (const w of writes) w();
    tx.set(rateRef, {
      minute: nowMinute,
      minuteCount: minuteCount + 1,
      day,
      dayCount: dayCount + 1,
    });
    tx.create(
      root(ws).collection("receipts").doc(cmd.command_id),
      clean(db.receipts[receiptKey]),
    );
    return clean(result);
  });
}
