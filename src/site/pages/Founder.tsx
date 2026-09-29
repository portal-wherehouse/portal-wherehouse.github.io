import { PageHero, Section, SiteLink } from '../kit';
import { CREATOR } from '../../brand';
export function FounderPage() { return <>
<PageHero eyebrow="About" title="Less time looking. More time moving." lede="Wherehouse is built around a straightforward warehouse problem: knowing where the material for a job was put." />
<Section narrow><h2 className="site-h2">Built by {CREATOR.name}.</h2><p>The goal is a tool your crew can use while the work is happening. Short forms, readable labels and a clear location.</p><SiteLink to="contact">Talk about your warehouse →</SiteLink></Section>
</>; }
