import { PageHero, Section, SiteLink } from '../kit';
import { PRICING } from '../prices';
export function PricingPage(){return <>
<PageHero eyebrow="Plans & setup" title="Start with what you have." lede="The same warehouse software in either option. Choose how much setup help you need."/>
<Section><div className="plan-options">
<article className="plan-option"><h2>Use your equipment</h2><p className="plan-price">${PRICING.monthly}<span> / warehouse / month</span></p><p>For a crew with a phone and a printer ready to go.</p><ul><li>Up to {PRICING.users} people</li><li>Every warehouse feature</li><li>Remote setup and crew training</li><li>Ongoing remote support</li></ul><SiteLink to="contact" className="site-btn primary">Start with remote setup</SiteLink></article>
<article className="plan-option"><h2>Equipment & setup</h2><p className="plan-price">${PRICING.monthly}<span> / month + a setup quote</span></p><p>For a crew that wants the printer, labels and setup arranged.</p><ul><li>Everything in the software plan</li><li>A printer and label supply selected for your work</li><li>Hardware setup and scan checks</li><li>On-site help by arrangement</li></ul><SiteLink to="contact" className="site-btn">Ask for a setup quote</SiteLink></article>
</div><p className="plan-note">Use your own hardware and labels, or we can supply them. We’ll agree on any equipment or on-site costs with you first.</p></Section>
<Section tone="surface" title="What’s included"><div className="buyer-table-wrap"><table className="buyer-table"><thead><tr><th>Included</th><th>Use your equipment</th><th>Equipment & setup</th></tr></thead><tbody>
{['Shared records, photos and movement history','Phone scanning and printed labels','Manager and employee accounts','Remote support for the whole app'].map(t=><tr key={t}><th>{t}</th><td>Yes</td><td>Yes</td></tr>)}
<tr><th>Printer, labels and hardware setup</th><td>Use your own; we help remotely</td><td>Included in your agreed quote</td></tr><tr><th>On-site visit</th><td>Available by arrangement</td><td>Can be included in your quote</td></tr>
</tbody></table></div></Section>
<Section narrow title="Try one aisle first."><p>Your first {PRICING.pilotDays} days of software are free. No annual contract or software setup fee. We arrange billing directly; there’s no automatic charge here.</p><a className="site-link" href="?demo=1#signin">Browse the sample warehouse →</a></Section>
</>;}
