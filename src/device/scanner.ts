// Scanner adapter (blueprint page 16): native BarcodeDetector when available, a maintained
// browser decoder (jsQR) otherwise, and manual code entry on every device (in the UI).
// Camera access is only requested after a user action, prefers the rear camera, and stops
// its tracks when the scanner closes.

import jsQR from 'jsqr';

type Detector = { detect(source: CanvasImageSource): Promise<{ rawValue: string }[]> };

function nativeDetector(): Detector | null {
  const BD = (globalThis as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
  if (!BD) return null;
  try {
    return new BD({ formats: ['qr_code'] });
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
  decoder: 'native' | 'jsqr';
}

export async function startCamera(video: HTMLVideoElement, onText: (text: string) => void, onError: (e: CameraError, message: string) => void): Promise<CameraSession | null> {
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
  const native = nativeDetector();
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  const open = async () => {
    stream?.getTracks().forEach((t) => t.stop());
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    video.srcObject = stream;
    video.setAttribute('playsinline', 'true');
    video.muted = true;
    await video.play();
  };

  try {
    await open();
  } catch (err) {
    const name = (err as DOMException)?.name;
    if (name === 'NotAllowedError' || name === 'SecurityError') onError('denied', 'Camera access was blocked. Allow the camera in your browser settings, or type the printed code.');
    else if (name === 'NotFoundError' || name === 'OverconstrainedError') onError('unavailable', 'No camera was found. Type the printed code instead.');
    else onError('failed', 'The camera could not start. Type the printed code instead.');
    return null;
  }

  let last = 0;
  const tick = async () => {
    if (stopped) return;
    const now = performance.now();
    if (now - last > 140 && video.readyState >= 2) {
      last = now;
      try {
        if (native) {
          const codes = await native.detect(video);
          if (codes[0]?.rawValue) onText(codes[0].rawValue);
        } else if (ctx) {
          const w = video.videoWidth;
          const h = video.videoHeight;
          const scale = Math.min(1, 720 / Math.max(w, h));
          canvas.width = Math.round(w * scale);
          canvas.height = Math.round(h * scale);
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
          if (code?.data) onText(code.data);
        }
      } catch {
        /* a bad frame is not an error */
      }
    }
    raf = requestAnimationFrame(() => void tick());
  };
  raf = requestAnimationFrame(() => void tick());

  return {
    decoder: native ? 'native' : 'jsqr',
    stop() {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
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

/** Decode a QR code from a photo the user took or picked (works where live camera is unavailable). */
export async function decodeImageFile(file: File): Promise<string | null> {
  const bitmap = await loadBitmap(file);
  if (!bitmap) return null;
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
  }
  return null;
}

async function loadBitmap(file: Blob): Promise<ImageBitmap | HTMLImageElement | null> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = URL.createObjectURL(file);
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
