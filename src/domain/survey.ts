// The setup survey. The first answer picks a kind of business, and every later question uses that business's
// words, product groups and storage. The answers become real numbers (zones, spots, labels, setup hours) that the
// recommendation, the plan and the setup wizard all use. Pure, so the website and the portal share it.

import { PRESETS, pluralize, type SetupPreset } from './terms';
import type { WarehouseSetup } from './types';

export type Place = keyof typeof PLACES;
export type People = 'solo' | 'small' | 'medium' | 'large';
export type Hold = 'none' | 'customer' | 'order' | 'project' | 'event' | 'other';
export type PrinterModel = 'thermal4' | 'thermal2' | 'office' | 'brotherWide' | 'brother' | 'dymoXL' | 'dymo' | 'handheld' | 'other';
export type Scanner = 'phone' | 'scanner' | 'both' | 'unsure';
export type Limit = 'weight' | 'count' | 'stack' | 'none';
/** How big one unit is. Decides how many share a spot, which label it gets and how long it takes to set up. */
export type Size = 'pallet' | 'bulky' | 'medium' | 'small' | 'long';
/** 'own': every unit gets its own label and spot. 'shared': units share a labeled bin, box or pallet with a contents list. */
export type Kept = 'own' | 'shared';
export type Tier = 0 | 1 | 2 | 3;

export interface GroupLayout {
  place: Place;
  /** Separate areas, like rack rows, rooms or sections of floor. Each becomes a storage zone. */
  areas: number;
  /** Rough quantity on hand, as one of the size's four ranges. */
  qty: Tier;
  kept: Kept;
}

export interface SurveyAnswers {
  profile: ProfileId | null;
  /** What one unit is called, when the profile is "something else". */
  word: string;
  /** Product groups the business carries, from its profile. */
  groups: string[];
  /** Roughly how much is on hand overall, from the plan survey; the setup survey starts each kind at this range. */
  size: Tier | null;
  layout: Record<string, GroupLayout>;
  limits: Limit[];
  people: People | null;
  hold: Hold | null;
  holdWord: string;
  hasPrinter: 'yes' | 'no' | null;
  printer: PrinterModel | null;
  scanner: Scanner | null;
  /** Cloud backup of photos and documents (an add-on), or paper records (included). */
  files: 'cloud' | 'paper' | null;
  /** For on-site setup: a tech can come out only within about an hour of Charleston. */
  zip: string;
}

export const BLANK_ANSWERS: SurveyAnswers = { profile: null, word: '', groups: [], size: null, layout: {}, limits: [], people: null, hold: null, holdWord: '', hasPrinter: null, printer: null, scanner: null, files: null, zip: '' };

export type Verdict = 'works' | 'maybe' | 'no' | 'none';

// Label widths checked against the makers' specs: our labels need a 4-inch-wide printer or a letter page.
export const PRINTERS: { id: PrinterModel; title: string; examples: string; verdict: Verdict; body: string; wide?: boolean }[] = [
  { id: 'thermal4', title: '4-inch thermal label printer', examples: 'Zebra ZD421, ZD621, GK420d, Rollo, MUNBYN, iDPRT', verdict: 'works', wide: true, body: 'Works. Print 4×6 labels straight from the browser on a computer. This is the fastest way to label a lot of items.' },
  { id: 'office', title: 'Regular office printer', examples: 'Any inkjet or laser that prints letter paper', verdict: 'works', body: 'Works. Print full-page labels on plain paper, or Avery 5160 sticker sheets (30 per page) for shelves and bins.' },
  { id: 'dymoXL', title: 'DYMO LabelWriter 4XL or 5XL', examples: 'The wide DYMO models', verdict: 'works', wide: true, body: 'Works. The 4XL and 5XL take 4×6 labels.' },
  { id: 'brotherWide', title: 'Brother QL-1100 or QL-1110NWB', examples: 'The wide Brother QL models', verdict: 'works', wide: true, body: 'Works. These take labels up to about 4 inches wide, so 4×6 labels fit.' },
  { id: 'dymo', title: 'DYMO LabelWriter 450 or 550', examples: 'The standard DYMO models', verdict: 'no', body: 'Too narrow. These top out near 2.3 inches, and our labels need 4 inches. Use an office printer, or the 5XL.' },
  { id: 'brother', title: 'Brother QL-800, QL-810W or QL-820NWB', examples: 'The standard Brother QL models', verdict: 'no', body: 'Too narrow. These top out at 62 mm (about 2.4 inches), and our labels need 4 inches. Use an office printer, or the QL-1100.' },
  { id: 'thermal2', title: '2-inch thermal printer', examples: 'Zebra ZD410, ZD411 and similar', verdict: 'no', body: 'Too narrow for our labels, which need 4 inches. Use an office printer or a 4-inch thermal printer.' },
  { id: 'handheld', title: 'Handheld label maker', examples: 'Brother P-touch, DYMO LabelManager', verdict: 'no', body: 'Not a good fit. These print text on tape and cannot print a QR code big enough to scan. Use an office printer instead.' },
  { id: 'other', title: 'Something else', examples: 'Not sure of the model', verdict: 'maybe', body: 'Probably. Anything that prints a 4×6 label or a letter page from a computer works. We will check your model with you.' },
];

/** Every kind of storage place the survey knows. kind decides how the setup wizard builds its spots. */
export const PLACES = {
  racks: { name: 'Pallet racks', sub: 'Heavy-duty warehouse racking', kind: 'RACK', tip: 'Build each rack with aisles, bays and levels. Codes like A-01-03-2 are made for you.' },
  shelves: { name: 'Shelves and bins', sub: 'Shelving units with bins or boxes', kind: 'RACK', tip: 'Build each shelf unit as a rack, with one level per shelf.' },
  cabinets: { name: 'Cabinets or drawers', sub: 'Parts cabinets and drawer units', kind: 'RACK', tip: 'Make each cabinet a rack, with one level per drawer or shelf.' },
  tires: { name: 'Tire racks', sub: 'Stacked tire storage', kind: 'RACK', tip: 'Build tire racks like shelves: bays across, levels up.' },
  long: { name: 'Long-goods racks', sub: 'Cantilever racks for lumber, pipe or steel', kind: 'RACK', tip: 'Make one spot per rack arm or bay.' },
  wall: { name: 'Wall hooks or pegboard', sub: 'Tools, hoses and hanging parts', kind: 'RACK', tip: 'Make a spot for each wall section.' },
  hanging: { name: 'Hanging rails', sub: 'Clothing, costumes or cords', kind: 'RACK', tip: 'Make a spot for each rail or section of rail.' },
  rooms: { name: 'Storage rooms or closets', sub: 'Back rooms and closets', kind: 'FLOOR', tip: 'Make a spot for each room or closet, or build its shelves as a rack.' },
  cages: { name: 'Cages or lockers', sub: 'Locked storage', kind: 'FLOOR', tip: 'Make a spot for each cage or locker.' },
  floor: { name: 'Floor space', sub: 'Marked areas or lanes', kind: 'FLOOR', tip: 'Make a spot for each lane or marked area.' },
  mezzanine: { name: 'Mezzanine or loft', sub: 'Upper-level storage', kind: 'FLOOR', tip: 'Make a spot for each section of the loft.' },
  yard: { name: 'Outside yard or lot', sub: 'Outdoor rows', kind: 'FLOOR', tip: 'Make a spot for each row or area.' },
  sheds: { name: 'Sheds or outbuildings', sub: 'Barns, sheds, pole buildings', kind: 'FLOOR', tip: 'Make each shed a zone, with a spot per wall or corner.' },
  containers: { name: 'Shipping containers', sub: 'Conex boxes on site', kind: 'FLOOR', tip: 'Make each container a spot, or split long ones into front, middle and back.' },
  trailers: { name: 'Trailers', sub: 'Parked storage trailers', kind: 'FLOOR', tip: 'Make each trailer a spot.' },
  vehicles: { name: 'Trucks or vans', sub: 'Stock carried on service vehicles', kind: 'FLOOR', tip: 'Make each truck or van a spot, so you know what is on board.' },
  cold: { name: 'Walk-in cooler or freezer', sub: 'Cold storage', kind: 'FLOOR', tip: 'Make each cooler a zone, with a spot per shelf.' },
  basement: { name: 'Basement, attic or garage', sub: 'Extra space around the building', kind: 'FLOOR', tip: 'Make a spot for each area.' },
  offsite: { name: 'Off-site storage unit', sub: 'Rented units elsewhere', kind: 'FLOOR', tip: 'Make each unit its own zone.' },
  carts: { name: 'Carts or rolling racks', sub: 'Storage that moves around', kind: 'FLOOR', tip: 'Give each cart its own spot label.' },
} as const satisfies Record<string, { name: string; sub: string; kind: 'RACK' | 'FLOOR'; tip: string }>;

export const PLACE_NAME = Object.fromEntries(Object.entries(PLACES).map(([k, v]) => [k, v.name])) as Record<Place, string>;
export const PLACE_SUB = Object.fromEntries(Object.entries(PLACES).map(([k, v]) => [k, v.sub])) as Record<Place, string>;

export interface ProductGroup {
  id: string;
  name: string;
  sub: string;
  size: Size;
  kept: Kept;
  /** Where this usually lives, best first. */
  places: Place[];
  /** Handling advice that ends up in the plan. */
  note?: string;
}

const g = (id: string, name: string, sub: string, size: Size, kept: Kept, places: Place[], note?: string): ProductGroup => ({ id, name, sub, size, kept, places, note });

const FLUIDS_NOTE = 'Give fluids and chemicals their own zone and allow only them there, so nothing else gets put in the cabinet.';
const HEAVY_NOTE = 'Keep heavy pieces on the bottom levels, and set a weight limit on each level so Move warns before one is overloaded.';

/** Groups anyone might have; shown behind "Show more" for every business, and up front for "something else". */
const COMMON: ProductGroup[] = [
  g('pallets', 'Pallets', 'Full or mixed pallets of product', 'pallet', 'own', ['racks', 'floor', 'yard']),
  g('large', 'Large single items', 'Machines, furniture, crates', 'bulky', 'own', ['floor', 'racks', 'rooms']),
  g('boxes', 'Boxes and cases', 'Cartons and totes on shelves', 'medium', 'shared', ['shelves', 'racks', 'rooms']),
  g('small', 'Small parts', 'Loose parts in bins or drawers', 'small', 'shared', ['shelves', 'cabinets', 'wall']),
  g('longitems', 'Long items', 'Pipe, lumber, rods, rolls', 'long', 'own', ['long', 'wall', 'yard']),
  g('hanging', 'Hanging items', 'Clothing, costumes, hoses, cords', 'medium', 'shared', ['hanging', 'wall', 'rooms']),
  g('tools', 'Tools and equipment', 'Power tools, testers, kits', 'medium', 'own', ['cages', 'cabinets', 'wall']),
  g('liquids', 'Liquids and chemicals', 'Paint, oil, cleaners, gas cans', 'small', 'shared', ['cabinets', 'shelves', 'rooms'], FLUIDS_NOTE),
  g('paper', 'Records and archive boxes', 'Files, documents, samples', 'medium', 'shared', ['shelves', 'rooms', 'offsite']),
];

export const PROFILES = {
  pallets: {
    title: 'Pallets and freight',
    sub: 'Warehouses, distributors, 3PLs, cross-docks',
    preset: 'pallets',
    noun: 'pallets',
    groupsQ: 'What comes through your building?',
    groups: [
      g('full', 'Full pallets of one product', 'One product per pallet', 'pallet', 'own', ['racks', 'floor', 'yard']),
      g('mixed', 'Mixed pallets', 'Several products on one pallet', 'pallet', 'shared', ['racks', 'floor']),
      g('half', 'Half and quarter pallets', 'Smaller loads', 'pallet', 'own', ['racks', 'shelves', 'floor']),
      g('cases', 'Cases and cartons', 'Loose cases picked from shelves', 'medium', 'shared', ['shelves', 'racks']),
      g('oversize', 'Oversize freight', 'Crates, machinery, odd shapes', 'bulky', 'own', ['floor', 'yard'], HEAVY_NOTE),
      g('customer', 'Customer-owned goods', 'Stored for someone else', 'pallet', 'own', ['racks', 'floor', 'cages']),
    ],
    limits: { weight: 'Beam weight ratings on racks', count: 'Only so many pallets fit in a lane or position', stack: 'How high pallets can stack on the floor' },
    holds: [
      ['order', 'Outbound orders', 'Pallets staged for a shipment'],
      ['customer', 'Customers', 'Goods you store for other companies'],
      ['project', 'Jobs or projects', 'Material held for a job'],
    ],
    holdExample: 'a pallet is picked for Tuesday’s shipment to Acme. You tag it “Acme order” so nobody ships it somewhere else.',
  },
  auto: {
    title: 'Auto and truck parts',
    sub: 'Parts stores, repair shops, salvage yards, dealers',
    preset: 'shelves',
    thing: 'Part',
    noun: 'parts',
    groupsQ: 'Which kinds of parts do you stock?',
    groups: [
      g('tires', 'Tires and wheels', 'New or used, stacked by size', 'medium', 'shared', ['tires', 'racks', 'floor']),
      g('drivetrain', 'Engines and transmissions', 'Heavy, one of a kind', 'bulky', 'own', ['racks', 'floor', 'cages'], HEAVY_NOTE),
      g('body', 'Body panels, doors and bumpers', 'Large, awkward shapes', 'long', 'own', ['wall', 'long', 'racks']),
      g('glass', 'Glass and mirrors', 'Windshields, windows, lights', 'bulky', 'own', ['racks', 'wall']),
      g('exhaust', 'Exhaust and long parts', 'Pipes, axles, driveshafts', 'long', 'own', ['long', 'wall']),
      g('boxed', 'Boxed parts', 'Brakes, filters, pumps, sensors', 'medium', 'shared', ['shelves', 'racks']),
      g('smallparts', 'Small parts and hardware', 'Clips, bolts, bulbs, fuses', 'small', 'shared', ['cabinets', 'shelves']),
      g('batteries', 'Batteries', 'Heavy, kept upright', 'medium', 'shared', ['shelves', 'floor'], HEAVY_NOTE),
      g('fluids', 'Fluids and chemicals', 'Oil, coolant, wiper fluid, paint', 'small', 'shared', ['cabinets', 'shelves'], FLUIDS_NOTE),
    ],
    limits: { weight: 'Shelf weight limits for heavy parts like engines', count: 'Only so many tires or parts fit in a bay', stack: 'How high tires can stack' },
    holds: [
      ['customer', 'Customers', 'Paid parts waiting for pickup'],
      ['project', 'Repair jobs', 'Parts ordered for a car in the shop'],
      ['order', 'Orders', 'Parts going out on a delivery'],
    ],
    holdExample: 'a customer pays for a transmission and picks it up Friday. You tag it with their name so nobody sells it to someone else.',
  },
  building: {
    title: 'Building materials',
    sub: 'Lumber yards, supply houses, contractors',
    preset: 'long',
    thing: 'Item',
    noun: 'materials',
    groupsQ: 'Which materials do you stock?',
    groups: [
      g('lumber', 'Lumber and boards', 'Bundles by size and length', 'long', 'own', ['long', 'yard', 'sheds']),
      g('sheet', 'Sheet goods', 'Plywood, drywall, OSB', 'pallet', 'own', ['floor', 'racks', 'sheds'], HEAVY_NOTE),
      g('pipe', 'Pipe, conduit and tubing', 'PVC, copper, steel', 'long', 'own', ['long', 'wall', 'yard']),
      g('steel', 'Steel and metal', 'Rebar, beams, sheet metal', 'long', 'own', ['long', 'yard'], HEAVY_NOTE),
      g('doors', 'Doors and windows', 'Stood upright, easy to damage', 'bulky', 'own', ['racks', 'floor', 'rooms']),
      g('bagged', 'Bagged and palletized goods', 'Concrete, mortar, insulation', 'pallet', 'own', ['floor', 'racks', 'yard']),
      g('trim', 'Trim and molding', 'Long, light pieces', 'long', 'shared', ['long', 'wall']),
      g('hardware', 'Hardware and fasteners', 'Screws, nails, brackets', 'small', 'shared', ['shelves', 'cabinets']),
      g('fixtures', 'Fixtures and boxed items', 'Lights, sinks, fans, cabinets', 'medium', 'shared', ['racks', 'shelves', 'mezzanine']),
    ],
    limits: { weight: 'Weight ratings on rack arms and levels', count: 'Only so many bundles fit on an arm', stack: 'How high material can stack on the ground' },
    holds: [
      ['customer', 'Contractor orders', 'Material pulled for a customer'],
      ['project', 'Jobs or job sites', 'Material staged for a build'],
      ['order', 'Deliveries', 'Loads going out on a truck'],
    ],
    holdExample: 'a contractor orders 40 sheets of drywall for Monday. You tag the pallet with the job so nobody sells it off the floor.',
  },
  furniture: {
    title: 'Furniture and appliances',
    sub: 'Furniture stores, appliance dealers, movers',
    preset: 'items',
    thing: 'Item',
    noun: 'items',
    groupsQ: 'What do you keep in stock?',
    groups: [
      g('sofas', 'Sofas and large furniture', 'Sectionals, recliners, beds', 'bulky', 'own', ['racks', 'floor', 'mezzanine']),
      g('tables', 'Tables, chairs and case goods', 'Dressers, desks, dining sets', 'bulky', 'own', ['floor', 'racks']),
      g('mattresses', 'Mattresses', 'Stored flat or on edge', 'bulky', 'own', ['racks', 'floor']),
      g('appliances', 'Appliances', 'Washers, fridges, ranges', 'bulky', 'own', ['floor', 'racks'], HEAVY_NOTE),
      g('rugs', 'Rugs and rolled goods', 'Rolled and stood or racked', 'long', 'own', ['long', 'racks']),
      g('decor', 'Decor and small boxed items', 'Lamps, mirrors, accessories', 'medium', 'shared', ['shelves', 'racks']),
      g('parts', 'Parts and hardware', 'Legs, bolts, service parts', 'small', 'shared', ['shelves', 'cabinets']),
    ],
    limits: { weight: 'Weight limits on upper rack levels', count: 'Only so many pieces fit in a bay', stack: 'How high boxes can stack' },
    holds: [
      ['customer', 'Sold, waiting for delivery', 'Pieces set aside for a customer'],
      ['order', 'Delivery routes', 'Loads for a truck run'],
      ['project', 'Jobs or installs', 'Pieces for a design job'],
    ],
    holdExample: 'a customer buys a sofa that delivers next week. You tag it with their name so it isn’t sold again or put on the wrong truck.',
  },
  parts: {
    title: 'Parts and supplies',
    sub: 'Stockrooms, maintenance shops, manufacturers',
    preset: 'shelves',
    thing: 'Item',
    noun: 'parts',
    groupsQ: 'What is in your stockroom?',
    groups: [
      g('small', 'Small parts and fasteners', 'Bins and drawers', 'small', 'shared', ['shelves', 'cabinets']),
      g('boxed', 'Boxed parts', 'Bearings, filters, belts', 'medium', 'shared', ['shelves', 'racks']),
      g('motors', 'Motors and heavy parts', 'Pumps, gearboxes, motors', 'bulky', 'own', ['racks', 'floor', 'cages'], HEAVY_NOTE),
      g('electrical', 'Electrical and wire', 'Spools, panels, breakers', 'medium', 'shared', ['racks', 'wall', 'shelves']),
      g('stock', 'Raw material', 'Bar stock, sheet, resin', 'pallet', 'own', ['racks', 'floor']),
      g('longstock', 'Pipe and long stock', 'Tubing, rod, extrusions', 'long', 'own', ['long', 'wall']),
      g('tools', 'Tools and gauges', 'Checked out and returned', 'medium', 'own', ['cages', 'cabinets', 'wall']),
      g('fluids', 'Oils and chemicals', 'Lubricants, solvents, paint', 'small', 'shared', ['cabinets', 'rooms'], FLUIDS_NOTE),
    ],
    limits: { weight: 'Shelf weight limits for heavy parts', count: 'Only so many bins fit on a shelf', stack: 'How high material can stack' },
    holds: [
      ['project', 'Work orders', 'Parts kitted for a repair or build'],
      ['order', 'Customer orders', 'Parts picked for shipping'],
      ['customer', 'Customers', 'Parts held for someone'],
    ],
    holdExample: 'parts are pulled for Tuesday’s pump rebuild. You tag them with the work order so they aren’t used on another job.',
  },
  retail: {
    title: 'Store back stock',
    sub: 'Shops, boutiques, online sellers, thrift',
    preset: 'shelves',
    thing: 'Item',
    noun: 'products',
    groupsQ: 'What is in your back room?',
    groups: [
      g('apparel', 'Clothing and shoes', 'Boxed or hanging', 'medium', 'shared', ['shelves', 'hanging']),
      g('boxed', 'Boxed products', 'Overstock by the case', 'medium', 'shared', ['shelves', 'racks']),
      g('small', 'Small items and accessories', 'Bins of small stock', 'small', 'shared', ['shelves', 'cabinets']),
      g('large', 'Large items', 'Furniture, bikes, grills', 'bulky', 'own', ['floor', 'racks']),
      g('seasonal', 'Seasonal stock and displays', 'Stored until next season', 'medium', 'shared', ['mezzanine', 'offsite', 'containers']),
      g('online', 'Online orders to ship', 'Packed and waiting', 'medium', 'own', ['shelves', 'carts']),
    ],
    limits: { weight: 'Shelf weight limits', count: 'Only so many boxes fit on a shelf', stack: 'How high boxes can stack' },
    holds: [
      ['customer', 'Customer holds', 'Special orders and layaway'],
      ['order', 'Online orders', 'Packed and waiting to ship'],
      ['event', 'Events or pop-ups', 'Stock set aside for a show'],
    ],
    holdExample: 'a customer special-orders a pair of boots. You tag the box with their name so it isn’t put out on the floor.',
  },
  equipment: {
    title: 'Equipment and gear',
    sub: 'Rentals, events, schools, churches, AV',
    preset: 'equipment',
    thing: 'Item',
    noun: 'equipment',
    groupsQ: 'What equipment do you look after?',
    groups: [
      g('av', 'AV and electronics', 'Speakers, lights, laptops', 'medium', 'own', ['cages', 'rooms', 'shelves']),
      g('furniture', 'Tables, chairs and staging', 'Stacked on carts', 'bulky', 'shared', ['floor', 'rooms', 'trailers']),
      g('tools', 'Tools and power equipment', 'Checked out and returned', 'medium', 'own', ['cages', 'wall', 'shelves']),
      g('machines', 'Machines and vehicles', 'Lifts, generators, trailers', 'bulky', 'own', ['yard', 'floor', 'sheds']),
      g('decor', 'Decor, props and costumes', 'Bins and hanging racks', 'medium', 'shared', ['shelves', 'hanging', 'rooms']),
      g('sports', 'Sports and outdoor gear', 'Bags, balls, tents', 'medium', 'shared', ['rooms', 'cages', 'sheds']),
      g('supplies', 'Supplies and consumables', 'Paper, cleaning, batteries', 'small', 'shared', ['shelves', 'cabinets']),
    ],
    limits: { weight: 'Weight limits on shelves or lofts', count: 'Only so many fit in a room or cage', stack: 'How high cases can stack' },
    holds: [
      ['event', 'Events', 'Gear packed for a date'],
      ['customer', 'Rentals', 'Out with a customer or reserved'],
      ['project', 'Classrooms or departments', 'Checked out to a group'],
    ],
    holdExample: 'speakers and lights are packed for Saturday’s wedding. You tag them with the event so nobody takes them for another one.',
  },
  custom: {
    title: 'Something else',
    sub: 'Pick your own words and inventory',
    preset: 'custom',
    noun: 'inventory',
    groupsQ: 'What kinds of inventory do you keep?',
    groups: COMMON,
    limits: { weight: 'Weight limits on shelves or racks', count: 'Only so many fit in a spot', stack: 'How high items can stack' },
    holds: [
      ['customer', 'Customers', 'Paid for and waiting for pickup'],
      ['order', 'Orders', 'Picked and waiting to go out'],
      ['project', 'Jobs or projects', 'Set aside for a job'],
      ['event', 'Events', 'Packed for a date'],
    ],
    holdExample: 'a customer buys an item and picks it up next week. You tag it with their name so nobody sells it again or moves it by mistake.',
  },
} as const satisfies Record<string, { title: string; sub: string; preset: SetupPreset; thing?: string; noun: string; groupsQ: string; groups: readonly ProductGroup[]; limits: Record<Exclude<Limit, 'none'>, string>; holds: readonly (readonly [Exclude<Hold, 'none' | 'other'>, string, string])[]; holdExample: string }>;

export type ProfileId = keyof typeof PROFILES;
export type Profile = (typeof PROFILES)[ProfileId];
export const PROFILE_IDS = Object.keys(PROFILES) as ProfileId[];
export const profileOf = (a: Pick<SurveyAnswers, 'profile'>): Profile => PROFILES[a.profile ?? 'custom'];

/** Profile groups that already cover a common one, so "Show more" doesn't offer "Small parts" next to "Small parts and hardware". */
const COVERS: Record<string, string> = {
  full: 'pallets', mixed: 'pallets', bagged: 'pallets', cases: 'boxes', boxed: 'boxes', fixtures: 'boxes',
  oversize: 'large', sofas: 'large', motors: 'large', machines: 'large',
  smallparts: 'small', hardware: 'small', parts: 'small',
  exhaust: 'longitems', lumber: 'longitems', pipe: 'longitems', longstock: 'longitems',
  apparel: 'hanging', fluids: 'liquids',
};

/** The profile's own groups first; the common ones it doesn't already cover sit behind "Show more". */
export function groupsFor(profile: ProfileId | null): { main: ProductGroup[]; more: ProductGroup[] } {
  const main = [...PROFILES[profile ?? 'custom'].groups];
  const ids = new Set(main.flatMap((x) => [x.id, COVERS[x.id] ?? x.id]));
  return { main, more: profile === 'custom' || !profile ? [] : COMMON.filter((x) => !ids.has(x.id)) };
}
export function groupById(id: string, profile: ProfileId | null): ProductGroup | undefined {
  const { main, more } = groupsFor(profile);
  return [...main, ...more].find((x) => x.id === id);
}

/** Four rough quantity ranges per size, with the midpoint used for the math. */
export const QTY: Record<Size, { label: string; mid: number }[]> = {
  pallet: [
    { label: 'Under 20', mid: 10 },
    { label: '20 to 100', mid: 60 },
    { label: '100 to 400', mid: 250 },
    { label: '400+', mid: 600 },
  ],
  bulky: [
    { label: 'Under 10', mid: 5 },
    { label: '10 to 50', mid: 30 },
    { label: '50 to 200', mid: 120 },
    { label: '200+', mid: 350 },
  ],
  medium: [
    { label: 'Under 50', mid: 25 },
    { label: '50 to 250', mid: 150 },
    { label: '250 to 1,000', mid: 600 },
    { label: '1,000+', mid: 2000 },
  ],
  small: [
    { label: 'Under 100', mid: 50 },
    { label: '100 to 1,000', mid: 500 },
    { label: '1,000 to 5,000', mid: 3000 },
    { label: '5,000+', mid: 8000 },
  ],
  long: [
    { label: 'Under 25', mid: 12 },
    { label: '25 to 100', mid: 60 },
    { label: '100 to 400', mid: 250 },
    { label: '400+', mid: 600 },
  ],
};
/** How many units share one labeled bin, box or spot when they're kept together. */
const SHARED_PER: Record<Size, number> = { pallet: 1, bulky: 3, medium: 8, small: 30, long: 6 };
/** Spots are planned 25% bigger than today's stock, so there's room to grow. */
const GROWTH = 1.25;
/** Setup minutes: laying out a zone, making + labeling + hanging a spot, labeling + scanning in one unit or bin. */
const MIN_PER = { zone: 15, spot: 1, label: 0.75, imported: 0.2 };
const SMALL_SPOT_PLACES: Place[] = ['shelves', 'cabinets', 'wall', 'tires', 'hanging', 'carts'];
const LETTERS = 'ABCDEFGHJKLMNPRSTUVWXYZ';

/** Zone letter number n: A to Z (skipping I, O and Q, which read like 1 and 0), then AA, AB… so no two zones share one. */
export function zoneLetter(n: number): string {
  const L = LETTERS.length;
  return n < L ? LETTERS[n] : LETTERS[Math.floor(n / L) - 1] + LETTERS[n % L];
}

export function defaultLayout(x: ProductGroup, qty: Tier = 1): GroupLayout {
  return { place: x.places[0], areas: qty >= 2 ? 2 : 1, qty, kept: x.kept };
}
export function keptLabels(x: ProductGroup): Record<Kept, string> {
  if (x.size === 'pallet') return { own: 'One product per pallet', shared: 'Mixed pallets with a contents list' };
  if (x.size === 'small') return { own: 'Each part gets its own label', shared: 'Kept in labeled bins' };
  return { own: 'Each one gets its own label', shared: 'Several share a labeled bin or spot' };
}

export interface ZonePlan {
  letters: string[];
  group: string;
  place: Place;
  /** Units on hand (midpoint of the range picked). */
  units: number;
  /** Labeled bins, boxes or pallets holding shared units; equal to units when each has its own label. */
  labeled: number;
  spots: number;
  kind: 'RACK' | 'FLOOR';
  smallSpotLabels: boolean;
  smallUnitLabels: boolean;
  note?: string;
}

/** Turns the layout answers into zones with letters and spot counts: the numbers everything else is built on. */
export function planZones(a: SurveyAnswers): ZonePlan[] {
  let next = 0;
  const out: ZonePlan[] = [];
  for (const id of a.groups) {
    const x = groupById(id, a.profile);
    if (!x) continue;
    const l = a.layout[id] ?? defaultLayout(x, a.size ?? 1);
    const units = QTY[x.size][l.qty].mid;
    const per = l.kept === 'shared' ? SHARED_PER[x.size] : 1;
    const labeled = Math.ceil(units / per);
    const areas = Math.max(1, Math.min(20, Math.round(l.areas)));
    const spots = Math.max(areas, Math.ceil(labeled * GROWTH));
    const letters = Array.from({ length: areas }, () => zoneLetter(next++));
    out.push({ letters, group: x.name, place: l.place, units, labeled, spots, kind: PLACES[l.place].kind, smallSpotLabels: SMALL_SPOT_PLACES.includes(l.place), smallUnitLabels: x.size === 'small', note: x.note });
  }
  return out;
}

/** The storage zones the setup wizard creates from the survey: "Tires and wheels 1", "Tires and wheels 2"… */
export function surveyZones(a: SurveyAnswers): { letter: string; name: string; kind: 'RACK' | 'FLOOR' }[] {
  return planZones(a).flatMap((z) => z.letters.map((letter, k) => ({ letter, name: z.letters.length > 1 ? `${z.group} ${k + 1}` : z.group, kind: z.kind })));
}

export interface Numbers {
  zones: number;
  spots: number;
  units: number;
  /** Labels on units, bins and pallets. */
  unitLabels: number;
  smallLabels: number;
  bigLabels: number;
  /** Avery 5160 sheets, 30 labels each. */
  sheets: number;
  /** 4×6 thermal rolls, 250 labels each. */
  rolls: number;
  hours: number;
  importSuggested: boolean;
}

export function surveyNumbers(a: SurveyAnswers): Numbers {
  const zones = planZones(a);
  const spots = zones.reduce((n, z) => n + z.spots, 0);
  const units = zones.reduce((n, z) => n + z.units, 0);
  const unitLabels = zones.reduce((n, z) => n + z.labeled, 0);
  const smallLabels = zones.reduce((n, z) => n + (z.smallSpotLabels ? z.spots : 0) + (z.smallUnitLabels ? z.labeled : 0), 0);
  const bigLabels = spots + unitLabels - smallLabels;
  const importSuggested = unitLabels > 300;
  const minutes = zones.reduce((n, z) => n + z.letters.length * MIN_PER.zone, 0) + spots * MIN_PER.spot + unitLabels * (importSuggested ? MIN_PER.imported + MIN_PER.label / 2 : MIN_PER.label);
  return { zones: zones.reduce((n, z) => n + z.letters.length, 0), spots, units, unitLabels, smallLabels, bigLabels, sheets: Math.ceil(smallLabels / 30), rolls: Math.ceil(bigLabels / 250), hours: Math.max(1, Math.round(minutes / 30) / 2), importSuggested };
}

export interface Recommendation {
  setup: WarehouseSetup & { preset: SetupPreset };
  advanced: boolean;
  numbers: Numbers;
  zones: ZonePlan[];
  printer: { verdict: Verdict; title: string; body: string };
  labels: string[];
  scanner: { title: string; body: string };
  rules: string[];
  steps: string[];
}

const HOLD_WORD: Record<Exclude<Hold, 'none' | 'other'>, [string, string]> = { customer: ['Customer', 'Customers'], order: ['Order', 'Orders'], project: ['Job', 'Jobs'], event: ['Event', 'Events'] };

const cap = (w: string) => (w ? w[0].toUpperCase() + w.slice(1) : w);
const clean = (w: string) =>
  w
    .trim()
    .replace(/[^\p{L}\p{N} '&-]/gu, '')
    .replace(/^[^\p{L}]+/u, '')
    .slice(0, 24);
const fmt = (n: number) => n.toLocaleString('en-US');

/** The words the app will use for this business. */
export function surveyWords(a: SurveyAnswers): { thing: string; things: string; noun: string } {
  const p = profileOf(a);
  const base = PRESETS.find((x) => x.id === p.preset)!;
  const typed = a.profile === 'custom' ? cap(clean(a.word)) : '';
  const thing = typed || ('thing' in p ? p.thing : base.setup.thing);
  const things = thing === base.setup.thing ? base.setup.things : pluralize(thing);
  return { thing, things, noun: typed ? things.toLowerCase() : p.noun };
}

/** Nouns the survey can use that are not counted one by one: "how much equipment", but "how many parts". */
const MASS_NOUNS = new Set(['equipment', 'inventory', 'stock', 'gear', 'furniture', 'lumber', 'merchandise', 'freight', 'clothing', 'apparel', 'hardware', 'luggage']);

/** "much" or "many" for a noun, for questions like "About how many parts do you keep on hand?" */
export function muchOrMany(noun: string): 'much' | 'many' {
  return MASS_NOUNS.has(noun.trim().toLowerCase()) ? 'much' : 'many';
}

/** "1 hour", "1.5 hours", "12 hours". */
export function hoursText(hours: number): string {
  return `${fmt(hours)} hour${hours === 1 ? '' : 's'}`;
}

/** Levels tried for a rack zone, best first; the one that lands closest to the planned count wins. */
const RACK_LEVELS = [3, 4, 2, 5];
/** Bays per aisle before the builder starts another aisle. */
const BAYS_PER_AISLE = 20;

/**
 * Starting numbers for one zone in the setup wizard's spot builder, from the spots the survey planned for it.
 * Floor zones get one spot per lane; rack zones get levels and bays that come to the planned count, or just
 * over it, in as few aisles as fit.
 */
export function builderDefaults(kind: string, spots: number): { aisles: number; bays: number; levels: number } {
  const want = Math.max(1, Math.round(spots));
  if (kind !== 'RACK') return { aisles: 1, bays: Math.min(200, want), levels: 1 };
  let best = { aisles: 1, bays: 1, levels: 1, total: Infinity };
  for (const levels of RACK_LEVELS.filter((l) => l <= want).concat(want < 2 ? [1] : [])) {
    const columns = Math.ceil(want / levels);
    const aisles = Math.min(30, Math.ceil(columns / BAYS_PER_AISLE));
    const bays = Math.min(60, Math.ceil(columns / aisles));
    const total = aisles * bays * levels;
    if (Math.abs(total - want) < Math.abs(best.total - want)) best = { aisles, bays, levels, total };
  }
  return { aisles: best.aisles, bays: best.bays, levels: best.levels };
}

/** Spots the survey planned for each zone letter: a group's spots split evenly over its areas. */
export function plannedSpotsByZone(a: SurveyAnswers): Record<string, number> {
  const out: Record<string, number> = {};
  for (const z of planZones(a)) for (const letter of z.letters) out[letter] = Math.ceil(z.spots / z.letters.length);
  return out;
}

export function recommend(a: SurveyAnswers): Recommendation {
  const p = profileOf(a);
  const preset: SetupPreset = p.preset;
  const base = PRESETS.find((x) => x.id === preset)!;
  const { thing, things, noun } = surveyWords(a);
  const hold = a.hold ?? 'none';
  const [job, jobs] = hold === 'none' ? [base.setup.job, base.setup.jobs] : hold === 'other' ? [cap(clean(a.holdWord)) || 'Job', pluralize(cap(clean(a.holdWord)) || 'Job')] : HOLD_WORD[hold];
  const setup = { preset, thing, things, job, jobs, jobs_on: hold !== 'none' };
  const advanced = a.limits.includes('weight') || base.advanced;
  const zones = planZones(a);
  const n = surveyNumbers(a);
  const crew = a.people === 'medium' || a.people === 'large';

  const model = a.hasPrinter === 'yes' ? PRINTERS.find((x) => x.id === (a.printer ?? 'other'))! : null;
  const thermal = !!model?.wide;
  const printer = model
    ? { verdict: model.verdict, title: model.title, body: model.body + (!thermal && n.bigLabels > 150 ? ` With about ${fmt(n.bigLabels)} large labels to print, a 4×6 thermal printer (usually $100 to $300) would pay for itself in time.` : '') }
    : {
        verdict: 'none' as const,
        title: 'No printer yet',
        body:
          n.bigLabels > 150
            ? `You’ll print about ${fmt(n.bigLabels)} large labels. Get a 4-inch thermal label printer (usually $100 to $300), and use any office printer for the ${fmt(n.smallLabels)} small shelf labels.`
            : 'Any office printer works: plain paper for large labels and Avery 5160 sheets for shelves. Add a 4×6 thermal printer later if you print a lot.',
      };

  const labels = [
    n.bigLabels ? `${fmt(n.bigLabels)} large labels (4×6) for ${zones.some((z) => !z.smallSpotLabels) ? 'rack and floor spots' : 'spots'}${zones.some((z) => !z.smallUnitLabels) ? ', pallets, big items and bins' : ''}: ${thermal ? `about ${n.rolls} roll${n.rolls === 1 ? '' : 's'} of 250` : 'one per page on an office printer, or rolls on a thermal printer'}.` : '',
    n.smallLabels ? `${fmt(n.smallLabels)} small labels for shelves, drawers and small parts: ${n.sheets} sheet${n.sheets === 1 ? '' : 's'} of Avery 5160 (30 per page).` : '',
    ...(zones.some((z) => ['yard', 'sheds', 'containers', 'cold', 'trailers'].includes(z.place)) ? ['Outdoor, trailer and cold spots: weatherproof labels, or labels in a plastic sleeve.'] : []),
  ].filter(Boolean);

  const busy = n.unitLabels > 1000 || crew;
  const scanner =
    a.scanner === 'scanner'
      ? { title: 'Handheld scanner', body: 'Make sure it is a 2D scanner that reads QR codes; older 1D laser scanners only read barcodes. Bluetooth or USB both work.' }
      : a.scanner === 'both'
        ? { title: 'Phones and a scanner', body: 'Phones for everyone on day one, and a 2D handheld scanner (about $40 to $150) where you receive and put away the most. It must read QR codes.' }
        : busy
          ? { title: 'Phones to start, a scanner later', body: `Phone cameras work on day one. With ${fmt(n.unitLabels)} labels to scan${crew ? ' and a bigger crew' : ''}, a Bluetooth 2D scanner (about $40 to $150) is much faster. It must read QR codes.` }
          : { title: 'Your phone is enough', body: 'Scan with the phone camera, no extra hardware. Add a 2D Bluetooth scanner later if scanning gets busy.' };

  const rules: string[] = [];
  if (a.limits.includes('weight')) rules.push(`Weight tracking is on. Set a weight limit on each ${zones.some((z) => z.place === 'long') ? 'rack arm or level' : 'rack level or shelf'}, and Move warns before one is overloaded.`);
  if (a.limits.includes('count')) rules.push(`Set how many fit in each spot. Move then suggests a spot with room.`);
  if (a.limits.includes('stack')) rules.push('Set a stacking height on floor spots, so a lane holds positions × stack height.');
  if (zones.some((z) => z.labeled < z.units)) rules.push(`Shared bins and ${preset === 'pallets' ? 'mixed pallets' : 'boxes'}: label the container once and list what’s inside. Search finds every item in it.`);
  for (const note of new Set(zones.map((z) => z.note).filter(Boolean))) rules.push(note!);

  const steps = [
    `Create your ${n.zones} zone${n.zones === 1 ? '' : 's'} and about ${fmt(n.spots)} spots with the rack builder.`,
    `Print and hang ${fmt(n.spots)} spot labels.`,
    n.importSuggested ? `Import your ${noun} from a spreadsheet instead of typing ${fmt(n.unitLabels)} records by hand.` : `Add your ${noun} with Receive, one scan each.`,
    ...(a.people && a.people !== 'solo' ? ['Add your crew by email.'] : []),
    'Scan a label, then a spot, to make your first move.',
  ];

  return { setup, advanced, numbers: n, zones, printer, labels, scanner, rules, steps };
}

/** Finished survey answers, kept until the warehouse is created and then applied. */
export const SAVED_SURVEY_KEY = 'pl.survey';
/** An unfinished survey and the question it was on, so a refresh picks up where it left off. */
export const SURVEY_PROGRESS_KEY = 'pl.survey.progress';

const upgrade = (raw: unknown): SurveyAnswers | null => {
  if (!raw || typeof raw !== 'object') return null;
  const a = { ...BLANK_ANSWERS, ...(raw as Partial<SurveyAnswers>) };
  // Answers saved by the first survey (before business profiles) don't carry over.
  if (a.profile && !(a.profile in PROFILES)) return null;
  if (!Array.isArray(a.groups) || !Array.isArray(a.limits)) return null;
  return a;
};
function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function write(key: string, value: unknown) {
  try {
    if (value) localStorage.setItem(key, JSON.stringify(value));
    else localStorage.removeItem(key);
  } catch {
    /* private window: the survey still works, it just isn't kept */
  }
}
export function loadSavedSurvey(): SurveyAnswers | null {
  return upgrade(read(SAVED_SURVEY_KEY));
}
export function saveSurvey(a: SurveyAnswers | null) {
  write(SAVED_SURVEY_KEY, a);
}
export function loadSurveyProgress(mode: string): { answers: SurveyAnswers; step: string } | null {
  const p = read<{ answers: unknown; step: string; mode: string }>(SURVEY_PROGRESS_KEY);
  const answers = p && p.mode === mode ? upgrade(p.answers) : null;
  return answers ? { answers, step: p!.step } : null;
}
export function saveSurveyProgress(mode: string, answers: SurveyAnswers | null, step = '') {
  write(SURVEY_PROGRESS_KEY, answers ? { mode, answers, step } : null);
}
