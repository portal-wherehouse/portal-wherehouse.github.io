// Move tasks: the crew's to-do list of moves a manager queued ("move X to Y", "put these away"). One scan flow with
// the camera on: scan the pallet, scan the spot, and the move saves and ticks the task off in the same step. The next
// prompt shows at once. Managers queue moves and cancel them here too.

import { useMemo, useRef, useState } from 'react';
import { useApp } from '../../app/state';
import { makeLabelPayload, uuid } from '../../domain/codes';
import { ReadError } from '../../domain/readError';
import { roleAllows, ROLE_RANK } from '../../domain/transitions';
import type { Location, MoveTask, Pallet } from '../../domain/types';
import { MAX_QUEUE, sortTasks } from '../../domain/work';
import { useScanTarget, type ScanEvent } from '../../device/scanRouter';
import { Icon } from '../../ui/icons';
import { Empty, Field, Notice, Plate, Sheet, Spinner, fmtAgo } from '../../ui/ui';
import { ScanFlow, useFlowFlash } from '../scan/ScanFlow';
import type { DemoTarget } from '../scan/ScanPanel';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** The camera keeps seeing the spot just saved for a moment; that is the same scan, not a new one. */
const SAME_SPOT_MS = 2500;

export function MoveTasks() {
  const app = useApp();
  const { backend, actorId, workspaceId, role, read, v, send } = app;
  const flash = useFlowFlash();
  const [picked, setPicked] = useState<MoveTask | null>(null);
  const pickedRef = useRef<MoveTask | null>(null);
  const busy = useRef(false);
  const [saving, setSaving] = useState(false);
  const lastSpot = useRef<{ id: string; at: number } | null>(null);
  const [queueOpen, setQueueOpen] = useState(false);
  const [cancel, setCancel] = useState<MoveTask | null>(null);
  const manager = role === 'OWNER' || role === 'SUPERVISOR';
  const pick = (t: MoveTask | null) => {
    pickedRef.current = t;
    setPicked(t);
  };

  const tasks = useMemo(() => read((e, a, ws) => e.moveTasks(a, ws)) ?? [], [v, read]); // eslint-disable-line react-hooks/exhaustive-deps
  const open = useMemo(() => sortTasks(tasks.filter((t) => t.status === 'OPEN'), actorId), [tasks, actorId]);
  const done = useMemo(() => tasks.filter((t) => t.status === 'DONE').sort((a, b) => (b.done_at ?? '').localeCompare(a.done_at ?? '')).slice(0, 8), [tasks]);
  const mine = open.filter((t) => !t.assigned_to || t.assigned_to === actorId);
  const next = mine[0] ?? null;
  const e = backend.reader;
  const pallet = (t: MoveTask): Pallet | undefined => e.db.pallets[t.pallet_id];
  const label = (kind: 'P' | 'L', id: string) => makeLabelPayload(kind, e.activeLabel(id)?.token ?? '');

  /** Why a task cannot be done by a move now, or null. */
  const blocker = (t: MoveTask): string | null => {
    const p = pallet(t);
    if (!p) return null; // not loaded yet; the server decides
    if (p.state === 'STORED' || p.state === 'RECEIVED') return null;
    return `${p.code} is ${p.state === 'DISPATCHED' ? 'shipped' : p.state.toLowerCase().replace('_', ' ')}. A manager can cancel this task.`;
  };

  const save = async (t: MoveTask, p: Pallet, spot: Location) => {
    busy.current = true;
    setSaving(true);
    const kind = p.state === 'RECEIVED' ? 'place' : 'move';
    const o = await send(kind, { location_id: spot.id }, p, { commandId: uuid() });
    busy.current = false;
    setSaving(false);
    if (o.status === 'result' && o.result.ok) {
      lastSpot.current = { id: spot.id, at: Date.now() };
      pick(null);
      const left = mine.filter((x) => x.id !== t.id).length;
      flash.ok(`${p.code} is on ${spot.code}. ${left ? `${plural(left, 'move')} left.` : 'All moves done.'}`);
      return;
    }
    flash.bad(o.status === 'result' && !o.result.ok ? o.result.message : o.status === 'offline' ? o.message : o.status === 'queued' ? 'Saved on this device. It counts once the server accepts it.' : 'No answer from the server. Check the pallet before scanning again.');
  };

  const onScan = (ev: ScanEvent): boolean | 'error' => {
    if (!actorId || !workspaceId) return false;
    if (busy.current) {
      flash.note('Saving. One moment.');
      return 'error';
    }
    let r: ReturnType<typeof e.resolve>;
    try {
      r = e.resolve(actorId, workspaceId, ev.text);
    } catch (err) {
      flash.bad(err instanceof ReadError ? err.message : 'Could not read that label.');
      return 'error';
    }
    const cur = pickedRef.current;
    if (r.type === 'pallet') {
      const t = open.find((x) => x.pallet_id === r.pallet.id);
      if (cur && cur.pallet_id === r.pallet.id) return true;
      if (!t) {
        flash.bad(`${r.pallet.code} is not on the move list. Scan a pallet from the list.`);
        return 'error';
      }
      const why = blocker(t);
      if (why) {
        flash.bad(why);
        return 'error';
      }
      pick(t);
      flash.ok(`${r.pallet.code} scanned. ${t.to_location_code ? `Take it to ${t.to_location_code}.` : 'Put it on any rack or floor spot.'}`);
      return true;
    }
    const spot = r.location;
    if (!cur) {
      if (lastSpot.current && lastSpot.current.id === spot.id && Date.now() - lastSpot.current.at < SAME_SPOT_MS) return true;
      flash.bad(`That is a spot (${spot.code}). Scan the pallet first${next ? `: ${next.code}` : ''}.`);
      return 'error';
    }
    if (cur.to_location_id && cur.to_location_id !== spot.id) {
      flash.bad(`That is ${spot.code}. Take ${cur.code} to ${cur.to_location_code}.`);
      return 'error';
    }
    if (!cur.to_location_id && spot.kind !== 'RACK' && spot.kind !== 'FLOOR') {
      flash.bad(`${spot.code} is a ${spot.kind.toLowerCase()} spot. Put it away on a rack or floor spot.`);
      return 'error';
    }
    const p = pallet(cur);
    if (!p) {
      flash.bad(`${cur.code} is not loaded on this device. Reconnect and scan it again.`);
      return 'error';
    }
    flash.ok(`${spot.code} scanned. Saving…`);
    void save(cur, p, spot);
    return true;
  };
  useScanTarget('move-tasks', onScan, !!actorId && !queueOpen && !cancel);

  const prompt = picked
    ? { text: picked.to_location_code ? `Scan ${picked.to_location_code}` : 'Scan any rack', sub: `${picked.code} · ${picked.description}`, tone: saving ? ('busy' as const) : ('idle' as const) }
    : next
      ? { text: `Scan ${next.code}`, sub: `${next.description} · then ${next.to_location_code ? `take it to ${next.to_location_code}` : 'put it away on any rack'}`, tone: 'idle' as const }
      : { text: 'No moves waiting', sub: open.length ? 'The moves left are assigned to someone else.' : 'New moves appear here when a manager queues them.', tone: 'ok' as const };

  const demoTargets: DemoTarget[] = picked
    ? Object.values(e.db.locations)
        .filter((l) => l.workspace_id === workspaceId && l.active && (picked.to_location_id ? l.id === picked.to_location_id : l.kind === 'RACK'))
        .slice(0, 6)
        .map((l) => ({ label: l.code, text: label('L', l.id) }))
    : mine.slice(0, 6).map((t) => ({ label: t.code, sub: t.to_location_code ? `to ${t.to_location_code}` : 'put away', text: label('P', t.pallet_id) }));

  return (
    <div className="stack" data-testid="move-tasks">
      <ScanFlow
        prompt={prompt.text}
        sub={prompt.sub}
        tone={prompt.tone}
        flash={flash.flash}
        demoTargets={demoTargets}
        placeholder={picked ? 'Type the spot code, e.g. A-03-02' : 'Type the pallet code, e.g. P-000042'}
        testId="tasks-flow"
      >
        {picked && (
          <div className="row">
            <button className="btn" onClick={() => pick(null)} disabled={saving}>
              {saving ? <Spinner /> : null} Choose another pallet
            </button>
          </div>
        )}
      </ScanFlow>

      <section className="panel stack" aria-labelledby="tasks-title">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 className="panel-title" id="tasks-title" style={{ margin: 0 }}>
            <Icon name="checklist" width={16} height={16} /> Moves to do · {open.length}
          </h2>
          {manager && (
            <button className="btn small primary" onClick={() => setQueueOpen(true)} disabled={backend.network === 'offline'}>
              <Icon name="plus" width={16} height={16} /> Queue moves
            </button>
          )}
        </div>
        {open.length === 0 ? (
          <Empty icon="checkCircle" title="Nothing to move">
            {manager ? 'Queue a move, or a list of pallets to put away, and the crew sees it here.' : 'Moves a manager queues for you appear here.'}
          </Empty>
        ) : (
          <ul className="task-list">
            {open.map((t) => {
              const why = blocker(t);
              return (
                <li key={t.id} className={`task-row${picked?.id === t.id ? ' current' : ''}`} data-testid="task-row">
                  <div className="task-main">
                    <div className="task-head">
                      <span className="pcode">{t.code}</span>
                      <span className="task-desc">{t.description}</span>
                    </div>
                    <div className="task-route">
                      {t.from_location_code ? <Plate code={t.from_location_code} size="sm" /> : <span className="tag">Waiting for a spot</span>}
                      <Icon name="chevronRight" width={16} height={16} />
                      {t.to_location_code ? <Plate code={t.to_location_code} size="sm" /> : <span className="tag accent">Any rack</span>}
                    </div>
                    <div className="muted task-meta">
                      {t.assigned_to ? (t.assigned_to === actorId ? 'For you' : `For ${t.assigned_name}`) : 'Anyone'} · queued {fmtAgo(t.created_at)} by {t.created_by_name}
                      {t.note ? ` · ${t.note}` : ''}
                    </div>
                    {why && <div className="task-warn">{why}</div>}
                  </div>
                  {manager && (
                    <button className="btn small ghost" onClick={() => setCancel(t)} aria-label={`Cancel the move of ${t.code}`}>
                      <Icon name="x" width={16} height={16} /> Cancel
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {done.length > 0 && (
          <details className="task-done">
            <summary>Done recently · {done.length}</summary>
            <ul className="task-list">
              {done.map((t) => (
                <li key={t.id} className="task-row done">
                  <div className="task-main">
                    <div className="task-head">
                      <Icon name="checkCircle" width={16} height={16} />
                      <span className="pcode">{t.code}</span>
                      <span className="task-desc">on {t.done_location_code}</span>
                    </div>
                    <div className="muted task-meta">
                      {t.done_by_name} · {fmtAgo(t.done_at)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>
      {queueOpen && <QueueSheet onClose={() => setQueueOpen(false)} />}
      {cancel && <CancelSheet task={cancel} onClose={() => setCancel(null)} />}
    </div>
  );
}

/** A manager queues moves: pallet codes (typed or scanned), where they go, and who does them. */
function QueueSheet({ onClose }: { onClose: () => void }) {
  const { backend, actorId, workspaceId, read, send, toast } = useApp();
  const e = backend.reader;
  const [codes, setCodes] = useState('');
  const [to, setTo] = useState('');
  const [who, setWho] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ctx = read((en, a, ws) => en.context(a, ws));
  const spots = (ctx?.locations ?? []).filter((l) => l.active);
  const people = (ctx?.members ?? []).filter((m) => m.active && ROLE_RANK[m.role] >= ROLE_RANK.OPERATOR).sort((a, b) => a.user.name.localeCompare(b.user.name));
  const waiting = Object.values(e.db.pallets).filter((p) => p.workspace_id === workspaceId && p.state === 'RECEIVED' && !p.archived_at).sort((a, b) => a.code.localeCompare(b.code));
  const list = [...new Set(codes.split(/[\s,;]+/).map((c) => c.trim()).filter(Boolean))];
  const resolved = list.map((c) => {
    try {
      const r = actorId && workspaceId ? e.resolve(actorId, workspaceId, c) : null;
      return r?.type === 'pallet' ? { code: c, pallet: r.pallet, error: '' } : { code: c, pallet: null, error: `${c} is not a pallet.` };
    } catch (err) {
      return { code: c, pallet: null, error: err instanceof ReadError ? err.message : `${c} was not found.` };
    }
  });
  const bad = resolved.filter((r) => !r.pallet);
  const valid = list.length > 0 && list.length <= MAX_QUEUE && !bad.length;
  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    setError('');
    const o = await send('queue_moves', { lines: resolved.map((r) => ({ pallet_id: r.pallet!.id, to_location_id: to || null })), ...(who ? { assigned_to: who } : {}), ...(note.trim() ? { note: note.trim() } : {}) }, null, { commandId: uuid() });
    setBusy(false);
    if (o.status === 'result' && o.result.ok) {
      toast(`${plural(list.length, 'move')} queued`);
      onClose();
    } else setError(o.status === 'result' && !o.result.ok ? o.result.message : o.status === 'offline' ? o.message : 'No answer from the server. Check the list before trying again.');
  };
  return (
    <Sheet title="Queue moves" onClose={onClose}>
      <div className="stack">
        <p className="muted" style={{ margin: 0 }}>
          The crew sees each one on Put away and move, under Moves. Moving the pallet where it should go ticks it off.
        </p>
        <Field label="Pallet codes" htmlFor="q-codes" hint={bad.length ? <span className="field-err">{bad[0].error}</span> : `One per line, or separated by commas. Up to ${MAX_QUEUE}.`}>
          <textarea id="q-codes" className="textarea code" value={codes} onChange={(ev) => setCodes(ev.target.value)} placeholder={'P-000012\nP-000013'} style={{ minHeight: 90 }} />
        </Field>
        {waiting.length > 0 && (
          <button type="button" className="btn small" style={{ alignSelf: 'flex-start' }} onClick={() => setCodes(waiting.slice(0, MAX_QUEUE).map((p) => p.code).join('\n'))}>
            <Icon name="receive" width={16} height={16} /> Add all {Math.min(waiting.length, MAX_QUEUE)} waiting for a spot
          </button>
        )}
        <Field label="Where they go" htmlFor="q-to" hint="Any rack: the crew puts each one away where there is room. Only for pallets waiting for a spot.">
          <select id="q-to" className="select" value={to} onChange={(ev) => setTo(ev.target.value)}>
            <option value="">Any rack (put away)</option>
            {spots.map((l) => (
              <option key={l.id} value={l.id}>
                {l.code}
                {l.kind !== 'RACK' ? ` (${l.kind.toLowerCase()})` : ''}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Who does it" htmlFor="q-who">
          <select id="q-who" className="select" value={who} onChange={(ev) => setWho(ev.target.value)}>
            <option value="">Anyone on the crew</option>
            {people.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.user.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Note (optional)" htmlFor="q-note">
          <input id="q-note" className="input" value={note} maxLength={300} onChange={(ev) => setNote(ev.target.value)} placeholder="Why, or anything the crew should know" />
        </Field>
        {error && <Notice tone="error">{error}</Notice>}
        <div className="row">
          <button className="btn big primary" onClick={() => void submit()} disabled={!valid || busy}>
            {busy ? <Spinner /> : <Icon name="check" />} Queue {list.length ? plural(list.length, 'move') : 'moves'}
          </button>
          <button className="btn big" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </Sheet>
  );
}

function CancelSheet({ task, onClose }: { task: MoveTask; onClose: () => void }) {
  const { send, toast, role } = useApp();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!roleAllows(role, 'cancel_move')) return null;
  const submit = async () => {
    setBusy(true);
    const o = await send('cancel_move', { task_id: task.id, ...(reason.trim() ? { reason: reason.trim() } : {}) }, null, { commandId: uuid() });
    setBusy(false);
    if (o.status === 'result' && o.result.ok) {
      toast(`The move of ${task.code} is cancelled`);
      onClose();
    } else setError(o.status === 'result' && !o.result.ok ? o.result.message : 'Not saved. Try again.');
  };
  return (
    <Sheet title={`Cancel the move of ${task.code}?`} onClose={onClose}>
      <div className="stack">
        <p style={{ margin: 0 }}>It leaves the crew’s list. The pallet stays where it is.</p>
        <Field label="Reason (optional)" htmlFor="mt-reason">
          <input id="mt-reason" className="input" value={reason} maxLength={300} onChange={(ev) => setReason(ev.target.value)} />
        </Field>
        {error && <Notice tone="error">{error}</Notice>}
        <div className="row">
          <button className="btn big danger" onClick={() => void submit()} disabled={busy}>
            {busy ? <Spinner /> : <Icon name="x" />} Cancel the move
          </button>
          <button className="btn big" onClick={onClose}>
            Keep it
          </button>
        </div>
      </div>
    </Sheet>
  );
}
