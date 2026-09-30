import { canEditWarehouse } from "./access";
import { measured } from "./repository";
import {
  getFirestore,
  Timestamp,
  type Transaction,
} from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { HttpsError } from "firebase-functions/v2/https";

export const PHOTO_MAX = 5 * 1024 * 1024,
  THUMB_MAX = 128 * 1024;
export async function reservePhoto(request: any) {
  const uid = request.auth?.uid;
  if (!uid || !request.auth.token.email_verified)
    throw new HttpsError("unauthenticated", "Sign in with a verified email.");
  const {
    workspaceId: ws,
    uploadId: id,
    bytes,
    thumbBytes,
  } = request.data || {};
  if (
    !/^[\w-]{1,128}$/.test(ws || "") ||
    !/^[\w-]{1,128}$/.test(id || "") ||
    !Number.isInteger(bytes) ||
    bytes < 1 ||
    bytes > PHOTO_MAX ||
    !Number.isInteger(thumbBytes) ||
    thumbBytes < 1 ||
    thumbBytes > THUMB_MAX
  )
    throw new HttpsError(
      "invalid-argument",
      "Invalid photo size or upload ID.",
    );
  const db = getFirestore(),
    root = db.doc(`workspaces/${ws}`),
    reservation = root.collection("uploads").doc(id);
  return measured("reserve_photo", id, async (tx) => {
    const [member, license, prior] = await Promise.all([
      tx.get(root.collection("members").doc(uid)),
      tx.get(db.doc(`licenses/${ws}`)),
      tx.get(reservation),
    ]);
    if (
      !member.get("active") ||
      !["OWNER", "SUPERVISOR", "OPERATOR"].includes(member.get("role")) ||
      !canEditWarehouse(license.data())
    )
      throw new HttpsError(
        "permission-denied",
        "Warehouse access is required.",
      );
    if (prior.exists) {
      if (
        prior.get("uid") !== uid ||
        prior.get("bytes") !== bytes ||
        prior.get("thumbBytes") !== thumbBytes ||
        prior.get("state") !== "reserved" ||
        prior.get("expires_at").toMillis() <= Date.now()
      )
        throw new HttpsError(
          "failed-precondition",
          "This upload reservation is no longer available.",
        );
      return prior.data();
    }
    const day = new Date().toISOString().slice(0, 10),
      month = day.slice(0, 7);
    const quotaRef = root.collection("private").doc("photoQuota"),
      dailyRef = root.collection("private").doc(`uploads_${uid}`);
    const [quota, daily] = await Promise.all([
      tx.get(quotaRef),
      tx.get(dailyRef),
    ]);
    const count = daily.get("day") === day ? daily.get("count") || 0 : 0;
    const used =
        quota.get("month") === month ? quota.get("monthBytes") || 0 : 0,
      total = quota.get("retainedBytes") || 0,
      size = bytes + thumbBytes;
    if (
      count >= 120 ||
      used + size > (license.get("limits.photoMonthBytes") ?? 1024 ** 3) ||
      total + size > (license.get("limits.photoStoredBytes") ?? 10 * 1024 ** 3)
    )
      throw new HttpsError(
        "resource-exhausted",
        "Photo allowance reached. Contact support to arrange more storage. Existing photos remain available.",
      );
    const value = {
      uid,
      bytes,
      thumbBytes,
      state: "reserved",
      created_at: Timestamp.now(),
      expires_at: Timestamp.fromMillis(Date.now() + 24 * 3600000),
      full: `workspaces/${ws}/photos/${uid}/${id}/full.jpeg`,
      thumb: `workspaces/${ws}/photos/${uid}/${id}/thumb.jpeg`,
    };
    tx.create(reservation, value);
    tx.set(quotaRef, {
      month,
      monthBytes: used + size,
      retainedBytes: total + size,
    });
    tx.set(dailyRef, { day, count: count + 1 });
    return value;
  });
}

export async function validatePhotoObjects(
  ws: string,
  uid: string,
  id: string,
  p: any,
) {
  const prefix = `workspaces/${ws}/photos/${uid}/${id}/`;
  if (
    p.data_url !== `storage://${prefix}full.jpeg` ||
    p.thumb_url !== `storage://${prefix}thumb.jpeg` ||
    p.media_type !== "image/jpeg"
  )
    throw new HttpsError(
      "invalid-argument",
      "Reserve and upload both photo sizes first.",
    );
  const bucket = getStorage().bucket();
  const [full, thumb] = await Promise.all(
    ["full.jpeg", "thumb.jpeg"].map(
      async (filename) =>
        (await bucket.file(prefix + filename).getMetadata())[0],
    ),
  );
  if (
    Number(full.size) !== p.bytes ||
    Number(full.size) > PHOTO_MAX ||
    Number(thumb.size) > THUMB_MAX ||
    full.contentType !== "image/jpeg" ||
    thumb.contentType !== "image/jpeg" ||
    full.metadata?.uploadedBy !== uid ||
    thumb.metadata?.uploadedBy !== uid
  )
    throw new HttpsError("invalid-argument", "Photo metadata did not match.");
  return { full, thumb };
}
export async function readPhotoReservation(
  tx: Transaction,
  ws: string,
  uid: string,
  id: string,
  p: any,
) {
  const ref = getFirestore().doc(`workspaces/${ws}/uploads/${id}`),
    s = await tx.get(ref);
  if (
    s.get("uid") !== uid ||
    s.get("state") !== "reserved" ||
    s.get("bytes") !== p.bytes ||
    s.get("expires_at").toMillis() <= Date.now()
  )
    throw new HttpsError(
      "failed-precondition",
      "The photo upload expired. Select the photo again.",
    );
  return ref;
}

/** Only expired reservations are eligible. Committed/legacy photos, including removed history, are never swept. */
export async function sweepAbandonedPhotos() {
  const db = getFirestore();
  const candidates = await db
    .collectionGroup("uploads")
    .where("state", "in", ["reserved", "deleting"])
    .where("expires_at", "<=", Timestamp.fromMillis(Date.now() - 24 * 3600000))
    .limit(100)
    .get();
  let deleted = 0;
  for (const candidate of candidates.docs) {
    const claimed = await db.runTransaction(async (tx) => {
      const s = await tx.get(candidate.ref);
      if (
        !["reserved", "deleting"].includes(s.get("state")) ||
        s.get("expires_at").toMillis() > Date.now()
      )
        return null;
      tx.update(s.ref, { state: "deleting" });
      return s.data();
    });
    if (!claimed) continue;
    // The state transition closes upload/commit before object deletion. Generation preconditions protect replacements.
    for (const path of [claimed.full, claimed.thumb]) {
      const file = getStorage().bucket().file(path);
      try {
        const [m] = await file.getMetadata();
        await file.delete({ ifGenerationMatch: Number(m.generation) });
      } catch (e) {
        if ((e as any).code !== 404) throw e;
      }
    }
    await db.runTransaction(async (tx) => {
      const current = await tx.get(candidate.ref);
      if (current.get("state") !== "deleting") return;
      const quotaRef = candidate.ref.parent
          .parent!.collection("private")
          .doc("photoQuota"),
        quota = await tx.get(quotaRef);
      if (quota.exists)
        tx.update(quotaRef, {
          retainedBytes: Math.max(
            0,
            (quota.get("retainedBytes") || 0) -
              claimed.bytes -
              claimed.thumbBytes,
          ),
        });
      tx.update(candidate.ref, {
        state: "deleted",
        deleted_at: Timestamp.now(),
      });
    });
    deleted++;
  }
  return { examined: candidates.size, deleted };
}
