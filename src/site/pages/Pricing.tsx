// Pricing: monthly or annual switch, three plans plus Enterprise, a full comparison table,
// add-ons that are coming, and pricing questions. Every price here is a labeled placeholder.

import { useState, type ReactNode } from 'react';
import { BRAND } from '../../brand';
import { useApp } from '../../app/state';
import { Icon, type IconName } from '../../ui/icons';
import { CtaBand, Placeholder, PortalCTA, Section, PageHero, SiteLink } from '../kit';
import { Coming } from './d-kit';
import './pages-d.css';

type Billing = 'monthly' | 'annual';
type PlanId = 'starter' | 'team' | 'company' | 'enterprise';
/** A comparison cell: included, not included, coming, or a short value. */
type Cell = boolean | 'coming' | string;

interface Plan {
  id: PlanId;
  name: string;
  fit: string;
  /** Placeholder price per warehouse per month on monthly billing. null means custom. */
  monthly: number | null;
  limits: { icon: IconName; label: string; value: ReactNode }[];
  includes: ReactNode[];
  featured?: boolean;
}

// Annual billing charges ten months for twelve. Placeholder terms, like the prices.
const annualPerMonth = (m: number) => Math.round((m * 10) / 12);
const annualTotal = (m: number) => m * 10;
const money = (n: number) => `$${n.toLocaleString('en-US')}`;

const PLANS: Plan[] = [
  {
    id: 'starter',
    name: 'Starter',
    fit: 'One yard getting its first racks labeled. A small crew, with one or two people receiving.',
    monthly: 49,
    limits: [
      { icon: 'people', label: 'Users', value: '3' },
      { icon: 'pallet', label: 'Active pallets', value: '500' },
      { icon: 'building', label: 'Warehouses', value: '1' },
    ],
    includes: ['Receive, Move and Find', 'QR pallet and rack labels', 'USB and Bluetooth scanners, plus the phone camera', 'History on every pallet', 'Owner and operator roles', 'CSV import and export'],
  },
  {
    id: 'team',
    name: 'Team',
    fit: 'A busy yard with a crew on every shift, and supervisors who need to see what is going on.',
    monthly: 129,
    featured: true,
    limits: [
      { icon: 'people', label: 'Users', value: '15' },
      { icon: 'pallet', label: 'Active pallets', value: '5,000' },
      { icon: 'building', label: 'Warehouses', value: '1' },
    ],
    includes: ['Everything in Starter', 'All four roles: owner, supervisor, operator, viewer', 'Reconcile: a list of what needs a look', 'Holds with reasons, and a quarantine area', 'Onboarding call to get you set up'],
  },
  {
    id: 'company',
    name: 'Company',
    fit: 'Larger operations, or more than one company or division under one login.',
    monthly: 299,
    limits: [
      { icon: 'people', label: 'Users', value: '50' },
      { icon: 'pallet', label: 'Active pallets', value: '25,000' },
      {
        icon: 'building',
        label: 'Warehouses',
        value: (
          <>
            1 <Coming>More coming</Coming>
          </>
        ),
      },
    ],
    includes: ['Everything in Team', 'Separate companies under one login', 'Remote setup help for labeling your racks', 'Priority help'],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    fit: 'Big or multi-site operations that need custom limits, a rollout plan and invoicing.',
    monthly: null,
    limits: [
      { icon: 'people', label: 'Users', value: 'Custom' },
      { icon: 'pallet', label: 'Active pallets', value: 'Custom' },
      {
        icon: 'building',
        label: 'Warehouses',
        value: (
          <>
            1 <Coming>More coming</Coming>
          </>
        ),
      },
    ],
    includes: ['Everything in Company', 'Limits set to fit your operation', 'A rollout plan, with on-site setup', 'Invoice billing'],
  },
];

const COMPARE: { group: string; rows: { label: ReactNode; cells: [Cell, Cell, Cell, Cell] }[] }[] = [
  {
    group: 'Limits',
    rows: [
      { label: 'Users', cells: ['3', '15', '50', 'Custom'] },
      { label: 'Active pallets', cells: ['500', '5,000', '25,000', 'Custom'] },
      { label: 'Warehouses per company', cells: ['1', '1', '1', '1'] },
      { label: 'More than one warehouse per company', cells: [false, false, 'coming', 'coming'] },
      { label: 'Separate companies under one login', cells: [false, false, true, true] },
    ],
  },
  {
    group: 'Everyday work',
    rows: [
      { label: 'Receive deliveries against jobs', cells: [true, true, true, true] },
      { label: 'Two-scan moves with a confirm step', cells: [true, true, true, true] },
      { label: 'Find by job, code, rack or description', cells: [true, true, true, true] },
      { label: 'Dispatch and returns', cells: [true, true, true, true] },
      { label: 'Split a pallet across jobs', cells: [true, true, true, true] },
      { label: 'Photos on pallets', cells: [true, true, true, true] },
      { label: 'Keeps working on bad signal', cells: [true, true, true, true] },
    ],
  },
  {
    group: 'Scanning and labels',
    rows: [
      { label: 'USB and Bluetooth scanners in keyboard mode', cells: [true, true, true, true] },
      { label: 'Phone camera scanning', cells: [true, true, true, true] },
      { label: 'Scan station for hands-free scanning', cells: [true, true, true, true] },
      { label: 'QR pallet labels, 4x6 or full sheets', cells: [true, true, true, true] },
      { label: 'Rack labels', cells: [true, true, true, true] },
      { label: 'Pick lists by job, sorted by rack', cells: [true, true, true, true] },
    ],
  },
  {
    group: 'Control and records',
    rows: [
      { label: 'Roles', cells: ['Owner and operators', 'All four roles', 'All four roles', 'All four roles'] },
      { label: 'History on every pallet', cells: [true, true, true, true] },
      { label: 'Holds with reasons', cells: [false, true, true, true] },
      { label: 'Reconcile: what needs a look', cells: [false, true, true, true] },
      { label: 'Warehouse map', cells: [true, true, true, true] },
      { label: 'CSV import', cells: [true, true, true, true] },
      { label: 'CSV export of all your records', cells: [true, true, true, true] },
    ],
  },
  {
    group: 'Help',
    rows: [
      { label: 'Help page with tutorials and FAQ', cells: [true, true, true, true] },
      { label: 'Email help', cells: [true, true, true, true] },
      { label: 'Onboarding call', cells: [false, true, true, true] },
      { label: 'Setup help for labeling racks', cells: [false, false, 'Remote', 'On site'] },
      { label: 'Priority help', cells: [false, false, true, true] },
    ],
  },
];

const ADD_ONS: { icon: IconName; title: string; body: string }[] = [
  { icon: 'print', title: 'Label printer bundle', body: 'A 4x6 thermal label printer and a starter roll of labels, ready to print pallet and rack labels.' },
  { icon: 'scanner', title: 'Scanner bundle', body: 'Handheld scanners set to keyboard mode before they ship, so the first scan just works.' },
  { icon: 'hardhat', title: 'Onboarding help', body: 'A setup day, remote or on site: label your racks, bring in your jobs, and walk the crew through it.' },
  { icon: 'building', title: 'Extra warehouse', body: 'Add another yard to your plan once more than one warehouse per company arrives.' },
];

const FAQ: { q: string; a: ReactNode }[] = [
  {
    q: 'Is there a free trial?',
    a: (
      <>
        <p>We plan to offer a free trial on every plan. The length is still being set.</p>
        <p>You do not have to wait for it. Open the {BRAND.portal} now and try the full demo in your browser, with no account and no card.</p>
      </>
    ),
  },
  {
    q: 'Can I cancel any time?',
    a: <p>Yes. Monthly plans can be cancelled any time and run to the end of the month you paid for. Annual plans run to the end of the year you paid for. No long contracts.</p>,
  },
  {
    q: 'What happens to my data if I leave?',
    a: (
      <p>
        It is yours. Owners and supervisors can export everything at any time as CSV files: every pallet, the full history, your locations and your jobs, plus a file that says when and how the export was made. That export works in the portal today.
      </p>
    ),
  },
  {
    q: 'What hardware do I need?',
    a: (
      <>
        <p>A phone, tablet or computer with a web browser. That is enough to start: the phone camera reads the QR labels.</p>
        <p>
          For labels, a 4x6 label printer or a regular printer with label sheets. For speed, add barcode scanners. Most USB and Bluetooth scanners can be set to act as a keyboard, often called HID or keyboard-wedge mode, and {BRAND.name} listens for that.{' '}
          <SiteLink to="hardware">See scanner setup</SiteLink>
        </p>
      </>
    ),
  },
  {
    q: 'Is it priced per user or per warehouse?',
    a: <p>Per warehouse, with users included. Crews share devices and people come and go, so you should never have to ration logins on the floor. If you need more users than your plan includes, move up a plan or talk to us.</p>,
  },
  {
    q: 'What counts as an active pallet?',
    a: <p>A pallet that is in your yard: received, stored, or marked missing. Dispatched and retired pallets stay in your history and do not count toward the limit.</p>,
  },
  {
    q: 'Can I change plans later?',
    a: <p>Yes, up or down, whenever you like. Your pallets, jobs and history stay exactly as they are.</p>,
  },
  {
    q: 'When will prices be final?',
    a: (
      <p>
        Before launch. Early customers get launch pricing. <SiteLink to="customers" hash="early">About the early customer program</SiteLink>
      </p>
    ),
  },
];

export function PricingPage() {
  const [billing, setBilling] = useState<Billing>('monthly');

  return (
    <>
      <div className="site-inner">
        <PageHero
          eyebrow="Pricing"
          title="Plans for every size of yard"
          lede={`Every plan includes Receive, Move and Find, QR labels, and support for the scanners you already own. Pick the one that fits your crew and your racks.`}
        >
          <PortalCTA variant="hero" />
        </PageHero>
      </div>

      <section className="site-section pr-plans-section" aria-labelledby="pr-plans-h">
        <div className="site-inner">
          <h2 id="pr-plans-h" className="sr-only">
            Plans
          </h2>
          <div className="pr-toolbar">
            <div className="pr-note" role="note">
              <span className="pr-note-stripes" aria-hidden="true" />
              <Icon name="info" className="pr-note-icon" />
              <p>
                <strong>Placeholder prices.</strong> These numbers show how the plans compare, not what you will pay. Final prices are set before launch.
              </p>
            </div>
            <BillingSwitch billing={billing} onChange={setBilling} />
          </div>

          <div className="pr-plans">
            {PLANS.filter((p) => p.monthly !== null).map((p, i) => (
              <PlanCard key={p.id} plan={p} billing={billing} layout={i === 2 ? 'span' : undefined} />
            ))}
          </div>
          {PLANS.filter((p) => p.monthly === null).map((p) => (
            <PlanCard key={p.id} plan={p} billing={billing} layout="wide" />
          ))}

          <p className="pr-fineprint">
            Prices are per warehouse, per month, before tax. Active pallets are the ones in your yard right now; dispatched and retired pallets stay in your history and do not count.
          </p>
        </div>
      </section>

      <Section id="compare" tone="surface" eyebrow="Compare plans" title="Everything, side by side" lede="Most of what matters on the floor is in every plan. The plans differ in size, roles and how much help you get.">
        <p className="pr-swipe">
          <Icon name="swap" />
          Swipe the table sideways to see every plan.
        </p>
        <CompareTable billing={billing} />
      </Section>

      <Section eyebrow="Add-ons" title="Hardware and help, bundled" lede="Coming soon. These are not for sale yet. If one would help you, say so when you book a walkthrough.">
        <ul className="pr-addons">
          {ADD_ONS.map((a) => (
            <li key={a.title} className="pr-addon">
              <div className="pr-addon-top">
                <span className="feature-icon">
                  <Icon name={a.icon} />
                </span>
                <Coming />
              </div>
              <h3>{a.title}</h3>
              <p>{a.body}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="pricing-faq" tone="surface" eyebrow="Questions" title="Pricing questions" lede="How we plan to run billing. The details will be confirmed before launch." narrow>
        <div className="pd-faq">
          {FAQ.map((f) => (
            <details key={f.q} className="pd-faq-item">
              <summary>
                <span>{f.q}</span>
                <Icon name="plus" className="pd-faq-icon" />
              </summary>
              <div className="pd-faq-a">{f.a}</div>
            </details>
          ))}
        </div>
      </Section>

      <CtaBand title="Not sure which plan fits?" body="Tell us about your yard and we will help you choose. Or open the portal and try every feature now." />
    </>
  );
}

/** Monthly or annual, as a pair of radio buttons styled as one switch. */
function BillingSwitch({ billing, onChange }: { billing: Billing; onChange: (b: Billing) => void }) {
  return (
    <fieldset className="pr-billing">
      <legend className="pr-billing-legend">Billing</legend>
      <div className="pr-billing-opts">
        {(['monthly', 'annual'] as const).map((b) => (
          <label key={b}>
            <input className="pr-radio" type="radio" name="pr-billing" value={b} checked={billing === b} onChange={() => onChange(b)} />
            <span className="pr-billing-opt">
              {b === 'monthly' ? 'Monthly' : 'Annual'}
              {b === 'annual' && <span className="pr-save">2 months free</span>}
            </span>
          </label>
        ))}
      </div>
      <span className="sr-only" aria-live="polite">
        {billing === 'monthly' ? 'Showing monthly prices.' : 'Showing annual prices.'}
      </span>
    </fieldset>
  );
}

function PriceLine({ plan, billing }: { plan: Plan; billing: Billing }) {
  if (plan.monthly === null) {
    return (
      <div className="pr-price">
        <span className="pr-amt">Custom</span>
        <span className="pr-billed">Priced to fit your sites and your crew.</span>
      </div>
    );
  }
  const amount = billing === 'monthly' ? plan.monthly : annualPerMonth(plan.monthly);
  return (
    <div className="pr-price">
      <span className="pr-amt-row">
        <span className="pr-amt">{money(amount)}</span>
        <span className="pr-per">
          per month
          <br />
          per warehouse
        </span>
      </span>
      <span className="pr-billed">{billing === 'monthly' ? 'Billed monthly.' : `Billed ${money(annualTotal(plan.monthly))} a year.`}</span>
    </div>
  );
}

function PlanCard({ plan, billing, layout }: { plan: Plan; billing: Billing; layout?: 'span' | 'wide' }) {
  const { go } = useApp();
  const headingId = `pr-plan-${plan.id}`;
  return (
    <article className={`pr-plan ${plan.featured ? 'featured' : ''} ${layout ?? ''}`} aria-labelledby={headingId}>
      {plan.featured && <div className="pr-plan-flag">A good fit for most yards</div>}
      <div className="pr-plan-body">
        <div className="pr-plan-part">
          <h3 id={headingId} className="pr-plan-name">
            {plan.name}
          </h3>
          <p className="pr-plan-fit">
            <span className="pr-plan-for">Who it is for</span>
            {plan.fit}
          </p>
          <Placeholder label="Placeholder price">
            <PriceLine plan={plan} billing={billing} />
          </Placeholder>
        </div>
        <div className="pr-plan-part">
          <dl className="pr-limits">
            {plan.limits.map((l) => (
              <div key={l.label} className="pr-limit">
                <dt>
                  <Icon name={l.icon} />
                  {l.label}
                </dt>
                <dd>{l.value}</dd>
              </div>
            ))}
          </dl>
          <button type="button" className={`site-btn ${plan.featured ? 'primary' : 'ghost'} pr-plan-btn`} onClick={() => go({ name: 'contact', q: `plan:${plan.name}` })}>
            Talk to us about {plan.name}
          </button>
        </div>
        <div className="pr-plan-part">
          <h4 className="pr-incl-h">What is included</h4>
          <ul className="pr-incl">
            {plan.includes.map((it, i) => (
              <li key={i}>
                <Icon name="check" />
                <span>{it}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </article>
  );
}

function CellValue({ cell }: { cell: Cell }) {
  if (cell === true)
    return (
      <span className="pr-yes">
        <Icon name="check" />
        <span className="sr-only">Included</span>
      </span>
    );
  if (cell === false)
    return (
      <span className="pr-no">
        <span aria-hidden="true">–</span>
        <span className="sr-only">Not included</span>
      </span>
    );
  if (cell === 'coming') return <Coming />;
  return <span className="pr-val">{cell}</span>;
}

function CompareTable({ billing }: { billing: Billing }) {
  return (
    <div className="table-wrap pr-table-wrap" tabIndex={0} role="region" aria-label="Plan comparison table">
      <table className="t pr-table">
        <caption className="sr-only">Plan comparison. Prices are placeholders.</caption>
        <thead>
          <tr>
            <th scope="col" className="pr-th-feature">
              Feature
            </th>
            {PLANS.map((p) => (
              <th key={p.id} scope="col" className={p.featured ? 'featured' : undefined}>
                {p.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="pr-price-row">
            <th scope="row">
              Price <span className="pr-ph">Placeholder</span>
            </th>
            {PLANS.map((p) => (
              <td key={p.id} className={p.featured ? 'featured' : undefined}>
                {p.monthly === null ? (
                  'Custom'
                ) : (
                  <>
                    <strong>{money(billing === 'monthly' ? p.monthly : annualPerMonth(p.monthly))}</strong>
                    <span className="pr-cell-sub">{billing === 'monthly' ? 'per month' : 'per month, billed yearly'}</span>
                  </>
                )}
              </td>
            ))}
          </tr>
        </tbody>
        {COMPARE.map((g) => (
          <tbody key={g.group}>
            <tr className="pr-group">
              <th scope="colgroup" colSpan={PLANS.length + 1}>
                {g.group}
              </th>
            </tr>
            {g.rows.map((r, i) => (
              <tr key={i}>
                <th scope="row">{r.label}</th>
                {r.cells.map((c, j) => (
                  <td key={j} className={PLANS[j].featured ? 'featured' : undefined}>
                    <CellValue cell={c} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}
