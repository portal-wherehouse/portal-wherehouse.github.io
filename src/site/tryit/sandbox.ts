// The home tour's private practice warehouse: its own in-memory engine over the tiny fixture,
// acting as the demo Operator. Nothing here touches the portal's stored data.

import { Engine, ReadError } from '../../demo/engine';
import { seedFixture } from '../../demo/seed';
import { uuid } from '../../domain/codes';
import type { CommandKind, CommandResult, Location, Pallet } from '../../domain/types';

export const TOUR_ACTOR = 'user-operator';
/** How the tour names whoever made a change. Never a person's name. */
export const TOUR_ACTOR_LABEL = 'You (Operator)';
/** The rack the tour suggests: empty in the tiny fixture. */
export const SUGGESTED_RACK = 'A-03-02';

export interface Sandbox {
  engine: Engine;
  actor: string;
  ws: string;
  warehouse: string;
}

export function createSandbox(): Sandbox {
  const engine = new Engine(seedFixture('tiny'));
  const m = engine.db.memberships.find((x) => x.user_id === TOUR_ACTOR && x.active);
  if (!m) throw new Error('The practice warehouse has no operator account.');
  return { engine, actor: TOUR_ACTOR, ws: m.workspace_id, warehouse: engine.context(TOUR_ACTOR, m.workspace_id).warehouse?.code ?? 'WH-01' };
}

/** Run one command exactly as the portal would send it. */
export function run(sb: Sandbox, kind: CommandKind, payload: Record<string, unknown>, pallet?: Pallet): CommandResult {
  return sb.engine.execute(sb.actor, {
    schema_version: 1,
    command_id: uuid(),
    workspace_id: sb.ws,
    kind,
    payload,
    ...(pallet ? { pallet_id: pallet.id, expected_version: pallet.version } : {}),
  });
}

export type Resolved = { type: 'pallet'; pallet: Pallet } | { type: 'location'; location: Location } | { type: 'error'; message: string };

export function resolveScan(sb: Sandbox, text: string): Resolved {
  try {
    return sb.engine.resolve(sb.actor, sb.ws, text);
  } catch (e) {
    return { type: 'error', message: e instanceof ReadError ? e.message : 'That code could not be read.' };
  }
}

/** Pallets recorded at each location, for the "empty" / "3 pallets" hints on rack labels. */
export function occupancyOf(sb: Sandbox, locationId: string): number {
  return sb.engine.occupancy(sb.ws)[locationId] ?? 0;
}
