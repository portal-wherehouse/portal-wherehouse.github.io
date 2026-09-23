# Architecture

Source: blueprint pages 17 to 28. This describes the code as it stands. The online design the blueprint proposes is noted where the demo stands in for it.

## Shape

One responsive React app serves both phone work on the floor and desktop admin. The browser never edits a pallet row directly. It sends a **command**. The command engine checks it, applies it in one transaction, and returns an acknowledgment only after the commit.

```
Screens (src/features)  ──command──▶  Backend (src/data/backend.ts)  ──▶  Engine (src/demo/engine.ts)
      ▲                                  │  simulated network, faults,         │  membership + role check
      │                                  │  offline outbox, lost responses     │  receipt by command_id + payload hash
      └────── current state + events ◀───┘  IndexedDB persistence, tab lock    │  expected_version check
                                                                               │  transition rules (src/domain)
                                                                               └  pallet + event + receipt together
```

In the online pilot the Engine becomes Postgres functions behind a small HTTP layer on Supabase, and IndexedDB becomes a cache and outbox only. The engine is written so each step maps to a SQL step.

## Folders

The layout follows page 18.

| Folder | What lives there |
| --- | --- |
| `src/app` | Shell, navigation, routes, session, theme and preferences (`App.tsx`, `state.tsx`, `styles.css`) |
| `src/features` | One folder per screen: receive, move, find, pallet, overview, map, activity, admin (jobs, locations, reconcile, import, export, people), labels, scan, sync, lab, guide, tour, settings, about, welcome, more |
| `src/domain` | Types, transition rules, command schemas (Zod), code parsing and label format, search ranking, CSV |
| `src/data` | Backend facade, offline outbox, and the newer-version merge rule |
| `src/device` | Scanner (native BarcodeDetector with a jsQR fallback), photos, printing, downloads, clipboard, installable shell |
| `src/demo` | Seeded fixtures (seed 214) and the local command engine |
| `src/lab` | Test harness and the 38 blueprint scenarios, shared by Vitest and the in-app Integrity lab |
| `src/ui` | Shared components, icons, and the `useCommand` hook with its feedback panel |
| `tests/unit`, `tests/e2e` | Vitest suite and Playwright walkthroughs |
| `public` | App manifest, icons and the service worker |
| `scripts` | Icon rendering and hosted-preview packaging |

The blueprint's `supabase/` folder (migrations, functions, database tests) does not exist yet. It arrives with the online pilot.

## A command, step by step (pages 21 to 23)

1. The screen builds an envelope: `command_id` (a UUID made once per user intent), `kind`, `pallet_id` or admin target, `expected_version`, and a payload validated by Zod.
2. The Backend applies the simulated network. Offline, only `move` and `verify_location` for cached stored pallets can be queued, one per pallet. Everything else is refused honestly.
3. The Engine authenticates the actor and re-reads current membership and role.
4. It reserves the command ID with a canonical hash of the payload. The same ID with the same payload returns the original result. The same ID with a different payload returns `COMMAND_KEY_REUSED`.
5. It re-reads referenced rows (job open, location active, same workspace) and compares `expected_version`. A mismatch returns `VERSION_CONFLICT` with the current summary.
6. `src/domain/transitions.ts` decides whether the transition is allowed and computes the patch from server values.
7. The pallet update, the event and the receipt are written through an undo log, so a failure part-way rolls all three back (scenario D04).
8. The result goes back to the screen. If the simulated response is lost, the screen shows "result unknown" and offers **Check result**, which replays the same command ID and recovers the original outcome (D01).

## Reads and consistency

Screens read through `read()` in `state.tsx`, which scopes every query to the signed-in workspace. `mergeNewer` in `src/data/merge.ts` makes sure a delayed older read never replaces a newer confirmed record (D05). Other tabs see changes through a BroadcastChannel, and writes are serialized across tabs with the Web Locks API when the browser allows it.

## Offline (page 24)

The outbox in `src/data/outbox.ts` stores queued commands in IndexedDB before it says "queued". If that write fails, the app says nothing was queued (O01). On reconnect the queue sends in order. A version conflict stops that pallet's queue and shows the current state next to the queued observation, with "Still move it" and "Keep theirs" choices (O02). A crash mid-send keeps the command ID, so a replay cannot duplicate (O04). A member removed while offline sees their queued work blocked (S04).

## Labels and scanning (page 16)

QR payloads are typed and versioned: `PL1:P:<token>` for pallets and `PL1:L:<token>` for locations, with a 16-character base32 token. The scanner accepts only that exact format and a length limit, so arbitrary URLs are refused (L01). The same parser accepts a URL fragment ending in the payload. Rotating a label revokes the old token. Printed codes like `P-000042` can always be typed, and lenient input such as `p 42` is normalized.

The Move screen is a pure state machine (`src/features/move/machine.ts`): EXPECT_PALLET, EXPECT_LOCATION, REVIEW, SUBMITTING and RESULT, plus CONFLICT, UNKNOWN and QUEUED. Scanning a rack first gives recoverable guidance (F05). Repeated camera frames select once and submit at most once (F06).

## Photos (page 25)

Photos are checked by content rather than file extension, re-encoded to strip metadata and fix orientation, compressed on the device, and stored with a thumbnail. In the demo they live in IndexedDB. The pilot moves them to private Supabase storage with authorized downloads.

## Build targets

| Command | Output | Notes |
| --- | --- | --- |
| `npm run build` | `dist/` | The full app. Installable, with a service worker that caches the shell so it opens with no signal. A new version waits until every tab is closed, so an update never lands mid-scan. |
| `npm run build:preview` | `dist-artifact/index.html` | One self-contained file for hosted previews. Camera, print dialogs and downloads are replaced with typed codes, on-screen previews and copy buttons. It respects a theme the host page stamps. If storage is blocked, it falls back to in-memory data. |

`__BUILD_TARGET__`, `__BUILD_COMMIT__` and `__BUILD_TIME__` are compile-time constants shown under Settings.

## What is mocked (and says so)

- **Authentication:** the demo account switcher chooses the actor. The engine still checks that account's current membership and role on every command.
- **Network:** online, offline, lost responses, failed commands and latency are switches in the Sync lab.
- **Database locks:** JavaScript runs one command at a time. Across tabs, the Web Locks API serializes writes.
- **Server storage:** IndexedDB in the browser. Reset touches only this local demo store.
