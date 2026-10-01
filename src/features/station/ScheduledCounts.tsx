// Scheduled counts on the Count page: the person a count is assigned to starts it here and runs it with the station's
// count flow (scan each spot, then every pallet on it). Managers schedule counts, cancel them and review the
// differences before anything is saved.

import { useMemo, useState } from 'react';
import { useApp } from '../../app/state';
import { uuid } from '../../domain/codes';
import { warehouseDate } from '../../domain/receiving';
import { ROLE_RANK } from '../../domain/transitions';
import type { CountLine, CountRepeat, CountTask } from '../../domain/types';
import { MAX_COUNT_SPOTS, REPEAT_LABEL, countDifferences, countDueState, zoneSpots, zonesOf } from '../../domain/work';
import { Icon } from '../../ui/icons';
import { Empty, Field, Notice, Plate, Sheet, Spinner, fmtAgo } from '../../ui/ui';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** What one spot's scans were when the person finished it. */
export interface SpotScan {
  pallet_ids: string[];
  unknown: string[];
}

/** A scheduled count being run on this device. */
export interface CountRun {
  task: CountTask;
  done: Record<string, SpotScan>;
}

export function dueText(c: Pick<CountTask, 'due_on' | 'status'>, today: string): string {
  const s = countDueState(c, today);
  if (s === 'today') return 'Due today';
  const d = new Date(`${c.due_on}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return s === 'late' ? `Late, due ${d}` : `Due ${d}`;
}

export function useCountTasks() {
  const { read, v } = useApp();
  return useMemo(
    () =>
      read((e, a, ws) => {
        const ctx = e.context(a, ws);
        return { counts: e.countTasks(a, ws), today: warehouseDate(ctx.warehouse?.timezone || 'UTC') };
      }) ?? { counts: [] as CountTask[], today: new Date().toISOString().slice(0, 10) },
    [v, read], // eslint-disable-line react-hooks/exhaustive-deps
  );
}

/** The scheduled counts panel above the station's count flow. */
export function ScheduledCounts({ onStart }: { onStart: (c: CountTask) => void }) {
  const { actorId, role, backend } = useApp();
  const { counts, today } = useCountTasks();
  const manager = role === 'OWNER' || role === 'SUPERVISOR';
  const [schedule, setSchedule] = useState(false);
  const [review, setReview] = useState<CountTask | null>(null);
  const [cancel, setCancel] = useState<CountTask | null>(null);
  const offline = backend.network === 'offline';
  const mine = counts.filter((c) => c.status === 'OPEN' && c.assigned_to === actorId);
  const others = counts.filter((c) => c.status === 'OPEN' && c.assigned_to !== actorId);
  const waiting = counts.filter((c) => c.status === 'REVIEW');
  const done = counts
    .filter((c) => c.status === 'DONE')
    .sort((a, b) => (b.reviewed_at ?? b.updated_at).localeCompare(a.reviewed_at ?? a.updated_at))
    .slice(0, 3);
  if (!manager && !mine.length && !waiting.some((c) => c.assigned_to === actorId)) return null;

  const row = (c: CountTask, action: React.ReactNode) => {
    const due = countDueState(c, today);
    return (
      <li key={c.id} className="task-row" data-testid="count-row">
        <div className="task-main">
          <div className="task-head">
            <strong>{c.name}</strong>
            <span className={`tag${due === 'late' ? ' bad' : due === 'today' ? ' accent' : ''}`}>{c.status === 'REVIEW' ? countDifferences(c) ? `${plural(countDifferences(c), 'difference')}` : 'Matches' : dueText(c, today)}</span>
          </div>
          <div className="muted task-meta">
            {plural(c.location_ids.length, 'spot')} · {c.status === 'REVIEW' ? `sent by ${c.submitted_by_name} ${fmtAgo(c.submitted_at)}` : c.assigned_to === actorId ? 'For you' : `For ${c.assigned_name}`}
            {c.repeat !== 'none' ? ` · ${REPEAT_LABEL[c.repeat].toLowerCase()}` : ''}
            {c.note ? ` · ${c.note}` : ''}
          </div>
          {c.review_note && c.status === 'OPEN' && <div className="task-warn">Sent back: {c.review_note}</div>}
        </div>
        {action}
      </li>
    );
  };

  return (
    <section className="panel stack" aria-labelledby="sc-title" data-testid="scheduled-counts">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 className="panel-title" id="sc-title" style={{ margin: 0 }}>
          <Icon name="calendar" width={16} height={16} /> Scheduled counts
        </h2>
        {manager && (
          <button className="btn small primary" onClick={() => setSchedule(true)} disabled={offline}>
            <Icon name="plus" width={16} height={16} /> Schedule a count
          </button>
        )}
      </div>
      {mine.length > 0 ? (
        <ul className="task-list" aria-label="Your counts">
          {mine.map((c) =>
            row(
              c,
              <button className="btn small primary" onClick={() => onStart(c)} disabled={offline} aria-label={`Start ${c.name}`}>
                <Icon name="checklist" width={16} height={16} /> Start
              </button>,
            ),
          )}
        </ul>
      ) : (
        manager && !others.length && !waiting.length && <Empty icon="calendar" title="No counts scheduled">Schedule a count of a zone or a spot, once or every week or month, and assign it to someone on the crew.</Empty>
      )}
      {manager && waiting.length > 0 && (
        <>
          <h3 className="sc-sub">Waiting for your review · {waiting.length}</h3>
          <ul className="task-list">
            {waiting.map((c) =>
              row(
                c,
                <button className="btn small primary" onClick={() => setReview(c)} aria-label={`Review ${c.name}`}>
                  Review
                </button>,
              ),
            )}
          </ul>
        </>
      )}
      {!manager && waiting.filter((c) => c.assigned_to === actorId).length > 0 && <p className="muted" style={{ margin: 0 }}>{plural(waiting.filter((c) => c.assigned_to === actorId).length, 'count')} you sent {waiting.filter((c) => c.assigned_to === actorId).length === 1 ? 'is' : 'are'} waiting for a manager.</p>}
      {manager && others.length > 0 && (
        <>
          <h3 className="sc-sub">Assigned to others · {others.length}</h3>
          <ul className="task-list">
            {others.map((c) =>
              row(
                c,
                <button className="btn small ghost" onClick={() => setCancel(c)} aria-label={`Cancel ${c.name}`}>
                  <Icon name="x" width={16} height={16} /> Cancel
                </button>,
              ),
            )}
          </ul>
        </>
      )}
      {manager && done.length > 0 && (
        <details className="task-done">
          <summary>Saved recently · {done.length}</summary>
          <ul className="task-list">
            {done.map((c) => (
              <li key={c.id} className="task-row done">
                <div className="task-main">
                  <div className="task-head">
                    <Icon name="checkCircle" width={16} height={16} />
                    <strong>{c.name}</strong>
                  </div>
                  <div className="muted task-meta">
                    {countDifferences(c) ? `${plural(countDifferences(c), 'difference')} saved` : 'Matched the records'} · {c.submitted_by_name} · {fmtAgo(c.reviewed_at ?? c.updated_at)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}
      {schedule && <ScheduleSheet onClose={() => setSchedule(false)} />}
      {review && <ReviewSheet count={review} onClose={() => setReview(null)} />}
      {cancel && <CancelCountSheet count={cancel} onClose={() => setCancel(null)} />}
    </section>
  );
}

/** Progress of a running scheduled count: one chip per spot, and Send when every spot is counted. */
export function CountRunBar({ run, current, busy, onSend, onStop }: { run: CountRun; current: string | null; busy: boolean; onSend: () => void; onStop: () => void }) {
  const { backend } = useApp();
  const codes = run.task.location_codes;
  const n = Object.keys(run.done).length;
  const all = n === run.task.location_ids.length;
  return (
    <section className="panel stack sc-run" data-testid="count-run" aria-label={`Running ${run.task.name}`}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="panel-title" style={{ margin: 0 }}>
          <Icon name="checklist" width={16} height={16} /> {run.task.name} · {n} of {plural(run.task.location_ids.length, 'spot')}
        </div>
        <button className="btn small ghost" onClick={onStop} disabled={busy}>
          Stop
        </button>
      </div>
      <ul className="sc-spots" aria-label="Spots">
        {run.task.location_ids.map((id, i) => {
          const d = run.done[id];
          return (
            <li key={id} className={`sc-spot${d ? ' done' : ''}${current === id ? ' current' : ''}`}>
              {d ? <Icon name="check" width={14} height={14} /> : null}
              {codes[i]}
              {d ? <span className="muted"> · {d.pallet_ids.length + d.unknown.length}</span> : null}
            </li>
          );
        })}
      </ul>
      <p className="muted" style={{ margin: 0 }}>
        Scan each spot, then every pallet on it, then scan Finish. Nothing changes in the records until a manager reviews the differences.
      </p>
      <button className="btn big primary" onClick={onSend} disabled={!all || busy || backend.network === 'offline'} data-testid="send-count">
        {busy ? <Spinner /> : <Icon name="check" />} {all ? 'Send the count' : `Count ${plural(run.task.location_ids.length - n, 'more spot')} to send`}
      </button>
    </section>
  );
}

function ScheduleSheet({ onClose }: { onClose: () => void }) {
  const { read, send, toast } = useApp();
  const ctx = read((e, a, ws) => e.context(a, ws));
  const wh = ctx?.warehouse;
  const today = warehouseDate(wh?.timezone || 'UTC');
  const spots = (ctx?.locations ?? []).filter((l) => l.active && l.warehouse_id === wh?.id);
  const zones = zonesOf(spots, wh?.id ?? '');
  const people = (ctx?.members ?? []).filter((m) => m.active && ROLE_RANK[m.role] >= ROLE_RANK.OPERATOR).sort((a, b) => a.user.name.localeCompare(b.user.name));
  const [scope, setScope] = useState<'zone' | 'spot'>(zones.length ? 'zone' : 'spot');
  const [zone, setZone] = useState(zones[0] ?? '');
  const [spot, setSpot] = useState('');
  const [who, setWho] = useState(people.find((m) => m.role === 'OPERATOR')?.user_id ?? people[0]?.user_id ?? '');
  const [due, setDue] = useState(today);
  const [repeat, setRepeat] = useState<CountRepeat>('none');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inZone = scope === 'zone' && wh ? zoneSpots(spots, wh.id, zone).length : 0;
  const valid = !!who && !!due && due >= today && (scope === 'zone' ? !!zone && inZone > 0 : !!spot);
  const submit = async () => {
    setBusy(true);
    setError('');
    const o = await send('schedule_count', { scope, ...(scope === 'zone' ? { zone } : { location_id: spot }), assigned_to: who, due_on: due, repeat, ...(note.trim() ? { note: note.trim() } : {}) }, null, { commandId: uuid() });
    setBusy(false);
    if (o.status === 'result' && o.result.ok) {
      toast('Count scheduled');
      onClose();
    } else setError(o.status === 'result' && !o.result.ok ? o.result.message : o.status === 'offline' ? o.message : 'No answer from the server. Check the list before trying again.');
  };
  return (
    <Sheet title="Schedule a count" onClose={onClose}>
      <div className="stack">
        <div className="flow-modes" role="group" aria-label="What to count">
          <button type="button" aria-pressed={scope === 'zone'} onClick={() => setScope('zone')} disabled={!zones.length}>
            A zone
          </button>
          <button type="button" aria-pressed={scope === 'spot'} onClick={() => setScope('spot')}>
            One spot
          </button>
        </div>
        {scope === 'zone' ? (
          <Field label="Zone" htmlFor="sc-zone" hint={inZone > MAX_COUNT_SPOTS ? `The first ${MAX_COUNT_SPOTS} of ${inZone} spots. Schedule another count for the rest.` : plural(inZone, 'spot')}>
            <select id="sc-zone" className="select" value={zone} onChange={(e) => setZone(e.target.value)}>
              {zones.map((z) => (
                <option key={z} value={z}>
                  Zone {z}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <Field label="Spot" htmlFor="sc-spot">
            <select id="sc-spot" className="select" value={spot} onChange={(e) => setSpot(e.target.value)}>
              <option value="">Choose a spot</option>
              {spots.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.code}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Who counts" htmlFor="sc-who">
          <select id="sc-who" className="select" value={who} onChange={(e) => setWho(e.target.value)}>
            {people.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.user.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="sc-two">
          <Field label="Due" htmlFor="sc-due">
            <input id="sc-due" className="input" type="date" min={today} value={due} onChange={(e) => setDue(e.target.value)} />
          </Field>
          <Field label="Repeat" htmlFor="sc-repeat">
            <select id="sc-repeat" className="select" value={repeat} onChange={(e) => setRepeat(e.target.value as CountRepeat)}>
              {(Object.keys(REPEAT_LABEL) as CountRepeat[]).map((r) => (
                <option key={r} value={r}>
                  {REPEAT_LABEL[r]}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Note (optional)" htmlFor="sc-note">
          <input id="sc-note" className="input" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="Anything the person counting should know" />
        </Field>
        {repeat !== 'none' && <p className="muted" style={{ margin: 0 }}>When this count is saved, the next one is scheduled {repeat === 'weekly' ? 'a week' : 'a month'} after its due day, for the same person.</p>}
        {error && <Notice tone="error">{error}</Notice>}
        <div className="row">
          <button className="btn big primary" onClick={() => void submit()} disabled={!valid || busy}>
            {busy ? <Spinner /> : <Icon name="check" />} Schedule
          </button>
          <button className="btn big" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </Sheet>
  );
}

const LINE_TEXT: Record<CountLine['kind'], string> = { matched: 'On record here', missing: 'Not found. Saving marks it missing.', unexpected: 'Found here. Saving records it on this spot.' };

/** A manager reviews a count's differences, then saves it or sends it back to be counted again. */
function ReviewSheet({ count, onClose }: { count: CountTask; onClose: () => void }) {
  const { send, toast } = useApp();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'save' | 'back' | null>(null);
  const [error, setError] = useState('');
  const diff = count.lines.filter((l) => l.kind !== 'matched');
  const matched = count.lines.length - diff.length;
  const decide = async (approve: boolean) => {
    setBusy(approve ? 'save' : 'back');
    setError('');
    const o = await send('review_count', { count_id: count.id, approve, ...(note.trim() ? { note: note.trim() } : {}) }, null, { commandId: uuid(), expectedVersion: count.version });
    setBusy(null);
    if (o.status === 'result' && o.result.ok) {
      toast(approve ? 'Count saved to the records' : `Sent back to ${count.assigned_name}`);
      onClose();
    } else setError(o.status === 'result' && !o.result.ok ? o.result.message : o.status === 'offline' ? o.message : 'No answer from the server. Check the count before trying again.');
  };
  return (
    <Sheet title={`Review ${count.name}`} onClose={onClose} wide>
      <div className="stack" data-testid="count-review">
        <p style={{ margin: 0 }}>
          Counted by {count.submitted_by_name} {fmtAgo(count.submitted_at)}. {plural(matched, 'pallet')} matched. {diff.length || count.unknown.length ? 'Check the differences below before saving.' : 'Everything matched the records.'}
        </p>
        {diff.length > 0 && (
          <ul className="task-list">
            {diff.map((l) => (
              <li key={`${l.location_id}:${l.pallet_id}`} className="task-row">
                <div className="task-main">
                  <div className="task-head">
                    <span className={`tag ${l.kind === 'missing' ? 'bad' : 'accent'}`}>{l.kind === 'missing' ? 'Missing' : 'Unexpected'}</span>
                    <span className="pcode">{l.code}</span>
                    <span className="task-desc">{l.description}</span>
                  </div>
                  <div className="task-route">
                    {l.kind === 'unexpected' && (
                      <>
                        {l.from_code ? <Plate code={l.from_code} size="sm" /> : <span className="tag">No spot</span>}
                        <Icon name="chevronRight" width={16} height={16} />
                      </>
                    )}
                    <Plate code={l.location_code} size="sm" />
                  </div>
                  <div className="muted task-meta">{LINE_TEXT[l.kind]}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
        {count.unknown.length > 0 && (
          <Notice tone="warn" title={`${plural(count.unknown.length, 'code')} not recognized`}>
            {count.unknown.map((u) => `${u.raw} on ${u.location_code}`).join(', ')}. Nothing is saved for these. Check the labels on the spot.
          </Notice>
        )}
        <Field label="Note (optional)" htmlFor="rv-note" hint="Shown to the person counting when you send it back.">
          <input id="rv-note" className="input" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {error && <Notice tone="error">{error}</Notice>}
        <div className="row">
          <button className="btn big primary" onClick={() => void decide(true)} disabled={!!busy}>
            {busy === 'save' ? <Spinner /> : <Icon name="check" />} Save the count
          </button>
          <button className="btn big" onClick={() => void decide(false)} disabled={!!busy}>
            {busy === 'back' ? <Spinner /> : <Icon name="refresh" />} Count again
          </button>
        </div>
        <p className="muted" style={{ margin: 0 }}>
          Saving records a location check for each matched pallet, marks missing ones missing and records unexpected ones on the spot where they were found. A pallet that changed since the count is skipped.
        </p>
      </div>
    </Sheet>
  );
}

function CancelCountSheet({ count, onClose }: { count: CountTask; onClose: () => void }) {
  const { send, toast } = useApp();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    setBusy(true);
    const o = await send('cancel_count', { count_id: count.id, ...(reason.trim() ? { reason: reason.trim() } : {}) }, null, { commandId: uuid() });
    setBusy(false);
    if (o.status === 'result' && o.result.ok) {
      toast(`${count.name} cancelled`);
      onClose();
    } else setError(o.status === 'result' && !o.result.ok ? o.result.message : 'Not saved. Try again.');
  };
  return (
    <Sheet title={`Cancel ${count.name}?`} onClose={onClose}>
      <div className="stack">
        <p style={{ margin: 0 }}>It leaves {count.assigned_name}’s list.{count.repeat !== 'none' ? ' Repeating counts stop here; schedule a new one to start again.' : ''}</p>
        <Field label="Reason (optional)" htmlFor="cc-reason">
          <input id="cc-reason" className="input" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
        </Field>
        {error && <Notice tone="error">{error}</Notice>}
        <div className="row">
          <button className="btn big danger" onClick={() => void submit()} disabled={busy}>
            {busy ? <Spinner /> : <Icon name="x" />} Cancel the count
          </button>
          <button className="btn big" onClick={onClose}>
            Keep it
          </button>
        </div>
      </div>
    </Sheet>
  );
}
