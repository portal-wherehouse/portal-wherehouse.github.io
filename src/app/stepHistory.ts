// Steps inside one screen (a survey question, a setup wizard step) as browser history entries, so the
// browser's Back and Forward buttons walk between steps instead of leaving the screen or starting over.
//
// Each step writes its name into the current history entry under `sub[key]`. Moving to a new step adds an
// entry with the same address; Back returns to the entry before it, and the screen shows that step again.
// The app's own router ignores these entries, because their address and position match the screen's.

import { useCallback, useEffect, useRef } from 'react';

interface SubState {
  sub?: Record<string, string | number>;
  [k: string]: unknown;
}

function current(): SubState {
  try {
    const s = history.state as SubState | null;
    return s && typeof s === 'object' ? s : {};
  } catch {
    return {};
  }
}

/** The step a history entry recorded for this key, if any. */
export function historyStep(key: string): string | null {
  const v = current().sub?.[key];
  return typeof v === 'string' ? v : null;
}

/** How many steps of this key were added after the first one, at this entry. */
function depth(key: string): number {
  const v = current().sub?.[`${key}#`];
  return typeof v === 'number' ? v : 0;
}

function write(key: string, value: string, push: boolean) {
  try {
    const st = current();
    const d = push ? depth(key) + 1 : depth(key);
    // A step entry is never the parent screen's entry, so the in-app Back does not step through it.
    const next = { ...st, ...(push ? { up: false } : {}), sub: { ...(st.sub ?? {}), [key]: value, [`${key}#`]: d } };
    if (push) history.pushState(next, '');
    else history.replaceState(next, '');
  } catch {
    /* history is a convenience; the step still changes */
  }
}

/**
 * Keeps `value` (the step on screen) in browser history under `key`. `onPop` runs when Back or Forward lands
 * on an entry with another step, and when the screen opens on an entry that already has one (Back from
 * another screen). `null` means "nothing to record right now" (a loading or transition phase).
 *
 * Returns `back()`: goes to the previous step through the browser when there is one, so the in-app Back
 * button and the browser's agree. It returns false when this is the first step.
 */
export function useHistoryStep(key: string, value: string | null, onPop: (value: string) => void): { back: () => boolean; reset: () => void; arrived: () => boolean | null } {
  const pop = useRef(onPop);
  pop.current = onPop;
  const last = useRef<string | null>(null);
  const skipNext = useRef(false);
  /** Whether the screen opened on an entry that already had a step (Back, Forward or a refresh). */
  const arrived = useRef<boolean | null>(null);

  useEffect(() => {
    if (value === null) return;
    if (last.current === null) {
      // First step shown: adopt the one this entry remembers (Back from another screen, or a refresh), or
      // record this one. Deferred until the app's router has added this screen's own history entry, which
      // happens after this effect in the same commit.
      last.current = value;
      queueMicrotask(() => {
        const rec = historyStep(key);
        arrived.current = rec !== null;
        if (rec !== null && rec !== last.current) {
          last.current = rec;
          pop.current(rec);
        } else if (rec === null && last.current !== null) write(key, last.current, false);
      });
      return;
    }
    const recorded = historyStep(key);
    if (recorded === value) {
      last.current = value;
      return;
    }
    const prev = last.current;
    last.current = value;
    const replace = skipNext.current;
    skipNext.current = false;
    if (replace) return write(key, value, false);
    // The entry lost its step (the router rewrote it on first load): put the previous step back first.
    if (recorded === null) write(key, prev, false);
    write(key, value, true);
  }, [key, value]);

  useEffect(() => {
    const on = () => {
      const v = historyStep(key);
      if (v === null || v === last.current) return;
      last.current = v;
      pop.current(v);
    };
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, [key]);

  const back = useCallback(() => {
    if (depth(key) <= 0) return false;
    history.back();
    return true;
  }, [key]);

  /** The next step replaces this entry instead of adding one (after starting over, for example). */
  const reset = useCallback(() => {
    skipNext.current = true;
  }, []);

  const wasArrived = useCallback(() => arrived.current, []);

  return { back, reset, arrived: wasArrived };
}

/**
 * Leave the step entries a closed overlay added, so Back after it closes goes to what was before it.
 * Resolves once the browser has moved (or straight away when there is nothing to rewind).
 */
export function rewindSteps(key: string): Promise<void> {
  const n = depth(key);
  if (n <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.removeEventListener('popstate', finish);
      resolve();
    };
    window.addEventListener('popstate', finish);
    setTimeout(finish, 600);
    history.go(-n);
  });
}

/** Session-only memory for a screen's working answers, so Back, Forward and a refresh keep them. */
export function sessionRead<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function sessionWrite(key: string, value: unknown) {
  try {
    if (value === null || value === undefined) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private window: the answers just are not kept */
  }
}
