import { describe, expect, it } from 'vitest';
import { appLanding, classifyHost, crossHostUrl, leaveSampleUrl, portalLink, redirectFor } from '../../src/config/hosts';
import { SIGNUP_HOSTNAMES } from '../../src/config/registration';

const at = (hostname: string, hash = '', search = '', pathname = '/') => ({ hostname, pathname, search, hash });

describe('classifyHost', () => {
  it('keeps website and portal together on shared and local hosts', () => {
    for (const h of [
      'portal-wherehouse.github.io',
      'wherehouse.pages.dev',
      'abc123.wherehouse.pages.dev',
      'localhost',
      'app.localhost',
      '127.0.0.1',
      '192.168.1.20',
      '[::1]',
      'intranet',
      'staging.example.com',
      'app.staging.example.com',
      '',
    ])
      expect(classifyHost(h), h).toEqual({ kind: 'single', domain: '' });
  });

  it('reads the website from the apex and www.', () => {
    expect(classifyHost('example.com')).toEqual({ kind: 'site', domain: 'example.com' });
    expect(classifyHost('www.example.com')).toEqual({ kind: 'site', domain: 'example.com' });
    expect(classifyHost('WWW.Example.COM.')).toEqual({ kind: 'site', domain: 'example.com' });
  });

  it('reads the portal from app.', () => {
    expect(classifyHost('app.example.com')).toEqual({ kind: 'app', domain: 'example.com' });
  });

  it('splits the chosen domain, and allows sign-up on its apex and app hosts only', () => {
    expect(classifyHost('wherehousetracking.com')).toEqual({ kind: 'site', domain: 'wherehousetracking.com' });
    expect(classifyHost('www.wherehousetracking.com')).toEqual({ kind: 'site', domain: 'wherehousetracking.com' });
    expect(classifyHost('app.wherehousetracking.com')).toEqual({ kind: 'app', domain: 'wherehousetracking.com' });
    expect([...SIGNUP_HOSTNAMES].sort()).toEqual(['app.wherehousetracking.com', 'portal-wherehouse.github.io', 'wherehousetracking.com']);
  });

  it('supports two-part country domains', () => {
    expect(classifyHost('example.co.uk')).toEqual({ kind: 'site', domain: 'example.co.uk' });
    expect(classifyHost('www.example.co.uk')).toEqual({ kind: 'site', domain: 'example.co.uk' });
    expect(classifyHost('app.example.co.uk')).toEqual({ kind: 'app', domain: 'example.co.uk' });
    expect(classifyHost('example.com.au')).toEqual({ kind: 'site', domain: 'example.com.au' });
  });
});

describe('redirectFor (page load)', () => {
  it('never moves a single host', () => {
    for (const h of ['portal-wherehouse.github.io', 'wherehouse.pages.dev', 'localhost', '127.0.0.1'])
      for (const hash of ['', '#signin', '#pricing', '#overview', '#start'])
        for (const search of ['', '?demo=1']) expect(redirectFor(at(h, hash, search)), `${h}${search}${hash}`).toBeNull();
  });

  it('keeps website pages on the website', () => {
    for (const hash of ['', '#home', '#pricing', '#for/lumberyards', '#main', '#nonsense'])
      for (const h of ['example.com', 'www.example.com']) expect(redirectFor(at(h, hash)), `${h}${hash}`).toBeNull();
  });

  it('sends the portal, #start and sample links from the website to app. with the same search and hash', () => {
    expect(redirectFor(at('example.com', '#signin'))).toBe('https://app.example.com/#signin');
    expect(redirectFor(at('www.example.com', '#overview'))).toBe('https://app.example.com/#overview');
    expect(redirectFor(at('example.com', '#pallet/P-1'))).toBe('https://app.example.com/#pallet/P-1');
    expect(redirectFor(at('example.com', '#find?q=J-214'))).toBe('https://app.example.com/#find?q=J-214');
    expect(redirectFor(at('example.com', '#start'))).toBe('https://app.example.com/#start');
    expect(redirectFor(at('example.com', '#signin', '?demo=1'))).toBe('https://app.example.com/?demo=1#signin');
    expect(redirectFor(at('example.com', '', '?demo=1'))).toBe('https://app.example.com/?demo=1');
    expect(redirectFor(at('example.co.uk', '#signin'))).toBe('https://app.example.co.uk/#signin');
  });

  it('leaves a sample link to a website page on the website, so it cannot bounce back', () => {
    expect(redirectFor(at('example.com', '#pricing', '?demo=1'))).toBeNull();
  });

  it('keeps the portal, #start and sample links on app.', () => {
    for (const hash of ['', '#', '#signin', '#overview', '#pallet/P-1', '#start', '#main'])
      for (const search of ['', '?demo=1']) expect(redirectFor(at('app.example.com', hash, search)), `${search}${hash}`).toBeNull();
  });

  it('sends website pages from app. to the website with the same hash and no search', () => {
    expect(redirectFor(at('app.example.com', '#pricing'))).toBe('https://example.com/#pricing');
    expect(redirectFor(at('app.example.com', '#home'))).toBe('https://example.com/#home');
    expect(redirectFor(at('app.example.com', '#for/lumberyards'))).toBe('https://example.com/#for/lumberyards');
    expect(redirectFor(at('app.example.com', '#pricing', '?demo=1'))).toBe('https://example.com/#pricing');
    expect(redirectFor(at('app.example.co.uk', '#contact'))).toBe('https://example.co.uk/#contact');
  });
});

describe('appLanding', () => {
  it('opens the portal on app. when the address names no page', () => {
    expect(appLanding(at('app.example.com', ''))).toBe('#overview');
    expect(appLanding(at('app.example.com', '#'))).toBe('#overview');
    expect(appLanding(at('app.example.com', '#main'))).toBe('#overview');
    expect(appLanding(at('app.example.com', '#signin'))).toBeNull();
    expect(appLanding(at('app.example.com', '#start'))).toBeNull();
  });

  it('changes nothing on other hosts', () => {
    for (const h of ['example.com', 'www.example.com', 'portal-wherehouse.github.io', 'wherehouse.pages.dev', 'localhost'])
      expect(appLanding(at(h, ''))).toBeNull();
  });
});

describe('crossHostUrl (navigation)', () => {
  it('opens sign-in, the portal and #start on app. from the website', () => {
    expect(crossHostUrl(at('example.com'), { name: 'signin' })).toBe('https://app.example.com/#signin');
    expect(crossHostUrl(at('www.example.com'), { name: 'start' })).toBe('https://app.example.com/#start');
    expect(crossHostUrl(at('example.com', '', '?demo=1'), { name: 'signin' })).toBe('https://app.example.com/?demo=1#signin');
    expect(crossHostUrl(at('example.com'), { name: 'pricing' })).toBeNull();
    expect(crossHostUrl(at('example.com'), { name: 'for', id: 'lumberyards' })).toBeNull();
  });

  it('opens website pages on the website from app.', () => {
    expect(crossHostUrl(at('app.example.com', '', '?demo=1'), { name: 'home' })).toBe('https://example.com/');
    expect(crossHostUrl(at('app.example.com'), { name: 'pricing' })).toBe('https://example.com/#pricing');
    expect(crossHostUrl(at('app.example.com'), { name: 'for', id: 'lumberyards' })).toBe('https://example.com/#for/lumberyards');
    expect(crossHostUrl(at('app.example.com'), { name: 'start' })).toBeNull();
    expect(crossHostUrl(at('app.example.com'), { name: 'overview' })).toBeNull();
  });

  it('never moves on a single host', () => {
    for (const h of ['portal-wherehouse.github.io', 'wherehouse.pages.dev', 'localhost'])
      for (const name of ['signin', 'start', 'home', 'pricing', 'overview'] as const) expect(crossHostUrl(at(h), { name })).toBeNull();
  });
});

describe('portalLink', () => {
  it('points website links straight at app. on a custom domain', () => {
    expect(portalLink('?demo=1#signin', 'example.com')).toBe('https://app.example.com/?demo=1#signin');
    expect(portalLink('?demo=1#signin', 'www.example.co.uk')).toBe('https://app.example.co.uk/?demo=1#signin');
  });

  it('stays relative elsewhere', () => {
    for (const h of ['portal-wherehouse.github.io', 'wherehouse.pages.dev', 'localhost', 'app.example.com'])
      expect(portalLink('?demo=1#signin', h)).toBe('?demo=1#signin');
  });
});

describe('leaveSampleUrl (Exit demo and the demo-only buttons)', () => {
  it('goes to the website home page on its apex, never the app host sign-in', () => {
    expect(leaveSampleUrl(at('app.example.com'))).toBe('https://example.com/');
    expect(leaveSampleUrl(at('example.com'))).toBe('https://example.com/');
    expect(leaveSampleUrl(at('app.example.co.uk'))).toBe('https://example.co.uk/');
  });

  it('opens #start where it signs people in', () => {
    expect(leaveSampleUrl(at('app.example.com'), '#start')).toBe('https://app.example.com/#start');
    expect(leaveSampleUrl(at('app.example.com'), '#pricing')).toBe('https://example.com/#pricing');
  });

  it('stays on the same path with no ?demo on a single host', () => {
    expect(leaveSampleUrl(at('portal-wherehouse.github.io'))).toBe('/');
    expect(leaveSampleUrl(at('localhost', '', '', '/app/'), '#start')).toBe('/app/#start');
  });
});
