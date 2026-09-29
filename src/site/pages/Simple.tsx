import { PageHero, Section, SiteLink } from '../kit';
export function SimplePage(){return <>
<PageHero eyebrow="Why Wherehouse" title="The next shift shouldn’t have to guess." lede="Keep the job, the rack and the last move in one shared record. Anyone on your crew can find the answer."/>
<Section><div className="buyer-table-wrap"><table className="buyer-table"><thead><tr><th>The question</th><th>With notes and memory</th><th>With Wherehouse</th></tr></thead><tbody>
<tr><th>Where did we put it?</th><td>Walk the racks or call the last shift.</td><td>Search the job or pallet. See its last confirmed rack.</td></tr>
<tr><th>Who moved it?</th><td>Ask around and piece it together.</td><td>Open the pallet’s history: who, when, from and to.</td></tr>
<tr><th>What’s still here for this job?</th><td>Check a sheet against the floor.</td><td>Open the job’s pallets and pick list.</td></tr>
<tr><th>What happens when someone is off?</th><td>The answer may be in their head.</td><td>The next person signs in and sees the same records.</td></tr>
</tbody></table></div></Section>
<Section tone="surface"><div className="buyer-columns"><div><h2>A smaller job than a full WMS</h2><p>Wherehouse is for receiving, organizing and finding pallets assigned to jobs. Keep purchasing and accounting in the systems you already use.</p><p>If you need item-by-item stock counts, automated replenishment or order fulfilment, a broader inventory or warehouse system may fit better.</p></div><div><h2>One routine to teach</h2><ol><li>Receive the pallet against its job.</li><li>Scan the pallet and rack when it moves.</li><li>Search when it’s needed.</li></ol><p>Photos, holds, dispatch and history are there when you need them. Your crew starts with the daily work.</p></div></div></Section>
<Section narrow title="The records depend on the scans."><p>We show the last confirmed location, time and person. Wherehouse can’t detect a move nobody records. During setup, we help you make scanning part of the unload and put-away routine.</p><div className="site-hero-actions"><a className="site-btn primary" href="?demo=1#signin">See the sample warehouse</a><SiteLink to="pricing">View plans →</SiteLink></div></Section>
</>;}
