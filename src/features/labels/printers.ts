// Printers, label styles and the exact sheet geometry for each pair, in inches. The guided print flow reads
// these: pick a printer, see only the styles that printer can make, then lay labels out at true size.

import type { IconName } from '../../ui/icons';

export type PrinterId = 'office' | 'avery5160' | 'avery5163' | 'avery5164' | 'strip' | 'thermal4x6' | 'thermal2x1' | 'thermal225';
export type StyleId = 'spot' | 'shelf' | 'poster' | 'item';

/** One printed page and where each label sits on it. Every number is in inches. */
export interface SheetLayout {
  /** Page width and height: the @page size. */
  page: [number, number];
  /** Distance from the page's top and left edge to the first label. */
  margin: [number, number];
  /** Label width and height. */
  label: [number, number];
  cols: number;
  rows: number;
  /** Space between columns and between rows. */
  gap: [number, number];
  /** Plain paper: print light cut lines around each label. Pre-cut sheets and thermal rolls do not need them. */
  cut?: boolean;
}

export interface PrinterDef {
  id: PrinterId;
  kind: 'paper' | 'thermal';
  title: string;
  /** Size and count line, like "1 x 2-5/8 in, 30 per sheet". */
  size: string;
  /** What to buy or what it looks like. */
  examples: string;
  icon: IconName;
  styles: Partial<Record<StyleId, SheetLayout>>;
}

export interface StyleDef {
  id: StyleId;
  title: string;
  sub: string;
  /** What gets chosen in step 3. */
  of: 'spots' | 'sections' | 'pallets';
}

const LETTER: [number, number] = [8.5, 11];
const one = (w: number, h: number): SheetLayout => ({ page: [w, h], margin: [0, 0], label: [w, h], cols: 1, rows: 1, gap: [0, 0] });

// Avery templates (and their 8160, 5260, 8163, 8164 twins share the same layout).
const AVERY_5160: SheetLayout = { page: LETTER, margin: [0.5, 0.1875], label: [2.625, 1], cols: 3, rows: 10, gap: [0.125, 0] };
const AVERY_5163: SheetLayout = { page: LETTER, margin: [0.5, 0.15625], label: [4, 2], cols: 2, rows: 5, gap: [0.1875, 0] };
const AVERY_5164: SheetLayout = { page: LETTER, margin: [0.5, 0.15625], label: [4, 3 + 1 / 3], cols: 2, rows: 3, gap: [0.1875, 0] };
// Plain letter paper: six big labels, thirty shelf labels, or one poster per page, with cut lines.
const PAPER_6: SheetLayout = { page: LETTER, margin: [0.5, 0.25], label: [4, 3 + 1 / 3], cols: 2, rows: 3, gap: [0, 0], cut: true };
const PAPER_SHELF: SheetLayout = { page: LETTER, margin: [0.5, 0.25], label: [2.5, 1], cols: 3, rows: 10, gap: [0.25, 0], cut: true };
const PAPER_POSTER: SheetLayout = { page: LETTER, margin: [0.25, 0.25], label: [8, 10.5], cols: 1, rows: 1, gap: [0, 0] };
// Shelf-edge strips: eight 1-1/4 in strips per letter sheet, three labels across each strip.
const STRIP: SheetLayout = { page: LETTER, margin: [0.5, 0.25], label: [8 / 3, 1.25], cols: 3, rows: 8, gap: [0, 0], cut: true };

export const PRINTERS: PrinterDef[] = [
  {
    id: 'office',
    kind: 'paper',
    title: 'Office or home printer',
    size: 'Plain letter paper, 8-1/2 x 11 in',
    examples: 'Any inkjet or laser printer. Cut the labels apart and tape or slide them into holders.',
    icon: 'print',
    styles: { spot: PAPER_6, shelf: PAPER_SHELF, poster: PAPER_POSTER, item: PAPER_6 },
  },
  {
    id: 'avery5160',
    kind: 'paper',
    title: 'Avery 5160 label sheets',
    size: '1 x 2-5/8 in, 30 per sheet',
    examples: 'Also 8160, 5260 and 5960. Small labels for shelf edges and bins.',
    icon: 'grid',
    styles: { shelf: AVERY_5160, spot: AVERY_5160, item: AVERY_5160 },
  },
  {
    id: 'avery5163',
    kind: 'paper',
    title: 'Avery 5163 label sheets',
    size: '2 x 4 in, 10 per sheet',
    examples: 'Also 8163 and 5263. Medium labels for rack beams and shelves.',
    icon: 'grid',
    styles: { spot: AVERY_5163, shelf: AVERY_5163, item: AVERY_5163 },
  },
  {
    id: 'avery5164',
    kind: 'paper',
    title: 'Avery 5164 label sheets',
    size: '3-1/3 x 4 in, 6 per sheet',
    examples: 'Also 8164 and 5264. Big labels for rack beams, floor spots and pallets.',
    icon: 'grid',
    styles: { spot: AVERY_5164, item: AVERY_5164 },
  },
  {
    id: 'strip',
    kind: 'paper',
    title: 'Shelf-edge strip paper',
    size: '1-1/4 in strips, 24 labels per sheet',
    examples: 'Letter sheets cut or perforated into strips that slide into shelf label holders.',
    icon: 'list',
    styles: { shelf: STRIP },
  },
  {
    id: 'thermal4x6',
    kind: 'thermal',
    title: 'Thermal label printer, 4 x 6 in',
    size: '4 x 6 in, one label at a time',
    examples: 'Zebra, Rollo, MUNBYN, Brother and other shipping label printers.',
    icon: 'labels',
    styles: { spot: one(4, 6), item: one(4, 6), poster: one(4, 6) },
  },
  {
    id: 'thermal2x1',
    kind: 'thermal',
    title: 'Small thermal labels, 2 x 1 in',
    size: '2 x 1 in, one label at a time',
    examples: 'Zebra, Rollo, DYMO and Brother printers loaded with small labels.',
    icon: 'labels',
    styles: { shelf: one(2, 1), item: one(2, 1) },
  },
  {
    id: 'thermal225',
    kind: 'thermal',
    title: 'Small thermal labels, 2-1/4 x 1-1/4 in',
    size: '2-1/4 x 1-1/4 in, one label at a time',
    examples: 'Common on Zebra desktop and Rollo printers. Fits most shelf edges.',
    icon: 'labels',
    styles: { shelf: one(2.25, 1.25), spot: one(2.25, 1.25), item: one(2.25, 1.25) },
  },
];

export const STYLES: StyleDef[] = [
  { id: 'spot', title: 'Rack or floor spot label', sub: 'Big spot code, a QR code for phones and a barcode for handheld scanners. One per spot, on the beam or floor.', of: 'spots' },
  { id: 'shelf', title: 'Shelf-edge label', sub: 'A small barcode and the spot code, no QR. Sized to sit on a shelf edge, about every 12 inches.', of: 'spots' },
  { id: 'poster', title: 'Section or aisle sign', sub: 'A big “SECTION A” or aisle sign with a large barcode, to hang at the end of a row.', of: 'sections' },
  { id: 'item', title: 'Item or pallet labels', sub: 'The pallet or item code, what it holds, a QR code and a barcode.', of: 'pallets' },
];

export const printerById = (id: string | null | undefined) => PRINTERS.find((p) => p.id === id) ?? null;
export const styleById = (id: string | null | undefined) => STYLES.find((s) => s.id === id) ?? null;

/** How many labels fit on one page of this layout. */
export const perPage = (l: SheetLayout) => l.cols * l.rows;

/** "1 x 2-5/8 in" style size text for a label, in the usual fractions. */
export function inches(n: number): string {
  const whole = Math.floor(n + 1e-6);
  const rest = n - whole;
  const fr: [number, string][] = [[0, ''], [1 / 8, '1/8'], [3 / 16, '3/16'], [1 / 4, '1/4'], [1 / 3, '1/3'], [3 / 8, '3/8'], [1 / 2, '1/2'], [5 / 8, '5/8'], [2 / 3, '2/3'], [3 / 4, '3/4'], [7 / 8, '7/8'], [1, '']];
  const [val, text] = fr.reduce((best, f) => (Math.abs(f[0] - rest) < Math.abs(best[0] - rest) ? f : best));
  const w = val === 1 ? whole + 1 : whole;
  return text ? (w ? `${w}-${text}` : text) : String(w);
}

export const sizeText = (l: SheetLayout) => `${inches(l.label[0])} x ${inches(l.label[1])} in`;

/** The @page rule and page boxes for printing, so the browser lays labels out exactly as the sheet expects. */
export function pageCss(l: SheetLayout): string {
  return `@media print { @page { size: ${l.page[0]}in ${l.page[1]}in; margin: 0; } html, body { margin: 0 !important; padding: 0 !important; } }`;
}

/** Split a list into pages for a layout. */
export function paginate<T>(items: T[], l: SheetLayout): T[][] {
  const n = perPage(l);
  const pages: T[][] = [];
  for (let i = 0; i < items.length; i += n) pages.push(items.slice(i, i + n));
  return pages;
}

/** A warehouse name fit to print: nothing when the name is an email address (new accounts start that way). */
export function printableName(name: string | null | undefined): string {
  const n = (name ?? '').trim();
  return /\S+@\S+\.\S+/.test(n) ? '' : n;
}

// Per-warehouse memory of the chosen printer and style, and of which spots this computer already printed.
const PRINTER_KEY = (wh: string) => `pl.printer.${wh}`;
const PRINTED_KEY = (wh: string) => `pl.printed.${wh}`;

export function loadPrinterChoice(wh: string | null | undefined): { printer: PrinterId | null; style: StyleId | null } {
  try {
    const raw = wh ? localStorage.getItem(PRINTER_KEY(wh)) : null;
    const v = raw ? (JSON.parse(raw) as { printer?: string; style?: string }) : {};
    const printer = printerById(v.printer);
    return { printer: printer?.id ?? null, style: printer && v.style && v.style in printer.styles ? (v.style as StyleId) : null };
  } catch {
    return { printer: null, style: null };
  }
}

export function savePrinterChoice(wh: string | null | undefined, printer: PrinterId | null, style: StyleId | null) {
  try {
    if (wh) localStorage.setItem(PRINTER_KEY(wh), JSON.stringify({ printer, style }));
  } catch {
    /* storage off: the flow asks again next time */
  }
}

export function loadPrinted(wh: string | null | undefined): Set<string> {
  try {
    const raw = wh ? localStorage.getItem(PRINTED_KEY(wh)) : null;
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function markPrinted(wh: string | null | undefined, ids: string[]) {
  if (!wh) return;
  try {
    const all = loadPrinted(wh);
    ids.forEach((id) => all.add(id));
    localStorage.setItem(PRINTED_KEY(wh), JSON.stringify([...all].slice(-20000)));
  } catch {
    /* storage off: "not printed yet" just lists every spot */
  }
}

/** The zone letter of a spot code: "A" for A-01-03-2, "B" for B-07. */
export function zoneOf(code: string): string {
  return /^([A-Z]+)-/.exec(code.toUpperCase())?.[1] ?? code.toUpperCase();
}

/** The aisle of a rack spot code: "A-01" for A-01-03-2; null for floor spots. */
export function aisleOf(code: string): string | null {
  return /^([A-Z]+-\d+)-\d+/.exec(code.toUpperCase())?.[1] ?? null;
}
