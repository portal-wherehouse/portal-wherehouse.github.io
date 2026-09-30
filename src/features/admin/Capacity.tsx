// Location capacity: pallet spaces and stacking for everyone; weight and size limits with advanced tracking.

import { useState } from 'react';
import { useApp } from '../../app/state';
import { STANDARD_PALLET, fmtLb, palletsLeft, totalPallets, weightLeft } from '../../domain/capacity';
import { uuid } from '../../domain/codes';
import type { Location, LocationCapacity } from '../../domain/types';
import { Icon } from '../../ui/icons';
import { Field, Notice, Sheet, Spinner } from '../../ui/ui';

export interface CapacityDraft {
  spaces: string;
  stacking: string;
  custom: string;
  weight: string;
  length: string;
  width: string;
  height: string;
}

export const draftFrom = (c: LocationCapacity | null | undefined): CapacityDraft => ({
  spaces: c ? String(c.spaces) : '',
  stacking: c ? (c.stacking <= 3 ? String(c.stacking) : 'custom') : '1',
  custom: c && c.stacking > 3 ? String(c.stacking) : '4',
  weight: c?.max_weight_lb ? String(c.max_weight_lb) : '',
  length: c?.length_in ? String(c.length_in) : '',
  width: c?.width_in ? String(c.width_in) : '',
  height: c?.height_in ? String(c.height_in) : '',
});

const n = (s: string) => {
  const v = Number(s.replace(/,/g, '').trim());
  return Number.isFinite(v) && v > 0 ? v : null;
};

export function capacityPayload(d: CapacityDraft, advanced: boolean) {
  const stacking = d.stacking === 'custom' ? Math.max(1, Math.min(20, Math.round(n(d.custom) ?? 1))) : Number(d.stacking);
  return {
    spaces: Math.max(0, Math.min(10000, Math.round(n(d.spaces) ?? 0))),
    stacking,
    max_weight_lb: advanced ? n(d.weight) : null,
    length_in: advanced ? n(d.length) : null,
    width_in: advanced ? n(d.width) : null,
    height_in: advanced ? n(d.height) : null,
  };
}

export function CapacityFields({ draft, onChange, advanced }: { draft: CapacityDraft; onChange: (d: CapacityDraft) => void; advanced: boolean }) {
  const set = (k: keyof CapacityDraft, v: string) => onChange({ ...draft, [k]: v });
  const p = capacityPayload(draft, advanced);
  return (
    <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <legend className="panel-title" style={{ marginBottom: 6 }}>
        Capacity
      </legend>
      <div className="grid-2">
        <Field label="Standard pallet spaces" htmlFor="cap-spaces" hint={`Floor positions for a standard ${STANDARD_PALLET.length_in} × ${STANDARD_PALLET.width_in} in pallet. Leave empty for no limit.`}>
          <input id="cap-spaces" className="input" inputMode="numeric" value={draft.spaces} onChange={(e) => set('spaces', e.target.value)} placeholder="e.g. 4" />
        </Field>
        <Field label="Stacking" htmlFor="cap-stacking" hint="How many pallets high on each space.">
          <select id="cap-stacking" className="select" value={draft.stacking} onChange={(e) => set('stacking', e.target.value)}>
            <option value="1">No stacking</option>
            <option value="2">Double stacking</option>
            <option value="3">Triple stacking</option>
            <option value="custom">Custom</option>
          </select>
        </Field>
      </div>
      {draft.stacking === 'custom' && (
        <Field label="Pallets high" htmlFor="cap-custom">
          <input id="cap-custom" className="input" inputMode="numeric" value={draft.custom} onChange={(e) => set('custom', e.target.value)} style={{ maxWidth: 120 }} />
        </Field>
      )}
      {p.spaces > 0 && (
        <p className="muted" style={{ margin: 0 }}>
          Holds <strong>{p.spaces * p.stacking}</strong> pallet{p.spaces * p.stacking === 1 ? '' : 's'}.
        </p>
      )}
      {advanced && p.spaces > 0 && (
        <>
          <Field label="Weight limit (lb, optional)" htmlFor="cap-weight">
            <input id="cap-weight" className="input" inputMode="decimal" value={draft.weight} onChange={(e) => set('weight', e.target.value)} placeholder="e.g. 5000" style={{ maxWidth: 200 }} />
          </Field>
          {n(draft.weight) !== null && (
            <Notice tone="warn" title="Every pallet moved here needs a weight">
              With a weight limit, a pallet has to have its weight recorded before it can go here, so the countdown stays right. Pallets without one are turned away with a button to add their weight, or you can pick another spot.
            </Notice>
          )}
          <div className="field">
            <span className="label">Size of one space, one level high (inches, optional)</span>
            <div className="row nowrap">
              <input aria-label="Space length (in)" className="input" inputMode="decimal" value={draft.length} onChange={(e) => set('length', e.target.value)} placeholder="L 48" />
              <input aria-label="Space width (in)" className="input" inputMode="decimal" value={draft.width} onChange={(e) => set('width', e.target.value)} placeholder="W 40" />
              <input aria-label="Space height (in)" className="input" inputMode="decimal" value={draft.height} onChange={(e) => set('height', e.target.value)} placeholder="H 60" />
            </div>
            <span className="hint">With a size set, each pallet needs its length, width and height, and only pallets that fit are placed here.</span>
          </div>
        </>
      )}
    </fieldset>
  );
}

/** One line: "3 of 8 pallets left · 1,200 lb left". */
export function capacityLine(loc: Location, advanced: boolean): string {
  const total = totalPallets(loc);
  if (total === null) return 'No limit set';
  const left = palletsLeft(loc)!;
  const w = weightLeft(loc, advanced);
  return `${left} of ${total} pallet${total === 1 ? '' : 's'} left${w !== null ? ` · ${fmtLb(w)} left` : ''}`;
}

export function CapacitySheet({ loc, onClose }: { loc: Location; onClose: () => void }) {
  const { send, backend } = useApp();
  const advanced = !!Object.values(backend.db.warehouses).find((w) => w.id === loc.warehouse_id)?.advanced_measurements;
  const [draft, setDraft] = useState(draftFrom(loc.capacity));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const save = async () => {
    setBusy(true);
    setMsg(null);
    const o = await send('set_location_capacity', { location_id: loc.id, ...capacityPayload(draft, advanced) }, null, { commandId: uuid() });
    setBusy(false);
    if (o.status === 'result' && o.result.ok) setMsg({ tone: 'ok', text: 'Capacity saved. It counted what is recorded here now.' });
    else setMsg({ tone: 'error', text: o.status === 'result' && !o.result.ok ? o.result.message : o.status === 'offline' ? o.message : 'No answer from the server. Reopen to check.' });
  };
  return (
    <Sheet title={`Capacity of ${loc.code}`} onClose={onClose}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <CapacityFields draft={draft} onChange={setDraft} advanced={advanced} />
        {!advanced && <p className="hint" style={{ margin: 0 }}>Weight and size limits appear when a supervisor turns on weight and size tracking in Warehouse settings (the gear next to your warehouse name).</p>}
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
        <div className="row">
          <button className="btn primary" disabled={busy}>
            {busy ? <Spinner /> : <Icon name="check" />} Save capacity
          </button>
          <button type="button" className="btn" onClick={onClose}>
            {msg?.tone === 'ok' ? 'Done' : 'Cancel'}
          </button>
        </div>
      </form>
    </Sheet>
  );
}
