// A small form sheet for one admin command: fields, optional reason, send, and the same honest
// feedback as pallet commands (saved, rejected with why, or unknown with Check result).

import { useState, type ReactNode } from 'react';
import type { CommandKind } from '../../domain/types';
import { useApp } from '../../app/state';
import { CommandFeedback } from '../../ui/CommandFeedback';
import { Icon } from '../../ui/icons';
import { useCommand } from '../../ui/useCommand';
import { Field, Sheet, Spinner } from '../../ui/ui';

export function AdminSheet({
  title,
  kind,
  intro,
  children,
  payload,
  valid = true,
  reason,
  verb,
  done,
  danger,
  expectedVersion,
  onDone,
  onClose,
}: {
  title: string;
  kind: CommandKind;
  intro?: ReactNode;
  children?: ReactNode;
  payload: () => Record<string, unknown>;
  valid?: boolean;
  /** 'required' | 'optional' | undefined (no reason field). */
  reason?: 'required' | 'optional';
  verb: string;
  /** The toast once it is saved, like "J-240 closed". */
  done?: string;
  danger?: boolean;
  expectedVersion?: number;
  onDone?: (createdId: string | null) => void;
  onClose: () => void;
}) {
  const { toast } = useApp();
  const cmd = useCommand();
  const [why, setWhy] = useState('');
  const ok = valid && (reason !== 'required' || why.trim().length > 0);

  const finish = (r: Awaited<ReturnType<typeof cmd.run>>) => {
    if (r.phase === 'done') {
      toast(`${done ?? `${title}: saved`}${r.accepted?.replayed ? ' (recovered)' : ''}`);
      onDone?.(r.accepted?.target_id ?? null);
      onClose();
    }
  };
  const submit = async () => {
    const body = payload();
    if (reason) body.reason = why.trim() || undefined;
    finish(await cmd.run(kind, body, null, { expectedVersion }));
  };

  return (
    <Sheet title={title} onClose={onClose}>
      <div className="stack">
        {intro && <p className="muted" style={{ fontSize: 14.5 }}>{intro}</p>}
        {children}
        {reason && (
          <Field label={reason === 'required' ? 'Reason' : 'Reason (optional)'} htmlFor="admin-reason" count={why.length} max={500}>
            <textarea id="admin-reason" className="textarea" style={{ minHeight: 60 }} value={why} onChange={(e) => setWhy(e.target.value)} disabled={cmd.locked} />
          </Field>
        )}
        <CommandFeedback state={cmd.state} onRecover={() => void cmd.recover().then(finish)} />
        {!cmd.locked && (
          <div className="row">
            <button className={`btn big ${danger ? 'danger' : 'primary'}`} disabled={!ok || cmd.busy} onClick={() => void submit()}>
              {cmd.busy ? <Spinner /> : <Icon name="check" />} {verb}
            </button>
            <button className="btn big" onClick={onClose} disabled={cmd.busy}>
              Cancel
            </button>
          </div>
        )}
      </div>
    </Sheet>
  );
}
