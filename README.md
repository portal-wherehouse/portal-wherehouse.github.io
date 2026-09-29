# Wherehouse

Warehouse organization by job: receive a pallet, label it, scan its rack, find it and dispatch it.

- Website: https://portal-wherehouse.github.io/
- Live sign-in: https://portal-wherehouse.github.io/#signin
- Isolated sample warehouse: https://portal-wherehouse.github.io/?demo=1#signin
- [Firebase activation walkthrough](docs/firebase-setup.md)
- [Measured usage and cost estimates](docs/firebase-cost-report.md)

## Offer

$29 per warehouse per month, up to ten people. Remote setup, crew training, printer/scanner help and ongoing remote support are included. Use your own hardware and labels, or have them supplied in an agreed equipment/setup quote; on-site help can also be arranged. The first 30 days of software are free by arrangement; billing is handled directly, with no automatic website charge.

## Mission

Make warehouse work easier: help crews receive, organize and find material without extra paperwork or another complicated system.

## Application

React, TypeScript and Vite, hosted on GitHub Pages. Live accounts use Firebase Authentication, Firestore, Cloud Storage and callable Cloud Functions. Server-side transactions enforce permissions, record versions, pallet transitions and idempotent request receipts. Photos are private to active warehouse members. Live changes require a connection and an active warehouse license. A single-use usage key is bound to the account owner’s verified email; authorized employees sign in under that warehouse license.

The browser demo remains available explicitly through `?demo=1`. Its data and account picker are isolated from Firebase. Normal sign-in never silently falls back to a demo if configuration is missing.

Operators have Receive, Move, Find, Scan station, warehouse map, rack contents, jobs, labels and movement history. Managers also have a team dashboard, authorized email lists, editing tools, imports and exports. Demo fault controls are unavailable in live mode.

## Development

Development/testing has a **$0 Firebase budget**. Do not enable billing or deploy Firebase services during development. Node 22 is used in CI; Firebase emulators also need Java 21. Install dependencies with `npm ci` and `npm ci --prefix firebase/functions`. Use `npm run dev` and the explicit sample link for browser-local development. Test shared accounts/data with the guarded `demo-wherehouse` emulator commands below. Live Blaze activation requires a separate decision accepting possible charges; the setup guide explains that future step.

```bash
npm test
npm run test:e2e -- --workers=1
npm run test:firebase
npm run test:firebase:load
npm run build
```

GitHub Actions verifies the app and backend, runs browser tests, then builds the production website using the `VITE_FIREBASE_CONFIG` repository variable. Firebase deployment remains a separate command using the project owner's Google login.

Automated Firebase tests reject live project settings and require loopback emulators. Browser UI tests force the local sample build, reject live Firebase settings, and start their own server. The large load suite runs locally, not against a billed project.

## Printing

A receiving computer plus a USB 4 × 6 thermal printer is the practical starting point. Letter sheets work for a small pilot. Print at actual size with headers and footers disabled. Pallet and rack labels carry readable codes and QR codes; keyboard scanners must support the printed code type and send Enter. A phone camera is enough to start.

The [printing and scanning page](https://portal-wherehouse.github.io/#hardware) covers buying, setup and label placement. Hardware compatibility still requires a physical print-and-scan check.

## Walkthrough

The process page contains a one-second static placeholder video in MP4 and WebM. It is deliberately not the finished animation.

The earlier [pilot review](docs/pilot-review.md) is a fictional workflow simulation, not a customer testimonial or a completed field trial. Older architecture documents describe the original local prototype; the current Firebase guide and source are authoritative for this release.
