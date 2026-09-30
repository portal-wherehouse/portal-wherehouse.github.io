import { PageHero, Section, SiteLink } from '../kit';
import { BRAND } from '../../brand';
export function ContactPage(){return <>
<PageHero eyebrow="Get help" title="Let’s look at your warehouse." lede="Starting out, choosing equipment or stuck on a scan? Get in touch."/>
<Section><div className="contact-layout"><div className="contact-card"><h2>Email us</h2><a className="contact-email" href={`mailto:${BRAND.supportEmail}?subject=Wherehouse%20setup%20and%20support`}>{BRAND.supportEmail}</a><p>Tell us what you store and what you’d like help with. A photo of your shelves, racks or current labels is useful too.</p></div><div className="contact-details"><h2>What we can help with</h2><dl><dt>Getting started</dt><dd>Zones and spot names, labels, accounts and showing your crew the routine.</dd><dt>Equipment</dt><dd>Check your printer and scanner, or arrange a suitable setup.</dd><dt>On-site help</dt><dd>Local on-site setup in the Charleston, SC area (and Lowcountry). Tell us your location and what you need.</dd></dl><SiteLink to="pricing">Compare setup options →</SiteLink></div></div></Section>
<Section narrow tone="surface" title="Already using Wherehouse?"><p>Include the item or spot code, what you tried, and what happened. Remote support is included with your plan.</p></Section>
</>;}
