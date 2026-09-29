// Customers: an honest placeholder page. Labeled logo slots, a customer story template, empty
// testimonial slots, and the real early customer program with a way to ask about it.

import { BRAND, CREATOR } from '../../brand';
import { useApp } from '../../app/state';
import { Icon, type IconName } from '../../ui/icons';
import { CtaBand, PageHero, Placeholder, PortalCTA, Section } from '../kit';
import { Coming, EmailCopy, scrollToId } from './d-kit';
import './pages-d.css';

const PLEDGES = ['Every logo, story and quote here will be real.', 'Nothing goes up without the customer’s permission.', 'No stock photos and no made-up numbers.'];

const STORY_PARTS: { title: string; icon: IconName; guide: string }[] = [
  { title: 'Challenge', icon: 'alert', guide: 'How the yard tracked material before, and what that cost them: time spent searching, wrong loads, material bought twice.' },
  { title: 'What changed', icon: 'refresh', guide: `How they rolled out ${BRAND.name}: labels, scanners, which crews use it, and how long it took to settle in.` },
  { title: 'Results', icon: 'target', guide: 'Only results the customer measured themselves and agreed to share, in their own words.' },
];

const PERKS: { icon: IconName; title: string; body: string; placeholder?: string }[] = [
  { icon: 'phone', title: 'A direct line to the person building it', body: `Talk to ${CREATOR.name}, who builds ${BRAND.name}, directly. No ticket queue.` },
  { icon: 'flag', title: 'A say in the roadmap', body: 'Tell us what your yard needs. What early customers ask for shapes what gets built next.' },
  { icon: 'dollar', title: 'Launch pricing', body: 'Keep launch pricing when plans go live.', placeholder: 'Terms are placeholders' },
  { icon: 'hardhat', title: 'Setup help', body: 'Help labeling your racks, setting up scanners, and bringing in your jobs.' },
];

export function CustomersPage() {
  const { go } = useApp();
  const apply = () => go({ name: 'contact', q: 'early' });

  return (
    <>
      <div className="site-inner">
        <PageHero
          eyebrow="Customers"
          title="Room for real stories from real yards"
          lede={`${BRAND.name} is new, so there are no customer stories yet. Instead of inventing logos or quotes, this page shows where the real ones will go once customers share them.`}
        >
          <button type="button" className="site-btn primary pd-wrapbtn" onClick={() => scrollToId('early')}>
            Join the early customer program
            <Icon name="arrowRight" />
          </button>
          <PortalCTA variant="hero" />
        </PageHero>

        <ul className="cu-pledges" aria-label="Our promise about this page">
          {PLEDGES.map((p) => (
            <li key={p}>
              <Icon name="checkCircle" />
              {p}
            </li>
          ))}
        </ul>
      </div>

      <Section eyebrow="Customer logos" title="Your logo here" lede="Logos go up only with the customer’s permission. Until then, these slots stay empty.">
        <ul className="cu-logos" aria-label="Customer logo placeholders">
          {Array.from({ length: 8 }, (_, i) => (
            <li key={i}>
              <Placeholder label="Logo placeholder" minHeight={112}>
                <span className="cu-logo-slot">
                  <Icon name="building" />
                  Your logo here
                </span>
              </Placeholder>
            </li>
          ))}
        </ul>
      </Section>

      <Section tone="surface" eyebrow="Customer story" title="Featured story template" lede="The shape every customer story will take. Each part is a placeholder until a real customer tells theirs.">
        <article className="cu-story" aria-label="Customer story template">
          <header className="cu-story-head">
            <span className="cu-story-logo" aria-hidden="true">
              <Icon name="building" />
            </span>
            <div className="cu-story-who">
              <Placeholder label="Customer name">
                <span className="cu-story-name">Company name</span>
                <span className="cu-story-meta">Trade · Yard size · Region</span>
              </Placeholder>
            </div>
            <span className="cu-story-soon">Customer story coming soon</span>
          </header>

          <div className="cu-story-parts">
            {STORY_PARTS.map((s) => (
              <Placeholder key={s.title} label={`${s.title} placeholder`} minHeight={180}>
                <h3 className="cu-part-h">
                  <Icon name={s.icon} />
                  {s.title}
                </h3>
                <p className="cu-part-guide">{s.guide}</p>
              </Placeholder>
            ))}
          </div>

          <Placeholder label="Customer quote placeholder">
            <figure className="cu-pull">
              <Icon name="quote" className="cu-quote-icon" />
              <blockquote>A short quote from the customer, in their own words, goes here.</blockquote>
              <figcaption>Name, role and company, shared with permission</figcaption>
            </figure>
          </Placeholder>
        </article>
      </Section>

      <Section eyebrow="Testimonials" title="What customers say" lede="Short quotes from real customers will go here. There are none yet, so none are shown.">
        <ul className="cu-quotes" aria-label="Testimonial placeholders">
          {[1, 2, 3].map((n) => (
            <li key={n}>
              <Placeholder label="Testimonial placeholder" minHeight={200}>
                <div className="cu-quote">
                  <Icon name="quote" className="cu-quote-icon" />
                  <p>Room for a real customer’s words about {BRAND.name}.</p>
                  <div className="cu-quote-by">
                    <span className="cu-quote-avatar" aria-hidden="true" />
                    <span>
                      <b>Customer name</b>
                      <br />
                      Role, company
                    </span>
                  </div>
                </div>
              </Placeholder>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="early" tone="hazard" eyebrow="Early customer program" title="Run it in your yard first" lede={`Use ${BRAND.name} on real work before it launches, and help shape what it becomes.`}>
        <h3 className="cu-early-h">What early customers get</h3>
        <ul className="cu-perks">
          {PERKS.map((p) => (
            <li key={p.title} className="cu-perk">
              <span className="cu-perk-icon">
                <Icon name={p.icon} />
              </span>
              <h4>{p.title}</h4>
              <p>{p.body}</p>
              {p.placeholder && <Coming>{p.placeholder}</Coming>}
            </li>
          ))}
        </ul>

        <div className="cu-early-cols">
          <div>
            <h3 className="cu-early-h">Who it is for</h3>
            <p>Yards that stage material by job, with a few racks and a crew willing to scan. Contractors, suppliers and facilities teams are all welcome.</p>
          </div>
          <div>
            <h3 className="cu-early-h">What we ask in return</h3>
            <p>Use it on real work. Tell us plainly what is wrong or missing. If it helps you, let us tell your story on this page, with your permission.</p>
          </div>
        </div>

        <div className="cu-early-cta">
          <button type="button" className="site-btn primary" onClick={apply}>
            Ask about early access
            <Icon name="arrowRight" />
          </button>
          <div className="cu-early-email">
            <span className="cu-early-or">Or email {CREATOR.name} directly</span>
            <EmailCopy email={CREATOR.email} tone="boxed" />
          </div>
        </div>
      </Section>

      <CtaBand title="Want to be the first story here?" body="Book a walkthrough with your own racks and labels in mind, or open the portal and try it now." />
    </>
  );
}
