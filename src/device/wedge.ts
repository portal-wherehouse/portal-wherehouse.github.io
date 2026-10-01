// Keyboard-wedge scanners: USB or Bluetooth scanners that "type" what they read, usually followed by Enter.
// WedgeDetector tells a scanner burst from a person typing by the time between characters; attachWedge wires it to a page.
//
// Android scanner phones (Zebra DataWedge, Honeywell, Datalogic and others) type too, but not always one keydown per
// character. With a text field focused, the phone's keyboard service may send keydowns with no key ("Unidentified",
// key code 229) and put the characters in through input events, sometimes the whole code at once. The scan catcher
// (a hidden field marked data-scan-catcher, see ScanCatcher) receives those, and attachWedge reads them as keystrokes.

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
  /**
   * The key went to the scan catcher, a field only scanners type into. A burst there may end without Enter or Tab:
   * it is finished once the characters stop, because scanner phones often send no suffix until set up to.
   */
  loose?: boolean;
}

export interface WedgeStep {
  /** The scan this key completed, if any. */
  scan: WedgeScan | null;
  /**
   * True when the key belongs to a scanner: its own Enter or Tab, or a character that continues a burst at scanner
   * speed. The caller should stop it from reaching the page, where it could press a button or fire a shortcut
   * (such as "/" for search) in the middle of a scan.
   */
  consume: boolean;
}

// Keys a scanner presses on the way to a character (Shift for capitals). They never end or break a burst.
const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'AltGraph', 'Meta', 'CapsLock', 'NumLock', 'ScrollLock', 'OS', 'Fn', 'FnLock', 'Hyper', 'Super', 'Symbol']);

// Keys with no character of their own. An Android keyboard service sends these and delivers the text through an
// input event instead, so they neither add to nor break a burst.
const SILENT_KEYS = new Set(['Unidentified', 'Process']);

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
 * A burst that may end without a suffix (one that arrived in a single piece, or into the scan catcher) is finished
 * once the characters stop for this long. It waits past the suffix gap, so a scanner's own Enter still ends it.
 */
export function looseIdleMs(o: WedgeOptions): number {
  return suffixGapMs(o) + 50;
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
  /** The current burst may end without a suffix. */
  private loose = false;
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
    this.loose = false;
  }

  feed(k: WedgeKey): WedgeStep {
    const o = this.options();
    if (MODIFIER_KEYS.has(k.key) || SILENT_KEYS.has(k.key)) return NOTHING;
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
    const continues = this.chars.length > 0 && k.at - this.last <= o.maxGapMs;
    if (this.chars.length && !continues) {
      // The previous burst is over. Without a suffix, it may have been a whole scan.
      if (o.suffix === 'none') scan = this.complete(o);
      this.reset();
    }
    if (!this.chars.length) this.first = k.at;
    this.chars.push(k.key);
    this.last = k.at;
    if (k.loose) this.loose = true;
    // The first character could be a person; one that follows it this fast is a scanner.
    return { scan, consume: continues };
  }

  /**
   * Feed characters that arrived as text rather than one keydown each: an input event in the scan catcher, or a
   * paste outside a text field. A line break ends the code like Enter, a tab like Tab. Two or more characters in one
   * event cannot be a person typing, so that burst may end without a suffix. Returns the scans it completed.
   */
  feedText(text: string, at: number, options: { loose?: boolean } = {}): WedgeScan[] {
    const chars = [...text.replace(/\r\n/g, '\n')];
    const loose = !!options.loose || chars.filter((c) => c !== '\n' && c !== '\r' && c !== '\t').length > 1;
    const scans: WedgeScan[] = [];
    for (const ch of chars) {
      const key = ch === '\n' || ch === '\r' ? 'Enter' : ch === '\t' ? 'Tab' : ch;
      const step = this.feed({ key, at, loose });
      if (step.scan) scans.push(step.scan);
    }
    return scans;
  }

  /** When the caller should call `idle()` to finish a scan that has no suffix, or null when nothing is waiting. */
  nextIdleAt(): number | null {
    const o = this.options();
    if (!this.chars.length) return null;
    if (o.suffix === 'none') return this.last + idleTimeoutMs(o);
    return this.loose ? this.last + looseIdleMs(o) : null;
  }

  /** Call when time passes with no keys. Finishes a no-suffix scan once the characters have stopped. */
  idle(now: number): WedgeScan | null {
    const o = this.options();
    if (!this.chars.length) return null;
    if (o.suffix === 'none' || this.loose) {
      if (now - this.last < (o.suffix === 'none' ? idleTimeoutMs(o) : looseIdleMs(o))) return null;
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

/** Marks the scan catcher: a hidden field that only scanners type into (see ScanCatcher). */
export const SCAN_CATCHER_ATTR = 'data-scan-catcher';

/** True for the scan catcher, whose characters are read as scans, never as typing. */
export function isScanCatcher(t: EventTarget | null | undefined): boolean {
  const el = t as Element | null | undefined;
  return !!el && typeof el.hasAttribute === 'function' && el.hasAttribute(SCAN_CATCHER_ATTR);
}

/** True when keystrokes on this element type into it (text inputs, text areas, selects, editable content). Not the scan catcher. */
export function isEditableTarget(t: EventTarget | null | undefined): boolean {
  if (!t || typeof (t as Element).tagName !== 'string') return false;
  if (isScanCatcher(t)) return false;
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
 * them like normal typing). Elsewhere, a completed burst is reported, and the rest of a burst after its first
 * character, plus the scanner's Enter or Tab, is swallowed so it cannot press a focused button or fire a page
 * shortcut. Returns a function that stops listening.
 *
 * Also read like keystrokes: text that reaches the scan catcher through input events (Android keyboard services),
 * and a paste outside a text field (some scanners hand over the whole code that way).
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

  const report = (scans: (WedgeScan | null)[]) => {
    schedule();
    for (const scan of scans) if (scan) onScan(scan);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.isComposing) return;
    const catcher = isScanCatcher(e.target);
    if (!catcher && (isEditableTarget(e.target) || isEditableTarget(doc.activeElement))) {
      detector.reset();
      clearTimeout(timer);
      return;
    }
    // Android keyboard services may send keyCode 229 with no key at all; the character follows as an input event.
    const key = e.key || 'Unidentified';
    const step = detector.feed({ key, at: clock(e), ctrlKey: e.ctrlKey, altKey: e.altKey, metaKey: e.metaKey, repeat: e.repeat, loose: catcher });
    // A character read here must not also land in the catcher as an input event, or it would count twice.
    if (step.consume || (catcher && key.length === 1 && !e.ctrlKey && !e.metaKey)) e.preventDefault();
    if (step.consume) e.stopPropagation();
    report([step.scan]);
  };

  /** Read what the catcher received without a readable keydown, then empty it. */
  const takeCatcherText = (el: HTMLInputElement, at: number) => {
    const text = el.value;
    if (!text) return;
    el.value = '';
    report(detector.feedText(text, at, { loose: true }));
  };

  const onBeforeInput = (e: Event) => {
    const type = (e as InputEvent).inputType;
    // A line break typed into the catcher is the scanner's Enter.
    if (!isScanCatcher(e.target) || (type !== 'insertLineBreak' && type !== 'insertParagraph')) return;
    e.preventDefault();
    report([detector.feed({ key: 'Enter', at: clock(e), loose: true }).scan]);
  };

  const onInput = (e: Event) => {
    if (isScanCatcher(e.target) && !(e as InputEvent).isComposing) takeCatcherText(e.target as HTMLInputElement, clock(e));
  };

  const onCompositionEnd = (e: Event) => {
    if (isScanCatcher(e.target)) takeCatcherText(e.target as HTMLInputElement, clock(e));
  };

  const onPaste = (e: ClipboardEvent) => {
    if (!isScanCatcher(e.target) && (isEditableTarget(e.target) || isEditableTarget(doc.activeElement))) return;
    const text = e.clipboardData?.getData('text');
    if (!text) return;
    e.preventDefault();
    report(detector.feedText(text, clock(e), { loose: true }));
  };

  const listeners: [string, EventListener][] = [
    ['keydown', onKeyDown as EventListener],
    ['beforeinput', onBeforeInput],
    ['input', onInput],
    ['compositionend', onCompositionEnd],
    ['paste', onPaste as EventListener],
  ];
  for (const [type, fn] of listeners) doc.addEventListener(type, fn, true);
  return () => {
    for (const [type, fn] of listeners) doc.removeEventListener(type, fn, true);
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
