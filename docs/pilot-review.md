# Simulated pilot and production readiness

Date: 2026-09-29. Northfield Builders is a **fictional sample warehouse**, not a customer or a prospect contacted by this project.

## Scenario

A construction-material staging warehouse holds pallets for three jobs: clinic fit-out (J-198), library HVAC (J-203), and school renovation (J-214). One simulated shift receives 24 distinct pallets, places them at A-03-02, moves them to B-01-01, dispatches 12, and returns/re-stores 3 at A-02-01.

`tests/unit/pilot.test.ts` checks:

- 24 unique pallet identities and the correct job on every record.
- Duplicate movement requests replay the original result without extra history.
- 15 pallets stored and 9 dispatched at the end.
- 90 traceable lifecycle events across those pallets.
- Unscanned physical movement is not observable by the software.

`tests/e2e/pilot.spec.ts` checks the operator interface: receive two matching pallets, preserve their shared material reference but clear pallet-specific notes, preview both labels, place the second pallet, search for it and check its history. It also checks that management/debug clutter is hidden and that the proposed price and fictional nature of the sample warehouse are visible.

`tests/unit/durability.test.ts` injects storage failures and checks that failed commits leave no visible pallet/event/receipt, failed pending-request writes never execute, and failed cleanup of a committed command can be recovered without a duplicate.

## What this does not establish

This is a software simulation. It does not establish real-world scan compliance, time savings, customer demand, phone-camera performance on damaged labels, printer quality, or willingness to pay. Separate browser profiles and physical devices do not share warehouse data yet. Demo roles are not authentication.

## Proposed live pilot

### A local discovery lead

[Charleston Receiving Warehouse](https://charlestonreceivingwarehouse.com/services), at 4208 Pace Street, Unit A, North Charleston, publicly describes receiving photographs organized by client and job, storage until installation, and project-level status. Source reviewed September 29, 2026. This makes it a candidate for a workflow interview, **not a confirmed customer, partner, or willing pilot participant**. No contact has been made.

Its item-level furniture handling is adjacent to this app's pallet model. First ask whether any of its material moves as stable labeled handling units. If most work needs item-level counts, assembly, or furniture condition management, do not force this pallet tool onto its operation. It may already have an adequate system. Keep the public demo fictional; do not use the prospect's name, logo, or invented results as marketing proof.

Discovery questions: How do you associate an arrival with a job? How do people locate it before delivery? Who records a rack change? What happens when nobody records a move? Can a label stay with the same handling unit until dispatch? What would have to improve for you to pay $99/month?

### Field trial sequence

1. Recruit one warehouse that stages material by job. Do not claim a customer until one agrees.
2. Observe a delivery, put-away, retrieval and dispatch. Record the current process and representative baseline search times.
3. Finish and test real authentication, tenant isolation, transactional commands, photo storage, offline replay and backup restoration.
4. Agree on one warehouse section, a small crew, selected jobs, label hardware and a 30-day no-charge trial. Confirm any later commercial agreement separately.
5. Measure observed moves vs recorded moves; verify physical vs recorded locations; time comparable searches; note operator training and support effort.
6. Review results and ask whether the proposed $99/warehouse/month plan (up to 10 users) is worth continuing. Hardware and label supplies are separate. No automatic conversion.

## Production gate

The Firebase folder remains a draft, not a deployed service. Before live customer data is entered, use an owner-controlled Firebase project, compile and test the server command function, run rules tests with two companies and removed members, verify backup restoration, and run the same multi-user scenarios on separate devices. The local durability repair is not a substitute for this work.
