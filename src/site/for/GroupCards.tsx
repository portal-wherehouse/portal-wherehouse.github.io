// The "Wherehouse for ___" cards: one per kind of business, each opening its own page at #for/<id>.
// Used on the home page and the #for overview, so it stays small: the pages themselves load on demand.

import type { MouseEvent } from 'react';
import { Icon } from '../../ui/icons';
import { GROUPS, groupHref } from './groups';
import './for-cards.css';

/**
 * Opens a group's page from a link. A plain click goes there and starts at the top of the page;
 * a click with a modifier key is left to the browser, so the page can open in a new tab.
 */
export function openGroup(e: MouseEvent<HTMLAnchorElement>, id?: string) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  location.hash = groupHref(id);
  window.scrollTo(0, 0);
}

/** Every group's card. `current` leaves out the page's own group; `compact` drops the one-line problem. */
export function GroupCards({ current, compact }: { current?: string; compact?: boolean }) {
  return (
    <ul className={`fg-cards${compact ? ' compact' : ''}`} data-testid="group-cards">
      {GROUPS.filter((g) => g.id !== current).map((g) => (
        <li key={g.id}>
          <a className="fg-card" href={groupHref(g.id)} onClick={(e) => openGroup(e, g.id)}>
            <span className="fg-card-icon" aria-hidden="true">
              <Icon name={g.icon} />
            </span>
            <span className="fg-card-text">
              <span className="fg-card-for">Wherehouse for </span>
              <strong className="fg-card-name">{g.name}</strong>
              <span className="fg-card-pain">{g.pain}</span>
            </span>
            <Icon name="arrowRight" className="fg-card-go" aria-hidden="true" />
          </a>
        </li>
      ))}
    </ul>
  );
}
