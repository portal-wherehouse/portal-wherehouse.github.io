import { useEffect, useState } from 'react';
import { qrSvg } from '../device/output';
import { Plate, StateBadge } from '../ui/ui';
import { Icon, type IconName } from '../ui/icons';
import { encodeCode128 } from '../device/code128';
import { CREATOR } from '../brand';
import { Section, SiteLink, firstName } from './kit';
import { PRICING } from './prices';
import { sampleHref } from '../config/hosts';
import { SeeItWork } from './SeeItWork';
import { openGroup } from './for/GroupCards';
import { groupById, groupHref, groupTitle, type GroupId } from './for/groups';
import './home.css';
import './pilot.css';

/** The sample warehouse: opens the app with sample data, no account. */
const SAMPLE_HREF = sampleHref();

/** The kinds of business shown on the home page, with a short name for the compact row. The rest are on #for. */
const HOME_GROUPS: { id: GroupId; label: string }[] = [
  { id: 'warehouses', label: 'Warehouses' },
  { id: 'lumberyards', label: 'Lumberyards' },
  { id: 'contractors', label: 'Contractors' },
  { id: 'parts', label: 'Auto and parts' },
  { id: 'rentals', label: 'Rental and events' },
  { id: 'retail', label: 'Stockrooms' },
];

// The page shows the product first (hero picture, then the two-scan animation), lets visitors spot
// their kind of business, and closes with the same two buttons as the hero. Everything longer lives on its own page.
export function Home() {
  return (
    <>
      <div className="home-hero-wrap">
        <div className="site-inner home-hero">
          <div className="home-hero-head">
            <p className="site-eyebrow">Know where everything is</p>
            <h1 className="home-hello">
              <span className="home-hello-sub">Keep your</span>
              <span className="home-hello-sub">
                warehouse moving<span className="home-dot">.</span>
              </span>
            </h1>
            <p className="site-lede home-pitch">Scan the item, scan the spot where you put it, and anyone on your team can find it.</p>
          </div>
          <HeroArt />
          <div className="home-hero-cta">
            <div className="site-hero-actions home-actions">
              <a className="site-btn primary" href={SAMPLE_HREF} data-testid="hero-sample">
                <Icon name="play" />
                Try the sample warehouse for your business
              </a>
              <SiteLink to="start" className="site-btn ghost">
                Start your free trial
              </SiteLink>
            </div>
            <p className="home-price">
              <span className="home-price-lead">No account needed for the sample.</span> Free for {PRICING.pilotDays} days, then from ${PRICING.monthly}/warehouse/month. No card to start.
            </p>
          </div>
        </div>
      </div>

      <Section id="see-it-work" eyebrow="See it work" title="Two scans. Then anyone can find it." lede="This is the whole routine. No counting, no forms. Here it is with one box and one shelf.">
        <SeeItWork />
        <div className="home-try">
          <div>
            <strong>Want to try it yourself?</strong>
            <span>The sample warehouse has items, shelves and history already in it. Nothing to set up.</span>
          </div>
          <a className="site-btn primary" href={SAMPLE_HREF}>
            Open the sample warehouse
          </a>
        </div>
      </Section>

      <section className="site-section tone-surface home-for" id="for-your-business" aria-labelledby="home-for-title">
        <div className="site-inner home-for-inner">
          <div className="home-for-head">
            <div className="site-eyebrow">Who it’s for</div>
            <h2 className="site-h2" id="home-for-title">
              Made for businesses like yours.
            </h2>
          </div>
          <ul className="home-for-chips" data-testid="home-for-chips">
            {HOME_GROUPS.map(({ id, label }) => {
              const g = groupById(id);
              if (!g) return null;
              return (
                <li key={id}>
                  <a className="home-for-chip" href={groupHref(id)} onClick={(e) => openGroup(e, id)} title={groupTitle(g)}>
                    <Icon name={g.icon} />
                    <span>{label}</span>
                  </a>
                </li>
              );
            })}
          </ul>
          <a className="site-link home-for-all" href={groupHref()} onClick={(e) => openGroup(e)} data-testid="home-for-all">
            See all kinds of business →
          </a>
        </div>
      </section>

      <div className="site-inner home-note-wrap">
        <p className="home-note" data-testid="home-founding">
          <span className="home-note-beta">
            <i aria-hidden="true" />
            In beta
          </span>
          <span className="home-note-text">You talk directly to {firstName(CREATOR.name)}, who builds Wherehouse. Your requests shape what comes next.</span>
          <SiteLink to="founder" className="site-link home-note-link">
            About {firstName(CREATOR.name)} →
          </SiteLink>
        </p>
      </div>

      <section className="site-section tone-ink home-close" data-testid="home-close" aria-labelledby="home-close-title">
        <div className="site-inner home-close-inner">
          <div>
            <h2 className="site-h2" id="home-close-title">
              Ready to set up yours?
            </h2>
            <p className="site-lede">Look around the sample first, or start your free trial with a 2-minute setup survey.</p>
          </div>
          <div className="site-hero-actions home-actions">
            <a className="site-btn primary" href={SAMPLE_HREF} data-testid="close-sample">
              <Icon name="play" />
              Try the sample warehouse for your business
            </a>
            <SiteLink to="start" className="site-btn ghost">
              Start your free trial
            </SiteLink>
          </div>
        </div>
      </section>
    </>
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
