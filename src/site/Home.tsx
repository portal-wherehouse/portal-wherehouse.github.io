import { useEffect, useState } from 'react';
import { qrSvg } from '../device/output';
import { Plate, StateBadge } from '../ui/ui';
import { Icon, type IconName } from '../ui/icons';
import { encodeCode128 } from '../device/code128';
import { Section, SiteLink } from './kit';
import { PRICING } from './prices';
import { useSite } from './routing';
import { SeeItWork } from './SeeItWork';
import { Examples, Founding } from './HomeStories';
import { GroupCards } from './for/GroupCards';
import './home.css';
import './pilot.css';

/** Scrolls down to the "See it work" section, without animating for visitors who prefer less motion. */
function scrollToDemo() {
  const el = document.getElementById('see-it-work');
  if (!el) return;
  let reduce = false;
  try {
    reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    /* animate */
  }
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
}

/** The sample warehouse: opens the app with sample data, no account. */
const SAMPLE_HREF = '?demo=1#signin';

// The page shows the product working first (hero, animation, kinds of business, examples, founding customers)
// and only then asks visitors to set up their own warehouse.
export function Home() {
  const { go } = useSite();
  return (
    <>
      <div className="home-hero-wrap">
        <div className="site-inner home-hero">
          <div className="home-hero-text">
            <p className="site-eyebrow">Know where everything is</p>
            <h1 className="home-hello">
              <span className="home-hello-sub">Keep your</span>
              <span className="home-hello-sub">
                warehouse moving<span className="home-dot">.</span>
              </span>
            </h1>
            <p className="site-lede home-pitch">Scan the item. Scan the spot where you put it. Now anyone on your team can find it, and see who moved it and when. For pallets, boxes, parts, furniture or equipment, in a warehouse, stockroom or yard.</p>
            <div className="site-hero-actions home-actions">
              <a className="site-btn primary" href={SAMPLE_HREF} data-testid="hero-sample">
                <Icon name="play" />
                Try the sample warehouse
              </a>
              <SiteLink to="start" className="site-btn ghost">
                Start your free trial
              </SiteLink>
            </div>
            <p className="home-price">
              <span className="home-price-lead">No account needed for the sample.</span> Free for {PRICING.pilotDays} days when you’re ready, then from ${PRICING.monthly}/warehouse/month. No card to start.
            </p>
            <div className="home-hero-foot">
              <button type="button" className="home-watch" onClick={scrollToDemo}>
                <Icon name="chevronDown" />
                See how it works first
              </button>
              <span className="home-hero-sep" aria-hidden="true" />
              <span className="home-signin">
                Already a customer?{' '}
                <button type="button" className="site-link" onClick={() => go('signin')}>
                  Sign in
                </button>
              </span>
            </div>
          </div>
          <HeroArt />
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

      <Section id="for-your-business" eyebrow="Who it’s for" title="Wherehouse for your kind of business." lede="Find the group closest to yours to see the problems it solves, how a day looks and the features that matter most.">
        <GroupCards />
        <p className="fg-more">
          Don’t see yours?
          <SiteLink to="fit">Check your exact business →</SiteLink>
        </p>
      </Section>

      <Section tone="surface" id="examples" eyebrow="Examples" title="Different businesses. Same routine." lede="Wherehouse works anywhere you store inventory. Here is how three very different businesses could set it up.">
        <Examples />
      </Section>

      <Founding />

      <Section eyebrow="When you’re ready" title="Put your warehouse in Wherehouse in about 2 minutes." lede="Answer a few quick questions before your free trial. We’ll recommend a starting setup built around how you work.">
        <div className="home-survey">
          {(
            [
              ['box', 'What you store', 'Pallets, parts, furniture, equipment or a mix. The app uses your own words.'],
              ['locations', 'Where you keep it', 'Racks, shelves, floor or yard. We plan your storage zones from your answers.'],
              ['print', 'Your printer', 'Pick your printer and we’ll tell you if it works, or what to get.'],
              ['checklist', 'Your next steps', 'A setup checklist walks you through zones, labels, your first items and your crew.'],
            ] as [IconName, string, string][]
          ).map(([icon, title, body]) => (
            <article key={title} className="home-survey-step">
              <span className="home-survey-bubble">
                <Icon name={icon} />
              </span>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
        <div className="site-hero-actions">
          <SiteLink to="start" className="site-btn primary">
            Take the 2-minute survey
          </SiteLink>
          <span className="home-survey-note">Free. No card. You still set up your own spots and labels; the survey gives you the plan.</span>
        </div>
        <div className="home-more-links">
          <SiteLink to="hardware">Printing & scanning →</SiteLink>
          <SiteLink to="simple">What we leave out →</SiteLink>
          <SiteLink to="mission">Our mission →</SiteLink>
          <SiteLink to="showcase">Process walkthrough →</SiteLink>
        </div>
      </Section>
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
