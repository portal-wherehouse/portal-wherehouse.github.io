// Small helpers shared by the Help page's sections: light text markup, search highlighting,
// scrolling past the sticky bars, and running a "Go there" target.

import { Fragment, useCallback, type ReactNode } from 'react';
import { useApp, type Route } from '../../app/state';
import type { HelpTarget } from './types';

/** Renders **bold** spans in content strings. */
export function rich(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => (p.startsWith('**') && p.endsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : <Fragment key={i}>{p}</Fragment>));
}

/** Plain text of a content string, for searching. */
export function plain(text: string): string {
  return text.replace(/\*\*/g, '');
}

/** Lower-case search terms from what someone typed. */
export function termsOf(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/[“”"’']/g, ''))
    .filter((t) => t.length > 0);
}

export function matchesAll(haystack: string, terms: string[]): boolean {
  const h = haystack.toLowerCase();
  return terms.every((t) => h.includes(t));
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Wraps every occurrence of the terms in <mark>. */
export function highlight(text: string, terms: string[]): ReactNode {
  if (!terms.length) return text;
  const re = new RegExp(`(${terms.map(escapeRe).sort((a, b) => b.length - a.length).join('|')})`, 'gi');
  const parts = text.split(re);
  return parts.map((p, i) =>
    i % 2 === 1 ? (
      <mark key={i} className="help-mark">
        {p}
      </mark>
    ) : (
      <Fragment key={i}>{p}</Fragment>
    ),
  );
}

function reducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Height of the sticky top bar and the page's section nav, so a jump lands below them. */
export function stickyOffset(): number {
  const top = document.querySelector('.topbar')?.getBoundingClientRect().height ?? 0;
  const nav = document.querySelector('.help-nav')?.getBoundingClientRect().height ?? 0;
  return top + nav + 12;
}

/** Scrolls an element into view below the sticky bars, then optionally moves focus to it. */
export function scrollToId(id: string, focusId?: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const top = el.getBoundingClientRect().top + window.scrollY - stickyOffset();
  window.scrollTo({ top: Math.max(0, top), behavior: reducedMotion() ? 'auto' : 'smooth' });
  const f = focusId ? document.getElementById(focusId) : null;
  f?.focus({ preventScroll: true });
}

/** Turns a HelpTarget into navigation. `onContact` handles the in-page contact form. */
export function useRunTarget(onContact: () => void) {
  const { go, read, startGuide, setTourOpen, backend } = useApp();
  return useCallback(
    (t: HelpTarget) => {
      if ('route' in t) return go(t.route);
      if ('action' in t) {
        if (t.action === 'tour') return startGuide(0);
        if (t.action === 'contact') return onContact();
        if (backend.mode === 'firebase') {
          window.location.assign(`${location.pathname}?demo=1#help`);
          return;
        }
        setTourOpen(true);
        return go('receive');
      }
      // A real pallet from the current data: the richest history, or a stored one without a hold.
      const r = read((e, _a, ws): Route => {
        const mine = Object.values(e.db.pallets).filter((p) => p.workspace_id === ws && !p.archived_at);
        const stored = mine.filter((p) => p.state === 'STORED' && (t.pallet === 'history' || (!p.hold && e.db.jobs[p.job_id]?.status === 'OPEN')));
        const pool = stored.length ? stored : mine.filter((p) => p.state !== 'RETIRED');
        pool.sort((a, b) => (e.db.events[b.id]?.length ?? 0) - (e.db.events[a.id]?.length ?? 0) || a.code.localeCompare(b.code));
        return pool[0] ? { name: 'pallet', id: pool[0].id } : { name: 'find' };
      });
      go(r ?? 'find');
    },
    [go, read, startGuide, setTourOpen, onContact, backend],
  );
}
