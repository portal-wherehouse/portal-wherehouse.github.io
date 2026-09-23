# Pallet Locator

**Find any pallet. Trust the answer.**

Pallet Locator helps a construction-material warehouse receive pallets for specific jobs, put them on racks, and find them again. Each pallet gets a QR label. Staff scan the pallet and then the rack. Anyone can search a job number and see where each pallet was last confirmed, who moved it, and when.

Created by **John Henry Mims**.

- LinkedIn: https://www.linkedin.com/in/john-henry-mims-3161a9237/
- Email: johnhenry.mims@gmail.com

The app is built from the *Pallet Locator Complete Build Blueprint, Draft 0.1* (42 pages). Code comments cite blueprint pages as `page N`.

## What is in the app

| Area | What you can do |
| --- | --- |
| **Receive** | Pick an open job, describe the delivery, and add a photo. You get a new pallet code and a printable label. |
| **Move** | Scan the pallet, then scan the rack, then confirm. The same flow handles placing, moving and verifying. Wrong scan order, repeated frames and lost responses are all handled. |
| **Find** | Search by job, pallet code, rack or description. Exact codes rank first. Filter by state, job and location. |
| **Pallet record** | Shows the photo, the last confirmed location and every action. You can dispatch, return, hold, mark missing, locate, correct, split, retire, reprint or rotate the label. |
| **Overview** | Pallets on hand by state, what needs attention, 14 days of activity, the busiest racks and job progress. |
| **Warehouse map** | Zones, aisles and bays read from location codes, with one box per recorded pallet. Held pallets are striped. |
| **Activity** | Everything that happened, grouped by day, filtered by kind of action and by person. |
| **Reconcile** | Work queues for unplaced, missing, held, needs-reprint and not-verified-lately pallets, each with its fix. |
| **Jobs** | Create, close and reopen jobs. Job detail includes a printable pick list sorted by rack. |
| **Locations** | Create, rename, deactivate and reactivate racks and areas. Rack labels are printable. |
| **Label studio** | Print 4x6 labels or letter sheets for reprints, new receipts, a whole job, a pick list or racks. |
| **Import and export** | CSV import with preview, row errors and duplicate-file detection, committed all or nothing. Export CSV files plus a manifest, protected against spreadsheet formulas. |
| **People** | Invite members, change roles, remove access, and see the role matrix and audit trail. |
| **Sync** | A network lab where you go offline, lose responses, fail commands, add latency, resolve conflicts and recover unknown results. |
| **Integrity lab** | Runs the blueprint's 38 test scenarios (the W, F, D, S, O, I, L, V and P series) live in your browser, with evidence for each result. |
| **Guide** | Big ideas, a lifecycle diagram, daily work, roles, glossary, FAQ, and a table of what is real versus simulated. |
| **Guided tour** | The blueprint's example shift from page 6. It checks off each step as you actually do it. |
| **Settings** | Theme, text size, start screen, explanations, haptics, and demo data reset or a busy warehouse. |

Every screen has a "How this works" panel that explains what it does and which blueprint pages it follows.

## Run it

You need Node 22 or newer.

```bash
npm install
npm run dev            # http://localhost:5173
```

Other commands:

```bash
npm run typecheck      # TypeScript, no emit
npm test               # the 38 blueprint scenarios against the command engine (Vitest)
npm run test:e2e       # browser walkthroughs (Playwright; builds and serves the app itself)
npm run build          # installable app in dist/ (works offline once opened)
npm run build:preview  # one self-contained HTML file in dist-artifact/
node scripts/make-artifact-page.mjs   # strips the page skeleton for hosts that supply their own
```

In a sandbox that already has Chromium, set `PW_CHROMIUM=/path/to/chromium` for Playwright.

Seeing the camera and printing work needs a phone and the full app over https (`npm run build`, then serve `dist/` from any static host). The hosted preview blocks the camera, print dialogs and downloads, so there it offers typing codes, copying files and on-screen label previews instead.

## Real and simulated

This build is the blueprint's **local demo** (milestones M0 to M2, plus the M4 and M5 screens running against local fakes). It is honest about which parts are simulated:

| Part | Status |
| --- | --- |
| Domain rules, transitions, invariants, command receipts, versions, conflicts, rollback | **Real.** This is the same logic the database functions would run, and it is covered by tests. |
| QR labels, scanning (native decoder with a jsQR fallback), typed codes, photos, print layouts, CSV import and export | **Real** in the browser. |
| Offline write queue, conflict review, lost-response recovery | **Real** logic. The network itself is simulated, so you can switch it off. |
| Server, database, sign-in and roles | **Simulated** in your browser (IndexedDB). The account switcher stands in for real logins. |
| Supabase (Postgres, auth, private photo storage) | **Not connected yet.** This needs a Supabase project, which is the next step (see below). |

The DEMO strip at the top of the app always says so.

## Next step: the online pilot

The blueprint's online pilot (milestones M3 and M4) moves the command engine into Postgres functions and adds real accounts and private photo storage on Supabase. That needs a Supabase project owned by John Henry Mims. The domain contracts in `src/domain` and the engine sequence in `src/demo/engine.ts` are written so the database functions can mirror them one to one.

## Project docs

- [docs/product-contract.md](docs/product-contract.md): who it is for and what a correct answer looks like
- [docs/architecture.md](docs/architecture.md): how the code is organized and how a command flows
- [docs/decisions.md](docs/decisions.md): decisions made, deferred and open
- [docs/test-matrix.md](docs/test-matrix.md): every scenario, where it is tested, and the last recorded result

## Credits

Pallet Locator is by John Henry Mims ([LinkedIn](https://www.linkedin.com/in/john-henry-mims-3161a9237/), johnhenry.mims@gmail.com).

Built with React, TypeScript, Vite, Zod, qrcode, jsQR, idb-keyval, Vitest and Playwright. Typefaces are Barlow Condensed, Public Sans and IBM Plex Mono.
