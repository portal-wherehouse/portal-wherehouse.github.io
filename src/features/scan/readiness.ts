// Is the app ready for a scanner right now, and has a scanner been seen? Drives the Dashboard's Ready to scan panel
// and the status dot in the top bar.
//
// Ready means a hardware scan would reach the app: scanner listening is on, the page is showing and has the keyboard,
// no window is open over it, and no text box has the cursor (a scan there types into the box instead).
// A keyboard-mode scanner cannot be detected until it scans, so "connected" means a scan arrived recently.

import { useEffect, useState } from 'react';
import { modalOpen, useScanRouter } from '../../device/scanRouter';
import { useSerialStatus } from '../../device/serial';
import { isEditableTarget } from '../../device/wedge';

interface PageState {
  hidden: boolean;
  modal: boolean;
  unfocused: boolean;
  typing: boolean;
}

function readPage(): PageState {
  if (typeof document === 'undefined') return { hidden: false, modal: false, unfocused: false, typing: false };
  return {
    hidden: document.visibilityState === 'hidden',
    modal: modalOpen(),
    unfocused: typeof document.hasFocus === 'function' && !document.hasFocus(),
    // A task screen's code box takes scanner scans too (it is marked data-scan-field), so it does not pause scanning.
    typing: isEditableTarget(document.activeElement) && !document.activeElement?.closest('[data-scan-field]'),
  };
}

const samePage = (a: PageState, b: PageState) => a.hidden === b.hidden && a.modal === b.modal && a.unfocused === b.unfocused && a.typing === b.typing;

/** A hardware scan this recent means the scanner is still there. */
export const SCANNER_FRESH_MS = 30 * 60_000;

export interface ScanReadiness {
  ready: boolean;
  /** Why scanning is paused, when it is. */
  reason: string | null;
  /** The Scanners page is where to fix it. */
  fixInScanners: boolean;
  scanner: {
    connected: boolean;
    /** "Scanner connected", or what to do to check. */
    text: string;
    /** When the last hardware scan arrived, or null. */
    lastAt: number | null;
  };
}

export function useScanReadiness(): ScanReadiness {
  const { settings, lastHardware } = useScanRouter();
  const serial = useSerialStatus();
  const [page, setPage] = useState(readPage);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const update = () => setPage((cur) => {
      const next = readPage();
      return samePage(cur, next) ? cur : next;
    });
    const later = () => setTimeout(update, 0);
    // Windows open and close without an event to listen for, so look twice a second as well.
    const poll = setInterval(update, 500);
    const clock = setInterval(() => setNow(Date.now()), 15_000);
    window.addEventListener('focus', update);
    window.addEventListener('blur', update);
    document.addEventListener('visibilitychange', update);
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', later);
    return () => {
      clearInterval(poll);
      clearInterval(clock);
      window.removeEventListener('focus', update);
      window.removeEventListener('blur', update);
      document.removeEventListener('visibilitychange', update);
      document.removeEventListener('focusin', update);
      document.removeEventListener('focusout', later);
    };
  }, []);

  const reason = !settings.wedge
    ? 'Scanner listening is off in Scanners.'
    : page.hidden
      ? 'Paused while the app is in the background.'
      : page.modal
        ? 'Paused while a window is open. Close it to scan.'
        : page.typing
          ? 'Paused while a text box has the cursor. Tap an empty part of the page to scan.'
          : page.unfocused
            ? 'Paused while another window has the keyboard. Click or tap this page to scan.'
            : null;

  const lastAt = lastHardware?.at ?? null;
  const fresh = lastAt !== null && Math.max(now, Date.now()) - lastAt < SCANNER_FRESH_MS;
  const connected = serial.state === 'connected' || fresh;
  const text = connected
    ? 'Scanner connected'
    : lastAt !== null
      ? 'No scan from the scanner lately. Scan any label to check.'
      : 'No scanner seen yet. Scan any label to check.';

  return { ready: reason === null, reason, fixInScanners: !settings.wedge, scanner: { connected, text, lastAt } };
}
