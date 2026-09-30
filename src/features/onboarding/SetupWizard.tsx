// "Set up your warehouse": the wizard a new self-serve warehouse must finish or skip before the app unlocks.
// Words, zones, spots, barcodes, what happens when things leave, records, labels, crew. It starts from the
// plan survey's answers when this browser has them, and saves progress to the warehouse after every step.

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useApp } from '../../app/state';
import { useSetup } from '../../app/words';
import { hashString, normalizeCode, uuid } from '../../domain/codes';
import { SetupSurvey } from '../setup/SetupSurvey';
import { loadSavedSurvey, recommend, saveSurvey, surveyZones } from '../../domain/survey';
import { PRESETS, pluralize, type SetupPreset } from '../../domain/terms';
import type { LocationKind, Onboarding, OnboardingZone, Warehouse } from '../../domain/types';
import { CLOUD_ADDON, money } from '../../domain/plans';
import { Icon, type IconName } from '../../ui/icons';
import { Notice, Spinner } from '../../ui/ui';
import { SkipChecklist } from '../setup/SkipChecklist';
import { buildCodes } from '../admin/RackBuilder';
import { LabelSheet } from '../labels/LabelSheet';
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
export const SETUP_ROUTES = ['import', 'products', 'labels', 'locations', 'location', 'people', 'help', 'settings', 'guide', 'about'];

// Which step is open, shared by the sidebar and the wizard.
let openStep = WIZARD_STEPS[0].id;
const listeners = new Set<() => void>();
export function showStep(id: string) {
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
const LETTERS = 'ABCDEFGHJKLMNPRSTUVWXYZ';
const KIND_LABEL: Partial<Record<LocationKind, string>> = { RACK: 'Racks or shelves', FLOOR: 'Floor, lanes or yard', STAGING: 'Staging area', RECEIVING: 'Receiving area' };

/** Zones the survey implies: two areas of tires become zones A and B, and so on. */
function zonesFromSurvey(): OnboardingZone[] {
  const s = loadSavedSurvey();
  return s ? surveyZones(s) : [];
}

export function useOnboarding(): { wh: Warehouse | null; ob: Onboarding | null } {
  const { backend, workspaceId } = useApp();
  const wh = Object.values(backend.db.warehouses).find((w) => w.workspace_id === workspaceId && w.active) ?? null;
  return { wh, ob: wh?.onboarding ?? null };
}

/** The wizard's steps, listed under "Setup checklist" in the sidebar while the checklist is open. */
export function SetupNav({ here }: { here: boolean }) {
  const { ob } = useOnboarding();
  const { go } = useApp();
  const open = useOpenStep();
  if (!ob || ob.state === 'done') return null;
  const done = new Set(ob.done);
  return (
    <div className="setup-nav" data-testid="setup-nav">
      {WIZARD_STEPS.map((s, n) => (
        <button key={s.id} className={`nav-item${done.has(s.id) ? ' done' : ''}`} aria-current={here && open === s.id ? 'step' : undefined} onClick={() => (showStep(s.id), go('checklist'))}>
          <span className="setup-nav-dot">{done.has(s.id) ? <Icon name="check" /> : n + 1}</span>
          {s.title}
        </button>
      ))}
    </div>
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
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const seeded = useRef(false);

  // First visit: open the first unfinished step and bring in the plan survey's zones.
  useEffect(() => {
    if (seeded.current || !saved) return;
    seeded.current = true;
    const next = WIZARD_STEPS.find((s) => !saved.done.includes(s.id));
    if (next) showStep(next.id);
  }, [saved]);

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
  const allDone = WIZARD_STEPS.every((s) => ob.done.includes(s.id));
  const step = open === 'finish' || !WIZARD_STEPS.some((s) => s.id === open) ? 'finish' : open;
  const idx = WIZARD_STEPS.findIndex((s) => s.id === step);
  const props = { ob, save, busy, wh };

  return (
    <div className="wizard" data-testid="setup-wizard" data-keep-words>
      <header className="wizard-head">
        <p className="eyebrow">Set up your warehouse{idx >= 0 ? ` · Step ${idx + 1} of ${WIZARD_STEPS.length}` : ''}</p>
        <div className="wizard-bar" aria-hidden="true">
          <i style={{ transform: `scaleX(${ob.done.filter((d) => WIZARD_STEPS.some((s) => s.id === d)).length / WIZARD_STEPS.length})` }} />
        </div>
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
          {ob.state === 'pending' && <SkipChecklist busy={busy} onSkip={() => void save({ state: 'skipped' }).then((ok) => ok && go('overview'))} />}
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
      {rec && survey?.layout && Object.keys(survey.layout).length > 0 && (
        <p className="wizard-note" data-testid="setup-numbers">
          So far: {rec.numbers.zones} zones, about {rec.numbers.spots.toLocaleString('en-US')} spots and {(rec.numbers.spots + rec.numbers.unitLabels).toLocaleString('en-US')} labels. The app says “{rec.setup.thing}”.
        </p>
      )}
      <div className="row">
        <button type="button" className="btn primary big" onClick={() => setAsking(true)} data-testid="setup-survey-open">
          <Icon name="sparkle" /> {survey?.layout && Object.keys(survey.layout).length ? 'Review the setup questions' : 'Answer the setup questions'}
        </button>
      </div>
      {asking && <SetupSurvey mode="portal" onClose={() => setAsking(false)} onApplied={() => void save({}, 'words')} />}
      <details className="wizard-manual">
        <summary>Or just set the words by hand</summary>
        <div className="wizard-choices" role="radiogroup" aria-label="What are you storing?">
          {PRESETS.map((p) => (
            <Choice key={p.id} on={preset === p.id} icon={STORE_ICON[p.id]} title={p.title} sub={p.examples} onClick={() => (setPreset(p.id), p.id !== 'custom' && setW({ ...p.setup }))} />
          ))}
        </div>
        <div className="grid-2">
          <label className="field">
            <span className="label">One is called</span>
            <input className="input" value={w.thing} maxLength={24} onChange={(e) => setW({ ...w, thing: e.target.value, things: pluralize(e.target.value) })} />
          </label>
          <label className="field">
            <span className="label">More than one</span>
            <input className="input" value={w.things} maxLength={24} onChange={(e) => setW({ ...w, things: e.target.value })} />
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

function ZonesStep({ ob, busy, save }: StepProps) {
  const [zones, setZones] = useState<OnboardingZone[]>(() => (ob.zones.length ? ob.zones : zonesFromSurvey().length ? zonesFromSurvey() : [{ letter: 'A', name: 'Main racks', kind: 'RACK' }]));
  const fromSurvey = !ob.zones.length && zonesFromSurvey().length > 0;
  const set = (i: number, z: Partial<OnboardingZone>) => setZones(zones.map((x, k) => (k === i ? { ...x, ...z } : x)));
  const nextLetter = () => LETTERS.split('').find((l) => !zones.some((z) => z.letter === l)) ?? 'Z';
  const dupes = new Set(zones.map((z) => z.letter)).size !== zones.length;
  return (
    <>
      <StepHead icon="map" title="Create your storage zones" why="A zone is one part of the building, like a rack row, a shelf room or the yard. Each gets a letter, and every spot code starts with it, so people know where to walk.">
        {fromSurvey && <p className="wizard-note">We started these from your plan survey.</p>}
      </StepHead>
      <div className="zone-map" aria-label="Your zones" data-testid="zone-map">
        {zones.map((z, i) => (
          <div key={i} className={`zone-tile kind-${z.kind.toLowerCase()}`} style={{ ['--n' as string]: i }}>
            <b>{z.letter}</b>
            <span>{z.name || 'Unnamed'}</span>
          </div>
        ))}
      </div>
      <div className="zone-rows">
        {zones.map((z, i) => (
          <div key={i} className="zone-row">
            <input className="input mono zone-letter" aria-label={`Zone ${i + 1} letter`} value={z.letter} maxLength={3} onChange={(e) => set(i, { letter: e.target.value.toUpperCase().replace(/[^A-Z]/g, '') })} />
            <input className="input" aria-label={`Zone ${i + 1} name`} value={z.name} maxLength={40} placeholder="Name, like Back racks" onChange={(e) => set(i, { name: e.target.value })} />
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
        ))}
        <button type="button" className="btn" disabled={zones.length >= 26} onClick={() => setZones([...zones, { letter: nextLetter(), name: '', kind: 'RACK' }])}>
          <Icon name="plus" /> Add a zone
        </button>
      </div>
      <CodeDiagram />
      {dupes && <Notice tone="error">Give each zone its own letter.</Notice>}
      <Continue busy={busy} disabled={dupes || zones.some((z) => !z.letter || !z.name.trim())} onClick={() => void save({ zones: zones.map((z) => ({ ...z, name: z.name.trim() })) }, 'zones')} />
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
  const ready = ob.zones.every((z) => spotsIn(backend, wh?.id, z.letter).length > 0);
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
      <StepHead icon="locations" title="Build the spots in each zone" why="A spot is one exact place a pallet can sit: a shelf, a rack level or a floor lane. Each spot gets its own QR label, and scanning it tells the app where a pallet is." />
      <RackPicture />
      <div className="zone-builds">
        {ob.zones.map((z) => (
          <ZoneBuild key={z.letter} zone={z} />
        ))}
      </div>
      <Continue busy={busy} disabled={!ready} onClick={() => void save({}, 'spots')} label={ready ? 'Save and continue' : 'Build every zone to continue'} />
    </>
  );
}

function ZoneBuild({ zone }: { zone: OnboardingZone }) {
  const { send, backend, workspaceId } = useApp();
  const wh = Object.values(backend.db.warehouses).find((w) => w.workspace_id === workspaceId && w.active);
  const rack = zone.kind === 'RACK';
  const [aisles, setAisles] = useState('1');
  const [bays, setBays] = useState(rack ? '5' : '10');
  const [levels, setLevels] = useState(rack ? '3' : '1');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const have = spotsIn(backend, wh?.id, zone.letter);
  const n = (s: string, max: number) => Math.min(max, Math.max(1, Math.floor(Number(s)) || 1));
  const codes = rack ? buildCodes(zone.letter, 1, n(aisles, 30), n(bays, 60), n(levels, 12)) : Array.from({ length: n(bays, 200) }, (_, i) => `${zone.letter}-${String(i + 1).padStart(2, '0')}`);
  const existing = new Set(have.map((l) => normalizeCode(l.code)));
  const fresh = codes.filter((c) => !existing.has(c)).slice(0, 600);
  const build = async () => {
    if (!wh) return;
    setBusy(true);
    setErr('');
    for (let i = 0; i < fresh.length; i += 80) {
      const rows = fresh.slice(i, i + 80).map((c) => ({ warehouse_code: wh.code, location_code: c, kind: zone.kind }));
      const o = await send('import_batch', { import_kind: 'locations', checksum: hashString(JSON.stringify(rows)), rows, name: `Setup: zone ${zone.letter}` }, null, { commandId: uuid() });
      if (!(o.status === 'result' && o.result.ok)) {
        setErr(o.status === 'result' && !o.result.ok ? o.result.message : 'Could not create the spots. Try again.');
        break;
      }
    }
    setBusy(false);
  };
  return (
    <article className={`zone-build${have.length ? ' built' : ''}`} data-testid={`zone-build-${zone.letter}`}>
      <header>
        <span className="zone-chip">{zone.letter}</span>
        <strong>{zone.name}</strong>
        {have.length > 0 && (
          <span className="tag ok">
            <Icon name="check" /> {have.length} spot{have.length === 1 ? '' : 's'}
          </span>
        )}
      </header>
      <div className="zone-build-fields">
        {rack && (
          <label className="field">
            <span className="label">Aisles or rows</span>
            <input className="input" inputMode="numeric" value={aisles} onChange={(e) => setAisles(e.target.value)} />
          </label>
        )}
        <label className="field">
          <span className="label">{rack ? 'Bays or sections per aisle' : 'Spots or lanes'}</span>
          <input className="input" inputMode="numeric" value={bays} onChange={(e) => setBays(e.target.value)} />
        </label>
        {rack && (
          <label className="field">
            <span className="label">Levels or shelves</span>
            <input className="input" inputMode="numeric" value={levels} onChange={(e) => setLevels(e.target.value)} />
          </label>
        )}
      </div>
      <p className="mono zone-preview">
        {codes.slice(0, 4).join('  ')}
        {codes.length > 4 ? `  …  ${codes[codes.length - 1]}` : ''}
      </p>
      {err && <Notice tone="error">{err}</Notice>}
      <button className="btn" disabled={busy || !fresh.length || backend.network === 'offline'} onClick={() => void build()}>
        {busy ? <Spinner /> : <Icon name="plus" />} {fresh.length ? `Create ${fresh.length} spot${fresh.length === 1 ? '' : 's'}` : 'All built'}
      </button>
    </article>
  );
}

/** Where the labels go on a rack. */
function RackPicture() {
  return (
    <figure className="rack-picture">
      <svg viewBox="0 0 320 170" role="img" aria-label="A rack with two levels. Each spot's label sits on the beam just below it.">
        <rect x="20" y="10" width="10" height="150" rx="2" className="rp-post" />
        <rect x="290" y="10" width="10" height="150" rx="2" className="rp-post" />
        <rect x="155" y="10" width="10" height="150" rx="2" className="rp-post" />
        <rect x="20" y="78" width="280" height="8" className="rp-beam" />
        <rect x="20" y="150" width="280" height="8" className="rp-beam" />
        <rect x="42" y="38" width="100" height="40" rx="3" className="rp-load" />
        <rect x="178" y="110" width="100" height="40" rx="3" className="rp-load" />
        {[
          [70, 80, 'A-01-01-2'],
          [206, 80, 'A-01-02-2'],
          [70, 152, 'A-01-01-1'],
          [206, 152, 'A-01-02-1'],
        ].map(([x, y, t]) => (
          <g key={t as string} className="rp-label">
            <rect x={x as number} y={(y as number) - 12} width="46" height="18" rx="2" />
            <text x={(x as number) + 23} y={(y as number) + 1} textAnchor="middle">
              {t}
            </text>
          </g>
        ))}
      </svg>
      <figcaption>Stick each spot’s label on the beam or shelf edge just below the spot, where a phone can reach it.</figcaption>
    </figure>
  );
}

function BarcodesStep({ ob, busy, save }: StepProps) {
  const { go } = useApp();
  const [pick, setPick] = useState(ob.barcodes);
  return (
    <>
      <StepHead icon="barcode" title="Do your pallets already have barcodes?" why="If they do, the app can use them. If not, it prints its own QR labels. You can load barcodes and item types now or as new stock comes in." />
      <div className="wizard-choices" role="radiogroup">
        <Choice on={pick === 'import'} icon="upload" title="Yes, and I have a list" sub="Import a supplier or inventory spreadsheet with barcodes." onClick={() => setPick('import')} />
        <Choice on={pick === 'scan'} icon="scanner" title="Yes, we’ll scan them as they arrive" sub="Each barcode is learned the first time you receive it." onClick={() => setPick('scan')} />
        <Choice on={pick === 'print'} icon="print" title="No, we’ll print our own labels" sub="Every pallet gets a Wherehouse QR label when it’s received." onClick={() => setPick('print')} />
      </div>
      {pick === 'import' && (
        <div className="wizard-tip">
          <Icon name="upload" />
          <div>
            <strong>Load your list</strong>
            <p>Open Import, drop in your spreadsheet, and match its columns. Then come back here.</p>
            <button className="btn small" onClick={() => go('import')}>
              Open Import
            </button>
          </div>
        </div>
      )}
      <div className="wizard-tip">
        <Icon name="settings" />
        <div>
          <strong>Item types (optional)</strong>
          <p>Give each product its barcode, size, weight and a home spot, so Move suggests where it goes.</p>
          <button className="btn small" onClick={() => go('products')}>
            Set up item types
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
      <Continue busy={busy} disabled={!pick} onClick={() => void save({ files: pick }, 'files')} />
    </>
  );
}

function LabelsStep({ busy, save, wh }: StepProps) {
  const { backend } = useApp();
  const [printing, setPrinting] = useState(false);
  const [printed, setPrinted] = useState(false);
  const ids = Object.values(backend.db.locations)
    .filter((l) => l.warehouse_id === wh?.id && l.active)
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((l) => l.id);
  if (printing) return <LabelSheet locationIds={ids} onClose={() => (setPrinting(false), setPrinted(true))} />;
  return (
    <>
      <StepHead icon="print" title="Print and hang your spot labels" why="Every spot needs its label before anyone can scan pallets into it. Small Avery 5160 sheets work well for shelves; 4×6 labels suit pallet racks." />
      <RackPicture />
      <div className="row">
        <button className="btn primary big" disabled={!ids.length} onClick={() => setPrinting(true)}>
          <Icon name="print" /> Print all {ids.length} spot labels
        </button>
      </div>
      <Continue busy={busy} disabled={!ids.length} onClick={() => void save({}, 'labels')} label={printed ? 'They’re up. Continue' : 'I’ve printed and hung them'} />
    </>
  );
}

function CrewStep({ busy, save }: StepProps) {
  const { go } = useApp();
  return (
    <>
      <StepHead icon="people" title="Add your crew" why="Each person signs in with their own email, so every move shows who made it. You can skip this and add people later." />
      <div className="row">
        <button className="btn" onClick={() => go('people')}>
          <Icon name="people" /> Add people
        </button>
      </div>
      <Continue busy={busy} onClick={() => void save({}, 'crew')} label="Done, or skip for now" />
    </>
  );
}
