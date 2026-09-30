// The setup survey: one question per screen with animated transitions, a short "curating" pause, then a
// recommended starting setup. On the website it leads into the free trial; in the portal it applies the words.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useApp } from '../../app/state';
import { useSite } from '../../site/routing';
import { uuid } from '../../domain/codes';
import { BLANK_ANSWERS, PLACE_NAME, PLACE_SUB, placesFor, PRINTERS, recommend, saveSurvey, type Place, type Recommendation, type SurveyAnswers, type ZoneCount } from '../../domain/survey';
import { PRESETS } from '../../domain/terms';
import { cleanZip, recommendPlan } from '../../domain/plans';
import { TRIAL_DAYS } from '../../domain/license';
import { BRAND } from '../../brand';
import { Icon, type IconName } from '../../ui/icons';
import './survey.css';

type Opt = { id: string; title: string; sub?: string; icon: IconName };
type Step = { id: keyof SurveyAnswers; q: string; why: string; hint?: string; kind: 'one' | 'many' | 'text' | 'zones'; options?: Opt[]; optionsFor?: (a: SurveyAnswers) => Opt[]; moreFor?: (a: SurveyAnswers) => Opt[]; placeholder?: string; show?: (a: SurveyAnswers) => boolean; site?: boolean; numeric?: boolean; valid?: (v: string) => boolean };

const STORE_ICON: Record<string, IconName> = { pallets: 'pallet', items: 'box', shelves: 'grid', long: 'layers', equipment: 'hardhat', custom: 'sparkle' };
const PLACE_ICON: Record<Place, IconName> = {
  racks: 'layers',
  shelves: 'grid',
  cabinets: 'archive',
  tires: 'target',
  long: 'list',
  wall: 'settings',
  hanging: 'link',
  rooms: 'building',
  cages: 'lock',
  floor: 'map',
  mezzanine: 'stack',
  yard: 'truck',
  sheds: 'building',
  containers: 'box',
  trailers: 'truck',
  vehicles: 'truck',
  cold: 'sparkle',
  basement: 'building',
  offsite: 'pin',
  carts: 'move',
};
const placeOpt = (p: Place): Opt => ({ id: p, title: PLACE_NAME[p], sub: PLACE_SUB[p], icon: PLACE_ICON[p] });
const PRINTER_ICON: Record<string, IconName> = { handheld: 'labels', other: 'question', office: 'print' };
const ZONE_OPTS: { id: ZoneCount; title: string }[] = [
  { id: 'one', title: '1' },
  { id: 'few', title: '2 to 5' },
  { id: 'several', title: '6 to 20' },
  { id: 'many', title: '20+' },
];

const STEPS: Step[] = [
  { id: 'store', q: 'What are you storing?', why: 'This sets the words the app uses and turns on only the features you need.', hint: 'Pick the closest. You can change it later.', kind: 'one', options: PRESETS.map((p) => ({ id: p.id, title: p.title, sub: p.examples, icon: STORE_ICON[p.id] })) },
  { id: 'word', q: 'What do you call one of the things you store?', why: 'The app uses this word on every button, screen and label. A moving company might say “crate”, a school “kit”, a parts shop “bin”. If you pick “Tote”, the app says “Receive a tote” and “Find a tote”.', hint: 'One word, like Unit, Tote, Crate or Kit.', kind: 'text', placeholder: 'Unit, tote, crate, kit…', show: (a) => a.store === 'custom' },
  {
    id: 'count',
    q: 'About how many do you have on hand?',
    why: 'This tells us whether to type things in or import them from a spreadsheet, and what scanner you need.',
    kind: 'one',
    options: [
      { id: 'under100', title: 'Under 100', icon: 'box' },
      { id: 'to1000', title: '100 to 1,000', icon: 'stack' },
      { id: 'to10000', title: '1,000 to 10,000', icon: 'layers' },
      { id: 'over10000', title: 'More than 10,000', icon: 'building' },
    ],
  },
  { id: 'places', q: 'Where are you storing things?', why: 'We need to know this to create your storage zones.', hint: 'Pick all that fit.', kind: 'many', optionsFor: (a) => placesFor(a.store).main.map(placeOpt), moreFor: (a) => placesFor(a.store).more.map(placeOpt) },
  { id: 'zones', q: 'How many areas of each?', why: 'Each area becomes its own storage zone with a letter, like A or B, so people know which part of the building to walk to.', hint: 'A guess is fine.', kind: 'zones', show: (a) => a.places.length > 0 },
  {
    id: 'perSpot',
    q: 'How many things go in one spot?',
    why: 'This decides whether each thing gets its own spot, or several things share one labeled box, bin or pallet.',
    kind: 'one',
    options: [
      { id: 'one', title: 'One thing per spot', sub: 'Tip: best for specialty parts you likely don’t have more than one of, or large things like furniture and machines.', icon: 'pin' },
      { id: 'many', title: 'Many things in one spot', sub: 'Tip: best for groups. One barcode goes on the box or bin, and you list what’s inside.', icon: 'stack' },
      { id: 'mix', title: 'A mix of both', sub: 'Some things alone, some grouped in boxes or bins.', icon: 'grid' },
    ],
  },
  {
    id: 'people',
    q: 'How many people will scan things?',
    why: 'This decides how many crew accounts to plan for, and whether phones are enough.',
    kind: 'one',
    options: [
      { id: 'solo', title: 'Just me', icon: 'user' },
      { id: 'small', title: '2 to 5', icon: 'people' },
      { id: 'medium', title: '6 to 20', icon: 'people' },
      { id: 'large', title: 'More than 20', icon: 'building' },
    ],
  },
  {
    id: 'group',
    q: 'Do you set things aside for someone?',
    why: 'If you do, the app can group things by who or what they are for. If not, we hide it.',
    hint: 'Like a customer’s order, a project or an event.',
    kind: 'one',
    options: [
      { id: 'none', title: 'No', sub: 'Keep it simple', icon: 'x' },
      { id: 'customer', title: 'For customers', icon: 'user' },
      { id: 'order', title: 'For orders', icon: 'checklist' },
      { id: 'project', title: 'For projects or jobs', icon: 'hardhat' },
      { id: 'event', title: 'For events', icon: 'calendar' },
      { id: 'other', title: 'Something else', icon: 'sparkle' },
    ],
  },
  { id: 'groupWord', q: 'What do you call the thing you set items aside for?', why: 'The app groups your things under this word. A caterer might say “event”, a builder “build”, a rental shop “rental”. You’d see screens like “Items for this rental”.', hint: 'One word, like Rental, Build or Delivery.', kind: 'text', placeholder: 'Build, rental, delivery…', show: (a) => a.group === 'other' },
  {
    id: 'hasPrinter',
    q: 'Do you already have a printer for labels?',
    why: 'Every thing and every spot gets a printed QR label. We’ll check your printer or suggest one.',
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
    q: 'How will you scan?',
    why: 'Phones work on day one. We’ll tell you if a scanner would save time.',
    kind: 'one',
    options: [
      { id: 'phone', title: 'Phone camera', icon: 'phone' },
      { id: 'scanner', title: 'A handheld scanner', icon: 'scanner' },
      { id: 'unsure', title: 'Not sure yet', icon: 'question' },
    ],
  },
  {
    id: 'files',
    q: 'Do you want photos and paperwork saved online?',
    why: 'Online saving keeps photos, delivery papers and records in the cloud. Paper-only is cheaper: you print what you need and nothing extra is stored.',
    kind: 'one',
    site: true,
    options: [
      { id: 'cloud', title: 'Yes, save them online', sub: 'Photos and documents on every record', icon: 'cloud' },
      { id: 'paper', title: 'No, paper is fine', sub: 'Print records; costs less', icon: 'print' },
    ],
  },
  {
    id: 'limits',
    q: 'Do you need to watch weight or space limits?',
    why: 'If yes, we turn on weight and size tracking, and Move warns before a spot is overloaded.',
    kind: 'one',
    options: [
      { id: 'no', title: 'No', icon: 'x' },
      { id: 'yes', title: 'Yes', icon: 'target' },
    ],
  },
  { id: 'zip', q: 'What’s your zip code?', why: 'We use it to check whether a Wherehouse tech can come set everything up for you in person.', kind: 'text', placeholder: '29403', site: true, numeric: true, valid: (v) => /^\d{5}$/.test(v.trim()) },
];

const CURATE = ['Finding your plan', 'Planning your storage zones', 'Checking your printer', 'Picking your labels', 'Writing your next steps'];
const VERDICT: Record<string, { label: string; tone: string; icon: IconName }> = {
  works: { label: 'Works', tone: 'ok', icon: 'checkCircle' },
  maybe: { label: 'Check the model', tone: 'warn', icon: 'alertCircle' },
  no: { label: 'Not a fit', tone: 'bad', icon: 'x' },
  none: { label: 'Recommendation', tone: 'info', icon: 'print' },
};

export function SetupSurvey({ mode, onClose, onApplied }: { mode: 'site' | 'portal'; onClose: () => void; onApplied?: (rec: Recommendation) => void }) {
  const [a, setA] = useState<SurveyAnswers>(BLANK_ANSWERS);
  const [i, setI] = useState(-1); // -1 intro, STEPS.length curating/results
  const [dir, setDir] = useState<'fwd' | 'back'>('fwd');
  const [phase, setPhase] = useState<'ask' | 'curate' | 'result'>('ask');
  const timer = useRef<number | undefined>(undefined);
  const visible = (x: SurveyAnswers) => STEPS.filter((s) => (!s.site || mode === 'site') && (!s.show || s.show(x)));
  const steps = visible(a);
  const step = i >= 0 ? steps[i] : null;
  const rec = useMemo(() => recommend(a), [a]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

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
    if (phase !== 'ask') return setPhase('ask');
    setI(Math.max(-1, i - 1));
  };
  const pick = (s: Step, id: string) => {
    if (s.kind === 'many') {
      const cur = a.places as string[];
      return setA({ ...a, places: (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]) as SurveyAnswers['places'] });
    }
    const answers = { ...a, [s.id]: id } as SurveyAnswers;
    setA(answers);
    // The printer answer shows its verdict first; everything else moves on by itself.
    if (s.id !== 'printer') timer.current = window.setTimeout(() => next(answers), 320);
  };
  const answered = (s: Step) => (s.kind === 'many' ? a.places.length > 0 : s.kind === 'zones' ? a.places.every((p) => a.zones[p]) : s.kind === 'text' ? (s.valid ? s.valid(String(a[s.id])) : String(a[s.id]).trim().length > 0) : a[s.id] !== null);
  const progress = phase === 'ask' ? Math.max(0, i) / steps.length : 1;

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
        <button type="button" className="survey-close" aria-label="Close the survey" onClick={onClose}>
          <Icon name="x" />
        </button>
      </header>
      <main className="survey-stage">
        {phase === 'curate' ? (
          <Curating />
        ) : phase === 'result' ? (
          <Results rec={rec} mode={mode} onBack={back} onClose={onClose} onApplied={onApplied} answers={a} />
        ) : !step ? (
          <Card k="intro" dir={dir}>
            <p className="survey-eyebrow">{mode === 'site' ? 'Find your plan' : 'Setting up your warehouse'} · about 2 minutes</p>
            <h1 className="survey-q">{mode === 'site' ? 'Let’s find the right plan for your warehouse.' : 'Let’s put your warehouse in Wherehouse.'}</h1>
            <p className="survey-hint">Answer a few quick questions about what you store, where you keep it and what equipment you have. {mode === 'site' ? 'We’ll recommend a plan, your storage zones, labels and printer, and show you how to get set up.' : 'We’ll recommend your storage zones, labels, printer and words.'}</p>
            <ul className="survey-intro-list">
              <li><span className="survey-bubble"><Icon name="box" /></span>What you store</li>
              <li><span className="survey-bubble"><Icon name="locations" /></span>Where you keep it</li>
              <li><span className="survey-bubble"><Icon name="print" /></span>Your printer and scanner</li>
            </ul>
            <button type="button" className="survey-go" onClick={() => next()} autoFocus>
              Start <Icon name="arrowRight" />
            </button>
          </Card>
        ) : (
          <Card k={step.id} dir={dir}>
            <p className="survey-eyebrow">
              {mode === 'site' ? 'Find your plan' : 'Setting up your warehouse'} · Question {i + 1} of {steps.length}
            </p>
            <p className="survey-why">
              <Icon name="info" /> {step.why}
            </p>
            <h1 className="survey-q">{step.q}</h1>
            {step.hint && <p className="survey-hint">{step.hint}</p>}
            {step.kind === 'text' ? (
              <form
                className="survey-text"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (answered(step)) next();
                }}
              >
                <input className="input big" autoFocus maxLength={step.numeric ? 5 : 24} inputMode={step.numeric ? 'numeric' : undefined} autoComplete={step.numeric ? 'postal-code' : 'off'} aria-label={step.q} placeholder={step.placeholder} value={String(a[step.id])} onChange={(e) => setA({ ...a, [step.id]: step.numeric ? e.target.value.replace(/\D/g, '') : e.target.value })} />
              </form>
            ) : step.kind === 'zones' ? (
              <div className="survey-zones">
                {a.places.map((p, n) => (
                  <div key={p} className="survey-zone" style={{ ['--n' as string]: n }} role="radiogroup" aria-label={`${PLACE_NAME[p]}: how many areas`}>
                    <span className="survey-zone-name">
                      <span className="survey-bubble">
                        <Icon name={PLACE_ICON[p]} />
                      </span>
                      {PLACE_NAME[p]}
                    </span>
                    <span className="survey-zone-opts">
                      {ZONE_OPTS.map((z) => (
                        <button key={z.id} type="button" role="radio" aria-checked={a.zones[p] === z.id} aria-label={`${PLACE_NAME[p]}: ${z.title}`} className={`survey-chip${a.zones[p] === z.id ? ' on' : ''}`} onClick={() => setA({ ...a, zones: { ...a.zones, [p]: z.id } })}>
                          {z.title}
                        </button>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <OptionGrid
                key={step.id}
                step={step}
                main={step.optionsFor ? step.optionsFor(a) : step.options!}
                more={step.moreFor?.(a) ?? []}
                isOn={(id) => (step.kind === 'many' ? (a.places as string[]).includes(id) : a[step.id] === id)}
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

/** Big icon bubbles; less common options wait behind "Show more" unless one is already picked. */
function OptionGrid({ step, main, more, isOn, onPick }: { step: Step; main: Opt[]; more: Opt[]; isOn: (id: string) => boolean; onPick: (id: string) => void }) {
  const [open, setOpen] = useState(() => more.some((o) => isOn(o.id)));
  const shown = open ? [...main, ...more] : main;
  const one = (o: Opt, n: number) => {
    const on = isOn(o.id);
    return (
      <button key={o.id} type="button" role={step.kind === 'many' ? 'checkbox' : 'radio'} aria-checked={on} className={`survey-opt${on ? ' on' : ''}`} style={{ ['--n' as string]: n }} onClick={() => onPick(o.id)}>
        <span className="survey-bubble">
          <Icon name={o.icon} />
        </span>
        <span>
          <strong>{o.title}</strong>
          {o.sub && <small>{o.sub}</small>}
        </span>
        {on && <Icon name="check" />}
      </button>
    );
  };
  return (
    <>
      <div className={`survey-opts${shown.length > 4 ? ' many' : ''}`} role={step.kind === 'many' ? 'group' : 'radiogroup'} aria-label={step.q}>
        {main.map(one)}
        {open && more.map((o, n) => one(o, n))}
      </div>
      {more.length > 0 && (
        <button type="button" className="survey-more" aria-expanded={open} onClick={() => setOpen(!open)}>
          <Icon name={open ? 'chevronDown' : 'plus'} /> {open ? 'Show fewer' : `Show ${more.length} more storage options`}
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
      <h1 className="survey-q">Curating your warehouse…</h1>
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

function Results({ rec, mode, answers, onBack, onClose, onApplied }: { rec: Recommendation; mode: 'site' | 'portal'; answers: SurveyAnswers; onBack: () => void; onClose: () => void; onApplied?: (rec: Recommendation) => void }) {
  const v = VERDICT[rec.printer.verdict];
  const s = rec.setup;
  return (
    <section className="survey-card survey-results enter-fwd" data-testid="survey-results">
      <p className="survey-eyebrow">Your recommendation</p>
      <h1 className="survey-q">{mode === 'site' ? 'Here’s your plan.' : 'Here’s your starting setup.'}</h1>
      {mode === 'site' && <PlanChoice answers={answers} />}
      {mode === 'site' && <h2 className="survey-sub">Your setup details</h2>}
      <div className="survey-grid">
        <Tile n={0} icon="text" title="Your words">
          <p>
            The app will say <b>{s.thing}</b> and <b>{s.things}</b>.
          </p>
          <p>{s.jobs_on ? `${s.things} can be set aside for ${s.jobs.toLowerCase()}.` : 'Grouping is off, so there’s less on screen.'}</p>
        </Tile>
        <Tile n={1} icon={v.icon} title="Printer" tone={v.tone}>
          <p>
            <b>{rec.printer.verdict === 'none' ? rec.printer.title : `${rec.printer.title}: ${v.label.toLowerCase()}`}</b>
          </p>
          <p>{rec.printer.body}</p>
        </Tile>
        <Tile n={2} icon="labels" title="Labels">
          <ul>{rec.labels.map((l) => <li key={l}>{l}</li>)}</ul>
        </Tile>
        <Tile n={3} icon="scanner" title={rec.scanner.title}>
          <p>{rec.scanner.body}</p>
        </Tile>
        <Tile n={4} icon="locations" title="Your spots">
          <ul>{rec.spots.map((l) => <li key={l}>{l}</li>)}</ul>
        </Tile>
        <Tile n={5} icon="checklist" title="Next steps">
          <ol>{rec.steps.map((l) => <li key={l}>{l}</li>)}</ol>
        </Tile>
      </div>
      <div className="survey-disclaimer" style={{ ['--n' as string]: 6 }}>
        <Icon name="info" />
        <p>
          <b>This is a starting point, not a finished setup.</b> You still need to create your own zones and spots, print and hang labels, load what you have and add your crew. The setup checklist walks you through it, and you can change any of this later in Warehouse settings.
        </p>
      </div>
      {mode === 'site' ? <SiteActions onBack={onBack} answers={answers} /> : <PortalActions rec={rec} onBack={onBack} onClose={onClose} onApplied={onApplied} />}
    </section>
  );
}

function SiteActions({ answers, onBack }: { answers: SurveyAnswers; onBack: () => void }) {
  return (
    <div className="survey-nav">
      <button type="button" className="survey-back" onClick={onBack}>
        <Icon name="chevronLeft" /> Change answers
      </button>
      <a className="survey-ghost" href={mailto('Question about Wherehouse', answers)}>
        <Icon name="mail" /> More questions? Contact us
      </a>
    </div>
  );
}

/** A prefilled email to John with the survey answers, so a question or setup request needs no retyping. */
function mailto(subject: string, a: SurveyAnswers, extra = '') {
  const pick = recommendPlan(a);
  const lines = [
    extra,
    'My survey answers:',
    `- Storing: ${PRESETS.find((p) => p.id === a.store)?.title ?? 'not answered'}${a.word ? ` (${a.word})` : ''}`,
    `- How many: ${a.count ?? 'not answered'}`,
    `- Where: ${a.places.map((p) => `${PLACE_NAME[p]} (${a.zones[p] ?? '?'})`).join(', ') || 'not answered'}`,
    `- People: ${a.people ?? 'not answered'}`,
    `- Printer: ${a.hasPrinter === 'yes' ? (PRINTERS.find((p) => p.id === a.printer)?.title ?? 'yes') : 'none yet'}`,
    `- Files: ${a.files ?? 'not answered'}`,
    `- Zip: ${a.zip || 'not given'}`,
    `- Recommended plan: ${pick.plan.name}`,
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
          {pick.plan.name} <span>${pick.plan.monthly}/month</span>
        </h2>
        <p>{pick.why}</p>
        <ul>
          {pick.plan.features.map((f) => (
            <li key={f}>
              <Icon name="check" /> {f}
            </li>
          ))}
        </ul>
      </article>
      <h2 className="survey-sub">How do you want to get set up?</h2>
      <div className="survey-ways">
        <article className="survey-way recommended" style={{ ['--n' as string]: 1 }} data-testid="way-tech">
          <span className="survey-badge">Recommended</span>
          <span className="survey-bubble">
            <Icon name="hardhat" />
          </span>
          <h3>Have a Wherehouse tech set it up</h3>
          <p className="survey-price">${pick.setupFee} one time</p>
          <p>A tech comes to you, builds your zones and spots, hangs the labels, loads your items and trains your crew. You start on day one with everything working. No free trial with this option.</p>
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
                  Online payment isn’t switched on yet. <a href={mailto('Book a Wherehouse tech setup', answers, `I’d like a tech to set up my warehouse ($${pick.setupFee}).`)}>Send us a setup request</a> and we’ll invoice you and book a day.
                </p>
              )}
            </>
          ) : (
            <>
              <p className="survey-note">
                <Icon name="info" /> On-site setup isn’t available{zip ? ` in ${zip}` : ''} yet. It covers about an hour around Charleston, SC. Contact us and we’ll work something out.
              </p>
              <a className="survey-go" href={mailto('Setup outside the Charleston area', answers, 'I’m outside the on-site area but interested in help setting up.')}>
                <Icon name="mail" /> Contact us
              </a>
            </>
          )}
        </article>
        <article className="survey-way" style={{ ['--n' as string]: 2 }} data-testid="way-diy">
          <span className="survey-badge soft">Free trial available</span>
          <span className="survey-bubble">
            <Icon name="user" />
          </span>
          <h3>Set it up yourself</h3>
          <p className="survey-price">Free for {TRIAL_DAYS} days, then ${pick.plan.monthly}/month</p>
          <p>A step-by-step setup wizard walks you through your zones, spots, labels and items before you start.</p>
          <p className="survey-warn">
            <Icon name="alert" /> Heads up: this can be a difficult process. You’ll create every zone and spot, print and hang every label, and load your items yourself. Plan on a few hours.
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
