// Workspace activity: every accepted pallet change, newest first, grouped by day.

import { useMemo, useState } from 'react';
import { EVENT_LABEL } from '../../domain/transitions';
import type { EventType, PalletEvent } from '../../domain/types';
import { useApp } from '../../app/state';
import { Icon } from '../../ui/icons';
import { Empty, Explain, PageHead, fmtFull } from '../../ui/ui';

const GROUPS: { id: string; label: string; types: EventType[] }[] = [
  { id: 'all', label: 'Everything', types: [] },
  { id: 'movement', label: 'Receiving and movement', types: ['receive', 'import_receive', 'place', 'move', 'verify_location', 'locate'] },
  { id: 'out', label: 'Leaving and returning', types: ['dispatch', 'return'] },
  { id: 'problems', label: 'Missing and holds', types: ['mark_missing', 'apply_hold', 'clear_hold'] },
  { id: 'fixes', label: 'Corrections and admin', types: ['correct', 'reassign_job', 'edit_details', 'retire', 'archive', 'rotate_label', 'label_applied', 'split', 'split_child'] },
];

export function Activity() {
  const { read, go, backend, v } = useApp();
  const [group, setGroup] = useState('all');
  const [person, setPerson] = useState('');
  const [limit, setLimit] = useState(150);

  const data = useMemo(
    () =>
      read((e, a, ws) => ({
        events: e.activity(a, ws, 5000),
        members: e.context(a, ws).members,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [v, backend.network],
  );
  if (!data) return null;

  const g = GROUPS.find((x) => x.id === group)!;
  const filtered = data.events.filter((ev) => (!g.types.length || g.types.includes(ev.type)) && (!person || ev.actor_id === person));
  const shown = filtered.slice(0, limit);
  const days: { key: string; label: string; events: PalletEvent[] }[] = [];
  for (const ev of shown) {
    const d = new Date(ev.accepted_at);
    const key = d.toDateString();
    let day = days[days.length - 1];
    if (!day || day.key !== key) {
      const today = new Date().toDateString();
      const yesterday = new Date(Date.now() - 86_400_000).toDateString();
      days.push((day = { key, label: key === today ? 'Today' : key === yesterday ? 'Yesterday' : d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }), events: [] }));
    }
    day.events.push(ev);
  }
  const users = backend.db.users;

  return (
    <div className="stack">
      <PageHead title="Activity" sub={`${filtered.length} accepted changes${person ? ` by ${users[person]?.name}` : ''}. Rejected attempts never appear here, because they changed nothing.`} />
      <Explain refs="pages 13, 21">
        <p>Each line is one accepted command, written in the same transaction as the change itself. The log is append-only. A mistake is fixed by a later correction entry, so the original stays visible.</p>
      </Explain>
      <div className="filter-row">
        <select className="select" value={group} onChange={(e) => setGroup(e.target.value)} aria-label="Kind of change">
          {GROUPS.map((x) => (
            <option key={x.id} value={x.id}>
              {x.label}
            </option>
          ))}
        </select>
        <select className="select" value={person} onChange={(e) => setPerson(e.target.value)} aria-label="Person">
          <option value="">Anyone</option>
          {data.members.map((m) => (
            <option key={m.user_id} value={m.user_id}>
              {m.user?.name}
            </option>
          ))}
        </select>
      </div>
      {days.length === 0 && <Empty icon="activity" title="Nothing matches">Try another filter.</Empty>}
      {days.map((d) => (
        <div key={d.key} className="panel flush">
          <div className="panel-title" style={{ padding: '12px 16px 4px' }}>
            {d.label} <span className="grow" />
            <span className="muted" style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>
              {d.events.length} {d.events.length === 1 ? 'change' : 'changes'}
            </span>
          </div>
          <div className="table-wrap" style={{ border: 0, borderRadius: 0 }}>
            <table className="t">
              <tbody>
                {d.events.map((ev) => {
                  const p = backend.db.pallets[ev.pallet_id];
                  const from = ev.before_state?.current_location_code;
                  const to = ev.after_state.current_location_code;
                  return (
                    <tr key={ev.id} className="click" onClick={() => go({ name: 'pallet', id: ev.pallet_id })}>
                      <td style={{ width: 70, whiteSpace: 'nowrap' }} className="muted num" title={fmtFull(ev.accepted_at)}>
                        {new Date(ev.accepted_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <span className="pcode">{p?.code}</span>
                      </td>
                      <td>
                        <strong>{EVENT_LABEL[ev.type]}</strong>
                        {from !== to && (from || to) ? (
                          <span className="muted">
                            {' '}
                            {from ?? 'none'} <span className="arrow">→</span> {to ?? 'none'}
                          </span>
                        ) : null}
                        {ev.reason && <div className="faint" style={{ fontSize: 13 }}>“{ev.reason}”</div>}
                      </td>
                      <td className="muted" style={{ whiteSpace: 'nowrap' }}>
                        {users[ev.actor_id]?.name}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      {filtered.length > limit && (
        <button className="btn" style={{ alignSelf: 'center' }} onClick={() => setLimit((n) => n + 150)}>
          <Icon name="chevronDown" /> Show older changes
        </button>
      )}
    </div>
  );
}
