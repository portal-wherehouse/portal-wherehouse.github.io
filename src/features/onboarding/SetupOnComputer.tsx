// On a phone, setup waits for a computer: laying out zones and spots and printing a label for every spot need
// a bigger screen and a printer. Daily work (receive, move, find) still works on phones once setup is done.

import { useSyncExternalStore } from 'react';
import { useApp } from '../../app/state';
import { copyText } from '../../device/output';
import { Icon } from '../../ui/icons';
import { SkipChecklist } from '../setup/SkipChecklist';

/** Phone-width screens, and small touch-only screens such as a phone turned sideways. */
export const PHONE_QUERY = '(max-width: 640px), (hover: none) and (pointer: coarse) and (max-height: 500px)';

function subscribe(fn: () => void) {
  if (typeof matchMedia !== 'function') return () => {};
  const m = matchMedia(PHONE_QUERY);
  m.addEventListener?.('change', fn);
  return () => m.removeEventListener?.('change', fn);
}

export function usePhoneScreen(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => typeof matchMedia === 'function' && matchMedia(PHONE_QUERY).matches,
    () => false,
  );
}

export function SetupOnComputer({ locked, busy, onSkip }: { locked: boolean; busy?: boolean; onSkip?: () => void }) {
  const { backend, actorId, toast } = useApp();
  const email = actorId ? backend.db.users[actorId]?.email : '';
  const link = `${location.origin}${location.pathname}${location.search}#checklist`;
  const subject = 'Finish setting up your warehouse';
  const body = `Open this link on a computer to finish setting up your warehouse:\n\n${link}`;
  const share = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  return (
    <div className="setup-computer" data-testid="setup-on-computer">
      <span className="setup-computer-art" aria-hidden="true">
        <svg viewBox="0 0 96 64">
          <rect x="14" y="6" width="68" height="44" rx="4" className="sc-screen" />
          <rect x="20" y="12" width="56" height="32" rx="2" className="sc-glass" />
          <path d="M6 54h84l-6 6H12z" className="sc-base" />
          <rect x="26" y="18" width="12" height="9" rx="1" className="sc-label" />
          <rect x="42" y="18" width="12" height="9" rx="1" className="sc-label" />
          <rect x="58" y="18" width="12" height="9" rx="1" className="sc-label" />
          <rect x="26" y="31" width="12" height="9" rx="1" className="sc-label" />
          <rect x="42" y="31" width="12" height="9" rx="1" className="sc-label" />
          <rect x="58" y="31" width="12" height="9" rx="1" className="sc-label" />
        </svg>
      </span>
      <h1>Set up your warehouse on a computer</h1>
      <p>Setup builds your zones and spots and prints a label for every spot. That needs a bigger screen and a printer, so it is done on a computer.</p>
      <ul className="setup-computer-list">
        <li>
          <Icon name="map" /> Lay out every zone and spot on a full-size screen
        </li>
        <li>
          <Icon name="print" /> Print labels at true size on your label printer or sheets
        </li>
        <li>
          <Icon name="phone" /> Then use this phone every day to receive, put away, move and find
        </li>
      </ul>
      <div className="setup-computer-actions">
        {email ? (
          <a className="btn primary big" href={`mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`} data-testid="send-setup-link">
            <Icon name="mail" /> Send me a link
          </a>
        ) : null}
        <button
          type="button"
          className={`btn big${email ? '' : ' primary'}`}
          data-testid="copy-setup-link"
          onClick={() => void copyText(link).then((ok) => toast(ok ? 'Link copied. Open it on your computer.' : 'Could not copy. The link is shown below.', ok ? 'ok' : 'info'))}
        >
          <Icon name="copy" /> Copy link
        </button>
        {share && (
          <button type="button" className="btn big" onClick={() => void navigator.share({ title: subject, text: body, url: link }).catch(() => {})}>
            <Icon name="send" /> Share
          </button>
        )}
      </div>
      <p className="setup-computer-link mono">{link}</p>
      {email && <p className="muted">The email goes to {email}. Open it on your computer and sign in there.</p>}
      {locked && onSkip && (
        <div className="setup-computer-skip">
          <p className="muted">The rest of the app stays locked until setup is finished or skipped.</p>
          <SkipChecklist busy={busy} onSkip={onSkip} />
        </div>
      )}
    </div>
  );
}
