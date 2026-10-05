// The sample warehouse, tailored to each kind of business on the website ("Wherehouse for ___", site/for/groups.ts).
// seedSample (seed.ts) builds every sample from the same plan: six records with a story (one waiting for a spot, one on
// hold, one dispatched), stock that four orders are picked from, two products running low, lots with expiry dates, a
// count to do and one to review, moves to do, an incoming delivery list and a second warehouse to transfer from.
// A profile only fills that plan with names that make sense for the business. All companies and people are invented.

import type { GroupId } from '../site/for/groups';
import type { WarehouseSetup } from '../domain/types';

export type IndustryId = GroupId;

export interface SampleProduct {
  code: string;
  description: string;
}

export interface SampleOrder {
  ref: string;
  customer: string;
  /** Where a delivered order goes; pickups leave it empty. */
  address: string;
}

export interface IndustrySample {
  id: IndustryId;
  /** The picker's card title. */
  title: string;
  /** Reads after "Try the sample warehouse for your": "lumberyard". */
  your: string;
  /** One line on the picker's card: what this sample is full of. */
  blurb: string;
  /** The main warehouse: the account's name and the building's name. */
  workspace: string;
  facility: string;
  /** The second warehouse, for transfers. */
  overflow: string;
  /** What the business calls what it tracks and what it groups work by. */
  setup: Omit<WarehouseSetup, 'jobs_on'>;
  /** Display names for the owner, manager, employee and viewer accounts. */
  people: [string, string, string, string];
  /** Zone prefixes for spot codes: the main racks (A), the zone counted every week (B), and the second warehouse (C). */
  zones: [string, string, string];
  receiving: string;
  staging: [string, string];
  quarantine: string;
  /** Two jobs (or events, work orders, customers): code, name, where it goes. */
  jobs: [[string, string, string], [string, string, string]];
  /** Six records: 1 is moved, 2 waits for a spot, 5 goes on hold, 6 is dispatched to the second job. */
  stock: [string, string, string, string, string, string];
  hold: string;
  /** Three records in the second warehouse. */
  overflowStock: [string, string, string];
  /** Order stock: 1 on A-02-01; 2 has enough (minimum 2); 3 and 5 share a spot; 4 can stand in for 3. */
  products: [SampleProduct, SampleProduct, SampleProduct, SampleProduct, SampleProduct];
  /** The unit each order record is counted in. */
  unit: string;
  /** Delivered today, picked up today, delivered tomorrow, picked up tomorrow. */
  orders: [SampleOrder, SampleOrder, SampleOrder, SampleOrder];
  /** What packed orders go out in. */
  boxes: [string, string, string, string];
  /** Running low: one record of ten, three used; and two records of twenty with two more in the second warehouse. */
  low: [SampleProduct & { unit: string; used: string }, SampleProduct & { unit: string }];
  /** The product tracked by lot and expiry date. */
  lot: SampleProduct & { unit: string };
  /** An expected delivery, not yet stock. */
  incoming: { name: string; rows: { description: string; quantity: string; unit: string; job?: boolean }[] };
}

const spot = (zone: string, aisle: number, bay: number) => `${zone}-${String(aisle).padStart(2, '0')}-${String(bay).padStart(2, '0')}`;

export const INDUSTRIES: IndustrySample[] = [
  {
    id: 'warehouses',
    title: 'Warehouse or distributor',
    your: 'distribution center',
    blurb: 'Case and pallet orders for stores and distribution centers.',
    workspace: 'Sample warehouse',
    facility: 'Main yard',
    overflow: 'Overflow yard',
    setup: { preset: 'pallets', thing: 'Pallet', things: 'Pallets', job: 'Job', jobs: 'Jobs' },
    people: ['Demo Owner', 'Demo Manager', 'Demo Operator', 'Demo Viewer'],
    zones: ['A', 'B', 'C'],
    receiving: 'RECEIVING-01',
    staging: ['STAGING-01', 'STAGING-02'],
    quarantine: 'QUARANTINE-01',
    jobs: [
      ['ACCT-HF', 'Harbor Foods account', 'Harbor Foods DC, dock 3'],
      ['ACCT-VH', 'Valley Home Goods account', 'Valley Home Goods, store 114'],
    ],
    stock: ['Bottled water, 84 cases', 'Canned tomatoes, 120 cases', 'Paper plates, 60 cases', 'Laundry detergent, 40 cases', 'Breakfast cereal, mixed pallet', 'Dry dog food, 50 bags'],
    hold: 'Crushed corner. Waiting for a damage check.',
    overflowStock: ['Patio chairs, mixed pallet', 'Holiday decor, 30 cases', 'Store displays, 12 units'],
    products: [
      { code: 'PT-12', description: 'Paper towels, case of 12 rolls' },
      { code: 'TT-48', description: 'Bath tissue, case of 48 rolls' },
      { code: 'DS-16', description: 'Dish soap 16 oz, case of 12' },
      { code: 'DS-24', description: 'Dish soap 24 oz, case of 9' },
      { code: 'TB-13', description: 'Kitchen trash bags, case of 6 boxes' },
    ],
    unit: 'cases',
    orders: [
      { ref: 'SO-1041', customer: 'Corner Market, store 12', address: '1450 Main Street, Riverside' },
      { ref: 'SO-1042', customer: 'Northgate Grocery', address: '' },
      { ref: 'SO-1043', customer: 'Midstate Foods distribution center', address: 'Midstate Foods DC, dock 7, 900 Commerce Drive' },
      { ref: 'SO-1044', customer: 'Hillside Pharmacy', address: '' },
    ],
    boxes: ['Mixed pallet', 'Full pallet', 'Master carton', 'Tote'],
    low: [
      { code: 'SW-18', description: 'Stretch wrap 18 in, case of 4 rolls', unit: 'cases', used: 'Used to wrap outbound pallets.' },
      { code: 'LBL-46', description: 'Shipping labels 4x6, carton of 4 rolls', unit: 'cartons' },
    ],
    lot: { code: 'GB-24', description: 'Granola bars, case of 24', unit: 'cases' },
    incoming: {
      name: 'Midstate Foods delivery list',
      rows: [
        { description: 'Canned beans, 120 cases', quantity: '120', unit: 'cases', job: true },
        { description: 'Ground coffee, 60 cases', quantity: '60', unit: 'cases' },
      ],
    },
  },
  {
    id: 'lumberyards',
    title: 'Lumberyard or building supply',
    your: 'lumberyard',
    blurb: 'Bundles in the yard and loads staged for contractor job sites.',
    workspace: 'Sample lumberyard',
    facility: 'Main yard',
    overflow: 'North yard',
    setup: { preset: 'long', thing: 'Bundle', things: 'Bundles', job: 'Job', jobs: 'Jobs' },
    people: ['Demo Owner', 'Demo Yard Manager', 'Demo Yard Crew', 'Demo Sales Desk'],
    zones: ['SHED', 'YARD', 'LOT'],
    receiving: 'UNLOAD-01',
    staging: ['LOAD-01', 'LOAD-02'],
    quarantine: 'CULL-01',
    jobs: [
      ['RH-LOT14', 'Ridgeline Homes, lot 14', 'Lot 14, Cedar Ridge subdivision'],
      ['SB-MAPLE', 'Summit Builders, Maple Ave duplex', '22 Maple Avenue, side driveway'],
    ],
    stock: ['LVL beams 1.75 x 11.875, 6 pieces', 'Roof trusses, set of 12', 'Prehung exterior doors, 3 units', 'Vinyl windows, 8 units', 'Cedar siding, bundle of 30', 'Stair parts kit'],
    hold: 'Wrong siding profile delivered. Waiting on the mill.',
    overflowStock: ['Fence pickets, bundle of 100', 'Landscape timbers, bundle of 40', 'Cedar posts, bundle of 12'],
    products: [
      { code: '2X4-8', description: '2x4 x 8 ft studs, bundle of 50' },
      { code: 'OSB-716', description: '7/16 in OSB sheathing, bundle of 25' },
      { code: '2X10-16', description: '2x10 x 16 ft joists, bundle of 20' },
      { code: '2X10-14', description: '2x10 x 14 ft joists, bundle of 20' },
      { code: 'PT4X4-8', description: 'Treated 4x4 x 8 ft posts, bundle of 16' },
    ],
    unit: 'bundles',
    orders: [
      { ref: 'LY-5141', customer: 'Ridgeline Homes, lot 14 framing', address: 'Lot 14, Cedar Ridge subdivision' },
      { ref: 'LY-5142', customer: 'Kowalski Remodeling (will call)', address: '' },
      { ref: 'LY-5143', customer: 'Summit Builders, Maple Ave duplex', address: '22 Maple Avenue, side driveway' },
      { ref: 'LY-5144', customer: 'Brightline Decks (will call)', address: '' },
    ],
    boxes: ['Banded lift', 'Strapped bundle', 'Flatbed load', 'Will-call cart'],
    low: [
      { code: 'NAIL-16D', description: '16d framing nails, 50 lb box', unit: 'boxes', used: 'Sold at the contractor counter.' },
      { code: 'WRAP-9', description: 'House wrap, 9 x 150 ft roll', unit: 'rolls' },
    ],
    lot: { code: 'ADH-28', description: 'Construction adhesive, case of 24 tubes', unit: 'cases' },
    incoming: {
      name: 'Pacific Mill truck list',
      rows: [
        { description: 'Douglas fir 2x6 x 12 ft, bundle of 40', quantity: '4', unit: 'bundles', job: true },
        { description: 'Architectural shingles, pallet of 42 bundles', quantity: '1', unit: 'pallets' },
      ],
    },
  },
  {
    id: 'contractors',
    title: 'Contractor or trade shop',
    your: 'contractor shop',
    blurb: 'Job material in the shop and the yard, pulled for crews and trucks.',
    workspace: 'Sample contractor shop',
    facility: 'Main shop',
    overflow: 'Satellite yard',
    setup: { preset: 'custom', thing: 'Item', things: 'Items', job: 'Job', jobs: 'Jobs' },
    people: ['Demo Owner', 'Demo Shop Manager', 'Demo Crew Member', 'Demo Estimator'],
    zones: ['SHOP', 'YARD', 'SAT'],
    receiving: 'DROP-01',
    staging: ['TRUCK-01', 'TRUCK-02'],
    quarantine: 'DAMAGED-01',
    jobs: [
      ['J-214', 'Maple Street school renovation', 'Maple Street school, north loading door'],
      ['J-198', 'Riverside clinic fit-out', 'Riverside clinic, rear dock'],
    ],
    stock: ['Door hardware, 12 sets', 'Ceiling tile, 20 cartons', 'Lighting fixtures, 8 cartons', 'Copper pipe fittings', 'HVAC diffusers, 16 pieces', 'Fire extinguisher cabinets, 4 units'],
    hold: 'Crushed carton. Inspect before use.',
    overflowStock: ['Scaffold frames, 10 pieces', 'Concrete forms', 'Extension ladders, 3'],
    products: [
      { code: 'EMT-34', description: '3/4 in EMT conduit, bundle of 10' },
      { code: 'BOX-4SQ', description: '4 in square boxes, carton of 25' },
      { code: 'NM-12-250', description: '12/2 building wire, 250 ft roll' },
      { code: 'NM-12-100', description: '12/2 building wire, 100 ft roll' },
      { code: 'LED-6IN', description: '6 in LED recessed lights, case of 12' },
    ],
    unit: 'each',
    orders: [
      { ref: 'PL-301', customer: 'Maple Street school, crew 2', address: 'Maple Street school, north loading door' },
      { ref: 'PL-302', customer: 'Service van 4', address: '' },
      { ref: 'PL-303', customer: 'Riverside clinic, electrical crew', address: 'Riverside clinic, rear dock' },
      { ref: 'PL-304', customer: 'Service van 7', address: '' },
    ],
    boxes: ['Job box', 'Tote', 'Strapped bundle', 'Truck shelf'],
    low: [
      { code: 'SCR-DW', description: 'Drywall screws 1-5/8 in, 25 lb box', unit: 'boxes', used: 'Taken for the school job.' },
      { code: 'ANC-38', description: '3/8 in wedge anchors, box of 50', unit: 'boxes' },
    ],
    lot: { code: 'SIL-12', description: 'Silicone sealant, case of 12', unit: 'cases' },
    incoming: {
      name: 'Supplier delivery, Thursday',
      rows: [
        { description: 'Drywall 1/2 in, 4x12 sheets', quantity: '40', unit: 'sheets', job: true },
        { description: '10 in round duct, 20 pieces', quantity: '20', unit: 'pieces' },
      ],
    },
  },
  {
    id: 'parts',
    title: 'Auto, equipment or parts',
    your: 'parts room',
    blurb: 'Parts on shelves, picked for work orders and the front counter.',
    workspace: 'Sample parts room',
    facility: 'Main parts room',
    overflow: 'Service annex',
    setup: { preset: 'shelves', thing: 'Part', things: 'Parts', job: 'Work order', jobs: 'Work orders' },
    people: ['Demo Owner', 'Demo Parts Manager', 'Demo Parts Counter', 'Demo Service Advisor'],
    zones: ['SHELF', 'CAGE', 'ANNEX'],
    receiving: 'RECEIVING-01',
    staging: ['COUNTER-01', 'COUNTER-02'],
    quarantine: 'WARRANTY-01',
    jobs: [
      ['WO-7730', '2018 pickup, engine repair', 'Service bay 2'],
      ['WO-7736', 'Fleet van 12, brakes and tires', 'Service bay 6'],
    ],
    stock: ['Remanufactured transmission', 'Windshield, 2020 sedan', 'Tires 275/55R20, set of 4', 'Radiator assembly', 'Remanufactured alternator', 'Brake rotors, pair'],
    hold: 'Core charge in question. Waiting on the supplier.',
    overflowStock: ['Tires 225/65R17, set of 4', 'Snow chains, 2 pairs', 'Bumper cover, 2021 SUV'],
    products: [
      { code: 'PAD-F220', description: 'Front brake pads, set' },
      { code: 'FLT-AIR22', description: 'Engine air filter' },
      { code: 'WIPER-22', description: 'Wiper blade, 22 in' },
      { code: 'WIPER-24', description: 'Wiper blade, 24 in' },
      { code: 'BAT-H6', description: 'Battery, group H6' },
    ],
    unit: 'each',
    orders: [
      { ref: 'PO-5512', customer: 'Eastside Collision', address: '310 Industrial Way, Eastside' },
      { ref: 'WO-7741', customer: 'Service bay 3, tech pickup', address: '' },
      { ref: 'PO-5520', customer: 'Lakeview Fleet Services', address: 'Lakeview Fleet Services, 77 Depot Road' },
      { ref: 'WO-7752', customer: 'Service bay 5, tech pickup', address: '' },
    ],
    boxes: ['Parts bag', 'Small box', 'Large box', 'Bay cart'],
    low: [
      { code: 'OIL-5W30', description: '5W-30 motor oil, case of 6', unit: 'cases', used: 'Used for oil changes in the shop.' },
      { code: 'FLT-OIL51', description: 'Oil filters, case of 12', unit: 'cases' },
    ],
    lot: { code: 'BRKF-12', description: 'DOT 3 brake fluid, case of 12', unit: 'cases' },
    incoming: {
      name: 'Parts distributor delivery',
      rows: [
        { description: 'Front struts, pair', quantity: '2', unit: 'pairs', job: true },
        { description: 'Headlight assembly, left', quantity: '1', unit: 'each' },
      ],
    },
  },
  {
    id: 'retail',
    title: 'Stockroom or online store',
    your: 'stockroom',
    blurb: 'Back-room stock, online orders to ship and store pickups.',
    workspace: 'Sample stockroom',
    facility: 'Main store',
    overflow: 'Downtown store',
    setup: { preset: 'shelves', thing: 'Item', things: 'Items', job: 'Customer', jobs: 'Customers' },
    people: ['Demo Owner', 'Demo Store Manager', 'Demo Stock Associate', 'Demo Sales Floor'],
    zones: ['BACK', 'MEZZ', 'DT'],
    receiving: 'RECEIVING-01',
    staging: ['PACK-01', 'PACK-02'],
    quarantine: 'RETURNS-01',
    jobs: [
      ['SO-5521', 'Patel, sofa delivery', '18 Birch Lane'],
      ['SO-5530', 'Ortiz, dining set', 'Store pickup counter'],
    ],
    stock: ['Sectional sofa, 3 cartons', 'Recliner, gray', 'Dining table, oak', 'Dining chairs, set of 6', 'Bookshelf, walnut', 'Queen mattress'],
    hold: 'Damaged carton. Inspect before selling.',
    overflowStock: ['Patio chairs, set of 4', 'Area rug 8x10', 'Floor lamps, 6'],
    products: [
      { code: 'TEE-BLU-M', description: 'Logo tee, blue, medium' },
      { code: 'MUG-12', description: 'Ceramic mug, 12 oz' },
      { code: 'CAP-BLK', description: 'Baseball cap, black' },
      { code: 'CAP-NVY', description: 'Baseball cap, navy' },
      { code: 'TOTE-CNV', description: 'Canvas tote bag' },
    ],
    unit: 'each',
    orders: [
      { ref: 'WEB-1041', customer: 'Jordan Lee', address: '41 Elm Street, Springfield' },
      { ref: 'WEB-1042', customer: 'Maria Ortiz (store pickup)', address: '' },
      { ref: 'WEB-1043', customer: 'Sam Patel', address: '9 Harbor View Road, Bayside' },
      { ref: 'WEB-1044', customer: 'Ava Chen (store pickup)', address: '' },
    ],
    boxes: ['Mailer', 'Small box', 'Medium box', 'Gift box'],
    low: [
      { code: 'BAG-LG', description: 'Shopping bags, large, case of 250', unit: 'cases', used: 'Sent to the registers.' },
      { code: 'TISSUE-W', description: 'Gift tissue, pack of 100', unit: 'packs' },
    ],
    lot: { code: 'SPF-50', description: 'Sunscreen SPF 50, case of 24', unit: 'cases' },
    incoming: {
      name: 'Spring order from the vendor',
      rows: [
        { description: 'Spring tees, mixed sizes, 6 cartons', quantity: '6', unit: 'cartons' },
        { description: 'Bar stools, set of 2', quantity: '4', unit: 'sets', job: true },
      ],
    },
  },
  {
    id: 'rentals',
    title: 'Rental or event company',
    your: 'rental company',
    blurb: 'Gear pulled for events, sent out, and checked back in.',
    workspace: 'Sample rental warehouse',
    facility: 'Main warehouse',
    overflow: 'Tent barn',
    setup: { preset: 'equipment', thing: 'Item', things: 'Items', job: 'Event', jobs: 'Events' },
    people: ['Demo Owner', 'Demo Operations Manager', 'Demo Warehouse Crew', 'Demo Event Planner'],
    zones: ['BAY', 'SHELF', 'BARN'],
    receiving: 'CHECKIN-01',
    staging: ['PREP-01', 'PREP-02'],
    quarantine: 'REPAIR-01',
    jobs: [
      ['EV-3090', 'City jazz festival', 'Civic plaza, stage left'],
      ['EV-3101', 'Annual charity gala', 'Grand hotel, ballroom dock'],
    ],
    stock: ['Stage deck 4x8, 6 sections', 'Dance floor panels, 24', 'Uplights, case of 8', 'Speaker system, pair', 'Tent sidewalls 20 ft, 4', 'Bistro string lights, 10 strands'],
    hold: 'Tear in one panel. Repair before the next event.',
    overflowStock: ['Frame tent 40x60', 'Pipe and drape kit', 'Generator, 7500 W'],
    products: [
      { code: 'CHR-WF10', description: 'White folding chairs, stack of 10' },
      { code: 'TBL-6FT', description: 'Banquet table, 6 ft' },
      { code: 'LIN-90R-W', description: 'Round linen 90 in, white' },
      { code: 'LIN-90R-I', description: 'Round linen 90 in, ivory' },
      { code: 'CHAF-8', description: 'Chafing dish set, 8 qt' },
    ],
    unit: 'each',
    orders: [
      { ref: 'EV-3108', customer: 'Riverside Gardens wedding', address: 'Riverside Gardens, 22 Mill Road' },
      { ref: 'EV-3110', customer: 'Lincoln PTA fun fair (customer pickup)', address: '' },
      { ref: 'EV-3112', customer: 'Harbor Tech holiday party', address: 'Harbor Tech, 400 Bay Street' },
      { ref: 'EV-3115', customer: 'Garcia graduation party (customer pickup)', address: '' },
    ],
    boxes: ['Road case', 'Linen bin', 'Chair cart', 'Table cart'],
    low: [
      { code: 'TAPE-GAF', description: 'Gaffer tape, case of 24', unit: 'cases', used: 'Sent out with the festival crew.' },
      { code: 'ZIP-100', description: 'Cable ties, bag of 100', unit: 'bags' },
    ],
    lot: { code: 'FUEL-72', description: 'Chafing fuel cans, case of 72', unit: 'cases' },
    incoming: {
      name: 'New inventory from the supplier',
      rows: [
        { description: 'Cocktail tables 30 in, 10 pieces', quantity: '10', unit: 'each', job: true },
        { description: 'Black napkins, box of 500', quantity: '4', unit: 'boxes' },
      ],
    },
  },
  {
    id: 'manufacturing',
    title: 'Manufacturer or shop',
    your: 'manufacturing shop',
    blurb: 'Raw material, work in progress and finished goods to ship.',
    workspace: 'Sample plant',
    facility: 'Plant 1',
    overflow: 'Plant 2',
    setup: { preset: 'custom', thing: 'Pallet', things: 'Pallets', job: 'Job', jobs: 'Jobs' },
    people: ['Demo Owner', 'Demo Plant Manager', 'Demo Material Handler', 'Demo Production Planner'],
    zones: ['RAW', 'FG', 'PLT'],
    receiving: 'RECEIVING-01',
    staging: ['SHIP-01', 'SHIP-02'],
    quarantine: 'QC-HOLD-01',
    jobs: [
      ['JOB-4410', 'Custom racks, Hillside Foods', 'Hillside Foods, dock 2'],
      ['JOB-4415', 'Display fixtures, Valley Outdoor', 'Valley Outdoor, receiving door'],
    ],
    stock: ['Cold-rolled steel sheet, 16 gauge', 'Aluminum bar stock', 'Welded rack frames, in progress', 'Powder coat, gloss black, 10 boxes', 'Fastener kits, 200', 'Finished rack uprights, 24'],
    hold: 'Failed thread check. Waiting on quality control.',
    overflowStock: ['Square steel tube 2 in', 'Spare press dies', 'Corrugated packaging'],
    products: [
      { code: 'BRK-200', description: 'Shelf brackets, carton of 50' },
      { code: 'PNL-48', description: 'Powder-coated panels 48 in, carton of 10' },
      { code: 'HNG-3-BLK', description: 'Heavy hinges, black, carton of 24' },
      { code: 'HNG-3-ZN', description: 'Heavy hinges, zinc, carton of 24' },
      { code: 'CST-4', description: 'Casters 4 in, carton of 16' },
    ],
    unit: 'cartons',
    orders: [
      { ref: 'PO-88120', customer: 'Midwest Industrial Supply', address: 'Midwest Industrial Supply, 1200 Rail Street' },
      { ref: 'PO-88124', customer: 'Ace Fabrication (will call)', address: '' },
      { ref: 'PO-88131', customer: 'Northern distribution center', address: 'Northern DC, door 14, 55 Freight Road' },
      { ref: 'PO-88135', customer: 'Lakeshore Cabinet Co. (will call)', address: '' },
    ],
    boxes: ['Carton', 'Skid', 'Crate', 'Mixed pallet'],
    low: [
      { code: 'SAND-120', description: 'Sanding discs 120 grit, box of 100', unit: 'boxes', used: 'Issued to the finishing line.' },
      { code: 'GLV-NIT', description: 'Nitrile gloves, box of 100', unit: 'boxes' },
    ],
    lot: { code: 'EPX-1G', description: 'Two-part epoxy 1 gal kits, case of 4', unit: 'cases' },
    incoming: {
      name: 'Steel service center delivery',
      rows: [
        { description: 'Hot-rolled steel coil', quantity: '2', unit: 'coils', job: true },
        { description: 'Shipping boxes 24x18x12', quantity: '500', unit: 'each' },
      ],
    },
  },
  {
    id: 'facilities',
    title: 'School, church or facility',
    your: 'school or facility',
    blurb: 'Tables, chairs and supplies sent out for events and rooms.',
    workspace: 'Sample campus',
    facility: 'Main building',
    overflow: 'Annex building',
    setup: { preset: 'equipment', thing: 'Item', things: 'Items', job: 'Event', jobs: 'Events' },
    people: ['Demo Owner', 'Demo Facilities Director', 'Demo Custodian', 'Demo Office Staff'],
    zones: ['STORE', 'SHED', 'ANNEX'],
    receiving: 'RECEIVING-01',
    staging: ['CART-01', 'CART-02'],
    quarantine: 'REPAIR-01',
    jobs: [
      ['EV-SPRING', 'Spring concert', 'Main building, gym stage door'],
      ['EV-FAIR', 'Fall fair', 'East field, shed 2'],
    ],
    stock: ['Choir risers, 3 sections', 'Folding stage, 6 panels', 'Hymnals, 4 cartons', 'Classroom desks, 12', 'Lab stools, 10', 'Holiday decorations, 6 bins'],
    hold: 'Two broken legs. Waiting on repair.',
    overflowStock: ['Outdoor tables, 6', 'Pop-up tents 10x10, 4', 'Holiday lights, 8 bins'],
    products: [
      { code: 'CHR-STK8', description: 'Stacking chairs, stack of 8' },
      { code: 'TBL-8FT', description: 'Folding table, 8 ft' },
      { code: 'MIC-WL', description: 'Wireless microphone kit' },
      { code: 'MIC-WD', description: 'Wired microphone kit' },
      { code: 'PA-SPK', description: 'Portable PA speaker' },
    ],
    unit: 'each',
    orders: [
      { ref: 'REQ-118', customer: 'Gym, spring concert setup', address: 'Main building, gym' },
      { ref: 'REQ-119', customer: 'Room 204, parent night (pickup)', address: '' },
      { ref: 'REQ-121', customer: 'Fellowship hall, Sunday dinner', address: 'Fellowship hall, kitchen door' },
      { ref: 'REQ-122', customer: 'Library, author visit (pickup)', address: '' },
    ],
    boxes: ['Rolling cart', 'Supply bin', 'Hand truck', 'Box'],
    low: [
      { code: 'TP-96', description: 'Toilet paper, case of 96', unit: 'cases', used: 'Restocked the restrooms.' },
      { code: 'LINER-55', description: 'Trash liners 55 gal, case of 100', unit: 'cases' },
    ],
    lot: { code: 'SAN-500', description: 'Hand sanitizer, case of 12', unit: 'cases' },
    incoming: {
      name: 'District supply delivery',
      rows: [
        { description: 'Copy paper, 10 cases', quantity: '10', unit: 'cases' },
        { description: 'Folding chairs, 50', quantity: '50', unit: 'each', job: true },
      ],
    },
  },
];

export const DEFAULT_INDUSTRY: IndustryId = 'warehouses';

export function isIndustry(id: unknown): id is IndustryId {
  return typeof id === 'string' && INDUSTRIES.some((i) => i.id === id);
}

export function industry(id: string | null | undefined): IndustrySample {
  return INDUSTRIES.find((i) => i.id === id) ?? INDUSTRIES[0];
}

/** Spot codes for a sample: racks in zones A, B and C, plus its named areas. */
export function sampleSpots(s: IndustrySample) {
  const [a, b, c] = s.zones;
  return {
    a11: spot(a, 1, 1),
    a12: spot(a, 1, 2),
    a21: spot(a, 2, 1),
    a22: spot(a, 2, 2),
    b11: spot(b, 1, 1),
    b21: spot(b, 2, 1),
    b22: spot(b, 2, 2),
    c11: spot(c, 1, 1),
    c12: spot(c, 1, 2),
  };
}

/** The ?kind= on a sample link, if it names a business. */
export function industryFromSearch(search: string): IndustryId | null {
  try {
    const kind = new URLSearchParams(search).get('kind');
    return isIndustry(kind) ? kind : null;
  } catch {
    return null;
  }
}
