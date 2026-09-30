import { describe, it, expect } from "vitest";
import { readSupplierBarcode } from "../../src/domain/supplierBarcode";
import { decodeBarcodePixels } from "../../src/device/barcodeDecoder";
import { encodeCode128 } from "../../src/device/code128";

const sscc = "006141411234567890";
describe("supplier barcode interpretation", () => {
  it("normalizes SSCC scans while preserving all leading zeroes", () => {
    for (const text of [
      sscc,
      `00${sscc}`,
      `]C100${sscc}`,
      `(00)${sscc}`,
      `(00)${sscc}(17)271231`,
      `]C100${sscc}17271231`,
    ]) {
      expect(readSupplierBarcode(text)).toMatchObject({
        reference: sscc,
        kind: "sscc",
      });
    }
  });
  it("rejects damaged SSCCs and unsafe or unsupported labels without guessing", () => {
    for (const text of [
      "(00)006141411234567891",
      "(00)123",
      "https://example.com/123",
      "CMD:CONFIRM",
      "PL1:P:AAAAAAAAAAAAAAAA",
      "P-000001",
      "A".repeat(81),
      "abc\u001d123",
    ]) {
      expect(() => readSupplierBarcode(text)).toThrow();
    }
  });
  it("distinguishes product codes from pallet identity and accepts custom supplier codes", () => {
    expect(readSupplierBarcode("4006381333931")).toMatchObject({
      kind: "gtin",
      reference: "4006381333931",
    });
    expect(readSupplierBarcode("]C10100614141000418")).toMatchObject({
      kind: "gtin",
      reference: "00614141000418",
    });
    expect(readSupplierBarcode("ACME-LOT-114")).toMatchObject({
      kind: "supplier",
      reference: "ACME-LOT-114",
    });
  });
});
it("decodes an actual Code 128 supplier barcode from pixels without native browser support", () => {
  const text = `00${sscc}`;
  const barcode = encodeCode128(text);
  const scale = 3,
    quiet = 30,
    width = barcode.modules * scale + quiet * 2,
    height = 180;
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  let x = quiet;
  barcode.widths.forEach((modules, i) => {
    const next = x + modules * scale;
    if (i % 2 === 0)
      for (let y = 10; y < height - 10; y++)
        for (let col = x; col < next; col++) {
          const offset = (y * width + col) * 4;
          data[offset] = data[offset + 1] = data[offset + 2] = 0;
        }
    x = next;
  });
  expect(decodeBarcodePixels({ data, width, height })).toBe(text);
});

describe("receiving QR contents", () => {
  it("reads a description and supplier reference without changing the description", () => {
    const description = "24 cartons of LED light fixtures — white";
    const payload = `WHR1:${JSON.stringify({ supplier_ref: sscc, description })}`;
    expect(readSupplierBarcode(payload)).toMatchObject({
      reference: sscc,
      description,
      kind: "sscc",
    });
  });
  it("rejects malformed or oversized receiving data and non-string identifiers", () => {
    for (const payload of [
      "WHR1:{",
      "WHR1:null",
      "WHR1:[]",
      ...[
        { supplier_ref: 123, description: "Lights" },
        { supplier_ref: sscc, description: "" },
        { supplier_ref: sscc, description: "x".repeat(161) },
        { supplier_ref: sscc, description: "<text>\nsecond line" },
        { supplier_ref: "https://example.com", description: "Lights" },
      ].map((value) => `WHR1:${JSON.stringify(value)}`),
    ])
      expect(() => readSupplierBarcode(payload)).toThrow();
  });
});
