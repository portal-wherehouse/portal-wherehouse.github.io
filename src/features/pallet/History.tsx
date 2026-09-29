// Pallet history, newest first: event type, actor, accepted time, before and after, reason (page 13).

import { useApp } from '../../app/state';
import { EVENT_LABEL } from '../../domain/transitions';
import type { PalletEvent, PalletSnapshot, User } from '../../domain/types';
import { Icon, type IconName } from '../../ui/icons';
import { fmtFull, fmtTime } from '../../ui/ui';

const EVENT_ICON: Record<string, IconName> = {
  receive: 'receive',
  import_receive: 'import',
  split_child: 'split',
  place: 'pin',
  move: 'move',
  verify_location: 'check',
  dispatch: 'truck',
  return: 'returnIcon',
  mark_missing: 'question',
  locate: 'target',
  apply_hold: 'hold',
  clear_hold: 'unlock',
  reassign_job: 'swap',
  edit_details: 'edit',
  add_photo: 'camera',
  remove_photo: 'image',
  correct: 'history',
  retire: 'retire',
  archive: 'archive',
  rotate_label: 'qr',
  label_applied: 'print',
  split: 'split',
};

const TONE: Record<string, string> = { mark_missing: 'bad', correct: 'accent', locate: 'ok', split: 'accent', retire: 'bad' };

function Change({ before, after }: { before: PalletSnapshot | null; after: PalletSnapshot }) {
  const parts: React.ReactNode[] = [];
  const loc = (s: PalletSnapshot | null) => s?.current_location_code ?? (s?.state === 'STORED' ? '?' : 'none');
  if (!before) {
    parts.push(
      <span key="new">
        Created as <strong>{after.state.toLowerCase()}</strong> for <span className="jcode">{after.job_code}</span>
        {after.current_location_code ? (
          <>
            {' '}
            at <strong>{after.current_location_code}</strong>
          </>
        ) : null}
      </span>,
    );
  } else {
    if (before.state !== after.state)
      parts.push(
        <span key="st">
          {before.state.toLowerCase()} <span className="arrow">→</span> <strong>{after.state.toLowerCase()}</strong>
        </span>,
      );
    if (before.current_location_id !== after.current_location_id)
      parts.push(
        <span key="loc">
          rack {loc(before)} <span className="arrow">→</span> <strong>{loc(after)}</strong>
        </span>,
      );
    if (before.job_id !== after.job_id)
      parts.push(
        <span key="job">
          job {before.job_code} <span className="arrow">→</span> <strong>{after.job_code}</strong>
        </span>,
      );
    if (before.hold !== after.hold) parts.push(<span key="hold">{after.hold ? <strong>hold on</strong> : <strong>hold cleared</strong>}</span>);
    if (before.description !== after.description)
      parts.push(
        <span key="desc">
          “{before.description}” <span className="arrow">→</span> <strong>“{after.description}”</strong>
        </span>,
      );
    if (before.archived !== after.archived) parts.push(<strong key="arch">archived</strong>);
  }
  if (!parts.length) return <span className="muted">No change to state or location.</span>;
  return <>{parts.reduce<React.ReactNode[]>((acc, p, i) => (i ? [...acc, <span key={`s${i}`} className="faint">·</span>, p] : [p]), [])}</>;
}

export function History({ events, users, onCorrect }: { events: PalletEvent[]; users: Record<string, User>; onCorrect?: (e: PalletEvent) => void }) {
  const { prefs } = useApp();
  return (
    <div className="timeline">
      {events.map((e) => (
        <div key={e.id} className="tl-item">
          <span className={`tl-dot ${TONE[e.type] ?? ''}`}>
            <Icon name={EVENT_ICON[e.type] ?? 'history'} />
          </span>
          <div>
            <div className="tl-head">
              <span className="tl-title">{EVENT_LABEL[e.type] ?? e.type}</span>
              {prefs.advancedTools && <span className="tag">v{e.revision}</span>}
              <span className="muted" style={{ fontSize: 13.5 }} title={`${fmtFull(e.accepted_at)} · stored as ${e.accepted_at} (UTC)`}>
                {fmtTime(e.accepted_at)} · {users[e.actor_id]?.name ?? 'Unknown person'}
              </span>
            </div>
            <div className="tl-change">
              <Change before={e.before_state} after={e.after_state} />
            </div>
            {e.detail.destination && (
              <div className="tl-change muted">
                Destination: <strong>{String(e.detail.destination)}</strong>
              </div>
            )}
            {e.detail.children && <div className="tl-change muted">Split into {String(e.detail.children)}</div>}
            {e.detail.split_from && (
              <div className="tl-change muted">
                Split from {String(e.detail.split_from)}, placed at inherited location {String(e.detail.inherited_location)}
              </div>
            )}
            {e.detail.import_batch && (
              <div className="tl-change muted">
                Imported from row {String(e.detail.source_row)} of batch <span className="mono">{String(e.detail.import_batch).slice(0, 8)}</span>
              </div>
            )}
            {e.detail.corrects_event_id && <div className="tl-change muted">Corrects an earlier entry. The original stays in the history.</div>}
            {e.reason && <div className="tl-reason">{e.reason}</div>}
            <div className="faint" style={{ fontSize: 11.5, marginTop: 4 }}>
              {prefs.advancedTools && <span className="mono">cmd {e.command_id.slice(0, 8)}</span>}
              {onCorrect && e.type !== 'correct' && (
                <>
                  {' · '}
                  <button className="btn ghost small" style={{ minHeight: 28, padding: '0 6px' }} onClick={() => onCorrect(e)}>
                    Correct this entry
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
