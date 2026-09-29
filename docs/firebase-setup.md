# Connect Wherehouse to Firebase

The website stays on GitHub Pages. Firebase handles accounts, shared records, photos and validated changes. The code is implemented; a Google project must be created and deployed before live sign-in is available.

## 1. Create the project

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

## 4. Deploy the backend

Use Node 22 and Java 21 or later for the emulator tests. From a checkout of this repository:

```bash
npm ci
npm ci --prefix firebase/functions
npx firebase login
npx firebase use --add
npm run test:firebase
npx firebase deploy --only firestore:rules,firestore:indexes,storage,functions --project YOUR_PROJECT_ID
```

Choose the project created in step 1. The deploy command builds and uploads the five functions (`createWarehouse`, `command`, `authorizeEmail`, `joinAuthorizedWarehouses`, and `cancelAuthorization`), the database rules and the photo rules. Accept Google's prompts to enable the required APIs. If asked for a container image cleanup period, seven days is a reasonable starting point.

Do not run `firebase init`: the repository already includes the configuration. Do not replace the rules with public read/write rules. Firebase deployment uses your own Google login; GitHub Pages publishing does not deploy the backend.

## 5. Allow authenticated photo downloads from the website

The app downloads images with the signed-in user's credentials instead of permanent public download links. Cloud Storage needs a CORS policy. In Google Cloud Shell, from a checkout of this repository, run:

```bash
gcloud storage buckets update gs://YOUR_BUCKET_NAME --cors-file=firebase/storage.cors.json
```

Use the exact `storageBucket` from your web config. The supplied policy allows the GitHub Pages origin. Add a new origin if you move to your own domain. CORS does not make the bucket public; Storage Rules still check warehouse membership.

## 6. Publish the configured website

In GitHub → Actions → **Deploy to GitHub Pages** → Run workflow → main. Wait for both build and deploy to turn green. Open https://portal-wherehouse.github.io/#signin and refresh.

Create your account and verify the email. A usage key is required to activate a warehouse; signing in alone grants no warehouse access.

As the service owner, issue the first key using the instructions below. In the app choose **Activate my warehouse with a usage key**, enter the warehouse name and key, and activate. Then open the Manager dashboard to authorize employee emails. Employees sign in separately; they never need the account owner's usage key.

## 7. Check the real warehouse connection

On two different devices:

1. Sign in with the two separate accounts.
2. Receive a pallet on the first device. Confirm it appears on the second.
3. Print one label at actual size and scan it on the phone.
4. Place it at a rack, then check the location and history from the other device.
5. Add a photo and confirm both devices can see it.
6. Reload both devices. Confirm the record remains.
7. Sign out. Confirm the app asks for sign-in before showing warehouse data.

Start with one aisle before using it for the whole warehouse. The automated tests cover shared updates and permissions; they cannot verify your printer, label stock, Wi-Fi coverage or Google project's live configuration.

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
- This first shared-data implementation reads the warehouse's operational tables inside each command transaction. Monitor read costs and response time during the pilot; larger warehouses will need narrower server queries and paginated history. It is not yet load-tested for large fleets.
- Functions are capped at five instances each. Budget alerts are still necessary. Billing/enrollment is manual; the website does not collect payments. License expiry does stop access; the service owner extends access after arranging billing.
- Removed photo metadata remains in history. Removed and abandoned photo objects are retained until an administrator applies a reviewed cleanup/retention policy. Do not set a blanket short lifecycle deletion rule on active photos.
- Review the project's App Check and abuse controls before opening unrestricted public enrollment. Rules protect warehouse access; they do not replace monitoring.

## Local verification

```bash
npm test
npm run test:e2e -- --workers=1
npm run test:firebase
npm run build
```

The Firebase checks run the deployed callable handlers against Auth, Firestore and Storage emulators, including actual token verification. A TCP test host avoids environments that disallow the emulator's Unix sockets. Browser checks exercise real email sign-in and warehouse creation against the emulators. No Google billing account is needed for these tests.

Official references: [Email/password accounts](https://firebase.google.com/docs/auth/web/password-auth), [deploy functions](https://firebase.google.com/docs/functions/get-started), [authenticated photo downloads and CORS](https://firebase.google.com/docs/storage/web/download-files).
