import { PageHero, Section, FeatureCards, CtaBand } from '../kit';
export function CustomersPage() { return <>
<PageHero eyebrow="Getting started" title="Start small. Make it routine." lede="Choose one aisle and a few active jobs." />
<Section><FeatureCards items={[
{icon:'locations',title:'Name the racks',body:'Use the location names your crew already knows. We help print the rack labels.'},
{icon:'receive',title:'Label the next delivery',body:'Receive it against the job and scan where you put it.'},
{icon:'people',title:'Bring the crew in',body:'We walk through receiving, moving, finding and dispatching together, remotely.'}
]} /></Section><CtaBand title="Let’s set up your first aisle." body="Send us a quick description of your warehouse." />
</>; }
