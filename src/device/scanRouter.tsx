// Scan router: every way of reading a code (hardware scanner, camera, photo, typing) ends up here,
// and the screen that is listening gets it. Screens register with useScanTarget; the most recently
// registered enabled target goes first and may pass a scan on by returning false.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { attachWedge } from './wedge';

export type ScanSource = 'wedge' | 'serial' | 'camera' | 'photo' | 'typed' | 'demo';

export interface ScanEvent {
  id: number;
  text: string;
  source: ScanSource;
  at: number;
  /** For hardware scans: milliseconds from the first to the last character. */
  durationMs?: number;
  /** Name of the target that handled it, or null when nothing did. */
  handledBy: string | null;
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

/** Return true when the scan was used; false passes it to the next target. */
export type ScanHandler = (e: ScanEvent) => boolean;

interface ScanRouterApi {
  settings: ScannerSettings;
  setSettings(patch: Partial<ScannerSettings>): void;
  /** Feed a scan in from any source. Returns the name of the target that handled it, or null. */
  emit(text: string, source: ScanSource, extra?: { durationMs?: number }): string | null;
  /** Register a target; returns an unregister function. Prefer the useScanTarget hook. */
  register(name: string, handler: ScanHandler): () => void;
  /** The last 30 scans, newest first. */
  recent: ScanEvent[];
  clearRecent(): void;
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

const Ctx = createContext<ScanRouterApi | null>(null);

export function ScanRouterProvider({ children }: { children: ReactNode }) {
  const [settings, setSettingsState] = useState<ScannerSettings>(loadSettings);
  const [recent, setRecent] = useState<ScanEvent[]>([]);
  const targets = useRef<{ name: string; handler: { current: ScanHandler } }[]>([]);
  const seq = useRef(0);
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

  const emit = useCallback((text: string, source: ScanSource, extra: { durationMs?: number } = {}) => {
    const clean = text.replace(/[\r\n\t]+/g, '').trim();
    if (!clean) return null;
    const ev: ScanEvent = { id: ++seq.current, text: clean, source, at: Date.now(), durationMs: extra.durationMs, handledBy: null };
    for (let i = targets.current.length - 1; i >= 0; i--) {
      const t = targets.current[i];
      if (t.handler.current(ev)) {
        ev.handledBy = t.name;
        break;
      }
    }
    setRecent((r) => [ev, ...r].slice(0, 30));
    return ev.handledBy;
  }, []);

  const register = useCallback((name: string, handler: ScanHandler) => {
    const entry = { name, handler: { current: handler } };
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

  const clearRecent = useCallback(() => setRecent([]), []);
  const value = useMemo<ScanRouterApi>(() => ({ settings, setSettings, emit, register, recent, clearRecent }), [settings, setSettings, emit, register, recent, clearRecent]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useScanRouter(): ScanRouterApi {
  const c = useContext(Ctx);
  if (!c) throw new Error('useScanRouter outside ScanRouterProvider');
  return c;
}

/**
 * Make this screen the place scans go while it is mounted and `enabled`.
 * The handler always sees the latest props; return false to let the next target try.
 */
export function useScanTarget(name: string, handler: ScanHandler, enabled = true) {
  const { register } = useScanRouter();
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!enabled) return;
    return register(name, (e) => ref.current(e));
  }, [name, enabled, register]);
}
