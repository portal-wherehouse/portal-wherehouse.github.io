import { canReadWarehouse } from "./access";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
export async function warehouseSummary(request: any) {
  const uid = request.auth?.uid,
    ws = request.data?.workspaceId;
  if (
    !uid ||
    !request.auth.token.email_verified ||
    !/^[\w-]{1,128}$/.test(ws || "")
  )
    throw new HttpsError("unauthenticated", "Sign in first.");
  const db = getFirestore(),
    root = db.doc(`workspaces/${ws}`);
  const [member, license] = await Promise.all([
    root.collection("members").doc(uid).get(),
    db.doc(`licenses/${ws}`).get(),
  ]);
  if (!member.get("active") || !canReadWarehouse(license.data()))
    throw new HttpsError(
      "permission-denied",
      "Active warehouse access is required.",
    );
  const cache = root.collection("private").doc("summaryCache"),
    cached = await cache.get();
  if (cached.exists && Date.now() - cached.get("at") < 60000)
    return cached.get("value");
  // A short lease coalesces concurrent requests; a crashed worker can be retried after 30 seconds.
  const lease = await db.runTransaction(async (tx) => {
    const c = await tx.get(cache);
    if (c.get("leaseUntil") > Date.now()) return false;
    tx.set(cache, { leaseUntil: Date.now() + 30000 }, { merge: true });
    return true;
  });
  if (!lease) {
    if (cached.get("value")) return cached.get("value");
    throw new HttpsError(
      "unavailable",
      "Overview is refreshing. Try again shortly.",
    );
  }
  const pallets = root.collection("pallets").where("archived_at", "==", null);
  const count = async (q: any) => (await q.count().get()).data().count;
  const names = ["RECEIVED", "STORED", "MISSING", "DISPATCHED", "RETIRED"];
  const counts = Object.fromEntries(
    await Promise.all(
      names.map(async (state) => [
        state,
        await count(pallets.where("state", "==", state)),
      ]),
    ),
  );
  const [holds, reprint, stale] = await Promise.all([
    count(
      pallets.where("has_hold", "==", true).where("state", "!=", "RETIRED"),
    ),
    count(
      pallets
        .where("label_needs_reprint", "==", true)
        .where("state", "!=", "RETIRED"),
    ),
    count(
      pallets
        .where("state", "==", "STORED")
        .where(
          "last_confirmed_at",
          "<",
          new Date(Date.now() - 3 * 86400000).toISOString(),
        ),
    ),
  ]);
  const value = { counts, holds, reprint, stale, at: new Date().toISOString() };
  await cache.set({ value, at: Date.now(), leaseUntil: 0 });
  return value;
}

export async function directoryCounts(request: any) {
  const uid = request.auth?.uid,
    ws = request.data?.workspaceId,
    table = request.data?.table,
    ids = request.data?.ids;
  if (
    !uid ||
    !request.auth.token.email_verified ||
    !/^[\w-]{1,128}$/.test(ws || "") ||
    !["jobs", "locations"].includes(table) ||
    !Array.isArray(ids) ||
    ids.length > 50 ||
    ids.some((id) => !/^[\w-]{1,128}$/.test(id))
  )
    throw new HttpsError(
      "invalid-argument",
      "Choose up to 50 jobs or locations.",
    );
  const db = getFirestore(),
    root = db.doc(`workspaces/${ws}`),
    [member, license] = await Promise.all([
      root.collection("members").doc(uid).get(),
      db.doc(`licenses/${ws}`).get(),
    ]);
  if (!member.get("active") || !canReadWarehouse(license.data()))
    throw new HttpsError(
      "permission-denied",
      "Active warehouse access is required.",
    );
  const result: Record<string, any> = {};
  for (let start = 0; start < ids.length; start += 5)
    await Promise.all(
      ids.slice(start, start + 5).map(async (id: string) => {
        const cache = root.collection("private").doc(`count_${table}_${id}`),
          old = await cache.get();
        if (old.get("at") && Date.now() - old.get("at") < 60000) {
          result[id] = old.get("value");
          return;
        }
        if (!(await root.collection(table).doc(id).get()).exists) return;
        const q = root
          .collection("pallets")
          .where(table === "jobs" ? "job_id" : "current_location_id", "==", id);
        const count = async (query: any) =>
          (await query.count().get()).data().count;
        const value: any =
          table === "locations"
            ? {
                pallet_count: await count(q),
                hold_count: await count(q.where("has_hold", "==", true)),
              }
            : {
                counts: Object.fromEntries(
                  await Promise.all(
                    [
                      "RECEIVED",
                      "STORED",
                      "MISSING",
                      "DISPATCHED",
                      "RETIRED",
                    ].map(async (state) => [
                      state,
                      await count(q.where("state", "==", state)),
                    ]),
                  ),
                ),
              };
        if (table === "jobs")
          value.counts.HOLD = await count(
            q.where("has_hold", "==", true).where("state", "!=", "RETIRED"),
          );
        result[id] = value;
        await cache.set({ at: Date.now(), value });
      }),
    );
  return { values: result, at: new Date().toISOString() };
}
