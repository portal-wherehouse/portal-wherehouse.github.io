// Jobs: list, create, close/reopen, and a job page with a pick list sorted by rack (pages 9, 15).

import { useMemo, useState } from 'react';
import { normalizeCode } from '../../domain/codes';
import { roleAllows } from '../../domain/transitions';
import type { Job, Pallet } from '../../domain/types';
import { useApp } from '../../app/state';
import { canPrint, IS_PREVIEW, printNow } from '../../device/output';
import { Icon } from '../../ui/icons';
import { Empty, Explain, Field, HoldBadge, Notice, PageHead, StateBadge, StatTile, fmtAgo } from '../../ui/ui';
import { PrintPortal } from '../labels/LabelSheet';
import { AdminSheet } from './AdminSheet';

export function Jobs() {
  const { read, go, role, backend, v } = useApp();
  const [filter, setFilter] = useState<'OPEN' | 'CLOSED' | 'ALL'>('OPEN');
  const [creating, setCreating] = useState(false);
  const data = useMemo(
    () => read((e, a, ws) => ({ jobs: e.context(a, ws).jobs, counts: e.jobCounts(ws) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [v, backend.network],
  );
  if (!data) return null;
  const jobs = data.jobs.filter((j) => filter === 'ALL' || j.status === filter);
  const canAdmin = roleAllows(role, 'create_job');

  return (
    <div className="stack">
      <PageHead
        title="Jobs"
        sub="A job is the project that owns the material. Every pallet belongs to exactly one job."
        actions={
          canAdmin && (
            <button className="btn primary" onClick={() => setCreating(true)} disabled={backend.network === 'offline'}>
              <Icon name="plus" /> New job
            </button>
          )
        }
      />
      <Explain refs="pages 9, 34 (C02)">
        <p>Jobs are created by supervisors. Material can only be received against an open job. A job cannot be closed while any of its pallets are received, stored or missing, or while a hold is unresolved, so nothing is quietly left behind.</p>
      </Explain>
      <div className="seg" role="group" aria-label="Job status">
        {(['OPEN', 'CLOSED', 'ALL'] as const).map((f) => (
          <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {f === 'OPEN' ? 'Open' : f === 'CLOSED' ? 'Closed' : 'All'}
          </button>
        ))}
      </div>
      {jobs.length === 0 ? (
        <Empty icon="jobs" title="No jobs here" />
      ) : (
        <div className="table-wrap" data-tour="jobs-table">
          <table className="t">
            <thead>
              <tr>
                <th>Job</th>
                <th className="n">Waiting</th>
                <th className="n">Stored</th>
                <th className="n">Missing</th>
                <th className="n">Holds</th>
                <th className="n">Dispatched</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => {
                const c = data.counts[j.id] ?? {};
                return (
                  <tr key={j.id} className="click" onClick={() => go({ name: 'job', id: j.id })}>
                    <td>
                      <span className="jcode">{j.code}</span> {j.name} {j.status === 'CLOSED' && <span className="tag">closed</span>}
                    </td>
                    <td className="n">{c.RECEIVED ?? 0}</td>
                    <td className="n">{c.STORED ?? 0}</td>
                    <td className="n">{c.MISSING ? <strong style={{ color: 'var(--bad)' }}>{c.MISSING}</strong> : 0}</td>
                    <td className="n">{c.HOLD ?? 0}</td>
                    <td className="n">{c.DISPATCHED ?? 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {creating && <CreateJob onClose={() => setCreating(false)} />}
    </div>
  );
}

function CreateJob({ onClose }: { onClose: () => void }) {
  const { go } = useApp();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [dest, setDest] = useState('');
  return (
    <AdminSheet
      title="New job"
      kind="create_job"
      verb="Create job"
      intro="Job codes are shown on every label, so keep them short. Codes are stored in capitals without extra spaces."
      valid={!!normalizeCode(code) && normalizeCode(code).length <= 20 && !!name.trim() && name.length <= 120}
      payload={() => ({ code, name, destination_notes: dest || undefined })}
      onDone={(id) => id && go({ name: 'job', id })}
      onClose={onClose}
    >
      <Field label="Job code" htmlFor="job-code" hint={code ? `Saved as ${normalizeCode(code) || '…'}` : 'For example J-240'} count={normalizeCode(code).length} max={20}>
        <input id="job-code" className="input code" value={code} onChange={(e) => setCode(e.target.value)} autoCapitalize="characters" />
      </Field>
      <Field label="Name" htmlFor="job-name" count={name.length} max={120}>
        <input id="job-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Riverside clinic fit-out" />
      </Field>
      <Field label="Destination notes (optional)" htmlFor="job-dest" hint="Pre-fills the destination when pallets are dispatched.">
        <textarea id="job-dest" className="textarea" style={{ minHeight: 60 }} value={dest} onChange={(e) => setDest(e.target.value)} />
      </Field>
    </AdminSheet>
  );
}

export function JobDetail() {
  const { read, go, route, role, backend, v } = useApp();
  const [sheet, setSheet] = useState<'close' | 'reopen' | null>(null);
  const [printing, setPrinting] = useState(false);
  const data = useMemo(
    () =>
      read((e, _a, ws) => {
        const job = e.db.jobs[route.id ?? ''];
        if (!job || job.workspace_id !== ws) return null;
        const pallets = Object.values(e.db.pallets).filter((p) => p.job_id === job.id && !p.archived_at);
        const loc = (p: Pallet) => (p.current_location_id ? e.db.locations[p.current_location_id]?.code ?? '' : '');
        const onHand = pallets.filter((p) => p.state === 'STORED' || p.state === 'RECEIVED').sort((a, b) => loc(a).localeCompare(loc(b)) || a.code.localeCompare(b.code));
        return {
          job,
          wh: e.activeWarehouse(ws),
          onHand,
          missing: pallets.filter((p) => p.state === 'MISSING'),
          dispatched: pallets.filter((p) => p.state === 'DISPATCHED'),
          retired: pallets.filter((p) => p.state === 'RETIRED'),
          holds: pallets.filter((p) => p.hold && p.state !== 'RETIRED').length,
          loc,
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [v, backend.network, route.id],
  );
  if (!data) return <Empty icon="jobs" title="Job not found">It may belong to another workspace.</Empty>;
  const { job } = data;
  const canAdmin = roleAllows(role, 'close_job');
  const blockers = data.onHand.length + data.missing.length + data.holds;

  return (
    <div className="stack">
      <PageHead
        eyebrow={<span className="jcode">{job.code}</span>}
        title={job.name}
        sub={job.destination_notes ? `Destination: ${job.destination_notes}` : undefined}
        actions={
          <>
            {job.status === 'CLOSED' && <span className="tag">Closed</span>}
            <button className="btn" onClick={() => go({ name: 'find', q: job.code })}>
              <Icon name="find" /> Search
            </button>
          </>
        }
      />
      <div className="stats">
        <StatTile label="On hand" icon="pallet" value={data.onHand.length} />
        <StatTile label="Missing" icon="question" value={data.missing.length} />
        <StatTile label="On hold" icon="hold" value={data.holds} />
        <StatTile label="Dispatched" icon="truck" value={data.dispatched.length} />
      </div>

      <div className="panel stack" data-tour="pick-list">
        <div className="panel-title">
          Pick list: on hand, sorted by rack <span className="grow" />
          {data.onHand.length > 0 && (
            <button className="btn small" onClick={() => setPrinting(true)}>
              <Icon name="print" /> Print pick list
            </button>
          )}
        </div>
        {data.onHand.length === 0 ? <p className="muted">Nothing on hand for this job.</p> : <PickTable job={job} pallets={data.onHand} loc={data.loc} onOpen={(id) => go({ name: 'pallet', id })} />}
      </div>

      {data.missing.length > 0 && (
        <div className="panel stack">
          <div className="panel-title">Missing</div>
          <PickTable job={job} pallets={data.missing} loc={(p) => (p.last_confirmed_location_id ? `last seen ${backend.db.locations[p.last_confirmed_location_id]?.code}` : '')} onOpen={(id) => go({ name: 'pallet', id })} />
        </div>
      )}
      {data.dispatched.length > 0 && (
        <details className="panel">
          <summary className="panel-title" style={{ cursor: 'pointer' }}>
            Dispatched ({data.dispatched.length})
          </summary>
          <PickTable job={job} pallets={data.dispatched} loc={() => 'left warehouse'} onOpen={(id) => go({ name: 'pallet', id })} />
        </details>
      )}

      {canAdmin && (
        <div className="panel stack">
          <div className="panel-title">Job status</div>
          {job.status === 'OPEN' ? (
            <>
              {blockers > 0 ? (
                <Notice tone="info" title="This job cannot close yet">
                  {data.onHand.length} on hand, {data.missing.length} missing and {data.holds} on hold. Dispatch, locate or retire them first. The server enforces this even if the button is pressed.
                </Notice>
              ) : (
                <p className="muted">All material has left or been retired. Closing stops new receipts against this job.</p>
              )}
              <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => setSheet('close')} disabled={backend.network === 'offline'}>
                <Icon name="lock" /> Close job
              </button>
            </>
          ) : (
            <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => setSheet('reopen')} disabled={backend.network === 'offline'}>
              <Icon name="unlock" /> Reopen job
            </button>
          )}
        </div>
      )}

      {sheet && (
        <AdminSheet
          title={sheet === 'close' ? `Close ${job.code}` : `Reopen ${job.code}`}
          kind={sheet === 'close' ? 'close_job' : 'reopen_job'}
          verb={sheet === 'close' ? 'Close job' : 'Reopen job'}
          reason="optional"
          expectedVersion={job.version}
          intro={sheet === 'close' ? 'Closed jobs keep their full history. They can be reopened later.' : 'Reopening allows new receipts and dispatches again.'}
          payload={() => ({ job_id: job.id })}
          onClose={() => setSheet(null)}
        />
      )}
      {printing && (
        <PickListPrint job={job} pallets={data.onHand} loc={data.loc} warehouse={data.wh?.code ?? ''} onClose={() => setPrinting(false)} />
      )}
    </div>
  );
}

function PickTable({ pallets, loc, onOpen }: { job: Job; pallets: Pallet[]; loc: (p: Pallet) => string; onOpen: (id: string) => void }) {
  return (
    <div className="table-wrap">
      <table className="t">
        <thead>
          <tr>
            <th>Rack</th>
            <th>Pallet</th>
            <th>Description</th>
            <th>State</th>
          </tr>
        </thead>
        <tbody>
          {pallets.map((p) => (
            <tr key={p.id} className="click" onClick={() => onOpen(p.id)}>
              <td>
                <strong className="jcode">{loc(p) || '—'}</strong>
              </td>
              <td>
                <span className="pcode">{p.code}</span>
              </td>
              <td>{p.description}</td>
              <td>
                <span className="row nowrap" style={{ gap: 6 }}>
                  <StateBadge state={p.state} />
                  {p.hold && <HoldBadge />}
                  <span className="faint" style={{ fontSize: 12.5 }}>
                    {p.last_confirmed_at ? `confirmed ${fmtAgo(p.last_confirmed_at)}` : ''}
                  </span>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PickListPrint({ job, pallets, loc, warehouse, onClose }: { job: Job; pallets: Pallet[]; loc: (p: Pallet) => string; warehouse: string; onClose: () => void }) {
  const body = (
    <div className="pick-list" style={{ padding: 12 }}>
      <h2 style={{ margin: '0 0 4px', fontFamily: 'var(--font-display)' }}>
        Pick list · {job.code} {job.name}
      </h2>
      <p style={{ margin: '0 0 10px', fontSize: 12 }}>
        {warehouse} · printed {new Date().toLocaleString()} · {pallets.length} pallets · recorded locations, confirm by scanning
      </p>
      <table className="t" style={{ fontSize: 12 }}>
        <thead>
          <tr>
            <th>✓</th>
            <th>Rack</th>
            <th>Pallet</th>
            <th>Description</th>
            <th>Hold</th>
          </tr>
        </thead>
        <tbody>
          {pallets.map((p) => (
            <tr key={p.id}>
              <td style={{ width: 24 }}>☐</td>
              <td>{loc(p) || 'awaiting placement'}</td>
              <td>{p.code}</td>
              <td>{p.description}</td>
              <td>{p.hold ? `HOLD: ${p.hold.reason}` : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  return (
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet wide" role="dialog" aria-modal="true" aria-label="Pick list">
        <div className="sheet-head">
          <h2>Pick list</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        <div className="stack">
          <div style={{ border: '1px solid var(--line)', borderRadius: 8, background: '#fff', color: '#14171a', overflowX: 'auto' }}>{body}</div>
          {IS_PREVIEW ? (
            <Notice tone="info" icon="print">
              This hosted preview cannot open a print dialog. Run the app locally to print.
            </Notice>
          ) : (
            <button className="btn primary big" onClick={printNow} disabled={!canPrint()}>
              <Icon name="print" /> Print
            </button>
          )}
        </div>
      </div>
      <PrintPortal>{body}</PrintPortal>
    </div>
  );
}
