// Pick orders: customer orders from "ready to pick" to "handed off". One screen with five tabs: the Orders board
// (managers' view of every order, batch and substitute) and the four floor tasks, Pick, Pack, Stage and Hand off.
// The tasks share one scan flow, so the camera stays on from the first pick to the last handoff.
// One order (lines, units, packages, history), the New order form and the order settings are here too.

import { useMemo, useState } from 'react';
import { useApp, type Route } from '../../app/state';
import { useOrdersOn } from '../../app/words';
import { uuid } from '../../domain/codes';
import {
  batchProgress,
  dueState,
  lineFilled,
  METHOD_LABEL,
  ORDER_STATUS_LABEL,
  orderShortQty,
  orderUnits,
  ordersOf,
  PACKAGE_STATUS_LABEL,
  pendingSubs,
  pickQueue,
  SHORT_REASON_LABEL,
  type Order,
  type OrderStatus,
  type Package,
} from '../../domain/orders';
import { ROLE_RANK, roleAllows } from '../../domain/transitions';
import { useScanTarget } from '../../device/scanRouter';
import { FirebaseBackend } from '../../data/firebase';
import { Icon } from '../../ui/icons';
import { Empty, Field, Notice, PageHead, fmtFull, fmtTime } from '../../ui/ui';
import { ScanFlow, useFlowFlash } from '../scan/ScanFlow';
import { PackagePrintButtons, usePrinter } from './print';
import { ToteChip, useHandoffTask, usePackTask, usePickTask, useStageTask } from './tasks';
import './orders.css';

type Tab = '' | 'pick' | 'pack' | 'stage' | 'handoff';
const TABS: { id: Tab; label: string }[] = [
  { id: '', label: 'Orders' },
  { id: 'pick', label: 'Pick' },
  { id: 'pack', label: 'Pack' },
  { id: 'stage', label: 'Stage' },
  { id: 'handoff', label: 'Hand off' },
];

const STATUS_TONE: Record<OrderStatus, string> = { OPEN: '', PICKING: 'accent', PICKED: 'warn', PACKED: 'accent', STAGED: 'accent', DONE: 'ok', CANCELLED: '' };
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function StatusTag({ status }: { status: OrderStatus }) {
  return <span className={`tag ${STATUS_TONE[status]}`}>{ORDER_STATUS_LABEL[status]}</span>;
}

function DueTag({ order }: { order: Order }) {
  const d = dueState(order);
  if (d === 'none') return null;
  return <span className={`tag ${d === 'late' ? 'bad' : d === 'soon' ? 'warn' : ''}`}>{d === 'late' ? `Late, due ${fmtTime(order.due_at)}` : `Due ${fmtTime(order.due_at)}`}</span>;
}

/** Shown when the warehouse has not turned on orders, or to someone who cannot pick. */
function OrdersOff() {
  const { role, go } = useApp();
  return (
    <div className="stack">
      <PageHead title="Pick orders" />
      <div className="panel">
        <Empty icon="box" title="Orders and picking is off">
          <p>Turn it on to pick customer orders by spot, pack them with a packing slip and label, stage them, and hand them off.</p>
          {role === 'OWNER' ? (
            <button className="btn primary" onClick={() => go('settings')}>
              Open Settings
            </button>
          ) : (
            <p>An owner can turn it on in Settings.</p>
          )}
        </Empty>
      </div>
    </div>
  );
}

export function Orders() {
  const on = useOrdersOn();
  const { role } = useApp();
  if (!on || !role || role === 'VIEWER') return <OrdersOff />;
  return <OrdersScreen />;
}

function OrdersScreen() {
  const { route, go, read, role, workspaceId } = useApp();
  const manager = ROLE_RANK[role ?? 'VIEWER'] >= ROLE_RANK.SUPERVISOR;
  const tab: Tab = (TABS.some((t) => t.id === route.q) ? route.q : manager ? '' : 'pick') as Tab;
  const orders = read((e, a, ws) => e.orders(a, ws)) ?? [];
  const batches = read((e, a, ws) => e.batches(a, ws)) ?? [];
  const packages = read((e, a, ws) => e.packages(a, ws)) ?? [];
  const ctx = read((e, a, ws) => e.context(a, ws));
  const wh = ctx?.warehouse ?? null;
  const settings = ordersOf(wh);
  const { actorId } = useApp();
  const myBatch = batches.find((b) => b.status === 'PICKING' && b.assigned_to === actorId) ?? null;
  const queue = useMemo(() => pickQueue(orders), [orders]);
  const staging = (ctx?.locations ?? []).filter((l) => l.kind === 'STAGING' && l.active && l.warehouse_id === wh?.id);
  const printer = usePrinter(wh);
  const flash = useFlowFlash();

  const pick = usePickTask({ batch: myBatch, orders, queue, cartSize: settings.cart_size }, flash, tab === 'pick');
  const pack = usePackTask({ orders, packages, boxTypes: settings.box_types, print: printer.print, printAvailable: printer.available }, flash);
  const stage = useStageTask({ packages, staging }, flash);
  const handoff = useHandoffTask({ orders, packages }, flash);
  const task = tab === 'pick' ? pick : tab === 'pack' ? pack : tab === 'stage' ? stage : tab === 'handoff' ? handoff : null;
  useScanTarget('orders-task', (ev) => (task ? task.onScan(ev) : false), !!task && !!actorId);

  const count = (s: OrderStatus[]) => orders.filter((o) => s.includes(o.status)).length;
  const tabCount: Record<Tab, number> = { '': 0, pick: queue.length, pack: count(['PICKED']), stage: packages.filter((k) => k.status === 'PACKED').length, handoff: count(['PACKED', 'STAGED']) };
  const switchTo = (t: Tab) => {
    if (t === tab) return;
    flash.clear();
    go(t ? { name: 'orders', q: t } : { name: 'orders' });
  };

  return (
    <div className="stack orders-page">
      <PageHead
        title="Pick orders"
        sub={task ? undefined : plural(orders.filter((o) => o.status !== 'DONE' && o.status !== 'CANCELLED').length, 'open order')}
        actions={
          !task &&
          manager && (
            <div className="row">
              <button className="btn" onClick={() => go({ name: 'import', q: 'orders' })}>
                <Icon name="import" /> Import orders
              </button>
              <button className="btn primary" onClick={() => go({ name: 'order', id: 'new' })} data-testid="new-order">
                <Icon name="plus" /> New order
              </button>
            </div>
          )
        }
      />
      <nav className="page-tabs orders-tabs" aria-label="Orders">
        {TABS.filter((t) => t.id || manager).map((t) => (
          <button key={t.id || 'board'} type="button" aria-current={tab === t.id ? 'page' : undefined} onClick={() => switchTo(t.id)}>
            {t.label}
            {!!tabCount[t.id] && <span className="page-tab-count">{tabCount[t.id]}</span>}
          </button>
        ))}
      </nav>
      {task ? (
        <ScanFlow
          prompt={task.prompt}
          sub={task.sub}
          tone={task.tone}
          flash={flash.flash}
          head={task.head}
          demoTargets={task.demoTargets}
          placeholder={task.placeholder}
          testId="orders-flow"
        >
          {task.body}
        </ScanFlow>
      ) : (
        <Board orders={orders} packages={packages} workspaceId={workspaceId} />
      )}
      {printer.portal}
    </div>
  );
}

// ------------------------------------------------------------------ the board

type Lane = 'ready' | 'picking' | 'pack' | 'stage' | 'handoff' | 'done';
const LANES: { id: Lane; label: string; statuses: OrderStatus[] }[] = [
  { id: 'ready', label: 'Ready to pick', statuses: ['OPEN'] },
  { id: 'picking', label: 'Picking', statuses: ['PICKING'] },
  { id: 'pack', label: 'To pack', statuses: ['PICKED'] },
  { id: 'stage', label: 'Packed', statuses: ['PACKED'] },
  { id: 'handoff', label: 'Staged', statuses: ['STAGED'] },
  { id: 'done', label: 'Done', statuses: ['DONE', 'CANCELLED'] },
];

function Board({ orders, packages }: { orders: Order[]; packages: Package[]; workspaceId: string | null }) {
  const { go, read, send, toast } = useApp();
  const [lane, setLane] = useState<Lane | 'all'>('all');
  const batches = (read((e, a, ws) => e.batches(a, ws)) ?? []).filter((b) => b.status === 'PICKING');
  const ctx = read((e, a, ws) => e.context(a, ws));
  const pickers = (ctx?.members ?? []).filter((m) => m.active && m.role !== 'VIEWER');
  const [assignee, setAssignee] = useState('');
  const [finishing, setFinishing] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const subs = orders.flatMap((o) => pendingSubs(o).map((u) => ({ o, u, line: o.lines.find((l) => l.units.includes(u))! })));
  const queue = pickQueue(orders);
  const shown = (lane === 'all' ? orders.filter((o) => o.status !== 'DONE' && o.status !== 'CANCELLED') : orders.filter((o) => LANES.find((l) => l.id === lane)!.statuses.includes(o.status))).sort(
    (a, b) => (a.due_at ?? '9999').localeCompare(b.due_at ?? '9999') || a.code.localeCompare(b.code),
  );

  const run = async (kind: Parameters<typeof send>[0], payload: Record<string, unknown>, ok: string) => {
    const o = await send(kind, payload, null, { commandId: uuid() });
    if (o.status === 'result' && o.result.ok) toast(ok);
    else toast(o.status === 'result' && !o.result.ok ? o.result.message : 'No answer from the server. Check before trying again.', 'error');
  };

  if (!orders.length)
    return (
      <div className="panel">
        <Empty icon="box" title="No orders yet">
          Add one with New order, or import a spreadsheet of orders: one row per line, with the order number, customer, product barcode or SKU, and quantity.
        </Empty>
      </div>
    );

  return (
    <div className="stack">
      <div className="lanes" role="group" aria-label="Orders by step">
        {LANES.map((l) => {
          const n = orders.filter((o) => l.statuses.includes(o.status)).length;
          return (
            <button key={l.id} type="button" className={`lane${lane === l.id ? ' on' : ''}`} aria-pressed={lane === l.id} onClick={() => setLane(lane === l.id ? 'all' : l.id)}>
              <strong>{n}</strong>
              <span>{l.label}</span>
            </button>
          );
        })}
      </div>

      {subs.length > 0 && (
        <div className="panel stack" data-testid="subs-waiting">
          <div className="panel-title">Substitutes to review</div>
          {subs.map(({ o, u, line }) => (
            <div key={u.pallet_id} className="sub-row">
              <span>
                <button className="link" onClick={() => go({ name: 'order', id: o.id })}>
                  {o.code}
                </button>{' '}
                <span data-keep-words>{o.customer.name}</span>: <strong>{u.description}</strong> ({u.code}) for {line.description}
              </span>
              <span className="row nowrap">
                <button className="btn small primary" onClick={() => void run('decide_sub', { order_id: o.id, pallet_id: u.pallet_id, approve: true }, `Substitute ${u.code} approved`)}>
                  Approve
                </button>
                <button className="btn small" onClick={() => void run('decide_sub', { order_id: o.id, pallet_id: u.pallet_id, approve: false }, `Substitute ${u.code} refused`)}>
                  Refuse
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      {(batches.length > 0 || queue.length > 0) && (
        <div className="panel stack">
          <div className="panel-title">Picking</div>
          {batches.map((b) => {
            const p = batchProgress(b);
            return (
              <div key={b.id} className="batch-row" data-testid="batch-row">
                <div className="batch-row-head">
                  <span className="mono">{b.code}</span>
                  <span className="grow">
                    {b.assigned_name} · {plural(b.slots.length, 'order')} · started {fmtTime(b.created_at)}
                  </span>
                  <span>
                    {p.units} of {p.unitsTotal} items
                  </span>
                </div>
                <div className="bar" aria-hidden="true">
                  <span style={{ width: `${p.unitsTotal ? Math.round((p.units / p.unitsTotal) * 100) : 0}%` }} />
                </div>
                <div className="row">
                  {b.slots.map((s) => (
                    <span key={s.letter} className="row nowrap" style={{ gap: 4 }}>
                      <ToteChip letter={s.letter} code={s.tote_code} />
                      <span className="mono small">{s.order_code}</span>
                    </span>
                  ))}
                  <span className="grow" />
                  {finishing === b.id ? (
                    <span className="row nowrap">
                      <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why stop now?" style={{ maxWidth: 220 }} />
                      <button className="btn small primary" disabled={!reason.trim()} onClick={() => void run('finish_batch', { batch_id: b.id, reason: reason.trim() }, `${b.code} finished. Open stops recorded as not picked.`).then(() => setFinishing(null))}>
                        Finish
                      </button>
                      <button className="btn small ghost" onClick={() => setFinishing(null)}>
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button className="btn small ghost" onClick={() => (setFinishing(b.id), setReason(''))}>
                      Finish early
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {queue.length > 0 && (
            <div className="row">
              <span className="grow">{plural(queue.length, 'order')} ready to pick.</span>
              <select className="select" style={{ maxWidth: 220 }} value={assignee} onChange={(e) => setAssignee(e.target.value)} aria-label="Picker">
                <option value="">Choose a picker</option>
                {pickers.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.user?.name ?? m.user_id}
                  </option>
                ))}
              </select>
              <button className="btn" disabled={!assignee} onClick={() => void run('start_batch', { assign_to: assignee, order_ids: queue.slice(0, ordersOf(ctx?.warehouse).cart_size).map((o) => o.id) }, 'Batch started. It is on their Pick tab.')}>
                Start a batch for them
              </button>
            </div>
          )}
        </div>
      )}

      <div className="results order-list" data-testid="order-list">
        {shown.length === 0 && <p className="muted">No orders here.</p>}
        {shown.map((o) => {
          const short = orderShortQty(o);
          const k = packages.filter((x) => o.package_ids.includes(x.id) && x.status !== 'CANCELLED');
          return (
            <button key={o.id} type="button" className="result order-row" onClick={() => go({ name: 'order', id: o.id })}>
              <div className="order-row-main">
                <span className="mono">{o.code}</span>
                {o.external_ref && <span className="muted mono">{o.external_ref}</span>}
                <strong className="grow" data-keep-words>
                  {o.customer.name}
                </strong>
                <StatusTag status={o.status} />
              </div>
              <div className="order-row-meta">
                <span>{METHOD_LABEL[o.method]}</span>
                <span>
                  {plural(
                    o.lines.reduce((n, l) => n + l.qty, 0),
                    'item',
                  )}
                </span>
                {o.slot && (o.status === 'PICKING' || o.status === 'PICKED') && <ToteChip letter={o.slot} code={o.tote_code} />}
                {k.length > 0 && <span>{k.map((x) => `${x.code}${x.location_code ? ` on ${x.location_code}` : ''}`).join(', ')}</span>}
                {short > 0 && <span className="tag warn">{short} short</span>}
                {pendingSubs(o).length > 0 && <span className="tag warn">Substitute to review</span>}
                <DueTag order={o} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ one order

export function OrderDetail() {
  const on = useOrdersOn();
  const { route, role } = useApp();
  if (!on || !role || role === 'VIEWER') return <OrdersOff />;
  return route.id === 'new' ? <NewOrder /> : <OneOrder id={route.id ?? ''} />;
}

function OneOrder({ id }: { id: string }) {
  const { read, go, role, send, toast, backend } = useApp();
  const order = read((e, a, ws) => e.orderRecord(a, ws, id));
  const packages = (read((e, a, ws) => e.packages(a, ws)) ?? []).filter((k) => k.order_id === id);
  const ctx = read((e, a, ws) => e.context(a, ws));
  const printer = usePrinter(ctx?.warehouse ?? null);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const manager = roleAllows(role, 'cancel_order');
  const loading = backend instanceof FirebaseBackend && backend.viewLoading;
  if (!order)
    return (
      <div className="stack">
        <PageHead title="Order" />
        <Notice tone={loading ? 'info' : 'warn'}>{loading ? 'Loading the order…' : 'This order was not found in this warehouse.'}</Notice>
      </div>
    );
  const run = async (kind: Parameters<typeof send>[0], payload: Record<string, unknown>, ok: string, expectedVersion?: number) => {
    const o = await send(kind, payload, null, { commandId: uuid(), expectedVersion });
    if (o.status === 'result' && o.result.ok) {
      toast(ok);
      return true;
    }
    toast(o.status === 'result' && !o.result.ok ? o.result.message : 'No answer from the server. Check before trying again.', 'error');
    return false;
  };
  const back: Route = { name: 'orders' };
  const canCancel = manager && ['OPEN', 'PICKED', 'PACKED', 'STAGED'].includes(order.status);
  return (
    <div className="stack order-detail">
      <PageHead
        eyebrow={
          <button className="link" onClick={() => go(back)}>
            Pick orders
          </button>
        }
        title={
          <>
            {order.code} <StatusTag status={order.status} />
          </>
        }
        sub={
          <span data-keep-words>
            {order.customer.name} · {METHOD_LABEL[order.method]}
            {order.external_ref ? ` · ${order.external_ref}` : ''}
          </span>
        }
        actions={
          printer.available && (
            <button className="btn" onClick={() => printer.print({ kind: 'slip', order, packages })}>
              <Icon name="print" /> Packing slip
            </button>
          )
        }
      />
      <div className="panel">
        <dl className="order-facts">
          {order.transfer && (
            <div data-testid="order-transfer">
              <dt>Transfer</dt>
              <dd>
                <button className="link mono" onClick={() => go({ name: 'transfer', id: order.transfer!.id })}>
                  {order.transfer.number}
                </button>{' '}
                to <span data-keep-words>{order.transfer.to_name}</span>
                {order.status === 'DONE' ? ', sent.' : order.status === 'CANCELLED' ? '. The transfer stays a draft.' : '. Handing this order off sends the transfer.'}
              </dd>
            </div>
          )}
          <div>
            <dt>Due</dt>
            <dd>{order.due_at ? new Date(order.due_at).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'No due time'}</dd>
          </div>
          <div>
            <dt>Substitutes</dt>
            <dd>{order.allow_subs ? 'Allowed' : 'Not allowed'}</dd>
          </div>
          {order.customer.address && (
            <div>
              <dt>Address</dt>
              <dd data-keep-words>{order.customer.address}</dd>
            </div>
          )}
          {(order.customer.phone || order.customer.email) && (
            <div>
              <dt>Contact</dt>
              <dd data-keep-words>{[order.customer.phone, order.customer.email].filter(Boolean).join(' · ')}</dd>
            </div>
          )}
          {order.notes && (
            <div>
              <dt>Notes</dt>
              <dd data-keep-words>{order.notes}</dd>
            </div>
          )}
          {order.batch_code && (
            <div>
              <dt>Picking</dt>
              <dd>
                {order.batch_code}, tote {order.slot}
                {order.tote_code ? ` (${order.tote_code})` : ''}
              </dd>
            </div>
          )}
          {order.handoff && (
            <div>
              <dt>Handed off</dt>
              <dd data-keep-words>
                {fmtFull(order.handoff.at)} by {order.handoff.by_name}. {order.handoff.destination}
              </dd>
            </div>
          )}
        </dl>
      </div>

      <div className="panel stack">
        <div className="panel-title">Lines</div>
        <table className="table order-lines">
          <thead>
            <tr>
              <th>Product</th>
              <th className="num">Ordered</th>
              <th className="num">Picked</th>
              <th>Items</th>
            </tr>
          </thead>
          <tbody>
            {order.lines.map((l) => (
              <tr key={l.line_no}>
                <td>
                  <strong data-keep-words>{l.description}</strong>
                  <div className="mono muted small">{l.product_code}</div>
                  {l.short && (
                    <div className="tag warn">
                      {l.short.qty} short: {SHORT_REASON_LABEL[l.short.reason]}
                    </div>
                  )}
                </td>
                <td className="num">{l.qty}</td>
                <td className="num">{lineFilled(l)}</td>
                <td>
                  {l.units.map((u) => (
                    <div key={u.pallet_id} className="unit-line">
                      <button className="link mono" onClick={() => go({ name: 'pallet', id: u.pallet_id })}>
                        {u.code}
                      </button>{' '}
                      <span className="muted">
                        from {u.from_location_code ?? 'no spot'}
                        {u.package_id ? `, in ${packages.find((k) => k.id === u.package_id)?.code ?? 'a package'}` : ''}
                      </span>
                      {u.sub && (
                        <span className={`tag ${u.sub.status === 'pending' ? 'warn' : u.sub.status === 'approved' ? 'ok' : 'bad'}`}>
                          Substitute{u.sub.status === 'pending' ? ', to review' : u.sub.status === 'approved' ? ', approved' : ', refused'}
                        </span>
                      )}
                      {u.sub?.status === 'pending' && manager && (
                        <span className="row nowrap" style={{ display: 'inline-flex', marginLeft: 6 }}>
                          <button className="btn small primary" onClick={() => void run('decide_sub', { order_id: order.id, pallet_id: u.pallet_id, approve: true }, 'Substitute approved')}>
                            Approve
                          </button>
                          <button className="btn small" onClick={() => void run('decide_sub', { order_id: order.id, pallet_id: u.pallet_id, approve: false }, 'Substitute refused')}>
                            Refuse
                          </button>
                        </span>
                      )}
                    </div>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {packages.length > 0 && (
        <div className="panel stack">
          <div className="panel-title">Packages</div>
          {packages.map((k) => (
            <div key={k.id} className="pkg-row">
              <span className="mono">{k.code}</span>
              <span className="grow">
                {plural(k.unit_codes.length, 'item')}, {k.box_type}
                {k.weight_lb ? `, ${k.weight_lb} lb` : ''} · {PACKAGE_STATUS_LABEL[k.status]}
                {k.location_code ? ` on ${k.location_code}` : ''}
              </span>
              {k.status !== 'CANCELLED' && k.status !== 'HANDED_OFF' && <PackagePrintButtons order={order} pkg={k} packages={packages} print={printer.print} available={printer.available} />}
            </div>
          ))}
        </div>
      )}

      <div className="panel stack">
        <div className="panel-title">History</div>
        <ol className="order-log">
          {[...order.log].reverse().map((s, i) => (
            <li key={i}>
              <span className="muted">
                {fmtTime(s.at)}
                {s.actor_name ? ` · ${s.actor_name}` : ''}
              </span>
              <span data-keep-words>{s.text}</span>
            </li>
          ))}
        </ol>
      </div>

      {canCancel && (
        <div className="panel stack">
          {cancelling ? (
            <>
              <Field label="Why cancel this order?" htmlFor="cancel-reason">
                <input id="cancel-reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Customer called to cancel" />
              </Field>
              {orderUnits(order).length > 0 && <p className="hint">Its {plural(orderUnits(order).length, 'picked item')} go back to stock, waiting to be put away.</p>}
              <div className="row">
                <button className="btn danger" disabled={!reason.trim()} onClick={() => void run('cancel_order', { order_id: order.id, reason: reason.trim() }, `${order.code} cancelled`, order.version).then((ok) => ok && setCancelling(false))}>
                  Cancel order
                </button>
                <button className="btn ghost" onClick={() => setCancelling(false)}>
                  Keep it
                </button>
              </div>
            </>
          ) : (
            <button className="btn ghost" onClick={() => setCancelling(true)}>
              Cancel this order
            </button>
          )}
        </div>
      )}
      {printer.portal}
    </div>
  );
}

// ------------------------------------------------------------------ new order

function localInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function NewOrder() {
  const { go, send, backend, workspaceId, role } = useApp();
  const [ref, setRef] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [method, setMethod] = useState<'ship' | 'pickup'>('ship');
  const [due, setDue] = useState(() => localInput(new Date(Date.now() + 4 * 3600_000)));
  const [subs, setSubs] = useState(false);
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<{ code: string; qty: string }[]>([{ code: '', qty: '1' }]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const products = Object.values(backend.db.products).filter((p) => p.workspace_id === workspaceId);
  if (!roleAllows(role, 'create_order'))
    return (
      <div className="stack">
        <PageHead title="New order" />
        <Notice tone="warn">Only a manager can add orders.</Notice>
      </div>
    );
  const valid = name.trim() && lines.some((l) => l.code.trim()) && lines.every((l) => !l.code.trim() || (Number(l.qty) >= 1 && Number(l.qty) <= 999));
  const save = async () => {
    setBusy(true);
    setError('');
    const o = await send(
      'create_order',
      {
        ...(ref.trim() ? { external_ref: ref.trim() } : {}),
        customer: { name: name.trim(), phone: phone.trim(), email: email.trim(), address: address.trim() },
        method,
        due_at: due ? new Date(due).toISOString() : '',
        allow_subs: subs,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        lines: lines.filter((l) => l.code.trim()).map((l) => ({ product_code: l.code.trim(), qty: Math.round(Number(l.qty)) })),
      },
      null,
      { commandId: uuid() },
    );
    setBusy(false);
    if (o.status === 'result' && o.result.ok) go({ name: 'order', id: o.result.target_id! });
    else setError(o.status === 'result' && !o.result.ok ? o.result.message : o.status === 'offline' ? o.message : 'No answer from the server. Check the order list before trying again.');
  };
  return (
    <div className="stack new-order">
      <PageHead
        eyebrow={
          <button className="link" onClick={() => go({ name: 'orders' })}>
            Pick orders
          </button>
        }
        title="New order"
      />
      <div className="panel stack">
        <div className="grid-2">
          <Field label="Customer" htmlFor="no-name">
            <input id="no-name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoComplete="off" />
          </Field>
          <Field label="Order number (optional)" hint="Your store's own number, if it has one." htmlFor="no-ref">
            <input id="no-ref" className="input" value={ref} onChange={(e) => setRef(e.target.value)} maxLength={40} />
          </Field>
        </div>
        <div className="seg" role="group" aria-label="Method">
          <button type="button" aria-pressed={method === 'ship'} onClick={() => setMethod('ship')}>
            Ship
          </button>
          <button type="button" aria-pressed={method === 'pickup'} onClick={() => setMethod('pickup')}>
            Pickup
          </button>
        </div>
        {method === 'ship' && (
          <Field label="Ship to address" htmlFor="no-address">
            <textarea id="no-address" className="textarea" value={address} onChange={(e) => setAddress(e.target.value)} maxLength={300} />
          </Field>
        )}
        <div className="grid-2">
          <Field label="Phone (optional)" htmlFor="no-phone">
            <input id="no-phone" className="input" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={40} />
          </Field>
          <Field label="Email (optional)" htmlFor="no-email">
            <input id="no-email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={120} />
          </Field>
        </div>
        <Field label="Due" htmlFor="no-due">
          <input id="no-due" type="datetime-local" className="input" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
        <label className="toggle">
          <input type="checkbox" checked={subs} onChange={(e) => setSubs(e.target.checked)} />
          <span>Customer accepts substitutes</span>
        </label>
      </div>
      <div className="panel stack">
        <div className="panel-title">Lines</div>
        <datalist id="no-products">
          {products.map((p) => (
            <option key={p.code} value={p.code}>
              {p.description}
            </option>
          ))}
        </datalist>
        {lines.map((l, i) => (
          <div key={i} className="row nowrap order-line-input">
            <input
              className="input grow"
              list="no-products"
              aria-label={`Line ${i + 1} product barcode or SKU`}
              placeholder="Product barcode or SKU"
              value={l.code}
              onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, code: e.target.value } : x)))}
            />
            <input className="input" inputMode="numeric" aria-label={`Line ${i + 1} quantity`} value={l.qty} style={{ maxWidth: 80 }} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, qty: e.target.value.replace(/\D/g, '') } : x)))} />
            {lines.length > 1 && (
              <button type="button" className="icon-btn" aria-label={`Remove line ${i + 1}`} onClick={() => setLines(lines.filter((_, j) => j !== i))}>
                <Icon name="x" />
              </button>
            )}
          </div>
        ))}
        <button type="button" className="btn small" onClick={() => setLines([...lines, { code: '', qty: '1' }])} disabled={lines.length >= 50}>
          <Icon name="plus" /> Add a line
        </button>
        <Field label="Notes (optional)" hint="Printed on the packing slip." htmlFor="no-notes">
          <textarea id="no-notes" className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} />
        </Field>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="row">
        <button className="btn primary big" disabled={!valid || busy} onClick={() => void save()} data-testid="save-order">
          {busy ? 'Saving…' : 'Add order'}
        </button>
        <button className="btn ghost" onClick={() => go({ name: 'orders' })}>
          Cancel
        </button>
      </div>
    </div>
  );
}
