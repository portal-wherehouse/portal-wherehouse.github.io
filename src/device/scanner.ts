// Scanner adapter (blueprint page 16): native BarcodeDetector when available,
// the browser decoder (ZXing, on the viewfinder's target box) otherwise, jsQR and ZXing for photos,
// and manual code entry on every device (in the UI).
// Camera access is only requested after a user action, prefers the rear camera, and stops
// its tracks when the scanner closes.

import jsQR from 'jsqr';
import { DECODE_BOX, createPacer, decodeSize, scanRegion } from './scanFrame';

type Detector = { detect(source: CanvasImageSource): Promise<{ rawValue: string }[]> };

function nativeDetector(): Detector | null {
  const BD = (globalThis as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
  if (!BD) return null;
  try {
    return new BD({ formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'itf', 'data_matrix'] });
  } catch {
    return null;
  }
}

export function cameraSupported(): boolean {
  // The hosted preview's frame refuses camera access without asking, so do not offer it there.
  if (__BUILD_TARGET__ === 'artifact') return false;
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && (typeof isSecureContext === 'undefined' || isSecureContext);
}

export type CameraError = 'denied' | 'unavailable' | 'insecure' | 'failed';

export interface CameraSession {
  stop(): void;
  switchCamera(): Promise<void>;
  /** Which decoder is reading frames. Starts native where the browser has one; falls back if it keeps failing. */
  readonly decoder: 'native' | 'zxing';
  /** Whether the camera in use has a light the page can turn on. Rechecked after switchCamera. */
  readonly torchSupported: boolean;
  readonly torchOn: boolean;
  /** Turn the camera light on or off. Resolves to whether the light is now on. */
  setTorch(on: boolean): Promise<boolean>;
}

type TrackCapabilities = MediaTrackCapabilities & { focusMode?: string[]; torch?: boolean };

/**
 * Ask the camera to keep refocusing on its own, so a label held close sharpens without a tap.
 * Returns whether the camera has a light the page can control. Browsers that do not know a setting ignore it.
 */
async function tuneTrack(track: MediaStreamTrack | undefined): Promise<boolean> {
  if (!track || typeof track.getCapabilities !== 'function') return false;
  let caps: TrackCapabilities;
  try {
    caps = track.getCapabilities() as TrackCapabilities;
  } catch {
    return false;
  }
  if (caps.focusMode?.includes('continuous')) {
    await track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] }).catch(() => {});
  }
  return caps.torch === true;
}

/**
 * Open the camera on `video` and read codes from it. Aborting `signal` (the screen closed before the camera
 * opened) releases the camera quietly and leaves the video element alone, so a second start on the same
 * element, as React's development mode does on every mount, is never cut off by the first.
 */
export async function startCamera(video: HTMLVideoElement, onText: (text: string) => void, onError: (e: CameraError, message: string) => void, signal?: AbortSignal): Promise<CameraSession | null> {
  if (typeof isSecureContext !== 'undefined' && !isSecureContext) {
    onError('insecure', 'The camera needs a secure (https) page. Type the printed code instead.');
    return null;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    onError('unavailable', 'This browser cannot open the camera here. Type the printed code, or scan from a photo.');
    return null;
  }
  let facing: 'environment' | 'user' = 'environment';
  let stream: MediaStream | null = null;
  let stopped = false;
  let raf = 0;
  let torchSupported = false;
  let torchOn = false;
  const native = nativeDetector();
  let nativeFailures = 0;
  const useNative = () => !!native && nativeFailures < 3;
  // The browser decoder is only loaded where it is needed, and ahead of the first frame.
  let decoder: Promise<typeof import('./barcodeDecoder')> | null = null;
  const loadDecoder = () => (decoder ??= import('./barcodeDecoder'));
  if (!native) void loadDecoder().catch(() => (decoder = null));
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  /** Clear the video only while it still shows this session's camera, never another session's. */
  const release = () => {
    stream?.getTracks().forEach((t) => t.stop());
    if (stream && video.srcObject === stream) video.srcObject = null;
  };
  const open = async () => {
    stream?.getTracks().forEach((t) => t.stop());
    torchOn = false;
    const next = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    if (signal?.aborted || stopped) {
      next.getTracks().forEach((t) => t.stop());
      throw new DOMException('The scanner closed before the camera opened.', 'AbortError');
    }
    stream = next;
    video.setAttribute('playsinline', 'true');
    video.muted = true;
    video.srcObject = stream;
    await video.play();
    torchSupported = await tuneTrack(stream.getVideoTracks()[0]);
  };

  try {
    await open();
  } catch (err) {
    release();
    if (signal?.aborted) return null;
    const name = (err as DOMException)?.name;
    if (name === 'NotAllowedError' || name === 'SecurityError') onError('denied', 'Camera access was blocked. Allow the camera in your browser settings, or type the printed code.');
    else if (name === 'NotFoundError' || name === 'OverconstrainedError') onError('unavailable', 'No camera was found. Type the printed code instead.');
    else onError('failed', 'The camera could not start. Type the printed code instead.');
    return null;
  }

  /** One look at the current frame. Resolves to whether it read a code. */
  const attempt = async (careful: boolean): Promise<boolean> => {
    if (useNative()) {
      try {
        const codes = await native!.detect(video);
        nativeFailures = 0;
        const text = codes.find((c) => c.rawValue)?.rawValue;
        if (text && !stopped) onText(text);
        return !!text;
      } catch {
        // A detector that keeps failing hands over to the browser decoder for the rest of this session.
        if (++nativeFailures < 3) return false;
      }
    }
    if (!ctx) return false;
    // Most looks read only the target box; a careful look reads everything on screen, for a label held too close.
    const region = scanRegion(video.videoWidth, video.videoHeight, video.clientWidth, video.clientHeight, careful ? { w: 1, h: 1 } : DECODE_BOX);
    const size = decodeSize(region);
    if (!region.w || !region.h) return false;
    if (canvas.width !== size.w) canvas.width = size.w;
    if (canvas.height !== size.h) canvas.height = size.h;
    ctx.drawImage(video, region.x, region.y, region.w, region.h, 0, 0, size.w, size.h);
    const { decodeFramePixels } = await loadDecoder();
    const text = decodeFramePixels(ctx.getImageData(0, 0, size.w, size.h), careful);
    if (text && !stopped) onText(text);
    return !!text;
  };

  // One look at a time, spaced out by how long the last one took, so a slow phone never piles up work.
  const pacer = createPacer();
  const tick = () => {
    if (stopped) return;
    raf = requestAnimationFrame(tick);
    const now = performance.now();
    if (!pacer.ready(now) || video.readyState < 2 || !video.videoWidth) return;
    const careful = pacer.start();
    void attempt(careful)
      .catch(() => false) // a bad frame is not an error
      .then((found) => {
        const end = performance.now();
        pacer.done(end, end - now, found);
      });
  };
  raf = requestAnimationFrame(tick);

  return {
    get decoder() {
      return useNative() ? 'native' : 'zxing';
    },
    get torchSupported() {
      return torchSupported;
    },
    get torchOn() {
      return torchOn;
    },
    async setTorch(on: boolean) {
      const track = stream?.getVideoTracks()[0];
      if (!track || !torchSupported) return false;
      try {
        await track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] });
        torchOn = on;
      } catch {
        /* the light stays as it was */
      }
      return torchOn;
    },
    stop() {
      stopped = true;
      cancelAnimationFrame(raf);
      release();
    },
    async switchCamera() {
      facing = facing === 'environment' ? 'user' : 'environment';
      try {
        await open();
      } catch {
        onError('failed', 'Could not switch cameras.');
      }
    },
  };
}

/** Decode a barcode or QR code from a photo the user took or picked (works where live camera is unavailable). */
export async function decodeImageFile(file: File): Promise<string | null> {
  const bitmap = await loadBitmap(file);
  if (!bitmap) return null;
  try {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  const native = nativeDetector();
  if (native) {
    try {
      const r = await native.detect(bitmap as CanvasImageSource);
      if (r[0]?.rawValue) return r[0].rawValue;
    } catch {
      /* fall through to jsQR */
    }
  }
  for (const size of [1000, 1600, 700, 2200]) {
    const scale = Math.min(1, size / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    ctx.drawImage(bitmap as CanvasImageSource, 0, 0, canvas.width, canvas.height);
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' });
    if (code?.data) return code.data;
    const text = (await import('./barcodeDecoder')).decodeBarcodePixels(img);
    if (text) return text;
  }
  return null;
  } finally { if ('close' in bitmap) bitmap.close(); }
}

async function loadBitmap(file: Blob): Promise<ImageBitmap | HTMLImageElement | null> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    });
  }
}

/** Short haptic confirmation where the device supports it. */
export function buzz(pattern: number | number[] = 30) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* unsupported */
  }
}
