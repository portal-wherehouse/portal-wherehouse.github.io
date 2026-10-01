// Running low: products below the minimum set on Products and barcodes. From each row, bring some over from another
// of your warehouses on a transfer, or note that more is on order.

import { useState } from 'react';
import { useApp } from '../../app/state';
import { FirebaseBackend, cloudMessage } from '../../data/firebase';
import { fmtQty, measureWord, type LowRow } from '../../domain/stock';
import { roleAllows } from '../../domain/transitions';
import { CommandFeedback } from '../../ui/CommandFeedback';
import { Icon } from '../../ui/icons';
import { useCommand } from '../../ui/useCommand';
import { Empty, Field, Spinner, fmtAgo } from '../../ui/ui';
import { useHasTransferTargets } from '../transfers/targets';
import { useLowStock, useStockElsewhere } from './useStock';
import './stock.css';

export function RunningLow() {
  const { backend, go } = useApp();
  const rows = useLowStock();
  if (!rows && backend instanceof FirebaseBackend && backend.summary && !('low_stock' in backend.summary))
    return <p className="muted">Running low appears once the warehouse server is updated. Minimums can be set on Products and barcodes now.</p>;
  if (!rows)
    return (
      <p className="muted row nowrap">
        <Spinner /> Counting stock…
      </p>
    );
  if (rows.length === 0)
    return (
      <Empty icon="checkCircle" title="Nothing is running low">
        Every product with a minimum has enough on hand. Set minimums on{' '}
        <button className="btn ghost small" onClick={() => go('products')}>
          Products and barcodes
        </button>
      </Empty>
    );
  return (
    <div className="stack" data-testid="running-low">
      {backend instanceof FirebaseBackend && rows.length >= 100 && <p className="muted">Showing the first 100 products with a minimum.</p>}
      {rows.map((r) => (
        <LowCard key={r.product.id} row={r} />
      ))}
    </div>
  );
}

function LowCard({ row }: { row: LowRow }) {
  const { role, backend } = useApp();
  const p = row.product;
  const word = measureWord(p, row.min);
  const hasTargets = useHasTransferTargets();
  const cloud = backend instanceof FirebaseBackend;
  const [look, setLook] = useState(!cloud);
  const [noting, setNoting] = useState(false);
  const canNote = roleAllows(role, 'note_reorder');
  return (
    <div className="panel low-card" data-testid="low-row">
      <div className="low-head">
        <div className="low-name">
          <strong data-keep-words>{p.description}</strong>
          <span className="muted mono">{p.code}</span>
        </div>
        <div className="low-level" aria-label={`${fmtQty(row.on_hand)} on hand, minimum ${fmtQty(row.min)}`}>
          <span className="low-on">{fmtQty(row.on_hand)}</span>
          <span className="muted">of {fmtQty(row.min)} {word}</span>
        </div>
      </div>
      <div className="low-bar" aria-hidden="true">
        <span style={{ width: `${Math.min(100, Math.round((row.on_hand / row.min) * 100))}%` }} />
      </div>
      <p className="muted low-line">
        {row.suggest > 0 ? `Bring in ${fmtQty(row.suggest)} ${measureWord(p, row.suggest)}${p.reorder_qty ? ' (the reorder quantity)' : ' to reach the minimum'}.` : ''}
        {row.stock.held > 0 ? ` ${row.stock.held} more on hold, not counted.` : ''}
      </p>
      {p.reorder_note && (
        <div className="notice ok low-note">
          <Icon name="check" />
          <div>
            <div className="n-title">Reorder noted by {p.reorder_note.by_name || 'a manager'} {fmtAgo(p.reorder_note.at)}</div>
            {p.reorder_note.note && <div className="n-body" data-keep-words>{p.reorder_note.note}</div>}
          </div>
        </div>
      )}
      {hasTargets && roleAllows(role, 'create_transfer') && (look ? <Elsewhere row={row} /> : (
        <button className="btn small" onClick={() => setLook(true)}>
          <Icon name="find" /> Check other warehouses
        </button>
      ))}
      {canNote && !noting && (
        <div className="row">
          {p.reorder_note ? <ClearReorder id={p.id} /> : (
            <button className="btn small" onClick={() => setNoting(true)}>
              <Icon name="edit" /> Note a reorder
            </button>
          )}
        </div>
      )}
      {noting && <NoteReorder id={p.id} name={p.description} onDone={() => setNoting(false)} />}
    </div>
  );
}

/** Other warehouses with this product, each with a button that starts a transfer from there to here. */
function Elsewhere({ row }: { row: LowRow }) {
  const app = useApp();
  const { backend, workspaceId, go, toast } = app;
  const { rows, loading, error } = useStockElsewhere(row.product.code);
  const [busy, setBusy] = useState('');
  if (loading)
    return (
      <p className="muted row nowrap">
        <Spinner /> Checking your other warehouses…
      </p>
    );
  if (error) return <p className="muted">{error}</p>;
  if (!rows.length) return <p className="muted low-line">None in your other warehouses.</p>;
  const bring = async (ws: string) => {
    if (!workspaceId) return;
    const q = new URLSearchParams({ to: workspaceId, product: row.product.code, need: String(row.suggest), by: row.product.count_by ?? 'units' }).toString();
    setBusy(ws);
    try {
      if (backend instanceof FirebaseBackend) await backend.switchWarehouse(ws);
      else app.setWorkspace(ws);
      go({ name: 'transfer', id: 'new', q });
    } catch (e) {
      toast(cloudMessage(e), 'error');
    } finally {
      setBusy('');
    }
  };
  return (
    <div className="row low-elsewhere">
      {rows.map((w) => (
        <button key={w.workspace_id} className="btn small primary" onClick={() => void bring(w.workspace_id)} disabled={!!busy}>
          {busy === w.workspace_id ? <Spinner /> : <Icon name="swap" />} Bring from {w.name} ({row.product.count_by === 'quantity' ? `${fmtQty(w.qty)} ${measureWord(row.product, w.qty)}` : `${w.units} ${measureWord(row.product, w.units)}`})
        </button>
      ))}
    </div>
  );
}

function NoteReorder({ id, name, onDone }: { id: string; name: string; onDone: () => void }) {
  const { toast, backend, actorId } = useApp();
  const cmd = useCommand();
  const [note, setNote] = useState('');
  const save = async () => {
    const r = await cmd.run('note_reorder', { product_id: id, ...(note.trim() ? { note: note.trim() } : {}) });
    if (r.phase === 'done') {
      if (backend instanceof FirebaseBackend) backend.patchLowStock(id, { at: new Date().toISOString(), by_name: (actorId && backend.db.users[actorId]?.name) || '', note: note.trim() });
      toast(`Reorder noted for ${name}. It clears when more is received.`);
      onDone();
    }
  };
  return (
    <form
      className="stack low-form"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <Field label="Note (optional)" htmlFor={`reorder-${id}`} hint="For example the order number or when it is due. Clears itself when this product is received.">
        <input id={`reorder-${id}`} className="input" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="PO 4471, due Friday" autoFocus />
      </Field>
      <CommandFeedback state={cmd.state} onRecover={() => void cmd.recover()} />
      <div className="row">
        <button className="btn primary small" disabled={cmd.busy}>
          {cmd.busy ? <Spinner /> : <Icon name="check" />} Save reorder note
        </button>
        <button type="button" className="btn small" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function ClearReorder({ id }: { id: string }) {
  const cmd = useCommand();
  const { toast, backend } = useApp();
  const clear = async () => {
    const r = await cmd.run('note_reorder', { product_id: id, clear: true });
    if (r.phase === 'done') {
      if (backend instanceof FirebaseBackend) backend.patchLowStock(id, null);
      toast('Reorder note cleared.');
    }
    else if (r.phase === 'rejected') toast(r.message ?? 'Not saved', 'error');
  };
  return (
    <button className="btn small ghost" onClick={() => void clear()} disabled={cmd.busy}>
      {cmd.busy ? <Spinner /> : <Icon name="x" />} Clear reorder note
    </button>
  );
}
