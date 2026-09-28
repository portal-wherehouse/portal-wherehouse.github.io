# Data storage plan

Status: **decided, not built.** Nothing in this document is connected. The app still runs entirely in the browser (see "Where data lives today"). The drafts in [`firebase/`](../firebase/README.md) are marked DRAFT and have never been deployed.

John asked: *"we need to figure out how the data storage is gonna work and if I need to connect it to the Google fire thing. Ik I will for accounts."*

**Short answer: yes. Use Firebase for everything, not only accounts.** Firebase Authentication for sign-in, Cloud Firestore for records, one Cloud Function that runs the same command engine for every change, Cloud Storage for photos, and scheduled Firestore backups. One Google project, one console, one bill. The checklist of what John needs to click is at the end, in [What John needs to do](#what-john-needs-to-do).

---

## 1. The decision

| Piece | Choice | Why |
| --- | --- | --- |
| Accounts | **Firebase Authentication**: email link (passwordless) or email and password, plus Google sign-in | John already wants Firebase for accounts. No passwords for us to store. Google and email sign-in cost nothing at our scale (SMS sign-in is billed per message, so it is left out). |
| Records | **Cloud Firestore**, one workspace per company | Real-time updates to every phone, a built-in offline cache on the device, and security rules that tie every read to company membership. |
| Every change | **One callable Cloud Function** (`command`) that runs the existing engine steps inside a Firestore transaction | Clients never write records directly. The function is the only writer, so every rule in `src/domain` and `src/demo/engine.ts` keeps holding: roles, receipts, versions, append-only history. |
| Photos | **Cloud Storage for Firebase**, one folder per workspace | Storage rules check the same membership documents as Firestore, so a photo is only visible to that company. |
| Backups | **Firestore scheduled backups and point-in-time recovery**, plus a periodic export to a Cloud Storage bucket for long-term keeping | Automatic, restorable, and nobody has to remember to do it. |
| Hosting | Firebase Hosting (optional, recommended) | Same project, HTTPS by default, and the sign-in domain is already authorized. Any static host works too, since the app is a static build. |

### What this costs us compared with the blueprint's original plan

The blueprint (pages 17 to 28) planned **Supabase**: Postgres with row-level security, SQL functions for the commands, and Supabase Storage. That was a sound plan. Switching is acceptable because:

- **John is using Firebase for accounts anyway.** Running Supabase for data and Firebase for accounts means two vendors, two consoles, two bills, and a bridge between two identity systems. That bridge is exactly where security mistakes happen.
- **The engine was written to be storage-agnostic.** Its header comment lists five steps: check membership and role, reserve the command ID with a payload hash, re-read rows and check `expected_version`, validate the transition, write pallet plus event plus receipt together. A Firestore transaction supports every one of those steps (see [section 4](#4-a-command-step-by-step)).
- **Firestore's offline cache fits the floor.** Warehouses have dead zones. Firestore keeps a local copy of what the phone has seen and serves reads from it with no signal, which is what `src/data/backend.ts` simulates today.

What we give up, honestly:

- **No SQL.** No joins, no ad-hoc reports in SQL, no database-level foreign keys or check constraints. Mitigation: the function is the single writer and enforces every invariant; rules make the data read-only to clients; the invariant checks in `src/domain/transitions.ts` run in the function. For reporting later, Firebase's "Stream Firestore to BigQuery" extension gives SQL over a copy of the data.
- **No full-text search.** Firestore can match exact fields and prefixes, not words inside a description. Mitigation: the portal keeps a **search index on the device** built from the cached pallet documents and runs the existing `src/domain/search.ts` ranking over it, exactly as it does today. That is comfortable for tens of thousands of pallets per workspace. If a customer ever outgrows it, a search extension (Algolia, Typesense or Elastic all publish Firebase extensions) can be added without changing the data model.
- **Row-level security becomes rules.** Supabase would have enforced access in SQL policies. Firestore does it in `firestore.rules`. Same idea, different language, and it needs its own tests (see [Risks](#12-risks-and-what-we-do-about-them)).
- **The Blaze plan is required.** Cloud Functions only deploy on the pay-as-you-go Blaze plan, and new default Cloud Storage buckets also need it. Blaze keeps the free monthly allowances, so a pilot costs little, but a card must be on file. Set a budget alert (alerts email you; they do not stop spending).

---

## 2. Where data lives today

| What | Where | Code |
| --- | --- | --- |
| All records (the `Db` object) | This browser's IndexedDB, store `pallet-locator-demo`, key `db` | `src/data/backend.ts` |
| Demo metadata (which fixture, when created, restored from) | Same store, key `meta` | `backend.ts` (`Meta`) |
| Sends whose result is unknown | Same store, key `pending` | `backend.ts` (`PendingSend`) |
| Offline move queue | Same store, key `outbox` | `src/data/outbox.ts` |
| Photos | Inside `Db.attachments` as data URLs (re-encoded JPEG plus thumbnail) | `src/device/photos.ts` |
| Preferences, current demo account | `localStorage` (`pl.prefs`, `pl.actor`, `pl.workspace`) | `src/app/state.tsx` |

Other tabs in the same browser share it (BroadcastChannel plus a Web Locks write lock). Other devices do not. Nothing is sent anywhere.

**New in this build:** the **Data and storage** portal screen (`#data`) shows the counts, `navigator.storage.estimate()` usage, whether the browser has agreed to keep the data (`navigator.storage.persist()`), and storage health. Supervisors and owners can **download a backup** (a versioned JSON snapshot with a checksum) and **restore** one after validation and a confirmation. See `Backend.exportSnapshot()`, `Backend.importSnapshot()` and `validateSnapshot()` in `backend.ts`, tested in `tests/unit/snapshot.test.ts`.

---

## 3. Data model: collections and documents

Everything a company owns lives under its workspace document, so the workspace ID is in every path. That makes the rules simple (the path says which company) and makes a company export or deletion one subtree.

```
users/{uid}                                   profile + which workspaces this person belongs to
workspaces/{ws}                               company name, created_at
workspaces/{ws}/members/{uid}                 role, active, name, email          (Membership + User)
workspaces/{ws}/invites/{emailLower}          pending invitations
workspaces/{ws}/warehouses/{id}               Warehouse
workspaces/{ws}/locations/{id}                Location
workspaces/{ws}/jobs/{id}                     Job
workspaces/{ws}/pallets/{id}                  Pallet
workspaces/{ws}/events/{palletId}_{revision}  PalletEvent (append-only)
workspaces/{ws}/labels/{token}                LabelToken
workspaces/{ws}/attachments/{id}              Attachment metadata (the image is in Cloud Storage)
workspaces/{ws}/lineage/{childId}             PalletLineage
workspaces/{ws}/audit/{id}                    AdminAudit (append-only)
workspaces/{ws}/imports/{id}                  ImportBatch
workspaces/{ws}/receipts/{commandId}          CommandReceipt (function only)
workspaces/{ws}/private/counters              { pallet: number } (function only)
```

### Mapping from the local `Db` (src/demo/engine.ts)

| `Db` field | Firestore | Document shape | Notes |
| --- | --- | --- | --- |
| `users: Record<id, User>` | `users/{uid}` and a copy on each `members/{uid}` | `users/{uid}`: `{ name, email, created_at, workspaces: { [ws]: { name, role, active } } }` | The document ID is the Firebase Auth `uid`. `members/{uid}` carries `name` and `email` so coworkers can see names without reading the global `users` collection. |
| `workspaces` | `workspaces/{ws}` | `{ name, created_at }` | Unchanged fields. |
| `memberships: Membership[]` | `workspaces/{ws}/members/{uid}` | `{ uid, role, active, name, email, added_at }` | Keyed by uid so the rules can `get()` it directly. The function mirrors changes into `users/{uid}.workspaces` in the same transaction. |
| `warehouses` | `.../warehouses/{id}` | `Warehouse` minus `id` | |
| `locations` | `.../locations/{id}` | `Location` minus `id` | `code` is indexed automatically, so typed rack codes resolve with one query. |
| `jobs` | `.../jobs/{id}` | `Job` minus `id` | |
| `pallets` | `.../pallets/{id}` | `Pallet` minus `id` | `updated_at` drives the device's delta sync (section 6). |
| `events: Record<palletId, PalletEvent[]>` | `.../events/{palletId}_{revision}` | `PalletEvent` | Flat per workspace, not nested per pallet, so the activity feed is one query. The ID includes the revision and the function uses `create()`, so a duplicate revision is impossible even with a bug. `before_state`, `after_state` and `detail` are excluded from indexing (see `firestore.indexes.json`). |
| `receipts: Record<"ws:commandId", CommandReceipt>` | `.../receipts/{commandId}` | `CommandReceipt` | The workspace is in the path, so the key is just the command ID. Clients cannot read or write these; the function does. |
| `labels: Record<token, LabelToken>` | `.../labels/{token}` | `LabelToken` | A scan resolves with one `get()` by token. |
| `attachments` | `.../attachments/{id}` | `Attachment` with `data_url` and `thumb_url` replaced by `path` and `thumb_path` | The image bytes move to Cloud Storage. |
| `audit: AdminAudit[]` | `.../audit/{id}` | `AdminAudit` | Readable by Supervisor and Owner only, matching `Engine.auditLog`. |
| `lineage: PalletLineage[]` | `.../lineage/{childId}` | `PalletLineage` | |
| `imports` | `.../imports/{id}` | `ImportBatch` | |
| `counters: Record<ws, number>` | `.../private/counters` | `{ pallet: number }` | Incremented inside the transaction to hand out `P-000043`. |
| `schema`, `seed` | not stored | | `schema` becomes a `schema_version` field on documents that need migrations; `seed` is demo-only. |

Timestamps stay ISO 8601 UTC strings, as today, so every screen, CSV export and test keeps working unchanged. (Firestore `Timestamp` values would be slightly cheaper to sort, but strings in this format sort correctly and keep one representation everywhere.)

---

## 4. A command, step by step

The client keeps building the same `CommandEnvelope` it builds today (`src/domain/types.ts`): `command_id` (a UUID made once per user intent), `workspace_id`, `kind`, `pallet_id`, `expected_version`, `payload`. It calls the `command` callable function with it. The Firebase SDK attaches the user's ID token automatically.

Inside the function (sketch in [`firebase/functions-draft/command.ts`](../firebase/functions-draft/command.ts)):

0. **Authenticate.** `request.auth.uid` comes from the verified ID token. No uid: `AUTH_REQUIRED`. The envelope is validated with the same Zod schemas (`validateEnvelope` in `src/domain/commands.ts`): `INVALID_INPUT` on failure.
1. **Start one Firestore transaction.** All reads come first, as Firestore requires. The server SDK locks what it reads, so two phones moving the same pallet are serialized.
2. **Membership and role.** Read `workspaces/{ws}/members/{uid}`. Missing or inactive: `FORBIDDEN`. `roleAllows(role, kind)` from `src/domain/transitions.ts`: `FORBIDDEN` if not allowed.
3. **Reserve the command ID.** Read `workspaces/{ws}/receipts/{command_id}`. If it exists: same actor and same payload hash returns the stored result with `replayed: true`; anything else returns `COMMAND_KEY_REUSED`. The hash is `hashString(canonicalJson({kind, workspace_id, pallet_id, expected_version, payload}))`, exactly as in the engine.
4. **Re-read referenced documents.** The pallet, its job, the target location, the new job for `reassign_job`, the active warehouse, and the counter when a pallet code is needed. Wrong workspace or missing: `NOT_FOUND`. Then compare `expected_version` with the pallet's `version`: `VERSION_CONFLICT` with the current pallet.
5. **Validate the transition.** `checkTransition(kind, {pallet, job, location, newJob, payload, now, actorId})` computes the patch from server values, the same function the engine calls today.
6. **Write everything together.** `tx.set(pallet)`, `tx.create(event)` with ID `{palletId}_{revision}`, `tx.create(receipt)`, plus labels, attachments, lineage, audit or counter updates for the kinds that need them. The transaction commits all of it or none of it.
7. **Return** the same `CommandResult` shape the screens already handle.

Details that must match the engine exactly:

- **Rejections get receipts too.** After step 2, the engine stores a receipt for accepted and rejected outcomes alike, so retrying a rejected command returns the same rejection. The function does the same: a rejection writes only the receipt.
- **A thrown error writes nothing.** The engine's undo log rolls back and returns `TEMPORARY_FAILURE` with no receipt (scenario D04). A thrown error inside a Firestore transaction aborts it the same way.
- **Firestore may re-run the transaction callback** when documents it read change underneath it. The callback must have no side effects outside the transaction (no emails, no logging of "done"), and must use the clock value captured at the start of each attempt.
- **Batch limits.** Imports are already capped at 200 rows per batch (`importBatch` in the engine), which keeps each import inside one transaction's write limits.
- **Hot documents.** The pallet counter is one document per workspace, so receives in one company are serialized through it. Firestore handles about one sustained write per second to a single document comfortably, far above a receiving dock's pace. If a customer ever needs more, the counter can be sharded without changing codes.

**Recovery stays the same.** When a response is lost, the app already resends the exact same envelope with the same `command_id` (`Backend.recover`). The function finds the receipt in step 3 and returns the original result. No second move.

Admin commands (`create_job`, `invite_member`, `import_batch` and the rest) follow the same path, including the audit record.

---

## 5. Security rules

Principles, all visible in [`firebase/firestore.rules`](../firebase/firestore.rules):

- **Deny by default.** A final `match /{document=**}` denies everything not listed.
- **Clients never write records.** Every collection says `allow write: if false`. The function uses the Admin SDK, which is not subject to rules, and is the only writer.
- **Reads require active membership of that workspace.** Helper `isMember(ws)` checks that `workspaces/{ws}/members/{uid}` exists and has `active == true`. Rules are not filters: a query must stay inside one workspace path to be allowed, which the app always does.
- **Role-limited reads** where the engine limits them: `audit`, `imports` and `invites` need Supervisor or Owner. `receipts` and `private` are never readable by clients.
- **Removing someone takes effect on their next request.** The membership document is read on every rule evaluation and every function call, so there is no stale role in a token. (Custom claims would be cheaper per read but only refresh when the ID token does, roughly hourly. Membership documents are immediate, which matters for "a phone was lost".)
- **Each `get()` in a rule is a billed read**, cached within one request. That is a small cost for immediate revocation.

Storage rules ([`firebase/storage.rules`](../firebase/storage.rules)) use the same membership documents through cross-service rules (`firestore.get()`), limit uploads to members with Operator or higher, to JPEG, PNG or WebP, to 5 MB, and never allow overwrite or delete from a client.

**Export stays Supervisor-only for real.** Viewers can read what they can see, so they could in principle copy it by hand, as with any screen. The CSV export itself is built by a second callable function (`exportWorkspace`) that checks the role, matching today's `Engine.exportData`.

---

## 6. Offline

Two separate mechanisms, as today:

- **Reads: the Firestore offline cache.** The web SDK is initialized with `persistentLocalCache({ tabManager: persistentMultipleTabManager() })`, so everything a phone has read is kept in IndexedDB and served with no signal, across tabs. The app shows "Offline, showing what this device cached at 7:40" exactly as the Sync screen does now.
- **Search index: delta sync.** On start, the device loads the pallets it already has from the cache for free, then asks the server only for `pallets where updated_at > lastSyncedAt`. Pallets are never deleted (retire and archive are states), so nothing is missed. A cold start on a new phone reads the whole workspace once.
- **Writes: the existing outbox, not Firestore's write queue.** Firestore can queue direct writes offline, but clients do not write directly, and callable functions do not queue. The outbox in `src/data/outbox.ts` keeps its rules unchanged: only `move` and `verify_location`, only for cached stored pallets, one per pallet, persisted before it says "queued", replayed in order with the original `command_id`, stopped on conflicts for a human decision. Its storage moves to its own IndexedDB store, scoped by uid and workspace.
- **Sign-out clears the cache** (`terminate()` then `clearIndexedDbPersistence()`), so a shared tablet does not keep the last person's company data.

---

## 7. Photos

1. The phone prepares the photo as today (content check, re-encode to strip metadata, compress, thumbnail).
2. It uploads both files to `workspaces/{ws}/photos/{attachmentId}.jpg` and `{attachmentId}.thumb.jpg` with custom metadata `uploadedBy = uid`. Rules allow create only, for Operators and above, image types only, 5 MB maximum.
3. It sends the `add_photo` command with the storage paths instead of data URLs. The function checks the files exist, match the declared type and size, and belong to that workspace, then writes the attachment document and the history event in the transaction.
4. Viewing uses `getBlob()` from the Storage SDK, which checks the rules on every request. The app never calls `getDownloadURL()`, because those links work for anyone who has them.
5. Uploads that were never attached (the command failed or the phone died) are deleted after 24 hours by a scheduled function. `remove_photo` marks the attachment removed, as today; the file is kept with the history until a retention policy says otherwise.

---

## 8. Backups and restore

- **Point-in-time recovery (PITR):** lets us read or restore the database as it was at any minute in the recent past (Google currently offers a 7-day window). This covers "someone imported the wrong file an hour ago".
- **Scheduled backups:** a daily backup schedule (and optionally weekly, kept longer). Restoring a backup creates a new database, which we then point the app at or copy from. Check the current retention limits in the console when setting this up; at the time of writing daily backups are kept up to 7 days and weekly ones up to 14 weeks.
- **Long-term export:** a scheduled export of the whole database to a Cloud Storage bucket once a week, with a lifecycle rule to delete exports older than a year (or whatever retention policy John sets).
- **Photos:** Cloud Storage object versioning or a nightly copy to a second bucket.
- **Customer-side copies:** CSV export (Supervisor or Owner) stays available to every customer at any time.
- **Restore drill:** before the pilot, restore a backup into a scratch database and run the scenario suite against it. A backup nobody has restored is a guess.

The in-browser backup file added in this build (Data and storage screen) is a demo tool: it copies the whole local store, every demo company included. In production, full backups are server-side only, and a company's own copy is its CSV export.

---

## 9. Costs, in plain terms

No numbers here on purpose: Google's prices change, and a pilot will measure real usage. The shape of the bill:

- **Authentication:** email and Google sign-in cost nothing at the size of a warehouse crew.
- **Firestore:** billed per document read, write and delete, plus storage. The free daily allowance covers a small pilot. Reads are the main driver, which is why the design uses delta sync instead of re-reading every pallet on each app start, and why the activity feed pages instead of loading everything.
- **Cloud Functions:** billed per call and compute time, with a monthly free allowance. One move is one call, a handful of reads and three writes.
- **Cloud Storage:** billed per GB stored and downloaded. Photos are compressed on the phone first, and there are at most three per pallet.
- **Backups and PITR:** billed per GB kept. Small for this kind of data.
- **Set a budget alert** in Google Cloud Billing on day one. It emails at the thresholds you choose. It does not cap spending; `maxInstances` on the function and App Check limit runaway usage.

---

## 10. Migration plan from the local demo

Nothing from the demo needs to move: its data is sample data. Real customers start with an empty workspace and bring their jobs, racks and pallets in with CSV import.

1. **Project setup** (John, see the checklist below). Send back the config values.
2. **Local emulators first.** Add `firebase.json`, the rules and the function to the repo, and run the Firebase Emulator Suite (Auth, Firestore, Functions, Storage). Port the 38 scenarios in `src/lab/scenarios.ts` so they run against the emulator as well as the local engine, plus rules tests with `@firebase/rules-unit-testing` for the two-company isolation cases (S01 to S04).
3. **Share the domain code.** Move `src/domain` (types, commands, transitions, codes, search, csv) into a package both the app and `functions/` import, so there is exactly one copy of the rules.
4. **`FirebaseBackend`.** A second implementation of the surface screens already use (`send`, `recover`, `reader`, `outbox`, `subscribe`, `network`), backed by the callable function and Firestore listeners. `Backend` (the local demo) stays for the hosted preview and for tests. Screens do not change.
5. **Accounts.** Replace the demo role picker on the portal front door with Firebase sign-in. Workspace creation for a new customer, invitations by email, and claiming an invitation on first sign-in (only for a verified email).
6. **Photos** to Cloud Storage (section 7).
7. **Backups, alerts, App Check**, then a pilot with one real warehouse.
8. **Keep the demo.** The hosted preview keeps running on the local backend, because sign-in cannot work inside a sandboxed preview frame. The DEMO strip stays on it.

The snapshot format from this build (`pallet-locator.snapshot`, version 1) doubles as a fixture loader for the emulator: a small script can write a snapshot's tables into the emulator's Firestore so tests start from a known state.

### What stays identical

- The command envelope, `command_id`, receipts, payload hashing and `COMMAND_KEY_REUSED`.
- `expected_version`, `VERSION_CONFLICT` and the conflict screens.
- The transition rules, role table and error codes (`src/domain`).
- The event shape and append-only history; corrections instead of edits.
- The offline outbox and its rules.
- Label payloads (`PL1:P:<token>`, `PL1:L:<token>`), printed codes and scanning.
- CSV import and export formats, including formula protection.
- Every screen.

### What changes

- The actor comes from a verified ID token instead of the demo account switcher.
- IndexedDB holds Firestore's cache and the outbox, not the source of truth.
- Photos are storage paths, not data URLs.
- "Reset demo data" and the in-browser backup exist only in the demo build.

---

## 11. Accounts and invitations

- **Sign-in methods:** email link (no password to forget; good on personal phones), email and password (for shared tablets where opening email is awkward), and Google. Email and password accounts must verify their email before an invitation can be claimed.
- **New company:** an owner signs up, and a `createWorkspace` function creates the workspace, warehouse and owner membership in one transaction (like `Engine.createWorkspace`).
- **Invitations:** `invite_member` stores `workspaces/{ws}/invites/{emailLower}` with the role. When that person signs in with a verified matching email, a `claimInvites` function turns it into a membership. The role rules stay: only an owner can grant supervisor or owner.
- **Removal:** `remove_member` sets `active: false`. The next read or command is refused. For a lost phone, an owner can also disable the account or revoke its sessions in the Firebase console.
- **Every workspace keeps at least one active owner**, enforced in the function as in the engine.

---

## 12. Risks and what we do about them

| Risk | What we do |
| --- | --- |
| A rules mistake exposes one company to another | Deny by default; clients never write; rules unit tests in the emulator for every collection with two workspaces that reuse codes (the busy fixture already does this); rules reviewed before each deploy. |
| The function and the local engine drift apart | One shared `src/domain` package; the same 38 scenarios run against both. |
| Surprise bills | Budget alert, `maxInstances` on functions, App Check, delta sync for reads, photos compressed on the device. |
| Cold starts make the first command after a quiet spell slow | The app already shows progress and handles slow or lost responses. `minInstances: 1` is available later if it matters (it costs a little). |
| Lost or stolen phone | Remove membership (immediate); disable the account or revoke sessions in the console; cached data stays on the phone until sign-out, so the Security page tells customers to keep phones locked. |
| Search gets slow for very large warehouses | Client index is fine for tens of thousands of pallets; add a search extension if a customer outgrows it. |
| Vendor lock-in | The rules live in plain TypeScript; CSV export and scheduled exports keep the data portable. |
| Firestore location cannot be changed | Chosen deliberately in the checklist, next to the customers. |
| Sign-in does not work inside the hosted preview frame | The preview stays on the local backend and says so. |
| History grows forever | Retention policy decided before production (open item on blueprint page 40). |

---

## What John needs to do

The same list is on the portal's **Data and storage** screen, with tick boxes. Each step is a few clicks at [console.firebase.google.com](https://console.firebase.google.com).

1. **Create the project** while signed in with the business Google account that should own it (not a personal one if that can be avoided). Pick the project ID carefully; it cannot be changed later. Google Analytics can stay off.
2. **Upgrade to the Blaze (pay as you go) plan.** Then in Google Cloud console, Billing, Budgets and alerts: create a monthly budget with email alerts at 50, 90 and 100 percent.
3. **Register a web app.** Project settings, General, Your apps, the `</>` icon. Nickname it after the product. Copy the `firebaseConfig` block.
4. **Authentication.** Get started, Sign-in method: enable **Email/Password** and switch on **Email link (passwordless sign-in)**; enable **Google** and choose the support email. Optionally, under Templates, set the sender name for sign-in emails.
5. **Firestore Database.** Create database in **production mode** (everything locked until our rules go in). Choose the **location**; it is permanent. For customers in the US, `nam5 (United States)` is a sound default. If the console asks for an edition, choose **Standard**.
6. **Storage.** Get started, production mode, the same location as Firestore where offered.
7. **People.** Project settings, Users and permissions: add the person who will deploy (the Editor role is enough), or plan to run `firebase deploy` yourself. Add a second owner as a safety net.
8. **Later, when the domain is chosen:** Authentication, Settings, Authorized domains: add it. `localhost` is already there for testing.
9. **Later, before the pilot:** Firestore, Disaster recovery: turn on point-in-time recovery and a daily backup schedule.

### Values to send back

| Value | Where to find it |
| --- | --- |
| `firebaseConfig`: `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId` | Project settings, General, Your apps. These identify the project and are designed to be public in web apps; the rules do the protecting. |
| Firestore location | The one chosen in step 5, for example `nam5`. |
| Sign-in methods enabled, and the support email | Authentication, Sign-in method. |
| The app's web address, if known | Your domain registrar or Firebase Hosting. |
| Blaze on, and the budget amount | Billing. |
| The email that should own the first company workspace, plus anyone who needs access on day one | Your call. |

**Never send:** passwords, service account key files (JSON files containing `private_key`), or billing details. None are needed. Deploys use the Firebase CLI signed in as a person with access, not a key file.
