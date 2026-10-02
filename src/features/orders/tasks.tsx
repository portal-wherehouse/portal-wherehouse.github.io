// The four floor tasks of picking: Pick, Pack, Stage and Hand off. Each is a hook that says what to scan now and
// what a scan means at this step. The Orders screen shows the active one in a single ScanFlow, so the camera stays
// on while a person moves from one task to the next, and the scan router delivers every scan to that one handler.

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useApp } from '../../app/state';
import { uuid } from '../../domain/codes';
import {
  batchProgress,
  lineFilled,
  nextStops,
  orderUnits,
  ordersOf,
  palletProduct,
  parseToteCode,
  pendingSubs,
  sameProduct,
  SHORT_REASON_LABEL,
  SLOT_COLOR,
  type Order,
  type Package,
  type PickBatch,
  type PickStop,
  type ShortReason,
} from '../../domain/orders';
import { roleAllows } from '../../domain/transitions';
import type { CommandKind, CommandResult, Location, Pallet } from '../../domain/types';
import { ReadError, type Engine } from '../../demo/engine';
import type { ScanEvent } from '../../device/scanRouter';
import { Icon } from '../../ui/icons';
import { Notice, fmtTime } from '../../ui/ui';
import type { DemoTarget } from '../scan/ScanPanel';
import type { useFlowFlash } from '../scan/ScanFlow';
import { PackagePrintButtons, type PrintDoc } from './print';

export interface FlowTask {
  prompt: string;
  sub?: ReactNode;
  tone?: 'idle' | 'ok' | 'warn' | 'busy';
  head?: ReactNode;
  body?: ReactNode;
  demoTargets: DemoTarget[];
  placeholder: string;
  onScan: (ev: ScanEvent) => boolean | 'error';
}

type Flash = ReturnType<typeof useFlowFlash>;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// ------------------------------------------------------------------ shared pieces

/** A tote letter in its cart color, so the eye finds the right tote before reading anything. */
export function ToteChip({ letter, code, size }: { letter: string | null; code?: string | null; size?: 'lg' }) {
  if (!letter) return null;
  const c = SLOT_COLOR[letter] ?? SLOT_COLOR.H;
  return (
    <span className={`tote-chip${size === 'lg' ? ' lg' : ''}`} style={{ background: c.bg, color: c.ink }} title={`Tote ${letter}${code ? `, ${code}` : ''} (${c.name})`}>
      <b>{letter}</b>
      {code && <small>{code}</small>}
    </span>
  );
}

type RunResult = { ok: true; result: Extract<CommandResult, { ok: true }> } | { ok: false; message: string; code?: string };

/** One command per decision, with its own ID, reduced to "saved" or a sentence saying why not. */
function useRunner() {
  const { send } = useApp();
  return useCallback(
    async (kind: CommandKind, payload: Record<string, unknown>, pallet?: Pallet | null, expectedVersion?: number): Promise<RunResult> => {
      const o = await send(kind, payload, pallet ?? null, { commandId: uuid(), expectedVersion });
      if (o.status === 'result') return o.result.ok ? { ok: true, result: o.result } : { ok: false, message: o.result.message, code: o.result.code };
      if (o.status === 'offline') return { ok: false, message: o.message };
      if (o.status === 'unknown') return { ok: false, message: 'No answer from the server. Check this order before scanning again.' };
      return { ok: false, message: 'This needs a connection.' };
    },
    [send],
  );
}

/** State that a scan handler can read at once, even before the screen draws again. */
function useLive<T>(initial: T): [T, (v: T) => void, { current: T }] {
  const [v, setV] = useState(initial);
  const ref = useRef(v);
  const set = useCallback((next: T) => {
    ref.current = next;
    setV(next);
  }, []);
  return [v, set, ref];
}

type Scanned =
  | { kind: 'tote'; code: string; order: Order | null }
  | { kind: 'order'; order: Order; pkg: Package | null }
  | { kind: 'unit'; pallet: Pallet }
  | { kind: 'spot'; location: Location }
  | { kind: 'product'; code: string; units: Pallet[] }
  | { kind: 'unknown'; message: string };

/** What a scan is on the orders screens: a tote, an order or package, an item, a spot, or a product barcode. */
function classify(e: Engine, actor: string, ws: string, text: string): Scanned {
  const raw = text.trim();
  const tote = parseToteCode(raw);
  const spotNamed = Object.values(e.db.locations).some((l) => l.workspace_id === ws && l.code.toUpperCase() === raw.toUpperCase());
  if (tote && !spotNamed) return { kind: 'tote', code: tote, order: e.orderForScan(actor, ws, tote)?.order ?? null };
  const hit = e.orderForScan(actor, ws, raw);
  if (hit) return { kind: 'order', order: hit.order, pkg: hit.package };
  try {
    const r = e.resolve(actor, ws, raw);
    return r.type === 'pallet' ? { kind: 'unit', pallet: r.pallet } : { kind: 'spot', location: r.location };
  } catch (err) {
    const units = Object.values(e.db.pallets).filter((p) => p.workspace_id === ws && sameProduct(palletProduct(p), raw));
    if (units.length) return { kind: 'product', code: raw, units };
    return { kind: 'unknown', message: err instanceof ReadError ? err.message : 'That code was not recognized.' };
  }
}

function readTotesSkipped(): string[] {
  try {
    return JSON.parse(localStorage.getItem('wh.letterTotes') || '[]');
  } catch {
    return [];
  }
}

// ------------------------------------------------------------------ Pick

export interface PickData {
  batch: PickBatch | null;
  orders: Order[];
  queue: Order[];
  cartSize: number;
}

/** Pick: start a batch, label the totes, then walk the stops in spot order: scan the item, then its tote. */
export function usePickTask(data: PickData, flash: Flash, active: boolean): FlowTask {
  const { backend, actorId, workspaceId, role } = useApp();
  const run = useRunner();
  const { batch, orders, queue, cartSize } = data;
  const [pending, setPending, pendingRef] = useLive<{ stopKey: string; pallet: Pallet; kind: 'pick' | 'substitute' } | null>(null);
  const [wrong, setWrong] = useState<Pallet | null>(null);
  const [shortOpen, setShortOpen] = useState(false);
  const [letters, setLetters] = useState<string[]>(readTotesSkipped);
  const [finished, setFinished] = useState<PickBatch | null>(null);
  const busy = useRef(false);
  const finishing = useRef('');
  const order = (id: string) => orders.find((o) => o.id === id) ?? backend.db.orders[id];
  const settings = ordersOf(Object.values(backend.db.warehouses).find((w) => w.workspace_id === workspaceId && w.active));

  const lettersOnly = !!batch && letters.includes(batch.id);
  const toteNeeded = batch && !lettersOnly ? batch.slots.find((s) => !s.tote_code) ?? null : null;
  const { current: stop, next, index } = batch ? nextStops(batch) : { current: null, next: null, index: 0 };
  const progress = batch ? batchProgress(batch) : null;
  const slotOf = (s: PickStop | null) => (batch && s ? batch.slots.find((x) => x.letter === s.slot) ?? null : null);

  // A stop that changed under a pending scan (picked elsewhere, recorded short) drops the pending item.
  useEffect(() => {
    if (pendingRef.current && pendingRef.current.stopKey !== stop?.key) setPending(null);
    setWrong(null);
    setShortOpen(false);
  }, [stop?.key, pendingRef, setPending]);

  // The last stop closed: finish the batch, so its orders go to packing without another tap.
  useEffect(() => {
    if (!active || !batch || batch.status !== 'PICKING' || stop || finishing.current === batch.id) return;
    finishing.current = batch.id;
    const done = batch;
    void run('finish_batch', { batch_id: done.id, reason: '' }).then((r) => {
      if (r.ok) {
        setFinished(done);
        flash.ok(`${done.code} done. ${plural(done.slots.length, 'order')} ready to pack.`);
      } else {
        finishing.current = '';
        flash.bad(r.message);
      }
    });
  }, [active, batch, stop, run, flash]);

  const start = async () => {
    if (busy.current) return;
    busy.current = true;
    const r = await run('start_batch', {});
    busy.current = false;
    if (!r.ok) return flash.bad(r.message);
    setFinished(null);
    flash.ok('Batch started. Label the totes on your cart.');
  };

  const commit = async (kind: 'pick' | 'substitute', pallet: Pallet, s: PickStop) => {
    if (!batch) return;
    busy.current = true;
    const r = await run(kind, { batch_id: batch.id, stop_key: s.key }, pallet, pallet.version);
    busy.current = false;
    setPending(null);
    setWrong(null);
    if (!r.ok) return flash.bad(r.message);
    const after = backend.db.batches[batch.id];
    const left = after?.stops.find((x) => x.key === s.key);
    const more = left && left.status === 'open' ? left.qty - left.picked.length : 0;
    const nxt = after ? nextStops(after).current : null;
    flash.ok(
      `${pallet.code} is in tote ${s.slot}.${kind === 'substitute' ? ' A manager will review the substitute.' : ''} ${
        more ? `Take ${more} more.` : nxt ? `Next: ${nxt.location_code ?? 'no spot'}.` : 'That was the last one.'
      }`,
    );
  };

  const shortPick = async (reason: ShortReason) => {
    if (!batch || !stop || busy.current) return;
    busy.current = true;
    const r = await run('short_pick', { batch_id: batch.id, stop_key: stop.key, reason });
    busy.current = false;
    if (!r.ok) return flash.bad(r.message);
    const after = backend.db.batches[batch.id];
    const moved = after?.stops.find((x) => x.key === stop.key)?.moved_to;
    flash.note(moved ? `Recorded. The rest is at ${moved}, added to your walk.` : `Recorded short: ${SHORT_REASON_LABEL[reason]}.`, 'warn');
  };

  const onScan = (ev: ScanEvent): boolean | 'error' => {
    if (!actorId || !workspaceId) return false;
    if (busy.current) return true;
    if (!batch) {
      flash.bad(queue.length ? 'Start a batch first: tap Start picking.' : 'No orders are waiting to be picked.');
      return 'error';
    }
    const s = classify(backend.reader, actorId, workspaceId, ev.text);
    // Cart setup: one tote label per letter.
    if (toteNeeded) {
      if (s.kind !== 'tote') {
        flash.bad(`Scan a tote label for ${toteNeeded.letter}, such as T-01. Or tap Use letters only.`);
        return 'error';
      }
      busy.current = true;
      void run('assign_tote', { batch_id: batch.id, letter: toteNeeded.letter, tote_code: s.code }).then((r) => {
        busy.current = false;
        if (r.ok) flash.ok(`${s.code} is tote ${toteNeeded.letter}.`);
        else flash.bad(r.message);
      });
      return true;
    }
    if (!stop) return true;
    const slot = slotOf(stop);
    const o = order(stop.order_id);
    const p = pendingRef.current;
    if (p) {
      if (s.kind === 'tote') {
        if (s.code !== slot?.tote_code) {
          const other = batch.slots.find((x) => x.tote_code === s.code);
          flash.bad(`That is ${s.code}${other ? `, tote ${other.letter}` : ''}. Put ${p.pallet.code} in tote ${stop.slot} (${slot?.tote_code}).`);
          return 'error';
        }
        void commit(p.kind, p.pallet, stop);
        return true;
      }
      if (s.kind === 'unit' && s.pallet.id === p.pallet.id) return true;
      flash.bad(`Put ${p.pallet.code} in tote ${stop.slot} first: scan ${slot?.tote_code}.`);
      return 'error';
    }
    let unit: Pallet | null = null;
    if (s.kind === 'unit') unit = s.pallet;
    else if (s.kind === 'product') {
      // A product barcode stands for the next unit this stop expects at this spot.
      unit =
        stop.suggested.map((u) => backend.db.pallets[u.pallet_id]).find((x) => x && x.state === 'STORED' && !x.hold && !stop.picked.includes(x.id) && sameProduct(palletProduct(x), s.code)) ??
        s.units.find((x) => x.state === 'STORED' && !x.hold && x.current_location_id === stop.location_id) ??
        null;
      if (!unit) {
        flash.bad(sameProduct(s.code, stop.product_code) ? `No unscanned ${stop.description} is recorded at ${stop.location_code ?? 'a spot'}. Scan its item label.` : `That barcode is not ${stop.description}. This stop needs ${stop.product_code}.`);
        return 'error';
      }
    } else if (s.kind === 'spot') {
      if (s.location.id === stop.location_id) {
        flash.ok(`At ${s.location.code}. Scan the item.`);
        return true;
      }
      flash.bad(`That is ${s.location.code}. This stop is ${stop.location_code ?? 'not on a spot'}.`);
      return 'error';
    } else if (s.kind === 'tote') {
      flash.bad(`Scan the item first, then tote ${stop.slot}.`);
      return 'error';
    } else if (s.kind === 'order') {
      flash.bad(`That is ${s.pkg ? s.pkg.code : s.order.code}. Scan the item at ${stop.location_code ?? 'this stop'}.`);
      return 'error';
    } else {
      flash.bad(s.message);
      return 'error';
    }
    if (unit.state === 'PICKED') {
      if (unit.order?.batch_id === batch.id) {
        flash.note(`${unit.code} is already in tote ${unit.order.slot}.`);
        return true;
      }
      flash.bad(`${unit.code} is already picked for ${unit.order?.order_code ?? 'another order'}.`);
      return 'error';
    }
    if (unit.hold) {
      flash.bad(`${unit.code} is on hold: ${unit.hold.reason} Take another, or tap Can't pick.`);
      return 'error';
    }
    if (unit.state !== 'STORED') {
      flash.bad(`${unit.code} is not on a spot (${unit.state.toLowerCase().replace('_', ' ')}). Take another, or tap Can't pick.`);
      return 'error';
    }
    // A transfer's order takes the very pallets on the transfer, nothing else.
    if (stop.pallet_id && unit.id !== stop.pallet_id) {
      flash.bad(`That is ${unit.code}. This stop needs ${stop.suggested[0]?.code ?? 'the pallet on the transfer'}.`);
      return 'error';
    }
    const kind: 'pick' | 'substitute' = stop.pallet_id || sameProduct(palletProduct(unit), stop.product_code) ? 'pick' : 'substitute';
    if (kind === 'substitute') {
      const may = o?.allow_subs && settings.subs !== 'never';
      setWrong(may ? unit : null);
      flash.bad(`That is ${unit.code}, ${unit.description}. This stop needs ${stop.description}.${may ? ' The customer allows substitutes: tap Use as substitute.' : ''}`);
      return 'error';
    }
    if (lettersOnly || !slot?.tote_code) {
      void commit('pick', unit, stop);
      return true;
    }
    setPending({ stopKey: stop.key, pallet: unit, kind: 'pick' });
    flash.ok(`${unit.code}. Put it in tote ${stop.slot}.`);
    return true;
  };

  const takeSubstitute = () => {
    if (!wrong || !stop || !batch) return;
    const slot = slotOf(stop);
    if (lettersOnly || !slot?.tote_code) return void commit('substitute', wrong, stop);
    setPending({ stopKey: stop.key, pallet: wrong, kind: 'substitute' });
    setWrong(null);
    flash.note(`Substitute ${wrong.code}. Put it in tote ${stop.slot}.`, 'warn');
  };

  // ---------------------------------------------------------------- what to show
  const canPick = roleAllows(role, 'pick');
  if (!batch) {
    const last = finished;
    return {
      prompt: queue.length ? 'Start picking' : 'Nothing to pick',
      sub: queue.length ? `${plural(queue.length, 'order')} ready. A cart holds ${cartSize}.` : 'New orders show here as they come in.',
      tone: 'idle',
      demoTargets: [],
      placeholder: 'Type a code',
      onScan,
      body: (
        <div className="stack">
          {last && (
            <Notice tone="ok" title={`${last.code} picked`}>
              Take the cart to packing. Each tote goes to its own order.
            </Notice>
          )}
          {canPick && queue.length > 0 && (
            <button type="button" className="btn primary big" onClick={() => void start()} data-testid="start-batch">
              <Icon name="play" /> Start picking {plural(Math.min(queue.length, cartSize), 'order')}
            </button>
          )}
          {queue.length > 0 && (
            <div className="pick-queue">
              <div className="eyebrow">Next up</div>
              {queue.slice(0, cartSize).map((q, i) => (
                <div key={q.id} className="pick-queue-row">
                  <ToteChip letter={String.fromCharCode(65 + i)} />
                  <span className="mono">{q.code}</span>
                  <span className="grow" data-keep-words>
                    {q.customer.name}
                  </span>
                  <span className="muted">{q.due_at ? `Due ${fmtTime(q.due_at)}` : ''}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ),
    };
  }

  if (toteNeeded) {
    const done = batch.slots.filter((s) => s.tote_code);
    return {
      prompt: `Scan a tote for ${toteNeeded.letter}`,
      sub: (
        <>
          {toteNeeded.order_code} · <span data-keep-words>{toteNeeded.customer}</span>
        </>
      ),
      tone: 'idle',
      head: (
        <div className="cart-head">
          <ToteChip letter={toteNeeded.letter} size="lg" />
          <div>
            <div className="cart-head-title">
              {batch.code}: {plural(batch.slots.length, 'order')}, {plural(progress?.unitsTotal ?? 0, 'item')}
            </div>
            <div className="muted">Put a tote in each place on the cart and scan its label.</div>
          </div>
        </div>
      ),
      demoTargets: Array.from({ length: 8 }, (_, i) => `T-0${i + 1}`)
        .filter((t) => !batch.slots.some((s) => s.tote_code === t))
        .slice(0, 4)
        .map((t) => ({ label: t, sub: 'Tote', text: t })),
      placeholder: 'Type a tote code, e.g. T-01',
      onScan,
      body: (
        <div className="stack">
          <div className="cart-slots">
            {batch.slots.map((s) => (
              <div key={s.letter} className={`cart-slot${s.letter === toteNeeded.letter ? ' now' : ''}`}>
                <ToteChip letter={s.letter} code={s.tote_code} />
                <span className="mono">{s.order_code}</span>
                <span className="grow" data-keep-words>
                  {s.customer}
                </span>
              </div>
            ))}
          </div>
          <div className="row">
            <button
              type="button"
              className="btn"
              onClick={() => {
                const next = [...letters.filter((x) => x !== batch.id), batch.id].slice(-20);
                setLetters(next);
                try {
                  localStorage.setItem('wh.letterTotes', JSON.stringify(next));
                } catch {
                  /* kept for this visit */
                }
              }}
            >
              Use letters only
            </button>
            <span className="hint">{done.length ? `${done.length} of ${batch.slots.length} totes scanned.` : 'With letters only, each item goes in with one scan and no tote scan.'}</span>
          </div>
        </div>
      ),
    };
  }

  if (!stop) {
    return { prompt: 'Finishing the batch…', tone: 'busy', demoTargets: [], placeholder: 'Type a code', onScan, body: null };
  }

  const slot = slotOf(stop);
  const o = order(stop.order_id);
  const left = stop.qty - stop.picked.length;
  const p = pending?.stopKey === stop.key ? pending : null;
  const color = SLOT_COLOR[stop.slot] ?? SLOT_COLOR.H;
  const suggestions = stop.suggested.filter((u) => !stop.picked.includes(u.pallet_id));
  const mayShort = !p;
  return {
    prompt: p ? `Put it in tote ${stop.slot}` : !stop.location_id ? 'Nothing recorded to pick' : stop.picked.length ? `Scan the next item (${stop.picked.length} of ${stop.qty})` : 'Scan the item',
    sub: p ? `${p.pallet.code}${p.kind === 'substitute' ? ' (substitute)' : ''}. Scan tote ${slot?.tote_code} to confirm.` : stop.location_id ? `${stop.description}, from ${stop.location_code}` : `No ${stop.description} is recorded on a spot. Find one, or record it short.`,
    tone: p ? 'ok' : stop.location_id ? 'idle' : 'warn',
    head: (
      <div className="stop-card" data-testid="pick-stop" style={{ borderColor: color.bg }}>
        <div className="stop-top">
          <span className="stop-step">
            Stop {index + 1} of {batch.stops.length}
          </span>
          <span className="stop-progress">
            {progress?.units ?? 0} of {progress?.unitsTotal ?? 0} items
          </span>
        </div>
        <div className="stop-spot" data-testid="pick-spot">
          {stop.location_code ?? 'No spot'}
        </div>
        <div className="stop-take">
          <span className="stop-qty" data-testid="pick-take">
            Take {left}
          </span>
          <span className="stop-what" data-keep-words>
            {stop.description}
            <small className="mono">{stop.product_code}</small>
          </span>
        </div>
        <div className="stop-put">
          <span>Put in</span>
          <ToteChip letter={stop.slot} code={slot?.tote_code} size="lg" />
          <span className="stop-for" data-keep-words>
            {o?.code} · {o?.customer.name}
          </span>
        </div>
        {next && (
          <div className="stop-next" data-testid="pick-next">
            Next: <strong>{next.location_code ?? 'no spot'}</strong> · {next.description} · tote {next.slot}
          </div>
        )}
      </div>
    ),
    demoTargets: p
      ? [{ label: slot?.tote_code ?? `Tote ${stop.slot}`, sub: `Tote ${stop.slot}`, text: slot?.tote_code ?? '' }].filter((t) => t.text)
      : [...suggestions.slice(0, 2).map((u) => ({ label: u.code, sub: stop.description, text: u.code })), ...(stop.location_code ? [{ label: stop.location_code, sub: 'Spot', text: stop.location_code }] : [])],
    placeholder: p ? 'Type the tote code, e.g. T-01' : 'Type the item code, e.g. P-000042',
    onScan,
    body: (
      <div className="stack">
        {wrong && (
          <Notice tone="warn" title={`Use ${wrong.code} as a substitute?`}>
            <p style={{ margin: '0 0 8px' }}>
              {wrong.description} instead of {stop.description}. {settings.subs === 'allow' ? 'It goes in the order as a substitute.' : 'A manager approves it before packing.'}
            </p>
            <div className="row">
              <button type="button" className="btn primary" onClick={takeSubstitute}>
                Use as substitute
              </button>
              <button type="button" className="btn ghost" onClick={() => setWrong(null)}>
                No, keep looking
              </button>
            </div>
          </Notice>
        )}
        {p && (
          <button type="button" className="btn ghost small" onClick={() => setPending(null)}>
            Put {p.pallet.code} back, it is not going in
          </button>
        )}
        {mayShort && !shortOpen && (
          <button type="button" className={`btn${stop.location_id ? '' : ' primary'}`} onClick={() => setShortOpen(true)} data-testid="cant-pick">
            <Icon name="alert" /> Can't pick {left > 1 ? `all ${left}` : 'it'}
          </button>
        )}
        {mayShort && shortOpen && (
          <div className="short-panel" role="group" aria-label="Why can't it be picked?">
            <div className="short-title">Why can't you pick {left > 1 ? `the other ${left}` : 'it'}?</div>
            <div className="short-reasons">
              {(stop.location_id ? (['not_at_spot', 'damaged', 'wrong_item', 'cant_reach'] as ShortReason[]) : (['no_stock'] as ShortReason[])).map((r) => (
                <button key={r} type="button" className="btn" onClick={() => void shortPick(r)}>
                  {SHORT_REASON_LABEL[r]}
                </button>
              ))}
              <button type="button" className="btn ghost" onClick={() => setShortOpen(false)}>
                Cancel
              </button>
            </div>
            <p className="hint" style={{ margin: 0 }}>
              {stop.location_id ? 'The app looks for the rest on another spot. Not at the spot marks those records missing so a manager can find them.' : 'The order goes out without it, and the packing slip says so.'}
            </p>
          </div>
        )}
        {o?.allow_subs && settings.subs !== 'never' && !wrong && !p && <p className="hint" style={{ margin: 0 }}>Substitutes allowed on this order: scan a similar item if this one is not available.</p>}
      </div>
    ),
  };
}

// ------------------------------------------------------------------ Pack

export interface PackData {
  orders: Order[];
  packages: Package[];
  boxTypes: string[];
  print: (d: PrintDoc) => void;
  printAvailable: boolean;
}

/** Pack: scan the tote (or order, or any item in it), scan each item into the box, choose the box, print. */
export function usePackTask(data: PackData, flash: Flash): FlowTask {
  const { backend, actorId, workspaceId, role } = useApp();
  const run = useRunner();
  const [orderId, setOrderId, orderRef] = useLive<string | null>(null);
  const [scanned, setScanned, scannedRef] = useLive<string[]>([]);
  const [lastPkg, setLastPkg] = useState<string | null>(null);
  const [weight, setWeight] = useState('');
  const busy = useRef(false);
  const o = orderId ? data.orders.find((x) => x.id === orderId) ?? backend.db.orders[orderId] ?? null : null;
  const pkgs = o ? o.package_ids.map((id) => data.packages.find((k) => k.id === id) ?? backend.db.packages[id]).filter((k): k is Package => !!k) : [];
  const unpacked = o ? orderUnits(o).filter((u) => !u.package_id) : [];
  const ready = data.orders.filter((x) => x.status === 'PICKED');
  const manager = roleAllows(role, 'decide_sub');

  const open = (next: Order, note = true) => {
    setOrderId(next.id);
    setScanned([]);
    setLastPkg(null);
    if (!note) return;
    if (next.status === 'PICKED') flash.ok(`${next.code}, ${next.customer.name}. Scan each item into the box.`);
    else if (next.status === 'PICKING') flash.bad(`${next.code} is still being picked on ${next.batch_code}.`);
    else if (next.status === 'OPEN') flash.bad(`${next.code} has not been picked yet.`);
    else if (next.status === 'DONE') flash.note(`${next.code} was already handed off.`);
    else flash.note(`${next.code} is packed. Reprint its label below, or scan the next tote.`);
  };

  const onScan = (ev: ScanEvent): boolean | 'error' => {
    if (!actorId || !workspaceId) return false;
    if (busy.current) return true;
    const s = classify(backend.reader, actorId, workspaceId, ev.text);
    const cur = orderRef.current ? backend.db.orders[orderRef.current] : null;
    if (s.kind === 'tote') {
      if (!s.order) {
        flash.bad(`${s.code} is not holding an order.`);
        return 'error';
      }
      if (s.order.id !== cur?.id) open(s.order);
      return true;
    }
    if (s.kind === 'order') {
      if (s.order.id !== cur?.id) open(s.order);
      return true;
    }
    if (s.kind === 'unit') {
      const ref = s.pallet.order;
      if (!ref || s.pallet.state !== 'PICKED') {
        flash.bad(`${s.pallet.code} is not picked for an order.`);
        return 'error';
      }
      let target = cur;
      if (!target || target.id !== ref.order_id) {
        const other = backend.db.orders[ref.order_id];
        if (cur && cur.status === 'PICKED' && orderUnits(cur).some((u) => !u.package_id)) {
          flash.bad(`${s.pallet.code} belongs to ${ref.order_code} (tote ${ref.tote_code ?? ref.slot}). Keep it out of this box.`);
          return 'error';
        }
        if (!other) return 'error';
        open(other, false);
        target = other;
      }
      if (ref.package_code) {
        flash.note(`${s.pallet.code} is already in ${ref.package_code}.`);
        return true;
      }
      if (scannedRef.current.includes(s.pallet.id)) return true;
      const next = [...(target.id === orderRef.current ? scannedRef.current : []), s.pallet.id];
      setScanned(next);
      const total = orderUnits(target).filter((u) => !u.package_id).length;
      flash.ok(next.length >= total ? `${s.pallet.code}. All ${total} scanned. Choose the box.` : `${s.pallet.code}. ${next.length} of ${total} scanned.`);
      return true;
    }
    if (s.kind === 'spot') {
      flash.bad(`That is a spot. Packed packages are staged on the Stage tab.`);
      return 'error';
    }
    flash.bad(s.kind === 'unknown' ? s.message : 'Scan a tote, an order, or an item label.');
    return 'error';
  };

  const pack = async (box: string) => {
    if (!o || busy.current || !scanned.length) return;
    busy.current = true;
    const w = Number(weight);
    const r = await run('pack', { order_id: o.id, unit_ids: scanned, box_type: box, ...(weight && w > 0 ? { weight_lb: w } : {}) });
    busy.current = false;
    if (!r.ok) return flash.bad(r.message);
    const id = r.result.created_ids?.[0] ?? r.result.target_id ?? null;
    setLastPkg(id);
    setScanned([]);
    setWeight('');
    const k = id ? backend.db.packages[id] : null;
    const after = backend.db.orders[o.id];
    const rest = after ? orderUnits(after).filter((u) => !u.package_id).length : 0;
    flash.ok(`Packed ${k?.code ?? 'the package'}. ${rest ? `${plural(rest, 'item')} left for another box.` : 'Print the label, then scan the next tote.'}`);
  };

  const decide = async (palletId: string, approve: boolean) => {
    if (!o) return;
    const r = await run('decide_sub', { order_id: o.id, pallet_id: palletId, approve });
    if (!r.ok) flash.bad(r.message);
    else flash.ok(approve ? 'Substitute approved.' : 'Substitute refused. Take it out of the tote and put it away.');
  };

  const last = lastPkg ? data.packages.find((k) => k.id === lastPkg) ?? backend.db.packages[lastPkg] ?? null : null;
  const waiting = o ? pendingSubs(o) : [];
  const allIn = !!o && unpacked.length > 0 && scanned.length === unpacked.length;
  const prompt = !o
    ? 'Scan a tote or order to pack'
    : o.status !== 'PICKED'
      ? o.status === 'PACKED' || o.status === 'STAGED'
        ? 'Packed. Scan the next tote or order'
        : 'Scan a tote or order to pack'
      : waiting.length
        ? 'Waiting for a manager'
        : allIn
          ? 'Choose the box'
          : `Scan each item (${scanned.length} of ${unpacked.length})`;

  return {
    prompt,
    sub: o ? (
      <>
        {o.code} · <span data-keep-words>{o.customer.name}</span> · {o.method === 'pickup' ? 'Pickup' : 'Ship'}
        {o.tote_code ? ` · tote ${o.tote_code}` : ''}
      </>
    ) : ready.length ? (
      `${plural(ready.length, 'order')} ready to pack.`
    ) : (
      'Picked orders show here.'
    ),
    tone: allIn ? 'ok' : waiting.length ? 'warn' : 'idle',
    demoTargets: o && o.status === 'PICKED'
      ? unpacked.filter((u) => !scanned.includes(u.pallet_id)).slice(0, 3).map((u) => ({ label: u.code, sub: u.description, text: u.code }))
      : ready.slice(0, 3).map((x) => ({ label: x.tote_code ?? x.code, sub: x.customer.name, text: x.tote_code ?? x.code })),
    placeholder: 'Type a tote, order or item code',
    onScan,
    body: (
      <div className="stack">
        {!o && ready.length > 0 && (
          <div className="pick-queue">
            <div className="eyebrow">Ready to pack</div>
            {ready.map((x) => (
              <button key={x.id} type="button" className="pick-queue-row as-button" onClick={() => open(x)}>
                <ToteChip letter={x.slot} code={x.tote_code} />
                <span className="mono">{x.code}</span>
                <span className="grow" data-keep-words>
                  {x.customer.name}
                </span>
                {pendingSubs(x).length > 0 && <span className="tag warn">Substitute to review</span>}
              </button>
            ))}
          </div>
        )}
        {o && waiting.length > 0 && (
          <Notice tone="warn" title="A substitute needs a manager's decision">
            {waiting.map((u) => {
              const line = o.lines.find((l) => l.units.includes(u));
              return (
                <div key={u.pallet_id} className="sub-row">
                  <span>
                    <strong className="mono">{u.code}</strong> {u.description} for {line?.description}
                  </span>
                  {manager && (
                    <span className="row">
                      <button type="button" className="btn small primary" onClick={() => void decide(u.pallet_id, true)}>
                        Approve
                      </button>
                      <button type="button" className="btn small" onClick={() => void decide(u.pallet_id, false)}>
                        Refuse
                      </button>
                    </span>
                  )}
                </div>
              );
            })}
            {!manager && <p style={{ margin: '6px 0 0' }}>Ask a manager to approve or refuse it in Pick orders.</p>}
          </Notice>
        )}
        {o && (unpacked.length > 0 || o.lines.some((l) => l.qty > lineFilled(l))) && (
          <ul className="pack-list" data-testid="pack-list">
            {unpacked.map((u) => (
              <li key={u.pallet_id} className={scanned.includes(u.pallet_id) ? 'done' : ''}>
                <Icon name={scanned.includes(u.pallet_id) ? 'checkCircle' : 'box'} />
                <span className="mono">{u.code}</span>
                <span className="grow" data-keep-words>
                  {u.description}
                  {u.sub ? ' (substitute)' : ''}
                </span>
              </li>
            ))}
            {o.lines
              .filter((l) => l.qty > lineFilled(l))
              .map((l) => (
                <li key={`short-${l.line_no}`} className="short">
                  <Icon name="alert" />
                  <span className="grow" data-keep-words>
                    {l.qty - lineFilled(l)} {l.description} not available. The slip says so.
                  </span>
                </li>
              ))}
          </ul>
        )}
        {o && o.status === 'PICKED' && !waiting.length && scanned.length > 0 && (
          <div className="box-pick" role="group" aria-label="Box">
            <div className="box-pick-title">
              Pack {plural(scanned.length, 'item')} in:
              {!allIn && <span className="hint"> The other {unpacked.length - scanned.length} can go in another box.</span>}
            </div>
            <div className="box-buttons">
              {data.boxTypes.map((b) => (
                <button key={b} type="button" className="btn big" onClick={() => void pack(b)}>
                  {b}
                </button>
              ))}
            </div>
            <label className="row nowrap box-weight">
              <span>Weight (optional)</span>
              <input className="input" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="lb" style={{ maxWidth: 110 }} />
            </label>
          </div>
        )}
        {o && last && (
          <div className="pkg-done" data-testid="packed-package">
            <div className="pkg-done-code">
              <Icon name="checkCircle" /> {last.code}
            </div>
            <div className="muted">
              {plural(last.unit_codes.length, 'item')} in a {last.box_type.toLowerCase()}. Stick the 4x6 label on the box and put the slip inside.
            </div>
            <PackagePrintButtons order={backend.db.orders[o.id] ?? o} pkg={last} packages={pkgs} print={data.print} available={data.printAvailable} />
          </div>
        )}
        {o && !last && pkgs.length > 0 && (
          <div className="pkg-list">
            {pkgs.map((k) => (
              <div key={k.id} className="pkg-row">
                <span className="mono">{k.code}</span>
                <span className="grow">
                  {plural(k.unit_codes.length, 'item')}, {k.box_type}
                </span>
                <button type="button" className="btn small" onClick={() => data.print({ kind: 'label', order: o, pkg: k, total: pkgs.length })} disabled={!data.printAvailable}>
                  <Icon name="print" /> Label
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    ),
  };
}

// ------------------------------------------------------------------ Stage

export interface StageData {
  packages: Package[];
  staging: Location[];
}

/** Stage: scan the package, then the staging spot. One scan of the spot saves. */
export function useStageTask(data: StageData, flash: Flash): FlowTask {
  const { backend, actorId, workspaceId } = useApp();
  const run = useRunner();
  const [pkgId, setPkgId, pkgRef] = useLive<string | null>(null);
  const busy = useRef(false);
  const lastSaved = useRef<{ loc: string; at: number } | null>(null);
  const pkg = pkgId ? data.packages.find((k) => k.id === pkgId) ?? backend.db.packages[pkgId] ?? null : null;
  const waiting = data.packages.filter((k) => k.status === 'PACKED');

  const onScan = (ev: ScanEvent): boolean | 'error' => {
    if (!actorId || !workspaceId) return false;
    if (busy.current) return true;
    const s = classify(backend.reader, actorId, workspaceId, ev.text);
    if (s.kind === 'order') {
      const k =
        s.pkg ??
        (() => {
          const open = s.order.package_ids.map((id) => backend.db.packages[id]).filter((x) => x && x.status === 'PACKED');
          return open.length === 1 ? open[0] : null;
        })();
      if (!k) {
        flash.bad(`Scan the package label (K-…) of ${s.order.code}.`);
        return 'error';
      }
      if (k.status === 'HANDED_OFF' || k.status === 'CANCELLED') {
        flash.bad(`${k.code} is ${k.status === 'HANDED_OFF' ? 'already handed off' : 'cancelled'}.`);
        return 'error';
      }
      if (pkgRef.current === k.id) return true;
      setPkgId(k.id);
      flash.ok(`${k.code} for ${k.customer}. Now scan a staging spot.`);
      return true;
    }
    if (s.kind === 'spot') {
      const cur = pkgRef.current ? backend.db.packages[pkgRef.current] : null;
      if (!cur) {
        if (lastSaved.current?.loc === s.location.id && Date.now() - lastSaved.current.at < 8000) return true;
        flash.bad('Scan the package label first, then the staging spot.');
        return 'error';
      }
      if (s.location.kind !== 'STAGING') {
        flash.bad(`${s.location.code} is not a staging spot. Scan a staging spot.`);
        return 'error';
      }
      busy.current = true;
      void run('stage_package', { package_id: cur.id, location_id: s.location.id }).then((r) => {
        busy.current = false;
        if (!r.ok) return flash.bad(r.message);
        lastSaved.current = { loc: s.location.id, at: Date.now() };
        setPkgId(null);
        flash.ok(`${cur.code} is on ${s.location.code}. Saved.`);
      });
      return true;
    }
    flash.bad(s.kind === 'unknown' ? s.message : s.kind === 'unit' ? 'Scan the package label (K-…), not the item.' : 'Scan a package label (K-…).');
    return 'error';
  };

  return {
    prompt: pkg ? 'Now scan a staging spot' : 'Scan a package',
    sub: pkg ? (
      <>
        {pkg.code} · {pkg.order_code} · <span data-keep-words>{pkg.customer}</span>
      </>
    ) : waiting.length ? (
      `${plural(waiting.length, 'package')} waiting to be staged.`
    ) : (
      'Packed packages show here.'
    ),
    tone: pkg ? 'ok' : 'idle',
    demoTargets: pkg ? data.staging.slice(0, 3).map((l) => ({ label: l.code, sub: 'Staging spot', text: l.code })) : waiting.slice(0, 3).map((k) => ({ label: k.code, sub: k.customer, text: k.code })),
    placeholder: 'Type a package or spot code',
    onScan,
    body: (
      <div className="stack">
        {!data.staging.length && (
          <Notice tone="warn" title="No staging spots yet">
            Add a spot of the kind Staging in Spots and labels, then print its label.
          </Notice>
        )}
        {waiting.length > 0 && (
          <div className="pick-queue">
            <div className="eyebrow">Waiting to be staged</div>
            {waiting.slice(0, 12).map((k) => (
              <div key={k.id} className={`pick-queue-row${k.id === pkgId ? ' now' : ''}`}>
                <span className="mono">{k.code}</span>
                <span className="mono muted">{k.order_code}</span>
                <span className="grow" data-keep-words>
                  {k.customer}
                </span>
                <span className="tag">{k.method === 'pickup' ? 'Pickup' : 'Ship'}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    ),
  };
}

// ------------------------------------------------------------------ Hand off

export interface HandoffData {
  orders: Order[];
  packages: Package[];
}

/** Hand off: scan the order or a package, scan every package, record who took it, confirm. */
export function useHandoffTask(data: HandoffData, flash: Flash): FlowTask {
  const { backend, actorId, workspaceId } = useApp();
  const run = useRunner();
  const [orderId, setOrderId, orderRef] = useLive<string | null>(null);
  const [scanned, setScanned, scannedRef] = useLive<string[]>([]);
  const [who, setWho] = useState('');
  const [carrier, setCarrier] = useState('');
  const [tracking, setTracking] = useState('');
  const [refused, setRefused] = useState<string[]>([]);
  const [done, setDone] = useState<string | null>(null);
  const busy = useRef(false);
  const o = orderId ? data.orders.find((x) => x.id === orderId) ?? backend.db.orders[orderId] ?? null : null;
  const pkgs = o ? o.package_ids.map((id) => data.packages.find((k) => k.id === id) ?? backend.db.packages[id]).filter((k): k is Package => !!k && k.status !== 'CANCELLED') : [];
  const ready = data.orders.filter((x) => x.status === 'PACKED' || x.status === 'STAGED');
  const all = pkgs.length > 0 && pkgs.every((k) => scanned.includes(k.id));

  const open = (next: Order) => {
    setOrderId(next.id);
    setScanned([]);
    setWho(next.method === 'pickup' ? next.customer.name : '');
    setCarrier('');
    setTracking('');
    setRefused([]);
    setDone(null);
  };

  const onScan = (ev: ScanEvent): boolean | 'error' => {
    if (!actorId || !workspaceId) return false;
    if (busy.current) return true;
    const s = classify(backend.reader, actorId, workspaceId, ev.text);
    if (s.kind !== 'order') {
      flash.bad(s.kind === 'unknown' ? s.message : s.kind === 'unit' ? 'Scan the package label (K-…), not the item.' : 'Scan a package label or order number.');
      return 'error';
    }
    const target = s.order;
    if (target.status === 'DONE') {
      flash.note(`${target.code} was already handed off ${target.handoff ? fmtTime(target.handoff.at) : ''}.`);
      return true;
    }
    if (target.status !== 'PACKED' && target.status !== 'STAGED') {
      flash.bad(`${target.code} is not packed yet.`);
      return 'error';
    }
    if (target.id !== orderRef.current) {
      open(target);
      scannedRef.current = [];
    }
    const live = target.package_ids.map((id) => backend.db.packages[id]).filter((k) => k && k.status !== 'CANCELLED');
    if (!s.pkg) {
      flash.ok(`${target.code}, ${target.customer.name}. Scan ${live.length === 1 ? 'its package' : `each of its ${live.length} packages`}.`);
      return true;
    }
    if (scannedRef.current.includes(s.pkg.id)) return true;
    const next = [...scannedRef.current, s.pkg.id];
    setScanned(next);
    const left = live.filter((k) => !next.includes(k.id));
    flash.ok(left.length ? `${s.pkg.code}. ${left.length} more: ${left.map((k) => `${k.code}${k.location_code ? ` on ${k.location_code}` : ''}`).join(', ')}.` : `${s.pkg.code}. All packages here. Confirm the handoff.`);
    return true;
  };

  const confirm = async () => {
    if (!o || !all || busy.current) return;
    busy.current = true;
    // A transfer's order is handed off by sending its transfer: the pallets go in transit to the other warehouse.
    const r = o.transfer
      ? await run('hand_off_transfer', { transfer_id: o.transfer.id, order_id: o.id, package_ids: pkgs.map((k) => k.id), carrier: carrier.trim(), tracking: tracking.trim() }, null, o.version)
      : await run(
          'hand_off',
          {
            order_id: o.id,
            package_ids: pkgs.map((k) => k.id),
            ...(o.method === 'pickup' ? { collected_by: who.trim() } : { carrier: carrier.trim(), tracking: tracking.trim() }),
            ...(refused.length ? { refused_ids: refused } : {}),
          },
          null,
          o.version,
        );
    busy.current = false;
    if (!r.ok) return flash.bad(r.message);
    setDone(o.id);
    setOrderId(null);
    setScanned([]);
    flash.ok(
      o.transfer
        ? `${o.code} handed off. ${o.transfer.number} is in transit to ${o.transfer.to_name}.`
        : `${o.code} handed off. ${plural(orderUnits(o).length - refused.length, 'item')} recorded as gone.`,
    );
  };

  const finished = done ? backend.db.orders[done] : null;
  const subs = o ? orderUnits(o).filter((u) => u.sub && u.sub.status !== 'rejected') : [];
  return {
    prompt: !o ? 'Scan a package or order' : all ? 'Confirm the handoff' : `Scan every package (${pkgs.filter((k) => scanned.includes(k.id)).length} of ${pkgs.length})`,
    sub: o ? (
      <>
        {o.code} · <span data-keep-words>{o.customer.name}</span> · {o.transfer ? `Transfer ${o.transfer.number}` : o.method === 'pickup' ? 'Pickup' : 'Ship'}
      </>
    ) : ready.length ? (
      `${plural(ready.length, 'order')} ready to hand off.`
    ) : (
      'Packed orders show here.'
    ),
    tone: all ? 'ok' : 'idle',
    demoTargets: o ? pkgs.filter((k) => !scanned.includes(k.id)).map((k) => ({ label: k.code, sub: k.location_code ?? 'Package', text: k.code })) : ready.slice(0, 3).map((x) => ({ label: x.code, sub: x.customer.name, text: x.code })),
    placeholder: 'Type a package or order code',
    onScan,
    body: (
      <div className="stack">
        {finished && (
          <Notice tone="ok" title={`${finished.code} handed off`}>
            {finished.handoff?.destination}
          </Notice>
        )}
        {!o && ready.length > 0 && (
          <div className="pick-queue">
            <div className="eyebrow">Ready to hand off</div>
            {ready.map((x) => (
              <div key={x.id} className="pick-queue-row">
                <span className="mono">{x.code}</span>
                <span className="grow" data-keep-words>
                  {x.customer.name}
                </span>
                <span className="muted">
                  {x.package_ids
                    .map((id) => backend.db.packages[id]?.location_code)
                    .filter(Boolean)
                    .join(', ')}
                </span>
                <span className="tag">{x.method === 'pickup' ? 'Pickup' : 'Ship'}</span>
              </div>
            ))}
          </div>
        )}
        {o && (
          <ul className="pack-list">
            {pkgs.map((k) => (
              <li key={k.id} className={scanned.includes(k.id) ? 'done' : ''}>
                <Icon name={scanned.includes(k.id) ? 'checkCircle' : 'box'} />
                <span className="mono">{k.code}</span>
                <span className="grow">
                  {plural(k.unit_codes.length, 'item')}, {k.box_type}
                </span>
                <span className="muted">{k.location_code ?? 'Not staged'}</span>
              </li>
            ))}
          </ul>
        )}
        {o && all && (
          <div className="stack handoff-form">
            {o.method === 'pickup' ? (
              <label className="field">
                <span className="label">Collected by</span>
                <input className="input" value={who} onChange={(e) => setWho(e.target.value)} placeholder="Name of the person collecting" data-keep-words />
              </label>
            ) : (
              <div className="row">
                <label className="field grow">
                  <span className="label">Carrier</span>
                  <input className="input" value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="e.g. UPS, local courier" />
                </label>
                <label className="field grow">
                  <span className="label">Tracking (optional)</span>
                  <input className="input" value={tracking} onChange={(e) => setTracking(e.target.value)} />
                </label>
              </div>
            )}
            {o.method === 'pickup' && subs.length > 0 && (
              <div className="stack" style={{ gap: 4 }}>
                <span className="hint">Substitutes: untick any the customer does not want. They go back to stock.</span>
                {subs.map((u) => (
                  <label key={u.pallet_id} className="toggle">
                    <input type="checkbox" checked={!refused.includes(u.pallet_id)} onChange={(e) => setRefused(e.target.checked ? refused.filter((x) => x !== u.pallet_id) : [...refused, u.pallet_id])} />
                    <span>
                      {u.code} {u.description}
                    </span>
                  </label>
                ))}
              </div>
            )}
            <button type="button" className="btn primary big" onClick={() => void confirm()} disabled={o.method === 'pickup' && !who.trim()} data-testid="confirm-handoff">
              <Icon name="check" /> {o.transfer ? `Send to ${o.transfer.to_name}` : o.method === 'pickup' ? 'Handed to customer' : 'Handed to carrier'}
            </button>
          </div>
        )}
      </div>
    ),
  };
}
