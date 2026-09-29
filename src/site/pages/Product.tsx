// Product page ("What it is"): the problem, the answer, how a pallet moves through its life,
// what every answer includes, roles, labels, devices, offline behavior and history.

import type { ReactNode } from 'react';
import { BRAND } from '../../brand';
import { useApp } from '../../app/state';
import { Icon, type IconName } from '../../ui/icons';
import { HoldBadge, Plate, ROLE_DESC, ROLE_LABEL, StateBadge } from '../../ui/ui';
import type { Role } from '../../domain/types';
import { CtaBand, FeatureCards, PageHero, Section, SiteLink } from '../kit';
import { AnswerCard, CorrectionMock, FindMock, LifecycleDiagram, OfflineMock, PalletLabelMock, RackLabelMock, WhereVariants } from './c-mocks';
import './pages-c.css';

export function ProductPage() {
  const { go } = useApp();
  return (
    <>
      <div className="site-inner">
        <PageHero
          eyebrow="Product"
          title="A record for every pallet"
          lede={`${BRAND.name} is pallet tracking for construction warehouses. Every pallet gets a label, every move is two scans, and anyone on the team can find anything with one search.`}
          art={<HeroArt />}
        >
          <button className="site-btn primary" onClick={() => go('showcase')}>
            See it in action
            <Icon name="arrowRight" />
          </button>
          <SiteLink to="home" hash="tour" className="site-btn ghost">
            <Icon name="play" />
            Take the guided tour
          </SiteLink>
        </PageHero>
      </div>

      <Problem />
      <Answer />
      <Lifecycle />
      <Answers />
      <Roles />
      <Labels />
      <Devices />
      <Offline />
      <History />

      <CtaBand title="Put every pallet on record." />
    </>
  );
}

function HeroArt() {
  const bays: { code: string; loads: number[]; on?: boolean }[] = [
    { code: 'A-03-01', loads: [70, 52] },
    { code: 'A-03-02', loads: [84, 60], on: true },
    { code: 'A-03-03', loads: [46] },
  ];
  return (
    <div className="pd-hero-art">
      <div className="pd-rack" aria-hidden="true">
        {bays.map((b) => (
          <div key={b.code} className={`pd-bay ${b.on ? 'on' : ''}`}>
            {b.on && (
              <span className="pd-pin">
                <Icon name="pin" /> P-000042
              </span>
            )}
            <div className="pd-load">
              {b.loads.map((h, i) => (
                <span key={i} className="pd-pallet">
                  <i style={{ height: h }} />
                  <b />
                </span>
              ))}
            </div>
            <div className="pd-beam">
              <span className="pd-beam-plate">{b.code}</span>
            </div>
          </div>
        ))}
      </div>
      <AnswerCard query={false} />
    </div>
  );
}

// ------------------------------------------------------------------ the problem

function Problem() {
  return (
    <Section
      tone="surface"
      eyebrow="The problem"
      title="Material for a dozen jobs. One yard. No map."
      lede="Construction warehouses hold deliveries for many jobs at once. Pallets arrive early, wait for weeks, and get moved to make room. When a crew finally needs them, someone has to know where they went."
    >
      <FeatureCards
        columns={4}
        items={[
          { icon: 'guide', title: 'Folders and clipboards', body: 'Receiving slips sit in a folder in the office. They say what came in, not where it went after that.' },
          { icon: 'map', title: 'Walking the yard', body: 'When nobody is sure, someone walks the racks reading labels until the right pallet turns up. That time comes out of real work.' },
          { icon: 'user', title: 'The one person who knows', body: 'Often one person keeps the whole yard in their head. On their day off, everything slows down.' },
          { icon: 'grid', title: 'Spreadsheets that drift', body: 'A spreadsheet is right until the first forklift move nobody wrote down. After that, nobody trusts it.' },
        ]}
      />
    </Section>
  );
}

// ------------------------------------------------------------------ the answer

function Answer() {
  const steps: { n: string; title: string; body: string; art: ReactNode }[] = [
    {
      n: '01',
      title: 'Label every pallet',
      body: 'When a delivery arrives, each pallet is received against its job and gets its own code and QR label.',
      art: (
        <span className="pd-mini">
          <span className="pd-mini-job">J-214</span>
          <Icon name="arrowRight" />
          <Plate code="P-000042" size="sm" />
        </span>
      ),
    },
    {
      n: '02',
      title: 'Two scans to move',
      body: 'Scan the pallet, scan the rack, confirm. The new spot is saved with the time and the person who scanned it.',
      art: (
        <span className="pd-mini">
          <Plate code="P-000042" size="sm" />
          <Icon name="arrowRight" />
          <Plate code="A-03-02" size="sm" />
          <Icon name="checkCircle" className="pd-mini-ok" />
        </span>
      ),
    },
    {
      n: '03',
      title: 'One search to find',
      body: 'Type a job, a code, a rack or a few words. Each result shows where the pallet was last confirmed, and when.',
      art: (
        <span className="pd-mini pd-mini-search">
          <Icon name="find" />
          J-214 lighting
        </span>
      ),
    },
  ];
  return (
    <Section tone="ink" eyebrow="The answer" title="Label it. Scan it. Find it." lede="Three habits replace the folder, the walk and the guesswork. Each one takes seconds.">
      <ol className="pd-answer">
        {steps.map((s) => (
          <li key={s.n}>
            <span className="pd-answer-n">{s.n}</span>
            <h3>{s.title}</h3>
            <p>{s.body}</p>
            <div className="pd-answer-art" aria-hidden="true">
              {s.art}
            </div>
          </li>
        ))}
      </ol>
    </Section>
  );
}

// ------------------------------------------------------------------ lifecycle

function Lifecycle() {
  const states: { badge: ReactNode; body: string }[] = [
    { badge: <StateBadge state="RECEIVED" />, body: 'Checked in against a job. In the building, not on a rack yet. It shows as Unassigned, so it is never mistaken for missing.' },
    { badge: <StateBadge state="STORED" />, body: 'On a rack. The record shows which rack and when someone last confirmed it. Moves keep it Stored at the new rack.' },
    { badge: <StateBadge state="DISPATCHED" />, body: 'Sent to the job site with a destination. It no longer has a rack, and its history stays with it.' },
    {
      badge: (
        <span className="pd-event">
          <Icon name="returnIcon" /> Returned
        </span>
      ),
      body: 'Material came back. Recording the return makes it Received again, so it goes back on a rack with a scan. A hold can be added on the way in.',
    },
    { badge: <StateBadge state="MISSING" />, body: 'Someone looked and it was not there. Its last rack is kept as history. When it turns up, a supervisor records the rack it was found at.' },
    { badge: <StateBadge state="RETIRED" />, body: 'No longer tracked: used up, written off, or split into new pallets. Only a supervisor can retire a pallet, and it needs a reason.' },
  ];
  return (
    <Section
      eyebrow="How it works"
      title="The life of a pallet"
      lede="Every pallet moves through a few clear states. Each change is one scan or one tap. It is checked before it is saved, then written to the pallet's history."
    >
      <div className="pd-lc-wrap">
        <LifecycleDiagram />
      </div>
      <ul className="pd-states">
        {states.map((s, i) => (
          <li key={i}>
            <div className="pd-state-badge">{s.badge}</div>
            <p>{s.body}</p>
          </li>
        ))}
      </ul>
      <div className="pd-hold">
        <HoldBadge />
        <p>
          <strong>Hold is a flag, not a place.</strong> It can sit on a received, stored or missing pallet, for damage, a wrong delivery or a dispute. It blocks dispatch and splits
          until a supervisor clears it with a reason. Moving a held pallet is still allowed, so it can go to a quarantine area.
        </p>
      </div>
    </Section>
  );
}

// ------------------------------------------------------------------ answers

function Answers() {
  return (
    <Section tone="surface" eyebrow="Answers, not guesses" title="Every answer says where, when and who">
      <div className="pd-split">
        <div className="pd-split-text">
          <p className="site-lede">
            {BRAND.name} does not pretend to see the yard. It tells you what was recorded: the rack, when it was last confirmed, and who scanned it. It cannot see a move nobody
            scanned, so it never calls a location live.
          </p>
          <div className="pd-quote" aria-label="Example answer">
            <span className="pd-quote-mark" aria-hidden="true">
              <Icon name="pin" />
            </span>
            <p>
              Last confirmed at <strong>A-03-02</strong>, 2 hours ago, by the operator.
            </p>
          </div>
          <h3 className="pd-h3">Every kind of “where”, said plainly</h3>
          <WhereVariants />
        </div>
        <div className="pd-split-art">
          <FindMock />
        </div>
      </div>
    </Section>
  );
}

// ------------------------------------------------------------------ roles

const ROLES: { role: Role; icon: IconName }[] = [
  { role: 'OWNER', icon: 'key' },
  { role: 'SUPERVISOR', icon: 'shield' },
  { role: 'OPERATOR', icon: 'scanner' },
  { role: 'VIEWER', icon: 'eye' },
];

/** Minimum role for each kind of work, matching the server's checks. */
const MATRIX: { what: string; min: Role; note?: string }[] = [
  { what: 'Search, records, photos and history', min: 'VIEWER' },
  { what: 'Receive, place, move and confirm locations', min: 'OPERATOR' },
  { what: 'Dispatch and record returns', min: 'OPERATOR' },
  { what: 'Put on hold, mark missing, add photos', min: 'OPERATOR' },
  { what: 'Clear holds and record found pallets', min: 'SUPERVISOR' },
  { what: 'Correct, split and retire pallets', min: 'SUPERVISOR' },
  { what: 'Jobs, rack locations and label replacement', min: 'SUPERVISOR' },
  { what: 'Import and export CSV', min: 'SUPERVISOR' },
  { what: 'Invite people and change roles', min: 'SUPERVISOR', note: 'Only owners grant supervisor or owner access.' },
];

const RANK: Record<Role, number> = { VIEWER: 0, OPERATOR: 1, SUPERVISOR: 2, OWNER: 3 };

/** The same table as one line per row, for phones. */
const MIN_TEXT: Record<Role, string> = { VIEWER: 'Everyone', OPERATOR: 'Operators and up', SUPERVISOR: 'Supervisors and owners', OWNER: 'Owners' };

function Roles() {
  return (
    <Section
      eyebrow="Roles"
      title="Four roles. Clear limits."
      lede="Everyone sees the same records. What each person can change depends on their role, and the server checks the role on every change, not just which buttons show."
    >
      <ul className="pd-roles">
        {ROLES.map((r) => (
          <li key={r.role}>
            <span className="pd-role-icon">
              <Icon name={r.icon} />
            </span>
            <h3>{ROLE_LABEL[r.role]}</h3>
            <p>{ROLE_DESC[r.role]}</p>
          </li>
        ))}
      </ul>
      <div className="table-wrap pd-matrix-wrap">
        <table className="pd-matrix">
          <caption className="sr-only">What each role can do</caption>
          <thead>
            <tr>
              <th scope="col">Work</th>
              {(['VIEWER', 'OPERATOR', 'SUPERVISOR', 'OWNER'] as Role[]).map((r) => (
                <th key={r} scope="col">
                  {ROLE_LABEL[r]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MATRIX.map((m) => (
              <tr key={m.what}>
                <th scope="row">
                  {m.what}
                  {m.note && <span className="pd-matrix-note">{m.note}</span>}
                  <span className="pd-matrix-min" aria-hidden="true">
                    {MIN_TEXT[m.min]}
                  </span>
                </th>
                {(['VIEWER', 'OPERATOR', 'SUPERVISOR', 'OWNER'] as Role[]).map((r) => (
                  <td key={r}>
                    {RANK[r] >= RANK[m.min] ? (
                      <span className="pd-yes">
                        <Icon name="check" />
                        <span className="sr-only">Yes</span>
                      </span>
                    ) : (
                      <span className="pd-no">
                        <span aria-hidden="true">–</span>
                        <span className="sr-only">No</span>
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

// ------------------------------------------------------------------ labels

function Labels() {
  return (
    <Section
      tone="surface"
      eyebrow="Labels"
      title="Labels you can read from the aisle"
      lede="Print a label for each pallet when it arrives, and a label for each rack once. The code is printed big, with a QR code and a barcode beside it for scanners."
    >
      <div className="pd-labels">
        <div className="pd-labels-art">
          <PalletLabelMock />
          <RackLabelMock />
        </div>
        <ul className="pc-checks">
          <li>
            <strong>4x6 pallet labels or full sheets,</strong> printed from the browser, with a one-inch calibration box to check the printer scale.
          </li>
          <li>
            <strong>QR code and Code 128 barcode.</strong> The QR holds a random token and the barcode holds the printed code, like <span className="pc-nw">P-000042</span>. Phone cameras read the QR, and scanners that only read straight-line barcodes use the Code 128.
          </li>
          <li>
            <strong>The big printed code is the backup.</strong> If a label is torn, type <span className="pc-nw">P-000042</span>, or just p42.
          </li>
          <li>
            <strong>Edits never break a label.</strong> The QR carries a random token and the barcode carries only the pallet code, never the job or description, so changing details keeps the label working.
          </li>
          <li>
            <strong>Reprint a damaged label</strong> with the same code. If a label was copied or misused, a supervisor can replace it so the old QR stops working. Pallets whose printed details changed land on a reprint list.
          </li>
          <li>
            <strong>Rack labels</strong> carry the rack code in large type and the reminder: scan the pallet first, then this label.
          </li>
        </ul>
      </div>
      <div className="pc-more">
        <SiteLink to="hardware" className="site-btn ghost">
          See scanners and label anatomy
          <Icon name="arrowRight" />
        </SiteLink>
      </div>
    </Section>
  );
}

// ------------------------------------------------------------------ devices

function Devices() {
  return (
    <Section
      eyebrow="Works where you are"
      title="Works on any phone or computer browser"
      lede="There is nothing to download from an app store. Open it in a modern browser on a phone, tablet or computer. Install it to the home screen and it opens like an app."
    >
      <FeatureCards
        columns={4}
        items={[
          { icon: 'phone', title: 'Phones', body: 'Large buttons and bottom tabs for one-handed use on the floor. The camera reads QR labels when no scanner is around.' },
          { icon: 'grid', title: 'Computers', body: 'The office sees the same records with a full sidebar, tables and exports. On Find, press / to jump to the search box.' },
          { icon: 'scanner', title: 'Scanners', body: 'USB and Bluetooth scanners in keyboard mode type straight into the page. A scan station screen keeps hands on the scanner.' },
          { icon: 'download', title: 'Install it', body: 'Add it to the home screen from the browser menu. It opens full screen, like any other app on the phone.' },
        ]}
      />
    </Section>
  );
}

// ------------------------------------------------------------------ offline

function Offline() {
  return (
    <Section tone="surface" eyebrow="Offline" title="Bad signal? Keep moving pallets.">
      <div className="pd-split">
        <div className="pd-split-text">
          <p className="site-lede">
            The back of a steel building is often a dead zone. {BRAND.name} keeps showing what the phone last knew, marked with the time it was saved, and lets moves and location checks wait on the phone until the signal comes back.
          </p>
          <ul className="pc-checks">
            <li>
              <strong>Moves and location checks</strong> are saved on the phone and marked <em>queued, not confirmed</em> until the server accepts them.
            </li>
            <li>
              <strong>Everything else waits</strong> for the connection, so nothing riskier than a move happens blind.
            </li>
            <li>
              <strong>Queued moves go out in order</strong> when the signal returns. If someone changed that pallet first, you decide what happens. Nothing is overwritten silently.
            </li>
            <li>
              <strong>Lost answers are checked, not guessed.</strong> If the reply never arrives, the app asks the server whether the change was saved, so a retry never makes a duplicate.
            </li>
          </ul>
        </div>
        <div className="pd-split-art">
          <OfflineMock />
        </div>
      </div>
    </Section>
  );
}

// ------------------------------------------------------------------ history

function History() {
  return (
    <Section eyebrow="History" title="History is never erased">
      <div className="pd-split reverse">
        <div className="pd-split-text">
          <p className="site-lede">
            Every receipt, move, hold and dispatch adds an entry: what changed, before and after, when, and which account did it. Mistakes are fixed with a correction and a reason. The original entry stays where it was.
          </p>
          <ul className="pc-checks">
            <li>
              <strong>The name on an entry comes from the signed-in account,</strong> never from text someone typed.
            </li>
            <li>
              <strong>Refused attempts leave no trace,</strong> because they changed nothing. The feed shows accepted changes only.
            </li>
            <li>
              <strong>Supervisors and owners can export</strong> the full history as a spreadsheet file at any time.
            </li>
          </ul>
        </div>
        <div className="pd-split-art">
          <CorrectionMock />
        </div>
      </div>
    </Section>
  );
}
