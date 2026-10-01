// Orders and picking, inside the command engine. Runs in the same transaction as every other command (the demo's
// undo log, or the Firebase command function's Firestore transaction), so an order, its batch, its packages and every
// unit it touches change together or not at all.
//
// The flow: create or import orders → start a batch (up to the cart size, one tote letter per order, stops sorted by
// spot) → pick (scan a unit, it leaves its spot for the tote) or record a short (the app looks for the next unit
// elsewhere) or scan a substitute (a manager approves it) → finish the batch → pack (units into a package K-000045)
// → stage the package on a staging spot → hand off (every unit is dispatched to the customer or carrier).
//
// The Firebase command function loads exactly what these rules read (firebase/functions/src/repository.ts,
// loadCommand); keep the two in step.

import { productKey } from '../domain/receiving';
import { compareExpiry } from '../domain/work';
import { setupOf } from '../domain/terms';
import { checkTransition, ROLE_RANK } from '../domain/transitions';
import {
  draftOrders,
  formatBatchCode,
  formatOrderCode,
  formatPackageCode,
  lineFilled,
  orderUnits,
  ordersOf,
  palletProduct,
  parseToteCode,
  pickQueue,
  sameProduct,
  SLOT_LETTERS,
  sortStops,
  type Order,
  type OrderLine,
  type OrderUnit,
  type Package,
  type PickBatch,
  type PickStop,
  type ShortReason,
  type SubPolicy,
} from '../domain/orders';
import type { AdminAudit, CommandEnvelope, CommandRejected, CommandResult, ErrorCode, EventType, Pallet, PalletEvent, RowError, Warehouse } from '../domain/types';
import type { Engine, Tx } from './engine';

type Reject = (code: ErrorCode, message: string, current?: Pallet | null) => CommandRejected;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Look a product up by its barcode or SKU: a saved product first, then stock that carries the code. */
export function findProduct(e: Engine, ws: string, code: string): { code: string; description: string } | null {
  const c = code.trim();
  if (!c) return null;
  const saved = e.db.products[productKey(ws, c)];
  if (saved && saved.workspace_id === ws) return { code: saved.code, description: saved.description };
  const unit = Object.values(e.db.pallets).find((p) => p.workspace_id === ws && sameProduct(palletProduct(p), c));
  return unit ? { code: palletProduct(unit), description: unit.description } : null;
}

/** Stock of a product that can be picked: stored, not on hold; the earliest expiry first (first expired, first out), then spots in walk order, oldest received first. */
export function pickableStock(e: Engine, ws: string, product: string, exclude: Set<string>): Pallet[] {
  const code = (id: string | null) => (id ? e.db.locations[id]?.code ?? '' : '');
  return Object.values(e.db.pallets)
    .filter((p) => p.workspace_id === ws && p.state === 'STORED' && !p.hold && !p.archived_at && !exclude.has(p.id) && sameProduct(palletProduct(p), product))
    .sort((a, b) => compareExpiry(a, b) || code(a.current_location_id).localeCompare(code(b.current_location_id), 'en', { numeric: true }) || a.received_at.localeCompare(b.received_at) || a.code.localeCompare(b.code));
}

/** Units chosen for open stops of batches being picked: other batches leave them alone. */
function reservedUnits(e: Engine, ws: string, skipBatch?: string): Set<string> {
  const out = new Set<string>();
  for (const b of Object.values(e.db.batches)) {
    if (b.workspace_id !== ws || b.status !== 'PICKING' || b.id === skipBatch) continue;
    for (const s of b.stops) if (s.status === 'open') for (const u of s.suggested) if (!s.picked.includes(u.pallet_id)) out.add(u.pallet_id);
  }
  return out;
}

/** Stops for `need` units of one line: one stop per spot, then one without a spot for anything not in stock. */
function planStops(e: Engine, ws: string, order: Order, slot: string, line: OrderLine, need: number, exclude: Set<string>, keyBase: string): PickStop[] {
  const found = pickableStock(e, ws, line.product_code, exclude).slice(0, need);
  const bySpot = new Map<string, Pallet[]>();
  for (const p of found) {
    exclude.add(p.id);
    const k = p.current_location_id ?? '';
    bySpot.set(k, [...(bySpot.get(k) ?? []), p]);
  }
  const stops: PickStop[] = [];
  let n = 0;
  const stop = (location_id: string | null, qty: number, units: Pallet[]): PickStop => ({
    key: `${keyBase}-${++n}`,
    order_id: order.id,
    line_no: line.line_no,
    slot,
    location_id,
    location_code: location_id ? e.db.locations[location_id]?.code ?? null : null,
    product_code: line.product_code,
    description: line.description,
    qty,
    picked: [],
    suggested: units.map((p) => ({ pallet_id: p.id, code: p.code })),
    status: 'open',
    short_reason: null,
    moved_to: null,
  });
  for (const [loc, units] of bySpot) stops.push(stop(loc || null, units.length, units));
  if (found.length < need) stops.push(stop(null, need - found.length, []));
  return stops;
}

export function orderCommand(e: Engine, tx: Tx, actorId: string, cmd: CommandEnvelope, now: string, reject: Reject): CommandResult {
  const ws = cmd.workspace_id;
  const p = cmd.payload as Record<string, unknown>;
  const wh = e.activeWarehouse(ws);
  if (!wh) return reject('INVALID_STATE', 'This company has no active warehouse.');
  const settings = ordersOf(wh);
  const member = e.membership(actorId, ws)!;
  const manager = ROLE_RANK[member.role] >= ROLE_RANK.SUPERVISOR;
  const actorName = e.db.users[actorId]?.name ?? '';
  const audit = (targetId: string, before: Record<string, unknown> | null, after: Record<string, unknown> | null, reason: string | null = null) => {
    const a: AdminAudit = { id: e.newId(), workspace_id: ws, actor_id: actorId, action: cmd.kind as AdminAudit['action'], target_id: targetId, before, after, reason, accepted_at: now, command_id: cmd.command_id };
    tx.appendAudit(a);
    return a.id;
  };

  if (cmd.kind === 'set_orders') return setOrders(e, tx, cmd, now, wh, audit, reject);
  if (!settings.on) return reject('INVALID_STATE', 'Orders and picking is off for this warehouse. An owner can turn it on in Settings.');

  // Working copies, saved once at the end with a new version each.
  const orders = new Map<string, Order>();
  const batches = new Map<string, PickBatch>();
  const packages = new Map<string, Package>();
  const order = (id: unknown): Order | null => {
    if (typeof id !== 'string') return null;
    if (!orders.has(id)) {
      const o = e.db.orders[id];
      if (!o || o.workspace_id !== ws) return null;
      orders.set(id, structuredClone(o));
    }
    return orders.get(id)!;
  };
  const batch = (id: unknown): PickBatch | null => {
    if (typeof id !== 'string') return null;
    if (!batches.has(id)) {
      const b = e.db.batches[id];
      if (!b || b.workspace_id !== ws) return null;
      batches.set(id, structuredClone(b));
    }
    return batches.get(id)!;
  };
  const pkg = (id: unknown): Package | null => {
    if (typeof id !== 'string') return null;
    if (!packages.has(id)) {
      const k = e.db.packages[id];
      if (!k || k.workspace_id !== ws) return null;
      packages.set(id, structuredClone(k));
    }
    return packages.get(id)!;
  };
  const save = () => {
    for (const o of orders.values()) tx.put('orders', o.id, { ...o, version: (e.db.orders[o.id]?.version ?? 0) + 1, updated_at: now });
    for (const b of batches.values()) tx.put('batches', b.id, { ...b, version: (e.db.batches[b.id]?.version ?? 0) + 1, updated_at: now });
    for (const k of packages.values()) tx.put('packages', k.id, { ...k, version: (e.db.packages[k.id]?.version ?? 0) + 1, updated_at: now });
  };
  const log = (o: Order, text: string) => o.log.push({ at: now, actor_name: actorName, text });
  let lastEvent: string | null = null;
  /** Change one unit: its record, its history entry, and the spot's load, together. */
  const unitEvent = (before: Pallet, patch: Partial<Pallet>, type: EventType, reason: string | null, detail: PalletEvent['detail']): Pallet => {
    const next: Pallet = { ...before, ...patch, version: before.version + 1, updated_at: now };
    lastEvent = e.palletEvent(tx, before, next, type, actorId, now, reason, { ...detail, actor_name: actorName });
    return next;
  };
  /** A unit leaves its order: it waits for a spot, like a delivery that was just received. */
  const returnUnit = (unit: OrderUnit, o: Order, why: string) => {
    const pal = e.db.pallets[unit.pallet_id];
    if (!pal || pal.workspace_id !== ws || pal.state !== 'PICKED' || pal.order?.order_id !== o.id) return null;
    return unitEvent(pal, { state: 'RECEIVED', current_location_id: null, order: null }, 'unpick', why, { order: o.code, order_id: o.id, from_location: unit.from_location_code });
  };
  const assignedCheck = (b: PickBatch): CommandRejected | null =>
    b.assigned_to !== actorId && !manager ? reject('FORBIDDEN', `${b.code} is assigned to ${b.assigned_name || 'another picker'}.`) : null;

  switch (cmd.kind) {
    case 'create_order': {
      const q = p as { external_ref?: string; customer: { name: string; phone?: string; email?: string; address?: string }; method: 'ship' | 'pickup'; due_at?: string; allow_subs: boolean; notes?: string; lines: { product_code: string; qty: number }[] };
      const name = q.customer.name.trim();
      if (!name) return reject('INVALID_INPUT', 'Enter the customer name.');
      const ref = (q.external_ref ?? '').trim();
      if (ref && Object.values(e.db.orders).some((o) => o.workspace_id === ws && o.external_ref === ref && o.status !== 'CANCELLED')) return reject('INVALID_INPUT', `Order ${ref} already exists.`);
      const lines: OrderLine[] = [];
      for (const l of q.lines) {
        const found = findProduct(e, ws, l.product_code);
        if (!found) return reject('INVALID_INPUT', `No product with barcode or SKU ${l.product_code.trim()}. Save it in Products first, or receive stock with that code.`);
        const same = lines.find((x) => sameProduct(x.product_code, found.code));
        if (same) same.qty += l.qty;
        else lines.push({ line_no: lines.length + 1, product_code: found.code, description: found.description, qty: l.qty, units: [], short: null });
      }
      const o = newOrder(e, tx, ws, wh, actorId, actorName, now, {
        external_ref: ref || null,
        customer: { name, phone: (q.customer.phone ?? '').trim(), email: (q.customer.email ?? '').trim(), address: (q.customer.address ?? '').trim() },
        method: q.method,
        due_at: q.due_at || null,
        allow_subs: q.allow_subs,
        notes: (q.notes ?? '').trim() || null,
        lines,
      });
      log(o, `Created with ${plural(lines.length, 'line')}`);
      tx.put('orders', o.id, o);
      const a = audit(o.id, null, { code: o.code, customer: name, lines: lines.length });
      const res = e.accepted(cmd, now, a, null, o.id);
      res.created_ids = [o.id];
      return res;
    }

    case 'cancel_order': {
      const o = order(p.order_id);
      if (!o) return reject('NOT_FOUND', 'Order not found.');
      if (cmd.expected_version !== e.db.orders[o.id].version) return reject('VERSION_CONFLICT', `${o.code} changed since you opened it. Review the current order.`);
      if (o.status === 'CANCELLED') return reject('INVALID_STATE', `${o.code} is already cancelled.`);
      if (o.status === 'DONE') return reject('INVALID_STATE', `${o.code} was already handed off.`);
      if (o.status === 'PICKING') return reject('INVALID_STATE', `${o.code} is being picked on ${o.batch_code}. Finish that batch first.`);
      const reason = String(p.reason ?? '').trim();
      let back = 0;
      for (const l of o.lines)
        for (const u of l.units) {
          if (returnUnit(u, o, `Order ${o.code} cancelled${reason ? `: ${reason}` : ''}.`)) back++;
        }
      for (const id of o.package_ids) {
        const k = pkg(id);
        if (k && k.status !== 'HANDED_OFF') Object.assign(k, { status: 'CANCELLED', location_id: null, location_code: null });
      }
      o.status = 'CANCELLED';
      log(o, `Cancelled${reason ? `: ${reason}` : ''}${back ? `. ${plural(back, 'item')} back to stock, waiting for a spot` : ''}`);
      save();
      const a = audit(o.id, { status: e.db.orders[o.id].status }, { status: 'CANCELLED' }, reason || null);
      return e.accepted(cmd, now, a, null, o.id);
    }

    case 'start_batch': {
      const q = p as { order_ids?: string[]; assign_to?: string };
      if ((q.order_ids || q.assign_to) && !manager) return reject('FORBIDDEN', 'Only a manager can choose the orders or the picker for a batch.');
      const who = q.assign_to ?? actorId;
      const picker = e.membership(who, ws);
      if (!picker || ROLE_RANK[picker.role] < ROLE_RANK.OPERATOR) return reject('NOT_FOUND', 'Choose a person who can pick.');
      const pickerName = e.db.users[who]?.name ?? '';
      const busy = Object.values(e.db.batches).find((b) => b.workspace_id === ws && b.status === 'PICKING' && b.assigned_to === who);
      if (busy) return reject('INVALID_STATE', `${who === actorId ? 'You have' : `${pickerName} has`} ${busy.code} in progress. Finish it first.`);
      let chosen: Order[];
      if (q.order_ids) {
        if (new Set(q.order_ids).size !== q.order_ids.length) return reject('INVALID_INPUT', 'An order is listed twice.');
        if (q.order_ids.length > settings.cart_size) return reject('INVALID_INPUT', `A cart holds ${plural(settings.cart_size, 'order')}.`);
        chosen = [];
        for (const id of q.order_ids) {
          const o = order(id);
          if (!o) return reject('NOT_FOUND', 'An order in this batch was not found.');
          if (o.status !== 'OPEN' || !pickQueue([o]).length) return reject('INVALID_STATE', `${o.code} is not ready to pick.`);
          chosen.push(o);
        }
      } else {
        chosen = pickQueue(Object.values(e.db.orders).filter((o) => o.workspace_id === ws))
          .slice(0, settings.cart_size)
          .map((o) => order(o.id)!);
      }
      if (!chosen.length) return reject('INVALID_STATE', 'No orders are waiting to be picked.');
      const n = tx.seq(ws, 'B');
      const b: PickBatch = {
        id: e.newId(),
        workspace_id: ws,
        warehouse_id: wh.id,
        code: formatBatchCode(n),
        status: 'PICKING',
        assigned_to: who,
        assigned_name: pickerName,
        slots: [],
        stops: [],
        created_by: actorId,
        created_at: now,
        finished_at: null,
        version: 0,
        updated_at: now,
      };
      const used = reservedUnits(e, ws);
      chosen.forEach((o, i) => {
        const letter = SLOT_LETTERS[i];
        b.slots.push({ letter, order_id: o.id, order_code: o.code, customer: o.customer.name, tote_code: null });
        for (const l of o.lines) {
          const need = l.qty - lineFilled(l);
          if (need <= 0) continue;
          l.short = null;
          b.stops.push(...planStops(e, ws, o, letter, l, need, used, `${letter}${l.line_no}`));
        }
        Object.assign(o, { status: 'PICKING', batch_id: b.id, batch_code: b.code, slot: letter, tote_code: null });
        log(o, `Picking started on ${b.code}, tote ${letter}, by ${pickerName}`);
      });
      b.stops = sortStops(b.stops);
      batches.set(b.id, b);
      save();
      const res = e.accepted(cmd, now, null, null, b.id);
      res.created_ids = [b.id];
      return res;
    }

    case 'assign_tote': {
      const b = batch(p.batch_id);
      if (!b) return reject('NOT_FOUND', 'Batch not found.');
      if (b.status !== 'PICKING') return reject('INVALID_STATE', `${b.code} is finished.`);
      const denied = assignedCheck(b);
      if (denied) return denied;
      const slot = b.slots.find((s) => s.letter === p.letter);
      if (!slot) return reject('NOT_FOUND', `${b.code} has no tote ${String(p.letter)}.`);
      const tote = parseToteCode(String(p.tote_code));
      if (!tote) return reject('INVALID_INPUT', 'Scan a tote label, such as T-07.');
      if (slot.tote_code === tote) return reject('INVALID_STATE', `${tote} is already tote ${slot.letter}.`);
      const twin = b.slots.find((s) => s.tote_code === tote);
      if (twin) return reject('INVALID_INPUT', `${tote} is already tote ${twin.letter}. Scan another tote.`);
      const inUse = Object.values(e.db.orders).find((o) => o.workspace_id === ws && o.tote_code === tote && o.id !== slot.order_id && (o.status === 'PICKING' || o.status === 'PICKED'));
      if (inUse) return reject('INVALID_INPUT', `${tote} still holds ${inUse.code}. Use another tote.`);
      if (b.stops.some((s) => s.slot === slot.letter && s.picked.length)) return reject('INVALID_STATE', `Items are already in tote ${slot.letter}. Keep the same tote.`);
      slot.tote_code = tote;
      const o = order(slot.order_id);
      if (o) o.tote_code = tote;
      save();
      return e.accepted(cmd, now, null, null, b.id);
    }

    case 'pick':
    case 'substitute': {
      const pal = e.db.pallets[cmd.pallet_id ?? ''];
      if (!pal || pal.workspace_id !== ws) return reject('NOT_FOUND', 'That item was not found in this warehouse.');
      if (cmd.expected_version !== pal.version) return reject('VERSION_CONFLICT', `${pal.code} changed since it was loaded (now version ${pal.version}). Scan it again.`, pal);
      const b = batch(p.batch_id);
      if (!b) return reject('NOT_FOUND', 'Batch not found.');
      if (b.status !== 'PICKING') return reject('INVALID_STATE', `${b.code} is finished.`);
      const denied = assignedCheck(b);
      if (denied) return denied;
      const stop = b.stops.find((s) => s.key === p.stop_key);
      if (!stop) return reject('NOT_FOUND', 'That stop is not on this batch.');
      if (stop.status !== 'open') return reject('INVALID_STATE', `This stop is already ${stop.status === 'done' ? 'picked' : 'recorded short'}.`);
      const o = order(stop.order_id);
      if (!o) return reject('NOT_FOUND', 'Order not found.');
      const line = o.lines.find((l) => l.line_no === stop.line_no)!;
      const rules = checkTransition(cmd.kind, { pallet: pal, job: undefined, payload: p, now, actorId });
      if (!rules.ok) return reject(rules.code, rules.message, pal);
      const same = sameProduct(palletProduct(pal), stop.product_code);
      if (cmd.kind === 'pick' && !same) return reject('INVALID_INPUT', `That is ${pal.code}, ${pal.description}. This stop needs ${stop.description}.`);
      if (cmd.kind === 'substitute') {
        if (same) return reject('INVALID_INPUT', `${pal.code} is the ordered product. Scan it as a normal pick.`);
        if (settings.subs === 'never') return reject('INVALID_STATE', 'This warehouse does not substitute products.');
        if (!o.allow_subs) return reject('INVALID_STATE', `${o.customer.name} did not allow substitutes on ${o.code}.`);
      }
      const from = pal.current_location_id ? e.db.locations[pal.current_location_id] : null;
      const slot = b.slots.find((s) => s.letter === stop.slot);
      const next = unitEvent(
        pal,
        {
          state: 'PICKED',
          current_location_id: null,
          order: { order_id: o.id, order_code: o.code, batch_id: b.id, slot: stop.slot, tote_code: slot?.tote_code ?? null, package_id: null, package_code: null, from_location_id: from?.id ?? null },
        },
        cmd.kind,
        null,
        { order: o.code, order_id: o.id, batch: b.code, tote: slot?.tote_code ?? stop.slot, from_location: from?.code ?? null, ...(cmd.kind === 'substitute' ? { substitute_for: stop.description } : {}) },
      );
      stop.picked.push(pal.id);
      if (stop.picked.length >= stop.qty) stop.status = 'done';
      // The unit is spoken for: no other stop of this batch waits for it.
      for (const s of b.stops) if (s !== stop) s.suggested = s.suggested.filter((u) => u.pallet_id !== pal.id);
      const policy: SubPolicy = settings.subs;
      line.units.push({
        pallet_id: pal.id,
        code: pal.code,
        description: pal.description,
        product_code: palletProduct(pal),
        batch_id: b.id,
        from_location_id: from?.id ?? null,
        from_location_code: from?.code ?? null,
        picked_by_name: actorName,
        picked_at: now,
        sub: cmd.kind === 'substitute' ? { status: policy === 'allow' ? 'approved' : 'pending', decided_by_name: null, decided_at: null } : null,
        package_id: null,
      });
      if (cmd.kind === 'substitute') log(o, `Substitute ${pal.code} (${pal.description}) picked for ${line.description}${policy === 'allow' ? '' : '. Waiting for approval'}`);
      save();
      return e.accepted(cmd, now, lastEvent, next, b.id);
    }

    case 'short_pick': {
      const b = batch(p.batch_id);
      if (!b) return reject('NOT_FOUND', 'Batch not found.');
      if (b.status !== 'PICKING') return reject('INVALID_STATE', `${b.code} is finished.`);
      const denied = assignedCheck(b);
      if (denied) return denied;
      const stop = b.stops.find((s) => s.key === p.stop_key);
      if (!stop) return reject('NOT_FOUND', 'That stop is not on this batch.');
      if (stop.status !== 'open') return reject('INVALID_STATE', 'This stop is already done.');
      const o = order(stop.order_id);
      if (!o) return reject('NOT_FOUND', 'Order not found.');
      const line = o.lines.find((l) => l.line_no === stop.line_no)!;
      const reason = p.reason as ShortReason;
      const remaining = stop.qty - stop.picked.length;
      const here = stop.location_code ?? 'its spot';
      // The records at the spot that were not there, or not fit to ship. Stock is never zeroed blindly.
      const expected = stop.suggested
        .filter((u) => !stop.picked.includes(u.pallet_id))
        .map((u) => e.db.pallets[u.pallet_id])
        .filter((x): x is Pallet => !!x && x.workspace_id === ws && x.state === 'STORED' && x.current_location_id === stop.location_id);
      const flagged = new Set<string>();
      if (reason === 'not_at_spot')
        for (const x of expected.slice(0, remaining)) {
          unitEvent(x, { state: 'MISSING', current_location_id: null }, 'pick_missing', `Not at ${here} when picking ${o.code} (${b.code}).`, { order: o.code, order_id: o.id, batch: b.code });
          flagged.add(x.id);
        }
      if (reason === 'damaged' && expected[0] && !expected[0].hold) {
        unitEvent(expected[0], { hold: { reason: `Damaged, found while picking ${o.code}.`, applied_by: actorId, applied_at: now } }, 'pick_hold', `Damaged, found while picking ${o.code}.`, { order: o.code, order_id: o.id, batch: b.code });
        flagged.add(expected[0].id);
      }
      // Look for the rest elsewhere: another spot for a missing or unreachable unit, any other unit for a damaged one.
      const exclude = reservedUnits(e, ws, b.id);
      for (const s of b.stops) for (const u of [...s.picked, ...s.suggested.map((x) => x.pallet_id)]) exclude.add(u);
      for (const id of flagged) exclude.add(id);
      if (reason !== 'damaged' && stop.location_id)
        for (const x of Object.values(e.db.pallets)) if (x.workspace_id === ws && x.current_location_id === stop.location_id) exclude.add(x.id);
      const more = planStops(e, ws, o, stop.slot, line, remaining, exclude, `${stop.key}r`).filter((s) => s.location_id);
      const found = more.reduce((n, s) => n + s.qty, 0);
      stop.qty = stop.picked.length;
      stop.status = stop.picked.length ? 'done' : 'short';
      stop.short_reason = reason;
      stop.moved_to = more[0]?.location_code ?? null;
      const left = remaining - found;
      if (left > 0) line.short = { qty: (line.short?.qty ?? 0) + left, reason, by_name: actorName, at: now };
      b.stops = sortStops([...b.stops, ...more]);
      log(o, `${line.description}: ${plural(remaining, 'item')} short at ${here} (${reason.replace(/_/g, ' ')})${found ? `. ${plural(found, 'item')} found at ${more.map((s) => s.location_code).join(', ')}` : ''}`);
      save();
      return e.accepted(cmd, now, null, null, b.id);
    }

    case 'finish_batch': {
      const b = batch(p.batch_id);
      if (!b) return reject('NOT_FOUND', 'Batch not found.');
      if (b.status !== 'PICKING') return reject('INVALID_STATE', `${b.code} is already finished.`);
      const denied = assignedCheck(b);
      if (denied) return denied;
      const open = b.stops.filter((s) => s.status === 'open');
      const reason = String(p.reason ?? '').trim();
      if (open.length && !manager) return reject('INVALID_STATE', `${plural(open.length, 'stop is', 'stops are')} still open. Pick them, or record them short.`);
      if (open.length && !reason) return reject('INVALID_INPUT', 'Enter why the open stops were not picked.');
      for (const s of open) {
        const o = order(s.order_id)!;
        const line = o.lines.find((l) => l.line_no === s.line_no)!;
        const left = s.qty - s.picked.length;
        s.qty = s.picked.length;
        s.status = s.picked.length ? 'done' : 'short';
        s.short_reason = 'not_picked';
        line.short = { qty: (line.short?.qty ?? 0) + left, reason: 'not_picked', by_name: actorName, at: now };
      }
      for (const slot of b.slots) {
        const o = order(slot.order_id);
        if (!o || o.status !== 'PICKING') continue;
        const units = orderUnits(o).length;
        if (units) {
          o.status = 'PICKED';
          log(o, `Picked on ${b.code}: ${plural(units, 'item')}${slot.tote_code ? ` in tote ${slot.tote_code}` : ''}. Ready to pack`);
        } else {
          Object.assign(o, { status: 'OPEN', batch_id: null, batch_code: null, slot: null, tote_code: null });
          log(o, `Nothing could be picked on ${b.code}. Back to ready to pick`);
        }
      }
      b.status = 'DONE';
      b.finished_at = now;
      save();
      return e.accepted(cmd, now, open.length ? audit(b.id, { open: open.length }, { status: 'DONE' }, reason) : null, null, b.id);
    }

    case 'decide_sub': {
      const o = order(p.order_id);
      if (!o) return reject('NOT_FOUND', 'Order not found.');
      const line = o.lines.find((l) => l.units.some((u) => u.pallet_id === p.pallet_id));
      const unit = line?.units.find((u) => u.pallet_id === p.pallet_id);
      if (!line || !unit?.sub) return reject('NOT_FOUND', 'That item is not a substitute on this order.');
      if (unit.sub.status !== 'pending') return reject('INVALID_STATE', `${unit.code} was already ${unit.sub.status}.`);
      const note = String(p.note ?? '').trim();
      if (p.approve) {
        unit.sub = { status: 'approved', decided_by_name: actorName, decided_at: now };
        log(o, `Substitute ${unit.code} approved${note ? `: ${note}` : ''}`);
      } else {
        returnUnit(unit, o, `Substitute refused for ${o.code}${note ? `: ${note}` : ''}.`);
        line.units = line.units.filter((u) => u !== unit);
        line.short = { qty: (line.short?.qty ?? 0) + 1, reason: 'not_picked', by_name: actorName, at: now };
        log(o, `Substitute ${unit.code} refused${note ? `: ${note}` : ''}. Take it out of the tote and put it away`);
        if (o.status === 'PICKED' && !orderUnits(o).length) Object.assign(o, { status: 'OPEN', batch_id: null, batch_code: null, slot: null, tote_code: null });
      }
      settleOrder(o, packages, pkg);
      save();
      const a = audit(o.id, { substitute: unit.code, status: 'pending' }, { status: p.approve ? 'approved' : 'rejected' }, note || null);
      return e.accepted(cmd, now, a, null, o.id);
    }

    case 'pack': {
      const o = order(p.order_id);
      if (!o) return reject('NOT_FOUND', 'Order not found.');
      if (o.status === 'PICKING') return reject('INVALID_STATE', `${o.code} is still being picked on ${o.batch_code}. Finish the batch first.`);
      if (o.status !== 'PICKED') return reject('INVALID_STATE', o.status === 'OPEN' ? `${o.code} has not been picked yet.` : `${o.code} is already packed.`);
      const waiting = orderUnits(o).filter((u) => u.sub?.status === 'pending');
      if (waiting.length) return reject('INVALID_STATE', `Waiting for a manager to approve the substitute ${waiting.map((u) => u.code).join(', ')}.`);
      const box = String(p.box_type ?? '').trim();
      if (!box) return reject('INVALID_INPUT', 'Choose a box.');
      const ids = [...new Set(p.unit_ids as string[])];
      const units: OrderUnit[] = [];
      for (const id of ids) {
        const u = orderUnits(o).find((x) => x.pallet_id === id);
        if (!u) return reject('INVALID_INPUT', `${e.db.pallets[id]?.code ?? 'That item'} is not on ${o.code}.`);
        if (u.package_id) return reject('INVALID_STATE', `${u.code} is already in a package.`);
        const pal = e.db.pallets[id];
        if (!pal || pal.state !== 'PICKED' || pal.order?.order_id !== o.id) return reject('INVALID_STATE', `${u.code} is not picked for ${o.code}.`);
        units.push(u);
      }
      const weight = typeof p.weight_lb === 'number' && p.weight_lb > 0 ? p.weight_lb : null;
      const k: Package = {
        id: e.newId(),
        workspace_id: ws,
        warehouse_id: wh.id,
        code: formatPackageCode(tx.seq(ws, 'K')),
        order_id: o.id,
        order_code: o.code,
        customer: o.customer.name,
        method: o.method,
        seq: o.package_ids.length + 1,
        unit_ids: units.map((u) => u.pallet_id),
        unit_codes: units.map((u) => u.code),
        box_type: box,
        weight_lb: weight,
        status: 'PACKED',
        location_id: null,
        location_code: null,
        packed_by_name: actorName,
        packed_at: now,
        staged_at: null,
        version: 0,
        updated_at: now,
      };
      for (const u of units) {
        const pal = e.db.pallets[u.pallet_id];
        unitEvent(pal, { order: { ...pal.order!, package_id: k.id, package_code: k.code } }, 'pack', null, { order: o.code, order_id: o.id, package: k.code });
        u.package_id = k.id;
      }
      o.package_ids.push(k.id);
      packages.set(k.id, k);
      log(o, `Packed ${k.code}: ${plural(units.length, 'item')}, ${box}`);
      settleOrder(o, packages, pkg);
      save();
      const res = e.accepted(cmd, now, null, null, k.id);
      res.created_ids = [k.id];
      return res;
    }

    case 'stage_package': {
      const k = pkg(p.package_id);
      if (!k) return reject('NOT_FOUND', 'Package not found.');
      if (k.status === 'HANDED_OFF') return reject('INVALID_STATE', `${k.code} was already handed off.`);
      if (k.status === 'CANCELLED') return reject('INVALID_STATE', `${k.code} belongs to a cancelled order.`);
      const loc = e.db.locations[String(p.location_id)];
      if (!loc || loc.workspace_id !== ws) return reject('NOT_FOUND', 'That spot was not found.');
      if (loc.warehouse_id !== wh.id) return reject('INVALID_INPUT', 'That spot belongs to a different warehouse.');
      if (!loc.active) return reject('INACTIVE_LOCATION', `${loc.code} is inactive. Choose an active staging spot.`);
      if (loc.kind !== 'STAGING') return reject('INVALID_INPUT', `${loc.code} is not a staging spot. Scan a staging spot.`);
      if (k.location_id === loc.id) return reject('INVALID_STATE', `${k.code} is already at ${loc.code}.`);
      const o = order(k.order_id);
      if (!o) return reject('NOT_FOUND', 'Order not found.');
      Object.assign(k, { status: 'STAGED', location_id: loc.id, location_code: loc.code, staged_at: now });
      log(o, `${k.code} staged at ${loc.code}`);
      settleOrder(o, packages, pkg);
      save();
      return e.accepted(cmd, now, null, null, k.id);
    }

    case 'hand_off': {
      const o = order(p.order_id);
      if (!o) return reject('NOT_FOUND', 'Order not found.');
      if (cmd.expected_version !== e.db.orders[o.id].version) return reject('VERSION_CONFLICT', `${o.code} changed since you opened it. Review it and scan the packages again.`);
      if (o.status === 'DONE') return reject('INVALID_STATE', `${o.code} was already handed off.`);
      if (o.status !== 'PACKED' && o.status !== 'STAGED') return reject('INVALID_STATE', `${o.code} is not packed yet.`);
      const live = o.package_ids.map((id) => pkg(id)).filter((k): k is Package => !!k && k.status !== 'CANCELLED');
      const scanned = new Set(p.package_ids as string[]);
      const missing = live.filter((k) => !scanned.has(k.id));
      if (missing.length) return reject('INVALID_INPUT', `Scan every package. Not scanned: ${missing.map((k) => k.code).join(', ')}.`);
      if ([...scanned].some((id) => !live.some((k) => k.id === id))) return reject('INVALID_INPUT', `A scanned package is not part of ${o.code}.`);
      const collected = String(p.collected_by ?? '').trim();
      const carrier = String(p.carrier ?? '').trim();
      const tracking = String(p.tracking ?? '').trim();
      if (o.method === 'pickup' && !collected) return reject('INVALID_INPUT', 'Enter the name of the person collecting the order.');
      // Substitutes the customer refused at the counter go back to stock.
      const refused = new Set((p.refused_ids as string[] | undefined) ?? []);
      for (const id of refused) {
        const line = o.lines.find((l) => l.units.some((u) => u.pallet_id === id && u.sub));
        const unit = line?.units.find((u) => u.pallet_id === id);
        if (!line || !unit) return reject('INVALID_INPUT', 'Only a substitute can be refused at handoff.');
        returnUnit(unit, o, `Customer refused substitute on ${o.code}.`);
        line.units = line.units.filter((u) => u !== unit);
        line.short = { qty: (line.short?.qty ?? 0) + 1, reason: 'not_picked', by_name: actorName, at: now };
        for (const k of live) if (k.unit_ids.includes(id)) Object.assign(k, { unit_ids: k.unit_ids.filter((x) => x !== id), unit_codes: k.unit_codes.filter((c) => c !== unit.code) });
        log(o, `Customer refused substitute ${unit.code}. Put it away`);
      }
      const destination = (
        o.method === 'pickup'
          ? `Picked up by ${collected} for ${o.customer.name} (${o.code})`
          : `Shipped${carrier ? ` by ${carrier}` : ''}${tracking ? `, tracking ${tracking}` : ''} to ${o.customer.name} (${o.code})`
      ).slice(0, 200);
      let sent = 0;
      for (const u of orderUnits(o)) {
        const pal = e.db.pallets[u.pallet_id];
        if (!pal || pal.state !== 'PICKED' || pal.order?.order_id !== o.id) return reject('INVALID_STATE', `${u.code} is no longer picked for ${o.code}. Review the order.`);
        unitEvent(pal, { state: 'DISPATCHED', current_location_id: null }, 'hand_off', null, { destination, order: o.code, package: pal.order.package_code });
        sent++;
      }
      for (const k of live) Object.assign(k, { status: 'HANDED_OFF', location_id: null, location_code: null });
      o.status = 'DONE';
      o.handoff = { at: now, by_name: actorName, collected_by: collected || null, carrier: carrier || null, tracking: tracking || null, destination };
      log(o, `Handed off: ${plural(sent, 'item')} in ${plural(live.length, 'package')}. ${destination}`);
      save();
      return e.accepted(cmd, now, null, null, o.id);
    }
  }
  return reject('INVALID_INPUT', 'Unknown command.');
}

/** An order's status from its units and packages, once picking is over. */
function settleOrder(o: Order, packages: Map<string, Package>, pkg: (id: string) => Package | null) {
  if (o.status !== 'PICKED' && o.status !== 'PACKED' && o.status !== 'STAGED') return;
  const units = orderUnits(o);
  const allPacked = units.length > 0 && units.every((u) => u.package_id);
  const live = o.package_ids.map((id) => packages.get(id) ?? pkg(id)).filter((k): k is Package => !!k && k.status !== 'CANCELLED');
  if (!allPacked) o.status = 'PICKED';
  else if (live.length && live.every((k) => k.status === 'STAGED')) o.status = 'STAGED';
  else o.status = 'PACKED';
}

function newOrder(
  e: Engine,
  tx: Tx,
  ws: string,
  wh: Warehouse,
  actorId: string,
  actorName: string,
  now: string,
  d: Pick<Order, 'external_ref' | 'customer' | 'method' | 'due_at' | 'allow_subs' | 'notes' | 'lines'>,
): Order {
  return {
    id: e.newId(),
    workspace_id: ws,
    warehouse_id: wh.id,
    code: formatOrderCode(tx.seq(ws, 'O')),
    ...d,
    status: 'OPEN',
    batch_id: null,
    batch_code: null,
    slot: null,
    tote_code: null,
    package_ids: [],
    handoff: null,
    created_by: actorId,
    created_by_name: actorName,
    created_at: now,
    updated_at: now,
    version: 1,
    log: [],
  };
}

function setOrders(
  e: Engine,
  tx: Tx,
  cmd: CommandEnvelope,
  now: string,
  wh: Warehouse,
  audit: (id: string, b: Record<string, unknown> | null, a: Record<string, unknown> | null) => string,
  reject: Reject,
): CommandResult {
  const q = cmd.payload as { on: boolean; cart_size: number; box_types: string[]; subs: SubPolicy };
  const boxes = [...new Set(q.box_types.map((b) => b.trim()).filter(Boolean))];
  if (q.on && !boxes.length) return reject('INVALID_INPUT', 'Add at least one box type.');
  const before = ordersOf(wh);
  const next = { on: q.on, cart_size: q.cart_size, box_types: boxes, subs: q.subs };
  // With orders on, "Order" means a customer order only: a warehouse that called its jobs "Orders" goes back to "Jobs".
  const setup = setupOf(wh);
  const words = q.on && /^orders?$/i.test(setup.job.trim()) ? { ...setup, job: 'Job', jobs: 'Jobs' } : null;
  if (JSON.stringify(before) === JSON.stringify(next) && !words && wh.orders) return reject('INVALID_INPUT', 'Nothing changed.');
  // No version bump, like set_setup: settings must not conflict with an open warehouse details form.
  tx.put('warehouses', wh.id, { ...wh, orders: next, ...(words ? { setup: words } : {}), updated_at: now });
  const a = audit(wh.id, { orders: before }, { orders: next, ...(words ? { job_word: 'Job' } : {}) });
  return e.accepted(cmd, now, a, null, wh.id);
}

/** Orders from an import: one CSV row per line. Every row goes in, or none do. */
export function importOrders(e: Engine, tx: Tx, actorId: string, ws: string, wh: Warehouse, rows: Record<string, string>[], now: string): { created: string[] } | { errors: RowError[]; message: string } {
  if (!ordersOf(wh).on) return { errors: [], message: 'Orders and picking is off for this warehouse. An owner can turn it on in Settings.' };
  const { orders: drafts, errors } = draftOrders(rows);
  const actorName = e.db.users[actorId]?.name ?? '';
  const ready: Pick<Order, 'external_ref' | 'customer' | 'method' | 'due_at' | 'allow_subs' | 'notes' | 'lines'>[] = [];
  for (const d of drafts) {
    if (Object.values(e.db.orders).some((o) => o.workspace_id === ws && o.external_ref === d.external_ref && o.status !== 'CANCELLED')) {
      errors.push({ row: d.rows[0], column: 'order_ref', message: `Order ${d.external_ref} already exists.` });
      continue;
    }
    const lines: OrderLine[] = [];
    for (const l of d.lines) {
      const found = findProduct(e, ws, l.product_code);
      if (!found) {
        errors.push({ row: l.row, column: 'product', message: `No product with barcode or SKU ${l.product_code}. Save it in Products first.` });
        continue;
      }
      lines.push({ line_no: lines.length + 1, product_code: found.code, description: found.description, qty: l.qty, units: [], short: null });
    }
    ready.push({ external_ref: d.external_ref, customer: d.customer, method: d.method, due_at: d.due_at, allow_subs: d.allow_subs, notes: d.notes || null, lines });
  }
  if (errors.length) return { errors: errors.sort((a, b) => a.row - b.row), message: `${plural(errors.length, 'problem')} found. Nothing was imported.` };
  const created: string[] = [];
  for (const d of ready) {
    const o = newOrder(e, tx, ws, wh, actorId, actorName, now, d);
    o.log.push({ at: now, actor_name: actorName, text: `Imported with ${plural(d.lines.length, 'line')}` });
    tx.put('orders', o.id, o);
    created.push(o.id);
  }
  return { created };
}

