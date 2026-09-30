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
  const unassigned = await send(owner, 'receive', {description:'General stock without a job'});
  assert.equal(unassigned.ok, true); assert.equal(unassigned.current_state.job_id, '');
  let free = unassigned.current_state;
  for (const [kind, payload] of [['place',{location_id:location.target_id}],['dispatch',{destination:'Customer pickup'}],['return',{condition_note:'Unopened'}]]) {
    const result = await send(owner, kind, payload, {pallet_id:free.id,expected_version:free.version});
    assert.equal(result.ok, true, JSON.stringify(result)); free = result.current_state;
  }
  console.log('PASS shared receive without a job, placement, dispatch and return');
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
  const issue = await send(owner, "report_issue", {
    issue_kind: "DAMAGED",
    description: "Wrap torn on arrival",
    pallet_ids: [receipt.pallet_id, free.id],
  });
  assert.equal(issue.ok, true, JSON.stringify(issue));
  const issues = await getDocs(
    query(collection(owner.db, "workspaces", ws, "issues"), limit(20)),
  );
  assert.equal(issues.size, 1);
  assert.equal(issues.docs[0].get("status"), "NEW");
  assert.equal(issues.docs[0].get("pallet_codes").length, 2);
  await assert.rejects(
    getDocs(query(collection(viewer.db, "workspaces", ws, "issues"), limit(20))),
  );
  await assert.rejects(
    setDoc(doc(owner.db, "workspaces", ws, "issues", issue.target_id), {
      status: "FILED",
    }),
  );
  assert.equal(
    (await send(viewer, "report_issue", { issue_kind: "OTHER", description: "x", pallet_ids: [free.id] }).catch(() => ({ ok: false }))).ok,
    false,
  );
  const filed = await send(owner, "update_issue", {
    issue_id: issue.target_id,
    status: "FILED",
    note: "Claim sent",
  });
  assert.equal(filed.ok, true, JSON.stringify(filed));
  assert.equal(
    (await getDoc(doc(owner.db, "workspaces", ws, "issues", issue.target_id))).get("status"),
    "FILED",
  );
  console.log("PASS flagged issues: reported, manager-only reads, reviewed");
  const cap = await send(owner, "set_location_capacity", {
    location_id: location.target_id,
    spaces: 50,
    stacking: 2,
    max_weight_lb: null,
    length_in: null,
    width_in: null,
    height_in: null,
  });
  assert.equal(cap.ok, true, JSON.stringify(cap));
  const locRef = doc(owner.db, "workspaces", ws, "locations", location.target_id);
  const before = (await getDoc(locRef)).get("load_pallets");
  assert.equal(typeof before, "number");
  const extra = await send(owner, "receive", { description: "Counted pallet" });
  const placedExtra = await send(owner, "place", { location_id: location.target_id }, { pallet_id: extra.current_state.id, expected_version: extra.current_state.version });
  assert.equal(placedExtra.ok, true, JSON.stringify(placedExtra));
  assert.equal((await getDoc(locRef)).get("load_pallets"), before + 1);
  assert.equal((await getDoc(locRef)).get("capacity.spaces"), 50);
  console.log("PASS location capacity recounts and counts down on placement");
}
