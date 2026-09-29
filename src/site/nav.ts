import type { SiteRouteName } from '../app/state';
export interface SiteNavItem { route: SiteRouteName; label: string; blurb: string }
export const SITE_NAV: SiteNavItem[] = [
  { route: 'product', label: 'How it works', blurb: 'Receive, label, move and find by job' },
  { route: 'hardware', label: 'Scanners', blurb: 'Phones, labels and scanner setup' },
  { route: 'pricing', label: 'Pricing', blurb: 'One proposed plan, clear pilot terms' },
  { route: 'customers', label: 'Pilot program', blurb: 'Test one real warehouse workflow' },
  { route: 'founder', label: 'About', blurb: 'Meet the builder' },
];
export const SITE_FOOTER_EXTRA: SiteNavItem[] = [
  { route: 'security', label: 'Security and data', blurb: 'Current limits and the production plan' },
  { route: 'contact', label: 'Contact', blurb: 'Talk through your warehouse' },
];
