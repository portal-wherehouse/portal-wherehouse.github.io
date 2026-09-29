// The planned video walkthrough: what it covers and its chapters, with timestamps worked out
// from each chapter's planned length so the list always adds up.

import { BRAND } from '../../brand';
import type { IconName } from '../../ui/icons';
import type { HelpTarget } from './types';

export interface VideoChapter {
  id: string;
  title: string;
  icon: IconName;
  /** Planned length of the chapter in seconds. */
  seconds: number;
  /** What is on screen during the chapter. */
  shows: string;
  target: HelpTarget;
  /** The screen "Go there" opens, in words. */
  where: string;
}

const CHAPTERS: VideoChapter[] = [
  {
    id: 'portal',
    title: 'Opening the portal and choosing a role',
    icon: 'key',
    seconds: 70,
    shows: `We start on the ${BRAND.name} website and press Open ${BRAND.portal}, which leads to the portal’s front door. Sign-in is off while we test, so we pick one of the four demo roles (Owner, Supervisor, Operator or Viewer) and walk straight in. You also see the yellow demo strip and its Switch role button. When sign-in arrives later, each person will sign in with their own email instead.`,
    target: { route: 'signin' },
    where: 'the portal front door',
  },
  {
    id: 'around',
    title: 'Getting around, and the Take the tour button',
    icon: 'tour',
    seconds: 80,
    shows: 'A lap of the screen on a phone and on a desktop: the top bar with the Online chip and the count of unconfirmed changes, the bottom tabs for Receive, Move and Find, and the More screen and sidebar with every other page in four groups. Then we press Take the tour in the top right and follow a few stops, showing how it highlights each part of a screen and how to leave it at any point.',
    target: { action: 'tour' },
    where: 'the portal tour',
  },
  {
    id: 'receive',
    title: 'Receiving a delivery: job, description and photo',
    icon: 'receive',
    seconds: 110,
    shows: 'We receive a delivery for job J-214, School renovation. You see why only open jobs are listed, how to write a description someone else would recognize, and where the supplier reference and note go. We add a photo from the phone, save, and watch the server assign a permanent code in the P-000042 style. We also show that a failed photo upload leaves the pallet safely saved.',
    target: { route: 'receive' },
    where: 'Receive',
  },
  {
    id: 'labels',
    title: 'Printing and applying labels, and reprints',
    icon: 'print',
    seconds: 75,
    shows: 'Straight from the saved pallet we press Print label, check the preview, and print at actual size on a 4 x 6 inch label. We stick it where it can be scanned from the aisle and explain what the big printed code is for. Then we change a pallet’s description, watch it land on the reprint list in Needs attention, print the new label, and press New label is on.',
    target: { route: 'labels' },
    where: 'Labels',
  },
  {
    id: 'camera',
    title: 'Moving a pallet with the phone camera',
    icon: 'camera',
    seconds: 90,
    shows: 'The heart of the app: two scans and a confirmation. We open Move, press Scan with camera, point at the pallet label and then at the rack label, and read the review card (where it was, where it is going, its job and its version) before pressing Move. We also show the fallbacks: Scan from a photo, typing the printed code, and the sample labels in the demo.',
    target: { route: 'move' },
    where: 'Move',
  },
  {
    id: 'scanner',
    title: 'Moving with a USB or Bluetooth scanner',
    icon: 'scanner',
    seconds: 85,
    shows: 'We set a handheld scanner to keyboard mode (often called HID or keyboard-wedge mode) with Enter after each code, and test it on the Scanners page, which tells a scanner’s fast burst apart from someone typing. Then we make the same move as before without touching the screen: scan the pallet, scan the rack, and confirm with a scan.',
    target: { route: 'scanners' },
    where: 'Scanners',
  },
  {
    id: 'station',
    title: 'The Scan station: look up, move, put-away and count',
    icon: 'target',
    seconds: 105,
    shows: 'Scan station is a full-screen mode for a desk, cart or dock door. We run all four modes: Look up shows where any scanned pallet or rack is, Move takes a pallet and then its new rack, Put-away takes one rack and then every pallet going onto it, and Count checks what is on a rack against the records. We keep hands on the scanner the whole time.',
    target: { route: 'station' },
    where: 'Scan station',
  },
  {
    id: 'commands',
    title: 'Command barcodes',
    icon: 'barcode',
    seconds: 50,
    shows: 'Command barcodes are printed codes that act like buttons: Confirm, Cancel, Finish, and one for each Scan station mode. We print the sheet from the Scanners page, keep it on the cart, and switch modes and confirm moves by scanning them, so nobody has to put the scanner down to tap the screen.',
    target: { route: 'scanners' },
    where: 'Scanners',
  },
  {
    id: 'find',
    title: 'Finding anything with search and filters',
    icon: 'find',
    seconds: 70,
    shows: 'We search the ways people really ask: a job code (J-214), a pallet code, a rack (A-03-02), and a few words like “door hardware”. We narrow results with the state and On hold filters, the job and location lists, and the quick views, and point out that every result leads with where the pallet was last confirmed. Keyboard users see the / shortcut.',
    target: { route: 'find' },
    where: 'Find',
  },
  {
    id: 'record',
    title: 'Reading a pallet record and its history',
    icon: 'history',
    seconds: 75,
    shows: 'We open one pallet and read it top to bottom: where it was last confirmed and when, its job and details, its photos, and only the actions its state and your role allow. Then we scroll through its history, where each entry shows what happened, who did it, when, and the before and after, and explain why entries are never edited or deleted.',
    target: { pallet: 'history' },
    where: 'a pallet record',
  },
  {
    id: 'dispatch',
    title: 'Dispatching to a job site and recording returns',
    icon: 'truck',
    seconds: 70,
    shows: 'We dispatch a stored pallet to its job site. The destination is filled in from the job, and the rack is cleared. We explain that a dispatch records that the pallet left, not that the site received it. Then the pallet comes back and we record the return with a condition note, which puts it back in the building as Received with the same code, ready to place again.',
    target: { pallet: 'stored' },
    where: 'a stored pallet',
  },
  {
    id: 'holds',
    title: 'Holds, missing pallets, and finding them again',
    icon: 'hold',
    seconds: 85,
    shows: 'A pallet arrives damaged, so we put it on hold with a reason and move it to QUARANTINE-01. The hold blocks dispatch, not moves. Another pallet is not where its record says, so we mark it missing, which keeps its last rack as history and adds it to Needs attention. Finally a supervisor records where it was found, and it is stored again.',
    target: { route: 'reconcile' },
    where: 'Needs attention',
  },
  {
    id: 'corrections',
    title: 'Fixing mistakes with corrections',
    icon: 'edit',
    seconds: 60,
    shows: 'Someone scanned the wrong rack last week. As a supervisor, we press Correct this entry beside it in the history, review everything that happened after it, state where the pallet really is, and give a reason. The history keeps the original entry and adds a correction that points back to it. We also show Edit details for simple typos.',
    target: { pallet: 'history' },
    where: 'a pallet record',
  },
  {
    id: 'split',
    title: 'Splitting a pallet',
    icon: 'split',
    seconds: 55,
    shows: 'Half a pallet is going to the site and half is staying. A supervisor splits the stored pallet into portions, each with its own description and job, confirms the portions were checked on the floor, and prints a new label for each. The original is retired with its history, and each new pallet shows where it was split from.',
    target: { pallet: 'stored' },
    where: 'a stored pallet',
  },
  {
    id: 'overview',
    title: 'The Overview dashboard and the warehouse map',
    icon: 'overview',
    seconds: 65,
    shows: 'The morning check: pallets on hand, the tiles for what needs attention, 14 days of changes, the busiest locations and the table per job. Then the map, drawn from your location codes, where each small box is a recorded pallet and a striped box is one on hold. We tap a bay to see what is on it and explain why the map never claims a spot is free.',
    target: { route: 'overview' },
    where: 'Overview',
  },
  {
    id: 'reconcile',
    title: 'Needs attention: working the queues',
    icon: 'reconcile',
    seconds: 55,
    shows: 'We work the five lists at the start of a shift: needs placement, missing, on hold, labels to reprint, and not verified in 3 or more days. Each list says what is wrong and has a button for the fix, like Place now or Verify with a scan, and the counts drop as we go.',
    target: { route: 'reconcile' },
    where: 'Needs attention',
  },
  {
    id: 'jobs',
    title: 'Jobs and pick lists',
    icon: 'jobs',
    seconds: 60,
    shows: 'A supervisor creates a job with a short code and destination notes. We open an existing job to see its pick list: everything on hand, sorted by rack so one walk collects it all, with missing and dispatched pallets listed apart. We print the pick list and show why a job cannot close while its material is still in the building.',
    target: { route: 'jobs' },
    where: 'Jobs',
  },
  {
    id: 'locations',
    title: 'Locations and rack labels',
    icon: 'locations',
    seconds: 60,
    shows: 'We add a rack position, see how a code like A-02-01 reads as zone, aisle and bay, and add a quarantine area. Then we print every rack label in one batch, and explain why the QR keeps working after a rename while the label still needs a reprint, and why a location with pallets on it cannot be switched off.',
    target: { route: 'locations' },
    where: 'Locations',
  },
  {
    id: 'studio',
    title: 'Labels: printing in batches',
    icon: 'labels',
    seconds: 50,
    shows: 'The Labels page builds a print run: everything that needs a reprint, pallets waiting for placement, everything on a job, a hand-picked set, or every rack label. We check the 1 inch calibration square before a big batch and look at what the QR code holds: a random token and nothing else.',
    target: { route: 'labels' },
    where: 'Labels',
  },
  {
    id: 'csv',
    title: 'CSV import and export',
    icon: 'import',
    seconds: 75,
    shows: 'We bring in racks, jobs and existing pallets from a spreadsheet: get the template, paste the file, and read the preview, which points to any problem by row and column. The batch goes in whole or not at all. Then we export pallets, the full history, locations and jobs as files that open cleanly in Excel, with a manifest describing the export.',
    target: { route: 'import' },
    where: 'Import',
  },
  {
    id: 'people',
    title: 'People and roles',
    icon: 'people',
    seconds: 60,
    shows: 'We invite a new operator, change a role and remove someone, then read the admin audit log that records each change. The role table shows what Owners, Supervisors, Operators and Viewers can do, and we switch to the Viewer account to show that the server refuses its changes, not just hides the buttons.',
    target: { route: 'people' },
    where: 'People',
  },
  {
    id: 'offline',
    title: 'Working offline and resolving sync conflicts',
    icon: 'wifiOff',
    seconds: 90,
    shows: 'We walk into a dead zone using the network lab. Search keeps working from the cached copy, marked with its time, and a move is saved on the phone as queued, never as done. Back online, the queue sends itself in order. Then we set up a conflict, where another phone moved the same pallet first, and choose between moving it anyway and keeping their change.',
    target: { route: 'sync' },
    where: 'Sync and offline',
  },
  {
    id: 'data',
    title: 'Data, storage and backups',
    icon: 'database',
    seconds: 55,
    shows: 'We open Data and storage to see where records live today, in this browser, and the plan for launch, with accounts and records kept on shared servers. We cover how to download a backup and restore it later, how Export gives spreadsheet copies, and what resetting the demo does to the sample data.',
    target: { route: 'data' },
    where: 'Data and storage',
  },
  {
    id: 'settings',
    title: 'Settings, and getting help',
    icon: 'settings',
    seconds: 50,
    shows: 'We switch to dark mode and large text for gloves and bright sun, choose the screen the portal opens on, and hide the How this works boxes. We finish on this Help page: the tutorials, the questions, the contact form, and the Guide handbook for anyone who wants the full picture.',
    target: { route: 'settings' },
    where: 'Settings',
  },
];

export interface TimedChapter extends VideoChapter {
  /** Start time in seconds from the beginning of the video. */
  start: number;
  /** Start time as m:ss. */
  stamp: string;
}

export function formatStamp(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export const VIDEO_CHAPTERS: TimedChapter[] = CHAPTERS.reduce<TimedChapter[]>((out, c) => {
  const prev = out[out.length - 1];
  const start = prev ? prev.start + prev.seconds : 0;
  out.push({ ...c, start, stamp: formatStamp(start) });
  return out;
}, []);

export const VIDEO_SECONDS = CHAPTERS.reduce((n, c) => n + c.seconds, 0);

/** "about 28 minutes" */
export const VIDEO_LENGTH_LABEL = `about ${Math.round(VIDEO_SECONDS / 60)} minutes`;

/** Who the video is for, what it shows, and what you need: the "What this video covers" text. */
export const VIDEO_ABOUT = {
  title: `The complete ${BRAND.portal} walkthrough`,
  forWho: `This will be the full walkthrough of the ${BRAND.portal}, recorded start to finish in the sample warehouse that comes with it. It is made for everyone who will touch the system: the crew receiving deliveries and moving pallets, the supervisors who set up jobs and racks and fix mistakes, the office staff who search and print pick lists, and the owner deciding how the company will run it. You do not need to know anything about ${BRAND.name} before you press play.`,
  story: 'It will follow real work, not a slideshow. We receive a delivery for job J-214, print its label, and put it on a rack with the phone camera. Then we do the same with a hardware scanner and at the Scan station. We find the pallet again the way a colleague would, dispatch it to the job site, record its return, and fix a mistake with a correction. The main screens appear on a phone and on a desktop, so you see both layouts.',
  outcomes: [
    'Receive a delivery against the right job and print its label',
    'Move and put away pallets with the phone camera or a USB or Bluetooth scanner',
    'Find anything by job, pallet code, rack or a few words of description',
    'Keep records honest with holds, missing reports, counts and corrections',
    'Set up racks, jobs, labels and people, and bring in your spreadsheets',
    'Know exactly what happens when the signal drops, and what to do when two people change the same pallet',
  ],
  needs: 'You only need a browser to follow along. The sample warehouse is yours to change, and you can reset it from Settings at any time. A phone helps for the camera chapters, a USB or Bluetooth scanner set to keyboard mode helps for the scanner chapters, and a label printer helps for the printing chapter, but every step also works by typing the printed code or tapping a sample label.',
  format: 'Chapters are marked, so you can jump straight to the part you need. A full transcript and captions will come with the video. Until it is ready, the chapter list below describes exactly what each part will show, and each chapter has a Go there button that opens that screen so you can try it yourself.',
};
