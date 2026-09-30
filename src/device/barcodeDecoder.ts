import {
  MultiFormatReader,
  BarcodeFormat,
  DecodeHintType,
  RGBLuminanceSource,
  BinaryBitmap,
  HybridBinarizer,
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

function run(reader: MultiFormatReader, image: Pixels): string | null {
  if (!image.width || !image.height) return null;
  try {
    return reader
      .decodeWithState(
        new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(luminance(image), image.width, image.height))),
      )
      .getText();
  } catch {
    return null;
  } finally {
    reader.reset();
  }
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
