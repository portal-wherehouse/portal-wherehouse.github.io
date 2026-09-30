// The setup survey: one question per screen with animated transitions, a short "curating" pause, then a
// recommended starting setup. The first answer (the kind of business) shapes every question after it. Progress
// is kept in the browser, so a refresh picks up on the same question. On the website it leads into the free
// trial; in the portal it applies the words.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useApp } from '../../app/state';
import { useSite } from '../../site/routing';
import { uuid } from '../../domain/codes';
import {
  BLANK_ANSWERS,
  defaultLayout,
  groupById,
  groupsFor,
  keptLabels,
  loadSurveyProgress,
  PLACE_NAME,
  PLACE_SUB,
  PLACES,
  PRINTERS,
  profileOf,
  PROFILE_IDS,
  PROFILES,
  QTY,
  recommend,
  saveSurvey,
  saveSurveyProgress,
  surveyNumbers,
  surveyWords,
  type GroupLayout,
  type Place,
  type ProductGroup,
  type Recommendation,
  type Size,
  type SurveyAnswers,
  type Tier,
} from '../../domain/survey';
import { CLOUD_ADDON, cleanZip, money, recommendPlan } from '../../domain/plans';
import { TRIAL_DAYS } from '../../domain/license';
import { BRAND } from '../../brand';
import { Icon, type IconName } from '../../ui/icons';
import './survey.css';

type Opt = { id: string; title: string; sub?: string; icon: IconName };
type Text = string | ((a: SurveyAnswers) => string);
type ListField = 'groups' | 'limits';
type Step = {
  id: keyof SurveyAnswers;
  q: Text;
  why: Text;
  hint?: Text;
  kind: 'one' | 'many' | 'text' | 'layout';
  options?: Opt[];
  optionsFor?: (a: SurveyAnswers) => Opt[];
  moreFor?: (a: SurveyAnswers) => Opt[];
  moreLabel?: string;
  /** An option that clears the others in a pick-many question ("Nothing to track"). */
  only?: string;
  placeholder?: string;
  show?: (a: SurveyAnswers) => boolean;
  site?: boolean;
  numeric?: boolean;
  valid?: (v: string) => boolean;
};
const say = (t: Text | undefined, a: SurveyAnswers) => (typeof t === 'function' ? t(a) : t);

const PROFILE_ICON: Record<string, IconName> = { pallets: 'pallet', auto: 'truck', building: 'layers', furniture: 'building', parts: 'settings', retail: 'box', equipment: 'hardhat', custom: 'sparkle' };
const SIZE_ICON: Record<Size, IconName> = { pallet: 'pallet', bulky: 'box', medium: 'stack', small: 'grid', long: 'list' };
const groupOpt = (x: ProductGroup): Opt => ({ id: x.id, title: x.name, sub: x.sub, icon: SIZE_ICON[x.size] });
const PRINTER_ICON: Record<string, IconName> = { handheld: 'labels', other: 'question', office: 'print' };
const noun = (a: SurveyAnswers) => surveyWords(a).noun;

const STEPS: Step[] = [
  {
    id: 'profile',
    q: 'What kind of inventory do you manage?',
    why: 'Your answer decides the questions that follow, the words the app uses and which features are turned on.',
    hint: 'Pick the closest. You can change it later.',
    kind: 'one',
    options: PROFILE_IDS.map((id) => ({ id, title: PROFILES[id].title, sub: PROFILES[id].sub, icon: PROFILE_ICON[id] })),
  },
  {
    id: 'word',
    q: 'What do you call one unit of what you store?',
    why: 'The app uses this word on every button, screen and label. A moving company might say “crate”, a school “kit”, a print shop “job”. If you type “Tote”, the app says “Receive a tote” and “Find a tote”.',
    hint: 'One word, like Unit, Tote, Crate or Kit.',
    kind: 'text',
    placeholder: 'Unit, tote, crate, kit…',
    show: (a) => a.profile === 'custom',
  },
  {
    id: 'groups',
    q: (a) => profileOf(a).groupsQ,
    why: 'Each kind gets its own storage zone, label size and handling. A transmission and a bottle of wiper fluid don’t belong in the same spot.',
    hint: 'Pick all that you carry.',
    kind: 'many',
    optionsFor: (a) => groupsFor(a.profile).main.map(groupOpt),
    moreFor: (a) => groupsFor(a.profile).more.map(groupOpt),
    moreLabel: 'other kinds of inventory',
  },
  {
    id: 'layout',
    q: 'Where does each kind go, and how much is there?',
    why: 'Each row becomes its own storage zones. An area is one rack row, one room or one section of floor. The quantities decide how many spots and labels you need.',
    hint: 'A guess is fine. You can change all of it during setup.',
    kind: 'layout',
    show: (a) => a.groups.length > 0,
  },
  {
    id: 'limits',
    q: 'What limits how much fits in a spot?',
    why: (a) => `Pick what you need to respect when you put ${noun(a)} away. Weight limits turn on weight tracking; the others set how many fit per spot, so Move only suggests spots with room.`,
    hint: 'Pick all that apply.',
    kind: 'many',
    only: 'none',
    optionsFor: (a) => {
      const l = profileOf(a).limits;
      return [
        { id: 'weight', title: l.weight, sub: 'Track weight and warn before a level is overloaded', icon: 'target' },
        { id: 'count', title: l.count, sub: 'Set a number per spot', icon: 'grid' },
        { id: 'stack', title: l.stack, sub: 'Set a stacking height on floor spots', icon: 'stack' },
        { id: 'none', title: 'None of these', sub: 'Keep it simple', icon: 'x' },
      ];
    },
  },
  {
    id: 'people',
    q: (a) => `How many people will receive, move or look up ${noun(a)}?`,
    why: 'This sets how many user accounts your plan includes, and whether a handheld scanner would help.',
    kind: 'one',
    options: [
      { id: 'solo', title: 'Just me', icon: 'user' },
      { id: 'small', title: '2 to 5', icon: 'people' },
      { id: 'medium', title: '6 to 15', icon: 'people' },
      { id: 'large', title: 'More than 15', icon: 'building' },
    ],
  },
  {
    id: 'hold',
    q: (a) => `Do you reserve ${noun(a)} for a specific customer, order or job?`,
    why: (a) => `For example, ${profileOf(a).holdExample} If you do this, the app can tag and group reserved ${noun(a)}. If not, we hide the feature.`,
    kind: 'one',
    optionsFor: (a) => [
      { id: 'none', title: 'No, we don’t reserve anything', sub: 'Keep it simple', icon: 'x' },
      ...profileOf(a).holds.map(([id, title, sub]) => ({ id, title: `Yes, for ${title.toLowerCase()}`, sub, icon: (id === 'event' ? 'calendar' : id === 'project' ? 'hardhat' : id === 'order' ? 'checklist' : 'user') as IconName })),
      { id: 'other', title: 'Yes, something else', sub: 'You name it', icon: 'sparkle' },
    ],
  },
  { id: 'holdWord', q: 'What do you reserve them for?', why: 'The app groups reserved inventory under this word. A caterer might say “event”, a builder “build”, a rental shop “rental”. You’d see screens like “Items for this rental”.', hint: 'One word, like Rental, Build or Delivery.', kind: 'text', placeholder: 'Build, rental, delivery…', show: (a) => a.hold === 'other' },
  {
    id: 'hasPrinter',
    q: 'Do you already have a printer for labels?',
    why: 'Every spot and every labeled unit, bin or pallet gets a QR label. We’ll check your printer or suggest one.',
    hint: 'Any printer counts, even an office one.',
    kind: 'one',
    options: [
      { id: 'yes', title: 'Yes', icon: 'print' },
      { id: 'no', title: 'No, not yet', icon: 'x' },
    ],
  },
  { id: 'printer', q: 'Which printer is it?', why: 'Our labels need a 4-inch-wide label printer or a regular letter page. We’ll tell you if yours works.', kind: 'one', options: PRINTERS.map((p) => ({ id: p.id, title: p.title, sub: p.examples, icon: PRINTER_ICON[p.id] ?? 'labels' })), show: (a) => a.hasPrinter === 'yes' },
  {
    id: 'scanner',
    q: 'How will you scan labels?',
    why: 'Any smartphone camera can scan our labels, just not as fast as a handheld scanner. Many teams use phones for everyone and a scanner where they receive the most.',
    kind: 'one',
    options: [
      { id: 'phone', title: 'Phone camera', sub: 'Works on day one; slower for big batches', icon: 'phone' },
      { id: 'scanner', title: 'Handheld scanner', sub: 'Fastest for lots of scanning', icon: 'scanner' },
      { id: 'both', title: 'Both', sub: 'Phones for everyone, a scanner at receiving', icon: 'swap' },
      { id: 'unsure', title: 'Not sure yet', sub: 'We’ll recommend one', icon: 'question' },
    ],
  },
  {
    id: 'files',
    q: 'Do you want photos and paperwork backed up online?',
    why: 'Cloud backup keeps photos of damage, delivery papers and signed receipts with every record, safe online. Paper records are included in every plan.',
    kind: 'one',
    site: true,
    options: [
      { id: 'cloud', title: `Cloud document backup: +${money(CLOUD_ADDON.monthly)}/month`, sub: 'Photos and documents saved with every record', icon: 'cloud' },
      { id: 'paper', title: 'Paper records: +$0.00, included', sub: 'Print what you need; nothing extra stored online', icon: 'print' },
    ],
  },
  { id: 'zip', q: 'What’s your zip code?', why: 'We use it to check whether a Wherehouse tech can come set everything up for you in person.', kind: 'text', placeholder: 'Enter your zip code', site: true, numeric: true, valid: (v) => /^\d{5}$/.test(v.trim()) },
];

const CURATE = ['Laying out your storage zones', 'Counting your spots and labels', 'Checking your printer', 'Estimating your setup time', 'Finding your plan'];
const VERDICT: Record<string, { label: string; tone: string; icon: IconName }> = {
  works: { label: 'Works', tone: 'ok', icon: 'checkCircle' },
  maybe: { label: 'Check the model', tone: 'warn', icon: 'alertCircle' },
  no: { label: 'Not a fit', tone: 'bad', icon: 'x' },
  none: { label: 'Recommendation', tone: 'info', icon: 'print' },
};
const fmt = (n: number) => n.toLocaleString('en-US');

export function SetupSurvey({ mode, onClose, onApplied }: { mode: 'site' | 'portal'; onClose: () => void; onApplied?: (rec: Recommendation) => void }) {
  const resume = useMemo(() => loadSurveyProgress(mode), [mode]);
  const [a, setA] = useState<SurveyAnswers>(resume?.answers ?? BLANK_ANSWERS);
  const visible = (x: SurveyAnswers) => STEPS.filter((s) => (!s.site || mode === 'site') && (!s.show || s.show(x)));
  const [i, setI] = useState(() => (resume ? visible(resume.answers).findIndex((s) => s.id === resume.step) : -1)); // -1 is the intro
  const [dir, setDir] = useState<'fwd' | 'back'>('fwd');
  const [phase, setPhase] = useState<'ask' | 'curate' | 'result'>(() => (resume?.step === 'result' ? 'result' : 'ask'));
  const timer = useRef<number | undefined>(undefined);
  const steps = visible(a);
  const step = i >= 0 ? steps[i] : null;
  const rec = useMemo(() => recommend(a), [a]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  // Keep every answer, so a refresh or a closed tab comes back to the same question.
  useEffect(() => {
    if (i < 0 && phase === 'ask' && a === BLANK_ANSWERS) return;
    saveSurveyProgress(mode, a, phase === 'result' ? 'result' : (step?.id ?? ''));
  }, [a, i, phase, mode, step]);

  const next = (answers = a) => {
    window.clearTimeout(timer.current);
    setDir('fwd');
    const list = visible(answers);
    if (i + 1 < list.length) return setI(i + 1);
    setPhase('curate');
    timer.current = window.setTimeout(() => setPhase('result'), matchMedia('(prefers-reduced-motion: reduce)').matches ? 300 : 2600);
  };
  const back = () => {
    window.clearTimeout(timer.current);
    setDir('back');
    if (phase !== 'ask') return (setPhase('ask'), setI(steps.length - 1));
    setI(Math.max(-1, i - 1));
  };
  const pick = (s: Step, id: string) => {
    if (s.kind === 'many') {
      const field = s.id as ListField;
      const cur = a[field] as string[];
      let list = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      if (s.only) list = id === s.only ? (cur.includes(id) ? [] : [id]) : list.filter((x) => x !== s.only);
      const answers = { ...a, [field]: list } as SurveyAnswers;
      // A new kind of inventory starts with sensible storage, so the next page is a quick check, not a form.
      if (field === 'groups') {
        const layout: Record<string, GroupLayout> = {};
        for (const g of list) {
          const x = groupById(g, a.profile);
          if (x) layout[g] = a.layout[g] ?? defaultLayout(x);
        }
        answers.layout = layout;
      }
      return setA(answers);
    }
    // A new kind of business starts its own questions from scratch.
    const answers = (s.id === 'profile' && id !== a.profile ? { ...a, profile: id, groups: [], layout: {}, limits: [], hold: null, holdWord: '' } : { ...a, [s.id]: id }) as SurveyAnswers;
    setA(answers);
    // The printer answer shows its verdict first; everything else moves on by itself.
    if (s.id !== 'printer') timer.current = window.setTimeout(() => next(answers), 320);
  };
  const answered = (s: Step) => (s.kind === 'many' ? (a[s.id as ListField] as string[]).length > 0 : s.kind === 'layout' ? true : s.kind === 'text' ? (s.valid ? s.valid(String(a[s.id])) : String(a[s.id]).trim().length > 0) : a[s.id] !== null);
  const progress = phase === 'ask' ? Math.max(0, i) / steps.length : 1;
  const close = () => {
    if (phase === 'result') saveSurveyProgress(mode, null);
    onClose();
  };
  const restart = () => {
    saveSurveyProgress(mode, null);
    setA(BLANK_ANSWERS);
    setPhase('ask');
    setDir('back');
    setI(-1);
  };

  return (
    <div className={`survey survey-${mode}`} role="dialog" aria-modal="true" aria-label="Setup survey" data-keep-words data-testid="setup-survey">
      <div className="survey-bg" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <header className="survey-top">
        <strong className="survey-brand">{BRAND.name}</strong>
        <div className="survey-bar" aria-hidden="true">
          <i style={{ transform: `scaleX(${progress})` }} />
        </div>
        <button type="button" className="survey-close" aria-label="Close the survey" onClick={close}>
          <Icon name="x" />
        </button>
      </header>
      <main className="survey-stage">
        {phase === 'curate' ? (
          <Curating />
        ) : phase === 'result' ? (
          <Results rec={rec} mode={mode} onBack={back} onRestart={restart} onClose={close} onApplied={onApplied} answers={a} />
        ) : !step ? (
          <Card k="intro" dir={dir}>
            <p className="survey-eyebrow">{mode === 'site' ? 'Find your plan' : 'Setting up your warehouse'} · about 3 minutes</p>
            <h1 className="survey-q">{mode === 'site' ? 'Let’s find the right plan for your business.' : 'Let’s put your warehouse in Wherehouse.'}</h1>
            <p className="survey-hint">A few questions about what you carry, where it’s stored and what equipment you have. {mode === 'site' ? 'You’ll get your storage zones, spot and label counts, printer advice, a setup time estimate and a recommended plan.' : 'You’ll get your storage zones, spot and label counts, printer advice and your words.'}</p>
            <ul className="survey-intro-list">
              <li>
                <span className="survey-bubble">
                  <Icon name="box" />
                </span>
                What you carry
              </li>
              <li>
                <span className="survey-bubble">
                  <Icon name="locations" />
                </span>
                Where it’s stored
              </li>
              <li>
                <span className="survey-bubble">
                  <Icon name="print" />
                </span>
                Printer and scanner
              </li>
            </ul>
            <p className="survey-saved">
              <Icon name="checkCircle" /> Your answers save as you go, so you can leave and pick up where you left off.
            </p>
            <button type="button" className="survey-go" onClick={() => next()} autoFocus>
              Start <Icon name="arrowRight" />
            </button>
          </Card>
        ) : (
          <Card k={String(step.id)} dir={dir}>
            <p className="survey-eyebrow">
              {mode === 'site' ? 'Find your plan' : 'Setting up your warehouse'} · Question {i + 1} of {steps.length}
            </p>
            <p className="survey-why">
              <Icon name="info" /> {say(step.why, a)}
            </p>
            <h1 className="survey-q">{say(step.q, a)}</h1>
            {step.hint && <p className="survey-hint">{say(step.hint, a)}</p>}
            {step.kind === 'text' ? (
              <form
                className="survey-text"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (answered(step)) next();
                }}
              >
                <input className="input big" autoFocus maxLength={step.numeric ? 5 : 24} inputMode={step.numeric ? 'numeric' : undefined} autoComplete={step.numeric ? 'postal-code' : 'off'} aria-label={say(step.q, a)} placeholder={step.placeholder} value={String(a[step.id])} onChange={(e) => setA({ ...a, [step.id]: step.numeric ? e.target.value.replace(/\D/g, '') : e.target.value })} />
              </form>
            ) : step.kind === 'layout' ? (
              <Layout a={a} setA={setA} />
            ) : (
              <OptionGrid
                key={String(step.id)}
                step={step}
                label={say(step.q, a) ?? ''}
                main={step.optionsFor ? step.optionsFor(a) : step.options!}
                more={step.moreFor?.(a) ?? []}
                isOn={(id) => (step.kind === 'many' ? (a[step.id as ListField] as string[]).includes(id) : a[step.id] === id)}
                onPick={(id) => pick(step, id)}
              />
            )}
            {step.id === 'printer' && a.printer && <PrinterVerdict id={a.printer} />}
            <div className="survey-nav">
              <button type="button" className="survey-back" onClick={back}>
                <Icon name="chevronLeft" /> Back
              </button>
              {(step.kind !== 'one' || step.id === 'printer') && (
                <button type="button" className="survey-go" disabled={!answered(step)} onClick={() => next()}>
                  Continue <Icon name="arrowRight" />
                </button>
              )}
            </div>
          </Card>
        )}
      </main>
    </div>
  );
}

/** One row per kind of inventory: where it's kept, how many areas, roughly how many, and whether they share bins. */
function Layout({ a, setA }: { a: SurveyAnswers; setA: (a: SurveyAnswers) => void }) {
  const n = surveyNumbers(a);
  const set = (id: string, patch: Partial<GroupLayout>, x: ProductGroup) => setA({ ...a, layout: { ...a.layout, [id]: { ...(a.layout[id] ?? defaultLayout(x)), ...patch } } });
  return (
    <>
      <div className="survey-layout">
        {a.groups.map((id, k) => {
          const x = groupById(id, a.profile);
          if (!x) return null;
          const l = a.layout[id] ?? defaultLayout(x);
          const others = (Object.keys(PLACES) as Place[]).filter((p) => !x.places.includes(p));
          const kept = keptLabels(x);
          return (
            <fieldset key={id} className="survey-row" style={{ ['--n' as string]: k }} data-testid={`layout-${id}`}>
              <legend className="survey-row-name">
                <span className="survey-bubble small">
                  <Icon name={SIZE_ICON[x.size]} />
                </span>
                {x.name}
              </legend>
              <label className="survey-field">
                <span>Stored in</span>
                <select className="input" value={l.place} onChange={(e) => set(id, { place: e.target.value as Place }, x)} aria-label={`${x.name}: stored in`}>
                  {x.places.map((p) => (
                    <option key={p} value={p}>
                      {PLACE_NAME[p]}
                    </option>
                  ))}
                  <optgroup label="Other storage">
                    {others.map((p) => (
                      <option key={p} value={p}>
                        {PLACE_NAME[p]}
                      </option>
                    ))}
                  </optgroup>
                </select>
                <small>{PLACE_SUB[l.place]}</small>
              </label>
              <div className="survey-field">
                <span id={`areas-${id}`}>Separate areas</span>
                <div className="survey-stepper" role="group" aria-labelledby={`areas-${id}`}>
                  <button type="button" aria-label={`${x.name}: fewer areas`} disabled={l.areas <= 1} onClick={() => set(id, { areas: l.areas - 1 }, x)}>
                    −
                  </button>
                  <output aria-live="polite" aria-label={`${x.name}: areas`}>
                    {l.areas}
                  </output>
                  <button type="button" aria-label={`${x.name}: more areas`} disabled={l.areas >= 20} onClick={() => set(id, { areas: l.areas + 1 }, x)}>
                    +
                  </button>
                </div>
                <small>Rack rows, rooms or sections</small>
              </div>
              <div className="survey-field wide">
                <span>About how many on hand</span>
                <span className="survey-chips" role="radiogroup" aria-label={`${x.name}: how many on hand`}>
                  {QTY[x.size].map((q, t) => (
                    <button key={q.label} type="button" role="radio" aria-checked={l.qty === t} aria-label={`${x.name}: ${q.label}`} className={`survey-chip${l.qty === t ? ' on' : ''}`} onClick={() => set(id, { qty: t as Tier }, x)}>
                      {q.label}
                    </button>
                  ))}
                </span>
              </div>
              <div className="survey-field wide">
                <span>How they’re kept</span>
                <span className="survey-chips" role="radiogroup" aria-label={`${x.name}: how they’re kept`}>
                  {(['own', 'shared'] as const).map((v) => (
                    <button key={v} type="button" role="radio" aria-checked={l.kept === v} className={`survey-chip${l.kept === v ? ' on' : ''}`} onClick={() => set(id, { kept: v }, x)}>
                      {kept[v]}
                    </button>
                  ))}
                </span>
              </div>
            </fieldset>
          );
        })}
      </div>
      <p className="survey-tally" role="status" data-testid="layout-tally">
        <Icon name="sparkle" /> That’s about <b>{n.zones}</b> zone{n.zones === 1 ? '' : 's'}, <b>{fmt(n.spots)}</b> spots and <b>{fmt(n.spots + n.unitLabels)}</b> labels.
      </p>
    </>
  );
}

/** Big icon bubbles; less common options wait behind "Show more" unless one is already picked. */
function OptionGrid({ step, label, main, more, isOn, onPick }: { step: Step; label: string; main: Opt[]; more: Opt[]; isOn: (id: string) => boolean; onPick: (id: string) => void }) {
  const [open, setOpen] = useState(() => more.some((o) => isOn(o.id)));
  const shown = open ? [...main, ...more] : main;
  const one = (o: Opt, n: number) => {
    const on = isOn(o.id);
    return (
      <button key={o.id} type="button" role={step.kind === 'many' ? 'checkbox' : 'radio'} aria-checked={on} className={`survey-opt${on ? ' on' : ''}`} style={{ ['--n' as string]: n }} onClick={() => onPick(o.id)}>
        <span className="survey-bubble">
          <Icon name={o.icon} />
        </span>
        <span className="survey-opt-text">
          <strong>{o.title}</strong>
          {o.sub && <small>{o.sub}</small>}
        </span>
        {on && <Icon name="check" />}
      </button>
    );
  };
  return (
    <>
      <div className={`survey-opts${shown.length > 4 ? ' many' : ''}`} role={step.kind === 'many' ? 'group' : 'radiogroup'} aria-label={label}>
        {main.map(one)}
        {open && more.map((o, n) => one(o, n))}
      </div>
      {more.length > 0 && (
        <button type="button" className="survey-more" aria-expanded={open} onClick={() => setOpen(!open)}>
          <Icon name={open ? 'chevronDown' : 'plus'} /> {open ? 'Show fewer' : `Show ${more.length} ${step.moreLabel ?? 'more options'}`}
        </button>
      )}
    </>
  );
}

function Card({ k, dir, children }: { k: string; dir: string; children: ReactNode }) {
  return (
    <section key={k} className={`survey-card enter-${dir}`}>
      {children}
    </section>
  );
}

function PrinterVerdict({ id }: { id: string }) {
  const p = PRINTERS.find((x) => x.id === id)!;
  const v = VERDICT[p.verdict];
  return (
    <div key={id} className={`survey-verdict tone-${v.tone}`} role="status" data-testid="printer-verdict">
      <Icon name={v.icon} />
      <div>
        <strong>{v.label}</strong>
        <p>{p.body}</p>
      </div>
    </div>
  );
}

function Curating() {
  const [n, setN] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setN((x) => Math.min(CURATE.length, x + 1)), 480);
    return () => window.clearInterval(t);
  }, []);
  return (
    <section className="survey-card survey-curate enter-fwd" role="status" aria-live="polite">
      <div className="survey-orb" aria-hidden="true" />
      <h1 className="survey-q">Building your plan…</h1>
      <ul>
        {CURATE.map((c, k) => (
          <li key={c} className={k < n ? 'done' : k === n ? 'now' : ''}>
            <Icon name={k < n ? 'checkCircle' : 'clock'} /> {c}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Results({ rec, mode, answers, onBack, onRestart, onClose, onApplied }: { rec: Recommendation; mode: 'site' | 'portal'; answers: SurveyAnswers; onBack: () => void; onRestart: () => void; onClose: () => void; onApplied?: (rec: Recommendation) => void }) {
  const v = VERDICT[rec.printer.verdict];
  const s = rec.setup;
  const n = rec.numbers;
  return (
    <section className="survey-card survey-results enter-fwd" data-testid="survey-results">
      <p className="survey-eyebrow">Your recommendation</p>
      <h1 className="survey-q">{mode === 'site' ? 'Here’s your plan.' : 'Here’s your starting setup.'}</h1>
      {mode === 'site' && <PlanChoice answers={answers} />}
      <h2 className="survey-sub">Your setup by the numbers</h2>
      <div className="survey-stats">
        <Stat n={0} value={fmt(n.zones)} label={n.zones === 1 ? 'storage zone' : 'storage zones'} />
        <Stat n={1} value={fmt(n.spots)} label="spots, with room to grow" />
        <Stat n={2} value={fmt(n.spots + n.unitLabels)} label="labels to print" />
        <Stat n={3} value={`${n.hours}`} label={n.hours === 1 ? 'hour to set up yourself' : 'hours to set up yourself'} />
      </div>
      {rec.zones.length > 0 && (
        <div className="survey-table-wrap">
          <table className="survey-table" data-testid="zone-plan">
            <thead>
              <tr>
                <th scope="col">Zone</th>
                <th scope="col">What goes there</th>
                <th scope="col">Stored in</th>
                <th scope="col">On hand</th>
                <th scope="col">Spots</th>
              </tr>
            </thead>
            <tbody>
              {rec.zones.map((z) => (
                <tr key={z.group}>
                  <td>
                    <b>{z.letters.length > 1 ? `${z.letters[0]}–${z.letters[z.letters.length - 1]}` : z.letters[0]}</b>
                  </td>
                  <td>{z.group}</td>
                  <td>{PLACE_NAME[z.place]}</td>
                  <td>
                    ~{fmt(z.units)}
                    {z.labeled < z.units && <small> in {fmt(z.labeled)} bins</small>}
                  </td>
                  <td>{fmt(z.spots)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="survey-grid">
        <Tile n={0} icon="text" title="Your words">
          <p>
            The app will say <b>{s.thing}</b> and <b>{s.things}</b>.
          </p>
          <p>{s.jobs_on ? `Reserved ${s.things.toLowerCase()} are grouped by ${s.job.toLowerCase()}.` : 'Reserving is off, so there’s less on screen.'}</p>
        </Tile>
        <Tile n={1} icon={v.icon} title="Printer" tone={v.tone}>
          <p>
            <b>{rec.printer.verdict === 'none' ? rec.printer.title : `${rec.printer.title}: ${v.label.toLowerCase()}`}</b>
          </p>
          <p>{rec.printer.body}</p>
        </Tile>
        <Tile n={2} icon="labels" title="Labels">
          <ul>
            {rec.labels.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </Tile>
        <Tile n={3} icon="scanner" title={rec.scanner.title}>
          <p>{rec.scanner.body}</p>
        </Tile>
        {rec.rules.length > 0 && (
          <Tile n={4} icon="shield" title="Rules for your spots">
            <ul>
              {rec.rules.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </Tile>
        )}
        <Tile n={5} icon="checklist" title="Next steps">
          <ol>
            {rec.steps.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ol>
        </Tile>
      </div>
      <div className="survey-disclaimer" style={{ ['--n' as string]: 6 }}>
        <Icon name="info" />
        <p>
          <b>These are estimates from your answers, not a finished setup.</b> You still create your zones and spots, print and hang labels, load what you have and add your crew. The setup checklist walks you through it, and you can change any of this later in Warehouse settings.
        </p>
      </div>
      {mode === 'site' ? <SiteActions onBack={onBack} onRestart={onRestart} answers={answers} /> : <PortalActions rec={rec} onBack={onBack} onClose={onClose} onApplied={onApplied} />}
    </section>
  );
}

function Stat({ n, value, label }: { n: number; value: string; label: string }) {
  return (
    <div className="survey-stat" style={{ ['--n' as string]: n }}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function SiteActions({ answers, onBack, onRestart }: { answers: SurveyAnswers; onBack: () => void; onRestart: () => void }) {
  return (
    <div className="survey-nav">
      <span className="survey-nav-group">
        <button type="button" className="survey-back" onClick={onBack}>
          <Icon name="chevronLeft" /> Change answers
        </button>
        <button type="button" className="survey-back" onClick={onRestart}>
          <Icon name="refresh" /> Start over
        </button>
      </span>
      <a className="survey-ghost" href={mailto('Question about Wherehouse', answers)}>
        <Icon name="mail" /> More questions? Contact us
      </a>
    </div>
  );
}

/** A prefilled email to John with the survey answers, so a question or setup request needs no retyping. */
function mailto(subject: string, a: SurveyAnswers, extra = '') {
  const pick = recommendPlan(a);
  const n = surveyNumbers(a);
  const lines = [
    extra,
    'My survey answers:',
    `- Business: ${a.profile ? PROFILES[a.profile].title : 'not answered'}${a.word ? ` (${a.word})` : ''}`,
    ...a.groups.map((id) => {
      const x = groupById(id, a.profile);
      const l = a.layout[id];
      return x && l ? `- ${x.name}: ${PLACE_NAME[l.place]}, ${l.areas} area${l.areas === 1 ? '' : 's'}, ${QTY[x.size][l.qty].label}, ${keptLabels(x)[l.kept].toLowerCase()}` : '';
    }),
    `- Estimate: ${n.zones} zones, ${n.spots} spots, ${n.spots + n.unitLabels} labels, about ${n.hours} hours to set up`,
    `- People: ${a.people ?? 'not answered'}`,
    `- Printer: ${a.hasPrinter === 'yes' ? (PRINTERS.find((p) => p.id === a.printer)?.title ?? 'yes') : 'none yet'}`,
    `- Scanning: ${a.scanner ?? 'not answered'}`,
    `- Cloud backup: ${a.files === 'cloud' ? 'yes' : 'no'}`,
    `- Zip: ${a.zip || 'not given'}`,
    `- Recommended plan: ${pick.plan.name}, ${money(pick.monthly)}/month`,
  ].filter((x) => x !== '');
  return `mailto:${BRAND.supportEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\n'))}`;
}

function PlanChoice({ answers }: { answers: SurveyAnswers }) {
  const { go } = useSite();
  const pick = recommendPlan(answers);
  const [payNote, setPayNote] = useState(false);
  const zip = cleanZip(answers.zip);
  return (
    <div className="survey-plan" data-testid="plan-choice">
      <article className="survey-plan-card" style={{ ['--n' as string]: 0 }}>
        <span className="survey-badge">Recommended plan</span>
        <h2>
          {pick.plan.name} <span>{money(pick.monthly)}/month</span>
        </h2>
        <p>
          {pick.why}
          {pick.cloud ? ` Includes cloud document backup (+${money(CLOUD_ADDON.monthly)}).` : ''}
        </p>
        <ul>
          {pick.plan.features.map((f) => (
            <li key={f}>
              <Icon name="check" /> {pick.cloud && f.startsWith('Paper') ? 'Cloud document backup' : f}
            </li>
          ))}
        </ul>
      </article>
      <h2 className="survey-sub">How do you want to get set up?</h2>
      <div className="survey-ways">
        <article className="survey-way recommended" style={{ ['--n' as string]: 1 }} data-testid="way-tech">
          <div className="survey-way-head">
            <span className="survey-bubble">
              <Icon name="hardhat" />
            </span>
            <span className="survey-badge">Recommended</span>
          </div>
          <h3>Have a Wherehouse tech set it up</h3>
          <p className="survey-price">{money(pick.setupFee)} one time</p>
          <p>A tech comes to you, builds your zones and spots, hangs the labels, loads your inventory and trains your crew. You start on day one with everything working. No free trial with this option.</p>
          {pick.techAvailable ? (
            <>
              <p className="survey-ok">
                <Icon name="checkCircle" /> We cover {zip}.
              </p>
              <div className="survey-ctas">
                <button type="button" className="survey-go" onClick={() => setPayNote(true)}>
                  Pay now <Icon name="arrowRight" />
                </button>
                <a className="survey-ghost" href={mailto('Wherehouse setup question', answers)}>
                  Ask a question
                </a>
              </div>
              {payNote && (
                <p className="survey-note" role="status">
                  Online payment isn’t switched on yet. <a href={mailto('Book a Wherehouse tech setup', answers, `I’d like a tech to set up my warehouse (${money(pick.setupFee)}).`)}>Send us a setup request</a> and we’ll invoice you and book a day.
                </p>
              )}
            </>
          ) : (
            <>
              <p className="survey-note">
                <Icon name="info" />
                <span>
                  On-site setup isn’t available{zip ? ` in ${zip}` : ''} yet. Right now it covers about an hour around Charleston, SC. Contact us and we’ll work something out.
                </span>
              </p>
              <a className="survey-go" href={mailto('Setup outside the Charleston area', answers, 'I’m outside the on-site area but interested in help setting up.')}>
                <Icon name="mail" /> Contact us
              </a>
            </>
          )}
        </article>
        <article className="survey-way" style={{ ['--n' as string]: 2 }} data-testid="way-diy">
          <div className="survey-way-head">
            <span className="survey-bubble">
              <Icon name="user" />
            </span>
            <span className="survey-badge soft">Free trial available</span>
          </div>
          <h3>Set it up yourself</h3>
          <p className="survey-price">
            Free for {TRIAL_DAYS} days, then {money(pick.monthly)}/month
          </p>
          <p>A step-by-step setup checklist walks you through your zones, spots, labels and inventory before you start.</p>
          <p className="survey-warn">
            <Icon name="alert" />
            <span>
              Heads up: this can be a difficult process. From your answers, expect about <b>{pick.hours} hours</b> to create every zone and spot, print and hang every label, and load your inventory.
            </span>
          </p>
          <button
            type="button"
            className="survey-go"
            onClick={() => {
              saveSurvey(answers);
              go('signin');
            }}
          >
            Start your free trial <Icon name="arrowRight" />
          </button>
        </article>
      </div>
    </div>
  );
}

function PortalActions({ rec, onBack, onClose, onApplied }: { rec: Recommendation; onBack: () => void; onClose: () => void; onApplied?: (rec: Recommendation) => void }) {
  const { send } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const apply = async () => {
    setBusy(true);
    setError('');
    const r = await applyRecommendation(send, rec);
    setBusy(false);
    if (r) return setError(r);
    saveSurvey(null);
    saveSurveyProgress('portal', null);
    onApplied?.(rec);
    onClose();
  };
  return (
    <>
      {error && (
        <p className="survey-error" role="alert">
          {error}
        </p>
      )}
      <div className="survey-nav">
        <button type="button" className="survey-back" onClick={onBack}>
          <Icon name="chevronLeft" /> Change answers
        </button>
        <button type="button" className="survey-go" disabled={busy} onClick={() => void apply()}>
          {busy ? 'Saving…' : 'Use this setup'} <Icon name="check" />
        </button>
      </div>
    </>
  );
}

function Tile({ n, icon, title, tone = 'info', children }: { n: number; icon: IconName; title: string; tone?: string; children: ReactNode }) {
  return (
    <article className={`survey-tile tone-${tone}`} style={{ ['--n' as string]: n }}>
      <h2>
        <Icon name={icon} /> {title}
      </h2>
      {children}
    </article>
  );
}

type SendFn = ReturnType<typeof useApp>['send'];
/** Save the recommended words (and weight tracking) to the warehouse. Returns an error message, or '' when saved. */
export async function applyRecommendation(send: SendFn, rec: Recommendation): Promise<string> {
  const o = await send('set_setup', { ...rec.setup, ...(rec.advanced ? { advanced: true } : {}) }, null, { commandId: uuid() });
  if (o.status === 'result' && o.result.ok) return '';
  return o.status === 'result' && !o.result.ok ? o.result.message : o.status === 'offline' ? o.message : 'No answer from the server. Try again.';
}
