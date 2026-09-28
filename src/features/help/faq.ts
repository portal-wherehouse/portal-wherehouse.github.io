// Frequently asked questions for the Help page, grouped by category. Answers are plain text so the
// search box can highlight inside them; links to other screens sit below each answer.

import { BRAND } from '../../brand';
import type { IconName } from '../../ui/icons';
import type { HelpTarget } from './types';

export interface FaqLink {
  label: string;
  to: HelpTarget;
}

export interface FaqItem {
  id: string;
  q: string;
  /** One or more paragraphs. */
  a: string[];
  links?: FaqLink[];
}

export interface FaqCategory {
  id: string;
  title: string;
  icon: IconName;
  items: FaqItem[];
}

export const FAQ: FaqCategory[] = [
  {
    id: 'start',
    title: 'Getting started',
    icon: 'rocket',
    items: [
      {
        id: 'what',
        q: `What is ${BRAND.name}?`,
        a: [
          `${BRAND.name} keeps track of where every pallet is in a construction material warehouse. Each delivery is received against a job and gets a QR label, pallets are moved with two scans (the pallet, then the rack), and anyone can find material by job, pallet code, rack or description.`,
          'Every change is checked by the server and saved to the pallet’s history, so you can always see what happened, who did it, and when.',
        ],
      },
      {
        id: 'signin',
        q: 'Do I need a username and password?',
        a: [`Not yet. Sign-in is off while ${BRAND.name} is being tested. At the portal’s front door you pick a demo role (Owner, Supervisor, Operator or Viewer) and go straight in. You can switch roles any time from the yellow strip at the top or the account chip in the top bar.`, 'Sign-in comes later. Then each person will sign in with their own email.'],
        links: [{ label: 'Open the front door', to: { route: 'signin' } }],
      },
      {
        id: 'safe',
        q: 'Is this real data? Can I break anything?',
        a: ['No, and no. The portal comes with a sample warehouse that lives only in this browser. Change anything you like. Settings can reset the small warehouse, or load a busy one with 200 pallets and a second company, whenever you want a fresh start.'],
        links: [{ label: 'Open Settings', to: { route: 'settings' } }],
      },
      {
        id: 'new',
        q: 'Where should someone new start?',
        a: ['Take the tour first. It visits every screen and takes about 3 minutes. Then start the practice shift, which walks one pallet from delivery to a job site and back and ticks off each step as you really do it. The Guide is the handbook for anyone who wants the reasons behind the rules.'],
        links: [
          { label: 'Take the tour', to: { action: 'tour' } },
          { label: 'Start the practice shift', to: { action: 'practice' } },
          { label: 'Open the Guide', to: { route: 'guide' } },
        ],
      },
      {
        id: 'phone',
        q: 'Does it work on a phone?',
        a: [
          'Yes. It is built for phones first: the tabs at the bottom are Receive, Move and Find, and More holds everything else. On a larger screen the same pages get a sidebar.',
          'Settings has a large text option with bigger buttons for gloves and bright sunlight. The full app can also be added to a phone’s home screen from the browser menu. The hosted preview cannot.',
        ],
      },
    ],
  },
  {
    id: 'scanning',
    title: 'Scanning and labels',
    icon: 'qr',
    items: [
      {
        id: 'scanners',
        q: 'Which barcode scanners work?',
        a: [
          'Two kinds. The phone’s own camera works on the Move screen, with Scan from a photo as a backup. Handheld scanners work when they act like a keyboard, which is often called HID or keyboard-wedge mode. Most USB and Bluetooth scanners can be set to that mode, usually by scanning a setup code in their manual.',
          'The Scanners page lets you test a scanner, adjust how scans are recognized, and print the command barcodes. Typing the printed code always works too.',
        ],
        links: [{ label: 'Set up a scanner', to: { route: 'scanners' } }],
      },
      {
        id: 'order',
        q: 'Why do I scan the pallet before the rack?',
        a: ['A fixed order means a scan can never be mistaken for the wrong kind of thing. The first scan locks in the pallet and the second must be a rack or location label. If you scan a rack first, the app asks you to scan the pallet.'],
      },
      {
        id: 'torn',
        q: 'The label is torn or will not scan. What now?',
        a: [
          'Type the big printed code under the QR code, like P-000042 or A-03-02, on Move or Find. Then open the pallet and press Label to print a fresh copy. A reprint carries the same code, so older copies keep working.',
          'Use Replace label only when a label was copied or misused. It stops the old label from working.',
        ],
      },
      {
        id: 'qr',
        q: 'What is inside the QR code?',
        a: ['Only a format marker and a random 16-character token, like PL1:P: followed by the token. No job, description or location. That means a label never goes out of date when a pallet moves, and a photo of a label reveals nothing to someone outside your company.'],
      },
      {
        id: 'commands',
        q: 'What are command barcodes?',
        a: ['Printed barcodes that act like buttons when you scan them: Confirm, Cancel, Finish, and one for each Scan station mode (Look up, Move, Put-away and Count). Keep the sheet on a cart or at the dock so nobody has to put the scanner down to tap the screen. Print it from the Scanners page.'],
        links: [{ label: 'Open Scanners', to: { route: 'scanners' } }],
      },
      {
        id: 'printer',
        q: 'What printer and labels do I need?',
        a: ['4 x 6 inch thermal labels work well for pallets, or plain letter paper at six labels per page. Always print at 100 percent (actual size), and check that the calibration square measures exactly 1 inch before a big batch. The hosted preview cannot open a print dialog, so print from the full app.'],
        links: [{ label: 'Open Labels', to: { route: 'labels' } }],
      },
      {
        id: 'camera',
        q: 'Why is the camera button greyed out?',
        a: ['The camera needs a secure (https) page and your permission. Some browsers and embedded pages block it, including the hosted preview of the portal. When the camera is not available, use Scan from a photo, which opens the phone’s camera app, or type the printed code.'],
      },
    ],
  },
  {
    id: 'moving',
    title: 'Moving and finding',
    icon: 'move',
    items: [
      {
        id: 'last',
        q: 'Why does it say “last confirmed” instead of just the rack?',
        a: ['Because a record is only as good as the last scan. The app cannot see a move nobody scanned, so it tells you where the pallet was last confirmed and when. A rack confirmed ten minutes ago deserves more trust than one confirmed three weeks ago.'],
      },
      {
        id: 'hold-move',
        q: 'Can I move a pallet that is on hold?',
        a: ['Yes. A hold blocks dispatch and splitting, not moves, so you can take a damaged pallet to quarantine. The hold stays on after the move until a supervisor clears it.'],
      },
      {
        id: 'blocked',
        q: 'Why will Move not accept a dispatched or missing pallet?',
        a: ['Each has its own path. A dispatched pallet needs Record return first, which brings it back as Received. A missing pallet is recorded as found by a supervisor. A retired pallet cannot move at all. Move tells you which applies, with a button to open the pallet’s record.'],
      },
      {
        id: 'job',
        q: 'How do I see everything for one job?',
        a: ['Type the job code in Find, or open Jobs and choose the job. Its pick list shows everything on hand, sorted by rack so one walk collects it all, and you can print it. Missing and dispatched pallets are listed separately below.'],
        links: [{ label: 'Open Jobs', to: { route: 'jobs' } }],
      },
      {
        id: 'free',
        q: 'Why does the map not show free space?',
        a: ['The app knows which pallets are recorded at each spot, but not their size or the rack’s load limit. Saying a spot is free would be a guess, so the map says “nothing recorded” instead.'],
        links: [{ label: 'Open the map', to: { route: 'map' } }],
      },
    ],
  },
  {
    id: 'history',
    title: 'Accuracy and history',
    icon: 'history',
    items: [
      {
        id: 'delete',
        q: 'Can I delete or edit a wrong history entry?',
        a: ['No. A supervisor adds a correction instead. It points back at the wrong entry, which stays visible, and that is what makes the history trustworthy. Simple typos in a description or note can be fixed with Edit details, which is recorded too.'],
      },
      {
        id: 'two',
        q: 'What happens if two people move the same pallet at once?',
        a: ['Nobody wins silently. Every pallet has a version number that goes up with each change. The second phone’s request was based on an older version, so the server refuses it with a conflict and shows the newer record. That person checks the pallet and decides again.'],
      },
      {
        id: 'signal',
        q: 'What if I lose signal in the middle of a move?',
        a: ['If no answer comes back, the app says the result is unknown and offers Check result. That asks the server about the very same request, using its request ID, so it can never create a second move. It either confirms the move was saved or sends it again.'],
      },
      {
        id: 'who',
        q: 'Whose name appears on a history entry?',
        a: ['The account that made the change, taken from the sign-in, never from anything typed into a form. Removed people keep their name on the entries they made.'],
      },
      {
        id: 'split',
        q: 'What does splitting a pallet do?',
        a: ['A supervisor divides one stored pallet (not on hold) into 2 to 20 portions. Each portion becomes a new pallet with its own code and label, and the original is retired with its history. Every new pallet shows which pallet it was split from.'],
      },
      {
        id: 'lab',
        q: 'How do I know the rules really hold?',
        a: ['Open the Integrity lab. It acts out the bad days, like lost responses, two phones moving the same pallet, a removed employee and a half-finished import, against the real rules, and shows the evidence line by line. Each test uses its own fresh copy of the demo warehouse, so your data is never touched.'],
        links: [{ label: 'Open the Integrity lab', to: { route: 'lab' } }],
      },
    ],
  },
  {
    id: 'offline',
    title: 'Offline and sync',
    icon: 'wifiOff',
    items: [
      {
        id: 'works',
        q: 'What still works without signal?',
        a: ['Search and pallet records keep working from the copy this device last saved, clearly marked with its time. Moves and Confirm still here for stored pallets can be queued on the device. Everything else, such as receiving, dispatching and admin changes, waits for the connection.'],
      },
      {
        id: 'queued',
        q: 'Is a queued move saved?',
        a: ['It is saved on your phone, not on the server yet. The app always says “queued” and never “moved” until the server accepts it, and the last confirmed location stays as it was. Each pallet can have one unsent change at a time.'],
      },
      {
        id: 'decision',
        q: 'What does “Needs your decision” mean?',
        a: ['Someone changed that pallet while your move was waiting to send, so the server refused your older request. Nothing was overwritten. Open Sync and offline, look at the pallet, then either move it anyway against the latest record or keep their change and discard yours.'],
        links: [{ label: 'Open Sync and offline', to: { route: 'sync' } }],
      },
      {
        id: 'simulated',
        q: 'Is the connection in this demo real?',
        a: ['No. The server and network are simulated in your browser, so you can test the hard cases safely. The network lab on Sync and offline switches the connection off, loses a response, or drops a request, and adds delay.'],
      },
    ],
  },
  {
    id: 'roles',
    title: 'Roles and people',
    icon: 'people',
    items: [
      {
        id: 'roles',
        q: 'What can each role do?',
        a: [
          'Owner: everything, including people and workspace settings. Supervisor: manage jobs and racks, fix mistakes, clear holds, import and export. Operator: receive, place, move, dispatch, record returns, put pallets on hold and mark them missing. Viewer: search and look at records, photos and history, with no changes.',
          'The full table is on the People page and in the Guide.',
        ],
        links: [{ label: 'Open People', to: { route: 'people' } }],
      },
      {
        id: 'add',
        q: 'How do I add someone to the team?',
        a: ['Open People and press Invite. Supervisors can invite Operators and Viewers, and only an Owner can grant Supervisor or Owner access. While sign-in is off for testing, the person is added straight away.'],
      },
      {
        id: 'remove',
        q: 'What happens when I remove someone?',
        a: ['They lose access on their very next request, even if their phone still has the portal open. Everything they did stays in the history under their name, and you can invite them again later.'],
      },
      {
        id: 'hidden',
        q: 'Why do Import and Export say I need Supervisor access?',
        a: ['Those screens are for Supervisors and Owners. Hiding a button is only a convenience: the server checks the role on every change, so a request from the wrong role is refused either way. Switch roles from the yellow strip to try another account.'],
      },
    ],
  },
  {
    id: 'data',
    title: 'Accounts and data',
    icon: 'database',
    items: [
      {
        id: 'accounts',
        q: 'When will real accounts arrive?',
        a: ['Sign-in is off for testing and comes later. When it is turned on, each person will sign in with their own email and belong to their company’s workspace with a role. Until then, the demo roles show exactly what each account will be able to do.'],
      },
      {
        id: 'where',
        q: 'Where is my data stored?',
        a: ['In this preview, everything is stored in this browser on this device, and nothing is sent anywhere. The Data and storage page explains exactly where records live today and how storage will work at launch.'],
        links: [{ label: 'Open Data and storage', to: { route: 'data' } }],
      },
      {
        id: 'backup',
        q: 'How do I back up or take my data with me?',
        a: [
          'A Supervisor or Owner can open Export and save every pallet, the full history, locations and jobs as spreadsheet files, plus a manifest that records when the export was made. Keep them somewhere your company controls.',
          'For a complete copy you can put back later, open Data and storage and download a backup file. The same page restores it. Restoring replaces what is in this browser, so it asks you to confirm first.',
        ],
        links: [
          { label: 'Open Export', to: { route: 'export' } },
          { label: 'Open Data and storage', to: { route: 'data' } },
        ],
      },
      {
        id: 'companies',
        q: 'Can two companies see each other’s records?',
        a: ['No. Each company is its own workspace, and nothing crosses between them, not even whether a code exists. Load the busy warehouse in Settings and switch to the Harborline Owner account to see a second company that uses some of the same job and rack codes.'],
      },
      {
        id: 'reset',
        q: 'How do I start the demo over?',
        a: ['Open Settings and press Reset small warehouse. It rebuilds the sample warehouse from the same starting point every time and clears this device’s offline queue. It only touches this app’s own storage in this browser.'],
        links: [{ label: 'Open Settings', to: { route: 'settings' } }],
      },
    ],
  },
  {
    id: 'support',
    title: 'Pricing and support',
    icon: 'dollar',
    items: [
      {
        id: 'price',
        q: `How much does ${BRAND.name} cost?`,
        a: ['Prices are not final. The Pricing page shows how the plans are meant to compare, priced per warehouse with users included, and every number there is a placeholder until launch. The portal is free to try in the meantime.'],
        links: [{ label: 'See pricing', to: { route: 'pricing' } }],
      },
      {
        id: 'contact',
        q: 'How do I reach support?',
        a: [`Use the contact form on this page. The support inbox is not connected in this preview yet, so the form saves your request on this device and gives you a ready-made email to send to ${BRAND.supportEmail}. You can copy the message and the address if the email button does not open your mail app.`],
        links: [{ label: 'Go to the contact form', to: { action: 'contact' } }],
      },
      {
        id: 'urgent',
        q: 'Something is stopping work. What should I do?',
        a: ['Send a request with urgency set to “Blocking work”. It is marked in the email subject so it stands out. Include technical details, which adds your build, role, screen and connection so the problem can be reproduced. While you wait, typing the printed code and the Guide’s answers get most people moving again.'],
        links: [{ label: 'Go to the contact form', to: { action: 'contact' } }],
      },
      {
        id: 'idea',
        q: 'Can I suggest a feature?',
        a: ['Please do. Choose the Idea topic in the contact form and describe the job you are trying to get done. Ideas from people who run real warehouses shape what gets built next.'],
        links: [{ label: 'Suggest an idea', to: { action: 'contact' } }],
      },
    ],
  },
];

export const FAQ_COUNT = FAQ.reduce((n, c) => n + c.items.length, 0);
