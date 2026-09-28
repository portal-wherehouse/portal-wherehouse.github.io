// Home page guided tour: the visitor runs the core loop (receive, label, two scans, confirm,
// find, history) in a private practice warehouse that lives only inside this component.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BRAND } from '../brand';
import { useApp } from '../app/state';
import { useScanRouter, useScanTarget } from '../device/scanRouter';
import { makeLabelPayload } from '../domain/codes';
import type { Location, Pallet } from '../domain/types';
import { Icon, type IconName } from '../ui/icons';
import { LabelFrame, type Callout } from './tryit/LabelFrame';
import { createSandbox, occupancyOf, resolveScan, run, SUGGESTED_RACK, type Sandbox } from './tryit/sandbox';
import {
  ConfirmScreen,
  DeviceFrame,
  FindScreen,
  HistoryScreen,
  ReceiveScreen,
  ScanScreen,
  nowrapCodes,
  type DeviceTab,
  type PretendLabel,
  type ScanMessage,
} from './tryit/screens';
import './tryit.css';

const STEPS: { rail: string; title: string; body: string; tab: DeviceTab; eyebrow: string }[] = [
  {
    rail: 'Receive',
    eyebrow: 'Receive',
    title: 'A delivery arrives',
    body: 'A truck drops off material for a job. Pick the job, say what is on the pallet, and receive it. The pallet gets its own code on the spot.',
    tab: 'receive',
  },
  {
    rail: 'Label',
    eyebrow: 'Receive',
    title: 'It gets a label',
    body: 'Print the label and stick it on the pallet. The big code is for people, the QR code is for scanners, and the job line tells anyone walking by whose material it is.',
    tab: 'receive',
  },
  {
    rail: 'Scan',
    eyebrow: 'Move',
    title: 'Put it on a rack',
    body: 'Drive it to a rack. Scan the pallet, then scan the rack. Two scans and the app knows what moved and where it went. No typing, no clipboard.',
    tab: 'move',
  },
  {
    rail: 'Confirm',
    eyebrow: 'Move',
    title: 'Confirm it',
    body: 'One tap saves the move. Before it saves, the app checks that nobody else changed this pallet in the meantime.',
    tab: 'move',
  },
  {
    rail: 'Find',
    eyebrow: 'Find',
    title: 'Find it later',
    body: 'Weeks later someone asks for the J-214 lighting. Search by job, pallet code, rack or a word from the description. The rack comes first, because that is where you walk.',
    tab: 'find',
  },
  {
    rail: 'History',
    eyebrow: 'Find',
    title: 'Every step is on the record',
    body: 'Every change is kept: what changed, who did it, and when. Nothing is overwritten, so you can always see how a pallet got where it is.',
    tab: 'find',
  },
];

const CALLOUTS: Callout[] = [
  { selector: '.l-code', title: 'The big code', body: 'Printed large so anyone can read it at a glance. If the QR code is ever damaged, type this instead.' },
  { selector: '.l-job', title: 'The job line', body: 'Which job it belongs to and what is on it, so anyone walking past knows whose it is.' },
  {
    selector: '.l-qr',
    title: 'The QR code',
    body: 'What scanners and phone cameras read. It holds a random token, not the job or contents, so it keeps scanning even after the details change.',
  },
];

/** Racks offered as pretend labels in step 3. The first is empty in the practice warehouse. */
const RACK_CHOICES = [SUGGESTED_RACK, 'A-01-02', 'B-02-01'];
const MAX_ROWS = 8;
/** A tap or Enter this soon after a hardware scan is the scanner's own Enter key, not a person. */
const HARDWARE_ECHO_MS = 300;

const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function TryIt() {
  const [round, setRound] = useState(0);
  return <Tour key={round} restarted={round > 0} onRestart={() => setRound((n) => n + 1)} />;
}

function Tour({ restarted, onRestart }: { restarted: boolean; onRestart: () => void }) {
  const { go } = useApp();
  const { settings } = useScanRouter();

  // The practice warehouse: built once per mount. "Start over" remounts this component.
  const sbRef = useRef<Sandbox | null>(null);
  if (!sbRef.current) sbRef.current = createSandbox();
  const sb = sbRef.current;
  const ctx = useMemo(() => sb.engine.context(sb.actor, sb.ws), [sb]);
  const openJobs = useMemo(() => ctx.jobs.filter((j) => j.status === 'OPEN'), [ctx]);

  const [step, setStep] = useState(0);
  const [seen, setSeen] = useState(0);
  const [jobId, setJobId] = useState(() => openJobs.find((j) => j.code === 'J-214')?.id ?? openJobs[0]?.id ?? '');
  const [desc, setDesc] = useState('Lighting fixtures');
  const [busy, setBusy] = useState(false);
  const [receiveError, setReceiveError] = useState<string | null>(null);
  const [pallet, setPallet] = useState<Pallet | null>(null);
  const [scannedPallet, setScannedPallet] = useState<Pallet | null>(null);
  const [rack, setRack] = useState<Location | null>(null);
  const [message, setMessage] = useState<ScanMessage | null>(null);
  const [code, setCode] = useState('');
  const [saved, setSaved] = useState<{ at: string; from: number; to: number } | null>(null);
  const [placeError, setPlaceError] = useState<string | null>(null);
  const [q, setQ] = useState('J-214');
  const [callout, setCallout] = useState(0);
  const [announce, setAnnounce] = useState('');

  const msgCount = useRef(0);
  const lastHardware = useRef(0);
  const timers = useRef<number[]>([]);
  const root = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const focusOnStep = useRef(restarted);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  /** Give a save a beat so the change is visible, unless the visitor prefers no motion. */
  const settle = (fn: () => void) => {
    if (reducedMotion()) return fn();
    setBusy(true);
    timers.current.push(
      window.setTimeout(() => {
        setBusy(false);
        fn();
      }, 420),
    );
  };

  const job = pallet ? sb.engine.db.jobs[pallet.job_id] : null;
  const token = pallet ? (sb.engine.activeLabel(pallet.id)?.token ?? null) : null;

  // ---------------------------------------------------------------- navigation

  const done = [!!pallet, true, !!(scannedPallet && rack) || !!saved, !!saved, true, true];
  const reachable = (i: number) => done.slice(0, i).every(Boolean);
  const goStep = (n: number) => {
    // While a save is settling, stay put so the screen shows its result.
    if (busy || n < 0 || n >= STEPS.length || !reachable(n)) return;
    focusOnStep.current = true;
    setStep(n);
    setSeen((s) => Math.max(s, n));
  };

  useEffect(() => {
    if (!focusOnStep.current) return;
    focusOnStep.current = false;
    heading.current?.focus({ preventScroll: true });
    const el = root.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top;
    if (top < 0 || top > window.innerHeight * 0.6) el.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
  }, [step]);

  // ---------------------------------------------------------------- 1. receive

  const receive = () => {
    if (busy || pallet) return;
    setReceiveError(null);
    const r = run(sb, 'receive', { job_id: jobId, description: desc });
    if (!r.ok) {
      setReceiveError(r.message);
      return;
    }
    const p = r.current_state!;
    settle(() => {
      setPallet(p);
      setAnnounce(`Received. The new pallet code is ${p.code}.`);
    });
  };

  // ---------------------------------------------------------------- 3. scans

  const say = (tone: ScanMessage['tone'], title: string, text: ReactNode, spoken: string) => {
    setMessage({ tone, title, text, n: ++msgCount.current });
    setAnnounce(spoken);
  };

  const scan = (text: string) => {
    if (!pallet) return;
    if (saved) {
      say('info', 'Already placed', 'This pallet is saved. Start over to run the loop again.', 'Already placed.');
      return;
    }
    const r = resolveScan(sb, text);
    if (r.type === 'error') {
      say('warn', 'Not recognized', `${r.message} Tap one of the labels above, or type ${scannedPallet ? SUGGESTED_RACK : pallet.code}.`, r.message);
      return;
    }
    if (r.type === 'pallet') {
      if (r.pallet.id !== pallet.id) {
        say(
          'info',
          'That is a different pallet',
          `That label is ${r.pallet.code} (${r.pallet.description}). For this tour, scan ${pallet.code}, the pallet you just received.`,
          `Different pallet ${r.pallet.code}.`,
        );
        return;
      }
      if (scannedPallet) {
        say(
          'info',
          'Already scanned',
          rack ? `${pallet.code} and ${rack.code} are both in. Review the move to save it.` : `${pallet.code} is already scanned. Now scan the rack you put it on.`,
          'Pallet already scanned.',
        );
        return;
      }
      setScannedPallet(pallet);
      say('ok', 'Pallet scanned', `${pallet.code}, ${pallet.description}. Now scan the rack you put it on.`, `Pallet ${pallet.code} scanned. Now scan the rack.`);
      return;
    }
    const loc = r.location;
    if (!scannedPallet) {
      say(
        'info',
        'Pallet first, then the rack',
        `That is rack ${loc.code}. Scan the pallet label first so ${BRAND.name} knows what is moving, then the rack to say where it went.`,
        `That is rack ${loc.code}. Scan the pallet first.`,
      );
      return;
    }
    if (!loc.active) {
      say('warn', `${loc.code} is not in use`, 'Pick another rack.', `${loc.code} is not in use.`);
      return;
    }
    if (rack && rack.id === loc.id) {
      // Scanning the same rack again confirms the choice, like the portal's "scan again to confirm".
      goStep(3);
      return;
    }
    setRack(loc);
    say('ok', rack ? 'Rack changed' : 'Rack scanned', `${loc.code}. Both scans are in. Review the move to save it.`, `Rack ${loc.code} scanned. Both scans are in.`);
  };

  const fromPerson = () => performance.now() - lastHardware.current > HARDWARE_ECHO_MS;

  // Real scanners that type like a keyboard reach this step through the scan router.
  useScanTarget(
    'home-tour',
    (e) => {
      lastHardware.current = performance.now();
      setCode('');
      scan(e.text);
      return true;
    },
    step === 2,
  );

  const labels: PretendLabel[] = useMemo(() => {
    if (!pallet) return [];
    const out: PretendLabel[] = [
      { kind: 'pallet', code: pallet.code, sub: pallet.description, payload: makeLabelPayload('P', sb.engine.activeLabel(pallet.id)?.token ?? ''), suggested: !scannedPallet },
    ];
    for (const c of RACK_CHOICES) {
      const loc = ctx.locations.find((l) => l.code === c);
      if (!loc) continue;
      const n = occupancyOf(sb, loc.id);
      out.push({
        kind: 'rack',
        code: loc.code,
        sub: n === 0 ? 'Empty' : `${n} pallet${n === 1 ? '' : 's'} here`,
        payload: makeLabelPayload('L', sb.engine.activeLabel(loc.id)?.token ?? ''),
        suggested: !!scannedPallet && !rack && c === SUGGESTED_RACK,
      });
    }
    return out;
  }, [sb, ctx, pallet, scannedPallet, rack]);

  // ---------------------------------------------------------------- 4. confirm

  const confirm = () => {
    if (!pallet || !rack || saved || busy) return;
    setPlaceError(null);
    const current = sb.engine.db.pallets[pallet.id];
    const r = run(sb, 'place', { location_id: rack.id }, current);
    if (!r.ok) {
      setPlaceError(r.message);
      return;
    }
    const next = r.current_state!;
    settle(() => {
      setPallet(next);
      setSaved({ at: r.accepted_at, from: current.version, to: next.version });
      setAnnounce(`Saved. ${next.code} stored at ${rack.code}, version ${next.version}.`);
    });
  };

  const changeRack = () => {
    setRack(null);
    say('info', 'Pick a rack', 'Scan the rack label where the pallet actually is.', 'Scan a rack.');
    goStep(2);
  };

  // ---------------------------------------------------------------- 5 and 6. reads

  const found = useMemo(() => {
    if (!q.trim()) return { rows: [], total: 0 };
    const r = sb.engine.search(sb.actor, sb.ws, { q, limit: MAX_ROWS });
    return { rows: r.items, total: r.total };
    // `saved` changes where the pallet is, so results refresh after the move.
  }, [sb, q, pallet, saved]);

  const waiting = useMemo(() => (step === 0 ? sb.engine.reconciliation(sb.actor, sb.ws).unplaced.reverse() : []), [sb, step, pallet]);
  const events = useMemo(() => (pallet && step === 5 ? sb.engine.history(sb.actor, sb.ws, pallet.id) : []), [sb, pallet, step]);

  // ---------------------------------------------------------------- narrative

  const s = STEPS[step];
  let turn: ReactNode;
  let behind: ReactNode;
  let blocked: string | null = null;
  switch (step) {
    case 0:
      turn = pallet ? `Done. ${pallet.code} is on record. Next, its label.` : 'Pick a job, check what is on the pallet, then tap Receive it.';
      behind = pallet
        ? `One event recorded: Received. ${pallet.code} starts at version 1 with its own label.`
        : 'Nothing is saved until you tap Receive it. Then the pallet gets its code, version 1, and the first line of its history.';
      blocked = pallet ? null : 'Receive the delivery to continue.';
      break;
    case 1:
      turn = 'Tap the numbers on the label to see what each part is for.';
      behind = token
        ? `The QR code holds only a random token (${token.slice(0, 4)}…), never the job or contents. Change the details later and it still scans; the app flags the printed text for a reprint.`
        : 'The QR code holds only a random token, never the job or contents.';
      break;
    case 2:
      turn = saved
        ? 'This move is saved. Carry on to find it.'
        : !scannedPallet
          ? `Tap the ${pallet?.code ?? 'pallet'} label first. Try a rack first if you like: it will steer you.`
          : !rack
            ? `Now tap a rack. ${SUGGESTED_RACK} is empty.`
            : 'Both scans are in. Tap Review the move.';
      behind =
        scannedPallet && rack
          ? 'Both codes were found in this warehouse. Still nothing saved: scans only fill in the form.'
          : 'Each scan is looked up in your warehouse the moment it arrives. Nothing is saved yet: scans only fill in the form.';
      blocked = done[2] ? null : 'Scan the pallet, then a rack, to continue.';
      break;
    case 3:
      turn = saved ? 'Saved. Next, find it again.' : 'Check the move, then tap Confirm.';
      behind = saved
        ? `One event recorded. Version ${saved.from} to ${saved.to}.`
        : `Confirm sends one change that expects version ${pallet?.version ?? 1}. If someone changed ${pallet?.code ?? 'the pallet'} first, you get a clear warning, not a silent overwrite.`;
      blocked = saved ? null : 'Confirm the move to continue.';
      break;
    case 4:
      turn = 'Search J-214, a rack like A-03-02, or a word like lighting.';
      behind =
        'Exact codes rank first, then codes that start with what you typed, then words in descriptions. Locations read “last confirmed”: where the pallet was recorded, never a guess.';
      break;
    default:
      turn = 'Read the record. Every entry says who, when, and what changed.';
      behind = 'History only grows. A mistake is fixed with a new, visible correction, and the original entry stays.';
  }

  // ---------------------------------------------------------------- device screen

  let screen: ReactNode = null;
  if (step === 0) {
    screen = (
      <ReceiveScreen
        jobs={openJobs}
        jobId={jobId}
        onJob={setJobId}
        desc={desc}
        onDesc={(d) => {
          setDesc(d);
          setReceiveError(null);
        }}
        busy={busy}
        error={receiveError}
        onReceive={receive}
        received={pallet && job ? { pallet, job } : null}
        waiting={waiting}
      />
    );
  } else if (step === 1 && pallet && job && token) {
    screen = (
      <div className="stack">
        <div className="tt-head">
          <div className="eyebrow">Labels</div>
          <div className="tt-head-title">Pallet label</div>
          <p className="tt-head-sub">4 × 6 inch label, printed from the portal on a label printer or a sheet.</p>
        </div>
        <LabelFrame pallet={pallet} job={job} token={token} warehouse={sb.warehouse} callouts={CALLOUTS} active={callout} onActive={setCallout} maxWidth={250} />
      </div>
    );
  } else if (step === 2) {
    screen = (
      <ScanScreen
        pallet={scannedPallet}
        rack={rack}
        labels={labels}
        message={message}
        listening={settings.wedge}
        placedAt={saved?.at ?? null}
        code={code}
        onCode={setCode}
        onTap={(payload) => fromPerson() && scan(payload)}
        onTyped={(t) => fromPerson() && scan(t)}
        onReview={() => goStep(3)}
      />
    );
  } else if (step === 3 && pallet && job && rack) {
    screen = <ConfirmScreen pallet={pallet} job={job} rack={rack} saved={saved} busy={busy} error={placeError} onConfirm={confirm} onChangeRack={changeRack} />;
  } else if (step === 4) {
    screen = <FindScreen q={q} onQ={setQ} rows={found.rows} total={found.total} highlightId={pallet?.id ?? null} palletCode={pallet?.code ?? null} />;
  } else if (step === 5 && pallet && job) {
    screen = (
      <HistoryScreen pallet={pallet} job={job} location={pallet.current_location_id ? (sb.engine.db.locations[pallet.current_location_id] ?? null) : null} events={events} />
    );
  }

  const last = step === STEPS.length - 1;

  return (
    <div className={`tt ${last ? 'is-last' : ''}`} ref={root}>
      <div className="tt-top">
        <ol className="tt-rail" aria-label="Tour steps">
          {STEPS.map((st, i) => {
            const current = i === step;
            const complete = !current && i <= seen && done[i];
            return (
              <li key={st.rail} className={current ? 'current' : complete ? 'complete' : undefined}>
                <button
                  type="button"
                  onClick={() => goStep(i)}
                  disabled={!reachable(i)}
                  aria-current={current ? 'step' : undefined}
                  aria-label={`Step ${i + 1}: ${st.rail}${complete ? ', done' : ''}`}
                >
                  <span className="tt-rail-num">{complete ? <Icon name="check" /> : i + 1}</span>
                  <span className="tt-rail-label">{st.rail}</span>
                </button>
              </li>
            );
          })}
        </ol>
        <button type="button" className="tt-restart" onClick={onRestart} aria-label="Start over">
          <Icon name="refresh" /> <span className="tt-restart-label">Start over</span>
        </button>
      </div>

      <div className="tt-story" key={`story-${step}`}>
        <div className="tt-count">
          Step {step + 1} of {STEPS.length} · {s.eyebrow}
        </div>
        <h3 className="tt-title" ref={heading} tabIndex={-1}>
          {s.title}
        </h3>
        <p className="tt-body">{nowrapCodes(s.body)}</p>
        <Aside icon="bolt" label="Your turn" className="tt-turn">
          {nowrapCodes(turn)}
        </Aside>
        <Aside icon="database" label="Behind the scenes" className="tt-behind">
          {nowrapCodes(behind)}
        </Aside>
      </div>

      <div className="tt-stage">
        <DeviceFrame tab={s.tab} warehouse={sb.warehouse} screenKey={step}>
          {screen}
        </DeviceFrame>
      </div>

      <div className="tt-nav">
        <div className="tt-nav-row">
          <button type="button" className="site-btn ghost tt-back" onClick={() => goStep(step - 1)} disabled={step === 0 || busy}>
            <Icon name="chevronLeft" /> Back
          </button>
          {!last && (
            <button type="button" className="site-btn primary tt-next" onClick={() => goStep(step + 1)} disabled={!!blocked} aria-describedby={blocked ? 'tt-blocked' : undefined}>
              Next: {STEPS[step + 1].rail} <Icon name="chevronRight" />
            </button>
          )}
        </div>
        {!last && blocked && (
          <p className="tt-blocked" id="tt-blocked">
            {blocked}
          </p>
        )}
      </div>

      {last && (
        <div className="tt-wrap">
          <div>
            <div className="tt-wrap-title">That’s the whole loop: Receive, Move, Find</div>
            <p>Three jobs your crew already does every day. Each one is a tap or a scan, and each one is on the record.</p>
          </div>
          <div className="tt-wrap-actions">
            <button type="button" className="site-btn primary" onClick={() => go('showcase')}>
              See every feature <Icon name="arrowRight" />
            </button>
            <button type="button" className="site-btn ghost" onClick={() => go('contact')}>
              Book a walkthrough
            </button>
            <button type="button" className="site-btn ghost" onClick={onRestart}>
              <Icon name="refresh" /> Start over
            </button>
          </div>
        </div>
      )}

      <div className="sr-only" aria-live="polite">
        {announce}
      </div>
    </div>
  );
}

function Aside({ icon, label, className, children }: { icon: IconName; label: string; className: string; children: ReactNode }) {
  return (
    <div className={`tt-aside ${className}`}>
      <div className="tt-aside-label">
        <Icon name={icon} /> {label}
      </div>
      <p>{children}</p>
    </div>
  );
}
