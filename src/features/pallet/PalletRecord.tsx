import { Fragment } from 'react';
import { useJobsOn } from '../../app/words';
import { PhotoImage } from '../../data/LiveView';
// Pallet details (blueprint page 13): identity, photo, job, location, state, hold,
// permitted contextual actions, lineage, and the full history.

import { useEffect, useState } from 'react';
import { uuid } from '../../domain/codes';
import { availableActions, roleAllows } from '../../domain/transitions';
import type { PalletCommandKind, PalletEvent } from '../../domain/types';
import { preparePhoto } from '../../device/photos';
import { useApp } from '../../app/state';
import { Icon, type IconName } from '../../ui/icons';
import { useCommand } from '../../ui/useCommand';
import { Empty, Explain, HoldBadge, Notice, PageHead, Sheet, StateBadge, WhereCell, fmtAgo, fmtFull, fmtTime } from '../../ui/ui';
import { LabelSheet } from '../labels/LabelSheet';
import { ACTION_META, ActionSheet } from './Actions';
import { IssueSheet } from '../bulk/Issues';
import { History } from './History';
import { SplitSheet } from './SplitSheet';
import { DispatchSlip } from '../stock/DispatchSlip';
import { ReviewAdjust } from '../stock/Adjust';

const ACTION_ICON: Partial<Record<PalletCommandKind, IconName>> = {
  place: 'pin',
  move: 'move',
  verify_location: 'check',
  dispatch: 'truck',
  return: 'returnIcon',
  mark_missing: 'question',
  locate: 'target',
  apply_hold: 'hold',
  clear_hold: 'unlock',
  reassign_job: 'swap',
  edit_details: 'edit',
  correct: 'history',
  retire: 'retire',
  archive: 'archive',
  rotate_label: 'qr',
  label_applied: 'print',
  split: 'split',
  adjust_qty: 'layers',
  review_adjust: 'check',
};

const PRIMARY: PalletCommandKind[] = ['place', 'move', 'verify_location', 'dispatch', 'return', 'locate', 'adjust_qty'];

export function PalletRecord() {
  const { route, read, role, go, backend, toast, workspaceId, v, prefs } = useApp();
  const jobsOn = useJobsOn();
  const id = route.id ?? '';
  const detail = read((e, a, ws) => e.pallet(a, ws, id));
  const events = read((e, a, ws) => e.history(a, ws, id)) ?? [];
  const users = read((e) => e.db.users) ?? {};
  const lineage = read((e, _a, ws) => e.lineageOf(ws, id));
  const [action, setAction] = useState<PalletCommandKind | null>(null);
  const [issueOpen, setIssueOpen] = useState(false);
  const [presetEvent, setPresetEvent] = useState<PalletEvent | null>(null);
  const [labelOpen, setLabelOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState<string | null>(null);
  const [photoErr, setPhotoErr] = useState<string | null>(null);
  const [slip, setSlip] = useState<string | null>(null);
  const photoCmd = useCommand();
  const removeCmd = useCommand();
  const [refreshedAt, setRefreshedAt] = useState(new Date().toISOString());

  useEffect(() => setRefreshedAt(new Date().toISOString()), [v]);
  // Arriving from Move with a route hint ("return" or "locate") opens that action.
  useEffect(() => {
    if (route.q === 'return' || route.q === 'locate') setAction(route.q);
  }, [route.q]);

  if (!detail) {
    return (
      <div className="stack">
        <PageHead title="Pallet" />
        <div className="panel">
          <Empty icon="find" title="Pallet not found">
            It may belong to another company, or the demo was reset. Search again from Find.
          </Empty>
        </div>
      </div>
    );
  }
  const p = detail.pallet;
  const actions = availableActions(p, role).filter((a) => jobsOn || a !== 'reassign_job');
  const primary = actions.filter((a) => PRIMARY.includes(a));
  // A quantity change waiting for approval is reviewed in its own notice above.
  const secondary = actions.filter((a) => !PRIMARY.includes(a) && a !== 'add_photo' && a !== 'remove_photo' && a !== 'review_adjust');
  const offline = backend.network === 'offline';

  const run = (k: PalletCommandKind) => {
    if (k === 'place' || k === 'move') return go({ name: 'move', id: p.id });
    setPresetEvent(null);
    setAction(k);
  };

  const addPhoto = async (file?: File) => {
    if (!file) return;
    setPhotoErr(null);
    try {
      const ph = await preparePhoto(file);
      const r = await photoCmd.run('add_photo', { attachment_id: uuid(), data_url: ph.data_url, thumb_url: ph.thumb_url, media_type: ph.media_type, bytes: ph.bytes }, backend.db.pallets[p.id]);
      if (r.phase === 'done') toast('Photo added');
      else if (r.message) setPhotoErr(r.message);
    } catch (e) {
      setPhotoErr((e as Error).message);
    }
  };

  const otherDevice = async () => {
    if (!workspaceId) return;
    const current = backend.db.pallets[p.id];
    let r;
    if (current.state === 'STORED') {
      const choices = Object.values(backend.db.locations).filter((l) => l.workspace_id === workspaceId && l.active && l.kind === 'RACK' && l.id !== current.current_location_id);
      const t = choices[Math.floor(Math.random() * choices.length)];
      r = await backend.simulateOtherDevice('user-supervisor', workspaceId, 'move', current, { location_id: t.id });
    } else if (current.hold) r = await backend.simulateOtherDevice('user-supervisor', workspaceId, 'clear_hold', current, { reason: 'Inspected, fine (other device)' });
    else r = await backend.simulateOtherDevice('user-supervisor', workspaceId, 'edit_details', current, { notes: `Checked by the supervisor at ${new Date().toLocaleTimeString()}` });
    toast(r.ok ? `Another phone changed ${current.code} (now v${r.new_version}). Your open screen stays; the next action will conflict if it used the old version.` : r.message, r.ok ? 'info' : 'error');
  };

  return (
    <div className="stack">
      <PageHead
        eyebrow={detail.job ? `Pallet · ${detail.job.code}` : jobsOn ? 'Pallet · No job' : 'Pallet'}
        title={<span style={{ fontSize: '1.25em' }}>{p.code}</span>}
        sub={p.description}
        actions={
          <>
            <button className="btn" onClick={() => setLabelOpen(true)}>
              <Icon name="print" /> Label
            </button>
            {roleAllows(role, 'report_issue') && (
              <button className="btn" onClick={() => setIssueOpen(true)} disabled={offline}>
                <Icon name="flag" /> Flag issue
              </button>
            )}
          </>
        }
      />
      <div className="row">
        <StateBadge state={p.state} />
        {p.hold && <HoldBadge title={p.hold.reason} />}
        {p.label_needs_reprint && <span className="tag warn">Label needs reprinting</span>}
        {p.archived_at && <span className="tag">Archived</span>}
        <span className="faint" style={{ fontSize: 12.5 }}>
          {prefs.advancedTools && <>Version {p.version} · </>}Updated {fmtAgo(refreshedAt)}
        </span>
      </div>
      {offline && backend.cache && (
        <Notice tone="warn" icon="wifiOff" title="Offline copy">
          This record is from {fmtTime(backend.cache.at)} and may be stale.
        </Notice>
      )}

      <div className="grid-2">
        <div className="panel stack" data-tour="pallet-where">
          <div className="panel-title">
            <Icon name="pin" width={16} height={16} /> Location
          </div>
          <WhereCell pallet={p} location={detail.location} lastLocation={detail.lastLocation} size="lg" />
          <p className="muted" style={{ fontSize: 13.5 }}>
            {p.state === 'STORED'
              ? `Last confirmed at ${detail.location?.code} ${fmtTime(p.last_confirmed_at)}. The app shows recorded locations; it cannot detect a move nobody scanned.`
              : p.state === 'RECEIVED'
                ? 'Received and awaiting placement. Scan it into a rack to give it a location.'
                : p.state === 'MISSING'
                  ? 'Its physical position is uncertain. The last rack is kept as history, not shown as current.'
                  : p.state === 'DISPATCHED'
                    ? 'It left the warehouse according to an operator. That is not proof it arrived.'
                    : p.state === 'IN_TRANSIT'
                      ? `On its way to ${p.transfer?.to_name ?? 'another warehouse'}. It has no spot until it is received there.`
                      : 'No longer an active handling unit. History is kept.'}
          </p>
          {p.state === 'IN_TRANSIT' && p.transfer && (
            <div className="row">
              <button className="btn" onClick={() => go({ name: 'transfer', id: p.transfer!.id })}>
                <Icon name="swap" /> Open {p.transfer.number}
              </button>
            </div>
          )}
          {p.hold && (
            <Notice tone="warn" icon="hold" title="On hold">
              {p.hold.reason} · applied {fmtTime(p.hold.applied_at)} by {detail.holdBy?.name ?? 'someone'}. Blocks dispatch; moves are still allowed.
            </Notice>
          )}
          {p.pending_adjust && (
            <Notice tone="info" icon="clock" title="Quantity change waiting for approval">
              <ReviewAdjust pallet={p} />
            </Notice>
          )}
          {p.dispatch && p.state === 'DISPATCHED' && (
            <div className="dispatch-line" data-testid="dispatch-line">
              <span>
                Dispatch <strong className="mono">{p.dispatch.ref}</strong> to <span data-keep-words>{p.dispatch.destination}</span>, {fmtTime(p.dispatch.at)}
              </span>
              <button className="btn small" onClick={() => setSlip(p.dispatch!.ref)}>
                <Icon name="print" /> Dispatch slip
              </button>
            </div>
          )}
          {primary.length > 0 && (
            <div className="row">
              {primary.map((k, i) => (
                <button key={k} className={`btn ${i === 0 ? 'primary big' : 'big'}`} onClick={() => run(k)} disabled={offline && k !== 'move'}>
                  <Icon name={ACTION_ICON[k] ?? 'check'} />
                  {k === 'place' ? 'Place' : k === 'move' ? 'Move' : ACTION_META[k]?.title}
                </button>
              ))}
            </div>
          )}
          {role === 'VIEWER' && <p className="faint" style={{ fontSize: 13 }}>Viewers can look but not change records.</p>}
        </div>

        <div className="panel stack" data-tour="pallet-details">
          <div className="panel-title">
            <Icon name="box" width={16} height={16} /> Details
          </div>
          <dl className="kv">
            <dt hidden={!jobsOn && !detail.job}>Job</dt>
            <dd hidden={!jobsOn && !detail.job}>
              <button disabled={!detail.job} className="btn ghost small" style={{ padding: 0, minHeight: 0 }} onClick={() => detail.job && go({ name: 'job', id: detail.job.id })}>
                <span className="jcode">{detail.job?.code ?? 'No job assigned'}</span>&nbsp;{detail.job?.name}
              </button>
              {detail.job?.status === 'CLOSED' && <span className="tag"> closed</span>}
            </dd>
            <dt>Description</dt>
            <dd>{p.description}</dd>
            {p.supplier_ref && (
              <>
                <dt>Supplier ref</dt>
                <dd>{p.supplier_ref}</dd>
              </>
            )}
            {p.notes && (
              <>
                <dt>Notes</dt>
                <dd style={{ whiteSpace: 'pre-wrap' }}>{p.notes}</dd>
              </>
            )}
            {p.receiving && <>
              {p.receiving.product_code && <><dt>Product barcode</dt><dd>{p.receiving.product_code}</dd></>}
              {(p.receiving.quantity || p.receiving.unit) && <><dt>Quantity</dt><dd>{p.receiving.quantity} {p.receiving.unit}</dd></>}
              {p.receiving.destination && <><dt>Going to</dt><dd>{p.receiving.destination}</dd></>}
              {p.receiving.remind_on && <><dt>Still-here reminder</dt><dd>{p.receiving.remind_on} · Dashboard alert while received, stored or missing</dd></>}
              {p.receiving.fields.map(f=><Fragment key={f.name}><dt>{f.name}</dt><dd>{f.value || '—'}</dd></Fragment>)}
              {!!p.receiving.contents?.length && <><dt>On it</dt><dd data-testid="record-contents"><ul className="contents-list">{p.receiving.contents.map((c,i)=><li key={i}>{c.qty && <strong>{c.qty} × </strong>}{c.name}{c.sku && <span className="muted"> · {c.sku}</span>}</li>)}</ul></dd></>}
              {p.receiving.contents_unknown && !p.receiving.contents?.length && <><dt>On it</dt><dd><span className="tag">Not listed yet</span></dd></>}
            </>}
            <dt>Received</dt>
            <dd title={p.received_at}>{fmtFull(p.received_at)}</dd>
            <dt>Last change</dt>
            <dd title={p.updated_at}>{fmtFull(p.updated_at)}</dd>
            {prefs.advancedTools && <>
            <dt>Identity</dt>
            <dd>
              <span className="mono">{p.id}</span>
            </dd>
            <dt>Label token</dt>
            <dd>
              <span className="mono">PL1:P:{detail.label ? `${detail.label.token.slice(0, 4)}••••••••${detail.label.token.slice(-4)}` : 'none'}</span>
            </dd>
            </>}
          </dl>
          {lineage && (lineage.parent || lineage.children.length > 0) && (
            <div className="stack" style={{ gap: 6 }}>
              <div className="panel-title" style={{ margin: 0 }}>
                <Icon name="split" width={16} height={16} /> Split lineage
              </div>
              {lineage.parent && (
                <div>
                  Split from{' '}
                  <button className="btn ghost small" onClick={() => go({ name: 'pallet', id: lineage.parent!.id })}>
                    {lineage.parent.code}
                  </button>
                </div>
              )}
              {lineage.children.length > 0 && (
                <div className="row">
                  Split into
                  {lineage.children.map((c) => (
                    <button key={c.id} className="btn small" onClick={() => go({ name: 'pallet', id: c.id })}>
                      {c.code}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="panel stack">
        <div className="panel-title">
          <Icon name="camera" width={16} height={16} /> Photos <span className="faint" style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}>up to 3</span>
        </div>
        <div className="photo-strip">
          {detail.attachments.map((a) => (
            <button key={a.id} className="ph" onClick={() => setPhotoOpen(a.id)} aria-label="Open photo">
              <PhotoImage id={a.id} alt={`Photo of ${p.code}`} />
            </button>
          ))}
          {photoCmd.busy && <div className="ph pending">Uploading…</div>}
          {actions.includes('add_photo') && detail.attachments.length < 3 && !photoCmd.busy && (
            <label className="ph pending" style={{ cursor: 'pointer', border: '1.5px dashed var(--ink-3)' }}>
              <span>
                <Icon name="plus" width={22} height={22} />
                <br />
                Add photo
              </span>
              <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" onChange={(e) => void addPhoto(e.target.files?.[0])} />
            </label>
          )}
        </div>
        {detail.attachments.length === 0 && !actions.includes('add_photo') && <p className="muted">No photos.</p>}
        {photoErr && <Notice tone="error">{photoErr}</Notice>}
      </div>

      {secondary.length > 0 && (
        <div className="panel stack">
          <div className="panel-title">
            <Icon name="settings" width={16} height={16} /> More actions
          </div>
          <div className="row">
            {secondary.map((k) => (
              <button key={k} className={`btn ${ACTION_META[k]?.danger ? 'danger' : ''}`} onClick={() => run(k)} disabled={offline}>
                <Icon name={ACTION_ICON[k] ?? 'check'} />
                {k === 'split' ? 'Split pallet' : ACTION_META[k]?.title}
              </button>
            ))}
          </div>
          {offline && <p className="faint">These actions need a connection.</p>}
        </div>
      )}

      <Explain title="What the history shows" refs="pages 6, 13, 15, 20">
        <p>
          Every accepted command adds exactly one event and one version. The current state is a summary of those events. Events are never edited or deleted: a mistake is fixed by a new{' '}
          <em>Correction</em> event that points back at the wrong one.
        </p>
        <ul>
          <li>Times show in this device's timezone; hover (or long-press) a time for the exact stored UTC value.</li>
          <li>The person shown comes from the signed-in account, never from text someone typed.</li>
          <li>
            <em>cmd</em> is the request ID. Retrying a request reuses it, which is how the server knows not to apply it twice.
          </li>
        </ul>
      </Explain>

      <div className="panel" data-tour="pallet-history">
        <div className="panel-title">
          <Icon name="history" width={16} height={16} /> History <span className="grow" />
          <span className="faint" style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}>
            {events.length} {backend.mode==='firebase'?'loaded events':'events'}, newest first
          </span>
        </div>
        <History
          events={events}
          users={users}
          onCorrect={
            actions.includes('correct') && !offline
              ? (e) => {
                  setPresetEvent(e);
                  setAction('correct');
                }
              : undefined
          }
        />
      </div>

      {prefs.advancedTools && !offline && role !== 'VIEWER' && (
        <button className="btn ghost small wrap" style={{ alignSelf: 'flex-start' }} onClick={() => void otherDevice()}>
          <Icon name="bolt" /> Demo: another phone changes this pallet now
        </button>
      )}

      {action && action !== 'split' && <ActionSheet kind={action} detail={detail} presetEvent={presetEvent} onClose={() => setAction(null)} />}
      {action === 'split' && <SplitSheet detail={detail} onClose={() => setAction(null)} />}
      {slip && <DispatchSlip dispatchRef={slip} onClose={() => setSlip(null)} />}
      {issueOpen && <IssueSheet pallets={[backend.db.pallets[p.id] ?? p]} onClose={() => setIssueOpen(false)} />}
      {labelOpen && <LabelSheet palletIds={[p.id]} onClose={() => setLabelOpen(false)} />}
      {photoOpen && (
        <Sheet title={`Photo · ${p.code}`} onClose={() => setPhotoOpen(null)} wide>
          <div className="lightbox stack">
            <PhotoImage id={photoOpen} thumbnail={false} alt={`Photo of ${p.code}`} />
            {actions.includes('remove_photo') && (
              <div className="stack">
                <p className="muted">A supervisor can remove an incorrect photo from display. The removal is recorded with a reason.</p>
                <button
                  className="btn danger"
                  style={{ alignSelf: 'flex-start' }}
                  onClick={async () => {
                    const r = await removeCmd.run('remove_photo', { attachment_id: photoOpen, reason: 'Incorrect photo' }, backend.db.pallets[p.id]);
                    if (r.phase === 'done') {
                      toast('Photo removed from display');
                      setPhotoOpen(null);
                    }
                  }}
                >
                  <Icon name="trash" /> Remove photo (reason: incorrect photo)
                </button>
              </div>
            )}
          </div>
        </Sheet>
      )}
    </div>
  );
}
