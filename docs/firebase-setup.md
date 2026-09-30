# Connect Wherehouse to Firebase

The website stays on GitHub Pages. Firebase handles accounts, shared records, photos and validated changes. The code is implemented; a Google project must be created and deployed before live sign-in is available.

## Current development policy: $0 in Firebase charges

Run automated, browser and load tests only with `npm run test:firebase` and `npm run test:firebase:load`. The launcher fixes `demo-wherehouse` and loopback endpoints, refuses supplied live configuration before starting SDKs, and each test entry point independently requires all emulator endpoints. Missing emulators fail the test; there is no live fallback. No billing account is needed.

**Everything below that creates a Google project, enables billing, deploys functions, creates backups, issues live keys or runs a live smoke test is a future activation guide. Do not execute it until the service owner explicitly accepts possible charges.** All features remain in the Blaze architecture; the emulator implementation is not a Spark rewrite.

## 1. Create the project (future activation)

Open https://console.firebase.google.com/ and create a project for Wherehouse. Analytics is optional. Upgrade to the Blaze plan so Cloud Functions and Cloud Storage can be deployed. Add a billing budget alert in Google Cloud; alerts notify you, they do not cap charges.

Use a project you control. You do not need to share a password, service-account key or payment details in chat.

## 2. Turn on the three services

- **Authentication → Sign-in method:** enable Email/Password. Keep email link sign-in off. In Authentication settings, add `portal-wherehouse.github.io` to Authorized domains. Add `localhost` only if you want local development. Configure the verification and password-reset email sender names. Set the password policy to at least eight characters.
- **Firestore Database:** create the **(default), Standard edition** database in production mode. Choose `us-east1` to match the functions in this repository. Do not use Realtime Database or MongoDB compatibility.
- **Storage:** create the default bucket in production mode, using the same region where available. Keep the bucket name that Firebase supplies. The current deployment target is `us-east1` (South Carolina) for Firestore, functions and the photo bucket. The existing cost report uses a `us-central1` pricing assumption; recheck regional rates before live activation.

Verification is required before anyone can create or enter a warehouse. Managers authorize employee and manager emails in the Manager dashboard, before or after registration. Each person verifies their own email. The app does not send team invitation emails.

## 3. Register the web app

In Project settings → General, add a Web app (`</>`). You do not need Firebase Hosting. Copy the public `firebaseConfig` object containing `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId` and `appId`.

In GitHub, open this repository → Settings → Secrets and variables → Actions → **Variables** → New repository variable:

- Name: `VITE_FIREBASE_CONFIG`
- Value: the config as valid JSON, with quoted property names. Do not include `const firebaseConfig =` or the trailing semicolon.

Example shape:

```json
{"apiKey":"YOUR_WEB_API_KEY","authDomain":"YOUR_PROJECT.firebaseapp.com","projectId":"YOUR_PROJECT","storageBucket":"YOUR_PROJECT.firebasestorage.app","messagingSenderId":"YOUR_SENDER_ID","appId":"YOUR_WEB_APP_ID"}
```

This web configuration is public by design. It is not an Admin SDK credential. Never upload a service-account JSON file to the repository.

## 4. Configure App Check and billing controls

Do these in **your own Google project** when ready to activate Blaze. The code changes and emulator tests do not activate paid services.

1. In Google Cloud → Billing → Budgets & alerts, create a **project-scoped budget for the amount you explicitly accept for live trials** (for example $5), with actual-spend alerts at **50%, 80%, 100%** and forecast at **100%**. Add your monitored email. For production, use separate project budgets of **$10 / $50 / $250** as initial alerts for **1 / 10 / 50 warehouses**, then revise using actual usage. These are notification thresholds, **not spending caps**. Charges and alerts can arrive late.
2. Register the web app in Firebase → App Check using **reCAPTCHA Enterprise**. Create a website score-based key with `portal-wherehouse.github.io` in its allowed domains; keep domain validation enabled. Set App Check token TTL to **1 hour** initially. Add repository Actions variable **`VITE_FIREBASE_APPCHECK_SITE_KEY`** with the public site key. Never add a debug token to production or the repository.
3. Publish the web configuration and inspect App Check metrics. Verify a real signed-in browser produces valid tokens, then **enforce App Check for Firestore and Storage** in Firebase. Callable functions enforce it in code on every non-demo project. Do not set `ENFORCE_APP_CHECK=false` in production. This app starts attestation for account creation and after verified sign-in, so do not enable Authentication App Check enforcement without also moving initialization before sign-in and testing that separate change.
4. In Google Cloud → Cloud Run, inspect warehouse callable configuration: **minimum instances 0, maximum 3, concurrency 20, 256 MiB, request timeout 30 seconds**. Account creation has maximum 1 and concurrency 10, with the same minimum, memory and timeout. The scheduled cleanup has minimum 0, maximum 1 and timeout 120 seconds. Keep request-based billing. Maximum instances are per function and are not a dollar cap. Deployment transitions can temporarily overlap revisions.
5. In IAM & Admin → Quotas & System Limits, inspect adjustable quotas for the actual project's **Cloud Run functions**, **Cloud Run Admin**, **Firestore**, **Cloud Storage**, and **reCAPTCHA Enterprise** services. Do not increase quotas just to pass local tests. Provider request-rate quotas vary by project and do not bound monthly downloads. Keep the application limits below as the customer-facing guardrails; budgets remain necessary.
6. In Monitoring, alert on sustained callable errors, `resource-exhausted` responses, sudden Firestore read growth and Storage transfer growth. Start with **50,000 Firestore reads/day for a future small live trial** and investigate any unexpected usage. At production scale compare against the cost report's per-warehouse assumptions; legitimate use can exceed this private-test threshold.
7. Keep image cleanup enabled, retain seven daily database backups for production, and review build-source buckets. Do not apply a deletion lifecycle to the customer photo bucket. Storage's default seven-day soft-delete retention can keep deleted orphan bytes billable for another week. Do not enable paid Artifact Analysis scanning accidentally; if you choose it, budget for its image scans separately.

App Check reduces unauthenticated abuse; it is not a billing firewall. Valid users can still make repeated reads/downloads. The setup does not claim a hard monthly spend cap.

For future live activation, also review Firebase's **Preview service-level spend caps**: Settings → Usage and billing → Details & settings → Service-level spend caps. Configure an accepted monthly threshold for Cloud Functions for Firebase. Unlike an alerts-only budget, this can pause the eligible service when reported spend reaches the threshold. Enforcement is delayed, overages remain billable, and Firestore/Cloud Storage are not covered by this control. A paused function blocks new saves; it does not erase records. Treat this as another safeguard, never a $0 guarantee. No spend cap has been configured by this work. [Official instructions and limitations](https://firebase.google.com/docs/projects/billing/spend-caps).

## 5. Deploy the backend

Use Node 22 and Java 21 or later for the emulator tests. From a checkout of this repository:

```bash
npm ci
npm ci --prefix firebase/functions
npx firebase login
npx firebase use --add
npm run test:firebase
npx firebase deploy --only firestore:rules,firestore:indexes,storage,functions --project YOUR_PROJECT_ID
```

Choose the project created in step 1. The deploy command builds and uploads twelve functions: `createAccount`, `sendEmailCode`, `verifyEmailCode`, `createWarehouse`, `command`, `authorizeEmail`, `joinAuthorizedWarehouses`, `cancelAuthorization`, `reservePhotoUpload`, `getWarehouseSummary`, `getDirectoryCounts` and the scheduled `cleanupPhotoUploads`, the database rules and the photo rules. Only accept Google's API/billing prompts once you intend to activate this project. The daily cleanup creates one Cloud Scheduler job. After deployment, configure artifact cleanup explicitly:

```bash
npx firebase functions:artifacts:setpolicy --project YOUR_PROJECT_ID --location us-east1 --days 7
```

Check Artifact Registry → `gcf-artifacts` → Cleanup policies shows an active deletion policy, not only a dry run. Function images can share layers, so actual stored bytes depend on builds. Keep source in GitHub for rebuilding; old-image cleanup is not data backup.

Do not run `firebase init`: the repository already includes the configuration. Do not replace the rules with public read/write rules. Firebase deployment uses your own Google login; GitHub Pages publishing does not deploy the backend.

## 6. Allow authenticated photo downloads from the website

The app downloads images with the signed-in user's credentials instead of permanent public download links. Cloud Storage needs a CORS policy. In Google Cloud Shell, from a checkout of this repository, run:

```bash
gcloud storage buckets update gs://YOUR_BUCKET_NAME --cors-file=firebase/storage.cors.json
```

Use the exact `storageBucket` from your web config. The supplied policy allows the GitHub Pages origin. Add a new origin if you move to your own domain. CORS does not make the bucket public; Storage Rules still check warehouse membership.

## 7. Publish the configured website

In GitHub → Actions → **Deploy to GitHub Pages** → Run workflow → main. Wait for both build and deploy to turn green. Open https://portal-wherehouse.github.io/#signin and refresh.

Create your account and verify the email. A usage key is required to activate a warehouse; signing in alone grants no warehouse access.

As the service owner, issue the first key using the instructions below. In the app choose **Activate my warehouse with a usage key**, enter the warehouse name and key, and activate. Then open the Manager dashboard to authorize employee emails. Employees sign in separately; they never need the account owner's usage key.

## 8. Check the real warehouse connection

This is a **small live smoke test**, to run yourself after setup. It is not the emulator load test and it is not guaranteed free.

1. Note the project's current Firestore reads/writes, Storage bytes, function invocations and App Check assessments. Billing dashboards lag, so also record the start/end times.
2. Create one owner and one authorized employee account. Activate exactly one test warehouse. Create one job and two rack locations.
3. Receive **two pallets**. On a second signed-in device, search the exact code and verify both records. Print one label at actual size and scan it with the phone camera.
4. Place one pallet, move it once, then dispatch it. Check its history on both devices and reload. Exactly one event should exist per accepted change.
5. Add **one photo under 1 MiB** to the other pallet. Confirm there are distinct `full.jpeg` and `thumb.jpeg` objects. With browser Network tools open, sign out and sign back in: opening Find must request no photo media. Open that pallet, scroll to its thumbnail, then open the full image; only these actions should download the image sizes.
6. Open the manager dashboard, confirm employee access, and remove the employee. Their warehouse reads and photo requests should fail. Sign out of both accounts and confirm records disappear.
7. Stop. Review metrics after they settle. Use **1,000 reads, 300 writes, 100 callable requests and 5 MiB of photo downloads** as investigation thresholds for this tiny test, not prepaid allowances or promised exact totals. Reconnects, duplicate tabs and setup reads affect totals. Run no bulk seed or load command on this project.

The local suite covers rules, commands and browser behavior. It cannot validate your production indexes, App Check domains, CORS, Google deployment settings, printer stock or warehouse Wi-Fi. Check deployed indexes finish building before this test. Revoke the test license after testing if it should no longer be used.

### Existing data from the earlier full-collection implementation

New warehouses need no migration. If you previously deployed live data, back up first, deploy indexes, pause warehouse access with the license tool, and run the explicit backfill. It adds `has_hold` and bounded search prefixes to current pallet documents and initializes retained photo-byte accounting. It never edits history or deletes photo objects. The scan is paginated, but it reads the chosen warehouse and lists its photo metadata; **a live dry run is billable**.

```bash
node firebase/functions/scripts/backfill.cjs YOUR_PROJECT_ID WORKSPACE_ID YOUR_BUCKET --dry-run
node firebase/functions/scripts/license.cjs revoke YOUR_PROJECT_ID WORKSPACE_ID
node firebase/functions/scripts/backfill.cjs YOUR_PROJECT_ID WORKSPACE_ID YOUR_BUCKET --apply
node firebase/functions/scripts/license.cjs extend YOUR_PROJECT_ID WORKSPACE_ID 30
```

Confirm the resulting license period matches what you agreed with the customer; the example extension adds 30 days. Older flat-path photos remain readable and retained. New photos use separate thumbnails. An old photo whose thumbnail was already the full image cannot regain a real thumbnail without a separate explicit image migration; the app does not silently download or rewrite that library.

## Issue and manage usage keys (service owner only)

A key is a single-use activation credential bound to one verified email. Only its SHA-256 hash is stored in Firestore. It activates one shared warehouse for the specified number of days. Every employee still needs their own authorized membership. A copied key cannot activate a different account.

From your trusted workstation or Cloud Shell, authorize Google Application Default Credentials for the project you administer, then run:

```bash
gcloud auth application-default login
node firebase/functions/scripts/license.cjs issue YOUR_PROJECT_ID owner@customer.com 30
```

The command prints the key once. Send it privately to that account holder. It must be redeemed within 14 days; the 30-day usage period begins at activation. Don't put raw keys in GitHub or public documents.

To extend or revoke a warehouse, get its ID from Firestore's `workspaces` collection:

```bash
node firebase/functions/scripts/license.cjs extend YOUR_PROJECT_ID WORKSPACE_ID 30
node firebase/functions/scripts/license.cjs revoke YOUR_PROJECT_ID WORKSPACE_ID
```

Customers and their managers cannot mint keys, change licenses or grant themselves ownership. Managers can authorize other managers and employees. Only owners can grant or change owner access; the last owner cannot be removed.

Expiry pauses new changes and uploads immediately. Existing members retain read-only records, photos and history for 14 days; owners and managers can prepare the complete CSV export during that grace period. After grace, access is blocked but records are not deleted. Explicit revocation has no grace and blocks reads, writes and downloads immediately when connected. The app clears displayed and cached warehouse data when it sees revocation. Renewal reopens the same records rather than creating a new warehouse. A manager-authorized employee joins under the warehouse license, with no separate activation key.

Billing and renewal are manual for now. There is no payment-provider integration that automatically extends licenses after a charge. Keep your billing records and license periods aligned.

## Operation and maintenance

- Live stored-pallet moves and location verifications can be queued offline for previously cached pallets and active locations. Receiving, initial placement, dispatch, photos, splitting and administration still require a connection. The sample warehouse (`?demo=1#signin`) is separate and uses browser storage. Its reset controls cannot reset live data.
- Unknown request results are saved on the originating device and retried with the same ID, avoiding duplicate receipts. Signing out clears displayed warehouse data; pending requests remain scoped to that account for recovery.
- Managers can export CSV. Enable a Firestore scheduled backup and test a restore before relying on the warehouse operationally. Cloud Storage photos need their own retention/backup policy; CSV does not contain photos.
- One account can create one warehouse. A warehouse plan includes up to ten people, counting pending email authorizations. Import at most 80 rows per request.
- Commands read the affected pallet, permission/license, receipt and relevant job/location documents. They never read accumulated event/audit collections. Every accepted change and its immutable event/receipt commit together. Duplicate requests return the original result without another write. Pallet number allocation is queued briefly per warehouse inside each function instance, with cross-instance safety still enforced by Firestore transactions.
- The SDK retries a transaction at most five times. There is no unbounded client command retry loop. An unknown result keeps the original command ID for explicit recovery. Offline replay drains at most 100 commands per sync in batches of 10 and stops on an unanswered/transient failure; conflicts and permanent refusals require a human decision. Do not generate a new ID just because a request timed out.
- Query pages are 50 rows, with cursor pagination. Rules reject collection reads without a limit or with a limit above 100. Visible record lists/history use bounded subscriptions; additional pages load when requested. A full CSV export deliberately walks every page after **Prepare complete export** is clicked. It can cost more than an ordinary view.
- Overview and rack/job totals use server count queries cached for 60 seconds. Counts are not instant. A count query scans indexes and incurs aggregation reads; it is not a free metadata lookup. Pallet updates remain immediate to listeners viewing those records.
- Limits: ten members including pending authorizations; 80 import rows; 256 KiB command payload; 120 commands per user per minute and 5,000 per day; 120 photo reservations per user per day; 5 MiB detail and 128 KiB thumbnail; 1 GiB of new reserved photo bytes per warehouse/calendar month and 10 GiB retained by default. The existing three-active-photos-per-pallet rule stays. Owners cannot raise these limits; the service operator can set `licenses/WORKSPACE_ID.limits.photoMonthBytes` and `.photoStoredBytes` after agreeing appropriate capacity. Raising them changes the cost exposure.
- Reservations expire after 24 hours. Daily cleanup waits a further 24-hour grace period, claims at most 100 expired reservations per run, fences off commit/upload, and deletes only those abandoned objects with generation checks. Successful/removed historical photos and legacy photos are never automatically deleted. Failed reservations still count toward that month's upload allowance; cleaned bytes leave retained accounting. Watch for a cleanup backlog rather than increasing batch size blindly.
- A canceled upload can leave a reservation. No automatic request or scheduler retry storm is configured. The following day's sweep retries unfinished `deleting` records. Do not manually edit upload states while a sweep is running.
- Direct downloads remain authenticated; there are no permanent public photo links. The browser holds at most 40 fetched image URLs. App Check, authorization and upload limits are enforced, but there is **no hard per-warehouse monthly read/download cap**. Monitor usage and arrange additional capacity before promising unlimited usage at $29.

### Backups and deployment overhead

After deciding to activate production backups, create a seven-day daily schedule:

```bash
gcloud firestore backups schedules create --project=YOUR_PROJECT_ID --database='(default)' --retention=7d --recurrence=daily
gcloud firestore backups schedules list --project=YOUR_PROJECT_ID --database='(default)'
```

Backups are paid even below Firestore's free live-data allowance. Restore once into a separate test database and verify it before calling the backup process operational; restore and the extra database also cost money. The report models seven retained copies and lists restore/PITR separately.

Photos need a separate protected backup bucket/copy procedure with restricted administrative access. Copy newly created immutable objects; keep references with the database backup. Budget for the second copy and copy operations. Do not delete historical photos just because the current UI no longer displays them. A seven-day soft-delete policy is recovery protection, not an independently protected backup. No backup bucket or scheduled copy has been provisioned by this change.

Review Cloud Build minutes, Artifact Registry bytes, automatically created function source buckets and Logging volume monthly. Keep a limited archive of deployment sources (for example 30 days) **only in the function source bucket**, after confirming its identity; never paste such a lifecycle into the photo bucket. GitHub Pages deployment does not deploy Firebase functions.

## Local verification

```bash
npm test
npm run test:e2e -- --workers=1
npm run test:firebase
npm run test:firebase:load
npm run build
```

The Firebase checks run the deployed callable handlers against Auth, Firestore and Storage emulators, including actual token verification. A TCP test host avoids environments that disallow the emulator's Unix sockets. Browser checks exercise real email sign-in and warehouse creation against the emulators. No Google billing account is needed for these tests. The load harness refuses non-demo project IDs or non-loopback emulator endpoints. It tests 1 and 10 users with 0 and 50,000 accumulated records. See [cost report](firebase-cost-report.md) and `docs/measurements/` for measured output. Do not change its project guard to run against production.

Official references: [Email/password accounts](https://firebase.google.com/docs/auth/web/password-auth), [deploy functions](https://firebase.google.com/docs/functions/get-started), [authenticated photo downloads and CORS](https://firebase.google.com/docs/storage/web/download-files).

Additional references: [App Check web setup](https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider), [function scaling and artifact cleanup](https://firebase.google.com/docs/functions/manage-functions), [Firestore backup schedules](https://docs.cloud.google.com/sdk/gcloud/reference/firestore/backups/schedules/create), [billing budgets](https://cloud.google.com/billing/docs/how-to/budgets).

## Future trials: server-enforced allowances, not a dollar cap

When you later approve live trials, `license.cjs trial PROJECT EMAIL DAYS` issues a key with these server-owned limits: **30 commands per user/minute, 200 per user/day, 1,000 lifetime pallet records, 100 MiB newly reserved photo bytes/calendar month, and 500 MiB retained photo bytes**. Ten users and every feature remain available. These are deliberately modest starting allowances, adjustable by the service owner after observing real use. Pallet retirement does not free lifetime capacity or erase its history. Photo limits include thumbnails and abandoned reservations until cleanup.

```bash
# FUTURE LIVE ACTION ONLY: do not run during $0 development.
node firebase/functions/scripts/license.cjs trial YOUR_PROJECT_ID owner@customer.com 30
```

Limits live on the activation key and transfer to the warehouse license. Managers and employees cannot change them. Hitting an action limit blocks new commands with a clear message; hitting the pallet allowance blocks new receive/split/import additions while existing pallet actions remain available under their action allowance. Hitting photo capacity blocks new reservations. Existing records, histories and committed photos remain readable under an active license. Renewal preserves the limit fields; the service owner must explicitly review them when upgrading a trial.

There is no precise byte cap for Firestore metadata or accumulated history, and no monthly cap on direct authenticated reads/downloads. App Check verification, failed requests, backups, deployment images and data transfer can still cost money. These controls reduce exposure; they do not guarantee a dollar maximum or make a live trial free. For now use the sample warehouse or emulator-backed demonstrations until a customer is ready to pay or you approve a limited trial budget.


## Visible checkbox when creating an account

There are two different public reCAPTCHA keys. Keep the Firebase configuration JSON unchanged.

| Purpose | Key / setting |
| --- | --- |
| Firebase App Check (background verification) | Score-based key `6LcsXdYtAAAAAIKaPi8FGXZNl5qg_T7GX_xVbFWz`. Register it for the web app in Firebase App Check and put it in GitHub Actions variable `VITE_FIREBASE_APPCHECK_SITE_KEY`. Checkbox challenge must be OFF for this key. |
| New-account checkbox | Checkbox key `6Le8Q9YtAAAAAB1suUpQIMhi4T71drOz4fd7eI1A`, in `src/config/registration.ts`. Keep this key in Google Cloud reCAPTCHA, with `portal-wherehouse.github.io` allowed. It is not a second App Check registration. |

Changing a GitHub Actions variable does not update the already-published JavaScript. Run the Pages workflow again or push a commit; after its deployment succeeds, refresh the website. An old page can continue sending the old key. A usage key cannot fix an App Check 401.

The website displays the checkbox only in Create account. `createAccount` verifies it with Google before creating an unverified Auth account; the browser then signs in and asks `sendEmailCode` for a 6-digit verification code (see below). No warehouse access is granted until email verification, authorization and an active license. Ordinary sign-in and password reset have no visible checkbox.

### Email verification codes

New accounts verify their email by typing a 6-digit code instead of clicking a link ("Send me a link instead" remains as a fallback). Google sign-in accounts are already verified and never get a code. The website's #start survey requires a verified account first.

`sendEmailCode` keeps only a salted hash of the code in `emailCodes/{uid}` (10-minute expiry, 5 wrong tries, one code a minute, ten a day) and writes the email to the `mail` collection. `verifyEmailCode` marks the account verified. The rules deny clients both collections. Nothing is delivered until the official **Trigger Email from Firestore** extension is installed:

1. Firebase console → Extensions → *Trigger Email from Firestore* (`firebase/firestore-send-email`) → Install in the same project.
2. SMTP connection URI: `smtps://YOUR_ADDRESS@gmail.com@smtp.gmail.com:465` with the password field set to a Gmail **app password** (Google Account → Security → 2-Step Verification → App passwords). Older versions of the form take it inline: `smtps://YOUR_ADDRESS%40gmail.com:APP_PASSWORD@smtp.gmail.com:465`.
3. Email documents collection: `mail`. Default FROM address: the same Gmail address (for example `Wherehouse <YOUR_ADDRESS@gmail.com>`). Firestore location: the database's region (`us-east1`).
4. Deploy the two functions and the rules: `npx firebase deploy --only functions:wherehouse:sendEmailCode,functions:wherehouse:verifyEmailCode,firestore:rules --project YOUR_PROJECT_ID`.

Gmail allows about 500 messages a day. The extension runs one more function per email and records delivery state on each `mail` document. Test locally with `npm run test:firebase`; the emulator harness returns the code to tests and sends nothing.

**Owner activation commands for the current project**, after pulling this change in Cloud Shell:

```bash
cd ~/wherehouse
git pull --ff-only
npm ci --prefix firebase/functions
gcloud services enable recaptchaenterprise.googleapis.com --project wherehouseportal
gcloud projects add-iam-policy-binding wherehouseportal --member='serviceAccount:377162209873-compute@developer.gserviceaccount.com' --role='roles/recaptchaenterprise.agent'
npx firebase deploy --only functions:wherehouse:createAccount --project wherehouseportal
node firebase/functions/scripts/secure-signup.cjs --apply wherehouseportal
```

The runtime service account above is the account reported by this project's deployed functions. If you change the runtime identity, grant the assessment role to that identity instead. Do not create or download a service-account private key.

**The last command is required to prevent a bypass.** It disables direct, unverified client signup using only the `client.permissions.disabledUserSignup` configuration field. It preserves email/password sign-in, existing accounts, warehouse data and the Admin SDK signup route. It reads the setting back and fails if it cannot confirm it. Read-only verification:

```bash
node firebase/functions/scripts/secure-signup.cjs --check wherehouseportal
```

If Google rejects the setting or asks for an Identity Platform upgrade, stop and inspect that response; the script does not upgrade a product, change billing or claim the bypass is closed. Keep public signup off until this configuration is confirmed. Do not disable the Email/Password provider, because that would also stop existing users signing in.

Local checks run with `npm run test:firebase`. The browser replaces Google's widget script with a local fixture, and the server accepts only administrator-minted, single-use emulator fixtures. Tests cover missing/forged/expired/wrong-domain tokens, replay, attempt limits, mobile submission/expiry, email-verification flow and existing sign-in. They make no live Google assessments. The configuration script tests use an injected fake response, never live Firebase configuration. A real Google checkbox/domain/permission check therefore still requires one small manual live signup after deployment.

For that one manual verification: confirm `--check` succeeds, open Create account, verify submission stays disabled before completing the checkbox, create one account you control, verify its email, sign out and sign back in. Existing-user login must show no checkbox. Do not create a warehouse or issue another usage key just to test signup. Inspect function logs and App Check metrics if verification fails; never paste a password, CAPTCHA token or authorization code into logs.

The signup endpoint permits at most 200 attempts per UTC day per project, 50 per IP per day and 10 per IP per hour. It uses one bounded counter document and returns a clear retry-later error; it never deletes existing accounts. Bad requests and App Check failures can still incur function usage. The counters do not cap all Firebase Auth API traffic or guarantee a dollar maximum.

References: [Enterprise checkbox assessments](https://docs.cloud.google.com/recaptcha/docs/create-assessment-website), [signup permissions](https://docs.cloud.google.com/identity-platform/docs/reference/rest/v2/Config), [configuration field masks](https://docs.cloud.google.com/identity-platform/docs/reference/rest/v2/projects/updateConfig).


## September 29 follow-up: offline moves and renewal grace

The web app now keeps an account/project/warehouse-scoped IndexedDB snapshot of records already opened on that device. It keeps at most 500 pallets, 500 rows per directory/metadata table, 1,500 label tokens and 100 recent history events. It does not download a warehouse to prepare this cache and does not store the photo library. The app shell is cached by the service worker after the installed worker controls a visit; open the warehouse once online, reload once, and check offline readiness before taking a device into a dead zone.

Offline rules:

- Only stored-pallet moves and location checks can be queued, for cached pallets and known active locations, by an authorized moving role. An uncached pallet needs an online lookup first. Up to 100 unresolved moves per device/account/warehouse; one unresolved move per pallet.
- Reopening an offline warehouse or recording an offline move requires access verified within the previous 24 hours and the appropriate license state. A cached record is not a claim of current server authorization; removal while disconnected is enforced when the device reconnects. Existing cached information cannot be remotely withdrawn from a disconnected device.
- A queue entry must be committed to IndexedDB before the UI says queued. A full/blocked device store produces an error. Web Locks serialize enqueue, replay and explicit discard across tabs. Queued is visibly different from confirmed; the last confirmed location is not optimistically overwritten.
- Reconnect checks membership/license again. Every replay goes through the existing transactional command function with the original ID and expected version. Accepted receipts are immutable. Stale moves stop in **Support → Sync and offline**. There is no automatic last-write-wins overwrite or indefinite retry loop.
- Sign-out clears displayed/cached warehouse records. Unconfirmed requests remain scoped to their originating account so that the same user can recover them after signing back in. Another account does not inherit that queue.
- Complete CSV export requires a connection; offline search only covers the bounded cache. Photos still use authenticated on-demand downloads.

**Publish renewal grace to the existing project** after reviewing the local verification results. The Pages build publishes browser changes; it cannot update Firebase rules/functions. In the owner's already authenticated Cloud Shell:

```bash
cd ~/wherehouse
git pull --ff-only
npm ci
npm ci --prefix firebase/functions
npx firebase deploy --only firestore:rules,storage,functions:wherehouse:command,functions:wherehouse:getDirectoryCounts,functions:wherehouse:reservePhotoUpload --project wherehouseportal
# Continue only after the command above succeeds:
npx firebase deploy --only functions:wherehouse:getWarehouseSummary --project wherehouseportal
```

Deploy the summary function last: it advertises the new receiving fields only after their command handler and database rules are ready.

No new index, service, scheduler or billing upgrade is needed for this release. It updates already provisioned functions/rules; normal deployment/build usage remains possible on Blaze. Until these rules/functions are deployed, the old server will still reject expired licenses. Read-only grace is not active merely because the website changed. Existing licenses automatically use `expires_at + 14 days`; there is no migration and no customer data rewrite. `active:false` remains immediate revocation.

Keep automated tests local: `npm test`, `npm run test:e2e`, `npm run test:firebase`, and `npm run test:firebase:load`. The Firebase browser suite now builds an explicitly guarded emulator-only bundle so a real service worker/offline reload can be tested. It refuses live project IDs, buckets and App Check keys; that bundle goes in `dist-emulator`, never the Pages artifact.

For a small manual live check after deployment, use one existing test pallet: open it and two locations online, briefly disable the device connection, queue one move, reload, reconnect, and confirm a single new history event. Do not use a customer's operational pallet, revoke a customer or expire a customer's license for testing. Grace/renewal boundary tests are already exercised locally. Run `npm run format:functions` before changing server code; CI runs `npm run format:check` to prevent dense one-line server files from returning.


### Optional jobs on Receive

Receive now starts with **Add job (optional)**. Choosing it opens the existing job picker; owners and managers can create a job in a popup without leaving their receipt. Employees can choose an existing job or skip it. Unassigned pallets are stored with an empty `job_id`, not a fabricated project, and remain usable in search, labels, moves, dispatch, returns and splits. Existing job assignments and history are unchanged.

Deploy `functions:wherehouse:command` first, then `functions:wherehouse:getWarehouseSummary` using the two-step deployment above. The summary advertises `optional_jobs_version: 1` only after the handler supports unassigned pallets. Until then, the client explains that a server update is required rather than claiming an unassigned receipt was saved. No new rules, indexes or migration are required for this addition.


### Warehouse menu and details

The top-right warehouse button opens Settings, other authorized warehouses (when there are any), and Add warehouse. The basic plan shows the upgrade message for adding/switching. Current-warehouse settings stay available to owners/managers. Updates validate inputs and the current record version on the server and append an audit event. Name, label code, address, time zone, phone, contact email and receiving instructions are editable. Existing QR identities do not change.

All existing licenses default to the basic behavior. Only the service owner can provision `licenses/{workspaceId}.features.multiWarehouse: true`; client writes to licenses remain denied. `features.maxWarehouses` sets an additional linked-warehouse allowance (default 5 when enabled, server maximum 50). No entitlement or price is changed by deploying this code. Each extra warehouse still requires a separately issued account-bound usage key. The server checks the current warehouse owner, active license, feature entitlement and allowance before consuming that key. Retries recover the same additional warehouse. Switching still requires membership and a valid target warehouse license; the dropdown never grants access to another customer's records.

To activate optional receiving jobs, warehouse settings and the additional-warehouse gate on the existing project, run in authenticated Cloud Shell:

```bash
cd ~/wherehouse &&
git pull --ff-only &&
npm ci &&
npm --prefix firebase/functions ci &&
npx firebase deploy --only functions:wherehouse:command,functions:wherehouse:createWarehouse --project wherehouseportal &&
npx firebase deploy --only functions:wherehouse:getWarehouseSummary --project wherehouseportal
```

The final function advertises the new UI capabilities only after the command handler is deployed. No new service, index or data migration is required. This does not replace the earlier rules deployment for renewal grace. Normal live Blaze deployment/build usage can apply; automated checks remain emulator-only.
