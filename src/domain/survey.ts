// The setup survey: a few plain questions, then a recommended starting setup (words, labels, printer,
// scanner, spots, next steps). Pure so the website (before an account exists) and the portal share it.

import { PRESETS, pluralize, type SetupPreset } from './terms';
import type { WarehouseSetup } from './types';

export type Count = 'under100' | 'to1000' | 'to10000' | 'over10000';
export type Place = 'racks' | 'shelves' | 'floor' | 'yard' | 'long';
export type People = 'solo' | 'small' | 'medium' | 'large';
export type Group = 'none' | 'customer' | 'order' | 'project' | 'event' | 'other';
export type PrinterModel = 'thermal' | 'office' | 'brother' | 'dymo' | 'handheld' | 'other';
export type Scanner = 'phone' | 'scanner' | 'unsure';

export interface SurveyAnswers {
  store: SetupPreset | null;
  /** What one tracked thing is called, when the preset is "custom". */
  word: string;
  count: Count | null;
  places: Place[];
  people: People | null;
  group: Group | null;
  groupWord: string;
  hasPrinter: 'yes' | 'no' | null;
  printer: PrinterModel | null;
  scanner: Scanner | null;
  limits: 'yes' | 'no' | null;
}

export const BLANK_ANSWERS: SurveyAnswers = { store: null, word: '', count: null, places: [], people: null, group: null, groupWord: '', hasPrinter: null, printer: null, scanner: null, limits: null };

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

export const PRINTERS: { id: PrinterModel; title: string; examples: string; verdict: Verdict; body: string }[] = [
  { id: 'thermal', title: '4×6 thermal label printer', examples: 'Zebra ZD420 or ZD421, GK420d, Rollo, MUNBYN, iDPRT', verdict: 'works', body: 'Works. Print 4×6 labels straight from the browser on a computer. This is the fastest way to label a lot of things.' },
  { id: 'office', title: 'Regular office printer', examples: 'Any inkjet or laser that prints letter paper', verdict: 'works', body: 'Works. Print full-page labels on plain paper, or Avery 5160 sticker sheets (30 per page) for shelves and bins.' },
  { id: 'brother', title: 'Brother QL label printer', examples: 'QL-800, QL-820NWB, QL-1100, QL-1110NWB', verdict: 'maybe', body: 'Depends on the model. The QL-1100 and QL-1110 take 4-inch labels, so 4×6 works. The QL-800 and QL-820 top out near 2.4 inches, which is too narrow for our labels.' },
  { id: 'dymo', title: 'DYMO LabelWriter', examples: 'LabelWriter 4XL, 5XL, 450, 550', verdict: 'maybe', body: 'Depends on the model. The 4XL and 5XL print 4×6 labels and work. The standard 450 and 550 are too narrow for our labels.' },
  { id: 'handheld', title: 'Handheld label maker', examples: 'Brother P-touch, DYMO LabelManager', verdict: 'no', body: 'Not a good fit. These print text on tape and cannot print a QR code big enough to scan. Use an office printer instead.' },
  { id: 'other', title: 'Something else', examples: 'Not sure of the model', verdict: 'maybe', body: 'Probably. Anything that prints a 4×6 label or a letter page from a computer works. We will check your model with you.' },
];

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

  const thermal = model?.verdict === 'works' && model.id === 'thermal';
  const labels = [
    thermal ? `${things}: 4×6 thermal labels.` : `${things}: full-page labels on plain paper, or 4×6 labels if you get a thermal printer.`,
    a.places.includes('shelves') || preset === 'shelves' ? 'Shelves and bins: small Avery 5160 labels, 30 per page.' : thermal ? 'Racks and spots: 4×6 labels, or Avery 5160 sheets for tight shelf edges.' : 'Racks and spots: one label per spot, or Avery 5160 sheets for shelf edges.',
    ...(a.places.includes('yard') ? ['Outside: weatherproof labels or labels in a plastic sleeve.'] : []),
  ];

  const scanner =
    a.scanner === 'scanner'
      ? { title: 'Your scanner', body: 'Make sure it is a 2D scanner that reads QR codes; older 1D laser scanners only read barcodes. Bluetooth or USB both work.' }
      : big || crew
        ? { title: 'Phones to start, a scanner later', body: `Phone cameras work on day one. With this many ${t}, a Bluetooth 2D scanner (about $40 to $150) makes scanning faster. It must read QR codes.` }
        : { title: 'Your phone is enough', body: 'Scan with the phone camera. No special hardware needed. Add a 2D Bluetooth scanner later if you want.' };

  const places: Place[] = a.places.length ? a.places : ['racks'];
  const SPOT: Record<Place, string> = {
    racks: 'Pallet racks: use Build a rack for zone, aisles, bays and levels. Codes like A-01-03-2 are made for you.',
    shelves: 'Shelves and bins: build each shelf unit as a rack, with one level per shelf.',
    floor: 'Floor space: make a spot for each lane or marked area, like FLOOR-01.',
    yard: 'Yard: make a spot for each row or area, like YARD-A.',
    long: 'Long goods: one spot per rack arm or bay.',
  };
  const spots = places.map((p) => SPOT[p]);
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
