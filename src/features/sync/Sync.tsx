// Offline inbox and network lab (Stage C, pages 23-24): queued moves, conflicts, unknown results,
// and switches to simulate a dead zone or a lost response.

import { useState } from 'react';
import type { OutboxEntry } from '../../data/outbox';
import { useApp } from '../../app/state';
import { Icon } from '../../ui/icons';
import { Explain, Notice, PageHead, Spinner, fmtAgo, fmtTime } from '../../ui/ui';

const STATUS: Record<OutboxEntry['status'], { label: string; tag: string }> = {
  queued: { label: 'Waiting to send', tag: 'warn' },
  sending: { label: 'Sending', tag: 'accent' },
  acknowledged: { label: 'Saved on server', tag: 'ok' },
  conflict: { label: 'Needs your decision', tag: 'bad' },
  blocked: { label: 'Refused by server', tag: 'bad' },
};

export function Sync() {
  const { backend, actorId, workspaceId, toast, go, envelope } = useApp();
  const [busy, setBusy] = useState<string | null>(null);
  if (!actorId || !workspaceId) return null;
  const entries = backend.outbox.forUser(actorId, workspaceId).slice().reverse();
  const open = entries.filter((e) => !e.resolved_at && e.status !== 'acknowledged');
  const done = entries.filter((e) => e.resolved_at || e.status === 'acknowledged');
  const unknown = backend.pendingFor(actorId, workspaceId);
  const offline = backend.network === 'offline';
  const f = backend.faults;
  const now = () => new Date().toISOString();

  const syncNow = async () => {
    setBusy('sync');
    const s = await backend.sync(actorId, workspaceId);
    setBusy(null);
    if (!s) return;
    if (s.sent === 0 && s.unanswered === 0) toast('Nothing waiting to send', 'info');
    else toast(`Sent ${s.sent}: ${s.acknowledged} saved${s.conflicts ? `, ${s.conflicts} need a decision` : ''}${s.blocked ? `, ${s.blocked} refused` : ''}${s.unanswered ? ', network dropped, will retry' : ''}`, s.conflicts || s.blocked ? 'error' : 'ok');
  };

  const moveAgain = async (e: OutboxEntry) => {
    const pallet = backend.db.pallets[e.pallet_id];
    const loc = Object.values(backend.db.locations).find((l) => l.workspace_id === workspaceId && l.code === e.to_code);
    if (!pallet || !loc) return;
    setBusy(e.command.command_id);
    const kind = pallet.current_location_id === loc.id ? 'verify_location' : pallet.state === 'RECEIVED' ? 'place' : 'move';
    const out = await backend.send(actorId, envelope(kind, { location_id: loc.id }, pallet));
    setBusy(null);
    if (out.status === 'result' && out.result.ok) {
      await backend.outbox.resolveWith(e.command.command_id, now());
      toast(`${pallet.code}: ${kind === 'verify_location' ? 'confirmed at' : 'moved to'} ${loc.code} against the latest record`);
    } else if (out.status === 'result' && !out.result.ok) toast(out.result.message, 'error');
    else toast('No answer. Open the pallet to check.', 'error');
  };

  return (
    <div className="stack">
      <PageHead
        title="Sync and offline"
        sub={offline ? 'This device is offline. Reads come from the cached copy; only moves and location checks can be queued.' : `Online. Last synced ${fmtAgo(backend.lastSync)}.`}
        actions={
          <button className="btn primary" onClick={() => void syncNow()} disabled={offline || busy === 'sync'}>
            {busy === 'sync' ? <Spinner /> : <Icon name="sync" />} Sync now
          </button>
        }
      />
      <Explain refs="pages 23, 24, 33">
        <p>When the connection drops, the app keeps showing what it last knew, clearly marked as cached. A move made offline is saved on this phone first, and only then shown as “queued”. It is never shown as saved until the server accepts it.</p>
        <p>When the connection returns, queued moves are sent in order with their original request IDs, so a retry can never double-apply. If someone else changed the pallet in the meantime, the server refuses with a conflict and the app asks you to decide. It never overwrites their change silently.</p>
      </Explain>

      <div className="panel stack">
        <div className="panel-title">Network lab</div>
        <div className="seg" role="group" aria-label="Connection">
          <button aria-pressed={!offline} onClick={() => backend.setNetwork('online')}>
            <Icon name="wifi" /> Online
          </button>
          <button aria-pressed={offline} onClick={() => backend.setNetwork('offline')}>
            <Icon name="wifiOff" /> Offline (dead zone)
          </button>
        </div>
        <label className="toggle">
          <input type="checkbox" checked={f.loseNextResponse} onChange={(e) => (backend.setFaults({ loseNextResponse: e.target.checked }), toast(e.target.checked ? 'The next change will be saved, but its answer will be lost' : 'Fault cleared', 'info'))} />
          <span>
            <strong>Lose the next response.</strong> The server saves the change but the answer never arrives. Try “Check result” to see it recover without a duplicate.
          </span>
        </label>
        <label className="toggle">
          <input type="checkbox" checked={f.failNextCommand} onChange={(e) => (backend.setFaults({ failNextCommand: e.target.checked }), toast(e.target.checked ? 'The next change will not reach the server' : 'Fault cleared', 'info'))} />
          <span>
            <strong>Drop the next request.</strong> Nothing reaches the server. “Check result” resends the very same request.
          </span>
        </label>
        <label className="field" style={{ maxWidth: 360 }}>
          <span className="label">Simulated latency: {f.latencyMs} ms</span>
          <input type="range" min={0} max={3000} step={50} value={f.latencyMs} onChange={(e) => backend.setFaults({ latencyMs: Number(e.target.value) })} />
        </label>
      </div>

      {unknown.length > 0 && (
        <div className="panel stack">
          <div className="panel-title">Results not yet known ({unknown.length})</div>
          <p className="muted" style={{ margin: 0 }}>
            These requests were sent but no answer came back. They are saved on this device with their request IDs.
          </p>
          {unknown.map((p) => (
            <div key={p.command.command_id} className="row">
              <span className="tag warn">Unknown</span>
              <span className="grow">
                <strong>{p.command.kind.replace(/_/g, ' ')}</strong> {p.command.pallet_id ? backend.db.pallets[p.command.pallet_id]?.code : ''} · sent {fmtTime(p.sent_at)} · <span className="mono">{p.command.command_id.slice(0, 8)}</span>
              </span>
              <button
                className="btn small primary"
                disabled={offline || !!busy}
                onClick={async () => {
                  setBusy(p.command.command_id);
                  const out = await backend.recover(actorId, workspaceId, p.command.command_id);
                  setBusy(null);
                  if (out.status === 'result') toast(out.result.ok ? `Confirmed: ${out.result.replayed ? 'it had already been saved' : 'saved now'}` : `Not saved: ${out.result.message}`, out.result.ok ? 'ok' : 'error');
                  else toast('Still no answer', 'error');
                }}
              >
                {busy === p.command.command_id ? <Spinner /> : null} Check result
              </button>
              <button className="btn small" onClick={() => void backend.discardPending(p.command.command_id)}>
                Forget
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="panel stack">
        <div className="panel-title">
          Queued on this device ({open.length}) <span className="grow" />
        </div>
        {open.length === 0 && <p className="muted" style={{ margin: 0 }}>Nothing is waiting. {offline ? 'Go to Move and scan a stored pallet and a rack to queue one.' : 'Switch to Offline above, then use Move to try it.'}</p>}
        {open.map((e) => {
          const server = e.server_state;
          const serverLoc = server?.current_location_id ? backend.db.locations[server.current_location_id]?.code : null;
          return (
            <div key={e.command.command_id} className="panel stack" style={{ padding: 12, boxShadow: 'none' }}>
              <div className="row">
                <span className={`tag ${STATUS[e.status].tag}`}>{STATUS[e.status].label}</span>
                <button className="btn ghost small" onClick={() => go({ name: 'pallet', id: e.pallet_id })}>
                  <span className="pcode">{e.pallet_code}</span>
                </button>
                <span className="grow">
                  {e.kind === 'verify_location' ? `Confirm at ${e.to_code}` : `${e.from_code ?? '?'} → ${e.to_code}`}
                  <span className="muted"> · made {fmtTime(e.created_at)} · tried {e.attempts}×</span>
                </span>
              </div>
              {e.status === 'conflict' && (
                <Notice
                  tone="warn"
                  title="Someone changed this pallet first"
                  actions={
                    <>
                      <button className="btn small primary" onClick={() => void moveAgain(e)} disabled={!!busy || offline}>
                        {busy === e.command.command_id ? <Spinner /> : <Icon name="move" />} {serverLoc === e.to_code ? `Confirm at ${e.to_code}` : `Still move it to ${e.to_code}`}
                      </button>
                      <button className="btn small" onClick={() => void backend.outbox.discard(e.command.command_id, now())}>
                        Keep theirs, discard mine
                      </button>
                    </>
                  }
                >
                  The server now has {e.pallet_code} {server ? (server.state === 'STORED' ? `at ${serverLoc}` : `as ${server.state.toLowerCase()}`) : 'in a newer version'}. Your move was based on an older record, so it was not applied. Look at the pallet, then decide.
                </Notice>
              )}
              {e.status === 'blocked' && (
                <Notice
                  tone="error"
                  title={`Refused: ${e.last_error?.message}`}
                  actions={
                    <button className="btn small" onClick={() => void backend.outbox.discard(e.command.command_id, now())}>
                      Dismiss
                    </button>
                  }
                >
                  Nothing was changed. <span className="mono">{e.last_error?.code}</span>
                </Notice>
              )}
              {e.status === 'queued' && (
                <div className="row">
                  {e.last_error && <span className="muted">Last try: {e.last_error.message}</span>}
                  <button className="btn small" onClick={() => void backend.outbox.discard(e.command.command_id, now())}>
                    Discard
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {done.length > 0 && (
        <div className="panel stack">
          <div className="panel-title">
            Finished ({done.length}) <span className="grow" />
            <button className="btn ghost small" onClick={() => void backend.outbox.clearAcknowledged(actorId, workspaceId)}>
              Clear
            </button>
          </div>
          {done.slice(0, 20).map((e) => (
            <div key={e.command.command_id} className="row" style={{ fontSize: 14 }}>
              <span className={`tag ${e.status === 'acknowledged' ? 'ok' : ''}`}>{e.status === 'acknowledged' ? 'Saved' : 'Discarded'}</span>
              <span className="pcode">{e.pallet_code}</span>
              <span className="grow muted">{e.kind === 'verify_location' ? `confirmed at ${e.to_code}` : `to ${e.to_code}`}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
