// Website home: a bold hello, the guided tour right on the page, then one short, scannable
// teaser for each of the other website pages.

import { useEffect, useState } from 'react';
import { BRAND, CREATOR } from '../brand';
import { useApp, type SiteRouteName } from '../app/state';
import { qrSvg } from '../device/output';
import { Icon, type IconName } from '../ui/icons';
import { Plate, StateBadge } from '../ui/ui';
import { CtaBand, FeatureCards, Placeholder, PortalCTA, Section, SiteLink } from './kit';
import { TryIt } from './TryIt';
import './home.css';

export function Home() {
  return (
    <>
      <Hero />

      <Section id="tour" tone="surface" eyebrow="Guided tour" title="Take the guided tour" lede="Six steps, about two minutes, right here on this page. No account needed.">
        <TryIt />
      </Section>

      <Verbs />
      <Scanners />
      <Capabilities />
      <Simple />
      <Applications />
      <Customers />
      <Pricing />
      <Founder />

      <CtaBand title="See it in your own yard." />
    </>
  );
}

/** A button to the page a teaser summarizes, set the same way at the end of every section. */
function More({ to, children, tone = 'ghost' }: { to: SiteRouteName; children: string; tone?: 'ghost' | 'primary' }) {
  return (
    <div className="home-more">
      <SiteLink to={to} className={`site-btn ${tone}`}>
        {children}
        <Icon name="arrowRight" />
      </SiteLink>
    </div>
  );
}

// ------------------------------------------------------------------ hero

function scrollToTour() {
  const el = document.getElementById('tour');
  if (!el) return;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  // Move keyboard and screen reader focus along with the scroll.
  const heading = el.querySelector<HTMLElement>('h2');
  if (heading) {
    heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: true });
  }
}

function Hero() {
  const { go } = useApp();
  return (
    <div className="home-hero-wrap">
      <div className="site-inner home-hero">
        <div className="home-hero-text">
          <p className="site-eyebrow">Pallet tracking for construction warehouses</p>
          <h1 className="home-hello">
            <span className="home-hello-word">
              Hello<span className="home-dot">.</span>
            </span>
            <span className="home-hello-sub">Welcome to {BRAND.name}.</span>
          </h1>
          <p className="site-lede home-pitch">
            <strong>{BRAND.tagline}</strong> Every pallet gets a QR label. Your crew scans it when it arrives and again when it moves, so anyone can find it by job, code, rack or description.
          </p>
          <div className="site-hero-actions home-actions">
            <button className="site-btn primary" onClick={scrollToTour}>
              <Icon name="play" />
              Take the guided tour
            </button>
            <button className="site-btn ghost" onClick={() => go('showcase')}>
              See what it can do
              <Icon name="arrowRight" />
            </button>
          </div>
          <div className="home-portal">
            <PortalCTA variant="hero" />
            <p className="home-portal-note">Sign-in is off while we test, so you can walk right in and look around.</p>
          </div>
        </div>
        <HeroArt />
      </div>
    </div>
  );
}

/** A printed pallet label next to a phone showing where that pallet was last confirmed. */
function HeroArt() {
  const [qr, setQr] = useState('');
  useEffect(() => {
    let live = true;
    void qrSvg('PL1:P:WH-DEMO-000042').then((s) => live && setQr(s));
    return () => {
      live = false;
    };
  }, []);

  return (
    <div className="home-art" role="img" aria-label="A printed pallet label for P-000042 with a QR code and a barcode, beside a phone showing the Find screen: P-000042, stored, last confirmed at rack A-03-02.">
      <div className="home-stage" aria-hidden="true">
        <div className="home-bay">
          <span className="home-bay-up left" />
          <span className="home-bay-up right" />
          <span className="home-bay-load">
            <i />
            <i />
            <i />
          </span>
          <span className="home-bay-beam" />
          <span className="home-bay-tag">
            <b>A-03-02</b>
            <small>Rack</small>
          </span>
        </div>

        <div className="home-label">
          <div className="home-label-stripe" />
          <div className="home-label-code">P-000042</div>
          <div className="home-label-job">Job J-214</div>
          <div className="home-label-desc">Lighting fixtures</div>
          <div className="home-label-row">
            <div className="home-label-qr" dangerouslySetInnerHTML={{ __html: qr }} />
            <div className="home-label-meta">
              School renovation
              <br />
              Maple Street school
            </div>
          </div>
          <Barcode text="P-000042" />
          <div className="home-label-foot">If the QR is damaged, type P-000042</div>
        </div>

        <div className="home-phone">
          <div className="home-phone-screen">
            <div className="home-phone-status">
              <span>9:41</span>
              <span className="home-phone-island" />
              <span className="home-phone-bars">
                <i />
                <i />
                <i />
              </span>
            </div>
            <div className="home-phone-title">Find</div>
            <div className="home-phone-search">
              <Icon name="find" />
              <span className="grow">P-000042</span>
              <span className="home-phone-scanbtn">
                <Icon name="barcode" />
              </span>
            </div>
            <div className="home-phone-hit">
              <div className="home-phone-hit-top">
                <span className="home-phone-code">P-000042</span>
                <StateBadge state="STORED" />
              </div>
              <div className="home-phone-desc">Lighting fixtures</div>
              <div className="home-phone-where">
                <Plate code="A-03-02" size="sm" />
                <span>
                  <b>Last confirmed at A-03-02</b>
                  <br />2 min ago
                </span>
              </div>
              <div className="home-phone-job">
                <span className="home-phone-jcode">J-214</span> School renovation
              </div>
            </div>
            <div className="home-phone-history">
              <div className="home-phone-hist-h">History</div>
              <div className="home-phone-ev">
                <i className="on" />
                Moved B-01-01 to A-03-02
              </div>
              <div className="home-phone-ev">
                <i />
                Placed at B-01-01
              </div>
              <div className="home-phone-ev">
                <i />
                Received for J-214
              </div>
            </div>
            <div className="home-phone-tabs">
              {(['receive', 'move', 'find', 'more'] as IconName[]).map((n) => (
                <span key={n} className={n === 'find' ? 'on' : undefined}>
                  <Icon name={n} />
                  {n[0].toUpperCase() + n.slice(1)}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="home-scan-chip">
          <span className="home-scan-dot" />
          <Icon name="scanner" />
          Scanned P-000042
        </div>
      </div>
    </div>
  );
}

/** A decorative linear barcode. The bar pattern is derived from the text so it stays the same. */
function Barcode({ text }: { text: string }) {
  const widths = [2, 1, 1, 2, 1, 1];
  for (const ch of text) {
    const c = ch.charCodeAt(0);
    widths.push(1 + (c % 3), 1 + ((c >> 2) % 2), 1 + ((c >> 1) % 3), 1 + ((c >> 3) % 2));
  }
  widths.push(2, 3, 1, 1, 2);
  const bars: { x: number; w: number }[] = [];
  let x = 0;
  widths.forEach((w, i) => {
    if (i % 2 === 0) bars.push({ x, w });
    x += w;
  });
  return (
    <div className="home-barcode">
      <svg viewBox={`0 0 ${x} 10`} preserveAspectRatio="none">
        {bars.map((b) => (
          <rect key={b.x} x={b.x} width={b.w} height={10} fill="currentColor" />
        ))}
      </svg>
      <span>{text}</span>
    </div>
  );
}

// ------------------------------------------------------------------ receive, move, find

const VERBS: { n: string; icon: IconName; title: string; body: string; from: string; to: string }[] = [
  {
    n: '01',
    icon: 'receive',
    title: 'Receive',
    body: 'A delivery shows up. Pick the job, say what came in, and print a QR label for each pallet.',
    from: 'J-214',
    to: 'P-000042',
  },
  {
    n: '02',
    icon: 'move',
    title: 'Move',
    body: 'Scan the pallet, scan the rack, confirm. The new spot is saved with who moved it and when.',
    from: 'P-000042',
    to: 'A-03-02',
  },
  {
    n: '03',
    icon: 'find',
    title: 'Find',
    body: 'Search by job, pallet code, rack or description. Each result shows where it was last confirmed.',
    from: 'J-214',
    to: 'A-03-02',
  },
];

function Verbs() {
  return (
    <Section eyebrow="How it works" title="Receive. Move. Find." lede="The daily work comes down to three jobs. Each one is a scan or two and a tap.">
      <ol className="home-verbs">
        {VERBS.map((v) => (
          <li key={v.title} className="home-verb">
            <div className="home-verb-top">
              <span className="home-verb-icon">
                <Icon name={v.icon} />
              </span>
              <span className="home-verb-n">{v.n}</span>
            </div>
            <h3>{v.title}</h3>
            <p>{v.body}</p>
            <div className="home-verb-flow" aria-hidden="true">
              <span className="home-code">{v.from}</span>
              <Icon name="arrowRight" />
              <span className="home-code">{v.to}</span>
            </div>
          </li>
        ))}
      </ol>
      <More to="product">See how the product works</More>
    </Section>
  );
}

// ------------------------------------------------------------------ scanners

const SCANNERS: { icon: IconName; title: string; body: string }[] = [
  { icon: 'usb', title: 'USB scanners', body: 'Plug into a computer or scan station. In keyboard mode, each scan types straight in.' },
  { icon: 'bluetooth', title: 'Bluetooth scanners', body: 'Pair with a phone, tablet or laptop. Same keyboard mode, no cable.' },
  { icon: 'scanner', title: 'Rugged handhelds', body: 'Handhelds with a built-in scanner can usually send scans as typed text too.' },
  { icon: 'camera', title: 'Phone camera', body: 'No scanner yet? The phone camera reads the QR label.' },
  { icon: 'keyboard', title: 'Typed codes', body: 'Label torn? Type the code printed under the QR. Short forms like p42 work.' },
];

function Scanners() {
  return (
    <Section
      tone="ink"
      eyebrow="Scanners"
      title="Works with the scanners you already own"
      lede="Nobody should type pallet codes all day. Most USB and Bluetooth scanners can be set to act as a keyboard, often called HID or keyboard-wedge mode. Wherehouse listens for that, so each scan lands on the screen you are using."
    >
      <div className="home-wedge" aria-hidden="true">
        <span className="home-wedge-cap">Keyboard mode</span>
        <span className="home-wedge-step">
          <Icon name="scanner" /> Scan
        </span>
        <span className="home-wedge-arrow" />
        <span className="home-wedge-type">
          P-000042<span className="home-wedge-key">Enter</span>
        </span>
        <span className="home-wedge-arrow" />
        <span className="home-wedge-step">
          <Icon name="checkCircle" /> Pallet found
        </span>
      </div>
      <ul className="home-scan-grid">
        {SCANNERS.map((s) => (
          <li key={s.title} className="home-scan-item">
            <span className="home-scan-icon">
              <Icon name={s.icon} />
            </span>
            <div className="home-scan-text">
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </div>
          </li>
        ))}
      </ul>
      <More to="hardware" tone="primary">
        See scanner setup
      </More>
    </Section>
  );
}

// ------------------------------------------------------------------ see it in action

function Capabilities() {
  return (
    <Section eyebrow="See it in action" title="What it does every day" lede="A few of the things Wherehouse handles. The showcase walks through each one, screen by screen.">
      <FeatureCards
        columns={3}
        items={[
          { icon: 'receive', title: 'Receive against the job', body: 'Every pallet is tied to a job from the moment it arrives, so nothing sits in the yard as “misc.”' },
          { icon: 'move', title: 'Two-scan moves', body: 'Pallet, then rack, then confirm. You see both codes before anything is saved.' },
          { icon: 'find', title: 'Find in seconds', body: 'Search by job, code, rack or description. Results say where each pallet was last confirmed, and when.' },
          { icon: 'labels', title: 'Labels for pallets and racks', body: 'Print 4x6 pallet labels or full sheets, plus rack labels. The code is printed large with the QR beside it.' },
          { icon: 'history', title: 'History on every pallet', body: 'Every receipt, move, hold and dispatch is recorded with who and when. Corrections add an entry; nothing is erased.' },
          { icon: 'wifiOff', title: 'Keeps going on bad signal', body: 'Moves and location checks wait on the device and send when the connection comes back.' },
        ]}
      />
      <More to="showcase">See it in action</More>
    </Section>
  );
}

// ------------------------------------------------------------------ why it's simple

const SIMPLE: { title: string; body: string }[] = [
  { title: 'Three verbs, not thirty menus', body: 'Receive, Move and Find cover the daily work. Everything else stays out of the way.' },
  { title: 'Scan, don’t type', body: 'Labels and scanners do the typing. When you do type, short codes work.' },
  { title: 'Honest about location', body: 'It shows where a pallet was last confirmed, and when. Never a guess dressed up as a fact.' },
  { title: 'Nothing gets erased', body: 'Fix a mistake with a reason. The history keeps both, so you can always see what happened.' },
];

function Simple() {
  return (
    <Section tone="hazard" eyebrow="Why it’s simple" title="Simple on purpose" lede="A crew should learn it in one shift. These are the rules that keep it that way.">
      <ol className="home-simple">
        {SIMPLE.map((s, i) => (
          <li key={s.title}>
            <span className="home-simple-n">{String(i + 1).padStart(2, '0')}</span>
            <h3>{s.title}</h3>
            <p>{s.body}</p>
          </li>
        ))}
      </ol>
      <More to="simple" tone="primary">
        Read why it’s simple
      </More>
    </Section>
  );
}

// ------------------------------------------------------------------ applications

function Applications() {
  return (
    <Section eyebrow="Applications" title="Made for yards that stage material by job" lede="If deliveries wait on racks until a crew needs them, Wherehouse fits.">
      <FeatureCards
        columns={4}
        items={[
          { icon: 'hardhat', title: 'General contractors', body: 'Hold material for several jobs at once and send the right pallets to the right site.' },
          { icon: 'bolt', title: 'Specialty trades', body: 'Electrical, mechanical and plumbing shops that stage fixtures and parts ahead of install.' },
          { icon: 'truck', title: 'Supply yards', body: 'Suppliers that hold customer orders on racks until pickup or delivery.' },
          { icon: 'building', title: 'Facilities teams', body: 'Campuses, districts and public works that store furniture, spares and project stock.' },
        ]}
      />
      <More to="industries">See applications</More>
    </Section>
  );
}

// ------------------------------------------------------------------ customers (placeholders)

function Customers() {
  return (
    <Section tone="surface" eyebrow="Customers" title="Customer stories are on the way" lede="Wherehouse is new, so there are no customer stories yet. The ones that go here will be real, shared with permission.">
      <ul className="home-logos" aria-label="Customer logo placeholders">
        {Array.from({ length: 6 }, (_, i) => (
          <li key={i}>
            <Placeholder label="Customer logo" minHeight={92} />
          </li>
        ))}
      </ul>
      <div className="home-early">
        <span className="home-early-tag">Early customer program</span>
        <p>Want to run {BRAND.name} in your own yard early and help shape what it becomes? Ask about early access.</p>
        <SiteLink to="customers" className="site-btn ghost">
          Learn about early access
          <Icon name="arrowRight" />
        </SiteLink>
      </div>
    </Section>
  );
}

// ------------------------------------------------------------------ pricing (placeholders)

const PLANS: { name: string; fit: string; points: string[] }[] = [
  { name: 'Starter', fit: 'One yard getting its first racks labeled.', points: ['Receive, Move and Find', 'Pallet and rack labels', 'Works with your scanners'] },
  { name: 'Team', fit: 'A busy yard with a crew on every shift.', points: ['Everything in Starter', 'Owner, supervisor, operator and viewer roles', 'Reconcile and full history'] },
  { name: 'Company', fit: 'Several yards or companies, one login.', points: ['Everything in Team', 'More than one company per account', 'Export your records any time'] },
];

function Pricing() {
  return (
    <Section eyebrow="Pricing" title="Plans for every size of yard" lede="Three plans, one app. Plan names, prices and details are placeholders until early testing wraps up.">
      <ul className="home-plans">
        {PLANS.map((p) => (
          <li key={p.name} className="home-plan">
            <h3>{p.name}</h3>
            <p className="home-plan-fit">{p.fit}</p>
            <Placeholder label="Price placeholder">
              <span className="home-plan-amount">$XX</span> <span className="home-plan-per">per month</span>
            </Placeholder>
            <ul className="home-plan-points">
              {p.points.map((pt) => (
                <li key={pt}>
                  <Icon name="check" />
                  {pt}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      <More to="pricing">See pricing</More>
    </Section>
  );
}

// ------------------------------------------------------------------ founder

function Founder() {
  return (
    <Section tone="surface">
      <div className="home-founder">
        <Placeholder label="Photo">
          <div className="home-founder-ph">
            <Icon name="user" />
            <span>Photo of {CREATOR.name} coming soon</span>
          </div>
        </Placeholder>
        <div className="home-founder-text">
          <div className="site-eyebrow">About</div>
          <h2 className="site-h2">Built by {CREATOR.name}</h2>
          <p className="site-lede">
            {BRAND.name} is designed and built by {CREATOR.name}. The About page has more, and you can reach him directly with questions or ideas for your yard.
          </p>
          <div className="site-hero-actions">
            <SiteLink to="founder" className="site-btn primary">
              Read the About page
              <Icon name="arrowRight" />
            </SiteLink>
            <a className="site-btn ghost" href={CREATOR.linkedin} target="_blank" rel="noopener noreferrer">
              <Icon name="linkedin" />
              LinkedIn
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </div>
        </div>
      </div>
    </Section>
  );
}
