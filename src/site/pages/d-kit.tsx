// Small pieces shared by the Pricing, Applications, Customers, About and Contact pages:
// an email address you can select and copy, a "Coming" tag, and a focus-aware scroll.

import { useRef } from 'react';
import { useSite } from '../routing';
import { copyText } from '../../device/output';
import { Icon } from '../../ui/icons';
import './pages-d.css';

/** Selects the text of an element, so a blocked clipboard is one keystroke or long press away. */
export function selectText(el: HTMLElement | null) {
  const sel = window.getSelection();
  if (!el || !sel) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  sel.removeAllRanges();
  sel.addRange(range);
}

/** Scrolls to a section and moves keyboard focus to its heading, respecting reduced motion. */
export function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  let reduce = false;
  try {
    reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    /* older browsers: animate */
  }
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  const target = el.querySelector<HTMLElement>('h2, h3') ?? el;
  if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
  target.focus({ preventScroll: true });
}

/** An email address as plain, selectable text with a Copy button beside it. */
export function EmailCopy({ email, tone = 'plain' }: { email: string; tone?: 'plain' | 'boxed' }) {
  const { toast } = useSite();
  const ref = useRef<HTMLSpanElement>(null);
  const copy = async () => {
    if (await copyText(email)) {
      toast('Email address copied');
      return;
    }
    selectText(ref.current);
    toast('Copying is blocked here. The address is selected, so copy it with your keyboard or a long press.', 'info');
  };
  return (
    <div className={`pd-email ${tone === 'boxed' ? 'boxed' : ''}`}>
      <Icon name="mail" className="pd-email-icon" />
      <span ref={ref} className="pd-email-addr">
        {email}
      </span>
      <button type="button" className="pd-copy" onClick={copy} aria-label={`Copy email address ${email}`}>
        <Icon name="copy" />
        Copy
      </button>
    </div>
  );
}

/** Marks a plan feature, add-on or roadmap item that does not exist yet. */
export function Coming({ children = 'Coming' }: { children?: string }) {
  return <span className="pd-coming">{children}</span>;
}
