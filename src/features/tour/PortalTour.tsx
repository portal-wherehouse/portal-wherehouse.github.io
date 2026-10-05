// "Take the tour": a spotlight walkthrough of every portal screen. It follows guideStep in app state,
// opens each stop's screen, dims everything but the part being explained, and anchors a card beside it.

import './portal-tour.css';
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject } from 'react';
import { isSiteRoute, useApp, type Route, type RouteName } from '../../app/state';
import { MIN_ROLE, roleAllows } from '../../domain/transitions';
import { Icon } from '../../ui/icons';
import { ROLE_LABEL } from '../../ui/ui';
import { HELP_ITEM, NAV_GROUPS, SETUP_ITEM, reachableRoutes, visibleNav } from '../more/More';
import { STOPS, copy, type TourStop, type Chapter } from './stops';

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

type Mode = 'float' | 'center' | 'sheet-bottom' | 'sheet-top';

interface ViewState {
  sidebar: boolean;
  narrow: boolean;
  /** Phone-sized: the card docks to the bottom or top edge instead of floating. */
  compact: boolean;
}

interface Geo {
  spot: Box | null;
  mode: Mode;
  top: number;
  left: number;
  /** Set when the card is narrowed to fit beside the spotlight instead of covering it. */
  width?: number;
  view: ViewState;
}

/** Elements the current stop highlights; an empty list shows the card without a spotlight. */
interface Found {
  index: number;
  els: Element[];
  /** The target is fixed or sticky (top bar, sidebar, tabs), so it is never covered by them. */
  pinned: boolean;
  /** The target is too wide for the card to sit beside it, so a wider, shorter card goes under it. */
  under: boolean;
  /** Extras are chosen and the page is scrolled; false for the first frame, while the card takes its width. */
  ready: boolean;
}

/** Used when a screen has none of its stop's own targets, for example a role that cannot use it. */
const GENERIC = ['#main .page-head', '[data-tour="page-title"]', '#main'];
/** The lock panel a screen shows to a role that cannot use it. */
const LOCKED = ['[data-tour="locked"]'];
const PAD = 8;
const GAP = 14;
const EDGE = 12;
/** The narrowest the card gets when it is squeezed in beside a spotlight. */
const MIN_CARD = 300;
const SPECIFIC_WAIT_MS = 350;
const SEEK_LIMIT_MS = 1500;

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(n, hi));

function readView(): ViewState {
  const w = window.innerWidth;
  return { sidebar: window.matchMedia('(min-width: 960px)').matches, narrow: w <= 520, compact: w < 640 };
}

function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function visible(el: Element): boolean {
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  const cs = getComputedStyle(el);
  return cs.visibility !== 'hidden' && cs.display !== 'none';
}

function firstVisible(selectors: string[]): Element | null {
  for (const s of selectors) {
    for (const el of document.querySelectorAll(s)) if (visible(el)) return el;
  }
  return null;
}

function union(a: Box | null, b: Box): Box {
  if (!a) return b;
  const top = Math.min(a.top, b.top);
  const left = Math.min(a.left, b.left);
  return { top, left, width: Math.max(a.left + a.width, b.left + b.width) - left, height: Math.max(a.top + a.height, b.top + b.height) - top };
}

function boxOf(els: Element[]): Box | null {
  let box: Box | null = null;
  for (const el of els) {
    if (!el.isConnected) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    box = union(box, { top: r.top, left: r.left, width: r.width, height: r.height });
  }
  return box;
}

/** Fixed and sticky things (the top bar, sidebar, phone tabs) cannot be scrolled into view. */
function pinned(el: Element): boolean {
  for (let n: Element | null = el; n && n !== document.body; n = n.parentElement) {
    const p = getComputedStyle(n).position;
    if (p === 'fixed' || p === 'sticky') return true;
  }
  return false;
}

/** The top bar's bottom edge now, and its height once it sticks to the top while scrolling. */
function topBar(): { bottom: number; stuck: number } {
  const bar = document.querySelector<HTMLElement>('.topbar');
  return { bottom: bar?.getBoundingClientRect().bottom ?? 0, stuck: bar?.offsetHeight ?? 0 };
}

/** Room to keep free under the spotlight: the docked card on phones, or the card itself when the target is too wide to sit beside. */
function reserveBelow(box: Box, cardH: number, view: ViewState): number {
  if (view.compact) return cardH + 28;
  const vw = document.documentElement.clientWidth;
  return box.width > vw * 0.55 ? cardH + GAP + EDGE + PAD : EDGE + PAD;
}

/** The target plus whichever extra elements still fit on screen together with it. */
function withExtras(target: Element, selectors: string[], cardH: number, view: ViewState): Element[] {
  const out = [target];
  let box = boxOf(out);
  if (!box) return out;
  const room = window.innerHeight - topBar().stuck - EDGE - PAD;
  for (const sel of selectors) {
    for (const el of document.querySelectorAll(sel)) {
      if (out.includes(el) || !visible(el)) continue;
      const r = el.getBoundingClientRect();
      const next = union(box, { top: r.top, left: r.left, width: r.width, height: r.height });
      if (next.height + PAD <= room - reserveBelow(next, cardH, view)) {
        out.push(el);
        box = next;
      }
    }
  }
  return out;
}

/** Where to scroll so the spotlight sits in view and clear of the card, or null to stay put. */
function scrollFor(els: Element[], cardH: number, view: ViewState): number | null {
  const box = boxOf(els);
  if (!box) return null;
  const bar = topBar();
  const start = bar.stuck + EDGE;
  const bottom = window.innerHeight - reserveBelow(box, cardH, view);
  const room = bottom - start;
  const top = box.top - PAD;
  let offset = 0;
  if (box.height + 2 * PAD <= room) {
    if (top >= bar.bottom && box.top + box.height + PAD <= bottom) return null;
    offset = (room - box.height - 2 * PAD) / 2;
  } else if (box.top >= bar.bottom && box.top <= bar.bottom + 48) {
    // Taller than the screen, and its top is already right under the top bar.
    return null;
  }
  return Math.max(0, Math.round(window.scrollY + top - start - offset));
}

/** Beside the spotlight where the card fits: right, left, below, above; wide targets try below first. */
function place(r: Box, w: number, h: number, vw: number, vh: number, align: TourStop['align']): { top: number; left: number; width?: number } {
  const right = r.left + r.width;
  const bottom = r.top + r.height;
  const vTop = clamp(r.top, EDGE, vh - h - EDGE);
  const hLeft = clamp(align === 'end' ? right - w : r.left, EDGE, vw - w - EDGE);
  const options = [
    { ok: right + GAP + w <= vw - EDGE, top: vTop, left: right + GAP },
    { ok: r.left - GAP - w >= EDGE, top: vTop, left: r.left - GAP - w },
    { ok: bottom + GAP + h <= vh - EDGE, top: bottom + GAP, left: hLeft },
    { ok: r.top - GAP - h >= EDGE, top: r.top - GAP - h, left: hLeft },
  ];
  const order = r.width > vw * 0.55 ? [2, 3, 0, 1] : [0, 1, 2, 3];
  for (const i of order) if (options[i].ok) return options[i];
  // Nothing fits whole: narrow the card into the wider side gap rather than cover the spotlight.
  const roomRight = vw - EDGE - (right + GAP);
  const roomLeft = r.left - GAP - EDGE;
  if (Math.max(roomRight, roomLeft) >= MIN_CARD) {
    return roomRight >= roomLeft ? { top: vTop, left: right + GAP, width: roomRight } : { top: vTop, left: EDGE, width: roomLeft };
  }
  return { top: Math.max(EDGE, vh - h - EDGE), left: Math.max(EDGE, vw - w - EDGE) };
}

/** The card's own width from the stylesheet, before any narrowing to fit beside a spotlight. */
function naturalWidth(card: HTMLElement | null, vw: number): number {
  if (!card) return 0;
  const css = parseFloat(getComputedStyle(card).getPropertyValue('--ptour-w'));
  return css ? Math.min(css, vw - 2 * EDGE) : card.offsetWidth;
}

/** What covers ordinary page content: the sticky top bar and, on phones, the tab bar. */
function chrome(vh: number): { top: number; bottom: number } {
  const bar = document.querySelector('.topbar')?.getBoundingClientRect();
  const tabs = document.querySelector('.bottom-nav');
  const tabsBox = tabs && getComputedStyle(tabs).display !== 'none' ? tabs.getBoundingClientRect() : null;
  return { top: bar ? Math.max(0, bar.bottom) : 0, bottom: tabsBox && tabsBox.height > 0 ? Math.min(vh, tabsBox.top) : vh };
}

/** A box cut to the given band; null when too little of it is left to point at. */
function cut(b: Box, top: number, bottom: number, left: number, right: number): Box | null {
  const t = Math.max(b.top, top);
  const l = Math.max(b.left, left);
  const btm = Math.min(b.top + b.height, bottom);
  const r = Math.min(b.left + b.width, right);
  return btm - t >= 24 && r - l >= 12 ? { top: t, left: l, width: r - l, height: btm - t } : null;
}

function measure(found: Found | null, card: HTMLElement | null, prev: Geo | null, align: TourStop['align']): Geo {
  const view = readView();
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  const w = naturalWidth(card, vw);
  const h = card?.offsetHeight ?? 0;
  const centered = (): Geo => (view.compact ? { spot: null, mode: 'sheet-bottom', top: 0, left: 0, view } : { spot: null, mode: 'center', top: Math.max(EDGE, (vh - h) / 2), left: Math.max(EDGE, (vw - w) / 2), view });

  // Still finding the next stop's target: hold the card where it was.
  if (!found) {
    if (prev && prev.mode === 'float' && !view.compact) return { ...prev, spot: null, view, top: clamp(prev.top, EDGE, Math.max(EDGE, vh - h - EDGE)), left: clamp(prev.left, EDGE, Math.max(EDGE, vw - w - EDGE)) };
    return centered();
  }
  const box = boxOf(found.els);
  if (!box) return centered();

  // Page content scrolls under the top bar and the phone tabs, so the spotlight stops at their edges.
  const band = found.pinned ? { top: 2, bottom: vh - 2 } : chrome(vh);
  const padded = { top: box.top - PAD, left: box.left - PAD, width: box.width + 2 * PAD, height: box.height + 2 * PAD };
  let spot = cut(padded, band.top, band.bottom, 2, vw - 2);

  if (view.compact) {
    const ref = spot ?? padded;
    const spaceBelow = vh - (ref.top + ref.height);
    // Dock below unless the target lives in the lower half (like the tab bar); cut the spotlight clear of the card.
    const mode: Mode = spaceBelow >= h + 16 ? 'sheet-bottom' : ref.top >= h + 16 || ref.top > vh / 2 ? 'sheet-top' : 'sheet-bottom';
    if (spot) spot = mode === 'sheet-bottom' ? cut(spot, 0, vh - h - 16, 0, vw) : cut(spot, h + 16, vh, 0, vw);
    return { spot, mode, top: 0, left: 0, view };
  }

  // Too wide to sit beside and too tall for the card above or below it: light the part the card leaves
  // clear, as long as that still shows most of it. Otherwise the card overlaps a corner.
  if (spot && spot.width > vw * 0.55 && spot.top + spot.height + GAP + h > vh - EDGE && spot.top - GAP - h < EDGE) {
    const full = spot;
    const under = cut(full, 0, vh - h - EDGE - GAP, 0, vw);
    const over = cut(full, EDGE + h + GAP, vh, 0, vw);
    // Under: the top of the target stays lit. Over: only when the card hides no more than a sliver of its top.
    if (under && (under.height >= 280 || under.height >= full.height * 0.6)) spot = under;
    else if (over && over.top - full.top <= Math.max(60, full.height * 0.2)) spot = over;
  }
  const pos = place(spot ?? padded, w, h, vw, vh, align);
  return { spot, mode: 'float', ...pos, view };
}

function sameGeo(a: Geo | null, b: Geo): boolean {
  if (!a) return false;
  const near = (x: number, y: number) => Math.abs(x - y) < 0.5;
  const sameBox = (p: Box | null, q: Box | null) => (!p || !q ? p === q : near(p.top, q.top) && near(p.left, q.left) && near(p.width, q.width) && near(p.height, q.height));
  return a.mode === b.mode && near(a.top, b.top) && near(a.left, b.left) && near(a.width ?? 0, b.width ?? 0) && sameBox(a.spot, b.spot) && a.view.sidebar === b.view.sidebar && a.view.narrow === b.view.narrow && a.view.compact === b.view.compact;
}

/** Pallet, rack and job codes in the copy (P-000042, A-03-02) never break across lines. */
const CODE = /\b[A-Z]{1,2}-\d{2,6}(?:-\d{2}){0,2}\b/g;

function rich(text: string | undefined): ReactNode {
  if (!text) return null;
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(CODE)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    out.push(
      <span key={at} className="ptour-code">
        {m[0]}
      </span>,
    );
    last = at + m[0].length;
  }
  out.push(text.slice(last));
  return out;
}

/** Whether the screen on show is the stop's screen; a stop that names a mode (Ship) needs that mode too. */
const sameRoute = (a: Route, b: Route) => a.name === b.name && (a.id ?? '') === (b.id ?? '') && (!b.q || a.q === b.q);

/** Pages reached through a menu item that covers them, by the name on their tab or link. */
const COVERED_NAME: Partial<Record<RouteName, string>> = {
  incoming: 'Incoming',
  locations: 'Spots and labels',
  products: 'Products and barcodes',
  people: 'People',
  scanners: 'Scanners and printers',
  import: 'Import and export',
  settings: 'Settings',
  labels: 'Spots and labels › Labels',
  export: 'Export',
  data: 'Data and storage',
  lab: 'Integrity lab',
  guide: 'Guide',
  about: 'About',
  sync: 'Sync and offline',
  station: 'Scan station',
};

/** "Sidebar › Inventory › Stock", or the phone equivalent. */
function whereLine(stop: TourStop, route: RouteName | null, sidebar: boolean): string | null {
  if (stop.where) return stop.where;
  const name = stop.nav ?? route;
  if (!name) return null;
  if (name === 'overview') return sidebar ? 'Top of sidebar › Dashboard' : 'Bottom tabs › Dashboard';
  if (name === 'reconcile') return sidebar ? 'Top of sidebar › Dashboard › Needs attention' : 'Bottom tabs › Dashboard › Needs attention';
  const groups = [...NAV_GROUPS, { title: '', items: [SETUP_ITEM, HELP_ITEM] }];
  const own = (g: (typeof groups)[number]) => g.items.find((i) => i.route === name && !i.q) ?? g.items.find((i) => i.covers?.includes(name));
  const group = groups.find((g) => own(g));
  const item = group && own(group);
  if (!group || !item) return null;
  const tail = item.route === name ? item.label : `${item.label} › ${COVERED_NAME[name] ?? name}`;
  if (sidebar) return group.title ? `Sidebar › ${group.title} › ${tail}` : `Bottom of sidebar › ${tail}`;
  if (item.route === 'receive' || item.route === 'move' || item.route === 'find') return `Bottom tabs › ${tail}`;
  return `More › ${tail}`;
}

export function PortalTour() {
  const { guideStep, actorId, route, blockedNav, stopGuide, backend, role, prefs } = useApp();
  const stops = useMemo(() => {
    if (backend.mode === 'demo' && !backend.sampleMode && prefs.advancedTools) return STOPS;
    const allowed = reachableRoutes(visibleNav(role, false, backend.mode === 'firebase'));
    // About is a link inside Help, not a stop of its own on the everyday tour.
    allowed.delete('about');
    const updates: Record<string, Partial<TourStop>> = {
      intro: { body: 'See the screens available to your account and what each one does. You can leave at any point. The tour itself does not change records.' },
      topbar: { body: 'The top bar shows your warehouse, connection and account. Open your account menu to check who you are signed in as.', tip: backend.sampleMode ? 'This is a sample saved in your browser. Use Sample views to switch between management and employee views.' : 'Everyone uses their own verified account. Your manager controls access to this warehouse.' },
      nav: { body: 'Use the navigation to receive, move and find pallets, or open the other warehouse tools available to your account. On a phone, More holds the pages that do not fit in the bottom tabs.', tip: 'You can start this tour again from Help.' },
      move: { tip: 'No label handy? Type the printed pallet and rack codes instead.' },
      people: { title: 'People', body: 'Authorize employee and manager email addresses, review access and remove people who no longer need it. Each person signs in with their own account.', tip: backend.sampleMode ? 'These are example accounts. No invitations are sent from the sample.' : 'Authorizing an email does not send an invitation. Give the person the sign-in link and have them verify their email.' },
      export: { body: 'Prepare a complete export of pallets, jobs, racks and movement history, then download the files for the office. Preparing it loads every page of records.' },
      data: { body: 'The sample records live in this browser. You can save or restore a sample backup here. Customer warehouse records use a separate shared Firebase database.' },
      settings: { body: 'Adjust this device’s display and text size, choose your starting screen, and manage your session.' },
      finish: { body: backend.sampleMode ? 'You have seen the screens for this sample view. Try a practice shift to receive, store and dispatch an example pallet, or return to Help.' : 'You have seen the screens available to your account. Help has instructions you can return to during a shift. Use the separate sample warehouse when you want to practice.' },
    };
    return STOPS.filter(s => (!s.route || typeof s.route !== 'string' || allowed.has(s.route)) && (s.id !== 'picklist' || allowed.has('jobs')))
      .map(s => ({ ...s, ...updates[s.id] }));
  }, [backend, role, prefs.advancedTools]);
  const inPortal = !!actorId && !isSiteRoute(route.name) && route.name !== 'signin';
  // The stop whose screen was last opened. It outlives the card, which hides during a "Leave this screen?"
  // question, so the card coming back does not ask to leave again.
  const opened = useRef<number | null>(null);

  // Leaving the portal (signing out) ends the tour rather than parking it.
  useEffect(() => {
    if (guideStep !== null && !inPortal) stopGuide();
    if (guideStep === null) opened.current = null;
  }, [guideStep, inPortal, stopGuide]);

  if (guideStep === null || !inPortal) return null;
  // A "leave this screen?" question takes priority. Leaving carries the tour on; staying ends it.
  if (blockedNav) return null;
  return <TourOverlay index={clamp(Math.round(guideStep), 0, stops.length - 1)} opened={opened} stops={stops} />;
}

function TourOverlay({ index, opened, stops }: { index: number; opened: RefObject<number | null>; stops: TourStop[] }) {
  const { route, go, setGuideStep, stopGuide, setTourOpen, backend, workspaceId, role } = useApp();
  const stop = stops[index];
  const last = stops.length - 1;
  const chapters = useMemo(() => stops.reduce<Chapter[]>((out, s, i) => {
    if (s.kind) return out;
    const previous = out[out.length - 1];
    if (previous?.name === s.chapter) previous.count++;
    else out.push({ name: s.chapter, icon: s.icon, first: i, count: 1 });
    return out;
  }, []), [stops]);
  const cardRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const routes = useRef(new Map<TourStop['route'], Route>());
  const [found, setFound] = useState<Found | null>(null);
  const [geo, setGeo] = useState<Geo | null>(null);
  const [reseek, setReseek] = useState(0);
  const spacer = useRef<HTMLDivElement | null>(null);
  const lastUnder = useRef(false);
  const titleId = useId();
  const bodyId = useId();

  // Where this stop happens. Computed routes (a pallet, a job) are fixed for the whole tour, so Back returns to the same record.
  const dest = useMemo<Route | null>(() => {
    if (!stop.route) return null;
    if (typeof stop.route === 'string') return { name: stop.route };
    const known = routes.current.get(stop.route);
    if (known) return known;
    const made = stop.route({ backend, workspaceId });
    routes.current.set(stop.route, made);
    return made;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stop]);
  const arrived = !dest || sameRoute(route, dest);
  const current = found && found.index === index ? found : null;
  const locked = !!(stop.needs && role && !roleAllows(role, stop.needs));

  useEffect(() => {
    const el = document.createElement('div');
    el.className = 'ptour-spacer';
    el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);
    spacer.current = el;
    return () => {
      el.remove();
      spacer.current = null;
    };
  }, []);

  // 1. Open the stop's screen.
  useEffect(() => {
    if (opened.current === index) return;
    opened.current = index;
    if (dest && !sameRoute(route, dest)) go(dest);
    // Only when the stop changes: if someone navigates by hand, the tour does not drag them back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  // 2. Find what to highlight once the screen is there, then scroll it into view.
  useEffect(() => {
    if (!arrived) {
      const t = setTimeout(() => setFound({ index, els: [], pinned: false, under: false, ready: true }), SEEK_LIMIT_MS);
      return () => clearTimeout(t);
    }
    let raf = 0;
    const started = performance.now();
    // A role that cannot use the screen sees its lock panel, so that is what gets the spotlight.
    const specific = locked ? LOCKED : (stop.target ?? []);
    const generic = stop.route ? GENERIC : [];
    const settle = (el: Element | null) => {
      if (!el) return setFound({ index, els: [], pinned: false, under: false, ready: true });
      const r = el.getBoundingClientRect();
      const under = !readView().compact && r.width + 2 * PAD > document.documentElement.clientWidth * 0.55;
      setFound({ index, els: [el], pinned: pinned(el), under, ready: false });
    };
    const tick = () => {
      const waited = performance.now() - started;
      let el = firstVisible(specific);
      if (!el && (waited > SPECIFIC_WAIT_MS || !specific.length)) el = firstVisible(generic);
      if (el || waited > SEEK_LIMIT_MS || (!specific.length && !generic.length)) settle(el);
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, arrived, reseek]);

  // Once the card has its width for this stop: add the extras that fit, then scroll everything into view.
  useLayoutEffect(() => {
    if (!current || current.ready || !current.els.length) return;
    const view = readView();
    const cardH = cardRef.current?.offsetHeight ?? 300;
    const els = withExtras(current.els[0], stop.extend ?? [], cardH, view);
    const fixed = els.some(pinned);
    setFound({ ...current, els, pinned: fixed, ready: true });
    const y = fixed ? null : scrollFor(els, cardH, view);
    if (y === null || Math.abs(y - window.scrollY) <= 2) return;
    // Short screens cannot scroll far enough on their own, so a spacer lengthens the page while the tour runs.
    const need = y + window.innerHeight;
    if (spacer.current && need > document.documentElement.scrollHeight) spacer.current.style.height = `${need}px`;
    window.scrollTo({ top: y, behavior: reducedMotion() ? 'instant' : 'smooth' });
  }, [current, stop]);

  // 3. Follow the target every frame: scrolling, resizing, and screens that change size.
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      if (current && current.els.length && !current.els[0].isConnected) {
        setReseek((n) => n + 1);
        return;
      }
      setGeo((prev) => {
        const next = measure(current, cardRef.current, prev, stop.align);
        return sameGeo(prev, next) ? prev : next;
      });
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [current, stop]);

  const next = useCallback(() => (index < last ? setGuideStep(index + 1) : stopGuide()), [index, last, setGuideStep, stopGuide]);
  const back = useCallback(() => index > 0 && setGuideStep(index - 1), [index, setGuideStep]);

  // Keyboard: Esc ends, arrows move. Captured first so screens underneath do not also react.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      if (e.key === 'Escape') stopGuide();
      else if (e.key === 'ArrowRight' && index < last) next();
      else if (e.key === 'ArrowLeft') back();
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [index, last, next, back, stopGuide]);

  // Focus goes to the card on every stop, unless it is already inside it.
  useEffect(() => {
    const card = cardRef.current;
    if (card && !card.contains(document.activeElement)) (primaryRef.current ?? card).focus({ preventScroll: true });
  }, [index]);

  // When the tour ends, hand focus back to the button that started it.
  useEffect(
    () => () => {
      const from = document.querySelector<HTMLElement>('[data-tour="take-tour"]');
      if (from && (!document.activeElement || document.activeElement === document.body || !document.activeElement.isConnected)) from.focus({ preventScroll: true });
    },
    [],
  );

  const trapTab = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !cardRef.current) return;
    const items = [...cardRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]')];
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === cardRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const view = geo?.view ?? readView();
  const spot = current && geo?.spot ? geo.spot : null;
  const wide = stop.kind === 'intro' || stop.kind === 'finish';
  // Intro and finish grow independently of the previous anchored stop. Center them
  // immediately, without a frame using that stop's old coordinates and height.
  const mode: Mode = wide ? (view.compact ? 'sheet-bottom' : 'center') : geo?.mode ?? (view.compact ? 'sheet-bottom' : 'center');
  // Keep the last width while the next stop is being found, so the card does not jump.
  if (current) lastUnder.current = current.under;
  const under = !wide && mode === 'float' && lastUnder.current;
  const cardStyle = wide && !view.compact ? { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' } : geo && (mode === 'float' || mode === 'center') ? { top: geo.top, left: geo.left, width: geo.width } : undefined;
  const total = stops.length;
  const body = copy(stop.body, view);
  const tip = copy(stop.tip, view);
  const where = stop.kind ? null : whereLine(stop, dest?.name ?? null, view.sidebar);
  const lockNote = locked && role && stop.needs ? `This screen is locked for your ${ROLE_LABEL[role]} account. It needs ${ROLE_LABEL[MIN_ROLE[stop.needs]]} access or higher. Here is what it does:` : null;

  const end = () => stopGuide();
  const openHelp = () => {
    stopGuide();
    go('help');
  };
  const practice = () => {
    stopGuide();
    setTourOpen(true);
    go('receive');
  };

  return (
    <div className="ptour">
      <div className="ptour-shield" onClick={() => primaryRef.current?.focus({ preventScroll: true })} aria-hidden="true" />
      {spot ? <div key={index} className="ptour-spot" style={spot} aria-hidden="true" /> : <div className="ptour-dim" aria-hidden="true" />}
      <div
        ref={cardRef}
        className={`ptour-card is-${mode}${wide ? ' is-wide' : ''}${under ? ' is-under' : ''}${geo ? '' : ' is-measuring'}`}
        style={cardStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        tabIndex={-1}
        onKeyDown={trapTab}
      >
        <div key={index} className="ptour-content">
          <div className="ptour-meta">
            <span className="ptour-chapter">{stop.kind === 'intro' ? 'Portal tour' : stop.kind === 'finish' ? 'Tour complete' : stop.chapter}</span>
            <span className="ptour-count num">{stop.kind === 'intro' ? `${total} stops · about 5 minutes` : `Step ${index + 1} of ${total}`}</span>
          </div>
          {stop.kind !== 'intro' && (
            <div className="ptour-bar" role="progressbar" aria-label="Tour progress" aria-valuemin={1} aria-valuemax={total} aria-valuenow={index + 1}>
              <div style={{ width: `${((index + 1) / total) * 100}%` }} />
            </div>
          )}
          <div className="ptour-head">
            <span className="ptour-icon" aria-hidden="true">
              <Icon name={stop.icon} />
            </span>
            <h2 id={titleId}>
              {stop.kicker && <span className="ptour-kicker">{stop.kicker} </span>}
              {stop.title}
            </h2>
          </div>
          {lockNote && (
            <p className="ptour-note">
              <Icon name="lock" aria-hidden="true" />
              <span>{lockNote}</span>
            </p>
          )}
          <p id={bodyId} className="ptour-body">
            {rich(body)}
          </p>
          {tip && (
            <p className="ptour-tip">
              <strong>Tip:</strong> {rich(tip)}
            </p>
          )}
          {where && (
            <p className="ptour-where">
              <Icon name="pin" aria-hidden="true" />
              <span>
                <span className="ptour-where-label">Find it:</span> {where}
              </span>
            </p>
          )}

          {stop.kind === 'intro' && (
            <>
              <ul className="ptour-chapters" aria-label="Chapters">
                {chapters.map((c) => (
                  <li key={c.name}>
                    <button type="button" onClick={() => setGuideStep(c.first)} aria-label={`Jump to ${c.name}, ${c.count} ${c.count === 1 ? 'stop' : 'stops'}`}>
                      <Icon name={c.icon} aria-hidden="true" />
                      <span className="ptour-ch-name">{c.name}</span>
                      <span className="ptour-ch-count num">{c.count}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="ptour-keys">
                <span className="kbd">←</span> <span className="kbd">→</span> move between stops. <span className="kbd">Esc</span> leaves the tour.
              </p>
              <div className="ptour-actions">
                <button type="button" className="btn ghost" onClick={end}>
                  Not now
                </button>
                <span className="grow" />
                <button ref={primaryRef} type="button" className="btn primary" onClick={next}>
                  Start the tour <Icon name="arrowRight" />
                </button>
              </div>
            </>
          )}

          {stop.kind === 'finish' && (
            <>
              {backend.mode === 'demo' && !roleAllows(role, 'receive') && role && (
                <p className="ptour-note">
                  <Icon name="lock" aria-hidden="true" />
                  <span>The practice shift needs an Operator account or higher. Switch role from the account chip first.</span>
                </p>
              )}
              <div className="ptour-finish">
                {backend.mode === 'demo' ? <button type="button" className="btn primary" onClick={practice}>
                  <Icon name="hardhat" /> Start the practice shift
                </button> : <a className="btn primary" href={`${location.pathname}?demo=1#help`}>Open sample warehouse</a>}
                <button type="button" className="btn" onClick={openHelp}>
                  <Icon name="help" /> Open Help
                </button>
              </div>
              <div className="ptour-actions">
                <button type="button" className="btn ghost" onClick={back}>
                  <Icon name="chevronLeft" /> Back
                </button>
                <span className="grow" />
                <button ref={primaryRef} type="button" className="btn" onClick={end}>
                  Finish
                </button>
              </div>
            </>
          )}

          {!stop.kind && (
            <div className="ptour-actions">
              <button type="button" className="btn ghost ptour-end" onClick={end}>
                End tour
              </button>
              <span className="grow" />
              <button type="button" className="btn" onClick={back}>
                <Icon name="chevronLeft" /> Back
              </button>
              <button ref={primaryRef} type="button" className="btn primary" onClick={next}>
                Next <Icon name="chevronRight" />
              </button>
            </div>
          )}
        </div>
        <p className="sr-only" aria-live="polite">
          {`Step ${index + 1} of ${total}: ${stop.kicker ? `${stop.kicker} ` : ''}${stop.title}`}
        </p>
      </div>
    </div>
  );
}
