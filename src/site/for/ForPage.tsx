// #for: every kind of business on one page, and #for/<id>: Wherehouse for one of them.
// Every group page is drawn from its entries in groups.ts and groupPages.ts. Loaded on demand, like the other secondary pages.

import { useEffect } from 'react';
import { Icon } from '../../ui/icons';
import { CtaBand, FeatureCards, PageHero, Section, SiteLink } from '../kit';
import { useSite } from '../routing';
import { portalHref } from '../../config/hosts';
import { GroupCards, openGroup } from './GroupCards';
import { groupById, groupHref, groupTitle } from './groups';
import { FEATURES, GROUP_PAGES, type Group } from './groupPages';
import { GroupShowcase, Label } from './GroupShowcase';
import { Examples } from './Examples';
import './for.css';

/** The sample warehouse: opens the app with sample data, no account. */
const SAMPLE_HREF = portalHref('?demo=1#signin');

export function ForPage() {
  const { route } = useSite();
  const summary = groupById(route.id);
  return summary ? <GroupPage key={summary.id} g={{ ...summary, ...GROUP_PAGES[summary.id] }} /> : <Overview />;
}

/** #for (and the old #industries link): the kinds of business, three worked examples, then what Wherehouse is and isn't. */
function Overview() {
  return (
    <>
      <PageHero eyebrow="Who it’s for" title="Wherehouse for your kind of business." lede="Anyone who knows they have it, but not where it is. Pick the group closest to yours to see the problems it solves and how a day looks." />
      <Section>
        <GroupCards />
        <p className="fg-more">
          Don’t see yours?
          <SiteLink to="fit">Check your exact business →</SiteLink>
        </p>
      </Section>
      <Section tone="surface" id="examples" eyebrow="Examples" title="Different businesses. Same routine." lede="Wherehouse works anywhere you store inventory. Here is how three very different businesses could set it up.">
        <Examples />
      </Section>
      <Section narrow title="Built around one question.">
        <p className="fg-prose">If someone in your building asks “where did we put it?”, Wherehouse is built around that question. At setup you tell it what you store (pallets, big single items, parts on shelves, long goods or equipment) and it uses your words and hides what you don’t need.</p>
        <p className="fg-prose">It tracks physical inventory and exactly where it is. It sits beside the software you already use for sales, stock counts, purchasing and accounting, and doesn’t replace it.</p>
        <div className="site-hero-actions">
          <SiteLink to="product" className="site-btn ghost">
            See how it works
          </SiteLink>
          <SiteLink to="fit">Check your kind of business →</SiteLink>
        </div>
      </Section>
      <CtaBand />
    </>
  );
}

function GroupPage({ g }: { g: Group }) {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);
  return (
    <div className="fg-page" data-testid="group-page" data-group={g.id}>
      <PageHero
        eyebrow={
          <a className="fg-crumb" href={groupHref()} onClick={(e) => openGroup(e)}>
            Who it’s for
          </a>
        }
        title={`${groupTitle(g)}.`}
        lede={g.lede}
        art={<HeroLabel g={g} />}
      >
        <a className="site-btn primary" href={SAMPLE_HREF}>
          <Icon name="play" />
          Try the sample warehouse
        </a>
        <SiteLink to="start" className="site-btn ghost">
          Start your free trial
        </SiteLink>
      </PageHero>
      <div className="site-inner">
        <ul className="fg-covers" aria-label="Made for">
          {g.covers.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </div>

      <Section eyebrow="What it fixes" title="The problems it solves.">
        <div className="fg-problems">
          {g.problems.map((p) => (
            <article key={p.title} className="fg-problem">
              <h3>{p.title}</h3>
              <p>
                <Icon name="checkCircle" />
                <span>{p.body}</span>
              </p>
            </article>
          ))}
        </div>
      </Section>

      <Section tone="surface" id="day" eyebrow="How a day looks" title={`${g.day}.`} lede={`${sentence(g.steps.map((s) => s.verb))}, in your words. Tap a step or let it play.`}>
        <GroupShowcase g={g} />
      </Section>

      <Section eyebrow="Features" title="What matters most for you.">
        <FeatureCards columns={4} items={g.features.map((f) => ({ icon: FEATURES[f.key].icon, title: FEATURES[f.key].title, body: f.body }))} />
        <p className="fg-limit">
          <Icon name="info" />
          <span>
            <strong>What it won’t do:</strong> {g.limit}
          </span>
        </p>
      </Section>

      <Section tone="surface" eyebrow="Other kinds of business" title="Wherehouse for other businesses.">
        <GroupCards current={g.id} compact />
        <p className="fg-more">
          Don’t see yours?
          <SiteLink to="fit">Check your exact business →</SiteLink>
        </p>
      </Section>

      <section className="site-section tone-ink fg-close">
        <div className="site-inner fg-close-inner">
          <div>
            <h2 className="site-h2">See it with sample data first.</h2>
            <p className="site-lede">The sample warehouse already has items, spots and history in it. No account needed. When you’re ready, the free trial starts with a 2-minute survey.</p>
          </div>
          <div className="site-hero-actions">
            <a className="site-btn primary" href={SAMPLE_HREF} data-testid="group-sample">
              <Icon name="play" />
              Try the sample warehouse
            </a>
            <SiteLink to="start" className="site-btn ghost">
              Start your free trial
            </SiteLink>
          </div>
        </div>
      </section>
    </div>
  );
}

/** "Receive, put away, pick and ship" */
function sentence(verbs: string[]) {
  const words = verbs.map((v, i) => (i ? v.toLowerCase() : v));
  return words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}` : words.join('');
}

/** The printed label for one of their items, pointing at the spot it was scanned to. Sample data. */
function HeroLabel({ g }: { g: Group }) {
  const { item } = g;
  return (
    <div className="fg-hero-art" role="img" aria-label={`Example label: ${item.thing} ${item.code}, ${item.desc}, for ${item.job}, stored at spot ${item.spot}.`}>
      <span className="fg-example">Example</span>
      <Label g={g} />
      <span className="fg-hero-arrow" aria-hidden="true">
        <Icon name="arrowRight" />
      </span>
      <div className="fg-plate" aria-hidden="true">
        <small>Spot</small>
        <b>{item.spot}</b>
        <span>{item.spotName}</span>
      </div>
    </div>
  );
}
