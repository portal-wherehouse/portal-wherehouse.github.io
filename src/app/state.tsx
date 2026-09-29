// App-wide state: backend, session (demo account), navigation, preferences, toasts.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { uuid } from '../domain/codes';
import type { CommandEnvelope, CommandKind, Pallet, Role } from '../domain/types';
import type { Backend, Outcome } from '../data/backend';
import { ReadError, type Engine } from '../demo/engine';

/** Public website pages (no account needed). */
export const SITE_ROUTES = ['home', 'product', 'showcase', 'simple', 'hardware', 'industries', 'customers', 'pricing', 'founder', 'contact', 'security'] as const;
export type SiteRouteName = (typeof SITE_ROUTES)[number];

export function isSiteRoute(name: RouteName): name is SiteRouteName {
  return (SITE_ROUTES as readonly string[]).includes(name);
}

export type RouteName =
  | SiteRouteName
  /** The portal's front door: where "Open portal" lands before the app itself. */
  | 'signin'
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
  | 'more'
  | 'help'
  | 'scanners'
  | 'station'
  | 'data';

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
  advancedTools: boolean;
}

/** A theme the embedding page stamped before the app started (the hosted preview does this). */
const HOST_THEME = typeof document !== 'undefined' ? document.documentElement.getAttribute('data-theme') : null;

const DEFAULT_PREFS: Prefs = { theme: 'system', text: 'normal', explain: false, startTab: 'find', haptics: true, advancedTools: false };

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
  /** The practice-shift checklist (the blueprint's example shift). */
  tourOpen: boolean;
  setTourOpen(open: boolean): void;
  /** The portal's "Take the tour" walkthrough: which stop is showing, or null when it is closed. */
  guideStep: number | null;
  startGuide(step?: number): void;
  setGuideStep(step: number): void;
  stopGuide(): void;
  /** The Demo accounts sheet (switch role or company), opened from the top bar, Settings or a locked screen. */
  accountsOpen: boolean;
  setAccountsOpen(open: boolean): void;
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

/** Routes that can be linked with a bare #anchor (no ids), e.g. #pricing or #find. */
const ROUTE_TOKENS: RouteName[] = [
  ...SITE_ROUTES.filter((r) => r !== 'home'),
  'signin',
  'receive',
  'move',
  'find',
  'overview',
  'map',
  'activity',
  'reconcile',
  'jobs',
  'locations',
  'labels',
  'import',
  'export',
  'people',
  'sync',
  'lab',
  'guide',
  'settings',
  'about',
  'more',
  'help',
  'scanners',
  'station',
  'data',
];

/** Records that link with their id, e.g. #pallet/<id>, so a reload or a shared link reopens them. */
const ID_TOKENS: RouteName[] = ['pallet', 'job', 'location', 'map'];
/** Screens whose query rides along in the link, e.g. #find?q=J-214 or #station?q=count. */
const Q_TOKENS: RouteName[] = ['find', 'station', 'help'];

/** The address-bar hash for a route: '' for home, or for a screen that has no link of its own. */
export function hashFor(r: Route): string {
  const withId = ID_TOKENS.includes(r.name) && r.id;
  if (!withId && !ROUTE_TOKENS.includes(r.name)) return '';
  let h = `#${r.name}`;
  if (withId) h += `/${encodeURIComponent(r.id!)}`;
  if (Q_TOKENS.includes(r.name) && r.q) h += `?q=${encodeURIComponent(r.q)}`;
  return h;
}

/** The route a hash links to; null for anchors that are not routes (a skip link's #main). */
export function parseHash(hash: string): Route | null {
  const raw = hash.replace(/^#/, '');
  if (!raw || raw === 'home') return { name: 'home' };
  try {
    const cut = raw.indexOf('?');
    const path = cut < 0 ? raw : raw.slice(0, cut);
    const query = cut < 0 ? '' : raw.slice(cut + 1);
    const [name, ...rest] = path.split('/') as [RouteName, ...string[]];
    const id = rest.length ? decodeURIComponent(rest.join('/')) : undefined;
    const q = Q_TOKENS.includes(name) ? (new URLSearchParams(query).get('q') ?? undefined) : undefined;
    if (id && ID_TOKENS.includes(name)) return { name, id, ...(q ? { q } : {}) };
    if (!id && ROUTE_TOKENS.includes(name)) return q ? { name, q } : { name };
  } catch {
    /* a malformed link is treated like any unknown anchor */
  }
  return null;
}

const sameRoute = (a: Route, b: Route) => a.name === b.name && (a.id ?? '') === (b.id ?? '') && (a.q ?? '') === (b.q ?? '');
const sameStack = (a: Route[], b: Route[]) => a.length === b.length && a.every((r, i) => sameRoute(r, b[i]));

/** Screens that start a fresh trail instead of stacking on the one before. */
const PRIMARY: RouteName[] = ['receive', 'move', 'find', 'overview', 'more', 'signin', 'station'];

function stackAfter(s: Route[], next: Route): Route[] {
  const top = s[s.length - 1];
  if (top && sameRoute(top, next)) return s;
  if (PRIMARY.includes(next.name) || isSiteRoute(next.name)) return [next];
  return [...s.slice(-20), next];
}

/**
 * What each browser history entry remembers: the whole trail of screens (so Back, Forward and reload
 * restore it), its position, whether the entry before it is its parent screen, and the scroll offset.
 */
interface HistState {
  wh: 1;
  idx: number;
  stack: Route[];
  up?: boolean;
  y?: number;
}

function histState(): HistState | null {
  try {
    const s = history.state as HistState | null;
    return s && s.wh === 1 && Array.isArray(s.stack) && s.stack.length ? s : null;
  } catch {
    return null;
  }
}

const urlFor = (r: Route) => hashFor(r) || location.pathname + location.search;

export function AppProvider({ backend, children }: { backend: Backend; children: ReactNode }) {
  const v = useSyncExternalStore(
    (fn) => backend.subscribe(fn),
    () => backend.version,
  );
  const [prefs, setPrefsState] = useState<Prefs>(() => readLocal('pl.prefs', DEFAULT_PREFS));
  const [demoActorId, setActor] = useState<string | null>(() => readLocalRaw('pl.actor'));
  const actorId = backend.mode === 'firebase' ? backend.authUid : demoActorId;
  const [workspaceId, setWs] = useState<string | null>(() => readLocalRaw('pl.workspace'));
  const [stack, setStack] = useState<Route[]>(() => {
    if (typeof location === 'undefined') return [{ name: 'home' }];
    const linked = parseHash(location.hash);
    // A reload keeps the trail of screens behind this one: it lives in the history entry.
    const saved = histState();
    if (saved && linked && hashFor(saved.stack[saved.stack.length - 1]) === hashFor(linked)) return saved.stack;
    // Everyone else lands on the website's home page; the portal is one button away.
    return [linked ?? { name: 'home' }];
  });
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [tourOpen, setTourOpenState] = useState<boolean>(() => readLocalRaw('pl.tour') === 'open');
  const [guideStep, setGuideStepState] = useState<number | null>(null);
  const [accountsOpen, setAccountsOpen] = useState(false);
  const toastId = useRef(0);
  const guard = useRef<string | null>(null);
  /** Where a held-back navigation goes: a route, the in-app Back, or a browser Back/Forward replayed by this many steps. */
  const [blocked, setBlocked] = useState<{ message: string; next: Route | RouteName | 'back' | { steps: number } } | null>(null);
  const stackRef = useRef(stack);
  stackRef.current = stack;
  /** Set for the next history write when it should replace the entry rather than add one. */
  const replaceNext = useRef(false);
  /** Scroll offset to put back once a Back/Forward has rendered. */
  const restoreY = useRef<number | null>(null);
  /** The address last handled, so the popstate and hashchange of one browser move act once. */
  const seen = useRef('');
  /** Position of the history entry on screen, to count how far a Back or Forward jumped. */
  const curIdx = useRef(0);

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
  const addressKey = () => `${location.hash}|${histState()?.idx ?? ''}`;

  // Each new screen gets its own browser history entry, so the browser's Back and Forward buttons
  // walk through screens instead of leaving the app.
  useEffect(() => {
    let forward = true;
    try {
      const st = histState();
      if (st && sameStack(st.stack, stack)) {
        // Arrived by Back, Forward or a reload: the entry already matches, so only the scroll is restored.
        forward = false;
        window.scrollTo?.({ top: restoreY.current ?? 0 });
      } else if (!st || replaceNext.current) {
        history.replaceState({ wh: 1, idx: st?.idx ?? curIdx.current, stack, up: false } satisfies HistState, '', urlFor(route));
      } else {
        history.replaceState({ ...st, y: window.scrollY }, '');
        history.pushState({ wh: 1, idx: st.idx + 1, stack, up: sameStack(st.stack, stack.slice(0, -1)) } satisfies HistState, '', urlFor(route));
      }
      seen.current = addressKey();
      curIdx.current = histState()?.idx ?? 0;
    } catch {
      /* history is a convenience; the screen still changes */
    }
    replaceNext.current = false;
    restoreY.current = null;
    if (forward) window.scrollTo?.({ top: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stack]);

  const rawGo = useCallback((r: Route | RouteName) => {
    const next = typeof r === 'string' ? { name: r } : r;
    setStack((s) => stackAfter(s, next));
  }, []);

  const rawBack = useCallback(() => {
    // The entry before this one is the parent screen: step back through the browser so both agree.
    if (histState()?.up && stackRef.current.length > 1) return history.back();
    replaceNext.current = true;
    setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  }, []);

  // Back, Forward, and a hash typed or pasted into the address bar.
  useEffect(() => {
    try {
      history.scrollRestoration = 'manual';
    } catch {
      /* not supported: the browser keeps its own scroll handling */
    }
    const onAddress = () => {
      const key = addressKey();
      if (key === seen.current) return;
      seen.current = key;
      const st = histState();
      const cur = stackRef.current;
      let target: Route[];
      let steps: number;
      if (st) {
        target = st.stack;
        steps = st.idx - curIdx.current;
      } else {
        // An anchor that is not a screen changes nothing; the new entry keeps the current screen.
        const linked = parseHash(location.hash);
        target = linked ? stackAfter(cur, linked) : cur;
        steps = 1;
      }
      if (sameStack(target, cur) && st) return;
      if (guard.current && !sameStack(target, cur)) {
        // Put the address back to match the screen, and ask first.
        setBlocked({ message: guard.current, next: { steps } });
        if (steps) history.go(-steps);
        return;
      }
      if (st) {
        restoreY.current = st.y ?? 0;
        curIdx.current = st.idx;
      } else {
        // A hash typed by hand opened a new entry: give it the trail and position the app keeps.
        curIdx.current += 1;
        history.replaceState({ wh: 1, idx: curIdx.current, stack: target, up: sameStack(cur, target.slice(0, -1)) } satisfies HistState, '', urlFor(target[target.length - 1]));
        seen.current = addressKey();
        if (target === cur) return;
      }
      stackRef.current = target;
      setStack(target);
    };
    window.addEventListener('popstate', onAddress);
    window.addEventListener('hashchange', onAddress);
    return () => {
      window.removeEventListener('popstate', onAddress);
      window.removeEventListener('hashchange', onAddress);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          else if (typeof n === 'object' && 'steps' in n) history.go(n.steps);
          else rawGo(n);
        },
        cancel: () => {
          setBlocked(null);
          // The tour cannot go on without leaving this screen, so staying ends it.
          setGuideStepState(null);
        },
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
      if (backend.mode === 'firebase') return;
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
    void backend.logout();
    setActor(null);
    writeLocal('pl.actor', null);
    setStack([{ name: 'home' }]);
  }, [backend]);

  const setWorkspace = useCallback((id: string) => {
    void backend.chooseWorkspace(id);
    setWs(id);
    writeLocal('pl.workspace', id);
    setStack([{ name: 'find' }]);
  }, [backend]);

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

  // Unsaved work still raises the usual "Leave this screen?" question when the tour moves on.
  const startGuide = useCallback((step = 0) => setGuideStepState(step), []);
  const setGuideStep = useCallback((step: number) => setGuideStepState(step), []);
  const stopGuide = useCallback(() => setGuideStepState(null), []);

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
    prefs: backend.mode === 'firebase' ? { ...prefs, advancedTools: false, explain: false } : prefs,
    setPrefs,
    toasts,
    toast,
    envelope,
    send,
    sendEnvelope,
    tourOpen,
    setTourOpen,
    guideStep,
    startGuide,
    setGuideStep,
    stopGuide,
    accountsOpen,
    setAccountsOpen,
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
