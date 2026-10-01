// The "Wherehouse for ___" pages: every group has a page, links only to real businesses on the fit page,
// and its copy follows the site's rules.

import { expect, test } from 'vitest';
import { GROUPS } from '../../src/site/for/groups';
import { GROUP_PAGES } from '../../src/site/for/groupPages';
import { BUSINESSES } from '../../src/site/fit/businesses';

test('six to eight groups, each with a page, a short day and real fit-page businesses', () => {
  expect(GROUPS.length).toBeGreaterThanOrEqual(6);
  expect(GROUPS.length).toBeLessThanOrEqual(8);
  expect(new Set(GROUPS.map((g) => g.id)).size).toBe(GROUPS.length);
  expect(Object.keys(GROUP_PAGES).sort()).toEqual(GROUPS.map((g) => g.id).sort());
  const known = new Set(BUSINESSES.map((b) => b.id));
  const placed = GROUPS.flatMap((g) => g.fit);
  expect(placed.filter((id) => !known.has(id))).toEqual([]);
  expect(new Set(placed).size).toBe(placed.length);
  for (const g of GROUPS) {
    const page = GROUP_PAGES[g.id];
    expect(page.steps.length, g.id).toBeGreaterThanOrEqual(3);
    expect(page.steps.length, g.id).toBeLessThanOrEqual(5);
    expect(page.problems.length, g.id).toBe(3);
    expect(page.features.length, g.id).toBe(4);
    expect(page.limit, g.id).not.toBe('');
  }
});

test('copy has no em dashes and never says "things"', () => {
  const strings = (v: unknown): string[] => (typeof v === 'string' ? [v] : v && typeof v === 'object' ? Object.values(v).flatMap(strings) : []);
  const text = strings([GROUPS, GROUP_PAGES]).join('\n');
  expect(text).not.toMatch(/—/);
  expect(text).not.toMatch(/\bthings?\b/i);
});
