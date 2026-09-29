import { FirebaseBackend } from '../../data/firebase';
// Export (page 28): four CSV files plus a manifest, protected against spreadsheet formula injection.

import { useMemo, useState } from 'react';
import { toCsv } from '../../domain/csv';
import { roleAllows } from '../../domain/transitions';
import { useApp } from '../../app/state';
import { canDownload, copyText, downloadText } from '../../device/output';
import { Icon } from '../../ui/icons';
import { Explain, Notice, PageHead, PermissionDenied } from '../../ui/ui';

type FileId = 'pallets' | 'events' | 'locations' | 'jobs' | 'manifest';

const FILES: { id: FileId; title: string; what: string }[] = [
  { id: 'pallets', title: 'pallets.csv', what: 'One row per pallet: state, hold, current and last confirmed rack, version.' },
  { id: 'events', title: 'events.csv', what: 'The full history: one row per accepted change, with actor, time and before/after.' },
  { id: 'locations', title: 'locations.csv', what: 'Every location with kind, status and recorded pallet count.' },
  { id: 'jobs', title: 'jobs.csv', what: 'Per-job totals by state, holds and last change.' },
  { id: 'manifest', title: 'manifest.json', what: 'When and how the export was made: schema, workspace, timezone, filters.' },
];

export function Export() {
  const { read, role, toast, backend, v } = useApp();
  const [exportReady,setExportReady]=useState(backend.mode==='demo');const [progress,setProgress]=useState<number|null>(null);const [error,setError]=useState('');
  const [view, setView] = useState<FileId | null>(null);
  const data = useMemo(
    () => (roleAllows(role, 'close_job') ? read((e, a, ws) => e.exportData(a, ws)) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [v, backend.network, role],
  );
  if (!roleAllows(role, 'close_job')) {
    return (
      <div className="stack">
        <PageHead title="Export" />
        <PermissionDenied what="Exporting" need="Supervisor" />
      </div>
    );
  }
  if (!data) return null;

  if(!exportReady)return <div className="stack"><PageHead title="Export warehouse records" sub="Download pallets, jobs, locations and the complete movement history."/><p>Records are read in pages when you prepare the export. Photos are kept in the warehouse and are not included in CSV files.</p><button className="btn primary" disabled={progress!==null} onClick={async()=>{setProgress(0);try{await (backend as FirebaseBackend).prepareExport(setProgress);setExportReady(true);}catch(e){setError((e as Error).message);setProgress(null);}}}>{progress===null?'Prepare complete export':`Preparing: ${progress.toLocaleString()} records`}</button>{error&&<p role="alert">{error}</p>}</div>;
  const content = (id: FileId) => (id === 'manifest' ? JSON.stringify({ ...data.manifest, files: FILES.filter((f) => f.id !== 'manifest').map((f) => ({ name: f.title, rows: data[f.id as Exclude<FileId, 'manifest'>].length })) }, null, 2) : toCsv(data[id]));
  const rows = (id: FileId) => (id === 'manifest' ? 1 : data[id].length);
  const stamp = data.manifest.generated_at.slice(0, 16).replace(/[:T]/g, '-');
  const save = async (id: FileId) => {
    const name = `wherehouse-${stamp}-${FILES.find((f) => f.id === id)!.title}`;
    if (canDownload()) downloadText(name, content(id), id === 'manifest' ? 'application/json' : 'text/csv;charset=utf-8');
    else if (await copyText(content(id))) toast(`${FILES.find((f) => f.id === id)!.title} copied to the clipboard`, 'info');
    else setView(id);
  };

  return (
    <div className="stack">
      <PageHead title="Export" sub={`Snapshot of ${data.manifest.workspace} · ${data.manifest.warehouse} · generated ${new Date(data.manifest.generated_at).toLocaleString()}`} />
      <Explain refs="page 28">
        <p>Exports use stable column names, ISO 8601 UTC timestamps and UTF-8 with a byte-order mark so Excel opens them correctly. Any cell starting with =, +, - or @ is prefixed with an apostrophe, so a description can never run as a spreadsheet formula. Only supervisors and owners can export, and the server checks that.</p>
      </Explain>
      {!canDownload() && (
        <Notice tone="info" icon="download">
          This hosted preview cannot save files, so each button copies the file to your clipboard instead. You can also open it below and select the text.
        </Notice>
      )}
      <div className="stack" data-tour="export-files">
        {FILES.map((f) => (
          <div key={f.id} className="panel row" style={{ alignItems: 'center' }}>
            <Icon name={f.id === 'manifest' ? 'database' : 'download'} />
            <div className="grow" style={{ minWidth: 200 }}>
              <div className="mono" style={{ fontWeight: 600 }}>
                {f.title}
              </div>
              <div className="muted" style={{ fontSize: 13.5 }}>
                {f.what} {f.id !== 'manifest' && <strong>{rows(f.id).toLocaleString()} rows.</strong>}
              </div>
            </div>
            <button className="btn" onClick={() => setView(view === f.id ? null : f.id)}>
              <Icon name="eye" /> {view === f.id ? 'Hide' : 'View'}
            </button>
            <button className="btn primary" onClick={() => void save(f.id)}>
              <Icon name={canDownload() ? 'download' : 'copy'} /> {canDownload() ? 'Download' : 'Copy'}
            </button>
            {view === f.id && (
              <textarea readOnly className="textarea" value={content(f.id)} style={{ width: '100%', minHeight: 220, fontFamily: 'var(--font-mono)', fontSize: 12 }} aria-label={`${f.title} contents`} onFocus={(e) => e.currentTarget.select()} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
