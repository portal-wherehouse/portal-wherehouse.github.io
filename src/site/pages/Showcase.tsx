// See it in action: a tour of everything the portal does, in seven groups with a sticky sub-navigation,
// each feature with a one-line summary, a few specifics, and portal mock-ups for the main ones.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { BRAND } from '../../brand';
import { commandPayload } from '../../device/scanCommands';
import { Icon, type IconName } from '../../ui/icons';
import { CtaBand, PageHero, PortalCTA, Section, SiteLink } from '../kit';
import {
  ActivityMock,
  CommandCard,
  FindMock,
  HelpMock,
  ImportMock,
  LabMock,
  MapMock,
  MoveMock,
  OfflineMock,
  OverviewMock,
  PeopleMock,
  PickListMock,
  ReceiveMock,
  ReconcileMock,
  RecordMock,
  StationMock,
  TourMock,
  WedgeFlow,
  keepCodes,
} from './c-mocks';
import './pages-c.css';

interface Feature {
  icon: IconName;
  name: string;
  line: string;
  bullets: string[];
  /** Who can use it, when that matters. */
  who?: string;
  mock?: ReactNode;
}

interface Group {
  id: string;
  chip: string;
  icon: IconName;
  title: string;
  lede: string;
  tone: 'plain' | 'surface' | 'ink';
  /** The first feature with a mock-up is shown large; the rest with mock-ups as tiles; the others as cards. */
  features: Feature[];
}

const GROUPS: Group[] = [
  {
    id: 'floor',
    chip: 'Floor work',
    icon: 'hardhat',
    title: 'Floor work',
    lede: 'The scans and taps the crew makes all day: receiving, moving, dispatching, and dealing with what does not go to plan.',
    tone: 'plain',
    features: [
      {
        icon: 'move',
        name: 'Move',
        line: 'Scan the pallet, scan the rack, confirm.',
        who: 'Operators and up',
        mock: <MoveMock />,
        bullets: [
          'Before anything is saved you see the pallet, its job, where it was and where it is going.',
          'Scanning the rack first, or two pallets in a row, gets a plain warning instead of a wrong move.',
          'Scan the rack a pallet is already on and it records that the pallet is still there.',
          'A double tap on Confirm still sends one request.',
        ],
      },
      {
        icon: 'receive',
        name: 'Receive',
        line: 'Record a delivery against its job and label each pallet.',
        who: 'Operators and up',
        mock: <ReceiveMock />,
        bullets: [
          'Choose the job, describe what arrived, and add a supplier reference or a photo if you like.',
          'The server hands out the next readable code, like P-000042, so two phones never make the same one.',
          'Print the label right away, or tap Place now to put it on a rack.',
        ],
      },
      {
        icon: 'target',
        name: 'Scan station',
        line: 'A hands-free screen for a scanner on a cart or at a desk.',
        mock: <StationMock />,
        bullets: [
          'Four modes: Look up, Move, Put-away and Count.',
          'Put-away: scan one rack, then every pallet going onto it.',
          'Switch modes and confirm by scanning printed command barcodes.',
        ],
      },
      {
        icon: 'truck',
        name: 'Dispatch and returns',
        line: 'Send pallets to the job site and take back what returns.',
        who: 'Operators and up',
        bullets: [
          'Dispatch needs a destination and an open job. A pallet on hold cannot leave.',
          'A dispatched pallet has no rack. Its history goes with it.',
          'Record a return with a condition note, and add a hold if it came back damaged.',
          'Returned pallets are Received again, ready to place with a scan.',
        ],
      },
      {
        icon: 'hold',
        name: 'Holds',
        line: 'Flag damaged, wrong or disputed material so it cannot go out.',
        who: 'Operators apply, supervisors clear',
        bullets: ['Put a pallet on hold with a reason, right from its record.', 'A hold blocks dispatch and splits until a supervisor clears it.', 'Clearing needs a reason too. Both stay in the history.'],
      },
      {
        icon: 'split',
        name: 'Splits',
        line: 'Break one pallet into several, each with its own label.',
        who: 'Supervisors',
        bullets: [
          'Describe each portion, including any remainder, and assign each one to a job.',
          'The original is retired, and the new pallets record where they came from.',
          'Only a stored pallet that is not on hold can be split, and it needs a connection.',
        ],
      },
    ],
  },
  {
    id: 'finding',
    chip: 'Finding',
    icon: 'find',
    title: 'Finding',
    lede: 'Anyone with an account can answer “where is it?” without walking the yard or calling someone.',
    tone: 'surface',
    features: [
      {
        icon: 'find',
        name: 'Find',
        line: 'One box for job numbers, pallet codes, racks and descriptions.',
        who: 'Everyone',
        mock: <FindMock />,
        bullets: [
          'Exact codes rank first, then codes that start with what you typed, then descriptions.',
          'Filter by state, job, location or hold, or use the quick views for what needs attention.',
          'A typo in a job or rack code gets a “did you mean” suggestion.',
          'On a keyboard, press / to jump straight to search.',
        ],
      },
      {
        icon: 'history',
        name: 'Pallet record and history',
        line: 'Everything about one pallet on one screen.',
        mock: <RecordMock />,
        bullets: [
          'Where it was last confirmed, its job, description, up to three photos, and label status.',
          'Only the actions that fit its state and your role, like Move, Dispatch or Record return.',
          'The full history with versions, times and accounts. Supervisors can correct an entry with a reason.',
        ],
      },
      {
        icon: 'map',
        name: 'Warehouse map',
        line: 'Every rack by zone and aisle, with what is recorded on it.',
        mock: <MapMock />,
        bullets: ['See which racks have pallets recorded, which have nothing recorded, and which hold a pallet on hold.', 'Open any rack to see the pallets recorded there.', 'Counts come from records. The app does not guess rack capacity.'],
      },
    ],
  },
  {
    id: 'oversight',
    chip: 'Oversight',
    icon: 'overview',
    title: 'Oversight',
    lede: 'For supervisors and the office: what is in the yard, what needs attention, and what changed.',
    tone: 'plain',
    features: [
      {
        icon: 'overview',
        name: 'Overview dashboard',
        line: 'The state of the yard on one screen.',
        mock: <OverviewMock />,
        bullets: [
          'Pallets on hand, broken down by state.',
          'Tiles for what needs attention: placement, missing, holds, reprints, and pallets not verified in 3 or more days.',
          'Accepted changes over the last 14 days, the busiest racks, and totals for every job.',
        ],
      },
      {
        icon: 'reconcile',
        name: 'Reconcile queues',
        line: 'Short lists that keep the records matching the floor.',
        mock: <ReconcileMock />,
        bullets: ['Needs placement, Missing, On hold, Labels to reprint, and Not verified in 3+ days.', 'Oldest first, each with the one workflow that fixes it.', 'Every fix lands in the pallet’s history.'],
      },
      {
        icon: 'activity',
        name: 'Activity feed',
        line: 'Every accepted change, by day, newest first.',
        mock: <ActivityMock />,
        bullets: ['Filter by the kind of change or by person.', 'Refused attempts never appear, because they changed nothing.'],
      },
      {
        icon: 'checklist',
        name: 'Cycle counts',
        line: 'Check racks against the records, a few at a time.',
        bullets: [
          'Count mode in the Scan station: scan a rack, then everything on it.',
          'Confirm still here on any stored pallet updates when it was last confirmed.',
          'The Not verified in 3+ days list tells you which racks to walk next.',
        ],
      },
    ],
  },
  {
    id: 'setup',
    chip: 'Setup and admin',
    icon: 'settings',
    title: 'Setup and admin',
    lede: 'Jobs, racks, labels, spreadsheets and people. Set up once, then adjust as work changes.',
    tone: 'surface',
    features: [
      {
        icon: 'jobs',
        name: 'Jobs and pick lists',
        line: 'Every pallet belongs to a job, and every job has a pick list sorted by rack.',
        who: 'Supervisors manage jobs',
        mock: <PickListMock />,
        bullets: [
          'Create, close and reopen jobs. A job cannot close while its material is still here, missing or on hold.',
          'Print a pick list sorted by rack, so a crew walks the yard once.',
          'Counts per job: on hand, missing, on hold and dispatched.',
        ],
      },
      {
        icon: 'import',
        name: 'Import and export CSV',
        line: 'Bring in racks, jobs and existing pallets from a spreadsheet. Take everything out.',
        who: 'Supervisors and owners',
        mock: <ImportMock />,
        bullets: [
          'Each import is checked row by row. Every row goes in, or none do.',
          'Imported pallets start as Received with no rack. The crew places each one with a scan.',
          'Exports cover pallets, the full history, locations and jobs, ready for Excel. Cells are made safe so text can never run as a formula.',
        ],
      },
      {
        icon: 'people',
        name: 'People and roles',
        line: 'Give each person the role that fits: Owner, Supervisor, Operator or Viewer.',
        mock: <PeopleMock />,
        bullets: [
          'Removed access takes effect on the next request, even if their phone still has the app open.',
          'Only owners grant supervisor or owner access, and a company always keeps an owner.',
          'In the demo, sign-in is off and you switch between role accounts to try each one.',
        ],
      },
      {
        icon: 'locations',
        name: 'Locations and rack labels',
        line: 'Racks, plus areas like Receiving and Quarantine, each with its own label.',
        who: 'Supervisors',
        bullets: ['Codes like A-03-02 are read as zone, aisle and bay for the map.', 'Rename a rack and its QR keeps working. Reprint the label so the printed code matches.', 'Switch off a location you no longer use. It stays in the history.'],
      },
      {
        icon: 'labels',
        name: 'Labels',
        line: 'Print pallet and rack labels in batches, at the right size.',
        bullets: [
          'Print what needs a reprint, everything waiting for placement, a whole job, hand-picked pallets, or every rack.',
          '4x6 labels or full sheets.',
          'A one-inch calibration box shows whether the printer is shrinking the page.',
        ],
      },
    ],
  },
  {
    id: 'scanning',
    chip: 'Scanning',
    icon: 'scanner',
    title: 'Scanning',
    lede: 'Nobody should type codes all day. Use a hardware scanner, the phone camera, a photo, or the printed code.',
    tone: 'ink',
    features: [
      {
        icon: 'scanner',
        name: 'Hardware scanners',
        line: 'USB and Bluetooth scanners in keyboard mode, and handhelds that type what they scan.',
        mock: <WedgeFlow />,
        bullets: [
          `${BRAND.name} tells a scan from typing by speed, so each scan goes to the screen you are using.`,
          'Scan anywhere: when no screen is waiting for a scan, scanning a label opens that pallet or rack.',
          'A Scanners page in the portal for prefix, suffix and timing.',
          'Most USB and Bluetooth scanners can be switched to keyboard mode by scanning a setup code from their manual.',
        ],
      },
      {
        icon: 'barcode',
        name: 'Command barcodes',
        line: 'Printed barcodes for Confirm, Cancel, Finish and each station mode.',
        mock: (
          <div className="sc-cmds">
            <CommandCard payload={commandPayload('CONFIRM')} label="Confirm" />
            <CommandCard payload={commandPayload('MODE_PUTAWAY')} label="Put-away mode" />
          </div>
        ),
        bullets: ['Scan Confirm instead of reaching for the screen.', 'Tape a sheet to the station or the cart.'],
      },
      {
        icon: 'camera',
        name: 'Camera and photo scanning',
        line: 'No scanner? The phone camera reads the QR label.',
        bullets: ['The camera only turns on when you tap Scan, and it stops as soon as you are done.', 'Hard to hold steady? Take a photo of the label and scan from the photo.'],
      },
      {
        icon: 'keyboard',
        name: 'Typed codes',
        line: 'Every label has its code printed large, for when nothing else works.',
        bullets: ['Type P-000042, P42 or just p42. Case and spaces do not matter.', 'Rack codes like A-03-02 work the same way.', `A scan is only read as a ${BRAND.name} label, pallet code or rack code. A scanned web address is never opened.`],
      },
    ],
  },
  {
    id: 'reliability',
    chip: 'Reliability',
    icon: 'shield',
    title: 'Reliability',
    lede: 'Warehouses have dead zones, busy mornings and two people reaching for the same pallet. The records hold up anyway.',
    tone: 'plain',
    features: [
      {
        icon: 'wifiOff',
        name: 'Offline queue',
        line: 'Moves and location checks keep working in dead zones.',
        mock: <OfflineMock />,
        bullets: [
          'Saved on the phone and shown as queued, not confirmed.',
          'Sent in order when the signal returns, with their original request IDs.',
          'Everything else waits for the connection.',
        ],
      },
      {
        icon: 'lab',
        name: 'Integrity lab',
        line: 'The app’s own safety tests, run live in your browser.',
        mock: <LabMock />,
        bullets: [
          '38 scenarios, including lost answers, two phones on one pallet, a removed employee and a half-finished import.',
          'Each runs on its own copy of the demo warehouse, so your data is never touched.',
          'The same scenarios run as the automated test suite.',
        ],
      },
      {
        icon: 'swap',
        name: 'Conflicts',
        line: 'Two people, one pallet: you decide, and nothing is overwritten.',
        bullets: ['Each change carries the version it was based on. If the pallet changed first, the server refuses it.', 'You see where the pallet is now and choose: move it again, or keep theirs.'],
      },
      {
        icon: 'refresh',
        name: 'Lost-response recovery',
        line: 'If the answer never arrives, the app asks instead of guessing.',
        bullets: ['Every request has its own ID. Checking the result by that ID never saves twice.', 'Receipts, moves, splits and imports are all safe to retry.'],
      },
    ],
  },
  {
    id: 'learning',
    chip: 'Learning',
    icon: 'guide',
    title: 'Learning',
    lede: 'A new hire should be useful on their first shift. The portal teaches itself.',
    tone: 'surface',
    features: [
      {
        icon: 'tour',
        name: 'Take the tour',
        line: 'A walkthrough of every portal page, from the button in the top bar.',
        mock: <TourMock />,
        bullets: ['Tips point at the real buttons on each screen.', 'Stop any time and start again from the top bar.'],
      },
      {
        icon: 'help',
        name: 'Help center',
        line: 'A tutorial video, common questions and a quick contact form in one place.',
        mock: <HelpMock />,
        bullets: ['The tutorial video is planned but not recorded yet. Its spot and a chapter outline are already in place.', 'Answers to the questions people ask in their first week.', 'A short form to ask for help.'],
      },
      {
        icon: 'checklist',
        name: 'Practice shift',
        line: 'A seven-step checklist that walks through a real day.',
        bullets: ['Receive, place, move, find, dispatch, return and place again, on demo data.', 'Each step ticks itself off when you actually do it.'],
      },
      {
        icon: 'info',
        name: 'How this works panels',
        line: 'Every screen explains itself.',
        bullets: ['A “How this works” panel on each screen explains the rules behind it.', 'A Guide page explains every term in plain words.', 'Turn the panels off in Settings once the crew knows the ropes.'],
      },
    ],
  },
];

const SUBNAV_OFFSET = 150;

function scrollToGroup(id: string) {
  const el = document.getElementById(`sc-${id}`);
  if (!el) return;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  const h = el.querySelector<HTMLElement>('h2');
  if (h) {
    h.setAttribute('tabindex', '-1');
    h.focus({ preventScroll: true });
  }
}

export function ShowcasePage() {
  const [active, setActive] = useState(GROUPS[0].id);

  // Highlight the group being read.
  useEffect(() => {
    let raf = 0;
    const check = () => {
      raf = 0;
      let current = GROUPS[0].id;
      for (const g of GROUPS) {
        const el = document.getElementById(`sc-${g.id}`);
        if (el && el.getBoundingClientRect().top <= SUBNAV_OFFSET) current = g.id;
      }
      setActive(current);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(check);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    check();
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  const total = GROUPS.reduce((n, g) => n + g.features.length, 0);

  return (
    <>
      <div className="site-inner">
        <PageHero
          eyebrow="See it in action"
          title="Everything it does, screen by screen"
          lede={`A guided look at the ${BRAND.portal}, grouped the way a yard works: the floor, finding things, oversight, setup, scanning, reliability and learning. Every screen shown here is in the portal today, filled with demo data.`}
          art={<GroupIndex total={total} onPick={scrollToGroup} />}
        >
          <SiteLink to="home" hash="tour" className="site-btn primary">
            <Icon name="play" />
            Take the guided tour
          </SiteLink>
          <PortalCTA variant="inline" />
        </PageHero>
      </div>

      <div className="sc-body">
        <SubNav active={active} onPick={scrollToGroup} />
        {GROUPS.map((g, i) => (
          <GroupSection key={g.id} group={g} n={i + 1} />
        ))}
      </div>

      <CtaBand title="See it with your own racks." body="Book a walkthrough to see it with your own racks, jobs and labels. Or open the portal now and try every screen above with demo data." />
    </>
  );
}

/** The seven groups as a board, like warehouse signage. */
function GroupIndex({ total, onPick }: { total: number; onPick: (id: string) => void }) {
  return (
    <nav className="sc-index" aria-label="Jump to a group">
      <div className="sc-index-head">
        <span>Directory</span>
        <span>{total} features</span>
      </div>
      <ol>
        {GROUPS.map((g, i) => (
          <li key={g.id}>
            <button onClick={() => onPick(g.id)}>
              <span className="sc-index-n">{String(i + 1).padStart(2, '0')}</span>
              <span className="sc-index-t">{g.chip}</span>
              <span className="sc-index-c">{g.features.length}</span>
              <Icon name="arrowRight" />
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function SubNav({ active, onPick }: { active: string; onPick: (id: string) => void }) {
  const row = useRef<HTMLDivElement>(null);
  // Keep the current chip in view on narrow screens, without moving the page.
  useEffect(() => {
    const nav = row.current;
    const chip = nav?.querySelector<HTMLElement>(`[data-g="${active}"]`);
    if (!nav || !chip) return;
    const left = chip.offsetLeft - 16;
    const right = chip.offsetLeft + chip.offsetWidth + 16;
    if (left < nav.scrollLeft || right > nav.scrollLeft + nav.clientWidth) nav.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
  }, [active]);
  return (
    <nav className="sc-subnav" aria-label="Feature groups">
      <div className="sc-subnav-row" ref={row}>
        {GROUPS.map((g) => (
          <button key={g.id} data-g={g.id} className="sc-chip" aria-current={active === g.id ? 'true' : undefined} onClick={() => onPick(g.id)}>
            <Icon name={g.icon} />
            {g.chip}
          </button>
        ))}
      </div>
    </nav>
  );
}

function GroupSection({ group, n }: { group: Group; n: number }) {
  const withMock = group.features.filter((f) => f.mock);
  const [lead, ...tiles] = withMock;
  const cards = group.features.filter((f) => !f.mock);
  return (
    <div id={`sc-${group.id}`} className="sc-group">
      <Section tone={group.tone} eyebrow={`${String(n).padStart(2, '0')} · ${group.chip}`} title={group.title} lede={group.lede}>
        {lead && (
          <article className={`sc-spot${n % 2 === 0 ? ' flip' : ''}`}>
            <div className="sc-spot-text">
              <FeatureText f={lead} />
            </div>
            <div className="sc-spot-art">{lead.mock}</div>
          </article>
        )}
        {tiles.length > 0 && (
          <div className="sc-tiles">
            {tiles.map((f) => (
              <article key={f.name} className="sc-tile">
                <div className="sc-tile-text">
                  <FeatureText f={f} />
                </div>
                <div className="sc-tile-art">{f.mock}</div>
              </article>
            ))}
          </div>
        )}
        {cards.length > 0 && (
          <div className={`sc-cards n${cards.length}`}>
            {cards.map((f) => (
              <article key={f.name} className="sc-card">
                <FeatureText f={f} />
              </article>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function FeatureText({ f }: { f: Feature }) {
  return (
    <>
      <div className="sc-f-top">
        <span className="sc-f-icon">
          <Icon name={f.icon} />
        </span>
        {f.who && <span className="sc-who">{f.who}</span>}
      </div>
      <h3 className="sc-f-name">{f.name}</h3>
      <p className="sc-f-line">{keepCodes(f.line)}</p>
      <ul className="sc-f-list">
        {f.bullets.map((b) => (
          <li key={b}>{keepCodes(b)}</li>
        ))}
      </ul>
    </>
  );
}
