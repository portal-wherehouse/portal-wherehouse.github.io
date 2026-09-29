# Test matrix

This is the blueprint's test plan (pages 29 to 32) mapped to where each check lives in this repository and its last recorded result. Per page 30, a result counts only when a command was actually run and its output recorded. Generated test code on its own is not evidence.

## How to reproduce

```bash
npm test                 # Vitest: every scenario below against a freshly seeded engine
npm run test:e2e         # Playwright: browser walkthroughs against the production build
```

Open **Integrity lab** in the app to run the same scenarios in your own browser and read the evidence for each one. Each scenario runs against its own seeded engine (fixture seed 214, fixed clock 2026-09-23 17:00 UTC), never against the warehouse you are using.

## Last recorded run

| Suite | Command | Result | Date | Environment |
| --- | --- | --- | --- | --- |
| Unit tests (engine scenarios, scanners, scan station, backups) | `npx vitest run` | 112 passed, 0 failed (4 files) | 2026-09-29 | Node 22.22, Linux |
| Browser tests | `npx playwright test` | 48 passed, 0 failed, 0 skipped | 2026-09-29 | Chromium (Playwright 1.56.1), Linux, production build |
| Typecheck | `npx tsc -b` | clean | 2026-09-29 | TypeScript 5.9.3 |

The browser tests are in `tests/e2e`: `walkthrough.spec.ts` (the example shift through the real sign-in, the practice shift, the offline queue, the integrity lab, the Viewer role), `site.spec.ts` (every website page, the phone menu, the portal button, browser Back and typed addresses, the home guided tour by tap and by scanner), `portal-tour.spec.ts` (all 29 walkthrough stops on desktop and phone), `help.spec.ts` (video spot, chapters, FAQ search, contact form), `scanners.spec.ts` (keyboard-wedge emulation, command barcodes decoded from the page, the Move screen, the Scan station put-away and count, double reads), `signin.spec.ts` (deep links, role switching, two companies kept apart), `smoke.spec.ts` (every portal page, no sideways scroll at 390 px, phone tabs) and `copy.spec.ts` (no em dashes and no old product name on any page). Scanner timing depends on machine load, so the scanner and home-tour groups allow one retry, which the report shows as flaky rather than hiding.

## Scenarios (Vitest and the in-app Integrity lab)

All of these run from `src/lab/scenarios.ts`. The same file backs `tests/unit/lab.test.ts` and the Integrity lab screen.

| ID | Group | Scenario | Blueprint page | Required outcome | Result |
| --- | --- | --- | --- | --- | --- |
| W01 | Walkthrough | A complete example shift | 6 | Receive P-000042 for J-214, place, move, find, dispatch, return and place again. Identity never changes; every step adds exactly one version and one event. | Pass |
| F01 | Functional | Receive with an open job | 30 | One pallet and a revision-1 event, with no location assigned. | Pass |
| F02 | Functional | Receive with a closed job | 30 | A clear rejection, and no new pallet or event. | Pass |
| F03 | Functional | Place an unassigned pallet | 30 | STORED with exactly one current location and a placement event. | Pass |
| F04 | Functional | Move between two racks | 30 | Old and new locations appear in history, with one version increase. | Pass |
| F05 | Functional | Scan the rack before the pallet | 30 | Recoverable guidance and no write. | Pass |
| F06 | Functional | Scan the same frame repeatedly | 30 | One selection and at most one submitted command, even when a camera reports the same label many times. | Pass |
| F07 | Functional | Dispatch a held pallet | 30 | Rejected; the hold and the location stay unchanged. | Pass |
| F08 | Functional | Dispatch, then return intact | 30 | Identity is retained, the return becomes RECEIVED, and the rack is unassigned. | Pass |
| F09 | Functional | Mark missing, then locate | 30 | The historical rack is kept, and a new confirmed rack appears only after an authorized locate. | Pass |
| F10 | Functional | Rename a location | 30 | Identity and label token unchanged; the current code updates; historical snapshots keep the old code. | Pass |
| F11 | Functional | Correct an older mistaken entry | 30 | A correction is a new event; earlier entries stay visible; the current version is checked. | Pass |
| F12 | Functional | Search duplicate descriptions | 30 | Identical descriptions stay separate records with distinct codes. | Pass |
| F13 | Functional | Controlled split | 14 | Two supervisors split the same version: exactly one commits. Retrying returns the same children. The parent retires with lineage. | Pass |
| F14 | Functional | Close a job with material still here | 9 | A job cannot close while pallets are received, stored, or missing, or while holds are unresolved. | Pass |
| D01 | Database & retries | Response lost after commit | 31 | The same command recovers the original result, and only one event exists. | Pass |
| D02 | Database & retries | Concurrent moves from one revision | 31 | Alice and Ben both load version N. One move is accepted; the other gets an explicit conflict with the current summary. | Pass |
| D03 | Database & retries | Reused command ID with a changed payload | 31 | COMMAND_KEY_REUSED, and no extra mutation. | Pass |
| D04 | Database & retries | Event insert forced to fail | 31 | The pallet update and the command receipt roll back together. | Pass |
| D05 | Database & retries | Old read arrives after a new write | 31 | The client keeps the newer confirmed version. | Pass |
| D06 | Database & retries | Job closes during a receipt | 31 | Active status is re-checked inside the transaction, so the result is consistent. | Pass |
| D07 | Database & retries | Inactive location during a move | 23 | Deactivation is blocked while pallets are recorded there, and moves into an inactive location are rejected. | Pass |
| S01 | Security | Known UUID from another workspace | 31 | Reads, writes and label lookups are denied without leaking the other company’s description. | Pass |
| S02 | Security | Viewer calls a mutation directly | 31 | The server rejects it even when the interface is bypassed. | Pass |
| S03 | Security | Operator calls a supervisor function | 31 | Permission denied and history unchanged. | Pass |
| S04 | Security | Removed member submits queued work | 31 | The server denies it and the queued command is visibly blocked. | Pass |
| S05 | Security | Owner removal and role grants | 4 | A workspace never ends with zero owners, and only an owner grants supervisor access. | Pass |
| O01 | Offline | Device storage write fails | 31 | No false “queued” confirmation. | Pass |
| O02 | Offline | Offline change conflicts on reconnect | 31 | The queue stops for that pallet and shows the current state and the queued observation separately. | Pass |
| O03 | Offline | What can be queued offline | 24 | Only moves and checks for cached stored pallets, one unresolved change per pallet. | Pass |
| O04 | Offline | Crash while sending | 36 | A restart keeps the same command ID and replays without duplicating. | Pass |
| I01 | Import & export | Atomic, repeat-safe CSV import | 27 | A malformed row blocks the whole batch; the same batch twice creates no duplicates; a changed file under the same batch ID is rejected. | Pass |
| I02 | Import & export | Spreadsheet-safe exports | 28 | Cells starting with = + - @ are neutralized, quoting is correct, and exports reconcile with the app. | Pass |
| L01 | Labels & search | Only our exact label format scans | 16 | Typed, versioned tokens; arbitrary URLs and oversized payloads are refused. | Pass |
| L02 | Labels & search | Search order and pagination | 13 | Exact codes first, then prefixes, then descriptions; paging never repeats or skips. | Pass |
| V01 | Invariants | Fixture state counts and invariants | 29 | The 200-pallet scenario has 140/20/20/10/10 by state with 8 holds; every pallet obeys the state/location rule and its history reconciles. | Pass |
| V02 | Invariants | Independent oracle over 600 generated commands | 29 | A separate reference model predicts which commands are accepted and the resulting state. It shares no code with the engine. | Pass |
| P01 | Performance | Search across 10,000 pallets | 32 | Measures search time on a generated 10,000-pallet workspace against the blueprint’s proposed target (95th percentile under one second). A measurement, not a capacity promise. | Pass |

Page 30 also lists edge cases to add to the fixtures: spaced or lowercase codes, long and non-ASCII text, old events, missing photos, inactive racks, revoked labels, renamed jobs, and an empty workspace. Some are exercised inside scenarios today (revoked labels in L01, inactive racks in D07, renamed locations in F10, a second workspace reusing the same readable codes in S01). Seeding the rest as standing fixture data is still open.

## Browser walkthroughs (Playwright)

`tests/e2e/walkthrough.spec.ts`, run against `npm run build` served by `vite preview`.

| Test | What it exercises | Result |
| --- | --- | --- |
| Example shift | Page 6 end to end through the real screens with typed codes: receive, place on A-03-02, move to B-01-01, find by job, dispatch, return, place on A-02-01. Checks six history entries and the guided tour at 7 of 7. | Pass |
| Offline queue | Go offline, queue a move, reconnect, and see it saved. | Pass |
| Integrity lab | Runs every scenario in the browser and expects all to pass. | Pass |
| Viewer lockout | A viewer sees why receiving needs Operator access and cannot submit. | Pass |

Layout checks were also run by hand at 360 px and 390 px widths in light and dark themes, with no horizontal scrolling on any screen.

## Hosted preview checks

The single-file preview (`npm run build:preview`) was loaded in Chromium three ways: plainly, inside a page that stamps a dark theme, and with IndexedDB, localStorage and Web Locks all throwing. All three started without page errors, kept the host's theme, and fell back to in-memory data when storage was blocked.

## Real-device and label plan (page 32): not yet run

These need phones, printers and people. They are listed so nobody mistakes them for done.

| Check | What to exercise | Pass condition | Result |
| --- | --- | --- | --- |
| Camera permission | First allow, first deny, later revoke | Usable recovery and manual entry | Not run |
| Camera selection | Rear and front switch, rotation | Correct preview; scan target stays usable | Not run |
| Handheld scanner (keyboard mode) | A USB and a Bluetooth scanner set to keyboard mode with Enter as suffix | Every label scans on Move, Find and the Scan station; typing in a text field is never mistaken for a scan | Not run (emulated in Playwright) |
| Code 128 on printed labels | A laser scanner reading 4x6 and sheet labels | Reads the printed code on the first pass | Not run on a physical scanner. The encoder is checked against the Code 128 tables in unit tests, and on 2026-09-28 the open-source ZXing decoder (zxing-cpp) read every on-screen command barcode and six rack label barcodes correctly. |
| Serial scanner | A serial scanner in Chrome over Web Serial | Connects, scans arrive like keyboard scans | Not run |
| Label printing | Sheet and 4x6 output at actual size | Readable code, intact QR, no clipped labels | Not run |
| Label condition | Glare, mild damage, wrinkling, low light | Reliable scan, or a clear fallback | Not run |
| App lifecycle | Lock phone, switch apps, resume | No duplicate command or stuck camera | Not run |
| Network change | Wi-Fi loss and reconnect | Honest pending or error state and safe recovery | Simulated only (Sync lab) |
| Accessibility | Zoom, keyboard, screen-reader labels | Primary actions stay discoverable and operable | Not run on devices (controls carry accessible names) |
| Shared device | Log out, another user signs in | No prior workspace cache shown to the new user | Simulated only (account switcher) |
| Performance | Search p95 on 10,000 pallets; acknowledged move time | Under 1 s search, under 2 s move on the test connection | Search measured by P01 in-browser; move time needs the real backend |

Gate (page 32): at least one tested iPhone and one tested Android device must complete the core loop and failure recovery before claiming either platform is supported for a pilot.

## Online pilot tests (pages 30 and 31): waiting on the backend

D01 to D07 and S01 to S04 above prove the rules in the local engine. The blueprint requires the same cases against the real backend, two workspaces and forced faults. With Firebase (D-18) that means the command function and `firestore.rules` tested in the Firebase emulators, then in the real project. Those run once the Firebase project exists.
