// The scan-first put-away, move, stage and ship task, on the shared ScanFlow layout. Used by the Move screen (all
// three modes) and by Receive's put-away step (one pallet, already scanned).
//
// Move and Stage: scan the pallet, scan the spot, then scan the same spot again to save (or scan Confirm, or tap
// Save). The rescan is the review the move rules ask for; with "Confirm moves by scanning the rack again" off in
// Scanners, Confirm or the button saves. After a save the next pallet scan starts the next move. Stage only takes
// staging spots. Ship: scan the pallet and its dispatch form opens at once; after saving it, scan the next one.
// The camera stays on throughout; only the prompt changes.

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { makeLabelPayload, uuid } from '../../domain/codes';
import { availableActions, roleAllows } from '../../domain/transitions';
import type { Location, Pallet } from '../../domain/types';
import { ReadError, type PalletDetail } from '../../demo/engine';
import { eligibility } from '../../data/outbox';
import { parseScanCommand } from '../../device/scanCommands';
import { useScanRouter, useScanTarget, type ScanEvent } from '../../device/scanRouter';
import { useApp } from '../../app/state';
import { BRAND } from '../../brand';
import { Icon } from '../../ui/icons';
import { HoldBadge, Notice, Plate, Spinner, StateBadge, WhereCell, fmtTime } from '../../ui/ui';
import { ScanFlow, useFlowFlash } from '../scan/ScanFlow';
import type { DemoTarget } from '../scan/ScanPanel';
import { asSentence, isDoubleRead } from '../station/logic';
import { ActionSheet } from '../pallet/Actions';
import { initialMove, moveReducer, type MoveEvent, type MoveState } from './machine';
import { fitCheck, fmtLb, palletSize, palletWeight, suggestLocations, type FitProblem } from '../../domain/capacity';
import { blankInfo, productKey } from '../../domain/receiving';

export type MoveMode = 'move' | 'stage' | 'ship';

const INTENT_VERB = { place: 'Place', move: 'Move', verify_location: 'Confirm still here' } as const;

/** A pallet scanned again this soon after it was saved is the camera seeing its label again, not a new task. */
const SAME_PALLET_AFTER_SAVE_MS = 8000;

export interface MoveFlowProps {
  mode?: MoveMode;
  /** A pallet to start with (opened from a record, or just received). */
  start?: Pallet | null;
  /** Receive's put-away step: this one pallet only. After the save, scans go back to the screen. */
  single?: boolean;
  /** Shown under the result in single mode (Receive's next steps). */
  after?: ReactNode;
  onSaved?: (p: Pallet) => void;
  testId?: string;
}

export function MoveFlow({ mode = 'move', start, single = false, after, onSaved, testId = 'move-flow' }: MoveFlowProps) {
  const app = useApp();
  const { backend, actorId, workspaceId, prefs, toast, go, role } = app;
  const { settings: scanSettings } = useScanRouter();
  const flash = useFlowFlash();
  const [s, setS] = useState<MoveState>(initialMove);
  const sRef = useRef(s);
  const savedAt = useRef(0);
  const [otherBusy, setOtherBusy] = useState(false);
  const [shipping, setShipping] = useState<PalletDetail | null>(null);
  const [shipped, setShipped] = useState<Pallet | null>(null);

  const apply = (e: MoveEvent): MoveState => {
    const next = moveReducer(sRef.current, e);
    sRef.current = next;
    setS(next);
    return next;
  };

  // Set the pallet before the screen takes scans. A passive effect could replace a quick first scan.
  useLayoutEffect(() => {
    if (!start) return;
    const token = backend.reader.activeLabel(start.id)?.token ?? start.code;
    apply({ type: 'RESET' });
    apply({ type: 'SCAN_PALLET', pallet: backend.reader.db.pallets[start.id] ?? start, raw: makeLabelPayload('P', token), at: Date.now() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start?.id]);

  // A new mode is a new task: drop a half-done one (the screen asked before leaving a move waiting to be saved).
  const firstMode = useRef(true);
  useEffect(() => {
    if (firstMode.current) {
      firstMode.current = false;
      return;
    }
    apply({ type: 'RESET' });
    setShipped(null);
    flash.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const e = backend.reader;
  const locations = useMemo(() => (workspaceId ? Object.values(e.db.locations).filter((l) => l.workspace_id === workspaceId) : []), [e, workspaceId, app.v]);
  const locById = (id: string | null) => (id ? e.db.locations[id] ?? null : null);
  const staging = locations.filter((l) => l.active && l.kind === 'STAGING').sort((a, b) => a.code.localeCompare(b.code));

  const demoPallets: DemoTarget[] = useMemo(() => {
    if (!workspaceId) return [];
    const ok = mode === 'ship' ? (p: Pallet) => p.state === 'STORED' && !p.hold : (p: Pallet) => p.state === 'RECEIVED' || p.state === 'STORED';
    const ps = Object.values(e.db.pallets).filter((p) => p.workspace_id === workspaceId && ok(p));
    ps.sort((a, b) => (a.state === b.state ? b.updated_at.localeCompare(a.updated_at) : a.state === 'RECEIVED' ? -1 : 1));
    return ps.slice(0, 6).map((p) => ({ label: p.code, sub: p.description.slice(0, 18), text: makeLabelPayload('P', e.activeLabel(p.id)?.token ?? '') }));
  }, [e, workspaceId, app.v, mode]);
  const demoLocs: DemoTarget[] = useMemo(
    () =>
      locations
        .filter((l) => l.active && (mode !== 'stage' || l.kind === 'STAGING'))
        .sort((a, b) => a.code.localeCompare(b.code))
        .map((l) => ({ label: l.code, sub: l.kind === 'RACK' ? undefined : l.kind.toLowerCase(), text: makeLabelPayload('L', e.activeLabel(l.id)?.token ?? '') })),
    [locations, e, mode],
  );

  // Warn before leaving a move that is waiting to be saved.
  const { setLeaveGuard } = app;
  const pendingCode = s.stage === 'REVIEW' ? (s.pallet?.code ?? null) : null;
  useEffect(() => {
    setLeaveGuard(pendingCode ? `The move of ${pendingCode} is not saved. Leaving discards it.` : null);
  }, [pendingCode, setLeaveGuard]);
  useEffect(() => () => setLeaveGuard(null), [setLeaveGuard]);

  // ------------------------------------------------------------------ saving

  const confirm = async () => {
    const cur = sRef.current;
    if (!cur.pallet || !cur.destination || !cur.intent || !actorId || !workspaceId) return;
    if (cur.stage !== 'REVIEW') return;
    const commandId = cur.commandId ?? uuid();
    const { pallet, destination, intent } = cur;
    apply({ type: 'CONFIRM', commandId });
    const cmd = app.envelope(intent, { location_id: destination.id }, pallet, { commandId });
    if (backend.network === 'offline') {
      const el = eligibility(intent, pallet, destination.active, backend.outbox.entries);
      if (!el.ok) {
        apply({ type: 'REJECTED', result: { ok: false, command_id: commandId, kind: intent, code: 'TEMPORARY_FAILURE', message: el.message, correlation_id: '-' } });
        flash.bad(el.message);
        return;
      }
      try {
        await backend.queueOffline({
          command: cmd,
          actor_id: actorId,
          workspace_id: workspaceId,
          pallet_id: pallet.id,
          pallet_code: pallet.code,
          expected_version: pallet.version,
          kind: intent === 'verify_location' ? 'verify_location' : 'move',
          from_code: locById(pallet.current_location_id)?.code ?? null,
          to_code: destination.code,
          created_at: new Date().toISOString(),
        });
        apply({ type: 'QUEUED' });
        savedAt.current = Date.now();
        flash.note(`${pallet.code} queued for ${destination.code}. Not confirmed until you reconnect.`, 'warn');
      } catch (err) {
        const message = `Not queued: ${(err as Error).message}`;
        apply({ type: 'REJECTED', result: { ok: false, command_id: commandId, kind: intent, code: 'TEMPORARY_FAILURE', message, correlation_id: '-' } });
        flash.bad(message);
      }
      return;
    }
    const outcome = await backend.send(actorId, cmd);
    if (outcome.status === 'result') {
      if (outcome.result.ok) {
        apply({ type: 'ACCEPTED', result: outcome.result });
        savedAt.current = Date.now();
        flash.ok(intent === 'verify_location' ? `${pallet.code} checked at ${destination.code}. Saved.` : `${pallet.code} is on ${destination.code}. Saved.`);
        if (outcome.result.current_state) onSaved?.(outcome.result.current_state);
      } else {
        const next = apply({ type: 'REJECTED', result: outcome.result });
        if (next.stage === 'CONFLICT') flash.note(outcome.result.message, 'warn');
        else flash.bad(outcome.result.message);
      }
    } else if (outcome.status === 'unknown') {
      apply({ type: 'LOST' });
      flash.note('No answer from the server. Check the result before trying again.', 'warn');
    } else if (outcome.status === 'offline') {
      apply({ type: 'REJECTED', result: { ok: false, command_id: commandId, kind: intent, code: 'TEMPORARY_FAILURE', message: outcome.message, correlation_id: '-' } });
      flash.bad(outcome.message);
    }
  };

  const recover = async () => {
    const cur = sRef.current;
    if (!cur.commandId || !actorId || !workspaceId) return;
    apply({ type: 'CONFIRM', commandId: cur.commandId });
    const outcome = await backend.recover(actorId, workspaceId, cur.commandId);
    if (outcome.status === 'result') {
      apply({ type: outcome.result.ok ? 'ACCEPTED' : 'REJECTED', result: outcome.result });
      if (outcome.result.ok) {
        savedAt.current = Date.now();
        flash.ok('Saved. Recovered from the saved receipt.');
        if (outcome.result.current_state) onSaved?.(outcome.result.current_state);
      } else flash.bad(outcome.result.message);
    } else apply({ type: 'LOST' });
  };

  const otherDevice = async () => {
    const cur = sRef.current;
    if (!cur.pallet || !workspaceId) return;
    setOtherBusy(true);
    const current = backend.db.pallets[cur.pallet.id];
    const choices = locations.filter((l) => l.active && l.kind === 'RACK' && l.id !== current.current_location_id && l.id !== cur.destination?.id);
    const target = choices[Math.floor(Math.random() * choices.length)];
    const kind = current.state === 'RECEIVED' ? 'place' : 'move';
    const r = await backend.simulateOtherDevice('user-supervisor', workspaceId, kind, current, { location_id: target.id });
    setOtherBusy(false);
    toast(r.ok ? `Another phone (the supervisor's) just put ${current.code} at ${target.code}. Now confirm yours.` : `Other phone could not move it: ${r.message}`, r.ok ? 'info' : 'error');
  };

  // ------------------------------------------------------------------ scans

  const startPallet = (p: Pallet, raw: string, ev: ScanEvent): boolean | 'error' => {
    const cur = sRef.current;
    if ((cur.stage === 'RESULT' || cur.stage === 'QUEUED') && cur.pallet?.id === p.id && ev.source === 'camera' && Date.now() - savedAt.current < SAME_PALLET_AFTER_SAVE_MS) return true;
    if (mode === 'ship') return startShip(p);
    if (cur.stage !== 'EXPECT_PALLET') apply({ type: 'RESET' });
    const next = apply({ type: 'SCAN_PALLET', pallet: p, raw, at: Date.now() });
    if (next.stage !== 'EXPECT_LOCATION') {
      flash.bad(next.message?.text ?? `${p.code} cannot be moved.`);
      return 'error';
    }
    if (next.message?.tone === 'warn') flash.note(next.message.text, 'warn');
    else flash.ok(`${p.code} scanned`);
    return true;
  };

  const pickLocation = (loc: Location, raw: string, changed = false): boolean | 'error' => {
    if (mode === 'stage' && loc.kind !== 'STAGING') {
      flash.bad(`${loc.code} is not a staging spot. Scan a staging spot${staging.length ? `, such as ${staging[0].code}` : ''}.`);
      return 'error';
    }
    const next = apply({ type: 'SCAN_LOCATION', location: loc, raw, at: Date.now() });
    if (next.stage !== 'REVIEW') {
      flash.bad(next.message?.text ?? `${loc.code} cannot take it.`);
      return 'error';
    }
    flash.ok(changed ? `Changed to ${loc.code}` : `${loc.code} scanned`);
    return true;
  };

  const startShip = (p: Pallet): boolean | 'error' => {
    if (!actorId || !workspaceId) return false;
    if (!availableActions(p, role).includes('dispatch')) {
      flash.bad(shipBlocker(p));
      return 'error';
    }
    try {
      setShipping(backend.reader.pallet(actorId, workspaceId, p.id));
      setShipped(null);
      flash.ok(`${p.code} scanned`);
      return true;
    } catch (err) {
      flash.bad(err instanceof Error ? err.message : 'Could not open that pallet.');
      return 'error';
    }
  };

  const onScan = (ev: ScanEvent): boolean | 'error' => {
    if (!actorId || !workspaceId) return false;
    const cur = sRef.current;
    const cmd = parseScanCommand(ev.text);
    if (cmd) {
      if (cur.stage === 'REVIEW' && cmd === 'CONFIRM') return void confirm(), true;
      if (cur.stage === 'REVIEW' && cmd === 'CANCEL') {
        apply({ type: 'CANCEL_REVIEW' });
        flash.note('Scan another spot.');
        return true;
      }
      if (cur.stage === 'UNKNOWN' && cmd === 'CONFIRM') return void recover(), true;
      if (cmd === 'CANCEL' && cur.stage === 'EXPECT_LOCATION' && !single) {
        apply({ type: 'RESET' });
        flash.note('Cancelled. Nothing was saved.');
        return true;
      }
      // Mode barcodes open the Scan station, which would drop a move in progress.
      if (cur.stage === 'EXPECT_PALLET' || cur.stage === 'RESULT' || cur.stage === 'QUEUED') return false;
      flash.bad(cur.stage === 'REVIEW' ? `Scan ${cur.destination?.code} again or scan Confirm to save. Scan Cancel to pick another spot.` : 'Finish this pallet first, or scan Cancel.');
      return 'error';
    }
    // A scanner double read of the spot that opened the review is the same scan, not the confirming one.
    if (cur.stage === 'REVIEW' && isDoubleRead(cur.lastScan && { raw: cur.lastScan.text, at: cur.lastScan.at }, ev.text, ev.at, ev.source)) return true;
    let r: { type: 'pallet'; pallet: Pallet } | { type: 'location'; location: Location };
    try {
      r = backend.reader.resolve(actorId, workspaceId, ev.text);
    } catch (err) {
      flash.bad(err instanceof ReadError ? err.message : 'Could not read that label.');
      return 'error';
    }
    switch (cur.stage) {
      case 'EXPECT_PALLET':
      case 'RESULT':
      case 'QUEUED':
        if (r.type === 'location') {
          flash.bad(cur.stage === 'EXPECT_PALLET' ? `That is a spot (${r.location.code}). Scan the pallet first, then the spot.` : `That is a spot (${r.location.code}). Scan the next pallet.`);
          return 'error';
        }
        return startPallet(r.pallet, ev.text, ev);
      case 'EXPECT_LOCATION':
        if (r.type === 'pallet') {
          if (r.pallet.id === cur.pallet?.id) return true;
          flash.bad(`That is another pallet (${r.pallet.code}). Scan the spot for ${cur.pallet?.code}.`);
          return 'error';
        }
        return pickLocation(r.location, ev.text);
      case 'REVIEW':
        if (r.type === 'location') {
          if (r.location.id === cur.destination?.id) {
            if (scanSettings.confirmByRescan) return void confirm(), true;
            flash.note('Scan Confirm or tap Save to save.');
            return 'error';
          }
          apply({ type: 'CANCEL_REVIEW' });
          return pickLocation(r.location, ev.text, true);
        }
        if (r.pallet.id === cur.pallet?.id) return true;
        flash.bad(`Save ${cur.pallet?.code} first: scan ${cur.destination?.code} again, or scan another spot.`);
        return 'error';
      case 'CONFLICT':
        if (cur.pallet && (r.type === 'location' || r.pallet.id === cur.pallet.id)) {
          apply({ type: 'REFRESH_PALLET', pallet: backend.db.pallets[cur.pallet.id] ?? cur.pallet });
          return r.type === 'location' ? pickLocation(r.location, ev.text) : true;
        }
        flash.bad(`Decide on ${cur.pallet?.code} first. Scan the spot again, or tap Cancel.`);
        return 'error';
      case 'SUBMITTING':
        flash.note('Saving. One moment.');
        return 'error';
      case 'UNKNOWN':
        flash.bad('Check the result of the last save first.');
        return 'error';
    }
  };

  const takingScans = !shipping && !(single && (s.stage === 'RESULT' || s.stage === 'QUEUED'));
  useScanTarget(testId, onScan, takingScans && !!actorId);

  // ------------------------------------------------------------------ what to show

  const advanced = !!(workspaceId && backend.reader.activeWarehouse(workspaceId)?.advanced_measurements);
  // Checked before saving, so a full or weight-limited spot is caught while you still stand at the pallet.
  const fit = s.stage === 'REVIEW' && s.pallet && s.destination && s.intent !== 'verify_location' ? fitCheck(s.pallet, backend.db.locations[s.destination.id] ?? s.destination, advanced) : null;
  const offline = backend.network === 'offline';
  const prompt = promptFor(mode, s, scanSettings.confirmByRescan, !!fit, shipped, single);
  const demoTargets = s.stage === 'EXPECT_LOCATION' || s.stage === 'REVIEW' || s.stage === 'CONFLICT' ? demoLocs : demoPallets;
  const placeholder = s.stage === 'EXPECT_LOCATION' || s.stage === 'REVIEW' ? 'Type the spot code, e.g. A-03-02' : 'Type the pallet code, e.g. P-000042';

  return (
    <>
      <ScanFlow prompt={prompt.text} sub={prompt.sub} tone={prompt.tone} flash={flash.flash} demoTargets={demoTargets} placeholder={placeholder} testId={testId}>
        {mode === 'stage' && !staging.length && s.stage !== 'RESULT' && (
          <Notice tone="warn" title="No staging spots yet">
            Staging uses spots of the kind Staging.{' '}
            {roleAllows(role, 'create_location') ? (
              <button type="button" className="link" onClick={() => go('locations')}>
                Add one in Spots and labels.
              </button>
            ) : (
              'Ask a manager to add one.'
            )}
          </Notice>
        )}
        {offline && mode !== 'ship' && s.stage === 'EXPECT_PALLET' && (
          <p className="hint" style={{ margin: 0 }}>
            <Icon name="wifiOff" width={16} height={16} /> Offline: moves of stored pallets are queued on this device and sent when you reconnect.
          </p>
        )}

        {s.stage === 'EXPECT_PALLET' && s.pallet && s.blockedRoute && (
          <div className="row">
            <button type="button" className="btn small" onClick={() => (s.blockedRoute === 'transfer' && s.pallet!.transfer ? go({ name: 'transfer', id: s.pallet!.transfer.id }) : go({ name: 'pallet', id: s.pallet!.id, q: s.blockedRoute! }))}>
              {s.blockedRoute === 'transfer' ? 'Open transfer' : s.blockedRoute === 'return' ? 'Open record to record return' : 'Open record to mark found'}
            </button>
          </div>
        )}
        {mode === 'ship' && shipped && (
          <div className="big-result">
            <div className="br-title">
              <Icon name="checkCircle" /> Shipped {shipped.code}
            </div>
            <div className="muted">{shipped.description}</div>
          </div>
        )}

        {s.pallet && s.stage === 'EXPECT_LOCATION' && (
          <>
            <div className="flow-item">
              <PalletLine pallet={s.pallet} location={locById(s.pallet.current_location_id)} />
              {!single && (
                <button type="button" className="btn small" onClick={() => (apply({ type: 'RESET' }), flash.clear())}>
                  Start over
                </button>
              )}
            </div>
            {mode === 'stage' ? (
              staging.length > 0 && <SpotChoices title="Staging spots" spots={staging} onPick={(l) => pickLocation(l, `pick:${l.id}:${Date.now()}`)} />
            ) : (
              <Suggestions pallet={s.pallet} onPick={(l) => pickLocation(l, `pick:${l.id}:${Date.now()}`)} onUpdated={(pallet) => apply({ type: 'UPDATE_PALLET', pallet })} />
            )}
          </>
        )}

        {s.stage === 'REVIEW' && s.pallet && s.destination && fit && (
          <FitProblemPanel pallet={s.pallet} problem={fit} onUpdated={(pallet) => apply({ type: 'UPDATE_PALLET', pallet })} onOther={() => apply({ type: 'CANCEL_REVIEW' })} />
        )}
        {(s.stage === 'REVIEW' || s.stage === 'SUBMITTING' || s.stage === 'UNKNOWN') && !fit && s.pallet && s.destination && s.intent && (
          <Review
            s={s}
            from={locById(s.pallet.current_location_id)}
            busy={s.stage === 'SUBMITTING'}
            onConfirm={() => void confirm()}
            onCancel={() => apply({ type: 'CANCEL_REVIEW' })}
            onRecover={() => void recover()}
            onOther={() => void otherDevice()}
            otherBusy={otherBusy}
            offline={offline}
          />
        )}

        {s.stage === 'RESULT' && s.result?.ok && s.pallet && (
          <div className="big-result">
            <div className="br-title">
              <Icon name="checkCircle" />
              {doneText(s.intent ?? 'move', s.destination?.code ?? '')}
            </div>
            <div className="muted">
              {s.pallet.code} · {s.pallet.description}
              {prefs.advancedTools && <> · version {s.result.new_version}</>} · {fmtTime(s.result.accepted_at)}
              {s.result.replayed && ' · recovered from the saved receipt'}
            </div>
            {!single && (
              <div className="row">
                <button className="btn small" onClick={() => go({ name: 'pallet', id: s.pallet!.id })}>
                  Open record
                </button>
              </div>
            )}
          </div>
        )}
        {s.stage === 'QUEUED' && s.pallet && (
          <div className="big-result warn">
            <div className="br-title">
              <Icon name="sync" />
              Queued on this device, not confirmed
            </div>
            <p>
              Last confirmed spot stays <strong>{locById(s.pallet.current_location_id)?.code ?? 'unassigned'}</strong>. Going to: <strong>{s.destination?.code}</strong>. It is sent when you reconnect.
            </p>
            <div className="row">
              <button className="btn small" onClick={() => go('sync')}>
                View queue
              </button>
            </div>
          </div>
        )}
        {s.stage === 'CONFLICT' && s.pallet && (
          <div className="stack">
            <div className="panel row">
              <WhereCell pallet={s.pallet} location={locById(s.pallet.current_location_id)} lastLocation={locById(s.pallet.last_confirmed_location_id)} />
              <div className="grow">
                <div className="pcode">{s.pallet.code}</div>
                <div className="muted">
                  Now version {s.pallet.version} · <StateBadge state={s.pallet.state} />
                </div>
              </div>
            </div>
            <div className="row">
              <button className="btn primary" onClick={() => apply({ type: 'REFRESH_PALLET', pallet: backend.db.pallets[s.pallet!.id] })}>
                Decide again
              </button>
              <button className="btn" onClick={() => apply({ type: 'RESET' })}>
                Cancel
              </button>
            </div>
          </div>
        )}
        {single && (s.stage === 'RESULT' || s.stage === 'QUEUED') && after}
      </ScanFlow>
      {shipping && (
        <ActionSheet
          kind="dispatch"
          detail={shipping}
          onClose={() => {
            const now = backend.reader.db.pallets[shipping.pallet.id];
            setShipping(null);
            if (now?.state === 'DISPATCHED' && shipping.pallet.state !== 'DISPATCHED') {
              setShipped(now);
              flash.ok(`Shipped ${now.code}. Scan the next pallet.`);
            } else flash.note(`${shipping.pallet.code} was not shipped.`);
          }}
        />
      )}
    </>
  );
}

function doneText(intent: 'place' | 'move' | 'verify_location', code: string): string {
  return intent === 'verify_location' ? `Confirmed at ${code}` : intent === 'place' ? `Placed at ${code}` : `Moved to ${code}`;
}

/** Why a scanned pallet cannot ship, and what to do instead. */
function shipBlocker(p: Pallet): string {
  if (p.hold) return `${p.code} is on hold and cannot ship. Clear the hold first.`;
  switch (p.state) {
    case 'RECEIVED':
      return `${p.code} is not in a spot yet. Put it away first, then ship it.`;
    case 'DISPATCHED':
      return `${p.code} has already shipped.`;
    case 'IN_TRANSIT':
      return `${p.code} is on a transfer to another warehouse.`;
    case 'MISSING':
      return `${p.code} is marked missing. Record where it was found first.`;
    case 'RETIRED':
      return `${p.code} is retired.`;
    default:
      return `You cannot ship ${p.code} with this account.`;
  }
}

interface Prompt {
  text: string;
  sub?: ReactNode;
  tone: 'idle' | 'ok' | 'warn' | 'busy';
}

function promptFor(mode: MoveMode, s: MoveState, rescan: boolean, fit: boolean, shipped: Pallet | null, single: boolean): Prompt {
  const p = s.pallet;
  const what = p ? `${p.code} · ${p.description}` : undefined;
  if (mode === 'ship') return shipped ? { text: 'Shipped. Scan the next pallet', tone: 'ok' } : { text: 'Scan the pallet to ship', sub: 'Its dispatch form opens right away.', tone: 'idle' };
  switch (s.stage) {
    case 'EXPECT_PALLET':
      return mode === 'stage' ? { text: 'Scan the pallet to stage', sub: 'Then scan a staging spot.', tone: 'idle' } : { text: 'Scan the pallet', sub: 'Then scan the spot it goes to.', tone: 'idle' };
    case 'EXPECT_LOCATION':
      return { text: single ? 'Scan the spot to put it away' : mode === 'stage' ? 'Now scan a staging spot' : 'Now scan the spot', sub: what, tone: 'idle' };
    case 'REVIEW': {
      if (fit) return { text: 'This spot cannot take it', sub: 'Fix it below, or scan another spot.', tone: 'warn' };
      const code = s.destination?.code ?? '';
      if (!rescan) return { text: 'Scan Confirm to save', sub: 'Or tap Save. Scan another spot to change it.', tone: 'idle' };
      return { text: s.intent === 'verify_location' ? `Scan ${code} again to confirm` : `Scan ${code} again to save`, sub: 'Or tap the button. Scan another spot to change it.', tone: 'idle' };
    }
    case 'SUBMITTING':
      return { text: 'Saving…', sub: what, tone: 'busy' };
    case 'RESULT':
      return single ? { text: 'Put away. Scan the next delivery', sub: 'Or tap Receive another.', tone: 'ok' } : { text: 'Saved. Scan the next pallet', tone: 'ok' };
    case 'QUEUED':
      return single ? { text: 'Queued on this device', sub: what, tone: 'warn' } : { text: 'Queued. Scan the next pallet', sub: 'Not confirmed until you reconnect.', tone: 'warn' };
    case 'CONFLICT':
      return { text: 'Someone changed this pallet first', sub: 'Nothing was saved. Check it, then scan the spot again to decide.', tone: 'warn' };
    case 'UNKNOWN':
      return { text: 'Check the result', sub: 'No answer from the server. The move may already be saved.', tone: 'warn' };
  }
}

// ------------------------------------------------------------------ pieces

/** Spots to tap instead of scanning (staging spots in Stage mode). */
function SpotChoices({ title, spots, onPick }: { title: string; spots: Location[]; onPick: (l: Location) => void }) {
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="eyebrow">{title}</div>
      {spots.slice(0, 6).map((l) => (
        <button key={l.id} type="button" className="suggest-row" onClick={() => onPick(l)}>
          <Plate code={l.code} size="sm" kind="staging" />
          <span className="grow">Staging spot</span>
        </button>
      ))}
    </div>
  );
}

/** Where this pallet fits, most room first. Scanning a spot still works; tapping one is the same. */
export function Suggestions({ pallet, onPick, onUpdated }: { pallet: Pallet; onPick: (l: Location) => void; onUpdated: (p: Pallet) => void }) {
  const { backend, workspaceId, v, go } = useApp();
  const [all, setAll] = useState(false);
  const [adding, setAdding] = useState(false);
  const advanced = !!(workspaceId && backend.reader.activeWarehouse(workspaceId)?.advanced_measurements);
  const locs = useMemo(
    () => Object.values(backend.db.locations).filter((l) => l.workspace_id === workspaceId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [v, workspaceId],
  );
  const { suggestions: found, needWeight } = useMemo(() => suggestLocations(pallet, locs, Object.values(backend.db.pallets), advanced), [pallet, locs, advanced, backend.db.pallets]);
  // The product's home spot comes first when it can take the pallet, whatever else has room.
  const homeId = pallet.receiving?.product_code && workspaceId ? backend.db.products[productKey(workspaceId, pallet.receiving.product_code)]?.home_location_id : null;
  const homeLoc = homeId ? locs.find((l) => l.id === homeId && l.active && l.id !== pallet.current_location_id) : undefined;
  const homeFits = !!homeLoc && !fitCheck(pallet, homeLoc, advanced);
  const suggestions = homeFits ? found.filter((sg) => sg.location.id !== homeLoc!.id) : found;
  const homeRow = homeFits && (
    <button type="button" className="suggest-row best" onClick={() => onPick(homeLoc!)} data-testid="home-spot">
      <Plate code={homeLoc!.code} size="sm" />
      <span className="grow">
        <span className="tag ok">Home spot</span> Where this product normally lives
      </span>
    </button>
  );
  if (!locs.some((l) => l.capacity && l.active))
    return (
      <div className="stack" style={{ gap: 6 }}>
        {homeRow}
        <p className="hint" style={{ margin: 0 }}>
          Tip: give your spots a pallet capacity (
          <button type="button" className="link" onClick={() => go('locations')}>
            Spots
          </button>
          , open one, Set capacity) and {BRAND.name} suggests where each pallet fits.
        </p>
      </div>
    );
  const shown = all ? suggestions : suggestions.slice(0, 3);
  return (
    <div className="stack" style={{ gap: 6 }} data-testid="move-suggestions">
      <div className="eyebrow">Suggested spots</div>
      {homeRow}
      {suggestions.length === 0 && !homeFits && <p className="muted" style={{ margin: 0 }}>No spot with a set capacity has room for this pallet. Scan any spot, or give more spots a capacity.</p>}
      {shown.map((sg, i) => (
        <button key={sg.location.id} type="button" className={`suggest-row${i === 0 && !homeFits ? ' best' : ''}`} onClick={() => onPick(sg.location)}>
          <Plate code={sg.location.code} size="sm" />
          <span className="grow">
            {sg.left} pallet{sg.left === 1 ? '' : 's'} of space left{sg.weightLeft !== null ? ` · ${fmtLb(sg.weightLeft)} left` : ''}
            {sg.sameProduct && <span className="tag ok">Same product here</span>}
            {i === 0 && !sg.sameProduct && !homeFits && <span className="tag accent">Most room</span>}
          </span>
        </button>
      ))}
      {!all && suggestions.length > 3 && (
        <button type="button" className="btn small" style={{ alignSelf: 'flex-start' }} onClick={() => setAll(true)}>
          Show all {suggestions.length}
        </button>
      )}
      {advanced && needWeight > 0 && palletWeight(pallet) === null && !adding && (
        <p className="hint" style={{ margin: 0 }}>
          Move this pallet to a weight-restricted zone?{' '}
          <button type="button" className="link" onClick={() => setAdding(true)}>
            Add est. weight
          </button>{' '}
          and {needWeight} more spot{needWeight === 1 ? '' : 's'} with a weight limit {needWeight === 1 ? 'shows' : 'show'} up here.
        </p>
      )}
      {adding && <MeasureForm pallet={pallet} need="NO_WEIGHT" onSaved={(p) => (setAdding(false), onUpdated(p))} onCancel={() => setAdding(false)} />}
    </div>
  );
}

/** A spot that can't take this pallet: say why, and offer the fix or another spot. */
function FitProblemPanel({ pallet, problem, onUpdated, onOther }: { pallet: Pallet; problem: { problem: FitProblem; message: string }; onUpdated: (p: Pallet) => void; onOther: () => void }) {
  const [adding, setAdding] = useState(false);
  const fixable = problem.problem === 'NO_WEIGHT' || problem.problem === 'NO_SIZE';
  return (
    <div className="stack" data-testid="fit-problem">
      <Notice tone="error" title="This pallet can't go there">
        {problem.message}
      </Notice>
      {adding ? (
        <MeasureForm pallet={pallet} need={problem.problem} onSaved={(p) => (setAdding(false), onUpdated(p))} onCancel={() => setAdding(false)} />
      ) : (
        <div className="row">
          {fixable && (
            <button type="button" className="btn primary" onClick={() => setAdding(true)}>
              <Icon name="edit" /> {problem.problem === 'NO_WEIGHT' ? 'Add pallet weight' : 'Add pallet size'}
            </button>
          )}
          <button type="button" className="btn" onClick={onOther}>
            Choose another spot
          </button>
        </div>
      )}
    </div>
  );
}

/** Record a pallet's weight (and size) without leaving the move. */
function MeasureForm({ pallet, need, onSaved, onCancel }: { pallet: Pallet; need: FitProblem; onSaved: (p: Pallet) => void; onCancel: () => void }) {
  const { send, backend } = useApp();
  const info = { ...blankInfo(), ...(pallet.receiving ?? {}) };
  const [w, setW] = useState(info.weight_lb);
  const size = palletSize(pallet);
  const [dims, setDims] = useState({ l: size ? String(size.length) : info.length_in, wd: size ? String(size.width) : info.width_in, h: size ? String(size.height) : info.height_in });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const withSize = need === 'NO_SIZE' || need === 'TOO_BIG';
  const save = async () => {
    setBusy(true);
    setError('');
    const current = backend.db.pallets[pallet.id] ?? pallet;
    const receiving = { ...blankInfo(), ...(current.receiving ?? {}), weight_lb: w.trim(), ...(withSize ? { length_in: dims.l.trim(), width_in: dims.wd.trim(), height_in: dims.h.trim() } : {}) };
    const o = await send('edit_details', { receiving, reason: withSize ? 'Size recorded for a sized location' : 'Weight recorded for a weight-limited location' }, current, { commandId: uuid() });
    setBusy(false);
    if (o.status === 'result' && o.result.ok && o.result.current_state) onSaved(o.result.current_state);
    else setError(o.status === 'result' && !o.result.ok ? o.result.message : o.status === 'offline' ? o.message : 'No answer from the server. Open the pallet to check.');
  };
  return (
    <form
      className="panel stack"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="row nowrap">
        <input aria-label="Estimated weight (lb)" className="input" inputMode="decimal" value={w} onChange={(e) => setW(e.target.value)} placeholder="Estimated weight, lb" autoFocus />
        {withSize && (
          <>
            <input aria-label="Length (in)" className="input" inputMode="decimal" value={dims.l} onChange={(e) => setDims({ ...dims, l: e.target.value })} placeholder="L in" />
            <input aria-label="Width (in)" className="input" inputMode="decimal" value={dims.wd} onChange={(e) => setDims({ ...dims, wd: e.target.value })} placeholder="W in" />
            <input aria-label="Height (in)" className="input" inputMode="decimal" value={dims.h} onChange={(e) => setDims({ ...dims, h: e.target.value })} placeholder="H in" />
          </>
        )}
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="row">
        <button className="btn primary" disabled={busy || !(Number(w.replace(/,/g, '')) > 0) || (withSize && !(Number(dims.l) > 0 && Number(dims.wd) > 0 && Number(dims.h) > 0))}>
          {busy ? <Spinner /> : <Icon name="check" />} Save to {pallet.code}
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function PalletLine({ pallet, location }: { pallet: Pallet; location: Location | null }) {
  const { read } = useApp();
  const job = read((e) => (pallet.job_id ? e.db.jobs[pallet.job_id] : undefined));
  return (
    <div className="row grow" style={{ alignItems: 'center', minWidth: 0 }}>
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="row" style={{ gap: 8 }}>
          <span className="pcode">{pallet.code}</span>
          <StateBadge state={pallet.state} />
          {pallet.hold && <HoldBadge title={pallet.hold.reason} />}
        </div>
        <div className="flow-item-desc">{pallet.description}</div>
        {job && (
          <div className="muted">
            <span className="jcode">{job.code}</span> · {job.name}
          </div>
        )}
      </div>
      <div style={{ textAlign: 'right' }}>
        <div className="eyebrow">Now</div>
        {location ? <Plate code={location.code} size="sm" /> : <Plate code="UNASSIGNED" size="sm" variant="none" />}
      </div>
    </div>
  );
}

function Review({
  s,
  from,
  busy,
  onConfirm,
  onCancel,
  onRecover,
  onOther,
  otherBusy,
  offline,
}: {
  s: MoveState;
  from: Location | null;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onRecover: () => void;
  onOther: () => void;
  otherBusy: boolean;
  offline: boolean;
}) {
  const { prefs } = useApp();
  const p = s.pallet!;
  const verb = INTENT_VERB[s.intent!];
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="flow-item" style={{ display: 'grid', gap: 8 }}>
        <div className="flow-route">
          {from ? <Plate code={from.code} size="sm" /> : <Plate code="UNASSIGNED" size="sm" variant="none" />}
          <Icon name="move" className="arrow" />
          <Plate code={s.destination!.code} size="lg" kind={s.destination!.kind.toLowerCase()} />
        </div>
        <div>
          <span className="pcode">{p.code}</span> · <strong>{p.description}</strong>
          {prefs.advancedTools && <span className="muted"> · version {p.version}</span>}
        </div>
        {p.hold && (
          <div>
            <HoldBadge /> <span className="muted">Hold reason: {asSentence(p.hold.reason)} The hold stays on after the move.</span>
          </div>
        )}
        {s.intent === 'verify_location' && <p style={{ margin: 0 }}>It is already recorded here. Saving records a check that it is still here.</p>}
      </div>
      {s.stage === 'UNKNOWN' ? (
        <div className="row">
          <button className="btn primary big" onClick={onRecover}>
            <Icon name="sync" /> Check result
          </button>
        </div>
      ) : (
        <div className="row">
          <button className="btn primary big wrap" onClick={onConfirm} disabled={busy}>
            {busy ? <Spinner /> : <Icon name={s.intent === 'verify_location' ? 'check' : 'move'} />}
            {busy ? 'Saving…' : offline ? `Queue: ${verb.toLowerCase()} ${s.destination!.code}` : `${verb}${s.intent === 'verify_location' ? '' : `: ${s.destination!.code}`}`}
          </button>
          <button className="btn" onClick={onCancel} disabled={busy}>
            Choose another spot
          </button>
        </div>
      )}
      {prefs.advancedTools && !offline && s.stage === 'REVIEW' && (
        <button className="btn ghost small wrap" style={{ alignSelf: 'flex-start' }} onClick={onOther} disabled={otherBusy}>
          <Icon name="bolt" /> Demo: another phone moves this pallet before you confirm
        </button>
      )}
    </div>
  );
}
