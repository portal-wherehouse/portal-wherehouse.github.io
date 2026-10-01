// Home tour: the practice portal the visitor works in. Each screen mirrors the real portal
// (same classes, plates and badges) but reads and writes only the tour's private engine.

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { BRAND } from '../../brand';
import type { RankedRow, SearchRow } from '../../domain/search';
import { EVENT_LABEL } from '../../domain/transitions';
import type { Job, Location, Pallet, PalletEvent, PalletSnapshot, PalletState } from '../../domain/types';
import { Qr } from '../../features/labels/LabelCard';
import { BrandMark, Icon, type IconName } from '../../ui/icons';
import { Empty, HoldBadge, Notice, Plate, Spinner, StateBadge, fmtAgo, fmtTime } from '../../ui/ui';
import { TOUR_ACTOR_LABEL } from './sandbox';

export type DeviceTab = 'receive' | 'move' | 'find';

const TABS: { tab: DeviceTab | 'more'; label: string; icon: IconName }[] = [
  { tab: 'receive', label: 'Receive', icon: 'receive' },
  { tab: 'move', label: 'Move', icon: 'move' },
  { tab: 'find', label: 'Find', icon: 'find' },
  { tab: 'more', label: 'More', icon: 'more' },
];

/** The framed stand-in for the portal: demo strip, top bar, the screen, and the phone tabs. */
export function DeviceFrame({ tab, warehouse, screenKey, children }: { tab: DeviceTab; warehouse: string; screenKey: string | number; children: ReactNode }) {
  return (
    <div className="tt-device" role="region" aria-label={`Practice copy of the ${BRAND.portal}`}>
      <div className="tt-strip">
        <strong>Practice</strong>
        <span>
          <span className="tt-strip-long">A private copy in your browser. </span>Nothing here touches real records.
        </span>
      </div>
      <div className="tt-topbar">
        <BrandMark className="tt-brandmark" />
        <span className="tt-brandname">{BRAND.name}</span>
        <span className="brand-sub">Portal</span>
        <span className="tt-spacer" />
        <span className="chip static tt-chip-wh">
          <Icon name="locations" /> {warehouse}
        </span>
        <span className="chip static">
          <Icon name="user" /> {TOUR_ACTOR_LABEL}
        </span>
      </div>
      <div className="tt-screen" key={screenKey}>
        {children}
      </div>
      <div className="tt-tabs" aria-hidden="true">
        {TABS.map((t) => (
          <span key={t.tab} className={t.tab === tab ? 'on' : undefined}>
            <Icon name={t.icon} />
            {t.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Keep codes like P-000042 or A-03-02 on one line: browsers otherwise break them at the hyphen. */
export function nowrapCodes(text: ReactNode): ReactNode {
  if (typeof text !== 'string') return text;
  return text.split(/([A-Z]{1,12}-\d+(?:-\d+)*)/g).map((part, i) =>
    i % 2 ? (
      <span key={i} className="tt-nowrap">
        {part}
      </span>
    ) : (
      part
    ),
  );
}

function ScreenHead({ eyebrow, title, sub }: { eyebrow: string; title: ReactNode; sub?: ReactNode }) {
  return (
    <div className="tt-head">
      <div className="eyebrow">{eyebrow}</div>
      <div className="tt-head-title">{title}</div>
      {sub && <p className="tt-head-sub">{sub}</p>}
    </div>
  );
}

function JobLine({ job }: { job: Job | undefined }) {
  return (
    <span>
      <span className="jcode">{job?.code ?? 'No job'}</span> {job?.name}
    </span>
  );
}

// ------------------------------------------------------------------ 1. Receive

export function ReceiveScreen({
  jobs,
  jobId,
  onJob,
  desc,
  onDesc,
  busy,
  error,
  onReceive,
  received,
  waiting,
}: {
  jobs: Job[];
  jobId: string;
  onJob: (id: string) => void;
  desc: string;
  onDesc: (d: string) => void;
  busy: boolean;
  error: string | null;
  onReceive: () => void;
  received: { pallet: Pallet; job: Job } | null;
  /** Pallets received earlier and not yet on a rack, newest first. */
  waiting: SearchRow[];
}) {
  const list = <Waiting rows={waiting} mine={received?.pallet.id ?? null} />;
  if (received) {
    const { pallet, job } = received;
    return (
      <div className="stack">
        <ScreenHead eyebrow="Warehouse" title="Receive" />
        <div className="panel tt-received">
          <div className="tt-received-top">
            <Icon name="checkCircle" /> Received. The new pallet code is
          </div>
          <div className="tt-reveal">
            <Plate code={pallet.code} size="lg" />
          </div>
          <dl className="tt-kv">
            <div>
              <dt>Job</dt>
              <dd>
                <JobLine job={job} />
              </dd>
            </div>
            <div>
              <dt>On the pallet</dt>
              <dd>{pallet.description}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>
                <StateBadge state={pallet.state} />
              </dd>
            </div>
          </dl>
        </div>
        <p className="tt-note">
          <Icon name="labels" /> Next, {pallet.code} gets a label.
        </p>
        {list}
      </div>
    );
  }
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onReceive();
  };
  return (
    <div className="stack">
      <ScreenHead eyebrow="Warehouse" title="Receive" sub="Record a delivery against a job. It gets a pallet code right away." />
      <form className="panel stack" onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="tt-job">Job</label>
          <select id="tt-job" className="select" value={jobId} onChange={(e) => onJob(e.target.value)}>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.code} · {j.name}
              </option>
            ))}
          </select>
          <span className="hint">Open jobs only. A closed job cannot take new deliveries.</span>
        </div>
        <div className="field">
          <label htmlFor="tt-desc">What is on the pallet</label>
          <input id="tt-desc" className="input" value={desc} maxLength={160} onChange={(e) => onDesc(e.target.value)} autoComplete="off" aria-invalid={error ? true : undefined} />
        </div>
        {error && (
          <Notice tone="warn" title="Not saved">
            {error}
          </Notice>
        )}
        <button className="btn primary big block" type="submit" disabled={busy} data-tt="receive">
          {busy ? (
            <>
              <Spinner /> Saving
            </>
          ) : (
            <>
              <Icon name="receive" /> Receive it
            </>
          )}
        </button>
      </form>
      {list}
    </div>
  );
}

function Waiting({ rows, mine }: { rows: SearchRow[]; mine: string | null }) {
  if (!rows.length) return null;
  return (
    <div className="panel tt-waiting">
      <div className="panel-title">
        <Icon name="receive" /> Waiting to be placed
        <span className="grow" />
        <span className="tag warn">{rows.length}</span>
      </div>
      <ul>
        {rows.slice(0, 3).map((r) => (
          <li key={r.pallet.id} className={r.pallet.id === mine ? 'mine' : undefined}>
            <span className="pcode">{r.pallet.code}</span>
            <span className="tt-waiting-desc">
              {r.pallet.description}
              {r.pallet.id === mine && <span className="sr-only"> (the one you just received)</span>}
            </span>
            <span className="jcode">{r.job?.code ?? 'No job'}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ------------------------------------------------------------------ 3. Scan

export interface PretendLabel {
  kind: 'pallet' | 'rack';
  code: string;
  sub: string;
  payload: string;
  suggested?: boolean;
}

export type ScanMessage = { tone: 'ok' | 'info' | 'warn'; title: string; text: ReactNode; n: number };

export function ScanScreen({
  pallet,
  rack,
  labels,
  message,
  listening,
  placedAt,
  code,
  onCode,
  onTap,
  onTyped,
  onReview,
}: {
  pallet: Pallet | null;
  rack: Location | null;
  labels: PretendLabel[];
  message: ScanMessage | null;
  listening: boolean;
  placedAt: string | null;
  /** The "type the code" field, owned by the tour so a hardware scan can clear it. */
  code: string;
  onCode: (c: string) => void;
  onTap: (payload: string) => void;
  onTyped: (text: string) => void;
  onReview: () => void;
}) {
  const [zap, setZap] = useState<string | null>(null);
  const zapTimer = useRef<number | undefined>(undefined);
  const msgBox = useRef<HTMLDivElement>(null);
  useEffect(() => () => window.clearTimeout(zapTimer.current), []);
  // Keep each scan's feedback in view on small screens, where the labels sit below it.
  useEffect(() => {
    if (message) msgBox.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [message]);

  const tap = (l: PretendLabel) => {
    setZap(l.payload);
    window.clearTimeout(zapTimer.current);
    zapTimer.current = window.setTimeout(() => setZap(null), 450);
    onTap(l.payload);
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const t = code.trim();
    onCode('');
    if (t) onTyped(t);
  };
  const locked = !!placedAt;

  return (
    <div className="stack">
      <ScreenHead eyebrow="Warehouse" title="Move" />
      <div className="steps tt-steps">
        <div className={`step ${pallet ? 'done' : 'active'}`}>
          <span className="num-badge">{pallet ? <Icon name="check" /> : 1}</span>
          <div className="tt-step-body">
            <div className="step-label">Scan the pallet</div>
            {pallet ? (
              <div className="tt-scanned">
                <Plate code={pallet.code} size="sm" />
                <span className="tt-scanned-desc">{pallet.description}</span>
              </div>
            ) : (
              <div className="muted">Waiting for the pallet label</div>
            )}
          </div>
        </div>
        <div className={`step ${rack ? 'done' : pallet ? 'active' : ''}`}>
          <span className="num-badge">{rack ? <Icon name="check" /> : 2}</span>
          <div className="tt-step-body">
            <div className="step-label">Scan the rack</div>
            {rack ? (
              <div className="tt-scanned">
                <Plate code={rack.code} size="sm" />
                <span className="tt-scanned-desc">{rack.kind === 'RACK' ? 'Rack location' : rack.kind.toLowerCase()}</span>
              </div>
            ) : (
              <div className="muted">{pallet ? 'Now scan the rack label' : 'Then the rack label'}</div>
            )}
          </div>
        </div>
      </div>

      {message && (
        <div className="tt-msg" key={message.n} ref={msgBox}>
          <Notice tone={message.tone} title={message.title}>
            {nowrapCodes(message.text)}
          </Notice>
        </div>
      )}

      {locked ? (
        <Notice tone="ok" title={`Placed at ${rack?.code ?? ''}`}>
          Saved {fmtTime(placedAt)}. Start over to run the loop again.
        </Notice>
      ) : (
        <>
          {pallet && rack && (
            <button className="btn primary big block tt-pop-in" onClick={onReview} data-tt="review">
              Review the move <Icon name="chevronRight" />
            </button>
          )}
          <div className="tt-labels-head">
            <span className="eyebrow">Printed labels in the yard. Tap one to scan it</span>
          </div>
          <div className="tt-plabels">
            {labels.map((l) => (
              <button
                key={l.payload}
                type="button"
                className={`tt-plabel ${l.kind} ${zap === l.payload ? 'zap' : ''}`}
                onClick={() => tap(l)}
                aria-label={`Scan the ${l.kind} label ${l.code}`}
                data-tt-label={l.code}
              >
                <Qr payload={l.payload} className="tt-plabel-qr" />
                <span className="tt-plabel-text">
                  <span className="tt-plabel-kind">{l.kind === 'pallet' ? 'Pallet' : 'Rack'}</span>
                  <span className="tt-plabel-code">{l.code}</span>
                  <span className="tt-plabel-sub">{l.sub}</span>
                </span>
                {l.suggested && <span className="tt-plabel-tip">Try this one</span>}
                <span className="tt-beam" aria-hidden="true" />
              </button>
            ))}
          </div>
          <form className="tt-typecode" onSubmit={submit}>
            <label htmlFor="tt-code">Or type the code printed on the label</label>
            <div className="row nowrap">
              <input
                id="tt-code"
                className="input code"
                value={code}
                onChange={(e) => onCode(e.target.value)}
                placeholder={pallet ? 'A-03-02' : labels[0]?.code}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
              />
              <button className="btn" type="submit">
                <Icon name="keyboard" /> Enter
              </button>
            </div>
          </form>
          <div className={`tt-listen ${listening ? 'on' : ''}`}>
            <Icon name="scanner" />
            <span>
              {listening ? (
                <>
                  <strong>Scanner ready.</strong> A USB or Bluetooth scanner in keyboard mode works here too. Try it on the codes above.
                </>
              ) : (
                <>Hardware scanner input is turned off in this browser’s scanner settings.</>
              )}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ 4. Confirm

export function ConfirmScreen({
  pallet,
  job,
  rack,
  saved,
  busy,
  error,
  onConfirm,
  onChangeRack,
}: {
  pallet: Pallet;
  job: Job;
  rack: Location;
  saved: { at: string; from: number; to: number } | null;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onChangeRack: () => void;
}) {
  const flow = (
    <div className="tt-flow">
      <div>
        <div className="tt-mini">Pallet</div>
        <Plate code={pallet.code} />
      </div>
      <Icon name="arrowRight" className="tt-flow-arrow" />
      <div>
        <div className="tt-mini">Rack</div>
        <Plate code={rack.code} />
      </div>
    </div>
  );
  if (saved) {
    return (
      <div className="stack">
        <ScreenHead eyebrow="Move" title="Saved" />
        <div className="panel tt-saved" role="status">
          <svg className="tt-tick" viewBox="0 0 52 52" aria-hidden="true">
            <circle cx="26" cy="26" r="23" />
            <path d="M15 27l7 7 15-16" />
          </svg>
          <div className="tt-saved-title">
            Stored at <span className="tt-nowrap">{rack.code}</span>
          </div>
          <div className="row" style={{ justifyContent: 'center' }}>
            <StateBadge state="STORED" />
            <span className="muted" style={{ fontSize: 13.5 }}>
              {fmtTime(saved.at)} · {TOUR_ACTOR_LABEL}
            </span>
          </div>
          {flow}
        </div>
      </div>
    );
  }
  return (
    <div className="stack">
      <ScreenHead eyebrow="Move" title="Review and confirm" />
      <div className="panel tt-review">
        <div className="tt-review-title">
          Place <span className="tt-nowrap">{pallet.code}</span> at <span className="tt-nowrap">{rack.code}</span>
        </div>
        {flow}
        <dl className="tt-kv">
          <div>
            <dt>Job</dt>
            <dd>
              <JobLine job={job} />
            </dd>
          </div>
          <div>
            <dt>On the pallet</dt>
            <dd>{pallet.description}</dd>
          </div>
          <div>
            <dt>Now</dt>
            <dd>
              <StateBadge state={pallet.state} /> Not on a rack yet
            </dd>
          </div>
          <div>
            <dt>After</dt>
            <dd>
              <StateBadge state="STORED" /> At {rack.code}
            </dd>
          </div>
        </dl>
      </div>
      {error && (
        <Notice tone="warn" title="Not saved">
          {error}
        </Notice>
      )}
      <button className="btn primary big block" onClick={onConfirm} disabled={busy} data-tt="confirm">
        {busy ? (
          <>
            <Spinner /> Saving
          </>
        ) : (
          <>
            <Icon name="check" /> Confirm
          </>
        )}
      </button>
      <button className="btn ghost block" onClick={onChangeRack} disabled={busy}>
        Scan a different rack
      </button>
    </div>
  );
}

// ------------------------------------------------------------------ 5. Find

function Where({ row }: { row: RankedRow }) {
  const p = row.pallet;
  const none = (code: string, text: string) => (
    <>
      <Plate code={code} size="sm" variant="none" />
      <div className="where-text">{nowrapCodes(text)}</div>
    </>
  );
  if (p.state === 'STORED' && row.location) {
    return (
      <>
        <Plate code={row.location.code} size="sm" />
        <div className="where-text">
          Last confirmed at <span className="tt-nowrap">{row.location.code}</span> · <span className="tt-nowrap">{fmtAgo(p.last_confirmed_at)}</span>
        </div>
      </>
    );
  }
  if (p.state === 'RECEIVED') return none('UNASSIGNED', 'Waiting to be placed');
  if (p.state === 'MISSING') return none('MISSING', row.lastLocation ? `Last seen at ${row.lastLocation.code}` : 'Never placed');
  if (p.state === 'DISPATCHED') return none('LEFT WH', 'Dispatched to the job');
  return none('RETIRED', 'No longer active');
}

export function FindScreen({
  q,
  onQ,
  rows,
  total,
  highlightId,
  palletCode,
  examples,
}: {
  q: string;
  onQ: (q: string) => void;
  rows: RankedRow[];
  total: number;
  highlightId: string | null;
  palletCode: string | null;
  /** Searches to suggest, from the pallet the visitor received: its job, its rack and a word from its description. */
  examples: { job: string; rack: string; word: string };
}) {
  const tries = [examples.job, ...(palletCode ? [palletCode] : []), examples.rack, examples.word];
  return (
    <div className="stack">
      <ScreenHead eyebrow="Warehouse" title="Find materials" sub="Search a job, pallet code, rack, or description." />
      <div className="search-bar">
        <Icon name="find" />
        <label htmlFor="tt-q" className="sr-only">
          Search
        </label>
        <input id="tt-q" className="input" type="search" value={q} onChange={(e) => onQ(e.target.value)} autoComplete="off" spellCheck={false} enterKeyHint="search" />
      </div>
      <div className="tt-tries">
        <span className="muted">Try</span>
        {tries.map((t) => (
          <button key={t} type="button" className="btn small" aria-pressed={q.trim().toUpperCase() === t.toUpperCase()} onClick={() => onQ(t)}>
            {t}
          </button>
        ))}
      </div>
      <div className="muted num tt-found" aria-live="polite">
        {total} {total === 1 ? 'pallet' : 'pallets'}
        {q.trim() ? ` for “${q.trim()}”` : ''}
      </div>
      {rows.length === 0 ? (
        <div className="panel">
          <Empty icon="find" title={q.trim() ? `No pallets match “${q.trim()}”` : 'Type something to search'}>
            <p>
              Try a job code like {examples.job}, a rack like {examples.rack}, or a word like {examples.word}.
            </p>
          </Empty>
        </div>
      ) : (
        <div className="results">
          {rows.map((r) => {
            const mine = r.pallet.id === highlightId;
            return (
              <div key={r.pallet.id} className={`result tt-result ${mine ? 'tt-mine' : ''}`} data-tt-row={r.pallet.code}>
                <div className="where">
                  <Where row={r} />
                </div>
                <div className="what">
                  <span className="pcode">{r.pallet.code}</span>
                  <span className="desc">{r.pallet.description}</span>
                </div>
                <div className="side">
                  <StateBadge state={r.pallet.state} />
                  {mine && <span className="tag accent">Yours</span>}
                </div>
                <div className="meta">
                  <JobLine job={r.job} />
                  {r.pallet.hold && <HoldBadge title={r.pallet.hold.reason} />}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ 6. History

const STATE_WORD: Record<PalletState, string> = { RECEIVED: 'Received', STORED: 'Stored', IN_TRANSIT: 'In transit', PICKED: 'Picked', DISPATCHED: 'Dispatched', MISSING: 'Missing', RETIRED: 'Retired' };

function Spot({ s }: { s: PalletSnapshot | null }) {
  if (s?.current_location_code) return <Plate code={s.current_location_code} size="sm" />;
  return <Plate code={s ? 'UNASSIGNED' : 'NEW'} size="sm" variant="none" />;
}

function Changes({ e }: { e: PalletEvent }) {
  const b = e.before_state;
  const a = e.after_state;
  if (!b) {
    return (
      <>
        <dt>Changed</dt>
        <dd>
          New record for <span className="jcode">{a.job_code}</span>, no rack yet
        </dd>
      </>
    );
  }
  return (
    <>
      {b.current_location_id !== a.current_location_id && (
        <>
          <dt>Location</dt>
          <dd className="tt-before-after">
            <Spot s={b} /> <span className="arrow">→</span> <Spot s={a} />
          </dd>
        </>
      )}
      {b.state !== a.state && (
        <>
          <dt>Status</dt>
          <dd>
            {STATE_WORD[b.state]} <span className="arrow">→</span> <strong>{STATE_WORD[a.state]}</strong>
          </dd>
        </>
      )}
    </>
  );
}

export function HistoryScreen({ pallet, job, location, events }: { pallet: Pallet; job: Job; location: Location | null; events: PalletEvent[] }) {
  return (
    <div className="stack">
      <ScreenHead eyebrow="Pallet record" title={pallet.code} />
      <div className="panel tt-record">
        <div className="tt-record-where">
          {location ? <Plate code={location.code} /> : <Plate code="UNASSIGNED" variant="none" />}
          <div>
            <StateBadge state={pallet.state} />
            <div className="tt-record-desc">{pallet.description}</div>
            <div className="muted" style={{ fontSize: 13.5 }}>
              <JobLine job={job} />
            </div>
          </div>
        </div>
      </div>
      <div className="panel">
        <div className="panel-title">
          <Icon name="history" /> History
          <span className="grow" />
          <span className="tag">
            {events.length} {events.length === 1 ? 'entry' : 'entries'}
          </span>
        </div>
        <div className="timeline">
          {events.map((e, i) => (
            <div key={e.id} className="tl-item tt-tl" style={{ animationDelay: `${i * 90}ms` }}>
              <span className={`tl-dot ${e.type === 'receive' ? '' : 'ok'}`}>
                <Icon name={e.type === 'receive' ? 'receive' : e.type === 'place' || e.type === 'move' ? 'pin' : 'history'} />
              </span>
              <div>
                <div className="tl-head">
                  <span className="tl-title">{EVENT_LABEL[e.type] ?? e.type}</span>
                  <span className="tag">v{e.revision}</span>
                </div>
                <dl className="tt-facts">
                  <dt>Who</dt>
                  <dd>{TOUR_ACTOR_LABEL}</dd>
                  <dt>When</dt>
                  <dd>
                    {fmtTime(e.accepted_at)} · {fmtAgo(e.accepted_at)}
                  </dd>
                  <Changes e={e} />
                </dl>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
