// Contact support: a short form that validates, keeps the request on this device, and hands it back
// as an email to send, because the support inbox is not connected in this preview yet.

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { BRAND } from '../../brand';
import { useApp } from '../../app/state';
import { copyText, IS_PREVIEW } from '../../device/output';
import { Icon } from '../../ui/icons';
import { Field, Notice, ROLE_LABEL, fmtTime } from '../../ui/ui';
import {
  EMPTY_DRAFT,
  MESSAGE_MAX,
  TOPIC_HINT,
  TOPICS,
  URGENCIES,
  bodyFor,
  loadDraft,
  loadTickets,
  mailtoFor,
  makeRef,
  removeTicket,
  saveDraft,
  saveTicket,
  urgencyLabel,
  validEmail,
  type Draft,
  type HelpTicket,
  type Topic,
} from './support';

export interface ContactPrefill {
  /** Changes every time, so the same prefill can be applied twice. */
  n: number;
  topic: Topic;
  message: string;
}

type Errors = Partial<Record<'name' | 'email' | 'message', string>>;

export function ContactSection({ prefill }: { prefill: ContactPrefill | null }) {
  const app = useApp();
  const { toast } = app;
  const [draft, setDraft] = useState<Draft>(loadDraft);
  const [errors, setErrors] = useState<Errors>({});
  const [done, setDone] = useState<{ ticket: HelpTicket; saved: boolean } | null>(null);
  const [tickets, setTickets] = useState<HelpTicket[]>(loadTickets);
  const [copied, setCopied] = useState<string | null>(null);
  const confirmRef = useRef<HTMLDivElement>(null);

  // Keep the half-written request on this device. Sending cancels a save still waiting, so the sent
  // message does not come back as a draft.
  const draftTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    draftTimer.current = setTimeout(() => saveDraft(draft.message.trim() || draft.name.trim() || draft.email.trim() ? draft : null), 250);
    return () => clearTimeout(draftTimer.current);
  }, [draft]);

  // A question handed over from the FAQ search.
  useEffect(() => {
    if (!prefill) return;
    setDone(null);
    setDraft((d) => ({ ...d, topic: prefill.topic, message: d.message.trim() ? `${d.message.trim()}\n\n${prefill.message}` : prefill.message }));
    setErrors({});
    requestAnimationFrame(() => {
      const el = document.getElementById('help-msg') as HTMLTextAreaElement | null;
      if (el) {
        el.focus({ preventScroll: true });
        el.setSelectionRange(el.value.length, el.value.length);
      }
    });
  }, [prefill]);

  const details = useTechDetails();
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
    if (k in errors) setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const validate = (d: Draft): Errors => {
    const e: Errors = {};
    if (d.name.length > 120) e.name = 'Keep your name to 120 characters.';
    if (d.email.trim() && !validEmail(d.email)) e.email = 'Enter an email address like name@company.com, or leave it blank.';
    if (!d.message.trim()) e.message = 'Tell us what you need. A sentence or two is plenty.';
    else if (d.message.length > MESSAGE_MAX) e.message = `Keep the message to ${MESSAGE_MAX.toLocaleString()} characters so it fits in an email.`;
    return e;
  };

  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    const e = validate(draft);
    setErrors(e);
    const first = (['name', 'email', 'message'] as const).find((k) => e[k]);
    if (first) {
      const el = document.getElementById(first === 'message' ? 'help-msg' : `help-${first}`);
      el?.scrollIntoView({ block: 'center' });
      el?.focus({ preventScroll: true });
      return;
    }
    const ticket: HelpTicket = {
      ref: makeRef(),
      at: new Date().toISOString(),
      name: draft.name.trim(),
      email: draft.email.trim(),
      topic: draft.topic,
      urgency: draft.urgency,
      message: draft.message.trim(),
      details: draft.includeDetails ? details : null,
    };
    const saved = saveTicket(ticket);
    setTickets(loadTickets());
    setDone({ ticket, saved });
    clearTimeout(draftTimer.current);
    saveDraft(null);
    requestAnimationFrame(() => {
      confirmRef.current?.scrollIntoView({ block: 'nearest' });
      confirmRef.current?.focus({ preventScroll: true });
    });
  };

  const copy = async (key: string, text: string, what: string) => {
    const ok = await copyText(text);
    setCopied(ok ? key : null);
    toast(ok ? `${what} copied` : `Could not copy. Select the ${what.toLowerCase()} and copy it yourself.`, ok ? 'ok' : 'info');
    if (ok) setTimeout(() => setCopied((c) => (c === key ? null : c)), 2500);
  };

  const another = () => {
    setDraft((d) => ({ ...EMPTY_DRAFT, name: d.name, email: d.email, includeDetails: d.includeDetails }));
    setDone(null);
    setErrors({});
    requestAnimationFrame(() => document.getElementById('help-msg')?.focus());
  };

  const remove = (ref: string) => {
    if (removeTicket(ref)) {
      setTickets(loadTickets());
      toast(`Removed ${ref} from this device`, 'info');
    } else toast('This browser would not update its storage', 'error');
  };

  return (
    <div className="help-contact">
      <div className="stack help-contact-main">
        <Notice tone="info" icon="mail" title="The support inbox is not connected in this preview yet">
          Your request is saved on this device, and the next step gives you a ready-made email to send to support yourself. Nothing is sent from the portal.
        </Notice>

        {done ? (
          <div className="panel stack help-done" ref={confirmRef} tabIndex={-1} aria-labelledby="help-done-h">
            <div className="help-done-head">
              <Icon name="checkCircle" />
              <div>
                <h3 id="help-done-h">Request ready to send</h3>
                <div className="help-ref">
                  Reference <span className="mono">{done.ticket.ref}</span>
                </div>
              </div>
            </div>
            <p style={{ margin: 0 }}>
              {done.saved ? `Saved on this device at ${fmtTime(done.ticket.at)}.` : 'This browser would not save it on this device (private mode can do this), but you can still send it now.'} It has not reached support yet. Send it with your email app, and quote the reference if you follow up.
            </p>
            <div className="row">
              <a className="btn primary big" href={mailtoFor(done.ticket)}>
                <Icon name="send" /> Email support now
              </a>
              <button type="button" className="btn big" onClick={() => void copy('msg', bodyFor(done.ticket), 'Message')}>
                <Icon name={copied === 'msg' ? 'check' : 'copy'} /> {copied === 'msg' ? 'Copied' : 'Copy message'}
              </button>
            </div>
            <Address copied={copied === 'addr'} onCopy={() => void copy('addr', BRAND.supportEmail, 'Address')} />
            {IS_PREVIEW && (
              <p className="faint" style={{ margin: 0, fontSize: 13.5 }}>
                This hosted preview may not be able to open your email app. If nothing happens, copy the message and paste it into a new email to the address above.
              </p>
            )}
            <details className="help-preview">
              <summary>
                <Icon name="eye" /> See the full message
              </summary>
              <pre className="code-block">{bodyFor(done.ticket)}</pre>
            </details>
            <div className="row">
              <button type="button" className="btn" onClick={another}>
                <Icon name="plus" /> Write another request
              </button>
            </div>
          </div>
        ) : (
          <form className="panel stack help-form" onSubmit={submit} noValidate aria-labelledby="help-contact-h">
            <div className="grid-2">
              <Field label="Your name (optional)" htmlFor="help-name" hint={errors.name ? <span className="help-err">{errors.name}</span> : undefined}>
                <input id="help-name" className="input" value={draft.name} onChange={(e) => set('name', e.target.value)} autoComplete="name" maxLength={160} aria-invalid={!!errors.name} />
              </Field>
              <Field label="Email for the reply (optional)" htmlFor="help-email" hint={errors.email ? <span className="help-err">{errors.email}</span> : 'Only needed if the reply should go somewhere other than the address you send from.'}>
                <input id="help-email" className="input" type="email" inputMode="email" value={draft.email} onChange={(e) => set('email', e.target.value)} autoComplete="email" placeholder="name@company.com" aria-invalid={!!errors.email} />
              </Field>
            </div>

            <fieldset className="help-choices">
              <legend>Topic</legend>
              <div className="help-chips">
                {TOPICS.map((t) => (
                  <label key={t} className="help-chip">
                    <input type="radio" name="help-topic" value={t} checked={draft.topic === t} onChange={() => set('topic', t)} />
                    <span>{t}</span>
                  </label>
                ))}
              </div>
              <p className="help-choice-hint">{TOPIC_HINT[draft.topic]}.</p>
            </fieldset>

            <fieldset className="help-choices">
              <legend>How urgent is it?</legend>
              <div className="help-chips">
                {URGENCIES.map((u) => (
                  <label key={u.id} className={`help-chip ${u.id === 'high' ? 'urgent' : ''}`}>
                    <input type="radio" name="help-urgency" value={u.id} checked={draft.urgency === u.id} onChange={() => set('urgency', u.id)} />
                    <span>{u.label}</span>
                  </label>
                ))}
              </div>
              {draft.urgency === 'high' && <p className="help-choice-hint">Marked URGENT in the email subject so it stands out.</p>}
            </fieldset>

            <Field
              label="Message"
              htmlFor="help-msg"
              count={draft.message.length}
              max={MESSAGE_MAX}
              hint={errors.message ? <span className="help-err">{errors.message}</span> : 'What you tried, what happened, and what you expected. Codes help.'}
            >
              <textarea
                id="help-msg"
                className="textarea"
                value={draft.message}
                onChange={(e) => set('message', e.target.value)}
                rows={6}
                required
                aria-required="true"
                aria-invalid={!!errors.message}
                placeholder="For example: P-000012 shows at A-02-01 but it is on B-01-02. I tried Move and got a conflict."
              />
            </Field>

            <div className="help-tech">
              <label className="toggle">
                <input type="checkbox" checked={draft.includeDetails} onChange={(e) => set('includeDetails', e.target.checked)} />
                <span>
                  <strong>Include technical details</strong>
                  <span className="muted"> (build, role, screen, connection and browser, to help reproduce a problem)</span>
                </span>
              </label>
              {draft.includeDetails && (
                <details className="help-preview">
                  <summary>
                    <Icon name="eye" /> See exactly what is included
                  </summary>
                  <pre className="code-block">{details}</pre>
                </details>
              )}
            </div>

            <div className="row">
              <button type="submit" className="btn primary big">
                <Icon name="checklist" /> Create request
              </button>
              <span className="muted" style={{ fontSize: 13.5 }}>
                Nothing is sent yet. Next you choose how to send it.
              </span>
            </div>
          </form>
        )}
      </div>

      <aside className="stack help-contact-side">
        <div className="panel stack">
          <div className="panel-title">
            <Icon name="mail" /> Write to support directly
          </div>
          <p style={{ margin: 0, fontSize: 14.5 }}>Prefer your own email? Send it to this address. Include what you were doing and any pallet, job or rack codes.</p>
          <Address copied={copied === 'addr-side'} onCopy={() => void copy('addr-side', BRAND.supportEmail, 'Address')} />
        </div>
        <MyRequests tickets={tickets} copied={copied} onCopy={(t) => void copy(`t-${t.ref}`, bodyFor(t), 'Message')} onRemove={remove} />
      </aside>
    </div>
  );
}

function Address({ copied, onCopy }: { copied: boolean; onCopy: () => void }) {
  return (
    <div className="help-address">
      <span className="help-address-label">Support address</span>
      <span className="help-address-row">
        <span className="help-address-text mono">{BRAND.supportEmail}</span>
        <button type="button" className="btn small" onClick={onCopy} aria-label="Copy the support address">
          <Icon name={copied ? 'check' : 'copy'} /> {copied ? 'Copied' : 'Copy'}
        </button>
      </span>
    </div>
  );
}

function MyRequests({ tickets, copied, onCopy, onRemove }: { tickets: HelpTicket[]; copied: string | null; onCopy: (t: HelpTicket) => void; onRemove: (ref: string) => void }) {
  return (
    <div className="panel stack help-mine" aria-labelledby="help-mine-h">
      <div className="panel-title" id="help-mine-h">
        <Icon name="history" /> Your requests on this device
        {tickets.length > 0 && <span className="tag">{tickets.length}</span>}
      </div>
      {tickets.length === 0 ? (
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>
          None yet. Requests you create here are kept in this browser only, so you can send or copy them again later.
        </p>
      ) : (
        <ul className="help-mine-list">
          {tickets.map((t) => (
            <li key={t.ref}>
              <div className="help-mine-top">
                <span className="mono help-mine-ref">{t.ref}</span>
                <span className="faint">{fmtTime(t.at)}</span>
              </div>
              <div className="row" style={{ gap: 6 }}>
                <span className="tag">{t.topic}</span>
                <span className={`tag ${t.urgency === 'high' ? 'bad' : ''}`}>{urgencyLabel(t.urgency)}</span>
                <span className="tag warn">Not sent from the portal</span>
              </div>
              <p className="help-mine-msg">{t.message}</p>
              <div className="row" style={{ gap: 6 }}>
                <a className="btn small" href={mailtoFor(t)}>
                  <Icon name="send" /> Email
                </a>
                <button type="button" className="btn small" onClick={() => onCopy(t)}>
                  <Icon name={copied === `t-${t.ref}` ? 'check' : 'copy'} /> {copied === `t-${t.ref}` ? 'Copied' : 'Copy'}
                </button>
                <button type="button" className="btn small ghost" onClick={() => onRemove(t.ref)} aria-label={`Remove ${t.ref} from this device`}>
                  <Icon name="trash" /> Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Build, role, screen, connection and browser, as one block of text. */
function useTechDetails(): string {
  const { route, role, backend, workspaceId, prefs, v } = useApp();
  const offline = backend.network === 'offline';
  return useMemo(() => {
    const ws = workspaceId ? backend.db.workspaces[workspaceId]?.name : null;
    let size = '';
    let zone = '';
    try {
      size = `${window.innerWidth} x ${window.innerHeight}`;
      zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      /* optional */
    }
    return [
      `Build: ${__BUILD_COMMIT__} (${__BUILD_TARGET__ === 'artifact' ? 'hosted preview' : 'full app'}), built ${__BUILD_TIME__.slice(0, 16).replace('T', ' ')} UTC`,
      `Role: ${role ? ROLE_LABEL[role] : 'none'}${ws ? ` at ${ws}` : ''}`,
      `Screen: ${route.name}${route.id ? ` (${route.id})` : ''}`,
      `Connection: ${offline ? 'offline' : 'online'} (simulated)`,
      `Demo data: ${backend.meta.fixture === 'scenario' ? 'busy warehouse' : 'small warehouse'}, text size ${prefs.text}, theme ${prefs.theme}`,
      ...(size ? [`Window: ${size}`] : []),
      ...(zone ? [`Time zone: ${zone}`] : []),
      `Browser: ${typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'}`,
    ].join('\n');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, role, offline, workspaceId, prefs.text, prefs.theme, v]);
}
