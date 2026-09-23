# Decisions

Per blueprint page 40, each entry records the decision, the reason, what it affects and how it is tested. A change that touches identity, state transitions, tenant isolation or retry behavior counts as an architecture change, even when the visible screen change looks small.

## Made in this build

**D-01: Build the local demo first, with the real rules.**
The blueprint's first-session plan (page 42) starts with a local prototype on fake data. The command engine, transitions and invariants are real and tested. The server, sign-in and network are simulated in the browser. The DEMO strip, the Guide's "Real vs simulated" table and the README say so. *Affects:* `src/demo`, `src/data`. *Tested by:* every scenario in [test-matrix.md](test-matrix.md).

**D-02: Stack pinned to exact versions.**
React 19.3, TypeScript 5.9.3, Vite 8.3, Zod 4.6.5, qrcode 1.5.4, jsQR 1.4.0, idb-keyval 6.3.0, Vitest 5.0.1 and Playwright 1.56.1, with the lockfile committed (page 18). *Affects:* `package.json`, `package-lock.json`.

**D-03: One scenario file drives both the tests and the in-app lab.**
`src/lab/scenarios.ts` is the single source for Vitest and the Integrity lab screen, so the lab can never show a result the tests do not prove. Each scenario runs against its own freshly seeded engine with a fixed clock. *Affects:* `src/lab`, `tests/unit`.

**D-04: The camera decoder is the native BarcodeDetector with jsQR as the fallback, and typing the code always works.**
This matches the draft default on page 40. Photo scanning is also offered where the live camera is blocked. *Affects:* `src/device/scanner.ts`, `src/features/scan`. *Still needs:* successful scans on the chosen iPhone and Android devices.

**D-05: Moves always need an explicit confirmation after two scans.**
This is the page 40 default. A "fast mode" waits for evidence from a physical rehearsal. *Affects:* `src/features/move`.

**D-06: Location codes are free text, with zone, aisle, bay and level read from codes like A-02-01 where possible.**
This keeps the page 40 default of flexible codes with optional fields. The warehouse map is drawn from those fields and shows recorded pallets only, never free space or capacity. *Affects:* `src/domain/codes.ts` (`rackFields`), `src/features/map`.

**D-07: The offline queue (Stage C) is built, but limited to moves and location checks.**
The pilot default on page 40 is read-only offline. This build goes further only because the queue's rules are tested (O01 to O04, S04): one unresolved change per pallet, nothing claimed as queued unless the device stored it, and conflicts stop the queue for review. The online pilot can switch it off with a capability check, not just a hidden button (page 36). *Affects:* `src/data/outbox.ts`, `src/features/sync`.

**D-08: Controlled splits are available to supervisors.**
This is backlog item C04 from page 14, built with its test (F13): one split per version, repeat-safe, and the parent retires with lineage to its children. *Affects:* `src/features/pallet/SplitSheet.tsx`, the `split` command.

**D-09: A reprinted label is tracked until someone confirms it is on the pallet.**
Rotating a label revokes the old token and flags the pallet for reprint. The `label_applied` command (Operator) clears the flag once the new label is stuck on. The Reconcile screen lists pallets still waiting. *Affects:* `src/domain/transitions.ts`, `src/features/admin/Reconcile.tsx`. *Tested by:* L01.

**D-10: Printing uses browser templates for 4x6 labels and letter sheets.**
This is the page 40 default. Label codes are drawn as SVG text scaled to fit, so long codes never wrap or clip. *Still needs:* measured output on real printers.

**D-11: The hosted preview is a separate build target.**
`npm run build:preview` produces one self-contained HTML file. In a hosted frame the camera, print dialogs and downloads are blocked, so the preview replaces them with typed codes, on-screen label previews and copy buttons. It keeps the host's theme and falls back to in-memory data if storage is blocked. *Affects:* `vite.config.ts`, `src/device/output.ts`, `scripts/make-artifact-page.mjs`.

**D-12: The full app installs as a web app and opens offline.**
A small service worker caches the app shell (page 18). A new version waits until every tab is closed, so it never updates in the middle of a scan or while queued moves are pending (page 38). Warehouse data stays in IndexedDB and never passes through that cache. *Affects:* `public/sw.js`, `src/device/pwa.ts`.

## Open (from page 40)

| Decision or risk | Default in this build | Evidence needed to settle it |
| --- | --- | --- |
| Camera decoder | Native with jsQR fallback | Successful scans on the chosen iPhone and Android devices |
| Confirmation step | Explicit confirmation after two scans | A physical rehearsal showing whether a fast mode is safe |
| Location notation | Flexible code plus optional fields | Demo labels stay readable; the real workflow confirms naming |
| Weak connectivity | Limited offline queue (see D-07) | Online loop proven before offline writes are enabled for a pilot |
| Partial pallets | Controlled split (see D-08) | Split tested before staff divide pallets in practice |
| History retention | Kept while the workspace is active | A documented deletion and backup policy before production |
| Printing | Browser templates | Measured sheet and 4x6 output on actual printers |
| Multi-warehouse | Data model has warehouse IDs; one warehouse in use | Separate custody and access design before transfers |

## Deliberately deferred

Production hosting, the Supabase project and its configuration, retention periods and alert thresholds. These need implementation evidence and a Supabase project owned by John Henry Mims. They do not block the local prototype.
