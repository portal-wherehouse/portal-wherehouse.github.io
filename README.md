# Wherehouse

**Know where every pallet is.**

Wherehouse helps a construction-material warehouse receive pallets for specific jobs, put them on racks, and find them again. Each pallet gets a label with a QR code and a barcode. Staff scan the pallet and then the rack, with a phone camera or a handheld scanner. Anyone can search a job number and see where each pallet was last confirmed, who moved it, and when.

Created by **John Henry Mims**.

- LinkedIn: https://www.linkedin.com/in/john-henry-mims-3161a9237/
- Email: johnhenry.mims@gmail.com

The app started from the *Pallet Locator Complete Build Blueprint, Draft 0.1* (42 pages). Code comments cite blueprint pages as `page N`. The product was renamed Wherehouse in version 0.2 (see [decisions](docs/decisions.md), D-13); the name lives in one place, `src/brand.ts`.

## Two halves: the website and the portal

The app opens on a public **website**. The **Wherehouse Portal** is the working tool, one button away.

| Website page | What it covers |
| --- | --- |
| **Home** | A bold hello, a guided tour that plays right on the page (receive, label, scan, move, find, count), and a short teaser for every other page. "Already a customer? Open Wherehouse Portal" sits in the first screen and the header. |
| **Product** | What Wherehouse is: the three verbs (receive, move, find), labels, history, roles and the pallet lifecycle. |
| **See it in action** | Everything it can do, screen by screen, drawn as mock-ups of the portal. |
| **Why it's simple** | The decisions that keep it easy to use on a busy floor. |
| **Scanners** | Which hardware works (keyboard-wedge USB and Bluetooth scanners, phone cameras, serial scanners in Chrome) and how labels are built for each. |
| **Applications** | Who it is for and what they use it for. |
| **Customers** | Placeholder slots for customer stories. No customers are invented. |
| **Pricing** | Four plans with placeholder prices, marked as placeholders. |
| **About** | A placeholder portrait and bio for John, plus contact links. Nothing about him is guessed. |
| **Contact** | A contact form and direct email. |
| **Security and data** | How data is protected today and in the Firebase plan, and a plain statement that the product has not been audited or certified. |

## What is in the portal

**Sign-in is off while we test.** The portal's front door lets you pick a demo role (Owner, Supervisor, Operator or Viewer, plus an Owner in a second company). Real accounts come with Firebase (see below).

| Area | What you can do |
| --- | --- |
| **Receive** | Pick an open job, describe the delivery, and add a photo. You get a new pallet code and a printable label. |
| **Move** | Scan the pallet, then scan the rack, then confirm. The same flow handles placing, moving and verifying. With a handheld scanner you can confirm by scanning the Confirm barcode or the rack again. |
| **Find** | Search by job, pallet code, rack or description. Exact codes rank first. Filter by state, job and location. |
| **Scan station** | A desk or cart station built for handheld scanners, with four modes: Lookup, Move, Put-away (one rack, many pallets, then save all) and Count (scan a rack and everything on it, then see matched, missing and unexpected pallets and fix each). |
| **Scanners** | Scanner settings (prefix, suffix, speed, sounds, confirm by rescan), a test pad that shows exactly what the scanner sends, Web Serial for serial scanners, setup guides, and a printable sheet of command barcodes (Confirm, Cancel, Finish and the four station modes). Scanning works on any screen: a scan outside a text field opens that pallet or rack. |
| **Pallet record** | Shows the photo, the last confirmed location and every action. You can dispatch, return, hold, mark missing, locate, correct, split, retire, reprint or rotate the label. |
| **Overview** | Pallets on hand by state, what needs attention, 14 days of activity, the busiest racks and job progress. |
| **Warehouse map** | Zones, aisles and bays read from location codes, with one box per recorded pallet. Held pallets are striped. |
| **Activity** | Everything that happened, grouped by day, filtered by kind of action and by person. |
| **Reconcile** | Work queues for unplaced, missing, held, needs-reprint and not-verified-lately pallets, each with its fix. |
| **Jobs** | Create, close and reopen jobs. Job detail includes a printable pick list sorted by rack. |
| **Locations** | Create, rename, deactivate and reactivate racks and areas. Rack labels are printable. |
| **Labels** | Print 4x6 labels or letter sheets for reprints, new receipts, a whole job, a pick list or racks. Each label has the code in large type, a QR code and a Code 128 barcode of the printed code. |
| **Import and export** | CSV import with preview, row errors and duplicate-file detection, committed all or nothing. Export CSV files plus a manifest, protected against spreadsheet formulas. |
| **Data and storage** | Where records live today, backup download and restore, the Firebase plan with a diagram, and the setup checklist. |
| **People** | Invite members, change roles, remove access, and see the role matrix and audit trail. |
| **Sync** | A network lab where you go offline, lose responses, fail commands, add latency, resolve conflicts and recover unknown results. |
| **Integrity lab** | Runs the blueprint's 38 test scenarios live in your browser, with evidence for each result. |
| **Help** | A tutorial video spot (placeholder, with a chapter-by-chapter description of what it will cover), 16 step-by-step tutorials, a searchable FAQ and a contact form for help. |
| **Take the tour** | The button at the top right walks through every page of the portal with a tip for each. |
| **Practice shift** | The blueprint's example shift from page 6, checked off as you actually do each step (start it from the Guide or Settings). |
| **Guide and Settings** | Big ideas, roles, glossary, and what is real versus simulated; theme, text size, start screen, explanations, haptics, and demo data reset or a busy warehouse. |

Every screen has a "How this works" panel that explains what it does.

## Run it

You need Node 22 or newer.

```bash
npm install
npm run dev            # http://localhost:5173
```

Other commands:

```bash
npm run typecheck      # TypeScript, no emit
npm test               # unit tests: the 38 blueprint scenarios, scanners, scan station, backups (Vitest)
npm run test:e2e       # browser tests (Playwright; builds and serves the app itself)
npm run build          # installable app in dist/ (works offline once opened)
npm run build:preview  # one self-contained HTML file in dist-artifact/
node scripts/make-artifact-page.mjs   # strips the page skeleton for hosts that supply their own
```

In a sandbox that already has Chromium, set `PW_CHROMIUM=/path/to/chromium` for Playwright.

The camera, printing, downloads and serial scanners need the full app over https (`npm run build`, then serve `dist/` from any static host). The hosted preview blocks them, so there it offers typing codes, copying files and on-screen label previews instead. Keyboard-wedge scanners work in both, because they type like a keyboard.

## Real and simulated

This build is a **local demo**. It is honest about which parts are simulated:

| Part | Status |
| --- | --- |
| Domain rules, transitions, invariants, command receipts, versions, conflicts, rollback | **Real.** This is the same logic the server would run, and it is covered by tests. |
| QR labels, Code 128 barcodes, camera scanning, handheld scanners, typed codes, photos, print layouts, CSV import and export, backup and restore | **Real** in the browser. |
| Offline write queue, conflict review, lost-response recovery | **Real** logic. The network itself is simulated, so you can switch it off. |
| Server, database, sign-in and roles | **Simulated** in your browser (IndexedDB). Sign-in is off while we test: you pick a demo role. |
| Firebase (accounts, records, photos, backups) | **Planned, not connected.** See [docs/data-storage.md](docs/data-storage.md) and the drafts in [firebase/](firebase/README.md). |

The demo strip at the top of the portal always says so.

## Next step: accounts and storage on Firebase

Everything moves to one Firebase project: Firebase Authentication for accounts, Cloud Firestore for records (read-only to the app; every change goes through one callable Cloud Function that runs the same engine inside a transaction), Cloud Storage for photos, and scheduled backups. It needs a Firebase project on the Blaze plan owned by John Henry Mims. The step-by-step checklist is in [docs/data-storage.md](docs/data-storage.md) and on the portal's Data and storage page.

## Project docs

- [docs/product-contract.md](docs/product-contract.md): who it is for and what a correct answer looks like
- [docs/architecture.md](docs/architecture.md): how the code is organized and how a command flows
- [docs/data-storage.md](docs/data-storage.md): where data lives and the Firebase plan
- [docs/decisions.md](docs/decisions.md): decisions made, deferred and open
- [docs/test-matrix.md](docs/test-matrix.md): every scenario, where it is tested, and the last recorded result

## Credits

Wherehouse is by John Henry Mims ([LinkedIn](https://www.linkedin.com/in/john-henry-mims-3161a9237/), johnhenry.mims@gmail.com).

Built with React, TypeScript, Vite, Zod, qrcode, jsQR, idb-keyval, Vitest and Playwright. Typefaces are Barlow Condensed, Public Sans and IBM Plex Mono.
