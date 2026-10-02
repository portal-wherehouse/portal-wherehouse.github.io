import {
  createHash,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";
import { getAuth } from "firebase-admin/auth";
import { Timestamp, getFirestore } from "firebase-admin/firestore";
import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";

// Email verification by a typed 6-digit code. Only a salted hash of the code is kept, in a
// server-only document (emailCodes/{uid}; the rules deny every client read and write).
// The email itself is a document in `mail`, delivered by the "Trigger Email from Firestore" extension.
export const CODE_TTL_MS = 10 * 60 * 1000;
export const MAX_CODE_ATTEMPTS = 5;
export const RESEND_AFTER_MS = 60 * 1000;
export const MAX_CODES_PER_DAY = 10;

const hashCode = (salt: string, code: string) =>
  createHash("sha256").update(`${salt}:${code}`).digest("hex");
// The local test harness sets FUNCTIONS_EMULATOR, as the Firebase emulator does. Never true when deployed.
const emulated = () =>
  process.env.FUNCTIONS_EMULATOR === "true" &&
  !!process.env.FIREBASE_AUTH_EMULATOR_HOST;

async function currentUser(request: CallableRequest) {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  try {
    return await getAuth().getUser(request.auth.uid);
  } catch {
    throw new HttpsError(
      "unavailable",
      "Could not check your account. Try again.",
    );
  }
}

export function codeEmail(to: string, code: string) {
  const minutes = CODE_TTL_MS / 60000;
  return {
    to,
    message: {
      subject: `Your Wherehouse code: ${code}`,
      text: [
        `Your Wherehouse verification code is ${code}.`,
        "",
        `Type it on the sign-in screen. It expires in ${minutes} minutes. If you didn't ask for it, you can ignore this email.`,
        "",
        "Wherehouse only emails you sign-in and verification codes. No newsletters, no spam.",
      ].join("\n"),
      html: `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:16px;line-height:1.5;color:#1b1f24;max-width:480px">
<p>Your Wherehouse verification code is</p>
<p style="font-size:32px;font-weight:700;letter-spacing:6px;margin:8px 0 16px">${code}</p>
<p>Type it on the sign-in screen. It expires in ${minutes} minutes. If you didn't ask for it, you can ignore this email.</p>
<p style="color:#5b636e;font-size:14px">Wherehouse only emails you sign-in and verification codes. No newsletters, no spam.</p>
</div>`,
    },
  };
}

/** How long a mail document may wait for the extension before email codes count as not set up. */
export const MAIL_DELIVERY_WAIT_MS = 3 * 60 * 1000;

/**
 * Whether the "Trigger Email from Firestore" extension delivers mail in this project. It marks every
 * mail document it handles with a `delivery` field; a document older than a few minutes without one
 * means nothing is sending. EMAIL_CODES=off turns codes off outright. With no mail yet, codes are tried.
 */
export async function emailCodesWork(): Promise<boolean> {
  if (process.env.EMAIL_CODES === "off") return false;
  try {
    const old = await getFirestore()
      .collection("mail")
      .where(
        "created_at",
        "<=",
        Timestamp.fromMillis(Date.now() - MAIL_DELIVERY_WAIT_MS),
      )
      .orderBy("created_at", "desc")
      .limit(1)
      .get();
    return old.empty || old.docs[0].get("delivery") !== undefined;
  } catch {
    return true;
  }
}

export async function sendCode(request: CallableRequest) {
  const user = await currentUser(request);
  if (user.emailVerified) return { verified: true };
  const email = (user.email || "").trim().toLowerCase();
  if (!email || user.disabled)
    throw new HttpsError(
      "failed-precondition",
      "This account has no email to verify.",
    );
  // Without the email extension, the app sends Firebase's own verification link instead (free, built in).
  if (!(await emailCodesWork())) return { sent: false, fallback: "link" };
  const firestore = getFirestore();
  const ref = firestore.doc(`emailCodes/${user.uid}`);
  const code = String(randomInt(0, 1000000)).padStart(6, "0");
  const salt = randomBytes(16).toString("hex");
  const now = Date.now();
  const day = new Date(now).toISOString().slice(0, 10);
  await firestore.runTransaction(async (tx) => {
    const prior = await tx.get(ref);
    const sentAt = prior.get("sent_at")?.toMillis?.() ?? 0;
    const wait = Math.ceil((sentAt + RESEND_AFTER_MS - now) / 1000);
    if (wait > 0)
      throw new HttpsError(
        "resource-exhausted",
        `A code was just sent. Wait ${wait} seconds before asking for another.`,
      );
    const sentToday = prior.get("day") === day ? prior.get("sent_today") : 0;
    if (sentToday >= MAX_CODES_PER_DAY)
      throw new HttpsError(
        "resource-exhausted",
        "Too many codes today. Try again tomorrow or contact support.",
      );
    // One document per account: a new code replaces the old one and resets the attempts.
    tx.set(ref, {
      email,
      salt,
      hash: hashCode(salt, code),
      attempts: 0,
      sent_at: Timestamp.fromMillis(now),
      expires_at: Timestamp.fromMillis(now + CODE_TTL_MS),
      day,
      sent_today: sentToday + 1,
    });
    tx.create(firestore.collection("mail").doc(), {
      ...codeEmail(email, code),
      created_at: Timestamp.fromMillis(now),
    });
  });
  return {
    sent: true,
    email,
    expiresInSeconds: CODE_TTL_MS / 1000,
    resendInSeconds: RESEND_AFTER_MS / 1000,
    ...(emulated() ? { devCode: code } : {}),
  };
}

export async function verifyCode(request: CallableRequest) {
  const user = await currentUser(request);
  if (user.emailVerified) return { verified: true };
  const code = String(request.data?.code ?? "").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(code))
    throw new HttpsError(
      "invalid-argument",
      "Enter the 6-digit code from the email.",
    );
  const firestore = getFirestore();
  const ref = firestore.doc(`emailCodes/${user.uid}`);
  // Decide inside the transaction, throw after it: a thrown error would discard the attempt count.
  const outcome = await firestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return "missing" as const;
    const d = snap.data()!;
    if (d.email !== (user.email || "").trim().toLowerCase())
      return "missing" as const;
    if (d.expires_at.toMillis() <= Date.now()) return "expired" as const;
    if (d.attempts >= MAX_CODE_ATTEMPTS) return "locked" as const;
    const match = timingSafeEqual(
      Buffer.from(hashCode(d.salt, code), "hex"),
      Buffer.from(d.hash, "hex"),
    );
    if (match) {
      // Keep the send counters for the daily limit; the code itself is gone.
      tx.update(ref, {
        hash: null,
        salt: null,
        expires_at: Timestamp.fromMillis(0),
      });
      return "ok" as const;
    }
    tx.update(ref, { attempts: d.attempts + 1 });
    return MAX_CODE_ATTEMPTS - d.attempts - 1;
  });
  if (outcome === "missing")
    throw new HttpsError(
      "failed-precondition",
      "No code is waiting for this account. Send a new code.",
    );
  if (outcome === "expired")
    throw new HttpsError(
      "deadline-exceeded",
      "This code has expired. Send a new code.",
    );
  if (outcome === "locked" || outcome === 0)
    throw new HttpsError(
      "resource-exhausted",
      "Too many wrong codes. Send a new code.",
    );
  if (typeof outcome === "number")
    throw new HttpsError(
      "invalid-argument",
      `That code isn't right. ${outcome} ${outcome === 1 ? "try" : "tries"} left.`,
    );
  try {
    await getAuth().updateUser(user.uid, { emailVerified: true });
  } catch {
    throw new HttpsError(
      "unavailable",
      "Could not finish verifying your email. Send a new code and try again.",
    );
  }
  return { verified: true };
}
