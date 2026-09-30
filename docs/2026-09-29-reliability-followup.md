# Reliability and navigation follow-up · September 29–30, 2026

This supplements the earlier work review. The five criticisms were present in the published `e871d4b` version. This release corrects them and updates the top-right account menu. It does not change pricing, enable services or test against billed Firebase resources.

## What changed

1. **Live offline moves.** Stored pallets already opened on a device can be moved or verified without signal. The queue is durably written before acknowledgement, scoped by project/account/warehouse, and restored after a full offline reload. The confirmed location stays unchanged until the server accepts the move. Each retry uses the original request ID and expected version. Membership, licensing and permissions are checked by the server on reconnect. Conflicts stop for a decision in Sync and offline.
2. **Renewal grace.** License expiry immediately pauses edits/uploads, but leaves 14 days of read-only records, photos and history for existing members. Managers/owners can prepare the complete CSV export. Recovering an already-accepted receipt remains possible during grace. Explicit revocation still blocks access immediately online. Renewal restores the same records; nothing is deleted by expiry.
3. **Navigation.** Dashboard stays first. Dashboard, Receive, Move, Find and Scan station are exposed initially; Warehouse, Manage/Tools and Support are grouped and collapsed until needed. The active group opens when entering its page. Every existing feature remains reachable; More still provides the complete feature list. This reduces the initial choice load, not the total number of capabilities.
4. **Server readability.** All Cloud Function source modules are formatted consistently, license access has a named shared policy, and CI checks formatting. Transaction, immutable history, permission, quota and cleanup behavior remain tested. Formatting is not a substitute for an independent security audit.
5. **Homepage loading.** Marketing is rendered before any Firebase connection or warehouse app initialization. The scanner test loads only on its hardware page. The warehouse bundle loads on portal entry.
6. **Profile.** The top-right control shows account identity and role. Its panel has separate Account settings and Log out buttons. Account settings shows identity and the existing display/scanner/support choices. Mobile keeps the account avatar and uses a bottom sheet with normal-sized headings.

## Offline boundaries

This is durable offline **movement recording**, not an offline copy of the full warehouse. Receiving, initial placement, dispatch, photos, splitting, administration and a complete export still need a connection. Search offline covers the bounded cache only. Unknown pallets require an online lookup first.

The cache retains at most 500 pallets, 500 entries per directory/metadata table, 1,500 label tokens and 100 recent events; it does not prefetch photos. Reopening offline or recording a move requires verification within 24 hours. Up to 100 unresolved moves can wait per device/account/warehouse, with one unresolved move per pallet. Sync drains at most 100 requests in batches of 10 and stops on an unanswered/transient failure. Cross-tab Web Locks prevent two tabs overwriting the queue. Storage failure must not produce a queued confirmation.

Use a trusted device, open the warehouse online and reload once to let its installed service worker control the visit before relying on an offline restart. Signing out clears cached/displayed records; the original account's queue remains recoverable. A disconnected device cannot learn of a newly revoked membership until it reconnects. Cached access is not proof of current server authorization.

## Checks actually run locally

- 135 unit tests, including account/project/cache isolation, cache bounds, device-storage failure, discarded requests, lost responses and grace boundaries.
- 55 production-build browser tests, including every existing page, scanning, print workflow, full tours, phone navigation, refresh-to-Dashboard, and a new homepage bundle budget.
- 8 emulator guard/signup-configuration checks, signup server checks and 27 Firebase integration checks.
- The live-mode browser suite runs against an explicitly guarded `demo-wherehouse` production-style build. It disconnected the browser network, queued a real move in the UI, reloaded fully offline, reconnected and verified exactly one extra history revision. It also verified that a concurrent device change stops replay, then tested the grace banner, complete export and renewal restoration. Account menu checks ran at 1280 px and 375 px.
- Local load scenarios: 1 and 10 users, each with 0 and 50,000 accumulated records. The generated observations are in `docs/measurements/firebase-load.json`. The abandoned-upload sweep retained active and historically required photos.

The first offline test attempt ran a fixture command before its pallet page finished loading; the fixture now waits for the pallet heading. One old browser helper could not find Settings inside a collapsed group; it now opens the group as a user would. The corrected suites passed. During final integration, concurrent receiving/barcode commits were merged without removing their features. Two simultaneous local builds initially overwrote the browser-test output; the browser suite was stopped and rerun with only one build writing that folder. A display-label import pulled receiving validation into the public bundle; separating display labels removed that dependency. The first extraction missed an internal import, which the TypeScript gate caught and was corrected before the successful release checks.

### Homepage measurement

| Initial JavaScript | Before | This local production build |
| --- | ---: | ---: |
| Uncompressed bytes | 1,758,614 | 317,797 |
| Locally gzipped bytes | 525,663 | 100,749 |

Initial JavaScript fell **81.93%**. These are file measurements, not a measured mobile load-time claim. CSS, fonts and media are additional. The old file was fetched statically from the published site; no live Firebase operations were run. The automated budget is 400,000 decoded script bytes before entering the portal.

### Latest 10-user, 50,000-record observations

| Action | Max measured DB reads/action | Writes/action | Total transaction retries | Median local function time | Photo bytes/action |
| --- | ---: | ---: | ---: | --- | ---: |
| receive | 7 | 6 | 0 | 54.2 ms | 0 |
| move | 9 | 4 | 0 | 59.4 ms | 0 |
| find | 1 | 0 | 0 | No function | 0 |
| dispatch | 8 | 4 | 0 | 48.8 ms | 0 |
| photo_thumbnail | 0 | 0 | 0 | No function | 24,576 |
| photo_detail | 0 | 0 | 0 | No function | 524,288 |

The photo load fixtures are 24 KiB thumbnails and 512 KiB detail images. Separate browser checks use actual compressed image data, authenticating each download and confirming zero photo bytes at sign-in. Find is an exact-result lookup here, not the cost of every possible search. Function time is emulator-local timing, not Google billed duration; SDK counters exclude security-rule dependent reads and index scan charges. Concurrent deployment instances/cold starts are not modeled by this local process. Across all measured command kinds, including photo commits, reads stayed at or below 14 regardless of accumulated history. No Google bill was incurred by these automated/load tests; the existing billing estimates remain estimates, not dollar caps.

## Deployment status and owner action

The code and checks are prepared for GitHub Pages. Concurrent supplier barcode, product memory, per-pallet details, shipment import and reminder changes are preserved. Deploy the command/rules first and the summary function last, so the server only advertises the new receiving capability when its handler is ready. **Pages cannot deploy Firebase rules/functions.** The new client alone does not activate read-only grace on an old backend. Run the targeted deployment from the owner's existing authenticated Cloud Shell as documented in `docs/firebase-setup.md`. No new index or scheduled service is needed. This work does not claim that the owner has run that deployment or that live end-to-end behavior has been verified.

The service remains Blaze-based with all features, existing server-enforced action/photo limits, scale-to-zero settings and authenticated downloads. No pricing, hardware plan or billing configuration was changed.
