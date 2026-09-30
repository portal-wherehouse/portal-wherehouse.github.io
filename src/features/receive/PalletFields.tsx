import { blankInfo, type PalletInfo } from "../../domain/receiving";
import { Field } from "../../ui/ui";

export function PalletFields({
  value,
  onChange,
  disabled = false,
}: {
  value: PalletInfo;
  onChange: (v: PalletInfo) => void;
  disabled?: boolean;
}) {
  const update = (key: keyof PalletInfo, v: string) =>
    onChange({ ...value, [key]: v });
  return (
    <fieldset
      className="stack"
      disabled={disabled}
      style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
    >
      <legend>This pallet’s details</legend>
      <p className="hint">
        These values belong to this pallet. Future deliveries can have different
        quantities, sizes or destinations.
      </p>
      <ContentsEditor value={value} onChange={onChange} />
      <div className="grid-2">
        <Field label="Quantity (optional)" htmlFor="pallet-quantity">
          <input
            id="pallet-quantity"
            className="input"
            value={value.quantity}
            maxLength={40}
            onChange={(e) => update("quantity", e.target.value)}
            placeholder="48"
          />
        </Field>
        <Field label="Unit (optional)" htmlFor="pallet-unit">
          <input
            id="pallet-unit"
            className="input"
            value={value.unit}
            maxLength={40}
            onChange={(e) => update("unit", e.target.value)}
            placeholder="logs, boxes, kg…"
          />
        </Field>
      </div>
      <Field
        label="Destination / going to (optional)"
        htmlFor="pallet-destination"
      >
        <input
          id="pallet-destination"
          className="input"
          value={value.destination}
          maxLength={300}
          onChange={(e) => update("destination", e.target.value)}
          placeholder="Distribution center, customer or next stop"
        />
      </Field>
      <div className="field">
        <span className="label">Weight and size (optional)</span>
        <div className="row nowrap">
          <input
            aria-label="Weight (lb)"
            className="input"
            inputMode="decimal"
            maxLength={12}
            value={value.weight_lb ?? ""}
            onChange={(e) => update("weight_lb", e.target.value)}
            placeholder="lb"
          />
          <input
            aria-label="Length (in)"
            className="input"
            inputMode="decimal"
            maxLength={8}
            value={value.length_in ?? ""}
            onChange={(e) => update("length_in", e.target.value)}
            placeholder="L in"
          />
          <input
            aria-label="Width (in)"
            className="input"
            inputMode="decimal"
            maxLength={8}
            value={value.width_in ?? ""}
            onChange={(e) => update("width_in", e.target.value)}
            placeholder="W in"
          />
          <input
            aria-label="Height (in)"
            className="input"
            inputMode="decimal"
            maxLength={8}
            value={value.height_in ?? ""}
            onChange={(e) => update("height_in", e.target.value)}
            placeholder="H in"
          />
        </div>
        <span className="hint">
          Needed only for locations with a weight or size limit. An estimate is fine.
        </span>
      </div>
      <Field
        label="Remind me if still here on (optional)"
        htmlFor="pallet-reminder"
        hint="Appears on the dashboard on this date in the warehouse’s timezone, until dispatched, retired, or cleared. Missing pallets stay flagged. No email or push is sent."
      >
        <input
          id="pallet-reminder"
          className="input"
          type="date"
          min="2000-01-01"
          max="2199-12-31"
          value={value.remind_on}
          onChange={(e) => update("remind_on", e.target.value)}
        />
      </Field>
      {value.fields.map((f, i) => (
        <div className="grid-2" key={i}>
          <Field label={`Detail ${i + 1} name`} htmlFor={`detail-name-${i}`}>
            <input
              id={`detail-name-${i}`}
              className="input"
              maxLength={60}
              value={f.name}
              placeholder="Grade, length, color…"
              onChange={(e) =>
                onChange({
                  ...value,
                  fields: value.fields.map((x, n) =>
                    n === i ? { ...x, name: e.target.value } : x,
                  ),
                })
              }
            />
          </Field>
          <Field label={`Detail ${i + 1} value`} htmlFor={`detail-value-${i}`}>
            <input
              id={`detail-value-${i}`}
              className="input"
              maxLength={200}
              value={f.value}
              onChange={(e) =>
                onChange({
                  ...value,
                  fields: value.fields.map((x, n) =>
                    n === i ? { ...x, value: e.target.value } : x,
                  ),
                })
              }
            />
            <button
              type="button"
              className="btn ghost small"
              onClick={() =>
                onChange({
                  ...value,
                  fields: value.fields.filter((_, n) => n !== i),
                })
              }
            >
              Remove detail {i + 1}
            </button>
          </Field>
        </div>
      ))}
      <button
        type="button"
        className="btn"
        disabled={value.fields.length >= 12}
        onClick={() =>
          onChange({
            ...value,
            fields: [...value.fields, { name: "", value: "" }],
          })
        }
      >
        Add custom detail
      </button>
    </fieldset>
  );
}
export { blankInfo };

/** What a container holds: one line per kind of thing. Empty means the pallet is one item on its own. */
function ContentsEditor({ value, onChange }: { value: PalletInfo; onChange: (v: PalletInfo) => void }) {
  const lines = value.contents ?? [];
  const set = (contents: PalletInfo["contents"]) => onChange({ ...value, contents, contents_unknown: contents.length ? false : value.contents_unknown });
  return (
    <div className="field stack" style={{ gap: 6 }} data-testid="contents-editor">
      <span className="label">What’s on it (optional)</span>
      {lines.map((c, i) => (
        <div className="row nowrap contents-line" key={i}>
          <input aria-label={`Thing ${i + 1}`} className="input" value={c.name} maxLength={120} placeholder="Air fryer" onChange={(e) => set(lines.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
          <input aria-label={`How many of thing ${i + 1}`} className="input qty" inputMode="numeric" value={c.qty} maxLength={20} placeholder="Qty" onChange={(e) => set(lines.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} />
          <input aria-label={`SKU or part number of thing ${i + 1}`} className="input sku" value={c.sku} maxLength={60} placeholder="SKU" onChange={(e) => set(lines.map((x, j) => (j === i ? { ...x, sku: e.target.value } : x)))} />
          <button type="button" className="btn ghost small" aria-label={`Remove thing ${i + 1}`} onClick={() => set(lines.filter((_, j) => j !== i))}>
            ✕
          </button>
        </div>
      ))}
      <div className="row">
        {lines.length < 100 && (
          <button type="button" className="btn small" onClick={() => set([...lines, { name: "", qty: "", sku: "" }])}>
            + Add a thing on it
          </button>
        )}
        {!lines.length && (
          <label className="toggle">
            <input type="checkbox" checked={!!value.contents_unknown} onChange={(e) => onChange({ ...value, contents_unknown: e.target.checked })} />
            <span>Not sure yet, list it later</span>
          </label>
        )}
      </div>
      <span className="hint">For a pallet, box or tote holding several things. Leave empty when it is one item. Moving it moves everything on it.</span>
    </div>
  );
}
