// More: every other screen, for the phone layout where only four tabs fit.

import { useApp, type RouteName } from '../../app/state';
import { Icon, type IconName } from '../../ui/icons';
import { PageHead } from '../../ui/ui';

export const NAV_GROUPS: { title: string; items: { route: RouteName; label: string; icon: IconName; hint: string }[] }[] = [
  {
    title: 'Floor',
    items: [
      { route: 'receive', label: 'Receive', icon: 'receive', hint: 'Record a delivery' },
      { route: 'move', label: 'Move', icon: 'move', hint: 'Scan pallet, then rack' },
      { route: 'find', label: 'Find', icon: 'find', hint: 'Search anything' },
    ],
  },
  {
    title: 'Warehouse',
    items: [
      { route: 'overview', label: 'Overview', icon: 'overview', hint: 'Counts and attention' },
      { route: 'map', label: 'Map', icon: 'map', hint: 'Racks and what is on them' },
      { route: 'reconcile', label: 'Reconcile', icon: 'reconcile', hint: 'Fix what needs fixing' },
      { route: 'activity', label: 'Activity', icon: 'activity', hint: 'Every accepted change' },
    ],
  },
  {
    title: 'Manage',
    items: [
      { route: 'jobs', label: 'Jobs', icon: 'jobs', hint: 'Projects and pick lists' },
      { route: 'locations', label: 'Locations', icon: 'locations', hint: 'Racks and areas' },
      { route: 'labels', label: 'Labels', icon: 'labels', hint: 'Print pallet and rack labels' },
      { route: 'import', label: 'Import', icon: 'import', hint: 'CSV in' },
      { route: 'export', label: 'Export', icon: 'export', hint: 'CSV out' },
      { route: 'people', label: 'People', icon: 'people', hint: 'Roles and access' },
    ],
  },
  {
    title: 'Learn and tools',
    items: [
      { route: 'sync', label: 'Sync and offline', icon: 'sync', hint: 'Queue and network lab' },
      { route: 'lab', label: 'Integrity lab', icon: 'lab', hint: 'Run the blueprint tests' },
      { route: 'guide', label: 'Guide', icon: 'guide', hint: 'How it all works' },
      { route: 'settings', label: 'Settings', icon: 'settings', hint: 'Display and demo data' },
      { route: 'about', label: 'About', icon: 'about', hint: 'Credits' },
    ],
  },
];

export function More() {
  const { go } = useApp();
  return (
    <div className="stack">
      <PageHead title="More" />
      {NAV_GROUPS.slice(1).map((g) => (
        <div key={g.title} className="stack" style={{ gap: 8 }}>
          <div className="eyebrow">{g.title}</div>
          <div className="more-menu">
            {g.items.map((i) => (
              <button key={i.route} onClick={() => go(i.route)}>
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
