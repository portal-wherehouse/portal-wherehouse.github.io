import { PageHero, Section } from '../kit';
import { BRAND } from '../../brand';
export function ContactPage() { return <>
<PageHero eyebrow="Setup & support" title="Tell us how your warehouse works." lede="We’ll help with the racks, labels, printers and people." />
<Section narrow><h2 className="site-h2">Talk to a person.</h2><p>Send your warehouse size, what you store and the best way to reach you. For support, tell us what you were doing and what happened.</p><a className="site-btn primary" href={`mailto:${BRAND.supportEmail}?subject=Wherehouse%20setup%20and%20support`}>Email {BRAND.supportEmail}</a><p>Remote setup, training and ongoing support are included. Hardware purchases and on-site visits aren’t included.</p></Section>
</>; }
