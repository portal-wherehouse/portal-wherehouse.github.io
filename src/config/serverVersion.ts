/**
 * The version of the Cloud Functions this build of the app expects. The functions return it from
 * getWarehouseSummary as `server_version`, so an app newer than the deployed functions can tell owners
 * the server needs an update instead of failing quietly.
 *
 * Bump it whenever a change to firebase/functions (or the shared engine and command schemas it bundles)
 * must be deployed for the app to work, then deploy the functions.
 *
 * 1: functions deployed before this number existed (they return no server_version).
 * 2: orders and picking on by default, specific sign-up errors, email-link fallback.
 */
export const SERVER_VERSION = 2;

export const SERVER_BEHIND_MESSAGE = 'This feature needs a server update. Ask your Wherehouse contact.';

/**
 * True when the deployed Cloud Functions do not know what the app asked for: a function that is not
 * deployed (not-found, unimplemented), or a command or field the command function does not accept yet.
 * Functions older than this check send "The request is not valid." with no details.
 */
export function serverTooOld(err: unknown): boolean {
  const e = err as { code?: string; message?: string; details?: { reason?: string } } | null;
  const code = e?.code ?? '';
  if (code === 'functions/not-found' || code === 'functions/unimplemented') return true;
  // The callable SDK adds the HTTP status to the message: "The request is not valid. [400]".
  const message = (e?.message ?? '').replace(/\s*\[\d{3}\]$/, '');
  return code === 'functions/invalid-argument' && (e?.details?.reason === 'invalid-command' || message === 'The request is not valid.');
}
