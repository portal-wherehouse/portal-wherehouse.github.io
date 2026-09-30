// Browser decoder (ZXing) for phones without a built-in one, such as iPhone Safari: reads rendered
// Wherehouse labels, and a timing comparison of one camera frame before and after the cropped, format-limited loop.
import { describe, expect, it } from 'vitest';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import { BarcodeFormat, BinaryBitmap, DecodeHintType, HybridBinarizer, MultiFormatReader, RGBLuminanceSource } from '@zxing/library';
import { encodeCode128 } from '../../src/device/code128';
import { decodeBarcodePixels, decodeFramePixels, middleRows } from '../../src/device/barcodeDecoder';
import { DECODE_BOX, createPacer, decodeSize, scanRegion } from '../../src/device/scanFrame';

type Pixels = { data: Uint8ClampedArray; width: number; height: number };

/**
 * Small deterministic noise, so every run decodes the same picture. Kept low, like a phone camera's
 * denoised picture: per-pixel noise above ZXing's flat-area threshold (a range of 24) reads as speckle.
 */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

/** A 1280x720 camera frame: a textured grey background (a pallet wrap), with a label held in the middle. */
function frame(draw: (set: (x: number, y: number, dark: boolean) => void) => { w: number; h: number }, seed = 7): Pixels {
  const width = 1280;
  const height = 720;
  const data = new Uint8ClampedArray(width * height * 4);
  const r = rng(seed);
  for (let i = 0; i < width * height; i++) {
    const x = i % width;
    const v = 120 + 30 * Math.sin(x / 37) + r() * 6;
    data[i * 4] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  const marks: [number, number][] = [];
  const size = draw((x, y, dark) => dark && marks.push([x, y]));
  // White label with a margin, centered.
  const pad = 30;
  const left = Math.round((width - size.w) / 2);
  const top = Math.round((height - size.h) / 2);
  for (let y = top - pad; y < top + size.h + pad; y++)
    for (let x = left - pad; x < left + size.w + pad; x++) {
      const o = (y * width + x) * 4;
      const v = 220 + r() * 14;
      data[o] = data[o + 1] = data[o + 2] = v;
    }
  for (const [x, y] of marks) {
    const o = ((top + y) * width + left + x) * 4;
    const v = 40 + r() * 14;
    data[o] = data[o + 1] = data[o + 2] = v;
  }
  return { data, width, height };
}

function code128Frame(text: string, module = 2, barHeight = 120) {
  const { widths, modules } = encodeCode128(text);
  return frame((set) => {
    let x = 0;
    widths.forEach((w, i) => {
      if (i % 2 === 0) for (let dx = 0; dx < w * module; dx++) for (let y = 0; y < barHeight; y++) set(x + dx, y, true);
      x += w * module;
    });
    return { w: modules * module, h: barHeight };
  });
}

function qrFrame(text: string, module = 5) {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const n = qr.modules.size;
  return frame((set) => {
    for (let my = 0; my < n; my++)
      for (let mx = 0; mx < n; mx++)
        if (qr.modules.get(my, mx)) for (let dy = 0; dy < module; dy++) for (let dx = 0; dx < module; dx++) set(mx * module + dx, my * module + dy, true);
    return { w: n * module, h: n * module };
  });
}

function crop(img: Pixels, x: number, y: number, w: number, h: number): Pixels {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let row = 0; row < h; row++) out.set(img.data.subarray(((y + row) * img.width + x) * 4, ((y + row) * img.width + x + w) * 4), row * w * 4);
  return { data: out, width: w, height: h };
}

/** What each camera frame went through before: jsQR, then ZXing on the whole frame, every format, TRY_HARDER. */
const oldReader = new MultiFormatReader();
const oldHints = new Map<DecodeHintType, unknown>([
  [
    DecodeHintType.POSSIBLE_FORMATS,
    [BarcodeFormat.QR_CODE, BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.ITF, BarcodeFormat.DATA_MATRIX],
  ],
  [DecodeHintType.TRY_HARDER, true],
  [DecodeHintType.ASSUME_GS1, true],
]);
function oldFrame(img: Pixels): string | null {
  const qr = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
  if (qr?.data) return qr.data;
  const lum = new Uint8ClampedArray(img.width * img.height);
  for (let i = 0; i < lum.length; i++) lum[i] = (img.data[i * 4] + 2 * img.data[i * 4 + 1] + img.data[i * 4 + 2]) / 4;
  try {
    return oldReader.decode(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(lum, img.width, img.height))), oldHints).getText();
  } catch {
    return null;
  } finally {
    oldReader.reset();
  }
}

/**
 * What the camera loop does now, with a 4:3 viewfinder over a 16:9 camera: decode only the target box,
 * and now and then (careful) everything on screen, trying harder.
 */
function newFrame(img: Pixels, careful = false): string | null {
  const r = scanRegion(img.width, img.height, 400, 300, careful ? { w: 1, h: 1 } : DECODE_BOX);
  const size = decodeSize(r);
  expect(size).toEqual({ w: r.w, h: r.h }); // no scaling needed at 720p
  return decodeFramePixels(crop(img, r.x, r.y, r.w, r.h), careful);
}

function median(fn: () => unknown, runs = 5): number {
  fn(); // warm up
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t = performance.now();
    fn();
    times.push(performance.now() - t);
  }
  return times.sort((a, b) => a - b)[Math.floor(runs / 2)];
}

describe('browser barcode decoder', () => {
  const pallet = code128Frame('P-000042');
  const rack = code128Frame('A-03-02');
  const qr = qrFrame('PL1:P:ABCDEFGHJKMNPQRS');
  const empty = frame(() => ({ w: 400, h: 200 }));

  it('reads printed Code 128 codes and label QR codes from the cropped frame', () => {
    expect(newFrame(pallet)).toBe('P-000042');
    expect(newFrame(rack)).toBe('A-03-02');
    expect(newFrame(rack, true)).toBe('A-03-02');
    expect(newFrame(qr)).toBe('PL1:P:ABCDEFGHJKMNPQRS');
    expect(newFrame(empty)).toBeNull();
    expect(newFrame(empty, true)).toBeNull();
  });

  it('still reads a whole photo with every format', () => {
    expect(decodeBarcodePixels(pallet)).toBe('P-000042');
    expect(decodeBarcodePixels(qr)).toBe('PL1:P:ABCDEFGHJKMNPQRS');
  });

  it('keeps the middle rows for the careful pass', () => {
    const img = { data: new Uint8ClampedArray(4 * 2 * 10).map((_, i) => Math.floor(i / 8)), width: 2, height: 10 };
    const band = middleRows(img, 0.5, 3);
    expect(band.height).toBe(3);
    // Rows 2..6 are the middle half; three of them, evenly spaced: 2, 3, 5.
    expect([band.data[0], band.data[8], band.data[16]]).toEqual([2, 3, 5]);
  });

  it('decodes a camera frame faster than before', { timeout: 120_000 }, () => {
    const cases = { 'Code 128 label': pallet, 'QR label': qr, 'no label': empty };
    const rows: string[] = [];
    let oldTotal = 0;
    let newTotal = 0;
    for (const [name, img] of Object.entries(cases)) {
      const before = median(() => oldFrame(img));
      const after = median(() => newFrame(img));
      const careful = median(() => newFrame(img, true));
      oldTotal += before;
      newTotal += after;
      rows.push(`${name.padEnd(15)} before ${before.toFixed(1).padStart(6)} ms   after ${after.toFixed(1).padStart(5)} ms   careful ${careful.toFixed(1).padStart(5)} ms`);
    }
    console.log(`Decode time per 1280x720 frame (median of 5, Node):\n${rows.join('\n')}`);
    expect(newTotal).toBeLessThan(oldTotal);
  });
});

describe('scan region', () => {
  it('matches what a 4:3 viewfinder shows of a 16:9 camera, then takes the centered target box', () => {
    // Cover crops the sides: 960x720 of the frame is on screen, and the box is 80% x 86% of that.
    expect(scanRegion(1280, 720, 400, 300)).toEqual({ x: 256, y: 51, w: 768, h: 619 });
  });

  it('uses the whole frame when the viewfinder has no size yet', () => {
    expect(scanRegion(640, 480, 0, 0)).toEqual({ x: 64, y: 34, w: 512, h: 413 });
    expect(scanRegion(0, 0, 400, 300)).toEqual({ x: 0, y: 0, w: 0, h: 0 });
  });

  it('scales large crops down, never up', () => {
    expect(decodeSize({ w: 1920, h: 1080 })).toEqual({ w: 960, h: 540 });
    expect(decodeSize({ w: 600, h: 400 })).toEqual({ w: 600, h: 400 });
  });
});

describe('scan pacer', () => {
  it('runs one attempt at a time', () => {
    const p = createPacer();
    expect(p.ready(0)).toBe(true);
    p.start();
    expect(p.ready(1000)).toBe(false);
    p.done(1000, 20, false);
    expect(p.ready(1000)).toBe(false);
    expect(p.ready(1050)).toBe(true);
  });

  it('waits longer after slow attempts, within the limits', () => {
    const p = createPacer({ minGapMs: 50, maxGapMs: 400, busyShare: 0.5 });
    p.start();
    p.done(0, 120, false);
    expect(p.ready(119)).toBe(false);
    expect(p.ready(120)).toBe(true);
    p.start();
    p.done(0, 2000, false);
    expect(p.ready(399)).toBe(false);
    expect(p.ready(400)).toBe(true);
  });

  it('pauses after a read and asks for a careful pass every few misses', () => {
    const p = createPacer({ thoroughEvery: 3, afterHitMs: 300 });
    const careful: boolean[] = [];
    for (let i = 0; i < 7; i++) {
      careful.push(p.start());
      p.done(0, 10, false);
    }
    expect(careful).toEqual([false, false, false, true, false, false, true]);
    p.start();
    p.done(0, 10, true);
    expect(p.misses).toBe(0);
    expect(p.ready(299)).toBe(false);
    expect(p.ready(300)).toBe(true);
  });
});
