// The stops of the portal's "Take the tour" walkthrough: where each one happens, what it highlights,
// and what it says. PortalTour.tsx drives them.

import { BRAND } from '../../brand';
import type { Route, RouteName } from '../../app/state';
import type { Backend } from '../../data/backend';
import { canDownload } from '../../device/output';
import type { CommandKind } from '../../domain/types';
import type { IconName } from '../../ui/icons';

/** What the viewer's screen looks like right now, so the copy can match it. */
export interface View {
  /** The desktop sidebar is showing (otherwise the phone tabs and More). */
  sidebar: boolean;
  /** Narrow screen (520px or less): the connection chip is a dot and the account chip a round role badge. */
  narrow: boolean;
}

export interface StopEnv {
  backend: Backend;
  workspaceId: string | null;
}

type Copy = string | ((v: View) => string);

export interface TourStop {
  id: string;
  chapter: string;
  icon: IconName;
  title: string;
  /** A small line above the title. */
  kicker?: string;
  body: Copy;
  tip?: Copy;
  /** Where the stop happens. Omit to stay on the current screen. */
  route?: RouteName | ((env: StopEnv) => Route);
  /** The screen named in the "Find it" line; defaults to the route. */
  nav?: RouteName;
  /** A "Find it" line for screens that are not in the menu. */
  where?: string;
  /** Candidate selectors: the first visible one gets the spotlight. */
  target?: string[];
  /** More elements that join the spotlight when they fit on screen with the target. */
  extend?: string[];
  /** Line the card up with the right edge of a wide target (the top bar's chips sit on the right). */
  align?: 'end';
  /** The command this screen needs, to warn roles that can only look. */
  needs?: CommandKind;
  kind?: 'intro' | 'finish';
}

export function copy(c: Copy | undefined, v: View): string | undefined {
  return typeof c === 'function' ? c(v) : c;
}

/** The stored pallet with the richest history, so the record and history stops have something to show. */
function palletRoute({ backend, workspaceId }: StopEnv): Route {
  const db = backend.reader.db;
  const mine = Object.values(db.pallets).filter((p) => p.workspace_id === workspaceId && !p.archived_at);
  const stored = mine.filter((p) => p.state === 'STORED');
  const pool = stored.length ? stored : mine.filter((p) => p.state !== 'RETIRED');
  pool.sort((a, b) => (db.events[b.id]?.length ?? 0) - (db.events[a.id]?.length ?? 0) || a.code.localeCompare(b.code));
  return pool[0] ? { name: 'pallet', id: pool[0].id } : { name: 'find' };
}

/** The open job with the most material on hand, so its pick list is not empty. */
function jobRoute({ backend, workspaceId }: StopEnv): Route {
  const db = backend.reader.db;
  const onHand: Record<string, number> = {};
  for (const p of Object.values(db.pallets)) {
    if (p.workspace_id === workspaceId && !p.archived_at && (p.state === 'STORED' || p.state === 'RECEIVED')) onHand[p.job_id] = (onHand[p.job_id] ?? 0) + 1;
  }
  const jobs = Object.values(db.jobs).filter((j) => j.workspace_id === workspaceId && j.status === 'OPEN');
  jobs.sort((a, b) => (onHand[b.id] ?? 0) - (onHand[a.id] ?? 0) || a.code.localeCompare(b.code));
  return jobs[0] ? { name: 'job', id: jobs[0].id } : { name: 'jobs' };
}

export const STOPS: TourStop[] = [
  {
    id: 'intro',
    kind: 'intro',
    chapter: 'Welcome',
    icon: 'tour',
    kicker: 'Welcome to the',
    title: BRAND.portal,
    body: 'This tour visits every screen in the portal and explains what each one is for. It takes about 5 minutes. You can leave at any point, and nothing on the tour changes your records.',
  },
  {
    id: 'topbar',
    chapter: 'Getting around',
    icon: 'wifi',
    title: 'The top bar',
    target: ['.topbar'],
    align: 'end',
    body: (v) =>
      v.narrow
        ? 'The top bar stays on every screen. The dot is your connection, and a number beside it counts changes on this device the server has not confirmed yet. The flag starts this tour, and the round badge shows the role you are using: OWN, SUP, OP or VW.'
        : 'The top bar stays on every screen. The connection chip shows whether you are online, and a number beside it counts changes on this device the server has not confirmed yet. The account chip shows the role you are using, and the flag button, Take the tour, brings you back here any time.',
    tip: (v) => `Sign-in is off while we test. Use the ${v.narrow ? 'round account badge' : 'account chip'}, or Switch role in the yellow strip, to try the Owner, Supervisor, Operator and Viewer accounts.`,
  },
  {
    id: 'nav',
    chapter: 'Getting around',
    icon: 'menu',
    title: 'Getting around',
    target: ['.sidebar', '.bottom-nav'],
    body: (v) =>
      v.sidebar
        ? 'The sidebar is grouped by what you are doing. Daily work is receiving, putting away, shipping and finding. Inventory shows your stock, counts and history. Setup holds spots, labels, products, people and scanners, and starts folded. Help is at the bottom.'
        : 'The tabs at the bottom are the daily work: Receive, Move and Find. More has the rest, in the same groups as the sidebar: Daily work, Inventory, Setup, and Help.',
    tip: (v) =>
      v.sidebar
        ? 'The number beside Dashboard counts items that need attention. A number beside Help counts changes still waiting on this device.'
        : 'A red number on More means a queued change needs your decision in Sync and offline.',
  },
  {
    id: 'overview',
    chapter: 'Getting around',
    icon: 'overview',
    title: 'Dashboard',
    route: 'overview',
    target: ['[data-tour="overview-summary"]', '#main .scan-ready'],
    body: 'The Dashboard is ready to scan the moment it opens: scan any label to open it. Below that are the everyday tasks, what needs attention, and your recorded pallet counts and recent changes.',
    tip: 'Counts come from saved records. In a customer warehouse, the recent-changes chart shows the latest 50 events; History has the older ones.',
  },
  {
    id: 'reconcile',
    chapter: 'Getting around',
    icon: 'reconcile',
    title: 'Needs attention',
    route: 'reconcile',
    target: ['[data-tour="reconcile-lists"]', '#main .tabs'],
    extend: ['[data-tour="reconcile-fix"]', '#main .notice'],
    body: 'Needs attention keeps the records matching the floor. Five short lists catch what needs a person: needs placement, missing, on hold, labels to reprint, and not verified in 3 or more days. Each list explains the problem and has a button for the fix, and every fix is saved to the pallet’s history.',
    tip: 'A quick pass at the start of each shift keeps these lists short.',
  },
  {
    id: 'receive',
    chapter: 'Daily work',
    icon: 'receive',
    title: 'Receive',
    route: 'receive',
    needs: 'receive',
    target: ['[data-tour="receive-form"]', '#main form'],
    body: 'Receiving gives a delivery its identity. Scan its barcode or describe it so anyone could recognize it, and save. The server assigns a permanent code like P-000042, and the screen asks you to scan the spot it goes to straight away. The Incoming tab lists deliveries you are expecting.',
    tip: 'The photo is optional and uploads on its own. If the upload fails, the pallet is still saved and you can retry the photo.',
  },
  {
    id: 'move',
    chapter: 'Daily work',
    icon: 'move',
    title: 'Put away and move',
    route: 'move',
    needs: 'move',
    target: ['[data-tour="move-flow"]', '#main .page-head'],
    body: 'Scan the pallet, then the spot it is going to, then that spot once more to save. The big line always says what to scan next, and the camera stays on between scans. Stage does the same for staging spots. Nothing changes until the server accepts it, and if someone moved that pallet first, you see the newer record instead of overwriting it.',
    tip: 'No label handy? Type the big printed code, like P-000042 or A-03-02. In this demo you can also tap one of the sample labels.',
  },
  {
    id: 'ship',
    chapter: 'Daily work',
    icon: 'truck',
    title: 'Ship',
    route: () => ({ name: 'move', q: 'ship' }),
    nav: 'move',
    where: 'Sidebar › Daily work › Ship, or the Ship tab on Put away and move',
    needs: 'dispatch',
    target: ['[data-tour="move-flow"]', '#main .page-head'],
    body: 'Ship records material leaving the building. Scan the pallet and its dispatch form opens at once, with the destination filled in from its job when there is one. Save it, and the screen is ready for the next scan.',
    tip: 'A pallet on hold cannot be shipped. Clear the hold first, or move it to quarantine.',
  },
  {
    id: 'find',
    chapter: 'Daily work',
    icon: 'find',
    title: 'Find',
    route: 'find',
    target: ['[data-tour="find-search"]', '#main .search-bar'],
    extend: ['[data-tour="find-filters"]', '#main .filter-row'],
    body: 'Search by job, pallet code, rack, or a few words of the description. Each result leads with where the pallet was last confirmed, because that is where you walk to. Narrow it down by state, job or location, or use the quick views for pallets that need placement, are on hold, or are missing.',
    tip: (v) => (v.sidebar ? 'Press / on a keyboard to jump to the search box.' : 'Tap any result to open that pallet’s full record.'),
  },
  {
    id: 'pallet',
    chapter: 'Daily work',
    icon: 'pallet',
    title: 'A pallet record',
    route: palletRoute,
    where: 'Open any pallet from Find, Stock, or History',
    target: ['[data-tour="pallet-where"]', '#main .grid-2 > .panel'],
    extend: ['#main .page-head', '[data-tour="pallet-details"]'],
    body: 'Each pallet has one record that follows it for life. It shows where the pallet was last confirmed, its job and details, and only the actions its state and your role allow, such as Move, Confirm still here, Dispatch or Put on hold. The Label button at the top prints its QR label again, with the same code.',
    tip: 'Photos and edits live here too. Supervisors can also correct a mistake or split one pallet into two.',
  },
  {
    id: 'history',
    chapter: 'Daily work',
    icon: 'history',
    title: 'Its history',
    route: palletRoute,
    where: 'At the bottom of every pallet record',
    target: ['[data-tour="pallet-history"]'],
    body: 'Below the details is the pallet’s full history, newest first. Each entry shows what happened, who did it, when, and where the pallet was before and after. Entries are never edited or deleted. A mistake is fixed with a correction entry that points back to it, so the original stays visible.',
    tip: 'The name on each entry comes from the account that made the change, never from typed text.',
  },
  {
    id: 'jobs',
    chapter: 'Daily work',
    icon: 'jobs',
    title: 'Jobs',
    route: 'jobs',
    target: ['[data-tour="jobs-table"]', '#main .table-wrap'],
    extend: ['#main .seg'],
    body: 'A job is the project that owns the material, and every pallet belongs to exactly one. The table shows how many pallets each job has waiting, stored, missing, on hold and dispatched. Supervisors create jobs, and a job cannot close while any of its material is still in the building or unresolved.',
  },
  {
    id: 'picklist',
    chapter: 'Daily work',
    icon: 'checklist',
    title: 'Pick lists',
    route: jobRoute,
    where: 'Jobs, then open any job',
    target: ['[data-tour="pick-list"]'],
    extend: ['#main .stats'],
    body: 'Open a job to get its pick list: everything on hand for that job, sorted by rack so one walk collects it all. Print it for the floor or open any pallet from it. Missing and dispatched pallets are listed separately below.',
    tip: 'A printed list shows recorded locations, so check each pallet’s label before it goes on the truck.',
  },
  {
    id: 'map',
    chapter: 'Inventory',
    icon: 'map',
    title: 'Stock',
    route: 'map',
    target: ['[data-tour="map-zones"]', '#main .map-zone'],
    body: 'Stock is your warehouse map, drawn from your location codes: A-02-01 reads as zone A, aisle 02, bay 01. Each small box is one pallet recorded there, and a striped box is a pallet on hold. Select a bay to see what is on it and open any pallet.',
    tip: '“Nothing recorded” means no pallet is on file there. It does not promise the space is empty.',
  },
  {
    id: 'activity',
    chapter: 'Inventory',
    icon: 'activity',
    title: 'History',
    route: 'activity',
    target: ['[data-tour="activity-filters"]', '#main .filter-row'],
    extend: ['#main .panel.flush'],
    body: 'History is the log of every accepted change in this company, newest first and grouped by day. Filter by the kind of change or by person, and select any line to open that pallet. Attempts that were refused never appear, because they changed nothing.',
  },
  {
    id: 'station',
    chapter: 'Scanning',
    icon: 'target',
    title: 'Scan station',
    route: 'station',
    target: ['[data-tour="station-modes"]', '#main .page-head'],
    extend: ['[data-tour="station-status"]'],
    body: 'Scan station is a full-screen mode for a desk, cart or dock door with a scanner or the phone camera. Pick a mode (Look up, Move, Put-away or Count), then keep scanning without touching the screen. Counts in the menu opens it in Count mode. Printed command barcodes switch modes and confirm, so your hands stay on the scanner.',
    tip: 'Put-away is the quick one for a new delivery: scan the rack once, then every pallet going onto it.',
  },
  {
    id: 'scanners',
    chapter: 'Scanning',
    icon: 'qr',
    title: 'Scanners',
    route: 'scanners',
    target: ['[data-tour="scanner-test-pad"]', '#main .page-head'],
    body: 'Connect a barcode scanner and check that it works. Most USB and Bluetooth scanners can be set to act like a keyboard, often called HID or keyboard-wedge mode, and the portal tells a scanner’s fast burst apart from normal typing. Test a scan here, adjust the settings, and print the command barcodes.',
    tip: 'No scanner? The phone camera, a photo of the label, or typing the printed code always work.',
  },
  {
    id: 'locations',
    chapter: 'Setup',
    icon: 'locations',
    title: 'Spots and labels',
    route: 'locations',
    target: ['[data-tour="locations-table"]', '#main .table-wrap'],
    extend: ['#main .filter-row'],
    body: 'Spots are your racks and areas: receiving, quarantine, staging and floor spots. Each has its own QR label, and the table shows how many pallets are recorded at each one. Supervisors add locations, print every rack label in one batch, and switch off spots that are no longer used.',
    tip: 'A rack label’s QR carries a random token, so it keeps working after a rename. Reprint the label so its printed code and barcode match.',
  },
  {
    id: 'labels',
    chapter: 'Setup',
    icon: 'labels',
    title: 'Labels',
    route: 'labels',
    target: ['[data-tour="labels-source"]', '#main .grid-2 > .panel'],
    extend: ['[data-tour="labels-anatomy"]'],
    body: 'Print labels in batches: everything that needs a reprint, pallets waiting for placement, everything on a job, a hand-picked set, or every rack. Preview first, then print at actual size. The QR code holds only a random token, so a label never goes out of date when a pallet moves.',
    tip: 'Check that the calibration square measures exactly 1 inch before a big batch. If it does not, fix the printer scaling first.',
  },
  {
    id: 'import',
    chapter: 'Setup',
    icon: 'import',
    title: 'Import',
    route: 'import',
    needs: 'import_batch',
    target: ['[data-tour="import-steps"]'],
    extend: ['[data-tour="import-kind"]', '#main .seg'],
    body: 'Bring in locations, jobs or pallets you already have from a spreadsheet saved as CSV. Get the template, paste or choose your file, and check the preview. After you press Import, any problem is listed by row and column and nothing is saved. The whole batch goes in or none of it does, so a bad row never leaves half an import behind.',
    tip: 'Imported pallets start with no rack. Staff place each one with a scan, so every location is confirmed by a person.',
  },
  {
    id: 'export',
    chapter: 'Setup',
    icon: 'export',
    title: 'Export',
    route: 'export',
    needs: 'close_job',
    target: ['[data-tour="export-files"]'],
    body: 'Export gives you the whole company as spreadsheet files: pallets, the full history, locations and jobs, plus a manifest that records when and how the export was made. The files open cleanly in Excel, and any cell that could run as a formula is made safe.',
    tip: () => (canDownload() ? 'Use it for month-end records, audits, or to keep your own copy of everything.' : 'This hosted preview cannot save files, so each button copies the file to your clipboard instead.'),
  },
  {
    id: 'people',
    chapter: 'Setup',
    icon: 'people',
    title: 'People',
    route: 'people',
    target: ['[data-tour="people-list"]'],
    body: 'People lists everyone with access to this company. Owners can do everything, Supervisors run jobs, racks and fixes, Operators do the floor work, and Viewers can look but not change anything. Supervisors and owners invite people, change roles and remove access here, and each change goes into the admin audit log.',
    tip: 'Sign-in is off while we test, so “Sign in as” lets you try any account and see exactly what its role allows.',
  },
  {
    id: 'settings',
    chapter: 'Setup',
    icon: 'settings',
    title: 'Settings',
    route: 'settings',
    target: ['[data-tour="settings-display"]', '#main .panel'],
    body: 'Settings are saved on this device. Pick light or dark, switch to large text and bigger buttons for gloves and bright sunlight, choose the screen you start on, and show or hide the “How this works” links. The Data and storage tab is where backups live.',
  },
  {
    id: 'data',
    chapter: 'Setup',
    icon: 'database',
    title: 'Data and storage',
    route: 'data',
    target: ['[data-tour="data-where"]', '#main .page-head'],
    body: 'Data and storage explains where your records live and how they are kept safe. In this demo everything is stored in this browser, and supervisors and owners can download a backup file and restore it. The plan for launch is Firebase: accounts through Firebase Auth, records in Firestore with every change checked on the server by the same rules, and photos in Cloud Storage.',
  },
  {
    id: 'help',
    chapter: 'Help',
    icon: 'help',
    title: 'Help',
    route: 'help',
    target: ['#main .page-head'],
    extend: ['#main .help-nav'],
    body: 'Help is where to go when you are stuck. Search everything at once, follow step-by-step tutorials, check the answers to common questions, or write to support. The walkthrough video is coming soon, and its spot already describes every chapter.',
    tip: 'Each tutorial has a Show me button that opens the real screen. The sample warehouse is safe to practice on.',
  },
  {
    id: 'sync',
    chapter: 'Help',
    icon: 'sync',
    title: 'Sync and offline',
    route: 'sync',
    target: ['[data-tour="sync-lab"]'],
    extend: ['#main .page-head'],
    body: 'Warehouses have dead zones. When the connection drops, the portal keeps showing what it last knew, marked as cached, and moves are saved on this device as queued, never as done. When you reconnect they are sent in order, and if someone changed a pallet first, you decide what happens.',
    tip: 'The connection in this demo is simulated. Use the network lab to go offline, make a move, then come back online and watch it sync.',
  },
  {
    id: 'lab',
    chapter: 'Help',
    icon: 'lab',
    title: 'Integrity lab',
    route: 'lab',
    target: ['[data-tour="lab-progress"]'],
    extend: ['#main .page-head'],
    body: 'The integrity lab acts out the bad days: lost responses, two phones moving the same pallet, a removed employee, a half-finished import. Run the tests to watch each one play out against the real rules and show its evidence line by line. Each test uses its own fresh copy of the demo warehouse, so your data is never touched.',
  },
  {
    id: 'guide',
    chapter: 'Help',
    icon: 'guide',
    title: 'Guide',
    route: 'guide',
    target: ['[data-tour="guide-sections"]', '#main .tabs'],
    extend: ['#main .page-head'],
    body: 'The Guide is the handbook. It explains the big ideas, the life of a pallet, daily work, what each role can do, the words used on screen, common questions, and what is real and what is simulated in this build.',
    tip: 'A good first read for anyone new, before their first shift.',
  },
  {
    id: 'about',
    chapter: 'Help',
    icon: 'about',
    title: 'About',
    route: 'about',
    target: ['[data-tour="about-credit"]', '#main .credit-card'],
    body: `About shows who made ${BRAND.name} and how to reach them by email or LinkedIn. It also lists the tools the portal is built with.`,
  },
  {
    id: 'finish',
    kind: 'finish',
    chapter: 'Finish',
    icon: 'checkCircle',
    title: 'You’re ready',
    body: 'That is the whole portal. The quickest way to learn it is to use it: the practice shift walks one pallet from delivery to a job site and back, and ticks off each step as you really do it. Help has tutorials, answers and the plan for the walkthrough video whenever you need them.',
  },
];

const CHAPTER_ICON: Record<string, IconName> = {
  'Getting around': 'menu',
  'Daily work': 'hardhat',
  Inventory: 'map',
  Scanning: 'scanner',
  Setup: 'layers',
  Help: 'guide',
};

export interface Chapter {
  name: string;
  icon: IconName;
  /** Index of the chapter's first stop. */
  first: number;
  count: number;
}

/** Chapters in tour order, for the intro card's "jump to" list. */
export const CHAPTERS: Chapter[] = STOPS.reduce<Chapter[]>((out, s, i) => {
  if (s.kind) return out;
  const last = out[out.length - 1];
  if (last && last.name === s.chapter) last.count++;
  else out.push({ name: s.chapter, icon: CHAPTER_ICON[s.chapter] ?? s.icon, first: i, count: 1 });
  return out;
}, []);
