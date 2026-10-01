// "Approve quantity changes": when on, an operator's quantity change waits on the pallet until a manager approves it.

import { useState } from 'react';
import { useApp } from '../../app/state';
import { uuid } from '../../domain/codes';
import { Notice } from '../../ui/ui';

export function ApprovalSetting() {
  const { backend, workspaceId, role, send, toast } = useApp();
  const wh = Object.values(backend.db.warehouses).find((w) => w.workspace_id === workspaceId && w.active);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!wh) return null;
  const manager = role === 'OWNER' || role === 'SUPERVISOR';
  const on = !!wh.adjust_approval;
  const save = async () => {
    setBusy(true);
    setError('');
    const o = await send('set_adjust_approval', { on: !on }, null, { commandId: uuid() });
    setBusy(false);
    if (o.status === 'result' && o.result.ok) toast(on ? 'Quantity changes save right away.' : 'Operators now ask a manager to approve quantity changes.');
    else setError(o.status === 'result' && !o.result.ok ? o.result.message : o.status === 'offline' ? o.message : 'No answer from the server. Reload to check.');
  };
  return (
    <div className="panel stack" data-testid="approval-setting">
      <div className="panel-title">Quantity changes</div>
      <label className="toggle">
        <input type="checkbox" checked={on} disabled={!manager || busy || backend.network === 'offline'} onChange={() => void save()} />
        <span>Managers approve quantity changes</span>
      </label>
      <p className="hint" style={{ margin: 0 }}>
        When on, a change an operator makes (used, damaged, written off, found extra or counted) waits on the pallet until a manager approves it. Managers find them under Needs attention. Changes managers make save right away.
      </p>
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}
