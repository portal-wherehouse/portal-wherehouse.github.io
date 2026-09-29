// Scan router: every way of reading a code (hardware scanner, serial scanner, camera, photo, typing) ends up here,
// and the screen that is listening gets it. Screens register with useScanTarget; targets are tried by priority
// (highest first), then most recently registered first, and each may pass a scan on by returning false.
// While a modal window is open (a sheet, a dialog, the portal tour), only targets that asked for it are tried,
// so the screen behind the window never acts on a scan the person cannot see.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { attachWedge } from './wedge';
import { serialScanner } from './serial';
import { playScanSound, type ScanSound } from './sounds';

export type ScanSource = 'wedge' | 'serial' | 'camera' | 'photo' | 'typed' | 'demo';

/** What became of a scan: a target used it, a target refused it, or nothing was listening. */
export type ScanOutcome = 'handled' | 'error' | 'unhandled';

export interface ScanEvent {
  id: number;
  text: string;
  source: ScanSource;
  at: number;
  /** For hardware scans: milliseconds from the first to the last character. */
  durationMs?: number;
  /** Name of the target that handled it, or null when nothing did. */
  handledBy: string | null;
  /** Set once the scan has been routed. */
  outcome?: ScanOutcome;
}

export interface ScannerSettings {
  /** Listen for USB and Bluetooth scanners that type like a keyboard. */
  wedge: boolean;
  /** When no screen is waiting for a scan, open whatever was scanned. */
  scanAnywhere: boolean;
  /** Shortest code a scanner burst can be. */
  minLength: number;
  /** Longest pause between two characters of one scan, in milliseconds. People type slower than this. */
  maxGapMs: number;
  /** What the scanner sends after the code. */
  suffix: 'enter' | 'tab' | 'either' | 'none';
  /** Characters the scanner sends before the code (removed before reading). */
  prefix: string;
  /** Beep on a good or bad scan. */
  sounds: boolean;
  /** Scanning the same rack a second time confirms a move, so hands stay on the scanner. */
  confirmByRescan: boolean;
}

export const DEFAULT_SCANNER_SETTINGS: ScannerSettings = {
  wedge: true,
  scanAnywhere: true,
  minLength: 4,
  maxGapMs: 50,
  suffix: 'either',
  prefix: '',
  sounds: true,
  confirmByRescan: true,
};

/**
 * Return true when the scan was used; false passes it to the next target.
 * Return 'error' when the scan was meant for you but could not be used (it stops there and plays the bad sound).
 */
export type ScanHandler = (e: ScanEvent) => boolean | 'error';

interface ScanRouterApi {
  settings: ScannerSettings;
  setSettings(patch: Partial<ScannerSettings>): void;
  /** Feed a scan in from any source. Returns the name of the target that handled it, or null. */
  emit(text: string, source: ScanSource, extra?: { durationMs?: number }): string | null;
  /** Register a target; returns an unregister function. Prefer the useScanTarget hook. */
  register(name: string, handler: ScanHandler, priority?: number, options?: ScanTargetOptions): () => void;
  /** The last 30 scans, newest first. */
  recent: ScanEvent[];
  clearRecent(): void;
  /** Scans routed since the page loaded. */
  sessionCount: number;
  /** Play the good or bad scan sound, if sounds are on. For screens that read codes themselves (camera, typed box). */
  beep(kind: ScanSound): void;
}

const SETTINGS_KEY = 'wh.scanner';

function loadSettings(): ScannerSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_SCANNER_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SCANNER_SETTINGS;
  } catch {
    return DEFAULT_SCANNER_SETTINGS;
  }
}

export interface ScanTargetOptions {
  /** Also offer scans while a modal window is open. For targets that handle that case themselves (Scan anywhere) or change nothing (the test pad). */
  whileModal?: boolean;
}

/** A registered receiver of scans. `seq` grows with each registration, so newer targets win ties. */
export interface ScanTargetEntry {
  name: string;
  priority: number;
  seq: number;
  whileModal?: boolean;
  handler: { current: ScanHandler };
}

/** True when a modal window (a sheet, a dialog, the portal tour) is open over the screen. */
export function modalOpen(): boolean {
  return typeof document !== 'undefined' && !!document.querySelector('[role="dialog"][aria-modal="true"]');
}

/** Remove the scanner's configured prefix from a code a scanner sent, when it starts with it. */
export function stripScanPrefix(text: string, prefix: string): string {
  return prefix && text.startsWith(prefix) ? text.slice(prefix.length) : text;
}

/**
 * Offer a scan to targets, highest priority first, then newest first, until one takes it.
 * With `modal` set, only targets registered `whileModal` are offered it.
 * Sets `handledBy` and `outcome` on the event. A handler that throws counts as refusing the scan with an error.
 */
export function dispatchScan(targets: readonly ScanTargetEntry[], ev: ScanEvent, modal = false): ScanEvent {
  const order = targets.filter((t) => !modal || t.whileModal).sort((a, b) => b.priority - a.priority || b.seq - a.seq);
  for (const t of order) {
    let r: boolean | 'error';
    try {
      r = t.handler.current(ev);
    } catch {
      r = 'error';
    }
    if (r) {
      ev.handledBy = t.name;
      ev.outcome = r === 'error' ? 'error' : 'handled';
      return ev;
    }
  }
  ev.outcome = 'unhandled';
  return ev;
}

const Ctx = createContext<ScanRouterApi | null>(null);

export function ScanRouterProvider({ children }: { children: ReactNode }) {
  const [settings, setSettingsState] = useState<ScannerSettings>(loadSettings);
  const [recent, setRecent] = useState<ScanEvent[]>([]);
  const [sessionCount, setSessionCount] = useState(0);
  const targets = useRef<ScanTargetEntry[]>([]);
  const seq = useRef(0);
  const registrations = useRef(0);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const setSettings = useCallback((patch: Partial<ScannerSettings>) => {
    setSettingsState((cur) => {
      const next = { ...cur, ...patch };
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      } catch {
        /* settings still apply for this visit */
      }
      return next;
    });
  }, []);

  const beep = useCallback((kind: ScanSound) => {
    if (settingsRef.current.sounds) playScanSound(kind);
  }, []);

  const emit = useCallback(
    (text: string, source: ScanSource, extra: { durationMs?: number } = {}) => {
      const clean = text.replace(/[\r\n\t]+/g, '').trim();
      if (!clean) return null;
      const ev = dispatchScan(targets.current, { id: ++seq.current, text: clean, source, at: Date.now(), durationMs: extra.durationMs, handledBy: null }, modalOpen());
      beep(ev.outcome === 'handled' ? 'good' : 'bad');
      setRecent((r) => [ev, ...r].slice(0, 30));
      setSessionCount((n) => n + 1);
      return ev.handledBy;
    },
    [beep],
  );

  const register = useCallback((name: string, handler: ScanHandler, priority = 0, options: ScanTargetOptions = {}) => {
    const entry: ScanTargetEntry = { name, priority, seq: ++registrations.current, whileModal: !!options.whileModal, handler: { current: handler } };
    targets.current = [...targets.current, entry];
    return () => {
      targets.current = targets.current.filter((t) => t !== entry);
    };
  }, []);

  // Hardware scanners that type like a keyboard.
  useEffect(() => {
    if (!settings.wedge || typeof document === 'undefined') return;
    return attachWedge(
      document,
      () => ({ minLength: settingsRef.current.minLength, maxGapMs: settingsRef.current.maxGapMs, suffix: settingsRef.current.suffix, prefix: settingsRef.current.prefix }),
      (scan) => void emit(scan.text, 'wedge', { durationMs: scan.durationMs }),
    );
  }, [settings.wedge, emit]);

  // Scanners connected as a serial port (the Scanners page connects them). Keyboard scans lose their prefix in the wedge detector.
  useEffect(() => serialScanner.onLine((line) => void emit(stripScanPrefix(line, settingsRef.current.prefix), 'serial')), [emit]);

  const clearRecent = useCallback(() => setRecent([]), []);
  const value = useMemo<ScanRouterApi>(
    () => ({ settings, setSettings, emit, register, recent, clearRecent, sessionCount, beep }),
    [settings, setSettings, emit, register, recent, clearRecent, sessionCount, beep],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useScanRouter(): ScanRouterApi {
  const c = useContext(Ctx);
  if (!c) throw new Error('useScanRouter outside ScanRouterProvider');
  return c;
}

/**
 * Make this screen the place scans go while it is mounted and `enabled`.
 * Higher `priority` goes first (Scan anywhere sits at -100, a test pad well above 0); equal priorities go newest first.
 * The handler always sees the latest props; return false to let the next target try.
 * While a modal window is open the target is skipped, unless `options.whileModal` is set.
 */
export function useScanTarget(name: string, handler: ScanHandler, enabled = true, priority = 0, options: ScanTargetOptions = {}) {
  const { register } = useScanRouter();
  const ref = useRef(handler);
  ref.current = handler;
  const whileModal = !!options.whileModal;
  useEffect(() => {
    if (!enabled) return;
    return register(name, (e) => ref.current(e), priority, { whileModal });
  }, [name, enabled, register, priority, whileModal]);
}
