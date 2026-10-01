// Change a pallet's quantity with a reason: used some, damaged, written off, found extra, or counted. When the
// warehouse asks for approval, an operator's change waits for a manager, who approves it or turns it down.

import { useState } from 'react';
import { useApp } from '../../app/state';
import type { PalletDetail } from '../../demo/engine';
import { ADJUST_HINT, ADJUST_LABEL, ADJUST_REASONS, adjustLine, adjustQty, fmtQty, parseQty } from '../../domain/stock';
import type { AdjustReason, Pallet } from '../../domain/types';
import { roleAllows } from '../../domain/transitions';
import { CommandFeedback } from '../../ui/CommandFeedback';
import { Icon } from '../../ui/icons';
import { useCommand } from '../../ui/useCommand';
import { Field, Notice, Sheet, Spinner, fmtAgo } from '../../ui/ui';
import './stock.css';

export function AdjustSheet({ detail, onClose }: { detail: PalletDetail; onClose: () => void }) {
  const { read, role, toast } = useApp();
  const cmd = useCommand();
  const p = detail.pallet;
  const approval = !!read((e, a, ws) => e.context(a, ws).warehouse?.adjust_approval) && role === 'OPERATOR';
  const recorded = parseQty(p.receiving?.quantity);
  const unit = p.receiving?.unit?.trim() ?? '';
  const [reason, setReason] = useState<AdjustReason>(recorded === null ? 'counted' : 'used');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const n = amount.trim() === '' ? NaN : Number(amount.replace(/,/g, ''));
  const outcome = Number.isFinite(n) ? adjustQty(p.receiving?.quantity, reason, n) : null;
  const conflict = cmd.state.rejected?.code === 'VERSION_CONFLICT';

  const submit = async () => {
    if (!outcome?.ok) return;
    const r = await cmd.run('adjust_qty', { reason, amount: n, ...(note.trim() ? { note: note.trim() } : {}) }, p);
    if (r.phase === 'done') {
      toast(approval ? `${p.code}: sent for approval` : `${p.code}: quantity is now ${fmtQty(outcome.to)}${unit ? ` ${unit}` : ''}`);
      onClose();
    }
  };

  return (
    <Sheet title="Change quantity" onClose={onClose}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="row" style={{ gap: 8 }}>
          <span className="pcode" style={{ fontSize: 24 }}>
            {p.code}
          </span>
          <span style={{ fontWeight: 600 }} data-keep-words>
            {p.description}
          </span>
        </div>
        <p className="muted" style={{ margin: 0 }}>
          Recorded now: <strong data-keep-words>{recorded === null ? 'no quantity' : `${p.receiving?.quantity}${unit ? ` ${unit}` : ''}`}</strong>
        </p>
        <div className="field">
          <span className="label" id="adj-reason-label">
            Reason
          </span>
          <div className="reason-grid" role="group" aria-labelledby="adj-reason-label">
            {ADJUST_REASONS.map((r) => (
              <button key={r} type="button" aria-pressed={reason === r} onClick={() => setReason(r)}>
                {ADJUST_LABEL[r]}
              </button>
            ))}
          </div>
          <span className="hint">{ADJUST_HINT[reason]}</span>
        </div>
        <Field label={reason === 'counted' ? 'New total' : 'How many'} htmlFor="adj-amount">
          <div className="row nowrap">
            <input id="adj-amount" className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={reason === 'counted' ? '10' : '3'} maxLength={14} style={{ maxWidth: 160 }} autoFocus />
            {unit && <span className="muted" data-keep-words>{unit}</span>}
          </div>
        </Field>
        {outcome && (outcome.ok ? (
          <div className="adjust-preview" data-testid="adjust-preview">
            <span>{outcome.from === null ? 'None recorded' : fmtQty(outcome.from)}</span>
            <Icon name="arrowRight" />
            <strong>{fmtQty(outcome.to)}</strong>
            {unit && <span className="muted" data-keep-words>{unit}</span>}
          </div>
        ) : (
          <Notice tone="warn">{outcome.message}</Notice>
        ))}
        {outcome?.ok && outcome.to === 0 && <Notice tone="warn">Nothing will be left, so the pallet is retired{approval ? ' once a manager approves' : ''}. Its history is kept.</Notice>}
        <Field label="Note (optional)" htmlFor="adj-note" hint="Saved in the history with your name.">
          <input id="adj-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="For example the job it was used on" />
        </Field>
        {approval && (
          <Notice tone="info" icon="lock">
            A manager approves quantity changes in this warehouse. Your change waits on the pallet until they do.
          </Notice>
        )}
        {conflict && <Notice tone="warn" title={`${p.code} changed`}>Close this and check the record, then try again.</Notice>}
        <CommandFeedback state={cmd.state} onRecover={() => void cmd.recover()} />
        {!cmd.locked && (
          <div className="row">
            <button className="btn big primary" disabled={!outcome?.ok || cmd.busy || conflict}>
              {cmd.busy ? <Spinner /> : <Icon name="check" />} {approval ? 'Ask for approval' : 'Save quantity'}
            </button>
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
          </div>
        )}
      </form>
    </Sheet>
  );
}

/** The change waiting on a pallet, in one line. */
export function pendingLine(p: Pallet): string {
  const a = p.pending_adjust;
  if (!a) return '';
  return adjustLine(a.reason, a.amount, a.from_qty, a.to_qty, p.receiving?.unit || null);
}

/** Approve or turn down a quantity change waiting on a pallet. Shown to managers. */
export function ReviewAdjust({ pallet }: { pallet: Pallet }) {
  const { role, toast } = useApp();
  const cmd = useCommand();
  const a = pallet.pending_adjust;
  if (!a) return null;
  const run = async (approve: boolean) => {
    const r = await cmd.run('review_adjust', { approve }, pallet);
    if (r.phase === 'done') toast(approve ? `${pallet.code}: quantity change approved` : `${pallet.code}: quantity change turned down`);
    else if (r.phase === 'rejected') toast(r.message ?? 'Not saved', 'error');
  };
  return (
    <div className="pending-adjust" data-testid="pending-adjust">
      <div>
        <strong data-keep-words>{pendingLine(pallet)}</strong>
        <div className="muted" style={{ fontSize: 13.5 }}>
          <span data-keep-words>
            Asked by {a.by_name || 'a team member'} {fmtAgo(a.at)}
            {a.note ? `: ${a.note}` : ''}
          </span>
        </div>
      </div>
      {roleAllows(role, 'review_adjust') ? (
        <div className="row">
          <button className="btn small primary" onClick={() => void run(true)} disabled={cmd.busy}>
            {cmd.busy ? <Spinner /> : <Icon name="check" />} Approve
          </button>
          <button className="btn small" onClick={() => void run(false)} disabled={cmd.busy}>
            <Icon name="x" /> Turn down
          </button>
        </div>
      ) : (
        <span className="muted result-hint">Waiting for a manager to approve.</span>
      )}
    </div>
  );
}
