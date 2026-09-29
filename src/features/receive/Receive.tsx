// Receive: give a pallet an identity (blueprint page 11).

import { useEffect, useMemo, useState } from 'react';
import { uuid } from '../../domain/codes';
import { roleAllows } from '../../domain/transitions';
import type { Pallet } from '../../domain/types';
import { preparePhoto, formatBytes, type PreparedPhoto } from '../../device/photos';
import { useApp } from '../../app/state';
import { CommandFeedback } from '../../ui/CommandFeedback';
import { Icon } from '../../ui/icons';
import { useCommand } from '../../ui/useCommand';
import { Explain, Field, Notice, PageHead, PermissionDenied, Spinner } from '../../ui/ui';
import { LabelSheet } from '../labels/LabelSheet';

export function Receive() {
  const { read, role, go, setLeaveGuard, toast, backend, prefs } = useApp();
  const jobs = read((e, _a, ws) => Object.values(e.db.jobs).filter((j) => j.workspace_id === ws)) ?? [];
  const openJobs = jobs.filter((j) => j.status === 'OPEN').sort((a, b) => a.code.localeCompare(b.code));
  const [jobId, setJobId] = useState('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [supplier, setSupplier] = useState('');
  const [photo, setPhoto] = useState<PreparedPhoto | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [failPhoto, setFailPhoto] = useState(false);
  const [touched, setTouched] = useState(false);
  const [created, setCreated] = useState<Pallet | null>(null);
  const [photoState, setPhotoState] = useState<'none' | 'uploading' | 'done' | 'failed'>('none');
  const [labelIds, setLabelIds] = useState<string[]>([]);
  const [sessionIds, setSessionIds] = useState<string[]>([]);
  const cmd = useCommand();
  const photoCmd = useCommand();

  const dirty = !created && (description.trim() !== '' || notes.trim() !== '' || supplier.trim() !== '' || !!photo);
  useEffect(() => {
    setLeaveGuard(dirty ? 'You have an unsaved receipt. Leave and discard it?' : null);
    return () => setLeaveGuard(null);
  }, [dirty, setLeaveGuard]);

  const job = openJobs.find((j) => j.id === jobId) ?? null;
  const descErr = touched && !description.trim() ? 'Description is required.' : description.length > 160 ? 'Keep it to 160 characters.' : null;
  const jobErr = touched && !jobId ? 'Choose the job this material belongs to.' : null;

  const recentDescs = useMemo(() => {
    const all = read((e, _a, ws) => Object.values(e.db.pallets).filter((p) => p.workspace_id === ws && p.job_id === jobId)) ?? [];
    return [...new Set(all.map((p) => p.description))].slice(0, 6);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, backend.version]);

  if (!roleAllows(role, 'receive')) {
    return (
      <div className="stack">
        <PageHead eyebrow="Warehouse" title="Receive" />
        <PermissionDenied what="Receiving pallets" need="Operator" />
      </div>
    );
  }

  const uploadPhoto = async (p: Pallet, ph: PreparedPhoto) => {
    setPhotoState('uploading');
    if (failPhoto) {
      await new Promise((r) => setTimeout(r, 500));
      setPhotoState('failed');
      return;
    }
    const r = await photoCmd.run('add_photo', { attachment_id: uuid(), data_url: ph.data_url, thumb_url: ph.thumb_url, media_type: ph.media_type, bytes: ph.bytes }, backend.db.pallets[p.id] ?? p);
    setPhotoState(r.phase === 'done' ? 'done' : 'failed');
  };

  const submit = async () => {
    setTouched(true);
    if (!jobId || !description.trim() || description.length > 160 || notes.length > 1000) return;
    const r = await cmd.run('receive', { job_id: jobId, description, notes: notes || undefined, supplier_ref: supplier || undefined });
    if (r.phase === 'done' && r.accepted?.current_state) {
      const p = r.accepted.current_state;
      setCreated(p);
      setSessionIds(ids => [...new Set([...ids, p.id])]);
      setLeaveGuard(null);
      if (photo) void uploadPhoto(p, photo);
    }
  };

  const recover = async () => {
    const r = await cmd.recover();
    if (r.phase === 'done' && r.accepted?.current_state) {
      setCreated(r.accepted.current_state);
      setSessionIds(ids => [...new Set([...ids, r.accepted!.current_state!.id])]);
      toast(`Recovered: ${r.accepted.current_state.code} was already saved. No duplicate was created.`, 'info');
      if (photo) void uploadPhoto(r.accepted.current_state, photo);
    }
  };

  const another = (sameContents = false) => {
    setCreated(null);
    if (!sameContents) { setDescription(''); setSupplier(''); }
    setNotes('');
    setPhoto(null);
    setPhotoState('none');
    setTouched(false);
    cmd.reset();
    photoCmd.reset();
  };

  const onPhoto = async (file?: File) => {
    if (!file) return;
    setPhotoError(null);
    setPhotoBusy(true);
    try {
      setPhoto(await preparePhoto(file));
    } catch (e) {
      setPhotoError((e as Error).message);
    } finally {
      setPhotoBusy(false);
    }
  };

  if (created) {
    const live = backend.db.pallets[created.id] ?? created;
    return (
      <div className="stack">
        <PageHead eyebrow="Receive" title="Pallet saved" />
        <div className="big-result">
          <div className="br-title">
            <Icon name="checkCircle" />
            <span>
              <span className="pcode" style={{ fontSize: 30 }}>
                {live.code}
              </span>{' '}
              created · awaiting placement
            </span>
          </div>
          <div>
            <strong>{live.description}</strong> for <span className="jcode">{job?.code}</span> {job?.name}
          </div>
          <div className="muted">
            This is a new pallet with its own code. Print and attach its label before placement.
            {cmd.state.accepted?.replayed && ' Recovered from the saved receipt.'}
          </div>
          {photo && (
            <div className="row">
              {photoState === 'uploading' && (
                <span className="row nowrap muted">
                  <Spinner /> Uploading photo… (the pallet is already saved)
                </span>
              )}
              {photoState === 'done' && (
                <span className="tag ok">
                  <Icon name="check" width={12} height={12} /> Photo attached
                </span>
              )}
              {photoState === 'failed' && (
                <Notice
                  tone="warn"
                  title="Photo not uploaded"
                  actions={
                    <button
                      className="btn small"
                      onClick={() => {
                        setFailPhoto(false);
                        void uploadPhoto(live, photo);
                      }}
                    >
                      Retry photo
                    </button>
                  }
                >
                  The pallet {live.code} is saved and unaffected. Only the photo is missing.
                </Notice>
              )}
            </div>
          )}
          <div className="row">
            <button className="btn primary big" onClick={() => go({ name: 'move', id: live.id })}>
              <Icon name="move" /> Place now
            </button>
            <button className="btn big" onClick={() => setLabelIds([live.id])}>
              <Icon name="print" /> Print label
            </button>
          </div>
          <div className="row">
            <button className="btn primary" onClick={() => another(true)}>Receive another like this</button>
            <button className="btn" onClick={() => another()}>
              <Icon name="plus" /> Receive another for {job?.code}
            </button>
            <button className="btn ghost" onClick={() => go({ name: 'pallet', id: live.id })}>
              Open record
            </button>
          </div>
        </div>
        {sessionIds.length > 1 && <button className="btn" onClick={() => setLabelIds(sessionIds)}>Print all {sessionIds.length} labels from this receiving session</button>}
        <p className="muted">“Receive another like this” keeps the job, description and supplier reference. Photos and notes are cleared for the next pallet. Review it, then save to create its own identity.</p>
        {labelIds.length > 0 && <LabelSheet palletIds={labelIds} onClose={() => setLabelIds([])} />}
      </div>
    );
  }

  const locked = cmd.locked || cmd.busy;

  return (
    <div className="stack">
      <PageHead eyebrow="Warehouse" title="Receive a pallet" sub="Give the pallet an identity. Place it on a rack next." />
      <Explain refs="pages 9, 11, 25">
        <p>A pallet is one physically handled unit, not a product SKU. Two identical pallets are two records, because they can be stored in different places.</p>
        <ul>
          <li>Only open jobs appear. Closed jobs reject new receipts, and the form keeps what you typed.</li>
          <li>The readable code (like P-000042) is assigned by the server after saving, and is never reused.</li>
          <li>The photo is optional and uploads separately. If it fails, the pallet stays saved and you can retry the photo.</li>
          <li>If the connection drops while saving, “Check result” recovers the original receipt instead of creating a second pallet.</li>
        </ul>
      </Explain>
      <form
        className="panel stack"
        data-tour="receive-form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        noValidate
      >
        <Field label="Job" htmlFor="rcv-job" hint={jobErr ?? (job?.destination_notes ? `Ships to: ${job.destination_notes}` : 'Material for one job per pallet.')}>
          <select id="rcv-job" className="select" value={jobId} onChange={(e) => setJobId(e.target.value)} disabled={locked} aria-invalid={!!jobErr}>
            <option value="">Choose a job…</option>
            {openJobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.code} · {j.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Description" htmlFor="rcv-desc" hint={descErr ?? 'What would help someone recognize it: contents, packaging, color.'} count={description.length} max={160}>
          <input
            id="rcv-desc"
            className="input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Lighting fixtures"
            maxLength={200}
            disabled={locked}
            aria-invalid={!!descErr}
            list="rcv-desc-suggest"
          />
          <datalist id="rcv-desc-suggest">
            {recentDescs.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
        </Field>
        <div className="grid-2">
          <Field label="Supplier reference (optional)" htmlFor="rcv-sup" hint="Reference text only. It never becomes the pallet's identity.">
            <input id="rcv-sup" className="input" value={supplier} onChange={(e) => setSupplier(e.target.value)} maxLength={80} disabled={locked} placeholder="e.g. PO 4471 / ACME-22" />
          </Field>
          <Field label="Photo (optional)" hint={photoError ?? (photo ? `${photo.width}×${photo.height}, ${formatBytes(photo.bytes)} after compression (was ${formatBytes(photo.original_bytes)})` : 'JPEG, PNG or WebP up to 5 MB. Compressed on this device.')}>
            <div className="row nowrap">
              {photo && <img src={photo.thumb_url} alt="Selected pallet photo" style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--line)' }} />}
              <label className="btn" style={{ cursor: 'pointer' }}>
                <Icon name="camera" /> {photoBusy ? 'Processing…' : photo ? 'Replace photo' : 'Add photo'}
                <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" onChange={(e) => void onPhoto(e.target.files?.[0])} disabled={locked} />
              </label>
              {photo && (
                <button type="button" className="btn ghost small" onClick={() => setPhoto(null)}>
                  Remove
                </button>
              )}
            </div>
          </Field>
        </div>
        <Field label="Note (optional)" htmlFor="rcv-note" count={notes.length} max={1000}>
          <textarea id="rcv-note" className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1200} disabled={locked} placeholder="Damage, packaging, who delivered it…" />
        </Field>
        {photo && prefs.advancedTools && (
          <label className="toggle" style={{ fontSize: 13.5 }}>
            <input type="checkbox" checked={failPhoto} onChange={(e) => setFailPhoto(e.target.checked)} />
            <span className="muted">Demo: make the photo upload fail, to see that the pallet stays saved</span>
          </label>
        )}
        <CommandFeedback state={cmd.state} onRecover={() => void recover()} />
        {!cmd.locked && (
          <button type="submit" className="btn primary big block" disabled={cmd.busy}>
            {cmd.busy ? <Spinner /> : <Icon name="receive" />}
            {cmd.busy ? 'Saving…' : 'Save pallet'}
          </button>
        )}
        <p className="faint" style={{ fontSize: 12.5 }}>
          Required: job and description. Each physical pallet gets a separate code after saving.
        </p>
      </form>
    </div>
  );
}
