// Home-screen app: which install steps each device gets, and a manifest whose links open real portal screens.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { installPlatform } from '../../src/device/pwa';
import { parseHash } from '../../src/app/state';

const UA = {
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0.7204.156 Mobile/15E148 Safari/604.1',
  iphoneInstagram: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 390.0.0.28.85',
  ipadDesktopMode: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15',
  androidChrome: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36',
  windowsEdge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36 Edg/138.0.0.0',
  linuxChrome: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
};

describe('install platform', () => {
  it('sends iPhones and iPads to the Share steps, whatever the browser', () => {
    expect(installPlatform(UA.iphoneSafari, 5)).toBe('ios');
    expect(installPlatform(UA.iphoneChrome, 5)).toBe('ios');
    expect(installPlatform(UA.ipadDesktopMode, 5)).toBe('ios');
  });

  it('spots a page opened inside another app, which cannot install', () => {
    expect(installPlatform(UA.iphoneInstagram, 5)).toBe('ios-inapp');
  });

  it('tells Android from computers, and a Mac from an iPad', () => {
    expect(installPlatform(UA.androidChrome, 5)).toBe('android');
    expect(installPlatform(UA.windowsEdge)).toBe('desktop');
    expect(installPlatform(UA.linuxChrome)).toBe('desktop');
    expect(installPlatform(UA.ipadDesktopMode, 0)).toBe('desktop');
    expect(installPlatform('')).toBe('other');
  });
});

describe('web app manifest', () => {
  const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8')) as {
    id: string;
    start_url: string;
    scope: string;
    display: string;
    shortcuts: { name: string; url: string; icons?: unknown[] }[];
  };

  it('opens the portal full screen, and keeps the identity earlier installs have', () => {
    expect(manifest.display).toBe('standalone');
    expect(manifest.scope).toBe('./');
    // Before start_url had a hash it was './', and the id defaulted to it; installed apps keep that id.
    expect(manifest.id).toBe('./');
    expect(manifest.start_url.startsWith(manifest.scope)).toBe(true);
    expect(parseHash(manifest.start_url.slice(manifest.start_url.indexOf('#')))).toEqual({ name: 'overview' });
  });

  it('has shortcuts that open real portal screens', () => {
    expect(manifest.shortcuts.map((s) => s.url)).toEqual(['./#station', './#find', './#receive', './#move']);
    for (const s of manifest.shortcuts) {
      expect(s.url.startsWith(manifest.scope)).toBe(true);
      const route = parseHash(s.url.slice(s.url.indexOf('#')));
      expect(route?.name, s.name).toBe(s.url.split('#')[1]);
    }
  });
});

describe('service worker', () => {
  const sw = readFileSync('public/sw.js', 'utf8');

  it('names its cache after the build, so a deploy brings a new worker and clears the old files', () => {
    expect(sw).toContain("const BUILD = '__BUILD_ID__';");
    expect(sw).toContain('wherehouse-shell-${BUILD}');
  });

  it('lets the page hand over to a waiting version, and never caches the version check', () => {
    expect(sw).toMatch(/SKIP_WAITING[\s\S]*skipWaiting\(\)/);
    expect(sw).toContain("url.pathname.endsWith('/version.json')) return;");
  });
});
