import { PageHero, Section, FeatureCards, CtaBand } from '../kit';
export function SimplePage() { return <>
<PageHero eyebrow="Keep it simple" title="You need to find a pallet. Not run another system." lede="Wherehouse keeps warehouse organization small enough to use during a busy shift." />
<Section><FeatureCards columns={2} items={[
{icon:'check',title:'No catalog to build first',body:'A job number and a short description are enough to receive a pallet.'},
{icon:'people',title:'No software project for your crew',body:'Operators start with Receive, Move and Find. Managers handle jobs, racks and access.'},
{icon:'export',title:'No lock-in to your records',body:'Managers can export pallet records and history as CSV.'},
{icon:'settings',title:'No accounting or ERP overhaul',body:'Keep your existing purchasing and accounting tools. This handles where the material is.'}
]} /></Section>
<Section tone="surface" title="One habit matters." lede="Scan when you move something. We show the last recorded location; we can’t track an unrecorded move." />
<CtaBand />
</>; }
