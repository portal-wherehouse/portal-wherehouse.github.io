// Website shell: preview ribbon, sticky header with navigation (a full-height menu on phones),
// and the footer with the creator credit, around every public page.

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode, type RefObject } from 'react';
import { BRAND, CREATOR } from '../brand';
import type { SiteRouteName } from '../app/state';
import { useSite } from './routing';
import { copyText, IS_PREVIEW } from '../device/output';
import { BrandMark, Icon } from '../ui/icons';
import { PortalCTA } from './kit';
import { SITE_FOOTER_EXTRA, SITE_NAV } from './nav';
import './shell.css';

const ALL_PAGES = [...SITE_NAV, ...SITE_FOOTER_EXTRA];
const label = (route: SiteRouteName) => ALL_PAGES.find((p) => p.route === route)?.label ?? route;

const FOOTER_COLUMNS: { title: string; routes: SiteRouteName[]; portal?: boolean }[] = [
  { title: 'Product', routes: ['product', 'why', 'hardware', 'showcase'] },
  { title: 'Company', routes: ['mission', 'customers', 'founder', 'contact'] },
  { title: 'Resources', routes: ['pricing', 'security'], portal: true },
];

export function SiteShell({ children }: { children: ReactNode }) {
  const { route, go } = useSite();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const navFits = useNavFits(navRef, menuButton);

  // The menu is for when the header navigation is not showing; close it once it is.
  useEffect(() => {
    if (navFits) setMenuOpen(false);
  }, [navFits]);

  // A tab title per page, so tabs, history and bookmarks can be told apart. Leaving the website restores the plain name.
  useEffect(() => {
    const before = document.title;
    document.title = route.name === 'home' ? `${BRAND.name}: ${BRAND.tagline.replace(/\.$/, '')}` : `${label(route.name as SiteRouteName)} · ${BRAND.name}`;
    return () => {
      document.title = before;
    };
  }, [route.name]);

  const open = (to: SiteRouteName) => {
    setMenuOpen(false);
    go(to);
  };

  const skip = (e: MouseEvent) => {
    e.preventDefault();
    mainRef.current?.focus({ preventScroll: true });
    mainRef.current?.scrollIntoView({ block: 'start' });
  };

  return (
    <div className="site">
      <a className="shell-skip" href="#main" onClick={skip}>
        Skip to content
      </a>

      <div className="shell-ribbon" role="note">
        <span className="shell-ribbon-stripes" aria-hidden="true" />
        <span className="shell-ribbon-text">
          <strong>Remote help included.</strong> Setup, labels, printers and your crew.
        </span>
      </div>

      <header className="shell-header" data-compact={navFits ? undefined : ''}>
        <div className="shell-header-inner">
          <button className="shell-brand" onClick={() => open('home')} aria-label={`${BRAND.name} home`}>
            <BrandMark className="shell-brand-mark" />
            <span className="shell-brand-name">{BRAND.name}</span>
          </button>

          <nav className="shell-nav" aria-label="Main" ref={navRef}>
            {SITE_NAV.map((item) => (
              <button key={item.route} className="shell-nav-item" aria-current={route.name === item.route ? 'page' : undefined} onClick={() => open(item.route)}>
                {item.label}
              </button>
            ))}
          </nav>

          <div className="shell-header-end">
            <PortalCTA variant="nav" />
            <button ref={menuButton} className="shell-menu-btn" aria-expanded={menuOpen} aria-controls="site-menu" onClick={() => setMenuOpen(true)}>
              <Icon name="menu" />
              <span>Menu</span>
            </button>
          </div>
        </div>
      </header>

      {menuOpen && <SiteMenu current={route.name as SiteRouteName} onGo={open} onClose={() => (setMenuOpen(false), menuButton.current?.focus())} />}

      <div key={`transition-${route.name}`} className="route-progress" aria-hidden="true" />
      <main id="main" ref={mainRef} tabIndex={-1} className="shell-main page-enter" key={route.name}>
        {children}
      </main>

      <SiteFooter onGo={open} />
    </div>
  );
}

/**
 * Whether the header navigation is showing and has room for every item. CSS hides it on narrow
 * screens; this also catches wide screens where the text runs longer (larger fonts, a fallback font).
 */
function useNavFits(navRef: RefObject<HTMLElement | null>, menuRef: RefObject<HTMLElement | null>) {
  const [fits, setFits] = useState(false);
  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const check = () => {
      // While the menu button shows, count the room it would give back, so the choice does not stick.
      const menu = menuRef.current;
      const spare = menu && menu.offsetParent !== null ? menu.offsetWidth + 12 : 0;
      setFits(nav.offsetParent !== null && nav.scrollWidth <= nav.clientWidth + spare + 1);
    };
    check();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(check) : null;
    ro?.observe(nav);
    window.addEventListener('resize', check);
    void document.fonts?.ready.then(check);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', check);
    };
  }, [navRef, menuRef]);
  return fits;
}

/** Full-height menu for phones and tablets: every page with its one-line blurb, then the portal. */
function SiteMenu({ current, onGo, onClose }: { current: SiteRouteName; onGo: (r: SiteRouteName) => void; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeBtn.current?.focus();
    const body = document.body;
    const before = body.style.overflow;
    body.style.overflow = 'hidden';
    return () => {
      body.style.overflow = before;
    };
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab' || !panel.current) return;
    // Keep focus inside the menu while it is open.
    const items = [...panel.current.querySelectorAll<HTMLElement>('button, a[href]')].filter((el) => !el.hasAttribute('disabled'));
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="shell-menu" id="site-menu" role="dialog" aria-modal="true" aria-label="Site menu" ref={panel} onKeyDown={onKeyDown}>
      <div className="shell-menu-top">
        <button className="shell-brand" onClick={() => onGo('home')} aria-label={`${BRAND.name} home`}>
          <BrandMark className="shell-brand-mark" />
          <span className="shell-brand-name">{BRAND.name}</span>
        </button>
        <button ref={closeBtn} className="shell-menu-close" onClick={onClose} aria-label="Close menu">
          <Icon name="x" />
        </button>
      </div>
      <div className="shell-menu-scroll">
        <nav aria-label="Site pages">
          <ul className="shell-menu-list">
            {SITE_NAV.map((item) => (
              <li key={item.route}>
                <button className="shell-menu-item" aria-current={current === item.route ? 'page' : undefined} onClick={() => onGo(item.route)}>
                  <span className="shell-menu-label">{item.label}</span>
                  <span className="shell-menu-blurb">{item.blurb}</span>
                  <Icon name="chevronRight" className="shell-menu-chev" />
                </button>
              </li>
            ))}
          </ul>
          <div className="shell-menu-extra">
            {SITE_FOOTER_EXTRA.map((item) => (
              <button key={item.route} className="shell-menu-small" aria-current={current === item.route ? 'page' : undefined} onClick={() => onGo(item.route)}>
                {item.label}
              </button>
            ))}
          </div>
        </nav>
        <div className="shell-menu-portal">
          <PortalCTA variant="hero" />
        </div>
      </div>
    </div>
  );
}

function SiteFooter({ onGo }: { onGo: (r: SiteRouteName) => void }) {
  const { toast } = useSite();
  const emailRef = useRef<HTMLSpanElement>(null);

  const copyEmail = async () => {
    if (await copyText(CREATOR.email)) {
      toast('Email address copied');
      return;
    }
    // Clipboard blocked (the hosted preview does this): select the text so it is one keystroke away.
    const el = emailRef.current;
    const sel = window.getSelection();
    if (el && sel) {
      const range = document.createRange();
      range.selectNodeContents(el);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    toast('Copying is blocked here. The address is selected, so copy it with your keyboard or a long press.', 'info');
  };

  return (
    <footer className="shell-footer">
      <div className="shell-footer-stripe" aria-hidden="true" />
      <div className="site-inner">
        <div className="shell-footer-top">
          <div className="shell-footer-brand">
            <button className="shell-brand" onClick={() => onGo('home')} aria-label={`${BRAND.name} home`}>
              <BrandMark className="shell-brand-mark" />
              <span className="shell-brand-name">{BRAND.name}</span>
            </button>
            <p className="shell-footer-tagline">{BRAND.tagline}</p>
            <p className="shell-footer-about">Know what you have, where it is and who moved it.</p>
          </div>
          <nav className="shell-footer-cols" aria-label="Footer">
            {FOOTER_COLUMNS.map((col) => (
              <div key={col.title} className="shell-footer-col">
                <h2 className="shell-footer-h">{col.title}</h2>
                <ul>
                  {col.routes.map((r) => (
                    <li key={r}>
                      <button className="shell-footer-link" onClick={() => onGo(r)}>
                        {label(r)}
                      </button>
                    </li>
                  ))}
                </ul>
                {col.portal && (
                  <div className="shell-footer-portal">
                    <PortalCTA variant="nav" />
                  </div>
                )}
              </div>
            ))}
          </nav>
        </div>

        <div className="shell-footer-credit">
          <p className="shell-credit-line">
            Created by <strong>{CREATOR.name}</strong>
          </p>
          <div className="shell-credit-links">
            <a className="shell-credit-link" href={CREATOR.linkedin} target="_blank" rel="noopener noreferrer">
              <Icon name="linkedin" />
              LinkedIn
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
            <span className="shell-credit-email">
              <Icon name="mail" />
              <span ref={emailRef} className="shell-credit-address">
                {CREATOR.email}
              </span>
              <button className="shell-copy" onClick={copyEmail} aria-label={`Copy email address ${CREATOR.email}`}>
                <Icon name="copy" />
                Copy
              </button>
              {!IS_PREVIEW && (
                <a className="shell-credit-link" href={`mailto:${CREATOR.email}`}>
                  Write an email
                </a>
              )}
            </span>
          </div>
        </div>

        <p className="shell-footer-base">
          © {new Date().getFullYear()} {BRAND.name}. Warehouse organization, kept simple.
        </p>
      </div>
    </footer>
  );
}
