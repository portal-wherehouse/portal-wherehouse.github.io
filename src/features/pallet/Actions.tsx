import { FirebaseBackend } from '../../data/firebase';
import { PalletFields, blankInfo } from '../receive/PalletFields';
// Contextual pallet actions (blueprint pages 14-15). Each action is one confirmed command with
// the expected version, a reason where the blueprint requires one, and an honest result.

import { useMemo, useState } from 'react';
import type { PalletCommandKind, PalletEvent, PalletState } from '../../domain/types';
import { STATE_LABEL } from '../../domain/transitions';
import type { PalletDetail } from '../../demo/engine';
import { useApp } from '../../app/state';
import { useJobsOn } from '../../app/words';
import { CommandFeedback } from '../../ui/CommandFeedback';
import { Icon } from '../../ui/icons';
import { useCommand } from '../../ui/useCommand';
import { Field, HoldBadge, Notice, Plate, Sheet, Spinner, fmtTime } from '../../ui/ui';
import { AdjustSheet, ReviewAdjust } from '../stock/Adjust';

export const ACTION_META: Partial<Record<PalletCommandKind, { title: string; verb: string; explain: string; danger?: boolean }>> = {
  verify_location: { title: 'Confirm still here', verb: 'Confirm location', explain: 'You checked and the pallet is physically where it is recorded. This adds a verification event and refreshes “last confirmed” without inventing a move.' },
  dispatch: { title: 'Dispatch pallet', verb: 'Dispatch', explain: 'Dispatch means the pallet left the warehouse according to your entry. It is not proof it arrived. The rack is cleared and the destination is saved on the event.' },
  return: { title: 'Record return', verb: 'Record return', explain: 'The same intact pallet came back. It keeps its identity and becomes Received with no location. Placing it is a separate step. Existing holds stay.' },
  mark_missing: { title: 'Mark missing', verb: 'Mark missing', explain: 'The pallet is not where it was recorded. Its current location is cleared, the last confirmed rack is kept as history, and it appears in Needs attention until a supervisor records where it was found.', danger: true },
  locate: { title: 'Found pallet', verb: 'Record found', explain: 'Record where the missing pallet was physically observed. It becomes Stored there.' },
  apply_hold: { title: 'Put on hold', verb: 'Apply hold', explain: 'A hold flags damage or inspection. The pallet keeps its rack and can still be moved (for example, to quarantine), but it cannot be dispatched. Only a supervisor can clear it.' },
  clear_hold: { title: 'Clear hold', verb: 'Clear hold', explain: 'Say what resolved the hold. The reason stays in the history.' },
  reassign_job: { title: 'Change job', verb: 'Change job', explain: 'Moves the pallet to another open job. Both jobs stay in the history, the version changes so nobody can dispatch against the old job, and the label is flagged for reprinting.' },
  edit_details: { title: 'Edit details', verb: 'Save changes', explain: 'Corrections to description, notes, or supplier reference are recorded as an event. Changing the description flags the printed label for reprinting.' },
  correct: { title: 'Correct the record', verb: 'Save correction', explain: 'A correction is a new event. It never edits or deletes the earlier entry. Review everything that happened after the mistaken entry, then state where the pallet actually is now.' },
  retire: { title: 'Retire pallet', verb: 'Retire', explain: 'The identity stops being an active handling unit and drops out of searches. History is kept, and the code is never reused. A supervisor can correct a mistaken retirement.', danger: true },
  archive: { title: 'Archive', verb: 'Archive', explain: 'Hides a retired pallet from lists and counts. History stays available, and “Include retired and archived” in Find brings it back.' },
  label_applied: { title: 'New label applied', verb: 'Confirm label applied', explain: 'Confirms the freshly printed label is stuck on this pallet, so it leaves the reprint list. Nothing else changes.' },
  adjust_qty: { title: 'Change quantity', verb: 'Save quantity', explain: 'Record that some was used, damaged, written off or found, or enter a new count.' },
  review_adjust: { title: 'Review quantity change', verb: 'Review', explain: 'Approve or turn down the quantity change waiting on this pallet.' },
  rotate_label: { title: 'Replace label', verb: 'Replace label', explain: 'For a compromised or duplicated label: the old QR token is revoked and a new one issued. The old QR stops working, but its barcode and printed code still find the pallet, so print and stick the new label right away and remove the old one. Ordinary reprints do not need this.', danger: true },
};

export function ActionSheet(props: { kind: PalletCommandKind; detail: PalletDetail; onClose: () => void; presetEvent?: PalletEvent | null; joinRef?: string | null; presetDestination?: string }) {
  if (props.kind === 'adjust_qty') return <AdjustSheet detail={props.detail} onClose={props.onClose} />;
  if (props.kind === 'review_adjust')
    return (
      <Sheet title="Review quantity change" onClose={props.onClose}>
        <div className="stack">
          <div className="row" style={{ gap: 8 }}>
            <span className="pcode" style={{ fontSize: 24 }}>
              {props.detail.pallet.code}
            </span>
            <span style={{ fontWeight: 600 }} data-keep-words>
              {props.detail.pallet.description}
            </span>
          </div>
          <ReviewAdjust pallet={props.detail.pallet} />
        </div>
      </Sheet>
    );
  return <GeneralActionSheet {...props} />;
}

function GeneralActionSheet({ kind, detail, onClose, presetEvent, joinRef, presetDestination }: { kind: PalletCommandKind; detail: PalletDetail; onClose: () => void; presetEvent?: PalletEvent | null; joinRef?: string | null; presetDestination?: string }) {
  const { read, toast, backend } = useApp();
  const cmd = useCommand();
  const p = detail.pallet;
  const enhanced=!(backend instanceof FirebaseBackend)||backend.summary?.receiving_version===1;
  const [info,setInfo]=useState(p.receiving ?? blankInfo());
  const meta = ACTION_META[kind]!;
  const jobsOn = useJobsOn();
  const ctx = read((e, a, ws) => e.context(a, ws));
  const events = read((e, a, ws) => e.history(a, ws, p.id)) ?? [];
  const users = read((e) => e.db.users) ?? {};
  const [reason, setReason] = useState('');
  const [destination, setDestination] = useState(presetDestination || p.receiving?.destination || detail.job?.destination_notes || '');
  const [note, setNote] = useState('');
  const [holdReason, setHoldReason] = useState('');
  const [locationId, setLocationId] = useState(detail.pallet.last_confirmed_location_id ?? '');
  const [jobId, setJobId] = useState('');
  const [desc, setDesc] = useState(p.description);
  const [notes, setNotes] = useState(p.notes ?? '');
  const [supplier, setSupplier] = useState(p.supplier_ref ?? '');
  const [eventId, setEventId] = useState(presetEvent?.id ?? events.find((e) => e.type !== 'correct')?.id ?? '');
  const [target, setTarget] = useState<PalletState>(p.state === 'RETIRED' ? 'STORED' : p.state);
  const [attempted, setAttempted] = useState(false);

  const activeLocs = (ctx?.locations ?? []).filter((l) => l.active);
  const openJobs = (ctx?.jobs ?? []).filter((j) => j.status === 'OPEN' && j.id !== p.job_id);
  const selectedEvent = events.find((e) => e.id === eventId);
  const after = useMemo(() => (selectedEvent ? events.filter((e) => e.revision > selectedEvent.revision) : []), [events, selectedEvent]);

  const needsReason = ['mark_missing', 'locate', 'apply_hold', 'clear_hold', 'reassign_job', 'correct', 'retire', 'rotate_label'].includes(kind);
  const valid =
    (!needsReason || reason.trim().length > 0) &&
    (kind !== 'dispatch' || destination.trim().length > 0) &&
    (kind !== 'locate' || !!locationId) &&
    (kind !== 'reassign_job' || !!jobId) &&
    (kind !== 'edit_details' || (desc.trim().length > 0 && desc.length <= 160)) &&
    (kind !== 'correct' || target !== 'STORED' || !!locationId);

  const payload = (): Record<string, unknown> => {
    switch (kind) {
      case 'verify_location':
        return { location_id: p.current_location_id };
      case 'dispatch':
        return { destination, note: note || undefined, ...(joinRef ? { join_ref: joinRef } : {}) };
      case 'return':
        return { condition_note: note || undefined, hold_reason: holdReason || undefined };
      case 'locate':
        return { location_id: locationId, reason };
      case 'reassign_job':
        return { job_id: jobId, reason };
      case 'edit_details':
        return { description: desc, notes, supplier_ref: supplier, ...(enhanced?{receiving:info}:{}), reason: reason || undefined };
      case 'correct':
        return { corrects_event_id: eventId || undefined, state: target, location_id: target === 'STORED' ? locationId : undefined, reason };
      case 'label_applied':
        return {};
      default:
        return { reason: reason || undefined };
    }
  };

  const submit = async () => {
    setAttempted(true);
    if (!valid) return;
    const r = await cmd.run(kind, payload(), p);
    if (r.phase === 'done') {
      toast(`${meta.title}: saved for ${p.code}${r.accepted?.replayed ? ' (recovered)' : ''}`);
      onClose();
    }
  };

  const recover = async () => {
    const r = await cmd.recover();
    if (r.phase === 'done') {
      toast(`${meta.title}: confirmed for ${p.code}`);
      onClose();
    }
  };

  const conflict = cmd.state.rejected?.code === 'VERSION_CONFLICT' ? cmd.state.rejected.current : null;
  const err = (cond: boolean) => (attempted && cond ? 'Required.' : undefined);

  return (
    <Sheet title={meta.title} onClose={onClose}>
      <div className="stack">
        <div className="row" style={{ gap: 8 }}>
          <span className="pcode" style={{ fontSize: 24 }}>
            {p.code}
          </span>
          <span style={{ fontWeight: 600 }}>{p.description}</span>
          <span className="muted">
            {detail.job ? (
              <>
                · <span className="jcode">{detail.job.code}</span>{' '}
              </>
            ) : jobsOn ? (
              <>
                · <span className="jcode">No job</span>{' '}
              </>
            ) : null}
            · v{p.version}
          </span>
          {p.hold && <HoldBadge title={p.hold.reason} />}
        </div>
        <p className="muted" style={{ fontSize: 14 }}>
          {meta.explain}
        </p>

        {kind === 'verify_location' && detail.location && (
          <div className="row">
            <span className="muted">Recorded at</span> <Plate code={detail.location.code} />
          </div>
        )}

        {kind === 'dispatch' && (
          <>
            {joinRef && (
              <Notice tone="info" icon="send">
                Joins dispatch <strong className="mono">{joinRef}</strong>, so it prints on the same dispatch slip.
              </Notice>
            )}
            <Field label="Destination" htmlFor="act-dest" hint={err(!destination.trim()) ?? 'Saved on the dispatch event and printed on the dispatch slip.'}>
              <input id="act-dest" className="input" value={destination} onChange={(e) => setDestination(e.target.value)} maxLength={200} />
            </Field>
            <Field label="Note (optional)" htmlFor="act-note">
              <input id="act-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Truck, driver, bill of lading…" maxLength={500} />
            </Field>
            <Notice tone="info" icon="truck">
              {detail.location ? (
                <>
                  Leaving from <strong>{detail.location.code}</strong>
                </>
              ) : (
                'Leaving the warehouse'
              )}
              {detail.job ? (
                <>
                  {' '}
                  for job <strong>{detail.job.code}</strong> {detail.job.name}
                </>
              ) : null}
              . The result will read “Dispatched from {ctx?.warehouse?.code ?? 'your warehouse'}”, never “Delivered”.
            </Notice>
          </>
        )}

        {kind === 'return' && (
          <>
            {detail.job && detail.job.status !== 'OPEN' && <Notice tone="warn">Job {detail.job.code} is closed. A supervisor must reopen it (Jobs screen) before this return can be recorded.</Notice>}
            <Field label="Condition note (optional)" htmlFor="act-cond">
              <textarea id="act-cond" className="textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Unused, wrap intact" maxLength={1000} />
            </Field>
            {!p.hold && (
              <Field label="Put on hold (optional)" htmlFor="act-hold" hint="Fill in only if it came back damaged or needs inspection.">
                <input id="act-hold" className="input" value={holdReason} onChange={(e) => setHoldReason(e.target.value)} placeholder="Hold reason" maxLength={300} />
              </Field>
            )}
          </>
        )}

        {(kind === 'locate' || (kind === 'correct' && target === 'STORED')) && (
          <Field label={kind === 'locate' ? 'Where was it found?' : 'Actual location'} htmlFor="act-loc" hint={err(!locationId)}>
            <select id="act-loc" className="select" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              <option value="">Choose a location…</option>
              {activeLocs.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.code} {l.kind !== 'RACK' ? `(${l.kind.toLowerCase()})` : ''}
                </option>
              ))}
            </select>
          </Field>
        )}

        {kind === 'reassign_job' && (
          <Field label="New job" htmlFor="act-job" hint={err(!jobId)}>
            <select id="act-job" className="select" value={jobId} onChange={(e) => setJobId(e.target.value)}>
              <option value="">Choose an open job…</option>
              {openJobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.code} · {j.name}
                </option>
              ))}
            </select>
          </Field>
        )}

        {kind === 'edit_details' && (
          <>
            <Field label="Description" htmlFor="act-desc" count={desc.length} max={160}>
              <input id="act-desc" className="input" value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={200} />
            </Field>
            <Field label="Supplier reference" htmlFor="act-sup">
              <input id="act-sup" className="input" value={supplier} onChange={(e) => setSupplier(e.target.value)} maxLength={80} />
            </Field>
            <Field label="Notes" htmlFor="act-notes" count={notes.length} max={1000}>
              <textarea id="act-notes" className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1200} />
            </Field>
          </>
        )}

        {kind === 'correct' && (
          <>
            <Field label="Which entry was wrong?" htmlFor="act-ev">
              <select id="act-ev" className="select" value={eventId} onChange={(e) => setEventId(e.target.value)}>
                {events
                  .filter((e) => e.type !== 'correct')
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      v{e.revision} · {e.type.replace('_', ' ')} · {e.after_state.current_location_code ?? e.after_state.state.toLowerCase()} · {fmtTime(e.accepted_at)} · {users[e.actor_id]?.name}
                    </option>
                  ))}
              </select>
            </Field>
            {after.length > 0 && (
              <Notice tone="warn" title={`${after.length} later ${after.length === 1 ? 'entry' : 'entries'} happened after that one`}>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {after
                    .slice()
                    .reverse()
                    .map((e) => (
                      <li key={e.id}>
                        v{e.revision} {e.type.replace('_', ' ')} → {e.after_state.current_location_code ?? e.after_state.state.toLowerCase()} ({users[e.actor_id]?.name})
                      </li>
                    ))}
                </ul>
                There is no universal undo: reversing an old action could erase valid later work. Decide where the pallet actually is now.
              </Notice>
            )}
            <Field label="Actual state now" htmlFor="act-state">
              <select id="act-state" className="select" value={target} onChange={(e) => setTarget(e.target.value as PalletState)}>
                {(['RECEIVED', 'STORED', 'MISSING', 'DISPATCHED'] as PalletState[]).map((s) => (
                  <option key={s} value={s}>
                    {STATE_LABEL[s]}
                  </option>
                ))}
              </select>
            </Field>
          </>
        )}

        {kind==='edit_details' && enhanced && <PalletFields value={info} onChange={setInfo} disabled={cmd.busy||cmd.locked}/>}
        {(needsReason || kind === 'archive' || kind === 'edit_details') && (
          <Field label={needsReason ? 'Reason' : 'Reason (optional)'} htmlFor="act-reason" hint={err(needsReason && !reason.trim()) ?? 'Saved in the history with your name.'}>
            <textarea id="act-reason" className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} style={{ minHeight: 64 }} />
          </Field>
        )}

        {conflict && (
          <Notice tone="warn" title={`${p.code} changed to version ${conflict.version}`}>
            Close this and review the record: it now shows the newer state. Then decide again.
          </Notice>
        )}
        <CommandFeedback state={cmd.state} onRecover={() => void recover()} />
        {!cmd.locked && (
          <div className="row">
            <button className={`btn big ${meta.danger ? 'danger' : 'primary'}`} onClick={() => void submit()} disabled={cmd.busy || !!conflict}>
              {cmd.busy ? <Spinner /> : <Icon name="check" />}
              {meta.verb}
            </button>
            <button className="btn" onClick={onClose}>
              Cancel
            </button>
          </div>
        )}
      </div>
    </Sheet>
  );
}
