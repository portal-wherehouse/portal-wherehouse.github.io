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
