// Scan anywhere: when no screen is waiting for a scan, open whatever was scanned (a pallet, a rack, a job, the
// pallets received with a product barcode, or the Scan station for a mode barcode). Mounted once in the portal, at
// the lowest priority. The Dashboard always listens, even with the setting off, so an open app is ready to scan.
// Each scan's `summary` says what happened, for the Dashboard's Ready to scan panel.

import { useApp } from '../../app/state';
import type { ScanCommand } from '../../device/scanCommands';
import { modalOpen, useScanRouter, useScanTarget } from '../../device/scanRouter';
import { interpretScan, shortScan } from './interpret';

const MODE_ROUTE: Partial<Record<ScanCommand, 'lookup' | 'move' | 'putaway' | 'count'>> = {
  MODE_LOOKUP: 'lookup',
  MODE_MOVE: 'move',
  MODE_PUTAWAY: 'putaway',
  MODE_COUNT: 'count',
};

export function ScanAnywhere() {
  const { backend, actorId, workspaceId, route, go, toast } = useApp();
  const { settings } = useScanRouter();

  useScanTarget(
    'scan-anywhere',
    (e) => {
      if (!actorId || !workspaceId) return false;
      const shown = shortScan(e.text);
      const say = (text: string, tone: 'info' | 'error' = 'info', what = shown, summary = text) => {
        e.summary = summary;
        toast(`Scanned ${what}. ${text}`, tone);
      };
      // Screens behind an open sheet or dialog are not offered scans; this says why nothing happened.
      if (modalOpen()) {
        say('Close the open window first, then scan again.');
        return 'error';
      }
      const m = interpretScan(backend.reader, actorId, workspaceId, e.text, { partial: backend.mode === 'firebase' });
      // Move only listens while it waits for the pallet or the rack. At its review step, opening a record would drop the move.
      if (route.name === 'move' && m.kind !== 'command') {
        say('Move is not waiting for a scan at this step. Use the buttons on screen.');
        return 'error';
      }
      switch (m.kind) {
        case 'pallet':
          say('Opening the pallet.', 'info', m.pallet.code, `Opened pallet ${m.pallet.code}.`);
          go({ name: 'pallet', id: m.pallet.id });
          return true;
        case 'location':
          say(`Opening the ${m.location.kind === 'RACK' ? 'rack' : 'area'}.`, 'info', m.location.code, `Opened ${m.location.kind === 'RACK' ? 'rack' : 'area'} ${m.location.code} to show what is there.`);
          go({ name: 'location', id: m.location.id });
          return true;
        case 'job':
          e.summary = 'Showing the job’s pallets.';
          toast(`Scanned job ${m.job.code}. Showing its pallets.`, 'info');
          go({ name: 'find', q: m.job.code });
          return true;
        case 'product': {
          const what = m.product ? `${m.product.description}. ` : '';
          if (m.pallets === 0) {
            say(`${what}None on hand right now.`);
            return true;
          }
          say(m.pallets === null ? `${what}Searching for pallets with this barcode.` : `${what}Showing ${m.pallets === 1 ? 'the pallet' : `${m.pallets} pallets`} received with this barcode.`);
          go({ name: 'find', q: m.reference });
          return true;
        }
        case 'command': {
          const mode = MODE_ROUTE[m.command];
          if (mode) {
            e.summary = `${m.label}. Opening the Scan station.`;
            toast(`Scanned ${m.label}. Opening the Scan station.`, 'info');
            go({ name: 'station', q: mode });
            return true;
          }
          e.summary = `${m.label}. Nothing on this screen is waiting for it.`;
          toast(`Scanned ${m.label}. Nothing on this screen is waiting for it.`, 'info');
          return 'error';
        }
        default:
          say(m.message, 'error');
          return 'error';
      }
    },
    (settings.scanAnywhere || route.name === 'overview') && !!actorId,
    -100,
    { whileModal: true },
  );

  return null;
}
