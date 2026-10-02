// Transfers: send pallets to another warehouse of the same account and receive them there.
// The list, the new-transfer form, one transfer (lines, receiving, slip), and the scan hook that opens a transfer.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../../app/state';
import { parseLabelPayload, parsePalletCode } from '../../domain/codes';
import { ROLE_RANK, roleAllows } from '../../domain/transitions';
import {
  LINE_STATUS_LABEL,
  MAX_TRANSFER_LINES,
  MAX_TRANSFER_NOW_LINES,
  TRANSFER_STATUS_LABEL,
  isOnTheWay,
  isOpenTransfer,
  lineForScan,
  transferBlocker,
} from '../../domain/transfers';
import type { Location, Pallet, Transfer, TransferLine, TransferLineStatus, TransferStatus } from '../../domain/types';
import { modalOpen, useScanRouter, useScanTarget } from '../../device/scanRouter';
import { IS_PREVIEW, canPrint, printNow } from '../../device/output';
import { FirebaseBackend } from '../../data/firebase';
import { CommandFeedback } from '../../ui/CommandFeedback';
import { Icon } from '../../ui/icons';
import { useCommand } from '../../ui/useCommand';
import { Empty, Explain, Field, HoldBadge, Notice, PageHead, PermissionDenied, Spinner, fmtFull, fmtTime } from '../../ui/ui';
import { AdminSheet } from '../admin/AdminSheet';
import { Barcode128 } from '../labels/Barcode128';
import { PrintPortal } from '../labels/LabelSheet';
import { ScanPanel } from '../scan/ScanPanel';
import { ScanFlow, useFlowFlash } from '../scan/ScanFlow';
import { parseScanCommand } from '../../device/scanCommands';
import { ReadError } from '../../demo/engine';
import { useHasTransferTargets, useTransferTargets } from './targets';
import './transfers.css';
import { DEFAULT_BOX_TYPES, ORDER_STATUS_LABEL, ordersOf, sameProduct } from '../../domain/orders';
import { uuid } from '../../domain/codes';
import { useOrdersOn } from '../../app/words';
import { parseQty } from '../../domain/stock';

const STATUS_TONE: Record<TransferStatus, string> = { DRAFT: '', IN_TRANSIT: 'accent', PARTLY_RECEIVED: 'warn', RECEIVED: 'ok', CANCELLED: '' };
const LINE_TONE: Record<TransferLineStatus, string> = { WAITING: '', IN_TRANSIT: 'accent', RECEIVED: 'ok', RETURNED: '' };

function StatusTag({ status }: { status: TransferStatus }) {
  return <span className={`tag ${STATUS_TONE[status]}`}>{TRANSFER_STATUS_LABEL[status]}</span>;
}

const count = (n: number) => `${n} pallet${n === 1 ? '' : 's'}`;

type Tab = 'open' | 'transit' | 'received' | 'all';
const TABS: { id: Tab; title: string; test: (t: Transfer) => boolean }[] = [
  { id: 'open', title: 'Open', test: isOpenTransfer },
  { id: 'transit', title: 'In transit', test: isOnTheWay },
  { id: 'received', title: 'Received', test: (t) => t.status === 'RECEIVED' },
  { id: 'all', title: 'All', test: () => true },
];

/** Opens the warehouse menu at the top of the screen, where Add warehouse is. */
function openWarehouseMenu() {
  const button = document.querySelector<HTMLButtonElement>('.warehouse-name-button');
  if (!button) return;
  window.scrollTo({ top: 0 });
  button.focus();
  button.click();
}

/** Shown when there is no second warehouse to send to: what transfers do, and how to get one. */
function OneWarehouse() {
  const { backend } = useApp();
  return (
    <div className="panel tr-one" data-testid="transfers-one-warehouse">
      <Empty
        icon="swap"
        title="Transfers need a second warehouse"
        actions={
          <button className="btn primary" onClick={openWarehouseMenu}>
            <Icon name="plus" /> Add a warehouse
          </button>
        }
      >
        <p>Move pallets between your sites with a record at both ends. Each pallet keeps its code, label and history on the way.</p>
        <ol className="tr-steps">
          <li>
            <strong>Send.</strong> Scan the pallets, choose the other warehouse, and send. They show as in transit until they arrive.
          </li>
          <li>
            <strong>Or pick it as an order.</strong> A manager can turn a transfer into a pick order, so it is picked, packed and handed off with the day's orders.
          </li>
          <li>
            <strong>Receive.</strong> At the other warehouse, scan each pallet onto a spot.
          </li>
        </ol>
        <p className="muted">
          To add one, open the warehouse menu (the warehouse name at the top) and choose Add warehouse.
          {backend instanceof FirebaseBackend ? ' More than one warehouse depends on your plan.' : ''} You also need access to both warehouses.
        </p>
      </Empty>
    </div>
  );
}

export function Transfers() {
  const { read, role, go, workspaceId, backend } = useApp();
  const hasTargets = useHasTransferTargets();
  const [tab, setTab] = useState<Tab>('open');
  const all = read((e, a, ws) => e.transfers(a, ws)) ?? [];
  const canCreate = hasTargets && roleAllows(role, 'create_transfer');
  const rows = all.filter(TABS.find((t) => t.id === tab)!.test);
  return (
    <div className="stack">
      <PageHead
        eyebrow="Inventory"
        title="Transfers"
        sub="Pallets sent between your warehouses"
        actions={
          canCreate && (
            <button className="btn primary" onClick={() => go({ name: 'transfer', id: 'new' })}>
              <Icon name="plus" /> New transfer
            </button>
          )
        }
      />
      {!hasTargets && all.length === 0 ? (
        <OneWarehouse />
      ) : (
        <>
          <Explain>
            <p>
              Sending a transfer takes its pallets off their spots and marks them in transit. Each pallet keeps its code, label and history. At the other warehouse,
              scan each pallet to receive it onto a spot, or leave it waiting for placement. Both warehouses see the same transfer and every step in each pallet's history.
            </p>
          </Explain>
          <div className="tabs wrap" role="tablist">
            {TABS.map((t) => (
              <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
                {t.title} {backend.mode === 'demo' && <span className="tag">{all.filter(t.test).length}</span>}
              </button>
            ))}
          </div>
          {rows.length === 0 ? (
            <div className="panel">
              <Empty icon="swap" title={tab === 'all' ? 'No transfers yet' : 'Nothing here'}>
                {canCreate ? 'Start one with New transfer.' : 'Transfers sent or received by this warehouse show here.'}
              </Empty>
            </div>
          ) : (
            <div className="results">
              {rows.map((t) => (
                <TransferRow key={t.id} t={t} outgoing={t.from_workspace_id === workspaceId} onOpen={() => go({ name: 'transfer', id: t.id })} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function TransferRow({ t, outgoing, onOpen }: { t: Transfer; outgoing: boolean; onOpen: () => void }) {
  const received = t.lines.filter((l) => l.status === 'RECEIVED').length;
  const live = t.lines.filter((l) => l.status !== 'RETURNED').length;
  return (
    <button className="tr-row" onClick={onOpen}>
      <span className="tr-row-main">
        <strong className="mono">{t.number}</strong>
        <span className="tr-dir">
          <Icon name={outgoing ? 'send' : 'receive'} />
          {outgoing ? `To ${t.to_name}` : `From ${t.from_name}`}
        </span>
      </span>
      <span className="tr-row-meta">
        <StatusTag status={t.status} />
        {t.order && t.status === 'DRAFT' && <span className="tag">Order {t.order.code}</span>}
        <span className="muted">
          {isOnTheWay(t) ? `${received} of ${count(live)} received` : count(t.lines.length)}
        </span>
        <span className="faint">{fmtTime(t.sent_at ?? t.created_at)}</span>
      </span>
      {t.note && <span className="tr-row-note muted">{t.note}</span>}
    </button>
  );
}

/** Route "transfer": the new-transfer form (id "new") or one transfer. */
export function TransferDetail() {
  const { route } = useApp();
  if (route.id === 'new') return <NewTransfer />;
  return <TransferView id={route.id ?? ''} />;
}

// ---------------------------------------------------------------- new transfer

function NewTransfer() {
  const app = useApp();
  const { read, role, go, toast, setLeaveGuard, route } = app;
  const { targets, loading, error } = useTransferTargets();
  const cmd = useCommand();
  // Opened from Running low in another warehouse: send this product there, with enough picked to cover what it needs.
  const ask = useMemo(() => {
    const q = new URLSearchParams(route.q ?? '');
    const product = q.get('product');
    return product ? { to: q.get('to') ?? '', product, need: Math.max(0, Number(q.get('need')) || 0), byQty: q.get('by') === 'quantity' } : null;
  }, [route.q]);
  const [to, setTo] = useState(ask?.to ?? '');
  const [picked, setPicked] = useState<Pallet[]>([]);
  const [note, setNote] = useState(ask ? 'Restock: running low' : '');
  const [filter, setFilter] = useState(ask?.product ?? '');
  const prefilled = useRef(false);
  const [scanMsg, setScanMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(null);
  const dest = targets.find((t) => t.workspace_id === to) ?? targets[0] ?? null;
  const data = read((e, a, ws) => {
    e.context(a, ws);
    return Object.values(e.db.pallets)
      .filter((p) => p.workspace_id === ws && !p.archived_at && (p.state === 'STORED' || p.state === 'RECEIVED'))
      .sort((x, y) => x.code.localeCompare(y.code))
      .map((p) => ({ pallet: p, where: p.current_location_id ? (e.db.locations[p.current_location_id]?.code ?? '') : '' }));
  });

  useEffect(() => {
    setLeaveGuard(picked.length ? 'This transfer has not been sent. Leave and discard it?' : null);
    return () => setLeaveGuard(null);
  }, [picked.length, setLeaveGuard]);

  // Pick the oldest pallets of the product first, until they cover what the other warehouse needs.
  useEffect(() => {
    if (!ask || prefilled.current || !data) return;
    prefilled.current = true;
    const match = data
      .map((r) => r.pallet)
      .filter((p) => sameProduct(p.receiving?.product_code, ask.product) && !p.hold && !transferBlocker(p))
      .sort((a, b) => a.received_at.localeCompare(b.received_at));
    const out: Pallet[] = [];
    let have = 0;
    for (const p of match) {
      if (out.length >= MAX_TRANSFER_LINES || (ask.need > 0 && have >= ask.need)) break;
      out.push(p);
      have += ask.byQty ? (parseQty(p.receiving?.quantity) ?? 0) : 1;
    }
    if (out.length) setPicked(out);
  }, [ask, data]);

  if (!roleAllows(role, 'create_transfer')) return <PermissionDenied what="Sending a transfer" need="Operator" />;
  if (!loading && !error && targets.length === 0)
    return (
      <div className="stack">
        <PageHead title="New transfer" />
        <OneWarehouse />
      </div>
    );

  const pickedIds = new Set(picked.map((p) => p.id));
  const add = (p: Pallet) => {
    if (pickedIds.has(p.id)) return setScanMsg({ tone: 'info', text: `${p.code} is already on this transfer.` });
    const blocked = transferBlocker(p);
    if (blocked) return setScanMsg({ tone: 'error', text: blocked });
    if (picked.length >= MAX_TRANSFER_LINES) return setScanMsg({ tone: 'error', text: `A transfer holds up to ${MAX_TRANSFER_LINES} pallets. Send this one and start another.` });
    setPicked((old) => [...old, p]);
    setScanMsg({ tone: 'ok', text: `${p.code} added.` });
  };
  const remove = (id: string) => setPicked((old) => old.filter((p) => p.id !== id));

  const q = filter.trim().toLowerCase();
  const shown = (data ?? []).filter((r) => !q || r.pallet.code.toLowerCase().includes(q) || r.pallet.description.toLowerCase().includes(q) || r.where.toLowerCase().includes(q) || (r.pallet.receiving?.product_code ?? '').toLowerCase().includes(q));
  const whereOf = (id: string) => data?.find((r) => r.pallet.id === id)?.where ?? '';

  const submit = async (mode: 'send' | 'draft' | 'now') => {
    if (!dest || !picked.length) return;
    const body: Record<string, unknown> = { to_workspace_id: dest.workspace_id, lines: picked.map((p) => ({ pallet_id: p.id, expected_version: p.version })) };
    if (note.trim()) body.note = note.trim();
    const r = mode === 'now' ? await cmd.run('transfer_now', body) : await cmd.run('create_transfer', { ...body, send: mode === 'send' });
    if (r.phase !== 'done') return;
    toast(mode === 'draft' ? 'Draft saved. Send it when the pallets leave.' : mode === 'now' ? `${count(picked.length)} moved to ${dest.name}. They wait for placement there.` : `Sent ${count(picked.length)} to ${dest.name}.`);
    setLeaveGuard(null);
    const id = r.accepted?.target_id;
    go(id ? { name: 'transfer', id } : 'transfers');
  };

  return (
    <div className="stack">
      <PageHead eyebrow="Transfers" title="New transfer" sub="Choose where the pallets go, then add them by scanning or from the list." />
      {ask && (
        <Notice tone="info" icon="swap" title={`Restocking ${dest?.name ?? 'another warehouse'}`}>
          {picked.length
            ? `${count(picked.length)} of product ${ask.product} picked, oldest first. Change the list if you need to, then send.`
            : `No pallets of product ${ask.product} are free to send from here.`}
        </Notice>
      )}
      {loading && (
        <p className="muted row nowrap">
          <Spinner /> Loading your warehouses…
        </p>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      <div className="panel stack">
        <Field label="Send to" htmlFor="tr-dest">
          <select id="tr-dest" className="select" value={dest?.workspace_id ?? ''} onChange={(e) => setTo(e.target.value)} disabled={cmd.busy || cmd.locked}>
            {targets.map((t) => (
              <option key={t.workspace_id} value={t.workspace_id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="stack" style={{ gap: 8 }}>
          <div className="eyebrow">Scan pallets to add them</div>
          <ScanPanel
            prompt="Point at the pallet label"
            placeholder="P-000042"
            demoTargets={(data ?? [])
              .filter((r) => !pickedIds.has(r.pallet.id) && !transferBlocker(r.pallet))
              .slice(0, 4)
              .map((r) => ({ label: r.pallet.code, sub: r.where || 'Waiting for placement', text: r.pallet.code }))}
            onResolved={(r) => (r.type === 'pallet' ? add(r.pallet) : setScanMsg({ tone: 'error', text: `${r.location.code} is a location. Scan a pallet label.` }))}
            onError={(text) => setScanMsg({ tone: 'error', text })}
          />
          {scanMsg && <Notice tone={scanMsg.tone === 'ok' ? 'ok' : scanMsg.tone === 'error' ? 'error' : 'info'}>{scanMsg.text}</Notice>}
        </div>
      </div>

      <div className="panel stack">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 className="panel-title" style={{ margin: 0 }}>
            On this transfer
          </h2>
          <span className="tag accent">{count(picked.length)}</span>
        </div>
        {picked.length === 0 ? (
          <p className="muted">No pallets yet. Scan a label above or tick pallets in the list below.</p>
        ) : (
          <ul className="tr-picked">
            {picked.map((p) => (
              <li key={p.id}>
                <span className="pcode">{p.code}</span>
                <span className="tr-desc">{p.description}</span>
                <span className="muted">{whereOf(p.id) || 'Waiting for placement'}</span>
                <button className="icon-btn" aria-label={`Remove ${p.code}`} onClick={() => remove(p.id)} disabled={cmd.busy || cmd.locked}>
                  <Icon name="x" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <Field label="Note (optional)" htmlFor="tr-note" count={note.length} max={500} hint="For example the truck, the driver or why the pallets are moving.">
          <textarea id="tr-note" className="textarea" style={{ minHeight: 60 }} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} disabled={cmd.busy || cmd.locked} />
        </Field>
        <CommandFeedback state={cmd.state} onRecover={() => void cmd.recover()} onDiscard={cmd.reset} />
        {!cmd.locked && (
          <div className="row">
            <button className="btn big primary" disabled={!dest || !picked.length || cmd.busy} onClick={() => void submit('send')}>
              {cmd.busy ? <Spinner /> : <Icon name="send" />} Send {picked.length ? count(picked.length) : ''}
            </button>
            <button className="btn big" disabled={!dest || !picked.length || cmd.busy} onClick={() => void submit('draft')}>
              Save as draft
            </button>
            <button className="btn big" disabled={!dest || !picked.length || picked.length > MAX_TRANSFER_NOW_LINES || cmd.busy} onClick={() => void submit('now')}>
              <Icon name="swap" /> Transfer now
            </button>
          </div>
        )}
        <p className="hint muted" style={{ fontSize: 13 }}>
          Send marks the pallets in transit until {dest?.name ?? 'the other warehouse'} receives them. Transfer now sends and receives in one step (up to {MAX_TRANSFER_NOW_LINES} pallets), and
          the pallets wait for placement there.
        </p>
      </div>

      <div className="panel stack">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 className="panel-title" style={{ margin: 0 }}>
            Pallets in this warehouse
          </h2>
          <input className="input" style={{ maxWidth: 260 }} placeholder="Filter by code, description or spot" aria-label="Filter pallets" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </div>
        {shown.length === 0 ? (
          <p className="muted">{q ? 'No pallets match this filter.' : 'No stored pallets or pallets waiting for placement.'}</p>
        ) : (
          <div className="tr-pick-list">
            {shown.slice(0, 200).map(({ pallet: p, where }) => {
              const on = pickedIds.has(p.id);
              const blocked = transferBlocker(p);
              return (
                <label key={p.id} className={`tr-pick ${blocked ? 'blocked' : ''}`} title={blocked ?? undefined}>
                  <input type="checkbox" checked={on} disabled={(!on && !!blocked) || cmd.busy || cmd.locked} onChange={() => (on ? remove(p.id) : add(p))} />
                  <span className="pcode">{p.code}</span>
                  <span className="tr-desc">{p.description}</span>
                  <span className="muted">{where || 'Waiting for placement'}</span>
                  {p.hold && <HoldBadge title={p.hold.reason} />}
                </label>
              );
            })}
            {shown.length > 200 && <p className="muted">Showing the first 200. Filter or scan to find others.</p>}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- one transfer

function TransferView({ id }: { id: string }) {
  const app = useApp();
  const { read, role, workspaceId, go, toast } = app;
  const t = read((e, a, ws) => e.transferRecord(a, ws, id));
  // The transfer's pick order, readable at the sending warehouse where it lives.
  const linked = read((e, _a, ws) => {
    const ref = e.db.transfers[id]?.order;
    const o = ref ? e.db.orders[ref.id] : undefined;
    return o && o.workspace_id === ws ? o : null;
  });
  const send = useCommand();
  const [printing, setPrinting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [starting, setStarting] = useState(false);
  if (!t)
    return (
      <div className="stack">
        <PageHead eyebrow="Transfers" title="Transfer" />
        <div className="panel">
          <Empty icon="swap" title="Transfer not found">
            This transfer is not sent from or to this warehouse.
          </Empty>
        </div>
      </div>
    );

  const outgoing = t.from_workspace_id === workspaceId;
  // While its pick order is under way, the transfer is sent by handing that order off.
  const picking = t.status === 'DRAFT' && !!t.order && (!linked || (linked.status !== 'CANCELLED' && linked.status !== 'DONE'));
  const canSend = outgoing && t.status === 'DRAFT' && !picking && roleAllows(role, 'send_transfer');
  const canCancel = isOpenTransfer(t) && !picking && !!role && (t.status === 'DRAFT' ? roleAllows(role, 'cancel_transfer') : ROLE_RANK[role] >= ROLE_RANK.SUPERVISOR);
  const receiving = !outgoing && isOnTheWay(t) && roleAllows(role, 'receive_transfer');
  const placeName = (ws: string) => (ws === t.from_workspace_id ? t.from_name : t.to_name);
  const palletHere = (l: TransferLine) => (outgoing ? l.status !== 'RECEIVED' : l.status === 'RECEIVED');

  // A manager can start picking the transfer's order straight away, on their own cart.
  const pickNow = async (orderId: string) => {
    setStarting(true);
    const r = await app.send('start_batch', { order_ids: [orderId] }, null, { commandId: uuid() });
    setStarting(false);
    if (r.status === 'result' && r.result.ok) go({ name: 'orders', q: 'pick' });
    else toast(r.status === 'result' && !r.result.ok ? r.result.message : 'No answer from the server. Check Pick orders before trying again.', 'error');
  };

  const doSend = async () => {
    const r = await send.run('send_transfer', { transfer_id: t.id }, null, { expectedVersion: t.version });
    if (r.phase === 'done') toast(`${t.number} sent to ${t.to_name}.`);
  };

  return (
    <div className="stack">
      <PageHead
        eyebrow="Transfer"
        title={
          <span className="row nowrap" style={{ gap: 10 }}>
            <span className="mono">{t.number}</span> <StatusTag status={t.status} />
          </span>
        }
        sub={`${t.from_name} to ${t.to_name} · ${count(t.lines.length)}`}
        actions={
          <>
            <button className="btn" onClick={() => setPrinting(true)}>
              <Icon name="print" /> Slip
            </button>
            {canCancel && (
              <button className="btn danger" onClick={() => setCancelling(true)}>
                <Icon name="x" /> Cancel transfer
              </button>
            )}
          </>
        }
      />
      {t.status === 'DRAFT' && picking && t.order && (
        <Notice
          tone="info"
          icon="box"
          title={`Picking as order ${t.order.code}`}
          actions={
            linked ? (
              <>
                {linked.status === 'OPEN' && !linked.batch_id && roleAllows(role, 'pick') && !!role && ROLE_RANK[role] >= ROLE_RANK.SUPERVISOR && (
                  <button className="btn primary small" onClick={() => void pickNow(linked.id)} disabled={starting}>
                    {starting ? <Spinner /> : <Icon name="box" />} Pick it now
                  </button>
                )}
                <button className="btn small" onClick={() => go({ name: 'order', id: linked.id })}>
                  Open order
                </button>
              </>
            ) : undefined
          }
        >
          <span data-testid="transfer-order-status">
            {linked && (
              <>
                <span className="tag accent">{ORDER_STATUS_LABEL[linked.status]}</span>{' '}
              </>
            )}
            {outgoing
              ? `When ${t.order.code} is packed and handed off, this transfer is sent and its pallets go in transit to ${t.to_name}. To cancel the transfer, cancel the order first.`
              : `${t.from_name} is picking these pallets as an order. They go in transit when it is handed off.`}
          </span>
        </Notice>
      )}
      {t.status === 'DRAFT' && !picking && (
        <Notice
          tone="info"
          title="Draft, not sent yet"
          actions={
            canSend && !send.locked ? (
              <button className="btn primary small" onClick={() => void doSend()} disabled={send.busy}>
                {send.busy ? <Spinner /> : <Icon name="send" />} Send to {t.to_name}
              </button>
            ) : undefined
          }
        >
          {outgoing ? 'The pallets stay on their spots until the transfer is sent.' : `${t.from_name} has not sent these pallets yet.`}
          {outgoing && t.order && linked?.status === 'CANCELLED' ? ` Its order ${t.order.code} was cancelled.` : ''}
        </Notice>
      )}
      <CommandFeedback state={send.state} onRecover={() => void send.recover()} onDiscard={send.reset} />
      {outgoing && t.status === 'DRAFT' && !picking && !!role && ROLE_RANK[role] >= ROLE_RANK.SUPERVISOR && <PickAsOrder t={t} />}
      {t.status !== 'DRAFT' && t.order && (
        <div className="panel row tr-order-done" data-testid="transfer-order-status">
          <Icon name="box" />
          <span className="grow">
            Picked as order{' '}
            {linked ? (
              <button className="link mono" onClick={() => go({ name: 'order', id: linked.id })}>
                {t.order.code}
              </button>
            ) : (
              <span className="mono">{t.order.code}</span>
            )}
            {linked ? ` · ${ORDER_STATUS_LABEL[linked.status]}` : ` at ${t.from_name}`}
          </span>
        </div>
      )}
      {isOnTheWay(t) && outgoing && (
        <Notice tone="info" icon="truck" title={`On the way to ${t.to_name}`}>
          The pallets are in transit and off their spots. {t.to_name} receives them by scanning each one.
        </Notice>
      )}
      {t.status === 'CANCELLED' && (
        <Notice tone="warn" title="Cancelled">
          {t.cancel_reason ? `Reason: ${t.cancel_reason}. ` : ''}Pallets that were not received went back to {t.from_name}.
        </Notice>
      )}
      {t.note && (
        <div className="panel">
          <div className="eyebrow">Note</div>
          <p style={{ margin: 0 }}>{t.note}</p>
        </div>
      )}
      {receiving && <ReceivePanel t={t} />}
      {!outgoing && isOnTheWay(t) && !receiving && <Notice tone="info">Receiving a transfer needs Operator access.</Notice>}

      <div className="panel stack">
        <h2 className="panel-title" style={{ margin: 0 }}>
          Pallets
        </h2>
        <div className="table-wrap">
          <table className="t">
            <thead>
              <tr>
                <th>Pallet</th>
                <th>Description</th>
                <th>Status</th>
                <th>Left from</th>
                <th>Received on</th>
              </tr>
            </thead>
            <tbody>
              {t.lines.map((l) => (
                <tr key={l.pallet_id} className={palletHere(l) ? 'click' : undefined} onClick={palletHere(l) ? () => go({ name: 'pallet', id: l.pallet_id }) : undefined}>
                  <td>
                    <span className="pcode">{l.code}</span>
                  </td>
                  <td>{l.description}</td>
                  <td>
                    <span className={`tag ${LINE_TONE[l.status]}`}>{LINE_STATUS_LABEL[l.status]}</span>
                  </td>
                  <td>{l.from_location_code ?? (l.status === 'WAITING' ? '' : 'No spot')}</td>
                  <td>
                    {l.status === 'RECEIVED' ? (
                      <>
                        {l.to_location_code ?? 'Waiting for placement'}
                        <div className="faint" style={{ fontSize: 12.5 }}>
                          {l.received_by ? `${l.received_by}, ` : ''}
                          {fmtTime(l.received_at)}
                        </div>
                      </>
                    ) : (
                      ''
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel stack">
        <h2 className="panel-title" style={{ margin: 0 }}>
          History
        </h2>
        <ol className="tr-log">
          {[...t.log].reverse().map((s, i) => (
            <li key={i}>
              <span className="tr-log-text">{s.text}</span>
              <span className="faint">
                {s.actor_name || 'Someone'} at {placeName(s.workspace_id)} · {fmtFull(s.at)}
              </span>
            </li>
          ))}
        </ol>
      </div>

      {printing && <TransferSlip t={t} onClose={() => setPrinting(false)} />}
      {cancelling && (
        <AdminSheet
          title={`Cancel ${t.number}`}
          kind="cancel_transfer"
          intro={
            t.status === 'DRAFT'
              ? 'The draft is closed. Its pallets have not moved.'
              : `Pallets still in transit go back to ${t.from_name}: to the spot they left from when it still has room, otherwise they wait for placement. Pallets already received stay at ${t.to_name}.`
          }
          payload={() => ({ transfer_id: t.id })}
          reason={t.status === 'DRAFT' ? 'optional' : 'required'}
          verb="Cancel transfer"
          done={`${t.number} cancelled`}
          danger
          expectedVersion={t.version}
          onClose={() => setCancelling(false)}
        />
      )}
    </div>
  );
}

/**
 * A manager turns a draft into a pick order for the receiving warehouse: picked by spot with the day's orders, packed,
 * and handed off, which sends the transfer. With Orders and picking off, an owner can turn it on here.
 */
function PickAsOrder({ t }: { t: Transfer }) {
  const { role, send: sendCommand, toast, go, backend, workspaceId } = useApp();
  const ordersOn = useOrdersOn();
  const cmd = useCommand();
  const [turning, setTurning] = useState(false);
  const [error, setError] = useState('');
  const owner = role === 'OWNER';
  const pick = async () => {
    const r = await cmd.run('pick_transfer', { transfer_id: t.id }, null, { expectedVersion: t.version });
    if (r.phase !== 'done') return;
    const orderId = r.accepted?.created_ids?.[0];
    const code = orderId ? backend.db.orders[orderId]?.code : null;
    toast(`${code ?? 'The order'} is ready to pick. Handing it off sends ${t.number}.`);
  };
  const turnOn = async () => {
    setTurning(true);
    setError('');
    const wh = Object.values(backend.db.warehouses).find((w) => w.workspace_id === workspaceId && w.active);
    const cur = ordersOf(wh);
    const o = await sendCommand('set_orders', { on: true, cart_size: cur.cart_size, box_types: cur.box_types.length ? cur.box_types : DEFAULT_BOX_TYPES, subs: cur.subs }, null, { commandId: uuid() });
    setTurning(false);
    if (o.status === 'result' && o.result.ok) toast('Orders and picking is on. Pick orders is in the menu.');
    else setError(o.status === 'result' && !o.result.ok ? o.result.message : o.status === 'offline' ? o.message : 'No answer from the server. Reload to check.');
  };
  return (
    <div className="panel stack tr-pick-order" data-testid="pick-as-order">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 className="panel-title" style={{ margin: 0 }}>
          Pick as an order
        </h2>
        {ordersOn && <span className="tag">For {t.to_name}</span>}
      </div>
      <p className="muted" style={{ margin: 0 }}>
        Creates a pick order for these {count(t.lines.length)}, addressed to {t.to_name}. It is picked by spot with the other orders, packed and handed off. Handing it off sends this
        transfer, so the pallets go in transit.
      </p>
      {ordersOn ? (
        <>
          <CommandFeedback state={cmd.state} onRecover={() => void cmd.recover()} onDiscard={cmd.reset} />
          {!cmd.locked && (
            <div className="row">
              <button className="btn primary" onClick={() => void pick()} disabled={cmd.busy}>
                {cmd.busy ? <Spinner /> : <Icon name="box" />} Pick as an order
              </button>
              <button className="btn" onClick={() => go('orders')}>
                Open Pick orders
              </button>
            </div>
          )}
        </>
      ) : owner ? (
        <>
          <Notice tone="info" title="Orders and picking is off">
            Turn it on to pick transfers and customer orders: by spot into lettered totes, then packed, staged and handed off.
          </Notice>
          <div className="row">
            <button className="btn primary" onClick={() => void turnOn()} disabled={turning || backend.network === 'offline'}>
              {turning ? <Spinner /> : <Icon name="check" />} Turn on Orders and picking
            </button>
          </div>
          {error && <Notice tone="error">{error}</Notice>}
        </>
      ) : (
        <Notice tone="info" title="Orders and picking is off">
          An owner can turn it on in Settings. Then this transfer can be picked as an order.
        </Notice>
      )}
    </div>
  );
}

/**
 * Receiving at the destination, scan first: scan each pallet and it is received at once, onto the chosen spot or
 * waiting for placement. Scanning a spot label changes where the next ones go. The camera stays on throughout.
 */
function ReceivePanel({ t }: { t: Transfer }) {
  const { read, toast, actorId, workspaceId, backend } = useApp();
  const cmd = useCommand();
  const flash = useFlowFlash();
  const [spot, setSpot] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const inFlight = useRef(new Set<string>());
  const locations =
    read((e, a, ws) => {
      e.context(a, ws);
      return Object.values(e.db.locations)
        .filter((l) => l.workspace_id === ws && l.active && l.warehouse_id === t.to_warehouse_id)
        .sort((x, y) => x.code.localeCompare(y.code));
    }) ?? [];
  const fallback = locations.find((l) => l.kind === 'RECEIVING') ?? null;
  const spotId = spot ?? fallback?.id ?? '';
  const chosen: Location | null = locations.find((l) => l.id === spotId) ?? null;
  const waiting = t.lines.filter((l) => l.status === 'IN_TRANSIT');
  const received = t.lines.filter((l) => l.status === 'RECEIVED').length;

  const receive = async (line: TransferLine): Promise<boolean> => {
    if (inFlight.current.has(line.pallet_id)) return false;
    inFlight.current.add(line.pallet_id);
    try {
      const pallet = { id: line.pallet_id, version: line.version } as Pallet;
      const r = await cmd.run('receive_transfer', chosen ? { transfer_id: t.id, location_id: chosen.id } : { transfer_id: t.id }, pallet);
      if (r.phase === 'done') {
        flash.ok(`${line.code} received${chosen ? ` on ${chosen.code}` : ', waiting for placement'}.`);
        return true;
      }
      flash.bad(`${line.code} was not received. See the message below.`);
      return false;
    } finally {
      inFlight.current.delete(line.pallet_id);
    }
  };

  const receiveAll = async () => {
    setAll(true);
    let n = 0;
    for (const line of waiting) {
      if (!(await receive(line))) break;
      n++;
    }
    setAll(false);
    if (n) toast(`Received ${count(n)} from ${t.number}.`);
  };

  /** A pallet of this transfer, by its label or printed code. Null when the scan is something else. */
  const onLine = (text: string): boolean | 'error' | null => {
    const label = parseLabelPayload(text);
    const token = label?.kind === 'P' ? label.token : null;
    const code = label ? null : parsePalletCode(text);
    if (!token && !code) return null;
    const line = lineForScan(t, token, code);
    if (!line) return null;
    if (line.status === 'RECEIVED') {
      flash.note(`${line.code} is already received${line.to_location_code ? ` on ${line.to_location_code}` : ''}.`);
      return true;
    }
    if (line.status !== 'IN_TRANSIT') {
      flash.bad(`${line.code} is not on its way here.`);
      return 'error';
    }
    if (cmd.busy) {
      flash.note(`Saving the last pallet. Scan ${line.code} again in a moment.`);
      return 'error';
    }
    void receive(line);
    return true;
  };

  useScanTarget(`transfer-receive-${t.id}`, (ev) => {
    if (!actorId || !workspaceId || parseScanCommand(ev.text)) return false;
    const hit = onLine(ev.text.trim());
    if (hit !== null) return hit;
    try {
      const r = backend.reader.resolve(actorId, workspaceId, ev.text);
      if (r.type === 'location') {
        if (!locations.some((l) => l.id === r.location.id)) {
          flash.bad(`${r.location.code} is not a spot at ${t.to_name}.`);
          return 'error';
        }
        setSpot(r.location.id);
        flash.ok(`Received pallets now go on ${r.location.code}.`);
        return true;
      }
      flash.bad(`${r.pallet.code} is not on ${t.number}.`);
      return 'error';
    } catch (err) {
      flash.bad(err instanceof ReadError ? err.message : 'Could not read that label.');
      return 'error';
    }
  });

  return (
    <div className="panel stack tr-receive">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 className="panel-title" style={{ margin: 0 }}>
          Receive at {t.to_name}
        </h2>
        <span className="tag accent">{waiting.length} to receive</span>
      </div>
      <ScanFlow
        prompt={received ? `Scan the next pallet from ${t.number}` : `Scan a pallet from ${t.number}`}
        sub={chosen ? `It goes on ${chosen.code}. Scan a spot label to change that.` : 'It waits for placement. Scan a spot label to put it there instead.'}
        flash={flash.flash}
        placeholder="Type the pallet code, e.g. P-000042"
        demoTargets={waiting.slice(0, 4).map((l) => ({ label: l.code, sub: l.description, text: l.code }))}
        testId="transfer-flow"
      >
        <CommandFeedback state={cmd.state} onRecover={() => void cmd.recover()} onDiscard={cmd.reset} />
      </ScanFlow>
      <Field label="Put received pallets on" htmlFor="tr-spot">
        <select id="tr-spot" className="select" value={spotId} onChange={(e) => setSpot(e.target.value)} disabled={cmd.busy}>
          <option value="">No spot yet (waiting for placement)</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.code}
            </option>
          ))}
        </select>
      </Field>
      {waiting.length > 0 && !cmd.locked && (
        <div className="stack" style={{ gap: 6 }}>
          <div className="eyebrow">Or receive without scanning</div>
          <div className="row">
            {waiting.slice(0, 12).map((l) => (
              <button key={l.pallet_id} className="btn small" disabled={cmd.busy} onClick={() => void receive(l)}>
                <Icon name="check" /> Receive {l.code}
              </button>
            ))}
            {waiting.length > 1 && (
              <button className="btn small primary" disabled={cmd.busy} onClick={() => void receiveAll()}>
                {all ? <Spinner /> : <Icon name="checkCircle" />} Receive all {waiting.length}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** The paper that travels with the pallets. Its barcode is the transfer number, so scanning it opens the transfer. */
function TransferSlip({ t, onClose }: { t: Transfer; onClose: () => void }) {
  const body = (
    <div className="tr-slip">
      <div className="tr-slip-head">
        <div>
          <h2>Transfer slip</h2>
          <p>
            <strong>{t.number}</strong> · {TRANSFER_STATUS_LABEL[t.status]}
          </p>
        </div>
        <Barcode128 value={t.number} height={56} showText className="tr-slip-code" />
      </div>
      <table className="tr-slip-meta">
        <tbody>
          <tr>
            <th>From</th>
            <td>{t.from_name}</td>
            <th>To</th>
            <td>{t.to_name}</td>
          </tr>
          <tr>
            <th>Created</th>
            <td>
              {fmtFull(t.created_at)}, {t.created_by_name}
            </td>
            <th>Sent</th>
            <td>{t.sent_at ? fmtFull(t.sent_at) : 'Not sent yet'}</td>
          </tr>
          {t.note && (
            <tr>
              <th>Note</th>
              <td colSpan={3}>{t.note}</td>
            </tr>
          )}
        </tbody>
      </table>
      <table className="t">
        <thead>
          <tr>
            <th>Received</th>
            <th>Pallet</th>
            <th>Description</th>
            <th>Left from</th>
          </tr>
        </thead>
        <tbody>
          {t.lines.map((l) => (
            <tr key={l.pallet_id}>
              <td style={{ width: 70 }}>{l.status === 'RECEIVED' ? 'Yes' : '☐'}</td>
              <td>{l.code}</td>
              <td>{l.description}</td>
              <td>{l.from_location_code ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="tr-slip-foot">
        {count(t.lines.length)}. At {t.to_name}, scan this barcode to open the transfer, then scan each pallet to receive it.
      </p>
    </div>
  );
  return (
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet wide" role="dialog" aria-modal="true" aria-label="Transfer slip">
        <div className="sheet-head">
          <h2>Transfer slip</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        <div className="stack">
          <div className="tr-slip-preview">{body}</div>
          {IS_PREVIEW ? (
            <Notice tone="info" icon="print">
              This hosted preview cannot open a print dialog. Run the app locally to print.
            </Notice>
          ) : (
            <button className="btn primary big" onClick={printNow} disabled={!canPrint()}>
              <Icon name="print" /> Print
            </button>
          )}
        </div>
      </div>
      <PrintPortal>{body}</PrintPortal>
    </div>
  );
}

// ---------------------------------------------------------------- scans anywhere

/**
 * When no screen is waiting for a scan: a transfer slip opens its transfer, and a pallet arriving here on a transfer
 * opens that transfer to receive it. Everything else passes on to Scan anywhere.
 */
export function TransferScan() {
  const { backend, actorId, workspaceId, route, go, toast } = useApp();
  const { settings } = useScanRouter();
  useScanTarget(
    'transfer-scan',
    (e) => {
      if (!actorId || !workspaceId || modalOpen() || route.name === 'move') return false;
      const engine = backend.reader;
      try {
        engine.resolve(actorId, workspaceId, e.text);
        return false; // A pallet or location here: Scan anywhere opens it.
      } catch {
        /* not here; a transfer may explain it */
      }
      let hit: ReturnType<typeof engine.transferForScan> = null;
      try {
        hit = engine.transferForScan(actorId, workspaceId, e.text);
      } catch {
        return false;
      }
      if (!hit) return false;
      const { transfer: t, line } = hit;
      if (!line) {
        toast(`Scanned ${t.number}. Opening the transfer.`, 'info');
      } else if (t.to_workspace_id === workspaceId && line.status === 'IN_TRANSIT' && isOnTheWay(t)) {
        toast(`${line.code} is on its way here on ${t.number}. Opening the transfer to receive it.`, 'info');
      } else return false;
      go({ name: 'transfer', id: t.id });
      return true;
    },
    settings.scanAnywhere && !!actorId,
    -90,
  );
  return null;
}
