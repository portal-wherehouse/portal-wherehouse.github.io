// About: who builds Wherehouse. A placeholder portrait and bio (nothing about John is guessed),
// a contact card, why the product exists, how it started, and what is planned next.

import { BRAND, CREATOR } from '../../brand';
import { useApp } from '../../app/state';
import { IS_PREVIEW } from '../../device/output';
import { Icon, type IconName } from '../../ui/icons';
import { CtaBand, PageHero, Placeholder, PortalCTA, Section } from '../kit';
import { Coming, EmailCopy } from './d-kit';
import './pages-d.css';

const initials = CREATOR.name
  .split(/\s+/)
  .map((w) => w[0])
  .join('')
  .toUpperCase();

const BIO_GUIDE = [
  'Background: where he has worked and what he has built.',
  'Why construction warehouses: what he saw that started this.',
  'What he is focused on now.',
  'A photo, ideally in a yard or on a job.',
];

const WHY: { icon: IconName; title: string; body: string }[] = [
  {
    icon: 'alert',
    title: 'The problem',
    body: 'Material shows up weeks before it is needed and gets staged wherever there is room. When the crew calls for it, someone walks every aisle. Sometimes it gets ordered twice.',
  },
  {
    icon: 'qr',
    title: 'The idea',
    body: 'Give every pallet a label. Scan it when it arrives and every time it moves. Then anyone can find it by job, code, rack or description, from a phone.',
  },
  {
    icon: 'shield',
    title: 'The rule',
    body: 'Be honest about location. It shows where a pallet was last confirmed, and when. Never a guess dressed up as a fact.',
  },
];

const STORY: { title: string; body: string }[] = [
  {
    title: 'The blueprint',
    body: `${BRAND.name} began as ${CREATOR.name}’s Pallet Locator build blueprint: a 42-page plan for tracking pallets in a construction warehouse. It covers receiving, moving and finding, labels, roles, working offline, and the rules that keep records honest.`,
  },
  {
    title: 'The working app',
    body: 'The app was built from that plan. Every change is checked before it is saved, and added to a history that is never erased. The blueprint’s own test scenarios run inside the app.',
  },
  {
    title: 'A new name',
    body: `Pallet Locator became ${BRAND.name}: one name for knowing where everything in the warehouse is.`,
  },
  {
    title: 'Today',
    body: `This website and the ${BRAND.portal} are in early testing. Sign-in is off, and the demo keeps its data in your browser.`,
  },
];

const NEXT: { icon: IconName; title: string; body: string; tag: string }[] = [
  { icon: 'key', title: 'Accounts and real sign-in', body: 'An account for every person on your crew, with the same roles you see in the demo.', tag: 'Planned' },
  { icon: 'cloud', title: 'Cloud sync', body: 'Records kept in the cloud and shared across every phone, tablet and computer, instead of living in one browser.', tag: 'Planned' },
  { icon: 'scanner', title: 'More scanner workflows', body: 'More ways to work hands-free, like putting away a whole delivery or counting a rack in one run.', tag: 'Planned' },
  { icon: 'building', title: 'More than one warehouse', body: 'Several yards under one company, each with its own racks.', tag: 'Coming' },
];

export function FounderPage() {
  const { go } = useApp();
  return (
    <>
      <div className="site-inner">
        <PageHero
          eyebrow="About"
          title={`Built by ${CREATOR.name}`}
          lede={`${BRAND.name} is designed and built by ${CREATOR.name}. Questions, ideas, or a yard you want him to see? Reach him directly.`}
          art={<Portrait />}
        >
          <a className="site-btn primary" href={CREATOR.linkedin} target="_blank" rel="noopener noreferrer">
            <Icon name="linkedin" />
            Connect on LinkedIn
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
          <button type="button" className="site-btn ghost" onClick={() => go('contact')}>
            Book a walkthrough
          </button>
        </PageHero>
      </div>

      <Section eyebrow="The person" title={`About ${CREATOR.name.split(' ')[0]}`}>
        <div className="fo-about">
          <Placeholder label="Bio placeholder">
            <div className="fo-bio">
              <p className="fo-bio-lead">A short bio, in {CREATOR.name}’s own words, goes here. Until he writes it, this page does not guess.</p>
              <h3 className="fo-bio-h">What will go here</h3>
              <ul>
                {BIO_GUIDE.map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ul>
            </div>
          </Placeholder>

          <aside className="fo-card" aria-label={`Contact ${CREATOR.name}`}>
            <div className="fo-card-top">
              <span className="fo-card-initials" aria-hidden="true">
                {initials}
              </span>
              <div>
                <div className="fo-card-name">{CREATOR.name}</div>
                <div className="fo-card-role">Designs and builds {BRAND.name}</div>
              </div>
            </div>
            <a className="site-btn primary fo-card-btn" href={CREATOR.linkedin} target="_blank" rel="noopener noreferrer">
              <Icon name="linkedin" />
              LinkedIn
              <Icon name="external" />
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
            <div className="fo-card-email">
              <span className="fo-card-label">Email</span>
              <EmailCopy email={CREATOR.email} tone="boxed" />
              {!IS_PREVIEW && (
                <a className="site-link fo-card-mailto" href={`mailto:${CREATOR.email}`}>
                  Write an email
                </a>
              )}
            </div>
          </aside>
        </div>
      </Section>

      <Section tone="ink" eyebrow={`Why ${BRAND.name} exists`} title="Finding material should not mean walking every aisle.">
        <ol className="fo-why">
          {WHY.map((w) => (
            <li key={w.title}>
              <span className="feature-icon">
                <Icon name={w.icon} />
              </span>
              <h3>{w.title}</h3>
              <p>{w.body}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section eyebrow="How it started" title="From a blueprint to a working app" narrow>
        <ol className="fo-story">
          {STORY.map((s, i) => (
            <li key={s.title}>
              <span className="fo-story-n" aria-hidden="true">
                {String(i + 1).padStart(2, '0')}
              </span>
              <div>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <Section tone="surface" eyebrow="What’s next" title="What is planned" lede="None of this is in the app yet. It is where the work is headed.">
        <ul className="fo-next">
          {NEXT.map((n) => (
            <li key={n.title}>
              <div className="fo-next-top">
                <span className="feature-icon">
                  <Icon name={n.icon} />
                </span>
                <Coming>{n.tag}</Coming>
              </div>
              <h3>{n.title}</h3>
              <p>{n.body}</p>
            </li>
          ))}
        </ul>
        <div className="fo-next-cta">
          <p>Receive, Move, Find and the rest already work in the demo. See for yourself.</p>
          <PortalCTA variant="inline" note={`Already a ${BRAND.name} customer, or just curious?`} />
        </div>
      </Section>

      <CtaBand />
    </>
  );
}

/** Stand-in for a photo: large initials on a hazard-yellow block, clearly labeled. */
function Portrait() {
  return (
    <figure className="fo-portrait">
      <div className="fo-portrait-box" role="img" aria-label={`Photo placeholder for ${CREATOR.name}`}>
        <span className="fo-portrait-tag">Photo placeholder</span>
        <span className="fo-portrait-initials" aria-hidden="true">
          {initials}
        </span>
        <span className="fo-portrait-stripes" aria-hidden="true" />
      </div>
      <figcaption>A photo of {CREATOR.name} is coming soon.</figcaption>
    </figure>
  );
}
