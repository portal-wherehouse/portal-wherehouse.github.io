// Build a whole rack, shelf unit or row of floor spots at once: zone × aisles × bays × levels, with a code
// preview, optional capacity for every spot, and one tap to print every new label.

import { useMemo, useState } from 'react';
import { useApp } from '../../app/state';
import { hashString, normalizeCode, uuid } from '../../domain/codes';
import { LOCATION_KINDS, type LocationKind } from '../../domain/types';
import { Icon } from '../../ui/icons';
import { Field, Notice, Sheet, Spinner } from '../../ui/ui';
import { LabelSheet } from '../labels/LabelSheet';
import { CapacityFields, capacityPayload, draftFrom } from './Capacity';

const KIND_NAME: Record<LocationKind, string> = { RACK: 'Rack or shelving', FLOOR: 'Floor area or yard', RECEIVING: 'Receiving area', STAGING: 'Staging area', QUARANTINE: 'Quarantine area' };
export const MAX_BUILD = 600;
// The live server takes up to 80 import rows per request.
const BATCH = 80;

const int = (s: string, min: number, max: number) => {
  const n = Math.floor(Number(s));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
};
const pad = (n: number, width: number) => String(n).padStart(width, '0');

/** Codes like A-01-03-2: zone, aisle, bay, then level when there is more than one. */
export function buildCodes(zone: string, aisleFrom: number, aisleTo: number, bays: number, levels: number): string[] {
  const z = normalizeCode(zone).replace(/[^A-Z]/g, '');
  if (!z) return [];
  const out: string[] = [];
  for (let a = aisleFrom; a <= aisleTo; a++)
    for (let b = 1; b <= bays; b++)
      for (let l = 1; l <= levels; l++) {
        out.push(`${z}-${pad(a, 2)}-${pad(b, 2)}${levels > 1 ? `-${levels > 9 ? pad(l, 2) : l}` : ''}`);
        if (out.length > MAX_BUILD) return out;
      }
  return out;
}

export function RackBuilder({ onClose }: { onClose: () => void }) {
  const { send, backend, workspaceId } = useApp();
  const wh = Object.values(backend.db.warehouses).find((w) => w.workspace_id === workspaceId && w.active);
  const advanced = !!wh?.advanced_measurements;
  const [kind, setKind] = useState<LocationKind>('RACK');
  const [zone, setZone] = useState('A');
  const [aisleFrom, setAisleFrom] = useState('1');
  const [aisleTo, setAisleTo] = useState('1');
  const [bays, setBays] = useState('10');
  const [levels, setLevels] = useState('3');
  const [cap, setCap] = useState(draftFrom(null));
  const [phase, setPhase] = useState<'edit' | 'running' | 'done'>('edit');
  const [progress, setProgress] = useState({ done: 0, of: 0, what: '' });
  const [error, setError] = useState('');
  const [made, setMade] = useState<string[]>([]);
  // Counted when the build starts; afterwards every code "already exists".
  const [counts, setCounts] = useState({ fresh: 0, total: 0 });
  const [printing, setPrinting] = useState(false);

  const af = int(aisleFrom, 1, 99), at = Math.max(af, int(aisleTo, 1, 99));
  const codes = useMemo(() => buildCodes(zone, af, at, int(bays, 1, 99), int(levels, 1, 20)), [zone, af, at, bays, levels]);
  const existing = useMemo(() => new Set(Object.values(backend.db.locations).filter((l) => l.warehouse_id === wh?.id).map((l) => normalizeCode(l.code))), [backend.db.locations, wh?.id]);
  const fresh = codes.filter((c) => !existing.has(c));
  const tooMany = codes.length > MAX_BUILD;
  const capP = capacityPayload(cap, advanced);

  const run = async () => {
    if (!wh) return;
    setPhase('running');
    setError('');
    setCounts({ fresh: fresh.length, total: codes.length });
    const fail = (o: Awaited<ReturnType<typeof send>>) => setError(o.status === 'result' && !o.result.ok ? o.result.message : o.status === 'offline' ? o.message : 'No answer from the server. Check Locations before trying again.');
    for (let i = 0; i < fresh.length; i += BATCH) {
      setProgress({ done: i, of: fresh.length, what: 'Creating spots' });
      const rows = fresh.slice(i, i + BATCH).map((c) => ({ warehouse_code: wh.code, location_code: c, kind }));
      const o = await send('import_batch', { import_kind: 'locations', checksum: hashString(JSON.stringify(rows)), rows, name: `Built ${rows[0].location_code} to ${rows[rows.length - 1].location_code}` }, null, { commandId: uuid() });
      if (!(o.status === 'result' && o.result.ok)) return fail(o), setPhase('edit');
    }
    const byCode = new Map(Object.values(backend.db.locations).filter((l) => l.warehouse_id === wh.id).map((l) => [normalizeCode(l.code), l]));
    const ids = codes.map((c) => byCode.get(c)?.id).filter((x): x is string => !!x);
    if (capP.spaces > 0) {
      const newIds = fresh.map((c) => byCode.get(c)?.id).filter((x): x is string => !!x);
      for (let i = 0; i < newIds.length; i++) {
        setProgress({ done: i, of: newIds.length, what: 'Setting capacity' });
        const o = await send('set_location_capacity', { location_id: newIds[i], ...capP }, null, { commandId: uuid() });
        if (!(o.status === 'result' && o.result.ok)) {
          fail(o);
          break;
        }
      }
    }
    setMade(ids);
    setPhase('done');
  };

  if (printing) return <LabelSheet locationIds={made} onClose={onClose} />;
  return (
    <Sheet title="Build a rack or row of spots" onClose={phase === 'running' ? () => undefined : onClose} wide>
      {phase === 'done' ? (
        <div className="stack" data-testid="builder-done">
          <Notice tone={error ? 'error' : 'ok'} title={`${counts.fresh} new spot${counts.fresh === 1 ? '' : 's'} created`}>
            {error || (counts.total > counts.fresh ? `${counts.total - counts.fresh} already existed and were left as they were.` : 'Every spot has its own QR label, ready to print.')}
          </Notice>
          <div className="row">
            <button className="btn primary big" onClick={() => setPrinting(true)} disabled={!made.length}>
              <Icon name="print" /> Print all {made.length} labels
            </button>
            <button className="btn big" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      ) : (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (fresh.length && !tooMany) void run();
          }}
        >
          <fieldset className="stack" disabled={phase === 'running'} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
            <div className="grid-2">
              <Field label="What is it?" htmlFor="rb-kind">
                <select id="rb-kind" className="select" value={kind} onChange={(e) => setKind(e.target.value as LocationKind)}>
                  {LOCATION_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {KIND_NAME[k]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Zone letter" htmlFor="rb-zone" hint="A room, building or area, like A or YARD.">
                <input id="rb-zone" className="input mono" value={zone} maxLength={6} onChange={(e) => setZone(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))} />
              </Field>
            </div>
            <div className="builder-grid">
              <Field label="Aisles from" htmlFor="rb-af">
                <input id="rb-af" className="input" inputMode="numeric" value={aisleFrom} onChange={(e) => setAisleFrom(e.target.value)} />
              </Field>
              <Field label="to" htmlFor="rb-at">
                <input id="rb-at" className="input" inputMode="numeric" value={aisleTo} onChange={(e) => setAisleTo(e.target.value)} />
              </Field>
              <Field label="Bays or sections each" htmlFor="rb-bays">
                <input id="rb-bays" className="input" inputMode="numeric" value={bays} onChange={(e) => setBays(e.target.value)} />
              </Field>
              <Field label="Levels or shelves each" htmlFor="rb-levels">
                <input id="rb-levels" className="input" inputMode="numeric" value={levels} onChange={(e) => setLevels(e.target.value)} />
              </Field>
            </div>
            <div className="panel stack" style={{ gap: 6 }} data-testid="builder-preview">
              <div className="eyebrow">Preview</div>
              {codes.length ? (
                <p className="mono" style={{ margin: 0 }}>
                  {codes.slice(0, 6).join('  ')}
                  {codes.length > 7 ? '  …  ' : '  '}
                  {codes.length > 6 ? codes[codes.length - 1] : ''}
                </p>
              ) : (
                <p className="muted" style={{ margin: 0 }}>Enter a zone letter.</p>
              )}
              <p style={{ margin: 0 }}>
                <strong>{tooMany ? `More than ${MAX_BUILD}` : fresh.length}</strong> new spot{fresh.length === 1 ? '' : 's'}
                {codes.length > fresh.length && !tooMany ? `, ${codes.length - fresh.length} already exist and are skipped` : ''}.
              </p>
              {tooMany && <p className="hint bad" style={{ margin: 0 }}>Build up to {MAX_BUILD} at a time. Split it by aisle.</p>}
            </div>
            <details>
              <summary>Capacity for every new spot (optional)</summary>
              <div style={{ marginTop: 10 }}>
                <CapacityFields draft={cap} onChange={setCap} advanced={advanced} />
              </div>
            </details>
          </fieldset>
          {error && <Notice tone="error">{error}</Notice>}
          {phase === 'running' && (
            <div className="stack" style={{ gap: 4 }}>
              <progress className="bulk-progress" max={Math.max(1, progress.of)} value={progress.done} />
              <p className="muted" style={{ margin: 0 }}>
                {progress.what}… {progress.done} of {progress.of}
              </p>
            </div>
          )}
          <div className="row">
            <button className="btn primary big" disabled={!fresh.length || tooMany || phase === 'running' || backend.network === 'offline'}>
              {phase === 'running' ? <Spinner /> : <Icon name="plus" />} Create {fresh.length} spot{fresh.length === 1 ? '' : 's'}
            </button>
            <button type="button" className="btn big" onClick={onClose} disabled={phase === 'running'}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </Sheet>
  );
}
