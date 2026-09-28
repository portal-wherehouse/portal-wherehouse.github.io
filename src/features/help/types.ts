// Shared shapes for the Help page's content modules: where a "Go there" or "Show me" button leads.

import type { RouteName } from '../../app/state';

/**
 * A place in the portal. `pallet` picks a real pallet from the current data when pressed
 * (one with a rich history, or a stored one that can be dispatched or split).
 */
export type HelpTarget = { route: RouteName } | { pallet: 'history' | 'stored' } | { action: 'tour' | 'practice' | 'contact' };

/** Portal roles in order of what they can do. A tutorial names the smallest one that can follow it. */
export type HelpRole = 'VIEWER' | 'OPERATOR' | 'SUPERVISOR' | 'OWNER';
