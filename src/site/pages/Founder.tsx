import { CREATOR } from '../../brand';
import { PageHero, Section, FeatureCards, SiteLink } from '../kit';
export function FounderPage() {
 return <><div className="site-inner"><PageHero eyebrow="About" title={`Built by ${CREATOR.name}`}
 lede="Wherehouse focuses on a practical question: where is the material for this job, and when was that location last confirmed?">
 <SiteLink to="contact" className="site-btn primary">Talk through your workflow</SiteLink>
 <a className="site-btn ghost" href={CREATOR.linkedin} target="_blank" rel="noopener noreferrer">LinkedIn</a></PageHero></div>
 <Section tone="surface" title="Built around the warehouse floor."><FeatureCards items={[
 {icon:'receive', title:'A record for each pallet', body:'Separate physical pallets keep separate identities, even when their contents look the same.'},
 {icon:'pin', title:'A location you can check', body:'Show the last recorded rack and confirmation time. An unscanned movement remains unknown.'},
 {icon:'history', title:'A history you can follow', body:'Receipts, movements and corrections stay connected to the pallet and its job.'}
 ]}/></Section>
 <Section title="Help shape the first live pilot." lede="The browser demo is available now. Shared accounts and hosted storage are still being developed. Feedback from actual receiving and staging work will determine what comes next.">
 <SiteLink to="customers" className="site-btn primary">Explore the pilot program</SiteLink></Section></>;
}
