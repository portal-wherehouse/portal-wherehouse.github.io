// Home page sections that show Wherehouse in context before asking anyone to set it up:
// three worked examples (clearly marked as examples, not customers) and the founding-customer offer.

import type { ReactNode } from 'react';
import { CREATOR } from '../brand';
import { Icon } from '../ui/icons';
import { Monogram, SiteLink, firstName } from './kit';
import './home-stories.css';

interface Example {
  id: string;
  title: string;
  what: string;
  body: string;
  items: string;
  spots: string;
  search: string;
  spot: string;
  art: ReactNode;
}

const EXAMPLES: Example[] = [
  {
    id: 'distributor',
    title: 'A small distributor',
    what: 'Cases and pallets on shelving and racks.',
    body: 'Receiving scans each pallet to the rack spot where it goes. Pickers search the product and walk straight to it, instead of checking every aisle.',
    items: 'Pallets and cases',
    spots: 'Aisles, bays, shelves and the dock',
    search: 'paper towels',
    spot: 'A-04-2',
    art: <DistributorArt />,
  },
  {
    id: 'yard',
    title: 'A contractor’s yard',
    what: 'Job material, tools and equipment, inside and out.',
    body: 'Material is received to its job and put in a yard row or container. In the morning, the crew searches the job and loads the right order.',
    items: 'Job material, tools and equipment',
    spots: 'Yard rows, containers and trucks',
    search: 'J-118 fixtures',
    spot: 'CONT-2',
    art: <YardArt />,
  },
  {
    id: 'rental',
    title: 'An event rental company',
    what: 'Tables, linens, lighting and cases that go out and come back.',
    body: 'Each case and crate is labeled once. When a load comes back from an event, a scan to its shelf shows the whole team what is back and where it went.',
    items: 'Tables, linens, lighting and cases',
    spots: 'Bays, shelves, the wash area and trailers',
    search: 'uplight case',
    spot: 'D-03',
    art: <RentalArt />,
  },
];

export function Examples() {
  return (
    <div className="ex" data-testid="home-examples">
      <div className="ex-grid">
        {EXAMPLES.map((e) => (
          <article key={e.id} className="ex-card" aria-labelledby={`ex-${e.id}`}>
            <div className="ex-art">
              {e.art}
              <span className="ex-tag">Example</span>
            </div>
            <div className="ex-body">
              <p className="ex-kicker">How it could look</p>
              <h3 id={`ex-${e.id}`}>{e.title}</h3>
              <p className="ex-what">{e.what}</p>
              <p className="ex-text">{e.body}</p>
              <dl className="ex-facts">
                <div>
                  <dt>Labels on</dt>
                  <dd>{e.items}</dd>
                </div>
                <div>
                  <dt>Spots</dt>
                  <dd>{e.spots}</dd>
                </div>
              </dl>
              <div className="ex-find" aria-label={`Searching “${e.search}” shows spot ${e.spot}`}>
                <span className="ex-find-q">
                  <Icon name="find" />
                  <span>{e.search}</span>
                </span>
                <Icon name="arrowRight" className="ex-find-arrow" />
                <span className="ex-spot">{e.spot}</span>
              </div>
            </div>
          </article>
        ))}
      </div>
      <p className="ex-note">
        <Icon name="info" />
        These are examples of how Wherehouse could be set up. They are not customer stories.
      </p>
    </div>
  );
}

/** Founding customers: a direct line to the person who builds Wherehouse. */
export function Founding() {
  return (
    <section className="site-section tone-ink home-founding" id="founding" data-testid="home-founding">
      <div className="site-inner hf-grid">
        <div className="hf-text">
          <span className="hf-beta">
            <i />
            In beta
          </span>
          <div className="site-eyebrow">Founding customers</div>
          <h2 className="site-h2">Help decide what gets built next.</h2>
          <p className="site-lede">We’re in beta. The first businesses to use Wherehouse shape where it goes. You talk directly to the person who builds it, and your requests get built.</p>
          <ol className="hf-steps">
            <li>
              <span className="hf-n">1</span>
              <div>
                <h3>Ask for it</h3>
                <p>Email what would make your day easier. A missing field, a label layout, a report.</p>
              </div>
            </li>
            <li>
              <span className="hf-n">2</span>
              <div>
                <h3>Talk to the builder</h3>
                <p>{CREATOR.name} writes the code. He talks it through with you, not a ticket system.</p>
              </div>
            </li>
            <li>
              <span className="hf-n">3</span>
              <div>
                <h3>See it in your app</h3>
                <p>When it’s ready, it shows up in the app your team already uses.</p>
              </div>
            </li>
          </ol>
          <div className="site-hero-actions">
            <a className="site-btn primary" href={`mailto:${CREATOR.email}?subject=${encodeURIComponent('Founding customer')}`}>
              <Icon name="mail" />
              Email {firstName(CREATOR.name)}
            </a>
            <SiteLink to="contact" className="site-btn ghost">
              Book a free walkthrough
            </SiteLink>
          </div>
        </div>

        <aside className="hf-card" aria-label="Who you’ll talk to">
          <div className="hf-card-top">
            <Monogram />
            <div>
              <div className="hf-card-name">{CREATOR.name}</div>
              <div className="hf-card-role">Founder · Charleston, SC</div>
            </div>
          </div>
          <ul className="hf-list">
            <li>
              <Icon name="chat" />
              Your email reaches him directly.
            </li>
            <li>
              <Icon name="pin" />
              In-person setup within about an hour of Charleston.
            </li>
            <li>
              <Icon name="sparkle" />
              Founding customers help set the plan.
            </li>
          </ul>
          <SiteLink to="founder" className="site-link hf-card-link">
            About {firstName(CREATOR.name)} →
          </SiteLink>
        </aside>
      </div>
    </section>
  );
}


/* ---------------------------------------------------------------- example illustrations */

function Pin({ x, y }: { x: number; y: number }) {
  return (
    <g className="ex-pin" transform={`translate(${x} ${y})`}>
      <ellipse className="ex-pin-shadow" cx="0" cy="24" rx="7" ry="2.2" />
      <g className="ex-pin-body">
        <path d="M0 22S-10 10.5-10 4.2A10 10 0 0 1 10 4.2C10 10.5 0 22 0 22z" />
        <circle cx="0" cy="4" r="3.6" />
      </g>
    </g>
  );
}

function Case({ x, y, w, h, tone = 'card' }: { x: number; y: number; w: number; h: number; tone?: 'card' | 'card2' | 'soft' | 'dark' }) {
  return (
    <g>
      <rect className={`f-${tone}`} x={x} y={y} width={w} height={h} rx="2" />
      {tone.startsWith('card') && <rect className="f-tape" x={x + w / 2 - 2.5} y={y} width="5" height={Math.min(8, h / 2)} />}
    </g>
  );
}

function DistributorArt() {
  return (
    <svg viewBox="0 0 320 150" aria-hidden="true">
      <rect className="f-floor" x="0" y="132" width="320" height="18" />
      {/* Rack: three uprights, two beam levels. */}
      {[18, 118, 218].map((x) => (
        <rect key={x} className="f-acc" x={x} y="16" width="6" height="116" rx="1" />
      ))}
      {[60, 98].map((y) => (
        <rect key={y} className="f-haz" x="16" y={y} width="210" height="5" rx="1" />
      ))}
      <Case x={28} y={36} w={26} h={24} />
      <Case x={57} y={30} w={28} h={30} tone="card2" />
      <Case x={88} y={40} w={26} h={20} />
      <Case x={128} y={34} w={40} h={26} tone="card2" />
      <Case x={171} y={42} w={42} h={18} />
      <Case x={28} y={74} w={36} h={24} tone="card2" />
      <Case x={67} y={78} w={46} h={20} />
      <Case x={130} y={72} w={34} h={26} />
      <Case x={167} y={80} w={46} h={18} tone="card2" />
      {/* Floor level pallets. */}
      <rect className="f-pallet" x="28" y="127" width="84" height="5" />
      <Case x={32} y={106} w={24} h={21} />
      <Case x={58} y={106} w={24} h={21} tone="card2" />
      <Case x={84} y={110} w={24} h={17} />
      <rect className="f-pallet" x="128" y="127" width="84" height="5" />
      <rect className="f-wrap" x="132" y="104" width="76" height="23" rx="3" />
      {/* Spot labels. */}
      {[
        [40, 66, 'A-04-1'],
        [140, 66, 'A-04-2'],
        [40, 104, 'A-05-1'],
      ].map(([x, y, t]) => (
        <g key={t as string}>
          <rect className="f-plate" x={x as number} y={y as number} width="30" height="9" rx="1.5" />
          <text className="t-plate" x={(x as number) + 15} y={(y as number) + 7}>
            {t}
          </text>
        </g>
      ))}
      {/* Dock door and a staged pallet. */}
      <rect className="f-soft" x="242" y="30" width="66" height="102" rx="2" />
      {[44, 58, 72, 86].map((y) => (
        <line key={y} className="ln-soft" x1="242" x2="308" y1={y} y2={y} />
      ))}
      <rect className="f-pallet" x="246" y="127" width="58" height="5" />
      <Case x={250} y={108} w={24} h={19} tone="card2" />
      <Case x={276} y={112} w={24} h={15} />
      <Pin x={148} y={8} />
    </svg>
  );
}

function YardArt() {
  return (
    <svg viewBox="0 0 320 150" aria-hidden="true">
      <rect className="f-floor" x="0" y="132" width="320" height="18" />
      {/* Chain-link fence along the back. */}
      <rect className="f-fence" x="0" y="44" width="320" height="88" />
      {Array.from({ length: 9 }, (_, i) => (
        <line key={i} className="ln" x1={i * 40 + 4} x2={i * 40 + 4} y1="40" y2="132" />
      ))}
      <line className="ln" x1="0" x2="320" y1="44" y2="44" />
      {/* Shipping container. */}
      <rect className="f-acc" x="14" y="60" width="118" height="72" rx="2" />
      {Array.from({ length: 11 }, (_, i) => (
        <line key={i} className="ln-acc" x1={24 + i * 10} x2={24 + i * 10} y1="64" y2="128" />
      ))}
      <rect className="f-plate" x="54" y="70" width="38" height="12" rx="2" />
      <text className="t-plate big" x="73" y="79.5">
        CONT-2
      </text>
      {/* Pipe and conduit bundle, end on. */}
      <rect className="f-pallet" x="148" y="127" width="62" height="5" />
      {[
        [158, 119],
        [172, 119],
        [186, 119],
        [200, 119],
        [165, 106],
        [179, 106],
        [193, 106],
        [172, 93],
        [186, 93],
      ].map(([cx, cy]) => (
        <g key={`${cx}-${cy}`}>
          <circle className="f-soft ln" cx={cx} cy={cy} r="7" />
          <circle className="f-hole" cx={cx} cy={cy} r="3.4" />
        </g>
      ))}
      {/* Pickup truck. */}
      <g className="ex-truck">
        <path className="f-dark" d="M222 122v-18c0-3 2-5 5-5h30l12-17h24c3 0 5 2 5 5v35z" />
        <path className="f-glass" d="M264 97l9-12h17v12z" />
        <rect className="f-dark" x="218" y="112" width="96" height="14" rx="3" />
        <circle className="f-tire" cx="240" cy="128" r="9" />
        <circle className="f-tire" cx="292" cy="128" r="9" />
        <circle className="f-hub" cx="240" cy="128" r="3.5" />
        <circle className="f-hub" cx="292" cy="128" r="3.5" />
        <Case x={226} y={86} w={22} h={13} />
      </g>
      <Pin x={73} y={30} />
    </svg>
  );
}

function RentalArt() {
  return (
    <svg viewBox="0 0 320 150" aria-hidden="true">
      <rect className="f-floor" x="0" y="132" width="320" height="18" />
      {/* Shelving: linens on top, road cases in the middle, chair stack on the bottom. */}
      {[14, 136].map((x) => (
        <rect key={x} className="f-steel" x={x} y="14" width="5" height="118" rx="1" />
      ))}
      {[52, 92].map((y) => (
        <rect key={y} className="f-haz" x="12" y={y} width="131" height="4" rx="1" />
      ))}
      {[
        [24, 'f-lin1'],
        [52, 'f-lin2'],
      ].map(([x, c]) => (
        <g key={x as number}>
          <rect className={c as string} x={x as number} y="30" width="24" height="22" rx="2" />
          <line className="ln-soft" x1={x as number} x2={(x as number) + 24} y1="37" y2="37" />
          <line className="ln-soft" x1={x as number} x2={(x as number) + 24} y1="44" y2="44" />
        </g>
      ))}
      {[24, 80].map((x) => (
        <g key={x}>
          <rect className="f-dark" x={x} y="66" width="50" height="26" rx="3" />
          <rect className="f-corner" x={x} y="66" width="6" height="6" rx="1" />
          <rect className="f-corner" x={x + 44} y="66" width="6" height="6" rx="1" />
          <rect className="f-corner" x={x} y="86" width="6" height="6" rx="1" />
          <rect className="f-corner" x={x + 44} y="86" width="6" height="6" rx="1" />
          <rect className="f-handle" x={x + 18} y="76" width="14" height="4" rx="2" />
        </g>
      ))}
      {/* A stack of chairs, seen from the side. */}
      <rect className="f-steel" x="30" y="100" width="3" height="31" rx="1" />
      {Array.from({ length: 6 }, (_, i) => (
        <rect key={i} className="f-seat" x="30" y={114 - i * 3} width="32" height="2.2" rx="1" />
      ))}
      <path className="ln-chair" d="M58 116l3 15M34 116l-2 15" />
      <rect className="f-plate" x="100" y="98" width="30" height="11" rx="1.5" />
      <text className="t-plate" x="115" y="106">
        D-03
      </text>
      {/* Round tabletops stored on edge. */}
      {[160, 170, 180, 190].map((x) => (
        <ellipse key={x} className="f-table ln" cx={x} cy="94" rx="7" ry="37" />
      ))}
      {/* Light stand. */}
      <path className="ln-stand" d="M244 132l12-30 12 30M256 102V48" />
      <rect className="f-dark" x="245" y="34" width="22" height="16" rx="3" />
      <path className="f-beam" d="M248 50l-12 30h40l-12-30z" />
      {/* Rolling case. */}
      <rect className="f-soft ln" x="276" y="84" width="36" height="42" rx="3" />
      <rect className="f-handle" x="286" y="90" width="16" height="4" rx="2" />
      <circle className="f-tire" cx="283" cy="128" r="4" />
      <circle className="f-tire" cx="305" cy="128" r="4" />
      <Pin x={105} y={40} />
    </svg>
  );
}
