// Applications: ten kinds of yards where pallet-level tracking by job pays off. Each one says
// what the work looks like, what goes wrong today, how Wherehouse fits, and which features matter.

import { BRAND } from '../../brand';
import { useApp } from '../../app/state';
import { Icon, type IconName } from '../../ui/icons';
import { CtaBand, PageHero, Section } from '../kit';
import { scrollToId } from './d-kit';
import './pages-d.css';

interface Application {
  id: string;
  icon: IconName;
  /** Short name for the jump chips. */
  short: string;
  title: string;
  situation: string;
  wrong: string[];
  flow: string[];
  features: string[];
}

const APPS: Application[] = [
  {
    id: 'gc',
    icon: 'hardhat',
    short: 'General contractors',
    title: 'General contractor material yards',
    situation: 'A general contractor holds material for several active jobs in one yard. Deliveries show up weeks before the crew is ready for them.',
    wrong: [
      'Material gets staged wherever there is room, and only one person knows where.',
      'The superintendent calls to ask if the doors came in. Someone walks the yard to check.',
      'Pallets for a finished job sit for months because nobody remembers they are there.',
    ],
    flow: [
      'Receive each delivery against its job and print a QR label for every pallet.',
      'Put it away with two scans: the pallet, then the rack.',
      'When the site calls, search the job. Every pallet shows the rack it was last confirmed at.',
      'Print the job’s pick list, sorted by rack, and dispatch what goes to site.',
    ],
    features: ['Receive against jobs', 'Find by job', 'Pick lists by rack', 'Dispatch'],
  },
  {
    id: 'electrical',
    icon: 'bolt',
    short: 'Electrical',
    title: 'Electrical contractors',
    situation: 'Fixture packages, gear, wire and panel parts are staged per job and released to site in phases.',
    wrong: [
      'Fixture types look alike. One lighting package ends up on three racks.',
      'The wrong phase goes out on the truck, or the crew waits on a pallet that already left.',
      'One pallet shows up with material for two jobs on it.',
    ],
    flow: [
      'Receive with the supplier reference and a clear description, like “Type B fixtures, level 2”.',
      'Split a mixed pallet into portions, one per job, each with its own label.',
      'Search by description or job to pull exactly the phase you need.',
      'Dispatch records what left, when, and where it went.',
    ],
    features: ['Split pallets', 'Supplier reference', 'Search by description', 'History on every pallet'],
  },
  {
    id: 'mep',
    icon: 'stack',
    short: 'Mechanical and plumbing',
    title: 'Mechanical, plumbing and HVAC',
    situation: 'Equipment, fittings, prefab assemblies and rooftop units wait in the yard until the building is ready. Some wait for months.',
    wrong: [
      'Long waits mean material gets shuffled to make room, again and again. Every shuffle is a chance to lose track.',
      'A damaged or short delivery gets pulled for install before anyone looks at it.',
      'Nobody is sure when a pallet was last actually seen.',
    ],
    flow: [
      'Receive into the receiving area, then place it on a rack.',
      'Put damaged or short deliveries on hold with a reason, so nobody sends them out.',
      'Every reshuffle is two scans, so the record keeps up with the floor.',
      'On a walk-through, scan pallets where they sit to verify them. Reconcile lists anything not checked in a few days.',
    ],
    features: ['Holds with reasons', 'Quarantine area', 'Verify in place', 'Two-scan moves'],
  },
  {
    id: 'interiors',
    icon: 'grid',
    short: 'Drywall and interiors',
    title: 'Drywall and interiors',
    situation: 'Board, framing, ceiling grid and tile staged by floor or area for big interior jobs. High volume, and most of it looks the same.',
    wrong: [
      'Pallets for level 3 go out with the level 5 load.',
      'Leftover material comes back from site and gets mixed in with new stock, with no record.',
      'Counting what is left for a job means climbing racks.',
    ],
    flow: [
      'Receive against the job and describe by floor or area, like “L3 east ceiling tile”.',
      'Stage the next load in a staging area before the delivery run.',
      'Record returns from site with a condition note, and a hold if needed.',
      'Open the job to see every pallet on hand, sorted by rack.',
    ],
    features: ['Staging areas', 'Returns', 'Search by description', 'Job pick lists'],
  },
  {
    id: 'glazing',
    icon: 'layers',
    short: 'Glazing',
    title: 'Glazing and curtain wall',
    situation: 'Units, frames and glass crates built for specific openings. They are sequenced by elevation and floor, fragile, and expensive to replace.',
    wrong: ['Crates for the wrong elevation get loaded.', 'A cracked unit sits unnoticed until install day.', 'Replacement units get mixed up with the originals.'],
    flow: [
      'Receive each crate with its mark or sequence number in the description.',
      'Take photos of any damage at receiving, and put the crate on hold with a reason.',
      'Print a pick list by job, sorted by rack, so the load goes out in order.',
      'History shows every move and every hold, with who and when.',
    ],
    features: ['Photos on pallets', 'Holds', 'Pick lists by rack', 'Full history'],
  },
  {
    id: 'ffe',
    icon: 'box',
    short: 'FF&E and furniture',
    title: 'FF&E and furniture installers',
    situation: 'Furniture, fixtures and equipment for offices, schools and hotels wait in storage until rooms are ready, then go out in phases.',
    wrong: ['Hundreds of cartons for one project, sorted by room and floor.', 'Items go out early, or twice.', 'Missing pieces turn up missing on install day, with the crew standing there.'],
    flow: [
      'Bring pallets in from a spreadsheet with CSV import, or receive them as they arrive.',
      'Put the room or floor in the description, so one search finds everything for “Level 2”.',
      'If a pallet is not where it was recorded, mark it missing. When it turns up, record where.',
      'Dispatch each phase with a destination note.',
    ],
    features: ['CSV import', 'Search by description', 'Missing and found', 'Dispatch notes'],
  },
  {
    id: 'restoration',
    icon: 'shield',
    short: 'Restoration',
    title: 'Restoration and disaster recovery',
    situation: 'Contents are packed out of a damaged home or business, stored while the building is repaired, then brought back.',
    wrong: [
      'Every claim has its own contents, and the owner expects every item back.',
      'Pallets and vaults get reshuffled over months of storage.',
      'Proof of what was stored, and when, is spread across paper forms.',
    ],
    flow: [
      'Create a job for each claim.',
      'Receive each pallet or vault with photos of what went in.',
      'Every move is recorded with who and when.',
      'When the rebuild is done, print the claim’s pick list and dispatch it home. Export the history for the file.',
    ],
    features: ['A job per claim', 'Photos on pallets', 'Full history', 'CSV export'],
  },
  {
    id: 'events',
    icon: 'calendar',
    short: 'Events and exhibits',
    title: 'Event and exhibit staging',
    situation: 'Booths, displays, cases and signage staged between shows. The same pieces go out and come back again and again.',
    wrong: ['The truck leaves without a crate.', 'Cases come back damaged and nobody writes it down.', 'Graphics for one show get mixed in with reusable stock.'],
    flow: [
      'Treat each show as a job.',
      'Dispatch pallets to the show with a destination.',
      'When they come back, record the return with a condition note, or a hold if something is damaged.',
      'Reassign reusable pallets to the next show’s job, with a reason.',
    ],
    features: ['Dispatch and return', 'Reassign to a job', 'Holds', 'Pick lists'],
  },
  {
    id: 'facilities',
    icon: 'building',
    short: 'Facilities storerooms',
    title: 'School district and municipal storerooms',
    situation: 'Facilities teams store surplus furniture, spare parts, project material and seasonal equipment for many buildings.',
    wrong: [
      'Material from past projects piles up.',
      'People order new because they cannot find what is already on hand.',
      'When someone retires, what they knew about the storeroom leaves with them.',
    ],
    flow: [
      'Treat each building or project as a job.',
      'Label racks and pallets once. After that, every move is two scans.',
      'Give staff viewer access, so they can search what is on hand before ordering.',
      'Reconcile lists what needs a look: pallets never put away, missing, on hold, or not checked in days.',
    ],
    features: ['Viewer role', 'Find', 'Reconcile', 'Warehouse map'],
  },
  {
    id: 'suppliers',
    icon: 'truck',
    short: 'Specialty suppliers',
    title: 'Specialty suppliers staging job orders',
    situation: 'Suppliers of doors and hardware, millwork, specialties and other job-specific orders hold them on racks until pickup or delivery.',
    wrong: ['The contractor shows up for pickup and the counter cannot find the order.', 'Partial orders end up on several racks.', 'An order goes out that should have stayed.'],
    flow: [
      'Make each order or project a job. Receive and label against it.',
      'At pickup, search the job and read off every rack.',
      'Put pallets that must not leave on hold, with a reason.',
      'Dispatch records what left, when, and who sent it.',
    ],
    features: ['Find by job', 'Holds', 'Dispatch', 'Scan station'],
  },
];

const THREAD: { icon: IconName; title: string; body: string }[] = [
  { icon: 'truck', title: 'Arrives early', body: 'Material shows up before the crew is ready for it.' },
  { icon: 'pallet', title: 'Waits on a rack', body: 'It sits for days or months, and gets moved to make room.' },
  { icon: 'jobs', title: 'Leaves by job', body: 'It goes out in pieces, to the right site, at the right time.' },
];

export function IndustriesPage() {
  const { go } = useApp();
  return (
    <>
      <div className="site-inner">
        <PageHero
          eyebrow="Applications"
          title="Built for yards that stage material by job"
          lede={`${BRAND.name} tracks material by the pallet, tied to the job it belongs to. Here is how that works in ten kinds of yards.`}
          art={<ThreadArt />}
        >
          <p className="ind-disclaimer">
            <Icon name="info" />
            These are use cases, not customer stories.
          </p>
        </PageHero>

        <nav className="ind-jump" id="ind-jump" aria-label="Jump to an application">
          <h2 className="ind-jump-h">Jump to</h2>
          <ul>
            {APPS.map((a, i) => (
              <li key={a.id}>
                <button type="button" className="ind-chip" onClick={() => scrollToId(`app-${a.id}`)}>
                  <span className="ind-chip-n">{String(i + 1).padStart(2, '0')}</span>
                  {a.short}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <div className="ind-list">
        {APPS.map((a, i) => (
          <AppBlock key={a.id} app={a} n={i + 1} tone={i % 2 === 0 ? 'plain' : 'surface'} />
        ))}
      </div>

      <Section tone="hazard" eyebrow="Your yard" title="Don’t see your yard here?">
        <div className="ind-fit">
          <p className="site-lede">If material waits on racks until a crew or a customer needs it, {BRAND.name} probably fits. Tell us how your yard works and we will show you how it would run.</p>
          <div className="site-hero-actions">
            <button type="button" className="site-btn primary" onClick={() => go('contact')}>
              Book a walkthrough
            </button>
            <button type="button" className="site-btn ghost" onClick={() => go('showcase')}>
              See it in action
              <Icon name="arrowRight" />
            </button>
          </div>
        </div>
      </Section>

      <CtaBand title="Every pallet, tied to its job." />
    </>
  );
}

/** The common thread in every application: arrives early, waits on a rack, leaves by job. */
function ThreadArt() {
  return (
    <div className="ind-thread">
      <div className="ind-thread-cap">What every one of these yards has in common</div>
      <ol>
        {THREAD.map((t, i) => (
          <li key={t.title}>
            <span className="ind-thread-icon">
              <Icon name={t.icon} />
            </span>
            <div>
              <b>
                <span className="ind-thread-n">{i + 1}</span>
                {t.title}
              </b>
              <span>{t.body}</span>
            </div>
          </li>
        ))}
      </ol>
      <div className="ind-thread-foot">
        <span className="ind-code">J-214</span>
        <Icon name="arrowRight" />
        <span className="ind-code">P-000042</span>
        <Icon name="arrowRight" />
        <span className="ind-code">A-03-02</span>
      </div>
    </div>
  );
}

function AppBlock({ app, n, tone }: { app: Application; n: number; tone: 'plain' | 'surface' }) {
  const num = String(n).padStart(2, '0');
  const headingId = `app-${app.id}-h`;
  return (
    <article id={`app-${app.id}`} className={`ind-app tone-${tone}`} aria-labelledby={headingId}>
      <div className="site-inner ind-app-inner">
        <div className="ind-app-head">
          <div className="ind-app-mark">
            <span className="ind-app-n" aria-hidden="true">
              {num}
            </span>
            <span className="feature-icon">
              <Icon name={app.icon} />
            </span>
          </div>
          <h2 id={headingId} className="ind-app-title">
            <span className="sr-only">Application {n}: </span>
            {app.title}
          </h2>
          <p className="ind-app-situation">{app.situation}</p>
          <div className="ind-feats">
            <h3 className="ind-feats-h">Features that matter most</h3>
            <ul>
              {app.features.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="ind-app-body">
          <div className="ind-wrong">
            <h3 className="ind-block-h">
              <Icon name="alert" />
              What goes wrong today
            </h3>
            <ul>
              {app.wrong.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
          <div className="ind-flow">
            <h3 className="ind-block-h">
              <Icon name="checkCircle" />
              How {BRAND.name} fits
            </h3>
            <ol>
              {app.flow.map((f, i) => (
                <li key={f}>
                  <span className="ind-step" aria-hidden="true">
                    {i + 1}
                  </span>
                  <span>{f}</span>
                </li>
              ))}
            </ol>
          </div>
          <button type="button" className="ind-back" onClick={() => scrollToId('ind-jump')}>
            <Icon name="chevronRight" className="ind-back-icon" />
            Back to the list
          </button>
        </div>
      </div>
    </article>
  );
}
