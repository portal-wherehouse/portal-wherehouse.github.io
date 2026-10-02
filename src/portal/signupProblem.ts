// What a failed createAccount call means for the person signing up, in words they can act on.
// The server (firebase/functions/src/registration.ts) sends a specific message for the problems it knows;
// the rest are problems of the server's setup, where Continue with Google still creates the account.

import { cloudMessage } from '../data/firebase';

const GOOGLE = 'Use Continue with Google, or ask your Wherehouse contact.';

export function signupProblem(err: unknown): { text: string; exists: boolean } {
  const e = err as { code?: string; message?: string; details?: { reason?: string } };
  const code = e?.code ?? '';
  const reason = e?.details?.reason ?? '';
  // Older servers sent this message with no reason.
  const exists = reason === 'exists' || (code === 'functions/failed-precondition' && /signing in/i.test(e?.message ?? ''));
  if (exists) return { text: 'This email may already have an account, possibly one made with Continue with Google. Sign in, or reset your password.', exists: true };
  if (code === 'functions/not-found' || code === 'functions/unimplemented') return { text: `Account creation is not installed on the server yet. ${GOOGLE}`, exists: false };
  if (code === 'functions/unauthenticated') return { text: 'This browser did not pass the security check. Reload the page and try again, or use Continue with Google.', exists: false };
  if (code === 'functions/internal') return { text: `The sign-up server had a problem. ${GOOGLE}`, exists: false };
  return { text: cloudMessage(err), exists: false };
}
