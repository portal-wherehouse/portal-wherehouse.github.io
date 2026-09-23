// App-wide state: backend, session (demo account), navigation, preferences, toasts.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { uuid } from '../domain/codes';
import type { CommandEnvelope, CommandKind, Pallet, Role } from '../domain/types';
import type { Backend, Outcome } from '../data/backend';
import { ReadError, type Engine } from '../demo/engine';

export type RouteName =
  | 'welcome'
  | 'receive'
  | 'move'
  | 'find'
  | 'pallet'
  | 'overview'
  | 'map'
  | 'activity'
  | 'reconcile'
  | 'jobs'
  | 'job'
  | 'locations'
  | 'location'
  | 'labels'
  | 'import'
  | 'export'
  | 'people'
  | 'sync'
  | 'lab'
  | 'guide'
  | 'settings'
  | 'about'
  | 'more';

export interface Route {
  name: RouteName;
  id?: string;
  /** Free-form parameters, e.g. a prefilled search or a pallet to move. */
  q?: string;
}

export interface Prefs {
  theme: 'system' | 'light' | 'dark';
  text: 'normal' | 'large';
  explain: boolean;
  startTab: 'receive' | 'move' | 'find' | 'overview';
  haptics: boolean;
}

/** A theme the embedding page stamped before the app started (the hosted preview does this). */
const HOST_THEME = typeof document !== 'undefined' ? document.documentElement.getAttribute('data-theme') : null;

const DEFAULT_PREFS: Prefs = { theme: 'system', text: 'normal', explain: true, startTab: 'find', haptics: true };

function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function readLocalRaw(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
  } catch {
    /* per-viewer convenience only */
  }
}

export interface Toast {
  id: number;
  text: string;
  tone: 'ok' | 'error' | 'info';
}

export interface SendOptions {
  commandId?: string;
  expectedVersion?: number;
}

interface AppState {
  backend: Backend;
  v: number;
  actorId: string | null;
  workspaceId: string | null;
  role: Role | null;
  signIn(userId: string, workspaceId?: string): void;
  signOut(): void;
  setWorkspace(id: string): void;
  route: Route;
  go(r: Route | RouteName): void;
  back(): void;
  canGoBack: boolean;
  prefs: Prefs;
  setPrefs(p: Partial<Prefs>): void;
  toasts: Toast[];
  toast(text: string, tone?: Toast['tone']): void;
  envelope(kind: CommandKind, payload: Record<string, unknown>, pallet?: Pallet | null, opts?: SendOptions): CommandEnvelope;
  send(kind: CommandKind, payload: Record<string, unknown>, pallet?: Pallet | null, opts?: SendOptions): Promise<Outcome>;
  sendEnvelope(cmd: CommandEnvelope): Promise<Outcome>;
  tourOpen: boolean;
  setTourOpen(open: boolean): void;
  /** Warn before leaving a screen with unsaved input (page 10, navigation safety). */
  setLeaveGuard(message: string | null): void;
  blockedNav: { message: string; proceed: () => void; cancel: () => void } | null;
  /** Safe read helper: runs a read against the right engine (cache while offline); null on permission errors. */
  read<T>(fn: (engine: Engine, actor: string, ws: string) => T): T | null;
}

const Ctx = createContext<AppState | null>(null);

export function useApp(): AppState {
  const c = useContext(Ctx);
  if (!c) throw new Error('useApp outside provider');
  return c;
}

const ROUTE_TOKENS: RouteName[] = ['receive', 'move', 'find', 'overview', 'map', 'activity', 'reconcile', 'jobs', 'locations', 'labels', 'import', 'export', 'people', 'sync', 'lab', 'guide', 'settings', 'about', 'more'];

export function AppProvider({ backend, children }: { backend: Backend; children: ReactNode }) {
  const v = useSyncExternalStore(
    (fn) => backend.subscribe(fn),
    () => backend.version,
  );
  const [prefs, setPrefsState] = useState<Prefs>(() => readLocal('pl.prefs', DEFAULT_PREFS));
  const [actorId, setActor] = useState<string | null>(() => readLocalRaw('pl.actor'));
  const [workspaceId, setWs] = useState<string | null>(() => readLocalRaw('pl.workspace'));
  const [stack, setStack] = useState<Route[]>(() => {
    const hash = typeof location !== 'undefined' ? (location.hash.replace('#', '') as RouteName) : null;
    if (hash && ROUTE_TOKENS.includes(hash)) return [{ name: hash }];
    return [{ name: readLocalRaw('pl.actor') ? readLocal('pl.prefs', DEFAULT_PREFS).startTab : 'welcome' }];
  });
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [tourOpen, setTourOpenState] = useState<boolean>(() => readLocalRaw('pl.tour') === 'open');
  const toastId = useRef(0);
  const guard = useRef<string | null>(null);
  const [blocked, setBlocked] = useState<{ message: string; next: Route | RouteName | 'back' } | null>(null);

  // Keep the session valid across resets: fall back to the first workspace the user belongs to.
  const db = backend.db;
  const resolvedWs = useMemo(() => {
    if (!actorId) return null;
    const mine = db.memberships.filter((m) => m.user_id === actorId);
    if (workspaceId && mine.some((m) => m.workspace_id === workspaceId)) return workspaceId;
    return mine[0]?.workspace_id ?? Object.keys(db.workspaces)[0] ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actorId, workspaceId, db, v]);

  const role = useMemo(() => {
    if (!actorId || !resolvedWs) return null;
    return backend.engine.membership(actorId, resolvedWs)?.role ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actorId, resolvedWs, v]);

  useEffect(() => {
    const root = document.documentElement;
    // "Match device" hands the theme back to whatever the host page chose, if anything.
    if (prefs.theme === 'system') {
      if (HOST_THEME) root.setAttribute('data-theme', HOST_THEME);
      else root.removeAttribute('data-theme');
    } else root.setAttribute('data-theme', prefs.theme);
    root.setAttribute('data-text', prefs.text);
  }, [prefs.theme, prefs.text]);

  const route = stack[stack.length - 1];
  useEffect(() => {
    try {
      const token = ROUTE_TOKENS.includes(route.name) ? route.name : '';
      const want = token ? `#${token}` : '';
      if (location.hash !== want) history.replaceState(null, '', want || location.pathname + location.search);
    } catch {
      /* hash sync is cosmetic */
    }
    window.scrollTo?.({ top: 0 });
  }, [route]);

  const rawGo = useCallback((r: Route | RouteName) => {
    const next = typeof r === 'string' ? { name: r } : r;
    setStack((s) => {
      const top = s[s.length - 1];
      if (top.name === next.name && top.id === next.id && top.q === next.q) return s;
      const primary: RouteName[] = ['receive', 'move', 'find', 'overview', 'more', 'welcome'];
      if (primary.includes(next.name)) return [next];
      return [...s.slice(-20), next];
    });
  }, []);

  const rawBack = useCallback(() => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)), []);

  const go = useCallback(
    (r: Route | RouteName) => {
      if (guard.current) setBlocked({ message: guard.current, next: r });
      else rawGo(r);
    },
    [rawGo],
  );

  const back = useCallback(() => {
    if (guard.current) setBlocked({ message: guard.current, next: 'back' });
    else rawBack();
  }, [rawBack]);

  const setLeaveGuard = useCallback((message: string | null) => {
    guard.current = message;
  }, []);

  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      if (guard.current) e.preventDefault();
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, []);

  const blockedNav = blocked
    ? {
        message: blocked.message,
        proceed: () => {
          guard.current = null;
          const n = blocked.next;
          setBlocked(null);
          if (n === 'back') rawBack();
          else rawGo(n);
        },
        cancel: () => setBlocked(null),
      }
    : null;

  const setPrefs = useCallback((p: Partial<Prefs>) => {
    setPrefsState((cur) => {
      const next = { ...cur, ...p };
      writeLocal('pl.prefs', next);
      return next;
    });
  }, []);

  const toast = useCallback((text: string, tone: Toast['tone'] = 'ok') => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-2), { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'error' ? 6000 : 3400);
  }, []);

  const signIn = useCallback(
    (userId: string, ws?: string) => {
      setActor(userId);
      writeLocal('pl.actor', userId);
      if (ws) {
        setWs(ws);
        writeLocal('pl.workspace', ws);
      }
      const m = backend.db.memberships.find((x) => x.user_id === userId && (!ws || x.workspace_id === ws));
      setStack([{ name: m?.role === 'VIEWER' ? 'find' : prefs.startTab }]);
    },
    [backend, prefs.startTab],
  );

  const signOut = useCallback(() => {
    guard.current = null;
    setActor(null);
    writeLocal('pl.actor', null);
    setStack([{ name: 'welcome' }]);
  }, []);

  const setWorkspace = useCallback((id: string) => {
    setWs(id);
    writeLocal('pl.workspace', id);
    setStack([{ name: 'find' }]);
  }, []);

  const envelope = useCallback(
    (kind: CommandKind, payload: Record<string, unknown>, pallet?: Pallet | null, opts: SendOptions = {}): CommandEnvelope => ({
      schema_version: 1,
      command_id: opts.commandId ?? uuid(),
      workspace_id: resolvedWs ?? '',
      kind,
      payload,
      ...(pallet ? { pallet_id: pallet.id, expected_version: opts.expectedVersion ?? pallet.version } : {}),
    }),
    [resolvedWs],
  );

  const sendEnvelope = useCallback(
    async (cmd: CommandEnvelope): Promise<Outcome> => {
      if (!actorId) return { status: 'result', result: { ok: false, command_id: cmd.command_id, kind: cmd.kind, code: 'AUTH_REQUIRED', message: 'Choose an account first.', correlation_id: '-' } };
      return backend.send(actorId, cmd);
    },
    [actorId, backend],
  );

  const send = useCallback(
    (kind: CommandKind, payload: Record<string, unknown>, pallet?: Pallet | null, opts: SendOptions = {}) => sendEnvelope(envelope(kind, payload, pallet, opts)),
    [envelope, sendEnvelope],
  );

  const read = useCallback(
    <T,>(fn: (engine: Engine, actor: string, ws: string) => T): T | null => {
      if (!actorId || !resolvedWs) return null;
      try {
        return fn(backend.reader, actorId, resolvedWs);
      } catch (e) {
        if (e instanceof ReadError) return null;
        throw e;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [actorId, resolvedWs, backend, v],
  );

  const setTourOpen = useCallback((open: boolean) => {
    setTourOpenState(open);
    writeLocal('pl.tour', open ? 'open' : 'closed');
  }, []);

  const value: AppState = {
    backend,
    v,
    actorId,
    workspaceId: resolvedWs,
    role,
    signIn,
    signOut,
    setWorkspace,
    route,
    go,
    back,
    canGoBack: stack.length > 1,
    prefs,
    setPrefs,
    toasts,
    toast,
    envelope,
    send,
    sendEnvelope,
    tourOpen,
    setTourOpen,
    setLeaveGuard,
    blockedNav,
    read,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** The engine that reads should use: cached snapshot while offline. */
export function useReader() {
  const { backend } = useApp();
  return backend.reader;
}
