// Flag issue: anyone on the floor reports damage, missing items or a wrong delivery, with photos and a note.
// Managers see every report, with who sent it, in the Issues folder on the People page.

import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../app/state';
import { FirebaseBackend } from '../../data/firebase';
import { PhotoImage } from '../../data/LiveView';
import { preparePhoto, type PreparedPhoto } from '../../device/photos';
import { uuid } from '../../domain/codes';
import { roleAllows } from '../../domain/transitions';
import type { Issue, IssueKind, IssueStatus, Pallet } from '../../domain/types';
import { Icon } from '../../ui/icons';
import { Field, Notice, Sheet, Spinner, fmtAgo, fmtFull } from '../../ui/ui';

export const ISSUE_LABEL: Record<IssueKind, string> = { DAMAGED: 'Damaged', MISSING: 'Missing items', WRONG: 'Wrong item', OTHER: 'Something else' };
const STATUS_LABEL: Record<IssueStatus, string> = { NEW: 'New', APPROVED: 'Approved', FILED: 'Filed', DISMISSED: 'Dismissed' };
const MAX_PHOTOS = 3;
export const codeList = (codes: string[]) => (codes.length <= 2 ? codes.join(' and ') : `${codes.slice(0, -1).join(', ')} and ${codes.at(-1)}`);

export function IssueSheet({ pallets, onClose, onReported }: { pallets: Pallet[]; onClose: () => void; onReported?: () => void }) {
  const { send, backend } = useApp();
  const [kind, setKind] = useState<IssueKind>('DAMAGED');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<(PreparedPhoto & { name: string })[]>([]);
  const [phase, setPhase] = useState<'form' | 'confirm' | 'sending' | 'done'>('form');
  const [step, setStep] = useState('');
  const [error, setError] = useState('');
  const [photoNote, setPhotoNote] = useState('');
  const codes = pallets.map((p) => p.code);

  const addPhotos = async (files: FileList | null) => {
    setError('');
    for (const f of [...(files ?? [])].slice(0, MAX_PHOTOS - photos.length)) {
      try {
        const ph = await preparePhoto(f);
        setPhotos((list) => (list.length >= MAX_PHOTOS ? list : [...list, { ...ph, name: f.name }]));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'That photo could not be read.');
      }
    }
  };

  const submit = async () => {
    setPhase('sending');
    setError('');
    setPhotoNote('');
    // Photos are saved as pallet photos (so they also show on the pallet), then the issue points at them.
    const attachmentIds: string[] = [];
    let skipped = 0;
    for (const [i, ph] of photos.entries()) {
      setStep(`Uploading photo ${i + 1} of ${photos.length}…`);
      let saved = false;
      for (const p of pallets) {
        const id = uuid();
        const current = backend.db.pallets[p.id] ?? p;
        const o = await send('add_photo', { attachment_id: id, data_url: ph.data_url, thumb_url: ph.thumb_url, media_type: ph.media_type, bytes: ph.bytes }, current, { commandId: uuid() });
        if (o.status === 'result' && o.result.ok) {
          attachmentIds.push(id);
          saved = true;
          break;
        }
        // A pallet that already has three photos can't take another; try the next pallet on the report.
        if (!(o.status === 'result' && !o.result.ok && o.result.code === 'INVALID_INPUT')) break;
      }
      if (!saved) skipped++;
    }
    setStep('Sending the report…');
    const o = await send('report_issue', { issue_kind: kind, description: description.trim(), pallet_ids: pallets.map((p) => p.id), attachment_ids: attachmentIds }, null, { commandId: uuid() });
    if (o.status === 'result' && o.result.ok) {
      if (skipped) setPhotoNote(`${skipped} photo${skipped === 1 ? '' : 's'} could not be attached, because ${pallets.length === 1 ? 'this pallet already has' : 'these pallets already have'} three photos each.`);
      setPhase('done');
      onReported?.();
    } else {
      setError(o.status === 'result' ? (o.result.ok ? '' : o.result.message) : o.status === 'unknown' ? 'No answer from the server. Check with a manager before sending it again.' : o.status === 'offline' ? o.message : 'Not sent.');
      setPhase('confirm');
    }
  };

  return (
    <Sheet title={phase === 'done' ? 'Issue sent' : `Flag an issue with ${codes.length === 1 ? codes[0] : `${codes.length} pallets`}`} onClose={phase === 'sending' ? () => {} : onClose}>
      {phase === 'form' && (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (description.trim()) setPhase('confirm');
          }}
        >
          <div className="seg" role="group" aria-label="What's wrong">
            {(Object.keys(ISSUE_LABEL) as IssueKind[]).map((k) => (
              <button type="button" key={k} aria-pressed={kind === k} onClick={() => setKind(k)}>
                {ISSUE_LABEL[k]}
              </button>
            ))}
          </div>
          <Field label="What happened?" htmlFor="issue-desc" count={description.length} max={2000}>
            <textarea id="issue-desc" className="input" rows={4} value={description} maxLength={2000} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Forklift punctured two bags. About 10 bundles unsellable." autoFocus />
          </Field>
          <Field label={`Photos (optional, up to ${MAX_PHOTOS})`} htmlFor="issue-photos" hint="Take them with your camera or choose from your phone. They are saved on the pallet too.">
            <input id="issue-photos" type="file" accept="image/*" multiple disabled={photos.length >= MAX_PHOTOS} onChange={(e) => void addPhotos(e.target.files)} />
          </Field>
          {photos.length > 0 && (
            <div className="issue-photos">
              {photos.map((ph, i) => (
                <span key={i} className="issue-thumb">
                  <img src={ph.thumb_url} alt={`Photo ${i + 1}`} />
                  <button type="button" className="btn small ghost" aria-label={`Remove photo ${i + 1}`} onClick={() => setPhotos((list) => list.filter((_, j) => j !== i))}>
                    <Icon name="x" />
                  </button>
                </span>
              ))}
            </div>
          )}
          {error && <Notice tone="error">{error}</Notice>}
          <button className="btn primary big" disabled={!description.trim()}>
            <Icon name="flag" /> Review and send
          </button>
        </form>
      )}
      {(phase === 'confirm' || phase === 'sending') && (
        <div className="stack">
          <p style={{ margin: 0 }}>
            <strong>Are you sure?</strong> This sends the report to your managers.
          </p>
          <dl className="kv">
            <dt>Issue</dt>
            <dd>{ISSUE_LABEL[kind]}</dd>
            <dt>Pallets</dt>
            <dd className="mono">{codeList(codes)}</dd>
            <dt>Note</dt>
            <dd style={{ whiteSpace: 'pre-wrap' }}>{description.trim()}</dd>
            <dt>Photos</dt>
            <dd>{photos.length || 'None'}</dd>
          </dl>
          {error && <Notice tone="error" title="Not sent">{error}</Notice>}
          {phase === 'sending' ? (
            <div className="row" role="status">
              <Spinner /> {step}
            </div>
          ) : (
            <div className="row">
              <button className="btn primary big" onClick={() => void submit()}>
                <Icon name="send" /> Yes, send to managers
              </button>
              <button className="btn" onClick={() => setPhase('form')}>
                Go back
              </button>
            </div>
          )}
        </div>
      )}
      {phase === 'done' && (
        <div className="stack">
          <Notice tone="ok" title="Sent to your managers">
            {ISSUE_LABEL[kind]}: {codeList(codes)}. They'll see it in Issues on the People page, with your name on it.
          </Notice>
          {photoNote && <Notice tone="warn">{photoNote}</Notice>}
          <button className="btn primary" onClick={onClose} autoFocus>
            Done
          </button>
        </div>
      )}
    </Sheet>
  );
}

type Folder = 'NEW' | 'APPROVED' | 'FILED' | 'ALL';

/** The Issues folder on the People page. */
export function IssuesPanel() {
  const { backend, workspaceId, role, v } = useApp();
  const [folder, setFolder] = useState<Folder>('NEW');
  const [open, setOpen] = useState<string | null>(null);
  const issues = useMemo(
    () => Object.values(backend.db.issues ?? {}).filter((i) => i.workspace_id === workspaceId).sort((a, b) => b.created_at.localeCompare(a.created_at)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [v, workspaceId],
  );
  if (!roleAllows(role, 'update_issue')) return null;
  const count = (f: Folder) => issues.filter((i) => (f === 'ALL' ? true : f === 'FILED' ? i.status === 'FILED' || i.status === 'DISMISSED' : i.status === f)).length;
  const shown = issues.filter((i) => (folder === 'ALL' ? true : folder === 'FILED' ? i.status === 'FILED' || i.status === 'DISMISSED' : i.status === folder));
  const current = open ? backend.db.issues[open] : undefined;
  return (
    <div className="panel stack" data-testid="issues-panel">
      <div className="panel-title">
        <Icon name="flag" width={16} height={16} /> Issues
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
        Problems your team flagged on the floor. Approve the ones you accept, and mark them filed once they're handled (a claim sent, a credit logged).
      </p>
      <div className="seg" role="group" aria-label="Issue folder">
        {(['NEW', 'APPROVED', 'FILED', 'ALL'] as Folder[]).map((f) => (
          <button key={f} aria-pressed={folder === f} onClick={() => setFolder(f)}>
            {f === 'NEW' ? 'New' : f === 'APPROVED' ? 'Approved' : f === 'FILED' ? 'Filed' : 'All'} · {count(f)}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>
          {folder === 'NEW' ? 'No new issues. Anyone can flag one from a pallet, or by selecting pallets on Find, Move or Needs attention.' : 'Nothing here.'}
        </p>
      ) : (
        <div className="stack" style={{ gap: 6 }}>
          {shown.map((i) => (
            <button key={i.id} className="import-row" onClick={() => setOpen(i.id)}>
              <span className={`tag ${i.status === 'NEW' ? 'warn' : i.status === 'FILED' ? 'ok' : ''}`}>{STATUS_LABEL[i.status]}</span>
              <span className="grow">
                <strong>{ISSUE_LABEL[i.kind]}</strong> <span className="mono">{codeList(i.pallet_codes)}</span>
                <span className="muted"> · {i.description.length > 80 ? `${i.description.slice(0, 80)}…` : i.description}</span>
              </span>
              <span className="muted">
                {i.reporter_name || 'Someone'} · {fmtAgo(i.created_at)}
              </span>
              <Icon name="chevronRight" />
            </button>
          ))}
        </div>
      )}
      {current && <IssueDetail issue={current} onClose={() => setOpen(null)} />}
    </div>
  );
}

function IssueDetail({ issue, onClose }: { issue: Issue; onClose: () => void }) {
  const { backend, send, go } = useApp();
  const [note, setNote] = useState(issue.review_note ?? '');
  const [busy, setBusy] = useState<IssueStatus | null>(null);
  const [confirm, setConfirm] = useState<IssueStatus | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  useEffect(() => {
    if (backend instanceof FirebaseBackend && issue.attachment_ids.length) void backend.loadAttachments(issue.attachment_ids).catch(() => {});
  }, [backend, issue.id, issue.attachment_ids]);
  const act = async (status: IssueStatus) => {
    setBusy(status);
    setMessage(null);
    const o = await send('update_issue', { issue_id: issue.id, status, note: note.trim() }, null, { commandId: uuid() });
    setBusy(null);
    setConfirm(null);
    if (o.status === 'result' && o.result.ok) setMessage({ tone: 'ok', text: status === 'APPROVED' ? 'Approved.' : status === 'FILED' ? 'Marked as filed.' : status === 'DISMISSED' ? 'Dismissed.' : 'Moved back to New.' });
    else setMessage({ tone: 'error', text: o.status === 'result' && !o.result.ok ? o.result.message : o.status === 'offline' ? o.message : 'No answer from the server. Reopen the issue to check.' });
  };
  const VERB: Partial<Record<IssueStatus, string>> = { APPROVED: 'Approve', FILED: 'Mark as filed', DISMISSED: 'Dismiss', NEW: 'Move back to New' };
  const next: IssueStatus[] = issue.status === 'NEW' ? ['APPROVED', 'FILED', 'DISMISSED'] : issue.status === 'APPROVED' ? ['FILED', 'DISMISSED'] : ['NEW'];
  return (
    <Sheet title={`${ISSUE_LABEL[issue.kind]}: ${codeList(issue.pallet_codes)}`} onClose={onClose}>
      <div className="stack">
        <dl className="kv">
          <dt>Status</dt>
          <dd>
            {STATUS_LABEL[issue.status]}
            {issue.reviewed_at && ` by ${issue.reviewer_name || 'a manager'}, ${fmtFull(issue.reviewed_at)}`}
          </dd>
          <dt>Reported by</dt>
          <dd>
            <strong>{issue.reporter_name || 'Someone'}</strong>, {fmtFull(issue.created_at)} ({fmtAgo(issue.created_at)})
          </dd>
          <dt>Pallets</dt>
          <dd>
            {issue.pallet_ids.map((id, i) => (
              <button key={id} className="link mono" style={{ marginRight: 10 }} onClick={() => go({ name: 'pallet', id })}>
                {issue.pallet_codes[i] ?? id}
              </button>
            ))}
          </dd>
          <dt>What happened</dt>
          <dd style={{ whiteSpace: 'pre-wrap' }}>{issue.description}</dd>
        </dl>
        {issue.attachment_ids.length > 0 && (
          <div className="issue-photos">
            {issue.attachment_ids.map((id, i) => (
              <span key={id} className="issue-thumb">
                <PhotoImage id={id} alt={`Issue photo ${i + 1}`} />
              </span>
            ))}
          </div>
        )}
        <Field label="Manager note (optional)" htmlFor="issue-note" hint="e.g. Claim #4471 sent to the carrier.">
          <input id="issue-note" className="input" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {message && <Notice tone={message.tone}>{message.text}</Notice>}
        {confirm ? (
          <div className="stack" style={{ gap: 8 }}>
            <p style={{ margin: 0 }}>
              <strong>Are you sure?</strong> {VERB[confirm]} this issue{confirm === 'DISMISSED' ? '. It moves to Filed as dismissed.' : '.'}
            </p>
            <div className="row">
              <button className={`btn ${confirm === 'DISMISSED' ? 'danger' : 'primary'}`} onClick={() => void act(confirm)} disabled={!!busy}>
                {busy ? <Spinner /> : <Icon name="check" />} Yes, {VERB[confirm]!.toLowerCase()}
              </button>
              <button className="btn" onClick={() => setConfirm(null)} disabled={!!busy}>
                Go back
              </button>
            </div>
          </div>
        ) : (
          <div className="row" style={{ flexWrap: 'wrap' }}>
            {next.map((s, i) => (
              <button key={s} className={`btn ${i === 0 ? 'primary' : ''}`} onClick={() => setConfirm(s)}>
                {VERB[s]}
              </button>
            ))}
          </div>
        )}
      </div>
    </Sheet>
  );
}
