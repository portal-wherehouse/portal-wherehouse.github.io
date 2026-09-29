// Practice shift: the blueprint's example shift (page 6) as a checklist that ticks itself off
// as you actually do each step in the app. Hidden while the portal walkthrough is running.

import { useEffect, useMemo, useState } from 'react';
import { roleAllows } from '../../domain/transitions';
import type { EventType, PalletEvent } from '../../domain/types';
import { useApp, type Route } from '../../app/state';
import { Icon } from '../../ui/icons';

const START_KEY = 'pl.tour.start';
const FOUND_KEY = 'pl.tour.found';

function readKey(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function writeKey(k: string, v: string | null) {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* the tour still works for this visit */
  }
}

interface Step {
  title: string;
  how: string;
  go: Route;
  done: boolean;
}

export function Tour() {
  const { tourOpen, setTourOpen, backend, actorId, workspaceId, role, route, go, v, guideStep, prefs } = useApp();
  const [start, setStart] = useState<string>(() => readKey(START_KEY) ?? new Date().toISOString());
  const [found, setFound] = useState<boolean>(() => readKey(FOUND_KEY) === '1');
  const [min, setMin] = useState(() => typeof window !== 'undefined' && window.innerWidth < 700);

  useEffect(() => {
    if (tourOpen && !readKey(START_KEY)) writeKey(START_KEY, start);
  }, [tourOpen, start]);

  const state = useMemo(() => {
    if (!actorId || !workspaceId) return null;
    const mine: PalletEvent[] = [];
    for (const list of Object.values(backend.db.events)) for (const e of list) if (e.workspace_id === workspaceId && e.actor_id === actorId && e.accepted_at >= start) mine.push(e);
    mine.sort((a, b) => a.accepted_at.localeCompare(b.accepted_at) || a.revision - b.revision);
    const received = mine.find((e) => e.type === 'receive');
    const pallet = received ? backend.db.pallets[received.pallet_id] : null;
    const ev = received ? mine.filter((e) => e.pallet_id === received.pallet_id) : [];
    const idx = (type: EventType, after = 0) => ev.findIndex((e, i) => i >= after && e.type === type);
    const placed = idx('place');
    const moved = placed >= 0 ? idx('move', placed) : -1;
    const dispatched = moved >= 0 ? idx('dispatch', moved) : -1;
    const returned = dispatched >= 0 ? idx('return', dispatched) : -1;
    const placedAgain = returned >= 0 ? idx('place', returned) : -1;
    return { pallet, placed, moved, dispatched, returned, placedAgain };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actorId, workspaceId, start, v]);

  // "Find it": opening the tour pallet's record after it has moved.
  useEffect(() => {
    if (state?.pallet && state.moved >= 0 && !found && route.name === 'pallet' && route.id === state.pallet.id) {
      setFound(true);
      writeKey(FOUND_KEY, '1');
    }
  }, [route, state, found]);

  if (!tourOpen || !state || guideStep !== null) return null;
  const p = state.pallet;
  const code = p?.code ?? 'your new pallet';
  const steps: Step[] = [
    { title: 'Receive a delivery', how: 'Open Receive, choose job J-214 (School renovation), describe it, and save. You get a brand-new code.', go: { name: 'receive' }, done: !!p },
    { title: `Place ${code} on a rack`, how: 'Tap “Place now”, or open Move: scan the pallet, then a rack. Try the empty rack A-03-02.', go: p ? { name: 'move', id: p.id } : { name: 'move' }, done: state.placed >= 0 },
    { title: 'Move it to another rack', how: 'Open Move again: scan the pallet, then a different rack, and confirm.', go: p ? { name: 'move', id: p.id } : { name: 'move' }, done: state.moved >= 0 },
    { title: 'Find it like a colleague would', how: 'Open Find, search J-214, and open your pallet. Its history shows every step with before and after.', go: { name: 'find', q: 'J-214' }, done: found && state.moved >= 0 },
    { title: 'Dispatch it to the job site', how: 'On the pallet record, press Dispatch pallet and enter a destination.', go: p ? { name: 'pallet', id: p.id } : { name: 'find' }, done: state.dispatched >= 0 },
    { title: 'Record its return', how: 'Material came back. On the record, choose “Record return”. It is back in the building with no rack.', go: p ? { name: 'pallet', id: p.id } : { name: 'find' }, done: state.returned >= 0 },
    { title: 'Place it again', how: 'Scan it onto any rack. Same code, same identity, full history.', go: p ? { name: 'move', id: p.id } : { name: 'move' }, done: state.placedAgain >= 0 },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const current = steps.findIndex((s) => !s.done);
  const canWork = roleAllows(role, 'receive');

  const restart = () => {
    const now = new Date().toISOString();
    writeKey(START_KEY, now);
    writeKey(FOUND_KEY, null);
    setStart(now);
    setFound(false);
  };

  return (
    <aside className="tour" aria-label="Practice shift">
      <div className="tour-head">
        <Icon name="tour" />
        <h3>Practice shift · {doneCount}/{steps.length}</h3>
        <button onClick={() => setMin((m) => !m)} aria-label={min ? 'Expand practice shift' : 'Minimize practice shift'}>
          <Icon name={min ? 'chevronDown' : 'chevronRight'} style={{ transform: min ? 'rotate(180deg)' : 'rotate(90deg)' }} />
        </button>
        <button onClick={() => setTourOpen(false)} aria-label="Close practice shift">
          <Icon name="x" />
        </button>
      </div>
      {min && doneCount < steps.length && current >= 0 && (
        <div className="tour-body" style={{ flexDirection: 'row', alignItems: 'center', padding: '8px 12px' }}>
          <span className="grow" style={{ fontWeight: 700, fontSize: 14 }}>
            {current + 1}. {steps[current].title}
          </span>
          <button className="btn small" onClick={() => go(steps[current].go)}>
            Go <Icon name="chevronRight" />
          </button>
        </div>
      )}
      {!min && (
        <div className="tour-body">
          <div className="progress">
            <div style={{ width: `${(doneCount / steps.length) * 100}%` }} />
          </div>
          {!canWork && (
            <div className="notice warn" style={{ padding: 10 }}>
              <Icon name="lock" />
              <div className="n-body">You are signed in as a viewer, who can only look. Switch to the Operator account from the account menu to do the practice shift.</div>
            </div>
          )}
          {doneCount === steps.length ? (
            <div className="stack" style={{ gap: 8 }}>
              <strong>Shift complete.</strong>
              <span className="muted" style={{ fontSize: 14 }}>
                {code} was received, placed, moved, dispatched and returned with the same label. Its history shows the whole journey. A move only appears here when someone records it.
              </span>
              <div className="row">
                <button className="btn small primary" onClick={() => p && go({ name: 'pallet', id: p.id })}>
                  Review pallet history
                </button>
                {prefs.advancedTools && <button className="btn small" onClick={() => go('lab')}>
                  Open the lab
                </button>}
                <button className="btn small" onClick={restart}>
                  Start over
                </button>
              </div>
            </div>
          ) : (
            steps.map((s, i) => (
              <div key={s.title} className={`tour-step ${s.done ? 'done' : i === current ? 'current' : ''}`}>
                <span className="ts-mark">{s.done ? <Icon name="check" width={14} height={14} /> : i + 1}</span>
                <div>
                  <div className="ts-title">{s.title}</div>
                  {i === current && (
                    <>
                      <div className="ts-how">{s.how}</div>
                      <button className="btn small" style={{ marginTop: 6 }} onClick={() => go(s.go)}>
                        Take me there <Icon name="chevronRight" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
          {doneCount > 0 && doneCount < steps.length && (
            <button className="btn ghost small" style={{ alignSelf: 'flex-start' }} onClick={restart}>
              <Icon name="refresh" /> Restart the practice shift
            </button>
          )}
        </div>
      )}
    </aside>
  );
}
