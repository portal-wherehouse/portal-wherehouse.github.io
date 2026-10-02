// Building blocks shared by every website page, so the pages read as one site.

import type { ReactNode } from 'react';
import { BRAND, CREATOR } from '../brand';
import type { SiteRouteName } from '../app/state';
import { useSite } from './routing';
import { Icon, type IconName } from '../ui/icons';
import './site.css';

/**
 * The way into the app for existing customers: a small line ("Already a customer?") over the
 * "Open Wherehouse Portal" button. `variant` changes the size to suit where it sits.
 */
export function PortalCTA({ variant = 'hero', note = '' }: { variant?: 'hero' | 'nav' | 'band' | 'inline'; note?: ReactNode }) {
  const { go } = useSite();
  return (
    <div className={`portal-cta portal-cta-${variant}`}>
      {note && <span className="portal-cta-note">{note}</span>}
      <button className="portal-cta-btn" onClick={() => go('signin')} data-portal-cta>
        <span>Sign in</span>
        <Icon name="chevronRight" />
      </button>
    </div>
  );
}

/** A text-style button that moves to another website page. */
export function SiteLink({ to, children, className = 'site-link', hash, 'data-testid': testId }: { to: SiteRouteName; children: ReactNode; className?: string; hash?: string; 'data-testid'?: string }) {
  const { go } = useSite();
  return (
    <button
      className={className}
      data-testid={testId}
      onClick={() => {
        go(to);
        if (hash) setTimeout(() => document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
      }}
    >
      {children}
    </button>
  );
}

/** The big opening block of a page. `art` sits beside the text on wide screens and below it on phones. */
export function PageHero({ eyebrow, title, lede, children, art }: { eyebrow?: ReactNode; title: ReactNode; lede?: ReactNode; children?: ReactNode; art?: ReactNode }) {
  return (
    <header className={`site-inner site-hero ${art ? 'with-art' : ''}`}>
      <div className="site-hero-text">
        {eyebrow && <div className="site-eyebrow">{eyebrow}</div>}
        <h1 className="site-h1">{title}</h1>
        {lede && <p className="site-lede">{lede}</p>}
        {children && <div className="site-hero-actions">{children}</div>}
      </div>
      {art && <div className="site-hero-art">{art}</div>}
    </header>
  );
}

/** A full-width band of a page. `tone` picks the background. */
export function Section({ id, eyebrow, title, lede, children, tone = 'plain', narrow }: { id?: string; eyebrow?: ReactNode; title?: ReactNode; lede?: ReactNode; children?: ReactNode; tone?: 'plain' | 'surface' | 'ink' | 'hazard'; narrow?: boolean }) {
  return (
    <section id={id} className={`site-section tone-${tone}`}>
      <div className={`site-inner ${narrow ? 'narrow' : ''}`}>
        {(eyebrow || title || lede) && (
          <div className="site-section-head">
            {eyebrow && <div className="site-eyebrow">{eyebrow}</div>}
            {title && <h2 className="site-h2">{title}</h2>}
            {lede && <p className="site-lede">{lede}</p>}
          </div>
        )}
        {children}
      </div>
    </section>
  );
}

/** A grid of cards with an icon, a title and a sentence or two. */
export function FeatureCards({ items, columns = 3 }: { items: { icon: IconName; title: ReactNode; body: ReactNode }[]; columns?: 2 | 3 | 4 }) {
  return (
    <div className={`feature-cards cols-${columns}`}>
      {items.map((it, i) => (
        <div key={i} className="feature-card">
          <span className="feature-icon">
            <Icon name={it.icon} />
          </span>
          <h3>{it.title}</h3>
          <div className="feature-body">{it.body}</div>
        </div>
      ))}
    </div>
  );
}

/**
 * The founder's initials in a badge. Stands in for a photo until there is one: to use a photo,
 * render <img className="site-mono-photo" src=... alt={CREATOR.name} /> where this is used.
 */
export function Monogram() {
  return (
    <span className="site-mono" aria-hidden="true">
      {initials(CREATOR.name)}
    </span>
  );
}

/** "John Henry" from "John Henry Mims": he goes by both first names. */
export function firstName(full: string) {
  return full.split(' ').slice(0, -1).join(' ') || full;
}

/** "JH" from "John Henry Mims". */
export function initials(full: string) {
  return full
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('');
}

/** Marks content that is a stand-in until the real thing exists (pricing, customer stories, photos). */
export function Placeholder({ label = 'Placeholder', children, minHeight }: { label?: string; children?: ReactNode; minHeight?: number }) {
  return (
    <div className="site-placeholder" style={minHeight ? { minHeight } : undefined}>
      <span className="site-placeholder-tag">{label}</span>
      {children}
    </div>
  );
}

/** The closing band on most pages: a sales ask for new visitors and the portal button for customers. */
export function CtaBand({ title = BRAND.tagline, body = 'Remote setup, training and ongoing support are included.' }: { title?: ReactNode; body?: ReactNode }) {
  const { go } = useSite();
  return (
    <section className="site-section tone-ink cta-band">
      <div className="site-inner cta-band-inner">
        <div>
          <h2 className="site-h2">{title}</h2>
          <p className="site-lede">{body}</p>
          <div className="site-hero-actions">
            <button className="site-btn primary" onClick={() => go('start')}>
              Start your free trial
            </button>
            <button className="site-btn ghost" onClick={() => go('contact')}>
              Book a free walkthrough
            </button>
          </div>
        </div>
        <PortalCTA variant="band" />
      </div>
    </section>
  );
}
