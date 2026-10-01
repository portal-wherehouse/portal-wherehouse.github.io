import {
  MultiFormatReader,
  BarcodeFormat,
  DecodeHintType,
  RGBLuminanceSource,
  BinaryBitmap,
  HybridBinarizer,
  Code128Reader,
  type BitArray,
  type Result,
} from "@zxing/library";

// Browser barcode decoding (ZXing) for devices without a built-in decoder, such as iPhone Safari.
// Pixels stay on this device. Lazy-loaded only when a scanner is used.

/**
 * What the live camera looks for: Wherehouse labels (QR and Code 128), supplier pallet labels (GS1-128),
 * product barcodes (EAN-13, UPC-A, EAN-8, ITF-14 cartons), Code 39 and GS1 DataMatrix.
 * UPC-E is left to photos: it is rare on pallets and adds a reader to every row.
 */
export const LIVE_FORMATS: readonly BarcodeFormat[] = [
  BarcodeFormat.QR_CODE,
  BarcodeFormat.CODE_128,
  BarcodeFormat.EAN_13,
  BarcodeFormat.UPC_A,
  BarcodeFormat.EAN_8,
  BarcodeFormat.ITF,
  BarcodeFormat.CODE_39,
  BarcodeFormat.DATA_MATRIX,
];

/** A photo is read once, so it tries every format the portal accepts, as hard as it can. */
export const PHOTO_FORMATS: readonly BarcodeFormat[] = [...LIVE_FORMATS, BarcodeFormat.UPC_E];

function hintsFor(formats: readonly BarcodeFormat[], tryHarder: boolean) {
  const hints = new Map<DecodeHintType, unknown>([
    [DecodeHintType.POSSIBLE_FORMATS, [...formats]],
    // GS1-128 supplier labels keep their ]C1 marker and group separators for readSupplierBarcode.
    [DecodeHintType.ASSUME_GS1, true],
  ]);
  if (tryHarder) hints.set(DecodeHintType.TRY_HARDER, true);
  return hints;
}

// Hints are fixed per reader, so each reader is set up once instead of on every frame.
const photoReader = new MultiFormatReader();
photoReader.setHints(hintsFor(PHOTO_FORMATS, true));
const liveReader = new MultiFormatReader();
liveReader.setHints(hintsFor(LIVE_FORMATS, false));
const ONE_D = new Set<BarcodeFormat>([BarcodeFormat.CODE_128, BarcodeFormat.EAN_13, BarcodeFormat.UPC_A, BarcodeFormat.EAN_8, BarcodeFormat.UPC_E, BarcodeFormat.ITF, BarcodeFormat.CODE_39]);
// TRY_HARDER only changes much for straight barcodes (it reads every row instead of 15), so the
// occasional careful pass skips QR and DataMatrix, which the quick pass already reads well.
const liveHardReader = new MultiFormatReader();
liveHardReader.setHints(hintsFor(LIVE_FORMATS.filter((f) => ONE_D.has(f)), true));
// ZXing tries product barcodes (EAN/UPC) and Code 39 before Code 128 on each row, and a run of Code 128
// bars can happen to form a valid EAN-13: the label for spot H-01-20 reads as 8462522218202. So a product
// or Code 39 read is checked by reading the same bars as Code 128, which wins when it succeeds (its start,
// stop and modulo-103 check are far stronger evidence than a single check digit).
const code128Row = new Code128Reader();
const GS1_HINTS = new Map<DecodeHintType, unknown>([[DecodeHintType.ASSUME_GS1, true]]);
const READ_BEFORE_CODE_128 = new Set<BarcodeFormat>([BarcodeFormat.EAN_13, BarcodeFormat.UPC_A, BarcodeFormat.EAN_8, BarcodeFormat.UPC_E, BarcodeFormat.CODE_39]);

/** Middle share of the rows the careful pass reads (where the person aims), and at most how many of them. */
export const CAREFUL_BAND = 0.5;
export const CAREFUL_ROWS = 160;

/** RGBA pixels, as a canvas returns them. */
export interface Pixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

let lumBuffer = new Uint8ClampedArray(0);

/** Grayscale copy of RGBA pixels. Reuses one buffer, so a camera loop does not allocate per frame. */
function luminance(image: Pixels): Uint8ClampedArray {
  const n = image.width * image.height;
  if (lumBuffer.length !== n) lumBuffer = new Uint8ClampedArray(n);
  const d = image.data;
  for (let i = 0, o = 0; i < n; i++, o += 4) lumBuffer[i] = (d[o] + 2 * d[o + 1] + d[o + 2]) >> 2;
  return lumBuffer;
}

/**
 * ZXing reads a Code 128 check character like any other symbol. When the check value is 102, which is
 * FNC1, the GS1 option turns it into a trailing group separator that is never removed, so a plain label
 * such as A-01-02-1 reads as "A-01-02-1" plus a separator and then fails as an unreadable GS1 label.
 * A separator at the very end carries no information in any Code 128 symbol, so it is dropped.
 */
export function cleanCode128Text(text: string): string {
  return text.endsWith('\x1d') ? text.slice(0, -1) : text;
}

function xSpan(result: Result): [number, number] {
  const xs = (result.getResultPoints() ?? []).map((p) => p.getX());
  return xs.length ? [Math.min(...xs), Math.max(...xs)] : [0, 0];
}

/** Rows above and below a product read that are also tried as Code 128: one noisy row can fail its check. */
const NEARBY_ROWS = 12;

/**
 * The same bars read as Code 128, or null: the row the product or Code 39 read came from, then rows near
 * it, each both ways round as ZXing does. A Code 128 elsewhere on the row (a label with two barcodes side
 * by side) does not count; it must cover most of the same span.
 */
function code128OverSameBars(bitmap: BinaryBitmap, found: Result): Result | null {
  const y0 = found.getResultPoints()?.[0]?.getY();
  if (y0 === undefined || !Number.isInteger(y0)) return null;
  const [a0, a1] = xSpan(found);
  for (let d = 0; d <= NEARBY_ROWS; d++)
    for (const y of d ? [y0 - d, y0 + d] : [y0]) {
      if (y < 0 || y >= bitmap.getHeight()) continue;
      const row = bitmap.getBlackRow(y, null as unknown as BitArray);
      for (let attempt = 0; attempt < 2; attempt++) {
        if (attempt === 1) row.reverse();
        let read: Result;
        try {
          read = code128Row.decodeRow(y, row, GS1_HINTS);
        } catch {
          continue; // Not Code 128 on this row, this way round.
        } finally {
          code128Row.reset();
        }
        // A reversed row reports mirrored positions.
        let [b0, b1] = xSpan(read);
        if (attempt === 1) [b0, b1] = [bitmap.getWidth() - b1, bitmap.getWidth() - b0];
        const overlap = Math.min(a1, b1) - Math.max(a0, b0);
        if (overlap > (a1 - a0) / 2) return read;
      }
    }
  return null;
}

function decode(reader: MultiFormatReader, bitmap: BinaryBitmap): Result | null {
  try {
    return reader.decodeWithState(bitmap);
  } catch {
    return null;
  } finally {
    reader.reset();
  }
}

function run(reader: MultiFormatReader, image: Pixels): string | null {
  if (!image.width || !image.height) return null;
  const bitmap = new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(luminance(image), image.width, image.height)));
  let result = decode(reader, bitmap);
  if (!result) return null;
  if (READ_BEFORE_CODE_128.has(result.getBarcodeFormat())) result = code128OverSameBars(bitmap, result) ?? result;
  const text = result.getText();
  return result.getBarcodeFormat() === BarcodeFormat.CODE_128 ? cleanCode128Text(text) : text;
}

/** Thorough read of a still image (a photo of a label): every format, TRY_HARDER. */
export function decodeBarcodePixels(image: Pixels): string | null {
  return run(photoReader, image);
}

/**
 * Read one camera frame, already cropped to the viewfinder's target box. A quick pass looks for every
 * live format. With `careful`, a miss is followed by a TRY_HARDER pass for straight barcodes over the
 * middle band of rows (a faint, small or noisy Code 128 often needs it); the camera loop asks for that
 * only now and then, because it costs several quick passes.
 */
export function decodeFramePixels(
  image: Pixels,
  careful = false,
): string | null {
  const quick = run(liveReader, image);
  if (quick || !careful) return quick;
  return run(liveHardReader, middleRows(image, CAREFUL_BAND, CAREFUL_ROWS));
}

/**
 * The middle `share` of an image's rows, keeping at most `max` of them, evenly spaced. TRY_HARDER reads
 * every row of a short image, so its cost follows the row count; a straight barcode is the same all the
 * way down, so skipping rows loses little.
 */
export function middleRows(image: Pixels, share: number, max: number): Pixels {
  const { width, height, data } = image;
  const span = Math.max(1, Math.min(height, Math.round(height * share)));
  const top = Math.floor((height - span) / 2);
  const rows = Math.min(span, max);
  const out = new Uint8ClampedArray(width * rows * 4);
  const rowBytes = width * 4;
  for (let i = 0; i < rows; i++) {
    const y = top + Math.floor((i * span) / rows);
    out.set(data.subarray(y * rowBytes, (y + 1) * rowBytes), i * rowBytes);
  }
  return { data: out, width, height: rows };
}
