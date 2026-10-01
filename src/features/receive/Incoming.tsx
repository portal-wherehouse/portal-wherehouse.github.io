// Incoming: what imported delivery lists say is on its way. Nothing here is stock until it is received.

import { Fragment, useMemo, useState } from 'react';
import { useApp } from '../../app/state';
import type { ExpectedShipment } from '../../domain/receiving';
import { roleAllows } from '../../domain/transitions';
import { Icon } from '../../ui/icons';
import { Explain, PageHead, Sheet, fmtAgo, fmtFull } from '../../ui/ui';
import { ReceiveTabs } from '../../ui/tabSets';

type Show = 'waiting' | 'received' | 'all';

export function Incoming() {
  const { backend, workspaceId, go, role, route, v } = useApp();
  const [q, setQ] = useState(route.q ?? '');
  const [show, setShow] = useState<Show>('waiting');
  const [open, setOpen] = useState<string | null>(null);
  const rows = useMemo(
    () => Object.values(backend.db.shipments).filter((r) => r.workspace_id === workspaceId).sort((a, b) => b.created_at.localeCompare(a.created_at)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [v, workspaceId],
  );
  const jobCode = (r: ExpectedShipment) => (r.job_id ? backend.db.jobs[r.job_id]?.code ?? '' : '');
  const needle = q.trim().toLowerCase();
  const waiting = rows.filter((r) => !r.pallet_id).length;
  const hits = rows.filter((r) => {
    if (show === 'waiting' && r.pallet_id) return false;
    if (show === 'received' && !r.pallet_id) return false;
    if (!needle) return true;
    const hay = [r.description, r.barcode, r.notes, jobCode(r), r.receiving.product_code, r.receiving.category ?? '', r.receiving.destination, r.receiving.quantity, r.receiving.unit, ...r.receiving.fields.map((f) => `${f.name} ${f.value}`)].join('\n').toLowerCase();
    return needle.split(/\s+/).every((w) => hay.includes(w));
  });
  const current = open ? backend.db.shipments[open] : undefined;
  const canReceive = roleAllows(role, 'receive');

  return (
    <div className="stack">
      <ReceiveTabs />
      <PageHead title="Incoming" sub={`${waiting} item${waiting === 1 ? '' : 's'} expected. None of these are stock until they're received.`} />
      <Explain title="How Incoming works">
        <p>Incoming holds the delivery lists you import. When a delivery arrives, scan a pallet's barcode on Receive: Wherehouse finds it here and fills in the details. Check them and save, and it becomes a pallet on hand with its own Wherehouse label.</p>
        <p>No barcode on the list, or the label won't scan? Search for it here and tap Receive pallet. Everything is filled in the same way.</p>
      </Explain>
      <div className="search-bar">
        <Icon name="find" />
        <label htmlFor="incoming-q" className="sr-only">
          Search incoming
        </label>
        <input id="incoming-q" className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search description, barcode, product, job" autoComplete="off" />
      </div>
      <div className="seg" role="group" aria-label="Show">
        {(['waiting', 'received', 'all'] as Show[]).map((s) => (
          <button key={s} aria-pressed={show === s} onClick={() => setShow(s)}>
            {s === 'waiting' ? 'Still coming' : s === 'received' ? 'Received' : 'All'}
          </button>
        ))}
      </div>
      {rows.length === 0 ? (
        <div className="panel stack">
          <p style={{ margin: 0 }}>Nothing is expected yet. Import a supplier's delivery list and each row shows up here.</p>
          <button className="btn primary" style={{ alignSelf: 'flex-start' }} onClick={() => go('import')}>
            <Icon name="import" /> Import a delivery list
          </button>
        </div>
      ) : hits.length === 0 ? (
        <p className="muted">{needle ? `Nothing matches “${q.trim()}”.` : show === 'waiting' ? 'Everything on your lists has been received.' : 'Nothing here yet.'}</p>
      ) : (
        <div className="stack" style={{ gap: 6 }} data-testid="incoming-list">
          {hits.map((r) => (
            <button key={r.id} className="import-row" onClick={() => setOpen(r.id)}>
              <span className={`tag ${r.pallet_id ? 'ok' : ''}`}>{r.pallet_id ? 'Received' : 'Coming'}</span>
              <span className="grow">
                <strong>{r.description || r.barcode}</strong>
                <span className="muted">
                  {[r.receiving.quantity && `${r.receiving.quantity} ${r.receiving.unit}`.trim(), r.receiving.category, jobCode(r) && `Job ${jobCode(r)}`].filter(Boolean).map((t) => ` · ${t}`)}
                </span>
              </span>
              <span className="muted mono">{r.barcode || 'No barcode'}</span>
              <Icon name="chevronRight" />
            </button>
          ))}
        </div>
      )}
      {current && (
        <Sheet title={current.description || current.barcode} onClose={() => setOpen(null)}>
          <div className="stack">
            <dl className="kv">
              <dt>Status</dt>
              <dd>{current.pallet_id ? 'Received' : 'Still coming, not stock yet'}</dd>
              <dt>Barcode</dt>
              <dd className="mono">{current.barcode || 'None on the list'}</dd>
              {current.receiving.quantity && (
                <>
                  <dt>Quantity</dt>
                  <dd>{`${current.receiving.quantity} ${current.receiving.unit}`.trim()}</dd>
                </>
              )}
              {current.receiving.product_code && (
                <>
                  <dt>Product code</dt>
                  <dd className="mono">{current.receiving.product_code}</dd>
                </>
              )}
              {current.receiving.category && (
                <>
                  <dt>Category</dt>
                  <dd>{current.receiving.category}</dd>
                </>
              )}
              {jobCode(current) && (
                <>
                  <dt>Job</dt>
                  <dd>{jobCode(current)}</dd>
                </>
              )}
              {current.receiving.destination && (
                <>
                  <dt>Going to</dt>
                  <dd>{current.receiving.destination}</dd>
                </>
              )}
              {current.receiving.fields.map((f) => (
                <Fragment key={f.name}>
                  <dt>{f.name}</dt>
                  <dd>{f.value}</dd>
                </Fragment>
              ))}
              {current.notes && (
                <>
                  <dt>Notes</dt>
                  <dd>{current.notes}</dd>
                </>
              )}
              <dt>Imported</dt>
              <dd>
                {fmtFull(current.created_at)} ({fmtAgo(current.created_at)})
              </dd>
            </dl>
            {current.pallet_id ? (
              <button className="btn primary" onClick={() => go({ name: 'pallet', id: current.pallet_id! })}>
                <Icon name="find" /> Open the pallet
              </button>
            ) : canReceive ? (
              <button className="btn primary big" onClick={() => go({ name: 'receive', id: current.id })}>
                <Icon name="receive" /> Receive pallet
              </button>
            ) : null}
            {!current.pallet_id && (
              <p className="hint" style={{ margin: 0 }}>
                Receive pallet opens Receive with these details filled in. Nothing is saved until you check them and tap Save pallet there.
              </p>
            )}
          </div>
        </Sheet>
      )}
    </div>
  );
}
