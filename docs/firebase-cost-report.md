# Firebase cost and local load report

September 29, 2026. **Development/testing Firebase spend: $0.** All automated runs used `demo-wherehouse` Auth, Firestore and Storage emulators. No live Google services, billing, backups or Firebase deployment were activated. Blaze and all product features remain in the implementation.

## What changed

- Command transactions read the affected pallet and its permission, license, receipt, job/location and small command-specific dependencies. They never load warehouse history. Pallet state, immutable history and duplicate-request receipts commit together.
- Workspace opening uses bounded directory listeners. Pallet lists/history load 50 rows at a time with cursors. Record views subscribe to the selected pallet and limited metadata. Full exports are explicit operations, paginated at 100 rows. Counts use cached aggregation queries, not a warehouse snapshot.
- Photos upload real 1600-pixel compressed detail images and 320-pixel thumbnails. They remain authenticated. Sign-in and Find download no image library. Visible thumbnails and opened detail images fetch separately; legacy full-sized thumbnails are retained, not silently rewritten.
- Functions retain scale-to-zero, maximum 3 instances per callable, concurrency 20, 256 MiB and 30-second timeouts. Receiving briefly queues allocation of the shared human-readable pallet number within an instance; transactions preserve cross-instance uniqueness.
- Reservations enforce upload/storage allowances. Cleanup waits for expiration plus a 24-hour grace period and processes at most 100 abandoned uploads daily. It never deletes committed or removed historical photos. App Check is required for production callables.

## Locally measured operations

Four cycles per user, each receiving, replaying that exact request, placing, moving, finding and dispatching. Each user attaches a photo once. Photo downloads run concurrently in a separate phase. The large fixture has **10,000 current pallet documents plus 40,000 historical events**; seeding also makes two summary setup writes, excluded below. These are synthetic data, not a customer warehouse.

| Users | Existing records | Operation | SDK reads / writes per action | Transaction retries | Mean handler ms | p95 handler ms | Mean client ms | Photo bytes |
|---:|---:|---|---|---:|---:|---:|---:|---:|
| 1 | 0 | receive | 7 / 6 | 0 | 39.6 | 49.1 | 42.4 | 0 |
| 1 | 0 | move | 9 / 4 | 0 | 48.3 | 54.1 | 51.2 | 0 |
| 1 | 0 | find | 1 / 0 | 0 | — | — | 102.9 | 0 |
| 1 | 0 | dispatch | 8 / 4 | 0 | 45.1 | 47.0 | 48.2 | 0 |
| 1 | 0 | photo thumbnail | 0 / 0 | 0 | — | — | 86.3 | 24,576 |
| 1 | 0 | photo detail | 0 / 0 | 0 | — | — | 99.6 | 524,288 |
| 10 | 0 | receive | 7 / 6 | 0 | 70.2 | 257.8 | 74.1 | 0 |
| 10 | 0 | move | 9 / 4 | 0 | 54.0 | 113.8 | 57.3 | 0 |
| 10 | 0 | find | 1 / 0 | 0 | — | — | 21.5 | 0 |
| 10 | 0 | dispatch | 8 / 4 | 0 | 36.6 | 51.2 | 39.9 | 0 |
| 10 | 0 | photo thumbnail | 0 / 0 | 0 | — | — | 633.5 | 24,576 |
| 10 | 0 | photo detail | 0 / 0 | 0 | — | — | 843.5 | 524,288 |
| 1 | 50,000 | receive | 7 / 6 | 0 | 35.8 | 46.0 | 37.8 | 0 |
| 1 | 50,000 | move | 9 / 4 | 0 | 37.9 | 41.1 | 40.4 | 0 |
| 1 | 50,000 | find | 1 / 0 | 0 | — | — | 58.9 | 0 |
| 1 | 50,000 | dispatch | 8 / 4 | 0 | 37.0 | 41.0 | 39.7 | 0 |
| 1 | 50,000 | photo thumbnail | 0 / 0 | 0 | — | — | 81.7 | 24,576 |
| 1 | 50,000 | photo detail | 0 / 0 | 0 | — | — | 92.9 | 524,288 |
| 10 | 50,000 | receive | 7 / 6 | 0 | 102.4 | 368.1 | 106.7 | 0 |
| 10 | 50,000 | move | 9 / 4 | 0 | 61.4 | 87.7 | 64.9 | 0 |
| 10 | 50,000 | find | 1 / 0 | 0 | — | — | 84.2 | 0 |
| 10 | 50,000 | dispatch | 8 / 4 | 0 | 50.1 | 64.2 | 53.1 | 0 |
| 10 | 50,000 | photo thumbnail | 0 / 0 | 0 | — | — | 630.7 | 24,576 |
| 10 | 50,000 | photo detail | 0 / 0 | 0 | — | — | 844.2 | 524,288 |

**What these numbers mean:** reads are instrumented SDK document/query reads, counting an empty query as one. Retry reads are included; writes count only the successful final attempt. The handler time measures the callable HTTP handler in a local Node process, including local validation and waiting. It is not a Cloud Run billable instance duration, production latency, cold-start measurement or multi-instance scaling benchmark. Find and image viewing invoke no callable; their function time is therefore not applicable.

The Find row measures its exact-code pallet query. The real Find UI also looks up a job and rack code, may hydrate a missing job/location, evaluates security rules and starts a bounded listener. Those extra reads are represented in the monthly model, not mislabeled as part of the one-document microbenchmark. Photo rows report zero directly instrumented Firestore reads; **Storage Rules additionally read membership/license documents**, and uploads also read the reservation. Those dependent reads are billable on Google and are not exposed by this local counter. Index-entry scans, cached count queries, listener reconnects and rule evaluations need billing/Query Explain verification after live activation.

| Users / fixture | All measured transaction attempts | Retried attempts | Replayed requests with no write |
|---|---:|---:|---:|
| 1 / 0 | 22 | 0 | 4 |
| 10 / 0 | 227 | 7 | 40 |
| 1 / 50,000 | 22 | 0 | 4 |
| 10 / 50,000 | 234 | 14 | 40 |

This second table includes placement, photo reservation/attachment and idempotent replays. Retried attempts are not duplicate accepted moves. Correctness checks also cover simultaneous stale-version writes, cross-warehouse access, role enforcement, expired/revoked usage keys, immutable client history permissions, bounded query rules, lookup of an old record and cursor-paginated old history. Cleanup was checked against an expired orphan, an active committed photo and a removed historical photo.

A browser test uploaded a real canvas image: **18,473 bytes thumbnail** and **562,180 bytes detail**. A fresh sign-in and Find used **13 instrumented document reads and 0 photo bytes** in its small test warehouse. The 24 KiB/512 KiB load-test images are transfer fixtures; the separate browser test verifies actual image decoding/compression.

The emulator exposed two useful problems while developing this change: contention from shared aggregate writes (removed in favor of cached counts), and a firebase-tools 14.17 Storage runtime transport bug that drops coalesced JSON replies. The test launcher includes a local-only newline-framing adapter; it does not alter authorization rules or skip Storage tests. Final passing results follow these fixes. Production indexes, App Check enforcement, deployed instance behavior and regional latency have not been tested against billed resources.

Raw data: [load measurements](measurements/firebase-load.json), [browser image measurements](measurements/browser-photos.json). Reproduce with `npm run test:firebase` and `npm run test:firebase:load`. The launcher and each test entry point reject live configuration or missing/non-loopback emulator endpoints before SDK access.

## Estimated monthly Google costs

**Estimates, not observed bills or guaranteed caps.** Model: one shared project, Standard Firestore/Core queries in us-central1, regional Standard Storage using a new `.firebasestorage.app` bucket, US users, one billing account, and free allowances otherwise unused. Every warehouse pays $29/month. Taxes, payment fees, hardware, on-site work and remote-support labor are excluded from these infrastructure figures.

Per warehouse/month planning assumptions:

- Ten users, 22 working days, about 2,000 new pallets; 2,000 placements, 4,000 moves, 2,000 dispatches and 1,000 photo attachments. Allowance for other actions is included in the read/write totals.
- **750,000 database reads and 70,000 writes**, including commands, directory/list/history pages, rule-dependent reads, count caches, live updates/reconnects and modest retries. This is a workload assumption with headroom, not the result of extrapolating one exact lookup into an entire workday.
- **20,000 callable requests**, estimated at 1.0 second of single-vCPU/256-MiB active time each, plus 20% startup/retry margin. Actual concurrency can share instance time; emulators do not measure billed instance time.
- **1,000 photos** at 512 KiB detail + 24 KiB thumbnail: roughly 0.51 GiB new primary storage/month. Also retain one independent backup copy. Downloads: 2,000 detail views and 10,000 thumbnail views, roughly 1.21 GiB/month. Allow 2 GiB/month of database responses separately.
- Database storage grows **0.20 GiB/month/warehouse**, including receipts, history and indexes. This is a planning assumption, not emulator storage measurement. Search prefixes and long notes can change index overhead materially. Seven daily database backups and an orphan soft-delete reserve are included. Figures conservatively use end-of-month stored size.
- App Check at one-hour TTL, approximately two assessments/hour for ten users active eight hours/day: **3,520 assessments/month/warehouse**. Multiple browsers or tabs left signed in can increase this. Public browsing starts no attestation, and sign-out disables token auto-refresh.
- Shared deployment allowance: 108 Cloud Build minutes/month (four releases × nine functions × three minutes), 5 GiB retained image artifacts, 1 GiB function source archives, one daily cleanup scheduler job. Actual layer deduplication/build duration may differ.

| Paying warehouses | Monthly revenue | Estimated month 1 | Estimated month 12 | Month 12 per warehouse | Revenue less month-12 Google cost* |
|---:|---:|---:|---:|---:|---:|
| 1 | $29 | $0.50 | $1.34 | $1.34 | $27.66 |
| 10 | $290 | $14.26 | $24.43 | $2.44 | $265.57 |
| 50 | $1,450 | $139.57 | $190.42 | $3.81 | $1,259.58 |

*This is not profit: especially at $29, support time and acquiring customers can cost more than hosting. Hardware/setup quotes need their own margin.

| Month-12 component | 1 warehouse | 10 warehouses | 50 warehouses |
|---|---:|---:|---:|
| firestore operations | $0.00 | $2.15 | $13.67 |
| firestore storage | $0.21 | $3.45 | $17.85 |
| seven daily database backups | $0.50 | $5.04 | $25.20 |
| photos backup and build source storage | $0.17 | $2.37 | $12.19 |
| photo operations including backup | $0.00 | $0.22 | $1.27 |
| photo downloads | $0.00 | $0.00 | $0.00 |
| database downloads | $0.00 | $1.20 | $10.80 |
| cloud run functions | $0.00 | $1.44 | $24.48 |
| app check assessments | $0.00 | $8.00 | $84.00 |
| artifact registry | $0.45 | $0.45 | $0.45 |
| cloud build | $0.00 | $0.00 | $0.00 |
| daily cleanup scheduler | $0.00 | $0.00 | $0.00 |
| orphan soft delete storage reserve | $0.01 | $0.10 | $0.50 |

At month 12, each warehouse holds an estimated **2.4 GiB of database data** and **6.13 GiB of primary photos**, plus the separate photo backup. At the modeled upload rate, the default 10 GiB primary photo allowance is reached around month 20. Nothing is automatically erased; agree more capacity before that point. The sample trial limits below are much smaller.

Sensitivity: 0.2–1.5 seconds/function changes month-12 totals to **$1.34–$1.34 for 1 warehouses**, **$22.99–$27.31 for 10 warehouses**, **$167.38–$205.04 for 50 warehouses**. If every warehouse downloads 20 GiB of photos/month instead of 1.21 GiB, add about $0 / $12 / $108 for 1 / 10 / 50 warehouses under the modeled 100 GiB shared transfer allowance. Larger or geographically different downloads can dominate the bill.

With shared free allowances already consumed by other projects/services, this model budgets approximately **$11.69 for 1 warehouses**, **$33.44 for 10 warehouses**, **$216.14 for 50 warehouses** at month 12. This treats reCAPTCHA usage as incremental beyond an already-consumed free band; the billing account’s actual existing assessment tier can change that incremental price.

### Shared allowances and rates used

| Service | Rate/allowance used | Scope and qualification |
|---|---|---|
| Firestore | $0.03/100k reads; $0.09/100k writes; $0.01/100k deletes; about $0.15/GiB-month stored; backup $0.03/GiB-month | One eligible database/project; 50k reads and 20k writes/deletes per day, 1 GiB live storage, 10 GiB outbound/month. The model uses only 22 active days of daily free operations. |
| Cloud Storage | $0.02/GiB-month; $0.005/1k Class A; $0.0004/1k Class B; $0.12/GiB outbound in the modeled tier | Eligible US regional free allowance: 5 GiB, 5k A, 50k B, 100 GiB outbound to eligible destinations, shared across eligible usage. Old `.appspot.com` Firebase buckets have different allowances; do not reuse this model unchanged. |
| Cloud Run functions, request-based | $0.000024/vCPU-second, $0.0000025/GiB-second, $0.40/million requests | 180k vCPU-seconds, 360k GiB-seconds and 2M requests/month shared by billing account. This is second-generation pricing, not the first-generation GHz-second allowance. |
| reCAPTCHA/App Check | First 10k assessments/month free; $8 for 10,001–100k; then $1/1k beyond 100k in the modeled pay-as-you-go tier | Free assessment allowance is shared by organization; check the project’s actual commercial tier. |
| Deployment | Artifact Registry about $0.10/GiB-month after 0.5 GiB; default-pool e2-standard-2 builds $0.006/min after 2,500 promotional free minutes; Scheduler $0.10/job-month after three free jobs | Account-shared allowances, not one allocation per warehouse. Promotional allowances can change. |

Backup storage has no Firestore free tier. Restoring costs $0.20/GiB plus the restored database’s storage; an occasional restore is not included in the recurring table. Optional PITR would add approximately the database’s stored-size charge (about $0.15/GiB-month here) and is not enabled or counted. Photo copies include storage/operations but assume same-region copying; a second region adds transfer/storage differences. Logging is assumed below its free ingestion allowance; paid scanning, excessive logs, named databases, cross-region traffic and extra deployments are outside this baseline.

## Limits and a $0-development path

**Now:** local emulators and the browser-local sample warehouse. No live Firebase deployment or billing activation. Do not run the future live smoke test yet.

**Prepared for future trials:** ten people; server-owned limits of 30 actions/user/minute, 200/user/day, 1,000 lifetime pallet records, 100 MiB new reserved photo bytes/calendar month and 500 MiB retained photo bytes. All features remain present. Quotas return clear errors and preserve existing records/photos; replayed requests still return their original result without a new write. License activation and allowance increases require the service owner, not a customer manager.

The ordinary defaults remain 120 actions/user/minute, 5,000/user/day, 1 GiB new photos/month, 10 GiB retained, three active photos/pallet, 5 MiB/detail, 128 KiB/thumbnail and 80 import rows. A 256 KiB request ceiling bounds command bodies. App Check, permission checks, max instances and limited retries reduce abuse exposure.

**These are not dollar caps.** Direct authenticated reads/downloads and function attempts can still incur charges; history and receipts continue growing. There is no hard monthly warehouse bandwidth cap or exact Firestore byte cap. Before selling unrestricted high-volume use at $29, monitor per-warehouse activity, agree fair-use capacity, and consider a metered download gateway if enforceable bandwidth allowances become necessary. Do not delete history or disable photos/scanning to make the price work.

The practical next step is to demonstrate the full program locally or with the sample, get a paying commitment, then explicitly approve a small live Blaze activation. If free live trials are needed earlier, accept that trial budget separately. A budget alert is a notification, not a charge stopper.

Model: [cost-model.py](cost-model.py) and [cost-estimates.json](measurements/cost-estimates.json). Setup, controls and the deliberately tiny future live check: [Firebase guide](firebase-setup.md).

## Official pricing references

- [Firestore Standard pricing](https://cloud.google.com/firestore/pricing) and [billing details](https://firebase.google.com/docs/firestore/pricing)
- [Cloud Storage pricing](https://cloud.google.com/storage/pricing)
- [Cloud Run pricing](https://cloud.google.com/run/pricing)
- [App Check web attestation](https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider) and [reCAPTCHA tiers](https://docs.cloud.google.com/recaptcha/docs/compare-tiers)
- [Cloud Build](https://cloud.google.com/build/pricing), [Artifact Registry](https://cloud.google.com/artifact-registry/pricing), [Cloud Scheduler](https://cloud.google.com/scheduler/pricing)
- [Function instance settings and image cleanup](https://firebase.google.com/docs/functions/manage-functions)


### Signup checkbox addition (September 29)

The visible signup checkbox adds one callable invocation, a bounded counter transaction (one document read and one write for an accepted attempt, with extra reads if the transaction retries), one Enterprise assessment and an Auth account creation on success. App Check uses its separate score-based assessment/token cache. Existing sign-in has no visible checkbox assessment. Signup allows 200 attempts/project/day, 50/IP/day and 10/IP/hour; the function has minimum instances 0, maximum 1, concurrency 10, 256 MiB and a 30-second timeout. Rejected traffic can still consume resources; these are abuse limits, not a billing cap.

These signup costs were not part of the earlier warehouse load measurements or revenue tables. Local signup checks use emulator fixtures and make zero live reCAPTCHA assessments. No live signup cost or production latency has been measured; include both App Check and signup assessments in the project's shared reCAPTCHA allowance and monitor the live pricing tier before opening registration widely. Configuration and IAM changes are owner setup steps, not tests. See the setup guide for the required direct-client-signup restriction.
