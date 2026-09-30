// More: every other screen, for the phone layout where the main tabs stay focused.

import type { Role } from '../../domain/types';
import { useApp, type RouteName } from '../../app/state';
import { Icon, type IconName } from '../../ui/icons';
import { PageHead } from '../../ui/ui';
import { useJobsOn } from '../../app/words';
import { useChecklistStatus } from '../setup/SetupChecklist';

export const NAV_GROUPS: { title: string; items: { route: RouteName; label: string; icon: IconName; hint: string }[] }[] = [
  {
    title: 'Floor',
    items: [
      { route: 'receive', label: 'Receive', icon: 'receive', hint: 'Record a delivery' },
      { route: 'incoming', label: 'Incoming', icon: 'import', hint: 'Expected deliveries from imports' },
      { route: 'move', label: 'Move', icon: 'move', hint: 'Scan pallet, then rack' },
      { route: 'find', label: 'Find', icon: 'find', hint: 'Search anything' },
      { route: 'station', label: 'Scan station', icon: 'target', hint: 'Hands-free scanning' },
    ],
  },
  {
    title: 'Warehouse',
    items: [
      { route: 'overview', label: 'Dashboard', icon: 'overview', hint: 'Counts and attention' },
      { route: 'map', label: 'Warehouse map', icon: 'map', hint: 'Racks and what is on them' },
      { route: 'reconcile', label: 'Needs attention', icon: 'reconcile', hint: 'Fix what needs fixing' },
      { route: 'locations', label: 'Locations', icon: 'locations', hint: 'Racks and areas' },
      { route: 'labels', label: 'Labels', icon: 'labels', hint: 'Print pallet and rack labels' },
      { route: 'products', label: 'Pallet types', icon: 'barcode', hint: 'Saved pallets and their barcodes' },
      { route: 'activity', label: 'Activity', icon: 'activity', hint: 'Every accepted change' },
    ],
  },
  {
    title: 'Manage',
    items: [
      { route: 'jobs', label: 'Jobs', icon: 'jobs', hint: 'Projects and pick lists' },
      { route: 'import', label: 'Import', icon: 'import', hint: 'CSV in' },
      { route: 'export', label: 'Export', icon: 'export', hint: 'CSV out' },
      { route: 'people', label: 'Manager dashboard', icon: 'people', hint: 'Roles and access' },
      { route: 'scanners', label: 'Scanners', icon: 'qr', hint: 'Connect and test scanners' },
      { route: 'data', label: 'Data and storage', icon: 'database', hint: 'Where records live, backups' },
    ],
  },
  {
    title: 'Learn and tools',
    items: [
      { route: 'help', label: 'Help', icon: 'help', hint: 'Video, tutorials, FAQ, contact' },
      { route: 'sync', label: 'Sync and offline', icon: 'sync', hint: 'Waiting moves and sync status' },
      { route: 'lab', label: 'Integrity lab', icon: 'lab', hint: 'Run the built-in safety tests' },
      { route: 'guide', label: 'Guide', icon: 'guide', hint: 'How it all works' },
      { route: 'settings', label: 'Settings', icon: 'settings', hint: 'Display and account' },
      { route: 'about', label: 'About', icon: 'about', hint: 'Credits' },
    ],
  },
];

/** Navigation is task-oriented; permission checks still happen in the command engine. */
export function visibleNavGroups(role: Role | null, advanced: boolean, live = false, jobsOn = true) {
  const manager = role === 'OWNER' || role === 'SUPERVISOR';
  const allowed = new Set<RouteName>(role === 'VIEWER'
    ? ['find', 'overview', 'map', 'jobs', 'help', 'settings']
    : ['receive', 'incoming', 'products', 'move', 'find', 'station', 'map', 'locations', 'labels', 'jobs', 'activity', 'scanners', 'help', 'settings']);
  if (manager) for (const r of ['overview', 'map', 'reconcile', 'activity', 'jobs', 'locations', 'labels', 'import', 'export', 'people', 'scanners', 'data'] as RouteName[]) allowed.add(r);
  if (live) allowed.add('sync');
  if (!jobsOn) allowed.delete('jobs');
  if (advanced) for (const r of ['sync', 'lab', 'guide', 'about', 'scanners'] as RouteName[]) allowed.add(r);
  return NAV_GROUPS.map(g => ({ ...g, title: g.title === 'Learn and tools' ? 'Support' : g.title === 'Manage' && !manager ? 'Tools' : g.title,
    items: g.items.filter(i => allowed.has(i.route) && !(live && i.route === 'data')) })).filter(g => g.items.length);
}

/** Screens the phone's bottom tabs already reach. */
const PHONE_TABS: RouteName[] = ['overview', 'receive', 'move', 'find'];

export function More() {
  const { go, role, prefs, backend } = useApp();
  const jobsOn = useJobsOn();
  const checklist = useChecklistStatus();
  return (
    <div className="stack">
      <PageHead title="More" />
      {checklist.show && (
        <div className="more-menu">
          <button className="checklist-more" onClick={() => go('checklist')} data-tour="more-checklist">
            <Icon name="checklist" />
            Setup checklist
            <small>
              {checklist.done} of {checklist.total} done
            </small>
          </button>
        </div>
      )}
      {visibleNavGroups(role, prefs.advancedTools, backend.mode === 'firebase', jobsOn).map((g) => ({ ...g, items: g.items.filter((i) => !PHONE_TABS.includes(i.route)) }))
        .filter((g) => g.items.length > 0)
        .map((g) => (
        <div key={g.title} className="stack" style={{ gap: 8 }}>
          <div className="eyebrow">{g.title}</div>
          <div className="more-menu">
            {g.items.map((i) => (
              <button key={i.route} onClick={() => go(i.route)} data-tour={`more-${i.route}`}>
                <Icon name={i.icon} />
                {i.label}
                <small>{i.hint}</small>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
