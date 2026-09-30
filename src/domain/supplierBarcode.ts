import { parsePalletCode } from "./codes";

/** Supplier labels identify a unit or product; they are not a contents database. */
export interface SupplierBarcode {
  reference: string;
  kind: "sscc" | "gtin" | "supplier";
  hint: string;
  description?: string;
}

export function validGs1CheckDigit(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false;
  let sum = 0;
  for (let i = digits.length - 2, weight = 3; i >= 0; i--, weight = 4 - weight)
    sum += Number(digits[i]) * weight;
  return (10 - (sum % 10)) % 10 === Number(digits.at(-1));
}

export function readSupplierBarcode(raw: string): SupplierBarcode {
  const rawText = raw.trim();
  if (rawText.startsWith("WHR1:")) {
    if (rawText.length > 1024)
      throw Error("This receiving QR code is too long.");
    let data: unknown;
    try {
      data = JSON.parse(rawText.slice(5));
    } catch {
      throw Error(
        "This receiving QR code has invalid data. Ask for a new label.",
      );
    }
    if (!data || typeof data !== "object" || Array.isArray(data))
      throw Error(
        "This receiving QR code needs a supplier reference and description.",
      );
    const fields = data as Record<string, unknown>;
    if (
      typeof fields.supplier_ref !== "string" ||
      !fields.supplier_ref.trim() ||
      fields.supplier_ref.length > 80 ||
      fields.supplier_ref.includes(":")
    )
      throw Error(
        "The receiving QR supplier reference must be text up to 80 characters.",
      );
    if (
      typeof fields.description !== "string" ||
      !fields.description.trim() ||
      fields.description.trim().length > 160 ||
      /[\x00-\x1f\x7f]/.test(fields.description)
    )
      throw Error(
        "The receiving QR description must be 1–160 characters of plain text.",
      );
    const parsed = readSupplierBarcode(fields.supplier_ref);
    return {
      ...parsed,
      description: fields.description.trim(),
      hint: "Supplier reference and description captured from the QR code. Review them and choose a job before saving.",
    };
  }
  const text = raw.trim().replace(/^\](?:C[01]|d2|Q3)/, "");
  if (!text || text.length > 512)
    throw Error("Scan a supplier label, or type its printed reference.");
  if (
    parsePalletCode(text) ||
    /^[a-z][a-z\d+.-]*:/i.test(text) ||
    /(?:^|#)PL\d*:/i.test(text)
  )
    throw Error(
      "Use the supplier barcode here, not a web link, command, or Wherehouse label.",
    );
  // Human-readable AIs use parentheses; scanners return AI + data without them.
  // Never search within an arbitrary number: only accept a field at a known boundary.
  const sscc =
    text.match(/\(00\)\s*(\d{18})(?=$|\()/)?.[1] ??
    text.match(/^00(\d{18})(?=$|\d|\x1d)/)?.[1] ??
    (/^\d{18}$/.test(text) ? text : undefined);
  if (sscc) {
    if (!validGs1CheckDigit(sscc))
      throw Error(
        "The SSCC check digit does not match. Scan again or check the printed number.",
      );
    return {
      reference: sscc,
      kind: "sscc",
      hint: "SSCC pallet number captured. Enter the contents and job before saving.",
    };
  }
  if (/^\(00\)/.test(text) || /^00\d{15,}$/.test(text))
    throw Error("An SSCC needs 18 digits after (00). Check the pallet label.");
  const gtin =
    text.match(/^\(0[12]\)(\d{14})(?=$|\()/)?.[1] ??
    text.match(/^0[12](\d{14})(?=$|\d|\x1d)/)?.[1];
  if (
    gtin ||
    (/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(text) && validGs1CheckDigit(text))
  ) {
    const value = gtin ?? text;
    if (!validGs1CheckDigit(value))
      throw Error(
        "The product barcode check digit does not match. Scan again.",
      );
    return {
      reference: value,
      kind: "gtin",
      hint: "Product code captured. Multiple pallets can share it; enter this pallet’s contents and job.",
    };
  }
  if (
    text.length > 80 ||
    /[\x00-\x1f\x7f]/.test(text) ||
    /^\(\d{2,4}\)/.test(text)
  )
    throw Error(
      "This label contains fields we cannot interpret yet. Scan its SSCC barcode or type a supplier reference up to 80 characters.",
    );
  return {
    reference: text,
    kind: "supplier",
    hint: "Supplier reference captured. Enter the contents and job before saving.",
  };
}
