import {
  MultiFormatReader,
  BarcodeFormat,
  DecodeHintType,
  RGBLuminanceSource,
  BinaryBitmap,
  HybridBinarizer,
} from "@zxing/library";

const hints = new Map<DecodeHintType, unknown>([
  [
    DecodeHintType.POSSIBLE_FORMATS,
    [
      BarcodeFormat.QR_CODE,
      BarcodeFormat.CODE_128,
      BarcodeFormat.CODE_39,
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
      BarcodeFormat.ITF,
      BarcodeFormat.DATA_MATRIX,
    ],
  ],
  [DecodeHintType.TRY_HARDER, true],
  [DecodeHintType.ASSUME_GS1, true],
]);
const reader = new MultiFormatReader();

/** Pixels stay on this device. Lazy-loaded only when a scanner is used. */
export function decodeBarcodePixels(
  image: Pick<ImageData, "data" | "width" | "height">,
): string | null {
  const luminance = new Uint8ClampedArray(image.width * image.height);
  for (let i = 0; i < luminance.length; i++) {
    const offset = i * 4;
    luminance[i] =
      (image.data[offset] +
        2 * image.data[offset + 1] +
        image.data[offset + 2]) /
      4;
  }
  try {
    return reader
      .decode(
        new BinaryBitmap(
          new HybridBinarizer(
            new RGBLuminanceSource(luminance, image.width, image.height),
          ),
        ),
        hints,
      )
      .getText();
  } catch {
    return null;
  } finally {
    reader.reset();
  }
}
