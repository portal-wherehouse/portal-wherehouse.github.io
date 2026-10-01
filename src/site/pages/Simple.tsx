import { Fragment, useState } from 'react';
import { FeatureCards, PageHero, Section, SiteLink } from '../kit';
import { Icon } from '../../ui/icons';
import { CREATOR } from '../../brand';
import { SETUP_FEE } from '../../domain/plans';
import { portalHref } from '../../config/hosts';
import { COMPARE_CHECKED, COMPARE_COLUMNS, COMPARE_GROUPS, type CompareCell, type CompareId, type Mark } from '../compare';
import './compare.css';

const MARK_LABEL: Record<Mark, string> = { yes: 'Yes', part: 'Partly', no: 'No' };

function MarkBadge({ mark }: { mark: Mark }) {
  return (
    <span className={`compare-mark ${mark}`} aria-hidden="true">
      {mark === 'yes' ? <Icon name="check" /> : mark === 'no' ? <Icon name="x" /> : null}
    </span>
  );
}

function Cell({ cell }: { cell: CompareCell }) {
  return (
    <span className="compare-cell">
      {cell.mark && <MarkBadge mark={cell.mark} />}
      <span>
        {cell.mark && <span className="sr-only">{MARK_LABEL[cell.mark]}: </span>}
        {cell.text}
      </span>
    </span>
  );
}

const RIVALS = COMPARE_COLUMNS.filter((c) => c.id !== 'wherehouse');

function Comparison() {
  // On a phone the table shows Wherehouse next to one other choice at a time.
  const [vs, setVs] = useState<CompareId>('sortly');
  const off = (id: CompareId) => (id !== 'wherehouse' && id !== vs ? ' is-off' : '');
  return (
    <>
      <div className="compare-picker" role="group" aria-label="Compare Wherehouse with">
        <span className="compare-picker-label">Compare with</span>
        {RIVALS.map((c) => (
          <button key={c.id} className={`compare-chip${c.id === vs ? ' on' : ''}`} aria-pressed={c.id === vs} onClick={() => setVs(c.id)}>
            {c.name}
          </button>
        ))}
      </div>
      <div className="compare-wrap" tabIndex={0} role="region" aria-label="Comparison table">
        <table className="compare-table" data-testid="compare-table">
          <thead>
            <tr>
              <th scope="col" className="compare-corner">
                <span className="sr-only">Compared on</span>
              </th>
              {COMPARE_COLUMNS.map((c) => (
                <th key={c.id} scope="col" className={`c-${c.id}${off(c.id)}`}>
                  <strong>{c.name}</strong>
                  <small>{c.plan}</small>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {COMPARE_GROUPS.map((g) => (
              <Fragment key={g.title}>
                <tr className="compare-group">
                  <th scope="colgroup" colSpan={COMPARE_COLUMNS.length + 1}>
                    <span>{g.title}</span>
                  </th>
                </tr>
                {g.rows.map((r) => (
                  <tr key={r.label}>
                    <th scope="row">{r.label}</th>
                    {COMPARE_COLUMNS.map((c) => (
                      <td key={c.id} className={`c-${c.id}${off(c.id)}`}>
                        <Cell cell={r.cells[c.id]} />
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <div className="compare-legend" aria-hidden="true">
        <span>
          <MarkBadge mark="yes" /> Yes
        </span>
        <span>
          <MarkBadge mark="part" /> Partly, or on a higher plan
        </span>
        <span>
          <MarkBadge mark="no" /> No
        </span>
      </div>
      <p className="compare-note">
        Starting prices from each company’s public pricing page as of {COMPARE_CHECKED}, for its lowest paid plan unless a box says otherwise. Yearly prices are shown per month. Prices and plans change, so check with each company before you buy. “Not listed” means we couldn’t confirm it on their site.
      </p>
    </>
  );
}

export function SimplePage() {
  return (
    <>
      <PageHero
        eyebrow="Why Wherehouse"
        title="The next shift shouldn’t have to guess."
        lede="Price, features and simplicity side by side: Wherehouse, the inventory apps small businesses usually look at, and doing it by hand."
      />
      <Section title="How it compares" lede="Wherehouse does one job: where each item is and who moved it. Here’s how that stacks up, including where the others do more.">
        <Comparison />
      </Section>
      <Section tone="surface" eyebrow="Local and small" title="Why a local, small business" lede="Wherehouse is new, it’s built in Charleston, SC, and the person who built it is the person you deal with.">
        <FeatureCards
          items={[
            { icon: 'hardhat', title: 'Set up in person', body: `Within about an hour of Charleston, we come to you: name your spots, hang the labels, load your items and train your crew. $${SETUP_FEE.small}–$${SETUP_FEE.large} one time, and only if you want it.` },
            { icon: 'chat', title: 'Support from the builder', body: `Questions go straight to ${CREATOR.name}, who wrote the app. No ticket queue and no script.` },
            { icon: 'people', title: 'Shaped by early customers', body: 'We’re in beta. The first businesses to use Wherehouse decide what gets built next, and your request goes to the person who can make the change.' },
          ]}
        />
      </Section>
      <Section>
        <div className="buyer-columns">
          <div>
            <h2>Wherehouse fits if</h2>
            <ul className="compare-fit">
              <li>You lose time looking for pallets, boxes, parts or equipment.</li>
              <li>You need to know who moved something, and when.</li>
              <li>Your crew should learn one routine: add it when it arrives, scan it and the spot when it moves, search when it’s needed.</li>
              <li>Sales, purchasing and accounting already live somewhere else.</li>
            </ul>
          </div>
          <div>
            <h2>Something bigger fits if</h2>
            <ul className="compare-fit">
              <li>You need unit counts, reorder points or low-stock alerts.</li>
              <li>You want purchase orders, sales orders and shipping in one app.</li>
              <li>Your inventory has to sync with QuickBooks or Xero.</li>
            </ul>
            <p>Apps like inFlow, Zoho Inventory and Fishbowl are built for that. Wherehouse can still sit beside them for the “where is it” part.</p>
          </div>
        </div>
      </Section>
      <Section tone="surface" narrow title="The records depend on the scans.">
        <p>We show the last confirmed location, time and person. Wherehouse can’t detect a move nobody records. During setup, we help you make scanning part of the unload and put-away routine.</p>
        <div className="site-hero-actions">
          <SiteLink to="start" className="site-btn primary">
            Start your free trial
          </SiteLink>
          <a className="site-btn ghost" href={portalHref("?demo=1#signin")}>
            See the sample warehouse
          </a>
          <SiteLink to="pricing">View plans →</SiteLink>
        </div>
      </Section>
    </>
  );
}
