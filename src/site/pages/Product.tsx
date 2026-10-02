import { PageHero, Section, SiteLink } from '../kit';
import { portalHref } from '../../config/hosts';
export function ProductPage(){return <>
<PageHero eyebrow="How it works" title="From delivery to the right spot." lede="A simple record for each item you track, whether it’s a pallet, a box, a part or a piece of equipment, shared with the people who handle it."/>
<Section><div className="workflow-rows">
<article><span>01</span><div><h2>Receive and label</h2><p>Add a short description, or scan the barcode it already has. List what’s inside if it’s a box or bin. Add a photo if it helps. Print its label.</p></div></article>
<article><span>02</span><div><h2>Store it</h2><p>Scan the item, then the spot: a rack, shelf, bin, floor lane or yard row. The saved spot appears for the rest of the team.</p></div></article>
<article><span>03</span><div><h2>Find it and send it out</h2><p>Search a name, code or what’s inside, even with a typo. Open the record for photos and history. Mark it sent out when it leaves.</p></div></article>
</div></Section>
<Section tone="surface" title="The office and floor use the same records."><div className="buyer-columns"><div><h3>For the crew</h3><p>Receive, move and find. Use a phone camera or a keyboard-style scanner. No app to install.</p></div><div><h3>For managers</h3><p>Set up zones and spots, authorize your team, check holds and export records when the office needs them.</p></div></div></Section>
<Section id="why-wherehouse" eyebrow="Why Wherehouse" title="A shared answer for the next shift." lede="See how Wherehouse compares with other inventory tools and with keeping track by hand, on price, features and support."><div className="site-hero-actions"><SiteLink to="simple" className="site-btn ghost">Why Wherehouse →</SiteLink></div></Section>
<Section narrow><div className="site-hero-actions"><a href={portalHref('?demo=1#signin')} className="site-btn primary">Open the sample warehouse</a><SiteLink to="showcase">Process walkthrough →</SiteLink></div></Section>
</>;}
