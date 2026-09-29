// Contact: a "Book a walkthrough" form with accessible validation. This preview cannot send
// messages, so a request is saved in this browser and handed back as a ready-to-send email.

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { BRAND, CREATOR } from '../../brand';
import { useApp } from '../../app/state';
import { copyText, IS_PREVIEW } from '../../device/output';
import { Icon } from '../../ui/icons';
import { PageHero, PortalCTA, Section } from '../kit';
import { EmailCopy, selectText } from './d-kit';
import './pages-d.css';

const STORE_KEY = 'wh.contact.requests';

const ROLES = ['Owner or executive', 'Operations or warehouse manager', 'Project manager or superintendent', 'Yard or warehouse crew', 'Purchasing or office', 'IT or systems', 'Something else'];
const SIZES = ['Under 100 pallets', '100 to 500 pallets', '500 to 2,000 pallets', 'Over 2,000 pallets', 'Not sure yet'];
const TOPICS = [
  'Receiving and labels',
  'Moving pallets with scanners',
  'Finding material by job',
  'Pick lists and dispatch',
  'Barcode scanner setup',
  'Roles and permissions',
  'Bringing in data from spreadsheets',
  'Pricing and plans',
];
const NEXT_STEPS = [
  { title: 'You send the request', body: 'By email, with everything you filled in, so nothing gets lost.' },
  { title: 'We find a time', body: `${CREATOR.name} replies to set up a time that works for you, by email or phone, whichever you chose.` },
  { title: 'The walkthrough', body: `We walk through ${BRAND.name} with your jobs, your racks and the scanners you have in mind. Bring your questions.` },
];
const METHODS = [
  { id: 'email', label: 'Email' },
  { id: 'phone', label: 'Phone call' },
] as const;
type Method = (typeof METHODS)[number]['id'];

interface FormState {
  name: string;
  email: string;
  company: string;
  phone: string;
  role: string;
  size: string;
  topics: string[];
  notes: string;
  method: Method;
}
type FieldId = 'name' | 'email' | 'company' | 'phone' | 'role' | 'size' | 'topics';
type Errors = Partial<Record<FieldId, string>>;

interface SavedRequest extends FormState {
  ref: string;
  at: string;
}

const EMPTY: FormState = { name: '', email: '', company: '', phone: '', role: '', size: '', topics: [], notes: '', method: 'email' };

/** Where keyboard focus goes for each field's error, in form order. */
const FOCUS_TARGET: Record<FieldId, string> = {
  name: 'ct-name',
  email: 'ct-email',
  company: 'ct-company',
  role: 'ct-role',
  size: 'ct-size-0',
  topics: 'ct-topic-0',
  phone: 'ct-phone',
};
const ORDER: FieldId[] = ['name', 'email', 'company', 'role', 'size', 'topics', 'phone'];

/** Scrolls a field clear of the sticky header, then focuses it. */
function focusField(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ block: 'center' });
  el.focus({ preventScroll: true });
}

/** Prefill from where the visitor came from: a plan on the Pricing page, or the early customer program. */
function initialForm(q: string | undefined): FormState {
  if (q?.startsWith('plan:')) {
    const plan = q.slice(5);
    return { ...EMPTY, topics: ['Pricing and plans'], notes: `I am interested in the ${plan} plan.` };
  }
  if (q === 'early') return { ...EMPTY, notes: 'I am interested in the early customer program.' };
  return EMPTY;
}

function validate(f: FormState): Errors {
  const e: Errors = {};
  if (f.name.trim().length < 2) e.name = 'Enter your name.';
  if (!f.email.trim()) e.email = 'Enter your work email.';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.trim())) e.email = 'Enter an email address like name@company.com.';
  if (!f.company.trim()) e.company = 'Enter your company name.';
  if (!f.role) e.role = 'Choose your role.';
  if (!f.size) e.size = 'Choose a yard size. “Not sure yet” is fine.';
  const digits = f.phone.replace(/\D/g, '').length;
  if (f.method === 'phone' && digits === 0) e.phone = 'Enter a phone number, since you asked for a call.';
  else if (f.phone.trim() && digits < 7) e.phone = 'Enter a full phone number, or leave it blank.';
  if (f.topics.length === 0 && !f.notes.trim()) e.topics = 'Pick at least one thing to see, or describe it in the box below.';
  return e;
}

/** A short reference people can quote back, like WH-260923-K7QF. */
function makeRef(now = new Date()): string {
  const d = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let tail = '';
  for (let i = 0; i < 4; i++) tail += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `WH-${d}-${tail}`;
}

function saveRequest(r: SavedRequest): boolean {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    const list = Array.isArray(parsed) ? parsed : [];
    list.push(r);
    localStorage.setItem(STORE_KEY, JSON.stringify(list.slice(-50)));
    return true;
  } catch {
    return false;
  }
}

function subjectFor(r: SavedRequest) {
  return `Walkthrough request from ${r.company.trim()} (${r.ref})`;
}

function messageFor(r: SavedRequest) {
  const method = METHODS.find((m) => m.id === r.method)?.label ?? r.method;
  return [
    'Hello,',
    '',
    `I would like to book a ${BRAND.name} walkthrough.`,
    '',
    `Reference: ${r.ref}`,
    `Name: ${r.name.trim()}`,
    `Work email: ${r.email.trim()}`,
    `Company: ${r.company.trim()}`,
    `Phone: ${r.phone.trim() || 'not given'}`,
    `Role: ${r.role}`,
    `Yard size: ${r.size}`,
    `Best way to reach me: ${method}`,
    '',
    'What I want to see:',
    ...(r.topics.length ? r.topics.map((t) => `- ${t}`) : ['- (see notes)']),
    ...(r.notes.trim() ? ['', 'Notes:', r.notes.trim()] : []),
    '',
    `Sent from the ${BRAND.name} website contact page.`,
  ].join('\n');
}

export function ContactPage() {
  const { route } = useApp();
  const [form, setForm] = useState<FormState>(() => initialForm(route.q));
  const [tried, setTried] = useState(false);
  const [done, setDone] = useState<{ request: SavedRequest; saved: boolean } | null>(null);
  const summaryRef = useRef<HTMLDivElement>(null);

  const errors = tried ? validate(form) : {};
  const errorList = ORDER.filter((k) => errors[k]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));
  const toggleTopic = (t: string) => setForm((f) => ({ ...f, topics: f.topics.includes(t) ? f.topics.filter((x) => x !== t) : [...f.topics, t] }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    const found = validate(form);
    if (Object.keys(found).length) {
      // Let the summary render, then move focus to it so screen readers hear the problems.
      setTimeout(() => {
        summaryRef.current?.scrollIntoView({ block: 'start' });
        summaryRef.current?.focus({ preventScroll: true });
      }, 0);
      return;
    }
    const request: SavedRequest = { ...form, ref: makeRef(), at: new Date().toISOString() };
    setDone({ request, saved: saveRequest(request) });
  };

  const reset = () => {
    setForm(EMPTY);
    setTried(false);
    setDone(null);
    setTimeout(() => focusField('ct-name'), 0);
  };

  const err = (k: FieldId) => (errors[k] ? `ct-${k}-err` : undefined);

  return (
    <>
      <div className="site-inner ct-hero">
        <PageHero
          eyebrow="Contact"
          title="Book a walkthrough"
          lede={`Tell us about your yard and what you want to see. We will set up a walkthrough built around your jobs, your racks and your scanners.`}
        />
      </div>

      <section className="site-section ct-section" aria-label="Contact form and other ways to reach us">
        <div className="site-inner ct-grid">
          <div className="ct-main">
            {done ? (
              <Confirmation request={done.request} saved={done.saved} onReset={reset} />
            ) : (
              <form className="ct-form" onSubmit={submit} noValidate aria-labelledby="ct-form-h">
                <div className="ct-form-head">
                  <h2 id="ct-form-h" className="ct-form-title">
                    Talk to us
                  </h2>
                  <p className="ct-form-sub">Every field is required unless it says optional.</p>
                </div>

                {errorList.length > 0 && (
                  <div className="ct-summary" role="alert" tabIndex={-1} ref={summaryRef} aria-labelledby="ct-summary-h">
                    <h3 id="ct-summary-h">
                      <Icon name="alertCircle" />
                      {errorList.length === 1 ? 'One thing to fix' : `${errorList.length} things to fix`}
                    </h3>
                    <ul>
                      {errorList.map((k) => (
                        <li key={k}>
                          <button type="button" className="ct-summary-link" onClick={() => focusField(FOCUS_TARGET[k])}>
                            {errors[k]}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="ct-row">
                  <TextField id="ct-name" label="Name" value={form.name} onChange={(v) => set('name', v)} error={errors.name} autoComplete="name" />
                  <TextField id="ct-email" label="Work email" type="email" value={form.email} onChange={(v) => set('email', v)} error={errors.email} autoComplete="email" inputMode="email" />
                </div>
                <div className="ct-row">
                  <TextField id="ct-company" label="Company" value={form.company} onChange={(v) => set('company', v)} error={errors.company} autoComplete="organization" />
                  <div className="ct-field">
                    <label htmlFor="ct-role">Your role</label>
                    <select id="ct-role" className="select" value={form.role} onChange={(e) => set('role', e.target.value)} aria-invalid={!!errors.role} aria-describedby={err('role')}>
                      <option value="">Choose one</option>
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                    <FieldError id={err('role')} text={errors.role} />
                  </div>
                </div>

                <fieldset className={`ct-fieldset ${errors.size ? 'invalid' : ''}`} aria-describedby={err('size')}>
                  <legend>How big is your yard?</legend>
                  <p className="ct-hint">Roughly how many pallets are on hand on a normal day.</p>
                  <FieldError id={err('size')} text={errors.size} />
                  <div className="ct-options ct-sizes">
                    {SIZES.map((s, i) => (
                      <label key={s} className="ct-option">
                        <input id={`ct-size-${i}`} type="radio" name="ct-size" value={s} checked={form.size === s} onChange={() => set('size', s)} aria-invalid={!!errors.size} />
                        <span>{s}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <fieldset className={`ct-fieldset ${errors.topics ? 'invalid' : ''}`} aria-describedby={err('topics')}>
                  <legend>What do you want to see?</legend>
                  <p className="ct-hint">Pick any that apply.</p>
                  <FieldError id={err('topics')} text={errors.topics} />
                  <div className="ct-options ct-topics">
                    {TOPICS.map((t, i) => (
                      <label key={t} className="ct-option ct-check">
                        <input id={`ct-topic-${i}`} type="checkbox" checked={form.topics.includes(t)} onChange={() => toggleTopic(t)} />
                        <span>{t}</span>
                      </label>
                    ))}
                  </div>
                  <div className="ct-field ct-notes">
                    <label htmlFor="ct-notes">
                      Anything else? <span className="ct-optional">Optional</span>
                    </label>
                    <textarea id="ct-notes" className="textarea" rows={4} maxLength={2000} value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="How your yard works today, what is not working, scanners you already own." />
                  </div>
                </fieldset>

                <fieldset className="ct-fieldset">
                  <legend>How should we reach you?</legend>
                  <div className="ct-options ct-methods">
                    {METHODS.map((m) => (
                      <label key={m.id} className="ct-option">
                        <input type="radio" name="ct-method" value={m.id} checked={form.method === m.id} onChange={() => set('method', m.id)} />
                        <span>
                          <Icon name={m.id === 'email' ? 'mail' : 'phone'} />
                          {m.label}
                        </span>
                      </label>
                    ))}
                  </div>
                  <TextField
                    id="ct-phone"
                    label={
                      <>
                        Phone {form.method !== 'phone' && <span className="ct-optional">Optional</span>}
                      </>
                    }
                    type="tel"
                    value={form.phone}
                    onChange={(v) => set('phone', v)}
                    error={errors.phone}
                    autoComplete="tel"
                    inputMode="tel"
                    hint={form.method === 'phone' ? 'Needed for a call.' : undefined}
                  />
                </fieldset>

                <div className="ct-submit">
                  <p className="ct-honest">
                    <Icon name="info" />
                    <span>
                      <strong>This preview does not send messages yet.</strong> When you submit, your request is saved in this browser and you get a ready-to-send email with everything filled in.
                    </span>
                  </p>
                  <button type="submit" className="site-btn primary ct-submit-btn">
                    <Icon name="send" />
                    Prepare walkthrough email
                  </button>
                </div>
              </form>
            )}
          </div>

          <aside className="ct-aside" aria-label="Other ways to reach us">
            <div className="ct-card">
              <h2 className="ct-card-h">
                <Icon name="mail" />
                Email directly
              </h2>
              <p>Messages go straight to {CREATOR.name}, who builds {BRAND.name}.</p>
              <EmailCopy email={BRAND.supportEmail} tone="boxed" />
              {!IS_PREVIEW && (
                <a className="site-link" href={`mailto:${BRAND.supportEmail}`}>
                  Write an email
                </a>
              )}
            </div>

            <div className="ct-card">
              <h2 className="ct-card-h">
                <Icon name="linkedin" />
                LinkedIn
              </h2>
              <p>Connect with {CREATOR.name} or send him a message there.</p>
              <a className="site-btn ghost ct-card-btn" href={CREATOR.linkedin} target="_blank" rel="noopener noreferrer">
                Open LinkedIn
                <Icon name="external" />
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </div>

            <div className="ct-card ct-card-ink tone-ink">
              <h2 className="ct-card-h">
                <Icon name="key" />
                Explore the sample warehouse
              </h2>
              <PortalCTA variant="hero" note="No account needed" />
              <HelpPointer />
            </div>
          </aside>
        </div>
      </section>

      <Section tone="surface" eyebrow="What happens next" title="From request to walkthrough">
        <ol className="ct-next">
          {NEXT_STEPS.map((s, i) => (
            <li key={s.title}>
              <span className="ct-next-n" aria-hidden="true">
                {String(i + 1).padStart(2, '0')}
              </span>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </li>
          ))}
        </ol>
      </Section>
    </>
  );
}

function HelpPointer() {
  const { go } = useApp();
  return (
    <p className="ct-help">
      Need help with the app? The portal’s Help page has a tutorial, answers to common questions, and a quick help form.{' '}
      <button type="button" className="site-link" onClick={() => go('help')}>
        Open portal Help
      </button>
    </p>
  );
}

function FieldError({ id, text }: { id?: string; text?: string }) {
  if (!text || !id) return null;
  return (
    <p id={id} className="ct-err">
      <Icon name="alertCircle" />
      {text}
    </p>
  );
}

function TextField({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  type = 'text',
  autoComplete,
  inputMode,
}: {
  id: string;
  label: ReactNode;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  hint?: string;
  type?: string;
  autoComplete?: string;
  inputMode?: 'email' | 'tel' | 'text';
}) {
  const errId = error ? `${id}-err` : '';
  const hintId = hint ? `${id}-hint` : '';
  const describedBy = [hintId, errId].filter(Boolean).join(' ') || undefined;
  return (
    <div className="ct-field">
      <label htmlFor={id}>{label}</label>
      {hint && (
        <p id={hintId} className="ct-hint">
          {hint}
        </p>
      )}
      <input id={id} className="input" type={type} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={!!error} aria-describedby={describedBy} autoComplete={autoComplete} inputMode={inputMode} maxLength={200} />
      <FieldError id={errId || undefined} text={error} />
    </div>
  );
}

/** After submitting: the reference, an honest note that nothing was sent, and ways to send it now. */
function Confirmation({ request, saved, onReset }: { request: SavedRequest; saved: boolean; onReset: () => void }) {
  const { toast } = useApp();
  const boxRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLHeadingElement>(null);
  const msgRef = useRef<HTMLPreElement>(null);
  const message = messageFor(request);
  const mailto = `mailto:${BRAND.supportEmail}?subject=${encodeURIComponent(subjectFor(request))}&body=${encodeURIComponent(message)}`;

  useEffect(() => {
    boxRef.current?.scrollIntoView({ block: 'start' });
    headRef.current?.focus({ preventScroll: true });
  }, []);

  const copyMessage = async () => {
    if (await copyText(`${subjectFor(request)}\n\n${message}`)) {
      toast('Message copied. Paste it into an email.');
      return;
    }
    selectText(msgRef.current);
    toast('Copying is blocked here. The message is selected, so copy it with your keyboard or a long press.', 'info');
  };

  return (
    <div className="ct-done" ref={boxRef}>
      <div className="ct-done-head">
        <span className="ct-done-icon">
          <Icon name="checkCircle" />
        </span>
        <div>
          <h2 ref={headRef} tabIndex={-1} className="ct-form-title">
            {saved ? 'Request saved' : 'Request ready'}
          </h2>
          <p className="ct-ref">
            Reference <span className="ct-ref-code">{request.ref}</span>
          </p>
        </div>
      </div>

      <div className="ct-done-note" role="status">
        <Icon name="alert" />
        <p>
          <strong>This preview does not send messages yet, so nothing has reached us.</strong>{' '}
          {saved ? 'Your request is saved in this browser only.' : 'This browser would not let us save it, but you can still send it.'} Send it now with one of the options below.
        </p>
      </div>

      <div className="ct-done-actions">
        <a className="site-btn primary" href={mailto}>
          <Icon name="mail" />
          Email it now
        </a>
        <button type="button" className="site-btn ghost" onClick={copyMessage}>
          <Icon name="copy" />
          Copy message
        </button>
      </div>
      <p className="ct-done-small">
        {IS_PREVIEW ? 'Email links may not open from this preview. If nothing happens, copy the message and send it to:' : 'Email not opening? Copy the message and send it to:'}
      </p>
      <EmailCopy email={BRAND.supportEmail} tone="boxed" />

      <div className="ct-msg">
        <div className="ct-msg-h">Your message</div>
        <div className="ct-msg-subject">
          <span>Subject</span> {subjectFor(request)}
        </div>
        <pre ref={msgRef} className="ct-msg-body" tabIndex={0} aria-label="Your message">
          {message}
        </pre>
      </div>

      <button type="button" className="site-btn ghost" onClick={onReset}>
        <Icon name="refresh" />
        Start a new request
      </button>
    </div>
  );
}

