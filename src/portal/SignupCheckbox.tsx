import { useEffect, useRef, useState } from 'react';
import { SIGNUP_CHECKBOX_KEY } from '../config/registration';

type Enterprise = {
  ready: (callback: () => void) => void;
  render: (element: HTMLElement, options: Record<string, unknown>) => number;
  reset: (id: number) => void;
};
const enterprise = () => (window as Window & { grecaptcha?: { enterprise?: Enterprise } }).grecaptcha?.enterprise;
let scriptLoading: Promise<Enterprise> | undefined;
function loadCheckbox(): Promise<Enterprise> {
  if (enterprise()) return Promise.resolve(enterprise()!);
  if (scriptLoading) return scriptLoading;
  scriptLoading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const fail = () => { clearTimeout(timer); script.remove(); scriptLoading = undefined; reject(new Error('Could not load the checkbox. Check your connection or browser blocker and try again.')); };
    const timer = window.setTimeout(fail, 15000);
    script.src = 'https://www.google.com/recaptcha/enterprise.js?render=explicit';
    script.async = true;
    script.onload = () => { const api = enterprise(); if (!api) return fail(); clearTimeout(timer); resolve(api); };
    script.onerror = fail;
    document.head.appendChild(script);
  });
  return scriptLoading;
}
export function SignupCheckbox({ resetCount, onToken }: { resetCount: number; onToken: (token: string) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const onTokenRef = useRef(onToken); onTokenRef.current = onToken;
  const [status, setStatus] = useState('Loading verification…');
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true, widget: number | undefined, api: Enterprise | undefined;
    onTokenRef.current(''); setStatus('Loading verification…'); setFailed(false);
    // Use a fresh child on every render, including React Strict Mode cleanup.
    const container = document.createElement('div'); host.current?.appendChild(container);
    void loadCheckbox().then(value => {
      api = value;
      api.ready(() => {
        if (!active) return;
        try {
          widget = api!.render(container, {
            sitekey: SIGNUP_CHECKBOX_KEY, theme: 'light', size: (host.current?.clientWidth || 304) < 304 ? 'compact' : 'normal',
            callback: (token: string) => { if (active) { onTokenRef.current(token); setStatus('Verified.'); } },
            'expired-callback': () => { if (active) { onTokenRef.current(''); setStatus('Verification expired. Complete the checkbox again.'); } },
            'error-callback': () => { if (active) { onTokenRef.current(''); setStatus('Verification could not finish. Please try again.'); setFailed(true); } },
          });
          setStatus('');
        } catch { setStatus('Could not show verification. Please try again.'); setFailed(true); }
      });
    }).catch((error: Error) => { if (active) { setStatus(error.message); setFailed(true); } });
    return () => { active = false; if (widget !== undefined) { try { api?.reset(widget); } catch { /* Widget already removed. */ } } container.remove(); };
  }, [resetCount, retry]);
  return <div className="signup-verification" role="group" aria-label="Account verification"><div ref={host} />{status && <p className="muted" role="status">{status}</p>}{failed && <button className="btn ghost" type="button" onClick={() => setRetry(value => value + 1)}>Retry verification</button>}</div>;
}
