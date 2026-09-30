import { productKey, reminderDate } from "../../../src/domain/receiving";
import {
  getFirestore,
  type Transaction,
  type Query,
  type DocumentSnapshot,
} from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { emptyDb, type Db } from "../../../src/demo/engine";
import { normalizeCode } from "../../../src/domain/codes";
import type { CommandEnvelope } from "../../../src/domain/types";

// Pallet numbers share one sequence. Queue allocations within an instance so a burst
// of receivers does not repeatedly collide. Firestore still serializes across instances.
const allocationQueues = new Map<
  string,
  { tail: Promise<unknown>; size: number }
>();
export async function counterSlot<T>(
  ws: string,
  needed: boolean,
  work: () => Promise<T>,
): Promise<T> {
  if (!needed) return work();
  const queue = allocationQueues.get(ws) || {
    tail: Promise.resolve(),
    size: 0,
  };
  if (queue.size >= 20)
    throw new HttpsError(
      "resource-exhausted",
      "Receiving is busy. Check this request and retry shortly.",
    );
  allocationQueues.set(ws, queue);
  queue.size++;
  let expired = false;
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      expired = true;
      reject(
        new HttpsError(
          "resource-exhausted",
          "Receiving is busy. Retry shortly.",
        ),
      );
    }, 10000);
  });
  const task = queue.tail
    .catch(() => {})
    .then(async () => {
      clearTimeout(timer);
      if (expired)
        throw new HttpsError(
          "resource-exhausted",
          "Receiving request expired before saving.",
        );
      return work();
    })
    .finally(() => {
      queue.size--;
      if (!queue.size) allocationQueues.delete(ws);
    });
  queue.tail = task.catch(() => {});
  return Promise.race([task, timeout]);
}

// These counters measure SDK operations and transaction attempts, not Google invoices.
export async function measured<T>(
  operation: string,
  key: string,
  work: (tx: Transaction) => Promise<T>,
  extraReads = 0,
): Promise<T> {
  const db = getFirestore(),
    started = performance.now();
  let reads = extraReads,
    returned = 0,
    attempts = 0,
    writes = 0,
    attemptedWrites = 0,
    committed = false;
  try {
    const result = await db.runTransaction(
      async (raw) => {
        attempts++;
        writes = 0;
        const tx = new Proxy(raw, {
          get(target, prop) {
            if (prop === "get")
              return async (ref: any) => {
                const s: any = await target.get(ref);
                const n = "docs" in s ? s.size : s.exists ? 1 : 0;
                reads += Math.max(1, n);
                returned += n;
                return s;
              };
            if (["set", "create", "update", "delete"].includes(String(prop)))
              return (...args: any[]) => {
                writes++;
                attemptedWrites++;
                (target as any)[prop](...args);
                return tx;
              };
            const value = (target as any)[prop];
            return typeof value === "function" ? value.bind(target) : value;
          },
        }) as Transaction;
        return work(tx);
      },
      { maxAttempts: 5 },
    );
    committed = true;
    return result;
  } finally {
    const metric = {
      operation,
      key,
      reads,
      returned,
      writes: committed ? writes : 0,
      committed,
      attemptedWrites,
      attempts,
      retries: Math.max(0, attempts - 1),
      ms: performance.now() - started,
    };
    if (
      process.env.GCLOUD_PROJECT === "demo-wherehouse" &&
      process.env.FIRESTORE_EMULATOR_HOST
    ) {
      const g = globalThis as any;
      (g.__wherehouseMetrics ??= []).push(metric);
    }
  }
}

export function putSnapshot(db: Db, table: string, snap: DocumentSnapshot) {
  if (!snap.exists) return;
  const v: any = snap.data();
  if (table === "members") {
    const i = db.memberships.findIndex((m) => m.user_id === v.user_id);
    if (i >= 0) db.memberships.splice(i, 1);
    db.memberships.push({
      workspace_id: v.workspace_id,
      user_id: v.user_id,
      role: v.role,
      active: v.active,
    });
    db.users[v.user_id] = v.user;
  } else if (table === "events") (db.events[v.pallet_id] ??= []).push(v);
  else if (table === "audit" || table === "lineage") db[table].push(v);
  else if (table === "private") {
    if (snap.id === "counter")
      db.counters[v.workspace_id || Object.keys(db.workspaces)[0]] = v.value;
  } else (db as any)[table][v.id ?? v.token ?? snap.id] = v;
}

/** Load only the entities whose invariants this command can read. Never load event/audit history. */
export async function loadCommand(
  tx: Transaction,
  ws: string,
  cmd: CommandEnvelope,
  member: DocumentSnapshot,
): Promise<Db> {
  const store = getFirestore(),
    root = store.doc(`workspaces/${ws}`),
    db = emptyDb();
  putSnapshot(db, "members", member);
  const loaded = new Set<string>();
  const one = async (table: string, id: unknown) => {
    if (typeof id !== "string" || !id || id.includes("/")) return;
    const key = table + "/" + id;
    if (loaded.has(key)) return;
    loaded.add(key);
    const snap = await tx.get(root.collection(table).doc(id));
    putSnapshot(db, table, snap);
  };
  const query = async (table: string, q: Query) => {
    const snap = await tx.get(q);
    snap.docs.forEach((d) => {
      loaded.add(table + "/" + d.id);
      putSnapshot(db, table, d);
    });
  };
  const find = async (
    table: string,
    field: string,
    value: unknown,
    max = 1,
  ) => {
    if (value !== undefined && value !== null)
      await query(
        table,
        root.collection(table).where(field, "==", value).limit(max),
      );
  };
  const p: any = cmd.payload,
    k = cmd.kind;
  if (k === "update_warehouse") {
    const workspace = await tx.get(root);
    if (workspace.exists) db.workspaces[ws] = workspace.data() as any;
  }
  // A warehouse has one active facility. It is a bounded lookup even for migrated data.
  await query(
    "warehouses",
    root.collection("warehouses").where("active", "==", true).limit(1),
  );
  if (
    ["receive", "split"].includes(k) ||
    (k === "import_batch" && p.import_kind === "pallets")
  ) {
    const c = await tx.get(root.collection("private").doc("counter"));
    db.counters[ws] = c.get("value") || 0;
  }
  await one("pallets", cmd.pallet_id);
  const pallet = cmd.pallet_id ? db.pallets[cmd.pallet_id] : undefined;
  for (const id of new Set([pallet?.job_id, p.job_id])) await one("jobs", id);
  for (const id of new Set([
    pallet?.current_location_id,
    pallet?.last_confirmed_location_id,
    p.location_id,
  ]))
    await one("locations", id);
  if (k === "receive") {
    await one("shipments", p.shipment_id);
    if (p.remember_product && p.receiving?.product_code)
      await one("products", productKey(ws, p.receiving.product_code));
  }
  if (k === "split")
    for (const child of p.children || []) await one("jobs", child.job_id);
  if (k === "add_photo") {
    await query(
      "attachments",
      root
        .collection("attachments")
        .where("pallet_id", "==", cmd.pallet_id)
        .where("state", "==", "ready")
        .limit(3),
    );
    await one("attachments", p.attachment_id);
  }
  if (k === "remove_photo") await one("attachments", p.attachment_id);
  if (k === "rename_import") await one("imports", p.import_id);
  if (k === "update_issue") await one("issues", p.issue_id);
  // Setting a capacity recounts what is stored there now.
  if (k === "set_location_capacity")
    await query(
      "pallets",
      root
        .collection("pallets")
        .where("current_location_id", "==", p.location_id)
        .limit(500),
    );
  if (k === "report_issue") {
    await one("issues", cmd.command_id);
    for (const id of (p.pallet_ids || []).slice(0, 50))
      await one("pallets", id);
    for (const id of (p.attachment_ids || []).slice(0, 6))
      await one("attachments", id);
  }
  if (k === "save_product" && typeof p.code === "string")
    await one("products", productKey(ws, p.code));
  if (k === "save_product") await one("locations", p.home_location_id);
  if (k === "rotate_label")
    await query(
      "labels",
      root
        .collection("labels")
        .where("target_id", "==", cmd.pallet_id)
        .where("revoked_at", "==", null)
        .limit(1),
    );
  if (["create_job", "create_location", "rename_location"].includes(k)) {
    const table = k === "create_job" ? "jobs" : "locations";
    await find(table, "code", normalizeCode(p.code || ""));
    // Transactional uniqueness locks cover two simultaneous inserts into an empty query.
    await tx.get(
      root
        .collection("codeLocks")
        .doc(`${table}_${encodeURIComponent(normalizeCode(p.code || ""))}`),
    );
  }
  if (k === "close_job") {
    await query(
      "pallets",
      root
        .collection("pallets")
        .where("job_id", "==", p.job_id)
        .where("state", "in", ["RECEIVED", "STORED", "MISSING"])
        .limit(1),
    );
    await query(
      "pallets",
      root
        .collection("pallets")
        .where("job_id", "==", p.job_id)
        .where("has_hold", "==", true)
        .where("state", "!=", "RETIRED")
        .limit(1),
    );
  }
  if (k === "deactivate_location")
    await find("pallets", "current_location_id", p.location_id);
  if (["invite_member", "change_role", "remove_member"].includes(k)) {
    await query(
      "members",
      root.collection("members").where("active", "==", true).limit(11),
    );
    await one("members", p.user_id);
  }
  if (k === "import_batch") {
    const table = p.import_kind === "locations" ? "locations" : "jobs",
      field = p.import_kind === "locations" ? "location_code" : "job_code";
    for (const code of new Set<string>(
      (p.rows || []).map((r: any) => normalizeCode(r[field] || "")),
    )) {
      if (!code) continue;
      await find(table, "code", code);
      // Pallet imports can add missing jobs, so they take the same uniqueness lock as job imports.
      if (["jobs", "locations", "pallets", "shipments"].includes(p.import_kind))
        await tx.get(
          root
            .collection("codeLocks")
            .doc(`${table}_${encodeURIComponent(code)}`),
        );
    }
  }
  return db;
}

export function rows(db: Db, ws: string): Map<string, any> {
  const out = new Map<string, any>();
  for (const table of [
    "warehouses",
    "locations",
    "jobs",
    "pallets",
    "labels",
    "attachments",
    "imports",
    "products",
    "shipments",
    "issues",
  ] as const)
    for (const [id, v] of Object.entries(db[table]))
      out.set(`${table}/${id}`, v);
  for (const list of Object.values(db.events))
    for (const ev of list) out.set(`events/${ev.pallet_id}_${ev.revision}`, ev);
  for (const m of db.memberships)
    out.set(`members/${m.user_id}`, { ...m, user: db.users[m.user_id] });
  for (const a of db.audit) out.set(`audit/${a.id}`, a);
  for (const a of db.lineage) out.set(`lineage/${a.child_id}`, a);
  if (ws in db.counters) out.set("private/counter", { value: db.counters[ws] });
  return out;
}
export function persist(
  tx: Transaction,
  ws: string,
  before: Map<string, any>,
  db: Db,
) {
  const root = getFirestore().doc(`workspaces/${ws}`);
  const changes = [...rows(db, ws)].filter(
    ([k, v]) => JSON.stringify(v) !== JSON.stringify(before.get(k)),
  );
  if (changes.length > 400)
    throw new HttpsError("resource-exhausted", "Import fewer rows at a time.");
  for (const [path, raw] of changes) {
    const table = path.split("/")[0];
    let v = JSON.parse(JSON.stringify(raw));
    if (table === "pallets")
      v = {
        ...v,
        reminder_due: reminderDate(v),
        has_hold: !!v.hold,
        search_terms: searchTerms({
          ...v,
          description: v.description + " " + (db.jobs[v.job_id]?.name || ""),
        }),
      };
    if (
      ["events", "audit", "lineage"].includes(table) ||
      (!before.has(path) && ["labels", "imports"].includes(table))
    )
      tx.create(root.collection(table).doc(path.slice(table.length + 1)), v);
    else tx.set(root.collection(table).doc(path.slice(table.length + 1)), v);
    if (["jobs", "locations"].includes(table))
      tx.set(
        root
          .collection("codeLocks")
          .doc(`${table}_${encodeURIComponent(v.code)}`),
        { target_id: v.id },
      );
  }
  // No warehouse-wide revision write: unrelated pallet moves should not contend.
  if (db.workspaces[ws]) tx.set(root, db.workspaces[ws], { merge: true });
}
export function searchTerms(p: any): string[] {
  const text =
    `${p.code} ${p.description} ${p.notes || ""} ${p.supplier_ref || ""} ${p.receiving?.product_code || ""} ${p.receiving?.destination || ""} ${(p.receiving?.fields || []).map((f: any) => f.name + " " + f.value).join(" ")} ${(p.receiving?.contents || []).map((c: any) => c.name + " " + c.sku).join(" ")}`.toLowerCase();
  const terms = new Set<string>();
  for (const word of text.match(/[\p{L}\p{N}-]+/gu) || [])
    for (let n = 2; n <= Math.min(word.length, 32); n++)
      terms.add(word.slice(0, n));
  return [...terms].slice(0, 600);
}
