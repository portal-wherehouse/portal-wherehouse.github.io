// The dispatch slip: a printed record of one send that is not a customer order. What left, where it went, who sent
// it and when, a signature line for whoever takes it, and the dispatch number as a Code 128 barcode.

import { useEffect, useState } from 'react';
import { useApp } from '../../app/state';
import { FirebaseBackend, cloudMessage } from '../../data/firebase';
import type { Pallet } from '../../domain/types';
import { canPrint, IS_PREVIEW, printNow } from '../../device/output';
import { Icon } from '../../ui/icons';
import { Notice, Spinner, fmtFull } from '../../ui/ui';
import { Barcode128 } from '../labels/Barcode128';
import { PrintPortal } from '../labels/LabelSheet';
import './stock.css';

/** The pallets on one dispatch, from this device (sample) or the warehouse (live). */
function useDispatchUnits(dispatchRef: string): { units: Pallet[] | null; error: string } {
  const { backend, read, v } = useApp();
  const cloud = backend instanceof FirebaseBackend ? backend : null;
  const [live, setLive] = useState<{ units: Pallet[] | null; error: string }>({ units: null, error: '' });
  useEffect(() => {
    if (!cloud) return;
    let alive = true;
    cloud
      .dispatchUnits(dispatchRef)
      .then((units) => alive && setLive({ units, error: '' }))
      .catch((e) => alive && setLive({ units: [], error: cloudMessage(e) }));
    return () => {
      alive = false;
    };
  }, [cloud, dispatchRef]);
  if (cloud) return live;
  void v;
  return { units: read((e, a, ws) => e.dispatchUnits(a, ws, dispatchRef)) ?? [], error: '' };
}

export function DispatchSlip({ dispatchRef, onClose }: { dispatchRef: string; onClose: () => void }) {
  const { read, backend } = useApp();
  const { units, error } = useDispatchUnits(dispatchRef);
  const wh = read((e, a, ws) => e.context(a, ws).warehouse);
  const first = units?.find((u) => u.dispatch)?.dispatch ?? null;
  const notes = [...new Set((units ?? []).map((u) => u.dispatch?.note).filter(Boolean))] as string[];
  const senders = [...new Set((units ?? []).map((u) => u.dispatch?.by_name).filter(Boolean))] as string[];
  const at = (units ?? []).map((u) => u.dispatch?.at ?? '').filter(Boolean).sort()[0] ?? null;
  const spot = (p: Pallet) => (p.last_confirmed_location_id ? (backend.db.locations[p.last_confirmed_location_id]?.code ?? '') : '');
  const body = (
    <div className="ds-slip" data-testid="dispatch-slip">
      <div className="ds-head">
        <div>
          <h2>Dispatch slip</h2>
          <p data-keep-words>
            {wh?.name ?? 'Warehouse'}
            {wh?.address ? ` · ${wh.address}` : ''}
          </p>
          <p>
            <strong>{dispatchRef}</strong>
          </p>
        </div>
        <Barcode128 value={dispatchRef} height={56} showText className="ds-code" />
      </div>
      <table className="ds-meta">
        <tbody>
          <tr>
            <th>To</th>
            <td colSpan={3} data-keep-words>
              {first?.destination || 'Not recorded'}
            </td>
          </tr>
          <tr>
            <th>Sent by</th>
            <td data-keep-words>{senders.join(', ') || 'Not recorded'}</td>
            <th>Date</th>
            <td>{at ? fmtFull(at) : ''}</td>
          </tr>
          {notes.length > 0 && (
            <tr>
              <th>Note</th>
              <td colSpan={3} data-keep-words>
                {notes.join(' · ')}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <table className="t">
        <thead>
          <tr>
            <th>Pallet</th>
            <th>Description</th>
            <th>Quantity</th>
            <th>Left from</th>
          </tr>
        </thead>
        <tbody>
          {(units ?? []).map((u) => (
            <tr key={u.id}>
              <td className="mono">{u.code}</td>
              <td data-keep-words>
                {u.description}
                {u.receiving?.product_code ? <span className="ds-sub"> {u.receiving.product_code}</span> : null}
              </td>
              <td data-keep-words>{[u.receiving?.quantity, u.receiving?.unit].filter(Boolean).join(' ')}</td>
              <td>{spot(u)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="ds-count">
        {units?.length ?? 0} {units?.length === 1 ? 'pallet' : 'pallets'} on this dispatch.
      </p>
      <div className="ds-sign">
        <div>
          <span />
          Received by (signature)
        </div>
        <div>
          <span />
          Printed name
        </div>
        <div>
          <span />
          Date
        </div>
      </div>
    </div>
  );
  return (
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet wide" role="dialog" aria-modal="true" aria-label="Dispatch slip">
        <div className="sheet-head">
          <h2>Dispatch slip</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        <div className="stack">
          {error && <Notice tone="error">{error}</Notice>}
          {units === null ? (
            <p className="muted row nowrap">
              <Spinner /> Loading the dispatch…
            </p>
          ) : (
            <div className="ds-preview">{body}</div>
          )}
          {IS_PREVIEW ? (
            <Notice tone="info" icon="print">
              This hosted preview cannot open a print dialog. Run the app locally to print.
            </Notice>
          ) : (
            <button className="btn primary big" onClick={printNow} disabled={!canPrint() || !units?.length}>
              <Icon name="print" /> Print
            </button>
          )}
        </div>
      </div>
      {units && <PrintPortal>{body}</PrintPortal>}
    </div>
  );
}
