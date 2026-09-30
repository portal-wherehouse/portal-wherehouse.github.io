// Scan station: a hands-free screen for someone holding a hardware scanner, readable from a few feet away.
// Four modes (Look up, Move, Put-away, Count); the rules live in logic.ts, this file wires them to the app.

import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import './station.css';
import { useApp } from '../../app/state';
import { eligibility } from '../../data/outbox';
import { uuid } from '../../domain/codes';
import type { Location, Pallet, Role } from '../../domain/types';
import { buzz } from '../../device/scanner';
import { useScanRouter, useScanTarget } from '../../device/scanRouter';
import { Icon, type IconName } from '../../ui/icons';
import { Explain, Notice, PageHead, ROLE_LABEL } from '../../ui/ui';
import {
  commandFor,
  initialStation,
  isSendable,
  makeCtx,
  modeAccess,
  modeFromQuery,
  outcomeToResult,
  promptFor,
  readScan,
  stationReducer,
  STATION_MODES,
  MODE_LABEL,
  unsavedWork,
  type CommandSpec,
  type CountList,
  type CountRow,
  type Effect,
  type LineResult,
  type StationAction,
  type StationMode,
  type StationState,
  type Step,
} from './logic';
import { SessionLog, TestLabels, TypeCode } from './side';
import { Codes, CountView, LookupView, MoveView, PutawayView, ReasonSheet } from './views';

const MODE_ICON: Record<StationMode, IconName> = { lookup: 'find', move: 'move', putaway: 'stack', count: 'checklist' };
const MODE_HINT: Record<StationMode, string> = {
  lookup: 'Where is it?',
  move: 'Pallet, then rack',
  putaway: 'One rack, many pallets',
  count: 'Check a rack',
};
const FLASH_ICON = { ok: 'checkCircle', info: 'info', warn: 'alert', error: 'alertCircle' } as const;
const MODE_KEY = 'wh.station.mode';

function rememberedMode(): StationMode | null {
  try {
    return modeFromQuery(localStorage.getItem(MODE_KEY));
  } catch {
    return null;
  }
}

function startMode(q: string | undefined, role: Role | null): StationMode {
  for (const m of [modeFromQuery(q), rememberedMode()]) if (m && modeAccess(role, m).ok) return m;
  return 'lookup';
}

/** A row waiting for its reason, with the rack its count was on when the sheet opened. */
type ReasonAsk = { list: CountList; row: CountRow; rack: Location };

export function Station() {
  const app = useApp();
  const { backend, actorId, workspaceId, role, route, go, prefs, toast } = app;
  const router = useScanRouter();
  const { settings } = router;
  const offline = backend.network === 'offline';

  const [state, setState] = useState<StationState>(() => {
    const s = initialStation(startMode(route.q, role));
    const asked = modeFromQuery(route.q);
    if (asked && asked !== s.mode) {
      const a = modeAccess(role, asked);
      if (!a.ok) return { ...s, flash: { tone: 'error', text: a.reason } };
    }
    return s;
  });
  const [ask, setAsk] = useState<ReasonAsk | null>(null);

  // The latest state and context live in refs so scans arriving back to back never see a stale screen.
  const sRef = useRef(state);
  const ctxRef = useRef(() => makeCtx(backend.reader.db, workspaceId ?? '', role, settings.confirmByRescan));
  ctxRef.current = () => makeCtx(backend.reader.db, workspaceId ?? '', role, settings.confirmByRescan);
  const effectRef = useRef<(e: Effect) => Promise<void>>(async () => {});
  const lastScanAt = useRef(0);
  const askRef = useRef(ask);
  askRef.current = ask;

  const dispatch = useCallback((a: StationAction): Step => {
    const step = stationReducer(sRef.current, a, ctxRef.current());
    sRef.current = step.state;
    setState(step.state);
    if (step.effect) void effectRef.current(step.effect);
    return step;
  }, []);

  // A mode asked for in the link (for example from Help) switches the station when it opens.
  useEffect(() => {
    const m = modeFromQuery(route.q);
    if (m && m !== sRef.current.mode) dispatch({ type: 'MODE', mode: m });
  }, [route.q, dispatch]);

  useEffect(() => {
    try {
      localStorage.setItem(MODE_KEY, state.mode);
    } catch {
      /* per-viewer convenience only */
    }
  }, [state.mode]);

  // Warn before leaving with unsaved scans.
  const unsaved = unsavedWork(state);
  const { setLeaveGuard } = app;
  useEffect(() => {
    setLeaveGuard(unsaved ? `${unsaved} Leaving the Scan station discards it.` : null);
  }, [unsaved, setLeaveGuard]);
  useEffect(() => () => setLeaveGuard(null), [setLeaveGuard]);

  // Every scan while this screen is open comes here first.
  useScanTarget('station', (e) => {
    if (!actorId || !workspaceId) return false;
    const scanned = readScan(e.text, (t) => backend.reader.resolve(actorId, workspaceId, t));
    const step = dispatch({ type: 'SCAN', raw: e.text, source: e.source, at: e.at, scanned });
    lastScanAt.current = Date.now();
    if (prefs.haptics) buzz(step.verdict === true ? 25 : [40, 60, 40]);
    return step.verdict;
  });

  // Enter anywhere on the page (outside fields and buttons) confirms, like the Confirm barcode.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.defaultPrevented || e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      const t = e.target instanceof Element ? e.target : null;
      if (t?.closest('input, textarea, select, button, a, summary, [contenteditable="true"], .sheet')) return;
      if (askRef.current || document.querySelector('.sheet-backdrop')) return;
      // A scanner's own Enter right after a scan is part of that scan.
      if (Date.now() - lastScanAt.current < 250) return;
      e.preventDefault();
      dispatch({ type: 'CONFIRM' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dispatch]);

  // ---------------------------------------------------------------- saving

  const feedback = useCallback(
    (good: boolean) => {
      router.beep(good ? 'good' : 'bad');
      if (prefs.haptics) buzz(good ? 30 : [40, 60, 40]);
    },
    [router, prefs.haptics],
  );

  /** Send one command with the version seen at scan time. Offline, only moves and location checks are queued. */
  const send = async (spec: CommandSpec, commandId: string): Promise<LineResult> => {
    if (!actorId || !workspaceId) return { status: 'failed', message: 'Choose an account first.' };
    if (backend.network === 'offline') {
      const loc = spec.locationId ? backend.reader.db.locations[spec.locationId] : null;
      const el = eligibility(spec.kind, spec.pallet, !!loc?.active, backend.outbox.entries);
      if (!el.ok) return { status: 'failed', message: el.message };
      try {
        await backend.queueOffline({
          command: app.envelope(spec.kind, spec.payload, spec.pallet, { commandId, expectedVersion: spec.expectedVersion }),
          actor_id: actorId,
          workspace_id: workspaceId,
          pallet_id: spec.pallet.id,
          pallet_code: spec.pallet.code,
          expected_version: spec.expectedVersion,
          kind: spec.kind === 'verify_location' ? 'verify_location' : 'move',
          from_code: spec.pallet.current_location_id ? (backend.reader.db.locations[spec.pallet.current_location_id]?.code ?? null) : null,
          to_code: loc?.code ?? '',
          created_at: new Date().toISOString(),
        });
        return { status: 'queued' };
      } catch (err) {
        return { status: 'failed', message: `Not queued: ${err instanceof Error ? err.message : 'device storage failed'}` };
      }
    }
    const outcome = await app.send(spec.kind, spec.payload, spec.pallet, { commandId, expectedVersion: spec.expectedVersion });
    return outcomeToResult(outcome, commandId);
  };

  const recover = async (commandId: string): Promise<LineResult> => {
    if (!actorId || !workspaceId) return { status: 'failed', message: 'Choose an account first.' };
    return outcomeToResult(await backend.recover(actorId, workspaceId, commandId), commandId);
  };

  const saveMove = async () => {
    const m = sRef.current.move;
    if (m.phase !== 'confirm' || !m.pallet || !m.rack || !m.intent) return;
    const id = uuid();
    dispatch({ type: 'MOVE_SAVING', commandId: id });
    const result = await send(commandFor(m.intent, m.pallet, m.rack), id);
    dispatch({ type: 'MOVE_RESULT', result, pallet: backend.reader.db.pallets[m.pallet.id] });
    feedback(result.status === 'saved' || result.status === 'queued');
  };

  const recoverMove = async () => {
    const m = sRef.current.move;
    if (m.phase !== 'unknown' || !m.commandId) return;
    const id = m.commandId;
    dispatch({ type: 'MOVE_SAVING', commandId: id });
    const result = await recover(id);
    dispatch({ type: 'MOVE_RESULT', result, pallet: m.pallet ? backend.reader.db.pallets[m.pallet.id] : undefined });
    feedback(result.status === 'saved');
  };

  const savePutaway = async () => {
    const p = sRef.current.putaway;
    const rack = p.rack;
    if (!rack || (p.phase !== 'review' && p.phase !== 'done')) return;
    dispatch({ type: 'PUTAWAY_PHASE', phase: 'saving' });
    let bad = 0;
    for (const line of p.lines) {
      if (!line.intent || !isSendable(line.result)) continue;
      dispatch({ type: 'LINE_RESULT', list: 'putaway', key: line.key, result: { status: 'saving' } });
      const result = await send(commandFor(line.intent, line.pallet, rack), uuid());
      if (result.status !== 'saved' && result.status !== 'queued') bad++;
      dispatch({ type: 'LINE_RESULT', list: 'putaway', key: line.key, result });
    }
    dispatch({ type: 'PUTAWAY_PHASE', phase: 'done' });
    feedback(bad === 0);
  };

  const confirmCount = async () => {
    const c = sRef.current.count;
    if (c.phase !== 'review' || !c.report || !c.rack || c.busy) return;
    const rack = c.rack;
    dispatch({ type: 'COUNT_BUSY', busy: true });
    let bad = 0;
    for (const row of c.report.matched) {
      if (!isSendable(row.result)) continue;
      dispatch({ type: 'LINE_RESULT', list: 'matched', key: row.key, result: { status: 'saving' } });
      const result = await send(commandFor('verify_location', row.pallet, rack), uuid());
      if (result.status !== 'saved' && result.status !== 'queued') bad++;
      dispatch({ type: 'LINE_RESULT', list: 'matched', key: row.key, result });
    }
    dispatch({ type: 'COUNT_BUSY', busy: false });
    const n = c.report.matched.filter((r) => isSendable(r.result)).length;
    dispatch(
      bad
        ? { type: 'FLASH', tone: 'warn', text: `${n - bad} of ${n} confirmed. See the list for the rest.` }
        : { type: 'FLASH', tone: 'ok', text: `${n} matched pallet${n === 1 ? '' : 's'} confirmed on ${rack.code}.` },
    );
    feedback(bad === 0);
  };

  /** Fix one count row: move or place it here, record it found, or mark it missing. `rackId` is the rack the reason was written for. */
  const fixRow = async (list: CountList, row: CountRow, reason?: string, rackId?: string) => {
    const c = sRef.current.count;
    if (!row.fix || !c.rack || c.busy) return;
    // The count may have closed or moved to another rack since the row was shown. Never save it against the wrong one.
    const current = c.report?.[list].find((r) => r.key === row.key);
    if ((rackId && c.rack.id !== rackId) || !current || !isSendable(current.result)) {
      dispatch({ type: 'FLASH', tone: 'error', text: `That count changed, so ${row.pallet.code} was not saved. Check the list and try again.` });
      feedback(false);
      return;
    }
    dispatch({ type: 'COUNT_BUSY', busy: true });
    dispatch({ type: 'LINE_RESULT', list, key: row.key, result: { status: 'saving' } });
    const result = await send(commandFor(row.fix, row.pallet, c.rack, reason), uuid());
    dispatch({ type: 'LINE_RESULT', list, key: row.key, result });
    dispatch({ type: 'COUNT_BUSY', busy: false });
    feedback(result.status === 'saved' || result.status === 'queued');
  };

  const recoverLine = async (list: 'putaway' | CountList, key: string, commandId: string) => {
    dispatch({ type: 'LINE_RESULT', list, key, result: { status: 'saving' } });
    const result = await recover(commandId);
    dispatch({ type: 'LINE_RESULT', list, key, result });
  };

  effectRef.current = async (e: Effect) => {
    if (e.kind === 'save-move') await saveMove();
    else if (e.kind === 'recover-move') await recoverMove();
    else if (e.kind === 'save-putaway') await savePutaway();
    else await confirmCount();
  };

  // ---------------------------------------------------------------- full screen (a cart or dock-door screen)

  const rootRef = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);
  const canFull = typeof document !== 'undefined' && !!document.fullscreenEnabled;
  useEffect(() => {
    const on = () => setFull(!!rootRef.current && document.fullscreenElement === rootRef.current);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  const toggleFull = () => {
    if (full) void document.exitFullscreen?.().catch(() => {});
    else void rootRef.current?.requestFullscreen?.().catch(() => toast('Full screen is not available in this window.', 'info'));
  };

  // ---------------------------------------------------------------- render

  // After a click on a mode or a test label, focus goes to the status board instead of staying on that button,
  // so Enter confirms (the page-wide Enter skips buttons) rather than pressing the same button again.
  const statusRef = useRef<HTMLElement>(null);
  const focusStatus = (e: MouseEvent) => {
    if (e.detail > 0) statusRef.current?.focus({ preventScroll: true });
  };

  const s = state;
  const prompt = promptFor(s, settings);
  const canChange = modeAccess(role, 'move').ok;
  const viewer = !canChange;
  const scannerNote = settings.wedge ? 'Listening for scanners' : 'Keyboard scanners are off';

  return (
    <div className={`stack st-root ${full ? 'full' : ''}`} ref={rootRef}>
      <PageHead
        eyebrow={offline ? 'Scanning · offline' : 'Scanning'}
        title="Scan station"
        sub="Hands on the scanner, eyes on the big line. Pick a mode, then scan labels and command barcodes."
        actions={
          <>
            <button className="btn" onClick={() => go('scanners')}>
              <Icon name="scanner" /> Scanners
            </button>
            {canFull && (
              <button className="btn ghost" onClick={toggleFull} aria-pressed={full}>
                <FullScreenGlyph exit={full} /> {full ? 'Exit full screen' : 'Full screen'}
              </button>
            )}
          </>
        }
      />

      {!full && (
        <Explain>
          <p>
            Built for a desk, a cart or a dock door with a barcode scanner. Pick a mode, then keep scanning. The big line always says what to scan next, and every scan and save appears in the session
            log with its result.
          </p>
          <ul>
            <li>
              <strong>Look up</strong>: scan any pallet to see its job, state, holds and where it was last confirmed. Scan a rack to see what is recorded there.
            </li>
            <li>
              <strong>Move</strong>: scan the pallet, then the rack. Confirm by scanning the same rack again, scanning Confirm, pressing Enter or tapping Confirm. Place, move or “still here” is
              decided the same way as on the Move screen.
            </li>
            <li>
              <strong>Put-away</strong>: scan one rack, then every pallet going onto it. Each line shows what will happen. Finish shows the list, and Save all saves each pallet in turn.
            </li>
            <li>
              <strong>Count</strong>: scan a rack, then every pallet physically on it. Finish compares your scans with the records: matched, missing from the scan, unexpected, and unknown codes.
            </li>
            <li>Command barcodes (print them from Scanners) do the same as the buttons: Confirm, Cancel, Finish, and one for each mode.</li>
            <li>Every save carries the version you scanned. If someone else changed a pallet first, you see a conflict and the newer record. Nothing is overwritten.</li>
            <li>Viewers can look up pallets. Operators can move, put away, confirm counts and mark a pallet missing with a reason. Recording a missing one as found needs a supervisor or owner.</li>
            <li>Offline, moves and location checks are saved on this device and are not confirmed until the server accepts them. Placing a new pallet waits for the connection.</li>
          </ul>
        </Explain>
      )}

      {viewer && role && (
        <Notice tone="info" icon="lock" title={`Look up only for ${ROLE_LABEL[role]} accounts`}>
          Move, Put-away and Count change records, so they need Operator access or higher. You can scan any pallet to see where it is. Ask an owner or supervisor if you need more access.
        </Notice>
      )}

      <div className="st-layout">
        <div className="st-main">
          <div className="st-modes-box">
            <div className="st-modes" role="group" aria-label="Station mode" data-tour="station-modes">
              {STATION_MODES.map((m) => {
                const ok = modeAccess(role, m).ok;
                return (
                  <button
                    key={m}
                    type="button"
                    className="st-mode"
                    aria-pressed={s.mode === m}
                    disabled={!ok}
                    onClick={(e) => {
                      dispatch({ type: 'MODE', mode: m });
                      focusStatus(e);
                    }}
                  >
                    <span className="st-mode-top">
                      <Icon name={ok ? MODE_ICON[m] : 'lock'} />
                      <span className="st-mode-name">{MODE_LABEL[m]}</span>
                    </span>
                    <span className="st-mode-hint">{ok ? MODE_HINT[m] : 'Operator and up'}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <section className={`st-status tone-${prompt.tone}`} data-tour="station-status" aria-labelledby="st-prompt" ref={statusRef} tabIndex={-1}>
            <div className="st-status-top">
              <span className="st-mode-tag">
                <Icon name={MODE_ICON[s.mode]} /> {MODE_LABEL[s.mode]} mode
              </span>
              <button type="button" className={`st-listen ${settings.wedge ? 'on' : 'off'}`} onClick={() => go('scanners')} title="Open Scanners">
                <span className="dot" aria-hidden="true" />
                {scannerNote}
              </button>
            </div>
            <div aria-live="polite" aria-atomic="true">
              <h2 className={`st-prompt ${prompt.text.length > 22 ? 'long' : ''}`} id="st-prompt">
                <Codes text={prompt.text} />
              </h2>
              {prompt.sub && (
                <p className="st-prompt-sub">
                  <Codes text={prompt.sub} />
                </p>
              )}
            </div>
            <div aria-live="polite">
              {s.flash && (
                <div key={s.seq} className={`st-flash ${s.flash.tone}`} role={s.flash.tone === 'error' ? 'alert' : undefined}>
                  <Icon name={FLASH_ICON[s.flash.tone]} />
                  <span>
                    <Codes text={s.flash.text} />
                  </span>
                </div>
              )}
            </div>
          </section>

          <div className="st-work-wrap">
            {s.mode === 'lookup' && (
              <LookupView
                target={s.lookup}
                canChange={canChange}
                onMove={(p: Pallet) => dispatch({ type: 'START_MOVE', pallet: p })}
                onRack={(mode, loc: Location) => dispatch({ type: 'START_RACK', mode, rack: loc })}
              />
            )}
            {s.mode === 'move' && (
              <MoveView
                m={s.move}
                confirmByRescan={settings.confirmByRescan}
                offline={offline}
                onConfirm={() => dispatch({ type: 'CONFIRM' })}
                onCancel={() => dispatch({ type: 'CANCEL' })}
                onRecover={() => dispatch({ type: 'CONFIRM' })}
                onNext={() => dispatch({ type: 'RESET_MODE' })}
              />
            )}
            {s.mode === 'putaway' && (
              <PutawayView
                p={s.putaway}
                onFinish={() => dispatch({ type: 'FINISH' })}
                onSave={() => dispatch({ type: 'CONFIRM' })}
                onCancel={() => dispatch({ type: 'CANCEL' })}
                onRemove={(key) => dispatch({ type: 'REMOVE_LINE', key })}
                onReplan={(key) => {
                  const cur = backend.reader.db.pallets[key];
                  if (cur) dispatch({ type: 'REPLAN_LINE', key, pallet: cur });
                }}
                onRecover={(key, id) => void recoverLine('putaway', key, id)}
              />
            )}
            {s.mode === 'count' && (
              <CountView
                c={s.count}
                onFinish={() => dispatch({ type: 'FINISH' })}
                onConfirmAll={() => dispatch({ type: 'CONFIRM' })}
                onCancel={() => dispatch({ type: 'CANCEL' })}
                onFix={(list, row) => void fixRow(list, row)}
                onAskReason={(list, row) => s.count.rack && setAsk({ list, row, rack: s.count.rack })}
                onSkip={(key) => dispatch({ type: 'SKIP', key })}
                onRecover={(list, key, id) => void recoverLine(list, key, id)}
              />
            )}
          </div>
        </div>

        <div className="st-side">
          <TypeCode onEmptyEnter={() => dispatch({ type: 'CONFIRM' })} />
          <TestLabels s={s} onTapped={focusStatus} />
          <SessionLog log={s.log} mode={s.mode} onClear={() => dispatch({ type: 'CLEAR_LOG' })} />
        </div>
      </div>

      {ask && (
        <ReasonSheet
          title={ask.row.fix === 'mark_missing' ? `Mark ${ask.row.pallet.code} missing?` : `Record ${ask.row.pallet.code} as found?`}
          intro={
            ask.row.fix === 'mark_missing'
              ? `It is on record at ${ask.rack.code} but was not scanned. Marking it missing takes it off the rack in the records until someone records where it was found.`
              : `It is marked missing in the records. This records it as found and stored at ${ask.rack.code}.`
          }
          verb={ask.row.fix === 'mark_missing' ? 'Mark missing' : 'Record found here'}
          danger={ask.row.fix === 'mark_missing'}
          initial={ask.row.fix === 'mark_missing' ? `Not on ${ask.rack.code} during a count.` : `Found on ${ask.rack.code} during a count.`}
          onClose={() => setAsk(null)}
          onSave={(reason) => {
            const a = ask;
            setAsk(null);
            void fixRow(a.list, a.row, reason, a.rack.id);
          }}
        />
      )}
    </div>
  );
}

/** Corner brackets: out for full screen, in for leaving it. */
function FullScreenGlyph({ exit }: { exit: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {exit ? <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /> : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}
    </svg>
  );
}
