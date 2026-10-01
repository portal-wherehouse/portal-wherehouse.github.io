// Stock on hand for one product, counted on the server so a warehouse with many pallets is never downloaded.
// Matches src/domain/stock.ts: here means received or stored and not archived; pallets on hold are counted apart.

import type { DocumentReference, Query } from "firebase-admin/firestore";
import { productCodeVariants } from "../../../src/domain/orders";
import {
  isLow,
  measure,
  parseQty,
  suggestQty,
} from "../../../src/domain/stock";

const count = async (q: Query) => (await q.count().get()).data().count;

export interface ProductStock {
  units: number;
  qty: number;
  held: number;
}

/** Pallets of a product here, and (when asked) the quantity recorded on those not on hold. */
export async function productStock(
  root: DocumentReference,
  code: string,
  withQty: boolean,
): Promise<ProductStock> {
  const variants = productCodeVariants(code);
  if (!variants.length) return { units: 0, qty: 0, held: 0 };
  const here = (state: string) =>
    root
      .collection("pallets")
      .where("receiving.product_code", "in", variants)
      .where("archived_at", "==", null)
      .where("state", "==", state);
  const states = ["RECEIVED", "STORED"];
  const [all, held] = await Promise.all([
    Promise.all(states.map((s) => count(here(s)))),
    Promise.all(
      states.map((s) => count(here(s).where("has_hold", "==", true))),
    ),
  ]);
  let qty = 0;
  if (withQty)
    for (const s of states) {
      const snap = await here(s)
        .where("has_hold", "==", false)
        .select("receiving.quantity")
        .limit(2000)
        .get();
      for (const d of snap.docs)
        qty += parseQty(d.get("receiving.quantity")) ?? 0;
    }
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  return {
    units: sum(all) - sum(held),
    qty: Math.round(qty * 1000) / 1000,
    held: sum(held),
  };
}

/** Products with a minimum that are below it, the emptiest first. At most 100 products with a minimum are checked. */
export async function lowStock(root: DocumentReference) {
  const products = await root
    .collection("products")
    .where("min_qty", ">", 0)
    .limit(100)
    .get();
  const rows: any[] = [];
  for (let start = 0; start < products.docs.length; start += 10)
    await Promise.all(
      products.docs.slice(start, start + 10).map(async (d) => {
        const p: any = d.data();
        const stock = await productStock(
          root,
          p.code,
          p.count_by === "quantity",
        );
        if (!isLow(p, stock)) return;
        const on_hand = measure(p, stock);
        rows.push({
          product: {
            id: d.id,
            code: p.code,
            description: p.description,
            unit: p.unit || "",
            min_qty: p.min_qty,
            reorder_qty: p.reorder_qty ?? null,
            count_by: p.count_by || "units",
            reorder_note: p.reorder_note ?? null,
          },
          on_hand,
          min: p.min_qty,
          suggest: suggestQty(p, on_hand),
          stock,
        });
      }),
    );
  return rows.sort(
    (a, b) =>
      a.on_hand / a.min - b.on_hand / b.min ||
      String(a.product.description).localeCompare(b.product.description),
  );
}
