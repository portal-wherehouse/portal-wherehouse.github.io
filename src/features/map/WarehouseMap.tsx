import { FirebaseBackend } from '../../data/firebase';
// Warehouse map: every location laid out by zone and aisle from its code, with a box per recorded pallet.
// Recorded state only: the map never claims free space or capacity (page 32, non-goals).

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { Location, Pallet } from '../../domain/types';
import { useApp } from '../../app/state';
import { Icon } from '../../ui/icons';
import { Empty, Explain, PageHead, Plate, Sheet } from '../../ui/ui';
import { ResultRow } from '../find/Find';

/** Wide enough for the selected location to sit beside the zones; narrower screens show it in a sheet. */
const SIDE_BY_SIDE = '(min-width: 1100px)';

function useSideBySide(): boolean {
  return useSyncExternalStore(
    (fn) => {
      const mq = window.matchMedia(SIDE_BY_SIDE);
      mq.addEventListener('change', fn);
      return () => mq.removeEventListener('change', fn);
    },
    () => window.matchMedia(SIDE_BY_SIDE).matches,
  );
}

interface Zone {
  zone: string;
  aisles: { aisle: string; bays: Location[] }[];
}

export function WarehouseMap() {
  const { read, go, route, backend, v } = useApp();
  const [selected, setSelected] = useState<string | null>(route.id ?? null);
  const [showInactive, setShowInactive] = useState(false);
  useEffect(()=>{if(selected && backend instanceof FirebaseBackend)void backend.loadRack(selected);},[backend,selected]);
  const sideBySide = useSideBySide();

  const data = useMemo(
    () =>
      read((e, a, ws) => {
        const ctx = e.context(a, ws);
        const byLoc: Record<string, Pallet[]> = {};
        for (const p of Object.values(e.db.pallets)) {
          if (p.workspace_id === ws && p.current_location_id) (byLoc[p.current_location_id] ??= []).push(p);
        }
        return { ctx, byLoc, locations: ctx.locations.filter((l) => l.warehouse_id === ctx.warehouse?.id) };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [v, backend.network],
  );
  if (!data) return null;

  const visible = data.locations.filter((l) => showInactive || l.active);
  const racks = visible.filter((l) => l.zone && l.aisle);
  const areas = visible.filter((l) => !(l.zone && l.aisle));
  const zones: Zone[] = [];
  for (const l of racks) {
    let z = zones.find((x) => x.zone === l.zone);
    if (!z) zones.push((z = { zone: l.zone!, aisles: [] }));
    let a = z.aisles.find((x) => x.aisle === l.aisle);
    if (!a) z.aisles.push((a = { aisle: l.aisle!, bays: [] }));
    a.bays.push(l);
  }
  zones.sort((a, b) => a.zone.localeCompare(b.zone));
  for (const z of zones) z.aisles.sort((a, b) => a.aisle.localeCompare(b.aisle));

  const sel = selected ? data.locations.find((l) => l.id === selected) ?? null : null;
  const selPallets = sel ? (data.byLoc[sel.id] ?? []).slice().sort((a, b) => a.code.localeCompare(b.code)) : [];
  const recorded = backend.mode==='firebase'?data.locations.reduce((n,l)=>n+((l as any).pallet_count||0),0):Object.values(data.byLoc).reduce((n, list) => n + list.length, 0);
  const empty = data.locations.filter((l) => l.active && !(backend.mode==='firebase'?(l as any).pallet_count:data.byLoc[l.id]?.length)).length;

  const bay = (l: Location) => {
    const list = data.byLoc[l.id] ?? [];
    const count=backend.mode==='firebase'?(l as any).pallet_count||0:list.length;
    const held = backend.mode==='firebase'?(l as any).hold_count||0:list.filter((p) => p.hold).length;
    return (
      <button
        key={l.id}
        // Long area codes (RECEIVING-01) take two tiles' width, so every code stays on one line.
        className={`bay ${l.active ? '' : 'inactive'} ${l.code.length > 8 ? 'wide' : ''}`}
        aria-pressed={selected === l.id}
        onClick={() => setSelected(selected === l.id ? null : l.id)}
        aria-label={`${l.code}: ${count} pallets recorded${held ? `, ${held} on hold` : ''}${l.active ? '' : ', inactive'}`}
      >
        <span className="bay-code">{l.code}</span>
        <span className="boxes" aria-hidden>
          {list.slice(0, 12).map((p) => (
            <span key={p.id} className={`box ${p.hold ? 'held' : ''}`} title={`${p.code}${p.hold ? ' (on hold)' : ''}`} />
          ))}
          {list.length > 12 && <span className="faint" style={{ fontSize: 11 }}>+{list.length - 12}</span>}
        </span>
        <span className="bay-count">
          {count === 0 ? 'Nothing recorded' : `${count} recorded`}
          {held > 0 && ` · ${held} held`}
          {!l.active && ' · inactive'}
        </span>
      </button>
    );
  };

  // What is recorded at the selected location: beside the zones on wide screens, in a sheet otherwise.
  const detail = sel && (
    <>
      <div className="muted">
        {selPallets.length === 0 ? 'No pallets loaded here.' : `${backend.mode==='firebase'?'Showing ':''}${selPallets.length} ${selPallets.length === 1 ? 'pallet is' : 'pallets are'} recorded here.`}
        {!sel.active && ' This location is inactive, so nothing can be placed or moved here.'}
      </div>
      <div className="results">
        {selPallets.map((p) => (
          <ResultRow key={p.id} compact row={{ pallet: p, job: backend.db.jobs[p.job_id], location: sel, lastLocation: sel }} onOpen={() => go({ name: 'pallet', id: p.id })} />
        ))}
      </div>
      <div className="row">
        <button className="btn" onClick={() => go({ name: 'location', id: sel.id })}>
          <Icon name="pin" /> Location details
        </button>
        <button className="btn" onClick={() => go({ name: 'find', q: sel.code })}>
          <Icon name="find" /> Search this code
        </button>
      </div>
    </>
  );

  return (
    <div className="stack">
      <PageHead
        eyebrow={`${data.ctx.warehouse?.code} · ${data.ctx.warehouse?.name}`}
        title="Stock"
        sub={`Warehouse map: ${recorded} pallets recorded across ${data.locations.filter((l) => l.active).length} active spots. ${empty} have nothing recorded.`}
        actions={
          <label className="toggle">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            <span>Show inactive</span>
          </label>
        }
      />
      <Explain refs="pages 6, 15, 32">
        <p>The map is drawn from location codes. A code like A-02-01 is read as zone A, aisle 02, bay 01. Each small box is one pallet recorded at that spot, and a striped box is a pallet on hold.</p>
        <p>“Nothing recorded” means no pallet is recorded there. It does not mean the space is free, because the app has no dimensions or load limits. Tap a bay to see what is recorded there.</p>
      </Explain>

      <div className={`map-layout ${sel && sideBySide ? 'has-side' : ''}`}>
        <div className="panel stack" data-tour="map-zones">
          {zones.length === 0 && areas.length === 0 && <Empty icon="map" title="No locations yet">A supervisor adds locations under Locations.</Empty>}
          {zones.map((z) => (
            <div key={z.zone} className="map-zone">
              <div className="panel-title">Zone {z.zone}</div>
              {z.aisles.map((a) => (
                <div key={a.aisle} className="map-aisle">
                  <div className="map-aisle-label">
                    {z.zone}-{a.aisle}
                  </div>
                  <div className="map-bays">{a.bays.map(bay)}</div>
                </div>
              ))}
            </div>
          ))}
          {areas.length > 0 && (
            <div className="map-zone">
              <div className="panel-title">Receiving, staging and other areas</div>
              <div className="map-bays">{areas.map(bay)}</div>
            </div>
          )}
          <div className="legend" style={{ marginTop: 4 }}>
            <span>
              <i style={{ background: '#b98d57', border: '1px solid #7a5a33' }} /> One recorded pallet
            </span>
            <span>
              <i style={{ background: 'repeating-linear-gradient(-45deg, var(--hazard) 0 3px, #14171a 3px 6px)' }} /> On hold
            </span>
            <span>
              <i style={{ border: '1px dashed var(--ink-3)' }} /> Inactive location
            </span>
          </div>
        </div>

        {sel && sideBySide && (
          <div className="panel stack map-side">
            <div className="row">
              <Plate code={sel.code} kind={sel.kind} />
              <span className="grow" />
              <button className="icon-btn" onClick={() => setSelected(null)} aria-label="Close">
                <Icon name="x" />
              </button>
            </div>
            {detail}
          </div>
        )}
      </div>
      {sel && !sideBySide && (
        <Sheet title={<Plate code={sel.code} kind={sel.kind} />} onClose={() => setSelected(null)}>
          <div className="stack">{detail}</div>
        </Sheet>
      )}
    </div>
  );
}
