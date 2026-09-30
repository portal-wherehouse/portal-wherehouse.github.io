// The comparison on the Why Wherehouse page: Wherehouse against the tools a small business usually looks at,
// and against doing it by hand.
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

import { PLANS, SETUP_FEE } from '../domain/plans';
import { PRICING } from './prices';

export const COMPARE_CHECKED = 'September 2026';

export type CompareId = 'wherehouse' | 'sortly' | 'inflow' | 'zoho' | 'fishbowl' | 'hand';
/** yes: does it well; part: partly, or only on a higher plan; no: doesn't; undefined: just the text. */
export type Mark = 'yes' | 'part' | 'no';
export interface CompareCell {
  mark?: Mark;
  text: string;
}
export interface CompareColumn {
  id: CompareId;
  name: string;
  plan: string;
}
export interface CompareRow {
  label: string;
  cells: Record<CompareId, CompareCell>;
}
export interface CompareGroup {
  title: string;
  rows: CompareRow[];
}

const starter = PLANS[0];
const biggest = PLANS[PLANS.length - 1];

export const COMPARE_COLUMNS: CompareColumn[] = [
  { id: 'wherehouse', name: 'Wherehouse', plan: `${starter.name} plan` },
  { id: 'sortly', name: 'Sortly', plan: 'Advanced plan' },
  { id: 'inflow', name: 'inFlow', plan: 'Lite plan' },
  { id: 'zoho', name: 'Zoho Inventory', plan: 'Standard plan' },
  { id: 'fishbowl', name: 'Fishbowl', plan: 'Essentials plan' },
  { id: 'hand', name: 'By hand', plan: 'Paper, whiteboard, spreadsheet' },
];

export const COMPARE_GROUPS: CompareGroup[] = [
  {
    title: 'Price',
    rows: [
      {
        label: 'Starting price',
        cells: {
          wherehouse: { mark: 'yes', text: `$${starter.monthly}/mo per warehouse` },
          sortly: { text: '$49/mo, or $24/mo billed yearly for the first year' },
          inflow: { text: '$129/mo, or $99/mo billed yearly' },
          zoho: { text: '$29/mo billed yearly' },
          fishbowl: { text: '$229/mo billed yearly' },
          hand: { text: '$0, plus the time spent looking' },
        },
      },
      {
        label: 'People included',
        cells: {
          wherehouse: { mark: 'yes', text: `${starter.people} (up to ${biggest.people} on ${biggest.name}, $${biggest.monthly})` },
          sortly: { text: '2' },
          inflow: { text: '2' },
          zoho: { text: '2' },
          fishbowl: { text: '2' },
          hand: { text: 'Anyone who can find the sheet' },
        },
      },
      {
        label: 'Setup fee',
        cells: {
          wherehouse: { mark: 'yes', text: `None. Optional on-site setup near Charleston, $${SETUP_FEE.small}–$${SETUP_FEE.large}` },
          sortly: { mark: 'yes', text: 'None listed' },
          inflow: { mark: 'part', text: 'Optional on Lite; $499 required on Core' },
          zoho: { mark: 'yes', text: 'None listed' },
          fishbowl: { mark: 'no', text: 'Implementation package required; quoted' },
          hand: { mark: 'yes', text: 'None' },
        },
      },
      {
        label: 'Free trial',
        cells: {
          wherehouse: { mark: 'yes', text: `${PRICING.pilotDays} days, no card` },
          sortly: { mark: 'part', text: '14 days, card required' },
          inflow: { mark: 'yes', text: '14 days' },
          zoho: { mark: 'yes', text: '14 days, plus a free plan' },
          fishbowl: { mark: 'no', text: 'Demo on request' },
          hand: { text: 'Nothing to try' },
        },
      },
    ],
  },
  {
    title: 'Where is it, and who moved it?',
    rows: [
      {
        label: 'Tracks the exact spot',
        cells: {
          wherehouse: { mark: 'yes', text: 'Every item is in one named spot: rack, shelf or bin' },
          sortly: { mark: 'part', text: 'Folders you set up as places' },
          inflow: { mark: 'part', text: 'No sublocations on Lite; from Core ($379)' },
          zoho: { mark: 'part', text: 'Bins from Premium ($129)' },
          fishbowl: { mark: 'yes', text: 'Unlimited sub-locations' },
          hand: { mark: 'part', text: 'If someone keeps it current' },
        },
      },
      {
        label: 'Move history: who, when, from and to',
        cells: {
          wherehouse: { mark: 'yes', text: 'Every move, never edited or deleted' },
          sortly: { mark: 'part', text: 'Activity history kept 1 year on Advanced' },
          inflow: { mark: 'part', text: 'Movement history per product' },
          zoho: { mark: 'part', text: 'Activity log by user, in reports' },
          fishbowl: { mark: 'part', text: 'Audit trails listed on the plan' },
          hand: { mark: 'no', text: 'Only if someone writes it down' },
        },
      },
      {
        label: 'Print QR or barcode labels',
        cells: {
          wherehouse: { mark: 'yes', text: 'From the browser, on an office or label printer' },
          sortly: { mark: 'yes', text: 'Unlimited QR labels' },
          inflow: { mark: 'yes', text: 'Barcode labels' },
          zoho: { mark: 'part', text: 'Barcode generation from Premium' },
          fishbowl: { mark: 'yes', text: 'Barcode printing' },
          hand: { mark: 'no', text: 'Handwritten' },
        },
      },
      {
        label: 'Scan with a phone, no extra hardware',
        cells: {
          wherehouse: { mark: 'yes', text: 'Phone camera in the browser; no app to install' },
          sortly: { mark: 'yes', text: 'Sortly app' },
          inflow: { mark: 'yes', text: 'iPhone and Android apps' },
          zoho: { mark: 'yes', text: 'Mobile app' },
          fishbowl: { mark: 'yes', text: 'Mobile barcode scanning' },
          hand: { mark: 'no', text: 'No' },
        },
      },
      {
        label: 'Record moves with no signal',
        cells: {
          wherehouse: { mark: 'part', text: 'Moves of items already opened on that phone; syncs when back online' },
          sortly: { mark: 'yes', text: 'Offline mobile access' },
          inflow: { text: 'Not listed' },
          zoho: { text: 'Not listed' },
          fishbowl: { text: 'Not listed' },
          hand: { mark: 'yes', text: 'Paper works anywhere' },
        },
      },
    ],
  },
  {
    title: 'Simplicity',
    rows: [
      {
        label: 'Built for',
        cells: {
          wherehouse: { text: 'Finding items and who moved them' },
          sortly: { text: 'Simple item and stock tracking' },
          inflow: { text: 'Inventory, sales and purchasing' },
          zoho: { text: 'Inventory and orders' },
          fishbowl: { text: 'Inventory, warehouse and manufacturing' },
          hand: { text: 'Whatever you make it' },
        },
      },
      {
        label: 'What your crew learns',
        cells: {
          wherehouse: { mark: 'yes', text: 'One screen: Find, Move, Add' },
          sortly: { text: 'Self-serve app' },
          inflow: { text: 'Self-serve on Lite' },
          zoho: { text: 'Self-serve app' },
          fishbowl: { mark: 'no', text: '6 to 8 week training during implementation' },
          hand: { mark: 'yes', text: 'Nothing new' },
        },
      },
    ],
  },
  {
    title: 'Support',
    rows: [
      {
        label: 'Local, small-business support',
        cells: {
          wherehouse: { mark: 'yes', text: 'The founder sets you up in person near Charleston and answers support himself' },
          sortly: { mark: 'no', text: 'Larger software company' },
          inflow: { mark: 'no', text: 'Larger software company' },
          zoho: { mark: 'no', text: 'Larger software company' },
          fishbowl: { mark: 'no', text: 'Larger software company' },
          hand: { text: 'It’s all on you' },
        },
      },
    ],
  },
  {
    title: 'Where others are stronger',
    rows: [
      {
        label: 'Counts units and stock levels',
        cells: {
          wherehouse: { mark: 'no', text: 'Tracks each item or pallet, not the count inside' },
          sortly: { mark: 'yes', text: 'Quantities and low-stock alerts' },
          inflow: { mark: 'yes', text: 'Stock levels' },
          zoho: { mark: 'yes', text: 'Stock levels' },
          fishbowl: { mark: 'yes', text: 'Stock levels' },
          hand: { mark: 'part', text: 'Manual counts' },
        },
      },
      {
        label: 'Purchase and sales orders',
        cells: {
          wherehouse: { mark: 'no', text: 'Keep the system you use now' },
          sortly: { mark: 'part', text: 'Purchase orders from Ultra ($149)' },
          inflow: { mark: 'yes', text: 'Sales and purchases included' },
          zoho: { mark: 'yes', text: 'Purchase orders' },
          fishbowl: { mark: 'part', text: 'Sales orders from Growth ($429)' },
          hand: { mark: 'no', text: 'Separate paperwork' },
        },
      },
      {
        label: 'Accounting integration',
        cells: {
          wherehouse: { mark: 'no', text: 'None' },
          sortly: { mark: 'part', text: 'QuickBooks Online from Premium ($299)' },
          inflow: { mark: 'yes', text: 'QuickBooks Online and Xero' },
          zoho: { mark: 'yes', text: 'QuickBooks Online, Xero, Zoho Books' },
          fishbowl: { mark: 'yes', text: 'QuickBooks Online and Xero' },
          hand: { mark: 'no', text: 'Retype it' },
        },
      },
    ],
  },
];
