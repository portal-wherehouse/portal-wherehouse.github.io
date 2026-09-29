// Website home: the warehouse problem, a working demo, and a focused pilot offer.

import { useEffect, useState } from 'react';
import { useApp, type SiteRouteName } from '../app/state';
import { qrSvg } from '../device/output';
import { Icon, type IconName } from '../ui/icons';
import { Plate, StateBadge } from '../ui/ui';
import { CtaBand, FeatureCards, PortalCTA, Section, SiteLink } from './kit';
import { TryIt } from './TryIt';
import './home.css';
import './pilot.css';
import { encodeCode128 } from '../device/code128';
import { PRICING } from './prices';

export function Home() {
  return (
    <>
      <Hero />

      <Section id="tour" tone="surface" eyebrow="Guided tour" title="Take the guided tour" lede="Six steps, about two minutes, right here on this page. No account needed.">
        <TryIt />
      </Section>

      <Verbs />
      <Applications />
      <Customers />
      <Pricing />

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
            <span className="home-hello-sub">Find the right pallet.</span>
            <span className="home-hello-sub">Get the job moving<span className="home-dot">.</span></span>
          </h1>
          <p className="site-lede home-pitch">
            Track material from receiving to dispatch, organized by job. Scan a pallet and its rack, then find its last confirmed location without walking every aisle.
          </p>
          <div className="site-hero-actions home-actions">
            <button className="site-btn primary" onClick={scrollToTour}>
              <Icon name="play" />
              Take the guided tour
            </button>
            <button className="site-btn ghost" onClick={() => go('product')}>
              How it works
              <Icon name="arrowRight" />
            </button>
          </div>
          <div className="home-portal">
            <PortalCTA variant="hero" />
            <p className="home-portal-note">Try a sample warehouse. This demo does not sync between devices.</p>
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
          <div className="home-label-foot">If both codes are damaged, type P-000042</div>
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

/** The pallet's Code 128 barcode, drawn by the same encoder as the printed labels. */
function Barcode({ text }: { text: string }) {
  const widths = encodeCode128(text).widths;
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

// Pilot and pricing: no invented customers or testimonials.
function Customers() {
  return <Section tone="surface" eyebrow="Pilot program" title="Start with one rack, one crew, one job."
    lede="We are looking for a warehouse that stages construction material by job. First, try the sample workflow. Then help test it against a real shift.">
    <FeatureCards items={[
      { icon: 'receive', title: 'Watch one delivery', body: 'Identify where labels, job references and pallet movements are recorded today.' },
      { icon: 'find', title: 'Measure the difference', body: 'Compare retrieval time, missed scans and recorded locations with physical checks.' },
      { icon: 'checklist', title: 'Decide with evidence', body: 'Review search time and location accuracy together before deciding whether to continue.' },
    ]} />
    <More to="customers">Explore the pilot program</More>
  </Section>;
}
function Pricing() {
  return <Section eyebrow="Simple pricing" title="One warehouse. One proposed plan."
    lede="Try the browser demo for free. Shared warehouse accounts are still in development; there is nothing to buy today.">
    <div className="home-early">
      <div><span className="home-early-tag">Proposed launch price</span>
      <p><strong className="pilot-price">${PRICING.monthly}</strong> / warehouse / month · up to {PRICING.users} users</p>
      <p>A {PRICING.pilotDays}-day free pilot can be agreed once shared accounts are ready. No automatic paid enrollment.</p></div>
      <SiteLink to="pricing" className="site-btn primary">See pricing and pilot terms<Icon name="arrowRight" /></SiteLink>
    </div>
  </Section>;
}
