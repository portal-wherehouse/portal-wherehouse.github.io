import { expect, test } from "vitest";
import { Harness } from "../../src/lab/harness";
import {
  blankInfo,
  productKey,
  reminderDate,
  warehouseDate,
} from "../../src/domain/receiving";
import { Engine } from "../../src/demo/engine";

test("product name is remembered separately from variable pallet details, and edits retain history", () => {
  const h = new Harness();
  const info = {
    ...blankInfo(),
    product_code: "BIRCH-WHITE",
    quantity: "48",
    unit: "logs",
    destination: "North DC",
    remind_on: "2026-10-01",
    fields: [{ name: "Grade", value: "A" }],
  };
  const receive = (quantity: string) =>
    h.cmd(h.users.operator, "receive", {
      job_id: h.job("J-214").id,
      description: "White birch",
      receiving: { ...info, quantity },
      remember_product: true,
    });
  const first = receive("48"),
    second = receive("60");
  expect(first.ok && second.ok).toBe(true);
  if (!first.ok || !second.ok) throw Error();
  expect(first.current_state!.code).not.toBe(second.current_state!.code);
  const product = h.db.products[productKey(h.ws, "BIRCH-WHITE")];
  expect(product).toMatchObject({
    description: "White birch",
    unit: "logs",
    field_names: ["Grade"],
  });
  expect(product).not.toHaveProperty("quantity");
  expect(product).not.toHaveProperty("destination");
  const updated = h.cmd(
    h.users.operator,
    "edit_details",
    {
      receiving: {
        ...info,
        quantity: "47",
        fields: [{ name: "Grade", value: "B" }],
      },
    },
    first.current_state,
  );
  expect(updated.ok).toBe(true);
  if (!updated.ok) throw Error();
  expect(updated.current_state!.label_needs_reprint).toBe(true);
  expect(h.db.pallets[second.pallet_id!].receiving?.quantity).toBe("60");
  expect(
    h.events(first.current_state!).at(-1)?.before_state?.receiving?.quantity,
  ).toBe("48");
  const restored = new Engine(JSON.parse(JSON.stringify(h.db)));
  const label = restored.activeLabel(first.pallet_id!)!;
  const resolved = restored.resolve(
    h.users.owner,
    h.ws,
    `PL1:P:${label.token}`,
  );
  expect(
    resolved.type === "pallet" && resolved.pallet.receiving?.quantity,
  ).toBe("47");
});

test("expected imports do not count as received; a shipment can only be consumed once and scoped", () => {
  const h = new Harness(),
    before = Object.keys(h.db.pallets).length;
  const imported = h.cmd(h.users.owner, "import_batch", {
    import_kind: "shipments",
    checksum: "sample",
    rows: [
      {
        barcode: "(00)006141411234567890",
        job_code: "J-214",
        description: "Birch",
        quantity: "48",
        unit: "logs",
        details_json: '{"Grade":"A"}',
      },
    ],
  });
  expect(imported.ok).toBe(true);
  if (!imported.ok) throw Error();
  expect(Object.keys(h.db.pallets)).toHaveLength(before);
  const shipment = h.db.shipments[imported.created_ids![0]];
  expect(shipment.receiving.fields).toEqual([{ name: "Grade", value: "A" }]);
  const payload = {
    job_id: shipment.job_id,
    description: "White birch",
    supplier_ref: shipment.barcode,
    shipment_id: shipment.id,
    receiving: shipment.receiving,
  };
  const receive = h.cmd(h.users.operator, "receive", payload);
  expect(receive.ok).toBe(true);
  expect(h.db.shipments[shipment.id].pending_barcode).toBeNull();
  expect(h.cmd(h.users.operator, "receive", payload)).toMatchObject({
    ok: false,
    code: "INVALID_STATE",
  });
  h.db.shipments[shipment.id] = { ...shipment, workspace_id: "other" };
  expect(h.cmd(h.users.operator, "receive", payload)).toMatchObject({
    ok: false,
    code: "NOT_FOUND",
  });
});

test("invalid dates, duplicate fields, SSCC product memory and malformed shipment rows are rejected atomically", () => {
  const h = new Harness(),
    n = Object.keys(h.db.pallets).length;
  const base = { job_id: h.job("J-214").id, description: "White birch" };
  for (const receiving of [
    { ...blankInfo(), remind_on: "2026-02-30" },
    {
      ...blankInfo(),
      fields: [
        { name: "Grade", value: "A" },
        { name: "grade", value: "B" },
      ],
    },
  ])
    expect(
      h.cmd(h.users.operator, "receive", { ...base, receiving }),
    ).toMatchObject({ ok: false, code: "INVALID_INPUT" });
  expect(
    h.cmd(h.users.operator, "receive", {
      ...base,
      receiving: { ...blankInfo(), product_code: "006141411234567890" },
      remember_product: true,
    }),
  ).toMatchObject({ ok: false, code: "INVALID_INPUT" });
  expect(Object.keys(h.db.pallets)).toHaveLength(n);
  const bad = h.cmd(h.users.owner, "import_batch", {
    import_kind: "shipments",
    checksum: "bad",
    rows: [
      { barcode: "BIRCH", job_code: "J-214", description: "Birch" },
      {
        barcode: "BIRCH",
        job_code: "J-214",
        description: "Birch",
        details_json: "[]",
      },
    ],
  });
  expect(bad.ok).toBe(false);
  expect(Object.keys(h.db.shipments)).toHaveLength(0);
});

test("still-here reminders follow warehouse calendar dates and disappear on dispatch", () => {
  expect(
    warehouseDate("America/New_York", new Date("2026-10-01T01:00:00Z")),
  ).toBe("2026-09-30");
  const h = new Harness(),
    p = h.receive("J-214", "Birch");
  h.cmd(
    h.users.operator,
    "edit_details",
    { receiving: { ...blankInfo(), remind_on: "2026-10-01" } },
    p,
  );
  expect(reminderDate(h.fresh(p))).toBe("2026-10-01");
  h.cmd(
    h.users.operator,
    "place",
    { location_id: h.loc("A-03-02").id },
    h.fresh(p),
  );
  h.cmd(h.users.operator, "dispatch", { destination: "North DC" }, h.fresh(p));
  expect(reminderDate(h.fresh(p))).toBeNull();
});

test("failed receive rolls back shipment consumption and product memory together", () => {
  const h = new Harness();
  const imported = h.cmd(h.users.owner, "import_batch", {
    import_kind: "shipments",
    checksum: "sample",
    rows: [{ barcode: "BIRCH", job_code: "J-214", description: "Birch" }],
  });
  if (!imported.ok) throw Error();
  const row = h.db.shipments[imported.created_ids![0]];
  h.engine.faults.failEventInsert = true;
  const r = h.cmd(h.users.owner, "receive", {
    job_id: row.job_id,
    description: "White birch",
    supplier_ref: row.barcode,
    shipment_id: row.id,
    receiving: { ...blankInfo(), product_code: "BIRCH" },
    remember_product: true,
  });
  expect(r).toMatchObject({ ok: false, code: "TEMPORARY_FAILURE" });
  expect(h.db.shipments[row.id].pallet_id).toBeNull();
  expect(h.db.products[productKey(h.ws, "BIRCH")]).toBeUndefined();
});

test("GTIN lookup matches zero-padded supplier representations without merging arbitrary codes", () => {
  expect(productKey("ws", "4006381333931")).toBe(
    productKey("ws", "04006381333931"),
  );
  expect(productKey("ws", "BIRCH-01")).not.toBe(productKey("ws", "BIRCH01"));
});
