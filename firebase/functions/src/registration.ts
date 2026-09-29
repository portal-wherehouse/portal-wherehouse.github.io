import { createHash } from 'node:crypto';
import { getApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { SIGNUP_CHECKBOX_KEY, SIGNUP_HOSTNAME } from '../../../src/config/registration';

export function validCheckboxAssessment(value: any, now = Date.now()): boolean {
  const token = value?.tokenProperties;
  const age = now - Date.parse(token?.createTime);
  // Explicit checkbox widgets do not support action names. Google verifies the site key
  // supplied in the assessment; also check the attested hostname and token freshness.
  return token?.valid === true && token.hostname === SIGNUP_HOSTNAME && age >= -5000 && age < 120000;
}
function localEmulators(): boolean {
  const project = process.env.GCLOUD_PROJECT;
  if (project !== 'demo-wherehouse') {
    if (process.env.FIREBASE_AUTH_EMULATOR_HOST || process.env.FIRESTORE_EMULATOR_HOST) throw new HttpsError('failed-precondition', 'Invalid registration environment.');
    return false;
  }
  if (process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9099' || process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080') throw new HttpsError('failed-precondition', 'Registration tests require local emulators.');
  return true;
}
async function verifyCheckbox(token: string, local: boolean): Promise<void> {
  let assessment: unknown;
  if (local) {
    // Fixtures can only be minted by the local test runner, never by a client.
    const ref = getFirestore().doc(`signupTestTokens/${createHash('sha256').update(token).digest('hex')}`);
    assessment = await getFirestore().runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists || snap.get('used')) return null;
      tx.update(ref, { used: true });
      return snap.get('assessment');
    });
  } else {
    const credential = getApp().options.credential;
    if (!credential) throw new HttpsError('unavailable', 'Account verification is unavailable. Please try again later.');
    try {
      const { access_token } = await credential.getAccessToken();
      const project = process.env.GCLOUD_PROJECT || getApp().options.projectId;
      const response = await fetch(`https://recaptchaenterprise.googleapis.com/v1/projects/${project}/assessments`, {
        method: 'POST', headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: { token, siteKey: SIGNUP_CHECKBOX_KEY } }), signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error('Assessment service unavailable');
      assessment = await response.json();
    } catch {
      throw new HttpsError('unavailable', 'Account verification is unavailable. Please try again later.');
    }
  }
  if (!validCheckboxAssessment(assessment)) throw new HttpsError('permission-denied', 'Complete the checkbox again. It may have expired.');
}
async function reserveAttempt(ip: string): Promise<void> {
  const now = Date.now(), day = new Date(now).toISOString().slice(0, 10), hour = Math.floor(now / 3600000);
  const hash = createHash('sha256').update(`${day}|${ip}`).digest('hex');
  // One bounded document: at most 200 IP entries; resets daily, no growing IP log.
  const ref = getFirestore().doc('registrationLimits/current');
  await getFirestore().runTransaction(async tx => {
    const snap = await tx.get(ref);
    const data = snap.get('day') === day ? snap.data()! : { day, total: 0, ips: {} };
    const prior = data.ips?.[hash] || { total: 0, hour, count: 0 };
    const count = prior.hour === hour ? prior.count : 0;
    if (data.total >= 200 || prior.total >= 50 || count >= 10) throw new HttpsError('resource-exhausted', 'Too many account creation attempts. Try again later. Existing accounts can still sign in.');
    tx.set(ref, { day, total: data.total + 1, ips: { ...data.ips, [hash]: { total: prior.total + 1, hour, count: count + 1 } } });
  });
}
export async function registerAccount(request: CallableRequest) {
  const local = localEmulators();
  const data = request.data || {};
  if (Buffer.byteLength(JSON.stringify(data)) > 16000) throw new HttpsError('invalid-argument', 'Account request is too large.');
  const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';
  const name = typeof data.name === 'string' ? data.name.trim() : '';
  const password = typeof data.password === 'string' ? data.password : '';
  const token = typeof data.checkboxToken === 'string' ? data.checkboxToken : '';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254 || !name || name.length > 100 || password.length < 8 || password.length > 128) throw new HttpsError('invalid-argument', 'Enter your name, a valid email, and a password of 8–128 characters.');
  if (!token || token.length > 8192) throw new HttpsError('invalid-argument', 'Complete the checkbox before creating your account.');
  await reserveAttempt(request.rawRequest.ip || 'unknown');
  await verifyCheckbox(token, local);
  try {
    await getAuth().createUser({ email, password, displayName: name, emailVerified: false });
    return { created: true };
  } catch {
    // Never log credentials or reveal whether an email is registered.
    throw new HttpsError('failed-precondition', 'Could not create this account. Try signing in or resetting your password.');
  }
}
