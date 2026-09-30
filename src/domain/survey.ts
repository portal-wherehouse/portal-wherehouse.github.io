// The setup survey: a few plain questions, then a recommended starting setup (words, labels, printer,
// scanner, spots, next steps). Pure so the website (before an account exists) and the portal share it.

import { PRESETS, pluralize, type SetupPreset } from './terms';
import type { WarehouseSetup } from './types';

export type Count = 'under100' | 'to1000' | 'to10000' | 'over10000';
export type Place = keyof typeof PLACES;
export type People = 'solo' | 'small' | 'medium' | 'large';
export type Group = 'none' | 'customer' | 'order' | 'project' | 'event' | 'other';
export type PrinterModel = 'thermal4' | 'thermal2' | 'office' | 'brotherWide' | 'brother' | 'dymoXL' | 'dymo' | 'handheld' | 'other';
export type ZoneCount = 'one' | 'few' | 'several' | 'many';
export type PerSpot = 'one' | 'many' | 'mix';
export type Scanner = 'phone' | 'scanner' | 'unsure';

export interface SurveyAnswers {
  store: SetupPreset | null;
  /** What one tracked thing is called, when the preset is "custom". */
  word: string;
  count: Count | null;
  places: Place[];
  /** How many areas of each kind, which become storage zones. */
  zones: Partial<Record<Place, ZoneCount>>;
  perSpot: PerSpot | null;
  people: People | null;
  group: Group | null;
  groupWord: string;
  hasPrinter: 'yes' | 'no' | null;
  printer: PrinterModel | null;
  scanner: Scanner | null;
  limits: 'yes' | 'no' | null;
  /** Photos and paperwork saved online, or paper only. */
  files: 'cloud' | 'paper' | null;
  /** For on-site setup: a tech can come out only within about an hour of Charleston. */
  zip: string;
}

export const BLANK_ANSWERS: SurveyAnswers = { store: null, word: '', count: null, places: [], zones: {}, perSpot: null, people: null, group: null, groupWord: '', hasPrinter: null, printer: null, scanner: null, limits: null, files: null, zip: '' };

export type Verdict = 'works' | 'maybe' | 'no' | 'none';

export interface Recommendation {
  setup: WarehouseSetup & { preset: SetupPreset };
  advanced: boolean;
  printer: { verdict: Verdict; title: string; body: string };
  labels: string[];
  scanner: { title: string; body: string };
  spots: string[];
  steps: string[];
}

const GROUP_WORD: Record<Exclude<Group, 'none' | 'other'>, string> = { customer: 'Customer', order: 'Order', project: 'Project', event: 'Event' };

const cap = (w: string) => (w ? w[0].toUpperCase() + w.slice(1) : w);
const clean = (w: string) =>
  w
    .trim()
    .replace(/[^\p{L}\p{N} '&-]/gu, '')
    .replace(/^[^\p{L}]+/u, '')
    .slice(0, 24);

// Label widths checked against the makers' specs: our labels need a 4-inch-wide printer or a letter page.
export const PRINTERS: { id: PrinterModel; title: string; examples: string; verdict: Verdict; body: string; wide?: boolean }[] = [
  { id: 'thermal4', title: '4-inch thermal label printer', examples: 'Zebra ZD421, ZD621, GK420d, Rollo, MUNBYN, iDPRT', verdict: 'works', wide: true, body: 'Works. Print 4×6 labels straight from the browser on a computer. This is the fastest way to label a lot of things.' },
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
/** The places that fit each kind of storage are shown first; the rest sit behind "Show more". */
export const PLACE_ORDER: Record<string, Place[]> = {
  pallets: ['racks', 'floor', 'yard', 'long', 'mezzanine', 'trailers'],
  items: ['floor', 'racks', 'rooms', 'yard', 'containers', 'mezzanine'],
  shelves: ['shelves', 'cabinets', 'rooms', 'cages', 'wall', 'tires'],
  long: ['long', 'yard', 'racks', 'floor', 'sheds'],
  equipment: ['rooms', 'shelves', 'cages', 'floor', 'sheds', 'trailers', 'vehicles'],
  custom: ['shelves', 'racks', 'cabinets', 'rooms', 'cages', 'floor', 'yard', 'long', 'sheds', 'containers', 'vehicles', 'wall'],
};
export function placesFor(store: SetupPreset | null): { main: Place[]; more: Place[] } {
  const main = PLACE_ORDER[store ?? 'custom'] ?? PLACE_ORDER.custom;
  return { main, more: (Object.keys(PLACES) as Place[]).filter((p) => !main.includes(p)) };
}
const ZONE_WORDS: Record<ZoneCount, string> = { one: 'one area', few: '2 to 5 areas', several: '6 to 20 areas', many: 'more than 20 areas' };
const ZONE_N: Record<ZoneCount, number> = { one: 1, few: 3, several: 6, many: 6 };
const LETTERS = 'ABCDEFGHJKLMNPRSTUVWXYZ';

export function recommend(a: SurveyAnswers): Recommendation {
  const preset: SetupPreset = a.store ?? 'custom';
  const base = PRESETS.find((p) => p.id === preset)!;
  const thing = preset === 'custom' && clean(a.word) ? cap(clean(a.word)) : base.setup.thing;
  const things = thing === base.setup.thing ? base.setup.things : pluralize(thing);
  const group = a.group ?? 'none';
  const job = group === 'none' ? base.setup.job : group === 'other' ? cap(clean(a.groupWord)) || 'Job' : GROUP_WORD[group];
  const setup = { preset, thing, things, job, jobs: job === base.setup.job ? base.setup.jobs : pluralize(job), jobs_on: group !== 'none' };
  const advanced = a.limits === 'yes' || base.advanced;
  const big = a.count === 'to10000' || a.count === 'over10000';
  const crew = a.people === 'medium' || a.people === 'large';
  const t = things.toLowerCase();

  const model = a.hasPrinter === 'yes' ? PRINTERS.find((p) => p.id === (a.printer ?? 'other'))! : null;
  const printer = model
    ? { verdict: model.verdict, title: model.title, body: model.body }
    : {
        verdict: 'none' as const,
        title: 'No printer yet',
        body: big
          ? `Start with any office printer and Avery 5160 sheets. With this many ${t}, a 4×6 thermal printer (usually $100 to $300) will save a lot of time.`
          : 'Start with any office printer and Avery 5160 sticker sheets. You can add a 4×6 thermal printer later if you print a lot.',
      };

  const thermal = !!model?.wide;
  const labels = [
    thermal ? `${things}: 4×6 thermal labels.` : `${things}: full-page labels on plain paper, or 4×6 labels if you get a thermal printer.`,
    a.places.some((p) => p === 'shelves' || p === 'cabinets') || preset === 'shelves' ? 'Shelves and bins: small Avery 5160 labels, 30 per page.' : thermal ? 'Racks and spots: 4×6 labels, or Avery 5160 sheets for tight shelf edges.' : 'Racks and spots: one label per spot, or Avery 5160 sheets for shelf edges.',
    ...(a.places.some((p) => p === 'yard' || p === 'sheds' || p === 'containers' || p === 'cold') ? ['Outside or cold spots: weatherproof labels, or labels in a plastic sleeve.'] : []),
  ];

  const scanner =
    a.scanner === 'scanner'
      ? { title: 'Your scanner', body: 'Make sure it is a 2D scanner that reads QR codes; older 1D laser scanners only read barcodes. Bluetooth or USB both work.' }
      : big || crew
        ? { title: 'Phones to start, a scanner later', body: `Phone cameras work on day one. With this many ${t}, a Bluetooth 2D scanner (about $40 to $150) makes scanning faster. It must read QR codes.` }
        : { title: 'Your phone is enough', body: 'Scan with the phone camera. No special hardware needed. Add a 2D Bluetooth scanner later if you want.' };

  const places: Place[] = a.places.length ? a.places : ['racks'];
  // Hand out zone letters in order, so the plan reads like a real layout: racks A to C, shelves D, and so on.
  let next = 0;
  const spots = places.map((p) => {
    const count = a.zones[p] ?? 'one';
    const n = ZONE_N[count];
    const from = LETTERS[Math.min(next, LETTERS.length - 1)];
    const to = LETTERS[Math.min(next + n - 1, LETTERS.length - 1)];
    next += n;
    const zones = n === 1 ? `zone ${from}` : count === 'many' ? `zones ${from}, ${LETTERS[Math.min(next - n + 1, LETTERS.length - 1)]} and on` : `zones ${from} to ${to}`;
    return `${PLACE_NAME[p]} (${ZONE_WORDS[count]}): ${zones}. ${PLACES[p].tip}`;
  });
  if (a.perSpot === 'one') spots.push(`One ${thing.toLowerCase()} per spot: each gets its own label, and Find shows its exact spot.`);
  if (a.perSpot === 'many' || a.perSpot === 'mix') spots.push('Shared spots: label the box, bin or pallet once and list what is in it. Search finds anything inside.');
  if (advanced) spots.push('Weight and size limits are on. Set them per spot when you build it.');

  const steps = [
    'Create your zones and spots.',
    'Print and hang the spot labels.',
    big ? `Import your ${t} from a spreadsheet instead of typing them.` : `Add your first ${t} with Receive.`,
    ...(a.people && a.people !== 'solo' ? ['Add your crew by email.'] : []),
    'Scan one thing into a spot to try a move.',
  ];

  return { setup, advanced, printer, labels, scanner, spots, steps };
}

/** Survey answers saved in the browser before an account exists, applied once the warehouse is created. */
export const SAVED_SURVEY_KEY = 'pl.survey';
export function loadSavedSurvey(): SurveyAnswers | null {
  try {
    const raw = localStorage.getItem(SAVED_SURVEY_KEY);
    return raw ? { ...BLANK_ANSWERS, ...(JSON.parse(raw) as Partial<SurveyAnswers>) } : null;
  } catch {
    return null;
  }
}
export function saveSurvey(a: SurveyAnswers | null) {
  try {
    if (a) localStorage.setItem(SAVED_SURVEY_KEY, JSON.stringify(a));
    else localStorage.removeItem(SAVED_SURVEY_KEY);
  } catch {
    /* private window: the survey still shows, it just isn't carried over */
  }
}
