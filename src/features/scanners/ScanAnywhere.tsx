// Scan anywhere: when no screen is waiting for a scan, open whatever was scanned (a pallet, a rack, a job,
// or the Scan station for a mode barcode). Mounted once in the portal, at the lowest priority.

import { useApp } from '../../app/state';
import type { ScanCommand } from '../../device/scanCommands';
import { useScanRouter, useScanTarget } from '../../device/scanRouter';
import { interpretScan, shortScan } from './interpret';

const MODE_ROUTE: Partial<Record<ScanCommand, 'lookup' | 'move' | 'putaway' | 'count'>> = {
  MODE_LOOKUP: 'lookup',
  MODE_MOVE: 'move',
  MODE_PUTAWAY: 'putaway',
  MODE_COUNT: 'count',
};

/** A modal window (a sheet or dialog) is open, so opening another screen behind it would be confusing. */
function modalOpen(): boolean {
  return typeof document !== 'undefined' && !!document.querySelector('[role="dialog"][aria-modal="true"]');
}

export function ScanAnywhere() {
  const { backend, actorId, workspaceId, route, go, toast } = useApp();
  const { settings } = useScanRouter();

  useScanTarget(
    'scan-anywhere',
    (e) => {
      if (!actorId || !workspaceId) return false;
      const shown = shortScan(e.text);
      if (modalOpen()) {
        toast(`Scanned ${shown}. Close the open window first, then scan again.`, 'info');
        return 'error';
      }
      const m = interpretScan(backend.reader, actorId, workspaceId, e.text);
      // Move only listens while it waits for the pallet or the rack. At its review step, opening a record would drop the move.
      if (route.name === 'move' && m.kind !== 'command') {
        toast(`Scanned ${shown}. Move is not waiting for a scan at this step. Use the buttons on screen.`, 'info');
        return 'error';
      }
      switch (m.kind) {
        case 'pallet':
          toast(`Scanned ${m.pallet.code}. Opening the pallet.`, 'info');
          go({ name: 'pallet', id: m.pallet.id });
          return true;
        case 'location':
          toast(`Scanned ${m.location.code}. Opening the ${m.location.kind === 'RACK' ? 'rack' : 'area'}.`, 'info');
          go({ name: 'location', id: m.location.id });
          return true;
        case 'job':
          toast(`Scanned job ${m.job.code}. Showing its pallets.`, 'info');
          go({ name: 'find', q: m.job.code });
          return true;
        case 'command': {
          const mode = MODE_ROUTE[m.command];
          if (mode) {
            toast(`Scanned ${m.label}. Opening the Scan station.`, 'info');
            go({ name: 'station', q: mode });
            return true;
          }
          toast(`Scanned ${m.label}. Nothing on this screen is waiting for it.`, 'info');
          return 'error';
        }
        default:
          toast(`Scanned ${shown}. ${m.message}`, 'error');
          return 'error';
      }
    },
    settings.scanAnywhere && !!actorId,
    -100,
  );

  return null;
}
