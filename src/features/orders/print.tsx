// What picking prints: the 4x6 package label (K-000045, scanned to stage and hand off), the packing slip that goes
// in the box, and tote labels (T-01 to T-08) for the cart. Each prints on its own, through the print root.

import { useEffect, useState } from 'react';
import { canPrint, IS_PREVIEW, printNow } from '../../device/output';
import { lineFilled, METHOD_LABEL, orderUnits, formatToteCode, SLOT_COLOR, type Order, type Package } from '../../domain/orders';
import type { Warehouse } from '../../domain/types';
import { Icon } from '../../ui/icons';
import { Notice } from '../../ui/ui';
import { Barcode128 } from '../labels/Barcode128';
import { PrintPortal } from '../labels/LabelSheet';

const dateOnly = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '');

/** The 4x6 label on each package: who it is for, the order, and the package barcode. */
export function PackageLabel({ order, pkg, total, warehouse }: { order: Order; pkg: Package; total: number | null; warehouse: Warehouse | null }) {
  return (
    <div className="pk-label" data-testid="package-label">
      <div className="pk-label-from">
        <strong>{warehouse?.name ?? ''}</strong>
        {warehouse?.address ? <span>{warehouse.address}</span> : null}
      </div>
      <div className="pk-label-method">{order.method === 'pickup' ? 'PICKUP' : 'SHIP TO'}</div>
      <div className="pk-label-to" data-keep-words>
        <strong>{order.customer.name}</strong>
        {order.method === 'ship' && order.customer.address ? <span>{order.customer.address}</span> : null}
        {order.customer.phone ? <span>{order.customer.phone}</span> : null}
      </div>
      <div className="pk-label-order">
        <span>
          Order <strong>{order.code}</strong>
          {order.external_ref ? <> · {order.external_ref}</> : null}
        </span>
        <span>
          Package {pkg.seq}
          {total ? ` of ${total}` : ''}
        </span>
      </div>
      <Barcode128 value={pkg.code} height="1.3in" className="pk-label-bc" />
      <div className="pk-label-code">{pkg.code}</div>
      <div className="pk-label-foot">
        <span>
          {pkg.unit_codes.length} item{pkg.unit_codes.length === 1 ? '' : 's'} · {pkg.box_type}
          {pkg.weight_lb ? ` · ${pkg.weight_lb} lb` : ''}
        </span>
        {order.due_at ? <span>Due {dateOnly(order.due_at)}</span> : null}
      </div>
    </div>
  );
}

/** The slip in the box: what was ordered, what is in this shipment, and what could not be filled. */
export function PackingSlip({ order, packages, warehouse }: { order: Order; packages: Package[]; warehouse: Warehouse | null }) {
  const live = packages.filter((k) => k.status !== 'CANCELLED');
  return (
    <div className="pk-slip" data-testid="packing-slip">
      <div className="pk-slip-head">
        <div>
          <h2>Packing slip</h2>
          <p>
            {warehouse?.name ?? ''}
            {warehouse?.address ? <><br />{warehouse.address}</> : null}
            {warehouse?.phone || warehouse?.contact_email ? <><br />{[warehouse?.phone, warehouse?.contact_email].filter(Boolean).join(' · ')}</> : null}
          </p>
        </div>
        <div className="pk-slip-code">
          <Barcode128 value={order.code} height={48} />
          <strong>{order.code}</strong>
        </div>
      </div>
      <table className="pk-slip-meta">
        <tbody>
          <tr>
            <th>{order.method === 'pickup' ? 'Pickup for' : 'Ship to'}</th>
            <td data-keep-words>
              {order.customer.name}
              {order.method === 'ship' && order.customer.address ? <><br />{order.customer.address}</> : null}
            </td>
          </tr>
          {order.external_ref && (
            <tr>
              <th>Your order</th>
              <td>{order.external_ref}</td>
            </tr>
          )}
          <tr>
            <th>Method</th>
            <td>{METHOD_LABEL[order.method]}</td>
          </tr>
          <tr>
            <th>Packed</th>
            <td>{dateOnly(live[0]?.packed_at ?? order.updated_at)}</td>
          </tr>
          {live.length > 0 && (
            <tr>
              <th>Packages</th>
              <td>{live.map((k) => k.code).join(', ')}</td>
            </tr>
          )}
        </tbody>
      </table>
      <table className="pk-slip-lines">
        <thead>
          <tr>
            <th>Item</th>
            <th>Product code</th>
            <th className="num">Ordered</th>
            <th className="num">Packed</th>
          </tr>
        </thead>
        <tbody>
          {order.lines.map((l) => {
            const subs = l.units.filter((u) => u.sub && u.sub.status !== 'rejected');
            const short = l.qty - lineFilled(l);
            return (
              <tr key={l.line_no}>
                <td data-keep-words>
                  {l.description}
                  {subs.map((u) => (
                    <div key={u.pallet_id} className="pk-slip-note">
                      Substituted with {u.description} ({u.product_code})
                    </div>
                  ))}
                  {short > 0 && <div className="pk-slip-note">{short} not available</div>}
                </td>
                <td className="mono">{l.product_code}</td>
                <td className="num">{l.qty}</td>
                <td className="num">{lineFilled(l)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {order.notes && <p className="pk-slip-foot" data-keep-words>Note: {order.notes}</p>}
      <p className="pk-slip-foot">
        {orderUnits(order).length} item{orderUnits(order).length === 1 ? '' : 's'} packed. Printed {new Date().toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}.
      </p>
    </div>
  );
}

/** Reusable tote labels for a cart: big letters for the eye, a barcode for the scanner. */
export function ToteLabels({ count = 8 }: { count?: number }) {
  return (
    <div className="tote-sheet" data-testid="tote-labels">
      {Array.from({ length: count }, (_, i) => {
        const code = formatToteCode(i + 1);
        const letter = String.fromCharCode(65 + i);
        return (
          <div key={code} className="tote-label" style={{ borderColor: SLOT_COLOR[letter]?.bg }}>
            <div className="tote-label-code">{code}</div>
            <Barcode128 value={code} height="0.9in" />
          </div>
        );
      })}
    </div>
  );
}

export type PrintDoc = { kind: 'label'; order: Order; pkg: Package; total: number | null } | { kind: 'slip'; order: Order; packages: Package[] } | { kind: 'totes' };

/** Prints one document: renders it into the print root, then opens the print dialog. */
export function usePrinter(warehouse: Warehouse | null) {
  const [doc, setDoc] = useState<PrintDoc | null>(null);
  const [seq, setSeq] = useState(0);
  useEffect(() => {
    if (!doc || !seq) return;
    const t = setTimeout(() => printNow(), 50);
    return () => clearTimeout(t);
  }, [doc, seq]);
  const portal = doc ? (
    <PrintPortal>
      {doc.kind === 'label' && <PackageLabel order={doc.order} pkg={doc.pkg} total={doc.total} warehouse={warehouse} />}
      {doc.kind === 'slip' && <PackingSlip order={doc.order} packages={doc.packages} warehouse={warehouse} />}
      {doc.kind === 'totes' && <ToteLabels />}
    </PrintPortal>
  ) : null;
  return {
    portal,
    print: (d: PrintDoc) => {
      setDoc(d);
      setSeq((n) => n + 1);
    },
    available: !IS_PREVIEW && canPrint(),
  };
}

/** Print buttons for a package: the 4x6 label and the packing slip. */
export function PackagePrintButtons({ order, pkg, packages, print, available }: { order: Order; pkg: Package; packages: Package[]; print: (d: PrintDoc) => void; available: boolean }) {
  if (!available)
    return (
      <Notice tone="info" icon="print">
        This preview cannot open a print dialog. Run the app locally to print the label and slip.
      </Notice>
    );
  const total = order.status === 'PICKED' ? null : packages.filter((k) => k.status !== 'CANCELLED').length;
  return (
    <div className="row">
      <button type="button" className="btn primary" onClick={() => print({ kind: 'label', order, pkg, total })}>
        <Icon name="print" /> Print 4x6 label
      </button>
      <button type="button" className="btn" onClick={() => print({ kind: 'slip', order, packages })}>
        <Icon name="print" /> Print packing slip
      </button>
    </div>
  );
}
