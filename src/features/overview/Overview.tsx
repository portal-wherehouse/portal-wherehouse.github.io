import { reminderDate, warehouseDate, palletContents } from '../../domain/receiving';
import type { Pallet } from '../../domain/types';
import { FirebaseBackend } from '../../data/firebase';
import { useMemo, useState, useEffect } from 'react';
import { EVENT_LABEL, STATE_LABEL } from '../../domain/transitions';
import type { PalletState } from '../../domain/types';
import { useApp, type Route, type RouteName } from '../../app/state';
import { roleAllows } from '../../domain/transitions';
import type { CommandKind } from '../../domain/types';
import { Icon, type IconName } from '../../ui/icons';
import { ROLE_LABEL, fmtTime } from '../../ui/ui';
import { useSetup } from '../../app/words';
import { ScanReadyPanel } from '../scan/ScanReady';

const STATE_ORDER: PalletState[] = ['STORED', 'RECEIVED', 'IN_TRANSIT', 'MISSING', 'DISPATCHED', 'RETIRED'];
const STATE_VAR: Record<PalletState, string> = { STORED: 'var(--ok)', RECEIVED: 'var(--warn)', IN_TRANSIT: 'var(--accent)', MISSING: 'var(--bad)', DISPATCHED: 'var(--slate)', RETIRED: 'var(--ink-3)' };
/** The everyday tasks, first on the Dashboard after Ready to scan. */
const ACTIONS: { to: Route; title: string; hint: string; icon: IconName; needs?: CommandKind }[] = [
  {to:{name:'receive'},title:'Receive',hint:'A delivery came in',icon:'receive',needs:'receive'},
  {to:{name:'move'},title:'Move',hint:'Put away, move or stage',icon:'move',needs:'move'},
  {to:{name:'move',q:'ship'},title:'Ship',hint:'Record what left',icon:'truck',needs:'dispatch'},
  {to:{name:'find'},title:'Find',hint:'Where is it?',icon:'find'},
];
/** The empty dashboard's next step, from what the warehouse actually has so far. */
function FirstSteps({manager,spots,needsJob}:{manager:boolean;spots:number;needsJob:boolean}){
  const {go}=useApp();
  if(!manager)return <section className="panel warehouse-empty"><Icon name="locations"/><div><h2>Your warehouse is ready.</h2><p>Your team’s pallets will appear here as deliveries are recorded.</p></div></section>;
  const [text,label,route,icon]:[string,string,RouteName,IconName]=!spots
    ?[needsJob?'Add your spots and a job, then receive your first pallet.':'Add your spots, then receive your first pallet.','Set up locations','locations','locations']
    :needsJob
      ?[`You have ${spots.toLocaleString()} spot${spots===1?'':'s'}. Add a job, then receive your first pallet.`,'Add a job','jobs','jobs']
      :[`You have ${spots.toLocaleString()} spot${spots===1?'':'s'}. Receive your first pallet, then move it into a spot.`,'Receive a pallet','receive','receive'];
  return <section className="panel warehouse-empty" data-testid="first-steps"><Icon name={icon}/><div><h2>Your warehouse is ready.</h2><p>{text}</p></div><button className="btn primary" onClick={()=>go(route)}>{label}</button></section>;
}

export function Overview() {
  const {read,go,backend,v,role} = useApp();
  const setup=useSetup();
  const [crewFull,setCrewFull]=useState(()=>{try{return localStorage.getItem('pl.crewFull')==='1';}catch{return false;}});
  const [minute,setMinute]=useState(0);
  useEffect(()=>{const timer=setInterval(()=>{setMinute(n=>n+1);if(backend instanceof FirebaseBackend && document.visibilityState==='visible')void backend.refreshSummary().catch(()=>{});},60000);return()=>clearInterval(timer);},[backend]);
  const data=useMemo(()=>read((e,a,ws)=>{
    const ctx=e.context(a,ws);
    const pallets=Object.values(e.db.pallets).filter(p=>p.workspace_id===ws&&!p.archived_at);
    const counts=Object.fromEntries(STATE_ORDER.map(s=>[s,0])) as Record<PalletState,number>;
    for(const p of pallets)counts[p.state]++;
    const today=warehouseDate(ctx.warehouse?.timezone||'UTC');
    const reminders=pallets.filter(p=>reminderDate(p) && reminderDate(p)!<=today).sort((a,b)=>a.receiving!.remind_on.localeCompare(b.receiving!.remind_on));
    const r=e.reconciliation(a,ws);
    return {ctx,counts,reminders,reminder_count:reminders.length,holds:pallets.filter(p=>p.hold&&p.state!=='RETIRED').length,activity:e.activity(a,ws,5000),attention:r.unplaced.length+r.missing.length+r.holds.length+r.reprint.length};
  }),[v,backend.network,read,minute]);
  if(!data)return null;
  const live=backend instanceof FirebaseBackend;
  const summary=live?backend.summary:data;
  const counts:Record<PalletState,number>=summary?.counts || data.counts;
  const total=Object.values(counts).reduce((sum,n)=>sum+n,0);
  const name=data.ctx.user?.name || 'there';
  const manager=role==='OWNER'||role==='SUPERVISOR';
  // What is really missing before the first pallet: spots to put it in, and a job when jobs are on.
  const spots=data.ctx.locations.filter(l=>l.active!==false&&(l.kind==='RACK'||l.kind==='FLOOR')).length;
  const needsJob=setup.jobs_on&&!data.ctx.jobs.some(j=>j.status==='OPEN');
  const actions=ACTIONS.filter(a=>!a.needs||roleAllows(role,a.needs));
  if(role==='OPERATOR'&&!crewFull)return <CrewHome name={name} onFull={()=>{setCrewFull(true);try{localStorage.setItem('pl.crewFull','1');}catch{/* this visit only */}}}/>;
  const metrics=[
    {label:'Pallets on hand',value:counts.STORED+counts.RECEIVED,detail:'Stored + waiting to be stored',route:'find'},
    {label:'Waiting to be stored',value:counts.RECEIVED,detail:'Ready for a rack or area',route:'reconcile'},
    {label:'Dispatched',value:counts.DISPATCHED,detail:'Recorded as sent out',route:'find'},
    {label:'On hold',value:summary?.holds || 0,detail:'Review before dispatching',route:'reconcile'},
  ] as const;
  return <div className="stack warehouse-home">
    <header className="warehouse-home-head">
      <div><p className="eyebrow">{data.ctx.workspace.name}</p><h1>Dashboard</h1><p className="warehouse-greeting">Welcome, {name}. <span className="warehouse-identity">{role?ROLE_LABEL[role]:'Team member'}</span></p></div>
      {role==='OPERATOR'&&<button className="btn small" onClick={()=>{setCrewFull(false);try{localStorage.removeItem('pl.crewFull');}catch{/* this visit only */}}}>Back to the simple screen</button>}
    </header>
    <ScanReadyPanel/>
    <section aria-label="Everyday tasks" data-tour="overview-summary"><div className="warehouse-actions">
      {actions.map(a=><button className="warehouse-action" key={a.title} aria-label={a.title} onClick={()=>go(a.to)}><span className="warehouse-action-icon"><Icon name={a.icon}/></span><span><strong>{a.title}</strong><small>{a.hint}</small></span><Icon name="chevronRight"/></button>)}
    </div></section>
    {manager&&data.attention>0&&<button type="button" className="panel attention-card" onClick={()=>go('reconcile')} data-testid="attention-card"><span className="attention-count">{data.attention.toLocaleString()}</span><span><strong>Needs attention</strong><small>Pallets waiting for a spot, missing, on hold, or with a label to reprint.</small></span><Icon name="chevronRight"/></button>}
    {summary&&total===0&&<FirstSteps manager={manager} spots={spots} needsJob={needsJob}/>}
    {summary?.reminder_count>0 && <section className="panel stack" aria-label="Still here reminders"><h2>Still here: {summary.reminder_count} reminder{summary.reminder_count===1?'':'s'}</h2><p className="muted">Due today or earlier. Open a pallet to clear or reschedule its date.</p>{summary.reminders.map((p:Pallet)=><button className="btn" key={p.id} onClick={()=>go({name:'pallet',id:p.id})}>{p.code} · {palletContents(p)} · {p.receiving?.remind_on}{p.receiving?.destination?` · Going to ${p.receiving.destination}`:''}{p.state==='MISSING'?' · Missing':''}</button>)}{summary.reminder_count>50 && <p>Showing the 50 earliest reminders. Clear or reschedule reviewed dates to see the next ones.</p>}</section>}
    <section aria-label="Warehouse analytics" className="warehouse-metrics">
      {metrics.map(m=><button className="warehouse-metric" key={m.label} onClick={()=>go(role==='VIEWER'||(m.route==='reconcile'&&!manager)?'find':m.route)}><span>{m.label}</span><strong>{summary?m.value.toLocaleString():'Unavailable'}</strong><small>{summary?m.detail:'Counts are unavailable. Try Refresh.'}</small></button>)}
    </section>
    <div className="grid-2">
      <section className="panel stack"><div className="warehouse-section-head"><h2>Pallet status</h2><button className="btn ghost small" onClick={()=>go('map')}>Stock</button></div>
        {summary?<StateBar counts={counts} total={total}/>:<p className="muted">Refresh to load warehouse counts.</p>}
      </section>
      <section className="panel stack"><h2>Recent changes</h2><p className="muted warehouse-chart-note">{live?'Latest 50 recorded changes, grouped by day.':'Recorded changes over the last 14 days.'}</p><ActivityChart events={data.activity.map(e=>e.accepted_at)}/></section>
    </div>
    <section className="panel stack"><div className="warehouse-section-head"><h2>Latest activity</h2><button className="btn ghost small" onClick={()=>go('activity')}>View history</button></div>
      {!data.activity.length?<p className="muted">No pallet activity yet. Receiving a pallet starts its history.</p>:<div className="warehouse-activity">{data.activity.slice(0,6).map(ev=><button key={ev.id} onClick={()=>go({name:'pallet',id:ev.pallet_id})}><span className="warehouse-action-icon"><Icon name="activity"/></span><span><strong>{EVENT_LABEL[ev.type]}{backend.db.pallets[ev.pallet_id]?.code?` · ${backend.db.pallets[ev.pallet_id].code}`:''}</strong><small>{ev.after_state.current_location_code || 'Pallet record'} · {backend.db.users[ev.actor_id]?.name || 'Team member'}</small></span><time dateTime={ev.accepted_at}>{fmtTime(ev.accepted_at)}</time></button>)}</div>}
    </section>
  </div>;
}

function StateBar({ counts, total }: { counts: Record<PalletState, number>; total: number }) {
  // In transit only shows while a transfer is on its way.
  const states = STATE_ORDER.filter((s) => s !== 'IN_TRANSIT' || counts[s] > 0);
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="stackbar" role="img" aria-label={states.map((s) => `${STATE_LABEL[s]} ${counts[s]}`).join(', ')}>
        {STATE_ORDER.filter((s) => counts[s] > 0).map((s) => (
          <div key={s} style={{ flex: counts[s], background: STATE_VAR[s] }} title={`${STATE_LABEL[s]}: ${counts[s]} of ${total}`} />
        ))}
      </div>
      <div className="legend">
        {states.map((s) => (
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

/** Crew see three big jobs to do: find something, move something, add something. Everything else is a tap away. */
function CrewHome({ name, onFull }: { name: string; onFull: () => void }) {
  const { go } = useApp();
  const tiles: { route: RouteName; title: string; hint: string; icon: IconName }[] = [
    { route: 'find', title: 'Find', hint: 'Where is it?', icon: 'find' },
    { route: 'move', title: 'Move', hint: 'Scan it, then scan where it goes', icon: 'move' },
    { route: 'receive', title: 'Add', hint: 'A new delivery came in', icon: 'receive' },
  ];
  return (
    <div className="stack crew-home" data-testid="crew-home">
      <h1 style={{ margin: 0 }}>Hi, {name}.</h1>
      <ScanReadyPanel />
      <div className="crew-tiles" data-tour="overview-summary">
        {tiles.map((t) => (
          <button key={t.route} className="crew-tile" onClick={() => go(t.route)} aria-label={t.title}>
            <Icon name={t.icon} width={40} height={40} />
            <strong>{t.title}</strong>
            <small>{t.hint}</small>
          </button>
        ))}
      </div>
      <button className="btn ghost" style={{ alignSelf: 'flex-start' }} onClick={onFull}>
        Show the full dashboard
      </button>
    </div>
  );
}
