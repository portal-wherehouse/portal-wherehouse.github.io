import { CreateJob } from '../admin/Jobs';
import { useJobsOn } from '../../app/words';
import { FirebaseBackend } from '../../data/firebase';
import { barcodeMatchKey, blankInfo, productKey, receivingSchema, type ExpectedShipment, type ProductMemory } from '../../domain/receiving';
import { PalletFields } from './PalletFields';
import { parseScanCommand } from '../../device/scanCommands';
import { MoveFlow } from '../move/MoveFlow';
import { ReceiveTabs } from '../../ui/tabSets';
// Receive: give a pallet an identity (blueprint page 11).

import { useEffect, useMemo, useState, useRef } from 'react';
import { readSupplierBarcode } from '../../domain/supplierBarcode';
import { useScanTarget } from '../../device/scanRouter';
import { BarcodeSheet } from '../scan/BarcodeSheet';
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
  const { read, role, go, setLeaveGuard, toast, backend, prefs, workspaceId, route, v, actorId } = useApp();
  const jobsOn = useJobsOn();
  const jobs = read((e, _a, ws) => Object.values(e.db.jobs).filter((j) => j.workspace_id === ws)) ?? [];
  const openJobs = jobs.filter((j) => j.status === 'OPEN').sort((a, b) => a.code.localeCompare(b.code));
  const [jobId, setJobId] = useState('');
  const [showJob, setShowJob] = useState(false);
  const [creatingJob, setCreatingJob] = useState(false);
  const optionalJobs = !(backend instanceof FirebaseBackend) || backend.summary?.optional_jobs_version === 1;
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [supplier, setSupplier] = useState('');
  const [info, setInfo] = useState(blankInfo);
  const [remember, setRemember] = useState(false);
  const [shipmentId, setShipmentId] = useState('');
  const [matches, setMatches] = useState<ExpectedShipment[]>([]);
  const [lookupBusy,setLookupBusy] = useState(false);
  /** The scanned barcode isn't on an Incoming list or a saved product. */
  const [newCode, setNewCode] = useState(false);
  const lookupLock = useRef(false);
  const enhanced = !(backend instanceof FirebaseBackend) || backend.summary?.receiving_version === 1;
  const [scanning, setScanning] = useState(false);
  const [scanHint, setScanHint] = useState('');
  const [photo, setPhoto] = useState<PreparedPhoto | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [failPhoto, setFailPhoto] = useState(false);
  const [touched, setTouched] = useState(false);
  const [created, setCreated] = useState<Pallet | null>(null);
  /** The saved pallet has been put away, so the next scan starts the next receipt. */
  const [putAway, setPutAway] = useState(false);
  const nextScan = useRef<string | null>(null);
  const [photoState, setPhotoState] = useState<'none' | 'uploading' | 'done' | 'failed'>('none');
  const [labelIds, setLabelIds] = useState<string[]>([]);
  const [sessionIds, setSessionIds] = useState<string[]>([]);
  const cmd = useCommand();
  const photoCmd = useCommand();
  const locked = cmd.locked || cmd.busy || lookupBusy;
  const lookup = async (code:string) => {
    if (backend instanceof FirebaseBackend) return backend.receivingLookup(code);
    return {product:backend.db.products[productKey(workspaceId!,code)] ?? null,
      shipments:Object.values(backend.db.shipments).filter(r=>r.workspace_id===workspaceId && r.pending_barcode===barcodeMatchKey(code))};
  };
  const memoryInfo = (product:ProductMemory) => ({...blankInfo(),product_code:product.code,unit:product.unit,category:product.category ?? '',weight_lb:product.weight_lb ?? '',length_in:product.length_in ?? '',width_in:product.width_in ?? '',height_in:product.height_in ?? '',fields:product.field_names.map(name=>({name,value:''}))});
  const applyShipment = async (row:ExpectedShipment) => {
    const product = row.receiving.product_code ? (await lookup(row.receiving.product_code)).product : null;
    setShipmentId(row.id); setJobId(row.job_id); if (row.job_id) setShowJob(true); setSupplier(row.barcode); setNewCode(false);
    setDescription(product?.description || row.description); setNotes(row.notes);
    setInfo({...blankInfo(),...row.receiving,fields:row.receiving.fields.map(f=>({...f}))});
    setScanHint('Found on your Incoming list. Check the details, then save the pallet.');
    setMatches([]);
  };
  const captureSupplier = async (raw: string) => {
    if (locked || created || lookupLock.current) throw Error('Finish the current receipt or lookup before scanning another pallet.');
    const result = readSupplierBarcode(raw);
    if (supplier.trim() && supplier.trim() !== result.reference) throw Error('Clear the current supplier reference before scanning a different label.');
    if (result.description && description.trim() && description.trim() !== result.description) throw Error('Clear the current description before scanning a label with different contents.');
    lookupLock.current=true; setLookupBusy(true);
    try {
      const found = enhanced ? await lookup(result.reference) : {product:null,shipments:[]};
      setSupplier(result.reference); setShipmentId(''); setMatches(found.shipments); setRemember(false);
      const unknown = enhanced && !found.shipments.length && !found.product && result.kind !== 'sscc';
      setNewCode(unknown);
      const pristine = !description.trim() && !notes.trim() && JSON.stringify(info)===JSON.stringify(blankInfo());
      if (found.shipments.length===1 && pristine) {await applyShipment(found.shipments[0]); return;}
      if (!description.trim()) setDescription(found.product?.description || result.description || '');
      if (pristine && found.product) setInfo(memoryInfo(found.product));
      else if (unknown && !info.product_code) { setInfo({...info,product_code:result.reference}); setRemember(true); }
      else if (!info.product_code && result.kind==='gtin') setInfo({...info,product_code:result.reference});
      setScanHint(found.shipments.length ? 'Choose the expected delivery below, or keep your current entries.' : found.product ? 'Remembered product name loaded. Enter the details for this pallet.' : result.description ? result.hint : `${result.hint} No matching description found. Enter your warehouse’s product name and this pallet’s details.`);
    } finally {lookupLock.current=false;setLookupBusy(false);}
  };
  useScanTarget('receive-supplier', (event) => {
    void captureSupplier(event.text).catch(e=>toast((e as Error).message,'error'));
    return true;
  }, roleAllows(role, 'receive') && !created && !locked && !scanning);

  // Once the saved pallet is put away, scanning the next delivery's barcode starts the next receipt with it.
  // A pallet or spot label of this warehouse is not a delivery barcode, so it passes on (Scan anywhere opens it).
  useScanTarget('receive-next', (event) => {
    if (!actorId || !workspaceId || parseScanCommand(event.text)) return false;
    try {
      backend.reader.resolve(actorId, workspaceId, event.text);
      return false;
    } catch {
      /* not a label here: a delivery barcode */
    }
    nextScan.current = event.text;
    another();
    return true;
  }, roleAllows(role, 'receive') && !!created && putAway && !scanning);
  useEffect(() => {
    const text = nextScan.current;
    if (created || !text) return;
    nextScan.current = null;
    void captureSupplier(text).catch((e) => toast((e as Error).message, 'error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [created]);


  const dirty = !created && (description.trim() !== '' || notes.trim() !== '' || supplier.trim() !== '' || !!photo || JSON.stringify(info)!==JSON.stringify(blankInfo()));
  useEffect(() => {
    setLeaveGuard(dirty ? 'You have an unsaved receipt. Leave and discard it?' : null);
    return () => setLeaveGuard(null);
  }, [dirty, setLeaveGuard]);

  // Opened from Incoming's Receive pallet: fill the form from that expected item, once.
  const prefilled = useRef('');
  useEffect(() => {
    const id = route.name === 'receive' ? route.id : undefined;
    if (!id || prefilled.current === id || created) return;
    const row = backend.db.shipments[id];
    if (!row) return;
    prefilled.current = id;
    if (row.pallet_id) { toast('That item was already received. Its pallet is linked from Incoming.', 'info'); return; }
    void applyShipment(row).catch((e) => toast((e as Error).message, 'error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.name, route.id, v]);

  const job = openJobs.find((j) => j.id === jobId) ?? null;
  const descErr = touched && !description.trim() ? 'Description is required.' : description.length > 160 ? 'Keep it to 160 characters.' : null;
  const jobErr = touched && jobId && !job ? 'Choose an open job, or remove the job.' : null;

  const categories = useMemo(() => [...new Set([...Object.values(backend.db.products).map((p) => p.category ?? ''), ...Object.values(backend.db.shipments).map((r) => r.receiving.category ?? '')].filter(Boolean))].sort().slice(0, 50),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [v]);
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
    if ((jobId && !job) || !description.trim() || description.length > 160 || notes.length > 1000) return;
    if (lookupLock.current || locked) return;
    if (!jobId && !optionalJobs) return toast('Receiving without a job needs the warehouse server update. Your entries are still here.', 'error');
    if (enhanced) {
      const checked=receivingSchema.safeParse(info);
      if (!checked.success) return toast(checked.error.issues[0].message,'error');
    }
    const r = await cmd.run('receive', { job_id: jobId, description, notes: notes || undefined, supplier_ref: supplier || undefined,
      ...(enhanced ? {receiving:info,remember_product:remember,shipment_id:shipmentId||undefined} : {}) });
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
    setPutAway(false);
    if (!sameContents) setDescription('');
    setInfo(sameContents ? {...blankInfo(),product_code:info.product_code,unit:info.unit,category:info.category,weight_lb:info.weight_lb,length_in:info.length_in,width_in:info.width_in,height_in:info.height_in,fields:info.fields.map(f=>({name:f.name,value:''}))} : blankInfo());
    setRemember(false);setShipmentId('');setMatches([]);setNewCode(false);
    if (route.name === 'receive' && route.id) go('receive');
    setSupplier('');
    setScanHint('');
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
        <PageHead title="Pallet saved" />
        <div className="big-result receive-saved">
          <div className="br-title">
            <Icon name="checkCircle" />
            <span>
              <span className="pcode">{live.code}</span> saved
            </span>
          </div>
          <div>
            <strong>{live.description}</strong>{job ? <> for <span className="jcode">{job.code}</span> {job.name}</> : jobsOn ? <span className="muted"> · No job assigned</span> : null}
            {cmd.state.accepted?.replayed && <span className="muted"> · Recovered from the saved receipt.</span>}
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
            <button className="btn" onClick={() => setLabelIds([live.id])}>
              <Icon name="print" /> Print label
            </button>
            <button className="btn ghost" onClick={() => go({ name: 'pallet', id: live.id })}>
              Open record
            </button>
          </div>
        </div>
        {roleAllows(role, 'place') && <MoveFlow single start={live} testId="putaway-flow" onSaved={() => setPutAway(true)} />}
        <div className="row">
          <button className="btn primary" onClick={() => another(true)}>Receive another like this</button>
          <button className="btn" onClick={() => another()}>
            <Icon name="plus" /> {job ? `Receive another for ${job.code}` : 'Receive another'}
          </button>
        </div>
        <p className="hint" style={{ margin: 0 }}>“Like this” keeps {job ? 'the job and description' : 'the description'}. Each pallet still gets its own code.</p>
        {sessionIds.length > 1 && <button className="btn" onClick={() => setLabelIds(sessionIds)}>Print all {sessionIds.length} labels from this receiving session</button>}
        {labelIds.length > 0 && <LabelSheet palletIds={labelIds} onClose={() => setLabelIds([])} />}
      </div>
    );
  }

  return (
    <div className="stack">
      <ReceiveTabs />
      <PageHead title="Receive a pallet" />
      <button className="btn big primary receive-scan" type="button" disabled={locked} onClick={() => setScanning(true)}><Icon name="scanner" />Scan supplier barcode</button>
      <p className="hint" style={{ margin: 0 }}>Expected deliveries and saved products fill in by themselves. No barcode? Type the details below.</p>
      {scanning && <BarcodeSheet title="Scan supplier barcode" onScan={captureSupplier} onClose={() => setScanning(false)} />}
      {newCode && <Notice tone="info" icon="plus" title="New barcode">
        {supplier} is not expected or saved yet. Enter a name. Keep "Save as a product" checked so the next scan fills in.
      </Notice>}
      {!enhanced && <Notice tone="info">Product memory, shipment matching and pallet reminders will be available after the warehouse server update. Basic receiving is available now.</Notice>}
      {matches.length>0 && <section className="panel stack"><h2>Expected deliveries matching this barcode</h2><p>Choosing one fills the form with its details. Review them before saving.</p>{matches.map(row=><button type="button" className="btn" disabled={locked} key={row.id} onClick={async()=>{setLookupBusy(true);try{await applyShipment(row);}catch(e){toast((e as Error).message,'error');}finally{setLookupBusy(false);}}}>{row.description || 'Description needed'} · {row.receiving.quantity} {row.receiving.unit} · {row.receiving.destination || jobs.find(j=>j.id===row.job_id)?.code}</button>)}<button className="btn ghost" onClick={()=>setMatches([])}>Keep my entries instead</button></section>}
      <Explain refs="pages 9, 11, 25">
        <p>A pallet is one physically handled unit, not a product SKU. Two identical pallets are two records, because they can be stored in different places.</p>
        <ul>
          <li>Jobs are optional. If you assign one, it must be open.</li>
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
        <div className="stack" style={{ gap: 10 }}>
          {jobsOn && !showJob && !jobId && <button type="button" className="btn" disabled={locked} onClick={() => setShowJob(true)}><Icon name="plus" />Add job (optional)</button>}
          <div hidden={!showJob && !jobId}>
            <Field label="Job (optional)" htmlFor="rcv-job" hint={jobErr || (job?.destination_notes ? `Ships to: ${job.destination_notes}` : 'Assign this pallet to a project or order. Leave blank for general stock.')}>
              <select id="rcv-job" className="select" value={jobId} onChange={e => setJobId(e.target.value)} disabled={locked} aria-invalid={!!jobErr}>
                <option value="">No job assigned</option>
                {openJobs.map(j => <option key={j.id} value={j.id}>{j.code} · {j.name}</option>)}
              </select>
            </Field>
            {!openJobs.length && <p className="hint">No open jobs yet. You can receive this pallet without one.</p>}
            <div className="row" style={{ marginTop: 10 }}>
              {roleAllows(role, 'create_job') ? <button type="button" className="btn" disabled={locked || backend.network === 'offline'} onClick={() => setCreatingJob(true)}><Icon name="plus" />New job</button> : <p className="hint">A manager can create a new job for your team.</p>}
              <button type="button" className="btn ghost" disabled={locked} onClick={() => { setJobId(''); setShowJob(false); }}>Skip job</button>
            </div>
          </div>
          {!optionalJobs && !jobId && <Notice tone="info">Receiving without a job needs the warehouse server update. You can still add an existing job.</Notice>}
        </div>
        <Field label="Description" htmlFor="rcv-desc" hint={descErr ?? 'Your warehouse’s product name, e.g. White birch. Put changing quantities and other details below.'} count={description.length} max={160}>
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
        {scanHint && <p role="status" className="hint">{scanHint}</p>}
        <div className="grid-2">
          <Field label="Supplier reference (optional)" htmlFor="rcv-sup" hint="Scan or enter the supplier’s code. Find materials can search it after saving.">
            <input id="rcv-sup" className="input" value={supplier} onChange={(e) => {setSupplier(e.target.value); setScanHint(''); setShipmentId('');setMatches([]);}} maxLength={80} disabled={locked} placeholder="e.g. PO 4471 / ACME-22" />
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
        {enhanced && <>
          <div className="grid-2">
            <Field label="Product barcode or code (optional)" htmlFor="rcv-product" hint="The code this product always carries, across deliveries. Not a one-pallet SSCC."><input id="rcv-product" className="input" value={info.product_code} onChange={e=>{setInfo({...info,product_code:e.target.value});setRemember(false);}} maxLength={80} disabled={locked}/></Field>
            <Field label="Category (optional)" htmlFor="rcv-category" hint="Group products your way, like Hardwood or Kindling."><input id="rcv-category" className="input" value={info.category ?? ''} onChange={e=>setInfo({...info,category:e.target.value})} maxLength={60} disabled={locked} list="rcv-category-suggest"/>
              <datalist id="rcv-category-suggest">{categories.map((c) => <option key={c} value={c} />)}</datalist></Field>
          </div>
          <label className="toggle"><input type="checkbox" checked={remember} disabled={locked || !info.product_code.trim()} onChange={e=>setRemember(e.target.checked)}/>Save as a product, so the next scan of this code fills in the name, unit, category and size</label>
          <p className="hint">This doesn't copy quantities, destinations or reminders, and it doesn't change older pallets. Saved ones are listed under Products.</p>
          <PalletFields value={info} onChange={setInfo} disabled={locked}/>
        </>}
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
          <button type="submit" className="btn primary big block" disabled={locked}>
            {cmd.busy ? <Spinner /> : <Icon name="receive" />}
            {cmd.busy ? 'Saving…' : 'Save pallet'}
          </button>
        )}
        <p className="faint" style={{ fontSize: 12.5 }}>
          Required: description. Job is optional. Each physical pallet gets a separate code after saving.
        </p>
      </form>
      {creatingJob && <CreateJob onClose={() => setCreatingJob(false)} onCreated={id => { setJobId(id); setShowJob(true); }} />}
    </div>
  );
}
