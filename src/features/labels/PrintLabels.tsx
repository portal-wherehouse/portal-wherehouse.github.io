// The labels the guided print flow makes, drawn at true size from a label's width and height in inches:
// spot labels (code, QR and barcode), shelf-edge labels (small barcode, no QR), section and aisle signs,
// and item or pallet labels. Each one fills exactly its cell on the sheet, so nothing is clipped.

import type { CSSProperties, ReactNode } from 'react';
import { makeLabelPayload } from '../../domain/codes';
import { palletContents } from '../../domain/receiving';
import type { Job, Location, Pallet } from '../../domain/types';
import { Barcode128 } from './Barcode128';
import { FitCode, KIND_LINE, PalletLabel, Qr } from './LabelCard';
import type { SheetLayout, StyleId } from './printers';

const IN = (n: number) => `${Math.max(0, Math.round(n * 1000) / 1000)}in`;

function Box({ w, h, pad, className, children, style }: { w: number; h: number; pad: number; className: string; children: ReactNode; style?: CSSProperties }) {
  return (
    <div className={`pl-label ${className}`} style={{ width: IN(w), height: IN(h), padding: IN(pad), ...style }}>
      {children}
    </div>
  );
}

/** Rack or floor spot: the code people read, a QR for phone cameras and a barcode for handheld scanners. */
export function SpotLabel({ location, token, warehouse, w, h }: { location: Location; token: string; warehouse: string; w: number; h: number }) {
  const payload = makeLabelPayload('L', token);
  const kind = KIND_LINE[location.kind];
  if (h > w * 1.2) {
    // Tall (4 x 6): QR on top, then the code, the barcode and a short reminder.
    const pad = 0.22;
    const qr = Math.min(w - pad * 2 - 0.6, h * 0.42);
    return (
      <Box w={w} h={h} pad={pad} className="pl-spot pl-tall">
        <div className="pl-kind" style={{ fontSize: IN(0.15) }}>{kind}</div>
        <FitCode text={location.code} className="pl-code" maxHeight={IN(0.85)} />
        <div className="pl-qr" style={{ width: IN(qr), height: IN(qr) }}>
          <Qr payload={payload} />
        </div>
        <div className="pl-bc" style={{ width: '100%' }}>
          <Barcode128 value={location.code} height={IN(0.55)} />
        </div>
        <div className="pl-foot" style={{ fontSize: IN(0.11) }}>
          <span>{warehouse}</span>
          <span>Scan the pallet first, then this label</span>
        </div>
      </Box>
    );
  }
  if (h >= 3) {
    // Big sheet label (3-1/3 x 4): the code across the top, QR beside the barcode below it.
    const pad = 0.2;
    const qr = Math.min(1.55, h - pad * 2 - 1.15);
    return (
      <Box w={w} h={h} pad={pad} className="pl-spot pl-stacked">
        <div className="pl-kind" style={{ fontSize: IN(0.13) }}>{kind}</div>
        <FitCode text={location.code} className="pl-code" maxHeight={IN(0.8)} />
        <div className="pl-row">
          <div className="pl-qr" style={{ width: IN(qr), height: IN(qr) }}>
            <Qr payload={payload} />
          </div>
          <div className="pl-col">
            <div className="pl-bc">
              <Barcode128 value={location.code} height={IN(0.5)} />
            </div>
            {warehouse && <div className="pl-small" style={{ fontSize: IN(0.1) }}>{warehouse}</div>}
            <div className="pl-small" style={{ fontSize: IN(0.1) }}>Scan the pallet first, then this label</div>
          </div>
        </div>
      </Box>
    );
  }
  // Wide and short (2 x 4, 1 x 2-5/8, 1-1/4 x 2-1/4): QR on the left, code and barcode on the right.
  const pad = h >= 1.5 ? 0.14 : 0.06;
  const qr = h - pad * 2;
  const side = w - pad * 2 - qr - 0.1;
  const barcode = side >= 1.2;
  return (
    <Box w={w} h={h} pad={pad} className="pl-spot pl-wide" style={{ paddingLeft: IN(Math.max(pad, 0.08)), paddingRight: IN(Math.max(pad, 0.08)) }}>
      <div className="pl-qr" style={{ width: IN(qr), height: IN(qr) }}>
        <Qr payload={payload} />
      </div>
      <div className="pl-col">
        {h >= 1.5 && <div className="pl-kind" style={{ fontSize: IN(0.11) }}>{kind}</div>}
        <FitCode text={location.code} className="pl-code" maxHeight={IN(h * (barcode ? 0.34 : 0.5))} />
        {barcode && (
          <div className="pl-bc">
            <Barcode128 value={location.code} height={IN(h * 0.3)} />
          </div>
        )}
      </div>
    </Box>
  );
}

/** Shelf edge: a small Code 128 barcode with the spot code under it. No QR, so it fits a shelf lip. */
export function ShelfLabel({ location, w, h }: { location: Location; w: number; h: number }) {
  const pad = Math.min(0.12, h * 0.08);
  const bcH = Math.min(h * 0.5, 0.75);
  const text = Math.min(0.24, Math.max(0.11, h * 0.16));
  // A barcode wider than about 2 in only makes it harder to aim at; keep it compact and centered.
  const bcW = Math.min(w - pad * 2, Math.max(1.4, location.code.length * 0.16));
  return (
    <Box w={w} h={h} pad={pad} className="pl-shelf">
      <div className="pl-bc" style={{ width: IN(bcW) }}>
        <Barcode128 value={location.code} height={IN(bcH)} />
      </div>
      <div className="pl-shelf-code" style={{ fontSize: IN(text) }}>
        {location.code}
      </div>
    </Box>
  );
}

export interface Section {
  /** "A" for a zone, "A-01" for an aisle. */
  code: string;
  kind: 'zone' | 'aisle';
  name: string;
  first: string;
  last: string;
  count: number;
}

/** A section or aisle sign: a big title, the zone's name, a large barcode and the spots it covers. */
export function SectionSign({ section, warehouse, w, h }: { section: Section; warehouse: string; w: number; h: number }) {
  const k = w / 8;
  const pad = 0.35 * k;
  return (
    <Box w={w} h={h} pad={pad} className="pl-sign">
      <div className="pl-sign-eyebrow" style={{ fontSize: IN(0.5 * k) }}>
        {section.kind === 'zone' ? 'Section' : 'Aisle'}
      </div>
      <div className="pl-sign-code" style={{ width: IN(Math.min(w - pad * 2, (section.kind === 'zone' ? 4.2 : 2.6) * k * section.code.length * 0.52)) }}>
        <FitCode text={section.code} maxHeight="none" />
      </div>
      {section.name && (
        <div className="pl-sign-name" style={{ fontSize: IN(0.42 * k) }}>
          {section.name}
        </div>
      )}
      <div className="pl-bc pl-sign-bc" style={{ width: IN(Math.min(w - pad * 2, 6 * k)) }}>
        <Barcode128 value={section.code} height={IN(1.3 * k)} />
      </div>
      <div className="pl-sign-range" style={{ fontSize: IN(0.24 * k) }}>
        {section.count === 1 ? `Spot ${section.first}` : `${section.count} spots, ${section.first} to ${section.last}`}
      </div>
      {warehouse && (
        <div className="pl-small" style={{ fontSize: IN(0.16 * k) }}>
          {warehouse}
        </div>
      )}
    </Box>
  );
}

/** Item or pallet label: the full-size designs for 4 x 6, 3-1/3 x 4 and 1 x 2-5/8, a compact one for the rest. */
export function ItemLabel({ pallet, job, token, warehouse, jobsOn, w, h }: { pallet: Pallet; job: Job | undefined; token: string; warehouse: string; jobsOn: boolean; w: number; h: number }) {
  const near = (a: number, b: number) => Math.abs(a - b) < 0.05;
  if (near(w, 4) && near(h, 6)) return <PalletLabel pallet={pallet} job={job} token={token} format="4x6" warehouse={warehouse} jobsOn={jobsOn} />;
  if (near(w, 4) && near(h, 10 / 3)) return <PalletLabel pallet={pallet} job={job} token={token} format="sheet" warehouse={warehouse} jobsOn={jobsOn} />;
  if (near(w, 2.625) && near(h, 1)) return <PalletLabel pallet={pallet} job={job} token={token} format="avery5160" warehouse={warehouse} jobsOn={jobsOn} />;
  const pad = h >= 1.5 ? 0.14 : 0.06;
  const qr = h - pad * 2;
  const barcode = w - qr - pad * 2 >= 2;
  return (
    <Box w={w} h={h} pad={pad} className="pl-item pl-wide" style={{ paddingLeft: IN(Math.max(pad, 0.08)), paddingRight: IN(Math.max(pad, 0.08)) }}>
      <div className="pl-qr" style={{ width: IN(qr), height: IN(qr) }}>
        <Qr payload={makeLabelPayload('P', token)} />
      </div>
      <div className="pl-col">
        <FitCode text={pallet.code} className="pl-code" maxHeight={IN(h * (barcode ? 0.3 : 0.42))} />
        <div className="pl-small pl-one" style={{ fontSize: IN(Math.max(0.085, Math.min(0.15, h * 0.11))) }}>
          {palletContents(pallet)}
        </div>
        {barcode && (
          <div className="pl-bc">
            <Barcode128 value={pallet.code} height={IN(h * 0.28)} />
          </div>
        )}
      </div>
    </Box>
  );
}

/** One label cell of a style, whatever it holds. */
export type PrintItem =
  | { kind: 'spot'; location: Location; token: string }
  | { kind: 'section'; section: Section }
  | { kind: 'pallet'; pallet: Pallet; job: Job | undefined; token: string };

export function LabelFor({ item, style, layout, warehouse, jobsOn }: { item: PrintItem; style: StyleId; layout: SheetLayout; warehouse: string; jobsOn: boolean }) {
  const [w, h] = layout.label;
  if (item.kind === 'section') return <SectionSign section={item.section} warehouse={warehouse} w={w} h={h} />;
  if (item.kind === 'pallet') return <ItemLabel pallet={item.pallet} job={item.job} token={item.token} warehouse={warehouse} jobsOn={jobsOn} w={w} h={h} />;
  if (style === 'shelf') return <ShelfLabel location={item.location} w={w} h={h} />;
  return <SpotLabel location={item.location} token={item.token} warehouse={warehouse} w={w} h={h} />;
}

/** Sheets of labels at true size. The same markup is the on-screen preview and the printed pages. */
export function Pages({ pages, layout, style, warehouse, jobsOn, className }: { pages: PrintItem[][]; layout: SheetLayout; style: StyleId; warehouse: string; jobsOn: boolean; className?: string }) {
  return (
    <>
      {pages.map((page, n) => (
        <div
          key={n}
          className={`pp-page${layout.cut ? ' cut' : ''}${className ? ` ${className}` : ''}`}
          data-testid="print-page"
          style={{
            width: IN(layout.page[0]),
            height: IN(layout.page[1]),
            paddingTop: IN(layout.margin[0]),
            paddingLeft: IN(layout.margin[1]),
            gridTemplateColumns: `repeat(${layout.cols}, ${IN(layout.label[0])})`,
            gridAutoRows: IN(layout.label[1]),
            columnGap: IN(layout.gap[0]),
            rowGap: IN(layout.gap[1]),
          }}
        >
          {page.map((item, i) => (
            <div key={i} className="pp-cell" style={{ width: IN(layout.label[0]), height: IN(layout.label[1]) }}>
              <LabelFor item={item} style={style} layout={layout} warehouse={warehouse} jobsOn={jobsOn} />
            </div>
          ))}
        </div>
      ))}
    </>
  );
}
