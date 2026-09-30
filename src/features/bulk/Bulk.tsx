// Select several pallets and act on all of them: place, hold, change job, labels, missing, retire, flag an issue.
// Each pallet is still its own command with its own version check, so one refusal never blocks the rest,
// and the result says exactly which pallets changed and why any did not.

import { useJobsOn } from '../../app/words';
import { useState, type ReactNode } from 'react';
import { useApp } from '../../app/state';
import { uuid } from '../../domain/codes';
import { roleAllows } from '../../domain/transitions';
import type { CommandKind, Pallet } from '../../domain/types';
import type { SearchRow } from '../../domain/search';
import type { Engine } from '../../demo/engine';
import { Icon, type IconName } from '../../ui/icons';
import { Field, Notice, Sheet, Spinner } from '../../ui/ui';
import { LabelSheet } from '../labels/LabelSheet';
import { IssueSheet, codeList } from './Issues';

export type Mark = 'ok' | 'fail';

/** Selection state for one list. Marks show the result of the last bulk action on each pallet. */
export function useBulk() {
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  return {
    selecting,
    selected,
    marks,
    start: () => {
      setSelecting(true);
      setSelected([]);
      setMarks({});
    },
    stop: () => {
      setSelecting(false);
      setSelected([]);
      setMarks({});
    },
    toggle: (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= MAX_SELECTED ? s : [...s, id])),
    setAll: (ids: string[]) => setSelected(ids.slice(0, MAX_SELECTED)),
    finish: (m: Record<string, Mark>) => {
      setMarks(m);
      setSelected([]);
    },
    /** Pallets the last action touched stay in the list, with their mark, even if they no longer match its filter. */
    pinned: Object.keys(marks),
  };
}
export type Bulk = ReturnType<typeof useBulk>;

export const MAX_SELECTED = 50;

/** Rows for pallets the last action touched that the list's filter no longer shows (a placed pallet leaves Needs placement). */
export function pinnedRows(db: Engine['db'], bulk: Bulk, shown: string[]): SearchRow[] {
  const seen = new Set(shown);
  return bulk.pinned
    .filter((id) => !seen.has(id) && db.pallets[id])
    .map((id) => {
      const p = db.pallets[id];
      return {
        pallet: p,
        job: db.jobs[p.job_id],
        location: p.current_location_id ? (db.locations[p.current_location_id] ?? null) : null,
        lastLocation: p.last_confirmed_location_id ? (db.locations[p.last_confirmed_location_id] ?? null) : null,
      };
    });
}

export function SelectButton({ bulk }: { bulk: Bulk }) {
  const { role } = useApp();
  if (!role || role === 'VIEWER' || bulk.selecting) return null;
  return (
    <button className="btn" onClick={bulk.start}>
      <Icon name="checklist" /> Select
    </button>
  );
}

/** Wraps one pallet row. While selecting, tapping the row ticks it instead of opening it. */
export function SelectRow({ bulk, id, code, children }: { bulk: Bulk; id: string; code: string; children: ReactNode }) {
  const on = bulk.selected.includes(id);
  const mark = bulk.marks[id];
  if (!bulk.selecting && !mark) return <>{children}</>;
  return (
    <div
      className={`sel-row${on ? ' on' : ''}${mark ? ` ${mark}` : ''}`}
      onClickCapture={
        bulk.selecting
          ? (e) => {
              e.preventDefault();
              e.stopPropagation();
              bulk.toggle(id);
            }
          : undefined
      }
    >
      {bulk.selecting && (
        <span
          className="sel-box"
          role="checkbox"
          aria-checked={on}
          aria-label={`Select ${code}`}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === ' ' || e.key === 'Enter') {
              e.preventDefault();
              bulk.toggle(id);
            }
          }}
        >
          {on && <Icon name="check" width={16} height={16} />}
        </span>
      )}
      <div className="sel-body">{children}</div>
      {mark && (
        <span className={`sel-mark ${mark}`} aria-label={mark === 'ok' ? `${code} done` : `${code} not changed`}>
          <Icon name={mark === 'ok' ? 'checkCircle' : 'alertCircle'} width={22} height={22} />
        </span>
      )}
    </div>
  );
}

type BulkKind = 'place' | 'hold' | 'job' | 'labels' | 'missing' | 'retire' | 'issue';

const ACTIONS: { kind: BulkKind; label: string; icon: IconName; needs: CommandKind | null; danger?: boolean }[] = [
  { kind: 'place', label: 'Place all', icon: 'move', needs: 'place' },
  { kind: 'hold', label: 'Put on hold', icon: 'hold', needs: 'apply_hold' },
  { kind: 'job', label: 'Change job', icon: 'jobs', needs: 'reassign_job' },
  { kind: 'labels', label: 'Replace labels', icon: 'print', needs: null },
  { kind: 'issue', label: 'Flag issue', icon: 'flag', needs: 'report_issue' },
  { kind: 'missing', label: 'Mark all missing', icon: 'question', needs: 'mark_missing', danger: true },
  { kind: 'retire', label: 'Retire pallets', icon: 'retire', needs: 'retire', danger: true },
];

/** The bar that appears at the top of the list while selecting. Actions stay dim until a pallet is ticked. */
export function BulkBar({ bulk, visibleIds }: { bulk: Bulk; visibleIds: string[] }) {
  const { role, backend } = useApp();
  const jobsOn = useJobsOn();
  const [open, setOpen] = useState<BulkKind | null>(null);
  if (!bulk.selecting) return null;
  const n = bulk.selected.length;
  const all = visibleIds.length > 0 && visibleIds.slice(0, MAX_SELECTED).every((id) => bulk.selected.includes(id));
  const pallets = bulk.selected.map((id) => backend.db.pallets[id]).filter((p): p is Pallet => !!p);
  const offline = backend.network === 'offline';
  return (
    <>
    <div className="bulk-bar" role="region" aria-label="Selected pallets">
      <div className="bulk-top">
        <strong className="bulk-count">{n ? `${n} selected` : 'Tap pallets to select them'}</strong>
        {visibleIds.length > 0 && (
          <button className="btn small" onClick={() => bulk.setAll(all ? [] : visibleIds)}>
            {all ? 'Clear ticks' : `Select all ${Math.min(visibleIds.length, MAX_SELECTED)}`}
          </button>
        )}
        <button className="btn small bulk-exit" onClick={bulk.stop}>
          <Icon name="x" /> Cancel selection
        </button>
      </div>
      <div className="bulk-actions">
        {ACTIONS.filter((a) => (a.needs ? roleAllows(role, a.needs) : role !== 'VIEWER') && (jobsOn || a.kind !== 'job')).map((a) => (
          <button key={a.kind} className={`btn small${a.danger ? ' danger-outline' : ''}`} disabled={!n || (offline && a.kind !== 'labels')} onClick={() => setOpen(a.kind)}>
            <Icon name={a.icon} /> {a.label}
          </button>
        ))}
      </div>
      {n >= MAX_SELECTED && <div className="bulk-note">Up to {MAX_SELECTED} pallets at a time.</div>}
    </div>
      {/* Outside the sticky bar, so the sheet covers the whole page. */}
      {open === 'issue' ? (
        <IssueSheet pallets={pallets} onClose={() => setOpen(null)} onReported={() => bulk.finish(Object.fromEntries(pallets.map((p) => [p.id, 'ok' as Mark])))} />
      ) : open ? (
        <BulkSheet kind={open} pallets={pallets} onClose={() => setOpen(null)} onFinished={bulk.finish} />
      ) : null}
    </>
  );
}

const VERB: Record<Exclude<BulkKind, 'issue'>, { title: (n: string) => string; yes: string; doing: string }> = {
  place: { title: (n) => `Place ${n}?`, yes: 'Yes, place them', doing: 'Placing' },
  hold: { title: (n) => `Put ${n} on hold?`, yes: 'Yes, put on hold', doing: 'Putting on hold' },
  job: { title: (n) => `Change the job on ${n}?`, yes: 'Yes, change the job', doing: 'Changing the job on' },
  labels: { title: (n) => `Print labels for ${n}?`, yes: 'Yes, continue', doing: 'Replacing the label on' },
  missing: { title: (n) => `Mark ${n} missing?`, yes: 'Yes, mark missing', doing: 'Marking missing' },
  retire: { title: (n) => `Retire ${n}?`, yes: 'Yes, retire them', doing: 'Retiring' },
};

const plural = (n: number) => `${n} pallet${n === 1 ? '' : 's'}`;

interface Outcome {
  pallet: Pallet;
  ok: boolean;
  message: string;
}

function BulkSheet({ kind, pallets, onClose, onFinished }: { kind: Exclude<BulkKind, 'issue'>; pallets: Pallet[]; onClose: () => void; onFinished: (m: Record<string, Mark>) => void }) {
  const { backend, workspaceId, send, role } = useApp();
  const [phase, setPhase] = useState<'confirm' | 'running' | 'done'>('confirm');
  const [done, setDone] = useState(0);
  const [results, setResults] = useState<Outcome[]>([]);
  const [reason, setReason] = useState('');
  const [locationId, setLocationId] = useState('');
  const [jobId, setJobId] = useState('');
  const [newCodes, setNewCodes] = useState(false);
  const [printing, setPrinting] = useState<string[] | null>(null);
  const verb = VERB[kind];
  const locations = Object.values(backend.db.locations)
    .filter((l) => l.workspace_id === workspaceId && l.active)
    .sort((a, b) => a.code.localeCompare(b.code));
  const jobs = Object.values(backend.db.jobs)
    .filter((j) => j.workspace_id === workspaceId && j.status === 'OPEN')
    .sort((a, b) => a.code.localeCompare(b.code));
  const location = backend.db.locations[locationId];
  const job = backend.db.jobs[jobId];
  const needsReason = kind === 'hold' || kind === 'job' || kind === 'missing' || kind === 'retire' || (kind === 'labels' && newCodes);
  const valid = (!needsReason || reason.trim()) && (kind !== 'place' || location) && (kind !== 'job' || job);

  /** The command for one pallet, or a reason it can't take this action. */
  const plan = (p: Pallet): { kind: CommandKind; payload: Record<string, unknown> } | string => {
    const r = reason.trim();
    switch (kind) {
      case 'place':
        if (p.state === 'RECEIVED') return { kind: 'place', payload: { location_id: locationId } };
        if (p.state === 'STORED') return p.current_location_id === locationId ? `already at ${location?.code}` : { kind: 'move', payload: { location_id: locationId } };
        if (p.state === 'MISSING') return roleAllows(role, 'locate') ? { kind: 'locate', payload: { location_id: locationId, reason: r || `Found and placed at ${location?.code}` } } : 'it is missing, so a supervisor records where it was found';
        return `it is ${p.state.toLowerCase()}`;
      case 'hold':
        return { kind: 'apply_hold', payload: { reason: r } };
      case 'job':
        return { kind: 'reassign_job', payload: { job_id: jobId, reason: r } };
      case 'labels':
        return { kind: 'rotate_label', payload: { reason: r } };
      case 'missing':
        return { kind: 'mark_missing', payload: { reason: r } };
      case 'retire':
        return { kind: 'retire', payload: { reason: r } };
    }
  };

  const run = async () => {
    // Printing the same labels again changes nothing, so it goes straight to the print preview.
    if (kind === 'labels' && !newCodes) {
      onFinished(Object.fromEntries(pallets.map((p) => [p.id, 'ok' as Mark])));
      setPrinting(pallets.map((p) => p.id));
      return;
    }
    setPhase('running');
    setDone(0);
    const out: Outcome[] = [];
    // A few at a time: each is its own command, and the server's per-person limit stays well clear.
    const queue = [...pallets];
    const worker = async () => {
      for (let p = queue.shift(); p; p = queue.shift()) {
        const current = backend.db.pallets[p.id] ?? p;
        const step = plan(current);
        let result: Outcome;
        if (typeof step === 'string') result = { pallet: current, ok: false, message: `Skipped: ${step}.` };
        else {
          try {
            const o = await send(step.kind, step.payload, current, { commandId: uuid() });
            if (o.status === 'result') result = { pallet: current, ok: o.result.ok, message: o.result.ok ? '' : o.result.message };
            else if (o.status === 'queued') result = { pallet: current, ok: true, message: 'Saved on this device. It is sent when you reconnect.' };
            else if (o.status === 'unknown') result = { pallet: current, ok: false, message: 'No answer from the server. Open the pallet and check its history before trying again.' };
            else result = { pallet: current, ok: false, message: o.message };
          } catch (e) {
            result = { pallet: current, ok: false, message: e instanceof Error ? e.message : 'Not saved.' };
          }
        }
        out.push(result);
        setDone(out.length);
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    const order = new Map(pallets.map((p, i) => [p.id, i]));
    out.sort((a, b) => order.get(a.pallet.id)! - order.get(b.pallet.id)!);
    setResults(out);
    setPhase('done');
    onFinished(Object.fromEntries(out.map((r) => [r.pallet.id, r.ok ? 'ok' : 'fail'])));
  };

  const ok = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);
  const okCodes = codeList(ok.map((r) => r.pallet.code));
  const successLine = () => {
    const n = ok.length;
    switch (kind) {
      case 'place':
        return `${okCodes} ${n === 1 ? 'is' : 'are'} now at ${location?.code}.`;
      case 'hold':
        return `${okCodes} ${n === 1 ? 'is' : 'are'} on hold.`;
      case 'job':
        return `${okCodes} moved to job ${job?.code}${job?.name ? ` (${job.name})` : ''}. Their labels are flagged for reprinting.`;
      case 'labels':
        return `${okCodes} ${n === 1 ? 'has a new label code' : 'have new label codes'}. The old QR codes no longer scan.`;
      case 'missing':
        return `${okCodes} marked missing. ${n === 1 ? 'It shows' : 'They show'} in Needs attention until found.`;
      case 'retire':
        return `${okCodes} retired. History is kept.`;
    }
  };

  if (printing) return <LabelSheet palletIds={printing} onClose={onClose} />;

  return (
    <Sheet title={phase === 'confirm' ? verb.title(plural(pallets.length)) : phase === 'running' ? 'Working…' : failed.length ? (ok.length ? 'Partly done' : 'Nothing changed') : 'Done'} onClose={phase === 'running' ? () => {} : onClose}>
      {phase === 'confirm' && (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) void run();
          }}
        >
          <p style={{ margin: 0 }}>
            <strong>Are you sure?</strong> This applies to each of these pallets, and each change is recorded in its history.
          </p>
          <div className="code-chips">
            {pallets.map((p) => (
              <span key={p.id} className="tag mono">
                {p.code}
              </span>
            ))}
          </div>
          {kind === 'place' && (
            <Field label="Put them all at" htmlFor="bulk-loc" hint="Received pallets are placed there, stored ones are moved there, and a supervisor's missing pallets are recorded as found there.">
              <select id="bulk-loc" className="select" value={locationId} onChange={(e) => setLocationId(e.target.value)} autoFocus>
                <option value="">Choose a location</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.code}
                    {l.kind !== 'RACK' ? ` (${l.kind.toLowerCase()})` : ''}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {kind === 'job' && (
            <Field label="New job" htmlFor="bulk-job">
              <select id="bulk-job" className="select" value={jobId} onChange={(e) => setJobId(e.target.value)} autoFocus>
                <option value="">Choose a job</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.code} · {j.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {kind === 'labels' && (
            <div className="stack" style={{ gap: 8 }}>
              <label className="toggle">
                <input type="radio" name="bulk-label" checked={!newCodes} onChange={() => setNewCodes(false)} /> Print the same labels again (a torn or faded label)
              </label>
              {roleAllows(role, 'rotate_label') && (
                <label className="toggle">
                  <input type="radio" name="bulk-label" checked={newCodes} onChange={() => setNewCodes(true)} /> Replace with new codes, so the old labels stop scanning (copied or wrong labels)
                </label>
              )}
              <p className="hint" style={{ margin: 0 }}>
                The print preview puts one label on each page, so {pallets.length === 1 ? 'it prints' : `all ${pallets.length} print`} in one go.
              </p>
            </div>
          )}
          {kind === 'retire' && (
            <Notice tone="warn" title="Retired pallets leave the active lists">
              Use this for pallets that were used up, broken down or entered by mistake. Their history is kept and their codes are never reused. A supervisor can correct a mistaken retirement.
            </Notice>
          )}
          {kind === 'missing' && (
            <Notice tone="warn" title="Their racks are cleared">
              Each pallet's last rack is kept as history, and they wait in Needs attention until someone records where they were found.
            </Notice>
          )}
          {needsReason && (
            <Field label={kind === 'hold' ? 'Hold reason' : 'Reason'} htmlFor="bulk-reason" hint="Saved on every pallet's history.">
              <input id="bulk-reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} autoFocus={kind !== 'job'} placeholder={kind === 'hold' ? 'e.g. Water damage, inspect before use' : kind === 'retire' ? 'e.g. Used up' : kind === 'missing' ? 'e.g. Not on its rack during the count' : ''} />
            </Field>
          )}
          <div className="row">
            <button className={`btn big ${kind === 'retire' || kind === 'missing' ? 'danger' : 'primary'}`} disabled={!valid}>
              <Icon name="check" /> {verb.yes}
            </button>
            <button type="button" className="btn" onClick={onClose}>
              Go back
            </button>
          </div>
        </form>
      )}
      {phase === 'running' && (
        <div className="stack" role="status">
          <div className="row">
            <Spinner /> {verb.doing} {done + 1 > pallets.length ? pallets.length : done + 1} of {pallets.length}…
          </div>
          <progress className="bulk-progress" max={pallets.length} value={done} />
          <p className="hint" style={{ margin: 0 }}>
            Keep this screen open until it finishes.
          </p>
        </div>
      )}
      {phase === 'done' && (
        <div className="stack" data-testid="bulk-result">
          {ok.length > 0 && (
            <Notice tone="ok" title={`${plural(ok.length)} done`}>
              {successLine()}
            </Notice>
          )}
          {failed.length > 0 && (
            <Notice tone="error" title={`${plural(failed.length)} not changed`}>
              <ul className="bulk-fails">
                {failed.map((r) => (
                  <li key={r.pallet.id}>
                    <strong className="mono">{r.pallet.code}</strong>: {r.message}
                  </li>
                ))}
              </ul>
            </Notice>
          )}
          <div className="row">
            {kind === 'labels' && ok.length > 0 && (
              <button className="btn primary big" onClick={() => setPrinting(ok.map((r) => r.pallet.id))}>
                <Icon name="print" /> Print {ok.length} new label{ok.length === 1 ? '' : 's'}
              </button>
            )}
            <button className={`btn ${kind === 'labels' && ok.length ? '' : 'primary big'}`} onClick={onClose} autoFocus>
              Done
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
