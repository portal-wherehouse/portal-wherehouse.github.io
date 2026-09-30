import { useEffect, useRef, useState, type FormEvent } from 'react';
import { reload, sendEmailVerification, type User } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { cloudMessage, type FirebaseBackend } from '../data/firebase';

// Email verification by a typed 6-digit code (sendEmailCode / verifyEmailCode). The emailed link
// stays available as a fallback. A code is sent once when the screen opens, not on every reload.
const SENT_KEY = 'wh.codeSent.';
const RESEND_S = 60;
const autoSent = new Set<string>();
function sentRecently(uid: string) {
  try {
    return Date.now() - Number(sessionStorage.getItem(SENT_KEY + uid)) < 10 * 60 * 1000;
  } catch {
    return false;
  }
}
function markSent(uid: string) {
  try {
    sessionStorage.setItem(SENT_KEY + uid, String(Date.now()));
  } catch {
    /* only decides whether to send on open */
  }
}

export function VerifyEmail({ b, user, onVerified }: { b: FirebaseBackend; user: User; onVerified: () => void }) {
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(() => sentRecently(user.uid));
  const [linkSent, setLinkSent] = useState(false);
  const [waitUntil, setWaitUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const wait = Math.max(0, Math.ceil((waitUntil - now) / 1000));
  useEffect(() => {
    if (!wait) return;
    const t = window.setTimeout(() => setNow(Date.now()), 1000);
    return () => window.clearTimeout(t);
  }, [wait, now]);
  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await task();
    } catch (e) {
      setError(cloudMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const finish = async () => {
    await reload(user);
    await user.getIdToken(true);
    if (!user.emailVerified) throw new Error('Your email is not verified yet.');
    onVerified();
  };
  const send = async (first: boolean) => {
    // Callables require App Check in production; unverified accounts have not started it yet.
    await b.prepareSignup();
    try {
      const r = (await httpsCallable(b.functions!, 'sendEmailCode')({})).data as { verified?: boolean };
      if (r.verified) return finish();
      markSent(user.uid);
      setSent(true);
      setWaitUntil(Date.now() + RESEND_S * 1000);
      setNow(Date.now());
      if (!first) setMessage('A new code is on its way.');
    } catch (e) {
      // Opening the screen right after a code went out: that code is still good.
      if (first && (e as { code?: string }).code === 'functions/resource-exhausted') {
        setSent(true);
        return;
      }
      throw e;
    }
    input.current?.focus();
  };
  useEffect(() => {
    if (sentRecently(user.uid) || autoSent.has(user.uid)) return;
    autoSent.add(user.uid);
    void run(() => send(true));
  }, [user.uid]);
  const verify = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await b.prepareSignup();
      await httpsCallable(b.functions!, 'verifyEmailCode')({ code });
      await finish();
    });
  };
  return (
    <div className="stack verify-code">
      <p>{sent ? <>We emailed a 6-digit code to <strong>{user.email}</strong>. It expires in 10 minutes.</> : busy ? <>Sending a 6-digit code to <strong>{user.email}</strong>…</> : <>We’ll email a 6-digit code to <strong>{user.email}</strong>.</>}</p>
      <form className="stack" onSubmit={verify}>
        <label>
          Verification code
          <input ref={input} className="verify-code-input" required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} />
        </label>
        <button className="btn primary big" disabled={busy || code.length !== 6}>{busy ? 'Please wait…' : 'Verify'}</button>
      </form>
      <div className="row">
        <button type="button" className="btn" disabled={busy || wait > 0} onClick={() => void run(() => send(false))}>{sent ? (wait ? `Resend code (${wait}s)` : 'Resend code') : 'Send code'}</button>
        {linkSent && <button type="button" className="btn" disabled={busy} onClick={() => void run(finish)}>I’ve verified my email</button>}
      </div>
      <button type="button" className="btn ghost verify-link" disabled={busy} onClick={() => void run(async () => { await sendEmailVerification(user); setLinkSent(true); setMessage('We sent a verification link. Open it, then come back and choose I’ve verified my email.'); })}>Send me a link instead</button>
      <p className="muted">Can’t find it? Check spam or promotions. We only email you verification and sign-in codes.</p>
      {error && <p role="alert" className="auth-error">{error}</p>}
      {message && <p role="status">{message}</p>}
    </div>
  );
}
