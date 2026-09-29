// Shows what happened to a command in words: saved, rejected (and why), unknown, or offline.
// A pending or failed write never looks like a confirmed warehouse update (page 3).

import { useApp } from '../app/state';
import type { CommandState } from './useCommand';
import { Notice, Spinner } from './ui';

const CODE_HELP: Record<string, string> = {
  VERSION_CONFLICT: 'Someone else changed this record first. Review the newer state before deciding again.',
  FORBIDDEN: 'Your role does not allow this. The server checked, not just the screen.',
  JOB_CLOSED: 'The job is closed. A supervisor can reopen it.',
  INACTIVE_LOCATION: 'That location is switched off. Choose an active one.',
  INVALID_STATE: 'The record is not in a state that allows this.',
  INVALID_INPUT: 'Check the highlighted information and try again.',
  NOT_FOUND: 'That record is not available in this company.',
  COMMAND_KEY_REUSED: 'This request ID was already used for different content.',
  TEMPORARY_FAILURE: 'Nothing was saved. It is safe to try again.',
};

export function CommandFeedback({ state, onRecover, onDiscard }: { state: CommandState; onRecover: () => void; onDiscard?: () => void }) {
  const { prefs } = useApp();
  if (state.phase === 'sending') {
    return (
      <Notice tone="info" icon="sync" title="Sending…">
        <span className="row nowrap">
          <Spinner /> Saving this change. Wait for confirmation before continuing.
        </span>
      </Notice>
    );
  }
  if (state.phase === 'unknown') {
    return (
      <Notice
        tone="warn"
        title="Result unknown"
        actions={
          <>
            <button className="btn primary small" onClick={onRecover}>
              Check result
            </button>
            {onDiscard && (
              <button className="btn small" onClick={onDiscard}>
                Forget this request
              </button>
            )}
          </>
        }
      >
        {state.message} Choose “Check result” to recover the original request safely without creating a duplicate.
        {prefs.advancedTools && <span className="mono"> Request {state.commandId?.slice(0, 8)}</span>}
      </Notice>
    );
  }
  if (state.phase === 'rejected' && state.rejected) {
    const r = state.rejected;
    return (
      <Notice tone={r.code === 'VERSION_CONFLICT' ? 'warn' : 'error'} title={`Not saved: ${r.message}`}>
        <span className="muted">
          {CODE_HELP[r.code] ?? ''} {prefs.advancedTools && <span className="mono">{r.code}</span>}
          {prefs.advancedTools && r.correlation_id && r.correlation_id !== '-' ? <span className="mono"> · ref {r.correlation_id}</span> : null}
        </span>
        {r.errors && r.errors.length > 0 && (
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            {r.errors.slice(0, 12).map((e, i) => (
              <li key={i}>
                Row {e.row}, <span className="mono">{e.column}</span>: {e.message}
              </li>
            ))}
            {r.errors.length > 12 && <li>…and {r.errors.length - 12} more</li>}
          </ul>
        )}
      </Notice>
    );
  }
  if (state.phase === 'offline') {
    return (
      <Notice tone="warn" icon="wifiOff" title="Offline: changes unavailable">
        {state.message}
      </Notice>
    );
  }
  return null;
}
