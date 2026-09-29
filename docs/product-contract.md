# Product contract

Source: *Pallet Locator Complete Build Blueprint, Draft 0.1*, pages 3 to 15. The product is now called Wherehouse (decision D-13) and is by John Henry Mims. When a deliberate decision changes anything here, update this file in the same commit (page 37).

## Who it is for

A small warehouse or storage operation that receives distinct pallets of materials for specific jobs. Staff need to find those pallets quickly. Office users need to check what has arrived, where it was last recorded, and what has left.

The unit is one physically handled pallet, not a product SKU. Two identical pallets are two records, because they may be stored in different places. A pallet can hold mixed materials. Its description and photo help people recognize it, and the app does not count items inside it.

## What a correct answer looks like

Searching **J-214** in the demo returns its pallets with where each was last confirmed, the last confirmed action and its time. Opening one shows the photo and the full history.

The app reports **recorded** locations. It cannot detect a physical move that nobody scanned. The product says so in its own words: "Last confirmed at A-03-02", never anything that implies live positioning.

## Design commitments

- Three primary actions: **Receive, Move, Find.** Everything else lives inside a record or under More.
- A successful move creates both a current location and an explainable event.
- A pending or failed write never looks like a confirmed warehouse update.
- Staff can type the printed code when the camera cannot read a label.
- The first release works on its own, with no company-system integration.

## Roles (page 4)

| Role | Everyday actions | Restricted |
| --- | --- | --- |
| Owner | Everything; invite people; configure the workspace | Ownership changes need another active owner. A workspace never has zero owners. |
| Supervisor | Manage jobs and racks, reconcile problems, correct history, clear holds, export | Cannot grant Owner or transfer ownership |
| Operator | Receive, place, move, verify, dispatch, return, apply holds | Cannot manage access, retire records, clear holds or override conflicts |
| Viewer | Search, view photos and history | No writes, no bulk downloads, no admin |

Every person has their own account so each history entry names its actor. Permissions are checked against current membership when each command is accepted, never against a role the browser remembers.

## Pallet lifecycle (page 7)

| State | Meaning |
| --- | --- |
| RECEIVED | Exists and is waiting to be placed. No current location. |
| STORED | Exactly one active location is assigned. |
| DISPATCHED | Has left the warehouse. |
| MISSING | Physical position is uncertain. The last confirmed location is kept as history. |
| RETIRED | No longer an active handling unit. Can be archived to hide it from default search. |

**Hold** is a separate flag for damage or inspection. A stored pallet can be on hold and keep its rack. Operators apply holds and supervisors clear them. A hold blocks dispatch.

**Return** after dispatch is a new receipt event on the same identity: the pallet becomes RECEIVED with no rack.

## Invariants

- `current_location_id` is set if and only if the state is STORED. The last confirmed location is a separate field and never stands in for the current one.
- Every pallet belongs to one workspace, one warehouse and one job, and those references agree.
- An accepted pallet command raises the version by exactly one and writes exactly one event, together. A split writes one event per affected pallet.
- Retired pallets cannot move. A supervisor can undo a mistaken retirement only through an audited correction.
- History is never edited or deleted. Corrections are new events that point at the entry they correct.

## Scope and stages (page 5)

| Stage | Included | Status in this build |
| --- | --- | --- |
| A: Local prototype | Fake data, Receive/Move/Find, labels, local history, reset | Built |
| B: Online pilot | Real accounts, isolated workspaces, atomic commands on the server, private photos, roles, exports, corrections, backups | Screens and rules built against a local simulated server. Sign-in is off while we test. Firebase is the chosen backend (D-18), not connected yet. |
| C: Resilient expansion | Offline move queue, conflict inbox, controlled splits, richer reconciliation | Built against the simulated server |
| Beyond the blueprint | Public website, handheld scanner support and command barcodes, Scan station, portal walkthrough, Help center, backup and restore | Built (D-14 to D-19) |

**Outside the first release:** item quantities inside pallets, replenishment and forecasting, purchase orders, accounting, route planning, GPS or RFID location, direct thermal-printer drivers, ERP integration, a floor-plan editor, and automatic photo recognition. The warehouse map in this build is drawn from location codes and is not a floor-plan editor. It never claims free space or capacity.

**Scope rule:** a feature enters the current stage only if an acceptance criterion cannot be met without it.
