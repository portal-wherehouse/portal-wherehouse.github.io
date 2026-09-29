// The public website's page list, shared by the header, the mobile menu and the footer.

import type { SiteRouteName } from '../app/state';

export interface SiteNavItem {
  route: SiteRouteName;
  label: string;
  /** One line for menus and the footer. */
  blurb: string;
}

/** Main navigation, in reading order. */
export const SITE_NAV: SiteNavItem[] = [
  { route: 'product', label: 'Product', blurb: 'What it is and how it works' },
  { route: 'showcase', label: 'See it in action', blurb: 'Everything it can do, screen by screen' },
  { route: 'simple', label: 'Why it’s simple', blurb: 'The decisions that keep it easy' },
  { route: 'hardware', label: 'Scanners', blurb: 'Works with the barcode scanners you already own' },
  { route: 'industries', label: 'Applications', blurb: 'Who it is for and how they would use it' },
  { route: 'customers', label: 'Customers', blurb: 'Early access, and room for real stories' },
  { route: 'pricing', label: 'Pricing', blurb: 'Plans for every size of yard' },
  { route: 'founder', label: 'About', blurb: 'Who is building it' },
];

/** Extra footer-only links. */
export const SITE_FOOTER_EXTRA: SiteNavItem[] = [
  { route: 'security', label: 'Security and data', blurb: 'Where your records live and who can see them' },
  { route: 'contact', label: 'Contact', blurb: 'Talk to us' },
];
