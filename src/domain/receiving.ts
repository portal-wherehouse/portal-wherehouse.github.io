import { readSupplierBarcode } from "./supplierBarcode";
import { z } from "zod";
import type { Pallet } from "./types";

const short = (n: number) => z.string().trim().max(n);
/** A real calendar date written YYYY-MM-DD, between 2000 and 2199. */
export function validDate(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && Number(v.slice(0, 4)) >= 2000 && Number(v.slice(0, 4)) <= 2199 && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
}
export const receivingSchema = z.object({
  product_code: short(80).default(""),
  quantity: short(40).default(""),
  unit: short(40).default(""),
  destination: short(300).default(""),
  category: short(60).default(""),
  /** Weight and size of this one pallet, in pounds and inches. Used by locations with limits. */
  weight_lb: short(12).default(""),
  length_in: short(8).default(""),
  width_in: short(8).default(""),
  height_in: short(8).default(""),
  /** Lot or batch number, when the warehouse tracks lots. */
  lot: short(60).default(""),
  /** Use-by or expiry date, YYYY-MM-DD. Find and picking take the oldest first. */
  expires_on: z
    .string()
    .refine((v) => !v || validDate(v), "Enter a real expiry date between 2000 and 2199.")
    .default(""),
  remind_on: z
    .string()
    .refine(
      (v) =>
        !v ||
        (/^\d{4}-\d{2}-\d{2}$/.test(v) &&
          Number(v.slice(0, 4)) >= 2000 &&
          Number(v.slice(0, 4)) <= 2199 &&
          !Number.isNaN(Date.parse(v)) &&
          new Date(v).toISOString().slice(0, 10) === v),
      "Enter a real date between 2000 and 2199.",
    )
    .default(""),
  fields: z
    .array(z.object({ name: short(60).min(1), value: short(200) }))
    .max(12)
    .refine(
      (fs) => new Set(fs.map((f) => f.name.toLowerCase())).size === fs.length,
      "Use distinct field names.",
    )
    .default([]),
  /** What a container (pallet, box, tote) holds. Empty means it is one item on its own. */
  contents: z
    .preprocess(
      // Blank lines left in the form are dropped rather than refused.
      (v) => (Array.isArray(v) ? v.filter((c) => c && typeof c === "object" && ["name", "qty", "sku"].some((k) => String((c as Record<string, unknown>)[k] ?? "").trim())) : v),
      z.array(z.object({ name: short(120).min(1, "Name each item on it."), qty: short(20).default(""), sku: short(60).default("") }))
    .max(100, "List up to 100 lines; group the rest."),
    )
    .default([]),
  /** Received before anyone knew what was on it; shows up until contents are added. */
  contents_unknown: z.boolean().default(false),
});
export type PalletInfo = z.infer<typeof receivingSchema>;
export const blankInfo = (): PalletInfo => ({
  product_code: "",
  quantity: "",
  unit: "",
  destination: "",
  category: "",
  weight_lb: "",
  length_in: "",
  width_in: "",
  height_in: "",
  lot: "",
  expires_on: "",
  remind_on: "",
  fields: [],
  contents: [],
  contents_unknown: false,
});
export interface ProductMemory {
  id: string;
  workspace_id: string;
  warehouse_id: string;
  code: string;
  description: string;
  unit: string;
  /** Optional grouping people choose, like "Hardwood" or "Kindling". */
  category?: string;
  /** General size of this pallet type, copied onto each pallet received with its barcode. */
  length_in?: string;
  width_in?: string;
  height_in?: string;
  weight_lb?: string;
  /** Where this type normally lives. Kept when none are in stock, and offered first on Move. */
  home_location_id?: string | null;
  /** Running low below this many on hand in this warehouse. Null or missing: no minimum. See domain/stock.ts. */
  min_qty?: number | null;
  /** How many to order or bring in when it runs low. Optional. */
  reorder_qty?: number | null;
  /** What the minimum counts: each pallet as one ("units"), or the quantity recorded on each pallet. */
  count_by?: 'units' | 'quantity';
  /** Someone noted that more is ordered. Cleared when this product is received again, or by hand. */
  reorder_note?: { at: string; by_name: string; note: string } | null;
  field_names: string[];
  updated_at: string;
}
export interface ExpectedShipment {
  id: string;
  workspace_id: string;
  warehouse_id: string;
  barcode: string;
  pending_barcode: string | null;
  description: string;
  job_id: string;
  notes: string;
  receiving: PalletInfo;
  pallet_id: string | null;
  created_at: string;
}
// No lossy hashing or punctuation stripping: leading zeros and case remain significant.
export function barcodeMatchKey(code: string): string {
  try {
    const parsed = readSupplierBarcode(code);
    return parsed.kind === "gtin"
      ? parsed.reference.padStart(14, "0")
      : parsed.reference;
  } catch {
    return code.trim();
  }
}
export const productKey = (ws: string, code: string) =>
  "p_" +
  encodeURIComponent(ws) +
  "_" +
  encodeURIComponent(barcodeMatchKey(code));
export function warehouseDate(timezone: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  return ["year", "month", "day"]
    .map((k) => parts.find((p) => p.type === k)!.value)
    .join("-");
}
export function reminderDate(p: Pallet): string | null {
  return !p.archived_at && ["RECEIVED", "STORED", "MISSING"].includes(p.state)
    ? p.receiving?.remind_on || null
    : null;
}
/** The expiry date Firestore indexes (expiry_due): set while the pallet is here, so expired stock that left drops off the list. */
export function expiryDate(p: Pallet): string | null {
  return !p.archived_at && ["RECEIVED", "STORED", "MISSING"].includes(p.state)
    ? p.receiving?.expires_on || null
    : null;
}
export function palletContents(p: Pallet): string {
  return [
    p.description,
    [p.receiving?.quantity, p.receiving?.unit].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(" · ");
}
