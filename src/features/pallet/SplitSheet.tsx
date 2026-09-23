// Controlled split (blueprint page 14, ticket C04): an online supervisor action that retires the
// parent and creates labeled children in one transaction, with lineage.

import { useState } from 'react';
import type { PalletDetail } from '../../demo/engine';
import { useApp } from '../../app/state';
import { CommandFeedback } from '../../ui/CommandFeedback';
import { Icon } from '../../ui/icons';
import { useCommand } from '../../ui/useCommand';
import { Field, Notice, Plate, Sheet, Spinner } from '../../ui/ui';
import { LabelSheet } from '../labels/LabelSheet';

export function SplitSheet({ detail, onClose }: { detail: PalletDetail; onClose: () => void }) {
  const { read, backend, go } = useApp();
  const p = detail.pallet;
  const jobs = (read((e, a, ws) => e.context(a, ws).jobs) ?? []).filter((j) => j.status === 'OPEN');
  const [rows, setRows] = useState([
    { description: `${p.description} (part 1)`, job_id: p.job_id },
    { description: `${p.description} (remainder)`, job_id: p.job_id },
  ]);
  const [reason, setReason] = useState('');
  const [verified, setVerified] = useState(false);
  const [preview, setPreview] = useState(false);
  const [labels, setLabels] = useState<string[] | null>(null);
  const cmd = useCommand();
  const offline = backend.network === 'offline';

  const valid = rows.length >= 2 && rows.every((r) => r.description.trim() && r.description.length <= 160 && r.job_id) && reason.trim() && verified;
  const update = (i: number, patch: Partial<(typeof rows)[number]>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const commit = async () => {
    const r = await cmd.run('split', { children: rows.map((x) => ({ description: x.description.trim(), job_id: x.job_id })), reason }, p);
    if (r.phase === 'done' && r.accepted?.created_ids) setLabels(r.accepted.created_ids);
  };
  const recover = async () => {
    const r = await cmd.recover();
    if (r.phase === 'done' && r.accepted?.created_ids) setLabels(r.accepted.created_ids);
  };

  if (labels) {
    const children = labels.map((id) => backend.db.pallets[id]).filter(Boolean);
    return (
      <Sheet title="Split committed" onClose={onClose} wide>
        <div className="stack">
          <Notice tone="ok" title={`${p.code} is retired. ${children.length} new pallets were created.`}>
            Every portion needs its new label now. If printing fails, reprint these same codes: the split is already committed and is never rolled back by a printer problem.
          </Notice>
          <div className="row">
            {children.map((c) => (
              <button key={c.id} className="btn" onClick={() => go({ name: 'pallet', id: c.id })}>
                <span className="pcode">{c.code}</span> {c.description}
              </button>
            ))}
          </div>
          <LabelSheetInline ids={labels} />
          <button className="btn primary" onClick={onClose}>
            Done
          </button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet title="Split pallet" onClose={onClose} wide>
      <div className="stack">
        <p className="muted" style={{ fontSize: 14 }}>
          Use this only when staff physically divide {p.code}. Every portion, including any remainder, becomes a new pallet with a new label. {p.code} is retired and linked to its children, so
          history can trace the split. No item quantities are claimed: you confirm the grouping physically.
        </p>
        {offline && <Notice tone="warn">Splits are online-only. Reconnect to continue.</Notice>}
        <div className="row">
          <span className="muted">Children will start at</span>
          {detail.location && <Plate code={detail.location.code} size="sm" />}
          <span className="muted">(the parent's confirmed location, recorded explicitly)</span>
        </div>
        {rows.map((r, i) => (
          <div key={i} className="panel" style={{ padding: 12 }}>
            <div className="row" style={{ alignItems: 'flex-end' }}>
              <div className="grow" style={{ minWidth: 200 }}>
                <Field label={`Portion ${i + 1} description`} htmlFor={`split-d-${i}`} count={r.description.length} max={160}>
                  <input id={`split-d-${i}`} className="input" value={r.description} onChange={(e) => update(i, { description: e.target.value })} maxLength={200} disabled={preview} />
                </Field>
              </div>
              <div style={{ minWidth: 180, flex: '0 1 220px' }}>
                <Field label="Job" htmlFor={`split-j-${i}`}>
                  <select id={`split-j-${i}`} className="select" value={r.job_id} onChange={(e) => update(i, { job_id: e.target.value })} disabled={preview}>
                    {jobs.map((j) => (
                      <option key={j.id} value={j.id}>
                        {j.code} · {j.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              {rows.length > 2 && !preview && (
                <button className="icon-btn" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} aria-label={`Remove portion ${i + 1}`}>
                  <Icon name="trash" />
                </button>
              )}
            </div>
          </div>
        ))}
        {!preview && rows.length < 20 && (
          <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => setRows((rs) => [...rs, { description: '', job_id: p.job_id }])}>
            <Icon name="plus" /> Add portion
          </button>
        )}
        <Field label="Reason" htmlFor="split-reason">
          <textarea id="split-reason" className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} disabled={preview} placeholder="e.g. Half goes to J-215 phase 2" style={{ minHeight: 60 }} />
        </Field>
        <label className="toggle">
          <input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} disabled={preview} />
          <span>I physically verified these {rows.length} portions and will label each one.</span>
        </label>
        <CommandFeedback state={cmd.state} onRecover={() => void recover()} />
        {!preview ? (
          <div className="row">
            <button className="btn primary big" disabled={!valid || offline} onClick={() => setPreview(true)}>
              Preview split
            </button>
            <button className="btn" onClick={onClose}>
              Cancel
            </button>
          </div>
        ) : (
          !cmd.locked && (
            <div className="stack">
              <Notice tone="warn" title="Review before committing">
                {p.code} will be retired. {rows.length} new codes will be issued: {rows.map((r) => `“${r.description}”`).join(', ')}.
              </Notice>
              <div className="row">
                <button className="btn primary big" onClick={() => void commit()} disabled={cmd.busy}>
                  {cmd.busy ? <Spinner /> : <Icon name="split" />} Commit split
                </button>
                <button className="btn" onClick={() => setPreview(false)} disabled={cmd.busy}>
                  Edit
                </button>
              </div>
            </div>
          )
        )}
      </div>
    </Sheet>
  );
}

function LabelSheetInline({ ids }: { ids: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn big" onClick={() => setOpen(true)}>
        <Icon name="print" /> Print {ids.length} new labels
      </button>
      {open && <LabelSheet palletIds={ids} onClose={() => setOpen(false)} />}
    </>
  );
}
