// Why it's simple: the principles behind the product, what was left out on purpose, and a before/after table.

import type { ReactNode } from 'react';
import { BRAND } from '../../brand';
import { BrandMark, Icon, type IconName } from '../../ui/icons';
import { Plate } from '../../ui/ui';
import { CtaBand, PageHero, Section, SiteLink } from '../kit';
import { AnswerCard, CorrectionMock, MoveMock, WedgeFlow, keepCodes } from './c-mocks';
import './pages-c.css';

export function SimplePage() {
  return (
    <>
      <div className="site-inner">
        <PageHero
          eyebrow="Why it’s simple"
          title="Simple on purpose"
          lede={`Most warehouse software tries to run the whole business. ${BRAND.name} does one job: it knows where every pallet was last confirmed, who put it there, and when. The rest was left out, so there is less to learn and less to get wrong.`}
          art={<NumbersArt />}
        >
          <SiteLink to="simple" hash="principles" className="site-btn primary">
            Read the principles
          </SiteLink>
          <SiteLink to="simple" hash="left-out" className="site-btn ghost">
            What we left out
          </SiteLink>
        </PageHero>
      </div>

      <Section id="principles" eyebrow="The principles" title="Seven rules we build by" lede="Every screen has to pass these. When a feature would break one, it does not ship.">
        <div className="sp-principles">
          <Principle n={1} title="Three verbs" line="Receive, Move and Find. That is most of a day." art={<VerbsArt />}>
            <p>The crew does three things all day: record what arrived, put it somewhere, and find it again. Those are the three big buttons.</p>
            <p>Everything else, like dispatching, returns and holds, is a button on the pallet itself, shown only when it makes sense.</p>
          </Principle>

          <Principle n={2} title="Two scans and a confirm" line="Moving a pallet is the same every time." art={<MoveMock />}>
            <ol className="sp-steps">
              <li>
                <strong>Scan the pallet.</strong> Its job and description appear, so you know you have the right one.
              </li>
              <li>
                <strong>Scan the rack.</strong> The move is shown from and to, before anything is saved.
              </li>
              <li>
                <strong>Confirm.</strong> One tap, or scan a printed Confirm barcode.
              </li>
            </ol>
            <p>No menus to open and no codes to type. A scan in the wrong order gets a plain warning, not a wrong move.</p>
          </Principle>

          <Principle n={3} title="One search box" line="Type whatever you have. It works out what you mean." art={<SearchArt />}>
            <p>A job number, a pallet code, a rack or a few words from the description all go in the same box. Exact matches come first.</p>
            <p>There is no report builder to learn and no query language. If you mistype a job or rack code, it suggests the one you meant.</p>
          </Principle>

          <Principle n={4} title="Answers, not guesses" line="It never says “live”, because nothing about a pallet is live." art={<TruthArt />}>
            <p>A pallet cannot report where it is. People do, with a scan. So every answer says where it was last confirmed, when, and by whom.</p>
            <p>That is honest, and it is useful: an answer from this morning and one from three weeks ago deserve different trust, and the Not verified list tells you which racks to walk.</p>
          </Principle>

          <Principle n={5} title="History is never erased" line="Mistakes get corrected in the open, not deleted." art={<CorrectionMock />}>
            <p>Every change is added to the pallet’s history with the time and the account that made it. Nothing is edited in place.</p>
            <p>When something was recorded wrong, a supervisor adds a correction with a reason. The original stays, marked as corrected, so the story always adds up.</p>
          </Principle>

          <Principle n={6} title="Nothing to install" line="A link on any phone or computer. That is the setup." art={<InstallArt />}>
            <p>{BRAND.portal} runs in the web browser on phones, tablets and office computers. There is no app store and no desktop program.</p>
            <p>Add it to the home screen and it opens like an app.</p>
          </Principle>

          <Principle
            n={7}
            title="Works with scanners you already own"
            line="If it can type, it can scan into the portal."
            art={<WedgeFlow />}
          >
            <p>Most USB and Bluetooth scanners can work in keyboard mode, where a scan arrives as fast typing. The portal tells a scan from a person typing, so no driver or special app is needed.</p>
            <p>
              No scanner? The phone camera reads the QR code on each label.{' '}
              <SiteLink to="hardware" className="sp-link">
                See which scanners work
                <Icon name="arrowRight" />
              </SiteLink>
            </p>
          </Principle>
        </div>
      </Section>

      <Section id="left-out" tone="surface" eyebrow="Left out on purpose" title="What it does not do, and why" lede="Each of these is useful somewhere. Each would also add screens, settings and ways for the records to drift from the floor.">
        <div className="sp-left">
          {LEFT_OUT.map((x) => (
            <article key={x.title} className="sp-left-card">
              <div className="sp-left-top">
                <span className="sp-left-icon" aria-hidden="true">
                  <Icon name={x.icon} />
                </span>
                <span className="sp-left-tag">Not included</span>
              </div>
              <h3>{x.title}</h3>
              <p>{x.why}</p>
              <p className="sp-left-instead">
                <strong>Instead:</strong> {keepCodes(x.instead)}
              </p>
            </article>
          ))}
        </div>
      </Section>

      <Section tone="hazard" narrow>
        <div className="sp-rule">
          <p className="sp-rule-big">Less to learn. Less to get wrong.</p>
          <p className="sp-rule-body">Every feature we left out is one less screen for a new hire, one less setting to get wrong, and one less place for the records to disagree with the floor.</p>
        </div>
      </Section>

      <Section id="before-after" eyebrow="Before and after" title="The same questions, answered differently" lede="Clipboards, spreadsheets, folders and walking the yard all work, until the person who knows is off shift.">
        <div className="table-wrap sp-ba-wrap">
          <table className="sp-ba">
            <caption className="sr-only">How common questions are answered before and after {BRAND.name}</caption>
            <thead>
              <tr>
                <th scope="col">The question</th>
                <th scope="col">
                  <span className="sp-ba-h before">Before</span>
                  <span className="sp-ba-sub">Clipboards, spreadsheets, folders, walking the yard</span>
                </th>
                <th scope="col">
                  <span className="sp-ba-h after">With {BRAND.name}</span>
                  <span className="sp-ba-sub">One record per pallet</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {BEFORE_AFTER.map((r) => (
                <tr key={r.q}>
                  <th scope="row">{r.q}</th>
                  <td data-label="Before">{r.before}</td>
                  <td data-label={`With ${BRAND.name}`}>{r.after}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <CtaBand title="Try the three verbs yourself." body="Open the portal with demo data: receive a pallet, move it with two scans, and find it again. Nothing you do there touches a real warehouse." />
    </>
  );
}

const LEFT_OUT: { icon: IconName; title: string; why: string; instead: string }[] = [
  {
    icon: 'box',
    title: 'Item counts inside pallets',
    why: 'Counting every box on every pallet doubles the work at receiving and gives the records another way to be wrong.',
    instead: 'Describe what is on the pallet and add a photo. If it really becomes two loads, split it and each gets a label.',
  },
  {
    icon: 'sparkle',
    title: 'Forecasting',
    why: 'Predictions are only as good as the history under them, and most yards do not have that history yet.',
    instead: 'Build clean history first. The full history exports to CSV whenever you want to analyze it.',
  },
  {
    icon: 'text',
    title: 'Purchase orders',
    why: 'Ordering belongs in the system that pays the supplier. A second copy here would drift.',
    instead: 'Note the supplier reference when the delivery arrives, so you can match it later.',
  },
  {
    icon: 'dollar',
    title: 'Accounting',
    why: 'No costs, invoices or stock valuations. Your accounting system already owns those numbers.',
    instead: 'Export pallets, jobs and history to CSV if the office needs them.',
  },
  {
    icon: 'wifi',
    title: 'GPS and RFID tags',
    why: 'Tags, readers and batteries cost money on every pallet, and someone still has to check the readings.',
    instead: 'A printed label and the scan the crew already makes when they move a pallet.',
  },
  {
    icon: 'grid',
    title: 'Floor-plan editors',
    why: 'Drawings go out of date the day a rack moves, and nobody has time to redraw them.',
    instead: 'Name racks by zone, aisle and bay, like A-03-02. The map is laid out from those codes.',
  },
];

const BEFORE_AFTER: { q: string; before: string; after: ReactNode }[] = [
  { q: 'Where is it?', before: 'Walk the yard, or call whoever stacked it.', after: 'Search the pallet or job. See the rack it was last confirmed at, when, and by whom.' },
  { q: 'Who moved it, and when?', before: 'Usually nobody wrote it down.', after: 'Every move is in the pallet’s history, with the time and the account.' },
  { q: 'What came in today?', before: 'Delivery tickets in a folder, if they made it to the office.', after: 'Each received pallet in the Activity feed, with its job, description and photo.' },
  { q: 'What is on hold?', before: 'A sticky note on the pallet, if it is still there.', after: 'An On hold list. Held pallets cannot be dispatched until a supervisor clears them.' },
  { q: 'What does this job still have here?', before: 'Filter a spreadsheet that was last updated who knows when.', after: 'The job’s page: on hand, missing, on hold and dispatched, with a pick list sorted by rack.' },
  { q: 'The person who knows is off today', before: 'Wait until they are back, or go looking.', after: 'Anyone with an account can look it up. The answer does not live in one head.' },
  { q: 'Training a new hire', before: 'Shadow whoever knows the yard best.', after: 'A guided tour, a practice shift on demo data, and a “How this works” panel on every screen.' },
];

function Principle({ n, title, line, art, children }: { n: number; title: string; line: string; art: ReactNode; children: ReactNode }) {
  return (
    <article className={`sp-principle${n % 2 === 0 ? ' flip' : ''}`}>
      <div className="sp-principle-text">
        <span className="sp-num" aria-hidden="true">
          {String(n).padStart(2, '0')}
        </span>
        <h3>
          <span className="sr-only">Principle {n}: </span>
          {title}
        </h3>
        <p className="sp-line">{line}</p>
        <div className="sp-body">{children}</div>
      </div>
      <div className="sp-principle-art">{art}</div>
    </article>
  );
}

/** Hero art: the product in three numbers. */
function NumbersArt() {
  const rows: { n: string; label: string; sub: string }[] = [
    { n: '3', label: 'Verbs', sub: 'Receive, Move, Find' },
    { n: '2', label: 'Scans and a confirm', sub: 'Pallet, then rack' },
    { n: '1', label: 'Search box', sub: 'For jobs, pallets, racks and words' },
  ];
  return (
    <div className="sp-numbers" role="img" aria-label="Three verbs: receive, move, find. Two scans and a confirm to move a pallet. One search box for everything.">
      {rows.map((r) => (
        <div key={r.n} className="sp-numbers-row" aria-hidden="true">
          <span className="sp-numbers-n">{r.n}</span>
          <span className="sp-numbers-t">
            <strong>{r.label}</strong>
            <span>{r.sub}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

function VerbsArt() {
  const verbs: { icon: IconName; verb: string; sub: string }[] = [
    { icon: 'receive', verb: 'Receive', sub: 'Record what arrived, against its job' },
    { icon: 'move', verb: 'Move', sub: 'Two scans and a confirm' },
    { icon: 'find', verb: 'Find', sub: 'One box for everything' },
  ];
  return (
    <div className="sp-verbs" role="img" aria-label="The three main buttons: Receive, Move and Find. Other actions, like Dispatch, Record return, Put on hold and Split, appear on the pallet record when they apply.">
      <div className="sp-verbs-row" aria-hidden="true">
        {verbs.map((v) => (
          <div key={v.verb} className="sp-verb">
            <span className="sp-verb-icon">
              <Icon name={v.icon} />
            </span>
            <span className="sp-verb-name">{v.verb}</span>
            <span className="sp-verb-sub">{v.sub}</span>
          </div>
        ))}
      </div>
      <div className="sp-verbs-more" aria-hidden="true">
        <span className="sp-verbs-more-label">On the pallet, when it applies</span>
        <span className="sp-verbs-chips">
          {(
            [
              ['truck', 'Dispatch'],
              ['returnIcon', 'Record return'],
              ['hold', 'Put on hold'],
              ['split', 'Split'],
            ] as [IconName, string][]
          ).map(([icon, label]) => (
            <span key={label} className="sp-chip">
              <Icon name={icon} />
              {label}
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}

function SearchArt() {
  const rows: { q: string; icon: IconName; what: string }[] = [
    { q: 'J-214', icon: 'jobs', what: 'Every pallet for the School renovation job' },
    { q: 'p42', icon: 'pallet', what: 'Pallet P-000042, however you type it' },
    { q: 'A-03-02', icon: 'locations', what: 'Everything recorded on that rack' },
    { q: 'door hardware', icon: 'text', what: 'Pallets with those words in the description' },
  ];
  return (
    <figure className="sp-search" role="img" aria-label="One search box. J-214 finds every pallet for that job. p42 finds pallet P-000042. A-03-02 finds everything on that rack. door hardware finds pallets by description.">
      <div aria-hidden="true">
        <div className="sp-search-box">
          <Icon name="find" />
          <span>Job, pallet, rack or words</span>
          <kbd>/</kbd>
        </div>
        <ul className="sp-search-list">
          {rows.map((r) => (
            <li key={r.q}>
              <code>{r.q}</code>
              <Icon name="arrowRight" />
              <span className="sp-search-what">
                <Icon name={r.icon} />
                {r.what}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </figure>
  );
}

function TruthArt() {
  return (
    <div className="sp-truth">
      <div className="sp-never">
        <span className="sp-never-label">Words you will not see</span>
        <span className="sp-never-list">
          <s>Live location</s>
          <s>Real-time tracking</s>
          <s>Always accurate</s>
        </span>
      </div>
      <AnswerCard query={false} />
    </div>
  );
}

function InstallArt() {
  return (
    <div className="sp-install" role="img" aria-label={`The ${BRAND.portal} open in a laptop browser and on a phone, with an Add to Home Screen option.`}>
      <div className="sp-laptop" aria-hidden="true">
        <div className="sp-laptop-screen">
          <div className="sp-laptop-bar">
            <span className="sp-laptop-dots">
              <i />
              <i />
              <i />
            </span>
            <span className="sp-laptop-url">{BRAND.portal}</span>
          </div>
          <div className="sp-laptop-body">
            <span className="sp-laptop-side" />
            <span className="sp-laptop-main">
              <span className="sp-sk w60" />
              <span className="sp-laptop-tiles">
                <span />
                <span />
                <span />
              </span>
              {['A-01-02', 'A-03-02', 'B-01-01'].map((c) => (
                <span key={c} className="sp-laptop-row">
                  <span className="sp-laptop-plate">{c}</span>
                  <span className="sp-sk w70" />
                </span>
              ))}
            </span>
          </div>
        </div>
        <div className="sp-laptop-base" />
      </div>
      <div className="sp-phone" aria-hidden="true">
        <div className="sp-phone-screen">
          <span className="sp-phone-brand">
            <BrandMark />
            <span className="sp-sk w60" />
          </span>
          <span className="sp-phone-plate">
            <Plate code="A-03-02" size="sm" />
          </span>
          <span className="sp-sk w90" />
          <span className="sp-sk w60" />
          <span className="sp-a2hs">
            <Icon name="plus" />
            Add to Home Screen
          </span>
        </div>
      </div>
    </div>
  );
}
