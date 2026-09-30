/** Expiry pauses edits; it never deletes records. Explicit revocation has no grace. */
export const RENEWAL_GRACE_DAYS = 14;
/** A new account can start one free trial warehouse without a usage key. */
export const TRIAL_DAYS = 30;
export const RENEWAL_GRACE_MS = RENEWAL_GRACE_DAYS * 86_400_000;

export function licenseAccess(
  active: boolean,
  expiresAt: number,
  now = Date.now(),
) {
  if (!active || !Number.isFinite(expiresAt)) return "blocked" as const;
  if (expiresAt > now) return "active" as const;
  return expiresAt + RENEWAL_GRACE_MS > now
    ? ("read-only" as const)
    : ("blocked" as const);
}
