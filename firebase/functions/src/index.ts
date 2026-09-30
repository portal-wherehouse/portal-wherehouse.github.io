import { canEditWarehouse, canReadWarehouse } from "./access";
import { registerAccount } from "./registration";
import { warehouseSummary, directoryCounts } from "./summary";
import { onSchedule } from "firebase-functions/v2/scheduler";
import {
  reservePhoto,
  validatePhotoObjects,
  readPhotoReservation,
  sweepAbandonedPhotos,
} from "./photos";
import {
  loadCommand,
  rows,
  persist,
  measured,
  counterSlot,
} from "./repository";
import { createHash } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import {
  FieldValue,
  Timestamp,
  getFirestore,
  type Transaction,
} from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { Engine, emptyDb, type Db } from "../../../src/demo/engine";
import { validateEnvelope } from "../../../src/domain/commands";
import { TRIAL_DAYS } from "../../../src/domain/license";
import type { CommandEnvelope, User } from "../../../src/domain/types";

initializeApp();
const firestore = getFirestore();
const options = {
  region: "us-east1",
  minInstances: 0,
  maxInstances: 3,
  concurrency: 20,
  timeoutSeconds: 30,
  memory: "256MiB" as const,
  enforceAppCheck:
    process.env.GCLOUD_PROJECT !== "demo-wherehouse" &&
    process.env.ENFORCE_APP_CHECK !== "false",
};
const clean = (x: unknown) => JSON.parse(JSON.stringify(x));
const emailHash = (email: string) =>
  createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
const keyHash = (key: string) =>
  createHash("sha256").update(key.trim()).digest("hex");
function licensed(data: any) {
  return canEditWarehouse(data);
}
async function requireLicense(tx: Transaction, ws: string) {
  const license = await tx.get(firestore.doc(`licenses/${ws}`));
  if (!licensed(license.data()))
    throw new HttpsError(
      "permission-denied",
      "Changes are paused until this warehouse is renewed. Existing records can be read and exported during the 14-day grace period. Contact the account owner.",
    );
  return license.data()!;
}
const validId = (x: unknown): x is string =>
  typeof x === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(x);
function actor(request: any): User {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  if (!request.auth.token.email_verified)
    throw new HttpsError(
      "failed-precondition",
      "Verify your email before opening a warehouse.",
    );
  return {
    id: request.auth.uid,
    email: request.auth.token.email || "",
    name: request.auth.token.name || request.auth.token.email || "Teammate",
  };
}
export const createWarehouse = onCall(options, async (request) => {
  const user = actor(request);
  const name = String(request.data?.name || "").trim();
  const warehouseName = String(request.data?.warehouseName || name).trim();
  const timezone = String(request.data?.timezone || "UTC");
  if (name.length < 2 || name.length > 100 || warehouseName.length > 100)
    throw new HttpsError(
      "invalid-argument",
      "Enter a warehouse name (2–100 characters).",
    );
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone });
  } catch {
    throw new HttpsError("invalid-argument", "Choose a valid time zone.");
  }
  const profile = firestore.doc(`users/${user.id}`);
  return firestore.runTransaction(async (tx) => {
    const existing = await tx.get(profile);
    const sourceWs = request.data?.sourceWorkspaceId;
    let sourceFeatures: Record<string, unknown> | undefined;
    if (sourceWs !== undefined) {
      if (typeof sourceWs !== "string" || !/^[\w-]{1,128}$/.test(sourceWs))
        throw new HttpsError(
          "invalid-argument",
          "Choose the current warehouse.",
        );
      const sourceMember = await tx.get(
        firestore.doc(`workspaces/${sourceWs}/members/${user.id}`),
      );
      if (!sourceMember.get("active") || sourceMember.get("role") !== "OWNER")
        throw new HttpsError(
          "permission-denied",
          "Only the warehouse owner can add a warehouse.",
        );
      const sourceLicense = await requireLicense(tx, sourceWs);
      if (sourceLicense.features?.multiWarehouse !== true)
        throw new HttpsError(
          "permission-denied",
          "Your current plan does not include this feature. Please contact us to upgrade.",
        );
      sourceFeatures = sourceLicense.features;
    }
    if (
      !sourceWs &&
      existing.get("owned_workspace") &&
      !request.data?.usageKey
    ) {
      await requireLicense(tx, existing.get("owned_workspace"));
      return { workspaceId: existing.get("owned_workspace") };
    }
    const key = String(request.data?.usageKey || "").trim();
    // One free trial warehouse per account, no key needed. Paying later renews the same warehouse with a key.
    if (request.data?.trial === true && !key && !sourceWs) {
      if (existing.get("owned_workspace") || existing.get("trial_used"))
        throw new HttpsError(
          "already-exists",
          "This account has already used its free trial. Enter a usage key to keep going.",
        );
      const db = emptyDb();
      const { workspace } = new Engine(db).createWorkspace(user, name, {
        code: "WH",
        name: warehouseName,
        timezone,
        onboarding: true,
      });
      persist(tx, workspace.id, new Map(), db);
      tx.create(firestore.doc(`licenses/${workspace.id}`), {
        active: true,
        trial: true,
        owner_uid: user.id,
        expires_at: Timestamp.fromMillis(Date.now() + TRIAL_DAYS * 86400000),
        activated_at: Timestamp.now(),
      });
      tx.set(
        profile,
        {
          ...user,
          trial_used: true,
          owned_workspace: workspace.id,
          owned_workspaces: FieldValue.arrayUnion(workspace.id),
          workspaces: FieldValue.arrayUnion(workspace.id),
        },
        { merge: true },
      );
      // A new self-serve customer: kept for John to follow up, with their plan survey answers if they took it.
      const survey = request.data?.survey;
      tx.create(firestore.doc(`leads/${workspace.id}`), {
        kind: "trial",
        uid: user.id,
        email: user.email,
        name: user.name,
        warehouse: warehouseName,
        timezone,
        survey:
          survey &&
          typeof survey === "object" &&
          JSON.stringify(survey).length <= 4000
            ? clean(survey)
            : null,
        created_at: Timestamp.now(),
      });
      return { workspaceId: workspace.id, trialDays: TRIAL_DAYS };
    }
    if (!/^WH-[a-f0-9]{48}$/.test(key))
      throw new HttpsError(
        "permission-denied",
        "Enter the usage key issued for your account.",
      );
    const keyRef = firestore.doc(`activationKeys/${keyHash(key)}`);
    const issued = await tx.get(keyRef);
    const activation = issued.data();
    // An additional warehouse uses its own account-bound key. A lost reply can recover the same warehouse.
    if (
      sourceWs &&
      activation?.redeemed_by === user.id &&
      activation?.source_workspace === sourceWs &&
      activation?.workspace_id
    ) {
      const targetMember = await tx.get(
        firestore.doc(
          `workspaces/${activation.workspace_id}/members/${user.id}`,
        ),
      );
      if (targetMember.get("active") && targetMember.get("role") === "OWNER") {
        await requireLicense(tx, activation.workspace_id);
        return { workspaceId: activation.workspace_id };
      }
    }
    if (sourceWs) {
      const limit = Math.min(
        50,
        Math.max(2, Number(sourceFeatures?.maxWarehouses) || 5),
      );
      if ((existing.get("workspaces") || []).length >= limit)
        throw new HttpsError(
          "resource-exhausted",
          "Your warehouse allowance is full. Contact us to upgrade. Existing warehouses are unchanged.",
        );
    }
    if (
      !activation ||
      activation.email !== user.email.toLowerCase() ||
      activation.revoked ||
      activation.redeemed_by ||
      activation.redeem_before.toMillis() <= Date.now()
    )
      throw new HttpsError(
        "permission-denied",
        "This key is invalid, expired, or belongs to another account.",
      );
    if (!sourceWs && existing.get("owned_workspace")) {
      const ws = request.data?.workspaceId || existing.get("owned_workspace");
      if (typeof ws !== "string" || !/^[\w-]{1,128}$/.test(ws))
        throw new HttpsError(
          "invalid-argument",
          "Choose the warehouse to renew.",
        );
      const membership = await tx.get(
        firestore.doc(`workspaces/${ws}/members/${user.id}`),
      );
      if (!membership.get("active") || membership.get("role") !== "OWNER")
        throw new HttpsError(
          "permission-denied",
          "Only the account owner can activate this warehouse.",
        );
      const current = await tx.get(firestore.doc(`licenses/${ws}`));
      tx.set(
        firestore.doc(`licenses/${ws}`),
        {
          active: true,
          owner_uid: user.id,
          expires_at: Timestamp.fromMillis(
            Math.max(Date.now(), current.get("expires_at")?.toMillis() || 0) +
              activation.days * 86400000,
          ),
          activated_at: Timestamp.now(),
          ...(activation.limits ? { limits: activation.limits } : {}),
        },
        { merge: true },
      );
      tx.update(keyRef, {
        redeemed_by: user.id,
        workspace_id: ws,
        redeemed_at: Timestamp.now(),
      });
      return { workspaceId: ws };
    }
    const db = emptyDb();
    const engine = new Engine(db);
    const { workspace } = engine.createWorkspace(user, name, {
      code: "WH",
      name: warehouseName,
      timezone,
    });
    persist(tx, workspace.id, new Map(), db);
    tx.create(firestore.doc(`licenses/${workspace.id}`), {
      active: true,
      owner_uid: user.id,
      expires_at: Timestamp.fromMillis(Date.now() + activation.days * 86400000),
      activated_at: Timestamp.now(),
      ...(activation.limits ? { limits: activation.limits } : {}),
      ...(sourceFeatures ? { features: sourceFeatures } : {}),
    });
    tx.update(keyRef, {
      redeemed_by: user.id,
      workspace_id: workspace.id,
      ...(sourceWs ? { source_workspace: sourceWs } : {}),
      redeemed_at: Timestamp.now(),
    });
    tx.set(
      profile,
      {
        ...user,
        owned_workspace: existing.get("owned_workspace") || workspace.id,
        owned_workspaces: FieldValue.arrayUnion(workspace.id),
        workspaces: FieldValue.arrayUnion(workspace.id),
      },
      { merge: true },
    );
    return { workspaceId: workspace.id };
  });
});

export const command = onCall(options, async (request) => {
  const user = actor(request);
  if (Buffer.byteLength(JSON.stringify(request.data || {})) > 256 * 1024)
    throw new HttpsError("invalid-argument", "Request too large.");
  const parsed = validateEnvelope(request.data);
  if (!parsed.ok)
    throw new HttpsError("invalid-argument", "The request is not valid.");
  const cmd = parsed.cmd as CommandEnvelope;
  if (!validId(cmd.workspace_id) || !validId(cmd.command_id))
    throw new HttpsError(
      "invalid-argument",
      "Invalid warehouse or request ID.",
    );
  if (
    cmd.kind === "import_batch" &&
    Array.isArray(cmd.payload.rows) &&
    cmd.payload.rows.length > 80
  )
    throw new HttpsError("invalid-argument", "Import up to 80 rows at a time.");
  const memberRef = firestore.doc(
    `workspaces/${cmd.workspace_id}/members/${user.id}`,
  );
  let teammate: User | undefined;
  if (cmd.kind === "invite_member") {
    const member = await memberRef.get();
    if (!member.get("active"))
      throw new HttpsError(
        "permission-denied",
        "Warehouse access is required.",
      );
    if (!["OWNER", "SUPERVISOR"].includes(member.get("role")))
      throw new HttpsError(
        "permission-denied",
        "Only managers can add teammates.",
      );
    try {
      const found = await getAuth().getUserByEmail(
        String(cmd.payload.email).trim().toLowerCase(),
      );
      if (!found.emailVerified || found.disabled) throw new Error("unverified");
      teammate = {
        id: found.uid,
        email: found.email!,
        name: found.displayName || String(cmd.payload.name),
      };
    } catch {
      throw new HttpsError(
        "failed-precondition",
        "Ask this person to create an account and verify their email first, then add them here.",
      );
    }
  }
  const ws = cmd.workspace_id;
  let photoCheckReads = 0;
  if (cmd.kind === "add_photo") {
    // Objects are immutable. Validate before acquiring transaction locks; the
    // reservation state inside the transaction fences cleanup against commit.
    const [membership, license, receipt] = await Promise.all([
      memberRef.get(),
      firestore.doc(`licenses/${ws}`).get(),
      firestore.doc(`workspaces/${ws}/receipts/${cmd.command_id}`).get(),
    ]);
    photoCheckReads = 3;
    if (
      !membership.get("active") ||
      !["OWNER", "SUPERVISOR", "OPERATOR"].includes(membership.get("role")) ||
      !(receipt.exists
        ? canReadWarehouse(license.data())
        : licensed(license.data()))
    )
      throw new HttpsError(
        "permission-denied",
        "Active warehouse access is required.",
      );
    if (!receipt.exists)
      await validatePhotoObjects(ws, user.id, cmd.command_id, cmd.payload);
  }
  const result = await counterSlot(
    ws,
    ["receive", "split"].includes(cmd.kind) ||
      (cmd.kind === "import_batch" && cmd.payload.import_kind === "pallets"),
    () =>
      measured(
        cmd.kind,
        cmd.command_id,
        async (tx) => {
          // Recheck authorization inside the transaction: removal racing with a command must win.
          const license = (
            await tx.get(firestore.doc(`licenses/${ws}`))
          ).data()!;
          const currentMember = await tx.get(memberRef);
          if (!currentMember.get("active"))
            throw new HttpsError(
              "permission-denied",
              "Your access was removed.",
            );
          const receiptRef = firestore.doc(
            `workspaces/${ws}/receipts/${cmd.command_id}`,
          );
          const receipt = await tx.get(receiptRef);
          if (
            !(receipt.exists
              ? canReadWarehouse(license)
              : canEditWarehouse(license))
          ) {
            throw new HttpsError(
              "permission-denied",
              "Changes are paused until renewed. Existing records can be read and exported during the 14-day grace period.",
            );
          }
          const db = receipt.exists
            ? emptyDb()
            : await loadCommand(tx, ws, cmd, currentMember);
          if (receipt.exists) {
            db.memberships.push(currentMember.data() as any);
          }
          if (receipt.exists)
            db.receipts[`${ws}:${cmd.command_id}`] = receipt.data() as any;
          let photoReservation;
          if (!receipt.exists && cmd.kind === "add_photo") {
            photoReservation = await readPhotoReservation(
              tx,
              ws,
              user.id,
              cmd.command_id,
              cmd.payload,
            );
          }
          const rateRef = firestore.doc(
            `workspaces/${ws}/private/commands_${user.id}`,
          );
          const rate = !receipt.exists ? await tx.get(rateRef) : null;
          const nowMinute = Math.floor(Date.now() / 60000),
            day = new Date().toISOString().slice(0, 10);
          const minuteCount =
            rate?.get("minute") === nowMinute
              ? rate.get("minuteCount") || 0
              : 0;
          const dayCount =
            rate?.get("day") === day ? rate.get("dayCount") || 0 : 0;
          if (
            !receipt.exists &&
            (minuteCount >= (license.limits?.commandsPerUserMinute ?? 120) ||
              dayCount >= (license.limits?.commandsPerUserDay ?? 5000))
          )
            throw new HttpsError(
              "resource-exhausted",
              "Action allowance reached. Existing records and photos are still available. Wait for the limit to reset or contact support.",
            );
          const additions =
            cmd.kind === "receive"
              ? 1
              : cmd.kind === "split"
                ? (cmd.payload.children as any[]).length
                : cmd.kind === "import_batch" &&
                    cmd.payload.import_kind === "pallets"
                  ? (cmd.payload.rows as any[]).length
                  : 0;
          if (
            !receipt.exists &&
            additions &&
            (db.counters[ws] || 0) + additions >
              (license.limits?.maxPalletRecords ?? Number.MAX_SAFE_INTEGER)
          )
            throw new HttpsError(
              "resource-exhausted",
              "Pallet storage allowance reached. Existing pallets, photos and history are preserved. Contact support for more capacity.",
            );
          const before = rows(db, ws);
          const reserved = teammate
            ? await tx.get(
                firestore.collection(`workspaces/${ws}/invites`).limit(11),
              )
            : null;
          if (
            teammate &&
            reserved &&
            !db.memberships.some(
              (m) => m.user_id === teammate!.id && m.active,
            ) &&
            db.memberships.filter((m) => m.active).length +
              reserved.docs.filter((d) => d.get("email") !== teammate!.email)
                .length >=
              10
          )
            throw new HttpsError(
              "resource-exhausted",
              "Your plan includes ten people, including authorized emails.",
            );
          if (
            teammate &&
            !db.memberships.some(
              (m) => m.user_id === teammate!.id && m.active,
            ) &&
            db.memberships.filter((m) => m.active).length >= 10
          )
            throw new HttpsError(
              "resource-exhausted",
              "This plan includes ten active people. Remove unused access or contact support.",
            );
          if (teammate) db.users[teammate.id] = teammate;
          const engine = new Engine(db, {
            photoPrefix: `storage://workspaces/${ws}/photos/${user.id}/`,
          });
          const result = engine.execute(user.id, cmd);
          // Rejected requests also get an immutable receipt; a retry returns the same answer.
          if (!receipt.exists && db.receipts[`${ws}:${cmd.command_id}`]) {
            persist(tx, ws, before, db);
            tx.set(rateRef, {
              minute: nowMinute,
              minuteCount: minuteCount + 1,
              day,
              dayCount: dayCount + 1,
            });
            if (result.ok && photoReservation)
              tx.update(photoReservation, {
                state: "committed",
                attachment_id: cmd.payload.attachment_id,
                pallet_id: cmd.pallet_id,
                committed_at: Timestamp.now(),
              });
            tx.create(
              receiptRef,
              clean(db.receipts[`${ws}:${cmd.command_id}`]),
            );
            if (result.ok && teammate) {
              tx.set(
                firestore.doc(`users/${teammate.id}`),
                { ...teammate, workspaces: FieldValue.arrayUnion(ws) },
                { merge: true },
              );
              tx.delete(
                firestore.doc(
                  `workspaces/${ws}/invites/${emailHash(teammate.email)}`,
                ),
              );
              tx.delete(
                firestore.doc(
                  `emailAccess/${emailHash(teammate.email)}/warehouses/${ws}`,
                ),
              );
            }
            if (result.ok && cmd.kind === "remove_member")
              tx.set(
                firestore.doc(`users/${String(cmd.payload.user_id)}`),
                { workspaces: FieldValue.arrayRemove(ws) },
                { merge: true },
              );
          }
          return clean(result);
        },
        photoCheckReads,
      ),
  );
  return result;
});

// Managers may authorize an email before its owner has created an account.
export const authorizeEmail = onCall(options, async (request) => {
  const user = actor(request);
  const ws = String(request.data?.workspaceId || "");
  const email = String(request.data?.email || "")
    .trim()
    .toLowerCase();
  const name = String(request.data?.name || "").trim();
  const role = String(request.data?.role || "OPERATOR");
  if (
    !validId(ws) ||
    !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ||
    email.length > 200 ||
    !name ||
    name.length > 120 ||
    !["OWNER", "SUPERVISOR", "OPERATOR", "VIEWER"].includes(role)
  )
    throw new HttpsError("invalid-argument", "Enter a name, email and role.");
  let teammate: User | undefined;
  // Identity lookup is not authority; the transaction below rechecks the manager and license.
  try {
    const u = await getAuth().getUserByEmail(email);
    if (u.emailVerified && !u.disabled)
      teammate = { id: u.uid, email, name: u.displayName || name };
  } catch (e) {
    if ((e as any).code !== "auth/user-not-found")
      throw new HttpsError(
        "unavailable",
        "Could not check this email. Try again.",
      );
  }
  return firestore.runTransaction(async (tx) => {
    await requireLicense(tx, ws);
    const manager = await tx.get(
      firestore.doc(`workspaces/${ws}/members/${user.id}`),
    );
    if (
      !manager.get("active") ||
      !["OWNER", "SUPERVISOR"].includes(manager.get("role")) ||
      (role === "OWNER" && manager.get("role") !== "OWNER")
    )
      throw new HttpsError(
        "permission-denied",
        "Your role cannot authorize this access.",
      );
    const db = await loadCommand(
      tx,
      ws,
      {
        schema_version: 1,
        command_id: crypto.randomUUID(),
        workspace_id: ws,
        kind: "invite_member",
        payload: {},
      },
      manager,
    );
    const before = rows(db, ws);
    const invites = await tx.get(
      firestore.collection(`workspaces/${ws}/invites`).limit(11),
    );
    const hash = emailHash(email);
    const prior = invites.docs.find((d) => d.id === hash);
    if (prior?.get("role") === "OWNER" && manager.get("role") !== "OWNER")
      throw new HttpsError(
        "permission-denied",
        "Only an owner can change this authorization.",
      );
    if (
      teammate &&
      db.memberships.some((m) => m.user_id === teammate!.id && m.active)
    )
      throw new HttpsError(
        "already-exists",
        "This person already has access. Change their role in the team list.",
      );
    if (
      !prior &&
      db.memberships.filter((m) => m.active).length + invites.size >= 10
    )
      throw new HttpsError(
        "resource-exhausted",
        "Your plan includes ten people, including pending authorized emails.",
      );
    if (teammate) {
      db.users[teammate.id] = teammate;
      const result = new Engine(db).execute(user.id, {
        schema_version: 1,
        command_id: crypto.randomUUID(),
        workspace_id: ws,
        kind: "invite_member",
        payload: { name, email, role },
      });
      if (!result.ok) throw new HttpsError("permission-denied", result.message);
      persist(tx, ws, before, db);
      tx.set(
        firestore.doc(`users/${teammate.id}`),
        { ...teammate, workspaces: FieldValue.arrayUnion(ws) },
        { merge: true },
      );
      tx.delete(firestore.doc(`workspaces/${ws}/invites/${hash}`));
      tx.delete(firestore.doc(`emailAccess/${hash}/warehouses/${ws}`));
      return { status: "added" };
    }
    const invitation = {
      email,
      name,
      role,
      workspace_id: ws,
      authorized_by: user.id,
      created_at: new Date().toISOString(),
    };
    tx.set(firestore.doc(`workspaces/${ws}/invites/${hash}`), invitation);
    tx.set(firestore.doc(`emailAccess/${hash}/warehouses/${ws}`), invitation);
    const auditId = crypto.randomUUID();
    tx.create(firestore.doc(`workspaces/${ws}/audit/${auditId}`), {
      id: auditId,
      workspace_id: ws,
      actor_id: user.id,
      action: "invite_member",
      target_id: hash,
      before: null,
      after: { email, role, status: "authorized" },
      reason: null,
      accepted_at: invitation.created_at,
      command_id: crypto.randomUUID(),
    });
    return { status: "authorized" };
  });
});

export const joinAuthorizedWarehouses = onCall(options, async (request) => {
  const user = actor(request);
  const hash = emailHash(user.email);
  const invitations = await firestore
    .collection(`emailAccess/${hash}/warehouses`)
    .limit(20)
    .get();
  const joined: string[] = [];
  for (const invitation of invitations.docs) {
    const ws = invitation.id;
    const accepted = await firestore.runTransaction(async (tx) => {
      const pending = await tx.get(invitation.ref);
      if (!pending.exists) return false;
      const d = pending.data()!;
      const license = await tx.get(firestore.doc(`licenses/${ws}`));
      if (!licensed(license.data())) return false;
      const inviter = await tx.get(
        firestore.doc(`workspaces/${ws}/members/${d.authorized_by}`),
      );
      if (
        !inviter.get("active") ||
        !["OWNER", "SUPERVISOR"].includes(inviter.get("role")) ||
        (d.role === "OWNER" && inviter.get("role") !== "OWNER")
      )
        return false;
      const memberRef = firestore.doc(`workspaces/${ws}/members/${user.id}`);
      const member = await tx.get(memberRef);
      tx.set(memberRef, {
        workspace_id: ws,
        user_id: user.id,
        role: member.get("active") ? member.get("role") : d.role,
        active: true,
        user,
      });
      tx.set(
        firestore.doc(`users/${user.id}`),
        { ...user, workspaces: FieldValue.arrayUnion(ws) },
        { merge: true },
      );
      tx.delete(invitation.ref);
      tx.delete(firestore.doc(`workspaces/${ws}/invites/${hash}`));
      const id = crypto.randomUUID();
      tx.create(firestore.doc(`workspaces/${ws}/audit/${id}`), {
        id,
        workspace_id: ws,
        actor_id: user.id,
        action: "invite_member",
        target_id: user.id,
        before: null,
        after: { email: user.email, role: d.role, status: "joined" },
        reason: null,
        accepted_at: new Date().toISOString(),
        command_id: crypto.randomUUID(),
      });
      return true;
    });
    if (accepted) joined.push(ws);
  }
  return { joined };
});

export const cancelAuthorization = onCall(options, async (request) => {
  const user = actor(request);
  const ws = String(request.data?.workspaceId || "");
  const email = String(request.data?.email || "")
    .toLowerCase()
    .trim();
  if (!validId(ws) || !email)
    throw new HttpsError("invalid-argument", "Choose an authorized email.");
  return firestore.runTransaction(async (tx) => {
    await requireLicense(tx, ws);
    const manager = await tx.get(
      firestore.doc(`workspaces/${ws}/members/${user.id}`),
    );
    const hash = emailHash(email);
    const pending = await tx.get(
      firestore.doc(`workspaces/${ws}/invites/${hash}`),
    );
    if (
      !manager.get("active") ||
      !["OWNER", "SUPERVISOR"].includes(manager.get("role")) ||
      (pending.get("role") === "OWNER" && manager.get("role") !== "OWNER")
    )
      throw new HttpsError(
        "permission-denied",
        "You cannot remove this authorization.",
      );
    tx.delete(pending.ref);
    tx.delete(firestore.doc(`emailAccess/${hash}/warehouses/${ws}`));
    if (pending.exists) {
      const id = crypto.randomUUID();
      tx.create(firestore.doc(`workspaces/${ws}/audit/${id}`), {
        id,
        workspace_id: ws,
        actor_id: user.id,
        action: "remove_member",
        target_id: hash,
        before: { email, role: pending.get("role") },
        after: { status: "authorization removed" },
        reason: null,
        accepted_at: new Date().toISOString(),
        command_id: crypto.randomUUID(),
      });
    }
    return { ok: true };
  });
});

export const reservePhotoUpload = onCall(options, reservePhoto);
export const cleanupPhotoUploads = onSchedule(
  {
    schedule: "every 24 hours",
    region: "us-east1",
    minInstances: 0,
    maxInstances: 1,
    memory: "256MiB",
    timeoutSeconds: 120,
    retryCount: 0,
  },
  async () => {
    await sweepAbandonedPhotos();
  },
);

export const getWarehouseSummary = onCall(options, warehouseSummary);

export const getDirectoryCounts = onCall(options, directoryCounts);

// Signup also requires App Check; its separate visible checkbox is verified server-side.
export const createAccount = onCall(
  { ...options, maxInstances: 1, concurrency: 10 },
  registerAccount,
);
