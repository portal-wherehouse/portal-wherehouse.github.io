// Shared interface pieces. State is always a glyph plus a word, never color alone.

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { STATE_LABEL } from '../domain/transitions';
import type { Location, Pallet, PalletState, Role } from '../domain/types';
import { useApp } from '../app/state';
import { Icon, type IconName } from './icons';

// ------------------------------------------------------------------ time

const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** Local device time for display; the stored value stays UTC (page 10). */
export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const now = new Date();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (sameDay(d, now)) return time;
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (sameDay(d, y)) return `Yesterday ${time}`;
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`;
}

export function fmtAgo(iso: string | null | undefined): string {
  if (!iso) return 'never';
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 45) return 'just now';
  if (s < 90) return '1 min ago';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}

export function fmtFull(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' });
}

// ------------------------------------------------------------------ badges

const STATE_ICON: Record<PalletState, IconName> = {
  RECEIVED: 'receive',
  STORED: 'check',
  DISPATCHED: 'truck',
  MISSING: 'question',
  RETIRED: 'retire',
};

export function StateBadge({ state }: { state: PalletState }) {
  return (
    <span className={`state ${state}`}>
      <Icon name={STATE_ICON[state]} />
      {STATE_LABEL[state]}
    </span>
  );
}

export function HoldBadge({ title }: { title?: string }) {
  return (
    <span className="hold" title={title}>
      <span className="stripes" aria-hidden="true" />
      On hold
    </span>
  );
}

export function Plate({ code, kind, size, variant }: { code: string; kind?: string; size?: 'sm' | 'lg'; variant?: 'none' | 'historic' }) {
  return (
    <span className={`plate ${size ?? ''} ${variant ?? ''}`}>
      <span className="code">{code}</span>
      {kind && <span className="kind">{kind}</span>}
    </span>
  );
}

/**
 * Where a pallet is, worded honestly (page 3): the app reports recorded locations,
 * so it says "last confirmed", never "is at".
 */
export function WhereCell({ pallet, location, lastLocation, size = 'sm' }: { pallet: Pallet; location: Location | null; lastLocation: Location | null; size?: 'sm' | 'lg' }) {
  if (pallet.state === 'STORED' && location) {
    return (
      <div>
        <Plate code={location.code} size={size} kind={location.kind === 'RACK' ? undefined : location.kind.toLowerCase()} />
        <div className="where-text">Last confirmed {fmtTime(pallet.last_confirmed_at)}</div>
      </div>
    );
  }
  if (pallet.state === 'RECEIVED') {
    return (
      <div>
        <Plate code="UNASSIGNED" size={size} variant="none" />
        <div className="where-text">Needs placement</div>
      </div>
    );
  }
  if (pallet.state === 'MISSING') {
    return (
      <div>
        <Plate code="MISSING" size={size} variant="none" />
        <div className="where-text">{lastLocation ? `Last seen ${lastLocation.code} (historical)` : 'Never placed'}</div>
      </div>
    );
  }
  if (pallet.state === 'DISPATCHED') {
    return (
      <div>
        <Plate code="LEFT WH" size={size} variant="none" />
        <div className="where-text">Dispatched, no current rack</div>
      </div>
    );
  }
  return (
    <div>
      <Plate code="RETIRED" size={size} variant="none" />
      <div className="where-text">{pallet.archived_at ? 'Archived' : 'No longer active'}</div>
    </div>
  );
}

export function Avatar({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <span className="avatar" aria-hidden="true">
      {initials}
    </span>
  );
}

export const ROLE_LABEL: Record<Role, string> = { OWNER: 'Owner', SUPERVISOR: 'Supervisor', OPERATOR: 'Operator', VIEWER: 'Viewer' };

export const ROLE_DESC: Record<Role, string> = {
  OWNER: 'Everything, including people and workspace settings.',
  SUPERVISOR: 'Manage jobs and racks, fix mistakes, clear holds, export.',
  OPERATOR: 'Receive, place, move, dispatch, and record returns.',
  VIEWER: 'Search and look at records, photos, and history. No changes.',
};

// ------------------------------------------------------------------ layout helpers

export function PageHead({ eyebrow, title, sub, actions }: { eyebrow?: ReactNode; title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  const { canGoBack, back, route } = useApp();
  const showBack = canGoBack && !['receive', 'move', 'find', 'overview', 'more'].includes(route.name);
  return (
    <div className="page-head">
      {showBack && (
        <button className="icon-btn" onClick={back} aria-label="Back">
          <Icon name="chevronLeft" />
        </button>
      )}
      <div className="titles">
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1 className="page-title">{title}</h1>
        {sub && <p className="page-sub">{sub}</p>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </div>
  );
}

export function Notice({ tone = 'info', title, children, actions, icon }: { tone?: 'info' | 'ok' | 'warn' | 'error'; title?: ReactNode; children?: ReactNode; actions?: ReactNode; icon?: IconName }) {
  const ic: IconName = icon ?? (tone === 'ok' ? 'checkCircle' : tone === 'warn' ? 'alert' : tone === 'error' ? 'alertCircle' : 'info');
  return (
    <div className={`notice ${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon name={ic} />
      <div className="n-body">
        {title && <div className="n-title">{title}</div>}
        {children && <div>{children}</div>}
        {actions && <div className="n-actions">{actions}</div>}
      </div>
    </div>
  );
}

/** "How this works" explanation, shown on every screen unless the user turns explanations off. */
export function Explain({ title = 'How this works', children, refs }: { title?: string; children: ReactNode; refs?: string }) {
  const { prefs } = useApp();
  if (!prefs.explain) return null;
  return (
    <details className="explain">
      <summary>
        <Icon name="help" />
        {title}
        <Icon name="chevronDown" className="chev" />
      </summary>
      <div className="explain-body">
        {children}
        {refs && <div className="ref">Blueprint: {refs}</div>}
      </div>
    </details>
  );
}

export function Empty({ icon = 'box', title, children, actions }: { icon?: IconName; title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="empty">
      <Icon name={icon} />
      <h3>{title}</h3>
      {children && <div>{children}</div>}
      {actions && <div className="row" style={{ justifyContent: 'center', marginTop: 6 }}>{actions}</div>}
    </div>
  );
}

export function Field({ label, hint, children, count, max, htmlFor }: { label: ReactNode; hint?: ReactNode; children: ReactNode; count?: number; max?: number; htmlFor?: string }) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {(hint || max) && (
        <div className="row nowrap" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <span className="hint">{hint}</span>
          {max !== undefined && count !== undefined && <span className={`counter ${count > max ? 'over' : ''}`}>{count.toLocaleString()} / {max.toLocaleString()}</span>}
        </div>
      )}
    </div>
  );
}

export function Sheet({ title, onClose, children, wide }: { title: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('input, select, textarea, button:not(.icon-btn)')?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`sheet ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={id} ref={ref}>
        <div className="sheet-head">
          <h2 id={id}>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Spinner() {
  return <span className="spinner" aria-hidden="true" />;
}

export function PermissionDenied({ what, need }: { what: string; need: string }) {
  const { role } = useApp();
  return (
    <div className="panel">
      <Empty icon="lock" title={`${what} needs ${need} access`}>
        <p>
          You are signed in as a <strong>{role ? ROLE_LABEL[role] : 'person without access'}</strong>. The server checks your role on every change, so hiding or showing
          buttons is only a convenience. Switch accounts from the menu in the top bar to try another role.
        </p>
      </Empty>
    </div>
  );
}

export function Toasts() {
  const { toasts } = useApp();
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.tone}`}>
          <Icon name={t.tone === 'error' ? 'alertCircle' : t.tone === 'info' ? 'info' : 'checkCircle'} />
          {t.text}
        </div>
      ))}
    </div>
  );
}

export function StatTile({ label, value, note, icon, onClick }: { label: string; value: ReactNode; note?: ReactNode; icon?: IconName; onClick?: () => void }) {
  return (
    <button className="stat" onClick={onClick} type="button">
      <span className="s-label">
        {icon && <Icon name={icon} width={16} height={16} />}
        {label}
      </span>
      <span className="s-value num">{value}</span>
      {note && <span className="s-note">{note}</span>}
    </button>
  );
}
