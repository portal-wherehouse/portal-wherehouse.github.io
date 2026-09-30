// "Does it work for my business?": honest answers for the kinds of places people ask about. Each says what
// they would track, where it lives, the word the app would use, and what Wherehouse will not do for them.

import type { IconName } from '../../ui/icons';

export type Fit = 'great' | 'good' | 'partial';
export type Category = 'warehouse' | 'trades' | 'retail' | 'auto' | 'community' | 'events' | 'other';

export interface Business {
  id: string;
  name: string;
  also: string[];
  cat: Category;
  icon: IconName;
  fit: Fit;
  thing: string;
  spot: string;
  code: string;
  track: string;
  limit?: string;
}

export const CATEGORIES: { id: Category; label: string; icon: IconName }[] = [
  { id: 'warehouse', label: 'Warehouses & distribution', icon: 'building' },
  { id: 'trades', label: 'Trades & building supply', icon: 'hardhat' },
  { id: 'retail', label: 'Stores & back rooms', icon: 'box' },
  { id: 'auto', label: 'Auto, marine & equipment', icon: 'truck' },
  { id: 'community', label: 'Schools, churches & nonprofits', icon: 'people' },
  { id: 'events', label: 'Events & rentals', icon: 'calendar' },
  { id: 'other', label: 'Everything else', icon: 'sparkle' },
];

export const FIT_LABEL: Record<Fit, string> = { great: 'Great fit', good: 'Good fit', partial: 'Works, with limits' };

export const BUSINESSES: Business[] = [
  { id: 'warehouse', name: 'Small warehouse', also: ['warehousing', 'storage', '3pl', 'logistics'], cat: 'warehouse', icon: 'building', fit: 'great', thing: 'Pallet', spot: 'Rack levels and floor lanes', code: 'A-03-02', track: 'Every pallet, the rack level it sits on, and who moved it last.' },
  { id: 'distributor', name: 'Distributor', also: ['wholesale', 'wholesaler', 'supplier'], cat: 'warehouse', icon: 'truck', fit: 'great', thing: 'Pallet', spot: 'Racks and staging lanes', code: 'B-12-04', track: 'Incoming loads from a supplier list, where each went, and what left for which customer.' },
  { id: 'moving', name: 'Moving and storage company', also: ['movers', 'moving company', 'self storage', 'vaults'], cat: 'warehouse', icon: 'truck', fit: 'great', thing: 'Crate', spot: 'Vault rows', code: 'V-07', track: 'Each customer’s crates or vaults, grouped by customer, with photos at pickup.' },
  { id: 'records', name: 'Records storage', also: ['document storage', 'file storage', 'archive', 'archives'], cat: 'warehouse', icon: 'archive', fit: 'great', thing: 'Box', spot: 'Shelf bays', code: 'R-04-06-3', track: 'Every box with what’s inside, the shelf it’s on, and every time it was pulled.' },
  { id: 'lumber', name: 'Lumber yard', also: ['lumber', 'building supply', 'sawmill', 'timber'], cat: 'trades', icon: 'layers', fit: 'great', thing: 'Bundle', spot: 'Cantilever arms and yard rows', code: 'Y-02-3', track: 'Bundles and units on racks and in the yard, set aside for each contractor’s order.' },
  { id: 'contractor', name: 'General contractor', also: ['construction', 'builder', 'builders', 'remodeling'], cat: 'trades', icon: 'hardhat', fit: 'great', thing: 'Pallet', spot: 'Yard and shop racks', code: 'SHOP-01', track: 'Materials staged for each project, so the crew loads the right things for the right job.' },
  { id: 'electrical', name: 'Electrical or plumbing supply', also: ['electrical', 'plumbing', 'hvac', 'mechanical', 'electrician', 'plumber'], cat: 'trades', icon: 'bolt', fit: 'good', thing: 'Item', spot: 'Shelves and bins', code: 'C-05-2', track: 'Wire reels, fixtures and bulk parts by shelf or bin, and orders held for pickup.', limit: 'Counts how many boxes or reels, not how many feet or pieces are left in each.' },
  { id: 'steel', name: 'Steel or pipe supplier', also: ['steel', 'pipe', 'metal', 'metals', 'fabrication'], cat: 'trades', icon: 'layers', fit: 'great', thing: 'Bundle', spot: 'Long-goods racks', code: 'L-03-2', track: 'Bundles of pipe and stock on long racks, with weight limits per rack arm.' },
  { id: 'furniture', name: 'Furniture store', also: ['furniture', 'mattress', 'mattresses', 'home goods'], cat: 'retail', icon: 'box', fit: 'great', thing: 'Item', spot: 'Back-room bays', code: 'W-02-1', track: 'Each sofa, table or mattress in the back room, and which ones are sold and waiting for delivery.' },
  { id: 'appliance', name: 'Appliance store', also: ['appliances', 'appliance'], cat: 'retail', icon: 'box', fit: 'great', thing: 'Item', spot: 'Warehouse bays', code: 'B-06', track: 'Each fridge, washer or range by serial number, where it sits, and which customer it belongs to.' },
  { id: 'thrift', name: 'Thrift or consignment store', also: ['thrift', 'consignment', 'resale', 'donation center', 'second hand'], cat: 'retail', icon: 'star', fit: 'good', thing: 'Box', spot: 'Back-room shelves', code: 'S-03-4', track: 'Sorted donation boxes with what’s inside, and which shelf they’re waiting on.', limit: 'Tracks boxes and big pieces, not every single shirt on the sales floor.' },
  { id: 'retail', name: 'Retail back room', also: ['store', 'shop', 'boutique', 'stockroom', 'retail'], cat: 'retail', icon: 'box', fit: 'good', thing: 'Box', spot: 'Stockroom shelves', code: 'BR-02-3', track: 'Overstock boxes and what’s in them, so anyone can find the extra sizes fast.', limit: 'Sits beside your register or POS; it doesn’t ring sales or count units sold.' },
  { id: 'ecommerce', name: 'Online store', also: ['ecommerce', 'e-commerce', 'shopify', 'amazon seller', 'etsy'], cat: 'retail', icon: 'send', fit: 'partial', thing: 'Bin', spot: 'Shelves and bins', code: 'P-04-2', track: 'Which bin each product lives in, so packing is faster and new hires can find things.', limit: 'Doesn’t sync with your store or count units. Use it for where things are, and your store for how many.' },
  { id: 'tire', name: 'Tire shop', also: ['tires', 'tire storage', 'wheels'], cat: 'auto', icon: 'target', fit: 'great', thing: 'Set', spot: 'Tire racks', code: 'T-08-3', track: 'Seasonal tire sets stored for customers, grouped by customer, with photos.' },
  { id: 'autoparts', name: 'Auto repair or parts', also: ['auto', 'mechanic', 'body shop', 'collision', 'auto parts', 'dealership'], cat: 'auto', icon: 'settings', fit: 'good', thing: 'Part', spot: 'Parts shelves', code: 'P-02-4', track: 'Parts ordered for each repair and where they’re waiting until the car comes in.', limit: 'Works beside your shop software; it doesn’t write estimates or invoices.' },
  { id: 'boat', name: 'Boat or marine supply', also: ['marine', 'boat', 'boats', 'marina', 'boatyard'], cat: 'auto', icon: 'pin', fit: 'great', thing: 'Item', spot: 'Racks, shelves and yard', code: 'M-01-2', track: 'Engines, trailers, parts and stored gear, including what’s set aside for each boat.' },
  { id: 'equipment', name: 'Equipment rental', also: ['rental', 'rentals', 'tool rental', 'equipment'], cat: 'auto', icon: 'hardhat', fit: 'great', thing: 'Unit', spot: 'Yard rows and cages', code: 'YARD-04', track: 'Every unit, where it’s parked, and who has it out.' },
  { id: 'school', name: 'School or district', also: ['school', 'schools', 'district', 'university', 'college', 'campus'], cat: 'community', icon: 'people', fit: 'great', thing: 'Item', spot: 'Storage rooms and closets', code: 'GYM-02', track: 'Furniture, tech carts, sports gear and supplies across buildings and closets.' },
  { id: 'church', name: 'Church', also: ['church', 'ministry', 'worship', 'synagogue', 'mosque'], cat: 'community', icon: 'building', fit: 'great', thing: 'Box', spot: 'Closets and shelves', code: 'C-01-3', track: 'Holiday decorations, event supplies and outreach items, labeled by what’s inside.' },
  { id: 'foodbank', name: 'Food bank or pantry', also: ['food bank', 'pantry', 'charity', 'nonprofit', 'donations'], cat: 'community', icon: 'box', fit: 'partial', thing: 'Pallet', spot: 'Racks and floor', code: 'A-02-1', track: 'Donated pallets and where they sit, with photos and notes.', limit: 'Doesn’t track expiry dates or count cans. Use it for where things are.' },
  { id: 'theater', name: 'Theater or production company', also: ['theater', 'theatre', 'props', 'costumes', 'film', 'production'], cat: 'events', icon: 'star', fit: 'great', thing: 'Prop', spot: 'Shelves, racks and bins', code: 'PROPS-03-2', track: 'Props, costumes and set pieces, and which show they’re pulled for.' },
  { id: 'events', name: 'Event company', also: ['events', 'event', 'party rental', 'wedding', 'catering', 'staging', 'av'], cat: 'events', icon: 'calendar', fit: 'great', thing: 'Case', spot: 'Racks and cages', code: 'E-04-1', track: 'Road cases, décor and gear, packed for each event and checked back in.' },
  { id: 'museum', name: 'Museum or collection', also: ['museum', 'collection', 'gallery', 'art storage'], cat: 'events', icon: 'image', fit: 'good', thing: 'Piece', spot: 'Storage shelves and crates', code: 'ST-02-3', track: 'Where each piece or crate is stored, with photos and every move.', limit: 'Not a full collections-management system; no accession or loan paperwork.' },
  { id: 'farm', name: 'Farm or nursery', also: ['farm', 'nursery', 'garden center', 'agriculture', 'landscaping'], cat: 'other', icon: 'map', fit: 'good', thing: 'Pallet', spot: 'Barns, rows and yard', code: 'BARN-02', track: 'Pallets of feed, soil, seed and equipment across barns and yard rows.' },
  { id: 'lab', name: 'Lab or clinic storage', also: ['lab', 'laboratory', 'clinic', 'medical', 'hospital', 'dental'], cat: 'other', icon: 'shield', fit: 'partial', thing: 'Box', spot: 'Storage rooms', code: 'SR-01-2', track: 'Equipment and bulk supply boxes, and which room or shelf they’re in.', limit: 'Not for patient records, controlled substances or anything that needs lot and expiry tracking.' },
  { id: 'manufacturer', name: 'Small manufacturer', also: ['manufacturing', 'manufacturer', 'factory', 'machine shop', 'fabricator'], cat: 'other', icon: 'settings', fit: 'good', thing: 'Pallet', spot: 'Racks and work cells', code: 'WIP-03', track: 'Raw material and finished pallets, and where work in progress is waiting.', limit: 'Doesn’t plan production or count parts consumed.' },
  { id: 'restaurant', name: 'Restaurant', also: ['restaurant', 'bar', 'kitchen', 'cafe', 'coffee'], cat: 'other', icon: 'box', fit: 'partial', thing: 'Case', spot: 'Dry storage and walk-in', code: 'DRY-02', track: 'Where bulk cases and equipment are kept, especially across more than one storage room.', limit: 'Doesn’t count food, track expiry or order from suppliers. Most kitchens need a food inventory app instead.' },
];

/** The best match for whatever someone typed: a name, a synonym, or a close spelling. */
export function matchBusiness(query: string): Business | null {
  const q = query.trim().toLowerCase().replace(/[^a-z0-9 &-]/g, '');
  if (q.length < 2) return null;
  let best: { b: Business; score: number } | null = null;
  for (const b of BUSINESSES) {
    for (const term of [b.name.toLowerCase(), ...b.also]) {
      const score = term === q ? 100 : term.startsWith(q) ? 80 : term.includes(q) || q.includes(term) ? 60 : close(q, term) ? 40 : 0;
      if (score && (!best || score > best.score)) best = { b, score };
    }
  }
  return best?.b ?? null;
}

/** One typo allowed per four letters (a swapped pair counts as two). */
function close(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 2 || a.length < 4) return false;
  const max = Math.max(1, Math.floor(a.length / 4));
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length] <= max;
}
