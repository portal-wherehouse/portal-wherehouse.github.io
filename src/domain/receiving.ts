import { readSupplierBarcode } from "./supplierBarcode";
import { z } from "zod";
import type { Pallet } from "./types";

const short = (n: number) => z.string().trim().max(n);
export const receivingSchema = z.object({
  product_code: short(80).default(""),
  quantity: short(40).default(""),
  unit: short(40).default(""),
  destination: short(300).default(""),
  category: short(60).default(""),
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
});
export type PalletInfo = z.infer<typeof receivingSchema>;
export const blankInfo = (): PalletInfo => ({
  product_code: "",
  quantity: "",
  unit: "",
  destination: "",
  category: "",
  remind_on: "",
  fields: [],
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
export function palletContents(p: Pallet): string {
  return [
    p.description,
    [p.receiving?.quantity, p.receiving?.unit].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(" · ");
}
