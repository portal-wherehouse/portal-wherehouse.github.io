// The portal's menu, grouped by what the person is doing: daily work and inventory, then one "Settings and
// setup" item (its page lists the setup tools) and help.
// The desktop sidebar, the phone's More page and the portal tour all read it from here. Screens that used to
// have their own menu item (Incoming, Labels, Export, Data and storage, the Help tools) are reached from the
// item that covers them, and every route still opens from its link.

import type { Role } from '../../domain/types';
import { roleAllows } from '../../domain/transitions';
import { useApp, type Route, type RouteName } from '../../app/state';
import { Icon, type IconName } from '../../ui/icons';
import { PageHead } from '../../ui/ui';
import { useJobsOn, useOrdersOn } from '../../app/words';
import { useChecklistStatus } from '../setup/SetupChecklist';

export interface NavItem {
  route: RouteName;
  /** A mode the screen opens in, e.g. the Move screen's Ship mode or the Scan station's Count mode. */
  q?: string;
  label: string;
  icon: IconName;
  hint: string;
  /** Screens this item stands for: they mark it as the current item, and the tour names them through it. */
  covers?: RouteName[];
}

export interface NavGroup {
  title: string;
  items: NavItem[];
  /** Starts folded until the person opens it. */
  folded?: boolean;
}

/** Above the groups: the home screen. */
export const HOME_ITEM: NavItem = { route: 'overview', label: 'Dashboard', icon: 'overview', hint: 'Ready to scan, and what needs attention', covers: ['reconcile'] };

/** Below the groups: help, with the guide, sync, the integrity lab and About inside it. */
export const HELP_ITEM: NavItem = { route: 'help', label: 'Help', icon: 'help', hint: 'Guides, answers and support', covers: ['lab', 'guide', 'about', 'sync'] };

const SETTINGS_ITEM: NavItem = { route: 'settings', label: 'Settings', icon: 'settings', hint: 'This device, data and storage', covers: ['data'] };

/**
 * The setup tools, one menu item for managers: spots and labels, products, people, scanners, import and
 * settings open from its page. They are used now and then, so the sidebar keeps its room for daily work.
 */
export const SETUP_TOOLS: NavItem[] = [
  { route: 'locations', label: 'Spots and labels', icon: 'locations', hint: 'Racks, areas, and printing their labels and signs', covers: ['location', 'labels'] },
  { route: 'products', label: 'Products and barcodes', icon: 'barcode', hint: 'Saved products and their barcodes' },
  { route: 'people', label: 'People', icon: 'people', hint: 'Who has access, and their roles' },
  { route: 'scanners', label: 'Scanners and printers', icon: 'qr', hint: 'Connect and test scanners and label printers' },
  { route: 'import', label: 'Import and export', icon: 'import', hint: 'Spreadsheets in and out', covers: ['export'] },
  SETTINGS_ITEM,
];

export const SETUP_ITEM: NavItem = { route: 'setup', label: 'Settings and setup', icon: 'settings', hint: 'Spots and labels, products, people, scanners, import and settings', covers: ['locations', 'location', 'labels', 'products', 'people', 'scanners', 'import', 'export', 'settings', 'data'] };

export const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Daily work',
    items: [
      { route: 'receive', label: 'Receive', icon: 'receive', hint: 'Record a delivery, or see what is expected', covers: ['incoming'] },
      { route: 'move', label: 'Put away and move', icon: 'move', hint: 'Scan it, then scan where it goes' },
      { route: 'move', q: 'ship', label: 'Ship', icon: 'truck', hint: 'Scan it, then record where it went' },
      { route: 'find', label: 'Find', icon: 'find', hint: 'Where is it?', covers: ['pallet'] },
      { route: 'orders', label: 'Pick orders', icon: 'box', hint: 'Pick, pack, stage and hand off customer orders', covers: ['order'] },
      { route: 'jobs', label: 'Jobs', icon: 'jobs', hint: 'Material grouped by project', covers: ['job'] },
    ],
  },
  {
    title: 'Inventory',
    items: [
      { route: 'map', label: 'Stock', icon: 'map', hint: 'Every spot and what is on it, and stock reports', covers: ['reports'] },
      { route: 'transfers', label: 'Transfers', icon: 'swap', hint: 'Send pallets to another warehouse', covers: ['transfer'] },
      { route: 'station', q: 'count', label: 'Counts', icon: 'checklist', hint: 'Count a spot with the Scan station', covers: ['station'] },
      { route: 'activity', label: 'History', icon: 'activity', hint: 'Every saved change' },
    ],
  },
];

/** Whether a menu item stands for the screen on show. */
export function navItemCurrent(i: NavItem, r: Route): boolean {
  if (i.route === r.name) return i.route === 'move' ? (i.q === 'ship') === (r.q === 'ship') : true;
  return !!i.covers?.includes(r.name);
}

export interface VisibleNav {
  groups: NavGroup[];
  /** At the bottom: Help, and Settings for people without the Setup group. */
  foot: NavItem[];
  /** The screens this account's menu offers. Covered screens outside it still mark their item when opened by link. */
  allowed: Set<RouteName>;
}

/**
 * Navigation is task-oriented; permission checks still happen in the command engine. Transfers is always offered:
 * with one warehouse its page explains how to add a second (`_transfers` is kept for older call sites).
 */
export function visibleNav(role: Role | null, advanced: boolean, live = false, jobsOn = true, _transfers = false, orders = false): VisibleNav {
  const manager = role === 'OWNER' || role === 'SUPERVISOR';
  const allowed = new Set<RouteName>(
    role === 'VIEWER'
      ? ['find', 'pallet', 'overview', 'map', 'reports', 'jobs', 'job', 'help', 'settings', 'about']
      : ['receive', 'incoming', 'products', 'move', 'find', 'pallet', 'station', 'overview', 'map', 'reports', 'locations', 'location', 'labels', 'jobs', 'job', 'activity', 'scanners', 'help', 'settings', 'about'],
  );
  if (manager) for (const r of ['reconcile', 'import', 'export', 'people', 'data', 'setup'] as RouteName[]) allowed.add(r);
  if (live) {
    allowed.add('sync');
    allowed.delete('data');
  }
  if (!jobsOn) {
    allowed.delete('jobs');
    allowed.delete('job');
  }
  allowed.add('transfers');
  allowed.add('transfer');
  // Pick orders is on for every warehouse unless an owner turned it off. Managers still see it when it is off:
  // the screen turns it back on with one tap. Viewers do not pick.
  if ((orders && role !== 'VIEWER') || manager) {
    allowed.add('orders');
    allowed.add('order');
  }
  if (advanced) for (const r of ['sync', 'lab', 'guide'] as RouteName[]) allowed.add(r);
  const fit = (i: NavItem): NavItem | null => {
    if (!allowed.has(i.route)) return null;
    if (i.q === 'ship' && !roleAllows(role, 'dispatch')) return null;
    return i;
  };
  const groups = NAV_GROUPS.map((g) => ({ ...g, items: g.items.map(fit).filter((i): i is NavItem => !!i) }))
    .filter((g) => g.items.length);
  const foot = [manager ? fit(SETUP_ITEM) : fit(SETTINGS_ITEM), fit(HELP_ITEM)].filter((i): i is NavItem => !!i);
  return { groups, foot, allowed };
}

/** The groups only, for callers that list items (older call sites). Help and Settings are in `visibleNav().foot`. */
export function visibleNavGroups(role: Role | null, advanced: boolean, live = false, jobsOn = true, transfers = false, orders = false): NavGroup[] {
  return visibleNav(role, advanced, live, jobsOn, transfers, orders).groups;
}

/** Every screen the menu reaches for this account, including the ones its items cover. */
export function reachableRoutes(nav: VisibleNav): Set<RouteName> {
  const out = new Set<RouteName>(['overview']);
  if (nav.groups.some((g) => g.items.some((i) => i.route === 'people'))) out.add('reconcile');
  for (const i of [...nav.groups.flatMap((g) => g.items), ...nav.foot]) {
    out.add(i.route);
    for (const r of i.covers ?? []) if (nav.allowed.has(r)) out.add(r);
  }
  return out;
}

/** Where a menu item goes. */
export function navTarget(i: NavItem): Route {
  return i.q ? { name: i.route, q: i.q } : { name: i.route };
}

/** Screens the phone's bottom tabs already reach. */
const PHONE_TABS: RouteName[] = ['overview', 'receive', 'move', 'find'];

export function More() {
  const { go, role, prefs, backend } = useApp();
  const jobsOn = useJobsOn();
  const checklist = useChecklistStatus();
  const orders = useOrdersOn();
  const nav = visibleNav(role, prefs.advancedTools, backend.mode === 'firebase', jobsOn, true, orders);
  const groups = [...nav.groups, { title: nav.foot.some((i) => i.route === 'settings' || i.route === 'setup') ? 'Help and settings' : 'Help', items: nav.foot }]
    .map((g) => ({ ...g, items: g.items.filter((i) => i.q || !PHONE_TABS.includes(i.route)) }))
    .filter((g) => g.items.length > 0);
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
      {groups.map((g) => (
        <div key={g.title} className="stack" style={{ gap: 8 }}>
          <div className="eyebrow">{g.title}</div>
          <div className="more-menu">
            {g.items.map((i) => (
              <button key={`${i.route}:${i.q ?? ''}`} onClick={() => go(navTarget(i))} data-tour={`more-${i.q ?? i.route}`}>
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
