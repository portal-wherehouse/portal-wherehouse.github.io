// Hardware scanner support: keyboard-wedge detection, scan routing priority, and the Code 128 encoder.
import { describe, expect, it, vi } from 'vitest';
import { WedgeDetector, attachWedge, createTypingMeter, isEditableTarget, type WedgeOptions } from '../../src/device/wedge';
import { dispatchScan, type ScanEvent, type ScanHandler, type ScanTargetEntry } from '../../src/device/scanRouter';
import { CODE128_PATTERNS, CODE_B, CODE_C, START_A, START_B, START_C, STOP, canEncodeCode128, code128Checksum, code128Values, encodeCode128 } from '../../src/device/code128';

const OPTS: WedgeOptions = { minLength: 4, maxGapMs: 50, suffix: 'either', prefix: '' };

/** Feed text one character at a time, `gap` ms apart, starting at `t0`; returns the time of the last key. */
function typeInto(d: WedgeDetector, text: string, gap: number, t0 = 1000) {
  const scans = [];
  let t = t0;
  for (const ch of text) {
    const step = d.feed({ key: ch, at: t });
    if (step.scan) scans.push(step.scan);
    t += gap;
  }
  return { last: t - gap, scans };
}

describe('WedgeDetector', () => {
  it('emits a fast burst that ends with Enter, and consumes that Enter', () => {
    const d = new WedgeDetector(OPTS);
    const { last } = typeInto(d, 'P-000001', 6);
    const step = d.feed({ key: 'Enter', at: last + 8 });
    expect(step.scan).toEqual({ text: 'P-000001', durationMs: 42 });
    expect(step.consume).toBe(true);
  });

  it('never emits human typing, and lets the Enter through', () => {
    const d = new WedgeDetector(OPTS);
    const { last, scans } = typeInto(d, 'P-000001', 150);
    const step = d.feed({ key: 'Enter', at: last + 150 });
    expect(scans).toEqual([]);
    expect(step).toEqual({ scan: null, consume: false });
  });

  it('ignores a quick flurry shorter than the minimum length', () => {
    const d = new WedgeDetector(OPTS);
    const { last } = typeInto(d, 'abc', 20);
    expect(d.feed({ key: 'Enter', at: last + 20 }).scan).toBeNull();
  });

  it('keeps Shift and other modifiers inside a burst (capital letters)', () => {
    const d = new WedgeDetector(OPTS);
    let t = 0;
    for (const ch of 'PL1:P:ABCD') {
      if (ch !== ch.toLowerCase() || ch === ':') d.feed({ key: 'Shift', at: (t += 2) });
      d.feed({ key: ch, at: (t += 4) });
    }
    expect(d.feed({ key: 'Enter', at: t + 5 }).scan?.text).toBe('PL1:P:ABCD');
  });

  it('starts a new burst after a pause, so earlier typing does not stick to a scan', () => {
    const d = new WedgeDetector(OPTS);
    const typed = typeInto(d, 'hello', 180, 0);
    const scanned = typeInto(d, 'A-03-02', 5, typed.last + 400);
    expect(d.feed({ key: 'Enter', at: scanned.last + 5 }).scan?.text).toBe('A-03-02');
  });

  it('rejects an Enter pressed long after the burst (a person reaching for the key)', () => {
    const d = new WedgeDetector(OPTS);
    const { last } = typeInto(d, 'P-000001', 5);
    expect(d.feed({ key: 'Enter', at: last + 400 })).toEqual({ scan: null, consume: false });
  });

  it('honors the suffix setting', () => {
    const enterOnly = new WedgeDetector({ ...OPTS, suffix: 'enter' });
    let r = typeInto(enterOnly, 'A-03-02', 5);
    expect(enterOnly.feed({ key: 'Tab', at: r.last + 5 })).toEqual({ scan: null, consume: false });

    const tabOnly = new WedgeDetector({ ...OPTS, suffix: 'tab' });
    r = typeInto(tabOnly, 'A-03-02', 5);
    expect(tabOnly.feed({ key: 'Enter', at: r.last + 5 }).scan).toBeNull();
    r = typeInto(tabOnly, 'A-03-02', 5, r.last + 500);
    const step = tabOnly.feed({ key: 'Tab', at: r.last + 5 });
    expect(step.scan?.text).toBe('A-03-02');
    expect(step.consume).toBe(true);

    const either = new WedgeDetector(OPTS);
    r = typeInto(either, 'A-03-02', 5);
    expect(either.feed({ key: 'Tab', at: r.last + 5 }).scan?.text).toBe('A-03-02');
  });

  it('with no suffix, finishes a scan once the characters stop', () => {
    const d = new WedgeDetector({ ...OPTS, suffix: 'none' });
    const { last } = typeInto(d, 'P-000042', 5);
    const due = d.nextIdleAt();
    expect(due).not.toBeNull();
    expect(d.idle(last + 20)).toBeNull();
    expect(d.idle(due!)).toEqual({ text: 'P-000042', durationMs: 35 });
    expect(d.nextIdleAt()).toBeNull();
  });

  it('with no suffix, a new burst after a pause completes the previous one', () => {
    const d = new WedgeDetector({ ...OPTS, suffix: 'none' });
    const first = typeInto(d, 'P-000042', 5);
    const second = typeInto(d, 'A-03-02', 5, first.last + 300);
    expect(second.scans.map((s) => s.text)).toEqual(['P-000042']);
    expect(d.idle(second.last + 1000)?.text).toBe('A-03-02');
  });

  it('with no suffix, slow typing never emits', () => {
    const d = new WedgeDetector({ ...OPTS, suffix: 'none' });
    const { last, scans } = typeInto(d, 'P-000042', 160);
    expect(scans).toEqual([]);
    expect(d.idle(last + 1000)).toBeNull();
  });

  it('requires and strips a configured prefix', () => {
    const d = new WedgeDetector({ ...OPTS, prefix: '#!' });
    let r = typeInto(d, '#!P-000001', 5);
    expect(d.feed({ key: 'Enter', at: r.last + 5 }).scan?.text).toBe('P-000001');
    r = typeInto(d, 'P-000001', 5, r.last + 500);
    expect(d.feed({ key: 'Enter', at: r.last + 5 })).toEqual({ scan: null, consume: false });
  });

  it('resets on editing keys, shortcuts and held keys', () => {
    const d = new WedgeDetector(OPTS);
    let r = typeInto(d, 'P-0000', 5);
    d.feed({ key: 'Backspace', at: r.last + 5 });
    r = typeInto(d, '01', 5, r.last + 10);
    expect(d.feed({ key: 'Enter', at: r.last + 5 }).scan).toBeNull();

    r = typeInto(d, 'P-000001', 5, r.last + 500);
    d.feed({ key: 'c', at: r.last + 5, ctrlKey: true });
    expect(d.feed({ key: 'Enter', at: r.last + 10 }).scan).toBeNull();

    r = typeInto(d, 'P-000', 5, r.last + 500);
    d.feed({ key: '0', at: r.last + 5, repeat: true });
    expect(d.pending).toBe('');
  });

  it('reads settings live when given a function', () => {
    let opts = { ...OPTS };
    const d = new WedgeDetector(() => opts);
    let r = typeInto(d, 'P-000001', 70);
    expect(d.feed({ key: 'Enter', at: r.last + 5 }).scan).toBeNull();
    opts = { ...OPTS, maxGapMs: 100 };
    r = typeInto(d, 'P-000001', 70, r.last + 500);
    expect(d.feed({ key: 'Enter', at: r.last + 5 }).scan?.text).toBe('P-000001');
  });
});

describe('attachWedge', () => {
  type Listener = (e: KeyboardEvent) => void;

  class FakeDoc {
    activeElement: unknown = { tagName: 'BODY' };
    listeners: { fn: Listener; capture: boolean }[] = [];
    addEventListener(_type: string, fn: Listener, capture?: boolean) {
      this.listeners.push({ fn, capture: !!capture });
    }
    removeEventListener(_type: string, fn: Listener) {
      this.listeners = this.listeners.filter((l) => l.fn !== fn);
    }
    press(key: string, at: number, target: unknown = this.activeElement) {
      const ev = { key, timeStamp: at, target, isComposing: false, ctrlKey: false, altKey: false, metaKey: false, repeat: false, defaultPrevented: false, stopped: false } as KeyboardEvent & { stopped: boolean };
      Object.assign(ev, {
        preventDefault() {
          (ev as { defaultPrevented: boolean }).defaultPrevented = true;
        },
        stopPropagation() {
          ev.stopped = true;
        },
      });
      for (const l of this.listeners) l.fn(ev);
      return ev;
    }
    type(text: string, gap: number, t0: number, target?: unknown) {
      let t = t0;
      for (const ch of text) {
        this.press(ch, t, target);
        t += gap;
      }
      return t;
    }
  }

  it('listens in the capture phase, reports scans, and swallows the scanner’s Enter', () => {
    const doc = new FakeDoc();
    const onScan = vi.fn();
    const stop = attachWedge(doc as unknown as Document, () => OPTS, onScan);
    expect(doc.listeners[0].capture).toBe(true);
    const t = doc.type('A-03-02', 5, 100);
    const enter = doc.press('Enter', t);
    expect(onScan).toHaveBeenCalledWith({ text: 'A-03-02', durationMs: 30 });
    expect(enter.defaultPrevented).toBe(true);
    stop();
    expect(doc.listeners).toHaveLength(0);
  });

  it('leaves text fields alone: the field receives the characters and its own Enter', () => {
    const doc = new FakeDoc();
    const input = { tagName: 'INPUT', type: 'text' };
    doc.activeElement = input;
    const onScan = vi.fn();
    attachWedge(doc as unknown as Document, () => OPTS, onScan);
    const t = doc.type('P-000001', 5, 100, input);
    const enter = doc.press('Enter', t, input);
    expect(onScan).not.toHaveBeenCalled();
    expect(enter.defaultPrevented).toBe(false);
  });

  it('still catches scans while a checkbox or button has focus', () => {
    const doc = new FakeDoc();
    const box = { tagName: 'INPUT', type: 'checkbox' };
    doc.activeElement = box;
    const onScan = vi.fn();
    attachWedge(doc as unknown as Document, () => OPTS, onScan);
    const t = doc.type('P-000001', 5, 100, box);
    expect(doc.press('Enter', t, box).defaultPrevented).toBe(true);
    expect(onScan).toHaveBeenCalledTimes(1);
  });

  it('does not react to slow typing on the page', () => {
    const doc = new FakeDoc();
    const onScan = vi.fn();
    attachWedge(doc as unknown as Document, () => OPTS, onScan);
    const t = doc.type('P-000001', 150, 100);
    expect(doc.press('Enter', t).defaultPrevented).toBe(false);
    expect(onScan).not.toHaveBeenCalled();
  });

  it('finishes a no-suffix scan on its own after the characters stop', async () => {
    const doc = new FakeDoc();
    const onScan = vi.fn();
    attachWedge(doc as unknown as Document, () => ({ ...OPTS, suffix: 'none' }), onScan);
    doc.type('P-000042', 2, performance.now());
    expect(onScan).not.toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 260));
    expect(onScan).toHaveBeenCalledWith(expect.objectContaining({ text: 'P-000042' }));
  });

  it('knows which elements type', () => {
    expect(isEditableTarget({ tagName: 'INPUT', type: 'text' } as unknown as EventTarget)).toBe(true);
    expect(isEditableTarget({ tagName: 'INPUT', type: 'search' } as unknown as EventTarget)).toBe(true);
    expect(isEditableTarget({ tagName: 'INPUT' } as unknown as EventTarget)).toBe(true);
    expect(isEditableTarget({ tagName: 'TEXTAREA' } as unknown as EventTarget)).toBe(true);
    expect(isEditableTarget({ tagName: 'SELECT' } as unknown as EventTarget)).toBe(true);
    expect(isEditableTarget({ tagName: 'DIV', isContentEditable: true } as unknown as EventTarget)).toBe(true);
    expect(isEditableTarget({ tagName: 'INPUT', type: 'checkbox' } as unknown as EventTarget)).toBe(false);
    expect(isEditableTarget({ tagName: 'BUTTON' } as unknown as EventTarget)).toBe(false);
    expect(isEditableTarget({ tagName: 'BODY' } as unknown as EventTarget)).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});

describe('createTypingMeter', () => {
  it('tells a scanner typing into a box from a person', () => {
    const m = createTypingMeter();
    'P-000001'.split('').forEach((_, i) => m.key(100 + i * 6, i === 0));
    expect(m.result('P-000001', OPTS)).toEqual({ fromScanner: true, durationMs: 42 });
    m.reset();
    'P-000001'.split('').forEach((_, i) => m.key(100 + i * 140, i === 0));
    expect(m.result('P-000001', OPTS).fromScanner).toBe(false);
    // Pasted or edited text does not match the keys counted.
    m.reset();
    'P-0'.split('').forEach((_, i) => m.key(100 + i * 5, i === 0));
    expect(m.result('P-000001', OPTS).fromScanner).toBe(false);
  });
});

describe('dispatchScan (scan router priority)', () => {
  const ev = (): ScanEvent => ({ id: 1, text: 'P-000001', source: 'wedge', at: 0, handledBy: null });
  let seq = 0;
  const target = (name: string, priority: number, handler: ScanHandler): ScanTargetEntry => ({ name, priority, seq: ++seq, handler: { current: handler } });

  it('tries higher priority first, whatever the mount order', () => {
    const calls: string[] = [];
    const anywhere = target('scan-anywhere', -100, () => (calls.push('anywhere'), true));
    const screen = target('move', 0, () => (calls.push('move'), true));
    expect(dispatchScan([anywhere, screen], ev()).handledBy).toBe('move');
    const late = target('scan-anywhere-late', -100, () => true);
    expect(dispatchScan([screen, late], ev()).handledBy).toBe('move');
    expect(calls).toEqual(['move', 'move']);
  });

  it('breaks priority ties by the most recent registration', () => {
    const a = target('older', 0, () => true);
    const b = target('newer', 0, () => true);
    expect(dispatchScan([a, b], ev()).handledBy).toBe('newer');
  });

  it('passes a scan on when a target returns false, and records the outcome', () => {
    const pad = target('pad', 100, () => false);
    const anywhere = target('anywhere', -100, () => true);
    const r = dispatchScan([anywhere, pad], ev());
    expect(r).toMatchObject({ handledBy: 'anywhere', outcome: 'handled' });
  });

  it('stops at a target that reports an error, or throws', () => {
    const bad = target('panel', 0, () => 'error');
    const anywhere = target('anywhere', -100, () => true);
    expect(dispatchScan([anywhere, bad], ev())).toMatchObject({ handledBy: 'panel', outcome: 'error' });
    const thrower = target('broken', 5, () => {
      throw new Error('boom');
    });
    expect(dispatchScan([anywhere, thrower], ev())).toMatchObject({ handledBy: 'broken', outcome: 'error' });
  });

  it('reports unhandled when nothing takes it', () => {
    expect(dispatchScan([target('x', 0, () => false)], ev())).toMatchObject({ handledBy: null, outcome: 'unhandled' });
    expect(dispatchScan([], ev()).outcome).toBe('unhandled');
  });
});

describe('Code 128', () => {
  const widthsOf = (p: string) => [...p].map(Number);
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

  it('has 106 symbol patterns of 11 modules plus a 13-module stop', () => {
    expect(CODE128_PATTERNS).toHaveLength(107);
    for (let v = 0; v < 106; v++) {
      const w = widthsOf(CODE128_PATTERNS[v]);
      expect(w, `value ${v}`).toHaveLength(6);
      expect(sum(w), `value ${v}`).toBe(11);
      expect(w.every((x) => x >= 1 && x <= 4)).toBe(true);
      // Code 128 parity: the three bars always cover an even number of modules.
      expect((w[0] + w[2] + w[4]) % 2, `value ${v}`).toBe(0);
    }
    expect(CODE128_PATTERNS[STOP]).toBe('2331112');
    expect(sum(widthsOf(CODE128_PATTERNS[STOP]))).toBe(13);
    expect(new Set(CODE128_PATTERNS).size).toBe(107);
  });

  it('uses every valid even-parity pattern except the two reserved for the stop codes', () => {
    const valid: string[] = [];
    const walk = (acc: number[]) => {
      if (acc.length === 6) {
        if (sum(acc) === 11 && (acc[0] + acc[2] + acc[4]) % 2 === 0) valid.push(acc.join(''));
        return;
      }
      for (let w = 1; w <= 4; w++) walk([...acc, w]);
    };
    walk([]);
    expect(valid).toHaveLength(108);
    const used = new Set(CODE128_PATTERNS.slice(0, 106));
    expect(valid.filter((p) => !used.has(p)).sort()).toEqual(['211133', '233111']);
  });

  it('has the standard start patterns and well-known symbols', () => {
    expect(CODE128_PATTERNS[START_A]).toBe('211412');
    expect(CODE128_PATTERNS[START_B]).toBe('211214');
    expect(CODE128_PATTERNS[START_C]).toBe('211232');
    expect(CODE128_PATTERNS[0]).toBe('212222'); // space in set B, "00" in set C
    expect(CODE128_PATTERNS[CODE_C]).toBe('113141');
    expect(CODE128_PATTERNS[CODE_B]).toBe('114131');
  });

  it('encodes a pallet code with set C for its digits (checksum worked by hand)', () => {
    // Start B 104; "P" = 80-32 = 48; "-" = 45-32 = 13; Code C 99; "00" "00" "42".
    // Check: 104 + 1*48 + 2*13 + 3*99 + 4*0 + 5*0 + 6*42 = 727; 727 mod 103 = 6.
    expect(code128Values('P-000042')).toEqual([104, 48, 13, 99, 0, 0, 42, 6]);
  });

  it('encodes a rack code in set B (checksum worked by hand)', () => {
    // A=33 -=13 0=16 3=19 -=13 0=16 2=18.
    // Check: 104 + 33 + 2*13 + 3*16 + 4*19 + 5*13 + 6*16 + 7*18 = 574; 574 mod 103 = 59.
    expect(code128Values('A-03-02')).toEqual([104, 33, 13, 16, 19, 13, 16, 18, 59]);
  });

  it('encodes a command barcode (checksum worked by hand)', () => {
    // C=35 M=45 D=36 :=26 C=35 O=47 N=46 F=38 I=41 R=50 M=45.
    // 104+35+90+108+104+175+282+322+304+369+500+495 = 2888; 2888 mod 103 = 4.
    expect(code128Values('CMD:CONFIRM')).toEqual([104, 35, 45, 36, 26, 35, 47, 46, 38, 41, 50, 45, 4]);
  });

  it('starts in set C for all-digit data', () => {
    // 105 + 1*12 + 2*34 + 3*56 = 353; 353 mod 103 = 44.
    expect(code128Values('123456')).toEqual([105, 12, 34, 56, 44]);
    expect(code128Values('12')).toEqual([105, 12, code128Checksum([105, 12])]);
  });

  it('switches to set C only for long digit runs, keeping odd digits in set B', () => {
    const v = code128Values('A1234567B');
    // A, "1" in set B, Code C, 23 45 67, Code B, B.
    expect(v.slice(0, -1)).toEqual([104, 33, 17, CODE_C, 23, 45, 67, CODE_B, 34]);
    expect(code128Values('AB12CD').slice(0, -1)).toEqual([104, 33, 34, 17, 18, 35, 36]);
  });

  it('returns module widths from the start code through the stop pattern', () => {
    for (const text of ['P-000042', 'A-03-02', 'CMD:MODE_PUTAWAY', 'RECEIVING-01', '123456']) {
      const c = encodeCode128(text);
      expect(c.widths).toHaveLength(c.values.length * 6 + 7);
      expect(c.modules).toBe(c.values.length * 11 + 13);
      for (let i = 0; i < c.values.length; i++) expect(sum(c.widths.slice(i * 6, i * 6 + 6))).toBe(11);
      expect(c.widths.slice(0, 6).join('')).toBe(CODE128_PATTERNS[c.values[0]]);
      expect(c.widths.slice(-7).join('')).toBe('2331112');
      expect(code128Checksum(c.values.slice(0, -1))).toBe(c.values[c.values.length - 1]);
    }
  });

  it('decodes back to the original text', () => {
    const lookup = new Map(CODE128_PATTERNS.map((p, v) => [p, v]));
    const decode = (widths: number[]): string => {
      const values: number[] = [];
      for (let i = 0; i + 6 <= widths.length - 7; i += 6) values.push(lookup.get(widths.slice(i, i + 6).join(''))!);
      const data = values.slice(1, -1);
      let set = values[0] === START_C ? 'C' : 'B';
      let out = '';
      for (const v of data) {
        if (v === CODE_C) set = 'C';
        else if (v === CODE_B) set = 'B';
        else out += set === 'C' ? String(v).padStart(2, '0') : String.fromCharCode(v + 32);
      }
      return out;
    };
    for (const text of ['P-000042', 'A-03-02', 'B-01-01', 'CMD:MODE_COUNT', 'PL1:P:ABCDEFGHJKMNPQRS', '0012345678905', 'J-214', 'x 9', '12345']) {
      expect(decode(encodeCode128(text).widths)).toBe(text);
    }
  });

  it('refuses characters set B cannot hold', () => {
    expect(canEncodeCode128('P-000042')).toBe(true);
    expect(canEncodeCode128('')).toBe(false);
    expect(canEncodeCode128('café')).toBe(false);
    expect(canEncodeCode128('A\tB')).toBe(false);
    expect(() => code128Values('café')).toThrow(RangeError);
  });
});
