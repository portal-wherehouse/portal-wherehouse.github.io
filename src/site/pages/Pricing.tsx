import { PRICING } from '../prices';
import { PageHero, Section, SiteLink, PortalCTA, FeatureCards } from '../kit';
import '../pilot.css';
export function PricingPage() {
  return <>
    <div className="site-inner"><PageHero eyebrow="Pricing" title="A clear price for one warehouse."
      lede="Free to explore today. A single proposed plan when shared accounts are ready."><PortalCTA /></PageHero></div>
    <Section tone="surface"><div className="pilot-pricing-grid">
      <article className="pilot-card"><p className="site-eyebrow">Available now</p><h2>Browser demo</h2><p className="pilot-price">$0</p>
        <p>Use fictional jobs, racks and pallets to try the complete workflow.</p><ul><li>No account or credit card</li><li>Real receiving, labels, movement and history in this browser</li><li>No shared storage between devices</li><li>Use sample data only</li></ul><PortalCTA note={null} /></article>
      <article className="pilot-card featured"><p className="site-eyebrow">Proposed launch plan · not yet available</p><h2>Warehouse</h2><p><strong className="pilot-price">${PRICING.monthly}</strong> / month</p>
        <p>Per warehouse, with up to {PRICING.users} users. Monthly billing proposed; no annual commitment.</p><ul><li>Receive, Move, Find and dispatch</li><li>Job-based records, labels and movement history</li><li>Planned shared accounts with role-based access</li><li>Planned hosted records and backups</li></ul>
        <SiteLink to="contact" className="site-btn primary">Discuss a pilot</SiteLink>
      </article>
    </div></Section>
    <Section eyebrow="Before you pay" title={`A ${PRICING.pilotDays}-day pilot, agreed in advance.`}
      lede="The live pilot starts only after shared accounts, access controls and backup recovery have been tested. There is no checkout, card collection or automatic conversion on this site.">
      <FeatureCards items={[
        { icon: 'checklist', title: 'Agree on a small scope', body: 'One warehouse section, one crew and a defined group of jobs. Confirm devices, labels and responsibilities together.' },
        { icon: 'find', title: 'Check actual results', body: 'Measure retrieval time, location accuracy and missed scans. A simulation is not proof of savings.' },
        { icon: 'user', title: 'Choose whether to continue', body: 'Review the proposed price and support scope before agreeing to paid service. Hardware and label supplies are separate.' },
      ]} />
    </Section>
  </>;
}
