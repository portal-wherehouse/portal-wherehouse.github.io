import { PageHero, Section, FeatureCards, SiteLink } from '../kit';
export function SecurityPage() { return <>
<PageHero eyebrow="Your records" title="Shared with your crew. Controlled by you." lede="Each person signs in with their own account." />
<Section><FeatureCards columns={2} items={[
{icon:'people',title:'Choose who can change records',body:'Owners manage access. Supervisors manage the warehouse. Operators move and find inventory. Viewers can look it up.'},
{icon:'history',title:'See what happened',body:'Every record keeps a history of who made a change and when. Corrections leave the previous history visible.'},
{icon:'export',title:'Take your records with you',body:'Managers can download CSV records and history.'},
{icon:'cloud',title:'Shared saving',body:'Live accounts save to Google Firebase. A change is confirmed only after the server accepts it. An internet connection is required.'}
]} /></Section><Section narrow tone="surface" title="Keep account details private."><p>Use a separate account for each person and sign out on shared devices. Contact us to arrange data deletion or help with access.</p><p>The optional sample warehouse is separate and saves only in that browser.</p><SiteLink to="contact">Contact support →</SiteLink></Section>
</>; }
