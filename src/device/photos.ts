// Photo intake (blueprint page 25): validate real content (not the extension), normalize orientation,
// strip metadata by re-encoding, compress on the device, and make a modest thumbnail.

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export interface PreparedPhoto {
  data_url: string;
  thumb_url: string;
  media_type: 'image/jpeg';
  bytes: number;
  original_bytes: number;
  width: number;
  height: number;
}

export class PhotoError extends Error {}

/** Identify JPEG, PNG, or WebP from the file's first bytes. */
export async function sniffImageType(file: Blob): Promise<'image/jpeg' | 'image/png' | 'image/webp' | null> {
  const b = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  return null;
}

async function decode(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new PhotoError('That image could not be read.'));
      img.src = URL.createObjectURL(file);
    });
  }
}

function render(src: ImageBitmap | HTMLImageElement, maxSide: number, quality: number): { url: string; w: number; h: number } {
  const w0 = 'naturalWidth' in src ? src.naturalWidth : src.width;
  const h0 = 'naturalHeight' in src ? src.naturalHeight : src.height;
  const scale = Math.min(1, maxSide / Math.max(w0, h0));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w0 * scale));
  canvas.height = Math.max(1, Math.round(h0 * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new PhotoError('This device cannot process photos.');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(src as CanvasImageSource, 0, 0, canvas.width, canvas.height);
  return { url: canvas.toDataURL('image/jpeg', quality), w: canvas.width, h: canvas.height };
}

export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  if (file.size > MAX_PHOTO_BYTES * 4) throw new PhotoError('That photo is too large. Photos are limited to 5 MB.');
  const type = await sniffImageType(file);
  if (!type) throw new PhotoError('Only JPEG, PNG, or WebP photos can be attached.');
  const img = await decode(file);
  const w = 'naturalWidth' in img ? img.naturalWidth : img.width;
  const h = 'naturalHeight' in img ? img.naturalHeight : img.height;
  if (w * h > 60_000_000) throw new PhotoError('That image is too large to process safely.');
  const full = render(img, 1600, 0.82);
  const thumb = render(img, 320, 0.72);
  const bytes = Math.round((full.url.length - 'data:image/jpeg;base64,'.length) * 0.75);
  if (bytes > MAX_PHOTO_BYTES) throw new PhotoError('Even after compression this photo is over 5 MB.');
  return { data_url: full.url, thumb_url: thumb.url, media_type: 'image/jpeg', bytes, original_bytes: file.size, width: full.w, height: full.h };
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
