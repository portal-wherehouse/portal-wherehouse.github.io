// Each warehouse names what it tracks ("Pallet", "Item", "Box") and what it groups work by ("Job", "Order"),
// or turns grouping off. The app's own wording says "pallet" and "job"; the portal swaps those words on screen.

import type { Warehouse, WarehouseSetup } from './types';

export const SETUP_PRESETS = ['pallets', 'items', 'shelves', 'long', 'equipment', 'custom'] as const;
export type SetupPreset = (typeof SETUP_PRESETS)[number];

export interface PresetInfo {
  id: SetupPreset;
  title: string;
  examples: string;
  setup: Omit<WarehouseSetup, 'preset'>;
  /** Turn on weight and size tracking with this preset. */
  advanced: boolean;
}

export const PRESETS: PresetInfo[] = [
  { id: 'pallets', title: 'Pallets', examples: 'Warehouses, distributors, 3PLs, yards', advanced: false, setup: { thing: 'Pallet', things: 'Pallets', job: 'Job', jobs: 'Jobs', jobs_on: true } },
  { id: 'items', title: 'Big single items', examples: 'Furniture, appliances, machines, vehicles', advanced: false, setup: { thing: 'Item', things: 'Items', job: 'Order', jobs: 'Orders', jobs_on: false } },
  { id: 'shelves', title: 'Parts and boxes on shelves', examples: 'Stockrooms, parts rooms, back rooms, bins', advanced: false, setup: { thing: 'Item', things: 'Items', job: 'Order', jobs: 'Orders', jobs_on: false } },
  { id: 'long', title: 'Long goods', examples: 'Lumber, pipe, steel, trim on racks', advanced: false, setup: { thing: 'Bundle', things: 'Bundles', job: 'Order', jobs: 'Orders', jobs_on: false } },
  { id: 'equipment', title: 'Equipment and supplies', examples: 'Schools, churches, nonprofits, rentals, events', advanced: false, setup: { thing: 'Item', things: 'Items', job: 'Event', jobs: 'Events', jobs_on: true } },
  { id: 'custom', title: 'A mix, or something else', examples: 'Pick your own words', advanced: false, setup: { thing: 'Pallet', things: 'Pallets', job: 'Job', jobs: 'Jobs', jobs_on: true } },
];

export const DEFAULT_SETUP: WarehouseSetup = { preset: null, thing: 'Pallet', things: 'Pallets', job: 'Job', jobs: 'Jobs', jobs_on: true };

export function setupOf(wh: Warehouse | null | undefined): WarehouseSetup {
  return { ...DEFAULT_SETUP, ...(wh?.setup ?? {}) };
}

/** True when the warehouse still uses the app's own words, so nothing needs swapping. */
export function isDefaultWords(s: WarehouseSetup): boolean {
  return s.thing === 'Pallet' && s.things === 'Pallets' && s.job === 'Job' && s.jobs === 'Jobs';
}

/** "Item" → "items" by the usual English rules; people can still type their own plural. */
export function pluralize(word: string): string {
  const w = word.trim();
  if (!w) return w;
  if (/[^aeiou]y$/i.test(w)) return w.slice(0, -1) + (w.endsWith('Y') ? 'IES' : 'ies');
  if (/(s|x|z|ch|sh)$/i.test(w)) return w + (w === w.toUpperCase() && w.length > 1 ? 'ES' : 'es');
  return w + (w === w.toUpperCase() && w.length > 1 ? 'S' : 's');
}

const vowel = (w: string) => /^[aeiou]/i.test(w) && !/^(uni|use|one)/i.test(w);

function matchCase(src: string, word: string): string {
  if (src.length > 1 && src === src.toUpperCase()) return word.toUpperCase();
  if (src[0] === src[0].toUpperCase()) return word[0].toUpperCase() + word.slice(1);
  return word.toLowerCase();
}

/**
 * Swap the app's words for the warehouse's own: "pallet" → "item", keeping case and fixing "a"/"an".
 * Only whole words change, so "palletize" or a code like "PAL-00012" is left alone.
 */
export function swapWords(text: string, s: WarehouseSetup): string {
  if (isDefaultWords(s) || !/pallet|job/i.test(text)) return text;
  const map: Record<string, string> = { pallet: s.thing, pallets: s.things, job: s.job, jobs: s.jobs };
  return text.replace(/\b(an?\s+)?(pallets?|jobs?)\b(?![-_\d])/gi, (_m, article: string | undefined, word: string) => {
    const next = matchCase(word, map[word.toLowerCase()] || word);
    if (!article) return next;
    const a = article.trimEnd();
    const fixed = vowel(next) ? 'an' : 'a';
    return matchCase(a, fixed) + article.slice(a.length) + next;
  });
}
