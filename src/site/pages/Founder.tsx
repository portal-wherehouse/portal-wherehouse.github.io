// About: who builds Wherehouse, why, and where. Only facts John Henry has given us are shown;
// spots for personal details are marked in comments, not in the page.

import { PageHero, Section, SiteLink, firstName, initials } from '../kit';
import { CREATOR } from '../../brand';
import { SETUP_FEE } from '../../domain/plans';
import { Icon, type IconName } from '../../ui/icons';
import './founder.css';

const FIRST = firstName(CREATOR.name);
const MAILTO = `mailto:${CREATOR.email}?subject=${encodeURIComponent('Wherehouse')}`;

export function FounderPage() {
  return (
    <>
      <PageHero
        eyebrow="About"
        title="Built in Charleston by the person you’ll talk to."
        lede={`Wherehouse is made by ${CREATOR.name}, a college student based in Charleston, South Carolina. He writes the app, answers the email and sets it up in person.`}
        art={<Portrait />}
      >
        <a className="site-btn primary" href={MAILTO}>
          <Icon name="mail" />
          Email {FIRST}
        </a>
        <a className="site-btn ghost" href={CREATOR.linkedin} target="_blank" rel="noopener noreferrer">
          <Icon name="linkedin" />
          LinkedIn
        </a>
      </PageHero>

      <div className="site-inner">
        <dl className="ab-facts" data-testid="about-facts">
          {(
            [
              ['pin', 'Based in', 'Charleston, SC'],
              ['user', 'Role', 'Founder. Builds and supports Wherehouse.'],
              ['hardhat', 'In person', 'Within about an hour of Charleston'],
              ['sparkle', 'Stage', 'In beta, with founding customers'],
            ] as [IconName, string, string][]
          ).map(([icon, k, v]) => (
            <div key={k}>
              <Icon name={icon} />
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      <Section narrow eyebrow="The story" title="Why Wherehouse exists">
        <div className="ab-story">
          <p className="ab-lead">Every business that stores inventory runs into the same question: where did we put it?</p>
          <p>The answer usually lives in one person’s head, on a whiteboard, or in a spreadsheet that is out of date by lunch. When that person is out, the rest of the team goes looking.</p>
          <p>{FIRST} built Wherehouse to answer that one question well. Scan the item, scan the spot, and the answer is there for everyone. No long setup, no training course and no features you’ll never use.</p>
          {/* PERSONAL DETAIL: a sentence or two in John Henry's own words goes here, for example
              what first got him working on this problem. Leave it out until he writes it. */}
          <p>Wherehouse is new, and it is built one business at a time. Every early customer talks to {FIRST} directly, and what they ask for shapes what gets built next.</p>
        </div>
      </Section>

      <Section tone="surface" eyebrow="Charleston, SC" title="Charleston is home.">
        <div className="ab-local">
          <div className="ab-local-text">
            <p>Wherehouse is built in Charleston, and the first businesses it serves are here too.</p>
            <p>
              Within about an hour of the city, {FIRST} comes to you. He names your spots, hangs the labels, loads your first items and shows your crew the routine. In-person setup is ${SETUP_FEE.small}–${SETUP_FEE.large} one time, and only if you want it.
            </p>
            <p>Farther away? Setup and support work remotely too.</p>
            <ul className="ab-towns" aria-label="Some of the areas in the in-person setup area">
              {['Charleston', 'North Charleston', 'Mount Pleasant', 'Summerville', 'Goose Creek', 'Moncks Corner', 'Johns Island', 'Walterboro', 'Georgetown'].map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
            <p className="ab-small">Not sure if you’re in range? The setup survey checks your zip code.</p>
          </div>
          <LocalMap />
        </div>
      </Section>

      <Section eyebrow="Working together" title={`What working with ${FIRST} looks like`}>
        <ol className="ab-cards">
          <li>
            <span className="ab-card-icon">
              <Icon name="chat" />
            </span>
            <h3>A direct line</h3>
            <p>Your email goes to the person who writes the code. No ticket queue and no script.</p>
          </li>
          <li>
            <span className="ab-card-icon">
              <Icon name="hardhat" />
            </span>
            <h3>Set up with you</h3>
            <p>In person near Charleston, or remotely anywhere. Spots, labels, printer and your crew.</p>
          </li>
          <li>
            <span className="ab-card-icon">
              <Icon name="sparkle" />
            </span>
            <h3>Your requests get built</h3>
            <p>Wherehouse is in beta. Founding customers help decide what comes next, and hear back when it ships.</p>
          </li>
        </ol>
      </Section>

      <Section tone="ink">
        <div className="ab-contact">
          <div>
            <h2 className="site-h2">Talk to {FIRST}.</h2>
            <p className="site-lede">Tell him what you store and how you keep track of it today. You’ll get a reply from him, not a form letter.</p>
          </div>
          <div className="ab-contact-links">
            <a className="ab-contact-row" href={MAILTO}>
              <Icon name="mail" />
              <span>
                <small>Email</small>
                {CREATOR.email}
              </span>
              <Icon name="arrowRight" className="ab-go" />
            </a>
            <a className="ab-contact-row" href={CREATOR.linkedin} target="_blank" rel="noopener noreferrer">
              <Icon name="linkedin" />
              <span>
                <small>LinkedIn</small>
                {CREATOR.name}
              </span>
              <Icon name="external" className="ab-go" />
            </a>
            <SiteLink to="contact" className="site-link ab-contact-more">
              Or book a free walkthrough →
            </SiteLink>
          </div>
        </div>
      </Section>
    </>
  );
}

/** Stand-in for John Henry's photo: his initials on a framed card. */
function Portrait() {
  return (
    <figure className="ab-portrait">
      {/* PHOTO: when there is a photo, put it in public/ (for example public/john-henry.jpg) and
          replace the whole <div className="ab-portrait-box"> below with:
          <img className="ab-photo" src={`${import.meta.env.BASE_URL}john-henry.jpg`} alt={CREATOR.name} /> */}
      <div className="ab-portrait-box" role="img" aria-label={`${CREATOR.name}, founder of Wherehouse`}>
        <span className="ab-portrait-tag">
          <Icon name="pin" />
          Charleston, SC
        </span>
        <span className="ab-portrait-rings" aria-hidden="true" />
        <span className="ab-portrait-initials" aria-hidden="true">
          {initials(CREATOR.name)}
        </span>
        <span className="ab-portrait-coords" aria-hidden="true">
          32.78° N · 79.93° W
        </span>
        <span className="ab-portrait-stripes" aria-hidden="true" />
      </div>
      <figcaption>
        <strong>{CREATOR.name}</strong>
        <span>Founder, Wherehouse</span>
      </figcaption>
    </figure>
  );
}

/** Miles from downtown Charleston to a point on the drawing: 3px per mile, east and north positive. */
const at = (east: number, north: number) => [200 + east * 3, 170 - north * 3] as const;

const TOWNS: { name: string; e: number; n: number; anchor?: 'start' | 'middle' | 'end'; dy?: number }[] = [
  { name: 'Mount Pleasant', e: 5, n: 3, anchor: 'start', dy: -6 },
  { name: 'North Charleston', e: -6, n: 8, anchor: 'end' },
  { name: 'Summerville', e: -18, n: 16, anchor: 'end' },
  { name: 'Goose Creek', e: -6, n: 17, anchor: 'start' },
  { name: 'Moncks Corner', e: -4, n: 31, anchor: 'start' },
  { name: 'Walterboro', e: -43, n: 8, anchor: 'middle', dy: 15 },
  { name: 'Johns Island', e: -9, n: -8, anchor: 'end' },
  { name: 'Georgetown', e: 37, n: 41, anchor: 'end' },
];

// A rough outline of the coast from Edisto to past Georgetown, in miles from downtown.
const COAST = [
  [-70, -40],
  [-45, -32],
  [-28, -24],
  [-9, -14],
  [0, -8],
  [8, -1],
  [13, 4],
  [25, 15],
  [35, 22],
  [48, 38],
  [60, 55],
  [70, 70],
]
  .map(([e, n]) => at(e, n).join(' '))
  .join(' L');

/** A simple, not-to-scale sketch of the area around Charleston with the in-person setup range. */
function LocalMap() {
  const [cx, cy] = at(0, 0);
  return (
    <figure className="ab-map">
      <svg viewBox="0 0 400 320" role="img" aria-label="Sketch of the area around Charleston, SC. A ring marks about an hour's drive, covering North Charleston, Mount Pleasant, Summerville, Goose Creek, Moncks Corner, Johns Island, Walterboro and Georgetown.">
        <defs>
          <radialGradient id="ab-glow">
            <stop offset="0" stopColor="var(--hazard)" stopOpacity="0.28" />
            <stop offset="1" stopColor="var(--hazard)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <path className="ab-sea" d={`M${COAST} L410 330 L-10 330 Z`} />
        <path className="ab-coast" d={`M${COAST}`} />
        <circle cx={cx} cy={cy} r="140" fill="url(#ab-glow)" />
        <circle className="ab-ring" cx={cx} cy={cy} r="135" />
        <circle className="ab-ring faint" cx={cx} cy={cy} r="68" />
        <text className="ab-ring-label" x={cx} y={cy - 141}>
          About 1 hour
        </text>
        {TOWNS.map((t) => {
          const [x, y] = at(t.e, t.n);
          return (
            <g key={t.name}>
              <circle className="ab-town" cx={x} cy={y} r="3.2" />
              <text className="ab-town-label" x={x + (t.anchor === 'end' ? -7 : t.anchor === 'middle' ? 0 : 7)} y={y + 3.5 + (t.dy ?? 0)} textAnchor={t.anchor}>
                {t.name}
              </text>
            </g>
          );
        })}
        <g className="ab-home" transform={`translate(${cx} ${cy})`}>
          <circle className="ab-home-ping" r="10" />
          <path d="M0 0S-11-12-11-19A11 11 0 0 1 11-19C11-12 0 0 0 0z" />
          <circle cx="0" cy="-19" r="4" />
        </g>
        <text className="ab-home-label" x={cx + 14} y={cy + 20}>
          Charleston
        </text>
        <text className="ab-sea-label" x="300" y="250">
          Atlantic Ocean
        </text>
      </svg>
      <figcaption>Sketch, not to scale.</figcaption>
    </figure>
  );
}
