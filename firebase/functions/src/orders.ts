// Orders and picking: what each order command reads, loaded inside the command transaction before the shared engine
// (src/demo/orderEngine.ts) runs. Keep in step with the rules there: anything the engine looks at must be loaded here,
// or it will act as if the record did not exist.

import type {
  DocumentReference,
  Query,
  Transaction,
} from "firebase-admin/firestore";
import type { Db } from "../../../src/demo/engine";
import { productKey } from "../../../src/domain/receiving";
import {
  draftOrders,
  parseToteCode,
  productCodeVariants,
  type Order,
  type PickBatch,
} from "../../../src/domain/orders";
import type { CommandEnvelope } from "../../../src/domain/types";

interface Loader {
  tx: Transaction;
  root: DocumentReference;
  db: Db;
  ws: string;
  cmd: CommandEnvelope;
  one: (table: string, id: unknown) => Promise<void>;
  query: (table: string, q: Query) => Promise<void>;
}

/** Order, batch, package and dispatch numbers each have their own counter. */
export const SEQ_LETTERS = ["O", "B", "K", "D"] as const;

async function seq(l: Loader, letter: (typeof SEQ_LETTERS)[number]) {
  const c = await l.tx.get(l.root.collection("private").doc(`seq_${letter}`));
  l.db.counters[`${l.ws}:${letter}`] = c.get("value") || 0;
}

/** A product as an order line names it: its saved product, and one record of stock that carries the code. */
async function product(l: Loader, code: string) {
  const c = String(code || "").trim();
  if (!c) return;
  await l.one("products", productKey(l.ws, c));
  await l.query(
    "pallets",
    l.root
      .collection("pallets")
      .where("receiving.product_code", "in", productCodeVariants(c))
      .limit(1),
  );
}

/** Stock that can be picked for a product, and the spots it is on (for their codes and the walk order). */
async function stock(l: Loader, code: string) {
  await l.query(
    "pallets",
    l.root
      .collection("pallets")
      .where("receiving.product_code", "in", productCodeVariants(code))
      .where("state", "==", "STORED")
      .limit(200),
  );
}

async function spotsOfLoadedStock(l: Loader) {
  for (const id of new Set(
    Object.values(l.db.pallets).map((p) => p.current_location_id),
  ))
    await l.one("locations", id);
}

const activeBatches = (l: Loader) =>
  l.query(
    "batches",
    l.root.collection("batches").where("status", "==", "PICKING").limit(50),
  );

async function orderAndUnits(l: Loader, id: unknown, packages = true) {
  await l.one("orders", id);
  const o = l.db.orders[String(id)] as Order | undefined;
  if (!o) return;
  for (const line of o.lines)
    for (const u of line.units) await l.one("pallets", u.pallet_id);
  if (packages) for (const k of o.package_ids) await l.one("packages", k);
}

export async function loadOrderCommand(l: Loader) {
  const p: any = l.cmd.payload;
  switch (l.cmd.kind) {
    case "create_order":
      await seq(l, "O");
      if (p.external_ref)
        await l.query(
          "orders",
          l.root
            .collection("orders")
            .where("external_ref", "==", String(p.external_ref).trim())
            .limit(5),
        );
      for (const line of p.lines || []) await product(l, line.product_code);
      return;
    case "import_batch": {
      await seq(l, "O");
      const { orders } = draftOrders(p.rows || []);
      for (const d of orders.slice(0, 300)) {
        await l.query(
          "orders",
          l.root
            .collection("orders")
            .where("external_ref", "==", d.external_ref)
            .limit(5),
        );
      }
      for (const code of new Set(
        orders.flatMap((d) => d.lines.map((x) => x.product_code)),
      ))
        await product(l, code);
      return;
    }
    case "cancel_order":
      await orderAndUnits(l, p.order_id);
      return;
    case "start_batch": {
      await seq(l, "B");
      await activeBatches(l);
      if (p.assign_to) await l.one("members", p.assign_to);
      if (Array.isArray(p.order_ids))
        for (const id of p.order_ids.slice(0, 8)) await l.one("orders", id);
      else
        await l.query(
          "orders",
          l.root.collection("orders").where("status", "==", "OPEN").limit(200),
        );
      for (const code of new Set(
        Object.values(l.db.orders).flatMap((o) =>
          o.status === "OPEN" ? o.lines.map((x) => x.product_code) : [],
        ),
      ))
        await stock(l, code);
      // A transfer's order takes the very pallets on the transfer.
      for (const o of Object.values(l.db.orders))
        if (o.status === "OPEN")
          for (const line of o.lines)
            if (line.pallet_id) await l.one("pallets", line.pallet_id);
      await spotsOfLoadedStock(l);
      return;
    }
    case "assign_tote": {
      await l.one("batches", p.batch_id);
      const b = l.db.batches[p.batch_id] as PickBatch | undefined;
      for (const s of b?.slots || []) await l.one("orders", s.order_id);
      const tote = parseToteCode(String(p.tote_code || ""));
      if (tote)
        await l.query(
          "orders",
          l.root.collection("orders").where("tote_code", "==", tote).limit(10),
        );
      return;
    }
    case "pick":
    case "substitute": {
      await l.one("batches", p.batch_id);
      const b = l.db.batches[p.batch_id] as PickBatch | undefined;
      const stop = b?.stops.find((s) => s.key === p.stop_key);
      if (stop) await l.one("orders", stop.order_id);
      return;
    }
    case "short_pick": {
      await l.one("batches", p.batch_id);
      const b = l.db.batches[p.batch_id] as PickBatch | undefined;
      const stop = b?.stops.find((s) => s.key === p.stop_key);
      if (!stop) return;
      await l.one("orders", stop.order_id);
      await activeBatches(l);
      for (const u of stop.suggested) await l.one("pallets", u.pallet_id);
      await stock(l, stop.product_code);
      await spotsOfLoadedStock(l);
      return;
    }
    case "finish_batch": {
      await l.one("batches", p.batch_id);
      const b = l.db.batches[p.batch_id] as PickBatch | undefined;
      for (const s of b?.slots || []) await l.one("orders", s.order_id);
      return;
    }
    case "decide_sub":
      await orderAndUnits(l, p.order_id);
      return;
    case "pack":
      await seq(l, "K");
      await orderAndUnits(l, p.order_id);
      return;
    case "stage_package":
      await l.one("packages", p.package_id);
      await orderAndUnits(l, l.db.packages[p.package_id]?.order_id, true);
      return;
    case "hand_off":
      await orderAndUnits(l, p.order_id);
      return;
  }
}
