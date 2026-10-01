// The "Orders and picking" setting: on or off for the warehouse, how many orders a cart holds, the box types packers
// choose from, and whether pickers may substitute. Owners change it; everyone else sees it.

import { useEffect, useState } from 'react';
import { useApp } from '../../app/state';
import { uuid } from '../../domain/codes';
import { MAX_CART, ordersOf, SUB_POLICY_LABEL, type SubPolicy } from '../../domain/orders';
import { Notice } from '../../ui/ui';

export function OrdersSetting() {
  const { backend, workspaceId, role, send, toast } = useApp();
  const wh = Object.values(backend.db.warehouses).find((w) => w.workspace_id === workspaceId && w.active);
  const cur = ordersOf(wh);
  const [cart, setCart] = useState(String(cur.cart_size));
  const [boxes, setBoxes] = useState(cur.box_types.join(', '));
  const [subs, setSubs] = useState<SubPolicy>(cur.subs);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const key = JSON.stringify(cur);
  useEffect(() => {
    setCart(String(cur.cart_size));
    setBoxes(cur.box_types.join(', '));
    setSubs(cur.subs);
    // Reset the fields when the saved setting changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (!wh) return null;
  const owner = role === 'OWNER';
  const boxList = boxes
    .split(',')
    .map((b) => b.trim())
    .filter(Boolean);
  const save = async (on: boolean) => {
    setBusy(true);
    setError('');
    const o = await send('set_orders', { on, cart_size: Math.min(MAX_CART, Math.max(1, Number(cart) || cur.cart_size)), box_types: boxList.slice(0, 12), subs }, null, { commandId: uuid() });
    setBusy(false);
    if (o.status === 'result' && o.result.ok) toast(on === cur.on ? 'Order settings saved' : on ? 'Orders and picking is on. Pick orders is in the menu.' : 'Orders and picking is off');
    else setError(o.status === 'result' && !o.result.ok ? o.result.message : o.status === 'offline' ? o.message : 'No answer from the server. Reload to check.');
  };
  const changed = Number(cart) !== cur.cart_size || boxList.join('|') !== cur.box_types.join('|') || subs !== cur.subs;
  const offline = backend.network === 'offline';
  return (
    <div className="panel stack" data-testid="orders-setting">
      <div className="panel-title">Orders and picking</div>
      <label className="toggle">
        <input type="checkbox" checked={cur.on} disabled={!owner || busy || offline} onChange={() => void save(!cur.on)} />
        <span>Pick customer orders</span>
      </label>
      <p className="hint" style={{ margin: 0 }}>
        Adds Pick orders to the menu: orders are picked by spot into lettered totes, packed with a packing slip and a 4x6 label, staged, and handed off. Every item handed off is recorded as gone.
        {!owner && ' An owner can change this.'}
      </p>
      {cur.on && (
        <div className="stack" style={{ gap: 10 }}>
          <label className="row nowrap">
            <span style={{ minWidth: 150 }}>Orders per cart</span>
            <input className="input" inputMode="numeric" value={cart} disabled={!owner} onChange={(e) => setCart(e.target.value.replace(/\D/g, '').slice(0, 1))} style={{ maxWidth: 80 }} aria-describedby="cart-hint" />
          </label>
          <span id="cart-hint" className="hint">
            1 to {MAX_CART}. One tote per order, lettered A to {String.fromCharCode(64 + MAX_CART)}.
          </span>
          <label className="stack" style={{ gap: 4 }}>
            <span>Box types</span>
            <input className="input" value={boxes} disabled={!owner} onChange={(e) => setBoxes(e.target.value)} placeholder="Small box, Medium box, Large box, Mailer" />
          </label>
          <div className="stack" style={{ gap: 4 }}>
            <span>Substitutes</span>
            <div className="seg" role="group" aria-label="Substitutes">
              {(['ask', 'allow', 'never'] as SubPolicy[]).map((p) => (
                <button key={p} type="button" aria-pressed={subs === p} disabled={!owner} onClick={() => setSubs(p)}>
                  {SUB_POLICY_LABEL[p]}
                </button>
              ))}
            </div>
            <span className="hint">Only on orders where the customer accepts substitutes.</span>
          </div>
          {owner && (
            <div>
              <button type="button" className="btn primary" disabled={!changed || busy || offline || !boxList.length} onClick={() => void save(true)}>
                Save order settings
              </button>
            </div>
          )}
        </div>
      )}
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}
