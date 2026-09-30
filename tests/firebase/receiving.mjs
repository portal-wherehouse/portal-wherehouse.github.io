import assert from "node:assert/strict";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  limit,
  setDoc,
} from "firebase/firestore";
export async function testReceiving({
  owner,
  viewer,
  outsider,
  ws,
  job,
  location,
  send,
  adminDb,
}) {
  const info = {
    product_code: "BIRCH-WHITE",
    quantity: "48",
    unit: "logs",
    destination: "North DC",
    remind_on: "2020-01-01",
    fields: [{ name: "Grade", value: "A" }],
  };
  const receipt = await send(owner, "receive", {
    job_id: job.target_id,
    description: "White birch",
    receiving: info,
    remember_product: true,
  });
  assert.equal(receipt.ok, true, JSON.stringify(receipt));
  const products = await getDocs(
    query(collection(viewer.db, "workspaces", ws, "products"), limit(20)),
  );
  assert.equal(products.size, 1);
  const product = products.docs[0];
  assert.equal(product.get("description"), "White birch");
  assert.equal(product.get("quantity"), undefined);
  await assert.rejects(
    getDoc(doc(outsider.db, "workspaces", ws, "products", product.id)),
  );
  await assert.rejects(
    setDoc(doc(owner.db, "workspaces", ws, "products", product.id), {
      description: "Forged",
    }),
  );
  const imported = await send(owner, "import_batch", {
    import_kind: "shipments",
    checksum: "birch",
    rows: [
      {
        barcode: "006141411234567890",
        job_code: "J-214",
        description: "Supplier birch",
        product_code: "BIRCH-WHITE",
        quantity: "60",
        unit: "logs",
        details_json: '{"Grade":"B"}',
      },
    ],
  });
  assert.equal(imported.ok, true, JSON.stringify(imported));
  const shipmentId = imported.created_ids[0];
  const shipment = (
    await getDoc(doc(viewer.db, "workspaces", ws, "shipments", shipmentId))
  ).data();
  assert.equal(shipment.pallet_id, null);
  const arrivals = await Promise.all(
    [1, 2].map(() =>
      send(owner, "receive", {
        job_id: job.target_id,
        description: "White birch",
        supplier_ref: shipment.barcode,
        shipment_id: shipmentId,
        receiving: shipment.receiving,
      }),
    ),
  );
  assert.equal(
    arrivals.filter((r) => r.ok).length,
    1,
    JSON.stringify(arrivals),
  );
  assert.equal(arrivals.filter((r) => r.code === "INVALID_STATE").length, 1);
  assert.equal(
    (
      await getDocs(
        query(
          collection(viewer.db, "workspaces", ws, "shipments"),
          where("pending_barcode", "==", shipment.barcode),
          limit(20),
        ),
      )
    ).size,
    0,
  );
  const version = (p) => ({ pallet_id: p.id, expected_version: p.version });
  const edited = await send(
    owner,
    "edit_details",
    { receiving: { ...info, quantity: "47" } },
    version(receipt.current_state),
  );
  assert.equal(edited.ok, true);
  const shared = (
    await getDoc(doc(viewer.db, "workspaces", ws, "pallets", receipt.pallet_id))
  ).data();
  assert.equal(shared.receiving.quantity, "47");
  assert.equal(shared.label_needs_reprint, true);
  assert.equal(
    (
      await getDoc(
        doc(
          viewer.db,
          "workspaces",
          ws,
          "pallets",
          arrivals.find((r) => r.ok).pallet_id,
        ),
      )
    ).data().receiving.quantity,
    "60",
  );
  await adminDb.doc(`workspaces/${ws}/private/summaryCache`).delete();
  const summary = await owner.call("getWarehouseSummary", { workspaceId: ws });
  assert.equal(summary.receiving_version, 1);
  assert.equal(
    summary.reminders.find((p) => p.id === receipt.pallet_id)?.receiving
      .quantity,
    "47",
  );
  const placed = await send(
    owner,
    "place",
    { location_id: location.target_id },
    version(edited.current_state),
  );
  assert.equal(placed.ok, true);
  const sent = await send(
    owner,
    "dispatch",
    { destination: "North DC" },
    version(placed.current_state),
  );
  assert.equal(sent.ok, true);
  await adminDb.doc(`workspaces/${ws}/private/summaryCache`).delete();
  assert.equal(
    (
      await owner.call("getWarehouseSummary", { workspaceId: ws })
    ).reminders.some((p) => p.id === receipt.pallet_id),
    false,
  );
  console.log(
    "PASS shared pallet details, scoped product memory, atomic shipment receipt and due reminders",
  );
}
