// Which host this copy of Wherehouse is running on, and where each page belongs.
//
// On a custom domain the website lives on the apex (example.com, and www.example.com) and the portal
// lives on app.example.com. Firebase sign-in is kept per origin, so everything that signs a person in
// or creates an account runs on the app host only. No domain is written here: it is read from the
// address, so the same build works on any domain.
//
// Every other host (portal-wherehouse.github.io, *.pages.dev previews, localhost, an IP address)
// is a "single" host: website and portal together, exactly as before, with no redirects.

import { isSiteRoute, parseHash, hashFor, type Route } from '../app/state';

export type HostKind = 'single' | 'site' | 'app';

export interface Host {
  kind: HostKind;
  /** The custom domain's apex (example.com) on a site or app host; '' on a single host. */
  domain: string;
}

const SINGLE: Host = { kind: 'single', domain: '' };

/** Hosts that always carry website and portal together. */
const SHARED_SUFFIXES = ['.github.io', '.pages.dev', '.workers.dev', '.localhost'];

/**
 * True when the name is a registrable domain on its own: two labels (example.com), or three
 * labels under a short country second level (example.co.uk, example.com.au). Other subdomains
 * (staging.example.com) are not treated as the website, so they never send anyone to a host
 * that may not exist.
 */
function isApex(name: string): boolean {
  const labels = name.split('.');
  if (labels.some((l) => !l)) return false;
  if (labels.length === 2) return true;
  return labels.length === 3 && labels[1].length <= 3 && labels[2].length === 2;
}

export function classifyHost(hostname: string): Host {
  const name = hostname.trim().toLowerCase().replace(/\.$/, '');
  if (!name.includes('.') || name.includes(':') || name === 'localhost') return SINGLE;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(name)) return SINGLE;
  if (SHARED_SUFFIXES.some((s) => name.endsWith(s))) return SINGLE;
  if (name.startsWith('app.')) {
    const domain = name.slice(4);
    return isApex(domain) ? { kind: 'app', domain } : SINGLE;
  }
  const domain = name.startsWith('www.') ? name.slice(4) : name;
  return isApex(domain) ? { kind: 'site', domain } : SINGLE;
}

export const siteOrigin = (domain: string) => `https://${domain}`;
export const appOrigin = (domain: string) => `https://app.${domain}`;

/**
 * Pages that belong on the app host: every portal screen, and #start, whose account step signs
 * the visitor in (its "Create account" and Google buttons use Firebase Auth).
 */
export function belongsOnApp(route: Route): boolean {
  return !isSiteRoute(route.name) || route.name === 'start';
}

const isSample = (search: string) => new URLSearchParams(search).get('demo') === '1';
const path = (pathname: string) => (pathname.startsWith('/') ? pathname : `/${pathname}`);

export interface Address {
  hostname: string;
  pathname: string;
  search: string;
  hash: string;
}

/**
 * Where a page load at this address belongs, as a full URL, or null to stay.
 * Website host: the portal, #start and sample links (?demo=1) move to the app host with the same
 * search and hash. App host: website pages move to the website with the same hash; an empty hash
 * stays, because on the app host it opens the portal.
 */
export function redirectFor(at: Address): string | null {
  const host = classifyHost(at.hostname);
  if (host.kind === 'single') return null;
  const route = parseHash(at.hash);
  if (host.kind === 'site') {
    const sampleLanding = isSample(at.search) && (!route || route.name === 'home');
    if ((route && belongsOnApp(route)) || sampleLanding) return `${appOrigin(host.domain)}${path(at.pathname)}${at.search}${at.hash}`;
    return null;
  }
  const bare = !at.hash.replace(/^#/, '');
  // The website never carries the search: a sample link there would only come straight back.
  if (!bare && route && !belongsOnApp(route)) return `${siteOrigin(host.domain)}${path(at.pathname)}${at.hash}`;
  return null;
}

/**
 * The hash the app host opens with when the address has none (or an anchor that is not a page):
 * the Dashboard, which shows sign-in first to anyone signed out. Null everywhere else.
 */
export function appLanding(at: Pick<Address, 'hostname' | 'hash'>): string | null {
  if (classifyHost(at.hostname).kind !== 'app') return null;
  const bare = !at.hash.replace(/^#/, '');
  return bare || !parseHash(at.hash) ? '#overview' : null;
}

/** Where moving to this route from the current page should go when it lives on the other host; null to stay. */
export function crossHostUrl(at: Pick<Address, 'hostname' | 'pathname' | 'search'>, route: Route): string | null {
  const host = classifyHost(at.hostname);
  if (host.kind === 'site' && belongsOnApp(route)) return `${appOrigin(host.domain)}${path(at.pathname)}${at.search}${hashFor(route)}`;
  if (host.kind === 'app' && !belongsOnApp(route)) return `${siteOrigin(host.domain)}${path(at.pathname)}${hashFor(route)}`;
  return null;
}

/**
 * A website link into the portal, such as '?demo=1#signin'. On the website host it points straight
 * at the app host, so the visitor does not load the website first; elsewhere it stays relative.
 */
export function portalLink(relative: string, hostname: string): string {
  const host = classifyHost(hostname);
  return host.kind === 'site' ? `${appOrigin(host.domain)}/${relative.replace(/^\//, '')}` : relative;
}

/** The current page's host. The hosted preview is always a single host. */
export function currentHost(): Host {
  if (typeof location === 'undefined' || __BUILD_TARGET__ === 'artifact') return SINGLE;
  return classifyHost(location.hostname);
}

/** `portalLink` for the current page. */
export function portalHref(relative: string): string {
  return currentHost().kind === 'single' ? relative : portalLink(relative, location.hostname);
}

/** `crossHostUrl` for the current page. */
export function crossHostFromHere(route: Route): string | null {
  return currentHost().kind === 'single' ? null : crossHostUrl(location, route);
}
