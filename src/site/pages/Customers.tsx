import { PageHero, Section, FeatureCards, CtaBand } from '../kit';
export function CustomersPage() { return <>
<PageHero eyebrow="Getting started" title="Start small. Make it routine." lede="Choose one aisle, room or shelf unit and start there." />
<Section><FeatureCards items={[
{icon:'locations',title:'Name the spots',body:'Use the names your crew already knows for racks, shelves and bins. We help print the spot labels.'},
{icon:'receive',title:'Label the next delivery',body:'Add it when it arrives and scan where you put it.'},
{icon:'people',title:'Bring the crew in',body:'We walk through receiving, moving, finding and dispatching together, remotely.'}
]} /></Section><CtaBand title="Let’s set up your first aisle." body="Send us a quick description of your warehouse." />
</>; }
