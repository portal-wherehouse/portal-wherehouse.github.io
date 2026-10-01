// The page for each kind of business at #for/<id>: its problems, a day in their words (the example showcase),
// the features that matter most and what it won't do. One entry per group in groups.ts; every page is drawn
// by the same component (ForPage.tsx). Loaded only with that page.
//
// Keep the claims inside what the app does today: it tracks each item and its spot, not unit counts; it does
// not sync with online stores, ring sales, take bookings or plan production. Each `limit` says so plainly.
// The showcase screens are examples with sample data. No customer names, quotes, logos or numbers.

import type { IconName } from '../../ui/icons';
import type { GroupId, GroupSummary } from './groups';

/** Features a group can point to. Titles and icons live here; each group says why it matters to them. */
export const FEATURES = {
  spots: { icon: 'locations', title: 'Named spots' },
  scan: { icon: 'scanner', title: 'Phone scanning' },
  history: { icon: 'history', title: 'Every move on record' },
  picklist: { icon: 'jobs', title: 'Jobs and pick lists' },
  words: { icon: 'text', title: 'Your words' },
  photos: { icon: 'camera', title: 'Photos on the record' },
  incoming: { icon: 'import', title: 'Expected deliveries' },
  station: { icon: 'target', title: 'Scan station' },
  holds: { icon: 'hold', title: 'Holds' },
  returns: { icon: 'returnIcon', title: 'Returns' },
  offline: { icon: 'wifiOff', title: 'Weak signal is fine' },
  map: { icon: 'map', title: 'Warehouse map' },
  export: { icon: 'export', title: 'Spreadsheet export' },
} satisfies Record<string, { icon: IconName; title: string }>;
export type FeatureKey = keyof typeof FEATURES;

/** One mock phone screen in the showcase. Codes, names and spots are sample data. */
export type Shot =
  /** Receiving or a return: the camera reads the label, then the record shows. */
  | { kind: 'scan'; screen: 'Receive' | 'Return'; tag: string; note: string; hint: string }
  /** Put away: the item, then the spot, then saved. */
  | { kind: 'putaway' }
  /** Someone else searches and finds it. */
  | { kind: 'find'; query: string; history: [string, string] }
  /** A job's pick list, sorted by spot, checked off one by one. */
  | { kind: 'picklist'; rows: [code: string, desc: string, spot: string][] }
  /** It leaves the building. */
  | { kind: 'out'; to: string; by: string };

export interface DayStep {
  /** The plain step: Receive, Put away, Pick, Ship. Groups say it in their own words in `title`. */
  verb: string;
  title: string;
  body: string;
  shot: Shot;
}

export interface GroupDetails {
  /** The day section's heading: "A day at a lumberyard". */
  day: string;
  lede: string;
  /** Kinds of business this page speaks to. */
  covers: string[];
  /** What they put a label on, and the spot where it goes, for the hero label and the showcase. */
  item: { thing: string; code: string; desc: string; job: string; spot: string; spotName: string };
  problems: { title: string; body: string }[];
  steps: DayStep[];
  features: { key: FeatureKey; body: string }[];
  /** What it will not do for them, stated plainly. */
  limit: string;
}

export type Group = GroupSummary & GroupDetails;

export const GROUP_PAGES: Record<GroupId, GroupDetails> = {
  warehouses: {
    day: 'A day at a distribution warehouse',
    lede: 'Scan each pallet to the rack spot where it goes. Pickers search the product and walk straight to it, and the office sees what came in and what left.',
    covers: ['Small warehouses', 'Distributors and wholesalers', '3PL warehouses', 'Freight and cross-dock', 'Beverage distributors', 'Moving and storage', 'Records storage'],
    item: { thing: 'Pallet', code: 'P-000342', desc: 'Paper towels, 48 cases', job: 'Order 4471', spot: 'B-12-04', spotName: 'Rack B-12, level 4' },
    problems: [
      { title: 'Searching every aisle', body: 'Each pallet has one named spot, so a picker goes to B-12-04 instead of walking the building.' },
      { title: 'Knowledge that leaves at 5 pm', body: 'Where it went is on the record, not in one person’s head. The next shift finds it the same way.' },
      { title: 'Arguments over who moved it', body: 'Every move records who, when, from and to. The history is never edited or deleted.' },
    ],
    steps: [
      { verb: 'Receive', title: 'Check in the truck', body: 'Scan the barcode the pallet already has, or print a Wherehouse label at the dock.', shot: { kind: 'scan', screen: 'Receive', tag: 'Received', note: 'Order 4471 · Dock 2', hint: 'Label printed. Next: put it away.' } },
      { verb: 'Put away', title: 'Scan it to the rack', body: 'Drive it to the rack, scan the rack label, and the spot is saved for everyone.', shot: { kind: 'putaway' } },
      { verb: 'Pick', title: 'Find it for the order', body: 'Search the product, the code or what is inside. The result shows its spot.', shot: { kind: 'find', query: 'towels', history: ['Moved to B-12-04 by Alex', 'Received for Order 4471'] } },
      { verb: 'Ship', title: 'Load it out', body: 'Scan it as it leaves. The rack spot clears and the record shows where it went.', shot: { kind: 'out', to: 'Order 4471 · Truck 3', by: 'Sent out by Sam, 2:40 pm' } },
    ],
    features: [
      { key: 'spots', body: 'Aisles, racks, levels and floor lanes, named the way your crew already says them.' },
      { key: 'incoming', body: 'Import a supplier’s list, then check each load in as it arrives.' },
      { key: 'station', body: 'A computer or tablet at the dock with a keyboard-style scanner for hands-free receiving.' },
      { key: 'history', body: 'Who moved each pallet, when, and from where. Useful when a customer asks.' },
    ],
    limit: 'It tracks each pallet and where it is, not the unit count inside. It doesn’t invoice storage fees or connect to online stores yet.',
  },
  lumberyards: {
    day: 'A day at a lumberyard',
    lede: 'Label bundles and units once. Scan them to a yard row or rack arm, set them aside for each order, and let anyone on the yard find them.',
    covers: ['Lumber yards', 'Steel and pipe suppliers', 'Electrical and plumbing supply', 'Flooring and tile', 'Stone and countertops', 'Pool and spa supply'],
    item: { thing: 'Bundle', code: 'P-000214', desc: '2x6x16 SPF, 294 pcs', job: 'Order 2208', spot: 'Y-02-3', spotName: 'Yard row Y-02, bay 3' },
    problems: [
      { title: 'Orders that go missing in the yard', body: 'Set a bundle aside for an order and its spot is on the record, so it isn’t sold twice or loaded on the wrong truck.' },
      { title: 'Long goods with no shelf number', body: 'Name yard rows, rack arms and bays, and hang a label on each. Now every spot has a name.' },
      { title: 'One person who knows the yard', body: 'New hires and the counter staff search the order and see the exact row and bay.' },
    ],
    steps: [
      { verb: 'Receive', title: 'Unload the delivery', body: 'Scan or label each bundle as it comes off the truck. Add a photo if it helps.', shot: { kind: 'scan', screen: 'Receive', tag: 'Received', note: 'Order 2208 · Yard gate', hint: 'Tag printed. Next: put it away.' } },
      { verb: 'Put away', title: 'Scan it to the row', body: 'Set it in a yard row or on a rack arm and scan the spot label.', shot: { kind: 'putaway' } },
      { verb: 'Pick', title: 'Pull the order', body: 'The pick list shows every bundle for the order, sorted by spot, so one loop of the yard collects it.', shot: { kind: 'picklist', rows: [['P-000214', '2x6x16 SPF', 'Y-02-3'], ['P-000220', 'OSB 7/16, 40 sh', 'Y-04-1'], ['P-000231', 'Joist hangers', 'S-01-2']] } },
      { verb: 'Ship', title: 'Load the truck', body: 'Scan each bundle as it goes on the truck. The yard spot clears.', shot: { kind: 'out', to: 'Order 2208 · Truck 2', by: 'Sent out by Sam, 7:15 am' } },
    ],
    features: [
      { key: 'picklist', body: 'Group bundles by order. The pick list is sorted by spot and can be printed.' },
      { key: 'words', body: 'Call them bundles, units or lifts. The app uses your words.' },
      { key: 'offline', body: 'Out in the yard with no signal, moves of items already opened on a phone wait and sync later.' },
      { key: 'holds', body: 'Put a damaged or disputed bundle on hold, so it can’t go out until a supervisor clears it.' },
    ],
    limit: 'It counts bundles and units, not board feet or pieces left in each. It sits beside your point-of-sale and doesn’t ring sales.',
  },
  contractors: {
    day: 'A day for a contractor',
    lede: 'Receive material to its job and put it in a yard row, container or truck. In the morning the crew searches the job and loads the right material.',
    covers: ['General contractors', 'HVAC, plumbing and electrical', 'Roofing and siding', 'Solar installers', 'Landscaping', 'Utility and telecom yards'],
    item: { thing: 'Pallet', code: 'P-000118', desc: 'Light fixtures, 12 cases', job: 'J-118 · School remodel', spot: 'CONT-2', spotName: 'Container 2' },
    problems: [
      { title: 'Reordering what you already bought', body: 'Material is received to its job, so before you reorder you can see it is in Container 2.' },
      { title: 'The wrong material on the truck', body: 'The crew pulls the job’s pick list and loads exactly what is on it.' },
      { title: 'Calls from the job site', body: 'Anyone can search the job on a phone and see what is still at the shop and what already went out.' },
    ],
    steps: [
      { verb: 'Receive', title: 'Receive it to the job', body: 'Scan the delivery and pick the job it belongs to. Print a label with the job on it.', shot: { kind: 'scan', screen: 'Receive', tag: 'Received', note: 'Job J-118 · School remodel', hint: 'Label printed. Next: put it away.' } },
      { verb: 'Put away', title: 'Stage it', body: 'Put it in a yard row, a container or on a shop rack and scan the spot.', shot: { kind: 'putaway' } },
      { verb: 'Pick', title: 'Load for the morning', body: 'Open the job’s pick list. Everything for J-118 is listed by spot.', shot: { kind: 'picklist', rows: [['P-000118', 'Light fixtures', 'CONT-2'], ['P-000124', 'Conduit, 10 ft', 'YARD-03'], ['P-000131', 'Panel boxes', 'SHOP-01']] } },
      { verb: 'Ship', title: 'Send it to the site', body: 'Scan it onto the truck. The record shows it went to the job site.', shot: { kind: 'out', to: 'J-118 · School remodel', by: 'Sent out by Sam, 6:50 am' } },
    ],
    features: [
      { key: 'picklist', body: 'Every item is received to a job. The pick list shows what is on hand and where.' },
      { key: 'spots', body: 'Yard rows, containers, shop racks and even trucks can be spots.' },
      { key: 'returns', body: 'Leftover material comes back with a condition note and the same code.' },
      { key: 'scan', body: 'The crew uses their own phones. No app to install.' },
    ],
    limit: 'It doesn’t do estimates, invoicing or scheduling. It sits beside the software you use for those.',
  },
  parts: {
    day: 'A day at a parts counter',
    lede: 'Receive parts to the repair or customer they belong to. When the vehicle comes in, search the order and walk straight to the shelf.',
    covers: ['Auto repair and parts', 'Tire shops', 'Fleet and trucking shops', 'Dealerships', 'Powersports and marine', 'Salvage and recyclers'],
    item: { thing: 'Part', code: 'P-000507', desc: 'Brake rotors, front pair', job: 'RO 8812', spot: 'P-02-4', spotName: 'Parts shelf P-02, bin 4' },
    problems: [
      { title: 'Parts that arrive before the vehicle', body: 'Receive the part to its repair order. When the vehicle shows up, the part is a search away.' },
      { title: 'Customer sets with no home', body: 'Stored tire sets and customer parts each get a label and a spot, with a photo if it helps.' },
      { title: 'Returns that never go back', body: 'Wrong or extra parts are easy to find and send back, because each one has a spot.' },
    ],
    steps: [
      { verb: 'Receive', title: 'Check in the parts order', body: 'Scan the part’s own barcode and attach it to the repair order.', shot: { kind: 'scan', screen: 'Receive', tag: 'Received', note: 'RO 8812 · Bay 3', hint: 'Label printed. Next: put it away.' } },
      { verb: 'Put away', title: 'Shelve it', body: 'Scan the shelf or bin label. The spot is saved for the whole shop.', shot: { kind: 'putaway' } },
      { verb: 'Pick', title: 'Find it when the car is in', body: 'Search the repair order, the part number or the customer.', shot: { kind: 'find', query: 'RO 8812', history: ['Moved to P-02-4 by Alex', 'Received for RO 8812'] } },
      { verb: 'Ship', title: 'Hand it to the tech', body: 'Scan it out to the bay. The shelf spot clears.', shot: { kind: 'out', to: 'RO 8812 · Bay 3', by: 'Sent out by Sam, 10:05 am' } },
    ],
    features: [
      { key: 'scan', body: 'Use the barcode already on the box, or print a label for parts that don’t have one.' },
      { key: 'photos', body: 'A photo on the record, so the next person knows the right rotor on sight.' },
      { key: 'picklist', body: 'Group parts by repair order or customer, and see what is still waiting.' },
      { key: 'holds', body: 'Put a core, a warranty return or a damaged part on hold until someone clears it.' },
    ],
    limit: 'It works beside your shop software. It doesn’t write estimates or invoices, or count units on hand yet.',
  },
  retail: {
    day: 'A day in the stockroom',
    lede: 'Label the boxes and shelves in the back room. Staff search a product and see the shelf, so overstock, special orders and items waiting to ship are easy to find.',
    covers: ['Retail back rooms', 'Furniture and appliance stores', 'Hardware and farm stores', 'Bike and sporting goods', 'Online stores'],
    item: { thing: 'Box', code: 'P-000611', desc: 'Rain jackets, size M and L', job: 'Special order 315', spot: 'BR-02-3', spotName: 'Back room shelf BR-02' },
    problems: [
      { title: '“Let me check the back”', body: 'Staff search the product on a phone and walk to the right shelf instead of opening every box.' },
      { title: 'Special orders that get lost', body: 'Set an item aside for a customer and its spot is on the record until it is picked up.' },
      { title: 'New hires who can’t find anything', body: 'Every box and shelf has a name and a label, so the first day is easier.' },
    ],
    steps: [
      { verb: 'Receive', title: 'Unpack the delivery', body: 'Scan each box and list what is inside, so a search for the product finds the box.', shot: { kind: 'scan', screen: 'Receive', tag: 'Received', note: 'Back room · Delivery door', hint: 'Label printed. Next: put it away.' } },
      { verb: 'Put away', title: 'Shelve it in the back', body: 'Scan the stockroom shelf. Done.', shot: { kind: 'putaway' } },
      { verb: 'Pick', title: 'Find it for the customer', body: 'Search “rain jacket” and the shelf comes up, even with a typo.', shot: { kind: 'find', query: 'jacket', history: ['Moved to BR-02-3 by Alex', 'Received at the back door'] } },
      { verb: 'Ship', title: 'Hand it off or ship it', body: 'Scan it out when it goes to the floor, to the customer or into a shipping box.', shot: { kind: 'out', to: 'Special order 315', by: 'Sent out by Sam, 4:20 pm' } },
    ],
    features: [
      { key: 'scan', body: 'Search a name, a code or what is inside a box, even with a typo.' },
      { key: 'spots', body: 'Name stockroom shelves, bins and overflow areas, and print a label for each.' },
      { key: 'holds', body: 'Hold an item for a customer so nobody sells it from the back.' },
      { key: 'photos', body: 'A photo of each box makes the right one easy to spot.' },
    ],
    limit: 'It sits beside your point-of-sale or online store. It doesn’t ring sales, sync with your store or count units yet. Use it for where products are, and your store for how many.',
  },
  rentals: {
    day: 'A day at a rental company',
    lede: 'Label each case, crate and unit once. Pack each event from a pick list, scan it out, and scan it back to its shelf when it returns.',
    covers: ['Event and party rental', 'Equipment rental', 'Theater and production', 'Trade show and exhibit', 'Touring crews', 'Photo and video studios'],
    item: { thing: 'Case', code: 'P-000782', desc: 'Uplight case, 8 fixtures', job: 'Event E-52 · Saturday', spot: 'D-03', spotName: 'Bay D, shelf 3' },
    problems: [
      { title: 'Packing from memory', body: 'Each event has a pick list sorted by spot, so the crew packs from a list, not a whiteboard.' },
      { title: 'Not knowing what came back', body: 'Scan returns as they come off the truck. The team sees what is back, what is missing and its condition.' },
      { title: 'Gear in the wrong bay', body: 'A scan to the shelf saves where it went, so the next event finds it.' },
    ],
    steps: [
      { verb: 'Pick', title: 'Pack the event', body: 'Open the event’s pick list and pull each case by spot.', shot: { kind: 'picklist', rows: [['P-000782', 'Uplight case', 'D-03'], ['P-000790', 'Linens, ivory', 'L-01-2'], ['P-000804', 'Farm tables, 6', 'FLOOR-2']] } },
      { verb: 'Ship', title: 'Load out', body: 'Scan each case onto the truck. The record shows which event has it.', shot: { kind: 'out', to: 'Event E-52 · Saturday', by: 'Sent out by Sam, 9:10 am' } },
      { verb: 'Receive', title: 'Check in the return', body: 'Scan it as it comes back and add a condition note. It keeps the same code.', shot: { kind: 'scan', screen: 'Return', tag: 'Back', note: 'From E-52 · Condition: good', hint: 'Next: put it away.' } },
      { verb: 'Put away', title: 'Back on the shelf', body: 'Scan the shelf it goes to. The next event finds it there.', shot: { kind: 'putaway' } },
    ],
    features: [
      { key: 'returns', body: 'Record each return with a condition note. It goes back on the shelf under the same code.' },
      { key: 'picklist', body: 'Group gear by event or job and pack from a list sorted by spot.' },
      { key: 'holds', body: 'Put damaged gear on hold so it doesn’t go out again until it is fixed.' },
      { key: 'words', body: 'Call them cases, units or kits, and call events whatever your crew calls them.' },
    ],
    limit: 'It doesn’t take bookings or payments. It tracks where each case and unit is, and which event has it.',
  },
  manufacturing: {
    day: 'A day in a shop',
    lede: 'Track raw material, parts waiting between steps and finished pallets by spot. Anyone can see where a job’s material is waiting.',
    covers: ['Small manufacturers', 'Machine and fabrication shops', 'Cabinet and woodworking', 'Print and sign shops', 'Breweries and wineries'],
    item: { thing: 'Pallet', code: 'P-000925', desc: 'Steel brackets, painted', job: 'WO 3307', spot: 'WIP-03', spotName: 'Work in progress, cell 3' },
    problems: [
      { title: 'Work in progress that wanders', body: 'Scan parts to the work cell or cart where they wait, so the next step knows where to look.' },
      { title: 'Raw material no one can find', body: 'Sheet goods, bar stock and supplies each get a spot on a rack.' },
      { title: 'Finished goods mixed with the rest', body: 'Finished pallets sit in their own spots, ready to ship and easy to find.' },
    ],
    steps: [
      { verb: 'Receive', title: 'Receive raw material', body: 'Scan the delivery and label it with the work order it is for.', shot: { kind: 'scan', screen: 'Receive', tag: 'Received', note: 'WO 3307 · Receiving', hint: 'Label printed. Next: put it away.' } },
      { verb: 'Put away', title: 'Move it to the cell', body: 'Scan it to the work cell or cart where it waits for the next step.', shot: { kind: 'putaway' } },
      { verb: 'Pick', title: 'Find the next job', body: 'Search the work order and see each pallet’s spot.', shot: { kind: 'find', query: 'WO 3307', history: ['Moved to WIP-03 by Alex', 'Received for WO 3307'] } },
      { verb: 'Ship', title: 'Ship the finished goods', body: 'Scan finished pallets out as they leave the dock.', shot: { kind: 'out', to: 'WO 3307 · Dock 1', by: 'Sent out by Sam, 3:30 pm' } },
    ],
    features: [
      { key: 'spots', body: 'Racks, work cells, carts and staging lanes can all be spots.' },
      { key: 'picklist', body: 'Group material by work order and see what is waiting where.' },
      { key: 'map', body: 'See each rack and work area and what is on it.' },
      { key: 'export', body: 'Download records as a spreadsheet when the office needs them.' },
    ],
    limit: 'It doesn’t plan production or count parts used up yet. It tracks where each pallet, cart and part is.',
  },
  facilities: {
    day: 'A day for a facilities team',
    lede: 'Label storage rooms, closets and sheds, and the furniture, equipment and supplies in them. Staff and volunteers search and find, across every building.',
    covers: ['Schools and districts', 'Churches', 'City and county facilities', 'Parks and recreation', 'Fire and EMS', 'Nonprofits'],
    item: { thing: 'Item', code: 'P-001044', desc: 'Folding tables, 10', job: 'Spring fair', spot: 'GYM-ST2', spotName: 'Gym storage, shelf 2' },
    problems: [
      { title: 'Five buildings, one memory', body: 'Every closet and shed is a named spot. Search once and see which building.' },
      { title: 'Borrowed and never returned', body: 'Scan it out for an event or classroom, and scan it back. The record shows who has it.' },
      { title: 'Volunteers who don’t know the building', body: 'Staff and volunteers search on their own phones. No app to install.' },
    ],
    steps: [
      { verb: 'Receive', title: 'Label it once', body: 'Scan or label each item as it arrives or as you sort a room.', shot: { kind: 'scan', screen: 'Receive', tag: 'Received', note: 'Main building · Office', hint: 'Label printed. Next: put it away.' } },
      { verb: 'Put away', title: 'Scan it to the room', body: 'Scan the closet, shelf or shed label.', shot: { kind: 'putaway' } },
      { verb: 'Pick', title: 'Find it for the event', body: 'Search “tables” and see every building that has them.', shot: { kind: 'find', query: 'tables', history: ['Moved to GYM-ST2 by Alex', 'Received at the main office'] } },
      { verb: 'Ship', title: 'Check it out', body: 'Scan it out to the event or room. Scan it back when it returns.', shot: { kind: 'out', to: 'Spring fair · Field', by: 'Sent out by Sam, 8:00 am' } },
    ],
    features: [
      { key: 'spots', body: 'Buildings, rooms, closets and sheds, with a label on each door or shelf.' },
      { key: 'returns', body: 'Scan items back after an event, with a note if something is damaged.' },
      { key: 'scan', body: 'Staff and volunteers use their own phones.' },
      { key: 'history', body: 'See who took it and when, without a sign-out sheet.' },
    ],
    limit: 'It tracks where each item is. It doesn’t count consumable supplies or track expiry dates yet.',
  },
};
