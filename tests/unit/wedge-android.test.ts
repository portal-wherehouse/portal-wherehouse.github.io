// Android scanner phones (Zebra DataWedge and others) in keystroke mode: the patterns their scans arrive in, and
// that the keyboard-wedge detector reads each one as exactly one scan. No device needed: events are simulated.
import { describe, expect, it, vi } from 'vitest';
import { SCAN_CATCHER_ATTR, WedgeDetector, attachWedge, isEditableTarget, isScanCatcher, looseIdleMs, type WedgeOptions } from '../../src/device/wedge';

const OPTS: WedgeOptions = { minLength: 4, maxGapMs: 50, suffix: 'either', prefix: '' };

/** A stand-in for an element: enough for attachWedge (tag, type, attributes, value). */
function element(tagName: string, attrs: Record<string, string> = {}) {
  return {
    tagName,
    type: attrs.type ?? (tagName === 'INPUT' ? 'text' : undefined),
    value: '',
    hasAttribute: (name: string) => name in attrs,
  };
}
type FakeElement = ReturnType<typeof element>;

const catcherEl = () => element('INPUT', { [SCAN_CATCHER_ATTR]: '' });

/** A document that records listeners by event type and dispatches simulated events to them. */
class FakeDoc {
  activeElement: unknown = element('BODY');
  listeners: { type: string; fn: (e: Event) => void }[] = [];
  addEventListener(type: string, fn: (e: Event) => void) {
    this.listeners.push({ type, fn });
  }
  removeEventListener(type: string, fn: (e: Event) => void) {
    this.listeners = this.listeners.filter((l) => !(l.type === type && l.fn === fn));
  }
  private fire(type: string, fields: Record<string, unknown>) {
    const ev = {
      type,
      target: this.activeElement,
      isComposing: false,
      defaultPrevented: false,
      stopped: false,
      ...fields,
      preventDefault() {
        ev.defaultPrevented = true;
      },
      stopPropagation() {
        ev.stopped = true;
      },
    };
    for (const l of this.listeners) if (l.type === type) l.fn(ev as unknown as Event);
    return ev;
  }
  /** A keydown as Chrome reports it. `key` may be '' or 'Unidentified' (keyCode 229 from a keyboard service). */
  key(key: string, at: number, extra: Record<string, unknown> = {}) {
    const ev = this.fire('keydown', { key, timeStamp: at, ctrlKey: false, altKey: false, metaKey: false, repeat: false, ...extra });
    // A printable key that nobody prevented types into a focused field, as the browser would.
    const target = this.activeElement as FakeElement;
    if (!ev.defaultPrevented && key.length === 1 && target.tagName === 'INPUT') {
      target.value += key;
      this.fire('input', { timeStamp: at, inputType: 'insertText', data: key });
    }
    return ev;
  }
  /** Text put into the focused field by a keyboard service, without a readable keydown. */
  input(text: string, at: number, inputType = 'insertText') {
    const before = this.fire('beforeinput', { timeStamp: at, inputType, data: text });
    if (before.defaultPrevented) return before;
    const target = this.activeElement as FakeElement;
    target.value += text;
    return this.fire('input', { timeStamp: at, inputType, data: text });
  }
  paste(text: string, at: number) {
    return this.fire('paste', { timeStamp: at, clipboardData: { getData: () => text } });
  }
}

/** Start listening on a fresh fake document; returns it and the scan spy. */
function listen(options: WedgeOptions = OPTS, focus?: FakeElement) {
  const doc = new FakeDoc();
  if (focus) doc.activeElement = focus;
  const onScan = vi.fn();
  const stop = attachWedge(doc as unknown as Document, () => options, onScan);
  return { doc, onScan, stop };
}

const scans = (spy: ReturnType<typeof vi.fn>) => spy.mock.calls.map((c) => (c[0] as { text: string }).text);

describe('Android scanner phones: keystroke patterns', () => {
  it('reads very fast keystrokes, even several with the same timestamp', () => {
    const { doc, onScan } = listen();
    for (const ch of 'P-000016') doc.key(ch, 1000);
    doc.key('Enter', 1000);
    expect(scans(onScan)).toEqual(['P-000016']);
  });

  it('reads keydowns that carry e.key with keyCode 0 (DataWedge key events)', () => {
    const { doc, onScan } = listen();
    let t = 500;
    for (const ch of 'A-03-01') doc.key(ch, (t += 2), { keyCode: 0, which: 0 });
    const enter = doc.key('Enter', t + 2, { keyCode: 13 });
    expect(scans(onScan)).toEqual(['A-03-01']);
    expect(enter.defaultPrevented).toBe(true);
  });

  it('accepts a Tab suffix as well as Enter', () => {
    const { doc, onScan } = listen();
    let t = 0;
    for (const ch of 'P-000017') doc.key(ch, (t += 3));
    const tab = doc.key('Tab', t + 3);
    expect(scans(onScan)).toEqual(['P-000017']);
    expect(tab.defaultPrevented).toBe(true);
  });

  it('does not let "Unidentified" keys break a burst on the page', () => {
    const d = new WedgeDetector(OPTS);
    let t = 0;
    for (const ch of 'P-0000') d.feed({ key: ch, at: (t += 3) });
    d.feed({ key: 'Unidentified', at: (t += 1) });
    d.feed({ key: 'Process', at: (t += 1) });
    for (const ch of '16') d.feed({ key: ch, at: (t += 3) });
    expect(d.feed({ key: 'Enter', at: t + 3 }).scan?.text).toBe('P-000016');
  });
});

describe('Android scanner phones: the scan catcher', () => {
  it('is not a text box for the wedge, so the page still listens while it has focus', () => {
    const c = catcherEl();
    expect(isScanCatcher(c as unknown as EventTarget)).toBe(true);
    expect(isEditableTarget(c as unknown as EventTarget)).toBe(false);
    expect(isEditableTarget(element('INPUT') as unknown as EventTarget)).toBe(true);
  });

  it('reads keydowns with e.key once, and keeps them out of the field so nothing counts twice', () => {
    const c = catcherEl();
    const { doc, onScan } = listen(OPTS, c);
    let t = 0;
    for (const ch of 'P-000016') {
      const ev = doc.key(ch, (t += 4));
      expect(ev.defaultPrevented).toBe(true);
    }
    doc.key('Enter', t + 4);
    expect(scans(onScan)).toEqual(['P-000016']);
    expect(c.value).toBe('');
  });

  it('reads characters that arrive as input events after keyCode 229 keydowns', () => {
    const c = catcherEl();
    const { doc, onScan } = listen(OPTS, c);
    let t = 0;
    for (const ch of 'P-000016') {
      doc.key('Unidentified', (t += 3), { keyCode: 229 });
      doc.input(ch, t);
    }
    doc.key('Enter', t + 3);
    expect(scans(onScan)).toEqual(['P-000016']);
    expect(c.value).toBe('');
  });

  it('reads characters from input events with an empty e.key', () => {
    const c = catcherEl();
    const { doc, onScan } = listen(OPTS, c);
    let t = 0;
    for (const ch of 'A-03-01') {
      doc.key('', (t += 2), { keyCode: 229 });
      doc.input(ch, t);
    }
    doc.key('Enter', t + 2);
    expect(scans(onScan)).toEqual(['A-03-01']);
  });

  it('reads a whole code delivered in one input event, with the Enter after it', () => {
    const c = catcherEl();
    const { doc, onScan } = listen(OPTS, c);
    doc.input('PL1:P:ABCDEFGHIJKLMNOP', 100, 'insertText');
    doc.key('Enter', 104);
    expect(scans(onScan)).toEqual(['PL1:P:ABCDEFGHIJKLMNOP']);
  });

  it('reads a whole code with its line break inside the same input event', () => {
    const c = catcherEl();
    const { doc, onScan } = listen(OPTS, c);
    doc.input('P-000016\n', 100);
    expect(scans(onScan)).toEqual(['P-000016']);
  });

  it('treats a line break typed into the catcher (beforeinput) as Enter', () => {
    const c = catcherEl();
    const { doc, onScan } = listen(OPTS, c);
    doc.input('P-000016', 100);
    const br = doc.input('', 103, 'insertLineBreak');
    expect(br.defaultPrevented).toBe(true);
    expect(scans(onScan)).toEqual(['P-000016']);
  });

  it('finishes a whole-code burst with no suffix once the characters stop', async () => {
    const c = catcherEl();
    const { doc, onScan } = listen(OPTS, c);
    doc.input('A-03-01', performance.now(), 'insertFromPaste');
    expect(onScan).not.toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, looseIdleMs(OPTS) + 80));
    expect(scans(onScan)).toEqual(['A-03-01']);
  });

  it('finishes fast keystrokes with no suffix in the catcher (a phone not yet set to send Enter)', async () => {
    const c = catcherEl();
    const { doc, onScan } = listen(OPTS, c);
    let t = performance.now();
    for (const ch of 'P-000016') doc.key(ch, (t += 3));
    await new Promise((r) => setTimeout(r, looseIdleMs(OPTS) + 80));
    expect(scans(onScan)).toEqual(['P-000016']);
  });

  it('does not count a whole-code burst twice when the scanner also sends Enter', async () => {
    const c = catcherEl();
    const { doc, onScan } = listen(OPTS, c);
    const t = performance.now();
    doc.input('P-000016', t);
    doc.key('Enter', t + 20);
    await new Promise((r) => setTimeout(r, looseIdleMs(OPTS) + 80));
    expect(scans(onScan)).toEqual(['P-000016']);
  });

  it('never reads slow typing in the catcher as a scan', async () => {
    const c = catcherEl();
    const { doc, onScan } = listen(OPTS, c);
    let t = performance.now();
    for (const ch of 'P-000016') doc.key(ch, (t += 150));
    doc.key('Enter', t + 150);
    await new Promise((r) => setTimeout(r, looseIdleMs(OPTS) + 80));
    expect(onScan).not.toHaveBeenCalled();
  });

  it('waits for a composition to end before reading the field', () => {
    const c = catcherEl();
    const { doc, onScan } = listen(OPTS, c);
    c.value = 'P-000016';
    // Mid-composition input events are left alone.
    for (const l of doc.listeners.filter((x) => x.type === 'input')) l.fn({ type: 'input', target: c, isComposing: true, timeStamp: 100 } as unknown as Event);
    expect(c.value).toBe('P-000016');
    for (const l of doc.listeners.filter((x) => x.type === 'compositionend')) l.fn({ type: 'compositionend', target: c, timeStamp: 101 } as unknown as Event);
    doc.key('Enter', 104);
    expect(scans(onScan)).toEqual(['P-000016']);
    expect(c.value).toBe('');
  });
});

describe('Android scanner phones: pastes and other fields', () => {
  it('reads a whole-code paste on the page as one scan', () => {
    const { doc, onScan } = listen();
    const ev = doc.paste('P-000016\r\n', 100);
    expect(ev.defaultPrevented).toBe(true);
    expect(scans(onScan)).toEqual(['P-000016']);
  });

  it('leaves a paste into an ordinary text box alone', () => {
    const { doc, onScan } = listen(OPTS, element('INPUT'));
    const ev = doc.paste('P-000016\n', 100);
    expect(ev.defaultPrevented).toBe(false);
    expect(onScan).not.toHaveBeenCalled();
  });

  it('leaves input events in ordinary text boxes alone', () => {
    const box = element('INPUT');
    const { doc, onScan } = listen(OPTS, box);
    doc.input('P-000016\n', 100);
    expect(box.value).toBe('P-000016\n');
    expect(onScan).not.toHaveBeenCalled();
  });

  it('still needs a suffix for keystrokes outside the catcher, so fast typing on a page is not a scan', async () => {
    const { doc, onScan } = listen();
    let t = performance.now();
    for (const ch of 'P-000016') doc.key(ch, (t += 3));
    await new Promise((r) => setTimeout(r, looseIdleMs(OPTS) + 80));
    expect(onScan).not.toHaveBeenCalled();
  });

  it('removes every listener when stopped', () => {
    const { doc, stop } = listen();
    expect(new Set(doc.listeners.map((l) => l.type))).toEqual(new Set(['keydown', 'beforeinput', 'input', 'compositionend', 'paste']));
    stop();
    expect(doc.listeners).toHaveLength(0);
  });
});
