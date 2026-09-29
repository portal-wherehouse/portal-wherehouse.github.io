import { PageHero, Section, SiteLink } from '../kit';
import { PRICING } from '../prices';
export function PricingPage() { return <>
<PageHero eyebrow="Pricing" title="One warehouse. One price." lede="Remote help is part of the service." />
<Section narrow><div className="pilot-price"><p className="site-eyebrow">Wherehouse</p><h2 className="site-h1">${PRICING.monthly}<small style={{fontSize:'1rem'}}> / warehouse / month</small></h2><p>Up to {PRICING.users} people. Receive, move, find, dispatch and export.</p><ul><li>Remote setup and crew training</li><li>Help with printers, labels and scanners</li><li>Ongoing remote support for the whole app</li></ul><p>No setup fee. No annual contract. Hardware and labels are bought separately.</p><SiteLink to="contact" className="site-btn primary">Get started</SiteLink></div></Section>
<Section tone="surface" title="Try it in one part of your warehouse." lede={`Your first ${PRICING.pilotDays} days are free. We arrange setup and billing directly. There’s no automatic charge on this website.`} />
</>; }
