let zxingInstance: {
  reader: any;
  hints: any;
  BinaryBitmap: any;
  HybridBinarizer: any;
  RGBLuminanceSource: any;
} | null = null;

async function loadZxing() {
  if (!zxingInstance) {
    const z = await import("@zxing/library");
    const hints = new Map<any, unknown>([
      [
        z.DecodeHintType.POSSIBLE_FORMATS,
        [
          z.BarcodeFormat.QR_CODE,
          z.BarcodeFormat.CODE_128,
          z.BarcodeFormat.CODE_39,
          z.BarcodeFormat.EAN_13,
          z.BarcodeFormat.EAN_8,
          z.BarcodeFormat.UPC_A,
          z.BarcodeFormat.UPC_E,
          z.BarcodeFormat.ITF,
          z.BarcodeFormat.DATA_MATRIX,
        ],
      ],
      [z.DecodeHintType.TRY_HARDER, true],
      [z.DecodeHintType.ASSUME_GS1, true],
    ]);
    const reader = new z.MultiFormatReader();
    zxingInstance = {
      reader,
      hints,
      BinaryBitmap: z.BinaryBitmap,
      HybridBinarizer: z.HybridBinarizer,
      RGBLuminanceSource: z.RGBLuminanceSource,
    };
  }
  return zxingInstance;
}

/** Pixels stay on this device. Lazy-loaded on-demand only when a scanner fallback is used. */
export async function decodeBarcodePixels(
  image: Pick<ImageData, "data" | "width" | "height">,
): Promise<string | null> {
  const { reader, hints, BinaryBitmap, HybridBinarizer, RGBLuminanceSource } =
    await loadZxing();
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
