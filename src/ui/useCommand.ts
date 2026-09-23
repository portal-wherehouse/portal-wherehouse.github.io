// One decision = one command ID. Retries and recovery reuse it until the server gives a definite answer,
// so a lost response can never turn into a second change (pages 11, 12, 23).

import { useCallback, useRef, useState } from 'react';
import { uuid } from '../domain/codes';
import type { CommandAccepted, CommandKind, CommandRejected, Pallet } from '../domain/types';
import { useApp } from '../app/state';
import { buzz } from '../device/scanner';

export type CommandPhase = 'idle' | 'sending' | 'done' | 'rejected' | 'unknown' | 'offline';

export interface CommandState {
  phase: CommandPhase;
  accepted: CommandAccepted | null;
  rejected: CommandRejected | null;
  message: string | null;
  commandId: string | null;
}

const initial: CommandState = { phase: 'idle', accepted: null, rejected: null, message: null, commandId: null };

export function useCommand() {
  const { send, backend, actorId, workspaceId, prefs } = useApp();
  const [state, setState] = useState<CommandState>(initial);
  const pending = useRef<{ id: string; kind: CommandKind; payload: Record<string, unknown>; pallet: Pallet | null; expectedVersion?: number } | null>(null);

  const finish = useCallback(
    (outcome: Awaited<ReturnType<typeof send>>): CommandState => {
      let next: CommandState;
      if (outcome.status === 'result') {
        if (outcome.result.ok) {
          next = { phase: 'done', accepted: outcome.result, rejected: null, message: null, commandId: outcome.result.command_id };
          pending.current = null;
          if (prefs.haptics) buzz(25);
        } else {
          next = { phase: 'rejected', accepted: null, rejected: outcome.result, message: outcome.result.message, commandId: null };
          pending.current = null;
          if (prefs.haptics) buzz([40, 60, 40]);
        }
      } else if (outcome.status === 'unknown') {
        next = { phase: 'unknown', accepted: null, rejected: null, message: outcome.message, commandId: pending.current?.id ?? null };
      } else if (outcome.status === 'offline') {
        next = { phase: 'offline', accepted: null, rejected: null, message: outcome.message, commandId: null };
        pending.current = null;
      } else {
        next = { phase: 'done', accepted: null, rejected: null, message: 'Queued on this device', commandId: outcome.entry.command.command_id };
      }
      setState(next);
      return next;
    },
    [prefs.haptics],
  );

  const run = useCallback(
    async (kind: CommandKind, payload: Record<string, unknown>, pallet?: Pallet | null, opts: { expectedVersion?: number } = {}) => {
      // Reuse the in-flight decision's ID if this is a retry of the same thing.
      const id = pending.current?.id ?? uuid();
      pending.current = { id, kind, payload, pallet: pallet ?? null, expectedVersion: opts.expectedVersion };
      setState({ ...initial, phase: 'sending', commandId: id });
      const outcome = await send(kind, payload, pallet ?? null, { commandId: id, expectedVersion: opts.expectedVersion });
      return finish(outcome);
    },
    [send, finish],
  );

  const recover = useCallback(async () => {
    const p = pending.current;
    if (!p || !actorId || !workspaceId) return state;
    setState((s) => ({ ...s, phase: 'sending' }));
    const outcome = await backend.recover(actorId, workspaceId, p.id);
    return finish(outcome);
  }, [actorId, workspaceId, backend, finish, state]);

  const reset = useCallback(() => {
    pending.current = null;
    setState(initial);
  }, []);

  return { state, run, recover, reset, busy: state.phase === 'sending', locked: state.phase === 'unknown' };
}
