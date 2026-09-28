// Mock-ups of the portal for the Product, See it in action, Why it's simple and Scanners pages.
// Plain HTML, CSS and inline SVG built from the portal's own tokens and badges, filled with demo data.

import { useEffect, useId, useState, type ReactNode } from 'react';
import { BRAND } from '../../brand';
import { qrSvg } from '../../device/output';
import { BrandMark, Icon, type IconName } from '../../ui/icons';
import { HoldBadge, Plate, StateBadge } from '../../ui/ui';
import { encodeCode128 } from '../../device/code128';

/** What a sample pallet label's QR carries. The format is real; the token is made up, so it matches no pallet. */
export const SAMPLE_PALLET_PAYLOAD = 'PL1:P:SAMPLE2LABEL7XYZ';
export const SAMPLE_RACK_PAYLOAD = 'PL1:L:SAMPLERACK2A3B4C';

// ------------------------------------------------------------------ barcodes

/** Module widths (bar, space, bar...) for text, from the same encoder the printed labels use. */
export function code128(text: string): number[] {
  return encodeCode128(text).widths.slice();
}

/** A real, scannable Code 128 barcode with a quiet zone on each side. */
export function Code128({ text, className, caption = true }: { text: string; className?: string; caption?: boolean }) {
  const widths = code128(text);
  const quiet = 10;
  const bars: { x: number; w: number }[] = [];
  let x = quiet;
  widths.forEach((w, i) => {
    if (i % 2 === 0) bars.push({ x, w });
    x += w;
  });
  return (
    <span className={`cm-c128 ${className ?? ''}`}>
      <svg viewBox={`0 0 ${x + quiet} 40`} preserveAspectRatio="none" shapeRendering="crispEdges" role="img" aria-label={`Code 128 barcode: ${text}`}>
        <rect width={x + quiet} height={40} fill="#ffffff" />
        {bars.map((b) => (
          <rect key={b.x} x={b.x} width={b.w} height={40} fill="#14171a" />
        ))}
      </svg>
      {caption && <span className="cm-c128-text">{text}</span>}
    </span>
  );
}

/** A real QR code for a payload, drawn by the same library the portal prints labels with. */
export function QrCode({ payload, className }: { payload: string; className?: string }) {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    let live = true;
    void qrSvg(payload).then((s) => live && setSvg(s));
    return () => {
      live = false;
    };
  }, [payload]);
  return <span className={`cm-qr ${className ?? ''}`} role="img" aria-label={`QR code: ${payload}`} dangerouslySetInnerHTML={{ __html: svg }} />;
}

/** Keeps codes like P-000042, J-214 and A-03-02 on one line inside running text. */
export function keepCodes(text: string): ReactNode {
  const parts = text.split(/\b([A-Z]{1,3}-\d{2,6}(?:-\d{2}){0,2})\b/);
  if (parts.length === 1) return text;
  return parts.map((p, i) =>
    i % 2 === 1 ? (
      <span key={i} className="pc-nw">
        {p}
      </span>
    ) : (
      p
    ),
  );
}

// ------------------------------------------------------------------ frames

/** A browser window around a portal screen. `screen` names the page in the address bar. */
export function Browser({ screen, children, className, label }: { screen: string; children: ReactNode; className?: string; label: string }) {
  return (
    <figure className={`cm-frame cm-browser ${className ?? ''}`} role="img" aria-label={label}>
      <div className="cm-bar" aria-hidden="true">
        <span className="cm-dots">
          <i />
          <i />
          <i />
        </span>
        <span className="cm-url">
          {BRAND.portal} <span className="cm-url-sep">/</span> {screen}
        </span>
        <span className="cm-demo">Demo data</span>
      </div>
      <div className="cm-body" aria-hidden="true">
        {children}
      </div>
    </figure>
  );
}

/** A phone around a portal screen, with the four bottom tabs. */
export function Phone({ children, className, label, tab = 'find' }: { children: ReactNode; className?: string; label: string; tab?: 'receive' | 'move' | 'find' | 'more' | null }) {
  return (
    <figure className={`cm-phone ${className ?? ''}`} role="img" aria-label={label}>
      <div className="cm-phone-screen" aria-hidden="true">
        <div className="cm-phone-status">
          <span>9:41</span>
          <span className="cm-phone-island" />
          <span className="cm-phone-signal">
            <i />
            <i />
            <i />
          </span>
        </div>
        <div className="cm-phone-top">
          <BrandMark className="cm-mark" />
          <span className="cm-brand">{BRAND.name}</span>
          <span className="cm-portal-tag">Portal</span>
        </div>
        <div className="cm-body cm-phone-body">{children}</div>
        {tab && (
          <div className="cm-tabs">
            {(['receive', 'move', 'find', 'more'] as const).map((t) => (
              <span key={t} className={t === tab ? 'on' : undefined}>
                <Icon name={t} />
                {t[0].toUpperCase() + t.slice(1)}
              </span>
            ))}
          </div>
        )}
      </div>
    </figure>
  );
}

function Head({ eyebrow, title }: { eyebrow?: string; title: string }) {
  return (
    <div className="cm-head">
      {eyebrow && <div className="cm-eyebrow">{eyebrow}</div>}
      <div className="cm-title">{title}</div>
    </div>
  );
}

/** Looks like a button, but it is a picture of one. */
function FakeBtn({ children, tone, icon }: { children: ReactNode; tone?: 'primary' | 'ghost' | 'big'; icon?: IconName }) {
  return (
    <span className={`cm-btn ${tone ?? ''}`}>
      {icon && <Icon name={icon} />}
      {children}
    </span>
  );
}

// ------------------------------------------------------------------ results and answers

interface Row {
  loc: string | null;
  code: string;
  desc: string;
  job: string;
  jobName: string;
  state: 'STORED' | 'RECEIVED' | 'MISSING' | 'DISPATCHED';
  when: string;
  hold?: boolean;
}

function ResultRow({ r }: { r: Row }) {
  const where =
    r.state === 'STORED' && r.loc ? (
      <>
        <Plate code={r.loc} size="sm" />
        <span className="cm-where-text">Last confirmed {r.when}</span>
      </>
    ) : r.state === 'RECEIVED' ? (
      <>
        <Plate code="UNASSIGNED" size="sm" variant="none" />
        <span className="cm-where-text">Needs placement</span>
      </>
    ) : r.state === 'MISSING' ? (
      <>
        <Plate code="MISSING" size="sm" variant="none" />
        <span className="cm-where-text">Last seen {r.loc} (historical)</span>
      </>
    ) : (
      <>
        <Plate code="LEFT WH" size="sm" variant="none" />
        <span className="cm-where-text">Dispatched, no current rack</span>
      </>
    );
  return (
    <div className="cm-result">
      <div className="cm-result-where">{where}</div>
      <div className="cm-result-what">
        <span className="cm-pcode">{r.code}</span> <span className="cm-desc">{r.desc}</span>
        <div className="cm-result-meta">
          <span className="cm-jcode">{r.job}</span> {r.jobName}
          {r.hold && <HoldBadge />}
        </div>
      </div>
      <div className="cm-result-state">
        <StateBadge state={r.state} />
      </div>
    </div>
  );
}

const J214: Row[] = [
  { loc: 'B-01-01', code: 'P-000012', desc: 'Door hardware', job: 'J-214', jobName: 'School renovation', state: 'STORED', when: '8:15 AM' },
  { loc: null, code: 'P-000013', desc: 'Ceiling tile', job: 'J-214', jobName: 'School renovation', state: 'RECEIVED', when: '' },
  { loc: 'A-03-02', code: 'P-000042', desc: 'Lighting fixtures', job: 'J-214', jobName: 'School renovation', state: 'STORED', when: '2 hr ago' },
];

/** Find: one search box, results with the location first. */
export function FindMock() {
  return (
    <Browser screen="Find" label="The Find screen: a search for J-214 lists three pallets. Each shows its rack first, when it was last confirmed, its code, description and state.">
      <Head eyebrow="Warehouse" title="Find materials" />
      <div className="cm-search">
        <Icon name="find" />
        <span className="cm-search-q">J-214</span>
        <span className="cm-caret" />
      </div>
      <div className="cm-pills">
        {['Received', 'Stored', 'Dispatched', 'Missing', 'On hold'].map((p) => (
          <span key={p} className="cm-pill">
            {p}
          </span>
        ))}
      </div>
      <div className="cm-count">3 pallets for “J-214”</div>
      <div className="cm-results">
        {J214.map((r) => (
          <ResultRow key={r.code} r={r} />
        ))}
      </div>
    </Browser>
  );
}

/** The answer the app gives: where, when and who. Never "is at". */
export function AnswerCard({ query = true }: { query?: boolean }) {
  return (
    <figure className="cm-answer" role="img" aria-label="Answer card: pallet P-000042, lighting fixtures for job J-214, stored. Last confirmed at rack A-03-02, 2 hours ago, by the operator.">
      <div aria-hidden="true">
        {query && (
          <div className="cm-answer-q">
            <Icon name="find" />
            <span>J-214 lighting</span>
          </div>
        )}
        <div className="cm-answer-card">
          <div className="cm-answer-top">
            <span className="cm-pcode">P-000042</span>
            <StateBadge state="STORED" />
          </div>
          <div className="cm-answer-desc">Lighting fixtures</div>
          <div className="cm-answer-where">
            <Plate code="A-03-02" />
            <div className="cm-answer-facts">
              <span className="cm-answer-k">Last confirmed at A-03-02</span>
              <span>
                <Icon name="clock" /> 2 hours ago
              </span>
              <span>
                <Icon name="user" /> by the operator
              </span>
            </div>
          </div>
          <div className="cm-answer-job">
            <span className="cm-jcode">J-214</span> School renovation
          </div>
        </div>
      </div>
    </figure>
  );
}

/** Small versions of the answer for each kind of "where". */
export function WhereVariants() {
  const rows: { plate: string; none?: boolean; title: string; body: string; state: 'STORED' | 'RECEIVED' | 'MISSING' | 'DISPATCHED' }[] = [
    { plate: 'A-03-02', title: 'Stored', body: 'Last confirmed at A-03-02, 2 hr ago', state: 'STORED' },
    { plate: 'UNASSIGNED', none: true, title: 'Received', body: 'In the building, needs placement', state: 'RECEIVED' },
    { plate: 'MISSING', none: true, title: 'Missing', body: 'Last seen A-03-02 (historical)', state: 'MISSING' },
    { plate: 'LEFT WH', none: true, title: 'Dispatched', body: 'Left for the job site, no rack', state: 'DISPATCHED' },
  ];
  return (
    <ul className="cm-variants">
      {rows.map((r) => (
        <li key={r.title}>
          <Plate code={r.plate} size="sm" variant={r.none ? 'none' : undefined} />
          <StateBadge state={r.state} />
          <span>{r.body}</span>
        </li>
      ))}
    </ul>
  );
}

// ------------------------------------------------------------------ floor work

/** Move: pallet, rack, confirm. */
export function MoveMock() {
  return (
    <Phone tab="move" label="The Move screen on a phone: step 1 scanned pallet P-000012, step 2 scanned rack A-03-02, step 3 asks to confirm the move from B-01-01 to A-03-02.">
      <Head eyebrow="Warehouse" title="Move pallet" />
      <div className="cm-step done">
        <span className="cm-num">
          <Icon name="check" />
        </span>
        <div className="cm-step-body">
          <span className="cm-step-label">Pallet</span>
          <span>
            <span className="cm-pcode">P-000012</span> Door hardware
          </span>
          <span className="cm-faint">J-214 · at B-01-01</span>
        </div>
      </div>
      <div className="cm-step done">
        <span className="cm-num">
          <Icon name="check" />
        </span>
        <div className="cm-step-body">
          <span className="cm-step-label">Destination</span>
          <Plate code="A-03-02" size="sm" kind="rack" />
        </div>
      </div>
      <div className="cm-step active">
        <span className="cm-num">3</span>
        <div className="cm-step-body">
          <span className="cm-step-label">Confirm</span>
          <div className="cm-review">
            <Plate code="B-01-01" size="sm" />
            <Icon name="arrowRight" />
            <Plate code="A-03-02" size="sm" />
          </div>
          <FakeBtn tone="big" icon="check">
            Confirm move
          </FakeBtn>
        </div>
      </div>
    </Phone>
  );
}

/** Receive: pick the job, describe it, save, print. */
export function ReceiveMock() {
  return (
    <Phone tab="receive" label="The Receive screen on a phone: job J-214 chosen, description Lighting fixtures, a photo attached. Saved as pallet P-000042 with its label ready to print.">
      <Head eyebrow="Warehouse" title="Receive" />
      <div className="cm-field">
        <span className="cm-flabel">Job</span>
        <span className="cm-input">
          <span className="cm-jcode">J-214</span> School renovation
          <Icon name="chevronDown" />
        </span>
      </div>
      <div className="cm-field">
        <span className="cm-flabel">What arrived</span>
        <span className="cm-input">Lighting fixtures</span>
      </div>
      <div className="cm-field">
        <span className="cm-flabel">Photo (optional)</span>
        <span className="cm-photo-row">
          <span className="cm-photo" />
          <span className="cm-faint">Compressed on the phone before upload</span>
        </span>
      </div>
      <div className="cm-saved">
        <div className="cm-saved-top">
          <Icon name="checkCircle" />
          <strong>Saved as</strong>
        </div>
        <Plate code="P-000042" />
        <div className="cm-row2">
          <FakeBtn tone="primary" icon="print">
            Print label
          </FakeBtn>
          <FakeBtn icon="move">Place now</FakeBtn>
        </div>
      </div>
    </Phone>
  );
}

/** Scan station in put-away mode. */
export function StationMock() {
  return (
    <Browser screen="Scan station" label="The Scan station in put-away mode: rack A-03-02 is the target. Two pallets were scanned onto it and one scan was refused because that pallet was dispatched.">
      <div className="cm-station-head">
        <Head eyebrow="Floor" title="Scan station" />
        <span className="cm-listen">
          <span className="cm-dot" /> Listening for scans
        </span>
      </div>
      <div className="cm-seg">
        {['Look up', 'Move', 'Put-away', 'Count'].map((m) => (
          <span key={m} className={m === 'Put-away' ? 'on' : undefined}>
            {m}
          </span>
        ))}
      </div>
      <div className="cm-station-target">
        <span className="cm-step-label">Putting away onto</span>
        <Plate code="A-03-02" kind="rack" />
        <span className="cm-faint">Scan each pallet going onto this rack. Scan Finish when done.</span>
      </div>
      <ul className="cm-log">
        <li className="ok">
          <Icon name="checkCircle" />
          <span className="cm-pcode">P-000014</span>
          <span className="grow">Lighting fixtures</span>
          <span className="cm-faint">moved from A-01-01</span>
        </li>
        <li className="ok">
          <Icon name="checkCircle" />
          <span className="cm-pcode">P-000037</span>
          <span className="grow">Bench kits</span>
          <span className="cm-faint">placed</span>
        </li>
        <li className="bad">
          <Icon name="alertCircle" />
          <span className="cm-pcode">P-000009</span>
          <span className="grow">Dispatched. Record a return first.</span>
        </li>
      </ul>
    </Browser>
  );
}

// ------------------------------------------------------------------ finding

/** A pallet record with its history. */
export function RecordMock() {
  return (
    <Browser screen="Pallet P-000012" label="A pallet record: P-000012, door hardware for job J-214, stored at B-01-01. The history lists Moved, Placed and Received, each with the version, time and account.">
      <div className="cm-record-head">
        <div>
          <div className="cm-eyebrow">Pallet · J-214</div>
          <div className="cm-title cm-title-xl">P-000012</div>
          <div className="cm-faint">Door hardware</div>
        </div>
        <StateBadge state="STORED" />
      </div>
      <div className="cm-record-loc">
        <Plate code="B-01-01" />
        <span className="cm-faint">Last confirmed today 8:15 AM</span>
      </div>
      <HistoryList
        events={[
          { icon: 'move', title: 'Moved', v: 3, when: '8:15 AM · Demo Operator', body: 'A-02-02 → B-01-01' },
          { icon: 'pin', title: 'Placed', v: 2, when: 'Sep 17 · Demo Operator', body: 'Unassigned → A-02-02' },
          { icon: 'receive', title: 'Received', v: 1, when: 'Sep 17 · Demo Operator', body: 'For J-214 School renovation' },
        ]}
      />
    </Browser>
  );
}

interface HistEvent {
  icon: IconName;
  title: string;
  v: number;
  when: string;
  body: ReactNode;
  tone?: 'fix' | 'old';
  tag?: string;
}

function HistoryList({ events }: { events: HistEvent[] }) {
  return (
    <ol className="cm-history">
      {events.map((e) => (
        <li key={e.v} className={e.tone ? `cm-h-${e.tone}` : undefined}>
          <span className="cm-h-dot">
            <Icon name={e.icon} />
          </span>
          <div className="cm-h-body">
            <div className="cm-h-top">
              <strong>{e.title}</strong>
              <span className="cm-v">v{e.v}</span>
              {e.tag && <span className="tag warn">{e.tag}</span>}
            </div>
            <div className="cm-h-what">{e.body}</div>
            <div className="cm-faint">{e.when}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** History with a correction: the mistaken entry stays, the fix is added on top. */
export function CorrectionMock() {
  return (
    <Browser screen="Pallet P-000020 · History" label="A pallet history with a correction. A move to B-02-02 was recorded by mistake. A supervisor added a correction with a reason. The original move is still listed, marked as corrected.">
      <div className="cm-panel-title">
        <Icon name="history" /> History <span className="grow" />
        <span className="cm-faint">4 events, newest first</span>
      </div>
      <HistoryList
        events={[
          {
            icon: 'history',
            title: 'Correction',
            v: 4,
            when: '10:02 AM · Demo Supervisor',
            body: (
              <>
                Back to <strong>B-01-02</strong>. Reason: “Wrong rack scanned. Pallet never left B-01-02.”
              </>
            ),
            tone: 'fix',
          },
          { icon: 'move', title: 'Moved', v: 3, when: '9:40 AM · Demo Operator', body: 'B-01-02 → B-02-02', tone: 'old', tag: 'Corrected in v4' },
          { icon: 'pin', title: 'Placed', v: 2, when: 'Sep 18 · Demo Operator', body: 'Unassigned → B-01-02' },
          { icon: 'receive', title: 'Received', v: 1, when: 'Sep 18 · Demo Operator', body: 'For J-203 Library HVAC upgrade' },
        ]}
      />
    </Browser>
  );
}

/** Warehouse map: racks by zone, with what is recorded on each. */
export function MapMock() {
  const zone: { aisle: string; bays: { code: string; n: number; hold?: number }[] }[] = [
    { aisle: 'A-01', bays: [{ code: 'A-01-01', n: 2 }, { code: 'A-01-02', n: 2 }] },
    { aisle: 'A-02', bays: [{ code: 'A-02-01', n: 2 }, { code: 'A-02-02', n: 2 }] },
    { aisle: 'A-03', bays: [{ code: 'A-03-01', n: 3 }, { code: 'A-03-02', n: 0 }] },
    { aisle: 'B-02', bays: [{ code: 'B-02-01', n: 3, hold: 1 }, { code: 'B-02-02', n: 2 }] },
  ];
  return (
    <Browser screen="Map" label="The warehouse map: racks A-01 to B-02 as tiles, each showing how many pallets are recorded there. A-03-02 has nothing recorded. B-02-01 has three, one on hold.">
      <Head eyebrow="WH-01 · Main yard" title="Warehouse map" />
      <div className="cm-map">
        {zone.map((a) => (
          <div key={a.aisle} className="cm-map-row">
            <span className="cm-map-aisle">{a.aisle}</span>
            {a.bays.map((b) => (
              <span key={b.code} className={`cm-bay ${b.n === 0 ? 'empty' : ''}`}>
                <span className="cm-bay-code">{b.code}</span>
                <span className="cm-bay-boxes">
                  {Array.from({ length: b.n }, (_, i) => (
                    <i key={i} className={b.hold && i < b.hold ? 'held' : undefined} />
                  ))}
                </span>
                <span className="cm-bay-n">{b.n === 0 ? 'Nothing recorded' : `${b.n} recorded${b.hold ? ` · ${b.hold} hold` : ''}`}</span>
              </span>
            ))}
          </div>
        ))}
      </div>
    </Browser>
  );
}

// ------------------------------------------------------------------ oversight

/** Overview: what is on hand and what needs attention. */
export function OverviewMock() {
  const bar: { k: string; n: number; c: string }[] = [
    { k: 'Stored', n: 21, c: 'var(--ok)' },
    { k: 'Received', n: 3, c: 'var(--warn)' },
    { k: 'Missing', n: 2, c: 'var(--bad)' },
    { k: 'Dispatched', n: 3, c: 'var(--slate)' },
  ];
  const tiles: { l: string; n: number; i: IconName }[] = [
    { l: 'Needs placement', n: 3, i: 'receive' },
    { l: 'Missing', n: 2, i: 'question' },
    { l: 'On hold', n: 2, i: 'hold' },
    { l: 'Labels to reprint', n: 0, i: 'print' },
    { l: 'Not verified in 3+ days', n: 18, i: 'check' },
    { l: 'Unsent on this device', n: 0, i: 'sync' },
  ];
  return (
    <Browser screen="Overview" label="The Overview: 24 pallets on hand, 21 stored and 3 waiting for placement, with a bar by state. Needs attention tiles: 3 need placement, 2 missing, 2 on hold, 0 labels to reprint, 18 not verified in 3 or more days.">
      <Head eyebrow="WH-01 · Main yard" title="Overview" />
      <div className="cm-ov">
        <div className="cm-card">
          <div className="cm-panel-title">Pallets on hand</div>
          <div className="cm-ov-hero">
            <span className="cm-hero-n">24</span>
            <span className="cm-faint">21 stored on racks, 3 waiting for placement</span>
          </div>
          <div className="cm-statebar">
            {bar.map((b) => (
              <i key={b.k} style={{ flex: b.n, background: b.c }} />
            ))}
          </div>
          <div className="cm-legend">
            {bar.map((b) => (
              <span key={b.k}>
                <i style={{ background: b.c }} />
                {b.k} <strong>{b.n}</strong>
              </span>
            ))}
          </div>
        </div>
        <div className="cm-card">
          <div className="cm-panel-title">Needs attention</div>
          <div className="cm-tiles">
            {tiles.map((t) => (
              <span key={t.l} className="cm-tile">
                <span className="cm-tile-l">
                  <Icon name={t.i} /> {t.l}
                </span>
                <span className="cm-tile-n">{t.n}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </Browser>
  );
}

/** Reconcile: short lists that keep the records matching the floor. */
export function ReconcileMock() {
  return (
    <Browser screen="Reconcile" label="The Reconcile screen: tabs for Needs placement, Missing, On hold, Labels to reprint and Not verified. The Needs placement list shows two pallets, each with a Place now button.">
      <Head title="Reconcile" />
      <div className="cm-rtabs">
        <span className="on">
          <Icon name="receive" /> Needs placement <b>3</b>
        </span>
        <span>
          <Icon name="question" /> Missing <b>2</b>
        </span>
        <span>
          <Icon name="hold" /> On hold <b>2</b>
        </span>
        <span>
          <Icon name="print" /> Reprint <b>0</b>
        </span>
      </div>
      <div className="cm-note">
        <Icon name="receive" />
        <span>
          <strong>Received but never put on a rack.</strong> Walk to the pallet, then use Move: scan it, scan its rack.
        </span>
      </div>
      <div className="cm-results">
        <ResultRow r={{ loc: null, code: 'P-000013', desc: 'Ceiling tile', job: 'J-214', jobName: 'School renovation', state: 'RECEIVED', when: '' }} />
        <ResultRow r={{ loc: null, code: 'P-000031', desc: 'Flashing and trim', job: 'J-230', jobName: 'Fire station reroof', state: 'RECEIVED', when: '', hold: true }} />
      </div>
    </Browser>
  );
}

/** Activity: every accepted change, by day. */
export function ActivityMock() {
  const rows: { t: string; code: string; what: string; who: string }[] = [
    { t: '10:42', code: 'P-000042', what: 'Moved → A-03-02', who: 'Demo Operator' },
    { t: '10:31', code: 'P-000031', what: 'Hold applied', who: 'Demo Operator' },
    { t: '09:58', code: 'P-000027', what: 'Dispatched', who: 'Demo Operator' },
    { t: '09:12', code: 'P-000013', what: 'Received', who: 'Demo Operator' },
  ];
  return (
    <Browser screen="Activity" label="The Activity feed: accepted changes for today, each with time, pallet code, what happened and which account did it.">
      <Head title="Activity" />
      <div className="cm-day">Today</div>
      <ul className="cm-feed">
        {rows.map((r) => (
          <li key={r.t}>
            <span className="cm-faint cm-num-t">{r.t}</span>
            <span className="cm-pcode">{r.code}</span>
            <span className="grow">{r.what}</span>
            <span className="cm-faint cm-feed-who">{r.who}</span>
          </li>
        ))}
      </ul>
    </Browser>
  );
}

// ------------------------------------------------------------------ setup and admin

/** A job's pick list, sorted by rack. */
export function PickListMock() {
  const rows: { loc: string | null; code: string; desc: string }[] = [
    { loc: 'A-01-02', code: 'P-000016', desc: 'Door hardware' },
    { loc: 'A-03-02', code: 'P-000042', desc: 'Lighting fixtures' },
    { loc: 'B-01-01', code: 'P-000012', desc: 'Door hardware' },
    { loc: null, code: 'P-000013', desc: 'Ceiling tile' },
  ];
  return (
    <Browser screen="Jobs / J-214" label="Job J-214 School renovation: counts for on hand, missing, on hold and dispatched, and a pick list of four pallets sorted by rack, with a Print pick list button.">
      <Head eyebrow="J-214" title="School renovation" />
      <div className="cm-mini-stats">
        {[
          ['On hand', 4],
          ['Missing', 0],
          ['On hold', 0],
          ['Dispatched', 1],
        ].map(([k, n]) => (
          <span key={k as string}>
            <span className="cm-tile-l">{k}</span>
            <strong>{n}</strong>
          </span>
        ))}
      </div>
      <div className="cm-card cm-flush">
        <div className="cm-panel-title cm-pad">
          Pick list, sorted by rack <span className="grow" />
          <FakeBtn icon="print">Print</FakeBtn>
        </div>
        <table className="cm-table">
          <thead>
            <tr>
              <th>Rack</th>
              <th>Pallet</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.code}>
                <td>{r.loc ? <span className="cm-rack">{r.loc}</span> : <span className="cm-faint">Unassigned</span>}</td>
                <td className="cm-pcode">{r.code}</td>
                <td>{r.desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Browser>
  );
}

/** CSV import: checked row by row, all or nothing. */
export function ImportMock() {
  return (
    <Browser screen="Import" label="The Import screen: a CSV file of pallets is checked before anything is saved. Three rows are ready. Row 4 has a problem: job J-999 is not an open job. Nothing is imported until it is fixed.">
      <Head title="Import" />
      <div className="cm-file">
        <Icon name="upload" />
        <span className="grow">
          <strong>received-pallets.csv</strong>
          <span className="cm-faint"> · 4 rows</span>
        </span>
        <span className="tag">Pallets</span>
      </div>
      <div className="cm-card cm-flush">
        <table className="cm-table">
          <thead>
            <tr>
              <th>Row</th>
              <th>job_code</th>
              <th>description</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>2</td>
              <td>J-221</td>
              <td>Floor tile</td>
              <td>
                <Icon name="check" className="cm-ok" />
              </td>
            </tr>
            <tr>
              <td>3</td>
              <td>J-221</td>
              <td>Lobby light fixtures</td>
              <td>
                <Icon name="check" className="cm-ok" />
              </td>
            </tr>
            <tr className="cm-bad-row">
              <td>4</td>
              <td>
                <mark>J-999</mark>
              </td>
              <td>Anchor bolts</td>
              <td>
                <Icon name="alertCircle" className="cm-bad" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="cm-note bad">
        <Icon name="alertCircle" />
        <span>
          <strong>Row 4, job_code:</strong> J-999 is not an open job. Nothing is imported until every row is fixed.
        </span>
      </div>
    </Browser>
  );
}

/** People: one line per role. */
export function PeopleMock() {
  const people: { role: string; init: string; what: string }[] = [
    { role: 'Owner', init: 'DO', what: 'Everything, including people' },
    { role: 'Supervisor', init: 'DS', what: 'Jobs, racks, fixes, holds, export' },
    { role: 'Operator', init: 'DO', what: 'Receive, move, dispatch, returns' },
    { role: 'Viewer', init: 'DV', what: 'Search and look. No changes.' },
  ];
  return (
    <Browser screen="People" label="The People screen: four demo accounts, one for each role: Owner, Supervisor, Operator and Viewer, with what each can do.">
      <Head title="People" />
      <ul className="cm-people">
        {people.map((p) => (
          <li key={p.role}>
            <span className="cm-avatar">{p.init}</span>
            <span className="grow">
              <strong>Demo {p.role}</strong>
              <span className="cm-faint">{p.what}</span>
            </span>
            <span className="tag">{p.role}</span>
          </li>
        ))}
      </ul>
    </Browser>
  );
}

// ------------------------------------------------------------------ labels

/**
 * A 4x6 pallet label: the big code, the job line, a QR code, a Code 128 barcode and a fallback line.
 * `marks` adds numbered markers for the label anatomy diagram.
 */
export function PalletLabelMock({ marks = false, className, code = 'P-000042' }: { marks?: boolean; className?: string; code?: string }) {
  const m = (n: number) => (marks ? <span className="cm-mark-n">{n}</span> : null);
  return (
    <figure className={`cm-label ${className ?? ''}`} role="img" aria-label={`Sample pallet label for ${code}: the code printed large, job J-214 School renovation, Lighting fixtures, a QR code, a Code 128 barcode, and the line: if the QR is damaged, type ${code}.`}>
      <div aria-hidden="true">
        <div className="cm-label-code">
          {m(1)}
          <svg viewBox="0 0 416 100" preserveAspectRatio="xMinYMid meet">
            <text x="0" y="86" textLength={416} lengthAdjust="spacingAndGlyphs" fontSize="100" fontWeight="700" fill="currentColor">
              {code}
            </text>
          </svg>
        </div>
        <div className="cm-label-job">
          {m(4)}
          <span>
            JOB J-214 <span className="cm-label-jobname">School renovation</span>
          </span>
        </div>
        <div className="cm-label-desc">Lighting fixtures</div>
        <div className="cm-label-codes">
          <span className="cm-label-qr">
            {m(2)}
            <QrCode payload={SAMPLE_PALLET_PAYLOAD} />
          </span>
          <span className="cm-label-bar">
            {m(3)}
            <Code128 text={SAMPLE_PALLET_PAYLOAD} caption={false} />
          </span>
        </div>
        <div className="cm-label-foot">
          {m(5)}
          <span>WH-01 · If the QR is damaged, type {code}</span>
        </div>
      </div>
    </figure>
  );
}

/** A rack label: the rack code first, with its QR. */
export function RackLabelMock({ code = 'A-03-02' }: { code?: string }) {
  return (
    <figure className="cm-rack-label" role="img" aria-label={`Sample rack label for ${code} with a QR code and the line: scan the pallet first, then this label.`}>
      <div aria-hidden="true" className="cm-rack-inner">
        <QrCode payload={SAMPLE_RACK_PAYLOAD} className="cm-rack-qr" />
        <div className="cm-rack-text">
          <span className="cm-rack-kind">Rack location</span>
          <span className="cm-rack-code">{code}</span>
          <span className="cm-rack-foot">Scan the pallet first, then this label</span>
        </div>
      </div>
    </figure>
  );
}

// ------------------------------------------------------------------ scanning

/** Printed command barcodes: a scanner reads them like any label. */
export function CommandCard({ payload, label, hint }: { payload: string; label: string; hint?: string }) {
  return (
    <div className="cm-cmd">
      <div className="cm-cmd-top">
        <span className="cm-cmd-label">{label}</span>
        <span className="cm-cmd-tag">Command</span>
      </div>
      <Code128 text={payload} />
      {hint && <p className="cm-cmd-hint">{hint}</p>}
    </div>
  );
}

/** Keyboard mode: the scanner types what the label holds and presses Enter, and the page does the rest. */
export function WedgeFlow({ payload = SAMPLE_PALLET_PAYLOAD, code = 'P-000042' }: { payload?: string; code?: string }) {
  return (
    <figure className="cm-wedge" role="img" aria-label={`A scanner in keyboard mode reads a pallet label, types the code it holds, ${payload}, and presses Enter. ${BRAND.name} opens pallet ${code}: Lighting fixtures, last confirmed at A-03-02.`}>
      <div className="cm-wedge-row" aria-hidden="true">
        <div className="cm-wedge-step">
          <span className="cm-wedge-n">1</span>
          <span className="cm-wedge-icon">
            <Icon name="scanner" />
          </span>
          <span className="cm-wedge-cap">Scan the label</span>
        </div>
        <span className="cm-wedge-arrow" />
        <div className="cm-wedge-step">
          <span className="cm-wedge-n">2</span>
          <span className="cm-wedge-keys">
            <span className="cm-wedge-typed">
              {payload}
              <span className="cm-caret" />
            </span>
            <kbd className="enter">Enter</kbd>
          </span>
          <span className="cm-wedge-cap">It types what the label holds, fast, then Enter</span>
        </div>
        <span className="cm-wedge-arrow" />
        <div className="cm-wedge-step">
          <span className="cm-wedge-n">3</span>
          <span className="cm-wedge-result">
            <span className="cm-wedge-top">
              <Icon name="checkCircle" />
              <span className="cm-pcode">{code}</span>
            </span>
            <span className="cm-faint">Lighting fixtures</span>
            <Plate code="A-03-02" size="sm" />
          </span>
          <span className="cm-wedge-cap">The pallet opens</span>
        </div>
      </div>
    </figure>
  );
}

// ------------------------------------------------------------------ reliability

/** Offline: the banner, a queued move, and a conflict to decide. */
export function OfflineMock() {
  return (
    <Phone tab="move" label="The portal offline on a phone: a banner says it is showing what the device last knew. One move is waiting to send. Another needs a decision because someone changed that pallet first.">
      <div className="cm-offline">
        <Icon name="wifiOff" />
        <span>
          <strong>Offline.</strong> Showing what this phone last knew. Moves are queued.
        </span>
      </div>
      <Head title="Sync and offline" />
      <div className="cm-q">
        <div className="cm-q-top">
          <span className="tag warn">Waiting to send</span>
          <span className="cm-pcode">P-000012</span>
        </div>
        <span>B-01-01 → A-03-02</span>
        <span className="cm-faint">Queued, not confirmed</span>
      </div>
      <div className="cm-q conflict">
        <div className="cm-q-top">
          <span className="tag bad">Needs your decision</span>
          <span className="cm-pcode">P-000020</span>
        </div>
        <span>Someone changed this pallet first. The server has it at B-02-01.</span>
        <div className="cm-row2">
          <FakeBtn tone="primary">Still move it</FakeBtn>
          <FakeBtn>Keep theirs</FakeBtn>
        </div>
      </div>
    </Phone>
  );
}

/** Integrity lab: the blueprint's tests, run in the browser. */
export function LabMock() {
  const tests = ['A complete example shift', 'Response lost after commit', 'Concurrent moves from one revision', 'Removed member submits queued work', 'Atomic, repeat-safe CSV import'];
  return (
    <Browser screen="Integrity lab" label="The Integrity lab: five tests listed, each marked Passed, including Response lost after commit and Concurrent moves from one revision.">
      <div className="cm-station-head">
        <Head title="Integrity lab" />
        <FakeBtn tone="primary" icon="play">
          Run all
        </FakeBtn>
      </div>
      <ul className="cm-tests">
        {tests.map((t) => (
          <li key={t}>
            <Icon name="checkCircle" />
            <span className="grow">{t}</span>
            <span className="tag ok">Passed</span>
          </li>
        ))}
      </ul>
    </Browser>
  );
}

// ------------------------------------------------------------------ learning

/** The portal walkthrough: a highlighted spot and a tip beside it. */
export function TourMock() {
  return (
    <Browser screen="Find" label="The portal tour: the Find screen is dimmed except the search box, which is highlighted. A tip card explains what the search box does, with Back and Next buttons.">
      <div className="cm-tour">
        <Head eyebrow="Warehouse" title="Find materials" />
        <div className="cm-search cm-spot">
          <Icon name="find" />
          <span className="cm-faint">J-214, P-000042, A-03-02…</span>
        </div>
        <div className="cm-tip">
          <div className="cm-tip-top">
            <Icon name="tour" /> Take the tour
          </div>
          <strong>One box finds anything</strong>
          <p>Type a job, a pallet code, a rack or a few words. Results show where each pallet was last confirmed.</p>
          <div className="cm-row2">
            <FakeBtn>Back</FakeBtn>
            <FakeBtn tone="primary">Next</FakeBtn>
          </div>
        </div>
        <div className="cm-ghost-rows">
          <i />
          <i />
        </div>
      </div>
    </Browser>
  );
}

/** Help: the tutorial video spot, chapters and questions. */
export function HelpMock() {
  return (
    <Browser screen="Help" label="The Help page: a tutorial video area marked video coming soon, a list of chapters, and common questions.">
      <Head title="Help" />
      <div className="cm-video">
        <span className="cm-video-play">
          <Icon name="play" />
        </span>
        <span className="cm-video-tag">Video coming soon</span>
      </div>
      <ul className="cm-chapters">
        {['Receive a delivery', 'Two-scan moves', 'Find anything', 'Set up a scanner'].map((c, i) => (
          <li key={c}>
            <span className="cm-v">{String(i + 1).padStart(2, '0')}</span> {c}
          </li>
        ))}
      </ul>
    </Browser>
  );
}

// ------------------------------------------------------------------ lifecycle diagram

/**
 * The pallet lifecycle as a diagram: Received, Stored, Dispatched, Returned, Missing, Retired.
 * A wide drawing for tablets and computers and a tall one for phones; CSS shows one.
 */
export function LifecycleDiagram() {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const arrow = `lc-a-${id}`;
  const arrowSoft = `lc-s-${id}`;
  const defs = (
    <defs>
      <marker id={arrow} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M0 0L10 5L0 10z" className="lc-head" />
      </marker>
      <marker id={arrowSoft} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M0 0L10 5L0 10z" className="lc-head-soft" />
      </marker>
    </defs>
  );
  const m = `url(#${arrow})`;
  const ms = `url(#${arrowSoft})`;
  const title = 'Pallet lifecycle';
  const desc =
    'Receive creates a pallet as Received. Placing it on a rack makes it Stored; moves keep it Stored at a new rack. Dispatch sends it to the job site. When it comes back, the return is recorded and it is Received again, ready to place. A received or stored pallet can be marked Missing; a supervisor records where it was found and it is Stored again. A supervisor can retire a pallet from any state.';

  return (
    <div className="lc">
      <svg className="lc-wide" viewBox="0 0 1000 480" role="img" aria-labelledby={`${id}-t ${id}-d`}>
        <title id={`${id}-t`}>{title}</title>
        <desc id={`${id}-d`}>{desc}</desc>
        {defs}
        {/* edges */}
        <path className="lc-edge" d="M232 246H396" markerEnd={m} />
        <path className="lc-edge" d="M602 246H766" markerEnd={m} />
        <path className="lc-edge" d="M470 284C470 350 530 350 530 288" markerEnd={m} />
        <path className="lc-edge" d="M870 284V404H604" markerEnd={m} />
        <path className="lc-edge" d="M398 404H130V288" markerEnd={m} />
        <path className="lc-edge soft" d="M470 208V112" markerEnd={ms} />
        <path className="lc-edge soft" d="M130 208V74H396" markerEnd={ms} />
        <path className="lc-edge soft" d="M530 112V204" markerEnd={ms} />
        <path className="lc-edge dash" d="M602 74H766" markerEnd={ms} />
        <path className="lc-edge dash" d="M870 208V112" markerEnd={ms} />

        {/* edge labels */}
        <text className="lc-l" x="314" y="234" textAnchor="middle">Place</text>
        <text className="lc-ls" x="314" y="270" textAnchor="middle">scan pallet, scan rack</text>
        <text className="lc-l" x="684" y="234" textAnchor="middle">Dispatch</text>
        <text className="lc-ls" x="684" y="270" textAnchor="middle">to the job site</text>
        <text className="lc-l" x="546" y="326">Move</text>
        <text className="lc-ls" x="546" y="344">new rack, still Stored</text>
        <text className="lc-l" x="458" y="164" textAnchor="end">Mark missing</text>
        <text className="lc-l" x="542" y="158">Found</text>
        <text className="lc-ls" x="542" y="176">a supervisor records the rack</text>
        <text className="lc-l" x="262" y="62" textAnchor="middle">Mark missing</text>
        <text className="lc-l" x="684" y="62" textAnchor="middle">Retire</text>
        <text className="lc-l" x="882" y="164">Retire</text>
        <text className="lc-ls" x="500" y="452" textAnchor="middle">Record the return. It is Received again, ready to place.</text>

        {/* nodes */}
        <Node x={30} y={208} tone="RECEIVED" title="Received" sub="in the building, no rack yet" />
        <Node x={400} y={208} tone="STORED" title="Stored" sub="on a rack, last confirmed" />
        <Node x={770} y={208} tone="DISPATCHED" title="Dispatched" sub="left for the job site" />
        <Node x={400} y={36} tone="MISSING" title="Missing" sub="not where it was recorded" />
        <Node x={770} y={36} tone="RETIRED" title="Retired" sub="supervisor, from any state" />
        <g className="lc-pill">
          <rect x={400} y={382} width={200} height={44} rx={22} />
          <text x={500} y={410} textAnchor="middle">Returned</text>
        </g>
      </svg>

      <svg className="lc-tall" viewBox="0 0 340 660" role="img" aria-labelledby={`${id}-t2 ${id}-d2`}>
        <title id={`${id}-t2`}>{title}</title>
        <desc id={`${id}-d2`}>{desc}</desc>
        {defs}
        <path className="lc-edge" d="M106 92V190" markerEnd={m} />
        <path className="lc-edge" d="M106 272V370" markerEnd={m} />
        <path className="lc-edge" d="M106 452V508" markerEnd={m} />
        <path className="lc-edge" d="M30 534H12V52H26" markerEnd={m} />
        <path className="lc-edge soft" d="M184 220H210" markerEnd={ms} />
        <path className="lc-edge soft" d="M212 244H186" markerEnd={ms} />
        <path className="lc-edge dash" d="M184 412H210" markerEnd={ms} />
        <text className="lc-l" x="118" y="136">Place</text>
        <text className="lc-ls" x="118" y="154">scan pallet, scan rack</text>
        <text className="lc-l" x="118" y="316">Dispatch</text>
        <text className="lc-ls" x="118" y="334">to the job site</text>
        <text className="lc-ls" x="106" y="584" textAnchor="middle">Record the return.</text>
        <text className="lc-ls" x="106" y="602" textAnchor="middle">It is Received again.</text>
        <Node x={30} y={14} w={152} tone="RECEIVED" title="Received" sub="no rack yet" />
        <Node x={30} y={194} w={152} tone="STORED" title="Stored" sub="moves keep it here" />
        <Node x={30} y={374} w={152} tone="DISPATCHED" title="Dispatched" sub="left for the site" />
        <Node x={214} y={194} w={118} tone="MISSING" title="Missing" sub="found: Stored" />
        <Node x={214} y={374} w={118} tone="RETIRED" title="Retired" sub="any state" />
        <g className="lc-pill">
          <rect x={30} y={512} width={152} height={44} rx={22} />
          <text x={106} y={540} textAnchor="middle">Returned</text>
        </g>
      </svg>
    </div>
  );
}

const LC_TONE: Record<'RECEIVED' | 'STORED' | 'DISPATCHED' | 'MISSING' | 'RETIRED', string> = {
  RECEIVED: 'var(--warn)',
  STORED: 'var(--ok)',
  DISPATCHED: 'var(--slate)',
  MISSING: 'var(--bad)',
  RETIRED: 'var(--ink-3)',
};

function Node({ x, y, w = 200, tone, title, sub }: { x: number; y: number; w?: number; tone: keyof typeof LC_TONE; title: string; sub: string }) {
  return (
    <g className="lc-node">
      <rect x={x} y={y} width={w} height={76} rx={10} />
      <rect x={x} y={y} width={8} height={76} rx={3} style={{ fill: LC_TONE[tone] }} />
      <text className="lc-t" x={x + 22} y={y + 36}>
        {title}
      </text>
      <text className="lc-s" x={x + 22} y={y + 58}>
        {sub}
      </text>
    </g>
  );
}
