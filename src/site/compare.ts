// The comparison on the Why Wherehouse page, in three columns: Wherehouse, the inventory apps a small business
// usually looks at (Sortly, inFlow, Zoho Inventory and Fishbowl, rolled into one "Typical inventory apps" column),
// and doing it by hand. Every claim in the apps column has to hold for the vendor notes below: say "Most", "Often"
// or "Some" when not all four do it. A few rows are gotchas: something the apps have that nobody wants.
//
// Competitor facts were checked on 2026-09-30 from each vendor's public pages. Prices change; recheck before
// relying on them and update the date in COMPARE_CHECKED. Where a fact could not be verified we say so ("Not
// listed") instead of guessing. We compare each vendor's lowest paid plan unless a cell says otherwise.
//
// Sortly: https://www.sortly.com/pricing/
//   Advanced $49/mo month to month, or $24/mo billed yearly ($288/yr; 50% first-year discount, then 20% off
//   yearly). 2 user licenses, 500 unique items. Ultra $149/mo ($74 yearly, first year), 5 users. Premium $299/mo
//   ($149 yearly, first year), 8 users, QuickBooks Online. Enterprise: contact sales. Advanced includes in-app
//   barcode and QR scanning, unlimited QR label creation, custom folders, offline mobile access, low-stock
//   alerts, activity history ("who from your team did what, and when") kept 1 year (3 years on Ultra, unlimited
//   on Premium). Purchase orders from Ultra. 14-day free trial, credit card required. No setup fee listed.
// inFlow Inventory: https://www.inflowinventory.com/software-pricing
//   Lite $129/mo month to month, $99/mo billed annually: 2 team members, 1 location, no sublocations,
//   onboarding optional. Core $379/mo ($299 annually): 5 team members, 5 locations, onboarding "Required one-time
//   cost, 499 USD". Pro $629 ($499), Max $879 ($699). 14-day free trial. Barcode generation, iPhone and Android
//   apps, QuickBooks Online and Xero, unlimited products, sales and purchases on every plan.
//   Movement history per product: https://www.inflowinventory.com/support/cloud/how-do-i-see-the-movement-or-transaction-history-2
// Zoho Inventory: https://www.zoho.com/inventory/pricing/
//   Standard $29/org/mo billed annually (monthly-billing price not shown), 2 users, 2 locations, 500 orders/mo.
//   Professional $79, Premium $129 (2,000 bins per location, barcode generation), Enterprise $249 (7 users).
//   Free plan (1 user, 50 orders). 14-day free trial. Purchase orders; QuickBooks Online, Xero and Zoho Books.
//   Activity log filterable by user: https://www.zoho.com/en-ng/inventory/kb/users-and-roles/track-user-activity.html
// Fishbowl: https://www.fishbowlinventory.com/pricing
//   Essentials $229/mo billed annually (2 users), Growth $429 (5 users), Scale $729 (10 users). Advanced
//   Warehouse "From $595 USD/mo.", quoted by users and deployment. "We do require an implementation package";
//   no price published; it includes a "6-8 week training certification". Essentials lists mobile barcode
//   scanning, barcode printing, multi-warehouse support with unlimited sub-locations, QuickBooks Online and Xero
//   sync, and "Audit Trails (Available Q1 2026)". Sales orders from Growth. Demo requests; no free trial listed.
// By hand: paper, a whiteboard or a shared spreadsheet. No vendor; costs are time.
//
// How each apps cell follows from the notes:
//   exact spot: inFlow sublocations from Core, Zoho bins from Premium, Sortly folders; only Fishbowl on its lowest.
//   move history: Sortly 1 year on Advanced; the others list per-product or per-user logs.
//   orders: Sortly purchase orders from Ultra, Fishbowl sales orders from Growth.
//   no signal: only Sortly lists offline access.
//   required package: Fishbowl requires one (with 6 to 8 weeks of training); inFlow requires $499 onboarding on Core.
//   on-site setup: none of the four lists one.
//   trial: Sortly needs a card, Fishbowl offers a demo; the others 14 days.
//   yearly price: Sortly $24 and inFlow $99 are yearly rates; Zoho and Fishbowl list only yearly prices.
//   2 people: Sortly Advanced, inFlow Lite, Zoho Standard and Fishbowl Essentials each include 2.
// Wherehouse has no accounting integration, so the table makes no claim about it either way.

import { PLANS, SETUP_FEE } from '../domain/plans';
import { PRICING } from './prices';

export const COMPARE_CHECKED = 'September 2026';
export const COMPARE_APPS = ['Sortly', 'inFlow', 'Zoho Inventory', 'Fishbowl'] as const;

export type CompareId = 'wherehouse' | 'apps' | 'hand';
/**
 * yes: has it. part: partly, sometimes, or only on a higher plan. no: doesn't.
 * On a gotcha row, `bad` is a yes nobody wants and `proud` is a no worth bragging about.
 */
export type Mark = 'yes' | 'part' | 'no' | 'bad' | 'proud';
export interface CompareCell {
  mark?: Mark;
  text: string;
}
export interface CompareColumn {
  id: CompareId;
  name: string;
  sub: string;
}
export interface CompareRow {
  label: string;
  /** Something the apps have that nobody wants. */
  gotcha?: boolean;
  cells: Record<CompareId, CompareCell>;
}
export interface CompareGroup {
  title: string;
  rows: CompareRow[];
}

const starter = PLANS[0];
const biggest = PLANS[PLANS.length - 1];

export const COMPARE_COLUMNS: CompareColumn[] = [
  { id: 'wherehouse', name: 'Wherehouse', sub: `From $${starter.monthly}/mo` },
  { id: 'apps', name: 'Typical inventory apps', sub: 'Lowest paid plan' },
  { id: 'hand', name: 'Doing it by hand', sub: 'Paper or spreadsheet' },
];

export const COMPARE_GROUPS: CompareGroup[] = [
  {
    title: 'Find it fast',
    rows: [
      {
        label: 'The exact spot: rack, shelf or bin',
        cells: {
          wherehouse: { mark: 'yes', text: 'Every item, every plan' },
          apps: { mark: 'part', text: 'Often only on pricier plans' },
          hand: { mark: 'part', text: 'If someone keeps it current' },
        },
      },
      {
        label: 'Every move: who, when, from and to',
        cells: {
          wherehouse: { mark: 'yes', text: 'Kept for good, never edited' },
          apps: { mark: 'part', text: 'Varies; Sortly keeps 1 year' },
          hand: { mark: 'no', text: 'Only if it’s written down' },
        },
      },
      {
        label: 'Stock levels, counts and low-stock alerts',
        cells: {
          wherehouse: { mark: 'yes', text: 'Plus lots and expiry dates' },
          apps: { mark: 'yes', text: 'Yes' },
          hand: { mark: 'part', text: 'Manual counts' },
        },
      },
      {
        label: 'Pick lists, orders and transfers',
        cells: {
          wherehouse: { mark: 'yes', text: 'Included' },
          apps: { mark: 'part', text: 'Orders; some on higher plans only' },
          hand: { mark: 'no', text: 'Separate paperwork' },
        },
      },
      {
        label: 'Moves still save with no signal',
        cells: {
          wherehouse: { mark: 'yes', text: 'Syncs when you’re back' },
          apps: { mark: 'part', text: 'Most don’t list it' },
          hand: { mark: 'yes', text: 'Paper works anywhere' },
        },
      },
    ],
  },
  {
    title: 'Get your crew going',
    rows: [
      {
        label: 'Learn it in one shift',
        cells: {
          wherehouse: { mark: 'yes', text: 'Two scans: item, then spot' },
          apps: { mark: 'part', text: 'Varies by app' },
          hand: { mark: 'yes', text: 'Nothing new to learn' },
        },
      },
      {
        label: 'Required setup or training package',
        gotcha: true,
        cells: {
          wherehouse: { mark: 'proud', text: 'Never required' },
          apps: { mark: 'bad', text: 'Some do; Fishbowl’s includes 6 to 8 weeks of training' },
          hand: { mark: 'no', text: 'No' },
        },
      },
      {
        label: 'Scan with the phone you already have',
        cells: {
          wherehouse: { mark: 'yes', text: 'In the browser, plus USB, Bluetooth and Zebra scanners' },
          apps: { mark: 'yes', text: 'Through their app' },
          hand: { mark: 'no', text: 'No' },
        },
      },
      {
        label: 'Print QR or barcode labels',
        cells: {
          wherehouse: { mark: 'yes', text: 'Office or label printer' },
          apps: { mark: 'yes', text: 'Most; Zoho from Premium' },
          hand: { mark: 'no', text: 'Handwritten' },
        },
      },
      {
        label: 'Set up in person',
        cells: {
          wherehouse: { mark: 'yes', text: `Near Charleston, $${SETUP_FEE.small}–$${SETUP_FEE.large}, optional` },
          apps: { mark: 'no', text: 'No on-site setup listed' },
          hand: { mark: 'no', text: 'You do it all' },
        },
      },
      {
        label: 'Free trial, no card needed',
        cells: {
          wherehouse: { mark: 'yes', text: `${PRICING.pilotDays} days` },
          apps: { mark: 'part', text: 'Most 14 days; some need a card or a demo call' },
          hand: { text: 'Nothing to try' },
        },
      },
    ],
  },
  {
    title: 'Price and support',
    rows: [
      {
        label: 'Starting price',
        cells: {
          wherehouse: { mark: 'yes', text: `$${starter.monthly}/mo, month to month` },
          apps: { text: '$24 to $229/mo, mostly billed yearly' },
          hand: { text: '$0, plus the time spent looking' },
        },
      },
      {
        label: 'Lowest price only if you pay for the year',
        gotcha: true,
        cells: {
          wherehouse: { mark: 'proud', text: 'Same price, month to month' },
          apps: { mark: 'bad', text: 'All four list it billed yearly' },
          hand: { mark: 'no', text: 'No' },
        },
      },
      {
        label: 'Only 2 people on the lowest paid plan',
        gotcha: true,
        cells: {
          wherehouse: { mark: 'proud', text: `${starter.people} on ${starter.name}, up to ${biggest.people}` },
          apps: { mark: 'bad', text: 'All four start at 2' },
          hand: { mark: 'no', text: 'No' },
        },
      },
      {
        label: 'Support from the person who built it',
        cells: {
          wherehouse: { mark: 'yes', text: 'The founder, in Charleston, SC' },
          apps: { mark: 'no', text: 'Larger software companies' },
          hand: { mark: 'no', text: 'It’s all on you' },
        },
      },
    ],
  },
];
