// Scan station work areas: the big Look up card, the Move card, the Put-away list and the Count review.

import { useMemo, useState, type ReactNode } from 'react';
import { useApp } from '../../app/state';
import type { Job, Location, Pallet } from '../../domain/types';
import { Icon, type IconName } from '../../ui/icons';
import { Field, HoldBadge, Notice, Plate, Sheet, Spinner, StateBadge } from '../../ui/ui';
import {
  agoLong,
  canMarkMissing,
  canRecordFound,
  countSummary,
  isSendable,
  resultText,
  whereLine,
  type CountList,
  type CountRow,
  type CountWork,
  type LineResult,
  type LookTarget,
  type MoveWork,
  type PlanLine,
  type PutawayWork,
} from './logic';

/** Job code and name for a pallet, read from the live records. */
function useJobs(): (id: string) => Job | null {
  const { backend, v } = useApp();
  return useMemo(() => {
    const jobs = backend.reader.db.jobs;
    return (id: string) => jobs[id] ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backend, v, backend.network]);
}

export function useCodeOf(): (id: string | null) => string | null {
  const { backend, v } = useApp();
  return useMemo(() => {
    const locs = backend.reader.db.locations;
    return (id: string | null) => (id ? (locs[id]?.code ?? null) : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backend, v, backend.network]);
}

// ------------------------------------------------------------------ shared bits

const RESULT_LOOK: Record<LineResult['status'], { cls: string; icon: IconName; text: string }> = {
  pending: { cls: '', icon: 'clock', text: 'Not saved yet' },
  saving: { cls: 'accent', icon: 'sync', text: 'Saving' },
  saved: { cls: 'ok', icon: 'check', text: 'Saved' },
  queued: { cls: 'warn', icon: 'sync', text: 'Queued, not confirmed' },
  conflict: { cls: 'warn', icon: 'alert', text: 'Conflict' },
  failed: { cls: 'bad', icon: 'x', text: 'Not saved' },
  unknown: { cls: 'warn', icon: 'question', text: 'No answer yet' },
  blocked: { cls: 'bad', icon: 'lock', text: 'Cannot go here' },
  skipped: { cls: '', icon: 'chevronRight', text: 'Skipped' },
};

export function ResultTag({ r }: { r: LineResult }) {
  const look = RESULT_LOOK[r.status];
  return (
    <span className={`tag st-result ${look.cls}`}>
      {r.status === 'saving' ? <Spinner /> : <Icon name={look.icon} width={14} height={14} />}
      {look.text}
    </span>
  );
}

/** What went wrong on a line, in words, with the newer record on a conflict. */
function ResultDetail({ r, codeOf }: { r: LineResult; codeOf: (id: string | null) => string | null }) {
  if (r.status === 'conflict') {
    const cur = r.current;
    return (
      <div className="st-line-detail warn">
        Someone else changed it first. Nothing was saved.
        {cur && (
          <>
            {' '}
            Now: <StateBadge state={cur.state} /> {cur.state === 'STORED' ? `at ${codeOf(cur.current_location_id) ?? '?'}` : ''}, version {cur.version}.
          </>
        )}
      </div>
    );
  }
  if (r.status === 'failed') return <div className="st-line-detail bad">{r.message}</div>;
  if (r.status === 'unknown') return <div className="st-line-detail warn">{r.message} It may or may not be saved. Check the result before trying again.</div>;
  if (r.status === 'queued') return <div className="st-line-detail warn">Saved on this device only. It is sent when you reconnect.</div>;
  return null;
}

/** Keeps codes such as A-03-01 or P-000042 on one line instead of breaking at a hyphen. */
export function Codes({ text }: { text: string }) {
  const parts = text.split(/\b([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+)\b/);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 ? (
          <span key={i} className="st-nowrap">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}

function PalletHead({ p, job, size }: { p: Pallet; job: Job | null; size?: 'lg' }) {
  return (
    <div className={`st-phead ${size ?? ''}`}>
      <div className="st-phead-top">
        <span className="pcode">{p.code}</span>
        <StateBadge state={p.state} />
        {p.hold && <HoldBadge title={p.hold.reason} />}
      </div>
      <div className="st-phead-desc">{p.description}</div>
      {job && (
        <div className="st-phead-job">
          <span className="jcode">{job.code}</span> {job.name}
        </div>
      )}
    </div>
  );
}

/** A rack code set large, sized to the card so long codes like QUARANTINE-01 never overflow on a phone. */
function BigPlate({ loc, code }: { loc?: Location; code?: string }) {
  const text = loc?.code ?? code ?? '';
  return (
    <span className={`st-bigplate ${text.length > 8 ? 'long' : ''}`}>
      <Plate code={text} size="lg" kind={loc && loc.kind !== 'RACK' ? loc.kind.toLowerCase() : undefined} variant={loc ? undefined : 'none'} />
    </span>
  );
}

function Placeholder({ icon, children }: { icon: IconName; children: ReactNode }) {
  return (
    <div className="st-waiting">
      <Icon name={icon} />
      <span>{children}</span>
    </div>
  );
}

// ------------------------------------------------------------------ Look up

export function LookupView({
  target,
  canChange,
  onMove,
  onRack,
}: {
  target: LookTarget | null;
  canChange: boolean;
  onMove: (p: Pallet) => void;
  onRack: (mode: 'putaway' | 'count', loc: Location) => void;
}) {
  const { read, go, v } = useApp();
  const codeOf = useCodeOf();
  const jobOf = useJobs();
  const data = useMemo(
    () =>
      read((e, a, ws) => {
        if (!target || target.type === 'unknown') return null;
        if (target.type === 'pallet') return { kind: 'pallet' as const, d: e.pallet(a, ws, target.id) };
        const loc = e.db.locations[target.id];
        if (!loc || loc.workspace_id !== ws) return null;
        const pallets = Object.values(e.db.pallets)
          .filter((p) => p.workspace_id === ws && p.state === 'STORED' && p.current_location_id === loc.id)
          .sort((x, y) => x.code.localeCompare(y.code));
        return { kind: 'location' as const, loc, pallets };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [target, v],
  );

  if (!target) {
    return (
      <div className="panel st-work st-empty-work">
        <Placeholder icon="find">Nothing scanned yet. Scan a pallet label, a rack label, or type a code.</Placeholder>
      </div>
    );
  }
  if (target.type === 'unknown') {
    return (
      <div className="panel st-work st-look st-look-bad">
        <div className="eyebrow">Not recognized</div>
        <div className="st-bigcode mono">{target.raw}</div>
        <p className="st-look-line bad">{target.message}</p>
        <p className="muted">Check the label is from this warehouse, or type the printed code under the QR code.</p>
      </div>
    );
  }
  if (!data) return <div className="panel st-work">That record is not available.</div>;

  if (data.kind === 'pallet') {
    const { pallet: p, job, location } = data.d;
    return (
      <div className="panel st-work st-look" data-tour="station-card">
        <div className="st-look-main">
          <div className="eyebrow">Pallet</div>
          <div className="st-bigcode">{p.code}</div>
          <div className="row" style={{ gap: 8 }}>
            <StateBadge state={p.state} />
            {p.hold && <HoldBadge title={p.hold.reason} />}
          </div>
          <div className="st-look-desc">{p.description}</div>
          <div className="st-look-job">
            <span className="jcode">{job.code}</span> {job.name}
            {job.status === 'CLOSED' && <span className="tag">closed</span>}
          </div>
        </div>
        <div className="st-look-where">
          {p.state === 'STORED' && location ? <BigPlate loc={location} /> : <BigPlate code={p.state === 'RECEIVED' ? 'UNASSIGNED' : p.state === 'DISPATCHED' ? 'LEFT WH' : p.state} />}
          <p className="st-look-line">
            <Codes text={`${whereLine(p, codeOf)}.`} />
          </p>
        </div>
        {p.hold && (
          <Notice tone="warn" icon="hold" title="On hold">
            {p.hold.reason} Placed {agoLong(p.hold.applied_at)}.
          </Notice>
        )}
        <div className="row">
          {canChange && (p.state === 'RECEIVED' || p.state === 'STORED') && (
            <button className="btn primary" onClick={() => onMove(p)}>
              <Icon name="move" /> Move this pallet
            </button>
          )}
          <button className="btn" onClick={() => go({ name: 'pallet', id: p.id })}>
            <Icon name="history" /> Open record
          </button>
        </div>
      </div>
    );
  }

  const { loc, pallets } = data;
  return (
    <div className="panel st-work st-look" data-tour="station-card">
      <div className="st-work-head">
        <div className="st-look-main">
          <div className="eyebrow">{loc.kind === 'RACK' ? 'Rack' : loc.kind.toLowerCase()}</div>
          <BigPlate loc={loc} />
          {!loc.active && <span className="tag bad">inactive</span>}
        </div>
        <div className="st-look-count">
          <span className="st-count-num">{pallets.length}</span>
          <span>pallet{pallets.length === 1 ? '' : 's'} recorded here</span>
        </div>
      </div>
      {pallets.length === 0 ? (
        <p className="muted">Nothing is recorded here right now.</p>
      ) : (
        <ul className="st-lines">
          {pallets.map((p) => (
            <li key={p.id} className="st-line">
              <div className="st-line-main">
                <div className="st-line-head">
                  <span className="pcode">{p.code}</span>
                  <span className="st-line-desc">{p.description}</span>
                  {p.hold && <HoldBadge title={p.hold.reason} />}
                </div>
                <div className="st-line-meta">
                  <span className="jcode">{jobOf(p.job_id)?.code}</span> · last confirmed {agoLong(p.last_confirmed_at)}
                </div>
              </div>
              <div className="st-line-side">
                <button className="btn small ghost" onClick={() => go({ name: 'pallet', id: p.id })}>
                  Open
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="row">
        {canChange && loc.active && (
          <>
            <button className="btn primary" onClick={() => onRack('count', loc)}>
              <Icon name="checklist" /> Count this rack
            </button>
            <button className="btn" onClick={() => onRack('putaway', loc)}>
              <Icon name="stack" /> Put away here
            </button>
          </>
        )}
        <button className="btn ghost" onClick={() => go({ name: 'location', id: loc.id })}>
          Open rack page
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Move

export function MoveView({
  m,
  confirmByRescan,
  offline,
  onConfirm,
  onCancel,
  onRecover,
  onNext,
}: {
  m: MoveWork;
  confirmByRescan: boolean;
  offline: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onRecover: () => void;
  onNext: () => void;
}) {
  const { go } = useApp();
  const codeOf = useCodeOf();
  const jobOf = useJobs();
  const stage = m.phase === 'pallet' ? 0 : m.phase === 'rack' ? 1 : 2;
  const finished = m.phase === 'done' || m.phase === 'queued';
  const verb = m.intent === 'place' ? 'Place' : m.intent === 'verify_location' ? 'Confirm still here' : 'Move';
  const steps = ['Pallet', 'Rack', 'Confirm'];

  return (
    <div className="panel st-work" data-tour="station-card">
      <ol className="st-steps" aria-label="Move steps">
        {steps.map((label, i) => {
          const state = finished || i < stage ? 'done' : i === stage ? 'now' : '';
          return (
            <li key={label} className={state} aria-current={state === 'now' ? 'step' : undefined}>
              <span className="st-step-num">{state === 'done' ? <Icon name="check" width={16} height={16} /> : i + 1}</span>
              {label}
            </li>
          );
        })}
      </ol>
      <div className="st-move">
        <div className={`st-slot ${m.pallet ? 'filled' : ''}`}>
          <div className="eyebrow">Pallet</div>
          {m.pallet ? (
            <>
              <PalletHead p={m.pallet} job={jobOf(m.pallet.job_id)} />
              <div className="st-slot-now">
                Now:{' '}
                {m.pallet.state === 'STORED' ? (
                  <Plate code={codeOf(m.pallet.current_location_id) ?? '?'} size="sm" />
                ) : (
                  <Plate code={m.pallet.state === 'RECEIVED' ? 'UNASSIGNED' : m.pallet.state} size="sm" variant="none" />
                )}
              </div>
            </>
          ) : (
            <Placeholder icon="pallet">Waiting for a pallet scan</Placeholder>
          )}
        </div>
        <div className="st-move-arrow" aria-hidden="true">
          <Icon name="arrowRight" />
        </div>
        <div className={`st-slot ${m.rack ? 'filled' : ''}`}>
          <div className="eyebrow">Rack</div>
          {m.rack ? <BigPlate loc={m.rack} /> : <Placeholder icon="pin">{m.pallet ? 'Now scan the rack' : 'Scan the pallet first'}</Placeholder>}
        </div>
      </div>

      {m.intent === 'verify_location' && m.phase === 'confirm' && (
        <p className="muted" style={{ margin: 0 }}>
          It is already recorded here. Confirming adds a check and refreshes “last confirmed”. Nothing moves.
        </p>
      )}
      {m.note && !finished && <Notice tone={m.note.tone}>{m.note.text}</Notice>}

      {(m.phase === 'confirm' || m.phase === 'saving') && (
        <div className="row">
          <button className="btn primary big" onClick={onConfirm} disabled={m.phase === 'saving'} data-testid="st-confirm">
            {m.phase === 'saving' ? <Spinner /> : <Icon name={m.intent === 'verify_location' ? 'check' : 'move'} />}
            {m.phase === 'saving' ? 'Saving…' : offline ? `Queue: ${verb.toLowerCase()}` : `${verb}${m.intent === 'verify_location' ? '' : `: ${m.rack?.code}`}`}
            {m.phase === 'confirm' && <span className="kbd st-kbd">Enter</span>}
          </button>
          <button className="btn big" onClick={onCancel} disabled={m.phase === 'saving'}>
            Cancel
          </button>
        </div>
      )}
      {m.phase === 'confirm' && !confirmByRescan && (
        <p className="st-hint">Scanning the rack again does not confirm here: that is turned off in Scanner setup. Scan the Confirm barcode or press Enter.</p>
      )}
      {m.phase === 'rack' && (
        <div className="row">
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
        </div>
      )}
      {m.phase === 'unknown' && (
        <div className="row">
          <button className="btn primary big" onClick={onRecover}>
            <Icon name="sync" /> Check result
          </button>
        </div>
      )}
      {finished && m.pallet && (
        <div className={`big-result ${m.phase === 'queued' ? 'warn' : ''}`}>
          <div className="br-title">
            <Icon name={m.phase === 'queued' ? 'sync' : 'checkCircle'} />
            {m.phase === 'queued' ? 'Queued on this device, not confirmed' : m.note?.text}
          </div>
          <div className="muted">
            {m.pallet.code} · {m.pallet.description}
            {m.phase === 'queued' && ` · ${m.note?.text}`}
          </div>
          <div className="row">
            <button className="btn primary" onClick={onNext}>
              Next pallet
            </button>
            {m.phase === 'queued' ? (
              <button className="btn" onClick={() => go('sync')}>
                View queue
              </button>
            ) : (
              <button className="btn" onClick={() => go({ name: 'pallet', id: m.pallet!.id })}>
                Open record
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Put-away

export function PutawayView({
  p,
  onFinish,
  onSave,
  onCancel,
  onRemove,
  onReplan,
  onRecover,
}: {
  p: PutawayWork;
  onFinish: () => void;
  onSave: () => void;
  onCancel: () => void;
  onRemove: (key: string) => void;
  onReplan: (key: string) => void;
  onRecover: (key: string, commandId: string) => void;
}) {
  const codeOf = useCodeOf();
  const jobOf = useJobs();
  const sendable = p.lines.filter((l) => l.intent && isSendable(l.result)).length;
  const saved = p.lines.filter((l) => l.result.status === 'saved').length;
  const queued = p.lines.filter((l) => l.result.status === 'queued').length;
  const saving = p.phase === 'saving';

  return (
    <div className="panel st-work" data-tour="station-card">
      <div className="st-work-head">
        <div>
          <div className="eyebrow">Put-away to</div>
          {p.rack ? <BigPlate loc={p.rack} /> : <Placeholder icon="pin">Scan the rack first</Placeholder>}
        </div>
        {p.rack && (
          <div className="st-tally">
            <span className="st-count-num">{p.lines.length}</span>
            <span>pallet{p.lines.length === 1 ? '' : 's'} scanned</span>
            {saved > 0 && <span className="tag ok">{saved} saved</span>}
            {queued > 0 && <span className="tag warn">{queued} queued, not confirmed</span>}
          </div>
        )}
      </div>

      {p.rack && p.lines.length === 0 && <Placeholder icon="pallet">Now scan each pallet going onto {p.rack.code}.</Placeholder>}
      {p.lines.length > 0 && (
        <ol className="st-lines" aria-label="Pallets in this put-away">
          {p.lines.map((l, i) => (
            <PutLine key={l.key} n={i + 1} l={l} job={jobOf(l.pallet.job_id)} codeOf={codeOf} phase={p.phase} onRemove={onRemove} onReplan={onReplan} onRecover={onRecover} />
          ))}
        </ol>
      )}

      {p.rack && (
        <div className="row st-actions">
          {p.phase === 'scanning' && (
            <button className="btn primary big" onClick={onFinish} disabled={!p.lines.length}>
              <Icon name="checklist" /> Finish and review
            </button>
          )}
          {(p.phase === 'review' || saving || (p.phase === 'done' && sendable > 0)) && (
            <button className="btn primary big" onClick={onSave} disabled={saving || !sendable} data-testid="st-save-all">
              {saving ? <Spinner /> : <Icon name="check" />}
              {saving ? 'Saving…' : p.phase === 'done' ? `Try ${sendable} again` : `Save all ${sendable}`}
              {!saving && <span className="kbd st-kbd">Enter</span>}
            </button>
          )}
          {!saving && (
            <button className="btn big" onClick={onCancel}>
              {p.phase === 'review' ? 'Back to scanning' : p.phase === 'done' ? 'New put-away' : 'Cancel'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function PutLine({
  n,
  l,
  job,
  codeOf,
  phase,
  onRemove,
  onReplan,
  onRecover,
}: {
  n: number;
  l: PlanLine;
  job: Job | null;
  codeOf: (id: string | null) => string | null;
  phase: PutawayWork['phase'];
  onRemove: (key: string) => void;
  onReplan: (key: string) => void;
  onRecover: (key: string, commandId: string) => void;
}) {
  const r = l.result;
  const editable = (phase === 'scanning' || phase === 'review') && (r.status === 'pending' || r.status === 'blocked');
  return (
    <li className={`st-line ${r.status}`}>
      <span className="st-line-n">{n}</span>
      <div className="st-line-main">
        <div className="st-line-head">
          <span className="pcode">{l.pallet.code}</span>
          <span className="st-line-desc">{l.pallet.description}</span>
          {l.pallet.hold && <HoldBadge title={l.pallet.hold.reason} />}
        </div>
        <div className="st-line-meta">
          {job && <span className="jcode">{job.code}</span>}
          <span className={`st-what ${l.intent ?? 'none'}`}>{l.what}</span>
        </div>
        {l.detail && r.status !== 'blocked' && <div className="st-line-detail">{l.detail}</div>}
        {r.status === 'blocked' && <div className="st-line-detail bad">{r.message}</div>}
        <ResultDetail r={r} codeOf={codeOf} />
      </div>
      <div className="st-line-side">
        {r.status !== 'blocked' && <ResultTag r={r} />}
        {editable && (
          <button className="btn small ghost" onClick={() => onRemove(l.key)} aria-label={`Remove ${l.pallet.code} from the list`}>
            <Icon name="x" /> Remove
          </button>
        )}
        {r.status === 'conflict' && r.current && phase === 'done' && (
          <button className="btn small" onClick={() => onReplan(l.key)}>
            Decide again
          </button>
        )}
        {r.status === 'unknown' && phase === 'done' && (
          <button className="btn small" onClick={() => onRecover(l.key, r.commandId)}>
            Check result
          </button>
        )}
      </div>
    </li>
  );
}

// ------------------------------------------------------------------ Count

export function CountView({
  c,
  onFinish,
  onConfirmAll,
  onCancel,
  onFix,
  onAskReason,
  onSkip,
  onRecover,
}: {
  c: CountWork;
  onFinish: () => void;
  onConfirmAll: () => void;
  onCancel: () => void;
  onFix: (list: CountList, row: CountRow) => void;
  onAskReason: (list: CountList, row: CountRow) => void;
  onSkip: (key: string) => void;
  onRecover: (list: CountList, key: string, commandId: string) => void;
}) {
  const { role } = useApp();
  const codeOf = useCodeOf();
  const jobOf = useJobs();
  const rack = c.rack;
  const recorded = useMemo(() => new Set(c.scanned.filter((p) => p.state === 'STORED' && p.current_location_id === rack?.id).map((p) => p.id)), [c.scanned, rack]);

  const head = (
    <div className="st-work-head">
      <div>
        <div className="eyebrow">Counting</div>
        {rack ? <BigPlate loc={rack} /> : <Placeholder icon="pin">Scan the rack to count</Placeholder>}
      </div>
      {rack && c.phase === 'scanning' && (
        <div className="st-tally">
          <span className="st-count-num">{c.scanned.length + c.unknown.length}</span>
          <span>scanned</span>
        </div>
      )}
    </div>
  );

  if (c.phase !== 'review' || !c.report) {
    return (
      <div className="panel st-work" data-tour="station-card">
        {head}
        {rack && c.scanned.length === 0 && c.unknown.length === 0 && (
          <Placeholder icon="pallet">Scan every pallet physically on {rack.code}. The records are compared when you finish, not before, so the count stays honest.</Placeholder>
        )}
        {(c.scanned.length > 0 || c.unknown.length > 0) && (
          <ol className="st-lines" aria-label="Scanned so far">
            {c.scanned.map((p, i) => (
              <li key={p.id} className="st-line">
                <span className="st-line-n">{i + 1}</span>
                <div className="st-line-main">
                  <div className="st-line-head">
                    <span className="pcode">{p.code}</span>
                    <span className="st-line-desc">{p.description}</span>
                  </div>
                  <div className="st-line-meta">
                    <span className="jcode">{jobOf(p.job_id)?.code}</span>
                  </div>
                </div>
                <div className="st-line-side">
                  {recorded.has(p.id) ? (
                    <span className="tag ok">
                      <Icon name="check" width={14} height={14} /> On record here
                    </span>
                  ) : (
                    <span className="tag warn">
                      <Icon name="alert" width={14} height={14} />{' '}
                      {p.state === 'STORED' ? `Recorded at ${codeOf(p.current_location_id)}` : p.state === 'RECEIVED' ? 'Not placed' : p.state.toLowerCase()}
                    </span>
                  )}
                </div>
              </li>
            ))}
            {c.unknown.map((u) => (
              <li key={u.raw} className="st-line">
                <span className="st-line-n">?</span>
                <div className="st-line-main">
                  <div className="st-line-head">
                    <span className="mono st-raw">{u.raw}</span>
                  </div>
                  <div className="st-line-detail bad">{u.message}</div>
                </div>
                <div className="st-line-side">
                  <span className="tag bad">
                    <Icon name="question" width={14} height={14} /> Unknown
                  </span>
                </div>
              </li>
            ))}
          </ol>
        )}
        {rack && (
          <div className="row st-actions">
            <button className="btn primary big" onClick={onFinish}>
              <Icon name="checklist" /> Finish and compare
            </button>
            <button className="btn big" onClick={onCancel}>
              Cancel
            </button>
          </div>
        )}
      </div>
    );
  }

  const r = c.report;
  const todo = r.matched.filter((x) => isSendable(x.result)).length;
  const touched = [...r.matched, ...r.missing, ...r.unexpected].some((x) => x.result.status !== 'pending');
  const supervisor = canMarkMissing(role);

  return (
    <div className="panel st-work" data-tour="station-card">
      {head}
      <div className="st-summary" aria-label={`Count summary: ${countSummary(r)}`}>
        <SummaryTile n={r.matched.length} label="Matched" tone="ok" icon="checkCircle" />
        <SummaryTile n={r.missing.length} label="Missing from the scan" tone="bad" icon="question" />
        <SummaryTile n={r.unexpected.length} label="Unexpected" tone="warn" icon="alert" />
        <SummaryTile n={r.unknown.length} label="Unknown codes" tone="" icon="x" />
      </div>

      <CountSection title="Matched" icon="checkCircle" tone="ok" empty="Nothing on record here was scanned." rows={r.matched.length}>
        {r.matched.length > 0 && (
          <div className="row">
            <button className="btn primary big" onClick={onConfirmAll} disabled={!todo || c.busy} data-testid="st-confirm-all">
              {c.busy ? <Spinner /> : <Icon name="check" />}
              {todo ? `Confirm all ${todo}` : 'All confirmed'}
              {todo > 0 && !c.busy && <span className="kbd st-kbd">Enter</span>}
            </button>
            <span className="muted st-section-note">Records a location check for each, so “last confirmed” shows today.</span>
          </div>
        )}
        <ol className="st-lines">
          {r.matched.map((row) => (
            <CountLine key={row.key} row={row} job={jobOf(row.pallet.job_id)} codeOf={codeOf} list="matched" onRecover={onRecover} />
          ))}
        </ol>
      </CountSection>

      <CountSection title="Missing from the scan" icon="question" tone="bad" empty="Everything on record here was scanned." rows={r.missing.length}>
        {r.missing.length > 0 && (
          <p className="muted st-section-note">
            On record here, but not scanned. Look again first: a pallet can hide behind another.{' '}
            {supervisor ? 'If it is really gone, mark it missing with a reason.' : 'Viewers cannot mark a pallet missing, so tell an operator or supervisor, or skip it for now.'}
          </p>
        )}
        <ol className="st-lines">
          {r.missing.map((row) => (
            <CountLine
              key={row.key}
              row={row}
              job={jobOf(row.pallet.job_id)}
              codeOf={codeOf}
              list="missing"
              onRecover={onRecover}
              actions={
                row.result.status === 'pending' && (
                  <>
                    {supervisor && (
                      <button className="btn small danger" onClick={() => onAskReason('missing', row)} disabled={c.busy}>
                        Mark missing
                      </button>
                    )}
                    <button className="btn small" onClick={() => onSkip(row.key)} disabled={c.busy}>
                      Skip
                    </button>
                  </>
                )
              }
            />
          ))}
        </ol>
      </CountSection>

      <CountSection title="Unexpected" icon="alert" tone="warn" empty="Nothing scanned was recorded somewhere else." rows={r.unexpected.length}>
        {r.unexpected.length > 0 && <p className="muted st-section-note">Scanned here, but the records say otherwise. Fix the record if the pallet really is on {rack?.code}.</p>}
        <ol className="st-lines">
          {r.unexpected.map((row) => (
            <CountLine
              key={row.key}
              row={row}
              job={jobOf(row.pallet.job_id)}
              codeOf={codeOf}
              list="unexpected"
              onRecover={onRecover}
              actions={isSendable(row.result) && row.fix && <UnexpectedAction row={row} busy={c.busy} rackCode={rack?.code ?? ''} onFix={onFix} onAskReason={onAskReason} />}
            />
          ))}
        </ol>
      </CountSection>

      {r.unknown.length > 0 && (
        <CountSection title="Unknown codes" icon="x" tone="" empty="" rows={r.unknown.length}>
          <ul className="st-lines">
            {r.unknown.map((u) => (
              <li key={u.raw} className="st-line">
                <div className="st-line-main">
                  <div className="st-line-head">
                    <span className="mono st-raw">{u.raw}</span>
                  </div>
                  <div className="st-line-detail">{u.message}</div>
                </div>
              </li>
            ))}
          </ul>
        </CountSection>
      )}

      <div className="row st-actions">
        <button className="btn big" onClick={onCancel} disabled={c.busy}>
          {touched ? 'New count' : 'Back to scanning'}
        </button>
      </div>
    </div>
  );
}

function SummaryTile({ n, label, tone, icon }: { n: number; label: string; tone: string; icon: IconName }) {
  return (
    <div className={`st-sum ${n ? tone : 'zero'}`}>
      <span className="st-sum-n">{n}</span>
      <span className="st-sum-label">
        <Icon name={icon} width={15} height={15} /> {label}
      </span>
    </div>
  );
}

function CountSection({ title, icon, tone, empty, rows, children }: { title: string; icon: IconName; tone: string; empty: string; rows: number; children: ReactNode }) {
  return (
    <section className={`st-section ${tone}`}>
      <h3 className="st-section-title">
        <Icon name={icon} /> {title} <span className="st-section-n">{rows}</span>
      </h3>
      {rows === 0 ? <p className="muted st-section-note">{empty}</p> : children}
    </section>
  );
}

function UnexpectedAction({
  row,
  busy,
  rackCode,
  onFix,
  onAskReason,
}: {
  row: CountRow;
  busy: boolean;
  rackCode: string;
  onFix: (list: CountList, row: CountRow) => void;
  onAskReason: (list: CountList, row: CountRow) => void;
}) {
  const { role } = useApp();
  if (row.fix === 'locate') {
    if (!canRecordFound(role)) return <span className="muted st-small">A supervisor records it as found.</span>;
    return (
      <button className="btn small" onClick={() => onAskReason('unexpected', row)} disabled={busy}>
        Record found here
      </button>
    );
  }
  return (
    <button className="btn small primary" onClick={() => onFix('unexpected', row)} disabled={busy} aria-label={`${row.fix === 'place' ? 'Place' : 'Move'} ${row.pallet.code} to ${rackCode}`}>
      <Icon name="move" /> {row.fix === 'place' ? 'Place here' : 'Move here'}
    </button>
  );
}

function CountLine({
  row,
  job,
  codeOf,
  list,
  actions,
  onRecover,
}: {
  row: CountRow;
  job: Job | null;
  codeOf: (id: string | null) => string | null;
  list: CountList;
  actions?: ReactNode;
  onRecover: (list: CountList, key: string, commandId: string) => void;
}) {
  const r = row.result;
  return (
    <li className={`st-line ${r.status}`}>
      <div className="st-line-main">
        <div className="st-line-head">
          <span className="pcode">{row.pallet.code}</span>
          <span className="st-line-desc">{row.pallet.description}</span>
          {row.pallet.hold && <HoldBadge title={row.pallet.hold.reason} />}
        </div>
        <div className="st-line-meta">
          {job && <span className="jcode">{job.code}</span>}
          <span>{row.note}</span>
        </div>
        {r.status === 'saved' && <div className="st-line-detail ok">{resultText(r, row.fix)}</div>}
        <ResultDetail r={r} codeOf={codeOf} />
      </div>
      <div className="st-line-side">
        {r.status !== 'pending' && <ResultTag r={r} />}
        {actions}
        {r.status === 'unknown' && (
          <button className="btn small" onClick={() => onRecover(list, row.key, r.commandId)}>
            Check result
          </button>
        )}
      </div>
    </li>
  );
}

// ------------------------------------------------------------------ reason sheet (mark missing, record found)

export function ReasonSheet({
  title,
  intro,
  verb,
  danger,
  initial,
  onSave,
  onClose,
}: {
  title: string;
  intro: ReactNode;
  verb: string;
  danger?: boolean;
  initial: string;
  onSave: (reason: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState(initial);
  const ok = reason.trim().length > 0 && reason.length <= 500;
  return (
    <Sheet title={title} onClose={onClose}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (ok) onSave(reason.trim());
        }}
      >
        <p style={{ margin: 0 }}>{intro}</p>
        <Field label="Reason" htmlFor="st-reason" hint="Kept in the pallet’s history for everyone to see." count={reason.length} max={500}>
          <textarea id="st-reason" className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} style={{ minHeight: 80 }} />
        </Field>
        <div className="row">
          <button className={`btn big ${danger ? 'danger' : 'primary'}`} type="submit" disabled={!ok}>
            {verb}
          </button>
          <button className="btn big" type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Sheet>
  );
}
