// The warehouse's own words on screen. The app is written with "pallet" and "job"; when a warehouse calls
// them "item" and "order", this swaps the words in rendered text and labels, and puts them back when they change.

import { useLayoutEffect } from 'react';
import { useApp } from './state';
import { isDefaultWords, setupOf, swapWords } from '../domain/terms';
import type { WarehouseSetup } from '../domain/types';

export function useSetup(): WarehouseSetup {
  const { backend, workspaceId } = useApp();
  const wh = Object.values(backend.db.warehouses).find((w) => w.workspace_id === workspaceId && w.active);
  return setupOf(wh);
}

/** Whether jobs (or whatever the warehouse calls them) are turned on. */
export function useJobsOn(): boolean {
  return useSetup().jobs_on;
}

const ATTRS = ['aria-label', 'placeholder', 'title', 'alt'];
/** Text people typed or data they own is marked data-keep-words and left alone, as are editable fields. */
const skip = (el: Element | null) => !!el?.closest('[data-keep-words], textarea, [contenteditable="true"], script, style');

export function useWordSwap(setup: WarehouseSetup) {
  const key = JSON.stringify([setup.thing, setup.things, setup.job, setup.jobs]);
  useLayoutEffect(() => {
    if (isDefaultWords(setup)) return;
    // What we changed, so it can be put back when the words change again.
    const texts = new Map<Text, { orig: string; wrote: string }>();
    const attrs = new Map<Element, Map<string, { orig: string; wrote: string }>>();
    const fixText = (n: Text) => {
      const v = n.nodeValue ?? '';
      const seen = texts.get(n);
      if (seen && seen.wrote === v) return;
      if (skip(n.parentElement)) return;
      const next = swapWords(v, setup);
      if (next === v) return texts.delete(n);
      texts.set(n, { orig: v, wrote: next });
      n.nodeValue = next;
    };
    const fixAttr = (el: Element, name: string) => {
      const v = el.getAttribute(name);
      if (v === null || skip(el)) return;
      const m = attrs.get(el) ?? new Map();
      if (m.get(name)?.wrote === v) return;
      const next = swapWords(v, setup);
      if (next === v) return;
      m.set(name, { orig: v, wrote: next });
      attrs.set(el, m);
      el.setAttribute(name, next);
    };
    const walk = (root: Node) => {
      if (root.nodeType === Node.TEXT_NODE) return fixText(root as Text);
      if (root.nodeType !== Node.ELEMENT_NODE) return;
      const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
      for (let n: Node | null = root; n; n = w.nextNode()) {
        if (n.nodeType === Node.TEXT_NODE) fixText(n as Text);
        else for (const a of ATTRS) if ((n as Element).hasAttribute(a)) fixAttr(n as Element, a);
      }
    };
    walk(document.body);
    const mo = new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === 'characterData') fixText(r.target as Text);
        else if (r.type === 'attributes') fixAttr(r.target as Element, r.attributeName!);
        else r.addedNodes.forEach(walk);
      }
      if (texts.size > 5000) for (const n of texts.keys()) if (!n.isConnected) texts.delete(n);
    });
    mo.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    const title = document.title;
    document.title = swapWords(title, setup);
    return () => {
      mo.disconnect();
      document.title = title;
      for (const [n, t] of texts) if (n.nodeValue === t.wrote) n.nodeValue = t.orig;
      for (const [el, m] of attrs) for (const [a, t] of m) if (el.getAttribute(a) === t.wrote) el.setAttribute(a, t.orig);
    };
    // The words are the dependency; the setup object is rebuilt on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
