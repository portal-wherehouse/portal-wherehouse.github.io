// Put away and move: the scan-first task screen (blueprint page 12). Four modes share one camera that stays on:
// Move (scan the pallet, scan the spot, saved), Stage (the same, onto a staging spot),
// Ship (scan the pallet, record where it went) and Moves to do (the list a manager queued, in MoveTasks.tsx).
// The flow itself lives in MoveFlow.tsx.

import { useMemo, useState } from 'react';
import { roleAllows } from '../../domain/transitions';
import { useApp } from '../../app/state';
import { Icon, type IconName } from '../../ui/icons';
import { Explain, PageHead, PermissionDenied } from '../../ui/ui';
import { ResultRow } from '../find/Find';
import { BulkBar, SelectButton, SelectRow, pinnedRows, useBulk } from '../bulk/Bulk';
import { MoveFlow, type MoveMode } from './MoveFlow';
import { MoveTasks } from './MoveTasks';
import '../scan/scan-flow.css';

type ScreenMode = MoveMode | 'tasks';

const MODES: { id: ScreenMode; label: string; icon: IconName; title: string }[] = [
  { id: 'move', label: 'Move', icon: 'move', title: 'Move pallet' },
  { id: 'tasks', label: 'To do', icon: 'checklist', title: 'Moves to do' },
  { id: 'stage', label: 'Stage', icon: 'stack', title: 'Stage pallet' },
  { id: 'ship', label: 'Ship', icon: 'truck', title: 'Ship pallet' },
];

export function modeFromRoute(q: string | undefined): MoveMode {
  return q === 'stage' || q === 'ship' ? q : 'move';
}

function screenFromRoute(q: string | undefined): ScreenMode {
  return q === 'tasks' ? 'tasks' : modeFromRoute(q);
}

export function Move() {
  const app = useApp();
  const { backend, actorId, workspaceId, role, route, go } = app;
  const mode = screenFromRoute(route.q);
  // A pallet opened from its record (or Needs placement) starts the move already scanned.
  const start = useMemo(() => {
    if (!route.id || !actorId || !workspaceId) return null;
    try {
      return backend.reader.pallet(actorId, workspaceId, route.id).pallet;
    } catch {
      return null; // a stale link
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.id, actorId, workspaceId]);

  if (!roleAllows(role, 'move')) {
    return (
      <div className="stack">
        <PageHead title="Move pallet" />
        <PermissionDenied what="Moving pallets" need="Operator" />
      </div>
    );
  }
  const canShip = roleAllows(role, 'dispatch');
  const modes = MODES.filter((m) => m.id !== 'ship' || canShip);
  const here = MODES.find((m) => m.id === mode)!;
  const offline = backend.network === 'offline';

  return (
    <div className="stack move-screen">
      <PageHead eyebrow={offline ? 'Offline' : undefined} title={here.title} />
      <div className="flow-modes" role="group" aria-label="Task">
        {modes.map((m) => (
          <button key={m.id} type="button" aria-pressed={m.id === mode} onClick={() => m.id !== mode && go(m.id === 'move' ? 'move' : { name: 'move', q: m.id })}>
            <Icon name={m.icon} />
            {m.label}
          </button>
        ))}
      </div>
      {mode === 'ship' && !canShip ? (
        <PermissionDenied what="Shipping pallets" need="Operator" />
      ) : mode === 'tasks' ? (
        <MoveTasks />
      ) : (
        <MoveFlow mode={mode} start={mode === 'ship' ? null : start} />
      )}
      <Explain>
        <p>Every save carries the version you scanned. If someone moved the pallet first, you see the newer record and decide again. Nothing is overwritten.</p>
        <ul>
          <li>Scanning the spot saves the move straight away, so your hands stay on the scanner. Only an unusual move (already recorded there, or on hold) asks you to scan the spot again or tap Save.</li>
          <li>The same label seen by the camera many times in a row counts once.</li>
          <li>To do lists the moves a manager queued. Scan a pallet from the list, then the spot it goes to: the move saves and ticks itself off.</li>
          <li>Offline, moves of stored pallets are queued on this device and are not confirmed until the server accepts them.</li>
        </ul>
      </Explain>
      {mode === 'move' && <NeedsPlacement />}
    </div>
  );
}

/** Received pallets that have no spot yet. Tap one to move it, or select several and place them together. */
function NeedsPlacement() {
  const { backend, workspaceId, v, go } = useApp();
  const bulk = useBulk();
  const [all, setAll] = useState(false);
  const rows = useMemo(
    () =>
      Object.values(backend.db.pallets)
        .filter((p) => p.workspace_id === workspaceId && p.state === 'RECEIVED' && !p.archived_at)
        .sort((a, b) => a.code.localeCompare(b.code))
        .map((p) => ({ pallet: p, job: backend.db.jobs[p.job_id], location: null, lastLocation: null })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [v, workspaceId],
  );
  const shown = all || bulk.selecting ? rows : rows.slice(0, 5);
  const extra = pinnedRows(backend.db, bulk, rows.map((r) => r.pallet.id));
  if (!rows.length && !extra.length) return null;
  return (
    <div className="panel stack" data-testid="needs-placement">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="panel-title" style={{ margin: 0 }}>
          <Icon name="receive" width={16} height={16} /> Needs placement · {rows.length}
        </div>
        <SelectButton bulk={bulk} />
      </div>
      <BulkBar bulk={bulk} visibleIds={rows.map((r) => r.pallet.id)} />
      <div className="results">
        {[...shown, ...extra].map((r) => (
          <SelectRow key={r.pallet.id} bulk={bulk} id={r.pallet.id} code={r.pallet.code}>
            <ResultRow row={r} onOpen={() => go({ name: 'move', id: r.pallet.id })} />
          </SelectRow>
        ))}
      </div>
      {!all && !bulk.selecting && rows.length > shown.length && (
        <button className="btn small" style={{ alignSelf: 'flex-start' }} onClick={() => setAll(true)}>
          Show all {rows.length}
        </button>
      )}
    </div>
  );
}
