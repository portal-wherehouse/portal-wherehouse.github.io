import { PageHero, Section, SiteLink } from '../kit';
export function ProductPage(){return <>
<PageHero eyebrow="How it works" title="From delivery to the right rack." lede="A simple record for each physical pallet, shared with the people who handle it."/>
<Section><div className="workflow-rows">
<article><span>01</span><div><h2>Receive and label</h2><p>Choose the job and add a short description. Add a photo if it helps identify the load. Print its label before it leaves receiving.</p></div></article>
<article><span>02</span><div><h2>Store it</h2><p>Scan the pallet, then the rack. Check the destination and confirm. The saved location appears for the rest of the team.</p></div></article>
<article><span>03</span><div><h2>Find it and send it out</h2><p>Search the job, pallet or rack. Open the record for photos and history. Record dispatch when the material leaves.</p></div></article>
</div></Section>
<Section tone="surface" title="The office and floor use the same records."><div className="buyer-columns"><div><h3>For the crew</h3><p>Receive, move and find. Use a phone camera or a keyboard-style scanner. No app to install.</p></div><div><h3>For managers</h3><p>Set up racks and jobs, authorize your team, check holds and export records when the office needs them.</p></div></div></Section>
<Section narrow><div className="site-hero-actions"><a href="?demo=1#signin" className="site-btn primary">Open the sample warehouse</a><SiteLink to="showcase">Process walkthrough →</SiteLink><SiteLink to="why">Why Wherehouse →</SiteLink></div></Section>
</>;}
