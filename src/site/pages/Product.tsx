import { PageHero, Section, FeatureCards, CtaBand, SiteLink } from '../kit';
export function ProductPage() { return <>
<PageHero eyebrow="How it works" title="A place for every pallet." lede="Keep the job, the pallet and its location together." />
<Section><FeatureCards items={[
{icon:'receive',title:'1. Receive it',body:'Choose the job. Add a short description. Print a pallet label.'},
{icon:'move',title:'2. Put it away',body:'Scan the pallet, then the rack. Everyone sees the saved location.'},
{icon:'find',title:'3. Find it',body:'Search the job or scan the label. See where it was last placed and who moved it.'}
]} /></Section>
<Section tone="surface" title="Keep the floor moving." lede="Receive several similar pallets without retyping the job. Print labels together. Record dispatch when they leave."><div className="site-hero-actions"><SiteLink to="hardware">Printing & scanning →</SiteLink><SiteLink to="simple">What we leave out →</SiteLink><SiteLink to="showcase">Process walkthrough →</SiteLink></div></Section>
<CtaBand title="Start with one aisle." body="We’ll help you name the racks, print the labels and show your crew the routine." />
</>; }
