import type { PalletState } from './types';

// Display-only labels must not pull command validation into the public website.
export const STATE_LABEL: Record<PalletState, string> = {
  RECEIVED: 'Received',
  STORED: 'Stored',
  IN_TRANSIT: 'In transit',
  DISPATCHED: 'Dispatched',
  MISSING: 'Missing',
  RETIRED: 'Retired',
};
