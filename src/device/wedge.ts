// Keyboard-wedge scanners: USB or Bluetooth scanners that "type" what they read, usually followed by Enter.
// WedgeDetector tells a scanner burst from a person typing by the time between characters; attachWedge wires it to a page.

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

/** One keydown, reduced to what the detector needs. `at` is milliseconds on any steady clock. */
export interface WedgeKey {
  key: string;
  at: number;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  repeat?: boolean;
}

export interface WedgeStep {
  /** The scan this key completed, if any. */
  scan: WedgeScan | null;
  /** True when the key was the scanner's own Enter or Tab: the caller should stop it from reaching the page. */
  consume: boolean;
}

// Keys a scanner presses on the way to a character (Shift for capitals). They never end or break a burst.
const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'AltGraph', 'Meta', 'CapsLock', 'NumLock', 'ScrollLock', 'OS', 'Fn', 'FnLock', 'Hyper', 'Super', 'Symbol']);

const NOTHING: WedgeStep = { scan: null, consume: false };

/** With no suffix, a scan is complete once the characters stop for this long. */
export function idleTimeoutMs(o: WedgeOptions): number {
  return Math.max(100, o.maxGapMs * 2);
}

/** The Enter or Tab after a scan may lag the last character a little, but never like a person reaching for the key. */
function suffixGapMs(o: WedgeOptions): number {
  return Math.max(o.maxGapMs * 2, o.maxGapMs + 30);
}

/**
 * Pure scanner detector. Feed it every keydown (with timestamps) that happened outside a text field.
 * Characters closer together than `maxGapMs` form a burst; a burst of at least `minLength` characters
 * (after removing `prefix`) that ends with the configured suffix is a scan. Anything slower is a person.
 */
export class WedgeDetector {
  private chars: string[] = [];
  private first = 0;
  private last = 0;
  private readonly options: () => WedgeOptions;

  constructor(options: WedgeOptions | (() => WedgeOptions)) {
    this.options = typeof options === 'function' ? options : () => options;
  }

  /** Characters collected so far in the current burst. */
  get pending(): string {
    return this.chars.join('');
  }

  reset() {
    this.chars = [];
  }

  feed(k: WedgeKey): WedgeStep {
    const o = this.options();
    if (MODIFIER_KEYS.has(k.key)) return NOTHING;
    // Shortcuts and held keys are people. AltGr arrives as Ctrl+Alt on some layouts and still types a character.
    if (k.repeat || k.metaKey || (k.ctrlKey && !k.altKey)) {
      this.reset();
      return NOTHING;
    }

    if (k.key === 'Enter' || k.key === 'Tab') {
      const which = k.key === 'Enter' ? 'enter' : 'tab';
      // "No suffix" still accepts an Enter or Tab if the scanner sends one anyway.
      const accepted = o.suffix === 'either' || o.suffix === 'none' || o.suffix === which;
      const scan = accepted && k.at - this.last <= suffixGapMs(o) ? this.complete(o) : null;
      this.reset();
      return { scan, consume: scan !== null };
    }

    // Backspace, arrows, Escape, function keys: a person is editing or navigating.
    if (k.key.length !== 1) {
      this.reset();
      return NOTHING;
    }

    let scan: WedgeScan | null = null;
    if (this.chars.length && k.at - this.last > o.maxGapMs) {
      // The previous burst is over. Without a suffix, it may have been a whole scan.
      if (o.suffix === 'none') scan = this.complete(o);
      this.reset();
    }
    if (!this.chars.length) this.first = k.at;
    this.chars.push(k.key);
    this.last = k.at;
    return { scan, consume: false };
  }

  /** When the caller should call `idle()` to finish a scan that has no suffix, or null when nothing is waiting. */
  nextIdleAt(): number | null {
    const o = this.options();
    if (o.suffix !== 'none' || !this.chars.length) return null;
    return this.last + idleTimeoutMs(o);
  }

  /** Call when time passes with no keys. Finishes a no-suffix scan once the characters have stopped. */
  idle(now: number): WedgeScan | null {
    const o = this.options();
    if (!this.chars.length) return null;
    if (o.suffix === 'none') {
      if (now - this.last < idleTimeoutMs(o)) return null;
      const scan = this.complete(o);
      this.reset();
      return scan;
    }
    if (now - this.last > suffixGapMs(o)) this.reset();
    return null;
  }

  private complete(o: WedgeOptions): WedgeScan | null {
    if (!this.chars.length) return null;
    let text = this.chars.join('');
    if (o.prefix) {
      if (!text.startsWith(o.prefix)) return null;
      text = text.slice(o.prefix.length);
    }
    text = text.trim();
    if (!text || text.length < Math.max(1, o.minLength)) return null;
    return { text, durationMs: Math.max(0, this.last - this.first) };
  }
}

// Inputs a person types into. Checkboxes, buttons and sliders are not: a scan while one has focus still counts.
const NON_TEXT_INPUTS = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file', 'image', 'hidden']);

/** True when keystrokes on this element type into it (text inputs, text areas, selects, editable content). */
export function isEditableTarget(t: EventTarget | null | undefined): boolean {
  if (!t || typeof (t as Element).tagName !== 'string') return false;
  const el = t as HTMLElement;
  const tag = el.tagName.toUpperCase();
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') return !NON_TEXT_INPUTS.has(((el as HTMLInputElement).type || 'text').toLowerCase());
  return el.isContentEditable === true;
}

function clock(e?: Event): number {
  // Event time is when the key was pressed, so a busy page cannot squeeze slow typing into a fast burst.
  if (e && e.timeStamp > 0) return e.timeStamp;
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/**
 * Listen for scanner bursts on a document. Keys typed into text fields are left alone (the field gets
 * them like normal typing). Elsewhere, a completed burst is reported and the scanner's Enter or Tab is
 * swallowed so it cannot press a focused button. Returns a function that stops listening.
 */
export function attachWedge(doc: Document, getOptions: () => WedgeOptions, onScan: (scan: WedgeScan) => void): () => void {
  const detector = new WedgeDetector(getOptions);
  let timer: ReturnType<typeof setTimeout> | undefined;

  const schedule = () => {
    clearTimeout(timer);
    const at = detector.nextIdleAt();
    if (at === null) return;
    timer = setTimeout(() => {
      const scan = detector.idle(clock());
      if (scan) onScan(scan);
    }, Math.max(0, at - clock()) + 5);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.isComposing) return;
    if (isEditableTarget(e.target) || isEditableTarget(doc.activeElement)) {
      detector.reset();
      clearTimeout(timer);
      return;
    }
    const step = detector.feed({ key: e.key, at: clock(e), ctrlKey: e.ctrlKey, altKey: e.altKey, metaKey: e.metaKey, repeat: e.repeat });
    if (step.consume) {
      e.preventDefault();
      e.stopPropagation();
    }
    schedule();
    if (step.scan) onScan(step.scan);
  };

  doc.addEventListener('keydown', onKeyDown, true);
  return () => {
    doc.removeEventListener('keydown', onKeyDown, true);
    clearTimeout(timer);
  };
}

/**
 * Times keystrokes typed into one text box, so a scanner typing into a focused field can still be
 * recognised (and labelled) as a scanner. Call `key()` on each printable keydown, `result()` on submit.
 */
export function createTypingMeter() {
  let first = 0;
  let last = 0;
  let count = 0;
  let maxGap = 0;
  return {
    key(at: number, fieldWasEmpty: boolean) {
      if (fieldWasEmpty || count === 0) {
        first = last = at;
        count = 1;
        maxGap = 0;
        return;
      }
      maxGap = Math.max(maxGap, at - last);
      last = at;
      count++;
    },
    reset() {
      count = 0;
    },
    /** Whether the text now in the box arrived at scanner speed, and how long it took. */
    result(text: string, o: Pick<WedgeOptions, 'maxGapMs' | 'minLength'>): { fromScanner: boolean; durationMs?: number } {
      const typedAll = count > 0 && count === text.length;
      const durationMs = typedAll && count > 1 ? last - first : undefined;
      const fromScanner = typedAll && count >= Math.max(2, o.minLength) && maxGap <= o.maxGapMs;
      return { fromScanner, durationMs };
    },
  };
}
