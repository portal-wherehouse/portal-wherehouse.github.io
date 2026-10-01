// "Track lots and expiry": when on, Receive asks for a lot number and an expiry date, Needs attention lists what
// expires soon, and picking takes the oldest expiry first.

import { useState } from 'react';
import { useApp } from '../../app/state';
import { uuid } from '../../domain/codes';
import { Notice } from '../../ui/ui';

export function LotsSetting() {
  const { backend, workspaceId, role, send, toast } = useApp();
  const wh = Object.values(backend.db.warehouses).find((w) => w.workspace_id === workspaceId && w.active);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!wh) return null;
  const manager = role === 'OWNER' || role === 'SUPERVISOR';
  const on = !!wh.lots;
  const save = async () => {
    setBusy(true);
    setError('');
    const o = await send('set_lots', { on: !on }, null, { commandId: uuid() });
    setBusy(false);
    if (o.status === 'result' && o.result.ok) toast(on ? 'Receive no longer asks for lots and expiry dates.' : 'Receive now asks for a lot number and an expiry date.');
    else setError(o.status === 'result' && !o.result.ok ? o.result.message : o.status === 'offline' ? o.message : 'No answer from the server. Reload to check.');
  };
  return (
    <div className="panel stack" data-testid="lots-setting">
      <div className="panel-title">Lots and expiry dates</div>
      <label className="toggle">
        <input type="checkbox" checked={on} disabled={!manager || busy || backend.network === 'offline'} onChange={() => void save()} />
        <span>Track lots and expiry</span>
      </label>
      <p className="hint" style={{ margin: 0 }}>
        When on, Receive has optional fields for the lot number and expiry date. Needs attention lists what expires in the next 30 days or already expired, and Find and order picking offer the oldest expiry first. Dates already saved stay when you turn it off.
      </p>
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}
