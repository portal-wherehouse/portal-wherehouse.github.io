// Scheduled counts, move tasks and warehouse access: what each command reads, loaded inside the command
// transaction before the shared engine (src/demo/workEngine.ts) runs. Keep in step with the rules there: anything the
// engine looks at must be loaded here, or it will act as if the record did not exist.

import {
  FieldValue,
  getFirestore,
  type DocumentReference,
  type Query,
  type Transaction,
} from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { Engine, emptyDb, type Db } from "../../../src/demo/engine";
import type {
  CommandEnvelope,
  CountTask,
  Membership,
  User,
} from "../../../src/domain/types";
import { moveTaskId } from "../../../src/domain/work";
import { canEditWarehouse, canReadWarehouse } from "./access";
import { measured } from "./repository";

interface Loader {
  tx: Transaction;
  root: DocumentReference;
  db: Db;
  ws: string;
  cmd: CommandEnvelope;
  one: (table: string, id: unknown) => Promise<void>;
  query: (table: string, q: Query) => Promise<void>;
}

/** The spots of a pallet and its job, so its history entry and the spots' counts read right. */
async function palletAndPlaces(l: Loader, id: unknown) {
  await l.one("pallets", id);
  const p = l.db.pallets[String(id)];
  if (!p) return;
  await l.one("locations", p.current_location_id);
  await l.one("locations", p.last_confirmed_location_id);
  await l.one("jobs", p.job_id);
}

export async function loadWorkCommand(l: Loader) {
  const p: any = l.cmd.payload;
  const k = l.cmd.kind;
  if (k === "schedule_count") {
    if (p.scope === "zone" && typeof p.zone === "string")
      await l.query(
        "locations",
        l.root
          .collection("locations")
          .where("zone", "==", p.zone.trim().toUpperCase())
          .limit(50),
      );
    else await l.one("locations", p.location_id);
    await l.one("members", p.assigned_to);
  }
  if (k === "cancel_count" || k === "submit_count" || k === "review_count")
    await l.one("counts", p.count_id);
  const count = l.db.counts[String(p.count_id)] as CountTask | undefined;
  if (k === "submit_count" && count) {
    for (const s of (Array.isArray(p.spots) ? p.spots : []).slice(0, 20)) {
      await l.one("locations", s?.location_id);
      // What the records say is on the spot now.
      if (typeof s?.location_id === "string")
        await l.query(
          "pallets",
          l.root
            .collection("pallets")
            .where("current_location_id", "==", s.location_id)
            .where("state", "==", "STORED")
            .limit(200),
        );
      for (const id of (Array.isArray(s?.pallet_ids) ? s.pallet_ids : []).slice(
        0,
        200,
      ))
        await palletAndPlaces(l, id);
    }
    // A count that matches is saved at once: each pallet gets a history entry that names its job.
    for (const pal of Object.values(l.db.pallets))
      await l.one("jobs", pal.job_id);
  }
  if (k === "review_count" && count)
    for (const line of count.lines.slice(0, 200)) {
      await l.one("locations", line.location_id);
      await palletAndPlaces(l, line.pallet_id);
    }
  if (k === "queue_moves") {
    if (p.assigned_to) await l.one("members", p.assigned_to);
    for (const line of (Array.isArray(p.lines) ? p.lines : []).slice(0, 50)) {
      await palletAndPlaces(l, line?.pallet_id);
      await l.one("locations", line?.to_location_id);
    }
  }
  if (k === "cancel_move") await l.one("tasks", p.task_id);
}

/** Pallet commands that can put a pallet on a spot also complete its move task. */
export async function loadMoveTask(l: Loader) {
  if (
    ["move", "place", "locate", "return", "correct"].includes(l.cmd.kind) &&
    typeof l.cmd.pallet_id === "string"
  )
    await l.one("tasks", moveTaskId(l.cmd.pallet_id));
}

const clean = (x: unknown) => JSON.parse(JSON.stringify(x));
const validId = (x: unknown): x is string =>
  typeof x === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(x);
const PAUSED =
  "Changes are paused until renewed. Existing records can be read and exported during the 14-day grace period.";

/**
 * Warehouse access per person: one command that changes a teammate's membership in several warehouses of one
 * account. The account is the license owner, and its warehouses are the ones the owner's profile lists. Every
 * warehouse whose membership changes must be in that account and open for changes; the engine checks that the
 * actor manages each one.
 */
export async function accessCommand(
  user: User,
  cmd: CommandEnvelope,
): Promise<unknown> {
  const store = getFirestore();
  const ws = cmd.workspace_id;
  const target = String(cmd.payload.user_id ?? "");
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
    const receiptKey = `${ws}:${cmd.command_id}`;
    if (receiptSnap.exists) {
      // A retry answers from the stored receipt, without loading or changing anything.
      if (!canReadWarehouse(license))
        throw new HttpsError("permission-denied", PAUSED);
      db.memberships.push(memberSnap.data() as Membership);
      db.receipts[receiptKey] = receiptSnap.data() as any;
      return clean(new Engine(db).execute(user.id, cmd));
    }
    if (!canEditWarehouse(license))
      throw new HttpsError("permission-denied", PAUSED);
    if (!validId(target))
      throw new HttpsError("invalid-argument", "Choose a teammate.");

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

    // The account and its warehouses. Only the functions write licenses and profiles, so neither can be claimed.
    const account =
      typeof license?.owner_uid === "string" ? license.owner_uid : null;
    const owner = account ? await tx.get(store.doc(`users/${account}`)) : null;
    const listed: string[] = (owner?.get("owned_workspaces") ?? []).filter(
      validId,
    );
    const ids = [...new Set([ws, ...listed])].slice(0, 50);
    const editable = new Set<string>();
    const wanted = new Set<string>(
      Array.isArray(cmd.payload.workspace_ids)
        ? (cmd.payload.workspace_ids as unknown[]).filter(validId)
        : [],
    );
    for (const id of ids) {
      const [lic, ws_, actorM, targetM] = await Promise.all([
        id === ws
          ? Promise.resolve(licenseSnap)
          : tx.get(store.doc(`licenses/${id}`)),
        tx.get(root(id)),
        tx.get(root(id).collection("members").doc(user.id)),
        tx.get(root(id).collection("members").doc(target)),
      ]);
      if (!account || lic.get("owner_uid") !== account) continue;
      if (canEditWarehouse(lic.data())) editable.add(id);
      db.workspaces[id] = {
        id,
        name: ws_.get("name") || "Warehouse",
        created_at: ws_.get("created_at") || "",
        account_id: account,
      };
      for (const m of [actorM, targetM])
        if (m.exists) {
          db.memberships.push({
            workspace_id: id,
            user_id: m.get("user_id"),
            role: m.get("role"),
            active: m.get("active") === true,
            ...(m.get("limited") ? { limited: true } : {}),
          });
          if (m.get("user")) db.users[m.get("user_id")] = m.get("user");
        }
      // Taking an owner out needs to know whether another owner stays.
      if (targetM.get("role") === "OWNER" && targetM.get("active")) {
        const owners = await tx.get(
          root(id)
            .collection("members")
            .where("role", "==", "OWNER")
            .where("active", "==", true)
            .limit(3),
        );
        for (const d of owners.docs)
          if (d.id !== target && d.id !== user.id)
            db.memberships.push({
              workspace_id: id,
              user_id: d.id,
              role: "OWNER",
              active: true,
            });
      }
      // Giving access back counts against the plan's ten people.
      if (wanted.has(id) && !targetM.get("active")) {
        const active = await tx.get(
          root(id).collection("members").where("active", "==", true).limit(11),
        );
        if (active.size >= 10)
          throw new HttpsError(
            "resource-exhausted",
            "This plan includes ten active people. Remove unused access or contact support.",
          );
      }
    }
    if (!db.users[user.id]) db.users[user.id] = user;

    const key = (m: Membership) => `${m.workspace_id}/${m.user_id}`;
    const before = new Map(
      db.memberships.map((m) => [key(m), JSON.stringify(m)]),
    );
    const audits = db.audit.length;
    const result = new Engine(db).execute(user.id, cmd);
    if (!db.receipts[receiptKey]) return clean(result);
    const changed = db.memberships.filter(
      (m) => before.get(key(m)) !== JSON.stringify(m),
    );
    for (const m of changed) {
      if (!editable.has(m.workspace_id))
        throw new HttpsError(
          "permission-denied",
          "Changes at that warehouse are paused until it is renewed.",
        );
      tx.set(root(m.workspace_id).collection("members").doc(m.user_id), {
        ...clean(m),
        user: db.users[m.user_id] ?? null,
      });
      tx.set(
        store.doc(`users/${m.user_id}`),
        {
          workspaces: m.active
            ? FieldValue.arrayUnion(m.workspace_id)
            : FieldValue.arrayRemove(m.workspace_id),
        },
        { merge: true },
      );
    }
    for (const a of db.audit.slice(audits))
      tx.create(root(a.workspace_id).collection("audit").doc(a.id), clean(a));
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
