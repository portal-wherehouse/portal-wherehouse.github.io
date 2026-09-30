// "Create an account to begin your survey": the website's #start gate sends visitors to #signin,
// and this note (kept for this tab only) brings them back to #start once their email is verified.
const KEY = "wh.afterAccount";
const TTL_MS = 60 * 60 * 1000;

export type AccountStart = "register" | "signin";

export function requestAccount(mode: AccountStart) {
  try {
    sessionStorage.setItem(
      KEY,
      JSON.stringify({ to: "start", mode, at: Date.now() }),
    );
  } catch {
    /* without storage, sign-in simply continues to the warehouse */
  }
}

export function accountReturn(): { to: "start"; mode: AccountStart } | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY) || "null");
    if (
      saved?.to === "start" &&
      Date.now() - saved.at < TTL_MS &&
      (saved.mode === "register" || saved.mode === "signin")
    )
      return { to: "start", mode: saved.mode };
  } catch {
    /* treated as no note */
  }
  return null;
}

export function clearAccountReturn() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}
