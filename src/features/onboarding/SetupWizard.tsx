// "Set up your warehouse": the wizard a new self-serve warehouse must finish or skip before the app unlocks.
// Words, zones, spots, barcodes, what happens when things leave, records, labels, crew. It starts from the
// plan survey's answers when this browser has them, and saves progress to the warehouse after every step.
// Each step is a browser history entry, so Back and Forward move between steps and keep what was typed.

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useApp } from '../../app/state';
import { useSetup } from '../../app/words';
import { sessionRead, sessionWrite, useHistoryStep } from '../../app/stepHistory';
import { normalizeCode, uuid } from '../../domain/codes';
import { SetupSurvey } from '../setup/SetupSurvey';
import { builderDefaults, loadSavedSurvey, plannedSpotsByZone, recommend, saveSurvey, surveyZones, zoneLetter } from '../../domain/survey';
import { PRESETS, pluralize, type SetupPreset } from '../../domain/terms';
import type { LocationKind, Onboarding, OnboardingZone, Warehouse } from '../../domain/types';
import { CLOUD_ADDON, money } from '../../domain/plans';
import { Icon, type IconName } from '../../ui/icons';
import { Notice, Spinner } from '../../ui/ui';
import { SkipChecklist } from '../setup/SkipChecklist';
import { PrintFlow } from '../labels/PrintFlow';
import { MAX_NEW_SPOTS, createSpots, pad2, zoneCodes } from './spots';
import { SetupOnComputer, usePhoneScreen } from './SetupOnComputer';
import './onboarding.css';

export const WIZARD_STEPS: { id: string; title: string; icon: IconName; optional?: boolean }[] = [
  { id: 'words', title: 'Your inventory and space', icon: 'box' },
  { id: 'zones', title: 'Storage zones', icon: 'map' },
  { id: 'spots', title: 'Spots in each zone', icon: 'locations' },
  { id: 'barcodes', title: 'Barcodes', icon: 'barcode' },
  { id: 'leave', title: 'When pallets leave', icon: 'truck' },
  { id: 'files', title: 'Records and files', icon: 'cloud' },
  { id: 'labels', title: 'Print spot labels', icon: 'print' },
  { id: 'crew', title: 'Add your crew', icon: 'people', optional: true },
];

/** Routes a manager can open while setup is unfinished: the tools the wizard sends them to. */
export const SETUP_ROUTES = ['import', 'products', 'labels', 'locations', 'location', 'people', 'help', 'settings', 'guide', 'about', 'setup'];

// Which step is open, shared by the step list and the wizard.
let openStep = WIZARD_STEPS[0].id;
/**
 * The warehouse whose wizard already opened at its first unfinished step. Kept outside the component, so
 * coming back from Import or Products, or picking a step in the step list, keeps the step instead of
 * jumping back to the first unfinished one when the wizard mounts again.
 */
let seededFor = '';
const listeners = new Set<() => void>();
export function showStep(id: string) {
  if (openStep === id) return;
  openStep = id;
  listeners.forEach((l) => l());
}
function useOpenStep() {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => openStep,
  );
}

const BLANK: Onboarding = { state: 'pending', done: [], zones: [], leave: null, files: null, barcodes: null };
const KIND_LABEL: Partial<Record<LocationKind, string>> = { RACK: 'Racks or shelves', FLOOR: 'Floor, lanes or yard', STAGING: 'Staging area', RECEIVING: 'Receiving area' };
const KIND_HINT: Partial<Record<LocationKind, string>> = {
  RACK: 'Spots get an aisle, bay and level, like A-01-03-2.',
  FLOOR: 'Spots are numbered lanes or floor squares, like B-07.',
  STAGING: 'Where orders wait before they ship.',
  RECEIVING: 'Where deliveries land before put-away.',
};
const NAME_EXAMPLES = ['Back racks', 'Shelf room', 'Yard', 'Mezzanine', 'Cold room', 'Tire racks'];

/** Zones the survey implies: two areas of tires become zones A and B, and so on. Names start blank. */
function zonesFromSurvey(): (OnboardingZone & { from: string })[] {
  const s = loadSavedSurvey();
  return s ? surveyZones(s) : [];
}

export function useOnboarding(): { wh: Warehouse | null; ob: Onboarding | null } {
  const { backend, workspaceId } = useApp();
  const wh = Object.values(backend.db.warehouses).find((w) => w.workspace_id === workspaceId && w.active) ?? null;
  return { wh, ob: wh?.onboarding ?? null };
}

/** The wizard's steps, as a row of numbered steps at the top of the wizard. */
function WizardSteps({ ob, step }: { ob: Onboarding; step: string }) {
  const done = new Set(ob.done);
  return (
    <nav className="wizard-steps" aria-label="Setup steps" data-testid="setup-nav">
      <ol>
        {WIZARD_STEPS.map((s, n) => (
          <li key={s.id}>
            <button type="button" className={`wizard-step-btn${done.has(s.id) ? ' done' : ''}`} aria-current={step === s.id ? 'step' : undefined} onClick={() => showStep(s.id)}>
              <span className="setup-nav-dot">{done.has(s.id) ? <Icon name="check" /> : n + 1}</span>
              <span className="wizard-step-name">{s.title}</span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** What the crew sees until a manager finishes setup. */
export function SetupPending() {
  return (
    <div className="wizard-pending panel stack" data-testid="setup-pending">
      <Icon name="hardhat" />
      <h1>Your warehouse is being set up.</h1>
      <p>A manager is still creating the zones, spots and labels. You can start scanning as soon as they finish.</p>
    </div>
  );
}

export function SetupWizard() {
  const { send, backend, go } = useApp();
  const { wh, ob: saved } = useOnboarding();
  const ob = saved ?? BLANK;
  const open = useOpenStep();
  const phone = usePhoneScreen();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [finishing, setFinishing] = useState(false);

  const step = open === 'finish' || !WIZARD_STEPS.some((s) => s.id === open) ? 'finish' : open;
  // Each step is its own browser history entry: Back returns to the step before, with its answers.
  const hist = useHistoryStep('wizard', phone ? null : step, (s) => showStep(s));

  // First visit: open the first unfinished step (unless Back or a refresh brought a step with it). Runs after
  // the history step has been read, which waits for the router's own history entry.
  useEffect(() => {
    if (!saved || !wh || seededFor === wh.id) return;
    seededFor = wh.id;
    queueMicrotask(() => {
      if (hist.arrived()) return;
      const next = WIZARD_STEPS.find((s) => !saved.done.includes(s.id));
      // Opening on the first unfinished step replaces this entry; Back still leaves setup.
      if (next && next.id !== openStep) {
        hist.reset();
        showStep(next.id);
      }
    });
  }, [saved, wh, hist]);

  const save = async (patch: Partial<Onboarding>, stepDone?: string): Promise<boolean> => {
    setBusy(true);
    setError('');
    const next: Onboarding = { ...ob, ...patch, done: stepDone ? [...new Set([...ob.done, stepDone])] : ob.done };
    const o = await send('set_onboarding', { ...next }, null, { commandId: uuid() });
    setBusy(false);
    if (o.status === 'result' && o.result.ok) {
      if (stepDone) {
        const after = WIZARD_STEPS.find((s) => !next.done.includes(s.id) && s.id !== stepDone);
        showStep(after ? after.id : 'finish');
      }
      return true;
    }
    setError(o.status === 'result' && !o.result.ok ? o.result.message : o.status === 'offline' ? o.message : 'No answer from the server. Try again.');
    return false;
  };
  const skip = () => void save({ state: 'skipped' }).then((ok) => ok && go('overview'));
  if (phone) return <SetupOnComputer locked={ob.state === 'pending'} busy={busy} onSkip={skip} />;

  const allDone = WIZARD_STEPS.every((s) => ob.done.includes(s.id));
  const idx = WIZARD_STEPS.findIndex((s) => s.id === step);
  const props = { ob, save, busy, wh };

  return (
    // The warehouse's own words apply here as everywhere else ("Do your items already have barcodes?");
    // only the word chooser and the zone names people typed are kept as written.
    <div className="wizard" data-testid="setup-wizard">
      <header className="wizard-head">
        <p className="eyebrow">Set up your warehouse{idx >= 0 ? ` · Step ${idx + 1} of ${WIZARD_STEPS.length}` : ''}</p>
        <div className="wizard-bar" aria-hidden="true">
          <i style={{ transform: `scaleX(${ob.done.filter((d) => WIZARD_STEPS.some((s) => s.id === d)).length / WIZARD_STEPS.length})` }} />
        </div>
        <WizardSteps ob={ob} step={step} />
        <div className="wizard-lock-row">
          {ob.state === 'pending' ? (
            <p className="wizard-lock">
              <Icon name="lock" /> The rest of the app unlocks when these steps are done, or when you skip them.
            </p>
          ) : (
            <p className="wizard-lock">
              <Icon name="unlock" /> {ob.state === 'skipped' ? 'You skipped the checklist, so the app is open. Pick up any step whenever you like.' : 'Every step is done.'}
            </p>
          )}
          {ob.state === 'pending' && <SkipChecklist busy={busy} onSkip={skip} />}
        </div>
      </header>
      {error && <Notice tone="error">{error}</Notice>}
      {backend.network === 'offline' && <Notice tone="warn">Setup needs a connection. Reconnect to keep going.</Notice>}
      <section key={step} className="wizard-card">
        {step === 'words' && <WordsStep {...props} />}
        {step === 'zones' && <ZonesStep {...props} />}
        {step === 'spots' && <SpotsStep {...props} />}
        {step === 'barcodes' && <BarcodesStep {...props} />}
        {step === 'leave' && <LeaveStep {...props} />}
        {step === 'files' && <FilesStep {...props} />}
        {step === 'labels' && <LabelsStep {...props} />}
        {step === 'crew' && <CrewStep {...props} />}
        {step === 'finish' &&
          (allDone ? (
            <div className={`wizard-finish${finishing ? ' go' : ''}`} data-testid="wizard-finish">
              <div className="wizard-burst" aria-hidden="true">
                {Array.from({ length: 14 }, (_, n) => (
                  <i key={n} style={{ ['--n' as string]: n }} />
                ))}
              </div>
              <span className="wizard-bubble big">
                <Icon name="checkCircle" />
              </span>
              <h1>Your warehouse is ready.</h1>
              <p>Zones, spots and labels are set. Receive your first {useWordsLower()}, move it into a spot, and your crew can find it from any phone.</p>
              <button
                className="btn primary big"
                disabled={busy}
                onClick={() => {
                  setFinishing(true);
                  void save({ state: 'done' }).then((ok) => ok && (saveSurvey(null), go('overview')));
                }}
              >
                {busy ? <Spinner /> : <Icon name="rocket" />} Open my warehouse
              </button>
            </div>
          ) : (
            <div className="stack">
              <h1>A few steps left</h1>
              <p>{ob.state === 'pending' ? 'Finish every step in the list to unlock the app, or skip the checklist for now.' : 'Finish every step in the list to tick off setup.'}</p>
              <button className="btn primary" onClick={() => showStep(WIZARD_STEPS.find((s) => !ob.done.includes(s.id))!.id)}>
                Go to the next step
              </button>
            </div>
          ))}
      </section>
    </div>
  );
}

function useWordsLower() {
  return useSetup().thing.toLowerCase();
}

type StepProps = { ob: Onboarding; save: (patch: Partial<Onboarding>, stepDone?: string) => Promise<boolean>; busy: boolean; wh: Warehouse | null };

function StepHead({ icon, title, why, children }: { icon: IconName; title: string; why: string; children?: ReactNode }) {
  return (
    <div className="wizard-step-head">
      <span className="wizard-bubble">
        <Icon name={icon} />
      </span>
      <div>
        <h1>{title}</h1>
        <p className="wizard-why">
          <Icon name="info" /> {why}
        </p>
        {children}
      </div>
    </div>
  );
}

/** A short hint under a field or a step: what it means, with an example. */
function Hint({ children, icon = 'info', testid }: { children: ReactNode; icon?: IconName; testid?: string }) {
  return (
    <p className="wz-hint" data-testid={testid}>
      <Icon name={icon} />
      <span>{children}</span>
    </p>
  );
}

function Choice({ on, icon, title, sub, onClick, testid }: { on: boolean; icon: IconName; title: string; sub?: string; onClick: () => void; testid?: string }) {
  return (
    <button type="button" role="radio" aria-checked={on} className={`wizard-choice${on ? ' on' : ''}`} onClick={onClick} data-testid={testid}>
      <span className="wizard-bubble">
        <Icon name={icon} />
      </span>
      <span>
        <strong>{title}</strong>
        {sub && <small>{sub}</small>}
      </span>
      {on && <Icon name="check" />}
    </button>
  );
}

function Continue({ busy, disabled, onClick, label = 'Save and continue' }: { busy: boolean; disabled?: boolean; onClick: () => void; label?: string }) {
  return (
    <div className="wizard-nav">
      <button className="btn primary big" disabled={busy || disabled} onClick={onClick}>
        {busy ? <Spinner /> : <Icon name="check" />} {label}
      </button>
    </div>
  );
}

const STORE_ICON: Record<string, IconName> = { pallets: 'pallet', items: 'box', shelves: 'grid', long: 'layers', equipment: 'hardhat', custom: 'sparkle' };

function WordsStep({ busy, save }: StepProps) {
  const { send } = useApp();
  const current = useSetup();
  const survey = useMemo(() => loadSavedSurvey(), []);
  const start = survey && current.preset === null ? recommend(survey).setup : current;
  const [preset, setPreset] = useState<SetupPreset | null>((start.preset as SetupPreset) ?? null);
  const [w, setW] = useState({ thing: start.thing, things: start.things, job: start.job, jobs: start.jobs, jobs_on: start.jobs_on });
  const [err, setErr] = useState('');
  const go = async () => {
    const o = await send('set_setup', { preset, ...w, ...(survey?.limits.includes('weight') ? { advanced: true } : {}) }, null, { commandId: uuid() });
    if (!(o.status === 'result' && o.result.ok)) return setErr(o.status === 'result' && !o.result.ok ? o.result.message : 'Could not save. Try again.');
    await save({}, 'words');
  };
  const [asking, setAsking] = useState(false);
  const rec = survey?.groups.length ? recommend(survey) : null;
  return (
    <>
      <StepHead icon="box" title="Your inventory and space" why="A few minutes of questions about where each kind of inventory goes, how much you have, what limits your spots, and your printer and scanner. The answers set your words and build your storage zones in the next step.">
        {survey?.profile && <p className="wizard-note">We filled in what you told us in the plan survey. Now it gets into your real space.</p>}
      </StepHead>
      <Hint>Have a rough count of your racks, shelves and floor areas in mind. Guesses are fine; you can change every answer later.</Hint>
      {rec && survey?.layout && Object.keys(survey.layout).length > 0 && (
        <p className="wizard-note" data-testid="setup-numbers">
          So far: {rec.numbers.zones} zone{rec.numbers.zones === 1 ? '' : 's'}, about {rec.numbers.spots.toLocaleString('en-US')} spot{rec.numbers.spots === 1 ? '' : 's'} and {(rec.numbers.spots + rec.numbers.unitLabels).toLocaleString('en-US')} labels. The app says “{rec.setup.thing}”.
        </p>
      )}
      <div className="row">
        <button type="button" className="btn primary big" onClick={() => setAsking(true)} data-testid="setup-survey-open">
          <Icon name="sparkle" /> {survey?.layout && Object.keys(survey.layout).length ? 'Review the setup questions' : 'Answer the setup questions'}
        </button>
      </div>
      {asking && <SetupSurvey mode="portal" onClose={() => setAsking(false)} onApplied={() => void save({}, 'words')} onSkip={() => (setAsking(false), void go())} />}
      <details className="wizard-manual" data-keep-words>
        <summary>Or just set the words by hand</summary>
        <Hint>Pick what you store. The app uses its words on every button and screen, like “Receive a pallet” or “Find an item”.</Hint>
        <div className="wizard-choices" role="radiogroup" aria-label="What are you storing?">
          {PRESETS.map((p) => (
            <Choice key={p.id} on={preset === p.id} icon={STORE_ICON[p.id]} title={p.title} sub={p.examples} onClick={() => (setPreset(p.id), p.id !== 'custom' && setW({ ...p.setup }))} />
          ))}
        </div>
        <div className="grid-2">
          <label className="field">
            <span className="label">One is called</span>
            <input className="input" value={w.thing} maxLength={24} placeholder="Pallet, Item, Tote" onChange={(e) => setW({ ...w, thing: e.target.value, things: pluralize(e.target.value) })} />
            <span className="hint">The word for one unit you store, like Pallet, Item or Tote.</span>
          </label>
          <label className="field">
            <span className="label">More than one</span>
            <input className="input" value={w.things} maxLength={24} placeholder="Pallets, Items, Totes" onChange={(e) => setW({ ...w, things: e.target.value })} />
            <span className="hint">Filled in for you. Fix it if the plural is unusual.</span>
          </label>
        </div>
        <label className="toggle">
          <input type="checkbox" checked={w.jobs_on} onChange={(e) => setW({ ...w, jobs_on: e.target.checked })} />
          <span>Reserve {w.things.toLowerCase() || 'inventory'} for customers, orders, projects or events (called “{w.jobs}”)</span>
        </label>
        {err && <Notice tone="error">{err}</Notice>}
        <Continue busy={busy} disabled={!preset || !w.thing.trim() || !w.things.trim()} onClick={() => void go()} />
      </details>
    </>
  );
}

type DraftZone = OnboardingZone & { from?: string };

function ZonesStep({ ob, busy, save, wh }: StepProps) {
  const draftKey = `pl.wz.zones.${wh?.id ?? ''}`;
  const survey = useMemo(() => zonesFromSurvey(), []);
  const [zones, setZonesState] = useState<DraftZone[]>(() => {
    const draft = sessionRead<DraftZone[]>(draftKey);
    if (draft?.length) return draft;
    if (ob.zones.length) return ob.zones;
    return survey.length ? survey : [{ letter: 'A', name: '', kind: 'RACK' }];
  });
  // Kept for this browser session, so Back, Forward or a refresh never loses what was typed.
  const setZones = (next: DraftZone[]) => {
    setZonesState(next);
    sessionWrite(draftKey, next);
  };
  const fromSurvey = !ob.zones.length && survey.length > 0;
  const set = (i: number, z: Partial<DraftZone>) => setZones(zones.map((x, k) => (k === i ? { ...x, ...z } : x)));
  const nextLetter = () => {
    for (let n = 0; ; n++) if (!zones.some((z) => z.letter === zoneLetter(n))) return zoneLetter(n);
  };
  const dupes = new Set(zones.map((z) => z.letter)).size !== zones.length;
  const unnamed = zones.filter((z) => !z.name.trim()).length;
  const submit = () =>
    void save({ zones: zones.map(({ letter, name, kind }) => ({ letter, name: name.trim(), kind })) }, 'zones').then((ok) => ok && sessionWrite(draftKey, null));
  return (
    <>
      <StepHead icon="map" title="Create your storage zones" why="A zone is one part of the building, like a rack row, a shelf room or the yard. Each gets a letter, and every spot code starts with it, so people know where to walk.">
        {fromSurvey && <p className="wizard-note">We added one zone for each storage area in your plan survey. Give each one a name your crew uses.</p>}
      </StepHead>
      <div className="wz-hints">
        <Hint>Most warehouses have 2 to 6 zones. For example: A for the pallet racks, B for the shelf room, C for the yard.</Hint>
        <Hint icon="locations">Spots come next. A zone of racks gets spots like A-01-03-2; a floor zone gets spots like C-07.</Hint>
      </div>
      <div className="zone-map" aria-label="Your zones" data-testid="zone-map" data-keep-words>
        {zones.map((z, i) => (
          <div key={i} className={`zone-tile kind-${z.kind.toLowerCase()}`} style={{ ['--n' as string]: i }}>
            <b>{z.letter}</b>
            <span>{z.name || 'Needs a name'}</span>
          </div>
        ))}
      </div>
      <div className="zone-rows">
        <div className="zone-row zone-row-head" aria-hidden="true">
          <span>Letter</span>
          <span>Name</span>
          <span>What is there</span>
          <span />
        </div>
        {zones.map((z, i) => (
          <div key={i} className="zone-row-wrap">
            <div className="zone-row">
              <input className="input mono zone-letter" aria-label={`Zone ${i + 1} letter`} value={z.letter} maxLength={3} onChange={(e) => set(i, { letter: e.target.value.toUpperCase().replace(/[^A-Z]/g, '') })} />
              <input className="input" aria-label={`Zone ${i + 1} name`} value={z.name} maxLength={40} placeholder={`Name, like ${NAME_EXAMPLES[i % NAME_EXAMPLES.length]}`} onChange={(e) => set(i, { name: e.target.value })} />
              <select className="select" aria-label={`Zone ${i + 1} kind`} value={z.kind} onChange={(e) => set(i, { kind: e.target.value as LocationKind })}>
                {Object.entries(KIND_LABEL).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
              <button type="button" className="btn ghost small" aria-label={`Remove zone ${z.letter}`} disabled={zones.length === 1} onClick={() => setZones(zones.filter((_, k) => k !== i))}>
                <Icon name="trash" />
              </button>
            </div>
            <p className="zone-row-hint" data-keep-words>
              {z.from ? <>For: {z.from} (from your plan survey). </> : null}
              {KIND_HINT[z.kind]}
            </p>
          </div>
        ))}
        <button type="button" className="btn" onClick={() => setZones([...zones, { letter: nextLetter(), name: '', kind: 'RACK' }])}>
          <Icon name="plus" /> Add a zone
        </button>
      </div>
      <CodeDiagram />
      {dupes && <Notice tone="error">Give each zone its own letter.</Notice>}
      {!dupes && unnamed > 0 && <p className="wz-need">Name {unnamed === 1 ? 'the zone' : `all ${unnamed} zones`} to continue.</p>}
      <Continue busy={busy} disabled={dupes || zones.some((z) => !z.letter || !z.name.trim())} onClick={submit} />
    </>
  );
}

/** How a spot code reads, part by part. */
function CodeDiagram() {
  const parts = [
    ['A', 'Zone'],
    ['01', 'Aisle'],
    ['03', 'Bay or section'],
    ['2', 'Level or shelf'],
  ];
  return (
    <div className="code-diagram" aria-label="A spot code like A-01-03-2 means zone A, aisle 1, bay 3, level 2.">
      {parts.map(([code, label], i) => (
        <span key={label} style={{ ['--n' as string]: i }}>
          <b>{code}</b>
          <small>{label}</small>
        </span>
      ))}
    </div>
  );
}

function spotsIn(backend: ReturnType<typeof useApp>['backend'], whId: string | undefined, letter: string) {
  return Object.values(backend.db.locations).filter((l) => l.warehouse_id === whId && l.active && normalizeCode(l.code).startsWith(`${letter}-`));
}

function SpotsStep({ ob, busy, save, wh }: StepProps) {
  const { backend } = useApp();
  // Count every spot already in the warehouse, not only the first page the live directory loads.
  const [counting, setCounting] = useState(true);
  useEffect(() => {
    let live = true;
    void backend
      .loadAllLocations()
      .catch(() => {})
      .finally(() => live && setCounting(false));
    return () => {
      live = false;
    };
  }, [backend]);
  // What the survey planned for each zone, so the builder starts at the count the survey suggested.
  const planned = useMemo(() => {
    const survey = loadSavedSurvey();
    return survey ? plannedSpotsByZone(survey) : {};
  }, []);
  const ready = !counting && ob.zones.every((z) => spotsIn(backend, wh?.id, z.letter).length > 0);
  if (!ob.zones.length)
    return (
      <>
        <StepHead icon="locations" title="Build the spots in each zone" why="Create your zones first." />
        <button className="btn primary" onClick={() => showStep('zones')}>
          Go to zones
        </button>
      </>
    );
  return (
    <>
      <StepHead icon="locations" title="Build the spots in each zone" why="A spot is one exact place a pallet can sit: a shelf, a rack level or a floor lane. Each spot gets its own label, and scanning it tells the app where a pallet is." />
      <RackDiagram />
      <div className="wz-hints">
        <Hint>Count one zone at a time. Walk the zone, count the rows of racks (aisles), the sections along one row (bays), and the shelf heights (levels).</Hint>
        <Hint icon="plus">Building more later is fine. Raise a number and press Create again; spots that already exist are kept as they are.</Hint>
      </div>
      {counting && (
        <p className="muted" role="status" data-testid="spots-counting">
          <Spinner /> Counting the spots already in this warehouse…
        </p>
      )}
      <div className="zone-builds">
        {ob.zones.map((z) => (
          <ZoneBuild key={z.letter} zone={z} planned={planned[z.letter]} counting={counting} />
        ))}
      </div>
      <Continue busy={busy} disabled={!ready} onClick={() => void save({}, 'spots')} label={ready || counting ? 'Save and continue' : 'Build every zone to continue'} />
    </>
  );
}

function ZoneBuild({ zone, planned, counting }: { zone: OnboardingZone; planned?: number; counting: boolean }) {
  const { send, backend, workspaceId } = useApp();
  const wh = Object.values(backend.db.warehouses).find((w) => w.workspace_id === workspaceId && w.active);
  const rack = zone.kind === 'RACK';
  const key = `pl.wz.build.${wh?.id ?? ''}.${zone.letter}`;
  const start = sessionRead<{ aisles: string; bays: string; levels: string }>(key) ?? (() => {
    const d = planned ? builderDefaults(zone.kind, planned) : rack ? { aisles: 1, bays: 5, levels: 3 } : { aisles: 1, bays: 10, levels: 1 };
    return { aisles: String(d.aisles), bays: String(d.bays), levels: String(d.levels) };
  })();
  const [form, setFormState] = useState(start);
  const setForm = (patch: Partial<typeof form>) => {
    const next = { ...form, ...patch };
    setFormState(next);
    sessionWrite(key, next);
  };
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const have = spotsIn(backend, wh?.id, zone.letter);
  const n = (s: string, max: number) => Math.min(max, Math.max(1, Math.floor(Number(s)) || 1));
  const a = n(form.aisles, 30);
  const b = n(form.bays, rack ? 60 : 500);
  const l = n(form.levels, 12);
  const codes = zoneCodes(zone.letter, rack, a, b, l);
  const existing = new Set(have.map((x) => normalizeCode(x.code)));
  const missing = codes.filter((c) => !existing.has(c));
  const fresh = missing.slice(0, MAX_NEW_SPOTS);
  const build = async () => {
    if (!wh) return;
    setBusy(true);
    setErr('');
    setNote('');
    setProgress(0);
    const r = await createSpots(send, wh.code, fresh, zone.kind, `Setup: zone ${zone.letter}`, setProgress);
    // Read the warehouse's spots again, so the count shows what the server really holds.
    await backend.loadAllLocations().catch(() => {});
    setBusy(false);
    if (r.error) return setErr(r.error);
    setNote(`${r.made.toLocaleString('en-US')} spot${r.made === 1 ? '' : 's'} created.`);
  };
  const total = codes.length;
  return (
    <article className={`zone-build${have.length ? ' built' : ''}`} data-testid={`zone-build-${zone.letter}`}>
      <header>
        <span className="zone-chip">{zone.letter}</span>
        <strong data-keep-words>{zone.name}</strong>
        {!have.length && planned ? <span className="tag">About {planned.toLocaleString('en-US')} spots planned</span> : null}
        {have.length > 0 && (
          <span className="tag ok" data-testid={`zone-count-${zone.letter}`}>
            <Icon name="check" /> {have.length.toLocaleString('en-US')} spot{have.length === 1 ? '' : 's'}
          </span>
        )}
      </header>
      <div className="zone-build-fields">
        {rack && (
          <label className="field">
            <span className="label">Aisles</span>
            <input className="input" inputMode="numeric" aria-label="Aisles or rows" value={form.aisles} onChange={(e) => setForm({ aisles: e.target.value })} />
            <span className="hint">Rows of racks you walk between. Up to 30.</span>
          </label>
        )}
        <label className="field">
          <span className="label">{rack ? 'Bays per aisle' : 'Spots or lanes'}</span>
          <input className="input" inputMode="numeric" aria-label={rack ? 'Bays or sections per aisle' : 'Spots or lanes'} value={form.bays} onChange={(e) => setForm({ bays: e.target.value })} />
          <span className="hint">{rack ? 'Sections between two uprights, counted along one aisle.' : 'Numbered floor squares or lanes in this zone.'}</span>
        </label>
        {rack && (
          <label className="field">
            <span className="label">Levels</span>
            <input className="input" inputMode="numeric" aria-label="Levels or shelves" value={form.levels} onChange={(e) => setForm({ levels: e.target.value })} />
            <span className="hint">Shelf or beam heights, floor is 1. Up to 12.</span>
          </label>
        )}
      </div>
      <p className="zone-math" data-testid={`zone-math-${zone.letter}`}>
        {rack ? `${a} aisle${a === 1 ? '' : 's'} x ${b} bay${b === 1 ? '' : 's'} x ${l} level${l === 1 ? '' : 's'} = ${total.toLocaleString('en-US')} spots` : `${total.toLocaleString('en-US')} spots`}
        {have.length > 0 && !counting ? `. ${(total - missing.length).toLocaleString('en-US')} already exist, ${missing.length.toLocaleString('en-US')} new.` : '.'}
      </p>
      <p className="mono zone-preview">
        {codes.slice(0, 4).join('  ')}
        {codes.length > 4 ? `  …  ${codes[codes.length - 1]}` : ''}
      </p>
      {missing.length > MAX_NEW_SPOTS && <p className="wz-need">This makes the first {MAX_NEW_SPOTS.toLocaleString('en-US')} new spots. Press Create again for the rest.</p>}
      {err && (
        <Notice tone="error" title="Spots were not created">
          <span data-testid={`zone-error-${zone.letter}`}>{err}</span>
        </Notice>
      )}
      {note && !err && (
        <p className="wz-ok" role="status">
          <Icon name="checkCircle" /> {note}
        </p>
      )}
      <button className="btn" disabled={busy || counting || !fresh.length || backend.network === 'offline'} onClick={() => void build()} data-testid={`zone-create-${zone.letter}`}>
        {busy ? <Spinner /> : <Icon name="plus" />}{' '}
        {busy ? `Creating spots: ${progress.toLocaleString('en-US')} of ${fresh.length.toLocaleString('en-US')}` : counting ? 'Counting spots…' : fresh.length ? `Create ${fresh.length.toLocaleString('en-US')} spot${fresh.length === 1 ? '' : 's'}` : 'All built'}
      </button>
    </article>
  );
}

/** Aisle, bay and level on a rack, with the spot code each position gets. */
function RackDiagram() {
  const bays = [0, 1, 2];
  const levels = [0, 1, 2];
  const x0 = 46;
  const bw = 92;
  const lh = 46;
  const top = 26;
  return (
    <figure className="rack-diagram" data-testid="rack-diagram">
      <svg viewBox="0 0 380 220" role="img" aria-label="One aisle of racks seen from the front: bays are the sections between uprights, levels are the beam heights. Bay 2, level 3 of aisle 1 in zone A is spot A-01-02-3.">
        {bays.map((b) =>
          levels.map((l) => {
            const x = x0 + b * bw;
            const y = top + (2 - l) * lh;
            const hot = b === 1 && l === 2;
            return (
              <g key={`${b}-${l}`}>
                <rect x={x + 8} y={y + 8} width={bw - 16} height={lh - 14} rx="3" className={hot ? 'rd-load hot' : 'rd-load'} />
                <text x={x + bw / 2} y={y + lh - 12} textAnchor="middle" className={hot ? 'rd-code hot' : 'rd-code'}>
                  A-01-{pad2(b + 1)}-{l + 1}
                </text>
              </g>
            );
          }),
        )}
        {[0, 1, 2, 3].map((p) => (
          <rect key={p} x={x0 + p * bw - 3} y={top - 4} width="6" height={lh * 3 + 8} className="rd-post" />
        ))}
        {levels.map((l) => (
          <rect key={l} x={x0} y={top + (3 - l) * lh - 4} width={bw * 3} height="5" className="rd-beam" />
        ))}
        {levels.map((l) => (
          <text key={l} x={x0 - 10} y={top + (2 - l) * lh + 28} textAnchor="end" className="rd-axis">
            Level {l + 1}
          </text>
        ))}
        {bays.map((b) => (
          <text key={b} x={x0 + b * bw + bw / 2} y={top + lh * 3 + 22} textAnchor="middle" className="rd-axis">
            Bay {pad2(b + 1)}
          </text>
        ))}
        <text x={x0 + (bw * 3) / 2} y={top + lh * 3 + 44} textAnchor="middle" className="rd-title">
          Aisle 01, zone A, seen from the front
        </text>
      </svg>
      <figcaption>
        <b>Aisle</b>: one row of racks. <b>Bay</b>: one section between two uprights. <b>Level</b>: one beam or shelf height, counting up from the floor. This aisle has 3 bays x 3 levels = 9 spots.
      </figcaption>
    </figure>
  );
}
function BarcodesStep({ ob, busy, save }: StepProps) {
  const { go } = useApp();
  const [pick, setPick] = useState(ob.barcodes);
  // The answer is saved as soon as it is picked, so it is still there after a trip to Import or Products.
  // Leaving for one of them waits for that save, so the answer is stored before the step closes.
  const saving = useRef<Promise<unknown>>(Promise.resolve());
  const choose = (next: Onboarding['barcodes']) => {
    setPick(next);
    if (next !== ob.barcodes) saving.current = save({ barcodes: next });
  };
  const leaveFor = (route: 'import' | 'products') => void saving.current.then(() => go(route));
  // A save still on its way when the step opened again shows up once it lands.
  useEffect(() => {
    if (ob.barcodes) setPick(ob.barcodes);
  }, [ob.barcodes]);
  return (
    <>
      <StepHead icon="barcode" title="Do your pallets already have barcodes?" why="If they do, the app can use them. If not, it prints its own QR labels. You can load barcodes and products now or as new stock comes in." />
      <Hint>Look at a few boxes or pallets from your suppliers. A barcode with numbers under it (UPC, EAN or a part number) can be scanned as is.</Hint>
      <div className="wizard-choices" role="radiogroup">
        <Choice on={pick === 'import'} icon="upload" title="Yes, and I have a list" sub="Import a supplier or inventory spreadsheet with barcodes." onClick={() => choose('import')} />
        <Choice on={pick === 'scan'} icon="scanner" title="Yes, we’ll scan them as they arrive" sub="Each barcode is learned the first time you receive it." onClick={() => choose('scan')} />
        <Choice on={pick === 'print'} icon="print" title="No, we’ll print our own labels" sub="Every pallet gets a Wherehouse QR label when it’s received." onClick={() => choose('print')} />
      </div>
      {pick === 'import' && (
        <div className="wizard-tip">
          <Icon name="upload" />
          <div>
            <strong>Load your list</strong>
            <p>Open Import, drop in your spreadsheet, and match its columns. Then come back here.</p>
            <button className="btn small" onClick={() => leaveFor('import')}>
              Open Import
            </button>
          </div>
        </div>
      )}
      <div className="wizard-tip">
        <Icon name="settings" />
        <div>
          <strong>Products (optional)</strong>
          <p>Give each product its barcode, size, weight and a home spot, so Move suggests where it goes.</p>
          <button className="btn small" onClick={() => leaveFor('products')}>
            Set up products
          </button>
        </div>
      </div>
      <Continue busy={busy} disabled={!pick} onClick={() => void save({ barcodes: pick }, 'barcodes')} />
    </>
  );
}

function LeaveStep({ ob, busy, save }: StepProps) {
  const [pick, setPick] = useState(ob.leave);
  const thing = useSetup().thing;
  return (
    <>
      <StepHead icon="truck" title="When a pallet leaves, what happens to its record?" why="Inventory gets sold, shipped, used up or thrown out. Pick how you want to handle it; you can do either one any time." />
      <div className="wizard-choices" role="radiogroup">
        <Choice on={pick === 'dispatch'} icon="truck" title="Mark it sent out and keep its history" sub="Recommended. You can still look up where it went and who sent it." onClick={() => setPick('dispatch')} testid="leave-dispatch" />
        <Choice on={pick === 'retire'} icon="archive" title="Take it off the list" sub="Retire the record. It stays in the history, but not in your counts or searches." onClick={() => setPick('retire')} />
      </div>
      {pick && (
        <div className="leave-demo" aria-hidden="true">
          <div className="leave-card">
            <b>{thing} P-000042</b>
            <span>At A-01-03-2</span>
          </div>
          <Icon name="arrowRight" />
          <div className={`leave-card ${pick}`}>
            <b>{thing} P-000042</b>
            <span>{pick === 'dispatch' ? 'Sent out to Maple St. · history kept' : 'Retired · off the list'}</span>
          </div>
        </div>
      )}
      <Hint>Most teams keep the history. It answers questions like “Where did that pallet go last month?” and costs nothing extra.</Hint>
      <Continue busy={busy} disabled={!pick} onClick={() => void save({ leave: pick }, 'leave')} />
    </>
  );
}

function FilesStep({ ob, busy, save }: StepProps) {
  const survey = useMemo(() => loadSavedSurvey(), []);
  const [pick, setPick] = useState(ob.files ?? survey?.files ?? null);
  return (
    <>
      <StepHead icon="cloud" title="How do you want to keep records?" why="Photos of damage, delivery papers and signed receipts can live online with each record, or on paper only." />
      <div className="wizard-choices" role="radiogroup">
        <Choice on={pick === 'cloud'} icon="cloud" title="Save photos and paperwork online" sub={`Cloud backup of photos and documents on every record. +${money(CLOUD_ADDON.monthly)}/month after the trial.`} onClick={() => setPick('cloud')} />
        <Choice on={pick === 'paper'} icon="print" title="Paper only" sub="Print what you need; nothing extra is stored online. +$0.00, included." onClick={() => setPick('paper')} />
      </div>
      <Hint>Photos help most with damage claims and proof of delivery. You can switch between online and paper later in Settings.</Hint>
      <Continue busy={busy} disabled={!pick} onClick={() => void save({ files: pick }, 'files')} />
    </>
  );
}

function LabelsStep({ busy, save, wh }: StepProps) {
  const { backend } = useApp();
  const [printed, setPrinted] = useState(false);
  const spots = Object.values(backend.db.locations).filter((l) => l.warehouse_id === wh?.id && l.active).length;
  return (
    <>
      <StepHead icon="print" title="Print and hang your spot labels" why="Every spot needs its label before anyone can scan pallets into it. Choose your printer first; the app then shows only the labels that printer can make and lays them out to fit." />
      <div className="wz-hints">
        <Hint icon="grid">
          What to buy: for shelves, Avery 5160 sheets (30 small labels each) or 2 x 1 in thermal labels. For racks and floor spots, 4 x 6 in thermal labels or Avery 5164 sheets (6 per sheet).{' '}
          {spots > 0 ? `You have ${spots.toLocaleString('en-US')} spots: about ${Math.ceil(spots / 30).toLocaleString('en-US')} sheets of 5160 or ${Math.ceil(spots / 6).toLocaleString('en-US')} sheets of 5164.` : ''}
        </Hint>
        <Hint icon="flag">Want a big “SECTION A” sign at the end of each row? Choose Section or aisle sign in step 2, on letter paper or 4 x 6 labels.</Hint>
      </div>
      <PrintFlow styles={['spot', 'shelf', 'poster']} onPrinted={() => setPrinted(true)} />
      <Continue busy={busy} disabled={!spots} onClick={() => void save({}, 'labels')} label={printed ? 'They’re up. Continue' : 'I’ve printed and hung them'} />
    </>
  );
}

function CrewStep({ busy, save }: StepProps) {
  const { go } = useApp();
  return (
    <>
      <StepHead icon="people" title="Add your crew" why="Each person signs in with their own email, so every move shows who made it. You can skip this and add people later." />
      <Hint icon="user">Managers can change setup, people and settings. Operators receive, move and ship. Viewers can only look things up. Up to 10 people are included.</Hint>
      <div className="row">
        <button className="btn" onClick={() => go('people')}>
          <Icon name="people" /> Add people
        </button>
      </div>
      <Continue busy={busy} onClick={() => void save({}, 'crew')} label="Done, or skip for now" />
    </>
  );
}
