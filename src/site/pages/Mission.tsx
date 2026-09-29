import { PageHero, Section, FeatureCards, SiteLink } from '../kit';
export function MissionPage(){return <>
<PageHero eyebrow="Our mission" title="Make warehouse work easier." lede="Help crews receive, organize and find material without extra paperwork or another complicated system." />
<Section><FeatureCards items={[
{icon:'receive',title:'Less to enter',body:'Start with the job and a short description. Reuse the details when another pallet arrives.'},
{icon:'locations',title:'A clear place for things',body:'Give each pallet a label and each rack a name. Keep the location with the record.'},
{icon:'people',title:'One shared picture',body:'The next person should be able to find the material without tracking down whoever moved it.'}
]} /></Section>
<Section tone="surface" title="Less searching. Fewer misplaced pallets." lede="The goal is a simple habit that holds up on a busy day: scan the pallet, scan the rack, carry on."><p>Wherehouse records the last confirmed location and every saved movement. Your crew keeps it accurate by recording moves as they happen.</p><SiteLink to="product" className="site-btn primary">See how it works</SiteLink></Section>
</>;}
