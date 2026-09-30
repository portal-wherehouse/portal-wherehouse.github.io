// Installable app shell. Only the full app registers it: the dev server changes files constantly,
// and the hosted preview is a single page inside someone else's frame.
// Also keeps track of whether the app is installed, whether the browser offers its own Install prompt,
// and whether a newer version has been deployed since this page loaded.

import { useSyncExternalStore } from 'react';

/** Where the person is, for install steps: each platform adds a web app to the home screen its own way. */
export type InstallPlatform = 'ios' | 'ios-inapp' | 'android' | 'desktop' | 'other';

/** Pure, so it can be tested: from the user agent and the number of touch points. */
export function installPlatform(ua: string, maxTouchPoints = 0): InstallPlatform {
  // iPadOS reports itself as a Mac; the touch screen gives it away.
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1);
  if (ios) return /FBAN|FBAV|Instagram|LinkedInApp|Line\/|GSA\/|Snapchat|MicroMessenger/.test(ua) ? 'ios-inapp' : 'ios';
  if (/Android/.test(ua)) return 'android';
  if (/Windows NT|Macintosh|CrOS|Linux x86_64|X11/.test(ua)) return 'desktop';
  return 'other';
}

/** Chrome and Edge fire this when the app can be installed with one tap. Not in TypeScript's DOM types yet. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface PwaState {
  /** Opened from the home screen or as an installed app, or installed from this page just now. */
  installed: boolean;
  /** The browser's own Install prompt is available (Android Chrome, desktop Chrome and Edge). */
  canPrompt: boolean;
  /** A newer version is deployed; reloading picks it up. */
  updateReady: boolean;
  platform: InstallPlatform;
}

function standalone(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (window.matchMedia?.('(display-mode: standalone)').matches || window.matchMedia?.('(display-mode: fullscreen)').matches) return true;
  } catch {
    /* old browsers */
  }
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

let state: PwaState = {
  installed: standalone(),
  canPrompt: false,
  updateReady: false,
  platform: typeof navigator === 'undefined' ? 'other' : installPlatform(navigator.userAgent, navigator.maxTouchPoints),
};
let deferred: BeforeInstallPromptEvent | null = null;
let registration: ServiceWorkerRegistration | null = null;
const listeners = new Set<() => void>();

function set(patch: Partial<PwaState>) {
  const next = { ...state, ...patch };
  if ((Object.keys(patch) as (keyof PwaState)[]).every((k) => next[k] === state[k])) return;
  state = next;
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Install and update status, kept current as the browser reports changes. */
export function usePwa(): PwaState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

/** Opens the browser's own Install prompt. Resolves to whether the person installed the app. */
export async function promptInstall(): Promise<boolean> {
  const e = deferred;
  if (!e) return false;
  deferred = null;
  set({ canPrompt: false });
  try {
    await e.prompt();
    const { outcome } = await e.userChoice;
    if (outcome === 'accepted') set({ installed: true });
    return outcome === 'accepted';
  } catch {
    return false;
  }
}

let reloading = false;
/** Loads the newer version: hands over to the waiting service worker first, if there is one, then reloads. */
export function applyUpdate() {
  if (reloading) return;
  reloading = true;
  const waiting = registration?.waiting;
  if (!waiting || !navigator.serviceWorker?.controller) return location.reload();
  navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
  waiting.postMessage({ type: 'SKIP_WAITING' });
  // Reload anyway if the handover does not report back.
  setTimeout(() => location.reload(), 3000);
}

const CHECK_GAP_MS = 5 * 60_000;
let lastCheck = 0;

/**
 * Compares this page's build with the one on the server. An installed app can stay open (or suspended)
 * for days; this is how it learns a new version was deployed.
 */
async function checkForUpdate(force = false) {
  const now = Date.now();
  if (state.updateReady || (!force && now - lastCheck < CHECK_GAP_MS) || navigator.onLine === false) return;
  lastCheck = now;
  void registration?.update().catch(() => {});
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}version.json?t=${now}`, { cache: 'no-store' });
    if (!res.ok) return;
    const { build } = (await res.json()) as { build?: string };
    if (build && build !== __BUILD_ID__) set({ updateReady: true });
  } catch {
    /* offline or blocked: try again later */
  }
}

export function setupInstallableShell() {
  if (__BUILD_TARGET__ !== 'app') return;
  // Listen before anything renders: Chrome can offer the prompt as soon as the page loads.
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // keep the browser's own mini bar away; the portal offers Install where it fits
    deferred = e as BeforeInstallPromptEvent;
    set({ canPrompt: true });
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    set({ installed: true, canPrompt: false });
  });
  try {
    window.matchMedia('(display-mode: standalone)').addEventListener('change', () => set({ installed: standalone() || state.installed }));
  } catch {
    /* old browsers */
  }
  if (!import.meta.env.PROD) return;
  const head = document.head;
  const link = (rel: string, href: string) => {
    const el = document.createElement('link');
    el.rel = rel;
    el.href = href;
    head.appendChild(el);
  };
  link('manifest', `${import.meta.env.BASE_URL}manifest.webmanifest`);
  link('apple-touch-icon', `${import.meta.env.BASE_URL}apple-touch-icon.png`);
  // Look for a new version when the app comes back to the screen, and every half hour while it is open.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void checkForUpdate();
  });
  window.addEventListener('online', () => void checkForUpdate(true));
  setInterval(() => void checkForUpdate(true), 30 * 60_000);
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .then((reg) => {
        registration = reg;
        void checkForUpdate(true);
      })
      .catch(() => {
        /* the app works without it; it just will not open offline */
      });
  });
}
