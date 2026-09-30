// Pure helpers for the live camera loop: which part of each frame to decode, and how often.
// Kept free of the DOM so they can be tested without a camera.

export interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Share of the visible picture the browser decoder reads, centered. The viewfinder's target box covers
 * 56% x 68% (styles.css `.viewfinder .reticle`); this adds a margin so a label held slightly off-center,
 * with its quiet zones, still fits.
 */
export const DECODE_BOX = { w: 0.8, h: 0.86 } as const;

/** Longest side of the image handed to the decoder. Larger crops are scaled down to this. */
export const MAX_DECODE_SIDE = 960;

/**
 * The part of a camera frame to decode: the centered target box of what the viewfinder shows.
 * The viewfinder draws the video with `object-fit: cover`, so part of the frame is never on screen;
 * decoding only what the person is aiming at is faster and avoids stray codes at the edges.
 */
export function scanRegion(videoW: number, videoH: number, viewW: number, viewH: number, box: { w: number; h: number } = DECODE_BOX): Region {
  if (videoW <= 0 || videoH <= 0) return { x: 0, y: 0, w: 0, h: 0 };
  // Without a laid-out viewfinder, treat the whole frame as visible.
  const scale = viewW > 0 && viewH > 0 ? Math.max(viewW / videoW, viewH / videoH) : 1;
  const visW = viewW > 0 && viewH > 0 ? Math.min(videoW, viewW / scale) : videoW;
  const visH = viewW > 0 && viewH > 0 ? Math.min(videoH, viewH / scale) : videoH;
  const w = Math.max(1, Math.round(visW * box.w));
  const h = Math.max(1, Math.round(visH * box.h));
  return { x: Math.round((videoW - w) / 2), y: Math.round((videoH - h) / 2), w, h };
}

/** Size to draw a region at so its longest side is at most `max` (never scaled up). */
export function decodeSize(region: Pick<Region, 'w' | 'h'>, max = MAX_DECODE_SIDE): { w: number; h: number } {
  const scale = Math.min(1, max / Math.max(region.w, region.h, 1));
  return { w: Math.max(1, Math.round(region.w * scale)), h: Math.max(1, Math.round(region.h * scale)) };
}

export interface PacerOptions {
  /** Shortest wait between decode attempts. */
  minGapMs?: number;
  /** Longest wait between attempts, however slow the device. */
  maxGapMs?: number;
  /** Share of time the decoder may keep the page busy, so the screen stays responsive on slow phones. */
  busyShare?: number;
  /** After a code is read, wait this long before looking again. */
  afterHitMs?: number;
  /** Every this many attempts without a code, try harder once. 0 turns it off. */
  thoroughEvery?: number;
}

/**
 * Decides when the camera loop may decode the next frame. One attempt at a time, and the wait after each
 * grows with how long it took, so a slow phone never queues up work or freezes the screen.
 */
export function createPacer({ minGapMs = 50, maxGapMs = 400, busyShare = 0.5, afterHitMs = 300, thoroughEvery = 4 }: PacerOptions = {}) {
  let nextAt = 0;
  let busy = false;
  let misses = 0;
  return {
    /** True when an attempt may start now. */
    ready(now: number): boolean {
      return !busy && now >= nextAt;
    },
    /** Call as an attempt starts. Returns whether this attempt should try harder. */
    start(): boolean {
      busy = true;
      return thoroughEvery > 0 && misses > 0 && misses % thoroughEvery === 0;
    },
    /** Call when an attempt finishes, with the time it finished, how long it took, and whether it read a code. */
    done(now: number, tookMs: number, found: boolean) {
      busy = false;
      misses = found ? 0 : misses + 1;
      const share = Math.min(0.95, Math.max(0.05, busyShare));
      const gap = Math.min(maxGapMs, Math.max(minGapMs, (tookMs * (1 - share)) / share));
      nextAt = now + (found ? Math.max(gap, afterHitMs) : gap);
    },
    get misses() {
      return misses;
    },
  };
}
