// "Wherehouse for ___": the main kinds of business. The home page cards, the overview at #for, the fit page's
// links and the page titles use this list; each page's content is in groupPages.ts, which loads with the page,
// so the home page stays small. A new group is one entry here and one in groupPages.ts.
//
// Grouped from the business types on the fit page (fit/businesses.ts).

import type { IconName } from '../../ui/icons';

export type GroupId = 'warehouses' | 'lumberyards' | 'contractors' | 'parts' | 'retail' | 'rentals' | 'manufacturing' | 'facilities';

export interface GroupSummary {
  /** The address: #for/<id>. */
  id: GroupId;
  /** Reads after "Wherehouse for": "lumberyards and building supply". */
  name: string;
  icon: IconName;
  /** One line on the home page card: the problem, in their words. */
  pain: string;
  /** The fit page's business ids (fit/businesses.ts) that belong here, so each links to this page. */
  fit: string[];
}

export const GROUPS: GroupSummary[] = [
  {
    id: 'warehouses',
    name: 'warehouses and distributors',
    icon: 'building',
    pain: 'Pallets get put away, and only the person who did it knows where.',
    fit: ['warehouse', '3pl', 'distributor', 'cold', 'freight', 'beverage', 'moving', 'records'],
  },
  {
    id: 'lumberyards',
    name: 'lumberyards and building supply',
    icon: 'layers',
    pain: 'Bundles in the yard and orders set aside, and nobody is sure which is which.',
    fit: ['lumber', 'steel', 'electrical', 'flooring', 'countertop', 'pool'],
  },
  {
    id: 'contractors',
    name: 'contractors and trades',
    icon: 'hardhat',
    pain: 'Job material scattered across the shop, the yard and three trucks.',
    fit: ['contractor', 'hvac', 'roofing', 'landscaping', 'solar', 'utility'],
  },
  {
    id: 'parts',
    name: 'auto, equipment and parts',
    icon: 'truck',
    pain: 'The part came in last week. Now it is somewhere on a shelf.',
    fit: ['tire', 'autoparts', 'dealership', 'powersports', 'fleet', 'towing', 'salvage', 'boat', 'aviation'],
  },
  {
    id: 'retail',
    name: 'stockrooms and online stores',
    icon: 'box',
    pain: 'The extra stock is in the back. Finding it takes longer than selling it.',
    fit: ['furniture', 'appliance', 'hardware', 'bike', 'sporting', 'music', 'pawn', 'thrift', 'bookstore', 'retail', 'ecommerce'],
  },
  {
    id: 'rentals',
    name: 'rental and event companies',
    icon: 'calendar',
    pain: 'Gear goes out, comes back, and lands wherever there is room.',
    fit: ['equipment', 'events', 'party', 'theater', 'studio', 'touring', 'tradeshow', 'venue'],
  },
  {
    id: 'manufacturing',
    name: 'manufacturers and shops',
    icon: 'settings',
    pain: 'Raw material, work in progress and finished goods all share one floor.',
    fit: ['manufacturer', 'print', 'brewery', 'woodworking', 'sign'],
  },
  {
    id: 'facilities',
    name: 'schools, churches and facilities',
    icon: 'people',
    pain: 'Tables, chairs and supplies spread across closets, buildings and sheds.',
    fit: ['school', 'church', 'library', 'parks', 'city', 'fire', 'foodbank', 'shelter', 'league', 'relief'],
  },
];

export const groupById = (id: string | undefined) => GROUPS.find((g) => g.id === id);

/** The group a business on the fit page belongs to, if any. */
export const groupForBusiness = (businessId: string) => GROUPS.find((g) => g.fit.includes(businessId));

/** "Wherehouse for lumberyards and building supply" */
export const groupTitle = (g: GroupSummary) => `Wherehouse for ${g.name}`;

/** The link to a group's page, or to the overview without an id. */
export const groupHref = (id?: string) => (id ? `#for/${id}` : '#for');
