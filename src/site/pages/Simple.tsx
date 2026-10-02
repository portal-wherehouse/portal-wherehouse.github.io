import { useEffect, useRef, type CSSProperties } from 'react';
import { PageHero, Section, SiteLink } from '../kit';
import { Icon, type IconName } from '../../ui/icons';
import { CREATOR } from '../../brand';
import { PLANS, SETUP_FEE } from '../../domain/plans';
import { portalHref } from '../../config/hosts';
import { PRICING } from '../prices';
import { COMPARE_APPS, COMPARE_CHECKED, COMPARE_COLUMNS, COMPARE_GROUPS, type CompareCell, type Mark } from '../compare';
import './compare.css';

const MARK_LABEL: Record<Mark, string> = { yes: 'Yes', part: 'Partly', no: 'No', bad: 'Yes, unfortunately', proud: 'No, and proud of it' };

function MarkBadge({ mark }: { mark: Mark }) {
  if (mark === 'proud')
    return (
      <span className="cmp-proud" aria-hidden="true">
        <Icon name="check" />
        No
      </span>
    );
  return (
    <span className={`cmp-mark ${mark}`} aria-hidden="true">
      {mark === 'yes' || mark === 'bad' ? <Icon name="check" /> : mark === 'no' ? <Icon name="x" /> : null}
    </span>
  );
}

function Cell({ cell }: { cell: CompareCell }) {
  return (
    <span className={`cmp-cell${cell.mark === 'proud' ? ' is-proud' : ''}`}>
      {cell.mark && <MarkBadge mark={cell.mark} />}
      <span className="cmp-text">
        {cell.mark && <span className="sr-only">{MARK_LABEL[cell.mark]}: </span>}
        {cell.text}
      </span>
    </span>
  );
}

const and = (names: readonly string[]) => `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

function Comparison() {
  return (
    <div data-reveal>
      <table className="cmp" data-testid="compare-table" role="table" aria-label="Wherehouse compared with typical inventory apps and doing it by hand">
        <thead role="rowgroup">
          <tr role="row" className="cmp-headrow">
            <th role="columnheader" scope="col" className="cmp-corner">
              <span className="sr-only">Compared on</span>
            </th>
            {COMPARE_COLUMNS.map((c) => (
              <th role="columnheader" key={c.id} scope="col" className={`c-${c.id}`}>
                <strong>
                  {c.name}
                  {c.id === 'apps' && <sup>*</sup>}
                </strong>
                <small>{c.sub}</small>
              </th>
            ))}
          </tr>
        </thead>
        {COMPARE_GROUPS.map((g) => (
          <tbody role="rowgroup" key={g.title}>
            <tr role="row" className="cmp-group">
              <th role="columnheader" scope="colgroup" colSpan={COMPARE_COLUMNS.length + 1}>
                {g.title}
              </th>
            </tr>
            {g.rows.map((r) => (
              <tr role="row" key={r.label} className={r.gotcha ? 'cmp-gotcha' : undefined} data-gotcha={r.gotcha ? '' : undefined}>
                <th role="rowheader" scope="row">
                  {r.label}
                  {r.gotcha && (
                    <span className="cmp-nobody">
                      <Icon name="alert" />
                      Nobody wants this
                    </span>
                  )}
                </th>
                {COMPARE_COLUMNS.map((c) => (
                  <td role="cell" key={c.id} className={`c-${c.id}`} data-col={c.name}>
                    <Cell cell={r.cells[c.id]} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
      <div className="cmp-legend" aria-hidden="true">
        <span>
          <MarkBadge mark="yes" /> Yes
        </span>
        <span>
          <MarkBadge mark="part" /> Partly, sometimes or on a pricier plan
        </span>
        <span>
          <MarkBadge mark="no" /> No
        </span>
        <span>
          <MarkBadge mark="bad" /> Yes, unfortunately
        </span>
      </div>
      <p className="cmp-note" data-testid="compare-note">
        <sup>*</sup> Typical inventory apps: {and(COMPARE_APPS)}, each on its lowest paid plan, from their public pricing pages as of {COMPARE_CHECKED}. “Most” and “some” mean not all four. Prices and plans change, so check with each company before you buy.
      </p>
    </div>
  );
}

interface Why {
  icon: IconName;
  stat: string;
  title: string;
  body: string;
}

const starter = PLANS[0];

const WHYS: Why[] = [
  { icon: 'chat', stat: 'Founder-led', title: 'Local support from the person who built it', body: `Questions go straight to ${CREATOR.name}, who wrote the app. No ticket queue, no script, no hand-offs.` },
  { icon: 'pin', stat: 'Charleston, SC', title: 'Built here, set up in person', body: `Within about an hour of Charleston, we come to you: name your spots, hang the labels, load your items and train your crew. $${SETUP_FEE.small}–$${SETUP_FEE.large}, one time, only if you want it.` },
  { icon: 'scanner', stat: '2 scans', title: 'Learn it in one shift', body: 'Scan the item, scan the spot. That’s a move. Your crew has it down on day one, not after weeks of training.' },
  { icon: 'phone', stat: '0 new devices', title: 'No new hardware', body: 'Any phone camera works right in the browser, no app to install. USB, Bluetooth and Zebra scanners work too.' },
  { icon: 'dollar', stat: `From $${starter.monthly}/mo`, title: 'Fair, flat pricing', body: `${PLANS.map((p) => `$${p.monthly}`).join(', ')} a month, month to month. ${starter.people} people on ${starter.name}, not 2. No yearly contract, no required setup fee.` },
  { icon: 'download', stat: 'Export anytime', title: 'Your data is yours', body: 'Download every item, spot and move as a spreadsheet whenever you like. If you ever leave, your records leave with you.' },
];

const STATS: { big: string; small: string }[] = [
  { big: `$${starter.monthly}`, small: 'a month, month to month' },
  { big: `${PRICING.pilotDays} days`, small: 'free, no card' },
  { big: '2 scans', small: 'to move anything' },
  { big: '1 founder', small: 'answering your questions' },
];

/** Fades sections in as they scroll into view. Skipped when the visitor prefers less motion. */
function useReveal() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root || typeof IntersectionObserver === 'undefined' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    root.classList.add('reveal-on');
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries)
          if (e.isIntersecting) {
            e.target.classList.add('is-in');
            io.unobserve(e.target);
          }
      },
      { rootMargin: '0px 0px -8% 0px' },
    );
    root.querySelectorAll('[data-reveal]').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return ref;
}

export function SimplePage() {
  const ref = useReveal();
  return (
    <div ref={ref} className="why-page">
      <PageHero eyebrow="Why Wherehouse" title="Simpler than the big apps. Faster than paper." lede="Wherehouse is built and supported in Charleston, SC, by the person who answers your questions. Here’s how it stacks up." />
      <div className="site-inner">
        <ul className="why-stats" data-reveal>
          {STATS.map((s) => (
            <li key={s.big}>
              <strong>{s.big}</strong>
              <span>{s.small}</span>
            </li>
          ))}
        </ul>
      </div>
      <Section title="How it compares" lede="Green is what you want. Red checks are what the other apps have that nobody wants.">
        <Comparison />
      </Section>
      <Section tone="surface" eyebrow="Why it works" title="Small on purpose. Local on purpose.">
        <div className="why-grid">
          {WHYS.map((w, i) => (
            <article key={w.title} className="why-tile" data-reveal style={{ '--d': `${(i % 3) * 80}ms` } as CSSProperties}>
              <span className="why-icon">
                <Icon name={w.icon} />
              </span>
              <span className="why-stat">{w.stat}</span>
              <h3>{w.title}</h3>
              <p>{w.body}</p>
            </article>
          ))}
        </div>
      </Section>
      <Section narrow>
        <div className="why-cta" data-reveal>
          <h2>Try it on a real shift.</h2>
          <p>{PRICING.pilotDays} days free, no card. Wherehouse shows the last confirmed spot, time and person for every item, so the next shift never has to guess.</p>
          <div className="site-hero-actions">
            <SiteLink to="start" className="site-btn primary">
              Start your free trial
            </SiteLink>
            <a className="site-btn ghost" href={portalHref('?demo=1#signin')}>
              See the sample warehouse
            </a>
            <SiteLink to="pricing">View plans →</SiteLink>
          </div>
        </div>
      </Section>
    </div>
  );
}

