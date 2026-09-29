// Warehouse overview: what needs attention, where things are, and what happened recently.

import { useMemo, useState } from 'react';
import { EVENT_LABEL, STATE_LABEL } from '../../domain/transitions';
import type { PalletState } from '../../domain/types';
import { useApp } from '../../app/state';
import { Icon } from '../../ui/icons';
import { Explain, PageHead, StatTile, fmtTime } from '../../ui/ui';

const STATE_ORDER: PalletState[] = ['STORED', 'RECEIVED', 'MISSING', 'DISPATCHED', 'RETIRED'];
const STATE_VAR: Record<PalletState, string> = { STORED: 'var(--ok)', RECEIVED: 'var(--warn)', MISSING: 'var(--bad)', DISPATCHED: 'var(--slate)', RETIRED: 'var(--ink-3)' };

export function Overview() {
  const { read, go, backend, actorId, workspaceId, v } = useApp();
  const data = useMemo(
    () =>
      read((e, a, ws) => {
        const ctx = e.context(a, ws);
        const pallets = Object.values(e.db.pallets).filter((p) => p.workspace_id === ws && !p.archived_at);
        const counts = Object.fromEntries(STATE_ORDER.map((s) => [s, 0])) as Record<PalletState, number>;
        for (const p of pallets) counts[p.state]++;
        const occ = e.occupancy(ws);
        const activity = e.activity(a, ws, 5000);
        const jobCounts = e.jobCounts(ws);
        return {
          ctx,
          counts,
          total: pallets.length,
          holds: pallets.filter((p) => p.hold && p.state !== 'RETIRED').length,
          reprint: pallets.filter((p) => p.label_needs_reprint && p.state !== 'RETIRED').length,
          staleUnverified: pallets.filter((p) => p.state === 'STORED' && p.last_confirmed_at && Date.now() - new Date(p.last_confirmed_at).getTime() > 3 * 86_400_000).length,
          occ,
          activity,
          jobCounts,
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [v, backend.network],
  );
  if (!data) return null;
  const pending = actorId && workspaceId ? backend.outbox.pending(actorId, workspaceId).length + backend.pendingFor(actorId, workspaceId).length : 0;
  const onHand = data.counts.STORED + data.counts.RECEIVED;
  const users = backend.db.users;

  return (
    <div className="stack">
      <PageHead eyebrow={`${data.ctx.workspace.name} · ${data.ctx.warehouse?.code}`} title="Overview" sub={`${data.ctx.warehouse?.name} · times shown in your timezone; the warehouse runs on ${data.ctx.warehouse?.timezone}.`} />

      <div className="grid-2" data-tour="overview-summary">
        <div className="panel stack">
          <div className="panel-title">Pallets on hand</div>
          <div className="row" style={{ alignItems: 'baseline', gap: 12 }}>
            <span className="hero-number">{onHand}</span>
            <span className="muted">
              {data.counts.STORED} stored on racks, {data.counts.RECEIVED} waiting for placement
            </span>
          </div>
          <StateBar counts={data.counts} total={data.total} />
        </div>
        <div className="panel stack">
          <div className="panel-title">Needs attention</div>
          <div className="stats" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
            <StatTile label="Needs placement" icon="receive" value={data.counts.RECEIVED} onClick={() => go('reconcile')} />
            <StatTile label="Missing" icon="question" value={data.counts.MISSING} onClick={() => go('reconcile')} />
            <StatTile label="On hold" icon="hold" value={data.holds} onClick={() => go('reconcile')} />
            <StatTile label="Labels to reprint" icon="print" value={data.reprint} onClick={() => go('reconcile')} />
            <StatTile label="Not verified in 3+ days" icon="check" value={data.staleUnverified} onClick={() => go('reconcile')} />
            <StatTile label="Unsent on this device" icon="sync" value={pending} onClick={() => go('sync')} />
          </div>
        </div>
      </div>

      <Explain refs="pages 3, 8, 15, 32">
        <p>Everything here is counted from recorded state, not guessed. “On hand” is received plus stored. Occupancy is the number of pallets recorded at a location. It is not a capacity figure, because the app does not know pallet sizes or rack load limits.</p>
      </Explain>

      <div className="grid-2">
        <div className="panel">
          <div className="panel-title">Accepted changes, last 14 days</div>
          <ActivityChart events={data.activity.map((e) => e.accepted_at)} />
        </div>
        <div className="panel stack">
          <div className="panel-title">
            Busiest locations <span className="grow" />
            <button className="btn ghost small" onClick={() => go('map')}>
              Open map <Icon name="chevronRight" />
            </button>
          </div>
          <Occupancy locations={data.ctx.locations} occ={data.occ} onOpen={(id) => go({ name: 'location', id })} />
        </div>
      </div>

      <div className="grid-2">
        <div className="panel">
          <div className="panel-title">
            Recent activity <span className="grow" />
            <button className="btn ghost small" onClick={() => go('activity')}>
              All activity <Icon name="chevronRight" />
            </button>
          </div>
          <div className="stack" style={{ gap: 8 }}>
            {data.activity.slice(0, 8).map((ev) => {
              const p = backend.db.pallets[ev.pallet_id];
              return (
                <button key={ev.id} className="row nowrap ov-act" style={{ background: 'none', border: 0, padding: '4px 0', cursor: 'pointer', textAlign: 'left', color: 'var(--ink)' }} onClick={() => go({ name: 'pallet', id: ev.pallet_id })}>
                  <span className="pcode" style={{ minWidth: 86 }}>
                    {p?.code}
                  </span>
                  <span className="grow">
                    <strong>{EVENT_LABEL[ev.type]}</strong>
                    {ev.after_state.current_location_code && ev.type !== 'receive' ? (
                      <>
                        {' → '}
                        <span className="code-nw">{ev.after_state.current_location_code}</span>
                      </>
                    ) : null}
                    <span className="muted"> · {users[ev.actor_id]?.name}</span>
                  </span>
                  <span className="faint ov-act-time" style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>
                    {fmtTime(ev.accepted_at)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="panel flush">
          <div className="panel-title" style={{ padding: '14px 16px 0' }}>
            Jobs
          </div>
          <div className="table-wrap" style={{ border: 0, borderRadius: 0 }}>
            <table className="t cards-sm">
              <thead>
                <tr>
                  <th>Job</th>
                  <th className="n">On hand</th>
                  <th className="n">Missing</th>
                  <th className="n">Holds</th>
                  <th className="n">Dispatched</th>
                </tr>
              </thead>
              <tbody>
                {data.ctx.jobs.map((j) => {
                  const c = data.jobCounts[j.id] ?? {};
                  return (
                    <tr key={j.id} className="click" onClick={() => go({ name: 'job', id: j.id })}>
                      <td className="lead">
                        <span className="jcode">{j.code}</span> {j.status === 'CLOSED' && <span className="tag">closed</span>}
                        <span className="muted job-name">{j.name}</span>
                      </td>
                      <td className="n" data-label="On hand">
                        {(c.STORED ?? 0) + (c.RECEIVED ?? 0)}
                      </td>
                      <td className="n" data-label="Missing">
                        {c.MISSING ?? 0}
                      </td>
                      <td className="n" data-label="Holds">
                        {c.HOLD ?? 0}
                      </td>
                      <td className="n" data-label="Dispatched">
                        {c.DISPATCHED ?? 0}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function StateBar({ counts, total }: { counts: Record<PalletState, number>; total: number }) {
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="stackbar" role="img" aria-label={STATE_ORDER.map((s) => `${STATE_LABEL[s]} ${counts[s]}`).join(', ')}>
        {STATE_ORDER.filter((s) => counts[s] > 0).map((s) => (
          <div key={s} style={{ flex: counts[s], background: STATE_VAR[s] }} title={`${STATE_LABEL[s]}: ${counts[s]} of ${total}`} />
        ))}
      </div>
      <div className="legend">
        {STATE_ORDER.map((s) => (
          <span key={s}>
            <i style={{ background: STATE_VAR[s] }} />
            {STATE_LABEL[s]} <strong className="num" style={{ color: 'var(--ink)' }}>{counts[s]}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}

function ActivityChart({ events }: { events: string[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const days = 14;
  const buckets = useMemo(() => {
    const out: { label: string; full: string; n: number }[] = [];
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(start.getTime() - i * 86_400_000);
      out.push({ label: d.toLocaleDateString([], { weekday: 'narrow' }), full: d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }), n: 0 });
    }
    for (const iso of events) {
      const d = new Date(iso);
      d.setHours(0, 0, 0, 0);
      const idx = days - 1 - Math.round((start.getTime() - d.getTime()) / 86_400_000);
      if (idx >= 0 && idx < days) out[idx].n++;
    }
    return out;
  }, [events]);
  const max = Math.max(4, ...buckets.map((b) => b.n));
  const step = max <= 10 ? 2 : max <= 25 ? 5 : max <= 50 ? 10 : max <= 100 ? 20 : 50;
  const top = Math.ceil(max / step) * step;
  const W = 560;
  const H = 200;
  const padL = 30;
  const padB = 22;
  const padT = 14;
  const plotW = W - padL - 6;
  const plotH = H - padB - padT;
  const band = plotW / days;
  const barW = Math.min(24, band - 6);
  const y = (n: number) => padT + plotH - (n / top) * plotH;
  const ticks = Array.from({ length: top / step + 1 }, (_, i) => i * step);
  const maxIdx = buckets.reduce((m, b, i) => (b.n > buckets[m].n ? i : m), 0);
  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Accepted changes per day: ${buckets.map((b) => `${b.full} ${b.n}`).join('; ')}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - 6} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={1} />
            <text x={padL - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--ink-3)">
              {t}
            </text>
          </g>
        ))}
        {buckets.map((b, i) => {
          const x = padL + i * band + (band - barW) / 2;
          const h = Math.max(0, y(0) - y(b.n));
          const r = Math.min(4, h);
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={padL + i * band} y={padT} width={band} height={plotH} fill="transparent" />
              {b.n > 0 && (
                <path
                  d={`M${x},${y(0)} V${y(b.n) + r} Q${x},${y(b.n)} ${x + r},${y(b.n)} H${x + barW - r} Q${x + barW},${y(b.n)} ${x + barW},${y(b.n) + r} V${y(0)} Z`}
                  fill="var(--accent)"
                  opacity={hover === null || hover === i ? 1 : 0.55}
                />
              )}
              {i === maxIdx && b.n > 0 && (
                <text x={x + barW / 2} y={y(b.n) - 4} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--ink)">
                  {b.n}
                </text>
              )}
              <text x={x + barW / 2} y={H - 6} textAnchor="middle" fontSize="11" fill={i === days - 1 ? 'var(--ink)' : 'var(--ink-3)'} fontWeight={i === days - 1 ? 700 : 400}>
                {b.label}
              </text>
            </g>
          );
        })}
        <line x1={padL} x2={W - 6} y1={y(0)} y2={y(0)} stroke="var(--ink-3)" strokeWidth={1} />
      </svg>
      {hover !== null && (
        <div className="chart-tip" style={{ left: `${((padL + hover * band + band / 2) / W) * 100}%`, top: `${(y(buckets[hover].n) / H) * 100}%` }}>
          {buckets[hover].full}: {buckets[hover].n} {buckets[hover].n === 1 ? 'change' : 'changes'}
        </div>
      )}
    </div>
  );
}

function Occupancy({ locations, occ, onOpen }: { locations: { id: string; code: string; kind: string; active: boolean }[]; occ: Record<string, number>; onOpen: (id: string) => void }) {
  const rows = locations
    .filter((l) => l.active)
    .map((l) => ({ ...l, n: occ[l.id] ?? 0 }))
    .sort((a, b) => b.n - a.n || a.code.localeCompare(b.code))
    .slice(0, 7);
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <div className="stack" style={{ gap: 6 }}>
      {rows.map((r) => (
        <button key={r.id} onClick={() => onOpen(r.id)} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 90px', gap: 10, alignItems: 'center', background: 'none', border: 0, padding: '3px 0', cursor: 'pointer', color: 'var(--ink)', textAlign: 'left' }}>
          <span className="jcode">{r.code}</span>
          <span style={{ height: 14, background: 'var(--surface-3)', borderRadius: 3, overflow: 'hidden' }}>
            <span style={{ display: 'block', height: '100%', width: `${(r.n / max) * 100}%`, background: 'var(--accent)', borderRadius: '0 4px 4px 0' }} />
          </span>
          <span className="muted num" style={{ fontSize: 13 }}>
            {r.n} recorded
          </span>
        </button>
      ))}
    </div>
  );
}
