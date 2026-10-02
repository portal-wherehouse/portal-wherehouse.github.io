import type { Route, SiteRouteName } from '../app/state';
import { groupById, groupTitle } from './for/groups';

/** The header navigation, and the big items in the phone menu. */
export const SITE_NAV: { route: SiteRouteName; label: string; blurb: string }[] = [
  { route: 'product', label: 'How it works', blurb: 'Receive. Move. Find.' },
  { route: 'for', label: 'Who it’s for', blurb: 'Wherehouse for your kind of business.' },
  { route: 'pricing', label: 'Pricing', blurb: 'Software, equipment and setup options.' },
  { route: 'contact', label: 'Get help', blurb: 'Talk to a person.' },
];

/** The smaller links under them in the phone menu. Why Wherehouse is also linked from How it works, and Printing & scanning from Pricing. */
export const SITE_FOOTER_EXTRA: { route: SiteRouteName; label: string; blurb: string }[] = [
  { route: 'simple', label: 'Why Wherehouse', blurb: '' },
  { route: 'hardware', label: 'Printing & scanning', blurb: '' },
  { route: 'fit', label: 'Is it for me?', blurb: '' },
  { route: 'mission', label: 'Our mission', blurb: '' },
  { route: 'showcase', label: 'Process walkthrough', blurb: '' },
  { route: 'customers', label: 'Getting started', blurb: '' },
  { route: 'founder', label: 'About', blurb: '' },
  { route: 'security', label: 'Your records', blurb: '' },
];

/** Pages reached by a second address, or only by links. */
const OTHER_LABELS: Partial<Record<SiteRouteName, string>> = {
  why: 'Why Wherehouse',
  industries: 'Who it’s for',
  start: 'Set up your warehouse',
};

/** A page's name, for links and the browser tab: "Pricing", or "Wherehouse for lumberyards and building supply". */
export function siteLabel(route: Pick<Route, 'name' | 'id'>): string {
  const group = route.name === 'for' ? groupById(route.id) : undefined;
  if (group) return groupTitle(group);
  const name = route.name as SiteRouteName;
  return [...SITE_NAV, ...SITE_FOOTER_EXTRA].find((p) => p.route === name)?.label ?? OTHER_LABELS[name] ?? name;
}
