// Move: two scans and a confirmation (blueprint page 12).

import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import { makeLabelPayload, uuid } from '../../domain/codes';
import { roleAllows } from '../../domain/transitions';
import type { Location, Pallet } from '../../domain/types';
import { eligibility } from '../../data/outbox';
import { buzz } from '../../device/scanner';
import { parseScanCommand } from '../../device/scanCommands';
import { useScanRouter, useScanTarget } from '../../device/scanRouter';
import { useApp } from '../../app/state';
import { Icon } from '../../ui/icons';
import { Explain, HoldBadge, Notice, PageHead, PermissionDenied, Plate, Spinner, StateBadge, WhereCell, fmtTime } from '../../ui/ui';
import { ScanPanel, type DemoTarget } from '../scan/ScanPanel';
import { asSentence, isDoubleRead } from '../station/logic';
import { initialMove, moveReducer, type MoveState } from './machine';

const INTENT_VERB = { place: 'Place', move: 'Move', verify_location: 'Confirm still here' } as const;

export function Move() {
  const app = useApp();
  const { backend, actorId, workspaceId, role, route, prefs, toast, go } = app;
  const [s, dispatch] = useReducer(moveReducer, initialMove);
  const [otherBusy, setOtherBusy] = useState(false);

  // Set the pallet before the scan input becomes interactive. A passive effect can replace
  // the first input after a quick typed/hardware scan and silently lose the destination.
  useLayoutEffect(() => {
    if (route.id && actorId && workspaceId) {
      try {
        const d = backend.reader.pallet(actorId, workspaceId, route.id);
        const token = backend.reader.activeLabel(d.pallet.id)?.token ?? d.pallet.code;
        dispatch({ type: 'RESET' });
        dispatch({ type: 'SCAN_PALLET', pallet: d.pallet, raw: makeLabelPayload('P', token), at: Date.now() });
      } catch {
        /* ignore stale links */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.id, actorId, workspaceId]);

  const e = backend.reader;
  const locations = useMemo(() => (workspaceId ? Object.values(e.db.locations).filter((l) => l.workspace_id === workspaceId) : []), [e, workspaceId, app.v]);
  const locById = (id: string | null) => (id ? e.db.locations[id] ?? null : null);

  const demoPallets: DemoTarget[] = useMemo(() => {
    if (!workspaceId) return [];
    const ps = Object.values(e.db.pallets).filter((p) => p.workspace_id === workspaceId && (p.state === 'RECEIVED' || p.state === 'STORED'));
    ps.sort((a, b) => (a.state === b.state ? b.updated_at.localeCompare(a.updated_at) : a.state === 'RECEIVED' ? -1 : 1));
    return ps.slice(0, 6).map((p) => ({ label: p.code, sub: p.description.slice(0, 18), text: makeLabelPayload('P', e.activeLabel(p.id)?.token ?? '') }));
  }, [e, workspaceId, app.v]);

  const demoLocs: DemoTarget[] = useMemo(
    () =>
      locations
        .filter((l) => l.active)
        .sort((a, b) => a.code.localeCompare(b.code))
        .map((l) => ({ label: l.code, sub: l.kind === 'RACK' ? undefined : l.kind.toLowerCase(), text: makeLabelPayload('L', e.activeLabel(l.id)?.token ?? '') })),
    [locations, e],
  );

  // At the review and result steps a hardware scan acts on the move instead of opening a record:
  // scanning the same rack again (or CMD:CONFIRM) saves, CMD:CANCEL changes the rack,
  // and after a save the next pallet label starts the next move.
  const confirmRef = useRef<() => void>(() => {});
  const { settings: scanSettings } = useScanRouter();
  useScanTarget(
    'move-review',
    (ev) => {
      if (!actorId || !workspaceId) return false;
      const cmd = parseScanCommand(ev.text);
      if (s.stage === 'REVIEW') {
        if (cmd === 'CONFIRM') return confirmRef.current(), true;
        if (cmd === 'CANCEL') return dispatch({ type: 'CANCEL_REVIEW' }), true;
        // Other command barcodes (a mode, Finish) are refused too: opening the Scan station would drop this move.
        if (!cmd) {
          // A scanner double read of the rack that opened this review is the same scan, not a confirmation.
          const last = s.lastScan && { raw: s.lastScan.text, at: s.lastScan.at };
          if (isDoubleRead(last, ev.text, ev.at, ev.source)) return true;
          try {
            const r = backend.reader.resolve(actorId, workspaceId, ev.text);
            if (r.type === 'location' && r.location.id === s.destination?.id && scanSettings.confirmByRescan) return confirmRef.current(), true;
          } catch {
            /* not a label we know; the hint below covers it */
          }
        }
        toast(scanSettings.confirmByRescan ? `Scan ${s.destination?.code} again or scan Confirm to save. Scan Cancel to pick another rack.` : 'Scan Confirm or tap Confirm to save. Scan Cancel to pick another rack.', 'info');
        return 'error';
      }
      if (s.stage === 'RESULT' && !cmd) {
        try {
          const r = backend.reader.resolve(actorId, workspaceId, ev.text);
          if (r.type !== 'pallet') return false;
          dispatch({ type: 'RESET' });
          dispatch({ type: 'SCAN_PALLET', pallet: r.pallet, raw: ev.text, at: Date.now() });
          return true;
        } catch {
          return false;
        }
      }
      return false;
    },
    s.stage === 'REVIEW' || s.stage === 'RESULT',
  );

  // Warn before leaving a move that is waiting for its confirmation.
  const { setLeaveGuard } = app;
  const pendingCode = s.stage === 'REVIEW' ? (s.pallet?.code ?? null) : null;
  useEffect(() => {
    setLeaveGuard(pendingCode ? `The move of ${pendingCode} is not confirmed. Leaving discards it.` : null);
  }, [pendingCode, setLeaveGuard]);
  useEffect(() => () => setLeaveGuard(null), [setLeaveGuard]);

  if (!roleAllows(role, 'move')) {
    return (
      <div className="stack">
        <PageHead eyebrow="Warehouse" title="Move" />
        <PermissionDenied what="Moving pallets" need="Operator" />
      </div>
    );
  }

  const confirm = async () => {
    if (!s.pallet || !s.destination || !s.intent || !actorId || !workspaceId) return;
    const commandId = s.commandId ?? uuid();
    dispatch({ type: 'CONFIRM', commandId });
    const cmd = app.envelope(s.intent, { location_id: s.destination.id }, s.pallet, { commandId });
    if (backend.network === 'offline') {
      const el = eligibility(s.intent, s.pallet, s.destination.active, backend.outbox.entries);
      if (!el.ok) {
        dispatch({ type: 'REJECTED', result: { ok: false, command_id: commandId, kind: s.intent, code: 'TEMPORARY_FAILURE', message: el.message, correlation_id: '-' } });
        return;
      }
      try {
        await backend.queueOffline({
          command: cmd,
          actor_id: actorId,
          workspace_id: workspaceId,
          pallet_id: s.pallet.id,
          pallet_code: s.pallet.code,
          expected_version: s.pallet.version,
          kind: s.intent === 'verify_location' ? 'verify_location' : 'move',
          from_code: locById(s.pallet.current_location_id)?.code ?? null,
          to_code: s.destination.code,
          created_at: new Date().toISOString(),
        });
        dispatch({ type: 'QUEUED' });
      } catch (err) {
        dispatch({ type: 'REJECTED', result: { ok: false, command_id: commandId, kind: s.intent, code: 'TEMPORARY_FAILURE', message: `Not queued: ${(err as Error).message}`, correlation_id: '-' } });
      }
      return;
    }
    const outcome = await backend.send(actorId, cmd);
    if (outcome.status === 'result') {
      if (outcome.result.ok) {
        if (prefs.haptics) buzz(30);
        dispatch({ type: 'ACCEPTED', result: outcome.result });
      } else {
        if (prefs.haptics) buzz([40, 60, 40]);
        dispatch({ type: 'REJECTED', result: outcome.result });
      }
    } else if (outcome.status === 'unknown') dispatch({ type: 'LOST' });
    else if (outcome.status === 'offline') dispatch({ type: 'REJECTED', result: { ok: false, command_id: commandId, kind: s.intent, code: 'TEMPORARY_FAILURE', message: outcome.message, correlation_id: '-' } });
  };

  confirmRef.current = () => void confirm();

  const recover = async () => {
    if (!s.commandId || !actorId || !workspaceId) return;
    dispatch({ type: 'CONFIRM', commandId: s.commandId });
    const outcome = await backend.recover(actorId, workspaceId, s.commandId);
    if (outcome.status === 'result') dispatch({ type: outcome.result.ok ? 'ACCEPTED' : 'REJECTED', result: outcome.result });
    else dispatch({ type: 'LOST' });
  };

  const otherDevice = async () => {
    if (!s.pallet || !workspaceId) return;
    setOtherBusy(true);
    const current = backend.db.pallets[s.pallet.id];
    const choices = locations.filter((l) => l.active && l.kind === 'RACK' && l.id !== current.current_location_id && l.id !== s.destination?.id);
    const target = choices[Math.floor(Math.random() * choices.length)];
    const kind = current.state === 'RECEIVED' ? 'place' : 'move';
    const r = await backend.simulateOtherDevice('user-supervisor', workspaceId, kind, current, { location_id: target.id });
    setOtherBusy(false);
    toast(r.ok ? `Another phone (the supervisor's) just put ${current.code} at ${target.code}. Now confirm yours.` : `Other phone could not move it: ${r.message}`, r.ok ? 'info' : 'error');
  };

  const stageIndex = s.stage === 'EXPECT_PALLET' ? 0 : s.stage === 'EXPECT_LOCATION' ? 1 : 2;
  const offline = backend.network === 'offline';

  return (
    <div className="stack">
      <PageHead
        eyebrow={offline ? 'Warehouse · offline' : 'Warehouse'}
        title="Move pallet"
        sub="Scan the pallet, scan where it is going, confirm. Review the destination before saving."
        actions={
          s.stage !== 'EXPECT_PALLET' && (
            <button className="btn" onClick={() => dispatch({ type: 'RESET' })}>
              <Icon name="refresh" /> Start over
            </button>
          )
        }
      />
      <Explain refs="pages 12, 21-23">
        <p>
          A move is two scans and one clear action. The first scan locks in the pallet; the second must be a rack or location label in this warehouse. You then see the pallet, its job,
          where it was, and where it is going, and tap <strong>Confirm</strong>.
        </p>
        <ul>
          <li>Scanning a rack first says “Scan the pallet first”. Scanning a second pallet label while a rack is expected is rejected.</li>
          <li>The same label seen by the camera many times in a row counts once, and a double tap on Confirm still sends one request.</li>
          <li>Dispatched pallets go to <em>Record return</em>, missing pallets go to <em>Found pallet</em>, and retired pallets cannot move.</li>
          <li>If someone else moved the pallet since you scanned it, you get a conflict with the newer location and decide again. Last-write-wins is never used for custody history.</li>
          <li>If the network drops after you confirm, the app keeps the request and asks the server for its receipt. It never guesses.</li>
        </ul>
      </Explain>

      {offline && (
        <Notice tone="warn" icon="wifiOff" title="Offline: limited moves only">
          Moves and location checks for stored pallets can be saved on this device and sent later. They are <strong>queued, not confirmed</strong>, until the server accepts them. Everything else waits
          for the connection.
        </Notice>
      )}

      <div className="steps" data-tour="move-steps">
        {/* Step 1: pallet */}
        <div className={`step ${stageIndex === 0 ? 'active' : 'done'}`}>
          <span className="num-badge">{stageIndex > 0 ? <Icon name="check" width={18} height={18} /> : 1}</span>
          <div className="stack" style={{ gap: 10 }}>
            <div className="step-label">Pallet</div>
            {s.pallet && stageIndex > 0 ? (
              <PalletLine pallet={s.pallet} location={locById(s.pallet.current_location_id)} />
            ) : (
              <>
                <ScanPanel
                  prompt="Point at the pallet label"
                  demoTargets={demoPallets}
                  placeholder="P-000042"
                  onResolved={(r, raw) => {
                    if (r.type === 'pallet') dispatch({ type: 'SCAN_PALLET', pallet: r.pallet, raw, at: Date.now() });
                    else dispatch({ type: 'SCAN_LOCATION', location: r.location, raw, at: Date.now() });
                  }}
                  onError={(text, raw) => dispatch({ type: 'SCAN_ERROR', text, raw, at: Date.now() })}
                />
                {s.message && stageIndex === 0 && <StageMessage s={s} onRoute={(r) => s.pallet && go({ name: 'pallet', id: s.pallet.id, q: r })} />}
              </>
            )}
          </div>
        </div>

        {/* Step 2: destination */}
        <div className={`step ${stageIndex === 1 ? 'active' : stageIndex > 1 ? 'done' : ''}`}>
          <span className="num-badge">{stageIndex > 1 ? <Icon name="check" width={18} height={18} /> : 2}</span>
          <div className="stack" style={{ gap: 10 }}>
            <div className="step-label">Destination</div>
            {stageIndex < 1 && <p className="muted">Scan the pallet first.</p>}
            {stageIndex === 1 && (
              <>
                {s.message && <StageMessage s={s} />}
                <ScanPanel
                  prompt="Point at the rack label"
                  demoTargets={demoLocs}
                  placeholder="A-03-02"
                  autoFocusInput={!!route.id}
                  onResolved={(r, raw) => {
                    if (r.type === 'location') dispatch({ type: 'SCAN_LOCATION', location: r.location, raw, at: Date.now() });
                    else dispatch({ type: 'SCAN_PALLET', pallet: r.pallet, raw, at: Date.now() });
                  }}
                  onError={(text, raw) => dispatch({ type: 'SCAN_ERROR', text, raw, at: Date.now() })}
                />
              </>
            )}
            {stageIndex > 1 && s.destination && (
              <div className="row">
                <Plate code={s.destination.code} kind={s.destination.kind.toLowerCase()} />
              </div>
            )}
          </div>
        </div>

        {/* Step 3: review & result */}
        <div className={`step ${stageIndex === 2 ? 'active' : ''}`}>
          <span className="num-badge">3</span>
          <div className="stack" style={{ gap: 12 }}>
            <div className="step-label">Confirm</div>
            {stageIndex < 2 && <p className="muted">Review appears here after both scans.</p>}
            {(s.stage === 'REVIEW' || s.stage === 'SUBMITTING' || s.stage === 'UNKNOWN') && s.pallet && s.destination && s.intent && (
              <Review
                s={s}
                from={locById(s.pallet.current_location_id)}
                busy={s.stage === 'SUBMITTING'}
                onConfirm={() => void confirm()}
                onCancel={() => dispatch({ type: 'CANCEL_REVIEW' })}
                onRecover={() => void recover()}
                onOther={() => void otherDevice()}
                otherBusy={otherBusy}
                offline={offline}
                confirmByRescan={scanSettings.confirmByRescan}
              />
            )}
            {s.stage === 'RESULT' && s.result?.ok && s.pallet && (
              <div className="big-result">
                <div className="br-title">
                  <Icon name="checkCircle" />
                  {s.intent === 'verify_location' ? `Confirmed at ${s.destination?.code}` : s.intent === 'place' ? `Placed at ${s.destination?.code}` : `Moved to ${s.destination?.code}`}
                </div>
                <div className="muted">
                  {s.pallet.code} · {s.pallet.description}{prefs.advancedTools && <> · version {s.result.new_version}</>} · {fmtTime(s.result.accepted_at)}
                  {s.result.replayed && ' · recovered from the saved receipt'}
                </div>
                <div className="row">
                  <button className="btn primary big" onClick={() => dispatch({ type: 'RESET' })} autoFocus>
                    Next pallet
                  </button>
                  <button className="btn" onClick={() => go({ name: 'pallet', id: s.pallet!.id })}>
                    Open record
                  </button>
                </div>
              </div>
            )}
            {s.stage === 'QUEUED' && s.pallet && (
              <div className="big-result warn">
                <div className="br-title">
                  <Icon name="sync" />
                  Queued on this device, not confirmed
                </div>
                <p>
                  Last confirmed location stays <strong>{locById(s.pallet.current_location_id)?.code ?? 'unassigned'}</strong>. Proposed: <strong>{s.destination?.code}</strong>. It is sent when you reconnect. If the
                  pallet changed meanwhile, you will be asked to decide.
                </p>
                <div className="row">
                  <button className="btn primary big" onClick={() => dispatch({ type: 'RESET' })}>
                    Next pallet
                  </button>
                  <button className="btn" onClick={() => go('sync')}>
                    View queue
                  </button>
                </div>
              </div>
            )}
            {s.stage === 'CONFLICT' && s.pallet && (
              <div className="stack">
                <Notice tone="warn" title="Someone else updated this pallet first">
                  Nothing was changed by your request. Here is the newer record. Check the pallet physically, then scan the destination again to decide.
                </Notice>
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
                  <button className="btn primary" onClick={() => dispatch({ type: 'REFRESH_PALLET', pallet: backend.db.pallets[s.pallet!.id] })}>
                    Decide again
                  </button>
                  <button className="btn" onClick={() => dispatch({ type: 'RESET' })}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PalletLine({ pallet, location }: { pallet: Pallet; location: Location | null }) {
  const { read } = useApp();
  const job = read((e) => e.db.jobs[pallet.job_id]);
  return (
    <div className="row" style={{ alignItems: 'flex-start' }}>
      <div className="grow">
        <div className="row" style={{ gap: 8 }}>
          <span className="pcode" style={{ fontSize: 26 }}>
            {pallet.code}
          </span>
          <StateBadge state={pallet.state} />
          {pallet.hold && <HoldBadge title={pallet.hold.reason} />}
        </div>
        <div style={{ fontWeight: 600 }}>{pallet.description}</div>
        <div className="muted">
          <span className="jcode">{job?.code}</span> · {job?.name}
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div className="eyebrow">Now</div>
        {location ? <Plate code={location.code} size="sm" /> : <Plate code="UNASSIGNED" size="sm" variant="none" />}
      </div>
    </div>
  );
}

function StageMessage({ s, onRoute }: { s: MoveState; onRoute?: (r: string) => void }) {
  if (!s.message) return null;
  const tone = s.message.tone === 'ok' ? 'ok' : s.message.tone;
  return (
    <Notice
      tone={tone}
      actions={
        s.blockedRoute && onRoute ? (
          <button className="btn small" onClick={() => onRoute(s.blockedRoute!)}>
            {s.blockedRoute === 'return' ? 'Open record to record return' : 'Open record to mark found'}
          </button>
        ) : undefined
      }
    >
      {s.message.text}
    </Notice>
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
  confirmByRescan,
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
  confirmByRescan: boolean;
}) {
  const { read, prefs } = useApp();
  const p = s.pallet!;
  const job = read((e) => e.db.jobs[p.job_id]);
  const verb = INTENT_VERB[s.intent!];
  return (
    <div className="stack">
      <div className="panel" style={{ background: 'var(--surface-2)' }}>
        <div className="row" style={{ alignItems: 'center', gap: 14 }}>
          <div className="stack" style={{ gap: 2 }}>
            <span className="eyebrow" style={{ margin: 0 }}>
              From
            </span>
            {from ? <Plate code={from.code} size="sm" /> : <Plate code="UNASSIGNED" size="sm" variant="none" />}
          </div>
          <Icon name="move" width={28} height={28} className="arrow" />
          <div className="stack" style={{ gap: 2 }}>
            <span className="eyebrow" style={{ margin: 0 }}>
              To
            </span>
            <Plate code={s.destination!.code} size="lg" kind={s.destination!.kind.toLowerCase()} />
          </div>
        </div>
        <div className="divider" style={{ margin: '12px 0' }} />
        <div>
          <span className="pcode">{p.code}</span> · <strong>{p.description}</strong>
        </div>
        <div className="muted">
          Job <span className="jcode">{job?.code}</span> {job?.name}{prefs.advancedTools && <> · version {p.version}</>}
        </div>
        {p.hold && (
          <div style={{ marginTop: 8 }}>
            <HoldBadge /> <span className="muted">Hold reason: {asSentence(p.hold.reason)} The hold stays on after the move.</span>
          </div>
        )}
        {s.intent === 'verify_location' && <p style={{ marginTop: 8 }}>This is where the pallet is already recorded. Confirming adds a verification event and refreshes “last confirmed”, without inventing a move.</p>}
      </div>
      {s.message && <Notice tone={s.message.tone === 'ok' ? 'ok' : s.message.tone}>{s.message.text}</Notice>}
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
            {busy ? 'Waiting for server…' : offline ? `Queue: ${verb.toLowerCase()} ${s.destination!.code}` : `${verb}${s.intent === 'verify_location' ? '' : `: ${s.destination!.code}`}`}
          </button>
          <button className="btn" onClick={onCancel} disabled={busy}>
            Change destination
          </button>
        </div>
      )}
      {s.stage === 'REVIEW' && (
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>
          Using a scanner? {confirmByRescan ? `Scan ${s.destination!.code} again or scan Confirm to save.` : 'Scan Confirm to save.'}
        </p>
      )}
      {prefs.advancedTools && !offline && s.stage === 'REVIEW' && (
        <button className="btn ghost small wrap" style={{ alignSelf: 'flex-start' }} onClick={onOther} disabled={otherBusy}>
          <Icon name="bolt" /> Demo: another phone moves this pallet before you confirm
        </button>
      )}
    </div>
  );
}
