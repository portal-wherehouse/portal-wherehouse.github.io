// Keyboard-wedge scanners (USB or Bluetooth scanners that "type" what they read, then press Enter).
// PLACEHOLDER: the scanner-integration work replaces this with a timing-based detector.

export interface WedgeOptions {
  minLength: number;
  maxGapMs: number;
  suffix: 'enter' | 'tab' | 'either' | 'none';
  prefix: string;
}

export interface WedgeScan {
  text: string;
  durationMs: number;
}

/** Listen for scanner bursts on a document. Returns a function that stops listening. */
export function attachWedge(_doc: Document, _getOptions: () => WedgeOptions, _onScan: (scan: WedgeScan) => void): () => void {
  return () => {};
}
