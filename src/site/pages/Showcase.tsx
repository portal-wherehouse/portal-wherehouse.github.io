import { PageHero, Section, SiteLink } from '../kit';
export function ShowcasePage() { return <>
<PageHero eyebrow="Process walkthrough" title="From delivery to dispatch." lede="Receive → label → put it away → find → send it out." />
<Section narrow><figure className="walkthrough-video"><video controls playsInline muted preload="metadata" aria-label="One-second animation placeholder" ><source src={`${import.meta.env.BASE_URL}animation-placeholder.webm`} type="video/webm" /><source src={`${import.meta.env.BASE_URL}animation-placeholder.mp4`} type="video/mp4" /></video><figcaption>Animation placeholder · the full warehouse walkthrough will go here.</figcaption></figure><SiteLink to="product">Read the three steps →</SiteLink></Section>
</>; }
