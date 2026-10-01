# Wherehouse

Warehouse organization by job: receive a pallet, label it, scan its rack, find it and dispatch it.

- Website: https://wherehousetracking.com/
- Live sign-in: https://app.wherehousetracking.com/#signin
- Isolated sample warehouse: https://app.wherehousetracking.com/?demo=1
- Support: support@wherehousetracking.com
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

## Custom domain

The same build also runs on the custom domain **wherehousetracking.com**, served by Cloudflare Pages. The domain is read from the address at run time (`src/config/hosts.ts`), so the routing below works on any domain without code changes (shown with `example.com`):

- `example.com` and `www.example.com` show the website. Sign in, the portal screens, `#start` (its account step signs people in) and sample links (`?demo=1`) move to `app.example.com`, keeping the search and hash. Website links into the portal point straight at the app host.
- `app.example.com` opens the portal: sign-in, or the Dashboard when signed in. Website pages opened there move to `example.com` with the same hash. Firebase sign-in is kept per address, so every sign-in and sign-up happens on the app host.
- Every other host (`portal-wherehouse.github.io`, `*.pages.dev` previews, `localhost`, IP addresses) keeps the website and portal together with no redirects, exactly as before.

Publishing: `.github/workflows/pages.yml` also deploys each push to `main` to the Cloudflare Pages project `wherehouse` (created on the first run, production branch `main`) once these repository secrets are set under Settings > Secrets and variables > Actions:

- `CLOUDFLARE_API_TOKEN`: a custom API token with the Account > Cloudflare Pages > Edit permission.
- `CLOUDFLARE_ACCOUNT_ID`: the Cloudflare account ID.

Without them the Cloudflare job is skipped and GitHub Pages publishing continues unchanged. `public/_headers` keeps `sw.js` and `version.json` uncached on Cloudflare. New accounts are refused from hosts not listed in `SIGNUP_HOSTNAMES` (`src/config/registration.ts`). It lists `portal-wherehouse.github.io`, `wherehousetracking.com` and `app.wherehousetracking.com`; the functions must be deployed again for the list to take effect. The same hosts also need to be added to the Firebase authorized domains and the reCAPTCHA and App Check key domains. For a different domain, add its apex and app hosts the same way.

## Printing

A receiving computer plus a USB 4 × 6 thermal printer is the practical starting point. Letter sheets work for a small pilot. Print at actual size with headers and footers disabled. Pallet and rack labels carry readable codes and QR codes; keyboard scanners must support the printed code type and send Enter. A phone camera is enough to start.

The [printing and scanning page](https://wherehousetracking.com/#hardware) covers buying, setup and label placement. Hardware compatibility still requires a physical print-and-scan check.

## Walkthrough

The process page contains a one-second static placeholder video in MP4 and WebM. It is deliberately not the finished animation.

The earlier [pilot review](docs/pilot-review.md) is a fictional workflow simulation, not a customer testimonial or a completed field trial. Older architecture documents describe the original local prototype; the current Firebase guide and source are authoritative for this release.

### Supplier barcode scanning

Find materials and Receive have camera/photo scan buttons and accept keyboard scanners.
The scanner reads QR, Code 128/GS1-128, Code 39, EAN/UPC, ITF, and Data Matrix using
native detection with a locally bundled, lazy-loaded ZXing fallback. Barcode images
are decoded on the device; scanning does not send photos to a lookup service.

Receive recognizes SSCC application identifier `00`, preserves its 18 digits, and
checks its check digit. It also accepts product codes and supplier references.
The supplier reference is saved with the receipt and can be searched from Find.
Product codes may match multiple pallets. Scanning never creates a receipt by itself,
and copying a previous receipt clears its supplier reference.

A standard SSCC identifies a logistics unit; it is not a database of its contents.
Supplier ASN/EDI or packing-list/catalog imports are not connected by this feature.
Descriptions for ordinary supplier barcodes must still be entered by the receiver.
See the [GS1 logistics label guideline](https://ref.gs1.org/guidelines/logistic-label/).

For labels explicitly made for Wherehouse, an **optional custom QR format** can
include a description. This is not a universal supplier or GS1 format:

```text
WHR1:{"supplier_ref":"006141411234567890","description":"24 cartons of LED light fixtures"}
```

Encode the full text above as a QR code (do not encode it as an SSCC barcode).
`supplier_ref` is a string of 1–80 characters; `description` is plain text of
1–160 characters. Leading zeros must be preserved. Receive fills both fields,
requires the operator to choose a job and save, and refuses to overwrite different
existing contents. Find extracts the same reference to search saved records.

### Product memory and pallet details

Receive can match a supplier scan to **Import → Expected shipments**, a warehouse's remembered product name, or an optional `WHR1` description. Ordinary supplier barcodes do not provide a universal description lookup. Expected shipments do not add stock until a receiver reviews and saves the pallet. A shipment can omit its description: known quantities and other details still prefill, and the receiver must supply the product name before saving. Multiple matching deliveries require a choice; consuming a shipment and creating its pallet are one transaction.

Keep the preferred product name in Description (for example, White birch). Quantity/unit (48 logs), destination, notes, date and up to 12 named custom details belong to that individual pallet. A reusable product barcode can remember the preferred description, unit and custom field names. Quantities and field values never become defaults. SSCC pallet IDs cannot be saved as reusable product codes. GTIN lookups accept equivalent zero-padded representations. Imported `details_json` is a JSON object of text values, such as `{"Grade":"A","Length":"16 inches"}`.

Every received pallet gets its own Wherehouse QR and Code 128 label, even without a supplier barcode. The label prints the description and quantity; scanning its identity opens the current saved record, including destination and custom details. Editing pallet details flags the physical label for reprinting without changing its QR identity. Product defaults do not change existing pallets.

**Still-here reminders** are dashboard alerts starting on the selected warehouse-calendar date. Received, stored and missing pallets remain eligible; dispatched, retired and archived pallets do not. Clear or reschedule a reminder with Edit details. The dashboard refreshes about once a minute while visible and shows the earliest 50 due pallets. This feature does not send email, SMS or device push notifications.

#### Deploying the receiving extension

The web UI waits for `getWarehouseSummary` to advertise `receiving_version: 1`, preventing new fields from being submitted to the earlier command handler. Deploy the command and rules **first**, then the summary function. In authenticated Cloud Shell from an up-to-date checkout:

```sh
cd ~/wherehouse
git pull --ff-only
npm ci
npm --prefix firebase/functions ci
npx firebase deploy --only functions:wherehouse:command,firestore:rules --project wherehouseportal
npx firebase deploy --only functions:wherehouse:getWarehouseSummary --project wherehouseportal
```

Only run the second deploy after the first succeeds. No signup configuration or billing-plan change is involved. Existing pallets need no migration; the new detail fields are optional. Refresh the app after deployment.

#### Deploying stock levels, quantity changes, reports and dispatch slips

Minimums and Running low, quantity changes with approval, and dispatch numbers run in the command function; on-hand counts per product run in `getDirectoryCounts`; Running low on the Dashboard comes from `getWarehouseSummary` (`stock_version: 1`). Build the new indexes first, then the command and counts, then the summary:

```sh
npx firebase deploy --only firestore:indexes --project wherehouseportal
npx firebase deploy --only functions:wherehouse:command,functions:wherehouse:getDirectoryCounts --project wherehouseportal
npx firebase deploy --only functions:wherehouse:getWarehouseSummary --project wherehouseportal
```

Rules are unchanged. Existing pallets and products need no migration: minimums, quantity changes and dispatch numbers are optional fields, and dispatch numbers start at D-000001 per warehouse.
