// Locations: racks and areas, their labels, and what is recorded at each (pages 9, 16, 34 C02).

import { useMemo, useState } from 'react';
import { normalizeCode, rackFields } from '../../domain/codes';
import { roleAllows } from '../../domain/transitions';
import { LOCATION_KINDS, type LocationKind } from '../../domain/types';
import { useApp } from '../../app/state';
import { Icon } from '../../ui/icons';
import { Empty, Explain, Field, Notice, PageHead, Plate, fmtAgo } from '../../ui/ui';
import { ResultRow } from '../find/Find';
import { LabelSheet } from '../labels/LabelSheet';
import { AdminSheet } from './AdminSheet';
import { CapacityFields, CapacitySheet, capacityLine, capacityPayload, draftFrom } from './Capacity';
import { uuid } from '../../domain/codes';

const KIND_LABEL: Record<LocationKind, string> = { RACK: 'Rack', RECEIVING: 'Receiving', QUARANTINE: 'Quarantine', STAGING: 'Staging', FLOOR: 'Floor area' };
const KIND_HELP: Record<LocationKind, string> = {
  RACK: 'A rack position. Codes like A-02-01 are read as zone, aisle, bay (and optional level).',
  RECEIVING: 'Where deliveries land before placement.',
  QUARANTINE: 'For damaged or disputed material on hold.',
  STAGING: 'Where pallets wait before dispatch.',
  FLOOR: 'A marked floor area outside the racks.',
};

export function Locations() {
  const { read, go, role, backend, v } = useApp();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<LocationKind | ''>('');
  const [inactive, setInactive] = useState(false);
  const [creating, setCreating] = useState(false);
  const [printAll, setPrintAll] = useState<string[] | null>(null);
  const data = useMemo(
    () => read((e, a, ws) => ({ ctx: e.context(a, ws), occ: e.occupancy(ws) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [v, backend.network],
  );
  if (!data) return null;
  const nq = normalizeCode(q);
  const list = data.ctx.locations.filter((l) => (inactive || l.active) && (!kind || l.kind === kind) && (!nq || normalizeCode(l.code).includes(nq)));
  const canAdmin = roleAllows(role, 'create_location');

  return (
    <div className="stack">
      <PageHead
        title="Locations"
        sub={`${data.ctx.locations.filter((l) => l.active).length} active in ${data.ctx.warehouse?.code}. Each has its own printed QR label.`}
        actions={
          <>
            <button className="btn" onClick={() => setPrintAll(list.filter((l) => l.active).map((l) => l.id))} disabled={!list.some((l) => l.active)}>
              <Icon name="print" /> Rack labels
            </button>
            {canAdmin && (
              <button className="btn primary" onClick={() => setCreating(true)} disabled={backend.network === 'offline'}>
                <Icon name="plus" /> New location
              </button>
            )}
          </>
        }
      />
      <Explain refs="pages 9, 16">
        <p>Location codes are unique inside a warehouse. A rack label’s QR carries a random token, so it keeps working after a rename, but the printed code and barcode show the old code, so reprint the label. Inactive locations stay in history but cannot receive pallets, and a location with pallets recorded on it cannot be switched off.</p>
      </Explain>
      <div className="filter-row">
        <input className="input" placeholder="Filter by code" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter by code" style={{ maxWidth: 220 }} />
        <select className="select" value={kind} onChange={(e) => setKind(e.target.value as LocationKind | '')} aria-label="Kind">
          <option value="">All kinds</option>
          {LOCATION_KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </select>
        <label className="toggle">
          <input type="checkbox" checked={inactive} onChange={(e) => setInactive(e.target.checked)} />
          <span>Include inactive</span>
        </label>
      </div>
      {list.length === 0 ? (
        <Empty icon="locations" title="No locations match" />
      ) : (
        <div className="table-wrap" data-tour="locations-table">
          <table className="t cards-sm">
            <thead>
              <tr>
                <th>Code</th>
                <th>Kind</th>
                <th className="n">Recorded pallets</th>
                <th>Space</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {list.map((l) => (
                <tr key={l.id} className="click" onClick={() => go({ name: 'location', id: l.id })}>
                  <td>
                    <Plate code={l.code} size="sm" />
                  </td>
                  <td>{KIND_LABEL[l.kind]}</td>
                  <td className="n" data-label="Recorded pallets">
                    {data.occ[l.id] ?? 0}
                  </td>
                  <td data-label="Space" className={l.capacity && (l.load_pallets ?? 0) >= l.capacity.spaces * l.capacity.stacking ? 'bad' : ''}>
                    {capacityLine(l, !!data.ctx.warehouse?.advanced_measurements)}
                  </td>
                  <td>{l.active ? <span className="tag ok">Active</span> : <span className="tag">Inactive</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {creating && <CreateLocation onClose={() => setCreating(false)} />}
      {printAll && <LabelSheet locationIds={printAll} onClose={() => setPrintAll(null)} />}
    </div>
  );
}

function CreateLocation({ onClose }: { onClose: () => void }) {
  const { go, send, backend, workspaceId } = useApp();
  const advanced = !!Object.values(backend.db.warehouses).find((w) => w.workspace_id === workspaceId && w.active)?.advanced_measurements;
  const [cap, setCap] = useState(draftFrom(null));
  const [code, setCode] = useState('');
  const [kind, setKind] = useState<LocationKind>('RACK');
  const n = normalizeCode(code);
  const f = rackFields(n);
  return (
    <AdminSheet
      title="New location"
      kind="create_location"
      verb="Create location"
      done={`Location ${n} created`}
      intro="A new QR label is issued with the location. Print it and fix it to the rack before using it."
      valid={!!n && n.length <= 30}
      payload={() => ({ code, kind })}
      onDone={(id) => {
        if (!id) return;
        const c = capacityPayload(cap, advanced);
        // The capacity is a second step on the new location; the location exists either way.
        if (c.spaces > 0) void send('set_location_capacity', { location_id: id, ...c }, null, { commandId: uuid() });
        go({ name: 'location', id });
      }}
      onClose={onClose}
    >
      <Field label="Code" htmlFor="loc-code" hint={n ? (f.zone ? `Saved as ${n} · zone ${f.zone}, aisle ${f.aisle}, bay ${f.bay}${f.level ? `, level ${f.level}` : ''}` : `Saved as ${n}`) : 'For example A-04-01 or STAGING-02'} count={n.length} max={30}>
        <input id="loc-code" className="input code" value={code} onChange={(e) => setCode(e.target.value)} autoCapitalize="characters" />
      </Field>
      <Field label="Kind" htmlFor="loc-kind" hint={KIND_HELP[kind]}>
        <select id="loc-kind" className="select" value={kind} onChange={(e) => setKind(e.target.value as LocationKind)}>
          {LOCATION_KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </select>
      </Field>
      <CapacityFields draft={cap} onChange={setCap} advanced={advanced} />
    </AdminSheet>
  );
}

export function LocationDetail() {
  const { read, go, route, role, backend, v } = useApp();
  const [sheet, setSheet] = useState<'rename' | 'toggle' | 'capacity' | null>(null);
  const [printing, setPrinting] = useState(false);
  const [newCode, setNewCode] = useState('');
  const data = useMemo(
    () =>
      read((e, _a, ws) => {
        const loc = e.db.locations[route.id ?? ''];
        if (!loc || loc.workspace_id !== ws) return null;
        const pallets = Object.values(e.db.pallets)
          .filter((p) => p.current_location_id === loc.id)
          .sort((a, b) => a.code.localeCompare(b.code));
        const lastSeen = Object.values(e.db.pallets).filter((p) => p.state !== 'STORED' && p.last_confirmed_location_id === loc.id && p.state !== 'RETIRED');
        const audit = e.db.audit.filter((x) => x.target_id === loc.id).reverse();
        return { loc, pallets, lastSeen, audit, wh: e.activeWarehouse(ws) };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [v, backend.network, route.id],
  );
  if (!data) return <Empty icon="locations" title="Location not found" />;
  const { loc } = data;
  const canAdmin = roleAllows(role, 'rename_location');
  const offline = backend.network === 'offline';
  const users = backend.db.users;

  return (
    <div className="stack">
      <PageHead
        eyebrow={`${data.wh?.code} · ${KIND_LABEL[loc.kind]}`}
        title={<Plate code={loc.code} kind={KIND_LABEL[loc.kind]} size="lg" />}
        sub={`${data.pallets.length} ${data.pallets.length === 1 ? 'pallet' : 'pallets'} recorded here${loc.active ? '' : ' · inactive'}.`}
        actions={
          <>
            <button className="btn" onClick={() => setPrinting(true)}>
              <Icon name="print" /> Print rack label
            </button>
            <button className="btn" onClick={() => go({ name: 'map', id: loc.id })}>
              <Icon name="map" /> On the map
            </button>
          </>
        }
      />
      {!loc.active && <Notice tone="warn">This location is inactive. Pallets cannot be placed, moved or found here until a supervisor reactivates it.</Notice>}
      <div className="panel row" style={{ justifyContent: 'space-between' }} data-testid="location-capacity">
        <div>
          <div className="panel-title" style={{ margin: 0 }}>
            Space
          </div>
          <div>{capacityLine(loc, !!data.wh?.advanced_measurements)}</div>
          {loc.capacity && (
            <div className="muted" style={{ fontSize: 13.5 }}>
              {loc.capacity.spaces} space{loc.capacity.spaces === 1 ? '' : 's'} × {loc.capacity.stacking} high
              {data.wh?.advanced_measurements && loc.capacity.max_weight_lb ? ` · ${loc.capacity.max_weight_lb.toLocaleString('en-US')} lb limit` : ''}
              {data.wh?.advanced_measurements && loc.capacity.length_in ? ` · ${loc.capacity.length_in} × ${loc.capacity.width_in} × ${loc.capacity.height_in} in spaces` : ''}
            </div>
          )}
        </div>
        {canAdmin && (
          <button className="btn" onClick={() => setSheet('capacity')} disabled={offline}>
            <Icon name="edit" /> {loc.capacity ? 'Change capacity' : 'Set capacity'}
          </button>
        )}
      </div>
      <div className="panel stack">
        <div className="panel-title">Recorded here</div>
        {data.pallets.length === 0 ? (
          <p className="muted">No pallets are recorded here. That does not prove the space is empty; verify during a walk.</p>
        ) : (
          <div className="results">
            {data.pallets.map((p) => (
              <ResultRow key={p.id} row={{ pallet: p, job: backend.db.jobs[p.job_id], location: loc, lastLocation: loc }} onOpen={() => go({ name: 'pallet', id: p.id })} />
            ))}
          </div>
        )}
      </div>
      {data.lastSeen.length > 0 && (
        <div className="panel stack">
          <div className="panel-title">Last confirmed here, now elsewhere or missing</div>
          <div className="results">
            {data.lastSeen.map((p) => (
              <ResultRow key={p.id} row={{ pallet: p, job: backend.db.jobs[p.job_id], location: null, lastLocation: loc }} onOpen={() => go({ name: 'pallet', id: p.id })} />
            ))}
          </div>
        </div>
      )}
      {canAdmin && (
        <div className="panel stack">
          <div className="panel-title">Manage</div>
          <div className="row">
            <button className="btn" onClick={() => (setNewCode(loc.code), setSheet('rename'))} disabled={offline}>
              <Icon name="edit" /> Rename
            </button>
            <button className="btn" onClick={() => setSheet('toggle')} disabled={offline}>
              <Icon name={loc.active ? 'lock' : 'unlock'} /> {loc.active ? 'Deactivate' : 'Reactivate'}
            </button>
          </div>
          {data.audit.length > 0 && (
            <div className="stack" style={{ gap: 4 }}>
              {data.audit.map((a) => (
                <div key={a.id} className="muted" style={{ fontSize: 13.5 }}>
                  {fmtAgo(a.accepted_at)} · {users[a.actor_id]?.name}: {auditLine(a.before, a.after)}
                  {a.reason ? ` · “${a.reason}”` : ''}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {sheet === 'rename' && (
        <AdminSheet
          title={`Rename ${loc.code}`}
          kind="rename_location"
          verb="Rename"
          done={`Renamed to ${normalizeCode(newCode)}. Reprint its label so the printed code matches.`}
          reason="optional"
          expectedVersion={loc.version}
          intro="The QR on the old label keeps working because it carries a token. Its printed code and barcode still show the old code, so reprint the label right away."
          valid={!!normalizeCode(newCode) && normalizeCode(newCode) !== loc.code}
          payload={() => ({ location_id: loc.id, code: newCode })}
          onClose={() => setSheet(null)}
        >
          <Field label="New code" htmlFor="loc-new">
            <input id="loc-new" className="input code" value={newCode} onChange={(e) => setNewCode(e.target.value)} />
          </Field>
        </AdminSheet>
      )}
      {sheet === 'toggle' && (
        <AdminSheet
          title={`${loc.active ? 'Deactivate' : 'Reactivate'} ${loc.code}`}
          kind={loc.active ? 'deactivate_location' : 'reactivate_location'}
          verb={loc.active ? 'Deactivate' : 'Reactivate'}
          done={loc.active ? `${loc.code} deactivated` : `${loc.code} reactivated`}
          danger={loc.active}
          reason="optional"
          expectedVersion={loc.version}
          intro={loc.active ? (data.pallets.length ? `${data.pallets.length} pallets are recorded here. The server will refuse until they are moved.` : 'Scans of this rack label will be refused for moves while it is inactive.') : 'The location becomes usable again with its existing label.'}
          payload={() => ({ location_id: loc.id })}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === 'capacity' && <CapacitySheet loc={loc} onClose={() => setSheet(null)} />}
      {printing && <LabelSheet locationIds={[loc.id]} onClose={() => setPrinting(false)} />}
    </div>
  );
}

function auditLine(before: Record<string, unknown> | null, after: Record<string, unknown> | null): string {
  if (!before && after) return `created as ${String(after.code ?? '')} (${String(after.kind ?? '')})`;
  if (before && after && 'code' in after) return `renamed ${String(before.code)} → ${String(after.code)}`;
  if (after && 'active' in after) return after.active ? 'reactivated' : 'deactivated';
  if (after && 'capacity' in after) {
    const c = after.capacity as { spaces: number; stacking: number } | null;
    return c ? `capacity set to ${c.spaces * c.stacking} pallets` : 'capacity limit removed';
  }
  return 'changed';
}
