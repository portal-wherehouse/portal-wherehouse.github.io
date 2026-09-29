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
- **Firestore Database:** create the **(default), Standard edition** database in production mode. Choose `us-central1` to match the functions in this repository. Do not use Realtime Database or MongoDB compatibility.
- **Storage:** create the default bucket in production mode, using the same region where available. Keep the bucket name that Firebase supplies.

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
3. Publish the web configuration and inspect App Check metrics. Verify a real signed-in browser produces valid tokens, then **enforce App Check for Firestore and Storage** in Firebase. Callable functions enforce it in code on every non-demo project. Do not set `ENFORCE_APP_CHECK=false` in production. This app starts attestation after verified sign-in, so do not enable Authentication App Check enforcement without also moving initialization before sign-in and testing that separate change.
4. In Google Cloud → Cloud Run, inspect every deployed callable's configuration: **minimum instances 0, maximum 3, concurrency 20, 256 MiB, request timeout 30 seconds**. The scheduled cleanup has minimum 0, maximum 1 and timeout 120 seconds. Keep request-based billing. Maximum instances are per function and are not a dollar cap. Deployment transitions can temporarily overlap revisions.
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

Choose the project created in step 1. The deploy command builds and uploads nine functions: `createWarehouse`, `command`, `authorizeEmail`, `joinAuthorizedWarehouses`, `cancelAuthorization`, `reservePhotoUpload`, `getWarehouseSummary`, `getDirectoryCounts` and the scheduled `cleanupPhotoUploads`, the database rules and the photo rules. Only accept Google's API/billing prompts once you intend to activate this project. The daily cleanup creates one Cloud Scheduler job. After deployment, configure artifact cleanup explicitly:

```bash
npx firebase functions:artifacts:setpolicy --project YOUR_PROJECT_ID --location us-central1 --days 7
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

Expired or revoked licenses block warehouse reads, writes and photo downloads. The app clears displayed warehouse data when it sees revocation. Renewal reopens the same records rather than creating a new warehouse. A manager-authorized employee joins under the warehouse license, with no separate activation key.

Billing and renewal are manual for now. There is no payment-provider integration that automatically extends licenses after a charge. Keep your billing records and license periods aligned.

## Operation and maintenance

- Live saving requires internet. The sample warehouse (`?demo=1#signin`) is separate and uses browser storage. Its reset controls cannot reset live data.
- Unknown request results are saved on the originating device and retried with the same ID, avoiding duplicate receipts. Signing out clears displayed warehouse data; pending requests remain scoped to that account for recovery.
- Managers can export CSV. Enable a Firestore scheduled backup and test a restore before relying on the warehouse operationally. Cloud Storage photos need their own retention/backup policy; CSV does not contain photos.
- One account can create one warehouse. A warehouse plan includes up to ten people, counting pending email authorizations. Import at most 80 rows per request.
- Commands read the affected pallet, permission/license, receipt and relevant job/location documents. They never read accumulated event/audit collections. Every accepted change and its immutable event/receipt commit together. Duplicate requests return the original result without another write. Pallet number allocation is queued briefly per warehouse inside each function instance, with cross-instance safety still enforced by Firestore transactions.
- The SDK retries a transaction at most five times. There is no unbounded client command retry loop. An unknown result keeps the original command ID for explicit recovery. Do not generate a new ID just because a request timed out.
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
